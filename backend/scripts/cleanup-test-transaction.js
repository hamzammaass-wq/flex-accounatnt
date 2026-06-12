import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const cleanup = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon PostgreSQL DB successfully.');
    
    await client.query('DELETE FROM journal_entries WHERE id = $1', ['tx_simulated_test_123']);
    console.log('Test transaction cleaned up successfully.');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await client.end();
  }
};

cleanup();
