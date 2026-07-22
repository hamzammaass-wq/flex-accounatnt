const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
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
