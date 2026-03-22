import { describe, expect, it } from 'vitest';
import { TransactionType } from '../../types';
import { sanitizeInvoiceItems, sanitizeInvoices } from '../../utils/invoiceSanitizer';

describe('invoice sanitizer', () => {
  it('filters invalid invoice items and normalizes number fields', () => {
    const items = sanitizeInvoiceItems([
      null,
      undefined,
      {
        id: 'line_1',
        description: 'Laptop',
        quantity: '2',
        unitPrice: '1500.5',
        total: '3001',
        returned: 'yes'
      },
      'broken'
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'line_1',
      description: 'Laptop',
      quantity: 2,
      unitPrice: 1500.5,
      total: 3001,
      returned: true
    });
  });

  it('sanitizes malformed stored invoices instead of leaving crash-prone data', () => {
    const invoices = sanitizeInvoices([
      {
        id: 'inv_1',
        invoiceNumber: 1001,
        type: TransactionType.EXPENSE,
        category: 'purchase_invoice',
        date: '2026-03-12',
        items: [null, { description: 'Item A', quantity: '1', unitPrice: '25', total: '25' }],
        subTotal: '25',
        taxRate: '0',
        taxAmount: undefined,
        discountAmount: null,
        totalAmount: '25',
        status: 'UNKNOWN',
        postingStatus: 'BROKEN',
        paymentType: 'BROKEN',
        currency: '',
        exchangeRate: 'NaN'
      },
      null
    ]);

    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      id: 'inv_1',
      invoiceNumber: 'inv_1',
      type: TransactionType.EXPENSE,
      category: 'purchase_invoice',
      status: 'PENDING',
      postingStatus: 'DRAFT',
      paymentType: 'CASH',
      currency: 'ILS',
      exchangeRate: 1,
      taxMode: 'NONE',
      subTotal: 25,
      totalAmount: 25
    });
    expect(invoices[0].items).toHaveLength(1);
    expect(invoices[0].items[0]).toMatchObject({
      description: 'Item A',
      quantity: 1,
      unitPrice: 25,
      total: 25
    });
  });

  it('keeps legacy invoices posted when posting status is absent, but downgrades malformed values to draft', () => {
    const invoices = sanitizeInvoices([
      {
        id: 'legacy_posted',
        type: TransactionType.INCOME,
        date: '2026-03-12',
        items: [],
        totalAmount: 10
      },
      {
        id: 'broken_posting',
        type: TransactionType.INCOME,
        date: '2026-03-12',
        items: [],
        postingStatus: 'INVALID_VALUE',
        totalAmount: 10
      }
    ]);

    expect(invoices).toHaveLength(2);
    expect(invoices[0]?.postingStatus).toBe('POSTED');
    expect(invoices[1]?.postingStatus).toBe('DRAFT');
  });
});
