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
    
    console.log('\n--- CONTACTS FOR cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3 ---');
    const contacts = await client.query("SELECT id, name, type FROM contacts WHERE company_id = 'cmp_vgGwp4yOlpO5vce6f4MKxzaC2xB3'");
    console.table(contacts.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
};

check();
