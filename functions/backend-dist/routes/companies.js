import { Router } from 'express';
import admin from 'firebase-admin';
import { verifyCompanyMembership } from '../middleware/auth.js';
import { query, getClient } from '../config/db.js';
import { migrateUserFirestoreData } from '../utils/migration.js';
import { seedNewCompany } from '../utils/seeding.js';
const router = Router();
// Get all companies the user is a member of
router.get('/', async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        // Synchronize company list and memberships from Firestore for this user
        try {
            // Ensure deleted_companies tracking table exists
            await query(`
        CREATE TABLE IF NOT EXISTS deleted_companies (
          id VARCHAR(50) PRIMARY KEY,
          deleted_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
            const db = admin.firestore();
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const firestoreCompanies = userData?.companies || [];
                if (Array.isArray(firestoreCompanies) && firestoreCompanies.length > 0) {
                    // Fetch list of deleted company IDs so we don't re-create them
                    const deletedRes = await query(`SELECT id FROM deleted_companies`);
                    const deletedIds = new Set(deletedRes.rows.map((r) => r.id));
                    for (const fc of firestoreCompanies) {
                        if (!fc.id || fc.id === 'cmp_default')
                            continue;
                        // Skip companies that were intentionally deleted by the user
                        if (deletedIds.has(fc.id)) {
                            console.log(`[Companies Sync] Skipping deleted company ${fc.id}`);
                            continue;
                        }
                        // Check if company exists in PostgreSQL, if not, auto-create it
                        const compCheck = await query(`SELECT id FROM companies WHERE id = $1`, [fc.id]);
                        if (compCheck.rows.length === 0) {
                            console.log(`[Companies Sync] Auto-creating company ${fc.id} from Firestore list`);
                            await query(`INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (id) DO UPDATE
                 SET name = EXCLUDED.name,
                     tax_number = EXCLUDED.tax_number,
                     address = EXCLUDED.address,
                     phone = EXCLUDED.phone,
                     logo_url = EXCLUDED.logo_url,
                     base_currency = EXCLUDED.base_currency,
                     settings = EXCLUDED.settings`, [
                                fc.id,
                                fc.name || 'شركة غير مسمى',
                                fc.taxNumber || fc.tax_number || null,
                                fc.address || null,
                                fc.phone || null,
                                fc.logoUrl || fc.logo_url || null,
                                fc.baseCurrency || fc.base_currency || 'ILS',
                                JSON.stringify(fc.settings || {})
                            ]);
                        }
                        // Check if user exists in PostgreSQL users table
                        const userCheck = await query(`SELECT id FROM users WHERE id = $1`, [uid]);
                        if (userCheck.rows.length === 0) {
                            await query(`INSERT INTO users (id, email, name, role)
                 VALUES ($1, $2, $3, 'USER')
                 ON CONFLICT (id) DO NOTHING`, [uid, req.user?.email || `user_${uid}@system.local`, req.user?.name || `User_${uid}`]);
                        }
                        // Check if membership exists in PostgreSQL, if not, auto-create it
                        const membCheck = await query(`SELECT role FROM memberships WHERE company_id = $1 AND user_id = $2`, [fc.id, uid]);
                        if (membCheck.rows.length === 0) {
                            console.log(`[Companies Sync] Auto-creating membership for user ${uid} in company ${fc.id}`);
                            let role = 'MEMBER';
                            if (fc.id === `cmp_${uid}`) {
                                role = 'OWNER';
                            }
                            else {
                                try {
                                    const subDoc = await admin.firestore().collection('company_subscriptions').doc(fc.id).get();
                                    if (subDoc.exists && subDoc.data()?.ownerUserId === uid) {
                                        role = 'OWNER';
                                    }
                                }
                                catch (subErr) {
                                    console.error('[Companies Sync] Failed to check company subscription owner:', subErr);
                                }
                            }
                            await query(`INSERT INTO memberships (company_id, user_id, role, status)
                 VALUES ($1, $2, $3, 'ACTIVE')
                 ON CONFLICT (company_id, user_id) DO NOTHING`, [fc.id, uid, role]);
                        }
                    }
                }
            }
        }
        catch (syncErr) {
            console.error('[Companies Sync] Best-effort Firestore company sync failed:', syncErr);
        }
        let result = await query(`SELECT c.*, m.role as user_role, m.status as user_status
       FROM companies c
       JOIN memberships m ON c.id = m.company_id
       WHERE m.user_id = $1`, [uid]);
        // If companies exist but any has 0 accounts, trigger automatic user snapshot migration from Firestore
        if (result.rows.length > 0) {
            let needsMigration = false;
            const companiesWithZeroAccounts = [];
            for (const comp of result.rows) {
                const accCountResult = await query(`SELECT COUNT(*) FROM accounts WHERE company_id = $1`, [comp.id]);
                if (Number(accCountResult.rows[0].count) === 0) {
                    companiesWithZeroAccounts.push(comp.id);
                }
            }
            if (companiesWithZeroAccounts.length > 0) {
                try {
                    const db = admin.firestore();
                    const snapshotsRef = db.collection('users').doc(uid).collection('workspace_sync_snapshots');
                    let hasSnapshot = false;
                    for (const companyId of companiesWithZeroAccounts) {
                        const docSnap = await snapshotsRef.doc(companyId).get();
                        if (docSnap.exists) {
                            hasSnapshot = true;
                            break;
                        }
                    }
                    if (hasSnapshot) {
                        needsMigration = true;
                    }
                }
                catch (checkErr) {
                    console.error('[Backend] Failed to check for company snapshot existence in Firestore:', checkErr);
                }
            }
            if (needsMigration) {
                try {
                    console.log(`[Backend] Company detected with 0 accounts and existing snapshot. Running automatic migration for user ${uid}...`);
                    const migratedCount = await migrateUserFirestoreData(uid);
                    if (migratedCount > 0) {
                        // Re-query to get updated data
                        result = await query(`SELECT c.*, m.role as user_role, m.status as user_status
               FROM companies c
               JOIN memberships m ON c.id = m.company_id
               WHERE m.user_id = $1`, [uid]);
                    }
                }
                catch (migErr) {
                    console.error('[Backend] Automatic migration failed:', migErr);
                }
            }
        }
        else {
            // User has 0 companies! Try migrating from Firestore snapshots first
            let migratedCount = 0;
            try {
                console.log(`[Backend] User ${uid} has 0 companies. Running automatic migration from Firestore...`);
                migratedCount = await migrateUserFirestoreData(uid);
            }
            catch (migErr) {
                console.error('[Backend] Best-effort automatic Firestore migration failed:', migErr);
            }
            try {
                if (migratedCount > 0) {
                    result = await query(`SELECT c.*, m.role as user_role, m.status as user_status
             FROM companies c
             JOIN memberships m ON c.id = m.company_id
             WHERE m.user_id = $1`, [uid]);
                }
                else {
                    // If no snapshots found (or migration failed), auto-create default company and membership!
                    console.log(`[Backend] Auto-creating default company for user ${uid}...`);
                    const newCompanyId = `cmp_${uid}`;
                    const newCompanyName = 'My Company';
                    await query(`INSERT INTO companies (id, name, settings)
             VALUES ($1, $2, '{}'::jsonb)
             ON CONFLICT (id) DO NOTHING`, [newCompanyId, newCompanyName]);
                    await query(`INSERT INTO users (id, email, name, role)
             VALUES ($1, $2, $3, 'ADMIN')
             ON CONFLICT (id) DO UPDATE
             SET email = EXCLUDED.email, name = COALESCE(users.name, EXCLUDED.name), role = COALESCE(users.role, EXCLUDED.role)`, [uid, req.user?.email || `user_${uid}@system.local`, req.user?.name || `User_${uid}`]);
                    await query(`INSERT INTO memberships (company_id, user_id, role, status)
             VALUES ($1, $2, 'OWNER', 'ACTIVE')
             ON CONFLICT (company_id, user_id) DO NOTHING`, [newCompanyId, uid]);
                    result = await query(`SELECT c.*, m.role as user_role, m.status as user_status
             FROM companies c
             JOIN memberships m ON c.id = m.company_id
             WHERE m.user_id = $1`, [uid]);
                }
            }
            catch (err) {
                console.error('[Backend] Automatic first-time migration/seeding failed:', err);
                return res.status(500).json({ error: `Failed to initialize company: ${err.message}` });
            }
        }
        // Fetch user's workspace subscription from Firestore to override company subscription settings dynamically
        let wsSubscription = null;
        try {
            const db = admin.firestore();
            const wsDoc = await db.collection('workspace_subscriptions').doc(uid).get();
            if (wsDoc.exists) {
                wsSubscription = wsDoc.data();
            }
        }
        catch (wsErr) {
            console.error('[Companies GET] Failed to fetch workspace subscription:', wsErr);
        }
        const mappedRows = result.rows.map((row) => {
            const settings = row.settings || {};
            const isWorkspaceActive = wsSubscription && wsSubscription.status === 'ACTIVE';
            let status = settings.subscriptionStatus || 'TRIAL';
            let plan = settings.subscriptionPlan || 'TRIAL';
            let endsAt = settings.subscriptionEndsAt;
            let trialEnds = settings.trialEndsAt;
            if (isWorkspaceActive) {
                status = 'ACTIVE';
                plan = wsSubscription.plan || 'BASIC';
                endsAt = wsSubscription.expiresAt;
            }
            else if (wsSubscription && (wsSubscription.status === 'TRIAL' || wsSubscription.status === 'EXPIRED')) {
                status = wsSubscription.status;
                plan = wsSubscription.plan;
                trialEnds = wsSubscription.expiresAt || trialEnds;
            }
            return {
                id: row.id,
                name: row.name,
                taxNumber: row.tax_number || settings.taxNumber || undefined,
                address: row.address || settings.address || undefined,
                phone: row.phone || settings.phone || undefined,
                logoUrl: row.logo_url || settings.logoUrl || undefined,
                baseCurrency: row.base_currency || settings.baseCurrency || 'ILS',
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : settings.createdAt,
                // Flatten subscription fields overridden by workspace subscription
                trialEndsAt: trialEnds,
                subscriptionStatus: status,
                subscriptionPlan: plan,
                subscriptionStartsAt: settings.subscriptionStartsAt || undefined,
                subscriptionEndsAt: endsAt,
                graceDays: settings.graceDays !== undefined ? Number(settings.graceDays) : undefined,
                activationCode: settings.activationCode || undefined,
                settings,
                userRole: row.user_role,
                userStatus: row.user_status
            };
        });
        res.json(mappedRows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create new company
router.post('/', async (req, res) => {
    const uid = req.user?.uid;
    const { id, name, taxNumber, address, phone, logoUrl, baseCurrency, settings } = req.body;
    if (!id || !name) {
        return res.status(400).json({ error: 'Company ID and Name are required' });
    }
    const client = await getClient();
    try {
        // 0. Verify subscription limits
        const countRes = await client.query(`SELECT COUNT(*) FROM memberships WHERE user_id = $1`, [uid]);
        const currentCount = Number(countRes.rows[0].count);
        let maxCompanies = 3; // Default trial limit
        try {
            const db = admin.firestore();
            const wsDoc = await db.collection('workspace_subscriptions').doc(uid).get();
            if (wsDoc.exists) {
                const wsData = wsDoc.data() || {};
                if (wsData.unlimitedCompanies === true) {
                    maxCompanies = Infinity;
                }
                else {
                    const included = Number(wsData.includedCompanies) || 1;
                    const extra = Number(wsData.extraCompanyCount) || 0;
                    const max = Number(wsData.maxCompanies) || 0;
                    maxCompanies = Math.max(included, Math.max(max, included + extra));
                }
            }
        }
        catch (wsErr) {
            console.error('[Companies Create] Failed to fetch workspace subscription:', wsErr);
        }
        if (currentCount >= maxCompanies) {
            client.release();
            return res.status(403).json({
                error: `Subscription limit reached. You are allowed up to ${maxCompanies} companies, but you already have ${currentCount}.`
            });
        }
        await client.query('BEGIN');
        // 1. Prepare settings with default unmapped collections (units, itemGroups, departments)
        const initialUnits = [
            { id: 'u_pc', name: 'قطعة', code: 'PCS' },
            { id: 'u_box', name: 'علبة', code: 'BOX' },
            { id: 'u_ctn', name: 'كرتون', code: 'CTN' },
            { id: 'u_kg', name: 'كيلو', code: 'KG' },
            { id: 'u_m', name: 'متر', code: 'M' },
            { id: 'u_cup', name: 'كوب', code: 'CUP' }
        ];
        const defaultItemGroups = [
            { id: 'ig_electronics', name: 'إلكترونيات', icon: '📱' },
            { id: 'ig_furniture', name: 'أثاث مكتبي', icon: '🪑' },
            { id: 'ig_other', name: 'أخرى', icon: '📦' }
        ];
        const defaultDepartments = [
            { id: 'dept_admin', name: 'الإدارة والمالية' },
            { id: 'dept_sales', name: 'المبيعات' },
            { id: 'dept_prod', name: 'المستودعات' }
        ];
        const mergedSettings = {
            units: initialUnits,
            itemGroups: defaultItemGroups,
            departments: defaultDepartments,
            ...(settings || {})
        };
        // 2. Create company
        await client.query(`INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, tax_number = EXCLUDED.tax_number, address = EXCLUDED.address,
           phone = EXCLUDED.phone, logo_url = EXCLUDED.logo_url, settings = EXCLUDED.settings
       RETURNING *`, [
            id,
            name,
            taxNumber || null,
            address || null,
            phone || null,
            logoUrl || null,
            baseCurrency || 'ILS',
            JSON.stringify(mergedSettings)
        ]);
        // 3. Create owner membership
        await client.query(`INSERT INTO memberships (company_id, user_id, role, status)
       VALUES ($1, $2, 'OWNER', 'ACTIVE')
       ON CONFLICT (company_id, user_id) DO NOTHING`, [id, uid]);
        // 4. Seed default databases (Currencies, Warehouse, Chart of Accounts)
        await seedNewCompany(client, id, baseCurrency || 'ILS');
        await client.query('COMMIT');
        res.status(201).json({ ok: true, companyId: id });
    }
    catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    }
    finally {
        client.release();
    }
});
router.put('/:companyId', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    const uid = req.user?.uid;
    const { name, taxNumber, address, phone, logoUrl, baseCurrency, settings } = req.body;
    try {
        let mergedSettings = null;
        if (settings) {
            const existingRes = await query(`SELECT settings FROM companies WHERE id = $1`, [companyId]);
            const existingSettings = existingRes.rows[0]?.settings || {};
            mergedSettings = {
                ...existingSettings,
                ...settings
            };
        }
        const result = await query(`UPDATE companies
       SET name = COALESCE($1, name),
           tax_number = COALESCE($2, tax_number),
           address = COALESCE($3, address),
           phone = COALESCE($4, phone),
           logo_url = COALESCE($5, logo_url),
           base_currency = COALESCE($6, base_currency),
           settings = COALESCE($7, settings)
       WHERE id = $8
       RETURNING *`, [
            name !== undefined ? name : null,
            taxNumber !== undefined ? taxNumber : null,
            address !== undefined ? address : null,
            phone !== undefined ? phone : null,
            logoUrl !== undefined ? logoUrl : null,
            baseCurrency !== undefined ? baseCurrency : null,
            mergedSettings ? JSON.stringify(mergedSettings) : (settings !== undefined ? '{}' : null),
            companyId
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        const row = result.rows[0];
        const dbSettings = row.settings || {};
        // Fetch workspace subscription to override company subscription settings dynamically
        let wsSubscription = null;
        try {
            const db = admin.firestore();
            const wsDoc = await db.collection('workspace_subscriptions').doc(uid).get();
            if (wsDoc.exists) {
                wsSubscription = wsDoc.data();
            }
        }
        catch (wsErr) {
            console.error('[Companies PUT] Failed to fetch workspace subscription:', wsErr);
        }
        const isWorkspaceActive = wsSubscription && wsSubscription.status === 'ACTIVE';
        let status = dbSettings.subscriptionStatus || 'TRIAL';
        let plan = dbSettings.subscriptionPlan || 'TRIAL';
        let endsAt = dbSettings.subscriptionEndsAt;
        let trialEnds = dbSettings.trialEndsAt;
        if (isWorkspaceActive) {
            status = 'ACTIVE';
            plan = wsSubscription.plan || 'BASIC';
            endsAt = wsSubscription.expiresAt;
        }
        else if (wsSubscription && (wsSubscription.status === 'TRIAL' || wsSubscription.status === 'EXPIRED')) {
            status = wsSubscription.status;
            plan = wsSubscription.plan;
            trialEnds = wsSubscription.expiresAt || trialEnds;
        }
        const mappedCompany = {
            id: row.id,
            name: row.name,
            taxNumber: row.tax_number || dbSettings.taxNumber || undefined,
            address: row.address || dbSettings.address || undefined,
            phone: row.phone || dbSettings.phone || undefined,
            logoUrl: row.logo_url || dbSettings.logoUrl || undefined,
            baseCurrency: row.base_currency || dbSettings.baseCurrency || 'ILS',
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : dbSettings.createdAt,
            // Flatten subscription fields from settings JSONB
            trialEndsAt: trialEnds,
            subscriptionStatus: status,
            subscriptionPlan: plan,
            subscriptionStartsAt: dbSettings.subscriptionStartsAt || undefined,
            subscriptionEndsAt: endsAt,
            graceDays: dbSettings.graceDays !== undefined ? Number(dbSettings.graceDays) : undefined,
            activationCode: dbSettings.activationCode || undefined,
            settings: dbSettings
        };
        res.json({ ok: true, company: mappedCompany });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Delete company
router.delete('/:companyId', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    const uid = req.user?.uid;
    const userMembership = req.membership;
    if (!userMembership || userMembership.role !== 'OWNER') {
        return res.status(403).json({ error: 'Only the company owner can delete the company' });
    }
    try {
        // Ensure tracking table exists
        await query(`
      CREATE TABLE IF NOT EXISTS deleted_companies (
        id VARCHAR(50) PRIMARY KEY,
        deleted_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        const deleteResult = await query(`DELETE FROM companies WHERE id = $1 RETURNING id`, [companyId]);
        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        // Record this company as deleted so it won't be re-created from Firestore sync
        await query(`INSERT INTO deleted_companies (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [companyId]);
        // Remove company from the user's Firestore companies array so it doesn't sync back
        try {
            const db = admin.firestore();
            const userDocRef = db.collection('users').doc(uid);
            const userDoc = await userDocRef.get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const firestoreCompanies = userData?.companies || [];
                const updatedCompanies = firestoreCompanies.filter((fc) => fc.id !== companyId);
                await userDocRef.update({ companies: updatedCompanies });
                console.log(`[Companies Delete] Removed company ${companyId} from Firestore user document`);
            }
            // Also remove Firestore workspace snapshot and subscription docs
            await Promise.allSettled([
                db.collection('company_subscriptions').doc(companyId).delete(),
                db.collection(`users/${uid}/workspace_sync_snapshots`).doc(companyId).delete()
            ]);
        }
        catch (fsErr) {
            console.warn(`[Companies Delete] Non-fatal: Could not clean Firestore for company ${companyId}:`, fsErr.message);
        }
        res.json({ ok: true, message: 'Company deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Clear all company data (wipe) – keeps the company record & memberships intact
router.post('/:companyId/clear', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    const userMembership = req.membership;
    if (!userMembership || (userMembership.role !== 'OWNER' && userMembership.role !== 'ADMIN')) {
        return res.status(403).json({ error: 'Only the company owner or admin can wipe company data' });
    }
    const client = await getClient();
    try {
        await client.query('BEGIN');
        // Delete in correct order to respect foreign-key constraints
        // 1. Audit logs
        await client.query('DELETE FROM audit_logs WHERE company_id = $1', [companyId]);
        // 2. Checks
        await client.query('DELETE FROM checks WHERE company_id = $1', [companyId]);
        // 3. Invoice settlements
        await client.query('DELETE FROM invoice_settlements WHERE company_id = $1', [companyId]);
        // 4. Invoice items (cascade from invoices), but delete invoice_items first to avoid FK issues
        await client.query('DELETE FROM invoice_items WHERE company_id = $1', [companyId]);
        // 5. Invoices
        await client.query('DELETE FROM invoices WHERE company_id = $1', [companyId]);
        // 6. Journal lines (cascade from journal_entries)
        await client.query('DELETE FROM journal_lines WHERE company_id = $1', [companyId]);
        // 7. Journal entries
        await client.query('DELETE FROM journal_entries WHERE company_id = $1', [companyId]);
        // 8. Stock transfer items (cascade from stock_transfers)
        await client.query('DELETE FROM stock_transfer_items WHERE company_id = $1', [companyId]);
        // 9. Stock transfers
        await client.query('DELETE FROM stock_transfers WHERE company_id = $1', [companyId]);
        // 10. Product warehouse stock
        await client.query('DELETE FROM product_warehouse_stock WHERE company_id = $1', [companyId]);
        // 11. Products
        await client.query('DELETE FROM products WHERE company_id = $1', [companyId]);
        // 12. Warehouses
        await client.query('DELETE FROM warehouses WHERE company_id = $1', [companyId]);
        // 13. Employee sub-tables
        await client.query('DELETE FROM employee_recurring_deductions WHERE company_id = $1', [companyId]);
        await client.query('DELETE FROM employee_leave_requests WHERE company_id = $1', [companyId]);
        await client.query('DELETE FROM employee_contracts WHERE company_id = $1', [companyId]);
        // 14. Employees
        await client.query('DELETE FROM employees WHERE company_id = $1', [companyId]);
        // 15. Fixed assets
        await client.query('DELETE FROM fixed_assets WHERE company_id = $1', [companyId]);
        // 16. Fixed asset groups
        await client.query('DELETE FROM fixed_asset_groups WHERE company_id = $1', [companyId]);
        // 17. Contacts (after journal/invoice references cleared)
        await client.query('DELETE FROM contacts WHERE company_id = $1', [companyId]);
        // 18. Accounts
        await client.query('DELETE FROM accounts WHERE company_id = $1', [companyId]);
        // 19. Currencies
        await client.query('DELETE FROM currencies WHERE company_id = $1', [companyId]);
        await client.query('COMMIT');
        console.log(`[Companies] Wiped all data for company ${companyId}`);
        res.json({ ok: true, message: 'All company data wiped successfully' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Companies] Wipe transaction failed:', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        client.release();
    }
});
export default router;
