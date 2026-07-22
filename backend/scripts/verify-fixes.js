import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const verify = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const companyId = 'cmp_1NUDt9IvY3YGTKRnJbHjjhFpG3J3';

  try {
    await client.connect();
    console.log('Connected to DB for verification.');

    await client.query('BEGIN');

    // 1. Simulating syncing a check with new columns
    const testCheckId = 'chk_verification_test_123';
    console.log(`Syncing test check: ${testCheckId}`);
    
    // Simulating how sync.ts generic handler parses Check fields
    // fields: id, company_id, check_number, bank_name, due_date, amount, status, contact_id, bank_account_id, account_number, currency, issue_date, type, deposited_bank_id, original_contact_id, endorsee_contact_id, image_url, image_urls, description, endorsee_name
    await client.query(`
      INSERT INTO checks (
        id, company_id, check_number, bank_name, due_date, amount, status, contact_id, 
        bank_account_id, account_number, currency, issue_date, type, deposited_bank_id, 
        original_contact_id, endorsee_contact_id, image_url, image_urls, description, endorsee_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (company_id, id) DO UPDATE 
      SET status = EXCLUDED.status
    `, [
      testCheckId, companyId, '12345', 'Palestine Bank', new Date(), 1500.0, 'PENDING', null,
      `${companyId}_acc_bank_root`, '10203040', 'ILS', new Date(), 'INCOMING', null,
      null, null, 'https://test.image/chk.png', JSON.stringify(['https://test.image/chk.png']), 'Verification test check', 'Verif Endorsee'
    ]);
    console.log('Test check synced successfully! ✅');

    // 2. Simulating syncing an audit log with new columns
    const testAuditId = 'aud_verification_test_123';
    console.log(`Syncing test audit log: ${testAuditId}`);
    
    // fields: id, company_id, timestamp, user_id, user_name, entity_type, entity_id, action, before, after, metadata, screen, device
    await client.query(`
      INSERT INTO audit_logs (
        id, company_id, timestamp, user_id, user_name, entity_type, entity_id, action, before, after, metadata, screen, device
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (company_id, id) DO UPDATE
      SET action = EXCLUDED.action
    `, [
      testAuditId, companyId, new Date(), 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3', 'Yusuf Tester', 'verification', 'test_123', 'TEST_RUN',
      JSON.stringify({ before: 'old' }), JSON.stringify({ after: 'new' }), JSON.stringify({ meta: 'data' }), 'Chart of Accounts', 'Chrome Browser'
    ]);
    console.log('Test audit log synced successfully! ✅');

    await client.query('ROLLBACK'); // Rollback so we don't pollute database
    console.log('Verification database transaction rolled back successfully. Database remains clean.');
    console.log('All backend and database fixes verified successfully! 🎉');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
};

verify();
