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
    
    console.log('\n--- ALL JOURNAL ENTRIES ---');
    const entryRes = await client.query('SELECT id, company_id, voucher_id, amount, description, type, date, status FROM journal_entries ORDER BY date DESC, created_at DESC');
    console.table(entryRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

check();
