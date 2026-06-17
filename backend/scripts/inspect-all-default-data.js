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
      'companies',
      'memberships',
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

    console.log('=== ROW COUNTS FOR cmp_default ===');
    for (const table of tables) {
      try {
        const queryStr = table === 'companies' 
          ? `SELECT COUNT(*) as cnt FROM companies WHERE id = 'cmp_default'`
          : `SELECT COUNT(*) as cnt FROM ${table} WHERE company_id = 'cmp_default'`;
        
        const countRes = await client.query(queryStr);
        console.log(`Table '${table}':`, countRes.rows[0].cnt);
      } catch (err) {
        console.log(`Table '${table}' failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
