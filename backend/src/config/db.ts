import pg from 'pg';
import dotenv from 'dotenv';

// Force node-postgres to return DATE columns as raw YYYY-MM-DD strings instead of Date objects.
// OID 1082 is the PostgreSQL DATE type.
pg.types.setTypeParser(1082, (val) => val);

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  // Support SSL for platforms like Supabase, Render, Neon
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client:', err);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_DB === 'true') {
      console.log('[Database Query] Executed:', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('[Database Error] Failed executing query:', { text, error });
    throw error;
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};
