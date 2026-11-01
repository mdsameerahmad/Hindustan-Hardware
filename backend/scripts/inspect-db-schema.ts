import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function inspectDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('Connecting to PostgreSQL database...');
    const client = await pool.connect();
    console.log('PostgreSQL connected successfully.');

    // 1. Existing Counts
    const countsQuery = `
      SELECT 
        (SELECT count(*) FROM public.brands) AS brands_count,
        (SELECT count(*) FROM public.categories) AS categories_count,
        (SELECT count(*) FROM public.products) AS products_count,
        (SELECT count(*) FROM public.product_variants) AS variants_count,
        (SELECT count(*) FROM public.inventory) AS inventory_count,
        (SELECT count(*) FROM public.inventory_movements) AS movements_count,
        (SELECT count(*) FROM public.product_images) AS images_count,
        (SELECT count(*) FROM public.profiles) AS profiles_count,
        (SELECT count(*) FROM public.orders) AS orders_count,
        (SELECT count(*) FROM public.carts) AS carts_count
    `;
    const counts = await client.query(countsQuery);
    console.log('=== TABLE COUNTS ===');
    console.log(JSON.stringify(counts.rows[0], null, 2));

    // Sample existing products
    const sampleProducts = await client.query(`
      SELECT id, name, slug, sku, base_price, compare_at_price, brand_id, category_id, is_active
      FROM public.products
      LIMIT 5
    `);
    console.log('=== SAMPLE EXISTING PRODUCTS ===');
    console.log(JSON.stringify(sampleProducts.rows, null, 2));

    // Sample existing brands
    const sampleBrands = await client.query(`
      SELECT id, name, slug FROM public.brands LIMIT 10
    `);
    console.log('=== SAMPLE EXISTING BRANDS ===');
    console.log(JSON.stringify(sampleBrands.rows, null, 2));

    // Sample existing categories
    const sampleCategories = await client.query(`
      SELECT id, name, slug, parent_id FROM public.categories LIMIT 10
    `);
    console.log('=== SAMPLE EXISTING CATEGORIES ===');
    console.log(JSON.stringify(sampleCategories.rows, null, 2));

    // 2. Constraints
    const constraintsQuery = `
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' 
        AND tc.table_name IN ('brands', 'categories', 'products', 'product_variants', 'inventory', 'inventory_movements')
      ORDER BY tc.table_name, tc.constraint_name;
    `;
    const constraints = await client.query(constraintsQuery);
    console.log('=== CONSTRAINTS ===');
    console.log(JSON.stringify(constraints.rows, null, 2));

    // Check constraints
    const checkConstraints = await client.query(`
      SELECT tc.table_name, tc.constraint_name, cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN ('brands', 'categories', 'products', 'product_variants', 'inventory', 'inventory_movements');
    `);
    console.log('=== CHECK CONSTRAINTS ===');
    console.log(JSON.stringify(checkConstraints.rows, null, 2));

    // 3. Indexes
    const indexesQuery = `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('brands', 'categories', 'products', 'inventory', 'inventory_movements')
      ORDER BY tablename, indexname;
    `;
    const indexes = await client.query(indexesQuery);
    console.log('=== INDEXES ===');
    console.log(JSON.stringify(indexes.rows, null, 2));

    // 4. Triggers
    const triggersQuery = `
      SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND event_object_table IN ('brands', 'categories', 'products', 'inventory', 'inventory_movements');
    `;
    const triggers = await client.query(triggersQuery);
    console.log('=== TRIGGERS ===');
    console.log(JSON.stringify(triggers.rows, null, 2));

    // 5. RLS Policies
    const rlsQuery = `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('brands', 'categories', 'products', 'inventory', 'inventory_movements');
    `;
    const rls = await client.query(rlsQuery);
    console.log('=== RLS POLICIES ===');
    console.log(JSON.stringify(rls.rows, null, 2));

    client.release();
  } catch (err: any) {
    console.error('DATABASE INSPECTION ERROR:', err);
  } finally {
    await pool.end();
  }
}

inspectDb();
