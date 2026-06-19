-- Post-Migration Verification Script
-- Run this AFTER executing the migration to verify success
--
-- Usage: psql -d smart_account -f 002_post_migration_verify.sql

\echo '==================================================================='
\echo 'POST-MIGRATION VERIFICATION'
\echo '==================================================================='
\echo ''

-- Test 1: Verify all company_id columns exist
\echo '1. Verify company_id columns exist:'
\echo '-------------------------------------------------------------------'

SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    CASE
        WHEN is_nullable = 'NO' THEN '✓ PASS'
        ELSE '✗ FAIL (should be NOT NULL)'
    END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
      'product_warehouse_stock',
      'invoice_items',
      'journal_lines',
      'stock_transfer_items',
      'employee_contracts',
      'employee_leave_requests',
      'employee_recurring_deductions'
  )
  AND column_name = 'company_id'
ORDER BY table_name;

\echo ''
\echo '2. Verify NO NULL company_id values:'
\echo '-------------------------------------------------------------------'

SELECT 'product_warehouse_stock' as table_name,
       COUNT(*) as null_count,
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM product_warehouse_stock WHERE company_id IS NULL
UNION ALL
SELECT 'invoice_items', COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END
FROM invoice_items WHERE company_id IS NULL
UNION ALL
SELECT 'journal_lines', COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END
FROM journal_lines WHERE company_id IS NULL
UNION ALL
SELECT 'stock_transfer_items', COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END
FROM stock_transfer_items WHERE company_id IS NULL
UNION ALL
SELECT 'employee_contracts', COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END
FROM employee_contracts WHERE company_id IS NULL
UNION ALL
SELECT 'employee_leave_requests', COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END
FROM employee_leave_requests WHERE company_id IS NULL
UNION ALL
SELECT 'employee_recurring_deductions', COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END
FROM employee_recurring_deductions WHERE company_id IS NULL;

\echo ''
\echo '3. Verify foreign key constraints exist:'
\echo '-------------------------------------------------------------------'

SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    CASE
        WHEN tc.constraint_type = 'FOREIGN KEY' THEN '✓ PASS'
        ELSE '✗ FAIL'
    END as status
FROM information_schema.table_constraints tc
WHERE tc.constraint_schema = 'public'
  AND tc.table_name IN (
      'product_warehouse_stock',
      'invoice_items',
      'journal_lines',
      'stock_transfer_items',
      'employee_contracts',
      'employee_leave_requests',
      'employee_recurring_deductions'
  )
  AND tc.constraint_name LIKE '%_company'
ORDER BY tc.table_name;

\echo ''
\echo '4. Verify indexes were created:'
\echo '-------------------------------------------------------------------'

SELECT
    tablename as table_name,
    indexname as index_name,
    CASE
        WHEN indexname LIKE '%company%' THEN '✓ PASS'
        ELSE '- INFO'
    END as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
      'product_warehouse_stock',
      'invoice_items',
      'journal_lines',
      'stock_transfer_items',
      'employee_contracts',
      'employee_leave_requests',
      'employee_recurring_deductions'
  )
  AND indexname LIKE '%company%'
ORDER BY tablename, indexname;

\echo ''
\echo '5. Verify data integrity - company_id matches parent:'
\echo '-------------------------------------------------------------------'

-- Check product_warehouse_stock
WITH mismatches AS (
    SELECT pws.company_id as child_company, p.company_id as parent_company
    FROM product_warehouse_stock pws
    JOIN products p ON pws.product_id = p.id
    WHERE pws.company_id != p.company_id
)
SELECT 'product_warehouse_stock' as table_name,
       COUNT(*) as mismatch_count,
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM mismatches;

-- Check invoice_items
WITH mismatches AS (
    SELECT ii.company_id as child_company, i.company_id as parent_company
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE ii.company_id != i.company_id
)
SELECT 'invoice_items' as table_name,
       COUNT(*) as mismatch_count,
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM mismatches;

