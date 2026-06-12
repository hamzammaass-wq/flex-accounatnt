import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    const res = await client.query("SELECT id, company_id, code, name FROM accounts WHERE id LIKE 'cmp_%'");
    console.log(`Pre-existing prefixed accounts in DB: ${res.rows.length}`);
    for (const row of res.rows) {
      console.log(`ID: ${row.id} | Company: ${row.company_id} | Code: ${row.code}`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

run();
