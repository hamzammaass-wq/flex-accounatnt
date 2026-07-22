import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require',
});
async function main() {
  const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';
  const tables = [
  'companies',
  'memberships',
  'users',
  'currencies',
  'contacts',
  'accounts',
  'journal_entries',
  'journal_lines',
  'warehouses',
  'product_warehouse_stock',
  'products',
  'stock_transfer_items',
  'stock_transfers',
  'invoices',
  'invoice_items',
  'invoice_settlements',
  'employees',
  'employee_contracts',
  'fixed_assets',
  'fixed_asset_groups',
  'employee_leave_requests',
  'employee_recurring_deductions',
  'checks',
  'audit_logs',
  'workspace_offer_codes'
];
  try {
    for (const table of tables) {
      try {
        let res;
        if (table === 'companies' || table === 'memberships' || table === 'users' || table === 'workspace_offer_codes') {
            res = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
        } else {
            res = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}" WHERE company_id = $1`, [companyId]);
        }
        console.log(`Table ${table.padEnd(20)}: ${res.rows[0].cnt} rows`);
      } catch (err) {
         console.log(`Table ${table.padEnd(20)}: Error - ${err.message}`);
      }
    }
  } finally {
    await pool.end();
  }
}
main();
