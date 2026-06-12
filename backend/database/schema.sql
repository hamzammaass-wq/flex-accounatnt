-- AIFLEX Smart Accountant Relational Database Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  tax_number VARCHAR(50),
  address VARCHAR(300),
  phone VARCHAR(50),
  logo_url TEXT,
  base_currency VARCHAR(10) DEFAULT 'ILS',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY, -- Firebase Auth UID
  email VARCHAR(150) UNIQUE NOT NULL,
  name VARCHAR(200),
  picture TEXT,
  role VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id BIGSERIAL PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'MEMBER',
  status VARCHAR(20) DEFAULT 'ACTIVE',
  permissions JSONB, -- Custom permission matrix overrides
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_user UNIQUE(company_id, user_id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  parent_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL,
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  currency VARCHAR(10) NOT NULL DEFAULT 'ILS',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_company_account_code UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);

CREATE TABLE IF NOT EXISTS currencies (
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(10),
  rate NUMERIC(18,6) NOT NULL DEFAULT 1.0,
  PRIMARY KEY (company_id, code)
);

CREATE TABLE IF NOT EXISTS contacts (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL, -- CUSTOMER, SUPPLIER, PARTNER, EMPLOYEE
  phone VARCHAR(50),
  address VARCHAR(300),
  preferred_price_tier VARCHAR(20) DEFAULT 'RETAIL', -- RETAIL, WHOLESALE
  linked_account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL,
  current_account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL,
  capital_account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL,
  drawings_account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voucher_id VARCHAR(50),
  amount NUMERIC(18,4) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  type VARCHAR(20) NOT NULL, -- INCOME, EXPENSE, TRANSFER
  date DATE NOT NULL,
  invoice_id VARCHAR(50),
  contact_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL,
  employee_id VARCHAR(50),
  asset_id VARCHAR(50),
  check_id VARCHAR(50),
  currency VARCHAR(10) NOT NULL DEFAULT 'ILS',
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1.0,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED', -- DRAFT, POSTED
  reversal_of_id VARCHAR(50) REFERENCES journal_entries(id) ON DELETE SET NULL,
  reversed_by_id VARCHAR(50) REFERENCES journal_entries(id) ON DELETE SET NULL,
  is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_company_date ON journal_entries(company_id, date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGSERIAL PRIMARY KEY,
  entry_id VARCHAR(50) NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id VARCHAR(50) NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10),
  exchange_rate NUMERIC(18,6) DEFAULT 1.0,
  note VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS idx_jlines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jlines_account ON journal_lines(account_id);

CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  location VARCHAR(300),
  manager VARCHAR(100),
  is_main BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(20) DEFAULT 'STOCK', -- STOCK, SERVICE
  category VARCHAR(100),
  buy_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  sell_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(18,4),
  retail_price NUMERIC(18,4),
  wholesale_pricing_mode VARCHAR(20) DEFAULT 'FIXED', -- FIXED, MARKUP
  retail_pricing_mode VARCHAR(20) DEFAULT 'FIXED', -- FIXED, MARKUP
  wholesale_markup_percent NUMERIC(7,4),
  retail_markup_percent NUMERIC(7,4),
  stock NUMERIC(18,4) NOT NULL DEFAULT 0, -- Total global stock
  barcode VARCHAR(100),
  item_code VARCHAR(50),
  item_code_mode VARCHAR(20) DEFAULT 'AUTO',
  expiry_period_days INT,
  expiry_alert_lead_days INT,
  low_stock_alert_qty NUMERIC(18,4),
  reorder_qty NUMERIC(18,4),
  expiry_date DATE,
  image_url TEXT,
  unit_id VARCHAR(50),
  fifo_layers JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS product_warehouse_stock (
  product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id VARCHAR(50) NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transfer_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  from_warehouse_id VARCHAR(50) REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id VARCHAR(50) REFERENCES warehouses(id) ON DELETE RESTRICT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id BIGSERIAL PRIMARY KEY,
  transfer_id VARCHAR(50) NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,4) NOT NULL,
  description VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL,
  linked_invoice_id VARCHAR(50),
  type VARCHAR(20) NOT NULL, -- INCOME (Sales Invoice), EXPENSE (Purchase Invoice)
  category VARCHAR(100),
  date DATE NOT NULL,
  due_date DATE,
  sub_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(7,4) DEFAULT 0,
  tax_amount NUMERIC(18,4) DEFAULT 0,
  tax_mode VARCHAR(20) DEFAULT 'NONE',
  discount_amount NUMERIC(18,4) DEFAULT 0,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'PENDING', -- PAID, PENDING, CANCELLED, QUOTATION
  posting_status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, POSTED
  payment_type VARCHAR(20) DEFAULT 'CREDIT', -- CASH, CREDIT
  payment_account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL,
  is_partner_drawings BOOLEAN NOT NULL DEFAULT FALSE,
  partner_drawings_mode VARCHAR(30),
  notes TEXT,
  currency VARCHAR(10) NOT NULL DEFAULT 'ILS',
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1.0,
  warehouse_id VARCHAR(50) REFERENCES warehouses(id) ON DELETE RESTRICT,
  reversal_of_id VARCHAR(50) REFERENCES invoices(id) ON DELETE SET NULL,
  reversed_by_id VARCHAR(50) REFERENCES invoices(id) ON DELETE SET NULL,
  is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(50) PRIMARY KEY,
  invoice_id VARCHAR(50) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id VARCHAR(50) REFERENCES products(id) ON DELETE RESTRICT,
  account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL,
  unit_price NUMERIC(18,4) NOT NULL,
  total NUMERIC(18,4) NOT NULL,
  returned BOOLEAN DEFAULT FALSE,
  width NUMERIC(18,4),
  length NUMERIC(18,4)
);

