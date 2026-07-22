import { query } from '../src/config/db.js';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { getFirebaseAdmin } from '../src/config/firebase.js';

// Initialize Firebase
getFirebaseAdmin();

async function main() {
  try {
    console.log('Starting account codes generation migration...');
    const usersRes = await query('SELECT id, email, account_code FROM users');
    
    console.log(`Found ${usersRes.rows.length} users.`);
    
    let updatedCount = 0;
    for (const user of usersRes.rows) {
      let accountCode = user.account_code;
      
      const email = user.email || '';
      
      if (!accountCode) {
        const codeMatch = email.match(/^code_([a-zA-Z0-9_.-]+)@smart\.local$/);
      if (codeMatch) {
        accountCode = codeMatch[1];
      } else {
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
          console.error(`Failed to generate a unique account code for user ${user.id}`);
          continue;
        }
      }
    }

      // Sync to Firestore
      try {
        const db = admin.firestore();
        await db.collection('account_codes').doc(accountCode).set({ email });
      } catch (err) {
        console.error(`Failed to sync account code to Firestore for user ${user.id}:`, err);
      }

      // Update Postgres
      await query('UPDATE users SET account_code = $1 WHERE id = $2', [accountCode, user.id]);
      updatedCount++;
      console.log(`Assigned code ${accountCode} to user ${user.id} (${email})`);
    }

    console.log(`Migration completed successfully. Updated ${updatedCount} users.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
