import { query as globalQuery } from '../config/db.js';
import admin from 'firebase-admin';
export async function upsertUser(uid, email, name, role = 'USER', picture, subscription, client) {
    const query = client ? client.query.bind(client) : globalQuery;
    // Check if user exists
    const existingRes = await query('SELECT account_code FROM users WHERE id = $1', [uid]);
    let accountCode = existingRes.rows[0]?.account_code;
    if (!accountCode) {
        // Check if the email itself is a code email
        const codeMatch = email ? email.match(/^code_([a-zA-Z0-9_.-]+)@smart\.local$/) : null;
        if (codeMatch) {
            accountCode = codeMatch[1];
        }
        else {
            // Generate a new 6-digit account code
            let isUnique = false;
            let attempts = 0;
            while (!isUnique && attempts < 10) {
                accountCode = Math.floor(100000 + Math.random() * 900000).toString();
                const codeCheck = await query('SELECT id FROM users WHERE account_code = $1', [accountCode]);
                if (codeCheck.rows.length === 0) {
                    isUnique = true;
                }
                attempts++;
            }
            if (!isUnique) {
                throw new Error('Failed to generate a unique account code');
            }
        }
        // Save to Firestore so the login page can use it
        if (email) {
            try {
                const db = admin.firestore();
                await db.collection('account_codes').doc(accountCode).set({ email });
            }
            catch (err) {
                console.error('[User Helpers] Failed to sync account code to Firestore:', err);
            }
        }
    }
    // Upsert user in Postgres
    if (subscription) {
        await query(`INSERT INTO users (id, email, name, role, picture, account_code, subscription)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, 
           name = COALESCE(users.name, EXCLUDED.name), 
           role = EXCLUDED.role, 
           picture = COALESCE(users.picture, EXCLUDED.picture),
           account_code = COALESCE(users.account_code, EXCLUDED.account_code),
           subscription = COALESCE(users.subscription, EXCLUDED.subscription)`, [uid, email || '', name || '', role, picture || null, accountCode, typeof subscription === 'string' ? subscription : JSON.stringify(subscription)]);
    }
    else {
        await query(`INSERT INTO users (id, email, name, role, picture, account_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, 
           name = COALESCE(users.name, EXCLUDED.name), 
           role = EXCLUDED.role, 
           picture = COALESCE(users.picture, EXCLUDED.picture),
           account_code = COALESCE(users.account_code, EXCLUDED.account_code)`, [uid, email || '', name || '', role, picture || null, accountCode]);
    }
    return { accountCode };
}
