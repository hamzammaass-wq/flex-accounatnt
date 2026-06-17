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
    console.log('Connected.');
    
    const res = await client.query(
      `SELECT * FROM journal_entries WHERE company_id = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3'`
    );
    console.log('Transactions in cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3:');
    console.log(JSON.stringify(res.rows, null, 2));

    const res2 = await client.query(
      `SELECT * FROM journal_entries WHERE company_id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3'`
    );
    console.log('Transactions count in cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3:', res2.rows.length);
    console.log('Sample transactions:');
    console.log(JSON.stringify(res2.rows.slice(0, 3), null, 2));

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
};

check();
