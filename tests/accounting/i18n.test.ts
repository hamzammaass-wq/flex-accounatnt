import { describe, expect, it } from 'vitest';

import {
  detectPreferredAppLanguage,
  getDateLocale,
  getDocumentLanguageTag,
  getLocaleLanguage,
  getNumberLocale,
  isRtlLanguage,
  normalizeAppLanguage
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
});
