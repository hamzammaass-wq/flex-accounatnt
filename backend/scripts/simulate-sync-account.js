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

  const companyId = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';
  const item = {
    id: 'acc_custom_cashbox_test',
    code: '11199', // A new unique code for test
    name: 'الصندوق النقدي التجريبي',
    type: 'ASSET',
    parentId: 'acc_cash_root',
    isGroup: false,
    currency: 'ILS',
    balance: 0
  };

  try {
    await client.connect();
    console.log('Connected. Starting account sync simulation...');

    await client.query('BEGIN');
    await client.query('LOCK TABLE accounts IN SHARE ROW EXCLUSIVE MODE');

    const prefixedId = prefixAccountId(companyId, item.id);
    const existingAcc = await client.query(
      `SELECT id FROM accounts WHERE company_id = $1 AND code = $2`,
      [companyId, item.code]
    );
    let targetId = prefixedId;
    if (existingAcc.rows.length > 0) {
      targetId = existingAcc.rows[0].id;
    }

    console.log(`Inserting account with targetId: ${targetId}`);
    await client.query(
      `INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance, is_active)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
       SET code = EXCLUDED.code, name = EXCLUDED.name, type = EXCLUDED.type, parent_id = NULL,
           is_group = EXCLUDED.is_group, currency = EXCLUDED.currency, balance = EXCLUDED.balance, is_active = EXCLUDED.is_active`,
      [targetId, companyId, item.code, item.name, item.type, !!item.isGroup, item.currency, Number(item.balance || 0), true]
    );

    if (item.parentId) {
      const prefixedParentId = prefixAccountId(companyId, item.parentId);
      const parentCheck = await client.query(
        `SELECT id FROM accounts WHERE company_id = $1 AND (id = $2 OR id = $3)`,
        [companyId, prefixedParentId, item.parentId]
      );
      if (parentCheck.rows.length > 0) {
        const dbParentId = parentCheck.rows[0].id;
        const childCheck = await client.query(
          `SELECT id FROM accounts WHERE company_id = $1 AND (id = $2 OR id = $3)`,
          [companyId, prefixAccountId(companyId, item.id), item.id]
        );
        if (childCheck.rows.length > 0) {
          const dbChildId = childCheck.rows[0].id;
          await client.query(
            `UPDATE accounts
             SET parent_id = $1
             WHERE company_id = $2 AND id = $3`,
            [dbParentId, companyId, dbChildId]
          );
          console.log(`Updated parent_id for child: ${dbChildId} to parent: ${dbParentId}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log('Account sync committed successfully! 🎉');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Account sync simulation failed with error:', err.message);
  } finally {
    await client.end();
  }
};

simulate();
