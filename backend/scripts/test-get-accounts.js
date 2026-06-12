import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const unprefixAccountId = (companyId, id) => {
  if (!id) return null;
  if (id.startsWith(companyId + '_')) {
    return id.substring(companyId.length + 1);
  }
  return id;
};

const check = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';

  try {
    await client.connect();
    console.log('Connected.');

    const result = await client.query(
      `SELECT * FROM accounts WHERE company_id = $1 ORDER BY code ASC`,
      [companyId]
    );
    console.log(`Raw rows count: ${result.rows.length}`);

    const mapped = result.rows.map((row) => ({
      ...row,
      id: unprefixAccountId(companyId, row.id),
      parentId: unprefixAccountId(companyId, row.parent_id)
    }));

    console.log('Sample mapped rows (first 3):');
    console.log(JSON.stringify(mapped.slice(0, 3), null, 2));

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
