import { Router, type Response } from 'express';
import { type AuthenticatedRequest, verifyCompanyMembership } from '../middleware/auth.js';
import { query, getClient } from '../config/db.js';

const router = Router({ mergeParams: true });

const prefixAccountId = (companyId: string, id: string | null | undefined): string | null => {
  if (!id) return null;
  if (id.startsWith(companyId + '_')) return id;
  return `${companyId}_${id}`;
};

const unprefixAccountId = (companyId: string, id: string | null | undefined): string | null => {
  if (!id) return null;
  const prefix = companyId + '_';
  if (id.startsWith(prefix)) {
    return id.substring(prefix.length);
  }
  return id;
};

const resolveDbAccountId = async (client: any, companyId: string, accountId: string | null | undefined): Promise<string | null> => {
  if (!accountId) return null;
  const prefixed = accountId.startsWith(companyId + '_') ? accountId : `${companyId}_${accountId}`;
  const raw = accountId.startsWith(companyId + '_') ? accountId.substring(companyId.length + 1) : accountId;
  
  const res = await client.query(
    `SELECT id FROM accounts WHERE company_id = $1 AND (id = $2 OR id = $3)`,
    [companyId, prefixed, raw]
  );
  if (res.rows.length > 0) {
    return res.rows[0].id;
  }
  return prefixed;
};

