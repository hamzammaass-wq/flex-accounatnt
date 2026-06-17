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
    console.log('Connected to Neon PostgreSQL DB successfully.');
    
    const res = await client.query(`
      SELECT id, name, settings FROM companies 
      WHERE id IN ('cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3')
    `);
    
    for (const row of res.rows) {
      console.log(`--- Company ID: ${row.id} (${row.name}) ---`);
      if (row.settings) {
        console.log('Keys in settings:', Object.keys(row.settings));
        if (row.settings.safes) {
          console.log(`Safes count: ${row.settings.safes.length}`);
          console.log('Safes:', JSON.stringify(row.settings.safes, null, 2));
        } else {
          console.log('No safes found.');
        }
        if (row.settings.banks) {
          console.log(`Banks count: ${row.settings.banks.length}`);
          console.log('Banks:', JSON.stringify(row.settings.banks, null, 2));
        } else {
          console.log('No banks found.');
        }
      } else {
        console.log('Settings is null/undefined');
      }
    }
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