CREATE TABLE IF NOT EXISTS invoice_settlements (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id VARCHAR(50) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  voucher_id VARCHAR(50) NOT NULL,
  contact_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  amount_base NUMERIC(18,4) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1.0,
  source_type VARCHAR(50) NOT NULL, -- VOUCHER_RECEIPT, VOUCHER_PAYMENT, CREDIT_NOTE, DEBIT_NOTE
  note TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL,
  department_id VARCHAR(50),
  position VARCHAR(100),
  hire_date DATE NOT NULL,
  salary_type VARCHAR(20) NOT NULL, -- FIXED, HOURLY
  pay_basis VARCHAR(40),
  basic_salary NUMERIC(18,4) NOT NULL DEFAULT 0,
  daily_work_hours NUMERIC(5,2) NOT NULL DEFAULT 8.0,
  hourly_rate NUMERIC(18,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, ON_LEAVE, TERMINATED
  phone VARCHAR(50),
  CONSTRAINT uq_company_employee_code UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS employee_contracts (
  id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type VARCHAR(30) DEFAULT 'OPEN_ENDED',
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CLOSED
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_leave_requests (
  id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(20) NOT NULL, -- ANNUAL, SICK, UNPAID, OTHER
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  days NUMERIC(5,2) NOT NULL,
  note TEXT,
  deduct_from_payroll BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_recurring_deductions (
  id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- ADVANCE, LOAN, INSURANCE, SUBSCRIPTION, OTHER
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, COMPLETED
  label VARCHAR(150) NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_asset_groups (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  default_useful_life NUMERIC(5,2) NOT NULL,
  depreciation_rate NUMERIC(7,4),
  description TEXT,
  asset_account_id VARCHAR(50) REFERENCES accounts(id),
  accumulated_depreciation_account_id VARCHAR(50) REFERENCES accounts(id),
  depreciation_expense_account_id VARCHAR(50) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  group_id VARCHAR(50) REFERENCES fixed_asset_groups(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL,
  cost NUMERIC(18,4) NOT NULL,
  salvage_value NUMERIC(18,4) DEFAULT 0,
  life_in_years NUMERIC(5,2) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, SOLD, DISPOSED
  disposal_date DATE,
  disposal_price NUMERIC(18,4)
);

CREATE TABLE IF NOT EXISTS checks (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  check_number VARCHAR(50) NOT NULL,
  bank_name VARCHAR(150) NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  status VARCHAR(20) NOT NULL,
  contact_id VARCHAR(50) REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  user_id VARCHAR(128),
  user_name VARCHAR(200),
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  before JSONB,
  after JSONB,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id);
