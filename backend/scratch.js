import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();
  
  const tables = [
    'companies',
    'users',
    'memberships',
    'accounts',
    'journal_entries',
    'journal_lines',
    'invoices',
    'invoice_items',
    'contacts',
    'products'
  ];
  
  console.log('--- TABLE ROW COUNTS ---');
  for (const table of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*) FROM ${table};`);
      console.log(`${table}: ${res.rows[0].count}`);
    } catch (err) {
      console.error(`Error querying ${table}:`, err.message);
    }
  }
  
  console.log('\n--- LARGEST COMPANIES ---');
  try {
    const res = await client.query(`
      SELECT company_id, COUNT(*) as entry_count 
      FROM journal_entries 
      GROUP BY company_id 
      ORDER BY entry_count DESC 
      LIMIT 5;
    `);
    console.table(res.rows);
  } catch (err) {
    console.error('Error querying largest companies:', err.message);
  }

  await client.end();
}

run().catch(console.error);
