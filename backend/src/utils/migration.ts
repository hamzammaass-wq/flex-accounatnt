import admin from 'firebase-admin';
import { pool } from '../config/db.js';

// Helper to sanitize dates
const parseDate = (d: any) => {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const prefixAccountId = (companyId: string, id: string | null | undefined): string | null => {
  if (!id) return null;
  if (id.startsWith(companyId + '_')) return id;
  return `${companyId}_${id}`;
};

export async function migrateUserFirestoreData(uid: string): Promise<number> {
  console.log(`[Migration Helper] Starting migration for user: ${uid}`);
  const db = admin.firestore();
  const pgClient = await pool.connect();

  try {
    // Get user-specific snapshots: users/{uid}/workspace_sync_snapshots/{companyId}
    const snapshotsRef = db.collection('users').doc(uid).collection('workspace_sync_snapshots');
    const snapshotDocs = await snapshotsRef.get();

    console.log(`[Migration Helper] Found ${snapshotDocs.size} company snapshots to migrate for user ${uid}.`);
    if (snapshotDocs.empty) {
      return 0;
    }

    let migratedCompaniesCount = 0;

    await pgClient.query('BEGIN');

    for (const docSnap of snapshotDocs.docs) {
      const docData = docSnap.data();
      const companyId = docData.companyId || docSnap.id;
      const snapshot = docData.snapshot || {};

      console.log(`[Migration Helper] Migrating Company: ${companyId} (Owner: ${uid})`);

      // A. Extract Company Info & Settings
      const companySettings = snapshot.companySettings || {};
      const companyName = companySettings.name || 'شركة غير مسمى';
      const taxNumber = companySettings.taxNumber || '';
      const address = companySettings.address || '';
      const phone = companySettings.phone || '';
      const logoUrl = companySettings.logoUrl || '';
      const baseCurrency = snapshot.baseCurrency || 'ILS';

      // Insert Company
      await pgClient.query(
        `INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, tax_number = EXCLUDED.tax_number, address = EXCLUDED.address,
             phone = EXCLUDED.phone, logo_url = EXCLUDED.logo_url, base_currency = EXCLUDED.base_currency, settings = EXCLUDED.settings`,
        [companyId, companyName, taxNumber, address, phone, logoUrl, baseCurrency, JSON.stringify(companySettings)]
      );

      // Create owner user if not exists
      await pgClient.query(
        `INSERT INTO users (id, email, name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [uid, docData.userEmail || `user_${uid}@system.local`, docData.userName || `User_${uid}`, 'USER']
      );

      // Create Membership
      await pgClient.query(
        `INSERT INTO memberships (company_id, user_id, role, status)
         VALUES ($1, $2, 'OWNER', 'ACTIVE')
         ON CONFLICT (company_id, user_id) DO NOTHING`,
        [companyId, uid]
      );

      // B. Migrate Accounts (Chart of Accounts)
      const accounts = snapshot.accounts || [];
      console.log(`[Migration Helper] Migrating ${accounts.length} accounts...`);
      
      // Pass 1: Insert all accounts without parent_id to avoid constraint violations
      for (const account of accounts) {
        await pgClient.query(
          `INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance)
           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)
           ON CONFLICT (company_id, code) DO UPDATE
           SET name = EXCLUDED.name, type = EXCLUDED.type, parent_id = NULL,
               is_group = EXCLUDED.is_group, currency = EXCLUDED.currency, balance = EXCLUDED.balance`,
          [
            prefixAccountId(companyId, account.id),
            companyId,
            account.code,
            account.name,
            account.type,
            !!account.isGroup,
            account.currency || baseCurrency,
            Number(account.balance || 0)
          ]
        );
      }

      // Pass 2: Update parent_id references now that all accounts are created (with check for parent existence)
      for (const account of accounts) {
        if (account.parentId) {
          const prefixedParentId = prefixAccountId(companyId, account.parentId);
          const parentCheck = await pgClient.query(
            `SELECT 1 FROM accounts WHERE company_id = $1 AND id = $2`,
            [companyId, prefixedParentId]
          );
          if (parentCheck.rows.length > 0) {
            await pgClient.query(
              `UPDATE accounts
               SET parent_id = $1
               WHERE company_id = $2 AND id = $3`,
              [prefixedParentId, companyId, prefixAccountId(companyId, account.id)]
            );
          } else {
            console.warn(`[Migration Warning] Parent account ${account.parentId} does not exist for child account ${account.id}. Leaving parent_id as NULL.`);
          }
        }
      }

      // C. Migrate Contacts
      const contacts = snapshot.contacts || [];
      console.log(`[Migration Helper] Migrating ${contacts.length} contacts...`);
      for (const contact of contacts) {
        await pgClient.query(
          `INSERT INTO contacts (id, company_id, name, type, phone, address, preferred_price_tier, linked_account_id, current_account_id, capital_account_id, drawings_account_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, address = EXCLUDED.address,
               linked_account_id = EXCLUDED.linked_account_id, current_account_id = EXCLUDED.current_account_id,
               capital_account_id = EXCLUDED.capital_account_id, drawings_account_id = EXCLUDED.drawings_account_id`,
          [
            contact.id,
            companyId,
            contact.name,
            contact.type,
            contact.phone || '',
            contact.address || '',
            contact.preferredPriceTier || 'RETAIL',
            prefixAccountId(companyId, contact.linkedAccountId),
            prefixAccountId(companyId, contact.currentAccountId),
            prefixAccountId(companyId, contact.capitalAccountId),
            prefixAccountId(companyId, contact.drawingsAccountId)
          ]
        );
      }

      // D. Migrate Warehouses
      const warehouses = snapshot.warehouses || [];
      console.log(`[Migration Helper] Migrating ${warehouses.length} warehouses...`);
      for (const w of warehouses) {
        await pgClient.query(
          `INSERT INTO warehouses (id, company_id, name, location, manager, is_main)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [w.id, companyId, w.name, w.location || '', w.manager || '', !!w.isMain]
        );
      }

      // E. Migrate Products
      const products = snapshot.products || [];
      console.log(`[Migration Helper] Migrating ${products.length} products...`);
      for (const p of products) {
        await pgClient.query(
          `INSERT INTO products (id, company_id, name, kind, category, buy_price, sell_price, wholesale_price, retail_price, stock, barcode, item_code, expiry_date, unit_id, fifo_layers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO NOTHING`,
          [
            p.id,
            companyId,
            p.name,
            p.kind || 'STOCK',
            p.category || '',
            Number(p.buyPrice || 0),
            Number(p.sellPrice || 0),
            p.wholesalePrice ? Number(p.wholesalePrice) : null,
            p.retailPrice ? Number(p.retailPrice) : null,
            Number(p.stock || 0),
            p.barcode || '',
            p.itemCode || '',
            parseDate(p.expiryDate),
            p.unitId || null,
            JSON.stringify(p.fifoLayers || [])
          ]
        );

        // Warehouse Stock Breakdown
        const breakdown = p.warehouseStock || [];
        for (const b of breakdown) {
          await pgClient.query(
            `INSERT INTO product_warehouse_stock (product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
            [p.id, b.warehouseId, Number(b.quantity || 0)]
          );
        }
      }

      // F. Migrate Transactions (Journal Entries)
      const transactions = snapshot.transactions || [];
      console.log(`[Migration Helper] Migrating ${transactions.length} journal entries...`);
      for (const t of transactions) {
        const lines = [];
        if (t.debitAccountId) {
          lines.push({
            accountId: t.debitAccountId,
            debit: Number(t.amount || 0),
            credit: 0,
            note: t.description
          });
        }
        if (t.creditAccountId) {
          lines.push({
            accountId: t.creditAccountId,
            debit: 0,
            credit: Number(t.amount || 0),
            note: t.description
          });
        }

        // Insert Transaction Header
        await pgClient.query(
          `INSERT INTO journal_entries (id, company_id, voucher_id, amount, description, category, type, date, invoice_id, contact_id, employee_id, asset_id, check_id, currency, exchange_rate, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
          [
            t.id,
            companyId,
            t.voucherId || null,
            Number(t.amount || 0),
            t.description || '',
            t.category || '',
            t.type || 'TRANSFER',
            parseDate(t.date || new Date()),
            t.invoiceId || null,
            t.contactId || null,
            t.employeeId || null,
            t.assetId || null,
            t.checkId || null,
            t.currency || baseCurrency,
            Number(t.exchangeRate || 1.0),
            t.status || 'POSTED'
          ]
        );

        // Insert Lines
        for (const line of lines) {
          await pgClient.query(
            `INSERT INTO journal_lines (entry_id, account_id, debit, credit, currency, exchange_rate, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [t.id, prefixAccountId(companyId, line.accountId), line.debit, line.credit, t.currency || baseCurrency, Number(t.exchangeRate || 1.0), line.note]
          );
        }
      }

      // G. Migrate Invoices
      const invoices = snapshot.invoices || [];
      console.log(`[Migration Helper] Migrating ${invoices.length} invoices...`);
      for (const inv of invoices) {
        await pgClient.query(
          `INSERT INTO invoices (id, company_id, invoice_number, customer_id, linked_invoice_id, type, category, date, due_date, sub_total, tax_rate, tax_amount, tax_mode, discount_amount, total_amount, status, posting_status, payment_type, payment_account_id, is_partner_drawings, partner_drawings_mode, notes, currency, exchange_rate, warehouse_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
           ON CONFLICT (id) DO NOTHING`,
          [
            inv.id,
            companyId,
            inv.invoiceNumber,
            inv.customerId || null,
            inv.linkedInvoiceId || null,
            inv.type,
            inv.category || '',
            parseDate(inv.date),
            parseDate(inv.dueDate),
            Number(inv.subTotal || 0),
            Number(inv.taxRate || 0),
            Number(inv.taxAmount || 0),
            inv.taxMode || 'NONE',
            Number(inv.discountAmount || 0),
            Number(inv.totalAmount || 0),
            inv.status || 'PENDING',
            inv.postingStatus || 'DRAFT',
            inv.paymentType || 'CREDIT',
            prefixAccountId(companyId, inv.paymentAccountId),
            !!inv.isPartnerDrawings,
            inv.partnerDrawingsMode || null,
            inv.notes || '',
            inv.currency || baseCurrency,
            Number(inv.exchangeRate || 1.0),
            inv.warehouseId || null
          ]
        );

        // Items
        const items = inv.items || [];
        for (const item of items) {
          await pgClient.query(
            `INSERT INTO invoice_items (id, invoice_id, product_id, account_id, description, quantity, unit_price, total, returned, width, length)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [
              item.id,
              inv.id,
              item.productId || null,
              prefixAccountId(companyId, item.accountId),
              item.description || '',
              Number(item.quantity || 0),
              Number(item.unitPrice || 0),
              Number(item.total || 0),
              !!item.returned,
              item.width ? Number(item.width) : null,
              item.length ? Number(item.length) : null
            ]
          );
        }
      }

      // H. Settlements
      const settlements = snapshot.invoiceSettlements || [];
      console.log(`[Migration Helper] Migrating ${settlements.length} invoice settlements...`);
      for (const set of settlements) {
        await pgClient.query(
          `INSERT INTO invoice_settlements (id, company_id, invoice_id, voucher_id, contact_id, date, amount, amount_base, currency, exchange_rate, source_type, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [
            set.id,
            companyId,
            set.invoiceId,
            set.voucherId,
            set.contactId || null,
            parseDate(set.date),
            Number(set.amount || 0),
            Number(set.amountBase || 0),
            set.currency || baseCurrency,
            Number(set.exchangeRate || 1.0),
            set.sourceType,
            set.note || ''
          ]
        );
      }

      // I. Employees
      const employees = snapshot.employees || [];
      console.log(`[Migration Helper] Migrating ${employees.length} employees...`);
      for (const emp of employees) {
        await pgClient.query(
          `INSERT INTO employees (id, company_id, name, code, department_id, position, hire_date, salary_type, pay_basis, basic_salary, daily_work_hours, hourly_rate, status, phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, position = EXCLUDED.position, status = EXCLUDED.status`,
          [
            emp.id,
            companyId,
            emp.name,
            emp.code,
            emp.departmentId || null,
            emp.position || '',
            parseDate(emp.hireDate || new Date()),
            emp.salaryType || 'FIXED',
            emp.payBasis || 'FIXED_MONTHLY',
            Number(emp.basicSalary || 0),
            Number(emp.dailyWorkHours || 8),
            Number(emp.hourlyRate || 0),
            emp.status || 'ACTIVE',
            emp.phone || ''
          ]
        );
      }

      // J. Fixed Assets
      const assets = snapshot.fixedAssets || [];
      console.log(`[Migration Helper] Migrating ${assets.length} fixed assets...`);
      for (const asset of assets) {
        await pgClient.query(
          `INSERT INTO fixed_assets (id, company_id, name, purchase_date, cost, salvage_value, life_in_years, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            asset.id,
            companyId,
            asset.name,
            parseDate(asset.purchaseDate || new Date()),
            Number(asset.cost || 0),
            Number(asset.salvageValue || 0),
            Number(asset.lifeInYears || 5),
            asset.description || '',
            asset.status || 'ACTIVE'
          ]
        );
      }

      // K. Checks
      const checks = snapshot.checks || [];
      console.log(`[Migration Helper] Migrating ${checks.length} checks...`);
      for (const check of checks) {
        await pgClient.query(
          `INSERT INTO checks (id, company_id, check_number, bank_name, due_date, amount, status, contact_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            check.id,
            companyId,
            check.checkNumber,
            check.bankName,
            parseDate(check.dueDate || new Date()),
            Number(check.amount || 0),
            check.status,
            check.contactId || null
          ]
        );
      }

      migratedCompaniesCount++;
    }

    await pgClient.query('COMMIT');
    console.log(`[Migration Helper] Completed user-specific migration of ${migratedCompaniesCount} companies.`);
    return migratedCompaniesCount;
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('[Migration Helper Error] Failed running user database migration:', error);
    throw error;
  } finally {
    pgClient.release();
  }
}
