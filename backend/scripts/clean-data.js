import pg from 'pg';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'smart-account-cc181'
  });
  console.log('[Firebase Admin] Initialized successfully.');
}

const db = admin.firestore();

// Setup PostgreSQL client
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const DRY_RUN = process.argv.includes('--execute') ? false : true;

async function main() {
  console.log(`\n================ DATA CLEANUP START (DRY_RUN = ${DRY_RUN}) ================`);
  
  await client.connect();
  console.log('Connected to PostgreSQL database.');

  // 1. Fetch all Firestore company_subscriptions to determine the true owners
  console.log('\n--- FETCHING TRUE OWNERS FROM FIRESTORE (company_subscriptions) ---');
  const subsSnapshot = await db.collection('company_subscriptions').get();
  const companyOwnerMap = new Map();

  subsSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.ownerUserId) {
      companyOwnerMap.set(docSnap.id, data.ownerUserId);
      console.log(`Company: ${docSnap.id} => Owner: ${data.ownerUserId} (from subscription)`);
    }
  });

  // 2. Fetch all users from PostgreSQL to check default companies
  const usersRes = await client.query('SELECT id, email, name FROM users');
  const allUserIds = new Set(usersRes.rows.map(r => r.id));
  console.log(`\nLoaded ${allUserIds.size} users from PostgreSQL.`);

  // Auto-map companies of type cmp_{userId} to the corresponding userId
  for (const userId of allUserIds) {
    const defaultCompanyId = `cmp_${userId}`;
    if (!companyOwnerMap.has(defaultCompanyId)) {
      companyOwnerMap.set(defaultCompanyId, userId);
      console.log(`Company: ${defaultCompanyId} => Owner: ${userId} (inferred default company)`);
    }
  }

  // 3. Inspect PostgreSQL memberships
  console.log('\n--- ANALYZING POSTGRESQL MEMBERSHIPS ---');
  const membershipsRes = await client.query('SELECT id, company_id, user_id, role, status FROM memberships');
  const membershipsToDelete = [];
  const membershipsToKeep = [];

  for (const row of membershipsRes.rows) {
    const { id, company_id, user_id, role } = row;
    const trueOwner = companyOwnerMap.get(company_id);

    let isCorrect = false;
    if (trueOwner === user_id) {
      isCorrect = true;
    } else if (company_id === `cmp_${user_id}`) {
      isCorrect = true;
    }

    if (isCorrect) {
      membershipsToKeep.push(row);
    } else {
      membershipsToDelete.push(row);
    }
  }

  console.log(`\nFound ${membershipsToKeep.length} correct memberships.`);
  console.log(`Found ${membershipsToDelete.length} INCORRECT memberships to delete:`);
  membershipsToDelete.forEach(m => {
    console.log(`  - Delete Membership ID ${m.id}: User ${m.user_id} in Company ${m.company_id} (Role: ${m.role})`);
  });

  // 4. Inspect Firestore user companies lists
  console.log('\n--- ANALYZING FIRESTORE USER COMPANIES ---');
  const usersSnapshot = await db.collection('users').get();
  const firestoreUpdates = [];

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    const rawCompanies = userData.companies || [];

    if (!Array.isArray(rawCompanies)) continue;

    const cleanedCompanies = rawCompanies.filter(c => {
      if (!c.id) return false;
      const trueOwner = companyOwnerMap.get(c.id);
      return trueOwner === userId || c.id === `cmp_${userId}`;
    });

    if (cleanedCompanies.length !== rawCompanies.length) {
      console.log(`User ${userId} (${userData.email || 'no email'}):`);
      console.log(`  Current companies:`, rawCompanies.map(c => c.id));
      console.log(`  Cleaned companies:`, cleanedCompanies.map(c => c.id));
      firestoreUpdates.push({
        ref: userDoc.ref,
        userId,
        oldList: rawCompanies,
        newList: cleanedCompanies
      });
    }
  }

  // 5. Execute changes if requested
  if (!DRY_RUN) {
    console.log('\n--- EXECUTION: APPLYING CLEANUP ---');

    // Start PG Transaction
    await client.query('BEGIN');

    // Delete incorrect memberships
    if (membershipsToDelete.length > 0) {
      const deleteIds = membershipsToDelete.map(m => m.id);
      await client.query('DELETE FROM memberships WHERE id = ANY($1)', [deleteIds]);
      console.log(`[PG] Deleted ${membershipsToDelete.length} incorrect memberships.`);
    }

    await client.query('COMMIT');
    console.log('[PG] Committed transaction successfully.');

    // Update Firestore User Profiles
    for (const update of firestoreUpdates) {
      await update.ref.update({ companies: update.newList });
      console.log(`[Firestore] Cleaned company list for User ${update.userId}`);
    }

    console.log('\nCleanup completed successfully!');
  } else {
    console.log('\n--- DRY RUN COMPLETED ---');
    console.log('To execute the clean up, run this script with the --execute flag:');
    console.log('  node scripts/clean-data.js --execute');
  }

  await client.end();
}

main().catch(async (err) => {
  console.error('Error during cleanup:', err);
  try {
    await client.query('ROLLBACK');
  } catch {}
  await client.end();
});
