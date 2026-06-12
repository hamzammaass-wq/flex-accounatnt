import { describe, expect, it } from 'vitest';

import {
  detectPreferredAppLanguage,
  getDateLocale,
  getDocumentLanguageTag,
  getLocaleLanguage,
  getNumberLocale,
  isRtlLanguage,
  matchesDocumentNumberSearch,
  normalizeAppLanguage,
  translateDocumentNumber
} from '../../utils/i18n';

describe('i18n language normalization', () => {
  it('normalizes Arabic and English values from legacy or browser formats', () => {
    expect(normalizeAppLanguage('AR')).toBe('AR');
    expect(normalizeAppLanguage('ar-SA')).toBe('AR');
    expect(normalizeAppLanguage('EN')).toBe('EN');
    expect(normalizeAppLanguage('en-US')).toBe('EN');
    expect(normalizeAppLanguage('english')).toBe('EN');
    expect(normalizeAppLanguage('OTHER')).toBe('EN');
  });

  it('detects browser preference and keeps English active for non-Arabic locales', () => {
    expect(detectPreferredAppLanguage(['en-US', 'ar-SA'])).toBe('EN');
    expect(detectPreferredAppLanguage(['ar-SA', 'en-US'])).toBe('AR');
    expect(detectPreferredAppLanguage(['fr-FR'])).toBe('EN');
    expect(detectPreferredAppLanguage([])).toBe('EN');
  });

  it('applies normalized values consistently across locale helpers', () => {
    expect(getLocaleLanguage('EN')).toBe('en');
    expect(getDocumentLanguageTag('EN')).toBe('en');
    expect(isRtlLanguage('EN')).toBe(false);
    expect(getDateLocale('EN')).toBe('en-US');
    expect(getNumberLocale('EN')).toBe('en-US');
  });

  it('translates document symbols correctly between English and Arabic', () => {
    // To English
    expect(translateDocumentNumber('25/00000001 ف. مبيعات', true)).toBe('25/00000001 INV');
    expect(translateDocumentNumber('فاتورة مبيعات-2026-000001', true)).toBe('INV-26-000001');
    expect(translateDocumentNumber('مرتجع مبيعات-2026-000002', true)).toBe('SRTN-26-000002');
    expect(translateDocumentNumber('25/00000007 قبض', true)).toBe('25/00000007 REC');
    expect(translateDocumentNumber('سند قبض-2026-000001', true)).toBe('REC-26-000001');
    expect(translateDocumentNumber('سند صرف-2026-000002', true)).toBe('PAY-26-000002');
    expect(translateDocumentNumber('قيد-2026-000003', true)).toBe('JRN-26-000003');
    expect(translateDocumentNumber('تحويل-2026-000004', true)).toBe('TRF-26-000004');
    expect(translateDocumentNumber('REC-2026-000001', true)).toBe('REC-26-000001');
    expect(translateDocumentNumber('26/00000074 إشعارات', true)).toBe('26/00000074 D/C Note');
    expect(translateDocumentNumber('26/00000074 إشعار', true)).toBe('26/00000074 D/C Note');
    expect(translateDocumentNumber('25/00000002 م. مبيعات', true)).toBe('25/00000002 SRTN');

    // To Arabic
    expect(translateDocumentNumber('25/00000001 SINVOICE', false)).toBe('25/00000001 ف. مبيعات');
    expect(translateDocumentNumber('INV-2026-000001', false)).toBe('ف. مبيعات-26-000001');
    expect(translateDocumentNumber('SINV-2026-000001', false)).toBe('ف. مبيعات-26-000001');
    expect(translateDocumentNumber('SRTN-2026-000002', false)).toBe('م. مبيعات-26-000002');
    expect(translateDocumentNumber('SALESRET-2026-000002', false)).toBe('م. مبيعات-26-000002');
    expect(translateDocumentNumber('25/00000007 RV', false)).toBe('25/00000007 قبض');
    expect(translateDocumentNumber('REC-2026-000001', false)).toBe('قبض-26-000001');
    expect(translateDocumentNumber('RV-2026-000001', false)).toBe('قبض-26-000001');
    expect(translateDocumentNumber('PAY-2026-000002', false)).toBe('صرف-26-000002');
    expect(translateDocumentNumber('PV-2026-000002', false)).toBe('صرف-26-000002');
    expect(translateDocumentNumber('JRN-2026-000003', false)).toBe('قيد-26-000003');
    expect(translateDocumentNumber('JV-2026-000003', false)).toBe('قيد-26-000003');
    expect(translateDocumentNumber('TRF-2026-000004', false)).toBe('تحويل-26-000004');
    expect(translateDocumentNumber('26/00000074 D/C Note', false)).toBe('26/00000074 إشعارات');
    expect(translateDocumentNumber('25/00000002 SALESRET', false)).toBe('25/00000002 م. مبيعات');
  });

  it('matches document numbers by Arabic or English invoice prefixes', () => {
    expect(matchesDocumentNumberSearch('INV-2026-000001', 'فاتورة مبيعات')).toBe(true);
    expect(matchesDocumentNumberSearch('INV-2026-000001', 'ف. مبيعات')).toBe(true);
    expect(matchesDocumentNumberSearch('ف. مبيعات-26-000001', 'INV')).toBe(true);
    expect(matchesDocumentNumberSearch('SRTN-2026-000002', 'مرتجع مبيعات')).toBe(true);
    expect(matchesDocumentNumberSearch('م. مبيعات-26-000002', 'SRTN')).toBe(true);
    expect(matchesDocumentNumberSearch('INV-2026-000001', 'PAY')).toBe(false);
  });
});
