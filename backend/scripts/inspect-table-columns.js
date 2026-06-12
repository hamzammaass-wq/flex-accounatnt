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
    console.log('Connected to Neon PostgreSQL DB.');

    const tables = ['checks', 'invoices', 'invoice_items', 'accounts'];

    for (const table of tables) {
      const res = await client.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1
      `, [table]);
      console.log(`\nTable '${table}' columns:`);
      console.log(res.rows.map(r => `${r.column_name} (${r.data_type}${r.character_maximum_length ? `[${r.character_maximum_length}]` : ''})`).join(', '));
    }

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
