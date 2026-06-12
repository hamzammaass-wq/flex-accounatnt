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
      'users',
      'memberships',
      'accounts',
      'contacts',
      'invoices',
      'journal_entries',
      'journal_lines'
    ];

    for (const table of tables) {
      try {
        const countRes = await client.query(`SELECT COUNT(*) as cnt FROM ${table}`);
        console.log(`Table '${table}' count:`, countRes.rows[0].cnt);
      } catch (err) {
        console.log(`Table '${table}' query failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
