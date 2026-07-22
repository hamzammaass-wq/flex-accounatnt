-- Migration: Add company_id to child tables for multi-tenancy isolation
-- Version: 001
-- Author: Claude AI Assistant
-- Date: 2026-06-19
-- Purpose: Fix schema design flaw where child tables lack direct company_id column
--
-- CRITICAL: Take full backup before running!
--   pg_dump smart_account > backup_before_migration_$(date +%Y%m%d_%H%M%S).sql
--
-- Estimated downtime: 5-15 minutes per table (depends on data size)
--
-- Rollback: ROLLBACK; (if still in transaction)
--           Or restore from backup

-- =============================================================================
-- BEGIN TRANSACTION
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 1: Add company_id columns (nullable first)
-- =============================================================================



-- 1. product_warehouse_stock
ALTER TABLE product_warehouse_stock ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- 2. invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- 3. journal_lines
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- 4. stock_transfer_items
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- 5. employee_contracts
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- 6. employee_leave_requests
ALTER TABLE employee_leave_requests ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);

-- 7. employee_recurring_deductions
ALTER TABLE employee_recurring_deductions ADD COLUMN IF NOT EXISTS company_id VARCHAR(50);



-- =============================================================================
-- PHASE 2: Populate company_id from parent tables
-- =============================================================================



-- 1. product_warehouse_stock <- products.company_id
UPDATE product_warehouse_stock pws
SET company_id = p.company_id
FROM products p
WHERE pws.product_id = p.id AND pws.company_id IS NULL;

-- 2. invoice_items <- invoices.company_id
UPDATE invoice_items ii
SET company_id = i.company_id
FROM invoices i
WHERE ii.invoice_id = i.id AND ii.company_id IS NULL;

-- 3. journal_lines <- journal_entries.company_id
UPDATE journal_lines jl
SET company_id = je.company_id
FROM journal_entries je
WHERE jl.entry_id = je.id AND jl.company_id IS NULL;

-- 4. stock_transfer_items <- stock_transfers.company_id
UPDATE stock_transfer_items sti
SET company_id = st.company_id
FROM stock_transfers st
WHERE sti.transfer_id = st.id AND sti.company_id IS NULL;

-- 5. employee_contracts <- employees.company_id
UPDATE employee_contracts ec
SET company_id = e.company_id
FROM employees e
WHERE ec.employee_id = e.id AND ec.company_id IS NULL;

-- 6. employee_leave_requests <- employees.company_id
UPDATE employee_leave_requests elr
SET company_id = e.company_id
FROM employees e
WHERE elr.employee_id = e.id AND elr.company_id IS NULL;

-- 7. employee_recurring_deductions <- employees.company_id
UPDATE employee_recurring_deductions erd
SET company_id = e.company_id
FROM employees e
WHERE erd.employee_id = e.id AND erd.company_id IS NULL;



-- =============================================================================
-- PHASE 3: Verification - Check for orphaned rows
-- =============================================================================



DO $$
DECLARE
    orphaned_pws INTEGER;
    orphaned_ii INTEGER;
    orphaned_jl INTEGER;
    orphaned_sti INTEGER;
    orphaned_ec INTEGER;
    orphaned_elr INTEGER;
    orphaned_erd INTEGER;
    total_orphaned INTEGER;
