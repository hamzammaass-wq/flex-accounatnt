import { describe, expect, it } from 'vitest';
import { TransactionType } from '../../types';
import { validateInvoiceInput, validateTransactionInput } from '../../utils/validationRules';

describe('validation rules', () => {
  it('rejects invalid transaction payload', () => {
    const issues = validateTransactionInput({
      amount: 0,
      description: 'Invalid',
      category: 'journal',
      type: TransactionType.TRANSFER,
      date: '2026-02-31',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_cash',
      currency: '',
      exchangeRate: 0,
      status: 'POSTED'
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map(issue => issue.code)).toContain('CURRENCY_REQUIRED');
    expect(issues.map(issue => issue.code)).toContain('SAME_ACCOUNT');
  });

  it('accepts valid transaction payload', () => {
    const issues = validateTransactionInput({
      amount: 150,
      description: 'Valid',
      category: 'journal',
      type: TransactionType.TRANSFER,
      date: '2026-02-21',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_bank',
      currency: 'ILS',
      exchangeRate: 1,
      status: 'POSTED'
    });

    expect(issues).toHaveLength(0);
  });

  it('rejects invoice without items and currency', () => {
    const issues = validateInvoiceInput({
      invoiceNumber: 'INV-1',
      type: TransactionType.INCOME,
      category: 'sales_invoice',
      customerId: 'c1',
      date: '2026-02-21',
      items: [],
      subTotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 0,
      status: 'PENDING',
      postingStatus: 'DRAFT',
      paymentType: 'CASH',
      currency: '',
      exchangeRate: 0
    });

    expect(issues.map(issue => issue.code)).toContain('ITEMS_REQUIRED');
    expect(issues.map(issue => issue.code)).toContain('CURRENCY_REQUIRED');
  });

  it('rejects partner drawings invoice when payment is cash', () => {
    const issues = validateInvoiceInput({
      invoiceNumber: 'INV-PARTNER-1',
      type: TransactionType.INCOME,
      category: 'sales_invoice',
      customerId: 'p1',
      date: '2026-02-21',
      items: [{ id: 'l1', description: 'Item', quantity: 1, unitPrice: 100, total: 100 }],
      subTotal: 100,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 100,
      status: 'PENDING',
      postingStatus: 'POSTED',
      paymentType: 'CASH',
      currency: 'ILS',
      exchangeRate: 1,
      isPartnerDrawings: true,
      partnerDrawingsMode: 'DIRECT_DRAWINGS'
    });

    expect(issues.map(issue => issue.code)).toContain('PARTNER_DRAWINGS_PAYMENT_TYPE_INVALID');
  });

  it('accepts valid partner drawings invoice', () => {
    const issues = validateInvoiceInput({
      invoiceNumber: 'INV-PARTNER-2',
      type: TransactionType.INCOME,
      category: 'sales_invoice',
      customerId: 'p1',
      date: '2026-02-21',
      items: [{ id: 'l1', description: 'Item', quantity: 1, unitPrice: 100, total: 100 }],
      subTotal: 100,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 100,
      status: 'PENDING',
      postingStatus: 'POSTED',
      paymentType: 'CREDIT',
      currency: 'ILS',
      exchangeRate: 1,
      isPartnerDrawings: true,
      partnerDrawingsMode: 'AR_THEN_TRANSFER'
    });

    expect(issues).toHaveLength(0);
  });
});
