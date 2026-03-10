import { Invoice, Transaction } from '../types';

export interface ValidationIssue {
  code: string;
  message: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE_RE.test(String(value || '').trim())) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

export const validateTransactionInput = (payload: Omit<Transaction, 'id'>): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!payload.currency) {
    issues.push({ code: 'CURRENCY_REQUIRED', message: 'Currency is required.' });
  }
  if (!Number.isFinite(payload.exchangeRate) || payload.exchangeRate <= 0) {
    issues.push({ code: 'EXCHANGE_RATE_INVALID', message: 'Exchange rate must be greater than zero.' });
  }
  if (!isValidIsoDate(payload.date)) {
    issues.push({ code: 'DATE_INVALID', message: 'Date must be a valid ISO date.' });
  }
  if (!payload.debitAccountId || !payload.creditAccountId) {
    issues.push({ code: 'ACCOUNTS_REQUIRED', message: 'Debit and credit accounts are required.' });
  }
  if (payload.debitAccountId && payload.creditAccountId && payload.debitAccountId === payload.creditAccountId) {
    issues.push({ code: 'SAME_ACCOUNT', message: 'Debit and credit accounts cannot be the same.' });
  }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    issues.push({ code: 'AMOUNT_INVALID', message: 'Amount must be greater than zero.' });
  }

  return issues;
};

export const validateInvoiceInput = (payload: Omit<Invoice, 'id'>): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!payload.currency) {
    issues.push({ code: 'CURRENCY_REQUIRED', message: 'Currency is required.' });
  }
  if (!Number.isFinite(payload.exchangeRate) || payload.exchangeRate <= 0) {
    issues.push({ code: 'EXCHANGE_RATE_INVALID', message: 'Exchange rate must be greater than zero.' });
  }
  if (!isValidIsoDate(payload.date)) {
    issues.push({ code: 'DATE_INVALID', message: 'Invoice date must be a valid ISO date.' });
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    issues.push({ code: 'ITEMS_REQUIRED', message: 'Invoice must include at least one item.' });
  }
  if (!Number.isFinite(payload.totalAmount) || payload.totalAmount < 0) {
    issues.push({ code: 'TOTAL_INVALID', message: 'Invoice total is invalid.' });
  }
  if (payload.isPartnerDrawings) {
    if (payload.type !== 'INCOME') {
      issues.push({ code: 'PARTNER_DRAWINGS_TYPE_INVALID', message: 'Partner drawings invoice must be sales (income) type.' });
    }
    if (payload.category && payload.category !== 'sales_invoice') {
      issues.push({ code: 'PARTNER_DRAWINGS_CATEGORY_INVALID', message: 'Partner drawings invoice is only allowed for sales invoice category.' });
    }
    if (payload.paymentType !== 'CREDIT') {
      issues.push({ code: 'PARTNER_DRAWINGS_PAYMENT_TYPE_INVALID', message: 'Partner drawings invoice must be credit (on account).' });
    }
    if (!payload.customerId) {
      issues.push({ code: 'PARTNER_DRAWINGS_PARTNER_REQUIRED', message: 'Partner drawings invoice requires a partner contact.' });
    }
    if (!payload.partnerDrawingsMode) {
      issues.push({ code: 'PARTNER_DRAWINGS_MODE_REQUIRED', message: 'Partner drawings posting mode is required.' });
    }
  }

  return issues;
};
