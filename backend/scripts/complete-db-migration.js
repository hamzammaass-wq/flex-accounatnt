import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const migrate = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[Migration] Connected to PostgreSQL successfully.');

    await client.query('BEGIN');

    // ==========================================
    // STEP 1: Drop foreign key constraints temporarily
    // ==========================================
    console.log('[Migration] Dropping foreign key constraints temporarily...');
    await client.query('ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_parent_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_linked_account_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_current_account_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_capital_account_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_drawings_account_id_fkey');
    await client.query('ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_lines_account_id_fkey');
    await client.query('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_account_id_fkey');
    await client.query('ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_account_id_fkey');
    await client.query('ALTER TABLE fixed_asset_groups DROP CONSTRAINT IF EXISTS fixed_asset_groups_asset_account_id_fkey');
    await client.query('ALTER TABLE fixed_asset_groups DROP CONSTRAINT IF EXISTS fixed_asset_groups_accumulated_depreciation_account_id_fkey');
    await client.query('ALTER TABLE fixed_asset_groups DROP CONSTRAINT IF EXISTS fixed_asset_groups_depreciation_expense_account_id_fkey');

    // ==========================================
    // STEP 2: Rename Account IDs for cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3
    // ==========================================
    console.log('[Migration] Step 2: Renaming account ID prefixes for cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3...');
    
    // Update account IDs and parent IDs
    const u1 = await client.query(`
      UPDATE accounts 
      SET id = replace(id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_'),
          parent_id = replace(parent_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_')
      WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
    `);
    console.log(`[Migration] Updated ${u1.rowCount} accounts in accounts table.`);

    // ==========================================
    // STEP 3: Re-associate all default company rows to cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3
    // ==========================================
    console.log('\n[Migration] Step 3: Re-associating cmp_default records to cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3...');
    
    // Ensure the target company exists
    await client.query(`
      INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
      SELECT 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', name, tax_number, address, phone, logo_url, base_currency, settings
      FROM companies WHERE id = 'cmp_default'
      ON CONFLICT (id) DO NOTHING
    `);

    // Update Currencies - delete duplicates first, then update
    await client.query(`
      DELETE FROM currencies 
      WHERE company_id = 'cmp_default' 
        AND code IN (SELECT code FROM currencies WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3')
    `);
    const cur = await client.query(`
      UPDATE currencies 
      SET company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
      WHERE company_id = 'cmp_default'
    `);
    console.log(`[Migration] Updated ${cur.rowCount} currencies.`);

    // Update Warehouses
    const wh = await client.query(`
      UPDATE warehouses 
      SET company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
      WHERE company_id = 'cmp_default'
    `);
    console.log(`[Migration] Updated ${wh.rowCount} warehouses.`);

    // Update Products
    const prd = await client.query(`
      UPDATE products 
      SET company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
      WHERE company_id = 'cmp_default'
    `);
    console.log(`[Migration] Updated ${prd.rowCount} products.`);

    // Update Contacts (and replace account ID prefixes)
    const cnt = await client.query(`
      UPDATE contacts 
      SET company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3',
          linked_account_id = replace(linked_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_'),
          current_account_id = replace(current_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_'),
          capital_account_id = replace(capital_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_'),
          drawings_account_id = replace(drawings_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_')
      WHERE company_id = 'cmp_default'
    `);
    console.log(`[Migration] Updated ${cnt.rowCount} contacts.`);

    // Update Fixed Asset Groups (and replace account ID prefixes)
    const grp = await client.query(`
      UPDATE fixed_asset_groups 
      SET company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3',
          asset_account_id = replace(asset_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_'),
          accumulated_depreciation_account_id = replace(accumulated_depreciation_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_'),
          depreciation_expense_account_id = replace(depreciation_expense_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_')
      WHERE company_id = 'cmp_default'
    `);
    console.log(`[Migration] Updated ${grp.rowCount} fixed asset groups.`);

    // Update Journal Entries (and their lines account ID prefixes)
    const je = await client.query(`
      UPDATE journal_entries 
      SET company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
      WHERE company_id = 'cmp_default'
    `);
    console.log(`[Migration] Updated ${je.rowCount} journal entries.`);

    const jl = await client.query(`
      UPDATE journal_lines 
      SET account_id = replace(account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_')
      WHERE entry_id IN (SELECT id FROM journal_entries WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3')
    `);
    console.log(`[Migration] Updated ${jl.rowCount} journal lines account references.`);

    // Update Invoices and items references for safety
    const inv = await client.query(`
      UPDATE invoices 
      SET payment_account_id = replace(payment_account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_')
      WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'
    `);
    const invIt = await client.query(`
      UPDATE invoice_items 
      SET account_id = replace(account_id, 'cmp_default_', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3_')
      WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3')
    `);
    console.log(`[Migration] Verified invoices (${inv.rowCount}) and invoice items (${invIt.rowCount}) prefixes.`);

    // ==========================================
    // STEP 4: Ensure memberships are correctly configured
    // ==========================================
    console.log('\n[Migration] Step 4: Configuring memberships...');
    
    // Add u9ufZgGvXFO3JfBHwgIdaPUCqcI3 (hamza.mm.aa.ss@gmail.com) as OWNER of cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3
    await client.query(`
      INSERT INTO memberships (company_id, user_id, role, status)
      VALUES ('cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3', 'OWNER', 'ACTIVE')
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE'
    `);
    console.log('[Migration] Ensured user u9ufZgGvXFO3JfBHwgIdaPUCqcI3 is OWNER of cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3.');

    // Clean up members in cmp_default
    const delM = await client.query("DELETE FROM memberships WHERE company_id = 'cmp_default'");
    console.log(`[Migration] Deleted ${delM.rowCount} memberships under cmp_default.`);

    // Delete the company record for cmp_default
    const delComp = await client.query("DELETE FROM companies WHERE id = 'cmp_default'");
    console.log(`[Migration] Deleted default company record: ${delComp.rowCount}`);

    // ==========================================
    // STEP 5: Recreate/Restore foreign key constraints
    // ==========================================
    console.log('\n[Migration] Step 5: Restoring foreign key constraints...');
    await client.query('ALTER TABLE accounts ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_linked_account_id_fkey FOREIGN KEY (linked_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_current_account_id_fkey FOREIGN KEY (current_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_capital_account_id_fkey FOREIGN KEY (capital_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_drawings_account_id_fkey FOREIGN KEY (drawings_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT');
    await client.query('ALTER TABLE invoices ADD CONSTRAINT invoices_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE fixed_asset_groups ADD CONSTRAINT fixed_asset_groups_asset_account_id_fkey FOREIGN KEY (asset_account_id) REFERENCES accounts(id)');
    await client.query('ALTER TABLE fixed_asset_groups ADD CONSTRAINT fixed_asset_groups_accumulated_depreciation_account_id_fkey FOREIGN KEY (accumulated_depreciation_account_id) REFERENCES accounts(id)');
    await client.query('ALTER TABLE fixed_asset_groups ADD CONSTRAINT fixed_asset_groups_depreciation_expense_account_id_fkey FOREIGN KEY (depreciation_expense_account_id) REFERENCES accounts(id)');
    
    await client.query('COMMIT');
    console.log('\n[Migration] Database migration completed successfully! 🎉');
  } catch (err) {
    console.error('[Migration ERROR] Migration failed. Rolling back...', err);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[Migration ERROR] Rollback failed:', rollbackErr);
    }
  } finally {
    await client.end();
  }
};

migrate();
