async function run() {
  console.log('=== Calling searchAllFirestoreAccounts ===');
  const url = 'https://us-central1-smart-account-cc181.cloudfunctions.net/searchAllFirestoreAccounts';
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    const results = await res.json();
    
    console.log(`Found ${results.length} companies with accounts in Firestore.`);
    for (const company of results) {
      console.log(`\nCompany ID: ${company.companyId} (${company.companyName}), User: ${company.userId}`);
      console.log(`Accounts count: ${company.accountsCount}`);
      
      const customCashBank = company.accounts.filter(a => {
        // filter for codes starting with 111 or 112, but excluding the default ones
        const isCashOrBank = a.code && (a.code.startsWith('111') || a.code.startsWith('112'));
        const isDefault = ['111', '112', '11101'].includes(a.code);
        return isCashOrBank && !isDefault;
      });
      
      if (customCashBank.length > 0) {
        console.log(`Found ${customCashBank.length} custom cash/bank accounts:`);
        console.log(JSON.stringify(customCashBank, null, 2));
      } else {
        console.log('No custom cash/bank accounts found.');
      }
    }
  } catch (e) {
    console.error('Failed:', e.message);
  }
}

run();
