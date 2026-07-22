import { Router, type Response } from 'express';
import { type AuthenticatedRequest, verifyCompanyMembership } from '../middleware/auth.js';
import { query, getClient } from '../config/db.js';
import { prefixAccountId, resolveDbAccountId } from '../utils/account-helpers.js';

const router = Router({ mergeParams: true });

// Get aggregate invoice statistics for dashboard
router.get('/stats', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  try {
    const result = await query(
      `SELECT 
         COUNT(*) as total_count,
         COALESCE(SUM(total_amount * COALESCE(exchange_rate, 1)), 0) as total_sum,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount * COALESCE(exchange_rate, 1) ELSE 0 END), 0) as paid_sum,
         COALESCE(SUM(CASE WHEN status = 'UNPAID' THEN total_amount * COALESCE(exchange_rate, 1) ELSE 0 END), 0) as unpaid_sum
       FROM invoices
       WHERE company_id = $1`,
      [companyId]
    );

    res.json({
      totalCount: Number(result.rows[0]?.total_count || 0),
      totalSum: Number(result.rows[0]?.total_sum || 0),
      paidSum: Number(result.rows[0]?.paid_sum || 0),
      unpaidSum: Number(result.rows[0]?.unpaid_sum || 0)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all invoices for a company
router.get('/', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    const result = await query(
      `SELECT i.*, 
        (SELECT COALESCE(json_agg(item.*), '[]'::json) FROM invoice_items item WHERE item.company_id = i.company_id AND item.invoice_id = i.id) as items
       FROM invoices i
       WHERE i.company_id = $1
       ORDER BY i.date DESC, i.created_at DESC
       LIMIT $2 OFFSET $3`,
      [companyId, limit, offset]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create/Upsert Invoice
router.post('/', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  const {
    id,
    invoiceNumber,
    customerId,
    linkedInvoiceId,
    type,
    category,
    date,
    dueDate,
    items,
    subTotal,
    taxRate,
    taxAmount,
    taxMode,
    discountAmount,
    totalAmount,
    status,
    postingStatus,
    paymentType,
    paymentAccountId,
    isPartnerDrawings,
    partnerDrawingsMode,
    notes,
    currency,
    exchangeRate,
    warehouseId,
    reversalOfId,
    reversedById,
    isReversal
  } = req.body;

  if (!id || !invoiceNumber || !type || !date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required invoice fields or items' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Insert/Update Invoice Header
    await client.query(
      `INSERT INTO invoices (
        id, company_id, invoice_number, customer_id, linked_invoice_id, type, category, date, due_date,
        sub_total, tax_rate, tax_amount, tax_mode, discount_amount, total_amount, status, posting_status,
        payment_type, payment_account_id, is_partner_drawings, partner_drawings_mode, notes, currency,
        exchange_rate, warehouse_id, reversal_of_id, reversed_by_id, is_reversal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
       ON CONFLICT (company_id, id) DO UPDATE
       SET invoice_number = EXCLUDED.invoice_number, customer_id = EXCLUDED.customer_id,
           linked_invoice_id = EXCLUDED.linked_invoice_id, type = EXCLUDED.type, category = EXCLUDED.category,
           date = EXCLUDED.date, due_date = EXCLUDED.due_date, sub_total = EXCLUDED.sub_total,
           tax_rate = EXCLUDED.tax_rate, tax_amount = EXCLUDED.tax_amount, tax_mode = EXCLUDED.tax_mode,
           discount_amount = EXCLUDED.discount_amount, total_amount = EXCLUDED.total_amount,
           status = EXCLUDED.status, posting_status = EXCLUDED.posting_status, payment_type = EXCLUDED.payment_type,
           payment_account_id = EXCLUDED.payment_account_id, is_partner_drawings = EXCLUDED.is_partner_drawings,
           partner_drawings_mode = EXCLUDED.partner_drawings_mode, notes = EXCLUDED.notes,
           currency = EXCLUDED.currency, exchange_rate = EXCLUDED.exchange_rate, warehouse_id = EXCLUDED.warehouse_id`,
      [
        id,
        companyId,
        invoiceNumber,
        customerId || null,
        linkedInvoiceId || null,
        type,
        category || '',
        new Date(date),
        dueDate ? new Date(dueDate) : null,
        Number(subTotal || 0),
        Number(taxRate || 0),
        Number(taxAmount || 0),
        taxMode || 'NONE',
        Number(discountAmount || 0),
        Number(totalAmount || 0),
        status || 'PENDING',
        postingStatus || 'DRAFT',
        paymentType || 'CREDIT',
        await resolveDbAccountId(client, companyId, paymentAccountId),
        !!isPartnerDrawings,
        partnerDrawingsMode || null,
        notes || '',
        currency,
        Number(exchangeRate || 1.0),
        warehouseId || null,
        reversalOfId || null,
        reversedById || null,
        !!isReversal
      ]
    );

    // 2. Clear existing items first (in case of update)
    await client.query(`DELETE FROM invoice_items WHERE company_id = $1 AND invoice_id = $2`, [companyId, id]);

    // 3. Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items (id, company_id, invoice_id, product_id, account_id, description, quantity, unit_price, total, returned, width, length)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          item.id,
          companyId,
          id,
          item.productId || null,
          await resolveDbAccountId(client, companyId, item.accountId),
          item.description || '',
          Number(item.quantity || 0),
          Number(item.unitPrice || 0),
          Number(item.total || 0),
          !!item.returned,
          item.width ? Number(item.width) : null,
          item.length ? Number(item.length) : null
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, invoiceId: id });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Create Invoice Error]', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get Settlements
router.get('/settlements', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  try {
    const result = await query(
      `SELECT * FROM invoice_settlements WHERE company_id = $1 ORDER BY date DESC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Settlement (Receipt/Payment for Invoice)
router.post('/settlements', verifyCompanyMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { companyId } = req.params;
  const {
    id,
    invoiceId,
    voucherId,
    contactId,
    date,
    amount,
    amountBase,
    currency,
    exchangeRate,
    sourceType,
    note
  } = req.body;

  if (!id || !invoiceId || !voucherId || !amount || !currency) {
    return res.status(400).json({ error: 'Missing required settlement fields' });
  }

  try {
    const result = await query(
      `INSERT INTO invoice_settlements (
        id, company_id, invoice_id, voucher_id, contact_id, date, amount, amount_base, currency, exchange_rate, source_type, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (company_id, id) DO UPDATE
       SET amount = EXCLUDED.amount, amount_base = EXCLUDED.amount_base, note = EXCLUDED.note
       RETURNING *`,
      [
        id,
        companyId,
        invoiceId,
        voucherId,
        contactId || null,
        new Date(date),
        Number(amount),
        Number(amountBase || amount),
        currency,
        Number(exchangeRate || 1.0),
        sourceType,
        note || ''
      ]
    );
    res.status(201).json({ ok: true, settlement: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
