import pg from 'pg';
const client = new pg.Client({connectionString: (() => {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error('DATABASE_URL environment variable is required.');
    }
    return value;
  })()});
await client.connect();

// Check all unique constraints and primary keys
const res = await client.query(`
  SELECT tc.table_name, tc.constraint_name, tc.constraint_type, 
         string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE') 
    AND tc.table_schema = 'public'
  GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
  ORDER BY tc.table_name, tc.constraint_type;
`);

console.table(res.rows);
await client.end();
