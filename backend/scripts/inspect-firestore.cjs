const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'smart-account-cc181' });
}

const db = admin.firestore();

async function inspect(userId) {
  console.log(`\n================ Inspecting User: ${userId} ================`);
  const userDoc = await db.doc(`users/${userId}`).get();
  if (!userDoc.exists) {
    console.log('User document does not exist.');
    return;
  }
  console.log('User Data:', JSON.stringify(userDoc.data(), null, 2));

  // Check the companies subcollection
  const companiesSnap = await db.collection(`users/${userId}/companies`).get();
  console.log(`Found ${companiesSnap.size} company documents in Firestore:`);
  
  for (const doc of companiesSnap.docs) {
    console.log(`- Company Doc ID: ${doc.id}`);
    const data = doc.data();
    console.log('  Company Fields:', Object.keys(data));
    if (data.settings) {
      console.log('  Settings Keys:', Object.keys(data.settings));
      if (data.settings.safes) {
        console.log(`  Settings Safes Count: ${data.settings.safes.length}`);
        console.log('  Settings Safes:', JSON.stringify(data.settings.safes, null, 2));
      }
      if (data.settings.banks) {
        console.log(`  Settings Banks Count: ${data.settings.banks.length}`);
        console.log('  Settings Banks:', JSON.stringify(data.settings.banks, null, 2));
      }
    }
    
    // Check if there are subcollections under this company
    // Firestore admin SDK listCollections() can retrieve subcollections of a document
    const collections = await doc.ref.listCollections();
    console.log(`  Subcollections found under ${doc.id}:`, collections.map(c => c.id));
    for (const coll of collections) {
      const snap = await coll.get();
      console.log(`    Subcollection '${coll.id}' has ${snap.size} documents.`);
      if (['safes', 'banks', 'settings'].includes(coll.id)) {
        snap.docs.forEach(d => {
          console.log(`      Doc ID: ${d.id} =>`, JSON.stringify(d.data(), null, 2));
        });
      }
    }
  }
}

async function run() {
  await inspect('IcWiXkjYgWRyxlMlEvVmR4CdeHB3');
  await inspect('u9ufZgGvXFO3JfBHwgIdaPUCqcI3');
  process.exit(0);
}

run().catch(console.error);
