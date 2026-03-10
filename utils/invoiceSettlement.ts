import { Invoice, InvoiceSettlement } from '../types';

const toFinite = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const getInvoiceTotalBase = (invoice: Pick<Invoice, 'totalAmount' | 'exchangeRate'>): number =>
  Number((toFinite(invoice.totalAmount) * Math.max(0, toFinite(invoice.exchangeRate, 1) || 1)).toFixed(6));

export const getInvoiceAllocatedBase = (
  invoiceId: string,
  settlements: InvoiceSettlement[]
): number => Number(
  settlements
    .filter(s => s.invoiceId === invoiceId)
    .reduce((sum, s) => sum + Math.max(0, toFinite(s.amountBase)), 0)
    .toFixed(6)
);

export const getInvoiceRemainingBase = (
  invoice: Pick<Invoice, 'id' | 'totalAmount' | 'exchangeRate'>,
  settlements: InvoiceSettlement[]
): number => {
  const remaining = getInvoiceTotalBase(invoice) - getInvoiceAllocatedBase(invoice.id, settlements);
  return Number(Math.max(0, remaining).toFixed(6));
};

export const getInvoiceAllocatedAmount = (
  invoiceId: string,
  settlements: InvoiceSettlement[]
): number => Number(
  settlements
    .filter(s => s.invoiceId === invoiceId)
    .reduce((sum, s) => sum + Math.max(0, toFinite(s.amount)), 0)
    .toFixed(6)
);

export const isInvoiceFullySettled = (invoice: Invoice, settlements: InvoiceSettlement[], epsilon = 0.005): boolean =>
  getInvoiceRemainingBase(invoice, settlements) <= epsilon;

