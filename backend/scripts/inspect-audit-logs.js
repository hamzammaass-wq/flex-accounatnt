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
    
    const logs = await client.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 20');
    console.log('Audit Logs:');
    console.log(JSON.stringify(logs.rows, null, 2));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
};

check();
