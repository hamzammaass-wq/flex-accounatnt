import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TYPES_FILE = path.join(PROJECT_ROOT, 'types.ts');
const CONTEXT_FILE = path.join(PROJECT_ROOT, 'contexts', 'AccountingContext.tsx');
const SETTINGS_FILE = path.join(PROJECT_ROOT, 'components', 'DefinitionsMenu.tsx');

const SETTINGS_OPTION_KEYS = [
  'name',
  'taxNumber',
  'address',
  'phone',
  'logoUrl',
  'language',
  'defaultTaxRate',
  'annualLeaveDefaultOpenEndedDays',
  'annualLeaveDefaultFixedTermDays',
  'leaveAccrualPolicy',
  'monthlyLeaveAccrualDays',
  'showTaxInInvoices',
  'hidePurchaseTax',
  'hideSalesTax',
  'voucherInvoiceAllocationEnabled',
  'lowStockAlertQtyDefault',
  'inventoryValuationMethod',
  'useAverageCosting',
  'biometricLoginEnabled',
  'notifyAfterAmountAdded',
  'alertsDesktopNotificationsEnabled',
  'alertsDesktopNotifySystem',
  'alertsDesktopNotifyManual',
  'alertsDesktopNotifyChecks',
  'alertsDesktopNotifyLowStock',
  'alertsDesktopNotifyExpiry',
  'alertsDesktopNotifyOverdueInvoices',
  'alertsDesktopNotifyContractExpiry',
  'alertsSoundEnabled',
  'allowNegativeSalesQuantity',
  'allowNegativeStock',
  'allowEditEntryDate',
  'journalDateLockEnabled',
  'journalDateLockFrom',
  'journalDateLockTo',
  'autoAddItemPriceInInvoice',
  'updateSalesPriceOnInvoiceEntry',
  'barcodeEnabled',
  'invoiceExpiryDateEnabled',
  'reportYearCloseEnabled',
  'strictPostedLockEnabled',
  'showFiscalCloseBadgeInReports',
  'autoFiscalYearCloseEntries',
  'autoFiscalYearOpeningEntries',
  'printPersonalData',
  'printElectronicInvoice',
  'printStatementAllCurrencies',
  'statementDateAscending',
  'statementFooterNote',
  'invoiceFooterNote',
  'headerTopLines',
  'debitLabel',
  'creditLabel',
  'showAccountBalanceUnderVoucher',
  'dottedNumbers',
  'hideVoucherColumnInStatement',
  'printExpiryDate',
  'autoBackupEnabled',
  'autoBackupFrequency',
  'autoBackupPassword',
  'autoBackupKeepCount',
  'autoBackupLastRunAt',
  'googleDriveAutoUpload',
  'googleDriveClientId',
  'googleDriveFolderId',
  'darkModeEnabled'
] as const;

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'src/dataconnect-generated', 'tests']);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countWholeWord = (text: string, token: string): number => {
  const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g');
  return (text.match(pattern) || []).length;
};

const collectSourceFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const normalized = fullPath.replace(/\\/g, '/');
      const excluded = Array.from(EXCLUDED_DIRS).some((segment) => normalized.includes(`/${segment}`));
      if (!excluded) files.push(...collectSourceFiles(fullPath));
      return;
    }
    if (!entry.isFile()) return;
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) return;
    files.push(fullPath);
  });
  return files;
};

describe('settings wiring', () => {
  const typesSource = fs.readFileSync(TYPES_FILE, 'utf8');
  const contextSource = fs.readFileSync(CONTEXT_FILE, 'utf8');
  const companySettingsBlock = typesSource.match(/export interface CompanySettings\s*{([\s\S]*?)^}/m)?.[1] || '';
  const companySettingsKeys = Array.from(companySettingsBlock.matchAll(/^\s*([A-Za-z0-9_]+)\??:\s/mg)).map((match) => match[1]);
  const sourceFiles = collectSourceFiles(PROJECT_ROOT);
  const runtimeFiles = sourceFiles.filter((file) =>
    file !== TYPES_FILE && file !== SETTINGS_FILE
  );
  const runtimeFilesWithoutContext = runtimeFiles.filter((file) => file !== CONTEXT_FILE);

  it('keeps the settings coverage list aligned with CompanySettings keys', () => {
    const missingFromCoverage = companySettingsKeys.filter((key) => !SETTINGS_OPTION_KEYS.includes(key as typeof SETTINGS_OPTION_KEYS[number]));
    const extraInCoverage = SETTINGS_OPTION_KEYS.filter((key) => !companySettingsKeys.includes(key));

    expect(missingFromCoverage).toEqual([]);
    expect(extraInCoverage).toEqual([]);
  });

  it('keeps all settings options declared in CompanySettings and defaultCompanySettings', () => {
    SETTINGS_OPTION_KEYS.forEach((key) => {
      expect(typesSource).toMatch(new RegExp(`\\b${escapeRegExp(key)}\\s*\\??:`, 'm'));
      expect(contextSource).toMatch(new RegExp(`\\b${escapeRegExp(key)}\\s*:`, 'm'));
    });
  });

  it('keeps every settings option connected to runtime logic', () => {
    SETTINGS_OPTION_KEYS.forEach((key) => {
      const usageOutsideContext = runtimeFilesWithoutContext.reduce((total, file) => {
        const source = fs.readFileSync(file, 'utf8');
        return total + countWholeWord(source, key);
      }, 0);
      const usageInsideContext = countWholeWord(contextSource, key);
      const isConnected = usageOutsideContext > 0 || usageInsideContext > 1;
      expect(isConnected).toBe(true);
    });
  });
});
