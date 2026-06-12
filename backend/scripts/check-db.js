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
      'memberships'
    ];
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT * FROM ${table}`);
        console.log(`Table '${table}':`, res.rows);
      } catch (err) {
        console.log(`Table '${table}': failed to read (${err.message})`);
      }
    }
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
