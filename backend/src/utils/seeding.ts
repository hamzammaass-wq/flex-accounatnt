import { prefixAccountId } from './account-helpers.js';

export async function seedNewCompany(client: any, companyId: string, baseCurrency: string = 'ILS'): Promise<void> {
  // 1. Seed currencies
  const defaultCurrencies = [
    { code: 'ILS', name: 'شيكل إسرائيلي', symbol: '₪', rate: 1 },
    { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', rate: 1.05 },
    { code: 'USD', name: 'دولار أمريكي', symbol: '$', rate: 3.75 },
    { code: 'EUR', name: 'يورو', symbol: '€', rate: 4.05 }
  ];

  for (const c of defaultCurrencies) {
    await client.query(
      `INSERT INTO currencies (company_id, code, name, symbol, rate)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, code) DO UPDATE
       SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, rate = EXCLUDED.rate`,
      [companyId, c.code, c.name, c.symbol, c.rate]
    );
  }

  // 2. Seed default warehouse
  const initialWarehouses = [
    { id: 'wh_main', name: 'المستودع الرئيسي', location: 'المقر الرئيسي', is_main: true }
  ];

  for (const w of initialWarehouses) {
    await client.query(
      `INSERT INTO warehouses (id, company_id, name, location, is_main)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, id) DO UPDATE
       SET name = EXCLUDED.name, location = EXCLUDED.location, is_main = EXCLUDED.is_main`,
      [w.id, companyId, w.name, w.location, w.is_main]
    );
  }

  // 3. Seed accounts (in two passes: first create, then update parents)
  const initialAccounts = [
    // 1 - ASSETS
    { id: 'acc_assets', code: '1', name: 'الأصول', type: 'ASSET', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_current_assets', code: '11', name: 'الأصول المتداولة', type: 'ASSET', balance: 0, parentId: 'acc_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_cash_root', code: '111', name: 'نقدية بالصناديق (الخزائن)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_cash', code: '11101', name: 'الصندوق الرئيسي', type: 'ASSET', balance: 0, parentId: 'acc_cash_root', currency: baseCurrency },
    { id: 'acc_bank_root', code: '112', name: 'نقدية بالبنوك (حسابات جارية)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_receivable_group', code: '113', name: 'الذمم المدينة (العملاء)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_receivable', code: '11301', name: 'ذمم العملاء التجارية', type: 'ASSET', balance: 0, parentId: 'acc_receivable_group', currency: baseCurrency },
    { id: 'acc_notes_receivable', code: '114', name: 'أوراق القبض (شيكات واردة)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_cheques_hand', code: '11401', name: 'شيكات بالصندوق', type: 'ASSET', balance: 0, parentId: 'acc_notes_receivable', currency: baseCurrency },
    { id: 'acc_cheques_under_collection', code: '11402', name: 'شيكات تحت التحصيل', type: 'ASSET', balance: 0, parentId: 'acc_notes_receivable', currency: baseCurrency },
    { id: 'acc_inventory_group', code: '115', name: 'المخزون', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_inventory', code: '11501', name: 'مخزون البضائع', type: 'ASSET', balance: 0, parentId: 'acc_inventory_group', currency: baseCurrency },
    { id: 'acc_vat_input', code: '116', name: 'ضريبة المدخلات القابلة للاسترداد', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', currency: baseCurrency },
    { id: 'acc_employee_advances', code: '117', name: 'سلف الموظفين', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', currency: baseCurrency },
    { id: 'acc_fixed_assets_root', code: '12', name: 'الأصول الثابتة', type: 'ASSET', balance: 0, parentId: 'acc_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_furniture', code: '121', name: 'أثاث ومفروشات', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
    { id: 'acc_equipment', code: '122', name: 'أجهزة ومعدات إلكترونية', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
    { id: 'acc_buildings', code: '123', name: 'مباني ومنشآت', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
    { id: 'acc_machinery', code: '124', name: 'آلات ومعدات', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
    { id: 'acc_vehicles', code: '125', name: 'سيارات ووسائل نقل', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
    { id: 'acc_accumulated_depreciation', code: '129', name: 'مجمع إهلاك الأصول', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },

    // 2 - LIABILITIES
    { id: 'acc_liabilities', code: '2', name: 'الخصوم (الالتزامات)', type: 'LIABILITY', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_current_liabilities', code: '21', name: 'الالتزامات المتداولة', type: 'LIABILITY', balance: 0, parentId: 'acc_liabilities', isGroup: true, currency: baseCurrency },
    { id: 'acc_long_term_liabilities', code: '22', name: 'الالتزامات طويلة الأجل', type: 'LIABILITY', balance: 0, parentId: 'acc_liabilities', isGroup: true, currency: baseCurrency },
    { id: 'acc_payable_group', code: '211', name: 'الذمم الدائنة (الموردون)', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', isGroup: true, currency: baseCurrency },
    { id: 'acc_payable', code: '21101', name: 'ذمم الموردين التجارية', type: 'LIABILITY', balance: 0, parentId: 'acc_payable_group', currency: baseCurrency },
    { id: 'acc_notes_payable', code: '212', name: 'أوراق الدفع (شيكات صادرة)', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
    { id: 'acc_accrued_salaries', code: '213', name: 'ذمم موظفين', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
    { id: 'acc_payroll_deductions_payable', code: '214', name: 'استقطاعات ومستحقات الرواتب', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
    { id: 'acc_vat_output', code: '221', name: 'ضريبة المخرجات', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
    { id: 'acc_vat_payable', code: '222', name: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },

    // 3 - EQUITY
    { id: 'acc_equity_root', code: '3', name: 'حقوق الملكية', type: 'EQUITY', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_capital', code: '31', name: 'رأس المال المدفوع', type: 'EQUITY', balance: 0, parentId: 'acc_equity_root', currency: baseCurrency },
    { id: 'acc_retained_earnings', code: '32', name: 'الأرباح غير الموزعة', type: 'EQUITY', balance: 0, parentId: 'acc_equity_root', currency: baseCurrency },
    { id: 'acc_partners_accounts_group', code: '33', name: 'حسابات الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_equity_root', isGroup: true, currency: baseCurrency },
    { id: 'acc_partners_capital', code: '331', name: 'رأس مال الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_partners_accounts_group', isGroup: true, currency: baseCurrency },
    { id: 'acc_partner_current', code: '332', name: 'جاري الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_partners_accounts_group', isGroup: true, currency: baseCurrency },
    { id: 'acc_partner_drawings', code: '333', name: 'مسحوبات الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_partners_accounts_group', isGroup: true, currency: baseCurrency },

    // 4 - REVENUE
    { id: 'acc_revenue_root', code: '4', name: 'الإيرادات', type: 'REVENUE', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_sales', code: '41', name: 'إيرادات المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
    { id: 'acc_sales_returns', code: '43', name: 'مرتجع المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
    { id: 'acc_sales_discounts', code: '44', name: 'خصومات المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
    { id: 'acc_gain_asset_disposal', code: '45', name: 'أرباح بيع الأصول', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
    { id: 'acc_service_income', code: '42', name: 'إيرادات الخدمات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },

    // 5 - EXPENSES
    { id: 'acc_expense_root', code: '5', name: 'المصروفات', type: 'EXPENSE', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_cogs', code: '51', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_purchases', code: '511', name: 'المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_purchase_returns', code: '512', name: 'مردودات المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_admin_exp', code: '52', name: 'مصاريف إدارية وعمومية', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', isGroup: true, currency: baseCurrency },
    { id: 'acc_exp_salaries', code: '521', name: 'الرواتب والأجور المباشرة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_exp_rent', code: '522', name: 'إيجار المكاتب والفروع', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_exp_utilities', code: '523', name: 'خدمات (كهرباء ومياه)', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', isGroup: true, currency: baseCurrency },
    { id: 'acc_exp_electricity', code: '5231', name: 'مصاريف كهرباء', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency },
    { id: 'acc_exp_water', code: '5232', name: 'مصاريف مياه', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency },
    { id: 'acc_exp_marketing', code: '524', name: 'مصاريف تسويق وإعلان', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_exp_maintenance', code: '525', name: 'مصاريف صيانة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_bank_fees', code: '53', name: 'مصاريف وعمولات بنكية', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_depreciation_exp', code: '54', name: 'مصروف الإهلاك', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_exchange_diff', code: '55', name: 'فروقات أسعار العملات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_loss_asset_disposal', code: '56', name: 'خسائر بيع الأصول', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_inventory_adjustments', code: '57', name: 'تسويات وفروقات المخزون', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', isGroup: true, currency: baseCurrency },
    { id: 'acc_inventory_variance', code: '571', name: 'فروقات المخزون', type: 'EXPENSE', balance: 0, parentId: 'acc_inventory_adjustments', currency: baseCurrency },
    { id: 'acc_damaged_goods', code: '572', name: 'بضاعة تالفة', type: 'EXPENSE', balance: 0, parentId: 'acc_inventory_adjustments', currency: baseCurrency },
    { id: 'acc_direct_labor', code: '513', name: 'أجور عمالة مباشرة (صناعية)', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_manufacturing_overhead', code: '514', name: 'ت. صناعية غير مباشرة (محملة)', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_purchase_discounts_earned', code: '515', name: 'خصومات مشتريات مكتسبة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  ];

  // Pass 1: Insert all accounts without parent_id to avoid constraint violations
  for (const item of initialAccounts) {
    const prefixedId = prefixAccountId(companyId, item.id);
    if (!prefixedId) continue;
    await client.query(
      `INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance, is_active)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)
       ON CONFLICT (company_id, id) DO UPDATE
       SET code = EXCLUDED.code, name = EXCLUDED.name, type = EXCLUDED.type, parent_id = NULL,
           is_group = EXCLUDED.is_group, currency = EXCLUDED.currency, balance = EXCLUDED.balance, is_active = EXCLUDED.is_active`,
      [prefixedId, companyId, item.code, item.name, item.type, !!item.isGroup, item.currency, Number(item.balance || 0), true]
    );
  }

  // Pass 2: Update parent_id references
  for (const item of initialAccounts) {
    if (item.parentId) {
      const prefixedParentId = prefixAccountId(companyId, item.parentId);
      const prefixedChildId = prefixAccountId(companyId, item.id);
      if (prefixedParentId && prefixedChildId) {
        await client.query(
          `UPDATE accounts
           SET parent_id = $1
           WHERE company_id = $2 AND id = $3`,
          [prefixedParentId, companyId, prefixedChildId]
        );
      }
    }
  }
}
