import { Invoice, InvoiceTaxMode } from '../types';

export interface InvoiceTaxSummary {
  sub: number;
  tax: number;
  disc: number;
  total: number;
  rate: number;
  taxIncludedInAmount: boolean;
  netBeforeTax: number;
  subTotalForInvoice: number;
}

interface CalculateInvoiceTaxSummaryInput {
  itemsTotal: number;
  discountAmount: number;
  taxRate: number;
  taxMode: InvoiceTaxMode;
}

const round2 = (value: number) => Number((Number(value) || 0).toFixed(2));

export const normalizeInvoiceTaxMode = (
  value: unknown,
  fallback: InvoiceTaxMode = 'NONE'
): InvoiceTaxMode => {
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().toUpperCase();
  if (normalized === 'NONE' || normalized === 'EXCLUSIVE' || normalized === 'INCLUSIVE') {
    return normalized as InvoiceTaxMode;
  }
  if (normalized === 'INCLUDED') return 'INCLUSIVE';
  if (normalized === 'EXCLUDED' || normalized === 'ADDED' || normalized === 'ADD') return 'EXCLUSIVE';
  return fallback;
};

export const getDefaultInvoiceTaxMode = (
  taxVisibleInInvoices: boolean,
  defaultTaxRate: number
): InvoiceTaxMode => (
  taxVisibleInInvoices && Number(defaultTaxRate) > 0 ? 'EXCLUSIVE' : 'NONE'
);

export const resolveInvoiceTaxMode = (
  invoice?: Pick<Invoice, 'taxMode' | 'taxAmount'> | null
): InvoiceTaxMode => {
  if (!invoice) return 'NONE';
  const fallback = (Number(invoice.taxAmount) || 0) > 0 ? 'EXCLUSIVE' : 'NONE';
  return normalizeInvoiceTaxMode(invoice.taxMode, fallback);
};

export const isInvoiceTaxApplied = (
  taxMode: InvoiceTaxMode,
  taxRate?: number,
  taxAmount?: number
): boolean => (
  taxMode !== 'NONE' && ((Number(taxRate) || 0) > 0 || (Number(taxAmount) || 0) > 0)
);

export const calculateInvoiceTaxSummary = ({
  itemsTotal,
  discountAmount,
  taxRate,
  taxMode
}: CalculateInvoiceTaxSummaryInput): InvoiceTaxSummary => {
  const sub = round2(itemsTotal);
  const disc = round2(discountAmount);
  const netAfterDiscount = round2(Math.max(0, sub - disc));
  const rate = taxMode === 'NONE' ? 0 : round2(Math.max(0, Number(taxRate) || 0));

  if (taxMode === 'INCLUSIVE' && rate > 0) {
    const tax = round2((netAfterDiscount * rate) / (100 + rate));
    const netBeforeTax = round2(netAfterDiscount - tax);
    return {
      sub,
      tax,
      disc,
      total: netAfterDiscount,
      rate,
      taxIncludedInAmount: true,
      netBeforeTax,
      subTotalForInvoice: round2(netBeforeTax + disc)
    };
  }

  if (taxMode === 'EXCLUSIVE' && rate > 0) {
    const tax = round2((netAfterDiscount * rate) / 100);
    return {
      sub,
      tax,
      disc,
      total: round2(netAfterDiscount + tax),
      rate,
      taxIncludedInAmount: false,
      netBeforeTax: netAfterDiscount,
      subTotalForInvoice: sub
    };
  }

  return {
    sub,
    tax: 0,
    disc,
    total: netAfterDiscount,
    rate: 0,
    taxIncludedInAmount: false,
    netBeforeTax: netAfterDiscount,
    subTotalForInvoice: sub
  };
};

export const getInvoiceTaxModeLabel = (
  taxMode: InvoiceTaxMode,
  tr: (ar: string, en: string) => string
): string => {
  switch (taxMode) {
    case 'INCLUSIVE':
      return tr('شاملة', 'Included');
    case 'EXCLUSIVE':
      return tr('تضاف', 'Added');
    default:
      return tr('بدون', 'None');
  }
};

export const getInvoiceTaxModeDescription = (
  taxMode: InvoiceTaxMode,
  tr: (ar: string, en: string) => string
): string => {
  switch (taxMode) {
    case 'INCLUSIVE':
      return tr('الأسعار تشمل الضريبة', 'Prices include tax');
    case 'EXCLUSIVE':
      return tr('الضريبة تضاف إلى المجموع', 'Tax is added to the total');
    default:
      return tr('بدون ضريبة', 'No tax');
  }
};
