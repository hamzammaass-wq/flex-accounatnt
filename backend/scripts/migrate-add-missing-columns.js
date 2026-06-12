import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const migrate = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon PostgreSQL DB.');

    await client.query('BEGIN');

    console.log('Altering checks table...');
    
    // Add bank_account_id
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS bank_account_id VARCHAR(100) REFERENCES accounts(id) ON DELETE SET NULL
    `);
    
    // Add account_number
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(100)
    `);

    // Add currency
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'ILS'
    `);

    // Add issue_date
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS issue_date DATE
    `);

    // Add type
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS type VARCHAR(20)
    `);

    // Add deposited_bank_id
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS deposited_bank_id VARCHAR(100)
    `);

    // Add original_contact_id
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS original_contact_id VARCHAR(50)
    `);

    // Add endorsee_contact_id
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS endorsee_contact_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL
    `);

    // Add image_url
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS image_url TEXT
    `);

    // Add image_urls
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS image_urls JSONB
    `);

    // Add description
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS description TEXT
    `);

    // Add endorsee_name
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS endorsee_name VARCHAR(200)
    `);

    // Add bounce_settlement_status
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS bounce_settlement_status VARCHAR(20)
    `);

    // Add bounce_settlement_date
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS bounce_settlement_date DATE
    `);

    // Add bounce_settlement_note
    await client.query(`
      ALTER TABLE checks 
      ADD COLUMN IF NOT EXISTS bounce_settlement_note TEXT
    `);

    console.log('Altering audit_logs table...');
    
    // Add screen
    await client.query(`
      ALTER TABLE audit_logs 
      ADD COLUMN IF NOT EXISTS screen VARCHAR(100)
    `);

    // Add device
    await client.query(`
      ALTER TABLE audit_logs 
      ADD COLUMN IF NOT EXISTS device VARCHAR(100)
    `);

    await client.query('COMMIT');
    console.log('Database migration completed successfully! 🎉');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
};

migrate();
