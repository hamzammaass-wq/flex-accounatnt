import { query } from './src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const res2 = await query(`
        WITH RECURSIVE search_graph(id, parent_id, depth, path, cycle) AS (
            SELECT id, parent_id, 1, ARRAY[id::VARCHAR], false
            FROM accounts
            WHERE parent_id IS NOT NULL
          UNION ALL
            SELECT a.id, a.parent_id, sg.depth + 1, path || a.id::VARCHAR, a.id::VARCHAR = ANY(path)
            FROM accounts a
            JOIN search_graph sg ON a.parent_id = sg.id
            WHERE NOT cycle
        )
        SELECT * FROM search_graph WHERE cycle;
    `);
    console.log('Cyclic accounts:', res2.rows.length);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
