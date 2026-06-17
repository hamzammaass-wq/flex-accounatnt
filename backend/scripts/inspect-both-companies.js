import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const check = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon PostgreSQL DB successfully.');
    
    const tables = [
      'accounts',
      'currencies',
      'contacts',
      'journal_entries',
      'warehouses',
      'products',
      'stock_transfers',
      'invoices',
      'invoice_settlements',
      'employees',
      'fixed_asset_groups',
      'fixed_assets',
      'checks',
      'audit_logs'
    ];

    const companies = ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3'];

    for (const compId of companies) {
      console.log(`\n=== Row counts for company: ${compId} ===`);
      for (const table of tables) {
        try {
          const countRes = await client.query(
            `SELECT COUNT(*) as cnt FROM ${table} WHERE company_id = $1`,
            [compId]
          );
          console.log(`Table '${table}':`, countRes.rows[0].cnt);
        } catch (err) {
          console.log(`Table '${table}' failed:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
