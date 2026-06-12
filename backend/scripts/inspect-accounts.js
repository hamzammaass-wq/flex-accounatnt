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
    
    const companyCounts = await client.query('SELECT company_id, COUNT(*) as cnt FROM accounts GROUP BY company_id');
    console.log('Accounts per company:', companyCounts.rows);

    const duplicateIds = await client.query('SELECT id, COUNT(*) as cnt FROM accounts GROUP BY id HAVING COUNT(*) > 1');
    console.log('Duplicate IDs count:', duplicateIds.rows.length);
    if (duplicateIds.rows.length > 0) {
      console.log('Duplicate IDs sample:', duplicateIds.rows.slice(0, 5));
    }
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
