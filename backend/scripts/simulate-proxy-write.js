import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const prefixAccountId = (companyId, id) => {
  if (!id) return null;
  if (id.startsWith(companyId + '_')) return id;
  return `${companyId}_${id}`;
};

const simulate = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const companyId = 'cmp_1NUDt9IvY3YGTKRnJbHjjhFpG3J3';
  const data = {
    id: 'tx_simulated_test_123',
    voucherId: 'VOUCHER-TEST-1',
    amount: 150,
    description: 'Simulated Receipt Voucher',
    category: 'voucher_receipt',
    type: 'INCOME',
    date: '2026-06-05',
    debitAccountId: 'acc_cash',
    creditAccountId: 'acc_receivable',
    currency: 'ILS',
    exchangeRate: 1.0,
    status: 'POSTED'
  };

  try {
    await client.connect();
    console.log('Connected. Starting transaction simulation...');

    await client.query('BEGIN');

    // 1. Insert header
    await client.query(
      `INSERT INTO journal_entries (id, company_id, voucher_id, amount, description, category, type, date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [data.id, companyId, data.voucherId, data.amount, data.description, data.category, data.type, new Date(data.date), data.status]
    );
    console.log('Header inserted.');

    // 2. Lines
    const lines = [
      { accountId: data.debitAccountId, debit: data.amount, credit: 0 },
      { accountId: data.creditAccountId, debit: 0, credit: data.amount }
    ];

    for (const line of lines) {
      const targetAccountId = prefixAccountId(companyId, line.accountId);
      console.log(`Inserting line with account_id: ${targetAccountId}`);
      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4)`,
        [data.id, targetAccountId, line.debit, line.credit]
      );
    }

    await client.query('COMMIT');
    console.log('Simulation transaction committed successfully! 🎉');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Simulation failed with error:', err.message);
  } finally {
    await client.end();
  }
};

simulate();
