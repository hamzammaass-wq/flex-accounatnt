-- Multi-company auth migration
-- Adds memberships, migrates legacy profile.company_id links, and applies RLS for member-scoped access.

BEGIN;

CREATE TABLE IF NOT EXISTS company_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_memberships_user_company_unique UNIQUE (user_id, company_id),
  CONSTRAINT company_memberships_role_check CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'VIEWER')),
  CONSTRAINT company_memberships_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS idx_company_memberships_user_id ON company_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_company_memberships_company_id ON company_memberships(company_id);

INSERT INTO company_memberships (user_id, company_id, role, status)
SELECT
  p.id,
  p.company_id,
  COALESCE(NULLIF(p.role, ''), 'ADMIN'),
  'ACTIVE'
FROM profiles p
WHERE p.company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_memberships_select_own" ON company_memberships;
CREATE POLICY "company_memberships_select_own"
ON company_memberships
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_memberships_insert_own" ON company_memberships;
CREATE POLICY "company_memberships_insert_own"
ON company_memberships
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "companies_select_for_members" ON companies;
CREATE POLICY "companies_select_for_members"
ON companies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM company_memberships cm
    WHERE cm.company_id = companies.id
      AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "companies_insert_authenticated" ON companies;
CREATE POLICY "companies_insert_authenticated"
ON companies
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "companies_update_for_admin_members" ON companies;
CREATE POLICY "companies_update_for_admin_members"
ON companies
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM company_memberships cm
    WHERE cm.company_id = companies.id
      AND cm.user_id = auth.uid()
      AND cm.role = 'ADMIN'
      AND cm.status = 'ACTIVE'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM company_memberships cm
    WHERE cm.company_id = companies.id
      AND cm.user_id = auth.uid()
      AND cm.role = 'ADMIN'
      AND cm.status = 'ACTIVE'
  )
);

COMMIT;
