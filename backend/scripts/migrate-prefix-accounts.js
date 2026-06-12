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
    console.log('Connected to Neon PostgreSQL DB successfully.');
    
    await client.query('BEGIN');

    console.log('Dropping foreign key constraints...');
    await client.query('ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_parent_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_linked_account_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_current_account_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_capital_account_id_fkey');
    await client.query('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_drawings_account_id_fkey');
    await client.query('ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_lines_account_id_fkey');
    await client.query('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_account_id_fkey');
    await client.query('ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_account_id_fkey');

    // 1. Update accounts.id
    console.log('Updating accounts.id to be prefixed...');
    const resId = await client.query(`
      UPDATE accounts 
      SET id = company_id || '_' || id 
      WHERE id NOT LIKE company_id || '_%'
    `);
    console.log(`Updated ${resId.rowCount} account IDs.`);

    // 2. Update accounts.parent_id
    console.log('Updating accounts.parent_id to be prefixed...');
    const resParent = await client.query(`
      UPDATE accounts 
      SET parent_id = company_id || '_' || parent_id 
      WHERE parent_id IS NOT NULL AND parent_id NOT LIKE company_id || '_%'
    `);
    console.log(`Updated ${resParent.rowCount} parent_id references.`);

    // 3. Update contacts accounts
    console.log('Updating contacts linked accounts...');
    const resLinked = await client.query(`
      UPDATE contacts 
      SET linked_account_id = company_id || '_' || linked_account_id 
      WHERE linked_account_id IS NOT NULL AND linked_account_id NOT LIKE company_id || '_%'
    `);
    const resCurrent = await client.query(`
      UPDATE contacts 
      SET current_account_id = company_id || '_' || current_account_id 
      WHERE current_account_id IS NOT NULL AND current_account_id NOT LIKE company_id || '_%'
    `);
    const resCapital = await client.query(`
      UPDATE contacts 
      SET capital_account_id = company_id || '_' || capital_account_id 
      WHERE capital_account_id IS NOT NULL AND capital_account_id NOT LIKE company_id || '_%'
    `);
    const resDrawings = await client.query(`
      UPDATE contacts 
      SET drawings_account_id = company_id || '_' || drawings_account_id 
      WHERE drawings_account_id IS NOT NULL AND drawings_account_id NOT LIKE company_id || '_%'
    `);
    console.log(`Updated contacts accounts: linked=${resLinked.rowCount}, current=${resCurrent.rowCount}, capital=${resCapital.rowCount}, drawings=${resDrawings.rowCount}`);

    console.log('Recreating foreign key constraints...');
    await client.query('ALTER TABLE accounts ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_linked_account_id_fkey FOREIGN KEY (linked_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_current_account_id_fkey FOREIGN KEY (current_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_capital_account_id_fkey FOREIGN KEY (capital_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE contacts ADD CONSTRAINT contacts_drawings_account_id_fkey FOREIGN KEY (drawings_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT');
    await client.query('ALTER TABLE invoices ADD CONSTRAINT invoices_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES accounts(id) ON DELETE SET NULL');
    await client.query('ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL');

    await client.query('COMMIT');
    console.log('Database prefix migration completed successfully! 🎉');
  } catch (err) {
    console.error('Migration failed. Rolling back...', err);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
  } finally {
    await client.end();
  }
};

migrate();
