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
    
    const companies = await client.query('SELECT id, name FROM companies');
    console.log('Companies:');
    console.log(JSON.stringify(companies.rows, null, 2));

    const memberships = await client.query('SELECT * FROM memberships');
    console.log('Memberships:');
    console.log(JSON.stringify(memberships.rows, null, 2));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
