import { Router, type Response } from 'express';
import { type AuthenticatedRequest, verifyCompanyMembership } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { prefixAccountId, unprefixAccountId } from '../utils/account-helpers.js';

const router = Router({ mergeParams: true });

// 1. Trial Balance Report
router.get('/trial-balance', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  const startDate = req.query.startDate || '1970-01-01';
  const endDate = req.query.endDate || '2100-12-31';

  try {
    const result = await query(
      `SELECT 
        a.id, a.code, a.name, a.type, a.currency,
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit,
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN a.type IN ('ASSET', 'EXPENSE') THEN jl2.debit - jl2.credit
              ELSE jl2.credit - jl2.debit
            END
          )
          FROM journal_lines jl2
          JOIN journal_entries je2 ON jl2.company_id = je2.company_id AND jl2.entry_id = je2.id
          WHERE jl2.company_id = $1 AND jl2.account_id = a.id AND je2.status = 'POSTED'
        ), 0) as current_balance,
        (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) as period_balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.company_id = $1 AND jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.company_id = $1 AND je.id = jl.entry_id AND je.date >= $2 AND je.date <= $3
       WHERE a.company_id = $1
       GROUP BY a.id, a.code, a.name, a.type, a.currency
       ORDER BY a.code ASC`,
      [companyId, startDate, endDate]
    );

    const unprefixedRows = result.rows.map((row: any) => ({
      ...row,
      id: unprefixAccountId(companyId, row.id)
    }));

    res.json(unprefixedRows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Account Statement / Ledger Card
router.get('/ledger-card/:accountId', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId, accountId } = req.params;
  const startDate = req.query.startDate || '1970-01-01';
  const endDate = req.query.endDate || '2100-12-31';
  const prefixedAccountId = prefixAccountId(companyId, accountId);

  try {
    // Get opening balance before the start date
    const openingResult = await query(
      `SELECT 
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as opening_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.company_id = je.company_id AND jl.entry_id = je.id
       WHERE jl.company_id = $1 AND je.company_id = $1 AND jl.account_id = $2 AND je.date < $3`,
      [companyId, prefixedAccountId, startDate]
    );

    const openingBalance = Number(openingResult.rows[0]?.opening_balance || 0);

    // Get period details
    const detailsResult = await query(
      `SELECT 
        je.id as transaction_id, je.date, je.voucher_id, je.description,
        jl.debit, jl.credit, jl.note, je.currency, je.exchange_rate
       FROM journal_lines jl
       JOIN journal_entries je ON jl.company_id = je.company_id AND jl.entry_id = je.id
       WHERE jl.company_id = $1 AND je.company_id = $1 AND jl.account_id = $2 AND je.date >= $3 AND je.date <= $4
       ORDER BY je.date ASC, je.created_at ASC`,
      [companyId, prefixedAccountId, startDate, endDate]
    );

    res.json({
      openingBalance,
      entries: detailsResult.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Contact Statement (Customer / Supplier Ledger)
router.get('/contact-statement/:contactId', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId, contactId } = req.params;
  const startDate = req.query.startDate || '1970-01-01';
  const endDate = req.query.endDate || '2100-12-31';

  try {
    const detailsResult = await query(
      `SELECT 
        je.id as transaction_id, je.date, je.voucher_id, je.description,
        je.amount, je.currency, je.exchange_rate, je.type,
        -- Check if debit or credit based on transaction type for contacts
        CASE WHEN je.type = 'INCOME' THEN je.amount ELSE 0 END as debit,
        CASE WHEN je.type = 'EXPENSE' THEN je.amount ELSE 0 END as credit
       FROM journal_entries je
       WHERE je.company_id = $1 AND je.contact_id = $2 AND je.date >= $3 AND je.date <= $4
       ORDER BY je.date ASC, je.created_at ASC`,
      [companyId, contactId, startDate, endDate]
    );

    res.json(detailsResult.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
