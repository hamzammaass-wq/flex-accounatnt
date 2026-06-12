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
    
    const constraints = await client.query(`
      SELECT conname, conrelid::regclass, confrelid::regclass
      FROM pg_constraint
      WHERE conrelid = 'accounts'::regclass OR conrelid = 'contacts'::regclass
    `);
    console.log('Constraints:');
    console.log(JSON.stringify(constraints.rows, null, 2));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
