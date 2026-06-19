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
  CloudDownload,
  BookOpen,
  Trash2,
  User,
  Users,
  AlertTriangle,
  LifeBuoy,
  Mail
} from 'lucide-react';
import AccountsTree from './AccountsTree';
import CurrencyManager from './CurrencyManager';
import FixedAssetsManager from './FixedAssetsManager';
import TreasuryManager from './TreasuryManager';
import ItemGroupManager from './ItemGroupManager';
import UnitManager from './UnitManager';
import DataImportManager from './DataImportManager';
import OpeningBalancesManager from './OpeningBalancesManager';
import CompanyLogoCropDialog from './CompanyLogoCropDialog';
import FingerprintReadersManager from './FingerprintReadersManager';
import BarcodeDevicesManager from './BarcodeDevicesManager';
import DeviceHubManager from './DeviceHubManager';
import EnglishDateInput from './EnglishDateInput';
import PolicyGuideScreen from './PolicyGuideScreen';
import AccountDeletionScreen from './AccountDeletionScreen';
import { useAccounting } from '../contexts/AccountingContext';
import { firebaseAuth, firebaseDb, getBackendApiUrl } from '../firebaseClient';
import { updatePassword, EmailAuthProvider, linkWithCredential, reauthenticateWithCredential } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { CloudCompanySubscription, CloudSubscriptionCode, CloudSubscriptionCodeStatus, CompanyProfile, CompanySettings, CompanySubscriptionPlan, CompanySubscriptionStatus, InventoryValuationMethod, PermissionAction, PermissionMatrix, PermissionModule, SubscriptionBillingCycle, SubscriptionCheckoutProvider, WorkspaceOfferCodeKind, UserRole } from '../types';
import { normalizeAppLanguage, translate, isCodeEmail, extractCodeFromEmail } from '../utils/i18n';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { compressImageFile } from '../utils/imageCompression';
import { applyAppTheme } from '../utils/appTheme';
import { isBackupPayloadV1 } from '../utils/backupCrypto';
import { buildWorkspaceSubscriptionQuote, getSubscriptionProviderAvailability } from '../utils/subscriptionCommerce';
import { getPaddleInstance } from '../utils/paddleLoader';
import {
  clearRuntimeErrorLog,
  getRuntimeErrorLog,
  RuntimeErrorEntry,
} from '../utils/runtimeErrorMonitor';
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
  | 'allowNegativeStock'
  | 'allowEditEntryDate'
  | 'journalDateLockEnabled'
  | 'voucherInvoiceAllocationEnabled'
  | 'autoAddItemPriceInInvoice'
  | 'updateSalesPriceOnInvoiceEntry'
  | 'barcodeEnabled'
  | 'invoiceExpiryDateEnabled'
  | 'printPersonalData'
  | 'printElectronicInvoice'
  | 'printItemBarcodeInInvoice'
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
  | 'USER_ACCOUNT'
  | 'USER_MANAGEMENT'
  | 'COMPANIES'
  | 'SUBSCRIPTION'
  | 'SUBSCRIPTION_REPORTS'
  | 'POLICY'
  | 'ACCOUNT_DELETE'
  | 'USAGE_GUIDE'
  | 'SUPPORT'
  | 'COMPANY'
  | 'OPENING_BALANCES'
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
  | 'LANGUAGE'
  | 'WIPE_DATA';

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

const SUBSCRIPTION_STATUS_OPTIONS: CompanySubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'];
const SUBSCRIPTION_PLAN_OPTIONS: CompanySubscriptionPlan[] = ['TRIAL', 'BASIC', 'NONE'];

const formatIsoDateInputValue = (value?: string): string => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
};

