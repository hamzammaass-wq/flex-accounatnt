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
    
    const companies = [
      'cmp_1Ob5XiCrxBRO6nAwyDSz6DKvlPH2',
      'cmp_6Xnf1xWlSDVnc4cGbrFu6e7vzgh1',
      'cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3'
    ];

    for (const companyId of companies) {
      console.log(`\n=== Accounts for ${companyId} ===`);
      const res = await client.query(
        "SELECT id, name, type FROM accounts WHERE company_id = $1 AND (id LIKE '%cash%' OR id LIKE '%receivable%')",
        [companyId]
      );
      console.table(res.rows);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

check();
