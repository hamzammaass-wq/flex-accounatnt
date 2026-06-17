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
    
    console.log('\n--- JOURNAL ENTRY tx_vnwzdar5 ---');
    const entryRes = await client.query("SELECT * FROM journal_entries WHERE id = 'tx_vnwzdar5'");
    console.log(entryRes.rows);

    console.log('\n--- JOURNAL LINES FOR tx_vnwzdar5 ---');
    const lineRes = await client.query("SELECT * FROM journal_lines WHERE entry_id = 'tx_vnwzdar5'");
    console.log(lineRes.rows);

    console.log('\n--- RECENT ERRORS OR LOGS ---');
    // Let's check if we have other recent journal entries from cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3 or other companies.
    const allEntries = await client.query("SELECT id, voucher_id, company_id, amount, description FROM journal_entries WHERE company_id = 'cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3' OR company_id = 'cmp_6Xnf1xWlSDVnc4cGbrFu6e7vzgh1'");
    console.table(allEntries.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

check();
