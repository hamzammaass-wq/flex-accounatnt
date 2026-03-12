import { Invoice, TransactionType } from '../types';

export type InvoicePriceHistoryMode = 'SALES' | 'PURCHASE';

type BuildLastInvoicePriceMapOptions = {
  contactId?: string;
  mode: InvoicePriceHistoryMode;
  excludeInvoiceId?: string;
};

const SALES_CATEGORIES = new Set(['sales_invoice', 'sales_return']);
const PURCHASE_CATEGORIES = new Set(['purchase_invoice', 'purchase_return']);

const getInvoiceTimestamp = (invoice: Invoice): number => {
  const timestamp = Date.parse(invoice.date || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isRelevantHistoryInvoice = (
  invoice: Invoice,
  options: BuildLastInvoicePriceMapOptions
): boolean => {
  const { contactId, mode, excludeInvoiceId } = options;

  if (!contactId || invoice.customerId !== contactId) return false;
  if (excludeInvoiceId && invoice.id === excludeInvoiceId) return false;
  if (invoice.postingStatus === 'DRAFT') return false;
  if (invoice.category === 'general_expense' || invoice.category === 'import_expenses') return false;

  if (mode === 'PURCHASE') {
    if (invoice.category) return PURCHASE_CATEGORIES.has(invoice.category);
    return invoice.type === TransactionType.EXPENSE || invoice.type === TransactionType.INCOME;
  }

  if (invoice.category) return SALES_CATEGORIES.has(invoice.category);
  return invoice.type === TransactionType.INCOME || invoice.type === TransactionType.EXPENSE;
};

export const buildLastInvoicePriceMap = (
  invoices: Invoice[],
  options: BuildLastInvoicePriceMapOptions
): Map<string, number> => {
  const latestPrices = new Map<string, number>();

  const rankedInvoices = invoices
    .map((invoice, index) => ({ invoice, index }))
    .sort((left, right) => {
      const dateDiff = getInvoiceTimestamp(right.invoice) - getInvoiceTimestamp(left.invoice);
      if (dateDiff !== 0) return dateDiff;
      return right.index - left.index;
    });

  rankedInvoices.forEach(({ invoice }) => {
    if (!isRelevantHistoryInvoice(invoice, options)) return;

    [...(invoice.items || [])].reverse().forEach((item) => {
      if (!item.productId || latestPrices.has(item.productId)) return;
      const unitPrice = Number(item.unitPrice) || 0;
      if (unitPrice > 0) {
        latestPrices.set(item.productId, unitPrice);
      }
    });
  });

  return latestPrices;
};
