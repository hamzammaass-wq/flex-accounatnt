-- Migration: Add workspace_offer_codes table for discount/promo codes
-- This mirrors the Firestore workspace_offer_codes collection into PostgreSQL (Neon)

CREATE TABLE IF NOT EXISTS workspace_offer_codes (
  code VARCHAR(100) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',  -- AVAILABLE, USED, CANCELLED, EXPIRED
  kind VARCHAR(30) NOT NULL DEFAULT 'FREE_DAYS',    -- DISCOUNT_PERCENT, FREE_DAYS, LIFETIME
  discount_percent INT,
  free_days INT,
  company_count INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id VARCHAR(128),
  created_by_email VARCHAR(150),
  expires_at TIMESTAMP,
  notes TEXT,
  used_at TIMESTAMP,
  used_by_user_id VARCHAR(128),
  used_by_email VARCHAR(150)
);

CREATE INDEX IF NOT EXISTS idx_offer_codes_status ON workspace_offer_codes(status);
CREATE INDEX IF NOT EXISTS idx_offer_codes_created ON workspace_offer_codes(created_at DESC);
