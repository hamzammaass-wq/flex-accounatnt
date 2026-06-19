-- Pre-Migration Verification Script
-- Run this BEFORE executing the migration to assess impact
--
-- Usage: psql -d smart_account -f 000_pre_migration_check.sql

\echo '==================================================================='
\echo 'PRE-MIGRATION VERIFICATION'
\echo '==================================================================='
\echo ''

-- Check 1: Count records in each child table
\echo '1. Record counts in child tables (will need company_id):'
\echo '-------------------------------------------------------------------'

SELECT 'product_warehouse_stock' as table_name, COUNT(*) as record_count FROM product_warehouse_stock
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
ORDER BY record_count DESC;

\echo ''
\echo '2. Check for orphaned records (no matching parent):'
\echo '-------------------------------------------------------------------'

-- Check product_warehouse_stock
SELECT 'product_warehouse_stock' as table_name,
       COUNT(*) as orphaned_count
FROM product_warehouse_stock pws
WHERE NOT EXISTS (
    SELECT 1 FROM products p WHERE p.id = pws.product_id
);

-- Check invoice_items
SELECT 'invoice_items' as table_name,
       COUNT(*) as orphaned_count
FROM invoice_items ii
WHERE NOT EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = ii.invoice_id
);

-- Check journal_lines
SELECT 'journal_lines' as table_name,
       COUNT(*) as orphaned_count
FROM journal_lines jl
WHERE NOT EXISTS (
    SELECT 1 FROM journal_entries je WHERE je.id = jl.entry_id
);

-- Check stock_transfer_items
SELECT 'stock_transfer_items' as table_name,
       COUNT(*) as orphaned_count
FROM stock_transfer_items sti
WHERE NOT EXISTS (
    SELECT 1 FROM stock_transfers st WHERE st.id = sti.transfer_id
);

-- Check employee_contracts
SELECT 'employee_contracts' as table_name,
       COUNT(*) as orphaned_count
FROM employee_contracts ec
WHERE NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.id = ec.employee_id
);

-- Check employee_leave_requests
SELECT 'employee_leave_requests' as table_name,
       COUNT(*) as orphaned_count
FROM employee_leave_requests elr
WHERE NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.id = elr.employee_id
);

-- Check employee_recurring_deductions
SELECT 'employee_recurring_deductions' as table_name,
       COUNT(*) as orphaned_count
FROM employee_recurring_deductions erd
WHERE NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.id = erd.employee_id
);

\echo ''
\echo '3. Check current schema (should NOT have company_id yet):'
\echo '-------------------------------------------------------------------'

SELECT
    table_name,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t.table_name
            AND column_name = 'company_id'
        ) THEN 'YES (Already has company_id!)'
        ELSE 'NO (Ready for migration)'
    END as has_company_id_column
FROM (
    SELECT 'product_warehouse_stock' as table_name
    UNION ALL SELECT 'invoice_items'
    UNION ALL SELECT 'journal_lines'
    UNION ALL SELECT 'stock_transfer_items'
    UNION ALL SELECT 'employee_contracts'
    UNION ALL SELECT 'employee_leave_requests'
    UNION ALL SELECT 'employee_recurring_deductions'
) t;

\echo ''
\echo '4. Company data distribution:'
\echo '-------------------------------------------------------------------'

SELECT
    c.id as company_id,
    c.name as company_name,
    COUNT(DISTINCT p.id) as products,
    COUNT(DISTINCT i.id) as invoices,
    COUNT(DISTINCT je.id) as journal_entries,
    COUNT(DISTINCT e.id) as employees
FROM companies c
LEFT JOIN products p ON p.company_id = c.id
LEFT JOIN invoices i ON i.company_id = c.id
LEFT JOIN journal_entries je ON je.company_id = c.id
LEFT JOIN employees e ON e.company_id = c.id
GROUP BY c.id, c.name
ORDER BY c.id;

\echo ''
\echo '5. Estimated migration impact:'
\echo '-------------------------------------------------------------------'

DO $$
DECLARE
    total_rows INTEGER;
    estimated_time_seconds INTEGER;
BEGIN
    SELECT
        (SELECT COUNT(*) FROM product_warehouse_stock) +
        (SELECT COUNT(*) FROM invoice_items) +
        (SELECT COUNT(*) FROM journal_lines) +
        (SELECT COUNT(*) FROM stock_transfer_items) +
        (SELECT COUNT(*) FROM employee_contracts) +
        (SELECT COUNT(*) FROM employee_leave_requests) +
        (SELECT COUNT(*) FROM employee_recurring_deductions)
    INTO total_rows;

    -- Rough estimate: 1000 rows per second
    estimated_time_seconds := (total_rows / 1000) + 60; -- +60s for indexes

    RAISE NOTICE 'Total rows to migrate: %', total_rows;
    RAISE NOTICE 'Estimated time: % seconds (% minutes)',
        estimated_time_seconds,
        ROUND(estimated_time_seconds::NUMERIC / 60, 1);
    RAISE NOTICE 'Recommended: Run during low-traffic hours';
END $$;

\echo ''
\echo '==================================================================='
\echo 'PRE-MIGRATION CHECK COMPLETE'
\echo '==================================================================='
\echo ''
\echo 'IMPORTANT:'
\echo '1. If orphaned_count > 0, investigate and fix before migration'
\echo '2. If any table already has company_id, DO NOT run migration'
\echo '3. Take full backup: pg_dump smart_account > backup.sql'
\echo '4. Schedule downtime based on estimated time'
\echo ''
\echo 'Ready to proceed? Run:'
\echo '  psql -d smart_account -f 001_add_company_id_to_child_tables.sql'
\echo '==================================================================='