-- Check journal_lines
WITH mismatches AS (
    SELECT jl.company_id as child_company, je.company_id as parent_company
    FROM journal_lines jl
    JOIN journal_entries je ON jl.entry_id = je.id
    WHERE jl.company_id != je.company_id
)
SELECT 'journal_lines' as table_name,
       COUNT(*) as mismatch_count,
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM mismatches;

-- Check stock_transfer_items
WITH mismatches AS (
    SELECT sti.company_id as child_company, st.company_id as parent_company
    FROM stock_transfer_items sti
    JOIN stock_transfers st ON sti.transfer_id = st.id
    WHERE sti.company_id != st.company_id
)
SELECT 'stock_transfer_items' as table_name,
       COUNT(*) as mismatch_count,
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM mismatches;

-- Check employee tables
WITH mismatches AS (
    SELECT ec.company_id as child_company, e.company_id as parent_company
    FROM employee_contracts ec
    JOIN employees e ON ec.employee_id = e.id
    WHERE ec.company_id != e.company_id
)
SELECT 'employee_contracts' as table_name,
       COUNT(*) as mismatch_count,
       CASE WHEN COUNT(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as status
FROM mismatches;

\echo ''
\echo '6. Test company isolation - cross-company query should return 0:'
\echo '-------------------------------------------------------------------'

DO $$
DECLARE
    company1_id VARCHAR;
    company2_id VARCHAR;
    cross_results INTEGER;
BEGIN
    -- Get two different company IDs
    SELECT id INTO company1_id FROM companies LIMIT 1;
    SELECT id INTO company2_id FROM companies WHERE id != company1_id LIMIT 1;

    IF company2_id IS NULL THEN
        RAISE NOTICE 'Only one company found - cannot test isolation';
        RETURN;
    END IF;

    -- Try to query company1's data filtered by company2's ID (should return 0)
    SELECT COUNT(*) INTO cross_results
    FROM journal_lines jl
    WHERE jl.company_id = company2_id
      AND jl.entry_id IN (
          SELECT id FROM journal_entries WHERE company_id = company1_id
      );

    IF cross_results = 0 THEN
        RAISE NOTICE 'Company isolation test: ✓ PASS (no cross-company data)';
    ELSE
        RAISE WARNING 'Company isolation test: ✗ FAIL (found % cross-company rows)', cross_results;
    END IF;
END $$;

\echo ''
\echo '7. Record count comparison (before/after should match):'
\echo '-------------------------------------------------------------------'

SELECT 'product_warehouse_stock' as table_name, COUNT(*) as current_count FROM product_warehouse_stock
UNION ALL
SELECT 'invoice_items', COUNT(*) FROM invoice_items
UNION ALL
SELECT 'journal_lines', COUNT(*) FROM journal_lines
UNION ALL
SELECT 'stock_transfer_items', COUNT(*) FROM stock_transfer_items
UNION ALL
SELECT 'employee_contracts', COUNT(*) FROM employee_contracts
UNION ALL
SELECT 'employee_leave_requests', COUNT(*) FROM employee_leave_requests
UNION ALL
SELECT 'employee_recurring_deductions', COUNT(*) FROM employee_recurring_deductions
ORDER BY current_count DESC;

\echo ''
\echo '==================================================================='
\echo 'POST-MIGRATION VERIFICATION COMPLETE'
\echo '==================================================================='
\echo ''
\echo 'NEXT STEPS:'
\echo '1. Review all results above - all should show ✓ PASS'
\echo '2. If any ✗ FAIL, investigate and fix before proceeding'
\echo '3. Restart backend application'
\echo '4. Monitor logs for errors'
\echo '5. Run integration tests'
\echo '6. Update application code to use company_id in queries'
\echo ''
\echo 'Backend needs these updates:'
\echo '  - sync.ts: Add company_id to product_warehouse_stock queries'
\echo '  - All routes: Add company_id filters to child table JOINs'
\echo '==================================================================='
