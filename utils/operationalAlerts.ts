import { Check, Invoice, InvoiceSettlement, Product, TransactionType } from '../types';
import { getInvoiceRemainingBase } from './invoiceSettlement';
import { isStockProduct } from './productKind';

interface OperationalAlertsInput {
  checks: Check[];
  products: Product[];
  invoices: Invoice[];
  invoiceSettlements?: InvoiceSettlement[];
  todayIso?: string;
  expiryAlertDays?: number;
  lowStockAlertQtyDefault?: number;
  bankDiffCount?: number;
}

export interface OperationalAlertsSummary {
  dueChecks: number;
  expiryItems: number;
  lowStockItems: number;
  orderNowItems: number;
  overdueInvoices: number;
  bankDiffs: number;
  total: number;
}

const normalizeDate = (value?: string): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const diffDays = (targetIso: string, fromIso: string): number => {
  const target = new Date(targetIso);
  const from = new Date(fromIso);
  if (Number.isNaN(target.getTime()) || Number.isNaN(from.getTime())) return Number.POSITIVE_INFINITY;
  const ms = target.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

export const buildOperationalAlerts = ({
  checks,
  products,
  invoices,
  invoiceSettlements = [],
  todayIso = new Date().toISOString().slice(0, 10),
  expiryAlertDays = 30,
  lowStockAlertQtyDefault = 5,
  bankDiffCount = 0
}: OperationalAlertsInput): OperationalAlertsSummary => {
  const normalizedToday = normalizeDate(todayIso) || new Date().toISOString().slice(0, 10);
  const normalizedGlobalExpiryThreshold = Number.isFinite(Number(expiryAlertDays))
    ? Math.floor(Number(expiryAlertDays))
    : 30;
  const normalizedLowStockDefault = Number.isFinite(Number(lowStockAlertQtyDefault))
    ? Math.max(0, Math.floor(Number(lowStockAlertQtyDefault)))
    : 5;

  const dueChecks = checks.filter(check => {
    if (check.status !== 'PENDING' && check.status !== 'UNDER_COLLECTION') return false;
    const dueDate = normalizeDate(check.dueDate);
    if (!dueDate) return false;
    return dueDate <= normalizedToday;
  }).length;

  const expiryItems = normalizedGlobalExpiryThreshold < 0
    ? 0
    : products.filter(product => {
        if (!isStockProduct(product)) return false;
        if ((product.stock || 0) <= 0) return false;
        const expiryDate = normalizeDate(product.expiryDate);
        if (!expiryDate) return false;
        const days = diffDays(expiryDate, normalizedToday);
        const productThreshold = Number.isFinite(Number(product.expiryAlertLeadDays))
          ? Math.floor(Number(product.expiryAlertLeadDays))
          : normalizedGlobalExpiryThreshold;
        return days <= Math.max(0, productThreshold);
      }).length;

  const lowStockItems = normalizedLowStockDefault < 0
    ? 0
    : products.filter(product => {
        if (!isStockProduct(product)) return false;
        const threshold = Number.isFinite(Number(product.lowStockAlertQty))
          ? Math.max(0, Math.floor(Number(product.lowStockAlertQty)))
          : normalizedLowStockDefault;
        return (Number(product.stock) || 0) <= threshold;
      }).length;

  const orderNowItems = normalizedLowStockDefault < 0
    ? 0
    : products.filter(product => {
        if (!isStockProduct(product)) return false;
        const threshold = Number.isFinite(Number(product.lowStockAlertQty))
          ? Math.max(0, Math.floor(Number(product.lowStockAlertQty)))
          : normalizedLowStockDefault;
        const reorderQty = Number.isFinite(Number(product.reorderQty))
          ? Math.max(0, Math.floor(Number(product.reorderQty)))
          : 0;
        return reorderQty > 0 && (Number(product.stock) || 0) <= threshold;
      }).length;

  const overdueInvoices = invoices.filter(invoice => {
    if (invoice.status === 'CANCELLED' || invoice.status === 'QUOTATION') return false;
    if (invoice.type !== TransactionType.INCOME && invoice.type !== TransactionType.EXPENSE) return false;
    if (invoice.paymentType !== 'CREDIT') return false;
    if (invoice.category === 'sales_return' || invoice.category === 'purchase_return') return false;
    const due = normalizeDate(invoice.dueDate || invoice.date);
    if (!due) return false;
    if (due >= normalizedToday) return false;
    return getInvoiceRemainingBase(invoice, invoiceSettlements) > 0.005;
  }).length;

  return {
    dueChecks,
    expiryItems,
    lowStockItems,
    orderNowItems,
    overdueInvoices,
    bankDiffs: Math.max(0, Math.floor(Number(bankDiffCount) || 0)),
    total: dueChecks + expiryItems + lowStockItems + orderNowItems + overdueInvoices + Math.max(0, Math.floor(Number(bankDiffCount) || 0))
  };
};
