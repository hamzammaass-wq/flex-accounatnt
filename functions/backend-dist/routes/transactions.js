import { Router } from 'express';
import { verifyCompanyMembership } from '../middleware/auth.js';
import { query, getClient } from '../config/db.js';
import { prefixAccountId } from '../utils/account-helpers.js';
const router = Router({ mergeParams: true });
// Get aggregate transaction statistics for dashboard
router.get('/stats', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    try {
        const result = await query(`SELECT 
         COUNT(*) as total_count,
         COALESCE(SUM(CASE WHEN type = 'INCOME' AND status != 'DRAFT' AND category NOT IN ('voucher_receipt', 'supplier_debit_note') THEN amount * COALESCE(exchange_rate, 1) ELSE 0 END), 0) as total_income,
         COALESCE(SUM(CASE WHEN type = 'EXPENSE' AND status != 'DRAFT' AND category NOT IN ('voucher_payment', 'customer_credit_note') THEN amount * COALESCE(exchange_rate, 1) ELSE 0 END), 0) as total_expense
       FROM journal_entries
       WHERE company_id = $1`, [companyId]);
        const totalIncome = Number(result.rows[0]?.total_income || 0);
        const totalExpense = Number(result.rows[0]?.total_expense || 0);
        res.json({
            totalCount: Number(result.rows[0]?.total_count || 0),
            totalIncome,
            totalExpense,
            netBalance: totalIncome - totalExpense
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get all transactions
router.get('/', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    try {
        const result = await query(`SELECT t.*, 
        (SELECT COALESCE(json_agg(jl.*), '[]'::json) FROM journal_lines jl WHERE jl.company_id = t.company_id AND jl.entry_id = t.id) as lines
       FROM journal_entries t
       WHERE t.company_id = $1
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $2 OFFSET $3`, [companyId, limit, offset]);
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create a new Journal Entry / Transaction
router.post('/', verifyCompanyMembership, async (req, res) => {
    const { companyId } = req.params;
    const { id, voucherId, amount, description, category, type, date, invoiceId, contactId, employeeId, assetId, checkId, currency, exchangeRate, status, lines // Array of { accountId, debit, credit, note }
     } = req.body;
    if (!id || !amount || !type || !date || !currency || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: 'Missing required transaction fields or lines' });
    }
    // Double-entry validation: sum(debit) must equal sum(credit)
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.0001) {
        return res.status(400).json({
            error: `Unbalanced transaction: Total Debit (${totalDebit.toFixed(2)}) must equal Total Credit (${totalCredit.toFixed(2)})`
        });
    }
    const client = await getClient();
    try {
        await client.query('BEGIN');
        // 1. Insert header
        await client.query(`INSERT INTO journal_entries (
        id, company_id, voucher_id, amount, description, category, type, date,
        invoice_id, contact_id, employee_id, asset_id, check_id, currency, exchange_rate, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`, [
            id,
            companyId,
            voucherId || null,
            Number(amount),
            description || '',
            category || '',
            type,
            new Date(date),
            invoiceId || null,
            contactId || null,
            employeeId || null,
            assetId || null,
            checkId || null,
            currency,
            Number(exchangeRate || 1.0),
            status || 'POSTED'
        ]);
        // 2. Insert lines and update account balances
        for (const line of lines) {
            const prefixedAccountId = prefixAccountId(companyId, line.accountId);
            await client.query(`INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, currency, exchange_rate, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                companyId,
                id,
                prefixedAccountId,
                Number(line.debit || 0),
                Number(line.credit || 0),
                line.currency || currency,
                Number(line.exchangeRate || exchangeRate || 1.0),
                line.note || null
            ]);
            // Update account balance
            // Adding debit increases balance, adding credit decreases balance
            const balanceChange = Number(line.debit || 0) - Number(line.credit || 0);
            await client.query(`UPDATE accounts
         SET balance = balance + $1
         WHERE id = $2 AND company_id = $3`, [balanceChange, prefixedAccountId, companyId]);
        }
        await client.query('COMMIT');
        res.status(201).json({ ok: true, transactionId: id });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Create Transaction Error]', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        client.release();
    }
});
// Reverse a transaction
router.post('/:transactionId/reverse', verifyCompanyMembership, async (req, res) => {
    const { companyId, transactionId } = req.params;
    const { reversalId, reversalDate, reversalVoucherId } = req.body;
    if (!reversalId) {
        return res.status(400).json({ error: 'Reversal Transaction ID is required' });
    }
    const client = await getClient();
    try {
        await client.query('BEGIN');
        // 1. Get original transaction header
        const originalHeader = await client.query(`SELECT * FROM journal_entries WHERE company_id = $1 AND id = $2`, [companyId, transactionId]);
        if (originalHeader.rows.length === 0) {
            return res.status(404).json({ error: 'Original transaction not found' });
        }
        const original = originalHeader.rows[0];
        if (original.is_reversal || original.reversed_by_id) {
            return res.status(400).json({ error: 'Transaction is already a reversal or has already been reversed' });
        }
        // 2. Get original transaction lines
        const originalLines = await client.query(`SELECT * FROM journal_lines WHERE company_id = $1 AND entry_id = $2`, [companyId, transactionId]);
        // 3. Create reversal header (debits and credits swapped)
        await client.query(`INSERT INTO journal_entries (
        id, company_id, voucher_id, amount, description, category, type, date,
        invoice_id, contact_id, employee_id, asset_id, check_id, currency, exchange_rate,
        status, reversal_of_id, is_reversal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true)`, [
            reversalId,
            companyId,
            reversalVoucherId || null,
            Number(original.amount),
            `عكس القيد: ${original.description}`,
            original.category,
            original.type,
            new Date(reversalDate || new Date()),
            original.invoice_id,
            original.contact_id,
            original.employee_id,
            original.asset_id,
            original.check_id,
            original.currency,
            Number(original.exchange_rate),
            'POSTED',
            transactionId
        ]);
        // 4. Create reversal lines (swap debit/credit) and update balances
        for (const originalLine of originalLines.rows) {
            // Swapping credit to debit and debit to credit
            const revDebit = Number(originalLine.credit || 0);
            const revCredit = Number(originalLine.debit || 0);
            await client.query(`INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, currency, exchange_rate, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                companyId,
                reversalId,
                originalLine.account_id,
                revDebit,
                revCredit,
                originalLine.currency,
                Number(originalLine.exchange_rate),
                `عكس الأسطر: ${originalLine.note || ''}`
            ]);
            // Update account balance (reversal effect)
            const balanceChange = revDebit - revCredit;
            await client.query(`UPDATE accounts
         SET balance = balance + $1
         WHERE id = $2 AND company_id = $3`, [balanceChange, originalLine.account_id, companyId]);
        }
        // 5. Link original to reversal
        await client.query(`UPDATE journal_entries SET reversed_by_id = $1 WHERE id = $2`, [reversalId, transactionId]);
        await client.query('COMMIT');
        res.json({ ok: true, reversalId });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[Reverse Transaction Error]', error);
        res.status(500).json({ error: error.message });
    }
    finally {
        client.release();
    }
});
export default router;
