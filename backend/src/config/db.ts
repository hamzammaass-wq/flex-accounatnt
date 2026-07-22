import pg from 'pg';
import dotenv from 'dotenv';

// Force node-postgres to return DATE columns as raw YYYY-MM-DD strings instead of Date objects.
// OID 1082 is the PostgreSQL DATE type.
pg.types.setTypeParser(1082, (val) => val);

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Auto-detect if SSL is required (e.g. Neon, Supabase, Render, or DB_SSL set to true)
const isSslRequired = 
  process.env.DB_SSL === 'true' || 
  connectionString?.includes('sslmode=require') || 
  connectionString?.includes('sslmode=verify-full');

export const pool = new Pool({
  connectionString,
  ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client:', err);
});

// Helper function to delay execution
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a query on the Postgres pool with automatic query retries for transient errors.
 * This is crucial for serverless environments and Neon cold-starts (scale-to-zero compute wakeup).
 */
export const query = async (text: string, params?: any[], retries = 3, delay = 1000): Promise<any> => {
  const start = Date.now();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.DEBUG_DB === 'true') {
        console.log('[Database Query] Executed:', { text, duration, rows: res.rowCount });
      }
      return res;
    } catch (error: any) {
      const isTransient =
        attempt < retries &&
        (error.code === '57P01' || // admin_shutdown
          error.code === '57P02' || // crash_shutdown
          error.code === '57P03' || // cannot_connect_now
          error.code === '08000' || // connection_exception
          error.code === '08003' || // connection_does_not_exist
          error.code === '08006' || // connection_failure
          error.message?.includes('timeout') ||
          error.message?.includes('connection') ||
          error.message?.includes('closed') ||
          error.message?.includes('socket') ||
          error.message?.includes('reset') ||
          error.message?.includes('Neon') ||
          error.message?.includes('terminating'));

      if (isTransient) {
        console.warn(
          `[Database Query Warning] Transient error on attempt ${attempt}/${retries}. Retrying in ${delay * attempt}ms... Error: ${error.message}`
        );
        await wait(delay * attempt);
      } else {
        console.error('[Database Error] Failed executing query:', { text, error });
        throw error;
      }
    }
  }
  throw new Error('Database query failed after all retry attempts');
};

/**
 * Connects and retrieves a client from the pool with automatic retries for transient connection errors.
 */
export const getClient = async (retries = 3, delay = 1000): Promise<pg.PoolClient> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      return client;
    } catch (error: any) {
      const isTransient =
        attempt < retries &&
        (error.code === '57P01' ||
          error.code === '57P02' ||
          error.code === '57P03' ||
          error.code === '08000' ||
          error.code === '08003' ||
          error.code === '08006' ||
          error.message?.includes('timeout') ||
          error.message?.includes('connection') ||
          error.message?.includes('closed') ||
          error.message?.includes('socket') ||
          error.message?.includes('reset') ||
          error.message?.includes('Neon') ||
          error.message?.includes('terminating'));

      if (isTransient) {
        console.warn(
          `[Database Connection Warning] Failed to connect on attempt ${attempt}/${retries}. Retrying in ${delay * attempt}ms... Error: ${error.message}`
        );
        await wait(delay * attempt);
      } else {
        console.error('[Database Connection Error] Failed to connect to pool:', error);
        throw error;
      }
    }
  }
  throw new Error('Failed to connect to database after all retry attempts');
};
