// Using native fetch


async function run() {
  const users = ['IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3'];
  for (const uid of users) {
    console.log(`=== Calling inspectUser for ${uid} ===`);
    try {
      const res = await fetch(`https://us-central1-smart-account-cc181.cloudfunctions.net/inspectUser?userId=${uid}`);
      console.log('Status:', res.status);
      const text = await res.text();
      try {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        console.log(text);
      }
    } catch (e) {
      console.error(e);
    }

    console.log(`=== Calling inspectGhost for ${uid} ===`);
    try {
      const res = await fetch(`https://us-central1-smart-account-cc181.cloudfunctions.net/inspectGhost?userId=${uid}`);
      console.log('Status:', res.status);
      const text = await res.text();
      try {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        console.log(text);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

run();