const toIsoDateAtStartOfDay = (value: string): string | undefined => {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
};

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
    allowNegativeStock: coerceBoolean((settings as any).allowNegativeStock, false),
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
    printItemBarcodeInInvoice: coerceBoolean((settings as any).printItemBarcodeInInvoice, false),
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
      } else {
        actionAcc[action] = true;
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
    currentUser,
    companySettings,
    updateCompanySettings,
    companies,
    currentCompany,
    currentCompanyId,
    companyAccessStatus,
    companyAccessDaysLeft,
    companyAccessEndsAt,
    workspaceSubscription,
    workspaceMaxCompanies,
    workspaceRemainingCompanySlots,
    workspaceCompanyLimitReached,
    workspaceProviderAvailability,
    switchCompany,
    createCompany,
    deleteCompany,
    wipeAllCompanyData,
    prepareSubscriptionCheckout,
    updateCompanyProfile,
    updateCompanySubscription,
    updateWorkspaceSubscription,
    activateCompanySubscription,
    deviceBindingId,
    cloudSubscription,
    subscriptionCloudBusy,
    subscriptionCloudError,
    subscriptionAdminEnabled,
    programOwnerEnabled,
    subscriptionCodes,
    subscriptionCodesLoading,
    workspaceOfferCodes,
    workspaceOfferCodesLoading,
    subscriptionCompanies,
    subscriptionCompaniesLoading,
    issueSubscriptionCode,
    cancelSubscriptionCode,
    issueWorkspaceOfferCode,
    redeemWorkspaceOfferCode,
    linkCurrentSubscriptionDevice,
    unlinkSubscriptionDevice,
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
    updateCheck,
    users,
    addUser,
    updateUser,
    deleteUser
  } = useAccounting();
  const appLanguage = companySettings.language ?? 'AR';
  const isEnglish = appLanguage !== 'AR';
  const rtl = appLanguage === 'AR';
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(appLanguage, key, params);
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const normalizeDecimalInput = (value: string) =>
    toEnglishDigits(String(value ?? '')).replace(/\u066B/g, '.').replace(/\u066C/g, ',').replace(/\u060C/g, ',').replace(/,/g, '');
  const normalizeActivationCodeInput = (value: string) =>
    toEnglishDigits(String(value ?? ''))
      .trim()
      .toUpperCase()
      .replace(/[-\u2013\u2014]+/g, '-')
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9-]/g, '');

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const fetchGlobalUsers = async () => {
    if (!firebaseAuth?.currentUser) return;
    setGlobalUsersLoading(true);
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const backendApiUrl = getBackendApiUrl();
      const res = await fetch(`${backendApiUrl}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalUsers(data.users || []);
      } else {
        const errData = await res.json();
        console.error('Failed to fetch global users:', errData.error || res.statusText);
      }
    } catch (err) {
      console.error('Failed to fetch global users:', err);
    } finally {
      setGlobalUsersLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'USER_MANAGEMENT' && currentUser?.email === 'hamza.mm.aa.ss@gmail.com') {
      fetchGlobalUsers();
    }
  }, [mode, currentUser]);

  const normalizeLanguage = (language: CompanySettings['language'] | string | undefined): CompanySettings['language'] =>
    normalizeAppLanguage(language);

  const companySettingsString = JSON.stringify(companySettings);
  const permissionsString = JSON.stringify(permissions);

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
  }, [companySettingsString]);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<BrowserNotificationPermission>(
    detectBrowserNotificationPermission()
  );

  const [permissionDraft, setPermissionDraft] = useState<PermissionMatrix>(() => clonePermissions(permissions));
  const [backupPassword, setBackupPassword] = useState('');
  const [backupJson, setBackupJson] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(Boolean(companySettings.autoBackupEnabled));
  const [autoBackupFrequency, setAutoBackupFrequency] = useState<'INSTANT' | 'HOURLY' | 'DAILY'>(
    companySettings.autoBackupFrequency || 'DAILY'
  );
  const [autoBackupPassword, setAutoBackupPassword] = useState(companySettings.autoBackupPassword || '');
  const [autoBackupKeepCount, setAutoBackupKeepCount] = useState(String(companySettings.autoBackupKeepCount || 30));
  const [googleDriveAutoUpload, setGoogleDriveAutoUpload] = useState(Boolean(companySettings.googleDriveAutoUpload));
  const [googleDriveClientId, setGoogleDriveClientId] = useState(companySettings.googleDriveClientId || '');
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState(companySettings.googleDriveFolderId || '');
  const [subscriptionStatusDraft, setSubscriptionStatusDraft] = useState<CompanySubscriptionStatus>('TRIAL');
  const [subscriptionPlanDraft, setSubscriptionPlanDraft] = useState<CompanySubscriptionPlan>('TRIAL');
  const [subscriptionEndsAtDraft, setSubscriptionEndsAtDraft] = useState('');
  const [subscriptionGraceDaysDraft, setSubscriptionGraceDaysDraft] = useState('0');
  const [activationCodeDraft, setActivationCodeDraft] = useState('');
  const [subscriptionStatusMessage, setSubscriptionStatusMessage] = useState('');
  const billingCycleDraft: SubscriptionBillingCycle = 'YEARLY';
  const [billingCompanyCountDraft, setBillingCompanyCountDraft] = useState('1');
  const [billingStatusMessage, setBillingStatusMessage] = useState('');
  const [workspaceOfferCodeDraft, setWorkspaceOfferCodeDraft] = useState('');
  const [workspaceOfferStatusMessage, setWorkspaceOfferStatusMessage] = useState('');
  const [workspaceOfferBusy, setWorkspaceOfferBusy] = useState(false);

  // User Change Password State
  const [userCurrentPassword, setUserCurrentPassword] = useState('');
  const [userNewPassword, setUserNewPassword] = useState('');
  const [userConfirmPassword, setUserConfirmPassword] = useState('');
  const [userPassStatus, setUserPassStatus] = useState('');
  const [userPassLoading, setUserPassLoading] = useState(false);

  // Admin User Management State
  const [adminNewUserCode, setAdminNewUserCode] = useState('');
  const [adminNewUserFullName, setAdminNewUserFullName] = useState('');
  const [adminNewUserPassword, setAdminNewUserPassword] = useState('');
  const [adminNewUserRole, setAdminNewUserRole] = useState<UserRole>('ACCOUNTANT');
  const [globalUsers, setGlobalUsers] = useState<any[]>([]);
  const [globalUsersLoading, setGlobalUsersLoading] = useState(false);
  const [adminUserMgmtStatus, setAdminUserMgmtStatus] = useState('');
  const [adminUserMgmtLoading, setAdminUserMgmtLoading] = useState(false);
  const [adminSelectedUserForPasswordReset, setAdminSelectedUserForPasswordReset] = useState('');
  const [adminResetPasswordValue, setAdminResetPasswordValue] = useState('');
  const [adminResetPasswordLoading, setAdminResetPasswordLoading] = useState(false);
  const [adminResetPasswordStatus, setAdminResetPasswordStatus] = useState('');
  const [adminSelectedUserForDelete, setAdminSelectedUserForDelete] = useState('');
  const [adminDeleteUserLoading, setAdminDeleteUserLoading] = useState(false);
  const [adminDeleteUserStatus, setAdminDeleteUserStatus] = useState('');

  // Admin Subscription Management State
  const [adminSelectedUserForSubscription, setAdminSelectedUserForSubscription] = useState<string>('');
  const [adminSubPlan, setAdminSubPlan] = useState<CompanySubscriptionPlan>('TRIAL');
  const [adminSubStatus, setAdminSubStatus] = useState<CompanySubscriptionStatus>('TRIAL');
  const [adminSubExpiresAt, setAdminSubExpiresAt] = useState<string>('');
  const [adminSubMaxCompanies, setAdminSubMaxCompanies] = useState<number>(1);
  const [adminSubLifetimeAccess, setAdminSubLifetimeAccess] = useState<boolean>(false);
  const [adminSubUnlimitedCompanies, setAdminSubUnlimitedCompanies] = useState<boolean>(false);
  const [adminSubLoading, setAdminSubLoading] = useState<boolean>(false);
  const [adminSubStatusMessage, setAdminSubStatusMessage] = useState<string>('');
  const [workspaceOfferKindDraft, setWorkspaceOfferKindDraft] = useState<WorkspaceOfferCodeKind>('DISCOUNT_PERCENT');
  const [workspaceOfferDiscountDraft, setWorkspaceOfferDiscountDraft] = useState('25');
  const [workspaceOfferFreeDaysDraft, setWorkspaceOfferFreeDaysDraft] = useState('30');
  const [workspaceOfferCompanyCountDraft, setWorkspaceOfferCompanyCountDraft] = useState('');
  const [workspaceOfferExpiresAtDraft, setWorkspaceOfferExpiresAtDraft] = useState('');
  const [workspaceOfferNotesDraft, setWorkspaceOfferNotesDraft] = useState('');
  const [issuedWorkspaceOfferMessage, setIssuedWorkspaceOfferMessage] = useState('');
  const [workspaceOfferIssueBusy, setWorkspaceOfferIssueBusy] = useState(false);
  const [issuePlanDraft, setIssuePlanDraft] = useState<CompanySubscriptionPlan>('BASIC');
  const [issueDurationDaysDraft, setIssueDurationDaysDraft] = useState('30');
  const [issueMaxDevicesDraft, setIssueMaxDevicesDraft] = useState('1');
  const [issueExpiresAtDraft, setIssueExpiresAtDraft] = useState('');
  const [issueNotesDraft, setIssueNotesDraft] = useState('');
  const [issueReservedCompanyDraft, setIssueReservedCompanyDraft] = useState('');
  const [issuedCodeMessage, setIssuedCodeMessage] = useState('');
  const [subscriptionReportSearch, setSubscriptionReportSearch] = useState('');
  const [subscriptionReportCompanyStatusFilter, setSubscriptionReportCompanyStatusFilter] = useState<'ALL' | CompanySubscriptionStatus>('ALL');
  const [subscriptionReportCodeStatusFilter, setSubscriptionReportCodeStatusFilter] = useState<'ALL' | CloudSubscriptionCodeStatus>('ALL');
  const [auditSearch, setAuditSearch] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [logoCropSource, setLogoCropSource] = useState<string | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [integrityStatus, setIntegrityStatus] = useState('');
  const [integrityBusy, setIntegrityBusy] = useState<'CHECK' | 'FIX' | null>(null);
  const [integritySeverityFilter, setIntegritySeverityFilter] = useState<'ALL' | IntegritySeverity>('ALL');
  const [integrityAreaFilter, setIntegrityAreaFilter] = useState<'ALL' | IntegrityArea>('ALL');
  const [selectedIntegrityIssueId, setSelectedIntegrityIssueId] = useState<string | null>(null);
  const [runtimeErrorLog, setRuntimeErrorLog] = useState<RuntimeErrorEntry[]>([]);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeBusy, setWipeBusy] = useState(false);

  useEffect(() => {
    setPermissionDraft(clonePermissions(permissions));
  }, [permissionsString]);

  useEffect(() => {
    setAutoBackupEnabled(Boolean(companySettings.autoBackupEnabled));
    setAutoBackupFrequency(companySettings.autoBackupFrequency || 'DAILY');
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
    const nextStatus = currentCompany?.subscriptionStatus || 'TRIAL';
    const nextPlan = currentCompany?.subscriptionPlan || (nextStatus === 'TRIAL' ? 'TRIAL' : 'NONE');
    const nextEndsAt = nextStatus === 'TRIAL'
      ? currentCompany?.trialEndsAt
      : currentCompany?.subscriptionEndsAt;

    setSubscriptionStatusDraft(nextStatus);
    setSubscriptionPlanDraft(nextPlan);
    setSubscriptionEndsAtDraft(formatIsoDateInputValue(nextEndsAt));
    setSubscriptionGraceDaysDraft(String(currentCompany?.graceDays ?? 0));
    setActivationCodeDraft(normalizeActivationCodeInput(currentCompany?.activationCode || ''));
  }, [
    currentCompany?.id,
    currentCompany?.subscriptionStatus,
    currentCompany?.subscriptionPlan,
    currentCompany?.trialEndsAt,
    currentCompany?.subscriptionEndsAt,
    currentCompany?.graceDays,
    currentCompany?.activationCode
  ]);

  useEffect(() => {
    setBillingCompanyCountDraft(String(Math.max(1, companies.length + (workspaceRemainingCompanySlots > 0 ? 1 : 0))));
  }, [companies.length, workspaceRemainingCompanySlots]);

  useEffect(() => {
    if (mode !== 'BACKUP') return;
    setRuntimeErrorLog(getRuntimeErrorLog());
  }, [mode]);

  useEffect(() => {
    if (workspaceSubscription.offerCode) {
      setWorkspaceOfferCodeDraft(normalizeActivationCodeInput(workspaceSubscription.offerCode));
    }
  }, [workspaceSubscription.offerCode]);

  useEffect(() => {
    setBrowserNotificationPermission(detectBrowserNotificationPermission());
  }, [mode]);

  const workspaceCompaniesUnlimited = workspaceSubscription.unlimitedCompanies === true;
  const workspaceMaxCompaniesLabel = workspaceCompaniesUnlimited
    ? tr('غير محدود', 'Unlimited')
    : String(workspaceMaxCompanies);
  const workspaceRemainingCompanySlotsLabel = workspaceCompaniesUnlimited
    ? tr('غير محدود', 'Unlimited')
    : String(workspaceRemainingCompanySlots);
  const workspaceCompanyUsageLabel = workspaceCompaniesUnlimited
    ? tr(`${companies.length} / غير محدود`, `${companies.length} / Unlimited`)
    : `${companies.length} / ${Math.max(workspaceMaxCompanies, companies.length)}`;

  const subscriptionMeta = useMemo(() => {
    const endsAtText = companyAccessEndsAt
      ? new Date(companyAccessEndsAt).toLocaleDateString('en-GB')
      : '-';

    switch (companyAccessStatus) {
      case 'ACTIVE':
        return {
          badge: tr('اشتراك مفعل', 'Active subscription'),
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          summary: tr(
            `الوصول مفعل حاليًا. المتبقي ${companyAccessDaysLeft} يوم حتى نهاية الوصول.`,
            `Access is active. ${companyAccessDaysLeft} day(s) remain until access ends.`
          ),
          endsAtText
        };
      case 'SUSPENDED':
        return {
          badge: tr('موقوف', 'Suspended'),
          tone: 'border-rose-200 bg-rose-50 text-rose-700',
          summary: tr(
            'الوصول موقوف. يسمح الآن بإدارة الاشتراك والنسخ الاحتياطي فقط.',
            'Access is suspended. Only subscription management and backup are allowed now.'
          ),
          endsAtText
        };
      case 'EXPIRED':
        return {
          badge: tr('منتهي', 'Expired'),
          tone: 'border-amber-200 bg-amber-50 text-amber-700',
          summary: tr(
            'الاشتراك منتهي. يسمح الآن بعرض البيانات والنسخ الاحتياطي وإدارة الاشتراك فقط.',
            'The subscription has expired. Only viewing data, backup, and subscription management are allowed now.'
          ),
          endsAtText
        };
      default:
        return {
          badge: tr('فترة تجريبية', 'Trial'),
          tone: 'border-sky-200 bg-sky-50 text-sky-700',
          summary: tr(
            `التجربة فعالة، والمتبقي ${companyAccessDaysLeft} يوم.`,
            `The trial is active with ${companyAccessDaysLeft} day(s) remaining.`
          ),
          endsAtText
        };
    }
  }, [appLanguage, companyAccessDaysLeft, companyAccessEndsAt, companyAccessStatus]);

  const desiredBillingCompanyCount = useMemo(
    () => Math.max(1, Math.floor(Number(billingCompanyCountDraft) || Math.max(1, companies.length))),
    [billingCompanyCountDraft, companies.length]
  );

  useEffect(() => {
    const handlePaddleCheckoutCompleted = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;
      console.log('Paddle checkout completed event received on frontend:', data);

      try {
        setBillingStatusMessage(appLanguage === 'AR' ? 'جاري تفعيل الاشتراك...' : 'Activating subscription...');
        
        // Calculate expiration: 1 year from now
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        // 1. Update the workspace subscription document directly!
        await updateWorkspaceSubscription({
          status: 'ACTIVE',
          provider: 'PADDLE',
          billingCycle: 'YEARLY',
          maxCompanies: desiredBillingCompanyCount,
          startedAt: new Date().toISOString(),
          renewalDate: expiresAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          providerSubscriptionId: data?.subscription_id || data?.id || 'sandbox_sub_id',
          providerCustomerId: data?.customer_id || 'sandbox_cust_id'
        });

        // 2. Update the current company subscription document!
        if (currentCompany) {
          await updateCompanySubscription(currentCompany.id, {
            subscriptionStatus: 'ACTIVE',
            subscriptionPlan: 'BASIC',
            subscriptionStartsAt: new Date().toISOString(),
            subscriptionEndsAt: expiresAt.toISOString()
          });
        }

        // Show a beautiful modal/alert success message
        alert(
          appLanguage === 'AR'
            ? '🎉 تم الاشتراك وتفعيل الخدمة بنجاح! شكراً لك.'
            : '🎉 Subscription activated successfully! Thank you.'
        );
        
        setBillingStatusMessage('');
      } catch (err: any) {
        console.error('Failed to update workspace/company subscription client-side:', err);
        alert(
          appLanguage === 'AR'
            ? `فشل تفعيل الاشتراك تلقائياً: ${err.message || 'خطأ غير معروف'}`
            : `Failed to activate subscription: ${err.message || 'Unknown error'}`
        );
        setBillingStatusMessage('');
      }
    };

    window.addEventListener('paddle.checkout.completed', handlePaddleCheckoutCompleted);
    return () => {
      window.removeEventListener('paddle.checkout.completed', handlePaddleCheckoutCompleted);
    };
  }, [appLanguage, desiredBillingCompanyCount, updateWorkspaceSubscription, currentCompany, updateCompanySubscription]);

  const visibleSubscriptionProviders = useMemo(
    () => (['PADDLE', 'APPLE', 'GOOGLE'] as SubscriptionCheckoutProvider[]),
    []
  );

  const workspaceQuotes = useMemo(() => (
    visibleSubscriptionProviders.map(provider => (
      buildWorkspaceSubscriptionQuote({
        provider,
        billingCycle: billingCycleDraft,
        desiredCompanyCount: desiredBillingCompanyCount,
        discountPercent: workspaceSubscription.discountPercent,
        offerCode: workspaceSubscription.offerCode
      })
    ))
  ), [billingCycleDraft, desiredBillingCompanyCount, visibleSubscriptionProviders, workspaceSubscription.discountPercent, workspaceSubscription.offerCode]);

  const formatUsd = (value: number) => `$${Number(value || 0).toFixed(Number.isInteger(value) ? 0 : 2)}`;

  const getBillingCycleLabel = (cycle: SubscriptionBillingCycle) => (
    tr('سنوي', 'Yearly')
  );

  const getCheckoutProviderLabel = (provider: SubscriptionCheckoutProvider) => {
    switch (provider) {
      case 'PALPAY': return 'PalPay';
      case 'APPLE': return 'Apple';
      case 'GOOGLE': return 'Google';
      case 'PADDLE': return 'Paddle';
      default: return '-';
    }
  };

  const getWorkspaceProviderLabel = () => {
    switch (workspaceSubscription.provider) {
      case 'PALPAY': return 'PalPay';
      case 'APPLE': return 'Apple';
      case 'GOOGLE': return 'Google';
      case 'PADDLE': return 'Paddle';
      case 'MANUAL': return tr('يدوي', 'Manual');
      case 'TRIAL': return tr('تجريبي', 'Trial');
      default: return '-';
    }
  };

  const getWorkspaceOfferKindLabel = (
    kind: WorkspaceOfferCodeKind,
    discountPercent?: number,
    freeDays?: number
  ) => {
    switch (kind) {
      case 'DISCOUNT_PERCENT':
        return tr(`خصم ${discountPercent || 0}%`, `${discountPercent || 0}% discount`);
      case 'LIFETIME':
        return tr('اشتراك مدى الحياة', 'Lifetime access');
      default:
        return tr(`${freeDays || 30} يوم مجانًا`, `${freeDays || 30} free days`);
    }
  };

  const getWorkspaceOfferCompanyEffectLabel = (
    kind: WorkspaceOfferCodeKind,
    companyCount?: number
  ) => {
    if (companyCount && companyCount > 0) {
      return tr(`حتى ${companyCount} شركات`, `Up to ${companyCount} companies`);
    }
    if (kind === 'LIFETIME') {
      return tr('شركات غير محدودة', 'Unlimited companies');
    }
    return tr('لا يغير عدد الشركات', 'Does not change company count');
  };

  const getWorkspaceOfferStatusLabel = (status: 'AVAILABLE' | 'USED' | 'CANCELLED' | 'EXPIRED') => {
    switch (status) {
      case 'USED': return tr('مستخدم', 'Used');
      case 'CANCELLED': return tr('ملغي', 'Cancelled');
      case 'EXPIRED': return tr('منتهي', 'Expired');
      default: return tr('متاح', 'Available');
    }
  };

  const getWorkspaceOfferStatusTone = (status: 'AVAILABLE' | 'USED' | 'CANCELLED' | 'EXPIRED') => {
    switch (status) {
      case 'USED': return 'border-slate-200 bg-slate-100 text-slate-700';
      case 'CANCELLED': return 'border-rose-200 bg-rose-100 text-rose-700';
      case 'EXPIRED': return 'border-amber-200 bg-amber-100 text-amber-700';
      default: return 'border-emerald-200 bg-emerald-100 text-emerald-700';
    }
  };

  const handleCopyText = async (value: string, successMessage?: string) => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      if (successMessage) setIssuedWorkspaceOfferMessage(successMessage);
    } catch {
      // Ignore clipboard failures and keep the code visible.
    }
  };

  const handleStartSubscriptionCheckout = async (provider: SubscriptionCheckoutProvider) => {
    if (provider === 'PADDLE') {
      try {
        setBillingStatusMessage(appLanguage === 'AR' ? 'جاري تجهيز بوابة الدفع...' : 'Initializing payment gateway...');
        const paddle = await getPaddleInstance();
        if (!paddle) {
          throw new Error('Paddle initialization failed. Make sure client token is valid.');
        }

        const basePriceId = import.meta.env.VITE_PADDLE_BASE_PRICE_ID;
        const extraPriceId = import.meta.env.VITE_PADDLE_EXTRA_PRICE_ID;

        if (!basePriceId) {
          throw new Error('VITE_PADDLE_BASE_PRICE_ID is not configured.');
        }

        const extraCount = Math.max(0, desiredBillingCompanyCount - 1);
        const items = [{ priceId: basePriceId, quantity: 1 }];
        if (extraCount > 0 && extraPriceId) {
          items.push({ priceId: extraPriceId, quantity: extraCount });
        }

        paddle.Checkout.open({
          items,
          customData: {
            userId: currentUser?.id || '',
            userEmail: currentUser?.email || '',
            desiredCompanyCount: desiredBillingCompanyCount
          },
          settings: {
            successUrl: window.location.origin + window.location.pathname
          }
        });

        setBillingStatusMessage('');
      } catch (err: any) {
        console.error('Paddle Checkout failed:', err);
        setBillingStatusMessage(appLanguage === 'AR' 
          ? `فشل فتح الدفع: ${err.message || 'خطأ غير معروف'}`
          : `Checkout failed: ${err.message || 'Unknown error'}`);
      }
      return;
    }

    const result = prepareSubscriptionCheckout(provider, billingCycleDraft, desiredBillingCompanyCount, {
      discountPercent: workspaceSubscription.discountPercent,
      offerCode: workspaceSubscription.offerCode
    });
    if (!result.ok) {
      setBillingStatusMessage(appLanguage === 'AR'
        ? 'بوابة الدفع لهذه الجهة غير مهيأة بعد. أضف الروابط أو معرفات المنتجات في ملف البيئة أولًا.'
        : result.message);
      return;
    }

    if (result.mode === 'EXTERNAL_URL' && result.url && typeof window !== 'undefined') {
      window.open(result.url, '_blank', 'noopener,noreferrer');
      setBillingStatusMessage(appLanguage === 'AR'
        ? `تم تجهيز رابط الدفع عبر ${getCheckoutProviderLabel(provider)} لعدد ${desiredBillingCompanyCount} شركة.`
        : `Prepared ${getCheckoutProviderLabel(provider)} checkout for ${desiredBillingCompanyCount} companies.`);
      return;
    }

    setBillingStatusMessage(appLanguage === 'AR'
      ? `تم تجهيز منتج ${getCheckoutProviderLabel(provider)} بالمعرف ${result.productId || '-'}. فعّل الربط الأصلي داخل التطبيق لإتمام الشراء المباشر.`
      : `${getCheckoutProviderLabel(provider)} product ${result.productId || '-'} is ready. Complete the native in-app billing hookup to finish direct purchase.`);
  };

  const handleRedeemWorkspaceOfferCode = async () => {
    const normalizedCode = normalizeActivationCodeInput(workspaceOfferCodeDraft);
    if (!normalizedCode) {
      setWorkspaceOfferStatusMessage(tr('أدخل كود العرض أولاً.', 'Enter an offer code first.'));
      return;
    }

    try {
      setWorkspaceOfferBusy(true);
      setWorkspaceOfferStatusMessage('');
      setBillingStatusMessage('');
      const result = await redeemWorkspaceOfferCode(normalizedCode, desiredBillingCompanyCount);
      if (!result.ok) {
        setWorkspaceOfferStatusMessage(result.message);
        return;
      }

      setWorkspaceOfferCodeDraft(normalizedCode);
      setWorkspaceOfferStatusMessage(tr('تم تطبيق العرض بنجاح.', 'Offer applied successfully.'));
    } finally {
      setWorkspaceOfferBusy(false);
    }
  };

  const handleIssueWorkspaceOffer = async () => {
    try {
      setWorkspaceOfferIssueBusy(true);
      setIssuedWorkspaceOfferMessage('');
      const result = await issueWorkspaceOfferCode({
        kind: workspaceOfferKindDraft,
        discountPercent: workspaceOfferKindDraft === 'DISCOUNT_PERCENT'
          ? Math.max(1, Math.min(100, Math.floor(Number(workspaceOfferDiscountDraft) || 0)))
          : undefined,
        freeDays: workspaceOfferKindDraft === 'FREE_DAYS'
          ? Math.max(1, Math.min(3650, Math.floor(Number(workspaceOfferFreeDaysDraft) || 0)))
          : undefined,
        companyCount: workspaceOfferCompanyCountDraft
          ? Math.max(1, Math.min(50, Math.floor(Number(workspaceOfferCompanyCountDraft) || 0)))
          : undefined,
        expiresAt: workspaceOfferExpiresAtDraft || undefined,
        notes: workspaceOfferNotesDraft.trim() || undefined
      });

      if (!result.ok) {
        setIssuedWorkspaceOfferMessage(result.message || tr('تعذر إنشاء كود العرض.', 'Could not create the offer code.'));
        return;
      }

      const createdCode = result.code || '';
      setIssuedWorkspaceOfferMessage(
        tr(`تم إنشاء الكود: ${createdCode}`, `Offer code created: ${createdCode}`)
      );
      setWorkspaceOfferCodeDraft(createdCode);
      setWorkspaceOfferNotesDraft('');
      setWorkspaceOfferExpiresAtDraft('');
      void handleCopyText(
        createdCode,
        tr(`تم إنشاء الكود ونسخه: ${createdCode}`, `Offer code created and copied: ${createdCode}`)
      );
    } finally {
      setWorkspaceOfferIssueBusy(false);
    }
  };

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

  const applyLanguagePreference = (
    language: CompanySettings['language'] | string | undefined,
    options?: { notifySuccess?: boolean }
  ) => {
    const nextLanguage = normalizeLanguage(language);
    const currentLanguage = normalizeLanguage(companySettings.language);

    setLocalCompany(prev => (
      normalizeLanguage(prev.language) === nextLanguage
        ? prev
        : { ...prev, language: nextLanguage }
    ));

    if (nextLanguage === currentLanguage) {
      if (options?.notifySuccess) {
        alert(translate(nextLanguage, 'settings.languageSaved'));
      }
      return;
    }

    const result = updateCompanySettings({
      ...companySettings,
      language: nextLanguage
    });
    if (!result.ok) {
      setLocalCompany(prev => ({
        ...prev,
        language: currentLanguage
      }));
      alert(result.message);
      return;
    }

    setLocalCompany(prev => ({
      ...prev,
      language: nextLanguage
    }));

    if (options?.notifySuccess) {
      alert(translate(nextLanguage, 'settings.languageSaved'));
    }
  };

  const saveLanguagePreference = () => {
    applyLanguagePreference(localCompany.language, { notifySuccess: true });
  };

  const toggleDarkModeImmediately = () => {
    const nextDarkModeEnabled = !coerceBoolean(localCompany.darkModeEnabled, false);
    setLocalCompany(prev => ({
      ...prev,
      darkModeEnabled: nextDarkModeEnabled
    }));
    applyAppTheme(nextDarkModeEnabled);

    const normalized = withCompanyDefaults({
      ...companySettings,
      darkModeEnabled: nextDarkModeEnabled,
      language: normalizeLanguage(companySettings.language)
    });
    const result = updateCompanySettings(normalized);
    if (result.ok) return;

    const fallbackDarkModeEnabled = coerceBoolean(companySettings.darkModeEnabled, false);
    applyAppTheme(fallbackDarkModeEnabled);
    setLocalCompany(prev => ({
      ...prev,
      darkModeEnabled: fallbackDarkModeEnabled
    }));
    alert(result.message);
  };

  const toggleSetting = (key: BooleanSettingKey) => {
    if (key === 'darkModeEnabled') {
      toggleDarkModeImmediately();
      return;
    }
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

  const kindLabel = (kind: RuntimeErrorEntry['kind']) => {
    switch (kind) {
      case 'window-error':
        return tr('خطأ نافذة', 'Window error');
      case 'unhandled-rejection':
        return tr('رفض وعد غير معالج', 'Unhandled rejection');
      case 'react-boundary':
        return tr('انهيار واجهة React', 'React boundary crash');
      case 'bootstrap':
        return tr('خطأ تهيئة', 'Bootstrap error');
      default:
        return kind;
    }
  };

  const handleRefreshRuntimeErrorLog = () => {
    setRuntimeErrorLog(getRuntimeErrorLog());
  };

  const handleExportRuntimeErrorLog = () => {
    const entries = getRuntimeErrorLog();
    if (entries.length === 0) {
      setBackupStatus(tr('لا يوجد سجل أخطاء لتصديره.', 'No runtime error log to export.'));
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'aiflex-erp',
      entries,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `aiflex-runtime-errors-${payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setBackupStatus(tr('تم تصدير سجل الأخطاء بنجاح.', 'Runtime error log exported successfully.'));
  };

  const handleClearRuntimeErrorLog = () => {
    clearRuntimeErrorLog();
    setRuntimeErrorLog([]);
    setBackupStatus(tr('تم مسح سجل أخطاء التشغيل.', 'Runtime error log has been cleared.'));
  };

  const handleSaveBackupSettings = () => {
    const keepCount = Math.max(1, Math.min(200, Math.floor(Number(autoBackupKeepCount) || 30)));


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
    try {
      setBackupStatus(tr('جاري إعداد النسخة والرفع إلى Google Drive...', 'Preparing backup and uploading to Google Drive...'));
      const payload = await exportData('');
      if (!payload) {
        setBackupStatus(tr('تعذر إنشاء النسخة الاحتياطية', 'Could not create backup.'));
        return;
      }
      const result = await uploadBackupToGoogleDrive(payload);
      setBackupStatus(
        result.ok
          ? tr('تم رفع النسخة إلى Google Drive بنجاح.', 'Backup uploaded to Google Drive successfully.')
          : result.message
      );
    } catch (e: any) {
      setBackupStatus(tr('فشل الرفع: ' + (e?.message || e), 'Upload failed: ' + (e?.message || e)));
    }
  };

  const handleRestoreFromDrive = async () => {
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
    if (creatingCompany) return;
    setCreatingCompany(true);
    try {
      const result = await createCompany({ name: newCompanyName.trim() });
      if (!result.ok) {
        if (result.code === 'SUBSCRIPTION_LIMIT') {
          setMode('SUBSCRIPTION');
        }
        alert(result.message);
        return;
      }

      setNewCompanyName('');
      alert(tr('تم إنشاء الشركة بنجاح', 'Company created successfully.'));
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleDeleteCompany = async (company: CompanyProfile) => {
    if (deletingCompanyId === company.id) return;
    const confirmationMessage = company.id === currentCompanyId
      ? tr(
        `هل تريد حذف شركة "${company.name}"؟ سيتم التبديل تلقائيًا إلى شركة أخرى بعد الحذف.`,
        `Do you want to delete "${company.name}"? The app will switch to another company after deletion.`
      )
      : tr(
        `هل تريد حذف شركة "${company.name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
        `Do you want to delete "${company.name}"? This action cannot be undone.`
      );

    if (!confirm(confirmationMessage)) return;

    setDeletingCompanyId(company.id);
    try {
      const result = await deleteCompany(company.id);
      if (!result.ok) {
        alert(result.message);
        return;
      }

      alert(tr('تم حذف الشركة بنجاح.', 'Company deleted successfully.'));
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const [isWipingData, setIsWipingData] = useState(false);
  const handleWipeCompanyData = async () => {
    if (isWipingData) return;
    const confirmationMessage = tr(
      'تحذير خطير: سيتم مسح جميع البيانات المدخلة في الشركة الحالية (القيود، الفواتير، الأصناف، العملاء... إلخ) بشكل نهائي! هل أنت متأكد تماماً؟',
      'SEVERE WARNING: All entered data in the current company (transactions, invoices, products, contacts, etc) will be PERMANENTLY ERASED! Are you absolutely sure?'
    );

    if (!confirm(confirmationMessage)) return;

    const secondConfirmation = tr(
      'هذا الإجراء لا يمكن التراجع عنه أبداً. اضغط موافق للتأكيد النهائي.',
      'This action can NEVER be undone. Click OK to finally confirm.'
    );

    if (!confirm(secondConfirmation)) return;

    setIsWipingData(true);
    try {
      const result = await wipeAllCompanyData();
      if (!result.ok) {
        alert(result.message);
        return;
      }
      alert(tr('تم مسح جميع بيانات الشركة بنجاح.', 'All company data has been wiped successfully.'));
      // Reload page to ensure clean state
      window.location.reload();
    } finally {
      setIsWipingData(false);
    }
  };

  const getSubscriptionStatusLabel = (status: CompanySubscriptionStatus) => {
    switch (status) {
      case 'ACTIVE': return tr('مفعل', 'Active');
      case 'EXPIRED': return tr('منتهي', 'Expired');
      case 'SUSPENDED': return tr('موقوف', 'Suspended');
      default: return tr('تجريبي', 'Trial');
    }
  };

  const getSubscriptionPlanLabel = (plan: CompanySubscriptionPlan) => {
    switch (plan) {
      case 'BASIC': return tr('اشتراك مدفوع', 'Paid Subscription');
      case 'PRO': return tr('اشتراك مدفوع', 'Paid Subscription');
      case 'ENTERPRISE': return tr('اشتراك مدفوع', 'Paid Subscription');
      case 'NONE': return tr('بدون خطة', 'No plan');
      default: return tr('تجريبية', 'Trial');
    }
  };

  const resolveCompanyAccessEndLabel = (company: CompanyProfile) => {
    const targetDate = company.subscriptionStatus === 'TRIAL'
      ? company.trialEndsAt
      : company.subscriptionEndsAt;
    if (!targetDate) return '-';
    const parsed = new Date(targetDate);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-GB') : '-';
  };

  const formatDeviceSeenAt = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB') : '-';
  };

  const handleActivateSubscription = async () => {
    const result = await activateCompanySubscription(currentCompanyId, activationCodeDraft.trim());
    if (!result.ok) {
      setSubscriptionStatusMessage(result.message);
      alert(result.message);
      return;
    }
    setSubscriptionStatusMessage(tr('تم تفعيل الاشتراك أو تمديده بنجاح.', 'Subscription activated or renewed successfully.'));
  };

  const handleActivationCodePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;
    event.preventDefault();
    setActivationCodeDraft(normalizeActivationCodeInput(pastedText));
    setSubscriptionStatusMessage('');
  };

  const handlePasteActivationCodeFromClipboard = async () => {
    try {
      const pastedText = await navigator.clipboard.readText();
      const normalized = normalizeActivationCodeInput(pastedText);
      if (!normalized) {
        const message = tr('لم يتم العثور على كود صالح في الحافظة.', 'No valid activation code was found in the clipboard.');
        setSubscriptionStatusMessage(message);
        alert(message);
        return;
      }
      setActivationCodeDraft(normalized);
      setSubscriptionStatusMessage('');
      return;
    } catch {
      // Fall through to prompt fallback below.
    }

    if (typeof window === 'undefined') return;
    const manualValue = window.prompt(
      tr('ألصق كود التفعيل هنا:', 'Paste the activation code here:'),
      activationCodeDraft
    );
    if (manualValue === null) return;
    setActivationCodeDraft(normalizeActivationCodeInput(manualValue));
    setSubscriptionStatusMessage('');
  };

  const handleSaveSubscription = async () => {
    if (!currentCompany) return;

    const normalizedGraceDays = Math.max(0, Math.min(30, Math.floor(Number(subscriptionGraceDaysDraft) || 0)));
    const nextEndsAtIso = toIsoDateAtStartOfDay(subscriptionEndsAtDraft);
    if ((subscriptionStatusDraft === 'TRIAL' || subscriptionStatusDraft === 'ACTIVE') && !nextEndsAtIso) {
      const message = tr('يرجى تحديد تاريخ نهاية واضح للتجربة أو الاشتراك.', 'Please provide a clear end date for the trial or subscription.');
      setSubscriptionStatusMessage(message);
      alert(message);
      return;
    }
    const nextPlan = subscriptionStatusDraft === 'TRIAL'
      ? 'TRIAL'
      : (subscriptionPlanDraft === 'TRIAL' ? 'BASIC' : subscriptionPlanDraft);

    const updates: Partial<CompanyProfile> = {
      subscriptionStatus: subscriptionStatusDraft,
      subscriptionPlan: nextPlan,
      graceDays: normalizedGraceDays,
      activationCode: activationCodeDraft.trim() || currentCompany.activationCode,
      subscriptionStartsAt: currentCompany.subscriptionStartsAt || new Date().toISOString()
    };

    if (subscriptionStatusDraft === 'TRIAL') {
      updates.trialEndsAt = nextEndsAtIso || currentCompany.trialEndsAt;
      updates.subscriptionEndsAt = undefined;
    } else {
      updates.subscriptionEndsAt = nextEndsAtIso;
    }

    const result = await updateCompanySubscription(currentCompanyId, updates);
    if (!result.ok) {
      setSubscriptionStatusMessage(result.message);
      alert(result.message);
      return;
    }
    setSubscriptionStatusMessage(tr('تم حفظ حالة الاشتراك بنجاح.', 'Subscription settings saved successfully.'));
  };

  const handleIssueSubscriptionCode = async () => {
    const durationDays = Math.max(1, Math.min(3650, Math.floor(Number(issueDurationDaysDraft) || 0)));
    const maxDevices = Math.max(1, Math.min(20, Math.floor(Number(issueMaxDevicesDraft) || 1)));
    const reservedCompany = companies.find(company => company.id === issueReservedCompanyDraft);
    const result = await issueSubscriptionCode({
      plan: issuePlanDraft,
      durationDays,
      maxDevices,
      expiresAt: toIsoDateAtStartOfDay(issueExpiresAtDraft),
      notes: issueNotesDraft.trim() || undefined,
      reservedCompanyId: reservedCompany?.id,
      reservedCompanyName: reservedCompany?.name
    });

    if (!result.ok) {
      setIssuedCodeMessage(result.message);
      alert(result.message);
      return;
    }

    setIssuedCodeMessage(`${tr('تم إصدار الكود', 'Issued code')}: ${result.code}`);
    setIssueNotesDraft('');
    setIssueExpiresAtDraft('');
  };

  const handleCancelIssuedCode = async (code: string) => {
    const result = await cancelSubscriptionCode(code);
    if (!result.ok) {
      setIssuedCodeMessage(result.message);
      alert(result.message);
      return;
    }
    setIssuedCodeMessage(tr('تم إلغاء الكود بنجاح.', 'The activation code was cancelled successfully.'));
  };

  const handleLinkCurrentDevice = async () => {
    const result = await linkCurrentSubscriptionDevice(currentCompanyId);
    if (!result.ok) {
      setSubscriptionStatusMessage(result.message);
      alert(result.message);
      return;
    }
    setSubscriptionStatusMessage(tr('تم ربط هذا الجهاز بالشركة الحالية بنجاح.', 'This device was linked to the current company successfully.'));
  };

  const handleUnlinkDevice = async (deviceId: string) => {
    const result = await unlinkSubscriptionDevice(currentCompanyId, deviceId);
    if (!result.ok) {
      setSubscriptionStatusMessage(result.message);
      alert(result.message);
      return;
    }
    setSubscriptionStatusMessage(tr('تم فك ربط الجهاز المحدد.', 'The selected device was unlinked successfully.'));
  };

  const handleLogoFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(tr('يرجى اختيار ملف صورة صالح', 'Please select a valid image file.'));
      return;
    }
    
    try {
      const compressedDataUrl = await compressImageFile(file, {
        maxWidth: 500,
        maxHeight: 500,
        quality: 0.8,
        mimeType: 'image/png' // Use PNG to preserve potential transparency in logos
      });
      setLogoCropSource(compressedDataUrl);
    } catch (error) {
      console.error('Failed to compress logo:', error);
      alert(tr('حدث خطأ أثناء معالجة الصورة.', 'An error occurred while processing the image.'));
    }
  };

  const handleCloseLogoCrop = () => {
    setLogoCropSource(null);
  };

  const handleApplyLogoCrop = (logoUrl: string) => {
    const nextCompany = withCompanyDefaults({
      ...localCompany,
      logoUrl,
      language: normalizeLanguage(localCompany.language)
    });
    const result = updateCompanySettings(nextCompany);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setLocalCompany(nextCompany);
    setLogoCropSource(null);
    alert(tr('تم حفظ الشعار بنجاح.', 'Logo updated successfully.'));
  };

  const hasPasswordProvider = useMemo(() => {
    if (!firebaseAuth?.currentUser) return false;
    return firebaseAuth.currentUser.providerData.some(p => p.providerId === 'password');
  }, [firebaseAuth?.currentUser]);

  const handleUserPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseAuth?.currentUser) return;
    
    if (userNewPassword.length < 6) {
      setUserPassStatus(tr('يجب أن تكون كلمة المرور 6 أحرف على الأقل.', 'Password must be at least 6 characters.'));
      return;
    }
    if (userNewPassword !== userConfirmPassword) {
      setUserPassStatus(tr('كلمتا المرور غير متطابقتين.', 'Passwords do not match.'));
      return;
    }

    setUserPassLoading(true);
    setUserPassStatus('');

    try {
      const email = firebaseAuth.currentUser.email || '';
      if (hasPasswordProvider) {
        // Reauthenticate
        const credential = EmailAuthProvider.credential(email, userCurrentPassword);
        await reauthenticateWithCredential(firebaseAuth.currentUser, credential);
        await updatePassword(firebaseAuth.currentUser, userNewPassword);
        setUserPassStatus(tr('تم تحديث كلمة المرور بنجاح!', 'Password updated successfully!'));
      } else {
        // Link credential (Google user setting password)
        const credential = EmailAuthProvider.credential(email, userNewPassword);
        await linkWithCredential(firebaseAuth.currentUser, credential);
        setUserPassStatus(tr('تم إنشاء كلمة مرور للحساب بنجاح!', 'Password created for this account successfully!'));
      }

      if (firebaseDb) {
        await setDoc(doc(firebaseDb, 'users', firebaseAuth.currentUser.uid), {
          password: userNewPassword
        }, { merge: true });
      }

      setUserCurrentPassword('');
      setUserNewPassword('');
      setUserConfirmPassword('');
    } catch (err: any) {
      console.error('[Change Password Error]', err);
      let errMsg = err.message || '';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errMsg = tr('كلمة المرور الحالية غير صحيحة.', 'Current password is incorrect.');
      }
      setUserPassStatus(`${tr('فشل تحديث كلمة المرور:', 'Failed to update password:')} ${errMsg}`);
    } finally {
      setUserPassLoading(false);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseAuth?.currentUser) return;

    if (!adminNewUserCode.trim()) {
      setAdminUserMgmtStatus(tr('يرجى إدخال كود الحساب.', 'Please enter the account code.'));
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,}$/.test(adminNewUserCode.trim())) {
      setAdminUserMgmtStatus(tr('يجب أن يتكون كود الحساب من 3 أحرف أو أرقام على الأقل، بدون مسافات أو رموز خاصة.', 'Account code must be at least 3 characters or numbers, without spaces or special characters.'));
      return;
    }
    if (!adminNewUserFullName.trim()) {
      setAdminUserMgmtStatus(tr('يرجى إدخال الاسم الكامل.', 'Please enter the full name.'));
      return;
    }
    if (adminNewUserPassword.length < 6) {
      setAdminUserMgmtStatus(tr('يجب أن تكون كلمة المرور 6 أحرف على الأقل.', 'Password must be at least 6 characters.'));
      return;
    }

    setAdminUserMgmtLoading(true);
    setAdminUserMgmtStatus('');

    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const backendApiUrl = getBackendApiUrl();
      
      const response = await fetch(`${backendApiUrl}/companies/${currentCompanyId}/users/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountCode: adminNewUserCode.trim(),
          fullName: adminNewUserFullName.trim(),
          password: adminNewUserPassword,
          role: adminNewUserRole,
          companyName: currentCompany?.name || 'Company'
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        if (resData.error === 'ACCOUNT_CODE_EXISTS') {
          throw new Error(tr('كود الحساب هذا مستخدم بالفعل.', 'This account code is already in use.'));
        }
        throw new Error(resData.error || 'Failed to create user');
      }

      // User created successfully on auth and Firestore profile initialized!
      addUser({
        id: resData.uid,
        name: adminNewUserFullName.trim(),
        email: resData.email,
        role: adminNewUserRole,
        status: 'ACTIVE'
      });

      setAdminUserMgmtStatus(tr('تم إنشاء المستخدم الجديد بنجاح!', 'New user created successfully!'));
      setAdminNewUserCode('');
      setAdminNewUserFullName('');
      setAdminNewUserPassword('');
      fetchGlobalUsers();
    } catch (err: any) {
      console.error('[Admin Create User Error]', err);
      setAdminUserMgmtStatus(`${tr('فشل إنشاء المستخدم:', 'Failed to create user:')} ${err.message}`);
    } finally {
      setAdminUserMgmtLoading(false);
    }
  };

  const handleAdminChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseAuth?.currentUser || !adminSelectedUserForPasswordReset) return;

    if (adminResetPasswordValue.length < 6) {
      setAdminResetPasswordStatus(tr('يجب أن تكون كلمة المرور 6 أحرف على الأقل.', 'Password must be at least 6 characters.'));
      return;
    }

    setAdminResetPasswordLoading(true);
    setAdminResetPasswordStatus('');

    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const backendApiUrl = getBackendApiUrl();
      
      const response = await fetch(`${backendApiUrl}/companies/${currentCompanyId}/users/${adminSelectedUserForPasswordReset}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          newPassword: adminResetPasswordValue
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to change password');
      }

      setAdminResetPasswordStatus(tr('تم تغيير كلمة المرور بنجاح!', 'Password changed successfully!'));
      setAdminResetPasswordValue('');
      fetchGlobalUsers();
      setTimeout(() => {
        setAdminSelectedUserForPasswordReset('');
        setAdminResetPasswordStatus('');
      }, 2000);
    } catch (err: any) {
      console.error('[Admin Change Password Error]', err);
      setAdminResetPasswordStatus(`${tr('فشل تغيير كلمة المرور:', 'Failed to change password:')} ${err.message}`);
    } finally {
      setAdminResetPasswordLoading(false);
    }
  };

  const handleAdminUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseAuth?.currentUser || !adminSelectedUserForSubscription) return;

    setAdminSubLoading(true);
    setAdminSubStatusMessage('');

    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const backendApiUrl = getBackendApiUrl();
      
      const response = await fetch(`${backendApiUrl}/admin/users/${adminSelectedUserForSubscription}/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: adminSubPlan,
          status: adminSubStatus,
          expiresAt: adminSubExpiresAt,
          maxCompanies: adminSubMaxCompanies,
          lifetimeAccess: adminSubLifetimeAccess,
          unlimitedCompanies: adminSubUnlimitedCompanies
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to update subscription');
      }

      setAdminSubStatusMessage(tr('تم تحديث الاشتراك بنجاح!', 'Subscription updated successfully!'));
      fetchGlobalUsers();
      setTimeout(() => {
        setAdminSelectedUserForSubscription('');
        setAdminSubStatusMessage('');
      }, 1500);
    } catch (err: any) {
      console.error('[Admin Update Subscription Error]', err);
      setAdminSubStatusMessage(`${tr('فشل تحديث الاشتراك:', 'Failed to update subscription:')} ${err.message}`);
    } finally {
      setAdminSubLoading(false);
    }
  };

  const handleAdminDeleteUser = async () => {
    if (!firebaseAuth?.currentUser || !adminSelectedUserForDelete) return;

    setAdminDeleteUserLoading(true);
    setAdminDeleteUserStatus('');

    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const backendApiUrl = getBackendApiUrl();

      const response = await fetch(`${backendApiUrl}/admin/users/${adminSelectedUserForDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to delete user');
      }

      setAdminDeleteUserStatus(tr('تم حذف المستخدم بنجاح!', 'User deleted successfully!'));
      fetchGlobalUsers();
      setTimeout(() => {
        setAdminSelectedUserForDelete('');
        setAdminDeleteUserStatus('');
      }, 1500);
    } catch (err: any) {
      console.error('[Admin Delete User Error]', err);
      setAdminDeleteUserStatus(`${tr('فشل حذف المستخدم:', 'Failed to delete user:')} ${err.message}`);
    } finally {
      setAdminDeleteUserLoading(false);
    }
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

  const renderUserAccountForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
        <User className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-black text-gray-800">{tr('معلومات الحساب', 'Account Information')}</h3>
      </div>
      
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gray-500">{tr('الاسم', 'Name')}</label>
          <div className="text-sm font-black text-gray-900">{currentUser?.name || '-'}</div>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gray-500">
            {isCodeEmail(currentUser?.email) ? tr('كود الحساب', 'Account Code') : tr('البريد الإلكتروني', 'Email')}
          </label>
          <div className="text-sm font-black text-gray-900">
            {isCodeEmail(currentUser?.email) ? extractCodeFromEmail(currentUser?.email) : (currentUser?.email || '-')}
          </div>
        </div>

        {currentUser?.email !== 'hamza.mm.aa.ss@gmail.com' && (
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
            <div>
              <label className="text-[10px] font-bold text-gray-500">{tr('كود الحساب لتسجيل الدخول', 'Account Code for Login')}</label>
              <div className="text-xs font-black text-slate-800">{currentUser?.accountCode || tr('غير متوفر', 'Not available')}</div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500">{tr('كلمة السر الحالية', 'Current Password')}</label>
              <div className="text-xs font-black text-slate-800 select-all">{currentUser?.password || tr('لم يتم تعيينها بعد', 'Not set yet')}</div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gray-500">{tr('حالة التسجيل', 'Registration Status')}</label>
          <div className="text-sm font-black">
            <span className={`px-2 py-1 rounded-lg text-xs ${currentUser?.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
              {currentUser?.status === 'ACTIVE' ? tr('نشط', 'Active') : tr('غير نشط', 'Inactive')}
            </span>
          </div>
        </div>
        
        <div className="flex flex-col gap-1 pt-2 border-t border-gray-100">
          <label className="text-[11px] font-bold text-gray-500">{tr('الصلاحية', 'Role')}</label>
          <div className="text-sm font-black text-gray-900">
            {currentUser?.role === 'ADMIN' ? tr('مدير نظام', 'Admin') : currentUser?.role === 'ACCOUNTANT' ? tr('محاسب', 'Accountant') : tr('مستخدم للعرض', 'Viewer')}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 space-y-3">
          <h4 className="text-xs font-black text-gray-700">
            {hasPasswordProvider ? tr('تغيير كلمة المرور', 'Change Password') : tr('إنشاء كلمة مرور للحساب', 'Create Account Password')}
          </h4>
          
          {userPassStatus && (
            <div className={`text-[11px] font-bold p-2.5 rounded-lg border text-center ${
              userPassStatus.includes('نجاح') || userPassStatus.includes('success')
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                : 'bg-rose-50 border-rose-100 text-rose-700'
            }`}>
              {userPassStatus}
            </div>
          )}

          <form onSubmit={handleUserPasswordSubmit} className="space-y-3">
            {hasPasswordProvider && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-500">{tr('كلمة المرور الحالية', 'Current Password')}</label>
                <input
                  type="password"
                  required
                  value={userCurrentPassword}
                  onChange={(e) => setUserCurrentPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder={tr('أدخل كلمة المرور الحالية', 'Enter current password')}
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-500">{tr('كلمة المرور الجديدة', 'New Password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userNewPassword}
                  onChange={(e) => setUserNewPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder={tr('6 أحرف على الأقل', 'At least 6 characters')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-500">{tr('تأكيد كلمة المرور الجديدة', 'Confirm New Password')}</label>
                <input
                  type="password"
                  required
                  value={userConfirmPassword}
                  onChange={(e) => setUserConfirmPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder={tr('تأكيد كلمة المرور', 'Confirm password')}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={userPassLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition-all disabled:opacity-75"
            >
              {userPassLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                hasPasswordProvider ? tr('حفظ التغييرات', 'Save Changes') : tr('تفعيل كلمة المرور', 'Enable Password')
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );


  const renderUserManagementForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-black text-gray-800">{tr('إدارة المستخدمين', 'User Management')}</h3>
        </div>
        <button
          type="button"
          onClick={() => setMode('MENU')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition-all"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          {tr('عودة', 'Back')}
        </button>
      </div>

      {/* Create User Form */}
      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-3">
        <h4 className="text-xs font-black text-gray-700">{tr('إنشاء مستخدم جديد بكود الحساب', 'Create New User via Account Code')}</h4>
        
        {adminUserMgmtStatus && (
          <div className={`text-[11px] font-bold p-2.5 rounded-lg border text-center ${
            adminUserMgmtStatus.includes('نجاح') || adminUserMgmtStatus.includes('success')
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-rose-50 border-rose-100 text-rose-700'
          }`}>
            {adminUserMgmtStatus}
          </div>
        )}

        <form onSubmit={handleAdminCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500">{tr('كود الحساب', 'Account Code')}</label>
            <input
              type="text"
              required
              value={adminNewUserCode}
              onChange={(e) => setAdminNewUserCode(e.target.value)}
              className="bg-white border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
              placeholder={tr('مثال: user123', 'e.g. user123')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500">{tr('الاسم الكامل', 'Full Name')}</label>
            <input
              type="text"
              required
              value={adminNewUserFullName}
              onChange={(e) => setAdminNewUserFullName(e.target.value)}
              className="bg-white border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
              placeholder={tr('الاسم الكامل للمستخدم', 'Full name of user')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500">{tr('كلمة المرور', 'Password')}</label>
            <input
              type="password"
              required
              minLength={6}
              value={adminNewUserPassword}
              onChange={(e) => setAdminNewUserPassword(e.target.value)}
              className="bg-white border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
              placeholder={tr('6 أحرف على الأقل', 'At least 6 characters')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500">{tr('الصلاحية', 'Role')}</label>
            <select
              value={adminNewUserRole}
              onChange={(e) => setAdminNewUserRole(e.target.value as UserRole)}
              className="bg-white border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5"
            >
              <option value="ACCOUNTANT">{tr('محاسب (Accountant)', 'Accountant')}</option>
              <option value="VIEWER">{tr('عرض فقط (Viewer)', 'Viewer')}</option>
              <option value="ADMIN">{tr('مدير نظام (Admin)', 'Admin')}</option>
            </select>
          </div>
          <div className="md:col-span-2 pt-2">
            <button
              type="submit"
              disabled={adminUserMgmtLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition-all disabled:opacity-75"
            >
              {adminUserMgmtLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                tr('إنشاء مستخدم', 'Create User')
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Users List & Actions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-gray-700">{tr('المستخدمون الحاليون للبرنامج', 'All Program Users')}</h4>
          {globalUsersLoading && (
            <div className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
          )}
        </div>
        <div className="overflow-x-auto border border-gray-100 rounded-2xl">
          <table className="w-full text-xs text-right text-gray-500">
            <thead className="text-[10px] text-gray-700 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-3 text-right">{tr('الاسم', 'Name')}</th>
                <th className="p-3 text-right">{tr('المعرف / البريد', 'ID / Email')}</th>
                <th className="p-3 text-right">{tr('كود الحساب', 'Account Code')}</th>
                <th className="p-3 text-right">{tr('الصلاحية', 'Role')}</th>
                <th className="p-3 text-right">{tr('كلمة المرور', 'Password')}</th>
                <th className="p-3 text-right">{tr('الاشتراك الحالي', 'Subscription')}</th>
                <th className="p-3 text-center">{tr('العمليات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {globalUsers.map((u) => {
                const isCode = isCodeEmail(u.email);
                const displayEmail = isCode ? extractCodeFromEmail(u.email) : u.email;
                return (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-bold text-gray-800">{u.name}</td>
                    <td className="p-3 text-gray-600 dir-ltr text-right">{displayEmail}</td>
                    <td className="p-3 font-bold text-slate-800">{u.accountCode || tr('غير متوفر', 'Not available')}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : u.role === 'ACCOUNTANT' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role === 'ADMIN' ? tr('مدير', 'Admin') : u.role === 'ACCOUNTANT' ? tr('محاسب', 'Accountant') : tr('عرض', 'Viewer')}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 select-all font-mono text-[11px]">{u.password || '-'}</td>
                    <td className="p-3 text-slate-700 text-[11px]">
                      <span className="font-bold text-indigo-600">{u.subscription?.plan || 'TRIAL'}</span>
                      {' · '}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        u.subscription?.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>{u.subscription?.status || 'TRIAL'}</span>
                      {u.subscription?.expiresAt && (
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          {tr('ينتهي في:', 'Ends on:')} {new Date(u.subscription.expiresAt).toLocaleDateString('en-GB')}
                        </div>
                      )}
                      {u.subscription?.lifetimeAccess && (
                        <div className="text-[9px] text-emerald-600 font-bold mt-0.5">
                          {tr('وصول مدى الحياة', 'Lifetime Access')}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAdminSelectedUserForPasswordReset(u.id);
                          setAdminResetPasswordStatus('');
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold underline"
                      >
                        {tr('تغيير كلمة المرور', 'Password')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdminSelectedUserForSubscription(u.id);
                          setAdminSubPlan(u.subscription?.plan || 'TRIAL');
                          setAdminSubStatus(u.subscription?.status || 'TRIAL');
                          setAdminSubExpiresAt(u.subscription?.expiresAt || '');
                          setAdminSubMaxCompanies(u.subscription?.maxCompanies || 1);
                          setAdminSubLifetimeAccess(!!u.subscription?.lifetimeAccess);
                          setAdminSubUnlimitedCompanies(!!u.subscription?.unlimitedCompanies);
                          setAdminSubStatusMessage('');
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline ml-2"
                      >
                        {tr('إدارة الاشتراك', 'Subscription')}
                      </button>
                      {u.email !== 'hamza.mm.aa.ss@gmail.com' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAdminSelectedUserForDelete(u.id);
                            setAdminDeleteUserStatus('');
                          }}
                          className="text-xs text-rose-600 hover:text-rose-800 font-bold underline ml-2"
                        >
                          {tr('حذف', 'Delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {globalUsers.length === 0 && !globalUsersLoading && (
                <tr>
                  <td colSpan={7} className="p-4 text-center font-bold text-gray-400">
                    {tr('لا يوجد مستخدمون حالياً.', 'No users found.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Reset Password Modal/Section */}
      {adminSelectedUserForPasswordReset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-black text-gray-800">
              {tr('تغيير كلمة المرور للمستخدم', 'Change Password for User')}: {' '}
              <span className="text-indigo-600">
                {users.find(u => u.id === adminSelectedUserForPasswordReset)?.name || ''}
              </span>
            </h3>

            {adminResetPasswordStatus && (
              <div className={`text-[11px] font-bold p-2.5 rounded-lg border text-center ${
                adminResetPasswordStatus.includes('نجاح') || adminResetPasswordStatus.includes('success')
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-rose-50 border-rose-100 text-rose-700'
              }`}>
                {adminResetPasswordStatus}
              </div>
            )}

            <form onSubmit={handleAdminChangePassword} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-500">{tr('كلمة المرور الجديدة', 'New Password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={adminResetPasswordValue}
                  onChange={(e) => setAdminResetPasswordValue(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  placeholder={tr('6 أحرف على الأقل', 'At least 6 characters')}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setAdminSelectedUserForPasswordReset('')}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={adminResetPasswordLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition-all disabled:opacity-75"
                >
                  {adminResetPasswordLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    tr('تغيير كلمة المرور', 'Change Password')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Subscription Management Modal */}
      {adminSelectedUserForSubscription && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-black text-gray-800">
              {tr('إدارة اشتراك المستخدم', 'Manage User Subscription')}: {' '}
              <span className="text-indigo-600 font-bold">
                {globalUsers.find(u => u.id === adminSelectedUserForSubscription)?.name || ''}
              </span>
            </h3>

            {adminSubStatusMessage && (
              <div className={`text-[11px] font-bold p-2.5 rounded-lg border text-center ${
                adminSubStatusMessage.includes('نجاح') || adminSubStatusMessage.includes('success')
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-rose-50 border-rose-100 text-rose-700'
              }`}>
                {adminSubStatusMessage}
              </div>
            )}

            <form onSubmit={handleAdminUpdateSubscription} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500">{tr('خطة الاشتراك', 'Subscription Plan')}</label>
                  <select
                    value={adminSubPlan}
                    onChange={(e) => setAdminSubPlan(e.target.value as CompanySubscriptionPlan)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  >
                    <option value="TRIAL">{tr('تجريبي (Trial)', 'Trial')}</option>
                    <option value="BASIC">{tr('اشتراك مدفوع (Paid)', 'Paid')}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500">{tr('حالة الاشتراك', 'Subscription Status')}</label>
                  <select
                    value={adminSubStatus}
                    onChange={(e) => setAdminSubStatus(e.target.value as CompanySubscriptionStatus)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  >
                    <option value="TRIAL">{tr('تجريبي', 'Trial')}</option>
                    <option value="ACTIVE">{tr('نشط', 'Active')}</option>
                    <option value="SUSPENDED">{tr('موقوف مؤقتاً', 'Suspended')}</option>
                    <option value="EXPIRED">{tr('منتهي', 'Expired')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500">{tr('تاريخ نهاية الوصول', 'Access Ends Date')}</label>
                  <input
                    type="date"
                    value={adminSubExpiresAt ? adminSubExpiresAt.split('T')[0] : ''}
                    onChange={(e) => setAdminSubExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500">{tr('أقصى عدد للشركات', 'Max Companies')}</label>
                  <input
                    type="number"
                    min={1}
                    value={adminSubMaxCompanies}
                    onChange={(e) => setAdminSubMaxCompanies(Number(e.target.value) || 1)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminSubLifetimeAccess}
                    onChange={(e) => setAdminSubLifetimeAccess(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  {tr('وصول مدى الحياة (Lifetime Access)', 'Lifetime Access')}
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminSubUnlimitedCompanies}
                    onChange={(e) => setAdminSubUnlimitedCompanies(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  {tr('شركات غير محدودة (Unlimited Companies)', 'Unlimited Companies')}
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setAdminSelectedUserForSubscription('')}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={adminSubLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition-all disabled:opacity-75"
                >
                  {adminSubLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    tr('تحديث الاشتراك', 'Update Subscription')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Delete User Confirmation Modal */}
      {adminSelectedUserForDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-gray-800">
                {tr('حذف حساب المستخدم', 'Delete User Account')}
              </h3>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed font-bold">
                {tr('هل أنت متأكد من رغبتك في حذف هذا المستخدم؟', 'Are you sure you want to delete this user?')}
              </p>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="text-xs text-slate-700">
                  <span className="font-bold text-gray-900 block mb-1">
                    {tr('تفاصيل المستخدم:', 'User Details:')}
                  </span>
                  <div className="space-y-0.5">
                    <div>{tr('الاسم:', 'Name:')} <span className="font-bold">{globalUsers.find(u => u.id === adminSelectedUserForDelete)?.name || ''}</span></div>
                    <div>{tr('البريد / المعرف:', 'Email / ID:')} <span className="font-mono">{globalUsers.find(u => u.id === adminSelectedUserForDelete)?.email || ''}</span></div>
                    {globalUsers.find(u => u.id === adminSelectedUserForDelete)?.accountCode && (
                      <div>{tr('كود الحساب:', 'Account Code:')} <span className="font-bold text-indigo-600">{globalUsers.find(u => u.id === adminSelectedUserForDelete)?.accountCode}</span></div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-[11px] font-black text-rose-700 leading-normal">
                {tr(
                  'تحذير: هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بيانات المستخدم وملف المصادقة والاشتراك المرتبط به نهائياً من النظام.',
                  'Warning: This action is irreversible. All user profile data, authentication record, and associated subscription details will be permanently deleted.'
                )}
              </div>
            </div>

            {adminDeleteUserStatus && (
              <div className={`text-[11px] font-bold p-2.5 rounded-lg border text-center ${
                adminDeleteUserStatus.includes('نجاح') || adminDeleteUserStatus.includes('success')
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-rose-50 border-rose-100 text-rose-700'
              }`}>
                {adminDeleteUserStatus}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setAdminSelectedUserForDelete('')}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all"
                disabled={adminDeleteUserLoading}
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleAdminDeleteUser}
                disabled={adminDeleteUserLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition-all disabled:opacity-75"
              >
                {adminDeleteUserLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  tr('تأكيد الحذف', 'Confirm Delete')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );


  const renderCompaniesForm = () => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className={`rounded-xl border px-3 py-3 text-xs font-black ${subscriptionMeta.tone}`}>
        <div>{tr('الشركة الحالية', 'Current company')}: {currentCompany?.name || '-'}</div>
        <div className="mt-1">
          {tr('الحالة الحالية', 'Current status')}: {subscriptionMeta.badge}
          {' | '}
          {tr('نهاية الوصول', 'Access ends')}: {subscriptionMeta.endsAtText}
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-4 ${workspaceCompanyLimitReached ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-black text-slate-800">{tr('حد الشركات في الحساب', 'Company limit in account')}</div>
            <div className="text-[11px] font-bold text-gray-500 mt-1">
              {tr('الخطة الأساسية تشمل شركة واحدة، ويمكن إضافة شركات إضافية مدفوعة على نفس الحساب.', 'The base plan includes one company, and extra paid companies can be added on the same account.')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode('SUBSCRIPTION')}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black"
          >
            {tr('ترقية الاشتراك', 'Upgrade subscription')}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-black">
          <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-slate-700">
            {tr('المستخدم', 'Used')}: {companies.length}
          </div>
          <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-slate-700">
            {tr('المسموح', 'Allowed')}: {workspaceMaxCompaniesLabel}
          </div>
          <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-slate-700">
            {tr('المتبقي', 'Remaining')}: {workspaceRemainingCompanySlotsLabel}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {companies.map(company => (
          <div key={company.id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className={rtl ? 'text-right min-w-0' : 'text-left min-w-0'}>
              <p className="text-sm font-black text-slate-800 truncate">{company.name}</p>
              <p className="text-[11px] font-bold text-gray-400">
                {getSubscriptionStatusLabel(company.subscriptionStatus)} | {getSubscriptionPlanLabel(company.subscriptionPlan)} | {tr('حتى', 'until')}: {resolveCompanyAccessEndLabel(company)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {companies.length > 1 && (
                <button
                  type="button"
                  onClick={() => void handleDeleteCompany(company)}
                  disabled={deletingCompanyId === company.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border border-rose-200 bg-rose-50 text-rose-700 disabled:opacity-70"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr('حذف', 'Delete')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSwitchCompany(company.id)}
                className={`px-3 py-2 rounded-lg text-xs font-black ${company.id === currentCompanyId ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white'
                  }`}
              >
                {company.id === currentCompanyId ? tr('مفعلة', 'Active') : tr('تبديل', 'Switch')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4 mt-4 space-y-2">
        <label className="block text-xs font-bold text-gray-500">{tr('إدارة بيانات الشركة الحالية', 'Current company data management')}</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleWipeCompanyData}
            disabled={isWipingData}
            className="flex-1 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {tr('مسح جميع البيانات المدخلة وبدء حساب جديد للشركة', 'Wipe all entered data and start fresh for this company')}
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <label className="block text-xs font-bold text-gray-500">{tr('إضافة شركة جديدة', 'Add new company')}</label>
        <div className="flex gap-2">
          <input
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            disabled={creatingCompany}
            className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-bold"
            placeholder={tr('اسم الشركة', 'Company name')}
          />
          <button
            type="button"
            onClick={handleCreateCompany}
            disabled={creatingCompany}
            className="px-4 rounded-xl bg-blue-600 text-white text-xs font-black disabled:opacity-70"
          >
            {tr('إضافة', 'Add')}
          </button>
        </div>
      </div>
    </div>
  );

  const renderSubscriptionForm = () => (
    true ? (() => {
      const activePlanLabel = getSubscriptionPlanLabel(currentCompany?.subscriptionPlan || 'TRIAL');
      const preferredQuote = workspaceQuotes[0];
      const readyQuotes = workspaceQuotes.filter(quote => quote.providerReady);
      const displayQuotes = readyQuotes.length ? readyQuotes : workspaceQuotes;
      const accessLabel = workspaceSubscription.lifetimeAccess
        ? tr('مدى الحياة', 'Lifetime')
        : tr('سنوي', 'Yearly');
      const accessEndsLabel = workspaceSubscription.lifetimeAccess
        ? tr('لا ينتهي', 'Does not expire')
        : subscriptionMeta.endsAtText;
      const activeOfferSummary = workspaceSubscription.lifetimeAccess
        ? (
          workspaceCompaniesUnlimited
            ? tr('تم تفعيل اشتراك مدى الحياة مع شركات غير محدودة على هذا الحساب.', 'Lifetime access with unlimited companies is active on this account.')
            : tr(`تم تفعيل اشتراك مدى الحياة لما يصل إلى ${workspaceMaxCompanies} شركة على هذا الحساب.`, `Lifetime access for up to ${workspaceMaxCompanies} companies is active on this account.`)
        )
        : workspaceSubscription.discountPercent > 0
          ? tr(`خصم ${workspaceSubscription.discountPercent}% مطبق على التجديد السنوي.`, `${workspaceSubscription.discountPercent}% discount is applied to the yearly renewal.`)
          : workspaceSubscription.offerNote || '';
      const simplifiedSummaryCards = [
        {
          key: 'subscription',
          label: tr('نوع الاشتراك', 'Subscription type'),
          value: accessLabel
        },
        {
          key: 'status',
          label: tr('الحالة', 'Status'),
          value: subscriptionMeta.badge
        },
        {
          key: 'companies',
          label: tr('الشركات الحالية', 'Current companies'),
          value: workspaceCompanyUsageLabel
        },
        {
          key: 'renewal',
          label: tr('نهاية الوصول', 'Access ends'),
          value: accessEndsLabel
        }
      ];

      return (
        <div className="bg-white p-4 sm:p-5 rounded-[28px] shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-700">
                  <Wallet className="w-4 h-4" />
                  {workspaceSubscription.lifetimeAccess
                    ? tr('الاشتراك الحالي: مدى الحياة', 'Current subscription: Lifetime')
                    : tr('الاشتراك الحالي: سنوي', 'Current subscription: Yearly')}
                </div>
                <div className="text-2xl font-black text-slate-900">{currentCompany?.name || companySettings.name}</div>
                <div className="max-w-3xl text-sm font-bold leading-7 text-slate-600">
                  {tr(
                    'هذه الشاشة مخصصة للاشتراك السنوي وإضافة الشركات فقط. يمكن الدخول من أي جهاز بدون تقييد بعدد الأجهزة، ويمكن أيضًا تطبيق كود خصم أو شهر مجاني أو مدى الحياة مباشرة من هنا.',
                    'This screen focuses only on the yearly subscription and adding companies. Sign-in is allowed from any device, and you can also apply a discount, free month, or lifetime code directly here.'
                  )}
                </div>
              </div>
              <div className={`rounded-full px-3 py-1.5 text-[11px] font-black ${subscriptionMeta.tone}`}>
                {subscriptionMeta.badge}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {simplifiedSummaryCards.map(card => (
                <div key={card.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[10px] font-black text-slate-400">{card.label}</div>
                  <div className="mt-2 text-sm font-black text-slate-900 break-words dir-auto">{card.value}</div>
                </div>
              ))}
            </div>

            {activeOfferSummary && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] font-black text-emerald-700 leading-6">
                {workspaceSubscription.offerCode ? (
                  <span className="dir-ltr inline-block text-left">{workspaceSubscription.offerCode}</span>
                ) : null}
                {workspaceSubscription.offerCode ? ' - ' : null}
                {activeOfferSummary}
              </div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-blue-100 bg-blue-50/50 p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-lg font-black text-slate-900">{tr('تجديد الاشتراك أو إضافة شركة', 'Renew subscription or add a company')}</div>
                  <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                    {tr(
                      'شركة واحدة ضمن الاشتراك السنوي بقيمة 20 دولار، وكل شركة إضافية بقيمة 5 دولارات سنويًا.',
                      'One company is included in the yearly subscription for $20, and each extra company adds $5 per year.'
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-[11px] font-black text-slate-700 border border-blue-100">
                  {activePlanLabel}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,170px)_minmax(0,1fr)]">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{tr('عدد الشركات المطلوب', 'Required company count')}</label>
                  <input
                    value={billingCompanyCountDraft}
                    onChange={(e) => setBillingCompanyCountDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2) || '1')}
                    className="w-full p-3 rounded-2xl border border-blue-100 bg-white outline-none font-black dir-ltr"
                    inputMode="numeric"
                    placeholder="1"
                  />
                </div>

                <div className="rounded-[24px] border border-blue-100 bg-white px-4 py-4 space-y-3">
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[10px] font-black text-blue-700">{tr('الإجمالي السنوي', 'Yearly total')}</div>
                      <div className="mt-2 text-3xl font-black text-slate-900 dir-ltr">
                        {formatUsd(preferredQuote?.totalPriceUsd || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700">
                      {tr('يشمل', 'Includes')} {desiredBillingCompanyCount} {tr('شركة', 'company slot(s)')}
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-slate-600 leading-6">
                    {tr('الأساسي', 'Base')}: {formatUsd(preferredQuote?.basePriceUsd || 0)}
                    {' | '}
                    {tr('كل شركة إضافية', 'Each extra company')}: {formatUsd(preferredQuote?.extraCompanyPriceUsd || 0)} x {preferredQuote?.extraCompanyCount || 0}
                    {preferredQuote && preferredQuote.discountPercent > 0 ? (
                      <>
                        <br />
                        {tr('الخصم', 'Discount')}: {preferredQuote.discountPercent}% ({formatUsd(preferredQuote.discountAmountUsd)})
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-dashed border-blue-200 bg-white px-4 py-4 space-y-3">
                <div>
                  <div className="text-sm font-black text-slate-900">{tr('كود العرض أو المنحة', 'Offer or grant code')}</div>
                  <div className="mt-1 text-[11px] font-bold leading-6 text-slate-500">
                    {tr(
                      'يمكنك إدخال كود خصم، أو كود شهر مجاني، أو كود اشتراك مدى الحياة.',
                      'You can enter a discount code, a free-month code, or a lifetime subscription code.'
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    value={workspaceOfferCodeDraft}
                    onChange={(e) => {
                      setWorkspaceOfferCodeDraft(normalizeActivationCodeInput(e.target.value));
                      setWorkspaceOfferStatusMessage('');
                    }}
                    onPaste={(event) => {
                      const pastedText = event.clipboardData.getData('text');
                      if (!pastedText) return;
                      event.preventDefault();
                      setWorkspaceOfferCodeDraft(normalizeActivationCodeInput(pastedText));
                      setWorkspaceOfferStatusMessage('');
                    }}
                    className="w-full p-3 rounded-2xl border border-blue-100 bg-white outline-none font-black dir-ltr"
                    placeholder="AIFLEX-OFFER-..."
                  />
                  <button
                    type="button"
                    onClick={() => { void handleRedeemWorkspaceOfferCode(); }}
                    disabled={workspaceOfferBusy}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                      workspaceOfferBusy
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {workspaceOfferBusy ? tr('جارٍ التطبيق...', 'Applying...') : tr('تطبيق الكود', 'Apply code')}
                  </button>
                </div>

                {workspaceOfferStatusMessage && (
                  <div className={`rounded-2xl px-4 py-3 text-xs font-black ${
                    workspaceOfferStatusMessage === tr('تم تطبيق العرض بنجاح.', 'Offer applied successfully.')
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-amber-200 bg-amber-50 text-amber-700'
                  }`}>
                    {workspaceOfferStatusMessage}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:p-6 space-y-4">
              <div>
                <div className="text-lg font-black text-slate-900">{tr('طرق الدفع', 'Payment methods')}</div>
                <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                  {workspaceSubscription.lifetimeAccess
                    ? tr(
                        'اشتراك مدى الحياة مفعل حاليًا، لذلك لا تحتاج إلى الدفع أو التجديد الآن.',
                        'Lifetime access is already active, so no payment or renewal is needed right now.'
                      )
                    : tr(
                        'اختر وسيلة الدفع المناسبة لتجديد الاشتراك السنوي أو زيادة عدد الشركات.',
                        'Choose the payment method that fits your yearly renewal or company-count upgrade.'
                      )}
                </div>
              </div>

              {workspaceSubscription.lifetimeAccess ? (
                <div className="rounded-[24px] border border-emerald-200 bg-white px-4 py-5 text-center">
                  <div className="text-sm font-black text-emerald-700">{tr('مدى الحياة مفعل', 'Lifetime access active')}</div>
                  <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                    {workspaceSubscription.offerCode ? (
                      <>
                        <span className="dir-ltr inline-block text-left text-slate-900">{workspaceSubscription.offerCode}</span>
                        <br />
                      </>
                    ) : null}
                    {workspaceSubscription.offerNote || tr('يمكنك الاستمرار باستخدام البرنامج بدون تاريخ انتهاء.', 'You can continue using the app without an expiry date.')}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {displayQuotes.map(quote => (
                    <div
                      key={quote.provider}
                      className={`rounded-[24px] border p-4 bg-white ${
                        quote.providerReady ? 'border-emerald-100' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">{getCheckoutProviderLabel(quote.provider)}</div>
                          <div className="mt-1 text-[11px] font-bold text-slate-500">
                            {tr('الاشتراك السنوي', 'Yearly subscription')} | {tr('يشمل', 'Includes')} {quote.maxCompanies} {tr('شركة', 'company slot(s)')}
                          </div>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-[10px] font-black ${
                          quote.providerReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {quote.providerReady ? tr('متاح', 'Available') : tr('غير مهيأ', 'Not configured')}
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 text-white">
                        {quote.discountPercent > 0 ? (
                          <div className="text-[10px] font-black text-emerald-300">
                            {tr('يشمل الخصم المطبق', 'Discount already applied')}
                          </div>
                        ) : (
                          <div className="text-[10px] font-black text-slate-400">{tr('الإجمالي السنوي', 'Yearly total')}</div>
                        )}
                        <div className="mt-2 text-2xl font-black dir-ltr">{formatUsd(quote.totalPriceUsd)}</div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-600 leading-6">
                        {tr('الإجمالي قبل الخصم', 'Subtotal')}: {formatUsd(quote.subtotalPriceUsd)}
                        <br />
                        {tr('الأساسي', 'Base')}: {formatUsd(quote.basePriceUsd)}
                        {' | '}
                        {tr('الإضافي', 'Extra')}: {formatUsd(quote.extraCompanyPriceUsd)} x {quote.extraCompanyCount}
                        {quote.discountPercent > 0 ? (
                          <>
                            <br />
                            {tr('الخصم', 'Discount')}: {quote.discountPercent}% ({formatUsd(quote.discountAmountUsd)})
                          </>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => { void handleStartSubscriptionCheckout(quote.provider); }}
                        disabled={!quote.providerReady}
                        className={`mt-3 w-full rounded-2xl px-4 py-3 text-sm font-black transition ${
                          quote.providerReady
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {quote.providerReady ? tr('الانتقال إلى الدفع', 'Continue to payment') : tr('غير متاح الآن', 'Unavailable right now')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {subscriptionCloudError && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700">
              {subscriptionCloudError}
            </div>
          )}

          {billingStatusMessage && (
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-black text-sky-700">
              {billingStatusMessage}
            </div>
          )}

          {programOwnerEnabled && (
            <details className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:p-6" open={workspaceOfferCodes.length === 0}>
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-lg font-black text-slate-900">{tr('لوحة صاحب البرنامج', 'Program owner panel')}</div>
                  <div className="mt-1 text-[12px] font-bold leading-6 text-slate-500">
                    {tr(
                      'من هنا فقط يتم إنشاء أكواد الخصم أو الشهر المجاني أو مدى الحياة للحسابات الأخرى.',
                      'Only the main owner can issue discount, free-month, or lifetime codes from here.'
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">
                  {workspaceOfferCodesLoading ? tr('جارٍ تحميل الأكواد...', 'Loading codes...') : `${workspaceOfferCodes.length} ${tr('كود', 'code(s)')}`}
                </div>
              </summary>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-[24px] border border-slate-200 bg-white p-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{tr('نوع الكود', 'Code type')}</label>
                      <select
                        value={workspaceOfferKindDraft}
                        onChange={(e) => setWorkspaceOfferKindDraft(e.target.value as WorkspaceOfferCodeKind)}
                        className="w-full p-3 rounded-2xl border border-slate-200 bg-white outline-none font-black"
                      >
                        <option value="DISCOUNT_PERCENT">{tr('خصم بالنسبة المئوية', 'Percentage discount')}</option>
                        <option value="FREE_DAYS">{tr('اشتراك مجاني بعدد أيام', 'Free subscription days')}</option>
                        <option value="LIFETIME">{tr('اشتراك مدى الحياة', 'Lifetime subscription')}</option>
                      </select>
                    </div>

                    {workspaceOfferKindDraft === 'DISCOUNT_PERCENT' ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{tr('نسبة الخصم %', 'Discount %')}</label>
                        <input
                          value={workspaceOfferDiscountDraft}
                          onChange={(e) => setWorkspaceOfferDiscountDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                          className="w-full p-3 rounded-2xl border border-slate-200 bg-white outline-none font-black dir-ltr"
                          inputMode="numeric"
                          placeholder="25"
                        />
                      </div>
                    ) : workspaceOfferKindDraft === 'FREE_DAYS' ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{tr('عدد الأيام المجانية', 'Free days')}</label>
                        <input
                          value={workspaceOfferFreeDaysDraft}
                          onChange={(e) => setWorkspaceOfferFreeDaysDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                          className="w-full p-3 rounded-2xl border border-slate-200 bg-white outline-none font-black dir-ltr"
                          inputMode="numeric"
                          placeholder="30"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-black text-emerald-700 leading-6">
                        {tr('سيمنح هذا الكود اشتراكًا مدى الحياة مباشرة عند تطبيقه.', 'This code will grant lifetime access immediately when redeemed.')}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{tr('عدد الشركات', 'Company count')}</label>
                      <input
                        value={workspaceOfferCompanyCountDraft}
                        onChange={(e) => setWorkspaceOfferCompanyCountDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                        className="w-full p-3 rounded-2xl border border-slate-200 bg-white outline-none font-black dir-ltr"
                        inputMode="numeric"
                        placeholder={workspaceOfferKindDraft === 'LIFETIME' ? tr('فارغ = غير محدود', 'Blank = unlimited') : '5'}
                      />
                      <div className="mt-1 text-[10px] font-bold text-slate-400 leading-5">
                        {workspaceOfferKindDraft === 'LIFETIME'
                          ? tr('اختياري. إذا تركته فارغًا فسيكون مدى الحياة مع شركات غير محدودة.', 'Optional. Leave blank to grant lifetime access with unlimited companies.')
                          : tr('اختياري. إذا أدخلت رقمًا فسيمنح الكود هذا الحد من الشركات عند تطبيقه.', 'Optional. If you enter a value, the code will grant that company limit when redeemed.')}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{tr('تاريخ انتهاء الكود', 'Code expiry date')}</label>
                      <EnglishDateInput
                        value={workspaceOfferExpiresAtDraft}
                        onChange={setWorkspaceOfferExpiresAtDraft}
                        className="w-full p-3 rounded-2xl border border-slate-200 bg-white outline-none dir-ltr"
                        aria-label={tr('تاريخ انتهاء كود العرض', 'Offer code expiry date')}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{tr('ملاحظة داخلية', 'Internal note')}</label>
                      <input
                        value={workspaceOfferNotesDraft}
                        onChange={(e) => setWorkspaceOfferNotesDraft(e.target.value)}
                        className="w-full p-3 rounded-2xl border border-slate-200 bg-white outline-none font-bold"
                        placeholder={tr('مثال: عرض رمضان أو هدية عميل', 'Example: Ramadan offer or customer gift')}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => { void handleIssueWorkspaceOffer(); }}
                    disabled={workspaceOfferIssueBusy}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-black transition ${
                      workspaceOfferIssueBusy
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {workspaceOfferIssueBusy ? tr('جارٍ إنشاء الكود...', 'Creating code...') : tr('إنشاء كود جديد', 'Create new code')}
                  </button>

                  {issuedWorkspaceOfferMessage && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-black text-blue-700">
                      {issuedWorkspaceOfferMessage}
                    </div>
                  )}
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm font-black text-slate-900">{tr('آخر أكواد العروض', 'Latest offer codes')}</div>
                    <div className="text-[11px] font-bold text-slate-500">{workspaceOfferCodesLoading ? tr('تحديث...', 'Refreshing...') : tr('الأحدث أولاً', 'Newest first')}</div>
                  </div>

                  <div className="space-y-3 max-h-[26rem] overflow-auto">
                    {!workspaceOfferCodesLoading && workspaceOfferCodes.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-bold text-slate-400">
                        {tr('لا توجد أكواد عروض بعد.', 'No offer codes yet.')}
                      </div>
                    )}

                    {workspaceOfferCodes.slice(0, 8).map(code => (
                      <div key={code.code} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-900 dir-ltr text-left break-all">{code.code}</div>
                            <div className="mt-1 text-[11px] font-bold text-slate-500">
                              {getWorkspaceOfferKindLabel(code.kind, code.discountPercent, code.freeDays)}
                            </div>
                            <div className="mt-1 text-[11px] font-bold text-sky-700">
                              {getWorkspaceOfferCompanyEffectLabel(code.kind, code.companyCount)}
                            </div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-[10px] font-black ${getWorkspaceOfferStatusTone(code.status)}`}>
                            {getWorkspaceOfferStatusLabel(code.status)}
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 text-[11px] font-bold text-slate-600">
                          <div className="rounded-xl border border-white bg-white px-3 py-2">
                            {tr('تاريخ الإنشاء', 'Created at')}: {formatDeviceSeenAt(code.createdAt)}
                          </div>
                          <div className="rounded-xl border border-white bg-white px-3 py-2">
                            {tr('ينتهي في', 'Expires at')}: {code.expiresAt ? formatDeviceSeenAt(code.expiresAt) : tr('بدون تاريخ', 'No expiry')}
                          </div>
                        </div>

                        {code.notes && (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600">
                            {code.notes}
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => { void handleCopyText(code.code, tr(`تم نسخ الكود: ${code.code}`, `Copied code: ${code.code}`)); }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
                          >
                            {tr('نسخ الكود', 'Copy code')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>
      );
      const summaryCards = [
        {
          key: 'status',
          label: tr('حالة الاشتراك', 'Subscription status'),
          value: subscriptionMeta.badge
        },
        {
          key: 'plan',
          label: tr('الخطة الحالية', 'Current plan'),
          value: activePlanLabel
        },
        {
          key: 'companies',
          label: tr('الشركات الحالية', 'Current companies'),
          value: String(companies.length)
        },
        {
          key: 'remaining',
          label: tr('المتاح الآن', 'Available now'),
          value: workspaceRemainingCompanySlotsLabel
        }
      ];

      return (
        <div className="bg-white p-4 sm:p-5 rounded-[28px] shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(140deg,rgba(248,252,255,1)_0%,rgba(237,247,255,1)_46%,rgba(245,247,255,1)_100%)] p-5 sm:p-6">
            <div className="absolute -top-10 left-6 h-28 w-28 rounded-full bg-sky-200/30 blur-3xl" />
            <div className="absolute -bottom-12 right-0 h-40 w-40 rounded-full bg-indigo-200/20 blur-3xl" />

            <div className="relative flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm">
                <Wallet className="w-4 h-4 text-blue-600" />
                {tr('الاشتراك السنوي', 'Yearly subscription')}
              </div>
              <div className={`rounded-full px-3 py-1.5 text-[11px] font-black shadow-sm ${subscriptionMeta.tone}`}>
                {subscriptionMeta.badge}
              </div>
            </div>

            <div className="relative mt-5 max-w-3xl">
              <div className="text-2xl font-black text-slate-900">{currentCompany?.name || companySettings.name}</div>
              <div className="mt-2 text-sm font-bold leading-7 text-slate-600">
                {tr(
                  'هذه الشاشة مخصصة للاشتراك السنوي وإضافة الشركات فقط. يمكن تسجيل الدخول من أي جهاز بدون تقييد بعدد الأجهزة.',
                  'This screen is dedicated to yearly subscription and adding companies only. Sign-in is allowed from any device without device-count limits.'
                )}
              </div>
            </div>

            <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map(card => (
                <div key={card.key} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400">{card.label}</div>
                  <div className="mt-2 text-sm font-black text-slate-900 break-words dir-auto">{card.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.98)_0%,rgba(255,255,255,0.94)_42%,rgba(239,246,255,0.98)_100%)] p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-lg font-black text-slate-900">{tr('تجديد الاشتراك أو إضافة شركة', 'Renew subscription or add a company')}</div>
                  <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                    {tr(
                      'الاشتراك سنوي فقط: شركة واحدة مقابل 20 دولار سنويًا، وكل شركة إضافية مقابل 5 دولارات سنويًا.',
                      'Yearly billing only: one company costs $20 per year, and each extra company costs $5 per year.'
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900 px-3 py-2 text-[11px] font-black text-white shadow-sm">
                  {tr('سنوي فقط', 'Yearly only')}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">{tr('إجمالي الشركات المطلوبة', 'Total companies needed')}</label>
                  <input
                    value={billingCompanyCountDraft}
                    onChange={(e) => setBillingCompanyCountDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2) || '1')}
                    className="w-full p-3 rounded-2xl border border-sky-100 bg-white outline-none font-black dir-ltr shadow-sm"
                    inputMode="numeric"
                    placeholder="1"
                  />
                </div>

                <div className="rounded-[24px] border border-sky-100 bg-white/90 px-4 py-4 shadow-sm">
                  <div className="text-[10px] font-black text-sky-700">{tr('الإجمالي السنوي', 'Yearly total')}</div>
                  <div className="mt-2 text-3xl font-black text-slate-900 dir-ltr">
                    {formatUsd(preferredQuote?.totalPriceUsd || 0)}
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-slate-600 leading-6">
                    {tr('يشمل', 'Includes')} {desiredBillingCompanyCount} {tr('شركة', 'company slot(s)')}
                    <br />
                    {tr('نهاية الوصول الحالية', 'Current access ends')}: <span className="dir-ltr">{subscriptionMeta.endsAtText}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-sky-200 bg-white/85 px-4 py-3 text-[11px] font-bold text-sky-700 leading-6">
                {tr(
                  'تم إخفاء إدارة الأجهزة والتحكم اليدوي والخيارات الإضافية من هذه الشاشة، لتبقى مخصصة للاشتراك السنوي وإضافة الشركات فقط.',
                  'Device management, manual controls, and extra sections are hidden from this screen so it stays focused on yearly subscription and adding companies only.'
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 sm:p-6 space-y-4">
              <div>
                <div className="text-lg font-black text-slate-900">{tr('طرق الدفع', 'Payment methods')}</div>
                <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                  {tr(
                    'اختر وسيلة الدفع المناسبة لإتمام الاشتراك السنوي حسب عدد الشركات المطلوب.',
                    'Choose the payment method that fits your yearly subscription based on the requested company count.'
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                {displayQuotes.map(quote => (
                  <div
                    key={quote.provider}
                    className={`rounded-[24px] border p-4 shadow-sm ${
                      quote.providerReady ? 'border-emerald-100 bg-white' : 'border-slate-200 bg-white/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">{getCheckoutProviderLabel(quote.provider)}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-500">
                          {tr('الاشتراك السنوي', 'Yearly subscription')} | {tr('يشمل', 'Includes')} {quote.maxCompanies} {tr('شركة', 'company slot(s)')}
                        </div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[10px] font-black ${
                        quote.providerReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {quote.providerReady ? tr('متاح', 'Available') : tr('غير مهيأ', 'Not configured')}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 text-white">
                      <div className="text-[10px] font-black text-slate-400">{tr('الإجمالي السنوي', 'Yearly total')}</div>
                      <div className="mt-2 text-2xl font-black dir-ltr">{formatUsd(quote.totalPriceUsd)}</div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-600 leading-6">
                      {tr('الأساسي', 'Base')}: {formatUsd(quote.basePriceUsd)}
                      {' | '}
                      {tr('كل شركة إضافية', 'Each extra company')}: {formatUsd(quote.extraCompanyPriceUsd)}
                    </div>

                    <button
                      type="button"
                      onClick={() => { void handleStartSubscriptionCheckout(quote.provider); }}
                      disabled={!quote.providerReady}
                      className={`mt-3 w-full rounded-2xl px-4 py-3 text-sm font-black transition ${
                        quote.providerReady
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {quote.providerReady ? tr('المتابعة إلى الدفع', 'Continue to payment') : tr('غير متاح الآن', 'Unavailable right now')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {billingStatusMessage && (
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-black text-sky-700">
              {billingStatusMessage}
            </div>
          )}
        </div>
      );
    })() : (
    <div className="bg-white p-4 sm:p-5 rounded-[28px] shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      {(() => {
        const activePlanLabel = getSubscriptionPlanLabel(currentCompany?.subscriptionPlan || 'TRIAL');
        const preferredQuote = workspaceQuotes[0];
        const quickStats = [
          {
            key: 'plan',
            label: tr('الخطة الحالية', 'Current plan'),
            value: activePlanLabel
          },
          {
            key: 'ends',
            label: tr('نهاية الوصول', 'Access ends'),
            value: subscriptionMeta.endsAtText
          },
          {
            key: 'used',
            label: tr('الشركات المستخدمة', 'Used companies'),
            value: String(companies.length)
          },
          {
            key: 'remaining',
            label: tr('المتبقي الآن', 'Remaining now'),
            value: workspaceRemainingCompanySlotsLabel
          }
        ];
        const workspaceMetricCards = [
          {
            key: 'commercial-plan',
            label: tr('الخطة التجارية', 'Commercial plan'),
            value: getSubscriptionPlanLabel(workspaceSubscription.plan),
            help: getBillingCycleLabel(workspaceSubscription.billingCycle),
            icon: Layers,
            iconTone: 'bg-slate-900 text-white'
          },
          {
            key: 'used-companies',
            label: tr('الشركات المستخدمة', 'Used companies'),
            value: String(companies.length),
            help: tr('شركة مفعلة حاليًا', 'Currently active companies'),
            icon: Building2,
            iconTone: 'bg-blue-100 text-blue-700'
          },
          {
            key: 'allowed-companies',
            label: tr('الشركات المسموحة', 'Allowed companies'),
            value: workspaceMaxCompaniesLabel,
            help: tr('الحد الأقصى حسب الاشتراك', 'Maximum slots by subscription'),
            icon: ShieldCheck,
            iconTone: 'bg-emerald-100 text-emerald-700'
          },
          {
            key: 'remaining-slots',
            label: tr('المتبقي الآن', 'Remaining now'),
            value: workspaceRemainingCompanySlotsLabel,
            help: workspaceCompanyLimitReached
              ? tr('تم الوصول إلى الحد الحالي', 'The current limit is reached')
              : tr('مساحات متاحة الآن', 'Slots available right now'),
            icon: Wallet,
            iconTone: workspaceRemainingCompanySlots > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
          }
        ];
        const providerReadinessCards = [
          {
            key: 'APPLE',
            label: 'Apple',
            ready: workspaceProviderAvailability.appleReady,
            note: tr('شراء من داخل التطبيق', 'In-app purchase flow')
          },
          {
            key: 'GOOGLE',
            label: 'Google',
            ready: workspaceProviderAvailability.googleReady,
            note: tr('أندرويد ومتجر Play', 'Android and Play billing')
          }
        ];
        const readyProvidersCount = providerReadinessCards.filter(provider => provider.ready).length;

        return (
          <>
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(140deg,rgba(248,252,255,1)_0%,rgba(237,247,255,1)_46%,rgba(245,247,255,1)_100%)] p-5 sm:p-6">
              <div className="absolute -top-10 left-6 h-28 w-28 rounded-full bg-sky-200/30 blur-3xl" />
              <div className="absolute -bottom-12 right-0 h-40 w-40 rounded-full bg-indigo-200/20 blur-3xl" />

              <div className="relative flex items-center justify-between gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  {tr('إدارة الاشتراك', 'Subscription management')}
                </div>
                <div className={`rounded-full px-3 py-1.5 text-[11px] font-black shadow-sm ${subscriptionMeta.tone}`}>
                  {subscriptionMeta.badge}
                </div>
              </div>

              <div className="relative mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-black text-slate-900">{currentCompany?.name || companySettings.name}</div>
                    <div className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-600">
                      {subscriptionMeta.summary}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-2xl bg-slate-900 px-3 py-2 text-[11px] font-black text-white shadow-sm">
                      {activePlanLabel}
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm">
                      {tr('نهاية الوصول', 'Access ends')}: <span className="dir-ltr">{subscriptionMeta.endsAtText}</span>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm">
                      {tr('مزود الربط', 'Provider')}: {getWorkspaceProviderLabel()}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 backdrop-blur-sm shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center gap-2 text-[11px] font-black text-slate-500">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    {tr('ملخص سريع', 'Quick snapshot')}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {quickStats.map(stat => (
                      <div key={stat.key} className="rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-3">
                        <div className="text-[10px] font-black text-slate-400">{stat.label}</div>
                        <div className="mt-2 text-sm font-black text-slate-900 break-words dir-auto">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.98)_0%,rgba(255,255,255,0.94)_42%,rgba(239,246,255,0.98)_100%)] p-5 sm:p-6">
              <div className="absolute -right-10 top-10 h-28 w-28 rounded-full bg-sky-200/30 blur-3xl" />
              <div className="absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-blue-100/50 blur-3xl" />

              <div className="relative space-y-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-black text-sky-700 shadow-sm">
                      <Wallet className="w-4 h-4" />
                      {tr('الفوترة وعدد الشركات', 'Billing and company slots')}
                    </div>
                    <div className="mt-3 text-lg font-black text-slate-900">
                      {tr('احسب اشتراكك السنوي حسب عدد الشركات', 'Calculate your annual subscription by company count')}
                    </div>
                    <div className="mt-2 text-[12px] font-bold leading-6 text-slate-600">
                      {tr('شركة واحدة مشمولة في الخطة الأساسية باشتراك سنوي قدره 20 دولار، وكل شركة إضافية تُضاف مقابل 5 دولارات سنويًا.', 'One company is included in the base annual plan for $20, and each extra company adds $5 per year.')}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-900/90 bg-slate-950 px-4 py-3 text-white shadow-[0_18px_40px_rgba(15,23,42,0.20)]">
                    <div className="text-[10px] font-black tracking-[0.18em] text-slate-400 uppercase">
                      {tr('نمط الفوترة', 'Billing mode')}
                    </div>
                    <div className="mt-1 text-sm font-black">
                      {getBillingCycleLabel(workspaceSubscription.billingCycle)} | {getWorkspaceProviderLabel()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {workspaceMetricCards.map(card => (
                    <div key={card.key} className="rounded-[22px] border border-white/80 bg-white/88 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${card.iconTone}`}>
                          <card.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 text-right">
                          <div className="text-[10px] font-black text-slate-400">{card.label}</div>
                          <div className="mt-1 text-lg font-black text-slate-900 break-words dir-auto">{card.value}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-[11px] font-bold text-slate-500 leading-5">{card.help}</div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.16fr_0.84fr]">
                  <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-sm font-black text-slate-900">{tr('حسبة الاشتراك السنوي', 'Annual subscription calculator')}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-500">
                          {tr('حدد عدد الشركات التي تريد تضمينها داخل نفس الاشتراك التجاري.', 'Choose how many companies you want to include in the same commercial subscription.')}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-900 px-3 py-2 text-[11px] font-black text-white shadow-sm">
                        {tr('اشتراك سنوي', 'Yearly subscription')}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{tr('إجمالي الشركات المطلوبة', 'Total companies needed')}</label>
                        <input
                          value={billingCompanyCountDraft}
                          onChange={(e) => setBillingCompanyCountDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2) || '1')}
                          className="w-full p-3 rounded-2xl border border-sky-100 bg-white outline-none font-black dir-ltr shadow-sm"
                          inputMode="numeric"
                          placeholder="1"
                        />
                      </div>

                      <div className="rounded-[22px] border border-sky-100 bg-sky-50/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-[10px] font-black text-sky-700">{tr('الإجمالي السنوي', 'Annual total')}</div>
                            <div className="mt-2 text-3xl font-black text-slate-900 dir-ltr">
                              {formatUsd(preferredQuote?.totalPriceUsd || 0)}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-sky-200 bg-white/80 px-3 py-2 text-[11px] font-black text-sky-700">
                            {tr('يشمل', 'Includes')} {desiredBillingCompanyCount} {tr('شركة', 'company slot(s)')}
                          </div>
                        </div>

                        <div className="mt-3 text-[11px] font-bold text-slate-600 leading-6">
                          {tr('الأساسي', 'Base')}: <span className="dir-ltr">{formatUsd(20)}</span>
                          {' | '}
                          {tr('كل شركة إضافية', 'Each extra company')}: <span className="dir-ltr">{formatUsd(5)}</span>
                        </div>
                      </div>
                    </div>

                    {workspaceCompanyLimitReached ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-black text-amber-800 leading-6">
                        {tr('تم استخدام جميع الشركات المتاحة ضمن الخطة الحالية. زد العدد المطلوب أو فعّل عرض شراء جديد لإضافة شركات أخرى.', 'All available company slots are already used. Increase the requested company count or prepare a new purchase quote to add more companies.')}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-sky-200 bg-white/80 px-4 py-3 text-[11px] font-bold text-sky-700 leading-6">
                        {tr('يمكنك زيادة العدد المطلوب قبل تجهيز الشراء، وسيتم احتساب الإجمالي مباشرة حسب الشركات الإضافية فقط.', 'You can increase the requested count before preparing checkout, and the total will update instantly based on extra company slots only.')}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-slate-900 bg-slate-950 p-4 text-white shadow-[0_18px_40px_rgba(15,23,42,0.20)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-black">{tr('جاهزية الربط', 'Provider readiness')}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-400">
                          {tr('تحقق سريع من مزودي الدفع قبل بدء الشراء.', 'A quick readiness check before starting checkout.')}
                        </div>
                      </div>
                      <div className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black text-white">
                        {readyProvidersCount}/{providerReadinessCards.length}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      {providerReadinessCards.map(provider => (
                        <div key={provider.key} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${provider.ready ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                              <div className="text-sm font-black text-white">{provider.label}</div>
                            </div>
                            <div className={`rounded-full px-2.5 py-1 text-[10px] font-black ${provider.ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-300'}`}>
                              {provider.ready ? tr('جاهز', 'Ready') : tr('غير مهيأ', 'Not configured')}
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] font-bold text-slate-400">{provider.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {workspaceQuotes.map(quote => (
                    <div
                      key={quote.provider}
                      className={`rounded-[24px] border p-4 space-y-4 shadow-sm transition ${quote.providerReady
                        ? 'border-emerald-100 bg-white'
                        : 'border-slate-200 bg-white/75'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${quote.providerReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            <Wallet className="w-5 h-5" />
                          </div>
                          <div className="mt-3 text-sm font-black text-slate-900">{getCheckoutProviderLabel(quote.provider)}</div>
                          <div className="mt-1 text-[11px] font-bold text-slate-500">
                            {tr('يشمل', 'Includes')} {quote.maxCompanies} {tr('شركة', 'company slot(s)')}
                          </div>
                        </div>

                        <div className={`rounded-full px-3 py-1 text-[10px] font-black ${quote.providerReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {quote.providerReady ? tr('جاهز', 'Ready') : tr('قيد التجهيز', 'Setup pending')}
                        </div>
                      </div>

                      <div className="rounded-[22px] bg-slate-950 px-4 py-4 text-white">
                        <div className="text-[10px] font-black text-slate-400">{tr('الإجمالي السنوي', 'Annual total')}</div>
                        <div className="mt-2 text-2xl font-black dir-ltr">{formatUsd(quote.totalPriceUsd)}</div>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-600 leading-6">
                        {tr('الأساسي', 'Base')}: {formatUsd(quote.basePriceUsd)}
                        {' | '}
                        {tr('إضافي', 'Extra')}: {formatUsd(quote.extraCompanyPriceUsd)} x {quote.extraCompanyCount}
                        {quote.productId ? (
                          <>
                            <br />
                            ID: <span className="dir-ltr text-left inline-block">{quote.productId}</span>
                          </>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => { void handleStartSubscriptionCheckout(quote.provider); }}
                        className={`w-full rounded-2xl px-4 py-3 text-sm font-black transition ${quote.providerReady
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-500'
                          }`}
                      >
                        {tr('تجهيز الشراء', 'Prepare purchase')}
                      </button>
                    </div>
                  ))}
                </div>

                {billingStatusMessage && (
                  <div className="rounded-2xl border border-sky-100 bg-white/90 px-4 py-3 text-xs font-black text-sky-700 shadow-sm">
                    {billingStatusMessage}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {false && (
        <>
      <div className={`rounded-2xl border px-4 py-4 ${subscriptionMeta.tone}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-black opacity-80">{tr('إدارة الاشتراك', 'Subscription management')}</div>
            <div className="text-lg font-black mt-1">{currentCompany?.name || companySettings.name}</div>
          </div>
          <div className="px-3 py-1 rounded-full bg-white/70 text-[11px] font-black">
            {subscriptionMeta.badge}
          </div>
        </div>
        <div className="mt-3 text-sm font-bold leading-6">{subscriptionMeta.summary}</div>
        <div className="mt-2 text-[11px] font-bold opacity-80">
          {tr('الخطة الحالية', 'Current plan')}: {getSubscriptionPlanLabel(currentCompany?.subscriptionPlan || 'TRIAL')}
          {' | '}
          {tr('الانتهاء', 'Ends at')}: {subscriptionMeta.endsAtText}
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,rgba(239,246,255,1),rgba(245,243,255,1))] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-black text-slate-900">{tr('الفوترة وحد الشركات', 'Billing and company slots')}</div>
            <div className="text-[11px] font-bold text-slate-500 mt-1">
              {tr('شركة واحدة مشمولة في الخطة الأساسية باشتراك سنوي قدره 20 دولار، وكل شركة إضافية تُضاف مقابل 5 دولارات سنويًا.', 'One company is included in the base annual plan for $20, and each extra company adds $5 per year.')}
            </div>
          </div>
          <div className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black text-indigo-700">
            {getBillingCycleLabel(workspaceSubscription.billingCycle)} | {getWorkspaceProviderLabel()}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-black">
          <div className="rounded-xl border border-white/70 bg-white/85 px-3 py-3 text-slate-700">
            {tr('الخطة التجارية', 'Commercial plan')}: {getSubscriptionPlanLabel(workspaceSubscription.plan)}
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 px-3 py-3 text-slate-700">
            {tr('الشركات المستخدمة', 'Used companies')}: {companies.length}
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 px-3 py-3 text-slate-700">
            {tr('الشركات المسموحة', 'Allowed companies')}: {workspaceMaxCompaniesLabel}
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 px-3 py-3 text-slate-700">
            {tr('المتبقي الآن', 'Remaining now')}: {workspaceRemainingCompanySlotsLabel}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
          <div className="rounded-2xl border border-white/70 bg-white/85 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl px-4 py-2 text-xs font-black bg-slate-900 text-white cursor-default">
                {tr('اشتراك سنوي', 'Yearly Subscription')}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">{tr('إجمالي الشركات المطلوبة', 'Total companies needed')}</label>
              <input
                value={billingCompanyCountDraft}
                onChange={(e) => setBillingCompanyCountDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2) || '1')}
                className="w-full p-3 rounded-xl border border-indigo-100 bg-white outline-none font-black dir-ltr"
                inputMode="numeric"
                placeholder="1"
              />
            </div>
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/70 px-3 py-3 text-[11px] font-bold text-indigo-700 leading-6">
              {tr('الأساسي', 'Base')}: {formatUsd(20)}
              {' | '}
              {tr('كل شركة إضافية', 'Each extra company')}: {formatUsd(5)}
              <br />
              {tr('الإجمالي لهذه التهيئة', 'Total for this setup')}: {formatUsd(workspaceQuotes[0]?.totalPriceUsd || 0)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/85 p-4 min-w-[220px]">
            <div className="text-xs font-black text-slate-500">{tr('جاهزية الربط', 'Provider readiness')}</div>
            <div className="mt-3 space-y-2 text-xs font-black text-slate-700">
              <div>Apple: {workspaceProviderAvailability.appleReady ? tr('جاهز', 'Ready') : tr('غير مهيأ', 'Not configured')}</div>
              <div>Google: {workspaceProviderAvailability.googleReady ? tr('جاهز', 'Ready') : tr('غير مهيأ', 'Not configured')}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          {workspaceQuotes.map(quote => (
            <div key={quote.provider} className="rounded-2xl border border-white/80 bg-white/90 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-800">{getCheckoutProviderLabel(quote.provider)}</div>
                <div className={`rounded-full px-3 py-1 text-[10px] font-black ${quote.providerReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {quote.providerReady ? tr('جاهز', 'Ready') : tr('قيد التجهيز', 'Setup pending')}
                </div>
              </div>
              <div className="text-[12px] font-bold leading-6 text-slate-600">
                {tr('يشمل', 'Includes')} {quote.maxCompanies} {tr('شركة', 'company slot(s)')}
                <br />
                {tr('الإجمالي', 'Total')}: {formatUsd(quote.totalPriceUsd)}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-600 leading-6">
                {tr('الأساسي', 'Base')}: {formatUsd(quote.basePriceUsd)}
                {' | '}
                {tr('إضافي', 'Extra')}: {formatUsd(quote.extraCompanyPriceUsd)} x {quote.extraCompanyCount}
                {quote.productId ? (
                  <>
                    <br />
                    ID: <span className="dir-ltr text-left inline-block">{quote.productId}</span>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => { void handleStartSubscriptionCheckout(quote.provider); }}
                className={`w-full rounded-xl px-4 py-3 text-sm font-black transition ${quote.providerReady
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-500'
                  }`}
              >
                {tr('أ¯طںآ½أ¯طںآ½أ¯طںآ½أ¯طںآ½أ¯طںآ½ أ¯طںآ½أ¯طںآ½أ¯طںآ½أ¯طںآ½أ¯طںآ½أ¯طںآ½', 'Prepare purchase')}
              </button>
            </div>
          ))}
        </div>

        {billingStatusMessage && (
          <div className="rounded-xl border border-indigo-100 bg-white/90 px-3 py-3 text-xs font-black text-indigo-700">
            {billingStatusMessage}
          </div>
        )}
      </div>
        </>
      )}

      <details className="rounded-2xl border border-gray-200 bg-white" open={Boolean(subscriptionCloudError)}>
        <summary className="cursor-pointer px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black text-slate-900">{tr('الأجهزة والمزامنة السحابية', 'Devices and cloud sync')}</div>
              <div className="text-[11px] font-bold text-slate-500 mt-1">
                {tr('إدارة الجهاز الحالي والأجهزة المرتبطة بالشركة من مكان واحد.', 'Manage the current device and bound company devices from one place.')}
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
              {(cloudSubscription?.boundDevices || []).length} {tr('جهاز', 'device(s)')}
            </div>
          </div>
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black text-slate-800">{tr('المزامنة السحابية', 'Cloud sync')}</div>
              <div className="text-[11px] font-bold text-gray-500 mt-1">
                {tr('تتم مزامنة حالة الشركة والكود والجهاز مع Firestore عند توفر حساب Firebase.', 'Company status, activation code, and device binding are synced with Firestore when a Firebase account is available.')}
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-[11px] font-black ${subscriptionCloudBusy ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {subscriptionCloudBusy ? tr('جاري المزامنة', 'Syncing') : tr('متصل', 'Connected')}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-[12px] font-bold text-gray-700 leading-6">
            <div>
              {isCodeEmail(currentUser?.email) 
                ? `${tr('كود الحساب الحالي', 'Current account code')}: ${extractCodeFromEmail(currentUser?.email)}`
                : `${tr('المستخدم الحالي', 'Current user')}: ${currentUser?.email || '-'}`}
            </div>
            <div className="dir-ltr text-left">{tr('معرف الجهاز', 'Device ID')}: {deviceBindingId}</div>
            <div>{tr('عدد الأجهزة المسموح', 'Allowed devices')}: {cloudSubscription?.maxDevices || 1}</div>
          </div>

          {subscriptionCloudError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
              {subscriptionCloudError}
            </div>
          )}

          <button
            type="button"
            onClick={handleLinkCurrentDevice}
            className="w-full bg-white border border-gray-200 text-slate-700 font-black py-3 rounded-xl"
          >
            {tr('ربط هذا الجهاز الآن', 'Link this device now')}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4 space-y-3">
          <div>
            <div className="text-sm font-black text-slate-800">{tr('الأجهزة المرتبطة بالشركة', 'Bound company devices')}</div>
            <div className="text-[11px] font-bold text-gray-500 mt-1">
              {tr('كل تفعيل يربط الشركة بالجهاز. عند امتلاء الحد المسموح يتم منع الأجهزة الجديدة حتى إزالة جهاز أو استخدام كود جديد بحد أعلى.', 'Each activation binds the company to devices. Once the device limit is full, new devices are blocked until one is removed or a new code with a higher limit is used.')}
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-auto">
            {(cloudSubscription?.boundDevices || []).length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-xs font-bold text-gray-400 text-center">
                {tr('لا توجد أجهزة مرتبطة بعد.', 'No bound devices yet.')}
              </div>
            )}

            {(cloudSubscription?.boundDevices || []).map(device => (
              <div key={device.deviceId} className="rounded-xl border border-gray-200 bg-white px-3 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-800 truncate">{device.label}</div>
                  <div className="text-[11px] font-bold text-gray-500 dir-ltr text-left mt-1">{device.deviceId}</div>
                  <div className="text-[11px] font-bold text-gray-400 mt-1">
                    {tr('آخر ظهور', 'Last seen')}: {formatDeviceSeenAt(device.lastSeenAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlinkDevice(device.deviceId)}
                  className={`px-3 py-2 rounded-lg text-xs font-black ${device.deviceId === deviceBindingId ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {device.deviceId === deviceBindingId ? tr('فك هذا الجهاز', 'Unlink this device') : tr('فك الربط', 'Unlink')}
                </button>
              </div>
            ))}
          </div>
        </div>
        </div>
      </details>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          <div>
            <div className="text-sm font-black text-slate-800">{tr('تفعيل أو تمديد بالكود', 'Activate or renew with code')}</div>
            <div className="text-[11px] font-bold text-gray-500 mt-1">
              {tr('أدخل كود التفعيل لتمديد الاشتراك مباشرة على الشركة الحالية.', 'Enter an activation code to extend the current company instantly.')}
            </div>
          </div>

          <input
            value={activationCodeDraft}
            onChange={(e) => setActivationCodeDraft(normalizeActivationCodeInput(e.target.value))}
            onPaste={handleActivationCodePaste}
            className="w-full p-3 bg-white rounded-xl border border-blue-200 outline-none text-sm font-black dir-ltr"
            placeholder="AIFLEX-BASIC-30"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePasteActivationCodeFromClipboard()}
              className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700"
            >
              {tr('لصق من الحافظة', 'Paste from clipboard')}
            </button>
            <button
              type="button"
              onClick={() => {
                setActivationCodeDraft('');
                setSubscriptionStatusMessage('');
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
            >
              {tr('مسح الحقل', 'Clear field')}
            </button>
          </div>

          <div className="rounded-xl border border-dashed border-blue-200 bg-white/80 px-3 py-3 text-[11px] font-bold text-blue-700 leading-6 dir-ltr">
            AIFLEX-BASIC-30
            <br />
            AIFLEX-BASIC-90
          </div>

          <button
            type="button"
            onClick={handleActivateSubscription}
            disabled={subscriptionCloudBusy}
            className={`w-full font-black py-3 rounded-xl transition ${
              subscriptionCloudBusy
                ? 'bg-blue-300 text-white cursor-wait'
                : 'bg-blue-600 text-white'
            }`}
          >
            {tr('تفعيل / تمديد الاشتراك', 'Activate / renew subscription')}
          </button>
        </div>

        <details className="rounded-2xl border border-gray-200 bg-slate-50" open={Boolean(subscriptionStatusMessage)}>
          <summary className="cursor-pointer px-4 py-4">
            <div className="text-sm font-black text-slate-800">{tr('التحكم اليدوي المتقدم', 'Advanced manual control')}</div>
            <div className="text-[11px] font-bold text-gray-500 mt-1">
              {tr('افتح هذا القسم فقط عند الحاجة لتعديل الحالة أو الخطة أو تاريخ الانتهاء يدويًا.', 'Open this section only when you need to change the status, plan, or end date manually.')}
            </div>
          </summary>
          <div className="px-4 pb-4 space-y-3">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('الحالة', 'Status')}</label>
              <select
                value={subscriptionStatusDraft}
                onChange={(e) => setSubscriptionStatusDraft(e.target.value as CompanySubscriptionStatus)}
                className="w-full p-3 bg-white rounded-xl border border-gray-200 outline-none font-bold"
              >
                {SUBSCRIPTION_STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>{getSubscriptionStatusLabel(status)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('الخطة', 'Plan')}</label>
              <select
                value={subscriptionPlanDraft}
                onChange={(e) => setSubscriptionPlanDraft(e.target.value as CompanySubscriptionPlan)}
                className="w-full p-3 bg-white rounded-xl border border-gray-200 outline-none font-bold"
                disabled={subscriptionStatusDraft === 'TRIAL'}
              >
                {SUBSCRIPTION_PLAN_OPTIONS.map(plan => (
                  <option key={plan} value={plan}>{getSubscriptionPlanLabel(plan)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                {subscriptionStatusDraft === 'TRIAL' ? tr('نهاية التجربة', 'Trial ends') : tr('نهاية الوصول', 'Access end date')}
              </label>
              <EnglishDateInput
                value={subscriptionEndsAtDraft}
                onChange={setSubscriptionEndsAtDraft}
                displayFormat="YMD"
                className="w-full p-3 bg-white rounded-xl border border-gray-200 outline-none font-bold dir-ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('مهلة السماح بالأيام', 'Grace days')}</label>
              <input
                value={subscriptionGraceDaysDraft}
                onChange={(e) => setSubscriptionGraceDaysDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                className="w-full p-3 bg-white rounded-xl border border-gray-200 outline-none font-bold dir-ltr"
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveSubscription}
            className="w-full bg-slate-900 text-white font-black py-3 rounded-xl"
          >
            {tr('حفظ إعدادات الاشتراك', 'Save subscription settings')}
          </button>
          </div>
        </details>
      </div>

      {subscriptionAdminEnabled && (
        <details className="rounded-2xl border border-violet-200 bg-violet-50">
          <summary className="cursor-pointer px-4 py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-black text-slate-800">{tr('لوحة الأكواد وأدوات المشرف', 'Codes and admin tools')}</div>
                <div className="text-[11px] font-bold text-gray-500 mt-1">
                  {tr('إصدار أكواد جديدة ومراجعة الأكواد المصدرة عند الحاجة فقط.', 'Issue new codes and review issued codes only when needed.')}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="px-3 py-1 rounded-full bg-white/80 text-[11px] font-black text-violet-700">
                  {subscriptionCodesLoading ? tr('جار التحديث...', 'Refreshing...') : `${subscriptionCodes.length} ${tr('كود', 'code(s)')}`}
                </div>
                <div className="px-3 py-1 rounded-full bg-white/80 text-[11px] font-black text-violet-700">
                  {tr('مشرف سحابي', 'Cloud admin')}
                </div>
              </div>
            </div>
          </summary>
          <div className="px-4 pb-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] font-bold text-gray-500">
                {tr('هذه اللوحة مخصصة لإصدار أكواد جديدة وربطها بخطة وعدد أجهزة وشركة محددة عند الحاجة.', 'This panel is for issuing new codes with a plan, device count, and optional reserved company.')}
              </div>
              <button
                type="button"
                onClick={() => setMode('SUBSCRIPTION_REPORTS')}
                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black"
              >
                {tr('تقارير الاشتراكات', 'Subscription reports')}
              </button>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('الخطة', 'Plan')}</label>
              <select
                value={issuePlanDraft}
                onChange={(e) => setIssuePlanDraft(e.target.value as CompanySubscriptionPlan)}
                className="w-full p-3 bg-white rounded-xl border border-violet-200 outline-none font-bold"
              >
                <option value="BASIC">{getSubscriptionPlanLabel('BASIC')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('المدة بالأيام', 'Duration in days')}</label>
              <input
                value={issueDurationDaysDraft}
                onChange={(e) => setIssueDurationDaysDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                className="w-full p-3 bg-white rounded-xl border border-violet-200 outline-none font-bold dir-ltr"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('عدد الأجهزة', 'Device limit')}</label>
              <input
                value={issueMaxDevicesDraft}
                onChange={(e) => setIssueMaxDevicesDraft(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                className="w-full p-3 bg-white rounded-xl border border-violet-200 outline-none font-bold dir-ltr"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('تاريخ انتهاء الكود', 'Code expiry date')}</label>
              <EnglishDateInput
                value={issueExpiresAtDraft}
                onChange={setIssueExpiresAtDraft}
                displayFormat="YMD"
                className="w-full p-3 bg-white rounded-xl border border-violet-200 outline-none font-bold dir-ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('تقييد لشركة محددة', 'Reserve for company')}</label>
              <select
                value={issueReservedCompanyDraft}
                onChange={(e) => setIssueReservedCompanyDraft(e.target.value)}
                className="w-full p-3 bg-white rounded-xl border border-violet-200 outline-none font-bold"
              >
                <option value="">{tr('غير مقيّد', 'Not reserved')}</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 xl:col-span-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">{tr('ملاحظات', 'Notes')}</label>
              <input
                value={issueNotesDraft}
                onChange={(e) => setIssueNotesDraft(e.target.value)}
                className="w-full p-3 bg-white rounded-xl border border-violet-200 outline-none font-bold"
                placeholder={tr('مثال: عميل معرض الافتتاح', 'Example: launch event client')}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleIssueSubscriptionCode}
            className="w-full bg-violet-700 text-white font-black py-3 rounded-xl"
          >
            {tr('إصدار كود جديد', 'Issue new code')}
          </button>

          {issuedCodeMessage && (
            <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-black text-violet-700 dir-ltr text-left">
              {issuedCodeMessage}
            </div>
          )}

          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-black text-slate-800">{tr('الأكواد المصدرة', 'Issued activation codes')}</div>
              <div className="text-[11px] font-bold text-gray-500">
                {subscriptionCodesLoading ? tr('جار التحميل...', 'Loading...') : `${subscriptionCodes.length} ${tr('كود', 'code(s)')}`}
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-auto">
              {!subscriptionCodesLoading && subscriptionCodes.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-xs font-bold text-gray-400 text-center">
                  {tr('لا توجد أكواد مصدرة حتى الآن.', 'No activation codes have been issued yet.')}
                </div>
              )}

              {subscriptionCodes.map(code => (
                <div key={code.code} className="rounded-xl border border-gray-200 bg-white px-3 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="dir-ltr text-left text-sm font-black text-slate-800">{code.code}</div>
                    <div className={`px-3 py-1 rounded-full text-[11px] font-black ${code.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-700'
                      : code.status === 'USED'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-rose-100 text-rose-700'
                      }`}>
                      {code.status}
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-gray-500 leading-6">
                    {getSubscriptionPlanLabel(code.plan)} | {code.durationDays} {tr('يوم', 'day(s)')} | {tr('أجهزة', 'Devices')}: {code.maxDevices}
                    <br />
                    {tr('أنشئ في', 'Created at')}: {formatDeviceSeenAt(code.createdAt)}
                    {code.expiresAt ? ` | ${tr('ينتهي في', 'Expires at')}: ${formatDeviceSeenAt(code.expiresAt)}` : ''}
                    {code.usedByCompanyName ? ` | ${tr('استخدم بواسطة', 'Used by')}: ${code.usedByCompanyName}` : ''}
                  </div>
                  {code.status === 'AVAILABLE' && (
                    <button
                      type="button"
                      onClick={() => handleCancelIssuedCode(code.code)}
                      className="px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-black"
                    >
                      {tr('إلغاء الكود', 'Cancel code')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          </div>
        </details>
      )}

      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-[12px] font-bold text-gray-600 leading-6">
        <div>{tr('عند انتهاء أو إيقاف الاشتراك: يسمح بعرض البيانات والنسخ الاحتياطي وإدارة الاشتراك فقط.', 'When the subscription is expired or suspended: only data viewing, backup, and subscription management remain available.')}</div>
        <div>{tr('يتم منع الإضافة والتعديل والحذف والترحيل والطباعة الرسمية تلقائيًا من داخل النظام.', 'Add, edit, delete, posting, and official printing are blocked automatically across the app.')}</div>
      </div>

      {subscriptionStatusMessage && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">
          {subscriptionStatusMessage}
        </div>
      )}
    </div>
  )
  );

  const renderSubscriptionReports = () => {
    const searchNeedle = subscriptionReportSearch.trim().toLowerCase();

    const resolveEffectiveCompanyStatus = (subscription: CloudCompanySubscription): CompanySubscriptionStatus => {
      if (subscription.status === 'SUSPENDED') return 'SUSPENDED';
      if (subscription.status === 'EXPIRED') return 'EXPIRED';

      const endsAtMs = Date.parse(String(subscription.endsAt || ''));
      if (!Number.isFinite(endsAtMs)) {
        return subscription.status === 'TRIAL' ? 'TRIAL' : 'ACTIVE';
      }

      if (subscription.status === 'TRIAL') {
        return endsAtMs >= Date.now() ? 'TRIAL' : 'EXPIRED';
      }

      const graceMs = Math.max(0, Number(subscription.graceDays) || 0) * 24 * 60 * 60 * 1000;
      return endsAtMs + graceMs >= Date.now() ? 'ACTIVE' : 'EXPIRED';
    };

    const resolveEffectiveCodeStatus = (code: CloudSubscriptionCode): CloudSubscriptionCodeStatus => {
      if (code.status !== 'AVAILABLE') return code.status;
      const expiresAtMs = Date.parse(String(code.expiresAt || ''));
      return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now() ? 'EXPIRED' : 'AVAILABLE';
    };

    const getCodeStatusLabel = (status: CloudSubscriptionCodeStatus) => {
      switch (status) {
        case 'USED': return tr('مستخدم', 'Used');
        case 'CANCELLED': return tr('ملغي', 'Cancelled');
        case 'EXPIRED': return tr('منتهي', 'Expired');
        default: return tr('متاح', 'Available');
      }
    };

    const getStatusTone = (status: CompanySubscriptionStatus) => {
      switch (status) {
        case 'ACTIVE': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'SUSPENDED': return 'bg-rose-100 text-rose-700 border-rose-200';
        case 'EXPIRED': return 'bg-amber-100 text-amber-700 border-amber-200';
        default: return 'bg-sky-100 text-sky-700 border-sky-200';
      }
    };

    const getCodeTone = (status: CloudSubscriptionCodeStatus) => {
      switch (status) {
        case 'USED': return 'bg-slate-100 text-slate-700 border-slate-200';
        case 'CANCELLED': return 'bg-rose-100 text-rose-700 border-rose-200';
        case 'EXPIRED': return 'bg-amber-100 text-amber-700 border-amber-200';
        default: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      }
    };

    const companyRows = subscriptionCompanies.map(subscription => {
      const fallbackCompany = companies.find(company => company.id === subscription.companyId) || null;
      const effectiveStatus = resolveEffectiveCompanyStatus(subscription);
      return {
        ...subscription,
        effectiveStatus,
        displayName: subscription.companyName || fallbackCompany?.name || subscription.companyId,
        usedSlots: subscription.boundDevices.length,
        freeSlots: Math.max(0, subscription.maxDevices - subscription.boundDevices.length)
      };
    });

    const filteredCompanies = companyRows.filter(company => {
      if (subscriptionReportCompanyStatusFilter !== 'ALL' && company.effectiveStatus !== subscriptionReportCompanyStatusFilter) {
        return false;
      }
      if (!searchNeedle) return true;
      return [
        company.displayName,
        company.companyId,
        company.activationCode,
        company.plan,
        company.source,
        company.updatedByEmail
      ].some(value => String(value || '').toLowerCase().includes(searchNeedle));
    });

    const deviceRows = companyRows
      .flatMap(company => company.boundDevices.map(device => ({
        ...device,
        companyId: company.companyId,
        companyName: company.displayName,
        plan: company.plan,
        companyStatus: company.effectiveStatus,
        maxDevices: company.maxDevices
      })))
      .sort((a, b) => Date.parse(String(b.lastSeenAt || '')) - Date.parse(String(a.lastSeenAt || '')));

    const filteredDevices = deviceRows.filter(device => {
      if (!searchNeedle) return true;
      return [
        device.companyName,
        device.companyId,
        device.deviceId,
        device.label,
        device.platform,
        device.lastUserEmail
      ].some(value => String(value || '').toLowerCase().includes(searchNeedle));
    });

    const codeRows = subscriptionCodes
      .map(code => ({
        ...code,
        effectiveStatus: resolveEffectiveCodeStatus(code)
      }))
      .filter(code => {
        if (subscriptionReportCodeStatusFilter !== 'ALL' && code.effectiveStatus !== subscriptionReportCodeStatusFilter) {
          return false;
        }
        if (!searchNeedle) return true;
        return [
          code.code,
          code.plan,
          code.usedByCompanyName,
          code.reservedCompanyName,
          code.createdByEmail,
          code.usedByEmail,
          code.notes
        ].some(value => String(value || '').toLowerCase().includes(searchNeedle));
      });

    const summary = {
      totalCompanies: companyRows.length,
      activeCompanies: companyRows.filter(company => company.effectiveStatus === 'ACTIVE').length,
      expiredCompanies: companyRows.filter(company => company.effectiveStatus === 'EXPIRED').length,
      suspendedCompanies: companyRows.filter(company => company.effectiveStatus === 'SUSPENDED').length,
      totalDevices: deviceRows.length,
      usedCodes: subscriptionCodes.filter(code => resolveEffectiveCodeStatus(code) === 'USED').length,
      expiredCodes: subscriptionCodes.filter(code => resolveEffectiveCodeStatus(code) === 'EXPIRED').length,
      availableCodes: subscriptionCodes.filter(code => resolveEffectiveCodeStatus(code) === 'AVAILABLE').length
    };

    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5 animate-in fade-in">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] font-black text-slate-500">{tr('شاشة مستقلة للمشرف السحابي', 'Standalone cloud admin screen')}</div>
              <div className="text-xl font-black text-slate-900 mt-1">{tr('تقارير الاشتراكات', 'Subscription reports')}</div>
              <div className="text-[11px] font-bold text-slate-500 mt-2">
                {tr('متابعة مركزية للشركات المفعلة والأجهزة المربوطة والأكواد المستخدمة والمنتهية من Firestore مباشرة.', 'A central view of subscribed companies, bound devices, and used or expired activation codes directly from Firestore.')}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-black text-slate-700">
                {subscriptionCompaniesLoading || subscriptionCodesLoading ? tr('جاري التحديث...', 'Refreshing...') : tr('محدث الآن', 'Up to date')}
              </div>
              <button
                type="button"
                onClick={() => setMode('SUBSCRIPTION')}
                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black"
              >
                {tr('العودة إلى إدارة الاشتراك', 'Back to subscription')}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
            <div className="text-[10px] font-black text-emerald-700">{tr('شركات مفعلة', 'Active companies')}</div>
            <div className="mt-2 text-2xl font-black text-emerald-800 dir-ltr">{summary.activeCompanies}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
            <div className="text-[10px] font-black text-amber-700">{tr('شركات منتهية', 'Expired companies')}</div>
            <div className="mt-2 text-2xl font-black text-amber-800 dir-ltr">{summary.expiredCompanies}</div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
            <div className="text-[10px] font-black text-blue-700">{tr('الأجهزة المرتبطة', 'Bound devices')}</div>
            <div className="mt-2 text-2xl font-black text-blue-800 dir-ltr">{summary.totalDevices}</div>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
            <div className="text-[10px] font-black text-violet-700">{tr('الأكواد المستخدمة / المنتهية', 'Used / expired codes')}</div>
            <div className="mt-2 text-2xl font-black text-violet-800 dir-ltr">{summary.usedCodes} / {summary.expiredCodes}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr_1fr] gap-3">
            <input
              value={subscriptionReportSearch}
              onChange={(e) => setSubscriptionReportSearch(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 bg-white outline-none font-bold"
              placeholder={tr('ابحث باسم الشركة أو الكود أو الجهاز...', 'Search by company, code, or device...')}
            />
            <select
              value={subscriptionReportCompanyStatusFilter}
              onChange={(e) => setSubscriptionReportCompanyStatusFilter(e.target.value as 'ALL' | CompanySubscriptionStatus)}
              className="w-full p-3 rounded-xl border border-gray-200 bg-white outline-none font-bold"
            >
              <option value="ALL">{tr('كل حالات الشركات', 'All company statuses')}</option>
              {SUBSCRIPTION_STATUS_OPTIONS.map(status => (
                <option key={status} value={status}>{getSubscriptionStatusLabel(status)}</option>
              ))}
            </select>
            <select
              value={subscriptionReportCodeStatusFilter}
              onChange={(e) => setSubscriptionReportCodeStatusFilter(e.target.value as 'ALL' | CloudSubscriptionCodeStatus)}
              className="w-full p-3 rounded-xl border border-gray-200 bg-white outline-none font-bold"
            >
              <option value="ALL">{tr('كل حالات الأكواد', 'All code statuses')}</option>
              {(['AVAILABLE', 'USED', 'EXPIRED', 'CANCELLED'] as CloudSubscriptionCodeStatus[]).map(status => (
                <option key={status} value={status}>{getCodeStatusLabel(status)}</option>
              ))}
            </select>
          </div>
          {subscriptionCloudError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
              {subscriptionCloudError}
            </div>
          )}
        </div>

        <details className="rounded-2xl border border-gray-200 bg-slate-50 p-4" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black text-slate-800">{tr('الشركات', 'Companies')}</div>
              <div className="mt-1 text-[11px] font-bold text-slate-500">{tr('الشركات المفعلة والمنتهية وحالة كل شركة باختصار.', 'Subscribed companies with a quick status summary.')}</div>
            </div>
            <div className="text-[11px] font-bold text-slate-500">{filteredCompanies.length} / {summary.totalCompanies}</div>
          </summary>
          <div className="mt-3 space-y-3 max-h-[28rem] overflow-auto">
            {!subscriptionCompaniesLoading && filteredCompanies.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs font-bold text-gray-400">
                {tr('لا توجد شركات مطابقة ضمن الفلاتر الحالية.', 'No companies match the current filters.')}
              </div>
            )}
            {filteredCompanies.map(company => (
              <div key={company.companyId} className="rounded-2xl border border-gray-200 bg-white px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-base font-black text-slate-900">{company.displayName}</div>
                    <div className="dir-ltr text-left text-[11px] font-bold text-slate-400 mt-1">{company.companyId}</div>
                  </div>
                  <div className={`px-3 py-1 rounded-full border text-[11px] font-black ${getStatusTone(company.effectiveStatus)}`}>
                    {getSubscriptionStatusLabel(company.effectiveStatus)}
                  </div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-[11px] font-bold text-slate-600">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('الخطة', 'Plan')}: {getSubscriptionPlanLabel(company.plan)}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('الأجهزة', 'Devices')}: {company.usedSlots}/{company.maxDevices}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('الانتهاء', 'Ends at')}: {formatDeviceSeenAt(company.endsAt)}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('آخر تحديث', 'Updated')}: {formatDeviceSeenAt(company.updatedAt)}</div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 text-[11px] font-bold text-slate-500">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
                    {tr('كود آخر تفعيل', 'Last activation code')}: <span className="dir-ltr text-left text-slate-700">{company.activationCode || '-'}</span>
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
                    {tr('مصدر الاشتراك', 'Subscription source')}: <span className="dir-ltr text-left text-slate-700">{company.source}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black text-slate-800">{tr('الأجهزة المرتبطة', 'Bound devices')}</div>
              <div className="mt-1 text-[11px] font-bold text-slate-500">{tr('تفاصيل الأجهزة المرتبطة بالشركات السحابية وآخر ظهور لها.', 'Linked devices with their latest activity and company ownership.')}</div>
            </div>
            <div className="text-[11px] font-bold text-slate-500">{filteredDevices.length} / {summary.totalDevices}</div>
          </summary>
          <div className="mt-3 space-y-3 max-h-[24rem] overflow-auto">
            {!subscriptionCompaniesLoading && filteredDevices.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs font-bold text-gray-400">
                {tr('لا توجد أجهزة مطابقة ضمن الفلاتر الحالية.', 'No devices match the current filters.')}
              </div>
            )}
            {filteredDevices.map(device => (
              <div key={`${device.companyId}-${device.deviceId}`} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900">{device.label}</div>
                    <div className="text-[11px] font-bold text-slate-500 mt-1">{device.companyName}</div>
                  </div>
                  <div className={`px-3 py-1 rounded-full border text-[11px] font-black ${getStatusTone(device.companyStatus)}`}>
                    {getSubscriptionStatusLabel(device.companyStatus)}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-4 gap-3 text-[11px] font-bold text-slate-600">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dir-ltr text-left">{device.deviceId}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('المنصة', 'Platform')}: {device.platform || '-'}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('آخر ظهور', 'Last seen')}: {formatDeviceSeenAt(device.lastSeenAt)}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('آخر مستخدم', 'Last user')}: {device.lastUserEmail || '-'}</div>
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black text-slate-800">{tr('الأكواد', 'Activation codes')}</div>
              <div className="mt-1 text-[11px] font-bold text-slate-500">{tr('الأكواد المتاحة والمستخدمة والمنتهية مع تفاصيل كل كود.', 'Available, used, and expired activation codes with full details.')}</div>
            </div>
            <div className="text-[11px] font-bold text-slate-500">
              {tr('متاح', 'Available')}: {summary.availableCodes} | {tr('مستخدم', 'Used')}: {summary.usedCodes} | {tr('منتهي', 'Expired')}: {summary.expiredCodes}
            </div>
          </summary>
          <div className="mt-3 space-y-3 max-h-[28rem] overflow-auto">
            {!subscriptionCodesLoading && subscriptionCodes.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs font-bold text-gray-400">
                {tr('لا توجد أكواد متاحة لعرضها حاليًا.', 'There are no activation codes to show right now.')}
              </div>
            )}
            {!subscriptionCodesLoading && subscriptionCodes.length > 0 && codeRows.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs font-bold text-gray-400">
                {tr('لا توجد أكواد مطابقة ضمن الفلاتر الحالية.', 'No activation codes match the current filters.')}
              </div>
            )}
            {codeRows.map(code => (
              <div key={code.code} className="rounded-2xl border border-gray-200 bg-white px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="dir-ltr text-left text-sm font-black text-slate-900">{code.code}</div>
                  <div className={`px-3 py-1 rounded-full border text-[11px] font-black ${getCodeTone(code.effectiveStatus)}`}>
                    {getCodeStatusLabel(code.effectiveStatus)}
                  </div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-[11px] font-bold text-slate-600">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{getSubscriptionPlanLabel(code.plan)}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{code.durationDays} {tr('يوم', 'day(s)')}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('الأجهزة', 'Devices')}: {code.maxDevices}</div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">{tr('الإنشاء', 'Created')}: {formatDeviceSeenAt(code.createdAt)}</div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 text-[11px] font-bold text-slate-500">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2">{tr('ينتهي في', 'Expires at')}: {formatDeviceSeenAt(code.expiresAt)}</div>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2">{tr('استخدم بواسطة', 'Used by')}: {code.usedByCompanyName || '-'}</div>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2">{tr('محجوز لشركة', 'Reserved for')}: {code.reservedCompanyName || '-'}</div>
                </div>
                {code.notes && (
                  <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-700">
                    {code.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  };

  const renderCompanyForm = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const result = updateCompanyProfile(currentCompanyId, {
          name: localCompany.name,
          taxNumber: localCompany.taxNumber,
          address: localCompany.address,
          phone: localCompany.phone,
          logoUrl: localCompany.logoUrl
        });
        if (!result.ok) {
          alert(result.message);
          return;
        }
        saveLocalCompany('تم حفظ بيانات الشركة بنجاح', 'Company data saved successfully.');
      }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white p-2.5 shadow-sm [&_img]:!bg-transparent [&_img]:!p-0">
          {localCompany.logoUrl ? (
            <img src={localCompany.logoUrl} alt={tr('شعار الشركة', 'Company logo')} className="w-full h-full object-contain" />
          ) : (
            <Building className="w-6 h-6 text-gray-400" />
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 mb-1">{tr('شعار الشركة', 'Company logo')}</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              handleLogoFile(e.target.files?.[0] || null);
              e.target.value = '';
            }}
            className="w-full text-xs font-bold text-gray-500"
          />
          <p className="mt-2 text-[11px] font-bold text-gray-400">
            {tr(
              'بعد اختيار الصورة ستتمكن من سحبها وتحديد قصّها قبل اعتماد الشعار.',
              'After picking an image, you can drag and crop it before applying the logo.'
            )}
          </p>
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
        saveLanguagePreference();
      }}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in"
    >
      <div>
        <label className="block text-sm font-bold text-gray-600 mb-1">{t('settings.languageField')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {[
            {
              value: 'AR' as CompanySettings['language'],
              label: t('settings.optionArabic'),
              desc: tr('\u0648\u0627\u062c\u0647\u0629 \u0639\u0631\u0628\u064a\u0629 \u0628\u0627\u062a\u062c\u0627\u0647 \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646 \u0625\u0644\u0649 \u0627\u0644\u064a\u0633\u0627\u0631.', 'Arabic interface with right-to-left layout.')
            },
            {
              value: 'EN' as CompanySettings['language'],
              label: t('settings.optionEnglish'),
              desc: tr('\u0648\u0627\u062c\u0647\u0629 \u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 \u0628\u0627\u062a\u062c\u0627\u0647 \u0645\u0646 \u0627\u0644\u064a\u0633\u0627\u0631 \u0625\u0644\u0649 \u0627\u0644\u064a\u0645\u064a\u0646.', 'English interface with left-to-right layout.')
            }
          ].map(option => {
            const active = normalizeLanguage(localCompany.language) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => applyLanguagePreference(option.value)}
                className={`w-full rounded-2xl border p-4 text-start transition-all ${active ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-gray-800">{option.label}</div>
                    <div className="mt-1 text-xs font-bold text-gray-500">{option.desc}</div>
                  </div>
                  <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                    {active ? 'OK' : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <select
          value={normalizeLanguage(localCompany.language)}
          onChange={(e) => applyLanguagePreference(e.target.value as CompanySettings['language'])}
          className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-bold"
        >
          <option value="AR">{t('settings.optionArabic')}</option>
          <option value="EN">{t('settings.optionEnglish')}</option>
        </select>
        <p className="mt-2 text-xs font-bold text-gray-400">
          {tr('\u0627\u062e\u062a\u0631 \u0627\u0644\u0644\u063a\u0629 \u0645\u0646 \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0623\u0648 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0648\u0633\u064a\u062a\u0645 \u062a\u0637\u0628\u064a\u0642\u0647\u0627 \u0645\u0628\u0627\u0634\u0631\u0629. \u064a\u0628\u0642\u0649 \u0632\u0631 \u062d\u0641\u0638 \u0627\u0644\u0644\u063a\u0629 \u0643\u062e\u064a\u0627\u0631 \u0625\u0636\u0627\u0641\u064a.', 'Choose the language from the buttons or dropdown and it will apply immediately. The save button remains available as an extra fallback.')}
        </p>
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
      { key: 'allowNegativeStock', ar: 'السماح بالمخزون السالب', en: 'Allow negative stock' },
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

    /* printToggleOptions.splice(2, 0, {
      key: 'printItemBarcodeInInvoice',
      ar: 'طباعة باركود الأصناف داخل الفاتورة',
      en: 'Print item barcodes on invoices'
    }); */

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
          description={tr('يطبّق المظهر الداكن مباشرة على أغلب شاشات التطبيق ويحفظ الخيار تلقائيًا.', 'Applies the dark appearance immediately across most app screens and saves it automatically.')}
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
                type="number" inputMode="decimal"
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
              {tr('يُستخدم كحد افتراضي للصنف عند ترك \\"حد تنبيه نفاد المخزون\\" فارغًا.', 'Used as the default item threshold when the per-item low-stock alert is left empty.')}
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
    printToggleOptions.splice(2, 0, {
      key: 'printItemBarcodeInInvoice',
      ar: 'طباعة باركود الأصناف داخل الفاتورة',
      en: 'Print item barcodes on invoices'
    });

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
                type="number" inputMode="decimal"
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
              onChange={(e) => setAutoBackupFrequency(e.target.value as 'INSTANT' | 'HOURLY' | 'DAILY')}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none"
            >
              <option value="INSTANT">{tr('فوري (عند كل عملية)', 'Instant (on every operation)')}</option>
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

      <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-black text-rose-700">{tr('سجل أخطاء التشغيل', 'Runtime Error Log')}</p>
          <span className="text-[11px] font-black text-rose-600">
            {tr('عدد الأخطاء', 'Entries')}: {runtimeErrorLog.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRefreshRuntimeErrorLog}
            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-black flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {tr('تحديث', 'Refresh')}
          </button>
          <button
            type="button"
            onClick={handleExportRuntimeErrorLog}
            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-black flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            {tr('تصدير JSON', 'Export JSON')}
          </button>
          <button
            type="button"
            onClick={handleClearRuntimeErrorLog}
            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-black flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {tr('مسح السجل', 'Clear log')}
          </button>
        </div>

        {runtimeErrorLog.length > 0 ? (
          <div className="space-y-1 max-h-44 overflow-y-auto rounded-lg border border-rose-100 bg-white p-2">
            {[...runtimeErrorLog].slice(-12).reverse().map((entry) => (
              <div key={entry.id} className="rounded-md border border-rose-50 p-2 text-[11px]">
                <div className="font-black text-rose-700">{kindLabel(entry.kind)}</div>
                <div className="font-bold text-gray-700 break-words">{entry.message}</div>
                <div className="text-gray-500 font-bold mt-0.5">{new Date(entry.at).toLocaleString('en-GB')}</div>
                {entry.source ? <div className="text-gray-400 font-bold break-all">{entry.source}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 font-bold">
            {tr('لا توجد أخطاء تشغيل مسجلة حتى الآن.', 'No runtime errors have been recorded yet.')}
          </p>
        )}
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

  const renderWipeDataForm = () => {
    const isWipeDisabled = wipeBusy || wipeConfirmText.trim() !== (isEnglish ? 'delete' : 'حذف');
    
    const handleWipeData = async () => {
      if (isWipeDisabled) return;
      try {
        setWipeBusy(true);
        const result = await wipeAllCompanyData();
        if (result.ok) {
          setMode('MENU');
          setWipeConfirmText('');
        } else {
          alert(result.message || tr('تعذر حذف البيانات.', 'Could not delete data.'));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setWipeBusy(false);
      }
    };

    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-[2rem] border border-rose-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-black text-rose-500">{tr('الرقابة والبيانات', 'Control and Data')}</div>
              <h2 className="mt-1 text-xl font-black text-slate-900">{tr('حذف جميع البيانات', 'Delete all data')}</h2>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-500">
                {tr(
                  'ستقوم هذه العملية بحذف كافة بيانات التطبيق، والشركات، والمخزون، والفواتير، وإعادة التطبيق لحالة ضبط المصنع.',
                  'This operation will delete all app data, companies, inventory, invoices, and reset the app to factory settings.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode('MENU')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              {tr('عودة', 'Back')}
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-rose-600 mb-4">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-base font-black">{tr('تأكيد الحذف الشامل', 'Confirm full deletion')}</h3>
          </div>
          
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-black leading-6 text-rose-700">
            {tr(
              'تنبيه خطير: هذه العملية لا يمكن التراجع عنها، وسيتم فقدان جميع بياناتك إذا لم يكن لديك نسخة احتياطية محفوظة خارجياً.',
              'Critical warning: This operation cannot be undone, and all your data will be lost if you do not have an external backup saved.'
            )}
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              {tr('لتأكيد الحذف، يرجى كتابة "حذف" في المربع أدناه:', 'To confirm deletion, please type "delete" in the box below:')}
            </label>
            <input
              type="text"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder={tr('حذف', 'delete')}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <button
            onClick={() => void handleWipeData()}
            disabled={isWipeDisabled}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {wipeBusy ? (
               <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {tr('حذف جميع البيانات الآن', 'Delete all data now')}
          </button>
        </div>
      </div>
    );
  };

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

  const renderSupportView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6 animate-in fade-in max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
          <LifeBuoy className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-black text-gray-800">
          {tr('الدعم الفني والمساندة', 'Technical Support')}
        </h3>
        <p className="text-xs text-gray-500 font-bold max-w-md mx-auto leading-5">
          {tr(
            'إذا واجهتك أي مشكلة أو كان لديك استفسار حول استخدام البرنامج، يمكنك التواصل مع فريق الدعم الفني مباشرة.',
            'If you face any issues or have inquiries about using the app, feel free to contact technical support.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* WhatsApp Card */}
        <div className="border border-gray-100 rounded-2xl p-5 bg-slate-50 flex flex-col justify-between space-y-4 hover:border-emerald-100 hover:bg-emerald-50/20 transition-all">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.709 1.459h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <h4 className="text-sm font-black text-gray-800">
              {tr('واتساب', 'WhatsApp')}
            </h4>
            <p className="text-xs text-gray-500 font-bold dir-ltr text-left">
              +972 595134770
            </p>
          </div>
          <a
            href="https://wa.me/972595134770"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition-all duration-200"
          >
            {tr('تواصل عبر واتساب', 'Chat on WhatsApp')}
          </a>
        </div>

        {/* Email Card */}
        <div className="border border-gray-100 rounded-2xl p-5 bg-slate-50 flex flex-col justify-between space-y-4 hover:border-blue-100 hover:bg-blue-50/20 transition-all">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Mail className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-black text-gray-800">
              {tr('البريد الإلكتروني', 'Email Support')}
            </h4>
            <p className="text-xs text-gray-500 font-bold select-all overflow-hidden text-ellipsis">
              hamza.mm.aa.ss@gmail.com
            </p>
          </div>
          <a
            href="mailto:hamza.mm.aa.ss@gmail.com"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition-all duration-200"
          >
            {tr('إرسال بريد إلكتروني', 'Send Email')}
          </a>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (mode) {
      case 'USER_ACCOUNT': return renderUserAccountForm();
      case 'USER_MANAGEMENT': 
        if (currentUser?.email !== 'hamza.mm.aa.ss@gmail.com') return null;
        return renderUserManagementForm();
      case 'COMPANIES': return renderCompaniesForm();
      case 'SUBSCRIPTION': return renderSubscriptionForm();
      case 'SUBSCRIPTION_REPORTS': return renderSubscriptionReports();
      case 'POLICY': return <PolicyGuideScreen mode="POLICY" language={appLanguage} onBack={() => setMode('MENU')} />;
      case 'ACCOUNT_DELETE': return <AccountDeletionScreen language={appLanguage} onBack={() => setMode('MENU')} />;
      case 'USAGE_GUIDE': return <PolicyGuideScreen mode="USAGE_GUIDE" language={appLanguage} onBack={() => setMode('MENU')} />;
      case 'SUPPORT': return renderSupportView();
      case 'COMPANY': return renderCompanyForm();
      case 'OPENING_BALANCES': return <OpeningBalancesManager />;
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
      case 'WIPE_DATA': return renderWipeDataForm();
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
          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[11px] font-black text-slate-500">{tr('الشركة الحالية', 'Current company')}</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{currentCompany?.name || companySettings.name || tr('بدون اسم', 'Unnamed')}</div>
                  <div className="mt-2 text-[11px] font-bold text-slate-500">
                    {tr('الخطة', 'Plan')}: {getSubscriptionPlanLabel(currentCompany?.subscriptionPlan || 'TRIAL')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('SUBSCRIPTION')}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black"
                  >
                    {tr('إدارة الاشتراك', 'Subscription')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('COMPANY')}
                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-black text-slate-700"
                  >
                    {tr('بيانات الشركة', 'Company data')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('OPENING_BALANCES')}
                    className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-700"
                  >
                    {tr('الأرصدة الافتتاحية', 'Opening balances')}
                  </button>
                </div>
              </div>
            </div>

            <MenuSection
              title={tr('الأكثر استخدامًا', 'Most used')}
              description={tr('المهام اليومية السريعة التي تحتاجها غالبًا أولًا.', 'The quick daily tasks you usually need first.')}
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <MenuItem icon={<User className="w-6 h-6" />} title={tr('معلومات الحساب', 'Account Information')} desc={tr('الاسم، البريد الإلكتروني، وحالة التسجيل', 'Name, Email, and Registration Status')} color="blue" rtl={rtl} onClick={() => setMode('USER_ACCOUNT')} />
                {currentUser?.email === 'hamza.mm.aa.ss@gmail.com' && (
                  <MenuItem icon={<Users className="w-6 h-6" />} title={tr('إدارة المستخدمين', 'User Management')} desc={tr('إنشاء مستخدمين جدد وتغيير كلمات المرور الخاصة بهم', 'Create new users and change their passwords')} color="indigo" rtl={rtl} onClick={() => setMode('USER_MANAGEMENT')} />
                )}
                <MenuItem icon={<Building2 className="w-6 h-6" />} title={tr('الشركات', 'Companies')} desc={tr('التبديل بين الشركات وإضافة شركة جديدة', 'Switch and manage multiple companies')} color="teal" rtl={rtl} onClick={() => setMode('COMPANIES')} />
                <MenuItem icon={<ShieldCheck className="w-6 h-6" />} title={tr('إدارة الاشتراك', 'Subscription')} desc={tr('تفعيل الاشتراك، تمديده، وضبط حالة الوصول للشركة الحالية', 'Activate, renew, and control company access status')} color="emerald" rtl={rtl} onClick={() => setMode('SUBSCRIPTION')} />
                <MenuItem icon={<Building className="w-6 h-6" />} title={t('settings.companyData')} desc={t('settings.companyDesc')} color="blue" rtl={rtl} onClick={() => setMode('COMPANY')} />
                <MenuItem icon={<Save className="w-6 h-6" />} title={tr('الأرصدة الافتتاحية', 'Opening Balances')} desc={tr('إدخال أرصدة البداية للعملاء والموردين وكافة الحسابات بقيود افتتاحية منظمة', 'Enter start balances for customers, suppliers, and all posting accounts with structured opening entries')} color="orange" rtl={rtl} onClick={() => setMode('OPENING_BALANCES')} />
                <MenuItem icon={<Download className="w-6 h-6" />} title={t('settings.backup')} desc={t('settings.backupDesc')} color="gray" rtl={rtl} onClick={() => setMode('BACKUP')} />
              </div>
            </MenuSection>

            <MenuSection
              title={tr('الإعدادات الأساسية', 'Core settings')}
              description={tr('لغة النظام، الضرائب، السندات، والسلوك العام للتشغيل والطباعة.', 'Language, tax, vouchers, and the main operating and print behavior.')}
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <MenuItem icon={<Globe className="w-6 h-6" />} title={t('settings.language')} desc={t('settings.languageDesc')} color="green" rtl={rtl} onClick={() => setMode('LANGUAGE')} />
                <MenuItem icon={<Percent className="w-6 h-6" />} title={t('settings.taxes')} desc={tr('التحكم بنسبة الضريبة وعرضها في الفواتير', 'Control tax rate and tax visibility in invoices')} color="rose" rtl={rtl} onClick={() => setMode('TAXES')} />
                <MenuItem icon={<Wallet className="w-6 h-6" />} title={tr('إعدادات السندات والذمم', 'Voucher & A/R Settings')} desc={tr('خيارات تخصيص السداد وربط السندات بالفواتير', 'Voucher allocation and invoice settlement options')} color="emerald" rtl={rtl} onClick={() => setMode('VOUCHERS_AR_AP')} />
                <MenuItem icon={<Settings2 className="w-6 h-6" />} title={tr('خيارات أخرى', 'Other Options')} desc={tr('إعدادات التشغيل والسلوك العام', 'Operational and behavior settings')} color="indigo" rtl={rtl} onClick={() => setMode('OTHER_OPTIONS')} />
                <MenuItem icon={<Printer className="w-6 h-6" />} title={tr('خيارات الطباعة', 'Print Options')} desc={tr('إعدادات شكل وإخراج الطباعة', 'Print layout and output settings')} color="orange" rtl={rtl} onClick={() => setMode('PRINT_OPTIONS')} />
                <MenuItem icon={<Percent className="w-6 h-6" />} title={t('settings.currency')} desc={t('settings.currencyDesc')} color="green" rtl={rtl} onClick={() => setMode('CURRENCY')} />
              </div>
            </MenuSection>

            <MenuSection
              title={tr('الحسابات والأصناف', 'Accounts and items')}
              description={tr('إدارة الدليل المحاسبي والخزينة والمخزون والتصنيفات المرتبطة به.', 'Manage the chart of accounts, treasury, inventory, and related item structures.')}
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <MenuItem icon={<Wallet className="w-6 h-6" />} title={t('settings.treasury')} desc={t('settings.treasuryDesc')} color="emerald" rtl={rtl} onClick={() => setMode('TREASURY')} />
                <MenuItem icon={<Layers className="w-6 h-6" />} title={t('settings.accounts')} desc={t('settings.accountsDesc')} color="indigo" rtl={rtl} onClick={() => setMode('ACCOUNTS')} />
                <MenuItem icon={<PackagePlus className="w-6 h-6" />} title={t('settings.itemGroups')} desc={t('settings.itemGroupsDesc')} color="purple" rtl={rtl} onClick={() => setMode('ITEM_GROUPS')} />
                <MenuItem icon={<Scale className="w-6 h-6" />} title={t('settings.units')} desc={t('settings.unitsDesc')} color="orange" rtl={rtl} onClick={() => setMode('UNITS')} />
                <MenuItem icon={<Building2 className="w-6 h-6" />} title={t('settings.assets')} desc={t('settings.assetsDesc')} color="teal" rtl={rtl} onClick={() => setMode('ASSETS')} />
              </div>
            </MenuSection>

            <MenuSection
              title={tr('الرقابة والبيانات', 'Control and data')}
              description={tr('الاستيراد، الصلاحيات، سجل التدقيق، وفحص سلامة البيانات.', 'Import, permissions, audit trail, and data integrity tools.')}
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <MenuItem icon={<Upload className="w-6 h-6" />} title={tr('استيراد البيانات', 'Data Import')} desc={tr('استيراد زبائن/أصناف/سجلات/فواتير من Excel أو CSV', 'Import contacts/products/transactions/invoices from Excel or CSV')} color="blue" rtl={rtl} onClick={() => setMode('DATA_IMPORT')} />
                <MenuItem icon={<ShieldCheck className="w-6 h-6" />} title={tr('الصلاحيات', 'Permissions')} desc={tr('عرض/إضافة/تعديل/حذف/ترحيل/طباعة/عكس', 'Access matrix by operation')} color="indigo" rtl={rtl} onClick={() => setMode('PERMISSIONS')} />
                <MenuItem icon={<Lock className="w-6 h-6" />} title={tr('سجل التدقيق', 'Audit Trail')} desc={tr('من عدّل ماذا ومتى وعلى أي شاشة', 'Who changed what and when')} color="gray" rtl={rtl} onClick={() => setMode('AUDIT')} />
                <MenuItem icon={<FileCheck2 className="w-6 h-6" />} title={tr('سلامة البيانات', 'Integrity Check')} desc={tr('فحص شامل للأخطاء المؤثرة على التقارير مع إصلاحات آمنة', 'Scan data integrity issues affecting reports with safe fixes')} color="rose" rtl={rtl} onClick={() => setMode('INTEGRITY')} />
                <MenuItem icon={<Trash2 className="w-6 h-6" />} title={tr('حذف جميع البيانات', 'Delete all data')} desc={tr('إعادة ضبط المصنع ومسح كل شيء', 'Factory reset and clear everything')} color="rose" rtl={rtl} onClick={() => setMode('WIPE_DATA')} />
              </div>
            </MenuSection>

            <MenuSection
              title={tr('الأجهزة والمساعدة', 'Devices and help')}
              description={tr('إعدادات الأجهزة الطرفية، مركز الأجهزة، ودلائل الاستخدام والسياسات.', 'Peripheral devices, device hub, usage guides, and policy screens.')}
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <MenuItem icon={<Cable className="w-6 h-6" />} title={tr('مركز إدارة الأجهزة', 'Device Management Center')} desc={tr('تعريف الأجهزة، الوكيل المحلي، السجل، وطابور الأوفلاين', 'Devices, local agent, logs, and offline queue')} color="gray" rtl={rtl} onClick={() => setMode('DEVICE_HUB')} />
                <MenuItem icon={<ScanBarcode className="w-6 h-6" />} title={tr('قارئ الباركود والطباعة', 'Barcode Reader & Labels')} desc={tr('إعدادات المسح بالباركود وطباعة ملصقات الأصناف', 'Barcode scanning settings and product label printing')} color="orange" rtl={rtl} onClick={() => setMode('BARCODE_DEVICES')} />
                <MenuItem icon={<Wrench className="w-6 h-6" />} title={tr('قارئ البصمة', 'Fingerprint Reader')} desc={tr('تعريف أجهزة البصمة والرفع المباشر/اليدوي لسجلات الحضور', 'Configure fingerprint devices and direct/manual attendance uploads')} color="indigo" rtl={rtl} onClick={() => setMode('FINGERPRINT_READERS')} />
                <MenuItem icon={<BookOpen className="w-6 h-6" />} title={tr('دليل الاستخدام', 'Usage Guide')} desc={tr('خطوات سريعة لبدء الاستخدام وإعداد الخيارات الأساسية', 'Quick steps to start using the app and configure core options')} color="purple" rtl={rtl} onClick={() => setMode('USAGE_GUIDE')} />
                <MenuItem icon={<LifeBuoy className="w-6 h-6" />} title={tr('الدعم الفني', 'Technical Support')} desc={tr('تواصل مع الدعم الفني عبر الواتساب أو البريد الإلكتروني', 'Contact support via WhatsApp or Email')} color="blue" rtl={rtl} onClick={() => setMode('SUPPORT')} />
                <MenuItem icon={<FileCheck2 className="w-6 h-6" />} title={tr('سياسة الخصوصية', 'Privacy Policy')} desc={tr('شروط الاستخدام وسياسة حماية البيانات الخاصة بالتطبيق', 'Usage terms and data privacy policy for the app')} color="rose" rtl={rtl} onClick={() => setMode('POLICY')} />
                <MenuItem icon={<Trash2 className="w-6 h-6" />} title={tr('حذف الحساب', 'Delete Account')} desc={tr('حذف حساب الدخول من داخل التطبيق وفتح روابط الحذف والخصوصية العامة', 'Delete the sign-in account inside the app and open the public deletion/privacy links')} color="rose" rtl={rtl} onClick={() => setMode('ACCOUNT_DELETE')} />
                {subscriptionAdminEnabled && (
                  <MenuItem icon={<Cloud className="w-6 h-6" />} title={tr('تقارير الاشتراكات', 'Subscription Reports')} desc={tr('عرض الشركات السحابية والأجهزة المرتبطة والأكواد المستخدمة والمنتهية', 'View cloud companies, bound devices, and used or expired codes')} color="purple" rtl={rtl} onClick={() => setMode('SUBSCRIPTION_REPORTS')} />
                )}
              </div>
            </MenuSection>
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
      <CompanyLogoCropDialog
        open={Boolean(logoCropSource)}
        imageSrc={logoCropSource}
        language={appLanguage}
        onClose={handleCloseLogoCrop}
        onApply={handleApplyLogoCrop}
      />
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
          style={{ left: `${knobLeft}px` }}
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

const MenuSection: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-[1.75rem] border border-gray-100 bg-slate-50/80 p-3 sm:p-4 space-y-3">
    <div>
      <h2 className="text-sm font-black text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-[11px] font-bold text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);

export default DefinitionsMenu;
