import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Define parent relationships for the standard chart of accounts
const parentMap = {
  // Assets
  'acc_current_assets': 'acc_assets',
  'acc_cash_root': 'acc_current_assets',
  'acc_cash': 'acc_cash_root',
  'acc_bank_root': 'acc_current_assets',
  'acc_receivable_group': 'acc_current_assets',
  'acc_receivable': 'acc_receivable_group',
  'acc_notes_receivable': 'acc_current_assets',
  'acc_cheques_hand': 'acc_notes_receivable',
  'acc_cheques_under_collection': 'acc_notes_receivable',
  'acc_inventory_group': 'acc_current_assets',
  'acc_inventory': 'acc_inventory_group',
  'acc_vat_input': 'acc_current_assets',
  'acc_employee_advances': 'acc_current_assets',
  'acc_fixed_assets_root': 'acc_assets',
  'acc_furniture': 'acc_fixed_assets_root',
  'acc_equipment': 'acc_fixed_assets_root',
  'acc_buildings': 'acc_fixed_assets_root',
  'acc_machinery': 'acc_fixed_assets_root',
  'acc_vehicles': 'acc_fixed_assets_root',
  'acc_accumulated_depreciation': 'acc_fixed_assets_root',

  // Liabilities
  'acc_current_liabilities': 'acc_liabilities',
  'acc_long_term_liabilities': 'acc_liabilities',
  'acc_payable_group': 'acc_current_liabilities',
  'acc_payable': 'acc_payable_group',
  'acc_notes_payable': 'acc_current_liabilities',
  'acc_accrued_salaries': 'acc_current_liabilities',
  'acc_payroll_deductions_payable': 'acc_current_liabilities',
  'acc_vat_output': 'acc_current_liabilities',
  'acc_vat_payable': 'acc_current_liabilities',

  // Equity
  'acc_capital': 'acc_equity_root',
  'acc_retained_earnings': 'acc_equity_root',
  'acc_partners_accounts_group': 'acc_equity_root',
  'acc_partners_capital': 'acc_partners_accounts_group',
  'acc_partner_current': 'acc_partners_accounts_group',
  'acc_partner_drawings': 'acc_partners_accounts_group',

  // Revenue
  'acc_sales': 'acc_revenue_root',
  'acc_service_income': 'acc_revenue_root',
  'acc_sales_returns': 'acc_revenue_root',
  'acc_sales_discounts': 'acc_revenue_root',
  'acc_gain_asset_disposal': 'acc_revenue_root',

  // Expense
  'acc_cogs': 'acc_expense_root',
  'acc_purchases': 'acc_expense_root',
  'acc_purchase_returns': 'acc_expense_root',
  'acc_direct_labor': 'acc_expense_root',
  'acc_manufacturing_overhead': 'acc_expense_root',
  'acc_purchase_discounts_earned': 'acc_expense_root',
  'acc_admin_exp': 'acc_expense_root',
  'acc_exp_salaries': 'acc_admin_exp',
  'acc_exp_rent': 'acc_admin_exp',
  'acc_exp_utilities': 'acc_admin_exp',
  'acc_exp_electricity': 'acc_exp_utilities',
  'acc_exp_water': 'acc_exp_utilities',
  'acc_exp_marketing': 'acc_admin_exp',
  'acc_exp_maintenance': 'acc_admin_exp',
  'acc_bank_fees': 'acc_admin_exp',
  'acc_depreciation_exp': 'acc_admin_exp',
  'acc_exchange_diff': 'acc_admin_exp',
  'acc_loss_asset_disposal': 'acc_admin_exp',
  'acc_inventory_adjustments': 'acc_expense_root',
  'acc_inventory_variance': 'acc_inventory_adjustments',
  'acc_damaged_goods': 'acc_inventory_adjustments'
};

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.');

    await client.query('BEGIN');

    // Temporarily drop constraints to avoid foreign key errors during parent updates
    console.log('Dropping foreign key constraints...');
    await client.query('ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_parent_id_fkey');

    // Fetch all accounts
    const accountsRes = await client.query('SELECT id, company_id FROM accounts');
    const accounts = accountsRes.rows;
    console.log(`Fetched ${accounts.length} accounts from database.`);

    let updatedCount = 0;

    for (const acc of accounts) {
      const companyId = acc.company_id;
      const prefix = companyId + '_';
      
      // Determine raw account ID
      let rawId = acc.id;
      if (acc.id.startsWith(prefix)) {
        rawId = acc.id.substring(prefix.length);
      }

      // Check if this account has a defined parent in parentMap
      const parentRawId = parentMap[rawId];
      if (parentRawId) {
        // Construct the prefixed parent ID
        const prefixedParentId = `${prefix}${parentRawId}`;

        // Verify if this parent account actually exists in the database for this company
        const parentCheck = await client.query(
          'SELECT id FROM accounts WHERE company_id = $1 AND id = $2',
          [companyId, prefixedParentId]
        );

        if (parentCheck.rows.length > 0) {
          await client.query(
            'UPDATE accounts SET parent_id = $1 WHERE company_id = $2 AND id = $3',
            [prefixedParentId, companyId, acc.id]
          );
          updatedCount++;
        } else {
          console.warn(`[Warning] Parent account ${prefixedParentId} not found in DB for child ${acc.id}.`);
        }
      }
    }

    console.log(`Updated parent_id for ${updatedCount} accounts.`);

    // Recreate constraints
    console.log('Restoring foreign key constraints...');
    await client.query('ALTER TABLE accounts ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL');

    await client.query('COMMIT');
    console.log('Database update completed successfully! 🎉');
  } catch (err) {
    console.error('Failed to update parent IDs:', err);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
};

run();
