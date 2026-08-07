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

const toSafeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  if (!Number.isFinite(payload.discountAmount) || payload.discountAmount < 0) {
    issues.push({ code: 'DISCOUNT_INVALID', message: 'Invoice discount is invalid.' });
  }
  if (!Number.isFinite(payload.taxAmount) || payload.taxAmount < 0) {
    issues.push({ code: 'TAX_INVALID', message: 'Invoice tax amount is invalid.' });
  }

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    payload.items.forEach((item, index) => {
      const qty = toSafeNumber(item.quantity);
      const unitPrice = toSafeNumber(item.unitPrice);
      const lineTotal = toSafeNumber(item.total);

      if (qty <= 0) {
        issues.push({
          code: 'ITEM_QUANTITY_INVALID',
          message: `Invoice item #${index + 1} quantity must be greater than zero.`
        });
      }

      if (unitPrice < 0) {
        issues.push({
          code: 'ITEM_PRICE_INVALID',
          message: `Invoice item #${index + 1} unit price cannot be negative.`
        });
      }

      if (lineTotal < 0) {
        issues.push({
          code: 'ITEM_TOTAL_INVALID',
          message: `Invoice item #${index + 1} total cannot be negative.`
        });
      }

      const expectedTotal = Number((qty * unitPrice).toFixed(2));
      const delta = Math.abs(expectedTotal - Number(lineTotal.toFixed(2)));
      if (qty > 0 && unitPrice >= 0 && delta > 0.02) {
        issues.push({
          code: 'ITEM_TOTAL_MISMATCH',
          message: `Invoice item #${index + 1} total does not match quantity x unit price.`
        });
      }
    });

    const itemsSubtotal = Number(
      payload.items.reduce((sum, item) => sum + toSafeNumber(item.total), 0).toFixed(2)
    );
    const discountAmount = Number(toSafeNumber(payload.discountAmount).toFixed(2));
    const taxAmount = Number(toSafeNumber(payload.taxAmount).toFixed(2));
    const totalAmount = Number(toSafeNumber(payload.totalAmount).toFixed(2));
    const expectedInvoiceTotal = payload.taxMode === 'INCLUSIVE'
      ? Number((itemsSubtotal - discountAmount).toFixed(2))
      : Number((itemsSubtotal - discountAmount + taxAmount).toFixed(2));

    if (discountAmount - itemsSubtotal > 0.02) {
      issues.push({
        code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
        message: 'Invoice discount cannot exceed items subtotal.'
      });
    }

    if (taxAmount - (itemsSubtotal - discountAmount) > 0.02) {
      issues.push({
        code: 'TAX_EXCEEDS_NET',
        message: 'Invoice tax cannot exceed net subtotal.'
      });
    }

    if (Math.abs(expectedInvoiceTotal - totalAmount) > 0.02) {
      issues.push({
        code: 'TOTAL_MISMATCH',
        message: 'Invoice total does not match subtotal - discount + tax.'
      });
    }
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
