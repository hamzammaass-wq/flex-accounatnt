import React, { useEffect, useMemo, useState } from 'react';
import {
  Layers,
  Globe,
  Building2,
  ChevronRight,
  Building,
  Percent,
  Download,
  Save,
  Wallet,
  PackagePlus,
  Scale,
  Settings2,
  Printer,
  ShieldCheck,
  Lock,
  Upload,
  FileCheck2,
  RefreshCw,
  Wrench,
  ScanBarcode,
  Cable,
  Cloud,
  CloudUpload,
  CloudDownload
} from 'lucide-react';
import AccountsTree from './AccountsTree';
import CurrencyManager from './CurrencyManager';
import FixedAssetsManager from './FixedAssetsManager';
import TreasuryManager from './TreasuryManager';
import ItemGroupManager from './ItemGroupManager';
import UnitManager from './UnitManager';
import DataImportManager from './DataImportManager';
import FingerprintReadersManager from './FingerprintReadersManager';
import BarcodeDevicesManager from './BarcodeDevicesManager';
import DeviceHubManager from './DeviceHubManager';
import EnglishDateInput from './EnglishDateInput';
import { useAccounting } from '../contexts/AccountingContext';
import { CompanySettings, InventoryValuationMethod, PermissionAction, PermissionMatrix, PermissionModule } from '../types';
import { normalizeAppLanguage, translate } from '../utils/i18n';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { isBackupPayloadV1 } from '../utils/backupCrypto';
import {
  applyIntegritySafeFixes,
  IntegrityArea,
  IntegrityIssue,
  IntegrityReport,
  IntegritySeverity,
  runIntegrityCheck
} from '../utils/integrityCheck';

type BooleanSettingKey =
  | 'darkModeEnabled'
  | 'showTaxInInvoices'
  | 'hidePurchaseTax'
  | 'hideSalesTax'
  | 'biometricLoginEnabled'
  | 'notifyAfterAmountAdded'
  | 'alertsDesktopNotificationsEnabled'
  | 'alertsDesktopNotifySystem'
  | 'alertsDesktopNotifyManual'
  | 'alertsDesktopNotifyChecks'
  | 'alertsDesktopNotifyLowStock'
  | 'alertsDesktopNotifyExpiry'
  | 'alertsDesktopNotifyOverdueInvoices'
  | 'alertsDesktopNotifyContractExpiry'
  | 'alertsSoundEnabled'
  | 'allowNegativeSalesQuantity'
  | 'allowEditEntryDate'
  | 'journalDateLockEnabled'
  | 'voucherInvoiceAllocationEnabled'
  | 'autoAddItemPriceInInvoice'
  | 'updateSalesPriceOnInvoiceEntry'
  | 'barcodeEnabled'
  | 'invoiceExpiryDateEnabled'
  | 'printPersonalData'
  | 'printElectronicInvoice'
  | 'printStatementAllCurrencies'
  | 'statementDateAscending'
  | 'showAccountBalanceUnderVoucher'
  | 'dottedNumbers'
  | 'hideVoucherColumnInStatement'
  | 'printExpiryDate'
  | 'reportYearCloseEnabled'
  | 'strictPostedLockEnabled'
  | 'showFiscalCloseBadgeInReports'
  | 'autoFiscalYearCloseEntries'
  | 'autoFiscalYearOpeningEntries';

export type SettingsMode =
  | 'MENU'
  | 'COMPANIES'
  | 'COMPANY'
  | 'ACCOUNTS'
  | 'TAXES'
  | 'VOUCHERS_AR_AP'
  | 'OTHER_OPTIONS'
  | 'PRINT_OPTIONS'
  | 'PERMISSIONS'
  | 'AUDIT'
  | 'INTEGRITY'
  | 'BACKUP'
  | 'DATA_IMPORT'
  | 'DEVICE_HUB'
  | 'FINGERPRINT_READERS'
  | 'BARCODE_DEVICES'
  | 'CURRENCY'
  | 'ASSETS'
  | 'SYNC'
  | 'OFFLINE'
  | 'TREASURY'
  | 'ITEM_GROUPS'
  | 'UNITS'
  | 'LANGUAGE';

interface DefinitionsMenuProps {
  initialMode?: SettingsMode;
}

const coerceBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
};

const coerceNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeInventoryValuationMethod = (
  settings: Partial<Pick<CompanySettings, 'inventoryValuationMethod' | 'useAverageCosting'>>
): InventoryValuationMethod => {
  const raw = String((settings as any).inventoryValuationMethod || '').trim().toUpperCase();
  if (raw === 'FIFO' || raw === 'AVERAGE' || raw === 'STANDARD') return raw as InventoryValuationMethod;
  return settings.useAverageCosting === true ? 'AVERAGE' : 'STANDARD';
};

type BrowserNotificationPermission = NotificationPermission | 'unsupported';

const detectBrowserNotificationPermission = (): BrowserNotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
};

const withCompanyDefaults = (settings: CompanySettings): CompanySettings => {
  const valuationMethod = normalizeInventoryValuationMethod(settings);
  return {
    ...settings,
    annualLeaveDefaultOpenEndedDays: Math.max(0, coerceNumber(settings.annualLeaveDefaultOpenEndedDays, 21)),
    annualLeaveDefaultFixedTermDays: Math.max(0, coerceNumber(settings.annualLeaveDefaultFixedTermDays, 14)),
    leaveAccrualPolicy: settings.leaveAccrualPolicy === 'MONTHLY' ? 'MONTHLY' : 'ANNUAL',
    monthlyLeaveAccrualDays: Math.max(0, coerceNumber(settings.monthlyLeaveAccrualDays, 1.75)),
    lowStockAlertQtyDefault: Math.max(0, Math.floor(coerceNumber(settings.lowStockAlertQtyDefault, 5))),
    showTaxInInvoices: coerceBoolean(settings.showTaxInInvoices, true),
    hidePurchaseTax: coerceBoolean(settings.hidePurchaseTax, false),
    hideSalesTax: coerceBoolean(settings.hideSalesTax, false),
    biometricLoginEnabled: coerceBoolean(settings.biometricLoginEnabled, false),
    notifyAfterAmountAdded: coerceBoolean(settings.notifyAfterAmountAdded, true),
    alertsDesktopNotificationsEnabled: coerceBoolean((settings as any).alertsDesktopNotificationsEnabled, false),
    alertsDesktopNotifySystem: coerceBoolean((settings as any).alertsDesktopNotifySystem, true),
    alertsDesktopNotifyManual: coerceBoolean((settings as any).alertsDesktopNotifyManual, true),
    alertsDesktopNotifyChecks: coerceBoolean((settings as any).alertsDesktopNotifyChecks, true),
    alertsDesktopNotifyLowStock: coerceBoolean((settings as any).alertsDesktopNotifyLowStock, true),
    alertsDesktopNotifyExpiry: coerceBoolean((settings as any).alertsDesktopNotifyExpiry, true),
    alertsDesktopNotifyOverdueInvoices: coerceBoolean((settings as any).alertsDesktopNotifyOverdueInvoices, true),
    alertsDesktopNotifyContractExpiry: coerceBoolean((settings as any).alertsDesktopNotifyContractExpiry, true),
    alertsSoundEnabled: coerceBoolean((settings as any).alertsSoundEnabled, true),
    allowNegativeSalesQuantity: coerceBoolean(settings.allowNegativeSalesQuantity, false),
    allowEditEntryDate: coerceBoolean(settings.allowEditEntryDate, true),
    journalDateLockEnabled: coerceBoolean((settings as any).journalDateLockEnabled, false),
    journalDateLockFrom: (settings as any).journalDateLockFrom || '',
    journalDateLockTo: (settings as any).journalDateLockTo || '',
    inventoryValuationMethod: valuationMethod,
    useAverageCosting: valuationMethod === 'AVERAGE',
    voucherInvoiceAllocationEnabled: coerceBoolean(settings.voucherInvoiceAllocationEnabled, true),
    autoAddItemPriceInInvoice: coerceBoolean(settings.autoAddItemPriceInInvoice, true),
    updateSalesPriceOnInvoiceEntry: coerceBoolean(settings.updateSalesPriceOnInvoiceEntry, false),
    barcodeEnabled: coerceBoolean(settings.barcodeEnabled, true),
    invoiceExpiryDateEnabled: coerceBoolean(settings.invoiceExpiryDateEnabled, false),
    reportYearCloseEnabled: coerceBoolean(settings.reportYearCloseEnabled, true),
    strictPostedLockEnabled: coerceBoolean(settings.strictPostedLockEnabled, true),
    showFiscalCloseBadgeInReports: coerceBoolean(settings.showFiscalCloseBadgeInReports, true),
    autoFiscalYearCloseEntries: coerceBoolean((settings as any).autoFiscalYearCloseEntries, true),
    autoFiscalYearOpeningEntries: coerceBoolean((settings as any).autoFiscalYearOpeningEntries, true),
    printPersonalData: coerceBoolean(settings.printPersonalData, true),
    printElectronicInvoice: coerceBoolean(settings.printElectronicInvoice, true),
    printStatementAllCurrencies: coerceBoolean(settings.printStatementAllCurrencies, false),
    statementDateAscending: coerceBoolean(settings.statementDateAscending, true),
    statementFooterNote: settings.statementFooterNote ?? '',
    invoiceFooterNote: settings.invoiceFooterNote ?? '',
    headerTopLines: Number.isFinite(settings.headerTopLines) ? settings.headerTopLines : 0,
    debitLabel: settings.debitLabel || 'مدين',
    creditLabel: settings.creditLabel || 'دائن',
    showAccountBalanceUnderVoucher: coerceBoolean(settings.showAccountBalanceUnderVoucher, false),
    dottedNumbers: coerceBoolean(settings.dottedNumbers, false),
    hideVoucherColumnInStatement: coerceBoolean(settings.hideVoucherColumnInStatement, false),
    printExpiryDate: coerceBoolean(settings.printExpiryDate, false),
    darkModeEnabled: coerceBoolean((settings as any).darkModeEnabled, false)
  };
};

const PERMISSION_MODULES: PermissionModule[] = [
  'DASHBOARD',
  'TREASURY',
  'VOUCHERS',
  'SALES',
  'PURCHASES',
  'JOURNAL',
  'REPORTS',
  'DIRECTORY',
  'ACCOUNTS',
  'PRODUCTS',
  'HR',
  'SETTLEMENTS',
  'BANK_RECON',
  'SETTINGS'
];

const PERMISSION_ACTIONS: PermissionAction[] = ['VIEW', 'ADD', 'EDIT', 'DELETE', 'POST', 'PRINT', 'REVERSE'];

const getPermissionActionLabel = (action: PermissionAction, tr: (ar: string, en: string) => string) => {
  switch (action) {
    case 'VIEW': return tr('عرض', 'View');
    case 'ADD': return tr('إضافة', 'Add');
    case 'EDIT': return tr('تعديل', 'Edit');
    case 'DELETE': return tr('حذف', 'Delete');
    case 'POST': return tr('ترحيل', 'Post');
    case 'PRINT': return tr('طباعة', 'Print');
    case 'REVERSE': return tr('عكس', 'Reverse');
    default: return action;
  }
};

