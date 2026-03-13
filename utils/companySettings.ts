import { CompanySettings } from '../types';

export const coerceCompanyBooleanSetting = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
};

export const normalizeInvoiceTaxSettings = <T extends Partial<CompanySettings>>(settings: T): T => ({
  ...settings,
  showTaxInInvoices: coerceCompanyBooleanSetting(settings.showTaxInInvoices, true),
  hidePurchaseTax: coerceCompanyBooleanSetting(settings.hidePurchaseTax, false),
  hideSalesTax: coerceCompanyBooleanSetting(settings.hideSalesTax, false)
});

export const normalizeCompanyDisplaySettings = <T extends Partial<CompanySettings>>(settings: T): T => ({
  ...settings,
  darkModeEnabled: coerceCompanyBooleanSetting((settings as Partial<CompanySettings>).darkModeEnabled, false)
});

export const getInvoiceTaxVisibility = (
  settings: Pick<CompanySettings, 'showTaxInInvoices' | 'hidePurchaseTax' | 'hideSalesTax'>,
  flow: 'sales' | 'purchase'
): boolean => {
  const normalized = normalizeInvoiceTaxSettings(settings);
  return normalized.showTaxInInvoices && !(flow === 'sales' ? normalized.hideSalesTax : normalized.hidePurchaseTax);
};
