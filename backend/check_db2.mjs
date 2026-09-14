import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })(),
});
async function main() {
  try {
    const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.log(res.rows.map(r => r.table_name));
  } finally {
    await pool.end();
  }
}
main();