const getPermissionModuleLabel = (module: PermissionModule, tr: (ar: string, en: string) => string) => {
  switch (module) {
    case 'DASHBOARD': return tr('الرئيسية', 'Dashboard');
    case 'TREASURY': return tr('النقدية', 'Treasury');
    case 'VOUCHERS': return tr('السندات', 'Vouchers');
    case 'SALES': return tr('المبيعات', 'Sales');
    case 'PURCHASES': return tr('المشتريات', 'Purchases');
    case 'JOURNAL': return tr('القيود', 'Journal');
    case 'REPORTS': return tr('التقارير', 'Reports');
    case 'DIRECTORY': return tr('الدليل', 'Directory');
    case 'ACCOUNTS': return tr('الحسابات', 'Accounts');
    case 'PRODUCTS': return tr('الأصناف', 'Products');
    case 'HR': return tr('الموظفون', 'HR');
    case 'SETTLEMENTS': return tr('التسويات', 'Settlements');
    case 'BANK_RECON': return tr('مطابقة البنك', 'Bank Reconciliation');
    case 'SETTINGS': return tr('الإعدادات', 'Settings');
    default: return module;
  }
};

const clonePermissions = (value: PermissionMatrix): PermissionMatrix => ({
  modules: PERMISSION_MODULES.reduce((acc, module) => {
    const row = value.modules?.[module] || ({} as Record<PermissionAction, boolean>);
    acc[module] = PERMISSION_ACTIONS.reduce((actionAcc, action) => {
      if (typeof row[action] === 'boolean') {
        actionAcc[action] = row[action];
      } else if (module === 'ACCOUNTS') {
        actionAcc[action] = action !== 'DELETE';
      } else {
        actionAcc[action] = false;
      }
      return actionAcc;
    }, {} as Record<PermissionAction, boolean>);
    return acc;
  }, {} as Record<PermissionModule, Record<PermissionAction, boolean>>),
  userOverrides: value.userOverrides || {}
});

