import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Standard accounts from AccountingContext.tsx initialAccounts
const initialAccounts = [
  // 1 - ASSETS
  { id: 'acc_assets', code: '1', name: 'الأصول', type: 'ASSET', isGroup: true },
  { id: 'acc_current_assets', code: '11', name: 'الأصول المتداولة', type: 'ASSET', parentId: 'acc_assets', isGroup: true },
  { id: 'acc_cash_root', code: '111', name: 'نقدية بالصناديق (الخزائن)', type: 'ASSET', parentId: 'acc_current_assets', isGroup: true },
  { id: 'acc_cash', code: '11101', name: 'الصندوق الرئيسي', type: 'ASSET', parentId: 'acc_cash_root' },
  { id: 'acc_bank_root', code: '112', name: 'نقدية بالبنوك (حسابات جارية)', type: 'ASSET', parentId: 'acc_current_assets', isGroup: true },
  { id: 'acc_receivable_group', code: '113', name: 'الذمم المدينة (العملاء)', type: 'ASSET', parentId: 'acc_current_assets', isGroup: true },
  { id: 'acc_receivable', code: '11301', name: 'ذمم العملاء التجارية', type: 'ASSET', parentId: 'acc_receivable_group' },
  { id: 'acc_notes_receivable', code: '114', name: 'أوراق القبض (شيكات واردة)', type: 'ASSET', parentId: 'acc_current_assets', isGroup: true },
  { id: 'acc_cheques_hand', code: '11401', name: 'شيكات بالصندوق', type: 'ASSET', parentId: 'acc_notes_receivable' },
  { id: 'acc_cheques_under_collection', code: '11402', name: 'شيكات تحت التحصيل', type: 'ASSET', parentId: 'acc_notes_receivable' },
  { id: 'acc_inventory_group', code: '115', name: 'المخزون', type: 'ASSET', parentId: 'acc_current_assets', isGroup: true },
  { id: 'acc_inventory', code: '11501', name: 'مخزون البضائع', type: 'ASSET', parentId: 'acc_inventory_group' },
  { id: 'acc_vat_input', code: '116', name: 'ضريبة المدخلات القابلة للاسترداد', type: 'ASSET', parentId: 'acc_current_assets' },
  { id: 'acc_employee_advances', code: '117', name: 'سلف الموظفين', type: 'ASSET', parentId: 'acc_current_assets' },
  { id: 'acc_fixed_assets_root', code: '12', name: 'الأصول الثابتة', type: 'ASSET', parentId: 'acc_assets', isGroup: true },
  { id: 'acc_furniture', code: '121', name: 'أثاث ومفروشات', type: 'ASSET', parentId: 'acc_fixed_assets_root' },
  { id: 'acc_equipment', code: '122', name: 'أجهزة ومعدات إلكترونية', type: 'ASSET', parentId: 'acc_fixed_assets_root' },
  { id: 'acc_buildings', code: '123', name: 'مباني ومنشآت', type: 'ASSET', parentId: 'acc_fixed_assets_root' },
  { id: 'acc_machinery', code: '124', name: 'آلات ومعدات', type: 'ASSET', parentId: 'acc_fixed_assets_root' },
  { id: 'acc_vehicles', code: '125', name: 'سيارات ووسائل نقل', type: 'ASSET', parentId: 'acc_fixed_assets_root' },
  { id: 'acc_accumulated_depreciation', code: '129', name: 'مجمع إهلاك الأصول', type: 'ASSET', parentId: 'acc_fixed_assets_root' },

  // 2 - LIABILITIES
  { id: 'acc_liabilities', code: '2', name: 'الخصوم (الالتزامات)', type: 'LIABILITY', isGroup: true },
  { id: 'acc_current_liabilities', code: '21', name: 'الالتزامات المتداولة', type: 'LIABILITY', parentId: 'acc_liabilities', isGroup: true },
  { id: 'acc_long_term_liabilities', code: '22', name: 'الالتزامات طويلة الأجل', type: 'LIABILITY', parentId: 'acc_liabilities', isGroup: true },
  { id: 'acc_payable_group', code: '211', name: 'الذمم الدائنة (الموردون)', type: 'LIABILITY', parentId: 'acc_current_liabilities', isGroup: true },
  { id: 'acc_payable', code: '21101', name: 'ذمم الموردين التجارية', type: 'LIABILITY', parentId: 'acc_payable_group' },
  { id: 'acc_notes_payable', code: '212', name: 'أوراق الدفع (شيكات صادرة)', type: 'LIABILITY', parentId: 'acc_current_liabilities' },
  { id: 'acc_accrued_salaries', code: '213', name: 'ذمم موظفين', type: 'LIABILITY', parentId: 'acc_current_liabilities' },
  { id: 'acc_payroll_deductions_payable', code: '214', name: 'استقطاعات ومستحقات الرواتب', type: 'LIABILITY', parentId: 'acc_current_liabilities' },
  { id: 'acc_vat_output', code: '221', name: 'ضريبة المخرجات', type: 'LIABILITY', parentId: 'acc_current_liabilities' },
  { id: 'acc_vat_payable', code: '222', name: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', parentId: 'acc_current_liabilities' },

  // 3 - EQUITY
  { id: 'acc_equity_root', code: '3', name: 'حقوق الملكية', type: 'EQUITY', isGroup: true },
  { id: 'acc_capital', code: '31', name: 'رأس المال المدفوع', type: 'EQUITY', parentId: 'acc_equity_root' },
  { id: 'acc_retained_earnings', code: '32', name: 'الأرباح غير الموزعة', type: 'EQUITY', parentId: 'acc_equity_root' },
  { id: 'acc_partners_accounts_group', code: '33', name: 'حسابات الشركاء', type: 'EQUITY', parentId: 'acc_equity_root', isGroup: true },
  { id: 'acc_partners_capital', code: '331', name: 'رأس مال الشركاء', type: 'EQUITY', parentId: 'acc_partners_accounts_group' },
  { id: 'acc_partner_current', code: '332', name: 'جاري الشركاء', type: 'EQUITY', parentId: 'acc_partners_accounts_group' },
  { id: 'acc_partner_drawings', code: '333', name: 'مسحوبات الشركاء', type: 'EQUITY', parentId: 'acc_partners_accounts_group' },

  // 4 - REVENUE
  { id: 'acc_revenue_root', code: '4', name: 'الإيرادات', type: 'REVENUE', isGroup: true },
  { id: 'acc_sales', code: '41', name: 'إيرادات المبيعات', type: 'REVENUE', parentId: 'acc_revenue_root' },
  { id: 'acc_service_income', code: '42', name: 'إيرادات الخدمات', type: 'REVENUE', parentId: 'acc_revenue_root' },
  { id: 'acc_sales_returns', code: '43', name: 'مرتجع المبيعات', type: 'REVENUE', parentId: 'acc_revenue_root' },
  { id: 'acc_sales_discounts', code: '44', name: 'خصومات المبيعات', type: 'REVENUE', parentId: 'acc_revenue_root' },
  { id: 'acc_gain_asset_disposal', code: '45', name: 'أرباح بيع الأصول', type: 'REVENUE', parentId: 'acc_revenue_root' },

  // 5 - EXPENSE
  { id: 'acc_expense_root', code: '5', name: 'المصروفات', type: 'EXPENSE', isGroup: true },
  { id: 'acc_cogs', code: '51', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', parentId: 'acc_expense_root' },
  { id: 'acc_purchases', code: '511', name: 'المشتريات', type: 'EXPENSE', parentId: 'acc_expense_root' },
  { id: 'acc_purchase_returns', code: '512', name: 'مردودات المشتريات', type: 'EXPENSE', parentId: 'acc_expense_root' },
  { id: 'acc_direct_labor', code: '513', name: 'أجور عمالة مباشرة (صناعية)', type: 'EXPENSE', parentId: 'acc_expense_root' },
  { id: 'acc_manufacturing_overhead', code: '514', name: 'ت. صناعية غير مباشرة (محملة)', type: 'EXPENSE', parentId: 'acc_expense_root' },
  { id: 'acc_purchase_discounts_earned', code: '515', name: 'خصومات مشتريات مكتسبة', type: 'EXPENSE', parentId: 'acc_expense_root' },
  { id: 'acc_admin_exp', code: '52', name: 'مصاريف إدارية وعمومية', type: 'EXPENSE', parentId: 'acc_expense_root', isGroup: true },
  { id: 'acc_exp_salaries', code: '521', name: 'الرواتب والأجور المباشرة', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_exp_rent', code: '522', name: 'إيجار المكاتب والفروع', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_exp_utilities', code: '523', name: 'خدمات (كهرباء ومياه)', type: 'EXPENSE', parentId: 'acc_admin_exp', isGroup: true },
  { id: 'acc_exp_electricity', code: '5231', name: 'مصاريف كهرباء', type: 'EXPENSE', parentId: 'acc_exp_utilities' },
  { id: 'acc_exp_water', code: '5232', name: 'مصاريف مياه', type: 'EXPENSE', parentId: 'acc_exp_utilities' },
  { id: 'acc_exp_marketing', code: '524', name: 'مصاريف تسويق وإعلان', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_exp_maintenance', code: '525', name: 'مصاريف صيانة', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_bank_fees', code: '53', name: 'مصاريف وعمولات بنكية', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_depreciation_exp', code: '54', name: 'مصروف الإهلاك', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_exchange_diff', code: '55', name: 'فروقات أسعار العملات', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_loss_asset_disposal', code: '56', name: 'خسائر بيع الأصول', type: 'EXPENSE', parentId: 'acc_admin_exp' },
  { id: 'acc_inventory_adjustments', code: '57', name: 'تسويات وفروقات المخزون', type: 'EXPENSE', parentId: 'acc_expense_root', isGroup: true },
  { id: 'acc_inventory_variance', code: '571', name: 'فروقات المخزون', type: 'EXPENSE', parentId: 'acc_inventory_adjustments' },
  { id: 'acc_damaged_goods', code: '572', name: 'بضاعة تالفة', type: 'EXPENSE', parentId: 'acc_inventory_adjustments' }
];

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.');

    await client.query('BEGIN');

    // Temporarily drop constraints
    console.log('Dropping foreign key constraints...');
    await client.query('ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_parent_id_fkey');

    // Fetch all active company IDs
    const companiesRes = await client.query('SELECT id, base_currency FROM companies');
    const companies = companiesRes.rows;
    console.log(`Found ${companies.length} companies in database.`);

    let insertedCount = 0;

    for (const comp of companies) {
      const companyId = comp.id;
      const baseCurrency = comp.base_currency || 'ILS';

      for (const stdAcc of initialAccounts) {
        const prefixedId = `${companyId}_${stdAcc.id}`;
        
        // Check if this prefixed ID exists in the database
        const checkRes = await client.query(
          'SELECT id FROM accounts WHERE company_id = $1 AND id = $2',
          [companyId, prefixedId]
        );

        if (checkRes.rows.length === 0) {
          console.log(`[Adding] Missing account: ${prefixedId} (Code: ${stdAcc.code}, Name: ${stdAcc.name}) for company: ${companyId}`);
          
          await client.query(
            `INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance, is_active)
             VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, 0, true)`,
            [
              prefixedId,
              companyId,
              stdAcc.code,
              stdAcc.name,
              stdAcc.type,
              !!stdAcc.isGroup,
              baseCurrency
            ]
          );
          insertedCount++;
        }
      }
    }

    console.log(`Successfully inserted ${insertedCount} missing accounts.`);

    // Restore constraints
    console.log('Restoring foreign key constraints...');
    await client.query('ALTER TABLE accounts ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL');

    await client.query('COMMIT');
    console.log('Completed successfully! 🎉 Now running parent relationships update...');
  } catch (err) {
    console.error('Failed to add missing accounts:', err);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
};

run();
