const { Client } = require('pg');

const client = new Client({
  connectionString: (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })()
});

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM workspace_offer_codes WHERE code = 'SAVE80'");
    console.log("DB Row:", res.rows[0]);
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
