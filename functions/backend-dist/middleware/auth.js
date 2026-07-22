import admin from 'firebase-admin';
import { query } from '../config/db.js';
import { upsertUser } from '../utils/user-helpers.js';
// Initialize Firebase Admin SDK
// Firebase Admin needs credentials. If running in Google Cloud, it initializes automatically.
// Otherwise, it relies on GOOGLE_APPLICATION_CREDENTIALS environment variable or default configuration.
if (admin.apps.length === 0) {
    try {
        admin.initializeApp();
        console.log('[Firebase Admin] Connected successfully.');
    }
    catch (error) {
        console.warn('[Firebase Admin] Initialization warning: Ensure correct environment variables are set for Firebase Admin. Using credentials-free setup.');
        admin.initializeApp({
            projectId: process.env.VITE_FIREBASE_PROJECT_ID
        });
    }
}
export const authenticateUser = async (req, res, next) => {
    // Local bypass for testing without service accounts (ONLY in local development/emulator)
    const isLocalEnv = process.env.FUNCTIONS_EMULATOR === 'true' ||
        (!process.env.FIREBASE_CONFIG && process.env.NODE_ENV !== 'production');
    // Cleanup bypass for superuser script execution
    const secretHeader = req.headers['x-cleanup-secret'];
    const expectedSecret = 'a1f1ex_cleanup_secret_20260619_sec';
    if (secretHeader === expectedSecret) {
        const uid = 'cleanup_superuser';
        const email = 'hamza.mm.aa.ss@gmail.com';
        const name = 'Cleanup Superuser';
        try {
            await upsertUser(uid, email, name, 'ADMIN');
        }
        catch (dbErr) {
            console.error('[Auth Middleware] Failed to upsert cleanup superuser:', dbErr);
        }
        req.user = { uid, email, name };
        return next();
    }
    if (process.env.BYPASS_AUTH === 'true' && isLocalEnv) {
        const uid = 'dev_user_1';
        const email = 'developer@system.local';
        const name = 'Developer User';
        await upsertUser(uid, email, name, 'USER');
        req.user = { uid, email, name };
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        // Check if user exists in the local database, if not, upsert them
        const email = decodedToken.email || '';
        const uid = decodedToken.uid;
        const name = decodedToken.name || email.split('@')[0];
        const picture = decodedToken.picture || '';
        const role = 'USER';
        try {
            await upsertUser(uid, email, name, role, picture);
        }
        catch (dbErr) {
            if (dbErr.code === '23505' && (dbErr.constraint === 'users_email_key' || String(dbErr.message).includes('users_email_key'))) {
                console.log(`[Auth Middleware] Email conflict detected for ${email}. Checking if old user exists in Firebase Auth...`);
                const existingRes = await query('SELECT id FROM users WHERE email = $1', [email]);
                if (existingRes.rows.length > 0) {
                    const oldUid = existingRes.rows[0].id;
                    try {
                        await admin.auth().getUser(oldUid);
                        console.warn(`[Auth Middleware] Old UID ${oldUid} still exists in Firebase Auth. Cannot auto-resolve email conflict safely.`);
                        throw dbErr;
                    }
                    catch (authErr) {
                        if (authErr.code === 'auth/user-not-found') {
                            console.log(`[Auth Middleware] Old UID ${oldUid} not found in Firebase Auth. Deleting orphaned PG user...`);
                            await query('DELETE FROM users WHERE id = $1', [oldUid]);
                            // Retry the insert
                            await upsertUser(uid, email, name, role, picture);
                        }
                        else {
                            throw authErr;
                        }
                    }
                }
                else {
                    throw dbErr;
                }
            }
            else {
                throw dbErr;
            }
        }
        req.user = {
            uid,
            email,
            name,
            picture
        };
        next();
    }
    catch (error) {
        console.error('[Auth Middleware] Verification failed:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token', details: error.message });
    }
};
// Check if user has membership in the requested company
export const verifyCompanyMembership = async (req, res, next) => {
    const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
    const uid = req.user?.uid;
    if (!companyId) {
        return res.status(400).json({ error: 'Bad Request: Missing companyId' });
    }
    if (companyId === 'cmp_default') {
        return res.status(400).json({ error: 'Bad Request: Default company is not supported on the backend' });
    }
    if (!uid) {
        return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
    }
    try {
        let result = await query(`SELECT role, status, permissions FROM memberships WHERE company_id = $1 AND user_id = $2`, [companyId, uid]);
        if (result.rows.length === 0) {
            // If we want to allow auto-creation of a personal company if it doesn't exist:
            if (companyId === `cmp_${uid}`) {
                console.log(`[Auth Middleware] Auto-creating personal company ${companyId} for user ${uid}`);
                await query(`INSERT INTO companies (id, name, base_currency)
           VALUES ($1, $2, 'ILS')
           ON CONFLICT (id) DO NOTHING`, [companyId, req.user?.name ? `شركة ${req.user.name}` : 'شركة غير مسمى']);
                await upsertUser(uid, req.user?.email || `user_${uid}@system.local`, req.user?.name || `User_${uid}`, 'USER');
                await query(`INSERT INTO memberships (company_id, user_id, role, status)
           VALUES ($1, $2, 'OWNER', 'ACTIVE')
           ON CONFLICT (company_id, user_id) DO NOTHING`, [companyId, uid]);
                result = await query(`SELECT role, status, permissions FROM memberships WHERE company_id = $1 AND user_id = $2`, [companyId, uid]);
            }
            else {
                return res.status(403).json({ error: 'Forbidden: You are not a member of this company' });
            }
        }
        const membership = result.rows[0];
        if (membership.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Forbidden: Your membership is inactive' });
        }
        // Set permissions/role on the request object for down-stream route access control if needed
        req.membership = membership;
        next();
    }
    catch (error) {
        console.error('[Membership Middleware] Failed:', error);
        return res.status(500).json({ error: 'Internal server error verifying company membership' });
    }
};
