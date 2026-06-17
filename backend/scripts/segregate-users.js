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
    console.log('Connected to PostgreSQL successfully.');

    await client.query('BEGIN');

    const sourceCompany = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3';
    const targetCompany = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';

    // ==========================================
    // STEP 1: Drop foreign key constraints temporarily
    // ==========================================
    console.log('Dropping foreign key constraints...');
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
    // STEP 2: Ensure target company exists
    // ==========================================
    console.log('Ensuring target company exists...');
    await client.query(`
      INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
      SELECT $1::varchar, name, tax_number, address, phone, logo_url, base_currency, settings
      FROM companies WHERE id = $2::varchar
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, settings = EXCLUDED.settings, tax_number = EXCLUDED.tax_number, 
        address = EXCLUDED.address, phone = EXCLUDED.phone, logo_url = EXCLUDED.logo_url, 
        base_currency = EXCLUDED.base_currency
    `, [targetCompany, sourceCompany]);

    // ==========================================
    // STEP 3: Clear any conflicting/empty records in target company
    // ==========================================
    console.log('Clearing conflicting records in target company...');
    const tablesToClear = [
      'fixed_assets', 'fixed_asset_groups', 'invoice_items', 'invoices', 
      'journal_lines', 'journal_entries', 'contacts', 'products', 
      'warehouses', 'currencies', 'accounts'
    ];
    for (const table of tablesToClear) {
      if (table === 'journal_lines') {
        await client.query(`DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE company_id = $1::varchar)`, [targetCompany]);
      } else if (table === 'invoice_items') {
        await client.query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1::varchar)`, [targetCompany]);
      } else {
        await client.query(`DELETE FROM ${table} WHERE company_id = $1::varchar`, [targetCompany]);
      }
    }

    // ==========================================
    // STEP 4: Transfer accounts from source to target and update prefixes
    // ==========================================
    console.log('Transferring accounts and updating prefixes...');
    
    // Copy accounts
    const accRes = await client.query(`
      UPDATE accounts 
      SET company_id = $1::varchar,
          id = replace(id, $2::text || '_', $1::text || '_'),
          parent_id = replace(parent_id, $2::text || '_', $1::text || '_')
      WHERE company_id = $2::varchar
    `, [targetCompany, sourceCompany]);
    console.log(`Transferred and renamed ${accRes.rowCount} accounts.`);

    // ==========================================
    // STEP 5: Transfer other records to target company
    // ==========================================
    console.log('Transferring other records...');

    // Currencies
    const cur = await client.query(`UPDATE currencies SET company_id = $1::varchar WHERE company_id = $2::varchar`, [targetCompany, sourceCompany]);
    console.log(`Transferred ${cur.rowCount} currencies.`);

    // Warehouses
    const wh = await client.query(`UPDATE warehouses SET company_id = $1::varchar WHERE company_id = $2::varchar`, [targetCompany, sourceCompany]);
    console.log(`Transferred ${wh.rowCount} warehouses.`);

    // Products
    const prd = await client.query(`UPDATE products SET company_id = $1::varchar WHERE company_id = $2::varchar`, [targetCompany, sourceCompany]);
    console.log(`Transferred ${prd.rowCount} products.`);

    // Contacts (and replace account ID prefixes)
    const cnt = await client.query(`
      UPDATE contacts 
      SET company_id = $1::varchar,
          linked_account_id = replace(linked_account_id, $2::text || '_', $1::text || '_'),
          current_account_id = replace(current_account_id, $2::text || '_', $1::text || '_'),
          capital_account_id = replace(capital_account_id, $2::text || '_', $1::text || '_'),
          drawings_account_id = replace(drawings_account_id, $2::text || '_', $1::text || '_')
      WHERE company_id = $2::varchar
    `, [targetCompany, sourceCompany]);
    console.log(`Transferred and updated prefixes for ${cnt.rowCount} contacts.`);

    // Fixed Asset Groups (and replace account ID prefixes)
    const grp = await client.query(`
      UPDATE fixed_asset_groups 
      SET company_id = $1::varchar,
          asset_account_id = replace(asset_account_id, $2::text || '_', $1::text || '_'),
          accumulated_depreciation_account_id = replace(accumulated_depreciation_account_id, $2::text || '_', $1::text || '_'),
          depreciation_expense_account_id = replace(depreciation_expense_account_id, $2::text || '_', $1::text || '_')
      WHERE company_id = $2::varchar
    `, [targetCompany, sourceCompany]);
    console.log(`Transferred and updated prefixes for ${grp.rowCount} fixed asset groups.`);

    // Journal Entries
    const je = await client.query(`UPDATE journal_entries SET company_id = $1::varchar WHERE company_id = $2::varchar`, [targetCompany, sourceCompany]);
    console.log(`Transferred ${je.rowCount} journal entries.`);

    // Journal Lines account prefix
    const jl = await client.query(`
      UPDATE journal_lines 
      SET account_id = replace(account_id, $2::text || '_', $1::text || '_')
      WHERE entry_id IN (SELECT id FROM journal_entries WHERE company_id = $1::varchar)
    `, [targetCompany, sourceCompany]);
    console.log(`Updated prefixes for ${jl.rowCount} journal lines.`);

    // Invoices and items references
    const inv = await client.query(`
      UPDATE invoices 
      SET company_id = $1::varchar,
          payment_account_id = replace(payment_account_id, $2::text || '_', $1::text || '_')
      WHERE company_id = $2::varchar
    `, [targetCompany, sourceCompany]);
    const invIt = await client.query(`
      UPDATE invoice_items 
      SET account_id = replace(account_id, $2::text || '_', $1::text || '_')
      WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1::varchar)
    `, [targetCompany, sourceCompany]);
    console.log(`Transferred invoices (${inv.rowCount}) and updated invoice items (${invIt.rowCount}) prefixes.`);

    // ==========================================
    // STEP 6: Fix memberships (separate users)
    // ==========================================
    console.log('Segregating memberships...');
    
    // Remove u9ufZgGvXFO3JfBHwgIdaPUCqcI3 from cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3
    await client.query(`
      DELETE FROM memberships 
      WHERE company_id = $1::varchar AND user_id = 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3'
    `, [sourceCompany]);
    
    // Ensure hamzammsss (IcWiXkjYgWRyxlMlEvVmR4CdeHB3) is the ONLY owner of cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3
    await client.query(`
      INSERT INTO memberships (company_id, user_id, role, status)
      VALUES ($1::varchar, 'IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'OWNER', 'ACTIVE')
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE'
    `, [sourceCompany]);

    // Ensure hamza.mm.aa.ss (u9ufZgGvXFO3JfBHwgIdaPUCqcI3) is the owner of cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3
    await client.query(`
      INSERT INTO memberships (company_id, user_id, role, status)
      VALUES ($1::varchar, 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3', 'OWNER', 'ACTIVE')
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE'
    `, [targetCompany]);

    // ==========================================
    // STEP 7: Reset source company settings to clean defaults
    // ==========================================
    console.log('Resetting source company settings...');
    await client.query(`
      UPDATE companies 
      SET settings = '{}'::jsonb, 
          tax_number = NULL, address = NULL, phone = NULL, logo_url = NULL 
      WHERE id = $1::varchar
    `, [sourceCompany]);

    // ==========================================
    // STEP 8: Recreate foreign key constraints
    // ==========================================
    console.log('Restoring foreign key constraints...');
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
    console.log('Database segregation completed successfully! 🎉');
  } catch (err) {
    console.error('Migration failed. Rolling back...', err);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
};

run();
