-- Partner equity hardening migration
-- Ensures partner account links and equity parent posting flags are compatible with existing data.

BEGIN;

ALTER TABLE IF EXISTS partners
  ADD COLUMN IF NOT EXISTS capital_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS current_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS drawings_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS partner_type VARCHAR(30);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'partner_accounts'
  ) THEN
    UPDATE partners p
    SET
      capital_account_id = COALESCE(p.capital_account_id, pa.capital_account_id),
      current_account_id = COALESCE(p.current_account_id, pa.current_account_id),
      drawings_account_id = COALESCE(p.drawings_account_id, pa.drawings_account_id)
    FROM partner_accounts pa
    WHERE pa.partner_id = p.id;
  END IF;
END $$;

UPDATE accounts
SET is_posting = FALSE
WHERE code IN ('EQ-PARTNERS-CAP', 'EQ-PARTNERS-CUR', 'EQ-PARTNERS-DRW');

COMMIT;