// Helper to sanitize dates
const parseDate = (d: any) => {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// Map frontend collection names to database tables
const TABLE_MAP: Record<string, string> = {
  accounts: 'accounts',
  contacts: 'contacts',
  warehouses: 'warehouses',
  employees: 'employees',
  employeeContracts: 'employee_contracts',
  employeeLeaveRequests: 'employee_leave_requests',
  employeeRecurringDeductions: 'employee_recurring_deductions',
  fixedAssets: 'fixed_assets',
  assetGroups: 'fixed_asset_groups',
  checks: 'checks',
  auditLogs: 'audit_logs',
  currencies: 'currencies',
  transactions: 'journal_entries',
  invoices: 'invoices',
  invoiceSettlements: 'invoice_settlements',
  products: 'products',
  stockTransfers: 'stock_transfers',
  users: 'users'
};

// Generic fetch endpoint for a collection
router.get('/:collectionName', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId, collectionName } = req.params;
  const dbTable = TABLE_MAP[collectionName];

  if (!dbTable) {
    // Treat as an unmapped collection stored in company settings JSONB
    try {
      const compResult = await query(`SELECT settings FROM companies WHERE id = $1`, [companyId]);
      if (compResult.rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
      const settings = compResult.rows[0].settings || {};
      const collectionData = settings[collectionName] || [];
      return res.json(collectionData);
    } catch (error: any) {
      console.error(`[Fetch Sync Error - Settings fallback] ${collectionName}:`, error);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    let result;
    if (collectionName === 'transactions') {
      result = await query(
        `SELECT t.*, 
          COALESCE((SELECT json_agg(jl.*) FROM journal_lines jl WHERE jl.entry_id = t.id), '[]'::json) as lines
         FROM journal_entries t
         WHERE t.company_id = $1
         ORDER BY t.date DESC, t.created_at DESC`,
        [companyId]
      );
    } else if (collectionName === 'invoices') {
      result = await query(
        `SELECT i.*, 
          COALESCE((SELECT json_agg(item.*) FROM invoice_items item WHERE item.invoice_id = i.id), '[]'::json) as items
         FROM invoices i
         WHERE i.company_id = $1
         ORDER BY i.date DESC, i.created_at DESC`,
        [companyId]
      );
    } else if (collectionName === 'products') {
      result = await query(
        `SELECT p.*,
          COALESCE((SELECT json_agg(json_build_object('warehouseId', pws.warehouse_id, 'quantity', pws.quantity))
           FROM product_warehouse_stock pws WHERE pws.product_id = p.id), '[]'::json) as "warehouseStock"
         FROM products p
         WHERE p.company_id = $1`,
        [companyId]
      );
    } else if (collectionName === 'stockTransfers') {
      result = await query(
        `SELECT st.*,
          COALESCE((SELECT json_agg(sti.*) FROM stock_transfer_items sti WHERE sti.transfer_id = st.id), '[]'::json) as items
         FROM stock_transfers st
         WHERE st.company_id = $1`,
        [companyId]
      );
    } else if (collectionName === 'employeeContracts') {
      result = await query(
        `SELECT ec.* FROM employee_contracts ec
         JOIN employees e ON ec.employee_id = e.id
         WHERE e.company_id = $1`,
        [companyId]
      );
    } else if (collectionName === 'employeeLeaveRequests') {
      result = await query(
        `SELECT elr.* FROM employee_leave_requests elr
         JOIN employees e ON elr.employee_id = e.id
         WHERE e.company_id = $1`,
        [companyId]
      );
    } else if (collectionName === 'employeeRecurringDeductions') {
      result = await query(
        `SELECT erd.* FROM employee_recurring_deductions erd
         JOIN employees e ON erd.employee_id = e.id
         WHERE e.company_id = $1`,
        [companyId]
      );
    } else if (collectionName === 'users') {
      result = await query(
        `SELECT u.id, u.email, u.name, u.picture,
                CASE WHEN u.role = 'USER' OR u.role IS NULL THEN 'ADMIN' ELSE u.role END AS role,
                COALESCE(m.status, 'ACTIVE') AS status,
                m.company_id AS "companyId"
         FROM users u
         JOIN memberships m ON u.id = m.user_id
         WHERE m.company_id = $1`,
        [companyId]
      );
    } else if (collectionName === 'accounts') {
      result = await query(
        `SELECT a.*,
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
        [companyId]
      );
    } else if (collectionName === 'currencies') {
      result = await query(`SELECT * FROM currencies WHERE company_id = $1`, [companyId]);
    } else {
      result = await query(`SELECT * FROM ${dbTable} WHERE company_id = $1`, [companyId]);
    }

    // Convert keys to camelCase if needed, or send as is since the model keys in schema are designed to match
    if (collectionName === 'transactions' && result) {
      const mappedRows = result.rows.map((row: any) => {
        const debitLine = (row.lines || []).find((l: any) => Number(l.debit || 0) > 0);
        const creditLine = (row.lines || []).find((l: any) => Number(l.credit || 0) > 0);
        return {
          id: row.id,
          date: row.date,
          amount: Number(row.amount),
          description: row.description,
          category: row.category,
          type: row.type,
          status: row.status,
          currency: row.currency,
          exchangeRate: Number(row.exchange_rate || 1.0),
          voucherId: row.voucher_id || undefined,
          invoiceId: row.invoice_id || undefined,
          contactId: row.contact_id || undefined,
          employeeId: row.employee_id || undefined,
          assetId: row.asset_id || undefined,
          checkId: row.check_id || undefined,
          reversalOfId: row.reversal_of_id || undefined,
          reversedById: row.reversed_by_id || undefined,
          isReversal: row.is_reversal,
          debitAccountId: debitLine ? unprefixAccountId(companyId, debitLine.account_id) : undefined,
          creditAccountId: creditLine ? unprefixAccountId(companyId, creditLine.account_id) : undefined,
          lines: (row.lines || []).map((l: any) => ({
            accountId: unprefixAccountId(companyId, l.account_id),
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            currency: l.currency,
            exchangeRate: Number(l.exchange_rate || 1.0),
            note: l.note || undefined
          }))
        };
      });
      res.json(mappedRows);
    } else if (collectionName === 'invoices' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        customerId: row.customer_id || undefined,
        linkedInvoiceId: row.linked_invoice_id || undefined,
        type: row.type,
        category: row.category || undefined,
        date: row.date,
        dueDate: row.due_date || undefined,
        subTotal: Number(row.sub_total || 0),
        taxRate: Number(row.tax_rate || 0),
        taxAmount: Number(row.tax_amount || 0),
        taxMode: row.tax_mode,
        discountAmount: Number(row.discount_amount || 0),
        totalAmount: Number(row.total_amount || 0),
        status: row.status,
        postingStatus: row.posting_status,
        paymentType: row.payment_type,
        paymentAccountId: unprefixAccountId(companyId, row.payment_account_id) || undefined,
        isPartnerDrawings: row.is_partner_drawings,
        partnerDrawingsMode: row.partner_drawings_mode || undefined,
        notes: row.notes || undefined,
        currency: row.currency,
        exchangeRate: Number(row.exchange_rate || 1.0),
        warehouseId: row.warehouse_id || undefined,
        reversalOfId: row.reversal_of_id || undefined,
        reversedById: row.reversed_by_id || undefined,
        isReversal: row.is_reversal,
        items: (row.items || []).map((item: any) => ({
          id: item.id,
          productId: item.product_id || undefined,
          accountId: unprefixAccountId(companyId, item.account_id) || undefined,
          description: item.description,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unit_price || 0),
          total: Number(item.total || 0),
          returned: item.returned,
          width: item.width ? Number(item.width) : undefined,
          length: item.length ? Number(item.length) : undefined
        }))
      }));
      res.json(mappedRows);
    } else if (collectionName === 'accounts' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: unprefixAccountId(companyId, row.id),
        code: row.code,
        name: row.name,
        type: row.type,
        parentId: unprefixAccountId(companyId, row.parent_id) || undefined,
        isGroup: row.is_group,
        currency: row.currency,
        balance: Number(row.balance || 0),
        isActive: row.is_active
      }));
      res.json(mappedRows);
    } else if (collectionName === 'contacts' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        phone: row.phone || undefined,
        address: row.address || undefined,
        preferredPriceTier: row.preferred_price_tier || undefined,
        linkedAccountId: unprefixAccountId(companyId, row.linked_account_id) || undefined,
        currentAccountId: unprefixAccountId(companyId, row.current_account_id) || undefined,
        capitalAccountId: unprefixAccountId(companyId, row.capital_account_id) || undefined,
        drawingsAccountId: unprefixAccountId(companyId, row.drawings_account_id) || undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'warehouses' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        location: row.location || undefined,
        manager: row.manager || undefined,
        isMain: row.is_main
      }));
      res.json(mappedRows);
    } else if (collectionName === 'employees' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        departmentId: row.department_id,
        position: row.position || undefined,
        hireDate: row.hire_date,
        salaryType: row.salary_type,
        payBasis: row.pay_basis || undefined,
        basicSalary: Number(row.basic_salary || 0),
        dailyWorkHours: Number(row.daily_work_hours || 0),
        hourlyRate: Number(row.hourly_rate || 0),
        status: row.status,
        phone: row.phone || undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'employeeContracts' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        employeeId: row.employee_id,
        contractType: row.contract_type,
        startDate: row.start_date,
        endDate: row.end_date || undefined,
        status: row.status,
        notes: row.notes || undefined,
        createdAt: row.created_at
      }));
      res.json(mappedRows);
    } else if (collectionName === 'employeeLeaveRequests' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        employeeId: row.employee_id,
        leaveType: row.leave_type,
        status: row.status,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        days: Number(row.days || 0),
        note: row.note || undefined,
        deductFromPayroll: row.deduct_from_payroll,
        createdAt: row.created_at
      }));
      res.json(mappedRows);
    } else if (collectionName === 'employeeRecurringDeductions' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        employeeId: row.employee_id,
        type: row.type,
        status: row.status,
        label: row.label,
        amount: Number(row.amount || 0),
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to || undefined,
        createdAt: row.created_at
      }));
      res.json(mappedRows);
    } else if (collectionName === 'fixedAssets' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        groupId: row.group_id || undefined,
        purchaseDate: row.purchase_date,
        cost: Number(row.cost || 0),
        salvageValue: Number(row.salvage_value || 0),
        lifeInYears: Number(row.life_in_years || 0),
        description: row.description || undefined,
        status: row.status,
        disposalDate: row.disposal_date || undefined,
        disposalPrice: row.disposal_price !== null ? Number(row.disposal_price) : undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'assetGroups' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        defaultUsefulLife: Number(row.default_useful_life || 0),
        depreciationRate: row.depreciation_rate !== null ? Number(row.depreciation_rate) : undefined,
        description: row.description || undefined,
        assetAccountId: unprefixAccountId(companyId, row.asset_account_id) || undefined,
        accumulatedDepreciationAccountId: unprefixAccountId(companyId, row.accumulated_depreciation_account_id) || undefined,
        depreciationExpenseAccountId: unprefixAccountId(companyId, row.depreciation_expense_account_id) || undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'checks' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        checkNumber: row.check_number,
        bankName: row.bank_name,
        accountNumber: row.account_number || undefined,
        bankAccountId: unprefixAccountId(companyId, row.bank_account_id) || undefined,
        amount: Number(row.amount || 0),
        currency: row.currency,
        dueDate: row.due_date,
        issueDate: row.issue_date,
        type: row.type,
        status: row.status,
        depositedBankId: row.deposited_bank_id || undefined,
        contactId: row.contact_id || undefined,
        originalContactId: row.original_contact_id || undefined,
        endorseeContactId: row.endorsee_contact_id || undefined,
        imageUrl: row.image_url || undefined,
        imageUrls: row.image_urls || undefined,
        description: row.description || undefined,
        endorseeName: row.endorsee_name || undefined,
        bounceSettlementStatus: row.bounce_settlement_status || undefined,
        bounceSettlementDate: row.bounce_settlement_date || undefined,
        bounceSettlementNote: row.bounce_settlement_note || undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'auditLogs' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        timestamp: row.created_at,
        userId: row.user_id || undefined,
        action: row.action,
        details: row.details || undefined,
        screen: row.screen || undefined,
        device: row.device || undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'invoiceSettlements' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        voucherId: row.voucher_id,
        contactId: row.contact_id || undefined,
        date: row.date,
        amount: Number(row.amount || 0),
        amountBase: Number(row.amount_base || 0),
        currency: row.currency,
        exchangeRate: Number(row.exchange_rate || 1.0),
        sourceType: row.source_type,
        note: row.note || undefined
      }));
      res.json(mappedRows);
    } else if (collectionName === 'products' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        category: row.category || undefined,
        buyPrice: Number(row.buy_price || 0),
        sellPrice: Number(row.sell_price || 0),
        wholesalePrice: row.wholesale_price ? Number(row.wholesale_price) : undefined,
        retailPrice: row.retail_price ? Number(row.retail_price) : undefined,
        wholesalePricingMode: row.wholesale_pricing_mode || undefined,
        retailPricingMode: row.retail_pricing_mode || undefined,
        wholesaleMarkupPercent: row.wholesale_markup_percent ? Number(row.wholesale_markup_percent) : undefined,
        retailMarkupPercent: row.retail_markup_percent ? Number(row.retail_markup_percent) : undefined,
        stock: Number(row.stock || 0),
        barcode: row.barcode || undefined,
        itemCode: row.item_code || undefined,
        itemCodeMode: row.item_code_mode || undefined,
        expiryPeriodDays: row.expiry_period_days || undefined,
        expiryAlertLeadDays: row.expiry_alert_lead_days || undefined,
        lowStockAlertQty: row.low_stock_alert_qty || undefined,
        reorderQty: row.reorder_qty || undefined,
        expiryDate: row.expiry_date || undefined,
        imageUrl: row.image_url || undefined,
        unitId: row.unit_id || undefined,
        fifoLayers: row.fifo_layers || [],
        warehouseStock: row.warehouseStock || []
      }));
      res.json(mappedRows);
    } else if (collectionName === 'stockTransfers' && result) {
      const mappedRows = result.rows.map((row: any) => ({
        id: row.id,
        transferNumber: row.transfer_number,
        date: row.date,
        fromWarehouseId: row.from_warehouse_id,
        toWarehouseId: row.to_warehouse_id,
        items: (row.items || []).map((item: any) => ({
          productId: item.product_id,
          quantity: Number(item.quantity || 0),
          description: item.description || undefined
        })),
        notes: row.notes || undefined,
        status: row.status
      }));
      res.json(mappedRows);
    } else {
      res.json(result.rows);
    }
  } catch (error: any) {
    console.error(`[Fetch Sync Error] ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Generic batch synchronization endpoint
router.post('/:collectionName/sync', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId, collectionName } = req.params;
  const { upserts, deletes } = req.body;
  const dbTable = TABLE_MAP[collectionName];

  if (!dbTable) {
    // Treat as an unmapped collection stored in company settings JSONB
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const compResult = await client.query(`SELECT settings FROM companies WHERE id = $1 FOR UPDATE`, [companyId]);
      if (compResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Company not found' });
      }
      
      const settings = compResult.rows[0].settings || {};
      let collectionData = settings[collectionName] || [];
      if (!Array.isArray(collectionData)) {
        collectionData = [];
      }

      // Process deletes
      if (Array.isArray(deletes) && deletes.length > 0) {
        const deleteSet = new Set(deletes);
        collectionData = collectionData.filter((item: any) => !deleteSet.has(item.id));
      }

      // Process upserts
      if (Array.isArray(upserts) && upserts.length > 0) {
        const upsertMap = new Map(upserts.map((item: any) => [item.id, item]));
        collectionData = collectionData.map((item: any) => {
          if (upsertMap.has(item.id)) {
            const newItem = upsertMap.get(item.id);
            upsertMap.delete(item.id);
            return newItem;
          }
          return item;
        });
        for (const newItem of upsertMap.values()) {
          collectionData.push(newItem);
        }
      }

      settings[collectionName] = collectionData;

      await client.query(
        `UPDATE companies
         SET settings = $1
         WHERE id = $2`,
        [JSON.stringify(settings), companyId]
      );

      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`[Sync Batch Error - Settings fallback] ${collectionName}:`, error);
      return res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Process deletes
    if (Array.isArray(deletes) && deletes.length > 0) {
      if (collectionName === 'currencies') {
        await client.query(
          `DELETE FROM currencies WHERE company_id = $1 AND code = ANY($2)`,
          [companyId, deletes]
        );
      } else {
        let targets = deletes;
        if (collectionName === 'accounts') {
          const prefixed = deletes.map(id => prefixAccountId(companyId, id));
          const unprefixed = deletes.map(id => unprefixAccountId(companyId, id));
          targets = Array.from(new Set([...prefixed, ...unprefixed])).filter(Boolean) as string[];
        }
        await client.query(
          `DELETE FROM ${dbTable} WHERE company_id = $1 AND id = ANY($2)`,
          [companyId, targets]
        );
      }
    }

    // 2. Process upserts
    if (Array.isArray(upserts) && upserts.length > 0) {
      if (collectionName === 'accounts') {
        // Lock table to prevent race conditions on code checks and inserts
        await client.query(`LOCK TABLE accounts IN SHARE ROW EXCLUSIVE MODE`);

        // Pass 1: Insert all accounts without parent_id to avoid constraint violations
        for (const item of upserts) {
          const prefixedId = prefixAccountId(companyId, item.id);
          const existingAcc = await client.query(
            `SELECT id FROM accounts WHERE company_id = $1 AND code = $2`,
            [companyId, item.code]
          );
          let targetId = prefixedId;
          if (existingAcc.rows.length > 0) {
            targetId = existingAcc.rows[0].id;
          }
          await client.query(
            `INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance, is_active)
             VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE
             SET code = EXCLUDED.code, name = EXCLUDED.name, type = EXCLUDED.type, parent_id = NULL,
                 is_group = EXCLUDED.is_group, currency = EXCLUDED.currency, balance = EXCLUDED.balance, is_active = EXCLUDED.is_active`,
            [targetId, companyId, item.code, item.name, item.type, !!item.isGroup, item.currency, Number(item.balance || 0), item.isActive !== false]
          );
        }

        // Pass 2: Update parent_id references now that all accounts are created (with check for parent existence)
        for (const item of upserts) {
          if (item.parentId) {
            const prefixedParentId = prefixAccountId(companyId, item.parentId);
            const parentCheck = await client.query(
              `SELECT id FROM accounts WHERE company_id = $1 AND (id = $2 OR id = $3)`,
              [companyId, prefixedParentId, item.parentId]
            );
            if (parentCheck.rows.length > 0) {
              const dbParentId = parentCheck.rows[0].id;
              const childCheck = await client.query(
                `SELECT id FROM accounts WHERE company_id = $1 AND (id = $2 OR id = $3)`,
                [companyId, prefixAccountId(companyId, item.id), item.id]
              );
              if (childCheck.rows.length > 0) {
                const dbChildId = childCheck.rows[0].id;
                await client.query(
                  `UPDATE accounts
                   SET parent_id = $1
                   WHERE company_id = $2 AND id = $3`,
                  [dbParentId, companyId, dbChildId]
                );
              }
            } else {
              console.warn(`[Sync Warning] Parent account ${item.parentId} does not exist for child account ${item.id}. Leaving parent_id as NULL.`);
            }
          }
        }
      } else {
        for (const item of upserts) {
          if (collectionName === 'contacts') {
            await client.query(
              `INSERT INTO contacts (id, company_id, name, type, phone, address, preferred_price_tier, linked_account_id, current_account_id, capital_account_id, drawings_account_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE
               SET name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, address = EXCLUDED.address,
                   preferred_price_tier = EXCLUDED.preferred_price_tier, linked_account_id = EXCLUDED.linked_account_id,
                   current_account_id = EXCLUDED.current_account_id, capital_account_id = EXCLUDED.capital_account_id, drawings_account_id = EXCLUDED.drawings_account_id`,
              [
                item.id,
                companyId,
                item.name,
                item.type,
                item.phone || null,
                item.address || null,
                item.preferredPriceTier || 'RETAIL',
                prefixAccountId(companyId, item.linkedAccountId),
                prefixAccountId(companyId, item.currentAccountId),
                prefixAccountId(companyId, item.capitalAccountId),
                prefixAccountId(companyId, item.drawingsAccountId)
              ]
            );
          }

          else if (collectionName === 'employeeContracts') {
            await client.query(
              `INSERT INTO employee_contracts (id, employee_id, contract_type, start_date, end_date, status, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO UPDATE
               SET contract_type = EXCLUDED.contract_type, start_date = EXCLUDED.start_date,
                   end_date = EXCLUDED.end_date, status = EXCLUDED.status, notes = EXCLUDED.notes`,
              [item.id, item.employeeId, item.contractType || 'OPEN_ENDED', parseDate(item.startDate), parseDate(item.endDate), item.status || 'ACTIVE', item.notes || null]
            );
          }

          else if (collectionName === 'employeeLeaveRequests') {
            await client.query(
              `INSERT INTO employee_leave_requests (id, employee_id, leave_type, status, effective_from, effective_to, days, note, deduct_from_payroll)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO UPDATE
               SET leave_type = EXCLUDED.leave_type, status = EXCLUDED.status, effective_from = EXCLUDED.effective_from,
                   effective_to = EXCLUDED.effective_to, days = EXCLUDED.days, note = EXCLUDED.note, deduct_from_payroll = EXCLUDED.deduct_from_payroll`,
              [item.id, item.employeeId, item.leaveType, item.status || 'PENDING', parseDate(item.effectiveFrom), parseDate(item.effectiveTo), Number(item.days || 0), item.note || null, !!item.deductFromPayroll]
            );
          }

          else if (collectionName === 'employeeRecurringDeductions') {
            await client.query(
              `INSERT INTO employee_recurring_deductions (id, employee_id, type, status, label, amount, effective_from, effective_to)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO UPDATE
               SET type = EXCLUDED.type, status = EXCLUDED.status, label = EXCLUDED.label,
                   amount = EXCLUDED.amount, effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to`,
              [item.id, item.employeeId, item.type, item.status || 'ACTIVE', item.label, Number(item.amount || 0), parseDate(item.effectiveFrom), parseDate(item.effectiveTo)]
            );
          }

          else if (collectionName === 'users') {
            await client.query(
              `INSERT INTO users (id, email, name, picture, role)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (id) DO UPDATE
               SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture, role = EXCLUDED.role`,
              [item.id, item.email, item.name || '', item.picture || null, item.role || 'USER']
            );

            // Link the user to the company
            await client.query(
              `INSERT INTO memberships (company_id, user_id, role, status)
               VALUES ($1, $2, $3, 'ACTIVE')
               ON CONFLICT (company_id, user_id) DO NOTHING`,
              [companyId, item.id, item.role === 'OWNER' ? 'OWNER' : 'MEMBER']
            );
          }

        else if (collectionName === 'currencies') {
          await client.query(
            `INSERT INTO currencies (company_id, code, name, symbol, rate)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (company_id, code) DO UPDATE
             SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, rate = EXCLUDED.rate`,
            [companyId, item.code, item.name, item.symbol || null, Number(item.rate || 1.0)]
          );
        }

        else if (collectionName === 'transactions') {
          // Construct lines dynamically if not present (simple transactions with debit/credit account IDs)
          let lines = item.lines;
          if (!Array.isArray(lines) || lines.length === 0) {
            lines = [];
            if (item.debitAccountId) {
              lines.push({
                accountId: item.debitAccountId,
                debit: Number(item.amount || 0),
                credit: 0,
                note: item.description || null
              });
            }
            if (item.creditAccountId) {
              lines.push({
                accountId: item.creditAccountId,
                debit: 0,
                credit: Number(item.amount || 0),
                note: item.description || null
              });
            }
          }

          // Verify total balance
          const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
          const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
          if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw new Error(`Unbalanced transaction ${item.id}: Debit ${totalDebit} != Credit ${totalCredit}`);
          }

          // Insert/Update Transaction Header
          await client.query(
            `INSERT INTO journal_entries (id, company_id, voucher_id, amount, description, category, type, date, invoice_id, contact_id, employee_id, asset_id, check_id, currency, exchange_rate, status, reversal_of_id, reversed_by_id, is_reversal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             ON CONFLICT (id) DO UPDATE
             SET voucher_id = EXCLUDED.voucher_id, amount = EXCLUDED.amount, description = EXCLUDED.description,
                 category = EXCLUDED.category, type = EXCLUDED.type, date = EXCLUDED.date, status = EXCLUDED.status,
                 invoice_id = EXCLUDED.invoice_id, contact_id = EXCLUDED.contact_id, employee_id = EXCLUDED.employee_id,
                 asset_id = EXCLUDED.asset_id, check_id = EXCLUDED.check_id, currency = EXCLUDED.currency,
                 exchange_rate = EXCLUDED.exchange_rate, reversal_of_id = EXCLUDED.reversal_of_id,
                 reversed_by_id = EXCLUDED.reversed_by_id, is_reversal = EXCLUDED.is_reversal`,
            [
              item.id, companyId, item.voucherId || null, Number(item.amount || 0), item.description || '',
              item.category || '', item.type, new Date(item.date), item.invoiceId || null, item.contactId || null,
              item.employeeId || null, item.assetId || null, item.checkId || null, item.currency, Number(item.exchangeRate || 1.0),
              item.status || 'POSTED', item.reversalOfId || null, item.reversedById || null, !!item.isReversal
            ]
          );

          // Clear lines and re-insert
          await client.query(`DELETE FROM journal_lines WHERE entry_id = $1`, [item.id]);
          for (const line of lines) {
            await client.query(
              `INSERT INTO journal_lines (entry_id, account_id, debit, credit, currency, exchange_rate, note)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                item.id,
                prefixAccountId(companyId, line.accountId),
                Number(line.debit || 0),
                Number(line.credit || 0),
                line.currency || item.currency,
                Number(line.exchangeRate || item.exchangeRate || 1.0),
                line.note || null
              ]
            );
          }
        }

        else if (collectionName === 'invoices') {
          await client.query(
            `INSERT INTO invoices (id, company_id, invoice_number, customer_id, linked_invoice_id, type, category, date, due_date, sub_total, tax_rate, tax_amount, tax_mode, discount_amount, total_amount, status, posting_status, payment_type, payment_account_id, is_partner_drawings, partner_drawings_mode, notes, currency, exchange_rate, warehouse_id, reversal_of_id, reversed_by_id, is_reversal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
             ON CONFLICT (id) DO UPDATE
             SET invoice_number = EXCLUDED.invoice_number, customer_id = EXCLUDED.customer_id, linked_invoice_id = EXCLUDED.linked_invoice_id,
                 type = EXCLUDED.type, category = EXCLUDED.category, date = EXCLUDED.date, due_date = EXCLUDED.due_date,
                 sub_total = EXCLUDED.sub_total, tax_rate = EXCLUDED.tax_rate, tax_amount = EXCLUDED.tax_amount, tax_mode = EXCLUDED.tax_mode,
                 discount_amount = EXCLUDED.discount_amount, total_amount = EXCLUDED.total_amount, status = EXCLUDED.status,
                 posting_status = EXCLUDED.posting_status, payment_type = EXCLUDED.payment_type, payment_account_id = EXCLUDED.payment_account_id,
                 is_partner_drawings = EXCLUDED.is_partner_drawings, partner_drawings_mode = EXCLUDED.partner_drawings_mode,
                 notes = EXCLUDED.notes, currency = EXCLUDED.currency, exchange_rate = EXCLUDED.exchange_rate,
                 warehouse_id = EXCLUDED.warehouse_id, reversal_of_id = EXCLUDED.reversal_of_id, reversed_by_id = EXCLUDED.reversed_by_id,
                 is_reversal = EXCLUDED.is_reversal`,
            [
              item.id, companyId, item.invoiceNumber, item.customerId || null, item.linkedInvoiceId || null,
              item.type, item.category || '', new Date(item.date), item.dueDate ? new Date(item.dueDate) : null,
              Number(item.subTotal || 0), Number(item.taxRate || 0), Number(item.taxAmount || 0), item.taxMode || 'NONE',
              Number(item.discountAmount || 0), Number(item.totalAmount || 0), item.status || 'PENDING', item.postingStatus || 'DRAFT',
              item.paymentType || 'CREDIT', prefixAccountId(companyId, item.paymentAccountId), !!item.isPartnerDrawings, item.partnerDrawingsMode || null,
              item.notes || '', item.currency, Number(item.exchangeRate || 1.0), item.warehouseId || null, item.reversalOfId || null,
              item.reversedById || null, !!item.isReversal
            ]
          );

          // Clear items and re-insert
          await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [item.id]);
          if (Array.isArray(item.items)) {
            for (const details of item.items) {
              await client.query(
                `INSERT INTO invoice_items (id, invoice_id, product_id, account_id, description, quantity, unit_price, total, returned, width, length)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [details.id, item.id, details.productId || null, prefixAccountId(companyId, details.accountId), details.description || '', Number(details.quantity || 0), Number(details.unitPrice || 0), Number(details.total || 0), !!details.returned, details.width ? Number(details.width) : null, details.length ? Number(details.length) : null]
              );
            }
          }
        }

        else if (collectionName === 'products') {
          await client.query(
            `INSERT INTO products (
              id, company_id, name, kind, category, buy_price, sell_price, 
              wholesale_price, retail_price, wholesale_pricing_mode, retail_pricing_mode, 
              wholesale_markup_percent, retail_markup_percent, stock, barcode, 
              item_code, item_code_mode, expiry_period_days, expiry_alert_lead_days, 
              low_stock_alert_qty, reorder_qty, expiry_date, image_url, unit_id, fifo_layers
             )
             VALUES (
              $1, $2, $3, $4, $5, $6, $7, 
              $8, $9, $10, $11, 
              $12, $13, $14, $15, 
              $16, $17, $18, $19, 
              $20, $21, $22, $23, $24, $25
             )
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 kind = EXCLUDED.kind,
                 category = EXCLUDED.category,
                 buy_price = EXCLUDED.buy_price,
                 sell_price = EXCLUDED.sell_price,
                 wholesale_price = EXCLUDED.wholesale_price,
                 retail_price = EXCLUDED.retail_price,
                 wholesale_pricing_mode = EXCLUDED.wholesale_pricing_mode,
                 retail_pricing_mode = EXCLUDED.retail_pricing_mode,
                 wholesale_markup_percent = EXCLUDED.wholesale_markup_percent,
                 retail_markup_percent = EXCLUDED.retail_markup_percent,
                 stock = EXCLUDED.stock,
                 barcode = EXCLUDED.barcode,
                 item_code = EXCLUDED.item_code,
                 item_code_mode = EXCLUDED.item_code_mode,
                 expiry_period_days = EXCLUDED.expiry_period_days,
                 expiry_alert_lead_days = EXCLUDED.expiry_alert_lead_days,
                 low_stock_alert_qty = EXCLUDED.low_stock_alert_qty,
                 reorder_qty = EXCLUDED.reorder_qty,
                 expiry_date = EXCLUDED.expiry_date,
                 image_url = EXCLUDED.image_url,
                 unit_id = EXCLUDED.unit_id,
                 fifo_layers = EXCLUDED.fifo_layers`,
            [
              item.id, companyId, item.name, item.kind || 'STOCK', item.category || null, Number(item.buyPrice || 0),
              Number(item.sellPrice || 0), item.wholesalePrice ? Number(item.wholesalePrice) : null, item.retailPrice ? Number(item.retailPrice) : null,
              item.wholesalePricingMode || null, item.retailPricingMode || null, item.wholesaleMarkupPercent ? Number(item.wholesaleMarkupPercent) : null,
              item.retailMarkupPercent ? Number(item.retailMarkupPercent) : null, Number(item.stock || 0), item.barcode || null,
              item.itemCode || null, item.itemCodeMode || null, item.expiryPeriodDays || null, item.expiryAlertLeadDays || null,
              item.lowStockAlertQty ? Number(item.lowStockAlertQty) : null, item.reorderQty ? Number(item.reorderQty) : null,
              item.expiryDate ? new Date(item.expiryDate) : null, item.imageUrl || null, item.unitId || null, JSON.stringify(item.fifoLayers || [])
            ]
          );

          // Update warehouse stock breakdown
          if (Array.isArray(item.warehouseStock)) {
            await client.query(`DELETE FROM product_warehouse_stock WHERE product_id = $1`, [item.id]);
            for (const ws of item.warehouseStock) {
              await client.query(
                `INSERT INTO product_warehouse_stock (product_id, warehouse_id, quantity)
                 VALUES ($1, $2, $3)`,
                [item.id, ws.warehouseId, Number(ws.quantity || 0)]
              );
            }
          }
        }

        else if (collectionName === 'stockTransfers') {
          await client.query(
            `INSERT INTO stock_transfers (id, company_id, transfer_number, date, from_warehouse_id, to_warehouse_id, notes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE
             SET transfer_number = EXCLUDED.transfer_number, date = EXCLUDED.date,
                 from_warehouse_id = EXCLUDED.from_warehouse_id, to_warehouse_id = EXCLUDED.to_warehouse_id,
                 notes = EXCLUDED.notes, status = EXCLUDED.status`,
            [item.id, companyId, item.transferNumber, new Date(item.date), item.fromWarehouseId, item.toWarehouseId, item.notes || '', item.status || 'DRAFT']
          );

          // Clear items and re-insert
          await client.query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [item.id]);
          if (Array.isArray(item.items)) {
            for (const detail of item.items) {
              await client.query(
                `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, description)
                 VALUES ($1, $2, $3, $4)`,
                [item.id, detail.productId, Number(detail.quantity || 0), detail.description || null]
              );
            }
          }
        }

        else if (collectionName === 'assetGroups') {
          await client.query(
            `INSERT INTO fixed_asset_groups (
              id, company_id, name, default_useful_life, depreciation_rate, description, 
              asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 default_useful_life = EXCLUDED.default_useful_life,
                 depreciation_rate = EXCLUDED.depreciation_rate,
                 description = EXCLUDED.description,
                 asset_account_id = EXCLUDED.asset_account_id,
                 accumulated_depreciation_account_id = EXCLUDED.accumulated_depreciation_account_id,
                 depreciation_expense_account_id = EXCLUDED.depreciation_expense_account_id`,
            [
              item.id,
              companyId,
              item.name,
              Number(item.defaultUsefulLife || 0),
              item.depreciationRate !== undefined && item.depreciationRate !== null ? Number(item.depreciationRate) : null,
              item.description || null,
              prefixAccountId(companyId, item.assetAccountId),
              prefixAccountId(companyId, item.accumulatedDepreciationAccountId),
              prefixAccountId(companyId, item.depreciationExpenseAccountId)
            ]
          );
        }

        else if (collectionName === 'employees') {
          await client.query(
            `INSERT INTO employees (id, company_id, name, code, department_id, position, hire_date, salary_type, pay_basis, basic_salary, daily_work_hours, hourly_rate, status, phone)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name, code = EXCLUDED.code, department_id = EXCLUDED.department_id,
                 position = EXCLUDED.position, hire_date = EXCLUDED.hire_date, salary_type = EXCLUDED.salary_type,
                 pay_basis = EXCLUDED.pay_basis, basic_salary = EXCLUDED.basic_salary, daily_work_hours = EXCLUDED.daily_work_hours,
                 hourly_rate = EXCLUDED.hourly_rate, status = EXCLUDED.status, phone = EXCLUDED.phone`,
            [
              item.id, companyId, item.name, item.code, item.departmentId || null, item.position || null,
              new Date(item.hireDate), item.salaryType || 'FIXED', item.payBasis || 'FIXED_MONTHLY',
              Number(item.basicSalary || 0), Number(item.dailyWorkHours || 8.0), Number(item.hourlyRate || 0),
              item.status || 'ACTIVE', item.phone || null
            ]
          );
        }

        // Generic flat tables handler (for simple tables with 100% matching JSON keys)
        else {
          const columns = ['id', 'company_id'];
          const values = [item.id, companyId];
          const placeholders = ['$1', '$2'];

          Object.keys(item).forEach((key) => {
            if (key !== 'id' && key !== 'companyId') {
              // Convert camelCase key to snake_case column
              const colName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
              columns.push(colName);
              let val = item[key];
              if (typeof val === 'object' && val !== null) {
                val = JSON.stringify(val);
              }
              values.push(val);
              placeholders.push(`$${values.length}`);
            }
          });

          const queryText = `
            INSERT INTO ${dbTable} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            ON CONFLICT (id) DO UPDATE
            SET ${columns.filter(c => c !== 'id' && c !== 'company_id').map((c, i) => `${c} = EXCLUDED.${c}`).join(', ')}
          `;

          await client.query(queryText, values);
        }
      }
    }
  }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`[Sync Batch Error] ${collectionName}:`, error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

export default router;
