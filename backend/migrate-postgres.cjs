const { Client } = require('pg');
const client = new Client({ connectionString: (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })() });

async function run() {
  await client.connect();
  const tablesResult = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  const tables = tablesResult.rows.map(r => r.table_name);

  const tablesWithCompanyId = [
    'payrolls', 'employees', 'banks', 'safes', 'item_groups', 'items', 'checks', 'receipts', 'invoices', 'transactions', 'accounts', 'settings'
  ];

  for (const table of tablesWithCompanyId) {
    if (tables.includes(table)) {
      // First delete the auto-generated empty company rows to avoid conflicts
      const delRes = await client.query(`DELETE FROM ${table} WHERE company_id = $1`, ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3']);
      console.log(`Deleted ${delRes.rowCount} conflicting rows in ${table}`);
      
      // Then migrate the old data
      const res = await client.query(`UPDATE ${table} SET company_id = $1 WHERE company_id = $2`, ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_default']);
      console.log(`Migrated ${res.rowCount} rows in ${table}`);
    }
  }

  // Also update the companies table
  if (tables.includes('companies')) {
     const delRes = await client.query(`DELETE FROM companies WHERE id = $1`, ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3']);
     console.log(`Deleted empty company from companies: ${delRes.rowCount}`);
     
     const res = await client.query(`UPDATE companies SET id = $1 WHERE id = $2`, ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_default']);
     console.log(`Migrated companies table: ${res.rowCount}`);
  }

  await client.end();
}

run().catch(console.error);
