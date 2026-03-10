-- Partner Equity Ledger Migration
-- Scope:
-- 1) Hierarchical chart for partner capital/current/drawings
-- 2) Partner-to-account binding
-- 3) Journal header/lines for auditable posting
-- 4) Invoice flags for partner drawings posting mode

BEGIN;

CREATE TABLE IF NOT EXISTS partners (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  capital_share_percent NUMERIC(7,4) DEFAULT 0,
  drawings_limit_type VARCHAR(20) DEFAULT 'NONE',
  drawings_limit_value NUMERIC(18,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  parent_id BIGINT NULL REFERENCES accounts(id),
  account_type VARCHAR(20) NOT NULL,
  is_posting BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_accounts_parent_id ON accounts(parent_id);

CREATE TABLE IF NOT EXISTS partner_accounts (
  partner_id BIGINT PRIMARY KEY REFERENCES partners(id),
  capital_account_id BIGINT NOT NULL REFERENCES accounts(id),
  current_account_id BIGINT NOT NULL REFERENCES accounts(id),
  drawings_account_id BIGINT NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_no VARCHAR(40) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  fiscal_year INT NOT NULL,
  source_module VARCHAR(40) NOT NULL,
  source_id VARCHAR(80),
  description VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  reverse_of_entry_id BIGINT NULL REFERENCES journal_entries(id),
  created_by VARCHAR(80),
  posted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGSERIAL PRIMARY KEY,
  entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  account_id BIGINT NOT NULL REFERENCES accounts(id),
  partner_id BIGINT NULL REFERENCES partners(id),
  debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_code VARCHAR(20),
  tax_amount NUMERIC(18,2) DEFAULT 0,
  note VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_partner_id ON journal_lines(partner_id);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_no VARCHAR(40) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  customer_id BIGINT NOT NULL,
  customer_type VARCHAR(20) NOT NULL,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  is_partner_drawings BOOLEAN NOT NULL DEFAULT FALSE,
  partner_id BIGINT NULL REFERENCES partners(id),
  partner_invoice_mode VARCHAR(30) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  posted_entry_id BIGINT NULL REFERENCES journal_entries(id)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id BIGINT,
  description VARCHAR(250),
  qty NUMERIC(18,4) NOT NULL,
  unit_price NUMERIC(18,4) NOT NULL,
  line_subtotal NUMERIC(18,2) NOT NULL,
  vat_rate NUMERIC(7,4) DEFAULT 0,
  vat_amount NUMERIC(18,2) DEFAULT 0,
  line_total NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS profit_distributions (
  id BIGSERIAL PRIMARY KEY,
  fiscal_year INT NOT NULL,
  source_account_id BIGINT NOT NULL REFERENCES accounts(id),
  method VARCHAR(20) NOT NULL,
  distributable_amount NUMERIC(18,2) NOT NULL,
  retained_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  posted_entry_id BIGINT NULL REFERENCES journal_entries(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profit_distribution_lines (
  id BIGSERIAL PRIMARY KEY,
  distribution_id BIGINT NOT NULL REFERENCES profit_distributions(id) ON DELETE CASCADE,
  partner_id BIGINT NOT NULL REFERENCES partners(id),
  percent NUMERIC(7,4) DEFAULT 0,
  amount NUMERIC(18,2) NOT NULL
);

-- Parent equity nodes (non-posting).
INSERT INTO accounts (code, name, parent_id, account_type, is_posting, is_active)
SELECT 'EQ-PARTNERS-CAP', 'Partner Capital', NULL, 'EQUITY', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = 'EQ-PARTNERS-CAP');

INSERT INTO accounts (code, name, parent_id, account_type, is_posting, is_active)
SELECT 'EQ-PARTNERS-CUR', 'Partner Current Accounts', NULL, 'EQUITY', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = 'EQ-PARTNERS-CUR');

INSERT INTO accounts (code, name, parent_id, account_type, is_posting, is_active)
SELECT 'EQ-PARTNERS-DRW', 'Partner Drawings', NULL, 'EQUITY', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = 'EQ-PARTNERS-DRW');

COMMIT;
