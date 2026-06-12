import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('backend/.env') });

const { Client } = pg;

const check = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon PostgreSQL DB successfully.');
    
    const entries = await client.query('SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 10');
    console.log('Recent Journal Entries:');
    console.log(JSON.stringify(entries.rows, null, 2));

    if (entries.rows.length > 0) {
      const entryIds = entries.rows.map(r => r.id);
      const lines = await client.query('SELECT * FROM journal_lines WHERE entry_id = ANY($1)', [entryIds]);
      console.log('Corresponding Journal Lines:');
      console.log(JSON.stringify(lines.rows, null, 2));
    }
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
