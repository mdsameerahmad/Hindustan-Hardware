import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function runFreshSeed() {
  console.log('===============================================================');
  console.log('   HINDUSTAN HARDWARE — FRESH CATALOGUE RE-SEED (15 ITEMS)     ');
  console.log('===============================================================\n');

  const excelPath = path.resolve(__dirname, '../../../Hindustan_Hardware_Cleaned_Catalog.xlsx');
  console.log('Reading cleaned Excel catalog from:', excelPath);

  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets['Products_Clean'];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { range: 3 });

  console.log(`Loaded ${rawRows.length} products from Excel.\n`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Supabase PostgreSQL.\n');

  try {
    await client.query('BEGIN');

    // 1. Clean old transactional data and catalog tables (preserving users/profiles/addresses/settings)
    console.log('Clearing old order history, cart, wishlist, and product records...');
    await client.query('TRUNCATE TABLE delivery_assignments CASCADE');
    await client.query('TRUNCATE TABLE order_payment_collections CASCADE');
    await client.query('TRUNCATE TABLE order_status_history CASCADE');
    await client.query('TRUNCATE TABLE order_items CASCADE');
    await client.query('TRUNCATE TABLE orders CASCADE');
    await client.query('TRUNCATE TABLE cart_items CASCADE');
    await client.query('TRUNCATE TABLE carts CASCADE');
    await client.query('TRUNCATE TABLE wishlists CASCADE');
    await client.query('TRUNCATE TABLE inventory_movements CASCADE');
    await client.query('TRUNCATE TABLE inventory CASCADE');
    await client.query('TRUNCATE TABLE product_variants CASCADE');
    await client.query('TRUNCATE TABLE product_images CASCADE');
    await client.query('TRUNCATE TABLE products CASCADE');
    await client.query('TRUNCATE TABLE categories CASCADE');
    await client.query('TRUNCATE TABLE brands CASCADE');
    console.log('Cleared old catalog and order tables successfully.\n');

    // 2. Extract and insert clean 15 Item Types (Categories)
    console.log('Inserting 15 standardized Item Types into categories table...');
    const itemTypesSet = new Set<string>();
    for (const r of rawRows) {
      if (r['Item Type']) itemTypesSet.add(String(r['Item Type']).trim());
    }

    const itemTypeMap = new Map<string, string>(); // name -> UUID
    let catOrder = 1;
    for (const catName of Array.from(itemTypesSet).sort()) {
      const slug = slugify(catName);
      const res = await client.query(
        `INSERT INTO categories (name, slug, description, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [catName, slug, `Standardized item category for ${catName}`, catOrder++]
      );
      itemTypeMap.set(catName.toLowerCase(), res.rows[0].id);
    }
    console.log(`Inserted ${itemTypeMap.size} Item Types.\n`);

    // 3. Extract and insert clean Brands
    console.log('Inserting clean Brands into brands table...');
    const brandsSet = new Set<string>();
    for (const r of rawRows) {
      if (r['Brand']) brandsSet.add(String(r['Brand']).trim());
    }

    const brandMap = new Map<string, string>(); // name -> UUID
    let brandOrder = 1;
    for (const brandName of Array.from(brandsSet).sort()) {
      let slug = slugify(brandName);
      if (!slug) slug = 'generic';

      // Check for slug collision
      const checkRes = await client.query('SELECT id FROM brands WHERE slug = $1', [slug]);
      if (checkRes.rows.length > 0) {
        slug = `${slug}-${brandOrder}`;
      }

      const res = await client.query(
        `INSERT INTO brands (name, slug, description, display_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [brandName, slug, `Authorized products from ${brandName}`, brandOrder++]
      );
      brandMap.set(brandName.toLowerCase(), res.rows[0].id);
    }
    console.log(`Inserted ${brandMap.size} Brands.\n`);

    // 4. Insert 1,947 Products with Inventory
    console.log('Inserting products and initializing inventory...');
    let insertedProducts = 0;
    const usedSlugs = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const prodName = String(row['Product']).trim();
      const brandName = String(row['Brand'] || 'Generic').trim();
      const itemTypeName = String(row['Item Type'] || '').trim();

      const categoryId = itemTypeMap.get(itemTypeName.toLowerCase());
      const brandId = brandMap.get(brandName.toLowerCase());

      const mrp = Number(row['MRP']) || 0;
      const discount = Number(row['Discount (%)']) || 0;
      const sellingPrice = discount > 0 ? Math.round(mrp * (1 - discount / 100) * 100) / 100 : mrp;
      const stock = Number(row['Stock Qty']) || 15; // default 15 if unstated

      // Deterministic unique slug
      let baseSlug = slugify(prodName);
      if (!baseSlug) baseSlug = `product-${i + 1}`;
      let finalSlug = baseSlug;
      let counter = 1;
      while (usedSlugs.has(finalSlug)) {
        finalSlug = `${baseSlug}-${counter++}`;
      }
      usedSlugs.add(finalSlug);

      // Generate a clean SKU code
      const brandCode = brandName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'GEN';
      const skuCode = `HH-${brandCode}-${String(i + 1).padStart(5, '0')}`;

      const specs = {
        item_type: itemTypeName,
        brand_name: brandName,
        discount_percentage: String(discount),
      };

      const prodRes = await client.query(
        `INSERT INTO products (
           name, slug, sku, category_id, brand_id, product_type,
           base_price, compare_at_price, unit, unit_of_sale,
           specs, is_active, is_featured
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'piece', 'per piece', $9, true, false)
         RETURNING id`,
        [
          prodName,
          finalSlug,
          skuCode,
          categoryId,
          brandId,
          itemTypeName,
          sellingPrice,
          mrp,
          JSON.stringify(specs),
        ]
      );

      const productId = prodRes.rows[0].id;

      // Insert inventory
      await client.query(
        `INSERT INTO inventory (product_id, variant_id, quantity_available, quantity_reserved)
         VALUES ($1, NULL, $2, 0)`,
        [productId, stock]
      );

      insertedProducts++;
    }

    await client.query('COMMIT');
    console.log(`\nSUCCESS: Seeded ${insertedProducts} products across ${itemTypeMap.size} Item Types and ${brandMap.size} Brands!`);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('\nERROR DURING RE-SEED, ROLLED BACK TRANSACTION:', err.message);
  } finally {
    await client.end();
  }
}

runFreshSeed();
