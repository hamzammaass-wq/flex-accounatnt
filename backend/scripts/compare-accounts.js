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
    console.log('Connected to Neon PostgreSQL DB.');

    const res1 = await client.query(
      `SELECT code, name, type FROM accounts WHERE company_id = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3' ORDER BY code`
    );
    const res2 = await client.query(
      `SELECT code, name, type FROM accounts WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3' ORDER BY code`
    );

    console.log(`Company 1 (u9uf) accounts count: ${res1.rows.length}`);
    console.log(`Company 2 (IcWi) accounts count: ${res2.rows.length}`);

    // Find accounts in one but not the other
    const map1 = new Map(res1.rows.map(r => [r.code, r]));
    const map2 = new Map(res2.rows.map(r => [r.code, r]));

    console.log('\n=== Accounts in u9uf but NOT in IcWi ===');
    for (const r of res1.rows) {
      if (!map2.has(r.code)) {
        console.log(`Code: ${r.code}, Name: ${r.name}`);
      }
    }

    console.log('\n=== Accounts in IcWi but NOT in u9uf ===');
    for (const r of res2.rows) {
      if (!map1.has(r.code)) {
        console.log(`Code: ${r.code}, Name: ${r.name}`);
      }
    }

    // Compare names for matching codes
    console.log('\n=== Mismatched names for same code ===');
    for (const r of res1.rows) {
      const match = map2.get(r.code);
      if (match && match.name !== r.name) {
        console.log(`Code: ${r.code} | u9uf: "${r.name}" | IcWi: "${match.name}"`);
      }
    }

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
