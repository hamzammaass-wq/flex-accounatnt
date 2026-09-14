import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })(),
});

async function main() {
  const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';
  console.log(`Checking row counts for company: ${companyId}`);
  
  const tables = [
    'users', 'products', 'units', 'contacts', 'accounts',
    'journalLines', 'checks', 'bankAccounts', 'vaults',
    'invoices', 'invoiceSettlements', 'transactions', 'productTaxes',
    'cloudMemberships'
  ];
  
  try {
    for (const table of tables) {
      try {
        const res = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}" WHERE "companyId" = $1`, [companyId]);
        console.log(`Table ${table.padEnd(20)}: ${res.rows[0].cnt} rows`);
      } catch (err) {
        // Fallback to tenantId column if companyId is not found
        try {
            const res = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}" WHERE "tenantId" = $1`, [companyId]);
            console.log(`Table ${table.padEnd(20)}: ${res.rows[0].cnt} rows`);
        } catch(e) {
            console.log(`Table ${table.padEnd(20)}: Error - ${e.message}`);
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main();
