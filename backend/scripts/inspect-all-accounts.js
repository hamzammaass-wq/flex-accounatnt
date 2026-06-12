import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const check = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';

  try {
    await client.connect();
    console.log('Connected to Neon PostgreSQL DB successfully.');
    
    const accounts = await client.query('SELECT id, name, code, type FROM accounts WHERE company_id = $1 ORDER BY code ASC', [companyId]);
    console.log(`Total accounts: ${accounts.rows.length}`);
    console.log(JSON.stringify(accounts.rows, null, 2));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
