import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Helper to unprefix account ID
const unprefixAccountId = (companyId, id) => {
  if (!id) return null;
  const prefix = companyId + '_';
  if (id.startsWith(prefix)) {
    return id.substring(prefix.length);
  }
  return id;
};

const verify = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const companyId = 'cmp_1NUDt9IvY3YGTKRnJbHjjhFpG3J3';

  try {
    await client.connect();
    console.log('Connected to DB for verify-sync-mapping.');

    // Fetch accounts using the exact query from sync.ts
    const result = await client.query(`SELECT * FROM accounts WHERE company_id = $1`, [companyId]);
    console.log(`Fetched ${result.rows.length} accounts from DB.`);

    // Apply the mapping we implemented in sync.ts
    const mappedRows = result.rows.map((row) => ({
      id: unprefixAccountId(companyId, row.id),
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: unprefixAccountId(companyId, row.parent_id) || undefined,
      isGroup: row.is_group,
      currency: row.currency,
      balance: Number(row.balance || 0),
      isActive: row.is_active
    }));

    // Verify a top-level group account (e.g. code: "1" for assets)
    const assetGroup = mappedRows.find(acc => acc.code === '1');
    if (assetGroup) {
      console.log('--- Verification of top-level group account "Assets" (Code 1) ---');
      console.log('id:', assetGroup.id);
      console.log('parentId:', assetGroup.parentId);
      console.log('isGroup:', assetGroup.isGroup);
      console.log('isActive:', assetGroup.isActive);

      if (assetGroup.parentId !== undefined) {
        console.error('❌ Error: parentId for top-level group should be undefined, but got:', assetGroup.parentId);
        process.exit(1);
      }
      if (assetGroup.isGroup !== true) {
        console.error('❌ Error: isGroup should be true, but got:', assetGroup.isGroup);
        process.exit(1);
      }
      console.log('✅ Top-level group mapped successfully!');
    } else {
      console.error('❌ Error: Assets group (Code 1) not found in DB!');
      process.exit(1);
    }

    // Verify a sub-account (e.g. code: "11101" for الصندوق الرئيسي)
    const cashAccount = mappedRows.find(acc => acc.code === '11101');
    if (cashAccount) {
      console.log('--- Verification of sub-account "Main Cash" (Code 11101) ---');
      console.log('id:', cashAccount.id);
      console.log('parentId:', cashAccount.parentId);
      console.log('isGroup:', cashAccount.isGroup);

      if (!cashAccount.parentId) {
        console.error('❌ Error: parentId for cash account should exist, but got:', cashAccount.parentId);
        process.exit(1);
      }
      if (cashAccount.isGroup !== false && cashAccount.isGroup !== null) {
        console.error('❌ Error: isGroup should be false/null, but got:', cashAccount.isGroup);
        process.exit(1);
      }
      console.log('✅ Sub-account mapped successfully!');
    }

    console.log('🎉 All serialization mappings verified successfully!');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
};

verify();
