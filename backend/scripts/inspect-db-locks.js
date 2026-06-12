import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const check = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');

    console.log('\n--- Active Activities ---');
    const act = await client.query(`
      SELECT pid, state, query, age(clock_timestamp(), query_start) as duration
      FROM pg_stat_activity
      WHERE state IS NOT NULL AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY duration DESC
    `);
    console.log(JSON.stringify(act.rows, null, 2));

    console.log('\n--- Locks ---');
    const locks = await client.query(`
      SELECT
        t.relname AS relation,
        l.locktype,
        l.mode,
        l.granted,
        l.pid
      FROM pg_locks l
      JOIN pg_stat_user_tables t ON l.relation = t.relid
      ORDER BY relation
    `);
    console.log(JSON.stringify(locks.rows, null, 2));

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
