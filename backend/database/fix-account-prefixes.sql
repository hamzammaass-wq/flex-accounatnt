-- Script to fix account ID prefixes and prevent company data overlap
-- Run this script ONLY if you suspect data overlap issues

-- STEP 1: Backup current data
-- IMPORTANT: Always backup before running fixes!
-- CREATE TABLE accounts_backup AS SELECT * FROM accounts;

-- STEP 2: Identify accounts without proper prefix
-- These accounts might be causing data overlap
SELECT
    company_id,
    id,
    code,
    name,
    CASE
        WHEN id LIKE company_id || '_%' THEN 'OK'
        ELSE 'NEEDS_FIX'
    END as status
FROM accounts
WHERE id NOT LIKE company_id || '_%'
ORDER BY company_id, code;

-- STEP 3: Find duplicate codes across different companies
-- This query shows if different companies are sharing the same account codes
SELECT
    code,
    COUNT(DISTINCT company_id) as company_count,
    ARRAY_AGG(DISTINCT company_id) as companies,
    ARRAY_AGG(id) as account_ids
FROM accounts
GROUP BY code
HAVING COUNT(DISTINCT company_id) > 1
ORDER BY company_count DESC;

-- STEP 4: Auto-fix accounts without prefix (USE WITH CAUTION!)
-- This will update account IDs to include company prefix
-- WARNING: This may break foreign key references! Run only if you understand the consequences.
-- Uncomment the following lines to execute:

/*
DO $$
DECLARE
    account_record RECORD;
    new_id VARCHAR;
BEGIN
    FOR account_record IN
        SELECT company_id, id, code, name
        FROM accounts
        WHERE id NOT LIKE company_id || '_%'
    LOOP
        -- Create new prefixed ID
        new_id := account_record.company_id || '_' || account_record.id;

        -- Check if new ID already exists
        IF EXISTS (SELECT 1 FROM accounts WHERE id = new_id AND company_id = account_record.company_id) THEN
            RAISE NOTICE 'Skipping % - target ID % already exists', account_record.id, new_id;
            CONTINUE;
        END IF;

        -- Update all related tables first
        UPDATE journal_lines SET account_id = new_id
        WHERE company_id = account_record.company_id AND account_id = account_record.id;

        UPDATE contacts SET
            linked_account_id = new_id WHERE company_id = account_record.company_id AND linked_account_id = account_record.id,
            current_account_id = new_id WHERE company_id = account_record.company_id AND current_account_id = account_record.id,
            capital_account_id = new_id WHERE company_id = account_record.company_id AND capital_account_id = account_record.id,
            drawings_account_id = new_id WHERE company_id = account_record.company_id AND drawings_account_id = account_record.id;

        UPDATE fixed_asset_groups SET
            asset_account_id = new_id WHERE company_id = account_record.company_id AND asset_account_id = account_record.id,
            accumulated_depreciation_account_id = new_id WHERE company_id = account_record.company_id AND accumulated_depreciation_account_id = account_record.id,
            depreciation_expense_account_id = new_id WHERE company_id = account_record.company_id AND depreciation_expense_account_id = account_record.id;

        UPDATE invoice_items SET account_id = new_id
        WHERE company_id = account_record.company_id AND account_id = account_record.id;

        UPDATE invoices SET payment_account_id = new_id
        WHERE company_id = account_record.company_id AND payment_account_id = account_record.id;

        UPDATE checks SET bank_account_id = new_id
        WHERE company_id = account_record.company_id AND bank_account_id = account_record.id;

        -- Update parent_id references in accounts table
        UPDATE accounts SET parent_id = new_id
        WHERE company_id = account_record.company_id AND parent_id = account_record.id;

        -- Finally, update the account itself
        UPDATE accounts SET id = new_id
        WHERE company_id = account_record.company_id AND id = account_record.id;

        RAISE NOTICE 'Fixed account: % -> %', account_record.id, new_id;
    END LOOP;
END $$;
*/

-- STEP 5: Verify the fix
-- After running the fix, this should return 0 rows
SELECT
    company_id,
    id,
    code,
    name
FROM accounts
WHERE id NOT LIKE company_id || '_%';

-- STEP 6: Verify no data loss
-- Compare record counts before and after
SELECT
    company_id,
    COUNT(*) as account_count
FROM accounts
GROUP BY company_id
ORDER BY company_id;

-- STEP 7: Test account isolation
-- Each company should only see their own accounts
SELECT
    a1.company_id as company1,
    a2.company_id as company2,
    a1.code as shared_code,
    COUNT(*) as overlap_count
FROM accounts a1
INNER JOIN accounts a2 ON a1.code = a2.code AND a1.company_id != a2.company_id
GROUP BY a1.company_id, a2.company_id, a1.code
ORDER BY overlap_count DESC;

-- Expected result: Some codes may be shared, but IDs should be different
-- This is NORMAL and CORRECT - different companies can have accounts with same code name
