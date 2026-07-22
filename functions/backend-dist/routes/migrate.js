import { Router } from 'express';
import admin from 'firebase-admin';
import { pool } from '../config/db.js';
import { prefixAccountId } from '../utils/account-helpers.js';
import { upsertUser } from '../utils/user-helpers.js';
const router = Router();
// Helper to sanitize dates
const parseDate = (d) => {
    if (!d)
        return null;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
};
router.post('/', async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log(`[Migration API] Starting migration triggered by user: ${uid}`);
    const db = admin.firestore();
    const pgClient = await pool.connect();
    try {
        // 1. Get all documents in Firestore under workspace_sync_snapshots
        const snapshotsRef = db.collectionGroup('workspace_sync_snapshots');
        const snapshotDocs = await snapshotsRef.get();
        console.log(`[Migration API] Found ${snapshotDocs.size} company snapshots to migrate.`);
        let migratedCompaniesCount = 0;
        await pgClient.query('BEGIN');
        for (const docSnap of snapshotDocs.docs) {
            const docData = docSnap.data();
            const userId = docData.userId || docSnap.ref.parent.parent?.id; // Get parent user UID
            const companyId = docData.companyId || docSnap.id;
            const snapshot = docData.snapshot || {};
            if (!userId) {
                console.warn(`[Migration API] Missing userId for snapshot ${docSnap.id}. Skipping.`);
                continue;
            }
            console.log(`[Migration API] Migrating Company: ${companyId} (Owner: ${userId})`);
            // A. Extract Company Info & Settings
            const companySettings = snapshot.companySettings || {};
            const companyName = companySettings.name || 'شركة غير مسمى';
            const taxNumber = companySettings.taxNumber || '';
            const address = companySettings.address || '';
            const phone = companySettings.phone || '';
            const logoUrl = companySettings.logoUrl || '';
            const baseCurrency = snapshot.baseCurrency || 'ILS';
            // Insert Company
            await pgClient.query(`INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, tax_number = EXCLUDED.tax_number, address = EXCLUDED.address,
             phone = EXCLUDED.phone, logo_url = EXCLUDED.logo_url, base_currency = EXCLUDED.base_currency, settings = EXCLUDED.settings`, [companyId, companyName, taxNumber, address, phone, logoUrl, baseCurrency, JSON.stringify(companySettings)]);
            // Create owner user if not exists
            await upsertUser(userId, docData.userEmail || `user_${userId}@system.local`, docData.userName || `User_${userId}`, 'ADMIN', undefined, undefined, pgClient);
            // Create Membership
            await pgClient.query(`INSERT INTO memberships (company_id, user_id, role, status)
         VALUES ($1, $2, 'OWNER', 'ACTIVE')
         ON CONFLICT (company_id, user_id) DO NOTHING`, [companyId, userId]);
            // B. Migrate Accounts (Chart of Accounts)
            const accounts = snapshot.accounts || [];
            console.log(`[Migration API] Migrating ${accounts.length} accounts...`);
            // Pass 1: Insert all accounts without parent_id to avoid constraint violations
            for (const account of accounts) {
                await pgClient.query(`INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance)
           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)
           ON CONFLICT (company_id, code) DO UPDATE
           SET name = EXCLUDED.name, type = EXCLUDED.type, parent_id = NULL,
               is_group = EXCLUDED.is_group, currency = EXCLUDED.currency, balance = EXCLUDED.balance`, [
                    prefixAccountId(companyId, account.id),
                    companyId,
                    account.code,
                    account.name,
                    account.type,
                    !!account.isGroup,
                    account.currency || baseCurrency,
                    Number(account.balance || 0)
                ]);
            }
            // Pass 2: Update parent_id references now that all accounts are created (with check for parent existence)
            for (const account of accounts) {
                if (account.parentId) {
                    const prefixedParentId = prefixAccountId(companyId, account.parentId);
                    const parentCheck = await pgClient.query(`SELECT 1 FROM accounts WHERE company_id = $1 AND id = $2`, [companyId, prefixedParentId]);
                    if (parentCheck.rows.length > 0) {
                        await pgClient.query(`UPDATE accounts
               SET parent_id = $1
               WHERE company_id = $2 AND id = $3`, [prefixedParentId, companyId, prefixAccountId(companyId, account.id)]);
                    }
                    else {
                        console.warn(`[Migration Warning] Parent account ${account.parentId} does not exist for child account ${account.id}. Leaving parent_id as NULL.`);
                    }
                }
            }
            // C. Migrate Contacts
            const contacts = snapshot.contacts || [];
            console.log(`[Migration API] Migrating ${contacts.length} contacts...`);
            for (const contact of contacts) {
                await pgClient.query(`INSERT INTO contacts (id, company_id, name, type, phone, address, preferred_price_tier, linked_account_id, current_account_id, capital_account_id, drawings_account_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (company_id, id) DO UPDATE
           SET name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, address = EXCLUDED.address,
               linked_account_id = EXCLUDED.linked_account_id, current_account_id = EXCLUDED.current_account_id,
               capital_account_id = EXCLUDED.capital_account_id, drawings_account_id = EXCLUDED.drawings_account_id`, [
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
                ]);
            }
            // D. Migrate Warehouses
            const warehouses = snapshot.warehouses || [];
            console.log(`[Migration API] Migrating ${warehouses.length} warehouses...`);
            for (const w of warehouses) {
                await pgClient.query(`INSERT INTO warehouses (id, company_id, name, location, manager, is_main)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (company_id, id) DO NOTHING`, [w.id, companyId, w.name, w.location || '', w.manager || '', !!w.isMain]);
            }
            // E. Migrate Products
            const products = snapshot.products || [];
            console.log(`[Migration API] Migrating ${products.length} products...`);
            for (const p of products) {
                await pgClient.query(`INSERT INTO products (id, company_id, name, kind, category, buy_price, sell_price, wholesale_price, retail_price, stock, barcode, item_code, expiry_date, unit_id, fifo_layers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (company_id, id) DO NOTHING`, [
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
                ]);
                // Warehouse Stock Breakdown
                const breakdown = p.warehouseStock || [];
                for (const b of breakdown) {
                    await pgClient.query(`INSERT INTO product_warehouse_stock (company_id, product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (company_id, product_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity`, [companyId, p.id, b.warehouseId, Number(b.quantity || 0)]);
                }
            }
            // F. Migrate Transactions (Journal Entries)
            const transactions = snapshot.transactions || [];
            console.log(`[Migration API] Migrating ${transactions.length} journal entries...`);
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
                await pgClient.query(`INSERT INTO journal_entries (id, company_id, voucher_id, amount, description, category, type, date, invoice_id, contact_id, employee_id, asset_id, check_id, currency, exchange_rate, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (company_id, id) DO NOTHING`, [
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
                ]);
                // Insert Lines
                for (const line of lines) {
                    await pgClient.query(`INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, currency, exchange_rate, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT DO NOTHING`, [companyId, t.id, prefixAccountId(companyId, line.accountId), line.debit, line.credit, t.currency || baseCurrency, Number(t.exchangeRate || 1.0), line.note]);
                }
            }
            // G. Migrate Invoices
            const invoices = snapshot.invoices || [];
            console.log(`[Migration API] Migrating ${invoices.length} invoices...`);
            for (const inv of invoices) {
                await pgClient.query(`INSERT INTO invoices (id, company_id, invoice_number, customer_id, linked_invoice_id, type, category, date, due_date, sub_total, tax_rate, tax_amount, tax_mode, discount_amount, total_amount, status, posting_status, payment_type, payment_account_id, is_partner_drawings, partner_drawings_mode, notes, currency, exchange_rate, warehouse_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
           ON CONFLICT (company_id, id) DO NOTHING`, [
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
                ]);
                // Items
                const items = inv.items || [];
                for (const item of items) {
                    await pgClient.query(`INSERT INTO invoice_items (id, company_id, invoice_id, product_id, account_id, description, quantity, unit_price, total, returned, width, length)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (company_id, id) DO NOTHING`, [
                        item.id,
                        companyId,
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
                    ]);
                }
            }
            // H. Settlements
            const settlements = snapshot.invoiceSettlements || [];
            console.log(`[Migration API] Migrating ${settlements.length} invoice settlements...`);
            for (const set of settlements) {
                await pgClient.query(`INSERT INTO invoice_settlements (id, company_id, invoice_id, voucher_id, contact_id, date, amount, amount_base, currency, exchange_rate, source_type, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (company_id, id) DO NOTHING`, [
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
                ]);
            }
            // I. Employees
            const employees = snapshot.employees || [];
            console.log(`[Migration API] Migrating ${employees.length} employees...`);
            for (const emp of employees) {
                await pgClient.query(`INSERT INTO employees (id, company_id, name, code, department_id, position, hire_date, salary_type, pay_basis, basic_salary, daily_work_hours, hourly_rate, status, phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (company_id, id) DO UPDATE
           SET name = EXCLUDED.name, position = EXCLUDED.position, status = EXCLUDED.status`, [
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
                ]);
            }
            // J. Fixed Assets
            const assets = snapshot.fixedAssets || [];
            console.log(`[Migration API] Migrating ${assets.length} fixed assets...`);
            for (const asset of assets) {
                await pgClient.query(`INSERT INTO fixed_assets (id, company_id, name, purchase_date, cost, salvage_value, life_in_years, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (company_id, id) DO NOTHING`, [
                    asset.id,
                    companyId,
                    asset.name,
                    parseDate(asset.purchaseDate || new Date()),
                    Number(asset.cost || 0),
                    Number(asset.salvageValue || 0),
                    Number(asset.lifeInYears || 5),
                    asset.description || '',
                    asset.status || 'ACTIVE'
                ]);
            }
            // K. Checks
            const checks = snapshot.checks || [];
            console.log(`[Migration API] Migrating ${checks.length} checks...`);
            for (const check of checks) {
                await pgClient.query(`INSERT INTO checks (id, company_id, check_number, bank_name, due_date, amount, status, contact_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (company_id, id) DO NOTHING`, [
                    check.id,
                    companyId,
                    check.checkNumber,
                    check.bankName,
                    parseDate(check.dueDate || new Date()),
                    Number(check.amount || 0),
                    check.status,
                    check.contactId || null
                ]);
            }
            migratedCompaniesCount++;
        }
        await pgClient.query('COMMIT');
        console.log(`[Migration API] Completed migration of ${migratedCompaniesCount} companies.`);
        res.json({ ok: true, migratedCompaniesCount });
    }
    catch (error) {
        await pgClient.query('ROLLBACK');
        console.error('[Migration API Error] Failed running database migration:', error);
        res.status(500).json({ error: error.message || 'Migration Failed' });
    }
    finally {
        pgClient.release();
    }
});
router.post('/clean-tenant-overlap', async (req, res) => {
    const uid = req.user?.uid;
    const userEmail = req.user?.email;
    const secretHeader = req.headers['x-cleanup-secret'];
    const expectedSecret = 'a1f1ex_cleanup_secret_20260619_sec';
    let isAuthorized = false;
    if (secretHeader === expectedSecret) {
        isAuthorized = true;
    }
    else if (uid && userEmail === 'hamza.mm.aa.ss@gmail.com') {
        isAuthorized = true;
    }
    if (!isAuthorized) {
        return res.status(403).json({ error: 'Forbidden: Invalid cleanup authorization.' });
    }
    const execute = req.body.execute === true;
    console.log(`[Cleanup API] Starting tenant overlap cleanup (execute: ${execute}) triggered by user: ${uid}`);
    const db = admin.firestore();
    const pgClient = await pool.connect();
    try {
        // 1. Fetch all Firestore company_subscriptions to determine the true owners
        const subsSnapshot = await db.collection('company_subscriptions').get();
        const companyOwnerMap = new Map();
        subsSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.ownerUserId) {
                companyOwnerMap.set(docSnap.id, data.ownerUserId);
            }
        });
        // 2. Fetch all users from PostgreSQL to check default companies
        const usersRes = await pgClient.query('SELECT id FROM users');
        const allUserIds = new Set(usersRes.rows.map(r => r.id));
        // Auto-map companies of type cmp_{userId} to the corresponding userId
        for (const userId of allUserIds) {
            const defaultCompanyId = `cmp_${userId}`;
            if (!companyOwnerMap.has(defaultCompanyId)) {
                companyOwnerMap.set(defaultCompanyId, userId);
            }
        }
        // 3. Inspect PostgreSQL memberships
        const membershipsRes = await pgClient.query('SELECT id, company_id, user_id, role, status FROM memberships');
        const membershipsToDelete = [];
        const membershipsToKeep = [];
        for (const row of membershipsRes.rows) {
            const { id, company_id, user_id } = row;
            const trueOwner = companyOwnerMap.get(company_id);
            let isCorrect = false;
            if (trueOwner === user_id) {
                isCorrect = true;
            }
            else if (company_id === `cmp_${user_id}`) {
                isCorrect = true;
            }
            if (isCorrect) {
                membershipsToKeep.push(row);
            }
            else {
                membershipsToDelete.push(row);
            }
        }
        // 4. Inspect Firestore user companies lists
        const usersSnapshot = await db.collection('users').get();
        const firestoreUpdates = [];
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const rawCompanies = userData.companies || [];
            if (!Array.isArray(rawCompanies))
                continue;
            const cleanedCompanies = rawCompanies.filter(c => {
                if (!c.id)
                    return false;
                const trueOwner = companyOwnerMap.get(c.id);
                return trueOwner === userId || c.id === `cmp_${userId}`;
            });
            if (cleanedCompanies.length !== rawCompanies.length) {
                firestoreUpdates.push({
                    ref: userDoc.ref,
                    userId,
                    oldList: rawCompanies.map(c => c.id),
                    newList: cleanedCompanies
                });
            }
        }
        if (execute) {
            await pgClient.query('BEGIN');
            // Delete incorrect memberships
            if (membershipsToDelete.length > 0) {
                const deleteIds = membershipsToDelete.map(m => m.id);
                await pgClient.query('DELETE FROM memberships WHERE id = ANY($1)', [deleteIds]);
            }
            await pgClient.query('COMMIT');
            // Update Firestore User Profiles
            for (const update of firestoreUpdates) {
                await update.ref.update({ companies: update.newList });
            }
        }
        res.json({
            ok: true,
            executed: execute,
            membershipsAnalyzed: membershipsRes.rows.length,
            membershipsKept: membershipsToKeep.length,
            membershipsDeletedCount: membershipsToDelete.length,
            membershipsDeletedList: membershipsToDelete.map(m => ({ userId: m.user_id, companyId: m.company_id })),
            firestoreUsersAnalyzed: usersSnapshot.size,
            firestoreUsersUpdatedCount: firestoreUpdates.length,
            firestoreUpdates: firestoreUpdates.map(u => ({ userId: u.userId, oldList: u.oldList, newList: u.newList.map((c) => c.id) }))
        });
    }
    catch (error) {
        if (execute) {
            try {
                await pgClient.query('ROLLBACK');
            }
            catch { }
        }
        console.error('[Cleanup API Error] Failed running cleanup:', error);
        res.status(500).json({ error: error.message || 'Cleanup Failed' });
    }
    finally {
        pgClient.release();
    }
});
export default router;
