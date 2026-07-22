const { Client } = require('pg');
require('dotenv').config({ path: '../.env.production' }); // Wait, which env file?
require('dotenv').config({ path: '../.env.local' });
require('dotenv').config();

async function run() {
  let url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }
  const client = new Client({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS subscription JSONB;
    `);
    console.log('Successfully added subscription column.');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await client.end();
  }
}

run();
