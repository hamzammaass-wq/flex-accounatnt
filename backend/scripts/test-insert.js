import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;

console.log('Connecting to:', connectionString ? connectionString.split('@')[1] : 'undefined');

const runTest = async () => {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database.');

    const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';
    const companyName = 'AIFLEX ERP';
    const taxNumber = '300012345600003';
    const address = 'الرياض - حي الملز';
    const phone = '920001234';
    const logoUrl = '';
    const baseCurrency = 'ILS';
    const settings = { someSetting: true };

    console.log('Inserting company...');
    const res = await client.query(
      `INSERT INTO companies (id, name, tax_number, address, phone, logo_url, base_currency, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, tax_number = EXCLUDED.tax_number, address = EXCLUDED.address,
           phone = EXCLUDED.phone, logo_url = EXCLUDED.logo_url, settings = EXCLUDED.settings
       RETURNING *`,
      [companyId, companyName, taxNumber, address, phone, logoUrl, baseCurrency, JSON.stringify(settings)]
    );
    console.log('Company inserted successfully:', res.rows[0]);

    console.log('Inserting user...');
    await client.query(
      `INSERT INTO users (id, email, name, role)
       VALUES ($1, $2, $3, 'USER')
       ON CONFLICT (id) DO NOTHING`,
      ['u9ufZgGvXFO3JfBHwgIdaPUCqcI3', 'hamza.mm.aa.ss@gmail.com', 'Hamza Sultan']
    );

    console.log('Inserting membership...');
    const memRes = await client.query(
      `INSERT INTO memberships (company_id, user_id, role, status)
       VALUES ($1, $2, 'OWNER', 'ACTIVE')
       ON CONFLICT (company_id, user_id) DO NOTHING
       RETURNING *`,
      [companyId, 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3']
    );
    console.log('Membership inserted successfully:', memRes.rows[0]);

  } catch (error) {
    console.error('Error during test execution:', error);
  } finally {
    await client.end();
  }
};

runTest();
