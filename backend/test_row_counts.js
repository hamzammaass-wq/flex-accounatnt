import { query } from './src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const res = await query('SELECT COUNT(*) FROM accounts;');
    console.log('accounts:', res.rows[0].count);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
