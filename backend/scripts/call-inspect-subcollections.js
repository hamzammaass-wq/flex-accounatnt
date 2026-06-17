async function run() {
  console.log('=== Calling inspectAllFirestoreSubcollections ===');
  const url = 'https://us-central1-smart-account-cc181.cloudfunctions.net/inspectAllFirestoreSubcollections';
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Results:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed:', e.message);
  }
}

run();
