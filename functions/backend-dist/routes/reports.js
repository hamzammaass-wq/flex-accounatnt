import { Router } from 'express';
import { verifyCompanyMembership } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { prefixAccountId, unprefixAccountId } from '../utils/account-helpers.js';
const router = Router({ mergeParams: true });
// 1. Trial Balance Report
router.get('/trial-balance', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    const startDate = req.query.startDate || '1970-01-01';
    const endDate = req.query.endDate || '2100-12-31';
    try {
        const result = await query(`SELECT
        a.id, a.code, a.name, a.type, a.currency,
        COALESCE(period.total_debit, 0) as total_debit,
        COALESCE(period.total_credit, 0) as total_credit,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN a.type IN ('ASSET', 'EXPENSE') THEN jl2.debit - jl2.credit
              ELSE jl2.credit - jl2.debit
            END
          )
          FROM journal_lines jl2
          JOIN journal_entries je2
            ON jl2.company_id = je2.company_id
           AND jl2.entry_id = je2.id
          WHERE jl2.company_id = $1
            AND jl2.account_id = a.id
            AND je2.status = 'POSTED'
        ), 0) as current_balance,
        (COALESCE(period.total_debit, 0) - COALESCE(period.total_credit, 0)) as period_balance
       FROM accounts a
       LEFT JOIN (
         SELECT
           jl.account_id,
           SUM(jl.debit) as total_debit,
           SUM(jl.credit) as total_credit
         FROM journal_lines jl
         JOIN journal_entries je
           ON jl.company_id = je.company_id
          AND jl.entry_id = je.id
         WHERE jl.company_id = $1
           AND je.company_id = $1
           AND je.status = 'POSTED'
           AND je.date >= $2
           AND je.date <= $3
         GROUP BY jl.account_id
       ) period ON period.account_id = a.id
       WHERE a.company_id = $1
       ORDER BY a.code ASC`, [companyId, startDate, endDate]);
        const unprefixedRows = result.rows.map((row) => ({
            ...row,
            id: unprefixAccountId(companyId, row.id)
        }));
        res.json(unprefixedRows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 2. Account Statement / Ledger Card
router.get('/ledger-card/:accountId', verifyCompanyMembership, async (req, res) => {
    const { companyId, accountId } = req.params;
    const startDate = req.query.startDate || '1970-01-01';
    const endDate = req.query.endDate || '2100-12-31';
    const prefixedAccountId = prefixAccountId(companyId, accountId);
    try {
        const openingResult = await query(`SELECT
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as opening_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.company_id = je.company_id AND jl.entry_id = je.id
       WHERE jl.company_id = $1
         AND je.company_id = $1
         AND jl.account_id = $2
         AND je.status = 'POSTED'
         AND je.date < $3`, [companyId, prefixedAccountId, startDate]);
        const openingBalance = Number(openingResult.rows[0]?.opening_balance || 0);
        const detailsResult = await query(`SELECT
        je.id as transaction_id, je.date, je.voucher_id, je.description,
        jl.debit, jl.credit, jl.note, je.currency, je.exchange_rate
       FROM journal_lines jl
       JOIN journal_entries je ON jl.company_id = je.company_id AND jl.entry_id = je.id
       WHERE jl.company_id = $1
         AND je.company_id = $1
         AND jl.account_id = $2
         AND je.status = 'POSTED'
         AND je.date >= $3
         AND je.date <= $4
       ORDER BY je.date ASC, je.created_at ASC`, [companyId, prefixedAccountId, startDate, endDate]);
        res.json({
            openingBalance,
            entries: detailsResult.rows
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 3. Contact Statement (Customer / Supplier Ledger)
router.get('/contact-statement/:contactId', verifyCompanyMembership, async (req, res) => {
    const { companyId, contactId } = req.params;
    const startDate = req.query.startDate || '1970-01-01';
    const endDate = req.query.endDate || '2100-12-31';
    try {
        const detailsResult = await query(`WITH contact_account AS (
         SELECT COALESCE(current_account_id, linked_account_id) AS account_id
         FROM contacts
         WHERE company_id = $1 AND id = $2
         LIMIT 1
       )
       SELECT
         je.id as transaction_id, je.date, je.voucher_id, je.description,
         je.amount, je.currency, je.exchange_rate, je.type,
         COALESCE(SUM(jl.debit), 0) as debit,
         COALESCE(SUM(jl.credit), 0) as credit
       FROM journal_entries je
       JOIN journal_lines jl
         ON jl.company_id = je.company_id
        AND jl.entry_id = je.id
       JOIN contact_account ca ON ca.account_id = jl.account_id
       WHERE je.company_id = $1
         AND je.contact_id = $2
         AND je.status = 'POSTED'
         AND je.date >= $3
         AND je.date <= $4
       GROUP BY
         je.id, je.date, je.voucher_id, je.description,
         je.amount, je.currency, je.exchange_rate, je.type, je.created_at
       ORDER BY je.date ASC, je.created_at ASC`, [companyId, contactId, startDate, endDate]);
        res.json(detailsResult.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 4. Dashboard Summary Stats (Calculated server-side using fast COUNT and SUM)
router.get('/dashboard-summary', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    try {
        const result = await query(`SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME' AND status != 'DRAFT' AND category NOT IN ('voucher_receipt', 'supplier_debit_note') THEN amount * COALESCE(exchange_rate, 1) ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' AND status != 'DRAFT' AND category NOT IN ('voucher_payment', 'customer_credit_note') THEN amount * COALESCE(exchange_rate, 1) ELSE 0 END), 0) as total_expense
       FROM journal_entries
       WHERE company_id = $1`, [companyId]);
        const totalIncome = Number(result.rows[0]?.total_income || 0);
        const totalExpense = Number(result.rows[0]?.total_expense || 0);
        const netBalance = totalIncome - totalExpense;
        res.json({
            totalIncome,
            totalExpense,
            netBalance
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
