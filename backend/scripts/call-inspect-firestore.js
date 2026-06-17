async function run() {
  const userId = 'IcWiXkjYgWRyxlMlEvVmR4CdeHB3';
  const companies = ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_default'];
  const collections = ['accounts', 'safes', 'banks'];

  for (const companyId of companies) {
    for (const collectionName of collections) {
      console.log(`\n=== Calling inspectFirestoreAccounts for User: ${userId}, Company: ${companyId}, Collection: ${collectionName} ===`);
      
      const url = `https://us-central1-smart-account-cc181.cloudfunctions.net/inspectFirestoreAccounts?userId=${userId}&companyId=${companyId}&collectionName=${collectionName}`;
      try {
        const res = await fetch(url);
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Count:', data.count);
        if (data.count > 0) {
          const cashAccs = data.docs.filter(d => d.id.includes('cash') || d.id.includes('bank'));
          console.log('Cash/Bank Docs in Firestore:', JSON.stringify(cashAccs, null, 2));
        }
      } catch (e) {
        console.error('Failed to fetch:', e.message);
      }
    }
  }
}

run();
