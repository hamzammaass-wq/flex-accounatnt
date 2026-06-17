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
    
    console.log('\n--- CASH/RECEIVABLE ACCOUNTS FOR cmp_6Xnf1xWlSDVnc4cGbrFu6e7vzgh1 ---');
    const acc1 = await client.query("SELECT id, name, type FROM accounts WHERE company_id = 'cmp_6Xnf1xWlSDVnc4cGbrFu6e7vzgh1' AND (id LIKE '%cash%' OR id LIKE '%receivable%' OR id LIKE '%payable%')");
    console.table(acc1.rows);

    console.log('\n--- CASH/RECEIVABLE ACCOUNTS FOR cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3 ---');
    const acc2 = await client.query("SELECT id, name, type FROM accounts WHERE company_id = 'cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3' AND (id LIKE '%cash%' OR id LIKE '%receivable%' OR id LIKE '%payable%')");
    console.table(acc2.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

check();
