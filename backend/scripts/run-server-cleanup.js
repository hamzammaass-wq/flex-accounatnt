import process from 'process';

const secret = 'a1f1ex_cleanup_secret_20260619_sec';
const execute = process.argv.includes('--execute');

// Default target is the production Firebase Hosting URL
let baseUrl = 'https://smart-account-cc181.web.app/api';

if (process.argv.includes('--local')) {
  baseUrl = 'http://localhost:5000/api';
} else {
  // Allow passing a custom base URL
  const urlArg = process.argv.find(arg => arg.startsWith('--url='));
  if (urlArg) {
    baseUrl = urlArg.split('=')[1];
  }
}

const url = `${baseUrl}/migrate-database/clean-tenant-overlap`;

async function run() {
  console.log(`\n================ REMOTE DATA CLEANUP SCRIPT ================`);
  console.log(`Target URL: ${url}`);
  console.log(`Mode: ${execute ? 'EXECUTE (WILL MODIFY DATA)' : 'DRY RUN (NO CHANGES)'}`);
  console.log(`------------------------------------------------------------\n`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cleanup-secret': secret
      },
      body: JSON.stringify({ execute })
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    const data = await response.json();
    console.log('\nResponse Data:\n', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Failed to execute cleanup API:', error.message);
  }
}

run();
