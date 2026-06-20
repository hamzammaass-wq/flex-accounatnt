import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected to Neon DB.\n");

  // Check 1: Accounts without proper prefix
  console.log("=== CHECK 1: Accounts without proper prefix (id NOT LIKE company_id || '_%') ===");
  const check1 = await client.query(`
    SELECT company_id, id, code, name 
    FROM accounts 
    WHERE id NOT LIKE company_id || '_%'
  `);
  console.table(check1.rows);
  console.log(`Found ${check1.rows.length} unprefixed/incorrectly prefixed accounts.\n`);

  // Check 2: Account ID prefix mismatch with company_id column
  console.log("=== CHECK 2: Account ID prefix mismatch with company_id column ===");
  const check2 = await client.query(`
    SELECT company_id, id, code, name 
    FROM accounts 
    WHERE id LIKE 'cmp_%' AND split_part(id, '_', 2) != split_part(company_id, '_', 2)
  `);
  console.table(check2.rows);
  console.log(`Found ${check2.rows.length} accounts with company_id mismatch.\n`);

  // Check 3: Duplicate account codes within the same company
  console.log("=== CHECK 3: Duplicate account codes within the same company ===");
  const check3 = await client.query(`
    SELECT company_id, code, COUNT(*), array_agg(id) as ids, array_agg(name) as names
    FROM accounts
    GROUP BY company_id, code
    HAVING COUNT(*) > 1
  `);
  console.table(check3.rows);
  console.log(`Found ${check3.rows.length} duplicate codes in the same company.\n`);

  // Check 4: Mismatched company_id between journal_lines and journal_entries
  console.log("=== CHECK 4: Mismatched company_id between journal_lines and journal_entries ===");
  const check4 = await client.query(`
    SELECT jl.company_id as line_company_id, jl.entry_id, jl.account_id, je.company_id as entry_company_id
    FROM journal_lines jl
    JOIN journal_entries je ON jl.entry_id = je.id
    WHERE jl.company_id != je.company_id
  `);
  console.table(check4.rows);
  console.log(`Found ${check4.rows.length} mismatched journal line/entry company_ids.\n`);

  // Check 5: Mismatched company_id between invoice_items and invoices
  console.log("=== CHECK 5: Mismatched company_id between invoice_items and invoices ===");
  const check5 = await client.query(`
    SELECT ii.company_id as item_company_id, ii.invoice_id, i.company_id as invoice_company_id
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE ii.company_id != i.company_id
  `);
  console.table(check5.rows);
  console.log(`Found ${check5.rows.length} mismatched invoice item/invoice company_ids.\n`);

  // Check 6: Mismatched company_id between product_warehouse_stock and products
  console.log("=== CHECK 6: Mismatched company_id between product_warehouse_stock and products ===");
  const check6 = await client.query(`
    SELECT pws.company_id as stock_company_id, pws.product_id, p.company_id as product_company_id
    FROM product_warehouse_stock pws
    JOIN products p ON pws.product_id = p.id
    WHERE pws.company_id != p.company_id
  `);
  console.table(check6.rows);
  console.log(`Found ${check6.rows.length} mismatched warehouse stock/product company_ids.\n`);

  // Check 7: Memberships that might be shared incorrectly
  console.log("=== CHECK 7: Memberships that are shared across companies ===");
  const check7 = await client.query(`
    SELECT user_id, COUNT(DISTINCT company_id) as companies_count, array_agg(company_id) as company_ids
    FROM memberships
    GROUP BY user_id
    HAVING COUNT(DISTINCT company_id) > 1
  `);
  console.table(check7.rows);
  console.log(`Found ${check7.rows.length} users with memberships in multiple companies.\n`);

  await client.end();
}

main().catch(console.error);
