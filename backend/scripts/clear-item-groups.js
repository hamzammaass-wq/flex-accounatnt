import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');
    
    // Clear itemGroups array in settings JSONB for all companies
    const res = await client.query(
      `UPDATE companies 
       SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{itemGroups}', '[]'::jsonb, true)
       RETURNING id, name, settings->'itemGroups' as item_groups`
    );
    
    console.log('Updated Company Item Groups:');
    res.rows.forEach(row => {
      console.log(`Company ID: ${row.id} (${row.name})`);
      console.log('Item Groups:', JSON.stringify(row.item_groups));
      console.log('-----------------------------');
    });
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

run();
