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
      WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
        AND (code LIKE '111%' OR code LIKE '112%')
    `);
    
    console.log('Cash / Bank accounts by code for cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3:');
    console.log(JSON.stringify(res.rows, null, 2));
    
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
