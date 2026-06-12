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

const runInit = async () => {
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  console.log(`[Init DB] Reading schema from ${schemaPath}`);
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({
    connectionString,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    console.log('[Init DB] Connected to PostgreSQL. Executing schema...');
    await client.query(sql);
    console.log('[Init DB] Relational tables created successfully.');
  } catch (error) {
    console.error('[Init DB] Error running database initialization:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

runInit();
