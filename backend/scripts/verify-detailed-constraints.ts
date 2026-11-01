import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verifyDetailedConstraints() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('Connected to DB');

    // 1. Check constraints on inventory_movements
    const checkConstraints = await client.query(`
      SELECT 
        tc.constraint_name, 
        cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc 
        ON cc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'inventory_movements'
    `);
    console.log('=== INVENTORY_MOVEMENTS CHECK CONSTRAINTS ===');
    console.log(JSON.stringify(checkConstraints.rows, null, 2));

    // 2. Check columns and types on inventory_movements
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'inventory_movements'
      ORDER BY ordinal_position
    `);
    console.log('=== INVENTORY_MOVEMENTS COLUMNS ===');
    console.log(JSON.stringify(cols.rows, null, 2));

    // 3. Check existing migrations table if any (e.g. supabase_migrations or schema_migrations)
    const migrationTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('public', 'supabase_migrations')
    `);
    console.log('=== TABLES IN DB ===');
    console.log(JSON.stringify(migrationTables.rows, null, 2));

    client.release();
  } catch (err: any) {
    console.error('VERIFY ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

verifyDetailedConstraints();
