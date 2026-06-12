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
    console.log('Connected.');

    const res = await client.query('SELECT * FROM users');
    console.log('Users in DB:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
