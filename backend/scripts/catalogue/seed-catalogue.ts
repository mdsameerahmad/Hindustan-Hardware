import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import {
  resolveCataloguePaths,
  loadCsvProducts,
  loadExcelProducts,
  reconcileSourceFiles,
} from './catalogue-validation';
import {
  buildBrandRegistry,
  buildCategoryRegistry,
  mapAndValidateProducts,
} from './catalogue-mapping';
import { generateAllReports } from './catalogue-report';
import { ValidatedProduct } from './catalogue-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export async function runCatalogueImport() {
  console.log('===============================================================');
  console.log('       HINDUSTAN HARDWARE — CATALOGUE SEEDER ENGINE           ');
  console.log('===============================================================\n');

  const args = process.argv.slice(2);
  const isCommitRequested = args.includes('--commit');
  const isEnvApproved = process.env.CATALOGUE_IMPORT_APPROVED === 'true';

  let isCommitMode = false;

  if (isCommitRequested) {
    if (!isEnvApproved) {
      console.warn('---------------------------------------------------------------');
      console.warn('⚠️  SAFETY GUARD: --commit argument supplied without env approval.');
      console.warn('   Production import requires CATALOGUE_IMPORT_APPROVED=true.');
      console.warn('   Defaulting to safe DRY-RUN mode (zero database writes).');
      console.warn('---------------------------------------------------------------\n');
      isCommitMode = false;
    } else {
      isCommitMode = true;
    }
  } else {
    isCommitMode = false;
  }

  if (isCommitMode) {
    console.log('🔥 MODE: AUTHORIZED PRODUCTION COMMIT');
    console.log('   Explicit developer approval detected (CATALOGUE_IMPORT_APPROVED=true & --commit).');
    console.log('   Executing atomic transaction on configured Supabase PostgreSQL database.\n');
  } else {
    console.log('🛡️  MODE: DRY-RUN (ZERO DATABASE WRITES GUARANTEED)');
    console.log('   Safety rule: No INSERT, UPDATE, DELETE, or schema modifications will be performed.\n');
  }

  // 1. Source loading & parsing (from Excel as primary source of truth)
  const { csvPath, excelPath } = resolveCataloguePaths();
  const csvProducts = loadCsvProducts(csvPath);
  const { products: excelProducts, comparisonGroups } = loadExcelProducts(excelPath);
  const discrepancies = reconcileSourceFiles(csvProducts, excelProducts);

  // 2. Registry building
  const brandRegistry = buildBrandRegistry(excelProducts);
  const categoryRegistry = buildCategoryRegistry(excelProducts);

  // 3. Mapping and validation
  const { validatedProducts, slugCollisions, skuCollisions } = mapAndValidateProducts(
    excelProducts,
    brandRegistry,
    categoryRegistry,
    comparisonGroups
  );

  // 4. Connect to database
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const client: PoolClient = await pool.connect();

  let liveProfilesCount = 0;
  let liveOrdersCount = 0;
  let liveCartsCount = 0;
  let liveBrandsCount = 0;
  let liveCategoriesCount = 0;
  let liveProductsCount = 0;
  let liveInventoryCount = 0;
  let liveMovementsCount = 0;

  try {
    const res = await client.query(`
      SELECT 
        (SELECT count(*) FROM public.profiles) AS profiles_count,
        (SELECT count(*) FROM public.orders) AS orders_count,
        (SELECT count(*) FROM public.carts) AS carts_count,
        (SELECT count(*) FROM public.brands) AS brands_count,
        (SELECT count(*) FROM public.categories) AS categories_count,
        (SELECT count(*) FROM public.products) AS products_count,
        (SELECT count(*) FROM public.inventory) AS inventory_count,
        (SELECT count(*) FROM public.inventory_movements) AS movements_count
    `);

    liveProfilesCount = parseInt(res.rows[0].profiles_count, 10);
    liveOrdersCount = parseInt(res.rows[0].orders_count, 10);
    liveCartsCount = parseInt(res.rows[0].carts_count, 10);
    liveBrandsCount = parseInt(res.rows[0].brands_count, 10);
    liveCategoriesCount = parseInt(res.rows[0].categories_count, 10);
    liveProductsCount = parseInt(res.rows[0].products_count, 10);
    liveInventoryCount = parseInt(res.rows[0].inventory_count, 10);
    liveMovementsCount = parseInt(res.rows[0].movements_count, 10);

    console.log(`[PRE-FLIGHT] Current Database Baseline Status:`);
    console.log(`             Existing Profiles (Protected): ${liveProfilesCount}`);
    console.log(`             Existing Orders (Protected):   ${liveOrdersCount}`);
    console.log(`             Existing Carts (Protected):    ${liveCartsCount}`);
    console.log(`             Existing Products:             ${liveProductsCount}`);
    console.log(`             Existing Brands:               ${liveBrandsCount}`);
    console.log(`             Existing Categories:           ${liveCategoriesCount}`);
    console.log(`             Existing Inventory:            ${liveInventoryCount}`);
    console.log(`             Existing Movements:            ${liveMovementsCount}\n`);

    // Safety check on protected tables
    if (liveProfilesCount < 21 || liveOrdersCount < 42 || liveCartsCount < 22) {
      throw new Error(`CRITICAL INTEGRITY ABORT: Customer tables count mismatch (profiles=${liveProfilesCount}, orders=${liveOrdersCount}, carts=${liveCartsCount})`);
    }

    const batchId = '11111111-1111-4111-8111-111111111111';

    // 5. Execution branching: COMMIT or DRY-RUN
    if (isCommitMode) {
      console.log('[COMMIT] Beginning PostgreSQL atomic transaction for catalogue import...');
      await client.query('BEGIN;');

      try {
        // A. Upsert Brands
        console.log(`[COMMIT] Upserting ${brandRegistry.size} brands...`);
        for (const brand of brandRegistry.values()) {
          await client.query(
            `INSERT INTO public.brands (name, slug, is_active)
             VALUES ($1, $2, true)
             ON CONFLICT (slug) DO UPDATE SET
               name = EXCLUDED.name,
               updated_at = timezone('utc'::text, now());`,
            [brand.name, brand.slug]
          );
        }

        // B. Upsert Categories
        console.log(`[COMMIT] Upserting ${categoryRegistry.size} categories...`);
        for (const cat of categoryRegistry.values()) {
          await client.query(
            `INSERT INTO public.categories (name, slug, is_active)
             VALUES ($1, $2, true)
             ON CONFLICT (slug) DO UPDATE SET
               name = EXCLUDED.name,
               updated_at = timezone('utc'::text, now());`,
            [cat.name, cat.slug]
          );
        }

        // Fetch brand and category ID mappings
        const allBrands = await client.query(`SELECT id, slug FROM public.brands;`);
        const brandMap = new Map(allBrands.rows.map((r: any) => [r.slug, r.id]));

        const allCats = await client.query(`SELECT id, slug FROM public.categories;`);
        const catMap = new Map(allCats.rows.map((r: any) => [r.slug, r.id]));

        // C. Products, Inventory & Opening Movements
        console.log(`[COMMIT] Inserting ${validatedProducts.length} products with inventory and movements...`);
        let insertedProductsCount = 0;
        let updatedProductsCount = 0;
        let insertedMovementsCount = 0;

        for (let i = 0; i < validatedProducts.length; i++) {
          const p = validatedProducts[i];
          const brandId = p.brandSlug ? brandMap.get(p.brandSlug) || null : null;
          const catId = catMap.get(p.categorySlug);

          if (!catId) {
            throw new Error(`Integrity error: Category slug not found: ${p.categorySlug}`);
          }

          // Check existence prior to insert to track actual creation ownership
          const existingProdRes = await client.query(
            `SELECT id FROM public.products WHERE sku = $1;`,
            [p.sku]
          );
          const productExistedBefore = existingProdRes.rows.length > 0;

          const prodRes = await client.query(
            `INSERT INTO public.products (name, slug, sku, brand_id, category_id, base_price, compare_at_price, specs, comparison_group_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (sku) DO UPDATE SET
               name = EXCLUDED.name,
               base_price = EXCLUDED.base_price,
               compare_at_price = EXCLUDED.compare_at_price,
               specs = EXCLUDED.specs,
               comparison_group_id = EXCLUDED.comparison_group_id,
               updated_at = timezone('utc'::text, now())
             RETURNING id;`,
            [p.name, p.slug, p.sku, brandId, catId, p.sellingPrice, p.mrp, JSON.stringify(p.specs), p.comparisonGroupId]
          );

          const productId = prodRes.rows[0].id;
          const productCreatedByThisBatch = !productExistedBefore;
          if (productCreatedByThisBatch) insertedProductsCount++; else updatedProductsCount++;

          // Upsert inventory record targeting product-level partial index
          await client.query(
            `INSERT INTO public.inventory (product_id, variant_id, quantity_available, quantity_reserved)
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
              `INSERT INTO public.inventory_movements (
                 product_id, variant_id, movement_type, quantity_change, quantity_before, quantity_after, reason, reference_id
               )
               VALUES ($1, NULL, 'restock', $2, 0, $2, 'Initial Excel catalogue opening stock', $3)
               ON CONFLICT (reference_id) WHERE (reference_id IS NOT NULL AND reference_id LIKE 'OPENING-STOCK-%')
               DO NOTHING
               RETURNING id;`,
              [productId, p.inventoryStockQty, openingRef]
            );

            openingMovementCreatedByThisBatch = movRes.rows.length > 0;
            if (openingMovementCreatedByThisBatch) insertedMovementsCount++;
          }

          // Record in mappings audit table with explicit ownership tracking
          await client.query(
            `INSERT INTO public.catalogue_import_mappings (
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

          if ((i + 1) % 250 === 0 || i === validatedProducts.length - 1) {
            console.log(`[COMMIT] Progress: ${i + 1} / ${validatedProducts.length} items processed...`);
          }
        }

        await client.query('COMMIT;');
        console.log('\n✅ TRANSACTION COMMITTED SUCCESSFULLY!');
        console.log(`   Products Created:          ${insertedProductsCount}`);
        console.log(`   Products Updated:          ${updatedProductsCount}`);
        console.log(`   Opening Movements Created: ${insertedMovementsCount}`);
      } catch (commitErr) {
        await client.query('ROLLBACK;');
        console.error('❌ TRANSACTION FAILED & ROLLED BACK:', commitErr);
        throw commitErr;
      }
    } else {
      // DRY-RUN reporting
      console.log('===============================================================');
      console.log('              PLANNED SEEDING OPERATIONS (SUMMARY)             ');
      console.log('===============================================================');
      console.log(`Total Source Rows Processed:           ${validatedProducts.length}`);
      console.log(`Planned Brands to Upsert:              ${brandRegistry.size}`);
      console.log(`Planned Categories to Upsert:          ${categoryRegistry.size}`);
      console.log(`Planned Products to Insert:            ${validatedProducts.length}`);
      console.log(`  - With Assigned Brand:               ${validatedProducts.filter((p) => p.brandName).length}`);
      console.log(`  - Without Brand (brand_id = NULL):   ${validatedProducts.filter((p) => !p.brandName).length}`);
      console.log(`Planned Product Inventory Records:     ${validatedProducts.length} (1 per product, variant_id = NULL)`);
      console.log(`Planned Opening Stock Movements:       ${validatedProducts.filter((p) => p.inventoryStockQty > 0).length} (movement_type = 'restock', qty > 0)`);
      console.log(`Zero-Stock Records (no dummy movement):${validatedProducts.filter((p) => p.isZeroStock).length}`);
      console.log(`Negative-Stock Records (clamped to 0): ${validatedProducts.filter((p) => p.isNegativeStock).length}`);
      console.log(`Fractional-Stock Records (floored):    ${validatedProducts.filter((p) => p.isFractionalStock).length}`);
      console.log(`Comparison Grouped Products:           ${validatedProducts.filter((p) => p.comparisonGroupId !== null).length} (across ${comparisonGroups.length} groups)`);
      console.log(`Slug / SKU Collisions Detected:        ${slugCollisions.length} / ${skuCollisions.length}`);
      console.log('---------------------------------------------------------------');
      console.log(`DATABASE MUTATIONS PERFORMED:          0 (Zero writes)`);
      console.log(`PROTECTED LIVE CUSTOMER RECORDS:       100% UNTOUCHED`);
      console.log('===============================================================\n');
    }

    // 6. Generate all reports
    generateAllReports({
      batchId,
      validatedProducts,
      brands: Array.from(brandRegistry.values()),
      categories: Array.from(categoryRegistry.values()),
      discrepancies,
      comparisonGroups,
      slugCollisions,
      skuCollisions,
    });

    console.log('Reports successfully refreshed in database/catalogue-import/reports/.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runCatalogueImport().catch((err) => {
    console.error('Fatal Execution Error:', err);
    process.exit(1);
  });
}
