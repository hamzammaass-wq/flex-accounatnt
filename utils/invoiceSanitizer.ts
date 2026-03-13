import { Invoice, InvoiceItem, PartnerInvoiceMode, TransactionType } from '../types';
import { normalizeInvoiceTaxMode } from './invoiceTax';

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isInvoiceStatus = (value: unknown): value is Invoice['status'] =>
  value === 'PAID' || value === 'PENDING' || value === 'CANCELLED' || value === 'QUOTATION';

const isPostingStatus = (value: unknown): value is NonNullable<Invoice['postingStatus']> =>
  value === 'DRAFT' || value === 'POSTED';

const isPaymentType = (value: unknown): value is Invoice['paymentType'] =>
  value === 'CASH' || value === 'CREDIT';

const isPartnerDrawingsMode = (value: unknown): value is PartnerInvoiceMode =>
  value === 'DIRECT_DRAWINGS' || value === 'AR_THEN_TRANSFER';

const isTransactionType = (value: unknown): value is TransactionType =>
  value === TransactionType.INCOME || value === TransactionType.EXPENSE || value === TransactionType.TRANSFER;

export const sanitizeInvoiceItem = (raw: unknown, index = 0): InvoiceItem | null => {
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as Partial<InvoiceItem>;
  return {
    id: asOptionalString(source.id) || `item_${index + 1}`,
    productId: asOptionalString(source.productId),
    accountId: asOptionalString(source.accountId),
    description: String(source.description ?? '').trim(),
    quantity: asFiniteNumber(source.quantity),
    unitPrice: asFiniteNumber(source.unitPrice),
    total: asFiniteNumber(source.total),
    returned: Boolean(source.returned),
    width: source.width == null ? undefined : asFiniteNumber(source.width),
    length: source.length == null ? undefined : asFiniteNumber(source.length)
  };
};

export const sanitizeInvoiceItems = (raw: unknown): InvoiceItem[] => (
  Array.isArray(raw)
    ? raw
      .map((item, index) => sanitizeInvoiceItem(item, index))
      .filter((item): item is InvoiceItem => Boolean(item))
    : []
);

export const sanitizeInvoice = (raw: unknown, index = 0): Invoice | null => {
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as Partial<Invoice>;
  const id = asOptionalString(source.id) || `invoice_${index + 1}`;
  const type = isTransactionType(source.type) ? source.type : TransactionType.INCOME;
  const items = sanitizeInvoiceItems(source.items);

  return {
    id,
    invoiceNumber: asOptionalString(source.invoiceNumber) || id,
    customerId: asOptionalString(source.customerId),
    linkedInvoiceId: asOptionalString(source.linkedInvoiceId),
    type,
    category: asOptionalString(source.category),
    date: asOptionalString(source.date) || '',
    dueDate: asOptionalString(source.dueDate),
    items,
    subTotal: asFiniteNumber(source.subTotal),
    taxRate: asFiniteNumber(source.taxRate),
    taxAmount: asFiniteNumber(source.taxAmount),
    taxMode: normalizeInvoiceTaxMode(source.taxMode, asFiniteNumber(source.taxAmount) > 0 ? 'EXCLUSIVE' : 'NONE'),
    discountAmount: asFiniteNumber(source.discountAmount),
    totalAmount: asFiniteNumber(source.totalAmount),
    status: isInvoiceStatus(source.status) ? source.status : 'PENDING',
    postingStatus: isPostingStatus(source.postingStatus) ? source.postingStatus : 'DRAFT',
    paymentType: isPaymentType(source.paymentType) ? source.paymentType : 'CASH',
    paymentAccountId: asOptionalString(source.paymentAccountId),
    isPartnerDrawings: Boolean(source.isPartnerDrawings),
    partnerDrawingsMode: isPartnerDrawingsMode(source.partnerDrawingsMode)
      ? source.partnerDrawingsMode
      : undefined,
    notes: asOptionalString(source.notes),
    currency: asOptionalString(source.currency) || 'ILS',
    exchangeRate: asFiniteNumber(source.exchangeRate, 1),
    warehouseId: asOptionalString(source.warehouseId),
    reversalOfId: asOptionalString(source.reversalOfId),
    reversedById: asOptionalString(source.reversedById),
    isReversal: Boolean(source.isReversal)
  };
};

export const sanitizeInvoices = (raw: unknown): Invoice[] => (
  Array.isArray(raw)
    ? raw
      .map((invoice, index) => sanitizeInvoice(invoice, index))
      .filter((invoice): invoice is Invoice => Boolean(invoice))
    : []
);
