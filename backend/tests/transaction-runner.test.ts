import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { randomUUID } from 'crypto';
import {
  resolveCataloguePaths,
  loadExcelProducts,
} from '../scripts/catalogue/catalogue-validation';
import {
  buildBrandRegistry,
  buildCategoryRegistry,
  mapAndValidateProducts,
} from '../scripts/catalogue/catalogue-mapping';
import { ValidatedProduct } from '../scripts/catalogue/catalogue-types';
import { executeSafeCatalogueRollback } from '../scripts/catalogue/catalogue-rollback';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TEST_SCHEMA = `test_catalogue_${randomUUID().replace(/-/g, '')}`;
const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runDatabaseIntegrationTests)('Phase I: Batch Ownership & Rollback Isolation Runner', () => {
  let pool: Pool;
  let client: PoolClient;
  let sampleProducts: ValidatedProduct[];

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    client = await pool.connect();

    // 1. Create isolated disposable test schema
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
    await client.query(`CREATE SCHEMA ${TEST_SCHEMA};`);

    // 2. Clone catalogue schema tables into isolated test schema
    await client.query(`
      CREATE TABLE ${TEST_SCHEMA}.brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );

      CREATE TABLE ${TEST_SCHEMA}.categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );

      CREATE TABLE ${TEST_SCHEMA}.products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        sku TEXT DEFAULT NULL UNIQUE,
        brand_id UUID REFERENCES ${TEST_SCHEMA}.brands(id) ON DELETE SET NULL,
        category_id UUID NOT NULL REFERENCES ${TEST_SCHEMA}.categories(id) ON DELETE RESTRICT,
        base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
        compare_at_price NUMERIC(12, 2) DEFAULT NULL CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
        specs JSONB NOT NULL DEFAULT '{}'::jsonb,
        comparison_group_id TEXT DEFAULT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );

      CREATE TABLE ${TEST_SCHEMA}.inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES ${TEST_SCHEMA}.products(id) ON DELETE CASCADE,
        variant_id UUID DEFAULT NULL,
        quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
        quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        CONSTRAINT uq_test_inventory_prod_variant UNIQUE (product_id, variant_id)
      );

      CREATE UNIQUE INDEX uq_test_inventory_product_level
        ON ${TEST_SCHEMA}.inventory(product_id)
        WHERE (variant_id IS NULL);

      CREATE TABLE ${TEST_SCHEMA}.inventory_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES ${TEST_SCHEMA}.products(id) ON DELETE CASCADE,
        variant_id UUID DEFAULT NULL,
        movement_type TEXT NOT NULL,
        quantity_change INTEGER NOT NULL,
        quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
        quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
        reason TEXT NOT NULL,
        reference_id TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      );

      -- Enforce opening movement idempotency across batches
      CREATE UNIQUE INDEX uq_test_inventory_movements_opening_identity
        ON ${TEST_SCHEMA}.inventory_movements (reference_id)
        WHERE (reference_id IS NOT NULL AND reference_id LIKE 'OPENING-STOCK-%');

      CREATE TABLE ${TEST_SCHEMA}.catalogue_import_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID NOT NULL,
        source_row_number INTEGER NOT NULL,
        source_fingerprint TEXT NOT NULL,
        product_id UUID DEFAULT NULL REFERENCES ${TEST_SCHEMA}.products(id) ON DELETE SET NULL,
        product_sku TEXT NOT NULL,
        product_slug TEXT NOT NULL,
        source_product_name TEXT NOT NULL,
        source_brand_name TEXT DEFAULT NULL,
        source_category_name TEXT NOT NULL,
        source_mrp NUMERIC(12, 2) NOT NULL,
        source_selling_price NUMERIC(12, 2) NOT NULL,
        source_stock_raw NUMERIC(12, 3) NOT NULL,
        imported_stock_qty INTEGER NOT NULL,
        negative_stock_converted BOOLEAN NOT NULL DEFAULT false,
        fractional_stock_converted BOOLEAN NOT NULL DEFAULT false,

        -- Explicit Batch Ownership Tracking
        product_created_by_this_batch BOOLEAN NOT NULL DEFAULT false,
        opening_movement_created_by_this_batch BOOLEAN NOT NULL DEFAULT false,
        opening_movement_reference TEXT DEFAULT NULL,

        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        CONSTRAINT uq_test_import_batch_fingerprint UNIQUE (batch_id, source_fingerprint)
      );
    `);

    // Prepare sample products from real catalogue
    const { excelPath } = resolveCataloguePaths();
    const { products: rawProducts, comparisonGroups } = loadExcelProducts(excelPath);
    const brandReg = buildBrandRegistry(rawProducts);
    const catReg = buildCategoryRegistry(rawProducts);
    const { validatedProducts } = mapAndValidateProducts(rawProducts, brandReg, catReg, comparisonGroups);
    sampleProducts = validatedProducts.slice(0, 10);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
      client.release();
    }
    if (pool) {
      await pool.end();
    }
  });

  async function executeImportBatch(batchId: string, items: ValidatedProduct[]) {
    await client.query('BEGIN;');
    try {
      // 1. Brands bulk
      const uniqueBrands = new Map<string, string>();
      for (const p of items) {
        if (p.brandName && p.brandSlug) uniqueBrands.set(p.brandSlug, p.brandName);
      }
      for (const [slug, name] of uniqueBrands.entries()) {
        await client.query(
          `INSERT INTO ${TEST_SCHEMA}.brands (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING;`,
          [name, slug]
        );
      }

      // 2. Categories bulk
      const uniqueCats = new Map<string, string>();
      for (const p of items) {
        if (p.categorySlug) uniqueCats.set(p.categorySlug, p.categoryName);
      }
      for (const [slug, name] of uniqueCats.entries()) {
        await client.query(
          `INSERT INTO ${TEST_SCHEMA}.categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING;`,
          [name, slug]
        );
      }

      // Cache brand and category IDs
      const allBrands = await client.query(`SELECT id, slug FROM ${TEST_SCHEMA}.brands;`);
      const brandMap = new Map(allBrands.rows.map((r: any) => [r.slug, r.id]));

      const allCats = await client.query(`SELECT id, slug FROM ${TEST_SCHEMA}.categories;`);
      const catMap = new Map(allCats.rows.map((r: any) => [r.slug, r.id]));

      // 3. Products, Inventory & Opening Movements with Ownership Tracking
      for (const p of items) {
        const brandId = p.brandSlug ? brandMap.get(p.brandSlug) || null : null;
        const catId = catMap.get(p.categorySlug);

        // Check if product already exists prior to insert to track creation ownership
        const existingProdRes = await client.query(
          `SELECT id FROM ${TEST_SCHEMA}.products WHERE sku = $1;`,
          [p.sku]
        );
        const productExistedBefore = existingProdRes.rows.length > 0;

        const prodRes = await client.query(
          `INSERT INTO ${TEST_SCHEMA}.products (name, slug, sku, brand_id, category_id, base_price, compare_at_price, specs, comparison_group_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (sku) DO UPDATE SET
             name = EXCLUDED.name,
             base_price = EXCLUDED.base_price,
             compare_at_price = EXCLUDED.compare_at_price,
             specs = EXCLUDED.specs,
             updated_at = timezone('utc'::text, now())
           RETURNING id;`,
          [p.name, p.slug, p.sku, brandId, catId, p.sellingPrice, p.mrp, JSON.stringify(p.specs), p.comparisonGroupId]
        );

        const productId = prodRes.rows[0].id;
        const productCreatedByThisBatch = !productExistedBefore;

        // Inventory upsert: targets partial unique index explicitly
        await client.query(
          `INSERT INTO ${TEST_SCHEMA}.inventory (product_id, variant_id, quantity_available, quantity_reserved)
           VALUES ($1, NULL, $2, 0)
           ON CONFLICT (product_id) WHERE (variant_id IS NULL) DO NOTHING;`,
          [productId, p.inventoryStockQty]
        );

        // Opening movement: deterministic reference OPENING-STOCK-SKU-{product_sku}
        let openingMovementCreatedByThisBatch = false;
        let openingRef: string | null = null;

        if (p.inventoryStockQty > 0) {
          openingRef = `OPENING-STOCK-SKU-${p.sku}`;
          const movRes = await client.query(
            `INSERT INTO ${TEST_SCHEMA}.inventory_movements (
               product_id, variant_id, movement_type, quantity_change, quantity_before, quantity_after, reason, reference_id
             )
             VALUES ($1, NULL, 'restock', $2, 0, $2, 'Initial Excel catalogue opening stock', $3)
             ON CONFLICT (reference_id) WHERE (reference_id IS NOT NULL AND reference_id LIKE 'OPENING-STOCK-%')
             DO NOTHING
             RETURNING id;`,
            [productId, p.inventoryStockQty, openingRef]
          );

          // Actual ownership assigned ONLY if INSERT succeeded (RETURNING returned a row)
          openingMovementCreatedByThisBatch = movRes.rows.length > 0;
        }

        // Record in mappings audit table with explicit ownership tracking
        await client.query(
          `INSERT INTO ${TEST_SCHEMA}.catalogue_import_mappings (
             batch_id, source_row_number, source_fingerprint, product_id, product_sku, product_slug,
             source_product_name, source_brand_name, source_category_name, source_mrp, source_selling_price,
             source_stock_raw, imported_stock_qty, negative_stock_converted, fractional_stock_converted,
             product_created_by_this_batch, opening_movement_created_by_this_batch, opening_movement_reference
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (batch_id, source_fingerprint) DO NOTHING;`,
          [
            batchId, p.sourceRowNumber, p.sourceFingerprint, productId, p.sku, p.slug,
            p.name, p.brandName, p.categoryName, p.mrp, p.sellingPrice,
            p.sourceStockRaw, p.inventoryStockQty, p.isNegativeStock, p.isFractionalStock,
            productCreatedByThisBatch, openingMovementCreatedByThisBatch, openingRef
          ]
        );
      }

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    }
  }

  it('Test 1 & 2: Batch A creates product and opening movement; Batch B imports same product without creating duplicate opening movement', async () => {
    const batchA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    await executeImportBatch(batchA, sampleProducts);

    // Verify Batch A ownership
    const mappingsA = await client.query(
      `SELECT product_created_by_this_batch, opening_movement_created_by_this_batch
       FROM ${TEST_SCHEMA}.catalogue_import_mappings
       WHERE batch_id = $1;`,
      [batchA]
    );
    expect(mappingsA.rows.every((r: any) => r.product_created_by_this_batch === true)).toBe(true);

    const inStockCount = sampleProducts.filter((p) => p.inventoryStockQty > 0).length;
    const ownedMovementsA = mappingsA.rows.filter((r: any) => r.opening_movement_created_by_this_batch === true).length;
    expect(ownedMovementsA).toBe(inStockCount);

    // Batch B imports identical products
    const batchB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    await executeImportBatch(batchB, sampleProducts);

    // Verify Batch B recorded 0 ownership for products and opening movements
    const mappingsB = await client.query(
      `SELECT product_created_by_this_batch, opening_movement_created_by_this_batch
       FROM ${TEST_SCHEMA}.catalogue_import_mappings
       WHERE batch_id = $1;`,
      [batchB]
    );
    expect(mappingsB.rows.every((r: any) => r.product_created_by_this_batch === false)).toBe(true);
    expect(mappingsB.rows.every((r: any) => r.opening_movement_created_by_this_batch === false)).toBe(true);

    const movements = await client.query(`SELECT count(*) FROM ${TEST_SCHEMA}.inventory_movements;`);
    expect(parseInt(movements.rows[0].count, 10)).toBe(inStockCount);
  }, 30000);

  it('Test 3: Revoking Batch B does not reverse Batch A opening stock', async () => {
    const batchB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

    const invBefore = await client.query(`SELECT sum(quantity_available) AS total_stock FROM ${TEST_SCHEMA}.inventory;`);
    const totalStockBefore = parseInt(invBefore.rows[0].total_stock, 10);

    const summary = await executeSafeCatalogueRollback(client, {
      batchId: batchB,
      actor: 'admin@hindustanhardware.com',
      reason: 'Revoke Batch B test',
      adminDecisionConfirmed: true,
      schemaName: TEST_SCHEMA,
    });

    expect(summary.totalMovementsCreated).toBe(0);
    expect(summary.items.every((i) => i.status === 'skipped_not_owned')).toBe(true);

    const invAfter = await client.query(`SELECT sum(quantity_available) AS total_stock FROM ${TEST_SCHEMA}.inventory;`);
    const totalStockAfter = parseInt(invAfter.rows[0].total_stock, 10);
    expect(totalStockAfter).toBe(totalStockBefore); // Batch A stock 100% intact!
  }, 15000);

  it('Test 4: Revoking Batch B does not deactivate a product still owned by Batch A', async () => {
    const activeProds = await client.query(`SELECT count(*) FROM ${TEST_SCHEMA}.products WHERE is_active = true;`);
    expect(parseInt(activeProds.rows[0].count, 10)).toBe(sampleProducts.length); // None deactivated
  }, 15000);

  it('Test 5: Revoking Batch A while Batch B remains active does not deactivate the shared product', async () => {
    const batchA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

    // Revoke Batch A
    const summary = await executeSafeCatalogueRollback(client, {
      batchId: batchA,
      actor: 'admin@hindustanhardware.com',
      reason: 'Revoke Batch A with Batch B active',
      adminDecisionConfirmed: true,
      schemaName: TEST_SCHEMA,
    });

    // Batch A owns the opening movements so it compensates its opening stock
    expect(summary.totalMovementsCreated).toBeGreaterThan(0);

    // BUT products must NOT be deactivated because Batch B is still actively referencing them!
    expect(summary.totalProductsDeactivated).toBe(0);
    const activeProds = await client.query(`SELECT count(*) FROM ${TEST_SCHEMA}.products WHERE is_active = true;`);
    expect(parseInt(activeProds.rows[0].count, 10)).toBe(sampleProducts.length);
  }, 15000);

  it('Test 6: Revoking the actual owning batch with no other active references follows approved compensation strategy', async () => {
    // Setup dedicated Batch C with a unique product
    const batchC = 'cccccccc-3333-4333-8333-cccccccccccc';
    const catId = (await client.query(`SELECT id FROM ${TEST_SCHEMA}.categories LIMIT 1;`)).rows[0].id;
    const prodRes = await client.query(`
      INSERT INTO ${TEST_SCHEMA}.products (name, slug, sku, category_id, base_price)
      VALUES ('Standalone Product C', 'standalone-prod-c', 'HH-STANDALONE-C', $1, 200)
      RETURNING id;
    `, [catId]);
    const pId = prodRes.rows[0].id;
    const sku = 'HH-STANDALONE-C';

    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.inventory (product_id, variant_id, quantity_available, quantity_reserved)
      VALUES ($1, NULL, 60, 0);
    `, [pId]);

    const openingRef = `OPENING-STOCK-SKU-${sku}`;
    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.inventory_movements (
        product_id, variant_id, movement_type, quantity_change, quantity_before, quantity_after, reason, reference_id, created_at
      ) VALUES ($1, NULL, 'restock', 60, 0, 60, 'Initial opening stock', $2, now());
    `, [pId, openingRef]);

    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.catalogue_import_mappings (
        batch_id, source_row_number, source_fingerprint, product_id, product_sku, product_slug,
        source_product_name, source_category_name, source_mrp, source_selling_price, source_stock_raw, imported_stock_qty,
        product_created_by_this_batch, opening_movement_created_by_this_batch, opening_movement_reference
      ) VALUES ($1, 9901, 'fp-standalone-c', $2, $3, 'standalone-prod-c', 'Standalone Product C', 'Plumbing', 200, 200, 60, 60, true, true, $4);
    `, [batchC, pId, sku, openingRef]);

    // Rollback Batch C (owning batch with NO other active references)
    const summary = await executeSafeCatalogueRollback(client, {
      batchId: batchC,
      actor: 'admin@hindustanhardware.com',
      reason: 'Revoke standalone Batch C',
      adminDecisionConfirmed: true,
      schemaName: TEST_SCHEMA,
    });

    // Both deactivation and inventory compensation must succeed
    expect(summary.totalProductsDeactivated).toBe(1);
    expect(summary.totalMovementsCreated).toBe(1);

    const prod = await client.query(`SELECT is_active FROM ${TEST_SCHEMA}.products WHERE id = $1;`, [pId]);
    expect(prod.rows[0].is_active).toBe(false); // Cleanly deactivated

    const inv = await client.query(`SELECT quantity_available FROM ${TEST_SCHEMA}.inventory WHERE id = (SELECT id FROM ${TEST_SCHEMA}.inventory WHERE product_id = $1);`, [pId]);
    expect(inv.rows[0].quantity_available).toBe(0); // Cleanly compensated
  }, 15000);

  it('Test 7: Repeated revocation remains idempotent', async () => {
    const batchC = 'cccccccc-3333-4333-8333-cccccccccccc';

    const movementsBefore = await client.query(
      `SELECT count(*) FROM ${TEST_SCHEMA}.inventory_movements WHERE reference_id LIKE 'ROLLBACK-COMP-BATCH-${batchC}%';`
    );
    const countBefore = parseInt(movementsBefore.rows[0].count, 10);
    expect(countBefore).toBe(1);

    const repeatSummary = await executeSafeCatalogueRollback(client, {
      batchId: batchC,
      actor: 'admin@hindustanhardware.com',
      reason: 'Repeated revocation',
      adminDecisionConfirmed: true,
      schemaName: TEST_SCHEMA,
    });

    expect(repeatSummary.totalMovementsCreated).toBe(0);
    expect(repeatSummary.totalProductsDeactivated).toBe(0);
    expect(repeatSummary.items[0].status).toBe('skipped_already_compensated');

    const movementsAfter = await client.query(
      `SELECT count(*) FROM ${TEST_SCHEMA}.inventory_movements WHERE reference_id LIKE 'ROLLBACK-COMP-BATCH-${batchC}%';`
    );
    expect(parseInt(movementsAfter.rows[0].count, 10)).toBe(countBefore);
  }, 15000);

  it('Test 8: Concurrent imports correctly assign ownership to exactly one batch', async () => {
    const batchD1 = 'dddddddd-4444-4444-8444-111111111111';
    const batchD2 = 'dddddddd-4444-4444-8444-222222222222';
    const catId = (await client.query(`SELECT id FROM ${TEST_SCHEMA}.categories LIMIT 1;`)).rows[0].id;
    const testSku = 'HH-CONCURRENT-D';
    const openingRef = `OPENING-STOCK-SKU-${testSku}`;

    // Create client2 from pool for concurrent connection
    const client2 = await pool.connect();
    try {
      // Simulate concurrent worker 1 and worker 2 inserting same product & opening stock
      const insertWorker = async (c: PoolClient, batchId: string) => {
        await c.query('BEGIN;');
        try {
          const prodRes = await c.query(
            `INSERT INTO ${TEST_SCHEMA}.products (name, slug, sku, category_id, base_price)
             VALUES ('Concurrent D', 'concurrent-d', $1, $2, 100)
             ON CONFLICT (sku) DO NOTHING
             RETURNING id;`,
            [testSku, catId]
          );

          let pId: string;
          let prodCreated = false;
          if (prodRes.rows.length > 0) {
            pId = prodRes.rows[0].id;
            prodCreated = true;
          } else {
            const p = await c.query(`SELECT id FROM ${TEST_SCHEMA}.products WHERE sku = $1;`, [testSku]);
            pId = p.rows[0].id;
          }

          await c.query(
            `INSERT INTO ${TEST_SCHEMA}.inventory (product_id, variant_id, quantity_available)
             VALUES ($1, NULL, 50)
             ON CONFLICT (product_id) WHERE (variant_id IS NULL) DO NOTHING;`,
            [pId]
          );

          const movRes = await c.query(
            `INSERT INTO ${TEST_SCHEMA}.inventory_movements (
               product_id, variant_id, movement_type, quantity_change, quantity_before, quantity_after, reason, reference_id
             ) VALUES ($1, NULL, 'restock', 50, 0, 50, 'Concurrent opening', $2)
             ON CONFLICT (reference_id) WHERE (reference_id IS NOT NULL AND reference_id LIKE 'OPENING-STOCK-%')
             DO NOTHING
             RETURNING id;`,
            [pId, openingRef]
          );
          const movCreated = movRes.rows.length > 0;

          await c.query(
            `INSERT INTO ${TEST_SCHEMA}.catalogue_import_mappings (
               batch_id, source_row_number, source_fingerprint, product_id, product_sku, product_slug,
               source_product_name, source_category_name, source_mrp, source_selling_price, source_stock_raw, imported_stock_qty,
               product_created_by_this_batch, opening_movement_created_by_this_batch, opening_movement_reference
             ) VALUES ($1, 9902, $2, $3, $4, 'concurrent-d', 'Concurrent D', 'Plumbing', 100, 100, 50, 50, $5, $6, $7);`,
            [batchId, `fp-${batchId}`, pId, testSku, prodCreated, movCreated, openingRef]
          );

          await c.query('COMMIT;');
        } catch (e) {
          await c.query('ROLLBACK;');
          throw e;
        }
      };

      await Promise.all([insertWorker(client, batchD1), insertWorker(client2, batchD2)]);

      // Exactly ONE batch must have opening_movement_created_by_this_batch = true
      const ownershipCheck = await client.query(`
        SELECT batch_id, opening_movement_created_by_this_batch
        FROM ${TEST_SCHEMA}.catalogue_import_mappings
        WHERE product_sku = $1;
      `, [testSku]);

      const trueOwners = ownershipCheck.rows.filter((r: any) => r.opening_movement_created_by_this_batch === true);
      expect(trueOwners.length).toBe(1); // Exactly one owning batch!
    } finally {
      client2.release();
    }
  }, 15000);

  it('Test 9: Ambiguous or corrupt ownership causes no inventory mutation', async () => {
    const batchE = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
    const catId = (await client.query(`SELECT id FROM ${TEST_SCHEMA}.categories LIMIT 1;`)).rows[0].id;
    const testSku = 'HH-AMBIGUOUS-E';

    const prodRes = await client.query(`
      INSERT INTO ${TEST_SCHEMA}.products (name, slug, sku, category_id, base_price)
      VALUES ('Ambiguous E', 'ambiguous-e', $1, $2, 100)
      RETURNING id;
    `, [testSku, catId]);
    const pId = prodRes.rows[0].id;

    await client.query(`INSERT INTO ${TEST_SCHEMA}.inventory (product_id, variant_id, quantity_available) VALUES ($1, NULL, 40);`, [pId]);

    // Claim ownership in mapping, but movement in DB has arithmetic error
    const openingRef = `OPENING-STOCK-SKU-${testSku}`;
    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.inventory_movements (
        product_id, variant_id, movement_type, quantity_change, quantity_before, quantity_after, reason, reference_id
      ) VALUES ($1, NULL, 'restock', 40, 0, 20, 'Corrupt arithmetic', $2);
    `, [pId, openingRef]);

    await client.query(`
      INSERT INTO ${TEST_SCHEMA}.catalogue_import_mappings (
        batch_id, source_row_number, source_fingerprint, product_id, product_sku, product_slug,
        source_product_name, source_category_name, source_mrp, source_selling_price, source_stock_raw, imported_stock_qty,
        product_created_by_this_batch, opening_movement_created_by_this_batch, opening_movement_reference
      ) VALUES ($1, 9903, 'fp-ambiguous-e', $2, $3, 'ambiguous-e', 'Ambiguous E', 'Plumbing', 100, 100, 40, 40, true, true, $4);
    `, [batchE, pId, testSku, openingRef]);

    const summary = await executeSafeCatalogueRollback(client, {
      batchId: batchE,
      actor: 'admin@hindustanhardware.com',
      reason: 'Ambiguous test',
      adminDecisionConfirmed: true,
      schemaName: TEST_SCHEMA,
    });

    expect(summary.failedProducts.length).toBe(1);
    expect(summary.totalMovementsCreated).toBe(0);

    const invAfter = await client.query(`SELECT quantity_available FROM ${TEST_SCHEMA}.inventory WHERE product_id = $1;`, [pId]);
    expect(invAfter.rows[0].quantity_available).toBe(40); // 100% UNMUTATED
  }, 15000);

  it('Test 10: Existing customer records remain untouched', async () => {
    const res = await client.query(`
      SELECT 
        (SELECT count(*) FROM public.profiles) AS profiles_count,
        (SELECT count(*) FROM public.orders) AS orders_count,
        (SELECT count(*) FROM public.carts) AS carts_count,
        (SELECT count(*) FROM public.products) AS products_count
    `);
    expect(parseInt(res.rows[0].profiles_count, 10)).toBe(21);
    expect(parseInt(res.rows[0].orders_count, 10)).toBe(42);
    expect(parseInt(res.rows[0].carts_count, 10)).toBe(22);
    expect(parseInt(res.rows[0].products_count, 10)).toBe(0);
  }, 15000);
});
