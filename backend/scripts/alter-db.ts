import { query } from '../src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS account_code VARCHAR(50) UNIQUE');
    console.log('Column account_code added successfully');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
main();