const DefinitionsMenu: React.FC<DefinitionsMenuProps> = ({ initialMode = 'MENU' }) => {
  const [mode, setMode] = useState<SettingsMode>(initialMode);
  const {
    companySettings,
    updateCompanySettings,
    companies,
    currentCompany,
    currentCompanyId,
    trialDaysLeft,
    switchCompany,
    createCompany,
    updateCompanyProfile,
    permissions,
    updatePermissions,
    exportData,
    importData,
    googleDriveStatus,
    connectGoogleDrive,
    disconnectGoogleDrive,
    uploadBackupToGoogleDrive,
    restoreFromGoogleDrive,
    runAutoBackupNow,
    auditLogs,
    appendAuditLog,
    transactions,
    invoices,
    accounts,
    products,
    checks,
    currencies,
    baseCurrency,
    importExpenseDistributions,
    setTransactions,
    setInvoices,
    setProducts,
    setImportExpenseDistributions,
    updateCheck
  } = useAccounting();
  const appLanguage = companySettings.language ?? 'AR';
  const isEnglish = appLanguage !== 'AR';
  const rtl = appLanguage === 'AR';
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(appLanguage, key, params);
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const normalizeDecimalInput = (value: string) =>
    toEnglishDigits(String(value ?? '')).replace(/\u066B/g, '.').replace(/\u066C/g, ',').replace(/\u060C/g, ',').replace(/,/g, '');

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const normalizeLanguage = (language: CompanySettings['language'] | string | undefined): CompanySettings['language'] =>
    normalizeAppLanguage(language);

  const [localCompany, setLocalCompany] = useState<CompanySettings>(() =>
    withCompanyDefaults({
      ...companySettings,
      language: normalizeLanguage(companySettings.language)
    })
  );

  useEffect(() => {
    setLocalCompany(
      withCompanyDefaults({
        ...companySettings,
        language: normalizeLanguage(companySettings.language)
      })
    );
  }, [companySettings]);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<BrowserNotificationPermission>(
    detectBrowserNotificationPermission()
  );

  const [permissionDraft, setPermissionDraft] = useState<PermissionMatrix>(() => clonePermissions(permissions));
  const [backupPassword, setBackupPassword] = useState('');
  const [backupJson, setBackupJson] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(Boolean(companySettings.autoBackupEnabled));
  const [autoBackupFrequency, setAutoBackupFrequency] = useState<'HOURLY' | 'DAILY'>(
    companySettings.autoBackupFrequency === 'HOURLY' ? 'HOURLY' : 'DAILY'
  );
  const [autoBackupPassword, setAutoBackupPassword] = useState(companySettings.autoBackupPassword || '');
  const [autoBackupKeepCount, setAutoBackupKeepCount] = useState(String(companySettings.autoBackupKeepCount || 30));
  const [googleDriveAutoUpload, setGoogleDriveAutoUpload] = useState(Boolean(companySettings.googleDriveAutoUpload));
  const [googleDriveClientId, setGoogleDriveClientId] = useState(companySettings.googleDriveClientId || '');
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState(companySettings.googleDriveFolderId || '');
  const [auditSearch, setAuditSearch] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [integrityStatus, setIntegrityStatus] = useState('');
  const [integrityBusy, setIntegrityBusy] = useState<'CHECK' | 'FIX' | null>(null);
  const [integritySeverityFilter, setIntegritySeverityFilter] = useState<'ALL' | IntegritySeverity>('ALL');
  const [integrityAreaFilter, setIntegrityAreaFilter] = useState<'ALL' | IntegrityArea>('ALL');
  const [selectedIntegrityIssueId, setSelectedIntegrityIssueId] = useState<string | null>(null);

  useEffect(() => {
    setPermissionDraft(clonePermissions(permissions));
  }, [permissions]);

  useEffect(() => {
    setAutoBackupEnabled(Boolean(companySettings.autoBackupEnabled));
    setAutoBackupFrequency(companySettings.autoBackupFrequency === 'HOURLY' ? 'HOURLY' : 'DAILY');
    setAutoBackupPassword(companySettings.autoBackupPassword || '');
    setAutoBackupKeepCount(String(companySettings.autoBackupKeepCount || 30));
    setGoogleDriveAutoUpload(Boolean(companySettings.googleDriveAutoUpload));
    setGoogleDriveClientId(companySettings.googleDriveClientId || '');
    setGoogleDriveFolderId(companySettings.googleDriveFolderId || '');
  }, [
    companySettings.autoBackupEnabled,
    companySettings.autoBackupFrequency,
    companySettings.autoBackupPassword,
    companySettings.autoBackupKeepCount,
    companySettings.googleDriveAutoUpload,
    companySettings.googleDriveClientId,
    companySettings.googleDriveFolderId
  ]);

  useEffect(() => {
    setBrowserNotificationPermission(detectBrowserNotificationPermission());
  }, [mode]);

  const runIntegrity = (overrides?: Partial<Parameters<typeof runIntegrityCheck>[0]>) => {
    const report = runIntegrityCheck({
      accounts,
      transactions,
      invoices,
      products,
      checks,
      currencies,
      baseCurrency,
      importExpenseDistributions,
      ...(overrides || {})
    });
    setIntegrityReport(report);
    return report;
  };

  const handleRunIntegrityCheck = () => {
    try {
      setIntegrityBusy('CHECK');
      const report = runIntegrity();
      setIntegrityStatus(
        report.counts.total === 0
          ? tr('لا توجد مشاكل سلامة بيانات مكتشفة.', 'No data integrity issues detected.')
          : tr('تم تنفيذ فحص سلامة البيانات بنجاح.', 'Data integrity check completed successfully.')
      );
      appendAuditLog({
        entityType: 'integrity',
        action: 'CHECK_RUN',
        screen: 'Settings > Integrity',
        metadata: { counts: report.counts }
      });
    } finally {
      setIntegrityBusy(null);
    }
  };

  const handleApplyIntegritySafeFixes = () => {
    try {
      setIntegrityBusy('FIX');
      const input = { accounts, transactions, invoices, products, checks, currencies, baseCurrency, importExpenseDistributions };
      const fix = applyIntegritySafeFixes(input);
      if (fix.counts.totalChanges === 0) {
        setIntegrityStatus(tr('لا توجد إصلاحات آمنة قابلة للتطبيق حالياً.', 'No safe fixes are applicable right now.'));
        return;
      }

      setTransactions(fix.transactions);
      setInvoices(fix.invoices);
      setProducts(fix.products);
      setImportExpenseDistributions(fix.importExpenseDistributions);
      fix.checkCurrencyPatches.forEach(p => {
        updateCheck(p.id, { currency: p.currency });
      });

      const patchedChecks = checks.map(check => {
        const patch = fix.checkCurrencyPatches.find(p => p.id === check.id);
        return patch ? { ...check, currency: patch.currency } : check;
      });

      const report = runIntegrity({
        transactions: fix.transactions,
        invoices: fix.invoices,
        products: fix.products,
        importExpenseDistributions: fix.importExpenseDistributions,
        checks: patchedChecks
      });

      setIntegrityStatus(
        tr('تم تطبيق الإصلاحات الآمنة وإعادة فحص السلامة.', 'Safe fixes applied and integrity check re-ran successfully.')
      );
      appendAuditLog({
        entityType: 'integrity',
        action: 'SAFE_FIX_APPLIED',
        screen: 'Settings > Integrity',
        metadata: { changes: fix.counts, postCheckCounts: report.counts }
      });
    } finally {
      setIntegrityBusy(null);
    }
  };

  const getIntegritySeverityLabel = (severity: IntegritySeverity) => {
    switch (severity) {
      case 'ERROR': return tr('خطأ', 'Error');
      case 'WARNING': return tr('تحذير', 'Warning');
      case 'INFO': return tr('معلومة', 'Info');
      default: return severity;
    }
  };

  const getIntegrityAreaLabel = (area: IntegrityArea) => {
    switch (area) {
      case 'ACCOUNTS': return tr('الحسابات', 'Accounts');
      case 'TRANSACTIONS': return tr('القيود', 'Transactions');
      case 'INVOICES': return tr('الفواتير', 'Invoices');
      case 'INVENTORY': return tr('المخزون', 'Inventory');
      case 'CHECKS': return tr('الشيكات', 'Checks');
      case 'IMPORT_DISTRIBUTIONS': return tr('توزيعات الاستيراد', 'Import Distributions');
      default: return area;
    }
  };

  const filteredIntegrityIssues = useMemo(() => {
    if (!integrityReport) return [] as IntegrityIssue[];
    return integrityReport.issues.filter(issue => {
      if (integritySeverityFilter !== 'ALL' && issue.severity !== integritySeverityFilter) return false;
      if (integrityAreaFilter !== 'ALL' && issue.area !== integrityAreaFilter) return false;
      return true;
    });
  }, [integrityReport, integritySeverityFilter, integrityAreaFilter]);

  const selectedIntegrityIssue = useMemo(
    () => filteredIntegrityIssues.find(i => i.id === selectedIntegrityIssueId)
      || integrityReport?.issues.find(i => i.id === selectedIntegrityIssueId)
      || null,
    [filteredIntegrityIssues, integrityReport, selectedIntegrityIssueId]
  );

  const resolveIntegrityEntityRecord = (issue: IntegrityIssue | null) => {
    if (!issue?.entityId) return null;
    switch (issue.area) {
      case 'ACCOUNTS':
        return accounts.find(a => a.id === issue.entityId) || null;
      case 'TRANSACTIONS':
        return transactions.find(t => t.id === issue.entityId) || null;
      case 'INVOICES':
        return invoices.find(i => i.id === issue.entityId) || null;
      case 'INVENTORY':
        return products.find(p => p.id === issue.entityId) || null;
      case 'CHECKS':
        return checks.find(c => c.id === issue.entityId) || null;
      case 'IMPORT_DISTRIBUTIONS':
        return importExpenseDistributions.find(d => d.id === issue.entityId) || null;
      default:
        return null;
    }
  };

  const selectedIntegrityRecord = useMemo(
    () => resolveIntegrityEntityRecord(selectedIntegrityIssue),
    [selectedIntegrityIssue, accounts, transactions, invoices, products, checks, importExpenseDistributions]
  );

  const csvEscape = (value: unknown) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportIntegrityCsv = () => {
    if (!integrityReport) return;
    const rows = [
      ['severity', 'area', 'code', 'message', 'entityId', 'entityLabel', 'fixable'],
      ...filteredIntegrityIssues.map(issue => [
        issue.severity,
        issue.area,
        issue.code,
        tr(issue.messageAr, issue.messageEn),
        issue.entityId || '',
        issue.entityLabel || '',
        issue.fixable ? 'YES' : 'NO'
      ])
    ];
    const csv = rows.map(cols => cols.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `integrity-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const exportIntegrityPdf = () => {
    if (!integrityReport) return;
    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) {
      alert(tr('تعذر فتح نافذة الطباعة.', 'Could not open print window.'));
      return;
    }
    const rowsHtml = filteredIntegrityIssues.map(issue => `
      <tr>
        <td>${escapeHtml(getIntegritySeverityLabel(issue.severity))}</td>
        <td>${escapeHtml(getIntegrityAreaLabel(issue.area))}</td>
        <td>${escapeHtml(issue.code)}</td>
        <td>${escapeHtml(tr(issue.messageAr, issue.messageEn))}</td>
        <td>${escapeHtml(issue.entityLabel || '')}${issue.entityId ? ` (${escapeHtml(issue.entityId)})` : ''}</td>
        <td>${issue.fixable ? escapeHtml(tr('نعم', 'Yes')) : escapeHtml(tr('لا', 'No'))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html lang="${appLanguage === 'AR' ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(tr('تقرير سلامة البيانات', 'Data Integrity Report'))}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          .muted { color: #64748b; font-size: 12px; margin-bottom: 12px; }
          .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
          .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; }
          .card .k { color: #64748b; font-size: 11px; font-weight: 700; }
          .card .v { font-size: 18px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; text-align: ${rtl ? 'right' : 'left'}; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(tr('تقرير سلامة البيانات', 'Data Integrity Report'))}</h1>
        <div class="muted">
          ${escapeHtml(tr('تاريخ التقرير', 'Report date'))}: ${escapeHtml(new Date(integrityReport.generatedAt).toLocaleString('en-GB'))}
          | ${escapeHtml(tr('النتائج المعروضة', 'Filtered issues'))}: ${filteredIntegrityIssues.length}
        </div>
        <div class="cards">
          <div class="card"><div class="k">${escapeHtml(tr('إجمالي', 'Total'))}</div><div class="v">${integrityReport.counts.total}</div></div>
          <div class="card"><div class="k">${escapeHtml(tr('أخطاء', 'Errors'))}</div><div class="v">${integrityReport.counts.errors}</div></div>
          <div class="card"><div class="k">${escapeHtml(tr('تحذيرات', 'Warnings'))}</div><div class="v">${integrityReport.counts.warnings}</div></div>
          <div class="card"><div class="k">${escapeHtml(tr('معلومات', 'Infos'))}</div><div class="v">${integrityReport.counts.infos}</div></div>
          <div class="card"><div class="k">${escapeHtml(tr('قابلة لإصلاح آمن', 'Safe-fixable'))}</div><div class="v">${integrityReport.counts.fixable}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(tr('الحدة', 'Severity'))}</th>
              <th>${escapeHtml(tr('النوع', 'Type'))}</th>
              <th>${escapeHtml(tr('الكود', 'Code'))}</th>
              <th>${escapeHtml(tr('الرسالة', 'Message'))}</th>
              <th>${escapeHtml(tr('المرجع', 'Reference'))}</th>
              <th>${escapeHtml(tr('إصلاح آمن', 'Safe fix'))}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="6">${escapeHtml(tr('لا توجد نتائج مطابقة للفلاتر الحالية.', 'No issues match current filters.'))}</td></tr>`}</tbody>
        </table>
      </body>
      </html>
    `;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
  };

  const saveLocalCompany = (messageAr: string, messageEn: string) => {
    const normalized = withCompanyDefaults({
      ...localCompany,
      language: normalizeLanguage(localCompany.language)
    });
    const result = updateCompanySettings(normalized);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert(tr(messageAr, messageEn));
  };

  const toggleSetting = (key: BooleanSettingKey) => {
    setLocalCompany(prev => ({
      ...prev,
      [key]: !coerceBoolean(prev[key], false)
    }));
  };

  const requestBrowserNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert(tr('هذا المتصفح لا يدعم إشعارات سطح المكتب.', 'This browser does not support desktop notifications.'));
      setBrowserNotificationPermission('unsupported');
      return;
    }

    try {
      const permission = await window.Notification.requestPermission();
      setBrowserNotificationPermission(permission);
      if (permission === 'granted') {
        setLocalCompany(prev => ({ ...prev, alertsDesktopNotificationsEnabled: true }));
        alert(tr('تم تفعيل إذن الإشعارات بنجاح.', 'Notifications permission granted successfully.'));
      } else if (permission === 'denied') {
        alert(tr('تم رفض إذن الإشعارات. يمكنك تفعيله من إعدادات المتصفح.', 'Notifications permission denied. You can enable it from browser settings.'));
      }
    } catch {
      alert(tr('تعذر طلب إذن الإشعارات.', 'Could not request notification permission.'));
    }
  };

  const togglePermission = (module: PermissionModule, action: PermissionAction) => {
    setPermissionDraft(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [module]: {
          ...(prev.modules[module] || {}),
          [action]: !Boolean(prev.modules[module]?.[action])
        }
      }
    }));
  };

  const handleSavePermissions = () => {
    const result = updatePermissions(clonePermissions(permissionDraft));
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert(tr('تم حفظ الصلاحيات بنجاح', 'Permissions saved successfully.'));
  };

  const handleCreateBackup = async () => {
    if (!backupPassword.trim()) {
      setBackupStatus(tr('يرجى إدخال كلمة مرور للنسخة', 'Please provide a backup password.'));
      return;
    }
    const payload = await exportData(backupPassword.trim());
    if (!payload) {
      setBackupStatus(tr('تعذر إنشاء النسخة الاحتياطية', 'Could not create backup.'));
      return;
    }

    const content = JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `aiflex-erp-backup-${payload.createdAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);

    setBackupJson(content);
    setBackupStatus(tr('تم إنشاء النسخة الاحتياطية بنجاح', 'Backup created successfully.'));
  };

  const handleValidateBackup = async () => {
    if (!backupJson.trim()) {
      setBackupStatus(tr('ألصق محتوى النسخة للتحقق', 'Paste backup content to validate.'));
      return;
    }

    try {
      const parsed = JSON.parse(backupJson);
      const valid = isBackupPayloadV1(parsed);

      setBackupStatus(
        valid
          ? tr('صيغة النسخة صحيحة وجاهزة للاسترجاع', 'Backup format is valid and ready to restore.')
          : tr('ملف النسخة غير صحيح', 'Backup payload format is invalid.')
      );
    } catch {
      setBackupStatus(tr('تعذر قراءة JSON للنسخة', 'Backup JSON is invalid.'));
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupJson.trim()) {
      setBackupStatus(tr('ألصق محتوى النسخة أولاً', 'Paste backup content first.'));
      return;
    }
    if (!backupPassword.trim()) {
      setBackupStatus(tr('يرجى إدخال كلمة المرور للاسترجاع', 'Enter password to restore backup.'));
      return;
    }

    const ok = await importData(backupJson, backupPassword.trim());
    setBackupStatus(
      ok
        ? tr('تم استرجاع النسخة بنجاح', 'Backup restored successfully.')
        : tr('فشل الاسترجاع: تحقق من الملف وكلمة المرور', 'Restore failed. Check password and backup content.')
    );
  };

  const handleBackupFilePicked = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      setBackupJson(text);
      setBackupStatus(tr('تم تحميل ملف النسخة. يمكنك الآن الفحص أو الاسترجاع.', 'Backup file loaded. You can now validate or restore.'));
    } catch {
      setBackupStatus(tr('تعذر قراءة ملف النسخة المختار.', 'Could not read selected backup file.'));
    }
  };

  const handleSaveBackupSettings = () => {
    const keepCount = Math.max(1, Math.min(200, Math.floor(Number(autoBackupKeepCount) || 30)));
    if (autoBackupEnabled && autoBackupPassword.trim().length < 4) {
      setBackupStatus(tr('كلمة مرور النسخ التلقائي يجب أن تكون 4 أحرف على الأقل.', 'Auto backup password must be at least 4 characters.'));
      return;
    }
    if (googleDriveAutoUpload && !googleDriveClientId.trim()) {
      setBackupStatus(tr('أدخل Google OAuth Client ID لتفعيل الرفع التلقائي.', 'Enter Google OAuth Client ID to enable auto upload.'));
      return;
    }

    const result = updateCompanySettings({
      ...companySettings,
      autoBackupEnabled,
      autoBackupFrequency,
      autoBackupPassword: autoBackupPassword.trim(),
      autoBackupKeepCount: keepCount,
      googleDriveAutoUpload,
      googleDriveClientId: googleDriveClientId.trim(),
      googleDriveFolderId: googleDriveFolderId.trim()
    });

    if (!result.ok) {
      setBackupStatus(result.message);
      return;
    }
    setBackupStatus(tr('تم حفظ إعدادات النسخ الاحتياطي.', 'Backup settings saved.'));
  };

  const handleRunAutoBackupNow = async () => {
    const result = await runAutoBackupNow();
    setBackupStatus(
      result.ok
        ? tr('تم تنفيذ النسخ الاحتياطي التلقائي الآن.', 'Automatic backup executed now.')
        : result.message
    );
  };

  const handleConnectGoogleDrive = async () => {
    const result = await connectGoogleDrive();
    setBackupStatus(
      result.ok
        ? tr('تم ربط Google Drive بنجاح.', 'Google Drive connected successfully.')
        : result.message
    );
  };

  const handleUploadBackupToDrive = async () => {
    if (!backupJson.trim()) {
      setBackupStatus(tr('أنشئ نسخة أو ألصق JSON قبل الرفع إلى Google Drive.', 'Create or paste backup JSON before uploading to Google Drive.'));
      return;
    }
    try {
      const parsed = JSON.parse(backupJson);
      if (!isBackupPayloadV1(parsed)) {
        setBackupStatus(tr('محتوى النسخة غير صالح للرفع.', 'Backup payload is invalid for upload.'));
        return;
      }
      const result = await uploadBackupToGoogleDrive(parsed);
      setBackupStatus(
        result.ok
          ? tr('تم رفع النسخة إلى Google Drive.', 'Backup uploaded to Google Drive.')
          : result.message
      );
    } catch {
      setBackupStatus(tr('JSON النسخة غير صالح.', 'Backup JSON is invalid.'));
    }
  };

  const handleRestoreFromDrive = async () => {
    if (!backupPassword.trim()) {
      setBackupStatus(tr('أدخل كلمة المرور قبل الاسترجاع من Google Drive.', 'Enter password before restoring from Google Drive.'));
      return;
    }
    const result = await restoreFromGoogleDrive(backupPassword.trim());
    setBackupStatus(
      result.ok
        ? tr('تم الاسترجاع من أحدث نسخة على Google Drive.', 'Restored from latest Google Drive backup.')
        : result.message
    );
  };

  const handleSwitchCompany = (companyId: string) => {
    const result = switchCompany(companyId);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert(tr('تم الانتقال إلى الشركة المحددة', 'Switched to selected company.'));
  };

  const handleCreateCompany = async () => {
    const result = await createCompany({ name: newCompanyName.trim() });
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setNewCompanyName('');
    alert(tr('تم إنشاء الشركة بنجاح', 'Company created successfully.'));
  };

  const handleLogoFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(tr('يرجى اختيار ملف صورة صالح', 'Please select an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLocalCompany(prev => ({
        ...prev,
        logoUrl: typeof reader.result === 'string' ? reader.result : prev.logoUrl
      }));
    };
    reader.readAsDataURL(file);
  };

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return auditLogs;
    return auditLogs.filter(log => {
      const stack = [
        log.action,
        log.entityType,
        log.entityId,
        log.userName,
        log.screen,
        JSON.stringify(log.metadata || {})
      ]
        .join(' ')
        .toLowerCase();
      return stack.includes(query);
    });
  }, [auditLogs, auditSearch]);

  const renderCompaniesForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">
        {tr('الشركة الحالية', 'Current company')}: {currentCompany?.name || '-'} | {tr('التجربة المتبقية', 'Trial left')}: {trialDaysLeft} {tr('يوم', 'day(s)')}
      </div>

      <div className="space-y-2">
        {companies.map(company => (
          <div key={company.id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className={rtl ? 'text-right min-w-0' : 'text-left min-w-0'}>
              <p className="text-sm font-black text-slate-800 truncate">{company.name}</p>
              <p className="text-[11px] font-bold text-gray-400">
                {tr('تنتهي التجربة', 'Trial ends')}: {new Date(company.trialEndsAt).toLocaleDateString('en-GB')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchCompany(company.id)}
              className={`px-3 py-2 rounded-lg text-xs font-black ${company.id === currentCompanyId ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white'
                }`}
            >
              {company.id === currentCompanyId ? tr('مفعلة', 'Active') : tr('تبديل', 'Switch')}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <label className="block text-xs font-bold text-gray-500">{tr('إضافة شركة جديدة', 'Add new company')}</label>
        <div className="flex gap-2">
          <input
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold"
            placeholder={tr('اسم الشركة', 'Company name')}
          />
          <button
            type="button"
            onClick={handleCreateCompany}
            className="px-4 rounded-xl bg-blue-600 text-white text-xs font-black"
          >
            {tr('إضافة', 'Add')}
          </button>
        </div>
      </div>
    </div>
  );

  const renderCompanyForm = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveLocalCompany('تم حفظ بيانات الشركة بنجاح', 'Company data saved successfully.');
        const result = updateCompanyProfile(currentCompanyId, {
          name: localCompany.name,
          taxNumber: localCompany.taxNumber,
          address: localCompany.address,
          phone: localCompany.phone,
          logoUrl: localCompany.logoUrl
        });
        if (!result.ok) {
          alert(result.message);
        }
      }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in"
    >
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
          {localCompany.logoUrl ? (
            <img src={localCompany.logoUrl} alt={tr('شعار الشركة', 'Company logo')} className="w-full h-full object-contain bg-white p-2" />
          ) : (
            <Building className="w-6 h-6 text-gray-400" />
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 mb-1">{tr('شعار الشركة', 'Company logo')}</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleLogoFile(e.target.files?.[0] || null)}
            className="w-full text-xs font-bold text-gray-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">{t('settings.companyName')}</label>
        <input
          type="text"
          value={localCompany.name}
          onChange={(e) => setLocalCompany({ ...localCompany, name: e.target.value })}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">{t('settings.taxNumber')}</label>
        <input
          type="text"
          value={localCompany.taxNumber}
          onChange={(e) => setLocalCompany({ ...localCompany, taxNumber: e.target.value })}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">{tr('العنوان', 'Address')}</label>
        <input
          type="text"
          value={localCompany.address}
          onChange={(e) => setLocalCompany({ ...localCompany, address: e.target.value })}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">{tr('الهاتف', 'Phone')}</label>
        <input
          type="text"
          value={localCompany.phone}
          onChange={(e) => setLocalCompany({ ...localCompany, phone: e.target.value })}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none dir-ltr"
        />
      </div>
      <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <Save className="w-5 h-5" />
        {t('settings.save')}
      </button>
    </form>
  );

  const renderLanguageForm = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveLocalCompany('تم حفظ اللغة بنجاح', 'Language updated successfully.');
      }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in"
    >
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">{t('settings.languageField')}</label>
        <select
          value={normalizeLanguage(localCompany.language)}
          onChange={(e) => setLocalCompany({ ...localCompany, language: e.target.value as CompanySettings['language'] })}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-bold"
        >
          <option value="AR">{t('settings.optionArabic')}</option>
          <option value="EN">{t('settings.optionEnglish')}</option>
        </select>
      </div>
      <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <Save className="w-5 h-5" />
        {t('settings.saveLanguage')}
      </button>
    </form>
  );

  const renderTaxesForm = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveLocalCompany('تم حفظ إعدادات الضريبة بنجاح', 'Tax settings saved successfully.');
      }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in"
    >
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">
          {tr('نسبة الضريبة الافتراضية (%)', 'Default Tax Rate (%)')}
        </label>
        <input
          type="text"
          inputMode="decimal"
          lang="en"
          dir="ltr"
          value={Number(localCompany.defaultTaxRate) > 0 ? String(localCompany.defaultTaxRate) : ''}
          onChange={(e) => {
            const normalized = normalizeDecimalInput(e.target.value);
            setLocalCompany({
              ...localCompany,
              defaultTaxRate: Math.max(0, Number(normalized) || 0)
            });
          }}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none dir-ltr"
        />
      </div>

      <ToggleRow
        label={tr('إظهار الضريبة في الفواتير', 'Show tax in invoices')}
        description={tr('إظهار حقول الضريبة داخل شاشة الفواتير والطباعة', 'Show tax fields in invoice screen and print output')}
        checked={localCompany.showTaxInInvoices}
        rtl={rtl}
        onToggle={() => toggleSetting('showTaxInInvoices')}
      />

      <ToggleRow
        label={tr('إخفاء الضريبة من المشتريات', 'Hide tax in purchase invoices')}
        description={tr('إخفاء حقول الضريبة داخل فواتير المشتريات', 'Hide tax fields in purchase invoices')}
        checked={coerceBoolean(localCompany.hidePurchaseTax, false)}
        rtl={rtl}
        onToggle={() => toggleSetting('hidePurchaseTax')}
      />

      <ToggleRow
        label={tr('إخفاء الضريبة من المبيعات', 'Hide tax in sales invoices')}
        description={tr('إخفاء حقول الضريبة داخل فواتير المبيعات', 'Hide tax fields in sales invoices')}
        checked={coerceBoolean(localCompany.hideSalesTax, false)}
        rtl={rtl}
        onToggle={() => toggleSetting('hideSalesTax')}
      />

      <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <Save className="w-5 h-5" />
        {t('settings.save')}
      </button>
    </form>
  );

  const renderVouchersArApForm = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveLocalCompany('تم حفظ إعدادات السندات والذمم بنجاح', 'Voucher & receivables settings saved successfully.');
      }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in"
    >
      <ToggleRow
        label={tr('تخصيص السداد على الفواتير (سندات القبض/الصرف)', 'Enable voucher allocation to invoices')}
        description={tr(
          'إظهار قسم تخصيص السداد داخل سندات القبض/الصرف وربط السند بالفواتير الآجلة.',
          'Show invoice allocation section in receipt/payment vouchers and link vouchers to open invoices.'
        )}
        checked={coerceBoolean(localCompany.voucherInvoiceAllocationEnabled, true)}
        rtl={rtl}
        onToggle={() => toggleSetting('voucherInvoiceAllocationEnabled')}
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
        {tr(
          'عند التفعيل: يتم احتساب المتبقي على الفواتير بشكل أدق عند تخصيص السندات على الفواتير.',
          'When enabled, invoice remaining balances are tracked more accurately using voucher allocations.'
        )}
      </div>

      <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <Save className="w-5 h-5" />
        {t('settings.save')}
      </button>
    </form>
  );

  const renderOtherOptionsForm = () => {
    const options: Array<{ key: BooleanSettingKey; ar: string; en: string }> = [
      { key: 'biometricLoginEnabled', ar: 'الدخول بالبصمة', en: 'Biometric login' },
      { key: 'notifyAfterAmountAdded', ar: 'إظهار الإشعار بعد إضافة المبلغ', en: 'Show notification after adding amount' },
      { key: 'alertsDesktopNotificationsEnabled', ar: 'إرسال إشعار سطح المكتب للتنبيهات', en: 'Send desktop notification for alerts' },
      { key: 'alertsDesktopNotifySystem', ar: 'إشعارات تنبيهات النظام', en: 'Desktop notifications for system alerts' },
      { key: 'alertsDesktopNotifyManual', ar: 'إشعارات التنبيهات اليدوية', en: 'Desktop notifications for manual alerts' },
      { key: 'allowNegativeSalesQuantity', ar: 'البيع بالكمية سالب', en: 'Allow negative sales quantity' },
      { key: 'allowEditEntryDate', ar: 'تعديل تاريخ العملية في القيود', en: 'Allow editing entry date' },
      { key: 'journalDateLockEnabled', ar: 'قفل تاريخ القيود بفترة', en: 'Lock journal dates by period' },
      { key: 'autoAddItemPriceInInvoice', ar: 'إضافة سعر الصنف تلقائياً في الفاتورة', en: 'Auto-fill item price in invoice' },
      { key: 'updateSalesPriceOnInvoiceEntry', ar: 'تحديث أسعار البيع عند إدخال الفاتورة', en: 'Update sales price when posting invoice' },
      { key: 'barcodeEnabled', ar: 'تفعيل الباركود', en: 'Enable barcode' },
      { key: 'invoiceExpiryDateEnabled', ar: 'تاريخ الإنتهاء في الفواتير', en: 'Enable expiry date in invoices' },
      { key: 'reportYearCloseEnabled', ar: 'تصفير إيراد/مصروف مع بداية كل سنة (تقارير)', en: 'Yearly report close for P&L balances' },
      { key: 'strictPostedLockEnabled', ar: 'منع تعديل/حذف القيود المرحلة', en: 'Strict lock after posting' },
      { key: 'showFiscalCloseBadgeInReports', ar: 'إظهار حالة الإقفال في رأس التقارير', en: 'Show fiscal close badge in reports' },
      { key: 'autoFiscalYearCloseEntries', ar: 'ترحيل قيود الإقفال السنوي تلقائياً', en: 'Auto-post year-end closing entries' },
      { key: 'autoFiscalYearOpeningEntries', ar: 'ترحيل القيود الافتتاحية تلقائياً', en: 'Auto-post opening entries yearly' }
    ];
    const permissionLabel =
      browserNotificationPermission === 'granted'
        ? tr('مفعل', 'Granted')
        : browserNotificationPermission === 'denied'
          ? tr('مرفوض', 'Denied')
          : browserNotificationPermission === 'default'
            ? tr('غير محدد', 'Not requested')
            : tr('غير مدعوم', 'Unsupported');
    const permissionClass =
      browserNotificationPermission === 'granted'
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : browserNotificationPermission === 'denied'
          ? 'bg-rose-100 text-rose-700 border-rose-200'
          : browserNotificationPermission === 'default'
            ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-slate-100 text-slate-600 border-slate-200';

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveLocalCompany('تم حفظ الخيارات الأخرى بنجاح', 'Other options saved successfully.');
        }}
        className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3 animate-in fade-in"
      >
        <ToggleRow
          label={tr('تشغيل الوضع الداكن', 'Enable dark mode')}
          description={tr('يطبّق مظهرًا داكنًا على أغلب شاشات التطبيق بعد حفظ الإعدادات.', 'Applies a dark appearance across most app screens after saving settings.')}
          checked={coerceBoolean(localCompany.darkModeEnabled, false)}
          rtl={rtl}
          onToggle={() => toggleSetting('darkModeEnabled')}
        />

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
          <div className="text-xs font-black text-indigo-700">
            {tr('تنبيه نقص المخزون (إعداد عام)', 'Low Stock Alert (Global Setting)')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{tr('حد تنبيه نقص المخزون العام (كمية)', 'Global low stock alert threshold (qty)')}</label>
              <input
                type="number"
                min={0}
                step={1}
                value={Number(localCompany.lowStockAlertQtyDefault) > 0 ? String(localCompany.lowStockAlertQtyDefault) : ''}
                onChange={(e) =>
                  setLocalCompany({
                    ...localCompany,
                    lowStockAlertQtyDefault: Math.max(0, Math.floor(Number(e.target.value) || 0))
                  })
                }
                className="w-full p-3 bg-white rounded-xl border border-indigo-100 outline-none"
              />
            </div>
            <div className="flex items-center px-3 rounded-xl border border-indigo-100 bg-white text-[11px] font-bold text-indigo-700">
              {tr('يُستخدم كحد افتراضي للصنف عند ترك \"حد تنبيه نفاد المخزون\" فارغًا.', 'Used as the default item threshold when the per-item low-stock alert is left empty.')}
            </div>
          </div>
          <p className="text-[11px] font-bold text-indigo-600/80">
            {tr('يُستخدم هذا الحد كقيمة افتراضية لجميع الأصناف التي لا تحتوي حد نقص مخزون خاص بها.', 'This threshold is used as a default for items that do not have a custom low-stock threshold.')}
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
          <div className="text-xs font-black text-blue-700">
            {tr('طريقة تقييم المخزون', 'Inventory valuation method')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">{tr('الطريقة المحاسبية', 'Costing method')}</label>
              <select
                value={(localCompany.inventoryValuationMethod || 'STANDARD') as InventoryValuationMethod}
                onChange={(e) => {
                  const method = (e.target.value as InventoryValuationMethod) || 'STANDARD';
                  setLocalCompany(prev => ({
                    ...prev,
                    inventoryValuationMethod: method,
                    useAverageCosting: method === 'AVERAGE'
                  }));
                }}
                className={`w-full p-3 bg-white rounded-xl border border-blue-100 outline-none font-bold text-sm ${rtl ? 'text-right' : 'text-left'}`}
              >
                <option value="STANDARD">{tr('التكلفة الثابتة', 'Standard Cost')}</option>
                <option value="AVERAGE">{tr('متوسط التكلفة المرجّح', 'Weighted Average')}</option>
                <option value="FIFO">FIFO (First In, First Out)</option>
              </select>
            </div>
            <div className="flex items-center px-3 rounded-xl border border-blue-100 bg-white text-[11px] font-bold text-blue-700">
              {tr(
                'FIFO: أقدم دفعة شراء تُصرف أولاً. المتوسط: تحديث تكلفة الصنف تلقائياً مع كل شراء.',
                'FIFO: oldest purchase layer is consumed first. Average: item cost is recalculated on each purchase.'
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black text-blue-700">
              {tr('إشعارات المتصفح للتنبيهات', 'Browser notifications for alerts')}
            </div>
            <span className={`px-2 py-1 rounded-lg border text-[10px] font-black ${permissionClass}`}>
              {permissionLabel}
            </span>
          </div>
          <p className="text-[11px] font-bold text-blue-700/80">
            {tr(
              'فعّل إذن المتصفح أولاً ثم احفظ الإعدادات لتبدأ إشعارات التنبيهات (النظام/اليدوي) بالظهور.',
              'Grant browser permission first, then save settings to start alert notifications (system/manual).'
            )}
          </p>
          <button
            type="button"
            onClick={requestBrowserNotificationPermission}
            className="px-4 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-black"
          >
            {tr('طلب إذن الإشعارات', 'Request notifications permission')}
          </button>
        </div>

        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 space-y-2.5">
          <div className="text-xs font-black text-sky-700">
            {tr('تخصيص أنواع تنبيهات الإشعار', 'Notification categories customization')}
          </div>
          <div className="grid grid-cols-2 gap-2">
          <ToggleRow
            label={tr('صوت تنبيه للتنبيهات', 'Alert sound for notifications')}
            description={tr('تشغيل/إيقاف صوت تنبيه مستقل عن إشعار سطح المكتب.', 'Enable/disable alert sound independently from desktop notification.')}
            checked={coerceBoolean(localCompany.alertsSoundEnabled, true)}
            rtl={rtl}
            compact
            onToggle={() => toggleSetting('alertsSoundEnabled')}
          />
          {!coerceBoolean(localCompany.alertsDesktopNotificationsEnabled, false) && (
            <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
              {tr(
                'ملاحظة: الإشعارات العامة معطلة حاليًا. فعّل خيار "إرسال إشعار سطح المكتب للتنبيهات" أولًا.',
                'Note: desktop notifications are currently disabled. Enable "Send desktop notification for alerts" first.'
              )}
            </div>
          )}
          <ToggleRow
            label={tr('شيكات مستحقة/متأخرة', 'Due/overdue checks')}
            description={tr('إرسال إشعار عند الشيكات القريبة أو المستحقة.', 'Send notification when checks are near due or overdue.')}
            checked={coerceBoolean(localCompany.alertsDesktopNotifyChecks, true)}
            rtl={rtl}
            compact
            onToggle={() => toggleSetting('alertsDesktopNotifyChecks')}
          />
          <ToggleRow
            label={tr('نقص المخزون واطلب الآن', 'Low stock / order now')}
            description={tr('إرسال إشعار عند الوصول لحد المخزون أو الصفر.', 'Send notification when item stock reaches threshold or zero.')}
            checked={coerceBoolean(localCompany.alertsDesktopNotifyLowStock, true)}
            rtl={rtl}
            compact
            onToggle={() => toggleSetting('alertsDesktopNotifyLowStock')}
          />
          <ToggleRow
            label={tr('قرب/انتهاء صلاحية الأصناف', 'Item near-expiry/expired')}
            description={tr('إرسال إشعار عند قرب أو انتهاء الصلاحية.', 'Send notification for near-expiry and expired items.')}
            checked={coerceBoolean(localCompany.alertsDesktopNotifyExpiry, true)}
            rtl={rtl}
            compact
            onToggle={() => toggleSetting('alertsDesktopNotifyExpiry')}
          />
          <ToggleRow
            label={tr('الفواتير الآجلة المتأخرة', 'Overdue credit invoices')}
            description={tr('إرسال إشعار للفواتير الآجلة التي تجاوزت الاستحقاق.', 'Send notification for credit invoices past due date.')}
            checked={coerceBoolean(localCompany.alertsDesktopNotifyOverdueInvoices, true)}
            rtl={rtl}
            compact
            onToggle={() => toggleSetting('alertsDesktopNotifyOverdueInvoices')}
          />
          <ToggleRow
            label={tr('انتهاء عقود الموظفين', 'Employee contract expiry')}
            description={tr('إرسال إشعار عند قرب نهاية عقد موظف.', 'Send notification when an employee contract is near expiry.')}
            checked={coerceBoolean(localCompany.alertsDesktopNotifyContractExpiry, true)}
            rtl={rtl}
            compact
            onToggle={() => toggleSetting('alertsDesktopNotifyContractExpiry')}
          />
        </div>
        </div>

        {options.map((opt) => (
          <ToggleRow
            key={opt.key}
            label={tr(opt.ar, opt.en)}
            checked={coerceBoolean(localCompany[opt.key], false)}
            rtl={rtl}
            onToggle={() => toggleSetting(opt.key)}
          />
        ))}

        {coerceBoolean((localCompany as any).journalDateLockEnabled, false) && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 space-y-3">
            <div className="text-xs font-black text-amber-700">
              {tr('فترة السماح لتاريخ القيود اليومية', 'Allowed period for journal entry dates')}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">{tr('من تاريخ', 'From date')}</label>
                <EnglishDateInput
                  value={(localCompany as any).journalDateLockFrom || ''}
                  onChange={(value) => setLocalCompany(prev => ({ ...(prev as any), journalDateLockFrom: value }))}
                  className="w-full p-3 bg-white rounded-xl border border-amber-100 outline-none dir-ltr"
                  aria-label={tr('من تاريخ قفل القيود', 'Journal lock from date')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">{tr('إلى تاريخ', 'To date')}</label>
                <EnglishDateInput
                  value={(localCompany as any).journalDateLockTo || ''}
                  onChange={(value) => setLocalCompany(prev => ({ ...(prev as any), journalDateLockTo: value }))}
                  className="w-full p-3 bg-white rounded-xl border border-amber-100 outline-none dir-ltr"
                  aria-label={tr('إلى تاريخ قفل القيود', 'Journal lock to date')}
                />
              </div>
            </div>
            <p className="text-[11px] font-bold text-amber-700/80">
              {tr(
                'إذا تُرك أحد الحقلين فارغًا فسيتم اعتباره مفتوحًا من تلك الجهة (مثال: فقط من تاريخ).',
                'If one boundary is empty it is treated as open-ended (e.g. only a start date).'
              )}
            </p>
          </div>
        )}
        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2">
          <Save className="w-5 h-5" />
          {t('settings.save')}
        </button>
      </form>
    );
  };

  const renderPrintOptionsForm = () => {
    const printToggleOptions: Array<{ key: BooleanSettingKey; ar: string; en: string }> = [
      { key: 'printPersonalData', ar: 'طباعة البيانات الشخصية', en: 'Print personal data' },
      { key: 'printElectronicInvoice', ar: 'طباعة الفاتورة الإلكترونية', en: 'Print as electronic invoice' },
      { key: 'printStatementAllCurrencies', ar: 'طبع كشف الحساب بجميع العملات', en: 'Print statement in all currencies' },
      { key: 'statementDateAscending', ar: 'ترتيب التاريخ تصاعدياً', en: 'Sort dates ascending' },
      { key: 'showAccountBalanceUnderVoucher', ar: 'إظهار رصيد الحساب أسفل السند', en: 'Show account balance below voucher' },
      { key: 'dottedNumbers', ar: 'تنقيط الأرقام', en: 'Use dotted number separators' },
      { key: 'hideVoucherColumnInStatement', ar: 'إخفاء عمود السند في الكشف', en: 'Hide voucher column in statement' },
      { key: 'printExpiryDate', ar: 'طباعة تاريخ الإنتهاء', en: 'Print expiry date' },
    ];

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveLocalCompany('تم حفظ خيارات الطباعة بنجاح', 'Print options saved successfully.');
        }}
        className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3 animate-in fade-in"
      >
        {printToggleOptions.map((opt) => (
          <ToggleRow
            key={opt.key}
            label={tr(opt.ar, opt.en)}
            checked={coerceBoolean(localCompany[opt.key], false)}
            rtl={rtl}
            onToggle={() => toggleSetting(opt.key)}
          />
        ))}

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">{tr('ملاحظة أسفل كشف الحساب', 'Statement footer note')}</label>
            <textarea
              rows={2}
              value={localCompany.statementFooterNote}
              onChange={(e) => setLocalCompany({ ...localCompany, statementFooterNote: e.target.value })}
              className="w-full p-2 bg-white rounded-lg border border-gray-200 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">{tr('ملاحظة أسفل الفاتورة', 'Invoice footer note')}</label>
            <textarea
              rows={2}
              value={localCompany.invoiceFooterNote}
              onChange={(e) => setLocalCompany({ ...localCompany, invoiceFooterNote: e.target.value })}
              className="w-full p-2 bg-white rounded-lg border border-gray-200 outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('عدد الأسطر أعلى الصفحة', 'Top blank lines')}</label>
              <input
                type="number"
                min={0}
                value={Number(localCompany.headerTopLines) > 0 ? String(localCompany.headerTopLines) : ''}
                onChange={(e) => setLocalCompany({ ...localCompany, headerTopLines: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full p-2 bg-white rounded-lg border border-gray-200 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('مدين', 'Debit label')}</label>
              <input
                type="text"
                value={localCompany.debitLabel}
                onChange={(e) => setLocalCompany({ ...localCompany, debitLabel: e.target.value })}
                className="w-full p-2 bg-white rounded-lg border border-gray-200 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('دائن', 'Credit label')}</label>
              <input
                type="text"
                value={localCompany.creditLabel}
                onChange={(e) => setLocalCompany({ ...localCompany, creditLabel: e.target.value })}
                className="w-full p-2 bg-white rounded-lg border border-gray-200 outline-none text-sm"
              />
            </div>
          </div>
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2">
          <Save className="w-5 h-5" />
          {t('settings.save')}
        </button>
      </form>
    );
  };

  const renderPermissionsForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-800">{tr('مصفوفة الصلاحيات', 'Permissions Matrix')}</h3>
        <button
          type="button"
          onClick={handleSavePermissions}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {tr('حفظ الصلاحيات', 'Save Permissions')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-[780px] w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-right font-black text-gray-500">{tr('الوحدة', 'Module')}</th>
              {PERMISSION_ACTIONS.map(action => (
                <th key={action} className="p-3 text-center font-black text-gray-500">
                  {getPermissionActionLabel(action, tr)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map(module => (
              <tr key={module} className="border-t border-gray-100">
                <td className="p-3 font-black text-gray-700">{getPermissionModuleLabel(module, tr)}</td>
                {PERMISSION_ACTIONS.map(action => (
                  <td key={action} className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => togglePermission(module, action)}
                      className={`w-8 h-8 rounded-lg text-[10px] font-black ${permissionDraft.modules[module]?.[action]
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                        }`}
                    >
                      {permissionDraft.modules[module]?.[action] ? tr('نعم', 'ON') : tr('لا', 'OFF')}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBackupForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <h3 className="text-sm font-black text-gray-800">{tr('النسخ الاحتياطي المشفر', 'Encrypted Backup')}</h3>
      <div className="rounded-xl border border-gray-100 p-3 space-y-3 bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-800">{tr('إعدادات النسخ التلقائي', 'Automatic backup settings')}</p>
          <button
            type="button"
            onClick={() => setAutoBackupEnabled(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black ${autoBackupEnabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
          >
            {autoBackupEnabled ? tr('مفعل', 'Enabled') : tr('متوقف', 'Disabled')}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">{tr('التكرار', 'Frequency')}</label>
            <select
              value={autoBackupFrequency}
              onChange={(e) => setAutoBackupFrequency(e.target.value === 'HOURLY' ? 'HOURLY' : 'DAILY')}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none"
            >
              <option value="DAILY">{tr('يومي', 'Daily')}</option>
              <option value="HOURLY">{tr('كل ساعة', 'Hourly')}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">{tr('عدد النسخ المحتفظ بها', 'Kept copies')}</label>
            <input
              value={autoBackupKeepCount}
              onChange={(e) => setAutoBackupKeepCount(e.target.value.replace(/[^\d]/g, ''))}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none"
              placeholder="30"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1">{tr('كلمة مرور النسخ التلقائي', 'Auto backup password')}</label>
          <input
            type="password"
            value={autoBackupPassword}
            onChange={(e) => setAutoBackupPassword(e.target.value)}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none"
            placeholder={tr('مطلوبة عند التفعيل (4 أحرف على الأقل)', 'Required when enabled (min 4 chars)')}
          />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-black text-gray-700">{tr('Google Drive', 'Google Drive')}</p>
            <button
              type="button"
              onClick={() => setGoogleDriveAutoUpload(v => !v)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black ${googleDriveAutoUpload ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
            >
              {googleDriveAutoUpload ? tr('رفع تلقائي مفعل', 'Auto upload on') : tr('رفع تلقائي متوقف', 'Auto upload off')}
            </button>
          </div>
          <input
            value={googleDriveClientId}
            onChange={(e) => setGoogleDriveClientId(e.target.value)}
            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-mono outline-none"
            placeholder={tr('Google OAuth Client ID', 'Google OAuth Client ID')}
          />
          <input
            value={googleDriveFolderId}
            onChange={(e) => setGoogleDriveFolderId(e.target.value)}
            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-mono outline-none"
            placeholder={tr('Folder ID (اختياري)', 'Folder ID (optional)')}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSaveBackupSettings}
            className="py-2 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {tr('حفظ إعدادات النسخ', 'Save backup settings')}
          </button>
          <button
            type="button"
            onClick={handleRunAutoBackupNow}
            className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {tr('تنفيذ نسخة تلقائية الآن', 'Run auto backup now')}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 font-bold">
          {tr('آخر تنفيذ تلقائي', 'Last automatic run')}: {companySettings.autoBackupLastRunAt ? new Date(companySettings.autoBackupLastRunAt).toLocaleString('en-GB') : '-'}
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-gray-700 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-600" />
            {tr('حالة Google Drive', 'Google Drive status')}
          </p>
          <span className={`text-[11px] font-black ${googleDriveStatus.isConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
            {googleDriveStatus.isConnected ? tr('متصل', 'Connected') : tr('غير متصل', 'Not connected')}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 font-bold">
          {tr('الحساب', 'Account')}: {googleDriveStatus.userEmail || '-'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <button type="button" onClick={handleConnectGoogleDrive} className="py-2 rounded-lg bg-sky-600 text-white text-xs font-black flex items-center justify-center gap-2">
            <Cloud className="w-4 h-4" />
            {tr('ربط Google Drive', 'Connect Google Drive')}
          </button>
          <button type="button" onClick={disconnectGoogleDrive} className="py-2 rounded-lg bg-gray-200 text-gray-700 text-xs font-black">
            {tr('فصل الربط', 'Disconnect')}
          </button>
          <button type="button" onClick={handleUploadBackupToDrive} className="py-2 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center gap-2">
            <CloudUpload className="w-4 h-4" />
            {tr('رفع النسخة الحالية', 'Upload current backup')}
          </button>
          <button type="button" onClick={handleRestoreFromDrive} className="py-2 rounded-lg bg-purple-600 text-white text-xs font-black flex items-center justify-center gap-2">
            <CloudDownload className="w-4 h-4" />
            {tr('استرجاع من Google Drive', 'Restore from Google Drive')}
          </button>
        </div>
        {googleDriveStatus.lastError && (
          <p className="text-[11px] font-bold text-rose-600">{googleDriveStatus.lastError}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1">{tr('كلمة مرور النسخة', 'Backup Password')}</label>
        <input
          type="password"
          value={backupPassword}
          onChange={(e) => setBackupPassword(e.target.value)}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none"
          placeholder={tr('أدخل كلمة مرور قوية', 'Enter strong password')}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <button type="button" onClick={handleCreateBackup} className="py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-2">
          <Download className="w-4 h-4" />
          {tr('إنشاء نسخة', 'Create Backup')}
        </button>
        <button type="button" onClick={handleValidateBackup} className="py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-2">
          <FileCheck2 className="w-4 h-4" />
          {tr('فحص النسخة', 'Validate')}
        </button>
        <button type="button" onClick={handleRestoreBackup} className="py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" />
          {tr('استرجاع نسخة', 'Restore Backup')}
        </button>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1">{tr('تحميل ملف نسخة من الجهاز', 'Load backup file from device')}</label>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => void handleBackupFilePicked(e.target.files?.[0] || null)}
          className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs font-bold"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1">{tr('محتوى ملف النسخة (JSON)', 'Backup JSON payload')}</label>
        <textarea
          rows={8}
          value={backupJson}
          onChange={(e) => setBackupJson(e.target.value)}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-xs font-mono"
          placeholder={tr('ألصق هنا محتوى ملف النسخة عند الاسترجاع', 'Paste backup file content here for restore')}
        />
      </div>
      {backupStatus && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700">
          {backupStatus}
        </div>
      )}
      <div className="rounded-xl border border-gray-100 bg-slate-50 p-3">
        <p className="text-xs font-black text-gray-700 mb-2">{tr('آخر سجلات التدقيق', 'Latest Audit Logs')}</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {auditLogs.slice(0, 8).map(log => (
            <div key={log.id} className="text-[11px] text-gray-600 font-bold">
              <span className="text-gray-400">{new Date(log.timestamp).toLocaleString('en-GB')}</span>{' '}
              <span className="text-indigo-600">{log.action}</span>{' '}
              <span>{log.entityType}</span>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <p className="text-[11px] text-gray-400 font-bold">{tr('لا توجد سجلات حالياً', 'No audit logs yet.')}</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderAuditForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-gray-800">{tr('سجل التدقيق', 'Audit Trail')}</h3>
        <span className="text-[11px] text-gray-500 font-black">
          {tr('عدد السجلات', 'Total logs')}: {filteredAuditLogs.length}
        </span>
      </div>

      <input
        value={auditSearch}
        onChange={(e) => setAuditSearch(e.target.value)}
        className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
        placeholder={tr('ابحث: العملية / الكيان / المستخدم / الشاشة', 'Search: action / entity / user / screen')}
      />

      <div className="max-h-[65vh] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="p-2 text-right font-black text-gray-500">{tr('الوقت', 'Time')}</th>
              <th className="p-2 text-right font-black text-gray-500">{tr('المستخدم', 'User')}</th>
              <th className="p-2 text-right font-black text-gray-500">{tr('العملية', 'Action')}</th>
              <th className="p-2 text-right font-black text-gray-500">{tr('الكيان', 'Entity')}</th>
              <th className="p-2 text-right font-black text-gray-500">{tr('الشاشة', 'Screen')}</th>
              <th className="p-2 text-right font-black text-gray-500">{tr('الجهاز', 'Device')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredAuditLogs.map(log => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="p-2 font-bold text-gray-600 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('en-GB')}</td>
                <td className="p-2 font-bold text-gray-700">{log.userName || '-'}</td>
                <td className="p-2 font-black text-indigo-700">{log.action}</td>
                <td className="p-2 font-bold text-gray-700">{log.entityType}{log.entityId ? ` (${log.entityId})` : ''}</td>
                <td className="p-2 font-bold text-gray-600">{log.screen || '-'}</td>
                <td className="p-2 font-bold text-gray-500 max-w-[260px] truncate" title={log.device}>{log.device}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAuditLogs.length === 0 && (
        <p className="text-xs text-gray-400 font-bold">{tr('لا توجد سجلات مطابقة', 'No matching audit logs.')}</p>
      )}
    </div>
  );

  const renderIntegrityForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-gray-800">{tr('مركز سلامة البيانات', 'Data Integrity Center')}</h3>
          <p className="text-xs text-gray-500 font-bold mt-1">
            {tr(
              'فحص القيود والفواتير والمخزون وتوزيعات الاستيراد لكشف الأخطاء قبل أن تؤثر على التقارير.',
              'Scan transactions, invoices, inventory and import distributions before they affect reports.'
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={exportIntegrityCsv}
            disabled={!integrityReport}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border ${integrityReport ? 'bg-white text-indigo-700 border-indigo-200' : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
          >
            <Download className="w-4 h-4" />
            {tr('تصدير CSV', 'Export CSV')}
          </button>
          <button
            type="button"
            onClick={exportIntegrityPdf}
            disabled={!integrityReport}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border ${integrityReport ? 'bg-white text-slate-700 border-gray-200' : 'bg-gray-100 text-gray-400 border-gray-200'
              }`}
          >
            <Printer className="w-4 h-4" />
            {tr('تصدير PDF', 'Export PDF')}
          </button>
          <button
            type="button"
            onClick={handleRunIntegrityCheck}
            disabled={integrityBusy !== null}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 ${integrityBusy ? 'bg-gray-100 text-gray-400 border border-gray-200' : 'bg-blue-600 text-white'
              }`}
          >
            <RefreshCw className={`w-4 h-4 ${integrityBusy === 'CHECK' ? 'animate-spin' : ''}`} />
            {integrityBusy === 'CHECK' ? tr('جاري الفحص...', 'Running check...') : tr('تشغيل الفحص', 'Run Check')}
          </button>
          <button
            type="button"
            onClick={handleApplyIntegritySafeFixes}
            disabled={integrityBusy !== null}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 border ${integrityBusy ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
          >
            <Wrench className="w-4 h-4" />
            {integrityBusy === 'FIX' ? tr('جاري الإصلاح...', 'Applying fixes...') : tr('إصلاحات آمنة', 'Safe Fixes')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
        {tr(
          'ملاحظة: “الإصلاحات الآمنة” تطبق فقط تعديلات غير تدميرية (مثل تصحيح العملة/سعر الصرف وتوازن رؤوس توزيعات الاستيراد ومزامنة مخزون الصنف مع مجموع المستودعات).',
          'Safe fixes apply only non-destructive changes (currency/rate normalization, import distribution header balancing, and syncing product stock with warehouse totals).'
        )}
      </div>

      {integrityStatus && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700">
          {integrityStatus}
        </div>
      )}

      {!integrityReport ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm font-bold text-gray-400">
          {tr('اضغط "تشغيل الفحص" لعرض تقرير سلامة البيانات.', 'Click "Run Check" to generate integrity report.')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-black text-gray-500 mb-1">{tr('فلتر الحدة', 'Severity filter')}</label>
              <select
                value={integritySeverityFilter}
                onChange={(e) => setIntegritySeverityFilter(e.target.value as 'ALL' | IntegritySeverity)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-bold"
              >
                <option value="ALL">{tr('الكل', 'All')}</option>
                <option value="ERROR">{tr('أخطاء', 'Errors')}</option>
                <option value="WARNING">{tr('تحذيرات', 'Warnings')}</option>
                <option value="INFO">{tr('معلومات', 'Info')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-black text-gray-500 mb-1">{tr('فلتر النوع', 'Type filter')}</label>
              <select
                value={integrityAreaFilter}
                onChange={(e) => setIntegrityAreaFilter(e.target.value as 'ALL' | IntegrityArea)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-bold"
              >
                <option value="ALL">{tr('الكل', 'All')}</option>
                <option value="ACCOUNTS">{tr('الحسابات', 'Accounts')}</option>
                <option value="TRANSACTIONS">{tr('القيود', 'Transactions')}</option>
                <option value="INVOICES">{tr('الفواتير', 'Invoices')}</option>
                <option value="INVENTORY">{tr('المخزون', 'Inventory')}</option>
                <option value="CHECKS">{tr('الشيكات', 'Checks')}</option>
                <option value="IMPORT_DISTRIBUTIONS">{tr('توزيعات الاستيراد', 'Import Distributions')}</option>
              </select>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 flex items-center justify-between mt-[19px] md:mt-0">
              <span className="text-xs font-black text-gray-500">{tr('النتائج بعد الفلترة', 'Filtered results')}</span>
              <span className="text-sm font-black text-indigo-700">{filteredIntegrityIssues.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-gray-400 font-black">{tr('إجمالي الملاحظات', 'Total issues')}</div>
              <div className="text-lg font-black text-gray-800">{integrityReport.counts.total}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-gray-400 font-black">{tr('أخطاء', 'Errors')}</div>
              <div className="text-lg font-black text-rose-700">{integrityReport.counts.errors}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-gray-400 font-black">{tr('تحذيرات', 'Warnings')}</div>
              <div className="text-lg font-black text-amber-700">{integrityReport.counts.warnings}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-gray-400 font-black">{tr('معلومات', 'Infos')}</div>
              <div className="text-lg font-black text-blue-700">{integrityReport.counts.infos}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-gray-400 font-black">{tr('قابلة لإصلاح آمن', 'Safe-fixable')}</div>
              <div className="text-lg font-black text-emerald-700">{integrityReport.counts.fixable}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-gray-400 font-black">{tr('قيمة المخزون الدفترية (تقريبية)', 'Inventory ledger value (approx)')}</div>
              <div className="font-black text-slate-800 dir-ltr">{integrityReport.metrics.inventoryLedgerValueApprox.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-gray-400 font-black">{tr('قيمة المخزون من الأصناف (تقريبية)', 'Inventory from products (approx)')}</div>
              <div className="font-black text-slate-800 dir-ltr">{integrityReport.metrics.inventoryStockValueApprox.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-gray-400 font-black">{tr('فرق القيمة (تقريبي)', 'Value difference (approx)')}</div>
              <div className={`font-black dir-ltr ${Math.abs(integrityReport.metrics.inventoryValueDiffApprox) > 0.5 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {integrityReport.metrics.inventoryValueDiffApprox.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-gray-400 font-black">{tr('أصناف فيها فرق كمية مستندي', 'Products with document stock mismatch')}</div>
              <div className="font-black text-indigo-700">{integrityReport.metrics.inventoryQtyDiffProducts}</div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 overflow-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-right font-black text-gray-500">{tr('الحدة', 'Severity')}</th>
                  <th className="p-2 text-right font-black text-gray-500">{tr('المنطقة', 'Area')}</th>
                  <th className="p-2 text-right font-black text-gray-500">{tr('الرسالة', 'Message')}</th>
                  <th className="p-2 text-right font-black text-gray-500">{tr('المرجع', 'Reference')}</th>
                  <th className="p-2 text-center font-black text-gray-500">{tr('إصلاح آمن', 'Safe fix')}</th>
                  <th className="p-2 text-center font-black text-gray-500">{tr('فتح', 'Open')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredIntegrityIssues.map(issue => (
                  <tr key={issue.id} className="border-t border-gray-100">
                    <td className="p-2">
                      <span
                        className={`px-2 py-1 rounded-lg font-black ${issue.severity === 'ERROR'
                            ? 'bg-rose-50 text-rose-700'
                            : issue.severity === 'WARNING'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                      >
                        {getIntegritySeverityLabel(issue.severity)}
                      </span>
                    </td>
                    <td className="p-2 font-black text-gray-700">{getIntegrityAreaLabel(issue.area)}</td>
                    <td className="p-2 font-bold text-gray-700">
                      {tr(issue.messageAr, issue.messageEn)}
                      <div className="text-[10px] text-gray-400 font-black mt-1">{issue.code}</div>
                    </td>
                    <td className="p-2 font-bold text-gray-600">
                      {issue.entityLabel || '-'}{issue.entityId ? ` (${issue.entityId})` : ''}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${issue.fixable ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {issue.fixable ? tr('نعم', 'Yes') : tr('لا', 'No')}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        disabled={!issue.entityId}
                        onClick={() => setSelectedIntegrityIssueId(issue.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-black ${issue.entityId ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-gray-100 text-gray-400 border border-gray-200'
                          }`}
                      >
                        {tr('فتح', 'Open')}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredIntegrityIssues.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm font-bold text-gray-500">
                      {tr(
                        integrityReport.issues.length === 0
                          ? 'ممتاز: لا توجد مشاكل سلامة بيانات حالياً.'
                          : 'لا توجد نتائج مطابقة للفلاتر الحالية.',
                        integrityReport.issues.length === 0
                          ? 'Great: no integrity issues found.'
                          : 'No issues match current filters.'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedIntegrityIssue && (
            <div className="rounded-xl border border-gray-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xs font-black text-gray-500">{tr('تفاصيل العنصر (Drill-down)', 'Drill-down item details')}</div>
                  <div className="text-sm font-black text-gray-800">
                    {tr(selectedIntegrityIssue.messageAr, selectedIntegrityIssue.messageEn)}
                  </div>
                  <div className="text-[11px] text-gray-400 font-bold mt-1">
                    {getIntegrityAreaLabel(selectedIntegrityIssue.area)} · {selectedIntegrityIssue.entityLabel || '-'} {selectedIntegrityIssue.entityId ? `(${selectedIntegrityIssue.entityId})` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIntegrityIssueId(null)}
                  className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-black text-gray-600"
                >
                  {tr('إغلاق', 'Close')}
                </button>
              </div>

              {selectedIntegrityRecord ? (
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-xs font-black text-gray-500 mb-2">
                    {tr('تم فتح العنصر مباشرة من نتيجة الفحص', 'Item opened directly from integrity result')}
                  </div>
                  <pre className="text-[11px] leading-5 overflow-auto max-h-[340px] bg-slate-50 border border-gray-100 rounded-lg p-3 dir-ltr text-left">
                    {JSON.stringify(selectedIntegrityRecord, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  {tr('تعذر العثور على العنصر الحالي. ربما تم حذفه أو تغيّر مرجعه.', 'Could not resolve this entity. It may have been deleted or changed.')}
                </div>
              )}
            </div>
          )}

          <div className="text-[11px] font-bold text-gray-400">
            {tr('آخر فحص', 'Last scan')}: {new Date(integrityReport.generatedAt).toLocaleString('en-GB')}
          </div>
        </>
      )}
    </div>
  );

  const renderContent = () => {
    switch (mode) {
      case 'COMPANIES': return renderCompaniesForm();
      case 'COMPANY': return renderCompanyForm();
      case 'LANGUAGE': return renderLanguageForm();
      case 'TAXES': return renderTaxesForm();
      case 'VOUCHERS_AR_AP': return renderVouchersArApForm();
      case 'OTHER_OPTIONS': return renderOtherOptionsForm();
      case 'PRINT_OPTIONS': return renderPrintOptionsForm();
      case 'ACCOUNTS': return <AccountsTree />;
      case 'TREASURY': return <TreasuryManager />;
      case 'ITEM_GROUPS': return <ItemGroupManager />;
      case 'UNITS': return <UnitManager />;
      case 'PERMISSIONS': return renderPermissionsForm();
      case 'AUDIT': return renderAuditForm();
      case 'INTEGRITY': return renderIntegrityForm();
      case 'CURRENCY': return <CurrencyManager />;
      case 'ASSETS': return <FixedAssetsManager />;
      case 'SYNC': return <div className="p-4">{t('settings.sync')}</div>;
      case 'BACKUP': return renderBackupForm();
      case 'DATA_IMPORT': return <DataImportManager />;
      case 'DEVICE_HUB': return <DeviceHubManager />;
      case 'FINGERPRINT_READERS': return <FingerprintReadersManager />;
      case 'BARCODE_DEVICES': return <BarcodeDevicesManager />;
      default:
        return (
          <div className="space-y-3">
            <MenuItem icon={<Building2 className="w-6 h-6" />} title={tr('الشركات', 'Companies')} desc={tr('التبديل بين الشركات وإضافة شركة جديدة', 'Switch and manage multiple companies')} color="teal" rtl={rtl} onClick={() => setMode('COMPANIES')} />
            <MenuItem icon={<Globe className="w-6 h-6" />} title={t('settings.language')} desc={t('settings.languageDesc')} color="green" rtl={rtl} onClick={() => setMode('LANGUAGE')} />
            <MenuItem icon={<Building className="w-6 h-6" />} title={t('settings.companyData')} desc={t('settings.companyDesc')} color="blue" rtl={rtl} onClick={() => setMode('COMPANY')} />
            <MenuItem icon={<Percent className="w-6 h-6" />} title={t('settings.taxes')} desc={tr('التحكم بنسبة الضريبة وعرضها في الفواتير', 'Control tax rate and tax visibility in invoices')} color="rose" rtl={rtl} onClick={() => setMode('TAXES')} />
            <MenuItem icon={<Wallet className="w-6 h-6" />} title={tr('إعدادات السندات والذمم', 'Voucher & A/R Settings')} desc={tr('خيارات تخصيص السداد وربط السندات بالفواتير', 'Voucher allocation and invoice settlement options')} color="emerald" rtl={rtl} onClick={() => setMode('VOUCHERS_AR_AP')} />
            <MenuItem icon={<Settings2 className="w-6 h-6" />} title={tr('خيارات أخرى', 'Other Options')} desc={tr('إعدادات التشغيل والسلوك العام', 'Operational and behavior settings')} color="indigo" rtl={rtl} onClick={() => setMode('OTHER_OPTIONS')} />
            <MenuItem icon={<Printer className="w-6 h-6" />} title={tr('خيارات الطباعة', 'Print Options')} desc={tr('إعدادات شكل وإخراج الطباعة', 'Print layout and output settings')} color="orange" rtl={rtl} onClick={() => setMode('PRINT_OPTIONS')} />
            <MenuItem icon={<Wallet className="w-6 h-6" />} title={t('settings.treasury')} desc={t('settings.treasuryDesc')} color="emerald" rtl={rtl} onClick={() => setMode('TREASURY')} />
            <MenuItem icon={<Layers className="w-6 h-6" />} title={t('settings.accounts')} desc={t('settings.accountsDesc')} color="indigo" rtl={rtl} onClick={() => setMode('ACCOUNTS')} />
            <MenuItem icon={<PackagePlus className="w-6 h-6" />} title={t('settings.itemGroups')} desc={t('settings.itemGroupsDesc')} color="purple" rtl={rtl} onClick={() => setMode('ITEM_GROUPS')} />
            <MenuItem icon={<Scale className="w-6 h-6" />} title={t('settings.units')} desc={t('settings.unitsDesc')} color="orange" rtl={rtl} onClick={() => setMode('UNITS')} />
            <MenuItem icon={<ShieldCheck className="w-6 h-6" />} title={tr('الصلاحيات', 'Permissions')} desc={tr('عرض/إضافة/تعديل/حذف/ترحيل/طباعة/عكس', 'Access matrix by operation')} color="indigo" rtl={rtl} onClick={() => setMode('PERMISSIONS')} />
            <MenuItem icon={<Lock className="w-6 h-6" />} title={tr('سجل التدقيق', 'Audit Trail')} desc={tr('من عدّل ماذا ومتى وعلى أي شاشة', 'Who changed what and when')} color="gray" rtl={rtl} onClick={() => setMode('AUDIT')} />
            <MenuItem icon={<FileCheck2 className="w-6 h-6" />} title={tr('سلامة البيانات', 'Integrity Check')} desc={tr('فحص شامل للأخطاء المؤثرة على التقارير مع إصلاحات آمنة', 'Scan data integrity issues affecting reports with safe fixes')} color="rose" rtl={rtl} onClick={() => setMode('INTEGRITY')} />
            <MenuItem icon={<Percent className="w-6 h-6" />} title={t('settings.currency')} desc={t('settings.currencyDesc')} color="green" rtl={rtl} onClick={() => setMode('CURRENCY')} />
            <MenuItem icon={<Building2 className="w-6 h-6" />} title={t('settings.assets')} desc={t('settings.assetsDesc')} color="teal" rtl={rtl} onClick={() => setMode('ASSETS')} />
            <MenuItem icon={<Upload className="w-6 h-6" />} title={tr('استيراد البيانات', 'Data Import')} desc={tr('استيراد زبائن/أصناف/سجلات/فواتير من Excel أو CSV', 'Import contacts/products/transactions/invoices from Excel or CSV')} color="blue" rtl={rtl} onClick={() => setMode('DATA_IMPORT')} />
            <MenuItem icon={<Cable className="w-6 h-6" />} title={tr('مركز إدارة الأجهزة', 'Device Management Center')} desc={tr('تعريف الأجهزة، الوكيل المحلي، السجل، وطابور الأوفلاين', 'Devices, local agent, logs, and offline queue')} color="gray" rtl={rtl} onClick={() => setMode('DEVICE_HUB')} />
            <MenuItem icon={<ScanBarcode className="w-6 h-6" />} title={tr('قارئ الباركود والطباعة', 'Barcode Reader & Labels')} desc={tr('إعدادات المسح بالباركود وطباعة ملصقات الأصناف', 'Barcode scanning settings and product label printing')} color="orange" rtl={rtl} onClick={() => setMode('BARCODE_DEVICES')} />
            <MenuItem icon={<Wrench className="w-6 h-6" />} title={tr('قارئ البصمة', 'Fingerprint Reader')} desc={tr('تعريف أجهزة البصمة والرفع المباشر/اليدوي لسجلات الحضور', 'Configure fingerprint devices and direct/manual attendance uploads')} color="indigo" rtl={rtl} onClick={() => setMode('FINGERPRINT_READERS')} />
            <MenuItem icon={<Download className="w-6 h-6" />} title={t('settings.backup')} desc={t('settings.backupDesc')} color="gray" rtl={rtl} onClick={() => setMode('BACKUP')} />
          </div>
        );
    }
  };

  return (
    <div className="app-page definitions-page p-4">
      <header className="mb-6 flex items-center gap-2">
        {mode !== 'MENU' && (
          <button onClick={() => setMode('MENU')} className="bg-gray-100 p-2 rounded-lg">
            <ChevronRight className={`w-5 h-5 ${rtl ? 'rotate-180' : ''}`} />
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-800">{mode === 'MENU' ? t('settings.title') : t('settings.systemManagement')}</h1>
      </header>
      {renderContent()}
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  rtl: boolean;
  compact?: boolean;
  onToggle: () => void;
}> = ({ label, description, checked, rtl, compact = false, onToggle }) => {
  const trackWidth = 52;
  const knobSize = 22;
  const thumbStart = 4;
  const thumbEnd = trackWidth - knobSize - thumbStart;
  const knobLeft = checked
    ? (rtl ? thumbStart : thumbEnd)
    : (rtl ? thumbEnd : thumbStart);

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-xl flex justify-between ${compact ? 'p-3 items-start gap-3 min-h-[90px]' : 'p-3 items-center gap-4'}`}>
      <div className={`${rtl ? 'text-right' : 'text-left'} min-w-0 flex-1`}>
        <p className={`${compact ? 'text-[12px] leading-5' : 'text-sm'} font-black text-gray-800`}>{label}</p>
        {description && <p className={`${compact ? 'text-[10px] leading-4' : 'text-xs'} text-gray-500 font-bold mt-1`}>{description}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={checked}
        className={`w-[52px] h-[30px] !min-h-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200 ease-out relative shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-200 ${compact ? 'self-start mt-0.5' : ''} ${checked ? 'bg-blue-600 border-blue-600 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]' : 'bg-slate-200 border-slate-300 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]'}`}
        aria-label={label}
      >
        <span
          className="absolute top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.18)] transition-[left] duration-200 ease-out"
          style={{ left: knobLeft }}
        />
      </button>
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; title: string; desc: string; color: string; rtl: boolean; onClick: () => void }> = ({ icon, title, desc, color, rtl, onClick }) => (
  <button onClick={onClick} className="settings-card w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-xl transition-colors ${color === 'blue' ? 'bg-blue-50 text-blue-600' : color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : color === 'indigo' ? 'bg-indigo-50 text-indigo-600' : color === 'purple' ? 'bg-purple-50 text-purple-600' : color === 'green' ? 'bg-green-50 text-green-600' : color === 'teal' ? 'bg-teal-50 text-teal-600' : color === 'orange' ? 'bg-orange-50 text-orange-600' : color === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-600'}`}>
        {icon}
      </div>
      <div className={rtl ? 'text-right' : 'text-left'}>
        <h3 className="font-bold text-gray-800 text-base">{title}</h3>
        <p className="text-gray-400 text-xs">{desc}</p>
      </div>
    </div>
    <ChevronRight className={`w-5 h-5 text-gray-300 ${rtl ? 'rotate-180' : ''}`} />
  </button>
);

export default DefinitionsMenu;
