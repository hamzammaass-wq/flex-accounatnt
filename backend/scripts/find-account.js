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
    console.log('Connected to DB.');
    
    const accounts = await client.query(
      `SELECT id, name, code, parent_id, company_id FROM accounts WHERE code = '11101'`
    );
    console.log('Main Cash Accounts (Code 11101):');
    console.log(JSON.stringify(accounts.rows, null, 2));
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
