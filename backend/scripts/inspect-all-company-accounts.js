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
    
    const res = await client.query(`
      SELECT id, code, name, parent_id, company_id FROM accounts 
      WHERE company_id = 'cmp_default' OR company_id IS NULL
    `);
    
    console.log(`Total accounts: ${res.rows.length}`);
    for (const row of res.rows) {
      console.log(`id: ${row.id.padEnd(70)} | code: ${row.code.padEnd(8)} | name: ${row.name.padEnd(30)} | parent_id: ${row.parent_id}`);
    }
    
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
