async function run() {
  console.log('=== Calling segregateFirestoreUsers ===');
  const url = 'https://us-central1-smart-account-cc181.cloudfunctions.net/segregateFirestoreUsers';
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Result:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed:', e.message);
  }
}

run();
