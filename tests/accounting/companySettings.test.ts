import { describe, expect, it } from 'vitest';

import {
  coerceCompanyBooleanSetting,
  getInvoiceTaxVisibility,
  normalizeCompanyDisplaySettings,
  normalizeInvoiceTaxSettings
} from '../../utils/companySettings';

describe('company settings tax normalization', () => {
  it('coerces legacy string and numeric booleans safely', () => {
    expect(coerceCompanyBooleanSetting('false', true)).toBe(false);
    expect(coerceCompanyBooleanSetting('0', true)).toBe(false);
    expect(coerceCompanyBooleanSetting('true', false)).toBe(true);
    expect(coerceCompanyBooleanSetting(0, true)).toBe(false);
    expect(coerceCompanyBooleanSetting(1, false)).toBe(true);
  });

  it('normalizes legacy tax settings before runtime checks', () => {
    const normalized = normalizeInvoiceTaxSettings({
      showTaxInInvoices: 'false' as unknown as boolean,
      hidePurchaseTax: '1' as unknown as boolean,
      hideSalesTax: '0' as unknown as boolean
    });

    expect(normalized.showTaxInInvoices).toBe(false);
    expect(normalized.hidePurchaseTax).toBe(true);
    expect(normalized.hideSalesTax).toBe(false);
  });

  it('normalizes legacy dark mode values safely', () => {
    const normalized = normalizeCompanyDisplaySettings({
      darkModeEnabled: '1' as unknown as boolean
    });

    expect(normalized.darkModeEnabled).toBe(true);
  });

  it('resolves invoice tax visibility consistently for sales and purchases', () => {
    expect(getInvoiceTaxVisibility({
      showTaxInInvoices: 'false' as unknown as boolean,
      hidePurchaseTax: false,
      hideSalesTax: false
    }, 'sales')).toBe(false);

    expect(getInvoiceTaxVisibility({
      showTaxInInvoices: true,
      hidePurchaseTax: '1' as unknown as boolean,
      hideSalesTax: false
    }, 'purchase')).toBe(false);

    expect(getInvoiceTaxVisibility({
      showTaxInInvoices: true,
      hidePurchaseTax: false,
      hideSalesTax: false
    }, 'sales')).toBe(true);
  });
});
