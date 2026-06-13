const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'smart-account-cc181' });
const db = admin.firestore();

async function fixUser(uid) {
  const docRef = db.doc(`users/${uid}`);
  const snap = await docRef.get();
  if (!snap.exists) return console.log('User not found:', uid);
  
  let data = snap.data();
  if (data.companies && Array.isArray(data.companies)) {
    let updated = false;
    data.companies = data.companies.map(c => {
      if (c.id === `cmp_${uid}`) {
        c.id = 'cmp_default';
        updated = true;
      }
      return c;
    });
    if (updated) {
      await docRef.update({ companies: data.companies });
      console.log(`Fixed user ${uid}`);
    } else {
      console.log(`No fix needed for user ${uid}`);
    }
  }
}

async function run() {
  await fixUser('IcWiXkjYgWRyxlMlEvVmR4CdeHB3');
  await fixUser('u9ufZgGvXFO3JfBHwgIdaPUCqcI3');
  process.exit(0);
}
run();
