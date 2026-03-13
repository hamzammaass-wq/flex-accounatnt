import { describe, expect, it } from 'vitest';

import {
  calculateInvoiceTaxSummary,
  getDefaultInvoiceTaxMode,
  normalizeInvoiceTaxMode,
  resolveInvoiceTaxMode
} from '../../utils/invoiceTax';

describe('invoice tax modes', () => {
  it('defaults to added tax only when invoices show tax and a default rate exists', () => {
    expect(getDefaultInvoiceTaxMode(true, 15)).toBe('EXCLUSIVE');
    expect(getDefaultInvoiceTaxMode(true, 0)).toBe('NONE');
    expect(getDefaultInvoiceTaxMode(false, 15)).toBe('NONE');
  });

  it('resolves legacy invoices without a stored tax mode safely', () => {
    expect(resolveInvoiceTaxMode({ taxAmount: 50 })).toBe('EXCLUSIVE');
    expect(resolveInvoiceTaxMode({ taxAmount: 0 })).toBe('NONE');
    expect(resolveInvoiceTaxMode({ taxMode: 'INCLUDED' as any, taxAmount: 0 })).toBe('INCLUSIVE');
    expect(normalizeInvoiceTaxMode('ADDED')).toBe('EXCLUSIVE');
  });

  it('calculates added tax separately from included tax', () => {
    expect(calculateInvoiceTaxSummary({
      itemsTotal: 100,
      discountAmount: 0,
      taxRate: 16,
      taxMode: 'EXCLUSIVE'
    })).toMatchObject({
      subTotalForInvoice: 100,
      tax: 16,
      total: 116,
      rate: 16
    });

    expect(calculateInvoiceTaxSummary({
      itemsTotal: 116,
      discountAmount: 0,
      taxRate: 16,
      taxMode: 'INCLUSIVE'
    })).toMatchObject({
      subTotalForInvoice: 100,
      tax: 16,
      total: 116,
      rate: 16
    });

    expect(calculateInvoiceTaxSummary({
      itemsTotal: 100,
      discountAmount: 0,
      taxRate: 16,
      taxMode: 'NONE'
    })).toMatchObject({
      subTotalForInvoice: 100,
      tax: 0,
      total: 100,
      rate: 0
    });
  });
});
