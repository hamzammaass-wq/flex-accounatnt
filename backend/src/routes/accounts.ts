import { Router, type Response } from 'express';
import { type AuthenticatedRequest, verifyCompanyMembership } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router({ mergeParams: true });

const prefixAccountId = (companyId: string, id: string | null | undefined): string | null => {
  if (!id) return null;
  let cleanId = id;
  const match = id.match(/^cmp_[a-zA-Z0-9]+_(.+)$/);
  if (match) {
    cleanId = match[1];
  }
  if (cleanId.startsWith(companyId + '_')) return cleanId;
  return `${companyId}_${cleanId}`;
};

const unprefixAccountId = (companyId: string, id: string | null | undefined): string | null => {
  if (!id) return null;
  const match = id.match(/^cmp_[a-zA-Z0-9]+_(.+)$/);
  if (match) {
    return match[1];
  }
  const prefix = companyId + '_';
  if (id.startsWith(prefix)) {
    return id.substring(prefix.length);
  }
  return id;
};

// Get all accounts for a company
router.get('/', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  try {
    const result = await query(
      `SELECT a.*,
         COALESCE((
           SELECT SUM(
             CASE 
               WHEN a.type IN ('ASSET', 'EXPENSE') THEN jl.debit - jl.credit
               ELSE jl.credit - jl.debit
             END
           )
           FROM journal_lines jl
           JOIN journal_entries je ON jl.company_id = je.company_id AND jl.entry_id = je.id
           WHERE jl.company_id = $1 AND jl.account_id = a.id AND je.status = 'POSTED'
         ), 0) as balance
       FROM accounts a
       WHERE a.company_id = $1
       ORDER BY a.code ASC`,
      [companyId]
    );
    const mapped = result.rows.map((row: any) => ({
      ...row,
      id: unprefixAccountId(companyId, row.id),
      parentId: unprefixAccountId(companyId, row.parent_id)
    }));
    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new account
router.post('/', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  const { id, code, name, type, parentId, isGroup, currency, balance } = req.body;

  if (!id || !code || !name || !type || !currency) {
    return res.status(400).json({ error: 'Missing required account fields' });
  }

  try {
    const result = await query(
      `INSERT INTO accounts (id, company_id, code, name, type, parent_id, is_group, currency, balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (company_id, code) DO UPDATE
       SET name = EXCLUDED.name, type = EXCLUDED.type, parent_id = EXCLUDED.parent_id,
           is_group = EXCLUDED.is_group, currency = EXCLUDED.currency
       RETURNING *`,
      [
        prefixAccountId(companyId, id),
        companyId,
        code,
        name,
        type,
        prefixAccountId(companyId, parentId),
        !!isGroup,
        currency,
        Number(balance || 0)
      ]
    );
    const row = result.rows[0];
    res.status(201).json({
      ok: true,
      account: {
        ...row,
        id: unprefixAccountId(companyId, row.id),
        parentId: unprefixAccountId(companyId, row.parent_id)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update an account
router.put('/:accountId', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId, accountId } = req.params;
  const { code, name, type, parentId, isGroup, currency, isActive } = req.body;

  try {
    const result = await query(
      `UPDATE accounts
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           type = COALESCE($3, type),
           parent_id = $4,
           is_group = COALESCE($5, is_group),
           currency = COALESCE($6, currency),
           is_active = COALESCE($7, is_active)
       WHERE company_id = $8 AND id = $9
       RETURNING *`,
      [
        code,
        name,
        type,
        parentId === undefined ? undefined : prefixAccountId(companyId, parentId),
        isGroup,
        currency,
        isActive,
        companyId,
        prefixAccountId(companyId, accountId)
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const row = result.rows[0];
    res.json({
      ok: true,
      account: {
        ...row,
        id: unprefixAccountId(companyId, row.id),
        parentId: unprefixAccountId(companyId, row.parent_id)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an account
router.delete('/:accountId', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId, accountId } = req.params;

  try {
    const prefixedAccountId = prefixAccountId(companyId, accountId);
    // 1. Verify that the account has no journal lines posted to it
    const jLinesCheck = await query(
      `SELECT 1 FROM journal_lines WHERE company_id = $1 AND account_id = $2 LIMIT 1`,
      [companyId, prefixedAccountId]
    );

    if (jLinesCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete account because it has active transaction history. Deactivate it instead.'
      });
    }

    // 2. Delete the account
    const result = await query(
      `DELETE FROM accounts WHERE company_id = $1 AND id = $2 RETURNING *`,
      [companyId, prefixedAccountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const row = result.rows[0];
    res.json({
      ok: true,
      deletedAccount: {
        ...row,
        id: unprefixAccountId(companyId, row.id),
        parentId: unprefixAccountId(companyId, row.parent_id)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
