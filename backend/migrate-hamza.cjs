const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'smart-account-cc181' });
}

const db = admin.firestore();

async function migrateUser(userId) {
  const oldPath = db.doc(`users/${userId}/companies/cmp_default`);
  const newPath = db.doc(`users/${userId}/companies/cmp_${userId}`);
  
  const collections = ['accounts', 'transactions', 'invoices', 'receipts', 'checks', 'items', 'item_groups', 'safes', 'banks', 'employees', 'payrolls'];
  
  for (const collName of collections) {
    const oldColl = await oldPath.collection(collName).get();
    if (oldColl.empty) {
        console.log(`No data in ${collName}`);
        continue;
    }
    
    console.log(`Migrating ${oldColl.size} docs from ${collName}...`);
    const batch = db.batch();
    oldColl.docs.forEach(doc => {
      batch.set(newPath.collection(collName).doc(doc.id), doc.data());
    });
    await batch.commit();
    console.log(`Successfully migrated ${collName}`);
  }
}

migrateUser('IcWiXkjYgWRyxlMlEvVmR4CdeHB3').then(() => {
    console.log('Done');
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
