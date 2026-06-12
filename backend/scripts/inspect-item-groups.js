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
    console.log('Connected to DB.');
    
    const res = await client.query(
      `SELECT id, name, settings->'itemGroups' as item_groups FROM companies`
    );
    console.log('Company Item Groups:');
    res.rows.forEach(row => {
      console.log(`Company ID: ${row.id} (${row.name})`);
      console.log('Item Groups:', JSON.stringify(row.item_groups, null, 2));
      console.log('-----------------------------');
    });
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
