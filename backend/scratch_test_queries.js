import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected to DB.");

  const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';

  const queries = {
    transactions: `SELECT t.*, 
          COALESCE((SELECT json_agg(jl.*) FROM journal_lines jl WHERE jl.company_id = t.company_id AND jl.entry_id = t.id), '[]'::json) as lines
         FROM journal_entries t
         WHERE t.company_id = $1
         ORDER BY t.date DESC, t.created_at DESC`,
    invoices: `SELECT i.*, 
          COALESCE((SELECT json_agg(item.*) FROM invoice_items item WHERE item.company_id = i.company_id AND item.invoice_id = i.id), '[]'::json) as items
         FROM invoices i
         WHERE i.company_id = $1
         ORDER BY i.date DESC, i.created_at DESC`,
    products: `SELECT p.*,
          COALESCE((SELECT json_agg(json_build_object('warehouseId', pws.warehouse_id, 'quantity', pws.quantity))
           FROM product_warehouse_stock pws WHERE pws.company_id = p.company_id AND pws.product_id = p.id), '[]'::json) as "warehouseStock"
         FROM products p
         WHERE p.company_id = $1`,
    stockTransfers: `SELECT st.*,
          COALESCE((SELECT json_agg(sti.*) FROM stock_transfer_items sti WHERE sti.company_id = st.company_id AND sti.transfer_id = st.id), '[]'::json) as items
         FROM stock_transfers st
         WHERE st.company_id = $1`,
    employeeContracts: `SELECT ec.* FROM employee_contracts ec
         JOIN employees e ON ec.employee_id = e.id
         WHERE e.company_id = $1`,
    employeeLeaveRequests: `SELECT elr.* FROM employee_leave_requests elr
         JOIN employees e ON elr.employee_id = e.id
         WHERE e.company_id = $1`,
    employeeRecurringDeductions: `SELECT erd.* FROM employee_recurring_deductions erd
         JOIN employees e ON erd.employee_id = e.id
         WHERE e.company_id = $1`,
    users: `SELECT u.id, u.email, u.name, u.picture,
                CASE WHEN u.role = 'USER' OR u.role IS NULL THEN 'ADMIN' ELSE u.role END AS role,
                COALESCE(m.status, 'ACTIVE') AS status,
                m.company_id AS "companyId"
         FROM users u
         JOIN memberships m ON u.id = m.user_id
         WHERE m.company_id = $1`,
    accounts: `SELECT a.*,
           COALESCE((
             SELECT SUM(
               CASE 
                 WHEN a.type IN ('ASSET', 'EXPENSE') THEN jl.debit - jl.credit
                 ELSE jl.credit - jl.debit
               END
             )
             FROM journal_lines jl
             JOIN journal_entries je ON jl.entry_id = je.id
             WHERE jl.account_id = a.id AND je.status = 'POSTED'
           ), 0) as balance
         FROM accounts a
         WHERE a.company_id = $1
         ORDER BY a.code ASC`,
    currencies: `SELECT * FROM currencies WHERE company_id = $1`,
    contacts: `SELECT * FROM contacts WHERE company_id = $1`,
    warehouses: `SELECT * FROM warehouses WHERE company_id = $1`,
    employees: `SELECT * FROM employees WHERE company_id = $1`,
    fixedAssets: `SELECT * FROM fixed_assets WHERE company_id = $1`,
    assetGroups: `SELECT * FROM fixed_asset_groups WHERE company_id = $1`,
    checks: `SELECT * FROM checks WHERE company_id = $1`,
    auditLogs: `SELECT * FROM audit_logs WHERE company_id = $1`,
    invoiceSettlements: `SELECT * FROM invoice_settlements WHERE company_id = $1`
  };

  for (const [name, sql] of Object.entries(queries)) {
    try {
      const res = await client.query(sql, [companyId]);
      console.log(`✅ Query "${name}" succeeded: ${res.rowCount} rows`);
    } catch (err) {
      console.error(`❌ Query "${name}" FAILED:`, err.message);
    }
  }

  await client.end();
}

main().catch(console.error);
