const { query } = require('./backend/dist/config/db.js');
async function run() {
  try {
    const res = await query(`SELECT relname as table_name, pg_size_pretty(pg_total_relation_size(relid)) As total_size FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;`);
    console.log(res.rows);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
