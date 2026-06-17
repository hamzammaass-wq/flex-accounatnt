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
    
    console.log('\n--- JOURNAL ENTRY tx_8e7i8ssq ---');
    const entry = await client.query("SELECT * FROM journal_entries WHERE id = 'tx_8e7i8ssq'");
    console.log(entry.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

check();