BEGIN
    -- Count orphaned rows in each table
    SELECT COUNT(*) INTO orphaned_pws FROM product_warehouse_stock WHERE company_id IS NULL;
    SELECT COUNT(*) INTO orphaned_ii FROM invoice_items WHERE company_id IS NULL;
    SELECT COUNT(*) INTO orphaned_jl FROM journal_lines WHERE company_id IS NULL;
    SELECT COUNT(*) INTO orphaned_sti FROM stock_transfer_items WHERE company_id IS NULL;
    SELECT COUNT(*) INTO orphaned_ec FROM employee_contracts WHERE company_id IS NULL;
    SELECT COUNT(*) INTO orphaned_elr FROM employee_leave_requests WHERE company_id IS NULL;
    SELECT COUNT(*) INTO orphaned_erd FROM employee_recurring_deductions WHERE company_id IS NULL;

    total_orphaned := orphaned_pws + orphaned_ii + orphaned_jl + orphaned_sti + orphaned_ec + orphaned_elr + orphaned_erd;

    IF total_orphaned > 0 THEN
        
        IF orphaned_pws > 0 THEN  END IF;
        IF orphaned_ii > 0 THEN  END IF;
        IF orphaned_jl > 0 THEN  END IF;
        IF orphaned_sti > 0 THEN  END IF;
        IF orphaned_ec > 0 THEN  END IF;
        IF orphaned_elr > 0 THEN  END IF;
        IF orphaned_erd > 0 THEN  END IF;

        
    END IF;

    
END $$;

-- =============================================================================
-- PHASE 4: Add NOT NULL constraints
-- =============================================================================



ALTER TABLE product_warehouse_stock ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE invoice_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE journal_lines ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE stock_transfer_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE employee_contracts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE employee_leave_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE employee_recurring_deductions ALTER COLUMN company_id SET NOT NULL;



-- =============================================================================
-- PHASE 5: Add foreign key constraints
-- =============================================================================



ALTER TABLE product_warehouse_stock
  ADD CONSTRAINT fk_pws_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE invoice_items
  ADD CONSTRAINT fk_invoice_items_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE journal_lines
  ADD CONSTRAINT fk_journal_lines_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE stock_transfer_items
  ADD CONSTRAINT fk_sti_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE employee_contracts
  ADD CONSTRAINT fk_ec_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE employee_leave_requests
  ADD CONSTRAINT fk_elr_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE employee_recurring_deductions
  ADD CONSTRAINT fk_erd_company FOREIGN KEY (company_id)
  REFERENCES companies(id) ON DELETE CASCADE;



-- =============================================================================
-- PHASE 6: Create indexes for performance
-- =============================================================================



CREATE INDEX IF NOT EXISTS idx_pws_company ON product_warehouse_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_pws_company_product ON product_warehouse_stock(company_id, product_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_company ON invoice_items(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_company_invoice ON invoice_items(company_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_company ON journal_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_company_entry ON journal_lines(company_id, entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_company_account ON journal_lines(company_id, account_id);

CREATE INDEX IF NOT EXISTS idx_sti_company ON stock_transfer_items(company_id);
CREATE INDEX IF NOT EXISTS idx_sti_company_transfer ON stock_transfer_items(company_id, transfer_id);

CREATE INDEX IF NOT EXISTS idx_ec_company ON employee_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_ec_company_employee ON employee_contracts(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_elr_company ON employee_leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_elr_company_employee ON employee_leave_requests(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_erd_company ON employee_recurring_deductions(company_id);
CREATE INDEX IF NOT EXISTS idx_erd_company_employee ON employee_recurring_deductions(company_id, employee_id);



-- =============================================================================
-- PHASE 7: Final verification
-- =============================================================================



DO $$
DECLARE
    pws_count INTEGER;
    ii_count INTEGER;
    jl_count INTEGER;
    sti_count INTEGER;
    ec_count INTEGER;
    elr_count INTEGER;
    erd_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO pws_count FROM product_warehouse_stock;
    SELECT COUNT(*) INTO ii_count FROM invoice_items;
    SELECT COUNT(*) INTO jl_count FROM journal_lines;
    SELECT COUNT(*) INTO sti_count FROM stock_transfer_items;
    SELECT COUNT(*) INTO ec_count FROM employee_contracts;
    SELECT COUNT(*) INTO elr_count FROM employee_leave_requests;
    SELECT COUNT(*) INTO erd_count FROM employee_recurring_deductions;

    
    
    
    
    
    
    
    
END $$;



-- =============================================================================
-- COMMIT TRANSACTION
-- =============================================================================

COMMIT;











-- =============================================================================
-- ROLLBACK (uncomment if migration fails)
-- =============================================================================
-- ROLLBACK;
-- 
