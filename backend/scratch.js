import pg from 'pg';
const client = new pg.Client({connectionString: 'postgresql://neondb_owner:npg_ObNa5h9szHdc@ep-damp-lake-apz7pu13-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'});
async function run() {
  await client.connect();
  const columnsRes = await client.query(`
    SELECT column_name, column_default, is_identity
    FROM information_schema.columns
    WHERE table_name = 'memberships' AND column_name = 'id'
  `);
  console.log('Columns:');
  console.table(columnsRes.rows);
  await client.end();
}
run().catch(console.error);
