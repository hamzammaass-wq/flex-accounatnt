import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const runMigration = async () => {
  const migrationPath = path.join(__dirname, '../database/migrations/003_add_workspace_offer_codes.sql');
  console.log(`[Migration] Reading SQL from ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = new Client({
    connectionString,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    console.log('[Migration] Connected to Neon database. Executing SQL...');
    await client.query(sql);
    console.log('[Migration] Table workspace_offer_codes created successfully on Neon.');
  } catch (error) {
    console.error('[Migration] Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

runMigration();
