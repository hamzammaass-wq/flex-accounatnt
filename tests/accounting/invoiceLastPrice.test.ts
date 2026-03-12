import { describe, expect, it } from 'vitest';
import { Invoice, TransactionType } from '../../types';
import { buildLastInvoicePriceMap } from '../../utils/invoiceLastPrice';

const buildInvoice = (overrides: Partial<Invoice>): Invoice => ({
  id: 'inv-default',
  invoiceNumber: 'INV-001',
  type: TransactionType.INCOME,
  date: '2026-03-01',
  items: [],
  subTotal: 0,
  taxRate: 0,
  taxAmount: 0,
  discountAmount: 0,
  totalAmount: 0,
  status: 'PAID',
  paymentType: 'CASH',
  currency: 'ILS',
  exchangeRate: 1,
  ...overrides
});

describe('buildLastInvoicePriceMap', () => {
  it('returns the latest posted sales price for the same customer and product', () => {
    const invoices: Invoice[] = [
      buildInvoice({
        id: 'old-sales',
        customerId: 'c1',
        category: 'sales_invoice',
        date: '2026-03-01',
        items: [{ id: '1', productId: 'p1', description: 'Item 1', quantity: 1, unitPrice: 120, total: 120 }]
      }),
      buildInvoice({
        id: 'new-sales',
        customerId: 'c1',
        category: 'sales_invoice',
        date: '2026-03-05',
        items: [{ id: '2', productId: 'p1', description: 'Item 1', quantity: 1, unitPrice: 135, total: 135 }]
      }),
      buildInvoice({
        id: 'other-customer',
        customerId: 'c2',
        category: 'sales_invoice',
        date: '2026-03-08',
        items: [{ id: '3', productId: 'p1', description: 'Item 1', quantity: 1, unitPrice: 180, total: 180 }]
      })
    ];

    const prices = buildLastInvoicePriceMap(invoices, { contactId: 'c1', mode: 'SALES' });

    expect(prices.get('p1')).toBe(135);
  });

  it('ignores draft quotations and the currently edited invoice', () => {
    const invoices: Invoice[] = [
      buildInvoice({
        id: 'draft-quote',
        customerId: 'c1',
        category: 'sales_invoice',
        postingStatus: 'DRAFT',
        status: 'QUOTATION',
        date: '2026-03-09',
        items: [{ id: '1', productId: 'p1', description: 'Item 1', quantity: 1, unitPrice: 210, total: 210 }]
      }),
      buildInvoice({
        id: 'editing',
        customerId: 'c1',
        category: 'sales_invoice',
        date: '2026-03-08',
        items: [{ id: '2', productId: 'p1', description: 'Item 1', quantity: 1, unitPrice: 190, total: 190 }]
      }),
      buildInvoice({
        id: 'posted',
        customerId: 'c1',
        category: 'sales_invoice',
        date: '2026-03-07',
        items: [{ id: '3', productId: 'p1', description: 'Item 1', quantity: 1, unitPrice: 175, total: 175 }]
      })
    ];

    const prices = buildLastInvoicePriceMap(invoices, {
      contactId: 'c1',
      mode: 'SALES',
      excludeInvoiceId: 'editing'
    });

    expect(prices.get('p1')).toBe(175);
  });

  it('returns the latest supplier purchase price in purchase mode', () => {
    const invoices: Invoice[] = [
      buildInvoice({
        id: 'old-purchase',
        customerId: 's1',
        type: TransactionType.EXPENSE,
        category: 'purchase_invoice',
        date: '2026-03-02',
        items: [{ id: '1', productId: 'p2', description: 'Item 2', quantity: 1, unitPrice: 80, total: 80 }]
      }),
      buildInvoice({
        id: 'new-purchase',
        customerId: 's1',
        type: TransactionType.EXPENSE,
        category: 'purchase_invoice',
        date: '2026-03-11',
        items: [{ id: '2', productId: 'p2', description: 'Item 2', quantity: 1, unitPrice: 92, total: 92 }]
      })
    ];

    const prices = buildLastInvoicePriceMap(invoices, { contactId: 's1', mode: 'PURCHASE' });

    expect(prices.get('p2')).toBe(92);
  });
});
