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
    const res = await client.query(`
      INSERT INTO workspace_offer_codes (code, status, kind, discount_percent)
      VALUES ('SAVE80', 'PERMANENT', 'DISCOUNT_PERCENT', 80)
      ON CONFLICT (code) DO UPDATE SET status = 'PERMANENT', discount_percent = 80;
    `);
    console.log('Successfully inserted SAVE80 code as PERMANENT!');
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
