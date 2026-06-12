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
    
    const accounts = await client.query("SELECT id, name, code, company_id FROM accounts WHERE name LIKE '%صندوق%' OR name LIKE '%نقدي%' OR name LIKE '%box%'");
    console.log('Results:');
    console.log(JSON.stringify(accounts.rows, null, 2));
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
