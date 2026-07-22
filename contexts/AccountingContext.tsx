
import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import {
  Transaction, Invoice, Account, Product, Contact, FixedAsset,
  CompanySettings, User, Currency, FinancialSummary, TransactionType,
  GoogleDriveStatus, AccountType, Check, ItemGroup, SupportTicket, TicketStatus, FixedAssetGroup,
  Employee, Department, UnitOfMeasure, Warehouse, StockTransfer,
  EmployeeContract, EmployeeSalarySnapshot, SalaryHistoryEntry,
  EmployeeLeaveRequest, EmployeeRecurringDeduction,
  BillOfMaterial, ProductionOrder, ProductionOrderStatus, MutationResult,
  PermissionAction, PermissionModule, PermissionMatrix, AuditLogEntry, BackupPayloadV1, UserRole,
  CloudCompanySubscription, CloudSubscriptionCode, CompanyMembership, CompanyProfile, CompanySubscriptionPlan, CompanySubscriptionStatus, CreateCompanyInput, ImportExpenseDistribution, InventoryValuationMethod, ProductFifoLayer, SubscriptionBillingCycle, SubscriptionCheckoutProvider, SubscriptionCheckoutResult, SubscriptionCodeIssueResult, SubscriptionDeviceBinding, SubscriptionProviderAvailability, WorkspaceOfferCode, WorkspaceOfferCodeKind, WorkspaceSubscriptionAccount
  , InvoiceSettlement, FingerprintReaderDevice, FingerprintAttendanceBatch
} from '../types';
import { validateInvoiceInput, validateTransactionInput } from '../utils/validationRules';
import { decryptBackupPayload, encryptBackupPayload, isBackupPayloadV1 } from '../utils/backupCrypto';
import { getInvoiceRemainingBase } from '../utils/invoiceSettlement';
import { sanitizeInvoices } from '../utils/invoiceSanitizer';
import { buildProductPricingPatch } from '../utils/productPricing';
import { isStockProduct, normalizeProductInventoryFields } from '../utils/productKind';
import { isProfitLossAccount } from '../utils/fiscalYear';
import { DEFAULT_BRAND_MARK_URL, normalizeBrandLogoUrl } from '../utils/brandAssets';
import { detectPreferredAppLanguage, normalizeAppLanguage, isCodeEmail, extractCodeFromEmail } from '../utils/i18n';
import { coerceCompanyBooleanSetting, normalizeCompanyDisplaySettings, normalizeInvoiceTaxSettings } from '../utils/companySettings';
import {
  findCompanyProfileNameConflict,
  resolveCompanyDeletionTarget,
  shouldBootstrapMissingCompanySubscription
} from '../utils/companyLifecycle';
import { normalizeEntityNameKey } from '../utils/entityNameMatching';
import { buildDefaultWorkspaceSubscription, getSubscriptionProviderAvailability, getWorkspaceEffectiveMaxCompanies, getWorkspaceRemainingCompanySlots, normalizeWorkspaceSubscription, prepareWorkspaceCheckout } from '../utils/subscriptionCommerce';
import { buildCloudSubscriptionFromCompanyProfile, getCurrentSubscriptionDeviceBinding, getOrCreateSubscriptionDeviceId, isLocalSubscriptionAdminEnabled, isProgramOwnerEmail, isSubscriptionAdminEmail, normalizeCloudCompanySubscription, normalizeCloudSubscriptionCode, normalizeWorkspaceOfferCode } from '../utils/subscriptionCloud';
import { clearWorkspaceSnapshotStorage, deleteWorkspaceSnapshotRecord, readWorkspaceSnapshotRecord, writeWorkspaceSnapshotRecord } from '../utils/workspaceSnapshotStorage';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { onAuthStateChanged, type User as FirebaseAuthUser, signOut as firebaseSignOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useFirestoreSyncState, showSyncAlertOnce } from '../hooks/useFirestoreSyncState';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, limit as firestoreLimit } from 'firebase/firestore';
import { firebaseAuth, firebaseDb, isFirebaseAuthEnabled, isFirebaseSyncEnabled, executeFirestoreWrite, callBackendApi } from '../firebaseClient';

const APP_BOOT_TIMESTAMP = new Date().toISOString();

const addDaysIso = (dateIso: string, days: number): string => {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

// ... (Existing Interfaces)

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type SubscriptionAdminScope = 'NONE' | 'LOCAL' | 'CLOUD';

type BackupHistoryEntry = {
  id: string;
  companyId: string;
  createdAt: string;
  source: 'MANUAL' | 'AUTO';
  payload: BackupPayloadV1;
  driveFileId?: string;
  uploadedToDrive?: boolean;
};

type PartnerCapitalContributionInput = {
  partnerId: string;
  partnerName?: string;
  amount: number;
  fundingAccountId: string;
  date: string;
  note?: string;
  isReduction?: boolean;
};

type PartnerCurrentReceiptInput = {
  partnerId: string;
  partnerName?: string;
  amount: number;
  fundingAccountId: string;
  date: string;
  note?: string;
};

type PartnerCashDisbursementInput = {
  partnerId: string;
  partnerName?: string;
  amount: number;
  fundingAccountId: string;
  date: string;
  purpose?: 'DRAWINGS' | 'CURRENT';
  note?: string;
};

type PartnerAccountPreference = {
  currentAccountId?: string;
  capitalAccountId?: string;
};

type EnsuredPartnerEquityAccountsResult = {
  currentAccountId: string;
  capitalAccountId: string;
  accountSnapshot: Account[];
  changed: boolean;
};

type CommercialSubAccountContactType = Extract<Contact['type'], 'CUSTOMER' | 'SUPPLIER'>;

type EnsuredCommercialSubAccountResult = {
  linkedAccountId: string;
  accountSnapshot: Account[];
  changed: boolean;
};

type DeleteInvoiceOptions = {
  preserveSettlements?: boolean;
};

interface AccountingContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  logout: () => void;
  companies: CompanyProfile[];
  currentCompanyId: string;
  currentCompany: CompanyProfile | null;
  companiesLoaded: boolean;
  trialDaysLeft: number;
  companyAccessStatus: CompanySubscriptionStatus;
  companyAccessDaysLeft: number;
  companyAccessEndsAt?: string;
  workspaceSubscription: WorkspaceSubscriptionAccount;
  workspaceMaxCompanies: number;
  workspaceRemainingCompanySlots: number;
  workspaceCompanyLimitReached: boolean;
  workspaceProviderAvailability: SubscriptionProviderAvailability;
  switchCompany: (companyId: string) => MutationResult;
  createCompany: (input: CreateCompanyInput) => Promise<MutationResult>;
  deleteCompany: (companyId: string) => Promise<MutationResult>;
  wipeAllCompanyData: () => Promise<MutationResult>;
  updateWorkspaceSubscription: (updates: Partial<WorkspaceSubscriptionAccount>) => Promise<MutationResult>;
  prepareSubscriptionCheckout: (
    provider: SubscriptionCheckoutProvider,
    billingCycle: SubscriptionBillingCycle,
    desiredCompanyCount: number,
    options?: {
      discountPercent?: number;
      offerCode?: string;
    }
  ) => SubscriptionCheckoutResult;
  updateCompanyProfile: (companyId: string, updates: Partial<CompanyProfile>) => MutationResult;
  updateCompanySubscription: (companyId: string, updates: Partial<CompanyProfile>) => Promise<MutationResult>;
  activateCompanySubscription: (companyId: string, activationCode: string) => Promise<MutationResult>;
  deviceBindingId: string;
  cloudSubscription: CloudCompanySubscription | null;
  subscriptionCloudBusy: boolean;
  subscriptionCloudError: string;
  subscriptionAdminEnabled: boolean;
  programOwnerEnabled: boolean;
  subscriptionCodes: CloudSubscriptionCode[];
  subscriptionCodesLoading: boolean;
  workspaceOfferCodes: WorkspaceOfferCode[];
  workspaceOfferCodesLoading: boolean;
  subscriptionCompanies: CloudCompanySubscription[];
  subscriptionCompaniesLoading: boolean;
  issueSubscriptionCode: (input: {
    plan: CompanySubscriptionPlan;
    durationDays: number;
    maxDevices: number;
    expiresAt?: string;
    notes?: string;
    reservedCompanyId?: string;
    reservedCompanyName?: string;
  }) => Promise<SubscriptionCodeIssueResult>;
  cancelSubscriptionCode: (code: string) => Promise<MutationResult>;
  issueWorkspaceOfferCode: (input: {
    kind: WorkspaceOfferCodeKind;
    discountPercent?: number;
    freeDays?: number;
    companyCount?: number;
    expiresAt?: string;
    notes?: string;
  }) => Promise<SubscriptionCodeIssueResult>;
  redeemWorkspaceOfferCode: (code: string, desiredCompanyCount?: number) => Promise<MutationResult>;
  linkCurrentSubscriptionDevice: (companyId?: string) => Promise<MutationResult>;
  unlinkSubscriptionDevice: (companyId: string, deviceId: string) => Promise<MutationResult>;

  transactions: Transaction[];
  addTransaction: (t: Omit<Transaction, 'id'>) => MutationResult;
  updateTransaction: (id: string, updates: Partial<Transaction>) => MutationResult;
  deleteTransaction: (id: string) => MutationResult;
  postVoucher: (voucherId: string) => MutationResult;
  deleteVoucher: (voucherId: string) => MutationResult;
  reverseTransaction: (transactionId: string, reverseDate?: string) => MutationResult;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;

  invoices: Invoice[];
  createInvoice: (invoiceData: Omit<Invoice, 'id'> & { id?: string }) => Promise<MutationResult>;
  updateInvoice: (id: string, updates: Partial<Invoice>) => MutationResult;
  deleteInvoice: (id: string, options?: DeleteInvoiceOptions) => MutationResult;
  postInvoice: (id: string) => MutationResult;
  reverseInvoice: (invoiceId: string, reverseDate?: string) => MutationResult;
  returnInvoiceItem: (invoiceId: string, itemId: string) => MutationResult;
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;

  importExpenseDistributions: ImportExpenseDistribution[];
  addImportExpenseDistribution: (record: Omit<ImportExpenseDistribution, 'id'>) => MutationResult;
  setImportExpenseDistributions: React.Dispatch<React.SetStateAction<ImportExpenseDistribution[]>>;
  invoiceSettlements: InvoiceSettlement[];
  upsertInvoiceSettlementsForVoucher: (
    voucherId: string,
    allocations: Omit<InvoiceSettlement, 'id'>[]
  ) => MutationResult;

  accounts: Account[];
  addAccount: (account: Omit<Account, 'id'> & { id?: string }) => MutationResult;
  updateAccount: (id: string, updates: Partial<Account>) => MutationResult;
  deleteAccount: (id: string) => MutationResult;

  products: Product[];
  addProduct: (product: Omit<Product, 'id'> & { id?: string }) => MutationResult;
  updateProduct: (id: string, updates: Partial<Product>) => MutationResult;
  deleteProduct: (id: string) => void;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;

  itemGroups: ItemGroup[];
  addItemGroup: (group: Omit<ItemGroup, 'id'>) => void;
  updateItemGroup: (id: string, updates: Partial<ItemGroup>) => void;
  deleteItemGroup: (id: string) => void;

  // Units
  units: UnitOfMeasure[];
  addUnit: (unit: Omit<UnitOfMeasure, 'id'>) => void;
  updateUnit: (id: string, updates: Partial<UnitOfMeasure>) => void;
  deleteUnit: (id: string) => void;

  contacts: Contact[];
  addContact: (contact: Omit<Contact, 'id'> & { id?: string }) => MutationResult;
  updateContact: (id: string, updates: Partial<Contact>) => MutationResult;
  deleteContact: (id: string) => MutationResult;
  postPartnerCapitalContribution: (input: PartnerCapitalContributionInput) => MutationResult;
  postPartnerCurrentReceipt: (input: PartnerCurrentReceiptInput) => MutationResult;
  postPartnerCashDisbursement: (input: PartnerCashDisbursementInput) => MutationResult;

  // HR Module
  employees: Employee[];
  addEmployee: (emp: Omit<Employee, 'id'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  employeeContracts: EmployeeContract[];
  addEmployeeContract: (contract: Omit<EmployeeContract, 'id' | 'createdAt'>, applyToEmployee?: boolean) => MutationResult;
  updateEmployeeContract: (id: string, updates: Partial<EmployeeContract>, applyToEmployee?: boolean) => MutationResult;
  deleteEmployeeContract: (id: string) => MutationResult;
  salaryHistory: SalaryHistoryEntry[];
  employeeLeaveRequests: EmployeeLeaveRequest[];
  addEmployeeLeaveRequest: (req: Omit<EmployeeLeaveRequest, 'id' | 'createdAt' | 'days'> & { days?: number }) => MutationResult;
  updateEmployeeLeaveRequest: (id: string, updates: Partial<EmployeeLeaveRequest>) => MutationResult;
  deleteEmployeeLeaveRequest: (id: string) => MutationResult;
  employeeRecurringDeductions: EmployeeRecurringDeduction[];
  addEmployeeRecurringDeduction: (item: Omit<EmployeeRecurringDeduction, 'id' | 'createdAt' | 'installmentsApplied'>) => MutationResult;
  updateEmployeeRecurringDeduction: (id: string, updates: Partial<EmployeeRecurringDeduction>) => MutationResult;
  deleteEmployeeRecurringDeduction: (id: string) => MutationResult;
  fingerprintDevices: FingerprintReaderDevice[];
  addFingerprintDevice: (device: Omit<FingerprintReaderDevice, 'id' | 'createdAt'> & { id?: string }) => MutationResult;
  updateFingerprintDevice: (id: string, updates: Partial<FingerprintReaderDevice>) => MutationResult;
  deleteFingerprintDevice: (id: string) => MutationResult;
  fingerprintAttendanceBatches: FingerprintAttendanceBatch[];
  addFingerprintAttendanceBatch: (batch: Omit<FingerprintAttendanceBatch, 'id' | 'importedAt'> & { id?: string }) => MutationResult;
  updateFingerprintAttendanceBatch: (id: string, updates: Partial<FingerprintAttendanceBatch>) => MutationResult;
  deleteFingerprintAttendanceBatch: (id: string) => MutationResult;
  departments: Department[];
  addDepartment: (dept: Omit<Department, 'id'>) => void;
  deleteDepartment: (id: string) => void;

  tickets: SupportTicket[];
  addTicket: (ticket: Omit<SupportTicket, 'id' | 'createdAt'>) => void;
  updateTicketStatus: (id: string, status: TicketStatus) => void;
  deleteTicket: (id: string) => void;

  fixedAssets: FixedAsset[];
  addFixedAsset: (asset: Omit<FixedAsset, 'id'>) => string | null;
  updateFixedAsset: (id: string, updates: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;

  assetGroups: FixedAssetGroup[];
  addAssetGroup: (group: Omit<FixedAssetGroup, 'id'>) => void;
  deleteAssetGroup: (id: string) => void;

  checks: Check[];
  addCheck: (check: Omit<Check, 'id'> & { id?: string }) => void;
  updateCheck: (id: string, updates: Partial<Check>) => void;
  deleteCheck: (id: string) => void;

  currencies: Currency[];
  baseCurrency: string;
  setBaseCurrency: (code: string) => void;
  addCurrency: (currency: Currency) => void;
  deleteCurrency: (code: string) => void;
  updateCurrencyRate: (code: string, rate: number) => void;

  companySettings: CompanySettings;
  updateCompanySettings: (settings: CompanySettings) => MutationResult;

  users: User[];
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;

  summary: FinancialSummary;

  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncData: () => Promise<void>;
  exportData: (password: string) => Promise<BackupPayloadV1 | null>;
  importData: (json: string, password: string) => Promise<boolean>;

  googleDriveStatus: GoogleDriveStatus;
  connectGoogleDrive: () => Promise<MutationResult>;
  disconnectGoogleDrive: () => void;
  uploadBackupToGoogleDrive: (payload: BackupPayloadV1, fileName?: string) => Promise<MutationResult>;
  restoreFromGoogleDrive: (password: string) => Promise<MutationResult>;
  runAutoBackupNow: () => Promise<MutationResult>;

  permissions: PermissionMatrix;
  updatePermissions: (next: PermissionMatrix) => MutationResult;
  can: (module: PermissionModule, action: PermissionAction) => boolean;
  auditLogs: AuditLogEntry[];
  appendAuditLog: (
    entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'userId' | 'userName' | 'device'>
  ) => void;

  // Warehouses
  warehouses: Warehouse[];
  addWarehouse: (w: Omit<Warehouse, 'id'>) => void;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => void;
  deleteWarehouse: (id: string) => void;

  stockTransfers: StockTransfer[];
  addStockTransfer: (t: Omit<StockTransfer, 'id'>) => void;
  updateStockTransfer: (id: string, updates: Partial<StockTransfer>) => void;
  deleteStockTransfer: (id: string) => void;
  postStockTransfer: (id: string) => void;
  adjustWarehouseStock: (
    productId: string,
    warehouseId: string,
    quantity: number,
    options?: {
      reason?: 'VARIANCE' | 'DAMAGED';
      date?: string;
      note?: string;
      source?: 'MANUAL' | 'INLINE' | 'BARCODE';
    }
  ) => MutationResult;

  // Manufacturing Module
  boms: BillOfMaterial[];
  addBOM: (bom: Omit<BillOfMaterial, 'id'>) => void;
  updateBOM: (id: string, updates: Partial<BillOfMaterial>) => void;
  deleteBOM: (id: string) => void;

  productionOrders: ProductionOrder[];
  addProductionOrder: (order: Omit<ProductionOrder, 'id'>) => void;
  updateProductionOrder: (id: string, updates: Partial<ProductionOrder>) => void;
  deleteProductionOrder: (id: string) => void;
  executeProduction: (orderId: string) => void;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (context === undefined) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return context;
};

const PERMISSION_ACTIONS: PermissionAction[] = ['VIEW', 'ADD', 'EDIT', 'DELETE', 'POST', 'PRINT', 'REVERSE'];
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
  'SETTINGS',
  'FIXED_ASSETS'
];

const newId = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const roundToFour = (value: number): number => Number((Number(value) || 0).toFixed(4));

const normalizeInventoryValuationMethod = (
  settings: Partial<Pick<CompanySettings, 'inventoryValuationMethod' | 'useAverageCosting'>>
): InventoryValuationMethod => {
  const raw = String((settings as any).inventoryValuationMethod || '').trim().toUpperCase();
  if (raw === 'FIFO' || raw === 'AVERAGE' || raw === 'STANDARD') return raw as InventoryValuationMethod;
  return settings.useAverageCosting === true ? 'AVERAGE' : 'STANDARD';
};

const withNormalizedValuationSettings = (settings: CompanySettings): CompanySettings => {
  const normalizedSettings = normalizeCompanyDisplaySettings(normalizeInvoiceTaxSettings(settings));
  const method = normalizeInventoryValuationMethod(normalizedSettings);
  const backupFrequency = normalizedSettings.autoBackupFrequency === 'HOURLY' ? 'HOURLY' : 'DAILY';
  const keepCountRaw = Number(normalizedSettings.autoBackupKeepCount);
  const keepCount = Number.isFinite(keepCountRaw) ? Math.max(1, Math.min(200, Math.floor(keepCountRaw))) : 30;
  const importantAccountIds = Array.isArray(normalizedSettings.importantAccountIds)
    ? Array.from(new Set(
      normalizedSettings.importantAccountIds
        .map(value => String(value || '').trim())
        .filter(Boolean)
    ))
    : [];
  const lastRunAt = normalizedSettings.autoBackupLastRunAt && !Number.isNaN(Date.parse(normalizedSettings.autoBackupLastRunAt))
    ? normalizedSettings.autoBackupLastRunAt
    : undefined;
  return {
    ...normalizedSettings,
    logoUrl: normalizeBrandLogoUrl(normalizedSettings.logoUrl, DEFAULT_BRAND_MARK_URL),
    inventoryValuationMethod: method,
    useAverageCosting: method === 'AVERAGE',
    autoBackupEnabled: Boolean(normalizedSettings.autoBackupEnabled),
    autoBackupFrequency: backupFrequency,
    autoBackupPassword: String(normalizedSettings.autoBackupPassword || ''),
    autoBackupKeepCount: keepCount,
    autoBackupLastRunAt: lastRunAt,
    googleDriveAutoUpload: Boolean(normalizedSettings.googleDriveAutoUpload),
    googleDriveClientId: String(normalizedSettings.googleDriveClientId || '').trim(),
    googleDriveFolderId: String(normalizedSettings.googleDriveFolderId || '').trim(),
    printItemBarcodeInInvoice: coerceCompanyBooleanSetting(normalizedSettings.printItemBarcodeInInvoice, false),
    darkModeEnabled: Boolean(normalizedSettings.darkModeEnabled),
    importantAccountIds,
    language: normalizeAppLanguage(normalizedSettings.language)
  };
};

const stripLanguageFromCompanySettings = (settings: CompanySettings): Omit<CompanySettings, 'language'> => {
  const { language: _language, ...rest } = withNormalizedValuationSettings(settings);
  void _language;
  return rest;
};

const isLanguageOnlyCompanySettingsChange = (
  currentSettings: CompanySettings,
  nextSettings: CompanySettings
): boolean => {
  if (normalizeAppLanguage(currentSettings.language) === normalizeAppLanguage(nextSettings.language)) {
    return false;
  }

  return JSON.stringify(stripLanguageFromCompanySettings(currentSettings))
    === JSON.stringify(stripLanguageFromCompanySettings(nextSettings));
};

const COMPANY_SUBSCRIPTION_STATUS_SET = new Set<CompanySubscriptionStatus>(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED']);
const COMPANY_SUBSCRIPTION_PLAN_SET = new Set<CompanySubscriptionPlan>(['NONE', 'TRIAL', 'BASIC', 'PRO', 'ENTERPRISE']);
const SUBSCRIPTION_RESTRICTED_ACTIONS = new Set<PermissionAction>(['ADD', 'EDIT', 'DELETE', 'POST', 'PRINT', 'REVERSE']);
const ACTIVATION_CODE_CATALOG: Array<{ code: string; plan: CompanySubscriptionPlan; durationDays: number }> = [
  { code: 'FLEX-BASIC-30', plan: 'BASIC', durationDays: 30 },
  { code: 'FLEX-BASIC-90', plan: 'BASIC', durationDays: 90 },
  { code: 'FLEX-PRO-90', plan: 'PRO', durationDays: 90 },
  { code: 'FLEX-PRO-180', plan: 'PRO', durationDays: 180 },
  { code: 'FLEX-ENTERPRISE-365', plan: 'ENTERPRISE', durationDays: 365 },
  { code: 'FLEX-ENTERPRISE-730', plan: 'ENTERPRISE', durationDays: 730 }
];

const normalizeIsoDate = (value: unknown, fallbackIso: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return fallbackIso;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallbackIso;
};

const normalizeOptionalIsoDate = (value: unknown): string | undefined => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
};

const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(item => stripUndefinedDeep(item))
      .filter(item => typeof item !== 'undefined');
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
        const sanitizedValue = stripUndefinedDeep(nestedValue);
        return typeof sanitizedValue === 'undefined' ? [] : [[key, sanitizedValue]];
      })
    );
  }

  return typeof value === 'undefined' ? undefined : value;
};

const sanitizeFirestorePayload = (value: Record<string, unknown>): Record<string, unknown> => (
  stripUndefinedDeep(value) as Record<string, unknown>
);

const normalizeGraceDays = (value: unknown): number =>
  Math.max(0, Math.min(30, Math.floor(Number(value) || 0)));

const isSubscriptionAccessRestricted = (status: CompanySubscriptionStatus): boolean =>
  status === 'EXPIRED' || status === 'SUSPENDED';

const normalizeActivationCode = (value: unknown): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[_\s\-]+/g, '')
    .replace(/[^A-Z0-9]/g, '');

const parseActivationCode = (value: unknown): { code: string; plan: CompanySubscriptionPlan; durationDays: number } | null => {
  const normalized = normalizeActivationCode(value);
  const match = ACTIVATION_CODE_CATALOG.find(item => item.code === normalized);
  return match ? { ...match, code: normalized } : null;
};

const sortSubscriptionCodesByCreatedAt = (codes: CloudSubscriptionCode[]): CloudSubscriptionCode[] => (
  [...codes].sort((left, right) => Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || '')))
);

const loadLocalSubscriptionCodes = (): CloudSubscriptionCode[] => {
  try {
    const raw = localStorage.getItem('smart_account_subscription_codes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistLocalSubscriptionCodes = (codes: CloudSubscriptionCode[]): void => {
  try {
    localStorage.setItem('smart_account_subscription_codes', JSON.stringify(codes));
  } catch (e) {
    console.error(e);
  }
};

const sortWorkspaceOfferCodesByCreatedAt = (codes: WorkspaceOfferCode[]): WorkspaceOfferCode[] => (
  [...codes].sort((left, right) => Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || '')))
);

const loadLocalWorkspaceOfferCodes = (): WorkspaceOfferCode[] => {
  try {
    const raw = localStorage.getItem(LOCAL_WORKSPACE_OFFER_CODES_KEY)
      || localStorage.getItem('smart_account_workspace_offer_codes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistLocalWorkspaceOfferCodes = (codes: WorkspaceOfferCode[]): void => {
  try {
    localStorage.setItem(LOCAL_WORKSPACE_OFFER_CODES_KEY, JSON.stringify(codes));
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
};

const clampWorkspaceOfferCompanyCount = (value: unknown): number | undefined => {
  const parsed = Math.floor(Number(value) || 0);
  if (parsed <= 0) return undefined;
  return Math.max(1, Math.min(50, parsed));
};

function resolveCompanySubscriptionStatus(profile: Partial<CompanyProfile>): CompanySubscriptionStatus {
  const now = Date.now();
  const trialEndsAtMs = Date.parse(String(profile.trialEndsAt || ''));
  const subscriptionEndsAtMs = Date.parse(String(profile.subscriptionEndsAt || ''));
  const graceDays = normalizeGraceDays(profile.graceDays);
  const subscriptionWindowEndsAtMs = Number.isFinite(subscriptionEndsAtMs)
    ? subscriptionEndsAtMs + (graceDays * 24 * 60 * 60 * 1000)
    : Number.NaN;
  const explicitStatus = COMPANY_SUBSCRIPTION_STATUS_SET.has(profile.subscriptionStatus as CompanySubscriptionStatus)
    ? profile.subscriptionStatus as CompanySubscriptionStatus
    : null;

  if (explicitStatus === 'SUSPENDED') return 'SUSPENDED';
  if (explicitStatus === 'ACTIVE') {
    return Number.isFinite(subscriptionWindowEndsAtMs) && subscriptionWindowEndsAtMs < now ? 'EXPIRED' : 'ACTIVE';
  }
  if (explicitStatus === 'TRIAL') {
    return Number.isFinite(trialEndsAtMs) && trialEndsAtMs >= now ? 'TRIAL' : 'EXPIRED';
  }
  if (explicitStatus === 'EXPIRED') return 'EXPIRED';

  if (Number.isFinite(subscriptionWindowEndsAtMs) && subscriptionWindowEndsAtMs >= now) return 'ACTIVE';
  if (Number.isFinite(trialEndsAtMs) && trialEndsAtMs >= now) return 'TRIAL';
  return 'EXPIRED';
}

function resolveCompanySubscriptionPlan(
  profile: Partial<CompanyProfile>,
  subscriptionStatus: CompanySubscriptionStatus
): CompanySubscriptionPlan {
  const explicitPlan = COMPANY_SUBSCRIPTION_PLAN_SET.has(profile.subscriptionPlan as CompanySubscriptionPlan)
    ? profile.subscriptionPlan as CompanySubscriptionPlan
    : null;

  if (explicitPlan) {
    if (subscriptionStatus === 'TRIAL') return explicitPlan === 'NONE' ? 'TRIAL' : explicitPlan;
    return explicitPlan;
  }

  if (subscriptionStatus === 'TRIAL') return 'TRIAL';
  if (subscriptionStatus === 'ACTIVE') return 'BASIC';
  return 'NONE';
}

function resolveCompanyAccessEndsAt(
  profile: Pick<CompanyProfile, 'subscriptionStatus' | 'trialEndsAt' | 'subscriptionEndsAt' | 'graceDays'>
): string | undefined {
  if (profile.subscriptionStatus === 'ACTIVE') {
    if (!profile.subscriptionEndsAt) return undefined;
    const graceDays = normalizeGraceDays(profile.graceDays);
    return graceDays > 0 ? addDaysIso(profile.subscriptionEndsAt, graceDays) : profile.subscriptionEndsAt;
  }
  if (profile.subscriptionStatus === 'TRIAL') return profile.trialEndsAt || undefined;
  return undefined;
}

function resolveDaysLeft(dateIso?: string | null): number {
  if (!dateIso) return 0;
  const ms = new Date(dateIso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function isDeepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a).filter(k => a[k] !== undefined);
  const keysB = Object.keys(b).filter(k => b[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!isDeepEqual(a[k], b[k])) return false;
  }
  return true;
}

const withNormalizedCompanyProfile = (
  profile: CompanyProfile,
  workspaceSubscription?: WorkspaceSubscriptionAccount
): CompanyProfile => {
  const createdAt = normalizeIsoDate(profile.createdAt, APP_BOOT_TIMESTAMP);

  // Determine if workspace subscription is active
  const isWorkspaceActive = workspaceSubscription && workspaceSubscription.status === 'ACTIVE';

  let subscriptionStatus = profile.subscriptionStatus;
  let subscriptionPlan = profile.subscriptionPlan;
  let subscriptionEndsAt = profile.subscriptionEndsAt;
  let trialEndsAt = profile.trialEndsAt;

  if (isWorkspaceActive) {
    subscriptionStatus = 'ACTIVE';
    subscriptionPlan = workspaceSubscription.plan || 'BASIC';
    subscriptionEndsAt = workspaceSubscription.expiresAt;
  } else if (workspaceSubscription && (workspaceSubscription.status === 'TRIAL' || workspaceSubscription.status === 'EXPIRED')) {
    subscriptionStatus = workspaceSubscription.status;
    subscriptionPlan = workspaceSubscription.plan;
    trialEndsAt = workspaceSubscription.expiresAt || trialEndsAt;
  }

  const normalizedTrialEndsAt = normalizeIsoDate(
    trialEndsAt,
    addDaysIso(createdAt, 14)
  );

  const resolvedStatus = isWorkspaceActive ? 'ACTIVE' : resolveCompanySubscriptionStatus({
    ...profile,
    createdAt,
    trialEndsAt: normalizedTrialEndsAt,
    subscriptionStatus,
    subscriptionEndsAt
  });

  const resolvedPlan = resolveCompanySubscriptionPlan(
    { ...profile, subscriptionPlan },
    resolvedStatus
  );

  return {
    ...profile,
    createdAt,
    trialEndsAt: normalizedTrialEndsAt,
    subscriptionStatus: resolvedStatus,
    subscriptionPlan: resolvedPlan,
    subscriptionStartsAt: normalizeOptionalIsoDate(profile.subscriptionStartsAt)
      || (resolvedStatus === 'TRIAL' ? createdAt : undefined),
    subscriptionEndsAt: normalizeOptionalIsoDate(subscriptionEndsAt),
    activationCode: String(profile.activationCode || '').trim() || undefined,
    graceDays: normalizeGraceDays(profile.graceDays),
    logoUrl: normalizeBrandLogoUrl(profile.logoUrl, DEFAULT_BRAND_MARK_URL)
  };
};

const sanitizeFifoLayers = (layers: ProductFifoLayer[] | undefined): ProductFifoLayer[] => (
  Array.isArray(layers)
    ? layers
      .map(layer => ({
        qty: Math.max(0, Number(layer?.qty) || 0),
        unitCost: Math.max(0, Number(layer?.unitCost) || 0)
      }))
      .filter(layer => layer.qty > 0)
      .map(layer => ({ qty: roundToFour(layer.qty), unitCost: roundToFour(layer.unitCost) }))
    : []
);

const normalizeProductFifoLayers = (product: Product): ProductFifoLayer[] => {
  const fallbackCost = Math.max(0, Number(product.buyPrice) || 0);
  const targetQty = Math.max(0, Number(product.stock) || 0);
  const normalized = sanitizeFifoLayers(product.fifoLayers);
  const currentQty = normalized.reduce((sum, layer) => sum + layer.qty, 0);

  if (targetQty <= 0) return [];
  if (normalized.length === 0) return [{ qty: roundToFour(targetQty), unitCost: roundToFour(fallbackCost) }];

  const diff = roundToFour(targetQty - currentQty);
  if (Math.abs(diff) <= 0.0001) return normalized;

  if (diff > 0) {
    return [...normalized, { qty: roundToFour(diff), unitCost: roundToFour(fallbackCost) }];
  }

  // Trim extra qty from the tail to align stored layers with physical stock.
  let remainingToTrim = Math.abs(diff);
  const next = normalized.map(layer => ({ ...layer }));
  for (let i = next.length - 1; i >= 0 && remainingToTrim > 0; i -= 1) {
    const layerQty = next[i].qty;
    if (layerQty <= remainingToTrim) {
      remainingToTrim = roundToFour(remainingToTrim - layerQty);
      next.splice(i, 1);
    } else {
      next[i] = { ...next[i], qty: roundToFour(layerQty - remainingToTrim) };
      remainingToTrim = 0;
    }
  }
  return next.filter(layer => layer.qty > 0);
};

const consumeFifoLayers = (
  sourceLayers: ProductFifoLayer[],
  quantity: number,
  fallbackUnitCost: number
): { layers: ProductFifoLayer[]; cost: number } => {
  let remaining = Math.max(0, Number(quantity) || 0);
  let cost = 0;
  const layers = sourceLayers.map(layer => ({ ...layer }));
  while (remaining > 0 && layers.length > 0) {
    const current = layers[0];
    const consumed = Math.min(current.qty, remaining);
    cost += consumed * current.unitCost;
    remaining = roundToFour(remaining - consumed);
    current.qty = roundToFour(current.qty - consumed);
    if (current.qty <= 0.0001) layers.shift();
  }
  if (remaining > 0) {
    cost += remaining * Math.max(0, Number(fallbackUnitCost) || 0);
  }
  return {
    layers: layers.filter(layer => layer.qty > 0.0001).map(layer => ({ qty: roundToFour(layer.qty), unitCost: roundToFour(layer.unitCost) })),
    cost: roundToFour(cost)
  };
};

const consumeLifoLayers = (
  sourceLayers: ProductFifoLayer[],
  quantity: number,
  fallbackUnitCost: number
): { layers: ProductFifoLayer[]; cost: number } => {
  let remaining = Math.max(0, Number(quantity) || 0);
  let cost = 0;
  const layers = sourceLayers.map(layer => ({ ...layer }));
  while (remaining > 0 && layers.length > 0) {
    const lastIndex = layers.length - 1;
    const current = layers[lastIndex];
    const consumed = Math.min(current.qty, remaining);
    cost += consumed * current.unitCost;
    remaining = roundToFour(remaining - consumed);
    current.qty = roundToFour(current.qty - consumed);
    if (current.qty <= 0.0001) layers.pop();
  }
  if (remaining > 0) {
    cost += remaining * Math.max(0, Number(fallbackUnitCost) || 0);
  }
  return {
    layers: layers.filter(layer => layer.qty > 0.0001).map(layer => ({ qty: roundToFour(layer.qty), unitCost: roundToFour(layer.unitCost) })),
    cost: roundToFour(cost)
  };
};

const createRolePermissions = (
  role: UserRole
): Record<PermissionModule, Record<PermissionAction, boolean>> => {
  const modules = {} as Record<PermissionModule, Record<PermissionAction, boolean>>;

  PERMISSION_MODULES.forEach(module => {
    modules[module] = {} as Record<PermissionAction, boolean>;
    PERMISSION_ACTIONS.forEach(action => {
      if (role === 'ADMIN') {
        modules[module][action] = true;
      } else if (role === 'VIEWER') {
        modules[module][action] = action === 'VIEW' || action === 'PRINT';
      } else {
        modules[module][action] = action !== 'DELETE';
      }
    });
  });

  return modules;
};

const createFullPermissions = (): Record<PermissionModule, Record<PermissionAction, boolean>> => {
  const modules = {} as Record<PermissionModule, Record<PermissionAction, boolean>>;

  PERMISSION_MODULES.forEach(module => {
    modules[module] = {} as Record<PermissionAction, boolean>;
    PERMISSION_ACTIONS.forEach(action => {
      modules[module][action] = true;
    });
  });

  return modules;
};

const normalizePermissionMatrix = (value?: PermissionMatrix | null): PermissionMatrix => {
  const modules = createFullPermissions();

  PERMISSION_MODULES.forEach(module => {
    PERMISSION_ACTIONS.forEach(action => {
      const nextValue = value?.modules?.[module]?.[action];
      if (typeof nextValue === 'boolean') {
        modules[module][action] = nextValue;
      }
    });
  });

  const userOverrides: PermissionMatrix['userOverrides'] = {};
  Object.entries(value?.userOverrides || {}).forEach(([userId, moduleOverrides]) => {
    if (!moduleOverrides) return;

    const normalizedModuleOverrides: Partial<Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>> = {};

    PERMISSION_MODULES.forEach(module => {
      const actionOverrides = moduleOverrides[module];
      if (!actionOverrides) return;

      const normalizedActionOverrides: Partial<Record<PermissionAction, boolean>> = {};
      PERMISSION_ACTIONS.forEach(action => {
        if (typeof actionOverrides[action] === 'boolean') {
          normalizedActionOverrides[action] = actionOverrides[action];
        }
      });

      if (Object.keys(normalizedActionOverrides).length > 0) {
        normalizedModuleOverrides[module] = normalizedActionOverrides;
      }
    });

    if (Object.keys(normalizedModuleOverrides).length > 0) {
      userOverrides[userId] = normalizedModuleOverrides;
    }
  });

  return { modules, userOverrides };
};

const hasManualPermissionsConfiguration = (auditLogs?: AuditLogEntry[]): boolean => (
  Array.isArray(auditLogs)
    ? auditLogs.some(entry => entry.entityType === 'permissions' && entry.action === 'UPDATE')
    : false
);

const isAccountantPresetPermissions = (value?: PermissionMatrix | null): boolean => {
  if (!value?.modules) return false;
  const accountantPreset = createRolePermissions('ACCOUNTANT');

  return PERMISSION_MODULES.every(module =>
    PERMISSION_ACTIONS.every(action =>
      value.modules?.[module]?.[action] === accountantPreset[module][action]
    )
  );
};

const resolveWorkspacePermissions = (
  value?: PermissionMatrix | null,
  auditLogs?: AuditLogEntry[]
): PermissionMatrix => {
  if (!value) return normalizePermissionMatrix();

  const hasOverrides = Object.keys(value.userOverrides || {}).length > 0;
  if (!hasOverrides && !hasManualPermissionsConfiguration(auditLogs) && isAccountantPresetPermissions(value)) {
    return normalizePermissionMatrix();
  }

  return normalizePermissionMatrix(value);
};

const safeClone = <T,>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

const normalizeLegacyCashContactId = (id?: string): string | undefined => (
  id === 'cash_supplier' ? 'cash_customer' : id
);

const normalizeContactsList = (source: Contact[]): Contact[] => {
  const cashContactSource = source.find(contact => contact.id === 'cash_customer')
    || source.find(contact => contact.id === 'cash_supplier');
  const seen = new Set<string>();
  const normalized: Contact[] = [];

  const cashCustomer: Contact = {
    ...(cashContactSource || {}),
    id: 'cash_customer',
    name: 'عميل نقدي',
    type: 'CUSTOMER',
    phone: cashContactSource?.phone || '0000000000',
    preferredPriceTier: cashContactSource?.preferredPriceTier || 'RETAIL'
  };

  normalized.push(cashCustomer);
  seen.add('cash_customer');

  source.forEach(contact => {
    const normalizedId = normalizeLegacyCashContactId(contact.id);
    if (!normalizedId || seen.has(normalizedId)) return;
    normalized.push({
      ...contact,
      id: normalizedId
    });
    seen.add(normalizedId);
  });

  return normalized;
};

const normalizeContactIdReferences = <T extends { contactId?: string }>(items: T[]): T[] => (
  items.map(item => {
    const nextContactId = normalizeLegacyCashContactId(item.contactId);
    return nextContactId === item.contactId ? item : { ...item, contactId: nextContactId };
  })
);

const normalizeInvoiceCustomerReferences = (items: Invoice[]): Invoice[] => (
  items.map(item => {
    const nextCustomerId = normalizeLegacyCashContactId(item.customerId);
    return nextCustomerId === item.customerId ? item : { ...item, customerId: nextCustomerId };
  })
);

const normalizeWorkspaceSnapshotCashContact = (snapshot: CompanyWorkspaceSnapshot): CompanyWorkspaceSnapshot => ({
  ...snapshot,
  contacts: normalizeContactsList(snapshot.contacts || []),
  invoices: sanitizeInvoices(normalizeInvoiceCustomerReferences(snapshot.invoices || [])),
  transactions: normalizeContactIdReferences(snapshot.transactions || []),
  invoiceSettlements: normalizeContactIdReferences(snapshot.invoiceSettlements || []),
  checks: normalizeContactIdReferences(snapshot.checks || [])
});

const getMembershipCompanies = (memberships: CompanyMembership[]): CompanyProfile[] => {
  const seen = new Set<string>();
  return memberships.reduce<CompanyProfile[]>((acc, membership) => {
    const company = membership.company;
    if (!company?.id || seen.has(company.id)) return acc;
    seen.add(company.id);
    acc.push(company);
    return acc;
  }, []);
};

const selectCurrentMembership = (
  memberships: CompanyMembership[],
  preferredCompanyId?: string | null
): CompanyMembership | null => {
  const activeMemberships = memberships.filter(membership => membership.status === 'ACTIVE');
  if (!activeMemberships.length) return memberships[0] || null;
  if (preferredCompanyId) {
    const preferred = activeMemberships.find(membership => membership.companyId === preferredCompanyId);
    if (preferred) return preferred;
  }
  return activeMemberships[0] || null;
};

const STORAGE_KEYS = {
  currentUser: 'al_mohaseb_user',
  companies: 'al_mohaseb_companies',
  currentCompany: 'al_mohaseb_current_company',
  workspaceSubscription: 'al_mohaseb_workspace_subscription'
} as const;

const GUEST_USER_ID = 'guest_user';

const generateUniqueAccountCode = async (db: any, email: string): Promise<string> => {
  let code = '';
  let isUnique = false;
  let attempts = 0;
  while (!isUnique && attempts < 10) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const docRef = doc(db, 'account_codes', code);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      isUnique = true;
    }
    attempts++;
  }
  return code;
};

const isGuestUser = (user: User | null | undefined): user is User => (
  Boolean(user && user.id === GUEST_USER_ID)
);

const mapFirebaseAuthUser = (authUser: FirebaseAuthUser, currentCompanyId: string): User => ({
  id: authUser.uid,
  email: authUser.email || '',
  name: authUser.displayName?.trim() || authUser.email?.split('@')[0] || 'User',
  picture: typeof authUser.photoURL === 'string' ? authUser.photoURL : undefined,
  role: 'ADMIN',
  status: 'ACTIVE',
  companyId: currentCompanyId,
  lastActive: new Date().toISOString()
});

const APP_STORAGE_PREFIX = 'al_mohaseb_';
const RESET_ALL_QUERY_PARAM = 'resetAllData';
const RESET_SIGNAL_KEY = 'al_mohaseb_reset_signal';
const FORCE_EMPTY_BOOTSTRAP_KEY = 'al_mohaseb_force_empty_bootstrap';
const SIGNUP_TRIAL_SELECTION_KEY = 'al_mohaseb_signup_trial_selection_days';
const SIGNUP_COMPANY_NAME_KEY = 'al_mohaseb_signup_company_name';
const BACKUP_HISTORY_KEY_PREFIX = 'al_mohaseb_backup_history_';
const WORKSPACE_SYNC_QUEUE_KEY = 'al_mohaseb_workspace_sync_queue_v1';
const LAST_WORKSPACE_SYNC_AT_KEY = 'al_mohaseb_workspace_last_sync_at';
const WORKSPACE_SYNC_COLLECTION = 'workspace_sync_snapshots';
const COMPANY_SUBSCRIPTIONS_COLLECTION = 'company_subscriptions';
const WORKSPACE_SUBSCRIPTIONS_COLLECTION = 'workspace_subscriptions';
const SUBSCRIPTION_CODES_COLLECTION = 'subscription_activation_codes';
const WORKSPACE_OFFER_CODES_COLLECTION = 'workspace_offer_codes';
const SUBSCRIPTION_ADMINS_COLLECTION = 'subscription_admins';
const LOCAL_SUBSCRIPTION_CODES_KEY = 'al_mohaseb_local_subscription_codes_v1';
const LOCAL_WORKSPACE_OFFER_CODES_KEY = 'al_mohaseb_workspace_offer_codes_v1';
const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
].join(' ');
const MIN_BACKUP_PASSWORD_LENGTH = 4;

const getCompanyWorkspaceKey = (companyId: string) => `al_mohaseb_workspace_${companyId}`;
const getBackupHistoryKey = (companyId: string) => `${BACKUP_HISTORY_KEY_PREFIX}${companyId}`;

type WorkspaceSyncQueueItem = {
  companyId: string;
  queuedAt: string;
  workspaceUpdatedAt: string;
  attempts: number;
  ownerUserId?: string;
  lastError?: string;
};

type SubscriptionAdminRoleScope = 'NONE' | 'ADMIN' | 'SUPER_ADMIN';

const isWorkspaceSyncQueueItem = (value: unknown): value is WorkspaceSyncQueueItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WorkspaceSyncQueueItem>;
  return (
    typeof item.companyId === 'string' &&
    item.companyId.length > 0 &&
    typeof item.queuedAt === 'string' &&
    item.queuedAt.length > 0 &&
    typeof item.workspaceUpdatedAt === 'string' &&
    item.workspaceUpdatedAt.length > 0 &&
    typeof item.attempts === 'number' &&
    Number.isFinite(item.attempts) &&
    (typeof item.ownerUserId === 'undefined' || typeof item.ownerUserId === 'string')
  );
};

const readWorkspaceSyncQueue = (): WorkspaceSyncQueueItem[] => {
  return [];
};

const writeWorkspaceSyncQueue = (items: WorkspaceSyncQueueItem[]) => {
  // Disabled offline queueing
};

const upsertWorkspaceSyncQueueItem = (companyId: string, workspaceUpdatedAt: string, ownerUserId?: string) => {
  if (!companyId) return;
  const queue = readWorkspaceSyncQueue();
  const index = queue.findIndex(item => item.companyId === companyId);
  const nowIso = new Date().toISOString();
  const nextItem: WorkspaceSyncQueueItem = {
    companyId,
    queuedAt: index >= 0 ? queue[index].queuedAt : nowIso,
    workspaceUpdatedAt,
    ownerUserId: ownerUserId || undefined,
    attempts: 0
  };
  if (index >= 0) {
    queue[index] = nextItem;
  } else {
    queue.push(nextItem);
  }
  writeWorkspaceSyncQueue(queue);
};

const updateWorkspaceSyncQueueItem = (companyId: string, updates: Partial<WorkspaceSyncQueueItem>) => {
  if (!companyId) return;
  const queue = readWorkspaceSyncQueue();
  const index = queue.findIndex(item => item.companyId === companyId);
  if (index >= 0) {
    queue[index] = {
      ...queue[index],
      ...updates
    };
    writeWorkspaceSyncQueue(queue);
  }
};

const removeWorkspaceSyncQueueItem = (companyId: string) => {
  if (!companyId) return;
  const queue = readWorkspaceSyncQueue();
  const nextQueue = queue.filter(item => item.companyId !== companyId);
  writeWorkspaceSyncQueue(nextQueue);
};

const readLastWorkspaceSyncAt = (): Date | null => {
  return null;
};

const consumePendingSignupTrialSelectionDays = (): number | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(SIGNUP_TRIAL_SELECTION_KEY);
    if (raw === null) return null;
    localStorage.removeItem(SIGNUP_TRIAL_SELECTION_KEY);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(365, Math.floor(parsed)));
  } catch {
    return null;
  }
};

const consumePendingSignupCompanyName = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = String(localStorage.getItem(SIGNUP_COMPANY_NAME_KEY) || '').trim();
    localStorage.removeItem(SIGNUP_COMPANY_NAME_KEY);
    return raw || null;
  } catch {
    return null;
  }
};

const clearAppBrowserStorage = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  const removeMatchingKeys = (storage: Storage) => {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
    keys.forEach((key) => {
      if (key.startsWith(APP_STORAGE_PREFIX)) {
        storage.removeItem(key);
      }
    });
  };

  removeMatchingKeys(window.localStorage);
  removeMatchingKeys(window.sessionStorage);
  await clearWorkspaceSnapshotStorage();

  if ('caches' in window) {
    const cacheKeys = await window.caches.keys();
    await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
  }
};

// addDaysIso moved to top of file

const readBackupHistory = (companyId: string): BackupHistoryEntry[] => {
  return [];
};

const saveBackupHistory = (companyId: string, entries: BackupHistoryEntry[]) => {
  // Disabled backup history localStorage write
};

const appendBackupHistoryEntry = (
  companyId: string,
  entry: BackupHistoryEntry,
  keepCount: number
) => {
  const limit = Math.max(1, Math.min(200, Math.floor(keepCount || 20)));
  const merged = [entry, ...readBackupHistory(companyId).filter(item => item.id !== entry.id)].slice(0, limit);
  saveBackupHistory(companyId, merged);
};

const loadGoogleIdentityScript = (): Promise<void> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity requires browser environment.'));
  }

  if ((window as any).google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity script.'));
    document.head.appendChild(script);
  });
};

type CompanyWorkspaceSnapshot = {
  schemaVersion: 1;
  companyId: string;
  updatedAt: string;
  baseCurrency: string;
  companySettings: CompanySettings;
  users: User[];
  accounts: Account[];
  transactions: Transaction[];
  invoices: Invoice[];
  invoiceSettlements: InvoiceSettlement[];
  importExpenseDistributions: ImportExpenseDistribution[];
  products: Product[];
  itemGroups: ItemGroup[];
  units: UnitOfMeasure[];
  contacts: Contact[];
  employees: Employee[];
  employeeContracts: EmployeeContract[];
  salaryHistory: SalaryHistoryEntry[];
  employeeLeaveRequests: EmployeeLeaveRequest[];
  employeeRecurringDeductions: EmployeeRecurringDeduction[];
  fingerprintDevices: FingerprintReaderDevice[];
  fingerprintAttendanceBatches: FingerprintAttendanceBatch[];
  departments: Department[];
  tickets: SupportTicket[];
  fixedAssets: FixedAsset[];
  assetGroups: FixedAssetGroup[];
  checks: Check[];
  currencies: Currency[];
  warehouses: Warehouse[];
  stockTransfers: StockTransfer[];
  boms: BillOfMaterial[];
  productionOrders: ProductionOrder[];
  permissions: PermissionMatrix;
  auditLogs: AuditLogEntry[];
};

type WorkspaceSnapshotReadResult = {
  snapshot: CompanyWorkspaceSnapshot | null;
  source: 'idb' | 'legacy' | 'remote' | 'none';
  needsRewrite: boolean;
};

const withTimeout = <T extends unknown>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
};

// Factory function for initialAccounts - created ONCE at module level to prevent memory exhaustion
// Moving this outside the component prevents recreation on every render (was causing OOM crashes)
const createInitialAccounts = (baseCurrency: string): Account[] => [
  // 1 - ASSETS
  { id: 'acc_assets', code: '1', name: 'الأصول', type: 'ASSET', balance: 0, isGroup: true, currency: baseCurrency },
  { id: 'acc_current_assets', code: '11', name: 'الأصول المتداولة', type: 'ASSET', balance: 0, parentId: 'acc_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_cash_root', code: '111', name: 'نقدية بالصناديق (الخزائن)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_cash', code: '11101', name: 'الصندوق الرئيسي', type: 'ASSET', balance: 0, parentId: 'acc_cash_root', currency: baseCurrency },
  { id: 'acc_bank_root', code: '112', name: 'نقدية بالبنوك (حسابات جارية)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_receivable_group', code: '113', name: 'الذمم المدينة (العملاء)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_receivable', code: '11301', name: 'ذمم العملاء التجارية', type: 'ASSET', balance: 0, parentId: 'acc_receivable_group', currency: baseCurrency },
  { id: 'acc_notes_receivable', code: '114', name: 'أوراق القبض (شيكات واردة)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_cheques_hand', code: '11401', name: 'شيكات بالصندوق', type: 'ASSET', balance: 0, parentId: 'acc_notes_receivable', currency: baseCurrency },
  { id: 'acc_cheques_under_collection', code: '11402', name: 'شيكات تحت التحصيل', type: 'ASSET', balance: 0, parentId: 'acc_notes_receivable', currency: baseCurrency },
  { id: 'acc_inventory_group', code: '115', name: 'المخزون', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_inventory', code: '11501', name: 'مخزون البضائع', type: 'ASSET', balance: 0, parentId: 'acc_inventory_group', currency: baseCurrency },
  { id: 'acc_vat_input', code: '116', name: 'ضريبة المدخلات القابلة للاسترداد', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', currency: baseCurrency },
  { id: 'acc_employee_advances', code: '117', name: 'سلف الموظفين', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', currency: baseCurrency },
  { id: 'acc_fixed_assets_root', code: '12', name: 'الأصول الثابتة', type: 'ASSET', balance: 0, parentId: 'acc_assets', isGroup: true, currency: baseCurrency },
  { id: 'acc_furniture', code: '121', name: 'أثاث ومفروشات', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
  { id: 'acc_equipment', code: '122', name: 'أجهزة ومعدات إلكترونية', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
  { id: 'acc_buildings', code: '123', name: 'مباني ومنشآت', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
  { id: 'acc_machinery', code: '124', name: 'آلات ومعدات', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
  { id: 'acc_vehicles', code: '125', name: 'سيارات ووسائل نقل', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },
  { id: 'acc_accumulated_depreciation', code: '129', name: 'مجمع إهلاك الأصول', type: 'ASSET', balance: 0, parentId: 'acc_fixed_assets_root', currency: baseCurrency },

  // 2 - LIABILITIES
  { id: 'acc_liabilities', code: '2', name: 'الخصوم (الالتزامات)', type: 'LIABILITY', balance: 0, isGroup: true, currency: baseCurrency },
  { id: 'acc_current_liabilities', code: '21', name: 'الالتزامات المتداولة', type: 'LIABILITY', balance: 0, parentId: 'acc_liabilities', isGroup: true, currency: baseCurrency },
  { id: 'acc_long_term_liabilities', code: '22', name: 'الالتزامات طويلة الأجل', type: 'LIABILITY', balance: 0, parentId: 'acc_liabilities', isGroup: true, currency: baseCurrency },
  { id: 'acc_payable_group', code: '211', name: 'الذمم الدائنة (الموردون)', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', isGroup: true, currency: baseCurrency },
  { id: 'acc_payable', code: '21101', name: 'ذمم الموردين التجارية', type: 'LIABILITY', balance: 0, parentId: 'acc_payable_group', currency: baseCurrency },
  { id: 'acc_notes_payable', code: '212', name: 'أوراق الدفع (شيكات صادرة)', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
  { id: 'acc_accrued_salaries', code: '213', name: 'ذمم موظفين', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
  { id: 'acc_payroll_deductions_payable', code: '214', name: 'استقطاعات ومستحقات الرواتب', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
  { id: 'acc_vat_output', code: '221', name: 'ضريبة المخرجات', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
  { id: 'acc_vat_payable', code: '222', name: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },

  // 3 - EQUITY
  { id: 'acc_equity_root', code: '3', name: 'حقوق الملكية', type: 'EQUITY', balance: 0, isGroup: true, currency: baseCurrency },
  { id: 'acc_capital', code: '31', name: 'رأس المال المدفوع', type: 'EQUITY', balance: 0, parentId: 'acc_equity_root', currency: baseCurrency },
  { id: 'acc_retained_earnings', code: '32', name: 'الأرباح غير الموزعة', type: 'EQUITY', balance: 0, parentId: 'acc_equity_root', currency: baseCurrency },
  { id: 'acc_partners_accounts_group', code: '33', name: 'حسابات الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_equity_root', isGroup: true, currency: baseCurrency },
  { id: 'acc_partners_capital', code: '331', name: 'رأس مال الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_partners_accounts_group', isGroup: true, currency: baseCurrency },
  { id: 'acc_partner_current', code: '332', name: 'جاري الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_partners_accounts_group', isGroup: true, currency: baseCurrency },
  { id: 'acc_partner_drawings', code: '333', name: 'مسحوبات الشركاء', type: 'EQUITY', balance: 0, parentId: 'acc_partners_accounts_group', isGroup: true, currency: baseCurrency },

  // 4 - REVENUE
  { id: 'acc_revenue_root', code: '4', name: 'الإيرادات', type: 'REVENUE', balance: 0, isGroup: true, currency: baseCurrency },
  { id: 'acc_sales', code: '41', name: 'إيرادات المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
  { id: 'acc_sales_returns', code: '43', name: 'مرتجع المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
  { id: 'acc_sales_discounts', code: '44', name: 'خصومات المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
  { id: 'acc_gain_asset_disposal', code: '45', name: 'أرباح بيع الأصول', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
  { id: 'acc_service_income', code: '42', name: 'إيرادات الخدمات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },

  // 5 - EXPENSES
  { id: 'acc_expense_root', code: '5', name: 'المصروفات', type: 'EXPENSE', balance: 0, isGroup: true, currency: baseCurrency },
  { id: 'acc_cogs', code: '51', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_purchases', code: '511', name: 'المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_purchase_returns', code: '512', name: 'مردودات المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_admin_exp', code: '52', name: 'مصاريف إدارية وعمومية', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', isGroup: true, currency: baseCurrency },
  { id: 'acc_exp_salaries', code: '521', name: 'الرواتب والأجور المباشرة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
  { id: 'acc_exp_rent', code: '522', name: 'إيجار المكاتب والفروع', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
  { id: 'acc_exp_utilities', code: '523', name: 'خدمات (كهرباء ومياه)', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', isGroup: true, currency: baseCurrency },
  { id: 'acc_exp_electricity', code: '5231', name: 'مصاريف كهرباء', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency },
  { id: 'acc_exp_water', code: '5232', name: 'مصاريف مياه', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency },
  { id: 'acc_exp_marketing', code: '524', name: 'مصاريف تسويق وإعلان', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
  { id: 'acc_exp_maintenance', code: '525', name: 'مصاريف صيانة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
  { id: 'acc_bank_fees', code: '53', name: 'مصاريف وعمولات بنكية', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_depreciation_exp', code: '54', name: 'مصروف الإهلاك', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_exchange_diff', code: '55', name: 'فروقات أسعار العملات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_loss_asset_disposal', code: '56', name: 'خسائر بيع الأصول', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_inventory_adjustments', code: '57', name: 'تسويات وفروقات المخزون', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', isGroup: true, currency: baseCurrency },
  { id: 'acc_inventory_variance', code: '571', name: 'فروقات المخزون', type: 'EXPENSE', balance: 0, parentId: 'acc_inventory_adjustments', currency: baseCurrency },
  { id: 'acc_damaged_goods', code: '572', name: 'بضاعة تالفة', type: 'EXPENSE', balance: 0, parentId: 'acc_inventory_adjustments', currency: baseCurrency },
  // Manufacturing Accounts
  { id: 'acc_direct_labor', code: '513', name: 'أجور عمالة مباشرة (صناعية)', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_manufacturing_overhead', code: '514', name: 'ت. صناعية غير مباشرة (محملة)', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  { id: 'acc_purchase_discounts_earned', code: '515', name: 'خصومات مشتريات مكتسبة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
];

export const AccountingProvider = ({ children }: { children?: ReactNode }) => {
  // ALWAYS use backend mode - Odoo-style online-only architecture
  // No localStorage fallback to prevent Out of Memory crashes
  const useBackend = true;
  const isFirebaseAuthEnabled = true;

  const [forceEmptyBootstrap] = useState<boolean>(() => {
    try {
      const shouldForce = localStorage.getItem(FORCE_EMPTY_BOOTSTRAP_KEY) === '1';
      if (shouldForce) {
        localStorage.removeItem(FORCE_EMPTY_BOOTSTRAP_KEY);
      }
      return shouldForce;
    } catch {
      return false;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [isAuthInitialized, setIsAuthInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageResetSignal = (event: StorageEvent) => {
      if (event.key !== RESET_SIGNAL_KEY) return;
      window.location.reload();
    };

    window.addEventListener('storage', handleStorageResetSignal);
    return () => window.removeEventListener('storage', handleStorageResetSignal);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (url.searchParams.get(RESET_ALL_QUERY_PARAM) !== '1') return;

    let cancelled = false;

    const resetAllStoredData = async () => {
      try {
        window.localStorage.setItem(RESET_SIGNAL_KEY, new Date().toISOString());
      } catch {
        // Ignore storage notification failures and continue with the reset.
      }

      try {
        if (isFirebaseAuthEnabled && firebaseAuth) {
          await firebaseSignOut(firebaseAuth);
        }
      } catch {
        // Ignore auth sign-out failures; storage cleanup below is the important part.
      }

      await clearAppBrowserStorage();
      try {
        window.localStorage.setItem(FORCE_EMPTY_BOOTSTRAP_KEY, '1');
      } catch {
        // Ignore storage write failures and continue with navigation.
      }

      if (cancelled) return;
      window.location.replace(`${url.pathname}${url.hash}`);
    };

    void resetAllStoredData();

    return () => {
      cancelled = true;
    };
  }, []);

  const [baseCurrency, setBaseCurrencyState] = useState('ILS');

  // Use useMemo to create initialAccounts only when baseCurrency changes (prevents recreation on every render)
  // This was the PRIMARY cause of Out of Memory crashes - 77 objects × 100 re-renders = 1.5 MB wasted
  const initialAccounts = useMemo(() => createInitialAccounts(baseCurrency), [baseCurrency]);

  const initialProducts: Product[] = [];;

  const initialContacts: Contact[] = [];;

  const initialEmployees: Employee[] = [];;

  const initialAssetGroups: FixedAssetGroup[] = [];;

  const defaultAssetGroupAccountMap: Record<string, string> = {
    ag_buildings: 'acc_buildings',
    ag_machinery: 'acc_machinery',
    ag_furniture: 'acc_furniture',
    ag_vehicles: 'acc_vehicles',
    ag_computers: 'acc_equipment'
  };

  const initialUnits: UnitOfMeasure[] = [
    { id: 'u_pc', name: 'قطعة', code: 'PCS' },
    { id: 'u_box', name: 'علبة', code: 'BOX' },
    { id: 'u_ctn', name: 'كرتون', code: 'CTN' },
    { id: 'u_kg', name: 'كيلو', code: 'KG' },
    { id: 'u_m', name: 'متر', code: 'M' },
    { id: 'u_cup', name: 'كوب', code: 'CUP' }
  ];

  const seededProducts: Product[] = [];

  const seededContacts: Contact[] = [];;

  const initialInvoices: Invoice[] = [];;

  const initialTransactions: Transaction[] = [];;

  const initialTickets: SupportTicket[] = [];;

  const initialFixedAssets: FixedAsset[] = [];;

  const initialChecks: Check[] = [];;

  const initialUsers: User[] = [];;

  const initialWarehouses: Warehouse[] = [
    { id: 'wh_main', name: 'المستودع الرئيسي', isMain: true, location: 'المقر الرئيسي' },
  ];

  const initialStockTransfers: StockTransfer[] = [];

  const initialBoms: BillOfMaterial[] = [];;

  const initialProductionOrders: ProductionOrder[] = [];;

  const defaultItemGroups: ItemGroup[] = [
    { id: 'ig_electronics', name: 'إلكترونيات', icon: '📱' },
    { id: 'ig_furniture', name: 'أثاث مكتبي', icon: '🪑' },
    { id: 'ig_other', name: 'أخرى', icon: '📦' }
  ];

  const defaultDepartments: Department[] = [
    { id: 'dept_admin', name: 'الإدارة والمالية' },
    { id: 'dept_sales', name: 'المبيعات' },
    { id: 'dept_prod', name: 'المستودعات' }
  ];

  const defaultCurrencies: Currency[] = [
    { code: 'ILS', name: 'شيكل إسرائيلي', symbol: '₪', rate: 1 },
    { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', rate: 1.05 },
    { code: 'USD', name: 'دولار أمريكي', symbol: '$', rate: 3.75 },
    { code: 'EUR', name: 'يورو', symbol: '€', rate: 4.05 }
  ];

  const defaultCompanySettings: CompanySettings = useMemo(() => ({
    name: 'Flex Accountant',
    taxNumber: '',
    address: '',
    phone: '',
    logoUrl: DEFAULT_BRAND_MARK_URL,
    importantAccountIds: [],
    annualLeaveDefaultOpenEndedDays: 21,
    annualLeaveDefaultFixedTermDays: 14,
    leaveAccrualPolicy: 'ANNUAL',
    monthlyLeaveAccrualDays: 1.75,
    lowStockAlertQtyDefault: 5,
    defaultTaxRate: 15,
    showTaxInInvoices: true,
    hidePurchaseTax: false,
    hideSalesTax: false,
    biometricLoginEnabled: false,
    notifyAfterAmountAdded: true,
    alertsDesktopNotificationsEnabled: false,
    alertsDesktopNotifySystem: true,
    alertsDesktopNotifyManual: true,
    alertsDesktopNotifyChecks: true,
    alertsDesktopNotifyLowStock: true,
    alertsDesktopNotifyExpiry: true,
    alertsDesktopNotifyOverdueInvoices: true,
    alertsDesktopNotifyContractExpiry: true,
    alertsSoundEnabled: true,
    allowNegativeSalesQuantity: false,
    allowNegativeStock: false,
    allowEditEntryDate: true,
    journalDateLockEnabled: false,
    journalDateLockFrom: '',
    journalDateLockTo: '',
    inventoryValuationMethod: 'STANDARD',
    useAverageCosting: false,
    voucherInvoiceAllocationEnabled: true,
    autoAddItemPriceInInvoice: true,
    updateSalesPriceOnInvoiceEntry: false,
    barcodeEnabled: true,
    invoiceExpiryDateEnabled: false,
    reportYearCloseEnabled: true,
    strictPostedLockEnabled: true,
    showFiscalCloseBadgeInReports: true,
    autoFiscalYearCloseEntries: true,
    autoFiscalYearOpeningEntries: true,
    printPersonalData: true,
    printElectronicInvoice: true,
    printItemBarcodeInInvoice: false,
    printStatementAllCurrencies: false,
    statementDateAscending: true,
    statementFooterNote: '',
    invoiceFooterNote: '',
    headerTopLines: 0,
    debitLabel: 'مدين',
    creditLabel: 'دائن',
    showAccountBalanceUnderVoucher: false,
    dottedNumbers: false,
    hideVoucherColumnInStatement: false,
    printExpiryDate: false,
    autoBackupEnabled: false,
    autoBackupFrequency: 'DAILY',
    autoBackupPassword: '',
    autoBackupKeepCount: 30,
    autoBackupLastRunAt: '',
    googleDriveAutoUpload: false,
    googleDriveClientId: '',
    googleDriveFolderId: '',
    darkModeEnabled: false,
    language: detectPreferredAppLanguage()
  }), []);

  const [currentCompanyId, setCurrentCompanyId] = useState<string>('');
  const [workspaceSubscription, setWorkspaceSubscription] = useState<WorkspaceSubscriptionAccount>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.workspaceSubscription);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }
    return buildDefaultWorkspaceSubscription();
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.workspaceSubscription, JSON.stringify(workspaceSubscription));
    } catch (e) {
      console.error(e);
    }
  }, [workspaceSubscription]);

  const [transactions, setTransactions] = useFirestoreSyncState<Transaction>('transactions', initialTransactions, currentCompanyId, currentUser?.id || null);
  const [invoices, setInvoices] = useFirestoreSyncState<Invoice>('invoices', initialInvoices, currentCompanyId, currentUser?.id || null);
  const [importExpenseDistributions, setImportExpenseDistributions] = useFirestoreSyncState<ImportExpenseDistribution>('importExpenseDistributions', [], currentCompanyId, currentUser?.id || null);
  const [invoiceSettlements, setInvoiceSettlements] = useFirestoreSyncState<InvoiceSettlement>('invoiceSettlements', [], currentCompanyId, currentUser?.id || null);
  const [accounts, setAccounts] = useFirestoreSyncState<Account>('accounts', initialAccounts, currentCompanyId, currentUser?.id || null);
  const [products, setProducts] = useFirestoreSyncState<Product>('products', seededProducts, currentCompanyId, currentUser?.id || null);
  const [itemGroups, setItemGroups] = useFirestoreSyncState<ItemGroup>('itemGroups', defaultItemGroups, currentCompanyId, currentUser?.id || null);
  const [units, setUnits] = useFirestoreSyncState<UnitOfMeasure>('units', initialUnits, currentCompanyId, currentUser?.id || null);
  const [contacts, setContacts] = useFirestoreSyncState<Contact>('contacts', seededContacts, currentCompanyId, currentUser?.id || null);

  const [employees, setEmployees] = useFirestoreSyncState<Employee>('employees', initialEmployees, currentCompanyId, currentUser?.id || null);
  const [employeeContracts, setEmployeeContracts] = useFirestoreSyncState<EmployeeContract>('employeeContracts', [], currentCompanyId, currentUser?.id || null);
  const [salaryHistory, setSalaryHistory] = useFirestoreSyncState<SalaryHistoryEntry>('salaryHistory', [], currentCompanyId, currentUser?.id || null);
  const [employeeLeaveRequests, setEmployeeLeaveRequests] = useFirestoreSyncState<EmployeeLeaveRequest>('employeeLeaveRequests', [], currentCompanyId, currentUser?.id || null);
  const [employeeRecurringDeductions, setEmployeeRecurringDeductions] = useFirestoreSyncState<EmployeeRecurringDeduction>('employeeRecurringDeductions', [], currentCompanyId, currentUser?.id || null);
  const [fingerprintDevices, setFingerprintDevices] = useState<FingerprintReaderDevice[]>([]);
  const [fingerprintAttendanceBatches, setFingerprintAttendanceBatches] = useState<FingerprintAttendanceBatch[]>([]);
  const [departments, setDepartments] = useFirestoreSyncState<Department>('departments', defaultDepartments, currentCompanyId, currentUser?.id || null);

  const [tickets, setTickets] = useFirestoreSyncState<SupportTicket>('tickets', initialTickets, currentCompanyId, currentUser?.id || null);
  const [assetGroups, setAssetGroups] = useFirestoreSyncState<FixedAssetGroup>('assetGroups', initialAssetGroups, currentCompanyId, currentUser?.id || null);
  const [fixedAssets, setFixedAssets] = useFirestoreSyncState<FixedAsset>('fixedAssets', initialFixedAssets, currentCompanyId, currentUser?.id || null);
  const [checks, setChecks] = useFirestoreSyncState<Check>('checks', initialChecks, currentCompanyId, currentUser?.id || null);
  const [currencies, setCurrencies] = useFirestoreSyncState<Currency>('currencies', defaultCurrencies, currentCompanyId, currentUser?.id || null);
  const [users, setUsers] = useFirestoreSyncState<User>('users', initialUsers, currentCompanyId, currentUser?.id || null);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(withNormalizedValuationSettings(defaultCompanySettings));
  const [companies, setCompanies] = useState<CompanyProfile[]>(() => {
    if (currentUser && isGuestUser(currentUser)) {
      const nowIso = new Date().toISOString();
      return [{
        id: 'cmp_default',
        name: defaultCompanySettings.name,
        taxNumber: defaultCompanySettings.taxNumber,
        address: defaultCompanySettings.address,
        phone: defaultCompanySettings.phone,
        logoUrl: defaultCompanySettings.logoUrl,
        createdAt: nowIso,
        trialEndsAt: addDaysIso(nowIso, 14),
        subscriptionStatus: 'TRIAL',
        subscriptionPlan: 'TRIAL',
        subscriptionStartsAt: nowIso,
        graceDays: 0
      }];
    }
    return [];
  });

  const companiesRef = useRef<CompanyProfile[]>(companies);
  companiesRef.current = companies;
  
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  useEffect(() => {
    if (currentUser && isGuestUser(currentUser)) {
      const nowIso = new Date().toISOString();
      const guestCompany = {
        id: 'cmp_default',
        name: defaultCompanySettings.name,
        taxNumber: defaultCompanySettings.taxNumber,
        address: defaultCompanySettings.address,
        phone: defaultCompanySettings.phone,
        logoUrl: defaultCompanySettings.logoUrl,
        createdAt: nowIso,
        trialEndsAt: addDaysIso(nowIso, 14),
        subscriptionStatus: 'TRIAL' as const,
        subscriptionPlan: 'TRIAL' as const,
        subscriptionStartsAt: nowIso,
        graceDays: 0
      };
      setCompanies(prev => {
        if (prev.some(c => c.id === 'cmp_default')) return prev;
        return [guestCompany];
      });
      setCurrentCompanyId(prev => prev || 'cmp_default');
    }
  }, [currentUser, defaultCompanySettings]);

  useEffect(() => {
    if (isFirebaseAuthEnabled && firebaseAuth && (!currentUser || !isGuestUser(currentUser))) {
      if (!isAuthInitialized) return;
      if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== currentUser?.id) {
        // Wait until auth state is synchronized with currentUser state to avoid permission race conditions
        return;
      }
    }

    if (!currentUser || isGuestUser(currentUser)) {
      setCompaniesLoaded(true);
      return;
    }

    const useBackend = import.meta.env.VITE_USE_CUSTOM_BACKEND === 'true' && isFirebaseAuthEnabled;
    let isSubscribed = true;

    if (useBackend) {
      const loadCompaniesFromBackend = async () => {
        try {
          console.log('[Backend Sync] Fetching companies for user:', currentUser.id);
          const fetchedCompanies = await callBackendApi(currentUser, '/companies');
          if (!isSubscribed) return;

          setCompanies(prev => {
            if (!isDeepEqual(prev, fetchedCompanies)) {
              return fetchedCompanies;
            }
            return prev;
          });

          if (fetchedCompanies.length > 0) {
            const persistedCompanyId = localStorage.getItem(STORAGE_KEYS.currentCompany);
            const exists = fetchedCompanies.some((c: any) => c.id === persistedCompanyId);
            const targetCompanyId = exists ? persistedCompanyId : fetchedCompanies[0].id;
            setCurrentCompanyId(targetCompanyId);
            if (!exists) {
              try {
                localStorage.setItem(STORAGE_KEYS.currentCompany, targetCompanyId);
              } catch {}
            }
          }
          companiesLoadedForUserIdRef.current = currentUser.id;
          setCompaniesLoaded(true);
        } catch (err: any) {
          console.error('[Backend Sync] Failed to fetch companies, falling back to Firestore:', err);
          if (isSubscribed) {
            setupFirestoreCompaniesListener();
          }
        }
      };

      void loadCompaniesFromBackend();
    } else {
      setupFirestoreCompaniesListener();
    }

    let unsubscribeFirestore: (() => void) | null = null;

    function setupFirestoreCompaniesListener() {
      if (!firebaseDb) {
        setCompaniesLoaded(true);
        return;
      }
      const userDocRef = doc(firebaseDb, 'users', currentUser.id);
      unsubscribeFirestore = onSnapshot(userDocRef, async (snapshot) => {
        if (!isSubscribed) return;
        let data = snapshot.exists() ? snapshot.data() : null;
        let finalCompanies: CompanyProfile[] = [];
        let needsCloudUpdate = false;

        const rawCompanies = data && data.companies && Array.isArray(data.companies) ? data.companies : [];
        const filteredCompanies = rawCompanies.filter((c: any) => c && c.id !== 'cmp_default');

        if (filteredCompanies.length > 0) {
          finalCompanies = filteredCompanies.map(c => withNormalizedCompanyProfile(c, workspaceSubscriptionRef.current));
        } else {
          // Completely new user! Create their real cloud company immediately
          const newCompanyId = `cmp_${currentUser.id}`;
          let signupName = 'My Company';
          try {
             const storedName = localStorage.getItem('al_mohaseb_signup_company_name');
             if (storedName && storedName.trim()) {
               signupName = storedName.trim();
             }
          } catch {}

          const nowIso = new Date().toISOString();
          finalCompanies = [{
            id: newCompanyId,
            name: signupName,
            taxNumber: defaultCompanySettings.taxNumber,
            address: defaultCompanySettings.address,
            phone: defaultCompanySettings.phone,
            logoUrl: defaultCompanySettings.logoUrl,
            createdAt: nowIso,
            trialEndsAt: addDaysIso(nowIso, 14),
            subscriptionStatus: 'TRIAL',
            subscriptionPlan: 'TRIAL',
            subscriptionStartsAt: nowIso,
            graceDays: 0
          }];
          needsCloudUpdate = true;
          setCurrentCompanyId(newCompanyId);
          try {
            localStorage.setItem(STORAGE_KEYS.currentCompany, newCompanyId);
          } catch {}
        }

        // Prevent unnecessary state updates that can cause re-renders
        const needsUpdate = !isDeepEqual(companiesRef.current, finalCompanies);
        if (needsUpdate) {
          setCompanies(finalCompanies);
        }

        // Only update companiesLoaded if it hasn't been set for this user yet
        if (companiesLoadedForUserIdRef.current !== currentUser.id) {
          companiesLoadedForUserIdRef.current = currentUser.id;
          setCompaniesLoaded(true);
        }

        if (needsCloudUpdate) {
          if (!bootstrappedUsersRef.current.has(currentUser.id)) {
            bootstrappedUsersRef.current.add(currentUser.id);
            try {
              const cleanCompanies = JSON.parse(JSON.stringify(finalCompanies));
              const docData: any = { companies: cleanCompanies };
              await setDoc(userDocRef, docData, { merge: true });
            } catch (err: any) {
              console.error("Failed to seed new user companies:", err);
              if (typeof window !== 'undefined') {
                alert(`خطأ في المزامنة السحابية (الشركات): ${err.message || 'حدث خطأ غير معروف'}`);
              }
            }
          }
        }
      }, (error) => {
        console.error('[Firestore userDoc onSnapshot Error]', error);
        if (isSubscribed) {
          setCompaniesLoaded(true); // Prevent UI loading freeze
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`مشكلة في تحميل بيانات الحساب من السحابة. تأكد من اتصال الإنترنت أو إيقاف الـ VPN. التفاصيل: ${error.message}`);
          }
        }
      });
    }

    return () => {
      isSubscribed = false;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  // CRITICAL: Don't include workspaceSubscription in deps to prevent infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, firebaseDb, isAuthInitialized]);

  // Dedicated listener to sync/generate currentUser accountCode and password in Firestore
  useEffect(() => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser)) return;

    let isSubscribed = true;
    const userDocRef = doc(firebaseDb, 'users', currentUser.id);

    const unsubscribe = onSnapshot(userDocRef, async (snapshot) => {
      if (!isSubscribed) return;
      let data = snapshot.exists() ? snapshot.data() : null;

      const email = currentUser.email || '';
      const isCode = isCodeEmail(email);
      let accountCode = (data && data.accountCode) || '';
      let needsCloudUpdate = false;

      if (isCode) {
        accountCode = extractCodeFromEmail(email);
      }

      if (!accountCode && email) {
        try {
          const generatedCode = await generateUniqueAccountCode(firebaseDb, email);
          if (generatedCode) {
            const codeDocRef = doc(firebaseDb, 'account_codes', generatedCode);
            await setDoc(codeDocRef, {
              email,
              userId: currentUser.id,
              createdAt: new Date().toISOString()
            });
            needsCloudUpdate = true;
            data = { ...data, accountCode: generatedCode };
            accountCode = generatedCode;
          }
        } catch (err) {
          console.error('[Account Code Generation Error]', err);
        }
      } else if (accountCode && data && !data.accountCode) {
        needsCloudUpdate = true;
        data = { ...data, accountCode };
      }

      const password = (data && data.password) || '';

      setCurrentUser(prev => {
        if (prev) {
          let changed = false;
          const next = { ...prev };
          if (next.accountCode !== accountCode) {
            next.accountCode = accountCode;
            changed = true;
          }
          if (next.password !== password) {
            next.password = password;
            changed = true;
          }
          if (changed) {
            return next;
          }
        }
        return prev;
      });

      if (needsCloudUpdate) {
        try {
          await setDoc(userDocRef, { accountCode }, { merge: true });
        } catch (err) {
          console.error("Failed to update user account code in Firestore:", err);
        }
      }
    }, (error) => {
      console.error('[Firestore userDoc sync onSnapshot Error]', error);
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [currentUser?.id, firebaseDb]);

  useEffect(() => {
    if (!companiesLoaded || !firebaseDb || !currentUser || isGuestUser(currentUser)) return;
    if ((window as any).__IS_HYDRATING__) return;
    if (companiesLoadedForUserIdRef.current !== currentUser.id) {
      console.warn('[Sync] Skipping companies write to Firestore: companies state not loaded for current user yet.');
      return;
    }

    const filtered = companies.filter(c => c && c.id !== 'cmp_default');
    const cleanCompanies = JSON.parse(JSON.stringify(filtered));

    // Prevent echoing exactly what we received from Firestore
    if (isDeepEqual(companiesRef.current, filtered)) {
      return;
    }

    setDoc(doc(firebaseDb, 'users', currentUser.id), { companies: cleanCompanies }, { merge: true }).catch(console.error);
  }, [companies, companiesLoaded, currentUser]);
  const [cloudMemberships, setCloudMemberships] = useState<CompanyMembership[]>([]);
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => normalizePermissionMatrix());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const deviceBindingId = useMemo(() => getOrCreateSubscriptionDeviceId(), []);
  const [cloudSubscription, setCloudSubscription] = useState<CloudCompanySubscription | null>(null);
  const [subscriptionCloudBusy, setSubscriptionCloudBusy] = useState(false);
  const [subscriptionCloudError, setSubscriptionCloudError] = useState('');
  const [subscriptionAdminEnabled, setSubscriptionAdminEnabled] = useState(false);
  const [subscriptionAdminScope, setSubscriptionAdminScope] = useState<SubscriptionAdminScope>('NONE');
  const [subscriptionAdminRole, setSubscriptionAdminRole] = useState<SubscriptionAdminRoleScope>('NONE');
  const [subscriptionCodes, setSubscriptionCodes] = useState<CloudSubscriptionCode[]>([]);
  const [subscriptionCodesLoading, setSubscriptionCodesLoading] = useState(false);
  const [workspaceOfferCodes, setWorkspaceOfferCodes] = useState<WorkspaceOfferCode[]>([]);
  const [workspaceOfferCodesLoading, setWorkspaceOfferCodesLoading] = useState(false);
  const [subscriptionCompanies, setSubscriptionCompanies] = useState<CloudCompanySubscription[]>([]);
  const [subscriptionCompaniesLoading, setSubscriptionCompaniesLoading] = useState(false);
  const currentCompany = useMemo(
    () => companies.find(c => c.id === currentCompanyId) || null,
    [companies, currentCompanyId]
  );
  const companyAccessStatus = useMemo<CompanySubscriptionStatus>(
    () => currentCompany?.subscriptionStatus || 'TRIAL',
    [currentCompany]
  );
  const companyAccessEndsAt = useMemo(
    () => (currentCompany ? resolveCompanyAccessEndsAt(currentCompany) : undefined),
    [currentCompany]
  );
  const companyAccessDaysLeft = useMemo(
    () => resolveDaysLeft(companyAccessEndsAt),
    [companyAccessEndsAt]
  );
  const localSubscriptionAdminEnabled = useMemo(
    () => Boolean(
      currentUser
      && !isGuestUser(currentUser)
      && currentUser.role === 'ADMIN'
      && isLocalSubscriptionAdminEnabled()
    ),
    [currentUser]
  );
  const replaceLocalSubscriptionCodes = useCallback((codes: CloudSubscriptionCode[]): CloudSubscriptionCode[] => {
    const nextCodes = sortSubscriptionCodesByCreatedAt(codes);
    persistLocalSubscriptionCodes(nextCodes);
    setSubscriptionCodes(nextCodes);
    return nextCodes;
  }, []);
  const replaceLocalWorkspaceOfferCodes = useCallback((codes: WorkspaceOfferCode[]): WorkspaceOfferCode[] => {
    const nextCodes = sortWorkspaceOfferCodesByCreatedAt(codes);
    persistLocalWorkspaceOfferCodes(nextCodes);
    setWorkspaceOfferCodes(nextCodes);
    return nextCodes;
  }, []);
  const ensureProgramOwnerAdminDocument = useCallback(async (): Promise<void> => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser) || !isProgramOwnerEmail(currentUser.email)) return;
    const adminRef = doc(firebaseDb, SUBSCRIPTION_ADMINS_COLLECTION, currentUser.id);
    await setDoc(adminRef, {
      userId: currentUser.id,
      email: currentUser.email || '',
      active: true,
      role: 'SUPER_ADMIN',
      createdAt: new Date().toISOString()
    }, { merge: true });
  }, [currentUser?.id, currentUser?.email, firebaseDb]);
  const programOwnerEnabled = useMemo(
    () => Boolean(
      currentUser
      && !isGuestUser(currentUser)
      && (
        subscriptionAdminRole === 'SUPER_ADMIN'
        || isProgramOwnerEmail(currentUser.email)
      )
    ),
    [currentUser, subscriptionAdminRole]
  );
  const [workspaceHydratedForCompanyId, setWorkspaceHydratedForCompanyId] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => readLastWorkspaceSyncAt());
  const [syncQueueVersion, setSyncQueueVersion] = useState<number>(0);
  const autoFiscalPostingInFlightRef = useRef(false);
  const autoBackupInFlightRef = useRef(false);
  const companyCreateInFlightRef = useRef(false);
  const companyDeleteInFlightRef = useRef<Set<string>>(new Set());
  const googleTokenRef = useRef<string>('');
  const googleTokenExpiresAtRef = useRef<number>(0);
  const lastBackedUpVersionRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<CompanyWorkspaceSnapshot | null>(null);
  const bootstrappedSubscriptionsRef = useRef<Set<string>>(new Set());
  const bootstrappedWorkspacesRef = useRef<Set<string>>(new Set());
  const bootstrappedUsersRef = useRef<Set<string>>(new Set());
  const lastUserIdRef = useRef<string | null>(null);
  const companiesLoadedForUserIdRef = useRef<string | null>(null);
  const lastHeartbeatAttemptRef = useRef<Record<string, number>>({});
  const workspaceSubscriptionRef = useRef<WorkspaceSubscriptionAccount>(workspaceSubscription);
  // activeAccountsRef allows synchronous access to accounts during multi-step mutations
  const activeAccountsRef = useRef<Account[] | null>(null);

  // Infinite loop detection & prevention
  const renderCountRef = useRef(0);
  const lastRenderResetRef = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastRenderResetRef.current;

    if (elapsed > 2000) {
      // Reset counter every 2 seconds
      renderCountRef.current = 0;
      lastRenderResetRef.current = now;
    } else {
      renderCountRef.current++;
    }

    // If we're rendering too frequently, log a warning
    if (renderCountRef.current > 150) {
      // Force a pause to prevent browser crash
      if (renderCountRef.current > 300) {
        console.error('[CRITICAL] Detected excessive re-renders! Possible infinite loop.');
        throw new Error('AccountingContext: Too many re-renders in 2 seconds. Check component logic.');
      }
    }
  }, []);
  const getActiveAccounts = (): Account[] => {
    if (!activeAccountsRef.current) {
      activeAccountsRef.current = accounts;
      Promise.resolve().then(() => {
        activeAccountsRef.current = null;
      });
    }
    return activeAccountsRef.current;
  };

  // Migration guard refs to prevent infinite render loops
  const migrationAccountsEnsuredRef = useRef<Set<string>>(new Set());
  const migrationEmployeeAdvancesRef = useRef<Set<string>>(new Set());
  const migrationLegacyPartnerRef = useRef<Set<string>>(new Set());
  const migrationOpeningBalancesRef = useRef<Set<string>>(new Set());
  const migrationProfitDistRef = useRef<Set<string>>(new Set());
  const migrationAssetGroupsRef = useRef<Set<string>>(new Set());
  const migrationHrBackfillRef = useRef<Set<string>>(new Set());
  const migrationLegacyBankRef = useRef<Set<string>>(new Set());
  const migrationContactCommercialRef = useRef<Set<string>>(new Set());
  const migrationContactCustomerRef = useRef<Set<string>>(new Set());
  const migrationRemovableReceivableRef = useRef<Set<string>>(new Set());
  const migrationContactPartnerRef = useRef<Set<string>>(new Set());
  const migrationContactTxRemapRef = useRef<Set<string>>(new Set());
  const migrationDraftAutoPostRef = useRef<Set<string>>(new Set());
  const autoFiscalPostingCheckedRef = useRef<Set<string>>(new Set());
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveStatus>({ isConnected: false });
  const trialDaysLeft = useMemo(() => {
    if (!currentCompany || currentCompany.subscriptionStatus !== 'TRIAL') return 0;
    return resolveDaysLeft(currentCompany.trialEndsAt);
  }, [currentCompany]);
  const currentDeviceBinding = useMemo<SubscriptionDeviceBinding>(
    () => getCurrentSubscriptionDeviceBinding(deviceBindingId, currentUser),
    [deviceBindingId, currentUser]
  );
  const workspaceProviderAvailability = useMemo(
    () => getSubscriptionProviderAvailability(),
    []
  );
  const workspaceMaxCompanies = useMemo(
    () => getWorkspaceEffectiveMaxCompanies(workspaceSubscription, companies.length),
    [companies.length, workspaceSubscription]
  );
  const workspaceRemainingCompanySlots = useMemo(
    () => getWorkspaceRemainingCompanySlots(workspaceSubscription, companies.length),
    [companies.length, workspaceSubscription]
  );
  const workspaceCompanyLimitReached = useMemo(
    () => companies.length >= workspaceMaxCompanies,
    [companies.length, workspaceMaxCompanies]
  );

  const applyCompanySubscriptionLocally = useCallback((
    companyId: string,
    updates: Partial<CompanyProfile>
  ): CompanyProfile | null => {
    const existing = companies.find(company => company.id === companyId);
    if (!existing) return null;
    const next = withNormalizedCompanyProfile({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt
    }, workspaceSubscription);

    if (isDeepEqual(existing, next)) {
      return next;
    }

    setCompanies(prev => prev.map(company => company.id === companyId ? next : company));
    if (companyId === currentCompanyId) {
      setCompanySettings(prev => ({
        ...prev,
        name: next.name,
        taxNumber: next.taxNumber || prev.taxNumber,
        address: next.address || prev.address,
        phone: next.phone || prev.phone,
        logoUrl: normalizeBrandLogoUrl(next.logoUrl ?? prev.logoUrl, defaultCompanySettings.logoUrl)
      }));
    }
    return next;
  }, [companies, currentCompanyId, workspaceSubscription]);

  const buildCompanyProfilePatchFromCloud = useCallback((
    remote: CloudCompanySubscription,
    company?: CompanyProfile | null,
    overrideStatus?: CompanySubscriptionStatus
  ): Partial<CompanyProfile> => {
    const effectiveStatus = overrideStatus || remote.status;
    return {
      name: remote.companyName || company?.name || '',
      trialEndsAt: effectiveStatus === 'TRIAL'
        ? remote.endsAt || company?.trialEndsAt || addDaysIso(new Date().toISOString(), 14)
        : company?.trialEndsAt || addDaysIso(new Date().toISOString(), 14),
      subscriptionStatus: effectiveStatus,
      subscriptionPlan: remote.plan,
      subscriptionStartsAt: remote.startsAt || company?.subscriptionStartsAt || company?.createdAt || new Date().toISOString(),
      subscriptionEndsAt: effectiveStatus === 'TRIAL' ? undefined : remote.endsAt,
      activationCode: remote.activationCode,
      graceDays: remote.graceDays
    };
  }, []);

  const persistCloudSubscription = useCallback(async (
    company: CompanyProfile,
    options?: {
      source?: CloudCompanySubscription['source'];
      maxDevices?: number;
      boundDevices?: SubscriptionDeviceBinding[];
      notes?: string;
      reservedCompanyId?: string;
      reservedCompanyName?: string;
    }
  ): Promise<void> => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser)) return;

    const subscriptionRef = doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, company.id);
    const existingSnapshot = await getDoc(subscriptionRef);
    const existingRemote = existingSnapshot.exists()
      ? normalizeCloudCompanySubscription(company.id, existingSnapshot.data(), company)
      : null;
    const nextRemote: CloudCompanySubscription = {
      ...buildCloudSubscriptionFromCompanyProfile(company, {
        source: options?.source || (existingRemote?.source || (company.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL')),
        updatedByUserId: currentUser.id,
        updatedByEmail: currentUser.email,
        maxDevices: options?.maxDevices || existingRemote?.maxDevices || 1,
        boundDevices: options?.boundDevices || existingRemote?.boundDevices || [currentDeviceBinding],
        notes: options?.notes || existingRemote?.notes
      }),
      reservedCompanyId: options?.reservedCompanyId || existingRemote?.reservedCompanyId,
      reservedCompanyName: options?.reservedCompanyName || existingRemote?.reservedCompanyName
    };

    await setDoc(subscriptionRef, sanitizeFirestorePayload(nextRemote as unknown as Record<string, unknown>), { merge: true });
  }, [currentDeviceBinding, currentUser]);

  const persistWorkspaceSubscriptionDoc = useCallback(async (
    next: WorkspaceSubscriptionAccount
  ): Promise<void> => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser)) return;
    const workspaceRef = doc(firebaseDb, WORKSPACE_SUBSCRIPTIONS_COLLECTION, currentUser.id);
    const payload = normalizeWorkspaceSubscription(next, {
      userId: currentUser.id,
      userEmail: currentUser.email
    });
    await setDoc(workspaceRef, sanitizeFirestorePayload(payload as unknown as Record<string, unknown>), { merge: true });
  }, [currentUser]);

  const logout = async () => {
    // 1. Reset user and session states
    setCurrentUser(null);
    setCloudMemberships([]);
    setCompanies([]);
    setCompaniesLoaded(false);
    
    // 2. Clear company selection from state and local storage
    setCurrentCompanyId('');
    try {
      localStorage.removeItem(STORAGE_KEYS.currentCompany);
      localStorage.removeItem(STORAGE_KEYS.currentUser);
      localStorage.removeItem(STORAGE_KEYS.workspaceSubscription);
      localStorage.removeItem('smart_account_subscription_codes');
      localStorage.removeItem('smart_account_workspace_offer_codes');
      localStorage.removeItem(LOCAL_WORKSPACE_OFFER_CODES_KEY);
    } catch (e) {
      console.warn('Failed to clear storage keys on logout:', e);
    }

    // 3. Wipe all data collections to ensure complete isolation and prevent leakage
    setTransactions([]);
    setInvoices([]);
    setImportExpenseDistributions([]);
    setInvoiceSettlements([]);
    setAccounts([]);
    setProducts([]);
    setItemGroups([]);
    setUnits([]);
    setContacts([]);
    setEmployees([]);
    setEmployeeContracts([]);
    setSalaryHistory([]);
    setEmployeeLeaveRequests([]);
    setEmployeeRecurringDeductions([]);
    setDepartments([]);
    setTickets([]);
    setAssetGroups([]);
    setFixedAssets([]);
    setChecks([]);
    setCurrencies([]);
    setUsers([]);
    setWarehouses([]);
    setStockTransfers([]);
    setBoms([]);
    setProductionOrders([]);

    // 4. Sign out of Firebase Auth
    const signOutPromises = isFirebaseAuthEnabled && firebaseAuth
      ? [firebaseSignOut(firebaseAuth)]
      : [];
    await Promise.allSettled(signOutPromises);
  };

  // Sync auth session with local user state
  useEffect(() => {
    let cancelled = false;

    if (isFirebaseAuthEnabled && firebaseAuth) {
      const resolvePersistedCompanyId = (): string => {
        try {
          return localStorage.getItem(STORAGE_KEYS.currentCompany) || currentCompanyId || 'cmp_default';
        } catch {
          return currentCompanyId || 'cmp_default';
        }
      };

      const syncFirebaseSession = (authUser: FirebaseAuthUser | null) => {
        if (cancelled) return;
        setIsAuthInitialized(true);
        const persistedCompanyId = resolvePersistedCompanyId();

        const currentUserId = lastUserIdRef.current;
        const nextUserId = authUser?.uid || null;

        const isTransitioningFromGuestToFirebase = currentUserId === GUEST_USER_ID && nextUserId !== null;
        const isTransitioningFromFirebaseToGuest = currentUserId !== GUEST_USER_ID && nextUserId === GUEST_USER_ID;
        const isStandardUserChange = currentUserId !== GUEST_USER_ID && nextUserId !== GUEST_USER_ID && nextUserId !== currentUserId;
        const isActualUserChange = isTransitioningFromGuestToFirebase || isTransitioningFromFirebaseToGuest || isStandardUserChange;

        if (isActualUserChange) {
          console.log(`[Auth] User changed synchronously from ${currentUserId} to ${nextUserId}. Clearing states.`);
          lastUserIdRef.current = nextUserId;

          // Reset user and session states
          setCloudMemberships([]);
          setCompanies([]);
          companiesLoadedForUserIdRef.current = null;
          setCompaniesLoaded(nextUserId === GUEST_USER_ID);
          setCurrentCompanyId(nextUserId === GUEST_USER_ID ? 'cmp_default' : '');
          setBaseCurrencyState('ILS');
          setCompanySettings(withNormalizedValuationSettings(defaultCompanySettings));
          setWorkspaceHydratedForCompanyId('');
          setWorkspaceSubscription(buildDefaultWorkspaceSubscription());

          // Wipe all data collections to ensure complete isolation and prevent leakage
          setTransactions([]);
          setInvoices([]);
          setImportExpenseDistributions([]);
          setInvoiceSettlements([]);
          setAccounts([]);
          setProducts([]);
          setItemGroups([]);
          setUnits([]);
          setContacts([]);
          setEmployees([]);
          setEmployeeContracts([]);
          setSalaryHistory([]);
          setEmployeeLeaveRequests([]);
          setEmployeeRecurringDeductions([]);
          setDepartments([]);
          setTickets([]);
          setAssetGroups([]);
          setFixedAssets([]);
          setChecks([]);
          setCurrencies([]);
          setUsers([]);
          setWarehouses([]);
          setStockTransfers([]);
          setBoms([]);
          setProductionOrders([]);
        }

        if (!authUser) {
          setCurrentUser(prev => (isGuestUser(prev) ? prev : null));
          return;
        }

        const nextUser = mapFirebaseAuthUser(authUser, persistedCompanyId);
        setCurrentUser(prev => {
          if (prev && prev.id === nextUser.id) {
            if (
              prev.email === nextUser.email &&
              prev.name === nextUser.name &&
              prev.picture === nextUser.picture &&
              prev.role === nextUser.role &&
              prev.status === nextUser.status &&
              prev.companyId === nextUser.companyId
            ) {
              return prev;
            }
            return {
              ...prev,
              email: nextUser.email,
              name: nextUser.name,
              picture: nextUser.picture,
              role: nextUser.role,
              status: nextUser.status,
              companyId: nextUser.companyId
            };
          }
          return nextUser;
        });
      };

      const unsubscribe = onAuthStateChanged(firebaseAuth, syncFirebaseSession);

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    setCloudMemberships([]);
    setIsAuthInitialized(true);
    setCurrentUser(prev => {
      const targetCompanyId = currentCompanyId || (prev ? prev.companyId : 'cmp_default');
      if (isGuestUser(prev) && prev.companyId === targetCompanyId) {
        return prev;
      }
      return {
        id: GUEST_USER_ID,
        email: '',
        name: 'Guest User',
        role: 'ADMIN',
        status: 'ACTIVE',
        companyId: targetCompanyId,
        lastActive: new Date().toISOString()
      };
    });

    return () => {
      cancelled = true;
    };
  }, [currentCompanyId]);

  useEffect(() => {
    const nextUserId = currentUser?.id || null;
    const prevUserId = lastUserIdRef.current;
    if (nextUserId !== prevUserId) {
      console.log(`[AccountingContext] User ID changed from ${prevUserId} to ${nextUserId}. Wiping states to prevent leakage.`);
      lastUserIdRef.current = nextUserId;

      // Reset user and session states
      setCloudMemberships([]);
      setCompanies([]);
      companiesLoadedForUserIdRef.current = null;
      setCompaniesLoaded(nextUserId === GUEST_USER_ID);
      setCurrentCompanyId(nextUserId === GUEST_USER_ID ? 'cmp_default' : '');
      setBaseCurrencyState('ILS');
        setCompanySettings(withNormalizedValuationSettings(defaultCompanySettings));
        setWorkspaceHydratedForCompanyId('');
        setWorkspaceSubscription(buildDefaultWorkspaceSubscription());

        // Wipe all data collections to ensure complete isolation and prevent leakage
        setTransactions([]);
        setInvoices([]);
        setImportExpenseDistributions([]);
        setInvoiceSettlements([]);
        setAccounts([]);
        setProducts([]);
        setItemGroups([]);
        setUnits([]);
        setContacts([]);
        setEmployees([]);
        setEmployeeContracts([]);
        setSalaryHistory([]);
        setEmployeeLeaveRequests([]);
        setEmployeeRecurringDeductions([]);
        setDepartments([]);
        setTickets([]);
        setAssetGroups([]);
        setFixedAssets([]);
        setChecks([]);
        setCurrencies([]);
        setUsers([]);
        setWarehouses([]);
        setStockTransfers([]);
        setBoms([]);
        setProductionOrders([]);
    }
  }, [currentUser?.id, defaultCompanySettings]);

  useEffect(() => {
    if (!currentUser || !cloudMemberships.length || !currentCompanyId) return;

    const selectedMembership = selectCurrentMembership(cloudMemberships, currentCompanyId);
    if (!selectedMembership) return;

    if (
      currentUser.companyId === selectedMembership.companyId &&
      currentUser.role === selectedMembership.role
    ) {
      return;
    }

    setCurrentUser(prev => (
      prev
        ? {
          ...prev,
          companyId: selectedMembership.companyId,
          role: selectedMembership.role
        }
        : prev
    ));
  }, [cloudMemberships, currentCompanyId, currentUser]);

  useEffect(() => {
    if (!currentUser || isGuestUser(currentUser)) {
      setSubscriptionAdminEnabled(false);
      setSubscriptionAdminScope('NONE');
      setSubscriptionAdminRole('NONE');
      return;
    }

    if (!firebaseDb) {
      const isOwner = isProgramOwnerEmail(currentUser.email);
      const isAdmin = localSubscriptionAdminEnabled || isSubscriptionAdminEmail(currentUser.email);
      setSubscriptionAdminEnabled(isAdmin || isOwner);
      setSubscriptionAdminScope((isAdmin || isOwner) ? 'LOCAL' : 'NONE');
      setSubscriptionAdminRole(isOwner ? 'SUPER_ADMIN' : (isAdmin ? 'ADMIN' : 'NONE'));
      return;
    }

    const adminRef = doc(firebaseDb, SUBSCRIPTION_ADMINS_COLLECTION, currentUser.id);
    const unsubscribe = onSnapshot(adminRef, (snapshot) => {
      const bootstrapByEmail = isSubscriptionAdminEmail(currentUser.email) || isProgramOwnerEmail(currentUser.email);
      const activeInCloud = snapshot.exists() && snapshot.data()?.active !== false;
      const nextRole = activeInCloud
        ? (String(snapshot.data()?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN')
        : (isProgramOwnerEmail(currentUser.email) ? 'SUPER_ADMIN' : 'NONE');
      const nextScope: SubscriptionAdminScope = activeInCloud
        ? 'CLOUD'
        : (bootstrapByEmail || localSubscriptionAdminEnabled ? 'LOCAL' : 'NONE');
      setSubscriptionAdminEnabled(nextScope !== 'NONE');
      setSubscriptionAdminScope(nextScope);
      setSubscriptionAdminRole(nextRole);

      if (!snapshot.exists() && bootstrapByEmail) {
        void setDoc(adminRef, {
          userId: currentUser.id,
          email: currentUser.email || '',
          active: true,
          role: isProgramOwnerEmail(currentUser.email) ? 'SUPER_ADMIN' : 'ADMIN',
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(() => undefined);
      }
    }, () => {
      const nextScope: SubscriptionAdminScope = (isSubscriptionAdminEmail(currentUser.email) || localSubscriptionAdminEnabled)
        ? 'LOCAL'
        : 'NONE';
      setSubscriptionAdminEnabled(nextScope !== 'NONE');
      setSubscriptionAdminScope(nextScope);
      setSubscriptionAdminRole(isProgramOwnerEmail(currentUser.email) ? 'SUPER_ADMIN' : (nextScope === 'LOCAL' ? 'ADMIN' : 'NONE'));
    });

    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.email, localSubscriptionAdminEnabled, firebaseDb]);

  useEffect(() => {
    if (!subscriptionAdminEnabled || !currentUser || isGuestUser(currentUser)) {
      setSubscriptionCodes([]);
      setSubscriptionCodesLoading(false);
      return;
    }

    if (!firebaseDb || subscriptionAdminScope !== 'CLOUD') {
      setSubscriptionCodes(loadLocalSubscriptionCodes());
      setSubscriptionCodesLoading(false);
      return;
    }

    setSubscriptionCodesLoading(true);
    const codesQuery = query(
      collection(firebaseDb, SUBSCRIPTION_CODES_COLLECTION),
      orderBy('createdAt', 'desc'),
      firestoreLimit(100)
    );

    const unsubscribe = onSnapshot(codesQuery, (snapshot) => {
      const nextCodes = snapshot.docs
        .map(docSnapshot => normalizeCloudSubscriptionCode(docSnapshot.data()))
        .filter((item): item is CloudSubscriptionCode => Boolean(item));
      setSubscriptionCodes(nextCodes);
      setSubscriptionCodesLoading(false);
    }, (error) => {
      setSubscriptionCloudError(String(error?.message || 'Failed to load subscription codes.'));
      setSubscriptionCodesLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, subscriptionAdminEnabled, subscriptionAdminScope]);

  useEffect(() => {
    if (!programOwnerEnabled || !currentUser || isGuestUser(currentUser)) {
      setWorkspaceOfferCodes([]);
      setWorkspaceOfferCodesLoading(false);
      return;
    }

    if (!firebaseDb || subscriptionAdminScope !== 'CLOUD') {
      setWorkspaceOfferCodes(loadLocalWorkspaceOfferCodes());
      setWorkspaceOfferCodesLoading(false);
      return;
    }

    setWorkspaceOfferCodesLoading(true);
    const offersQuery = query(
      collection(firebaseDb, WORKSPACE_OFFER_CODES_COLLECTION),
      orderBy('createdAt', 'desc'),
      firestoreLimit(100)
    );

    const unsubscribe = onSnapshot(offersQuery, (snapshot) => {
      const nextCodes = snapshot.docs
        .map(docSnapshot => normalizeWorkspaceOfferCode(docSnapshot.data()))
        .filter((item): item is WorkspaceOfferCode => Boolean(item));
      setWorkspaceOfferCodes(nextCodes);
      setWorkspaceOfferCodesLoading(false);
    }, (error) => {
      setSubscriptionCloudError(String(error?.message || 'Failed to load workspace offer codes.'));
      setWorkspaceOfferCodes(loadLocalWorkspaceOfferCodes());
      setWorkspaceOfferCodesLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.email, programOwnerEnabled, subscriptionAdminScope, firebaseDb]);

  useEffect(() => {
    if (!firebaseDb || !programOwnerEnabled || !currentUser || isGuestUser(currentUser)) return;

    let cancelled = false;
    const syncLocalWorkspaceOfferCodesToCloud = async () => {
      const localCodes = loadLocalWorkspaceOfferCodes();
      if (!localCodes.length) return;

      try {
        await ensureProgramOwnerAdminDocument();
        for (const localCode of localCodes) {
          if (cancelled) return;
          await setDoc(
            doc(firebaseDb, WORKSPACE_OFFER_CODES_COLLECTION, localCode.code),
            sanitizeFirestorePayload(localCode as unknown as Record<string, unknown>),
            { merge: true }
          );
        }
      } catch {
        // Keep local fallback copies so the owner can retry after permissions settle.
      }
    };

    void syncLocalWorkspaceOfferCodesToCloud();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.email, ensureProgramOwnerAdminDocument, programOwnerEnabled, firebaseDb]);

  useEffect(() => {
    if (!subscriptionAdminEnabled || !currentUser || isGuestUser(currentUser)) {
      setSubscriptionCompanies([]);
      setSubscriptionCompaniesLoading(false);
      return;
    }

    if (!firebaseDb || subscriptionAdminScope !== 'CLOUD') {
      const nextCompanies = companies
        .map(company => {
          if (company.id === currentCompanyId && cloudSubscription) {
            return normalizeCloudCompanySubscription(company.id, cloudSubscription, company);
          }

          return buildCloudSubscriptionFromCompanyProfile(company, {
            source: company.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL',
            updatedByUserId: currentUser.id,
            updatedByEmail: currentUser.email,
            maxDevices: company.id === currentCompanyId ? (cloudSubscription?.maxDevices || 1) : 1,
            boundDevices: company.id === currentCompanyId ? (cloudSubscription?.boundDevices || [currentDeviceBinding]) : []
          });
        })
        .sort((left, right) => Date.parse(String(right.updatedAt || '')) - Date.parse(String(left.updatedAt || '')));

      setSubscriptionCompanies(nextCompanies);
      setSubscriptionCompaniesLoading(false);
      return;
    }

    setSubscriptionCompaniesLoading(true);
    const subscriptionsQuery = query(
      collection(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION),
      orderBy('updatedAt', 'desc'),
      firestoreLimit(250)
    );

    const unsubscribe = onSnapshot(subscriptionsQuery, (snapshot) => {
      const nextCompanies = snapshot.docs
        .map(docSnapshot => {
          const fallbackCompany = companies.find(company => company.id === docSnapshot.id) || null;
          return normalizeCloudCompanySubscription(docSnapshot.id, docSnapshot.data(), fallbackCompany);
        })
        .filter((item): item is CloudCompanySubscription => Boolean(item));
      setSubscriptionCompanies(nextCompanies);
      setSubscriptionCompaniesLoading(false);
    }, (error) => {
      setSubscriptionCloudError(String(error?.message || 'Failed to load cloud subscription companies.'));
      setSubscriptionCompaniesLoading(false);
    });

    return () => unsubscribe();
  }, [cloudSubscription, companies, currentCompanyId, currentDeviceBinding, currentUser?.id, currentUser?.email, subscriptionAdminEnabled, subscriptionAdminScope, firebaseDb]);

  const currentCompanyRef = useRef(currentCompany);
  currentCompanyRef.current = currentCompany;

  const currentDeviceBindingRef = useRef(currentDeviceBinding);
  currentDeviceBindingRef.current = currentDeviceBinding;

  const applyCompanySubscriptionLocallyRef = useRef(applyCompanySubscriptionLocally);
  applyCompanySubscriptionLocallyRef.current = applyCompanySubscriptionLocally;

  const buildCompanyProfilePatchFromCloudRef = useRef(buildCompanyProfilePatchFromCloud);
  buildCompanyProfilePatchFromCloudRef.current = buildCompanyProfilePatchFromCloud;

  const persistCloudSubscriptionRef = useRef(persistCloudSubscription);
  persistCloudSubscriptionRef.current = persistCloudSubscription;

  useEffect(() => {
    if (!firebaseDb || !currentCompanyId || !currentUser || isGuestUser(currentUser)) {
      setCloudSubscription(null);
      return;
    }

    const comp = currentCompanyRef.current;
    if (!comp) return;

    setSubscriptionCloudBusy(true);
    const subscriptionRef = doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, currentCompanyId);
    const unsubscribe = onSnapshot(subscriptionRef, (snapshot) => {
      const latestComp = currentCompanyRef.current;
      if (!latestComp) return;

      if (!snapshot.exists()) {
        if (!shouldBootstrapMissingCompanySubscription(companiesRef.current, currentCompanyId, companyDeleteInFlightRef.current)) {
          setCloudSubscription(null);
          setSubscriptionCloudBusy(false);
          setSubscriptionCloudError('');
          return;
        }

        if (bootstrappedSubscriptionsRef.current.has(currentCompanyId)) {
          setCloudSubscription(null);
          setSubscriptionCloudBusy(false);
          return;
        }
        bootstrappedSubscriptionsRef.current.add(currentCompanyId);

        void persistCloudSubscriptionRef.current(latestComp, {
          source: latestComp.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL',
          boundDevices: [currentDeviceBindingRef.current]
        })
          .then(() => {
            setSubscriptionCloudBusy(false);
            setSubscriptionCloudError('');
          })
          .catch((error) => {
            setSubscriptionCloudBusy(false);
            setSubscriptionCloudError(String(error?.message || 'Failed to bootstrap cloud subscription.'));
          });
        return;
      }

      let remote = normalizeCloudCompanySubscription(currentCompanyId, snapshot.data(), latestComp);
      const existingDevice = remote.boundDevices.find(device => device.deviceId === currentDeviceBindingRef.current.deviceId);

      if (!existingDevice) {
        const now = Date.now();
        const lastAttempt = lastHeartbeatAttemptRef.current[currentCompanyId] || 0;
        const throttled = now - lastAttempt < 60000;

        const nextDevices = [...remote.boundDevices, { ...currentDeviceBindingRef.current, firstSeenAt: new Date().toISOString() }];
        const nextRemote = {
          ...remote,
          boundDevices: nextDevices,
          updatedAt: new Date().toISOString(),
          updatedByUserId: currentUser.id,
          updatedByEmail: currentUser.email
        };

        if (!throttled) {
          lastHeartbeatAttemptRef.current[currentCompanyId] = now;
          void setDoc(
            subscriptionRef,
            sanitizeFirestorePayload(nextRemote as unknown as Record<string, unknown>),
            { merge: true }
          ).catch(() => {
            // Let the current snapshot continue even if the auto-bind write fails.
          });
        }
        remote = nextRemote;
      } else if (existingDevice) {
        const lastSeen = Date.parse(String(existingDevice.lastSeenAt || ''));
        const fiveMinutes = 5 * 60 * 1000;
        const needsHeartbeat = !Number.isFinite(lastSeen) || (Date.now() - lastSeen) > fiveMinutes;

        if (needsHeartbeat) {
          const now = Date.now();
          const lastAttempt = lastHeartbeatAttemptRef.current[currentCompanyId] || 0;
          const throttled = now - lastAttempt < 60000;

          const nextDevices = remote.boundDevices.map(device => (
            device.deviceId === currentDeviceBindingRef.current.deviceId
              ? {
                ...device,
                lastSeenAt: new Date().toISOString(),
                lastUserId: currentUser.id,
                lastUserEmail: currentUser.email
              }
              : device
          ));

          if (!throttled) {
            lastHeartbeatAttemptRef.current[currentCompanyId] = now;
            void setDoc(subscriptionRef, sanitizeFirestorePayload({
              boundDevices: nextDevices,
              updatedAt: new Date().toISOString(),
              updatedByUserId: currentUser.id,
              updatedByEmail: currentUser.email
            }), { merge: true }).catch(() => {
              // Keep working even if heartbeat update fails.
            });
          }

          remote = {
            ...remote,
            boundDevices: nextDevices
          };
        }
      }

      const localPatch = buildCompanyProfilePatchFromCloudRef.current(remote, latestComp);

      setCloudSubscription(remote);
      setSubscriptionCloudBusy(false);
      setSubscriptionCloudError('');
      applyCompanySubscriptionLocallyRef.current(currentCompanyId, localPatch);
    }, (error) => {
      setSubscriptionCloudBusy(false);
      setSubscriptionCloudError(String(error?.message || 'Failed to sync company subscription.'));
    });

    return () => unsubscribe();
  }, [currentCompanyId, currentUser, firebaseDb]);

  const companiesSyncKey = useMemo(() => {
    return JSON.stringify(companies.map(c => ({ id: c.id, name: c.name })));
  }, [companies]);

  useEffect(() => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser) || !companies.length) return;

    const syncPromises = companies.map(company => (
      setDoc(doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, company.id), {
        companyId: company.id,
        companyName: company.name,
        ownerUserId: currentUser.id,
        ownerEmail: currentUser.email,
        updatedAt: new Date().toISOString()
      }, { merge: true })
    ));

    void Promise.allSettled(syncPromises);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesSyncKey, currentUser]);

  const makeSuccess = (): Extract<MutationResult, { ok: true }> => ({ ok: true });
  const makeError = (
    code: 'POSTED_LOCKED' | 'PERMISSION_DENIED' | 'VALIDATION_ERROR' | 'SUBSCRIPTION_LIMIT',
    message: string
  ): Extract<MutationResult, { ok: false }> => ({ ok: false, code, message });

  const updateWorkspaceSubscription = async (
    updates: Partial<WorkspaceSubscriptionAccount>
  ): Promise<MutationResult> => {
    if (!currentUser || isGuestUser(currentUser)) {
      return makeError('PERMISSION_DENIED', 'Sign in with a Firebase account before updating the commercial subscription.');
    }

    const next = normalizeWorkspaceSubscription(
      {
        ...workspaceSubscription,
        ...updates,
        updatedAt: new Date().toISOString()
      },
      {
        ...workspaceSubscription,
        userId: currentUser.id,
        userEmail: currentUser.email,
        maxCompanies: Math.max(workspaceSubscription.maxCompanies, companies.length)
      }
    );

    try {
      setWorkspaceSubscription(next);
      await persistWorkspaceSubscriptionDoc(next);
      return makeSuccess();
    } catch (error: any) {
      return makeError('VALIDATION_ERROR', error?.message || 'Failed to update the workspace subscription.');
    }
  };

  const prepareSubscriptionCheckoutAction = (
    provider: SubscriptionCheckoutProvider,
    billingCycle: SubscriptionBillingCycle,
    desiredCompanyCount: number,
    options?: {
      discountPercent?: number;
      offerCode?: string;
    }
  ): SubscriptionCheckoutResult => prepareWorkspaceCheckout({
    provider,
    billingCycle,
    desiredCompanyCount,
    discountPercent: options?.discountPercent,
    offerCode: options?.offerCode
  });

  const appendAuditLog: AccountingContextType['appendAuditLog'] = (entry) => {
    const nowIso = new Date().toISOString();
    const resolvedUser = currentUser || null;
    const nextLog: AuditLogEntry = {
      id: newId('audit'),
      timestamp: nowIso,
      userId: resolvedUser?.id,
      userName: resolvedUser?.name,
      device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      ...entry
    };

    setAuditLogs(prev => [nextLog, ...prev].slice(0, 5000));
  };

  const can = (module: PermissionModule, action: PermissionAction): boolean => {
    if (!currentUser) return false;

    const userOverride = permissions.userOverrides?.[currentUser.id]?.[module]?.[action];
    if (currentUser.role === 'ADMIN') {
      return typeof userOverride === 'boolean' ? userOverride : true;
    }

    const rolePermissions = createRolePermissions(currentUser.role || 'VIEWER');
    const roleAllowed = rolePermissions[module]?.[action] ?? false;
    const configuredAllowed = permissions.modules?.[module]?.[action];
    let allowed = typeof configuredAllowed === 'boolean' ? configuredAllowed : roleAllowed;

    if (typeof userOverride === 'boolean') {
      allowed = userOverride;
    }

    return Boolean(allowed);
  };

  const updatePermissions = (next: PermissionMatrix): MutationResult => {
    const subscriptionLock = getSubscriptionMutationBlockResult('SETTINGS', 'EDIT', 'Settings > Permissions');
    if (subscriptionLock) return subscriptionLock;

    if (!can('SETTINGS', 'EDIT')) {
      appendAuditLog({
        entityType: 'permissions',
        action: 'UPDATE_DENIED',
        screen: 'Settings > Permissions',
        metadata: { reason: 'PERMISSION_DENIED' }
      });
      return makeError('PERMISSION_DENIED', 'You do not have permission to edit permissions.');
    }

    setPermissions(normalizePermissionMatrix(next));
    appendAuditLog({
      entityType: 'permissions',
      action: 'UPDATE',
      screen: 'Settings > Permissions',
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const getSubscriptionMutationBlockResult = (
    module: PermissionModule,
    action: PermissionAction,
    screen: string
  ): Extract<MutationResult, { ok: false }> | null => {
    if (!currentCompany) return null;
    if (!SUBSCRIPTION_RESTRICTED_ACTIONS.has(action)) return null;
    if (!isSubscriptionAccessRestricted(companyAccessStatus)) return null;

    const normalizedScreen = screen.toLowerCase();
    const bypassAllowed = module === 'SETTINGS'
      && (normalizedScreen.includes('subscription') || normalizedScreen.includes('backup') || normalizedScreen.includes('switcher'));
    if (bypassAllowed) return null;

    const isArabic = (companySettings.language ?? 'AR') === 'AR';
    const companyName = currentCompany.name ? ` "${currentCompany.name}"` : '';
    const message = isArabic
      ? companyAccessStatus === 'SUSPENDED'
        ? `تم إيقاف الوصول للشركة${companyName}. المتاح الآن هو النسخ الاحتياطي أو إدارة الاشتراك فقط.`
        : `انتهى اشتراك الشركة${companyName}. المتاح الآن هو النسخ الاحتياطي أو إدارة الاشتراك فقط.`
      : companyAccessStatus === 'SUSPENDED'
        ? `Access for${companyName || ' this company'} is suspended. Only backup and subscription management are available now.`
        : `The subscription for${companyName || ' this company'} has expired. Only backup and subscription management are available now.`;

    appendAuditLog({
      entityType: 'company_subscription',
      entityId: currentCompany.id,
      action: 'ACCESS_BLOCKED',
      screen,
      metadata: {
        reason: 'SUBSCRIPTION_LOCKED',
        module,
        action,
        subscriptionStatus: companyAccessStatus
      }
    });
    return makeError('PERMISSION_DENIED', message);
  };

  const enforcePermission = (
    module: PermissionModule,
    action: PermissionAction,
    screen: string
  ): MutationResult => {
    const subscriptionLock = getSubscriptionMutationBlockResult(module, action, screen);
    if (subscriptionLock) return subscriptionLock;
    if (can(module, action)) return makeSuccess();
    appendAuditLog({
      entityType: 'permission',
      action: 'DENIED',
      screen,
      metadata: { module, action }
    });
    return makeError('PERMISSION_DENIED', `Permission denied: ${module}.${action}`);
  };

  const strictPostedLockEnabled = companySettings.strictPostedLockEnabled !== false;

  const buildPostedLockedResult = (entityType: string, entityId?: string): MutationResult => {
    appendAuditLog({
      entityType,
      entityId,
      action: 'MUTATION_BLOCKED',
      screen: 'Accounting',
      metadata: { reason: 'POSTED_LOCKED' }
    });
    return makeError('POSTED_LOCKED', 'Cannot edit/delete posted records. Use reversal instead.');
  };

  // MIGRATION: Ensure new accounts exist in current state (for existing users/sessions)
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationAccountsEnsuredRef.current.has(companyKey)) return;
    const missingAccounts: Account[] = [];

    // Check Purchases
    if (!accounts.find(a => a.id === 'acc_purchases')) {
      missingAccounts.push({ id: 'acc_purchases', code: '511', name: 'المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency });
    }
    // Check Purchase Returns
    if (!accounts.find(a => a.id === 'acc_purchase_returns')) {
      missingAccounts.push({ id: 'acc_purchase_returns', code: '512', name: 'مردودات المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency });
    }
    // Check Sales Discounts (contra revenue for credit notices)
    if (!accounts.find(a => a.id === 'acc_sales_discounts')) {
      missingAccounts.push({ id: 'acc_sales_discounts', code: '44', name: 'خصومات المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency });
    }
    // Check Purchase Discounts Earned (contra purchases for debit notices)
    if (!accounts.find(a => a.id === 'acc_purchase_discounts_earned')) {
      missingAccounts.push({ id: 'acc_purchase_discounts_earned', code: '515', name: 'خصومات مشتريات مكتسبة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency });
    }
    // Check Input VAT
    if (!accounts.find(a => a.id === 'acc_vat_input')) {
      missingAccounts.push({ id: 'acc_vat_input', code: '116', name: 'ضريبة المدخلات القابلة للاسترداد', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', currency: baseCurrency });
    }
    // Check Output VAT
    if (!accounts.find(a => a.id === 'acc_vat_output')) {
      missingAccounts.push({ id: 'acc_vat_output', code: '221', name: 'ضريبة المخرجات', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency });
    }
    // Check VAT payable account
    if (!accounts.find(a => a.id === 'acc_vat_payable')) {
      missingAccounts.push({ id: 'acc_vat_payable', code: '222', name: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency });
    }
    // Check Maintenance Expenses
    if (!accounts.find(a => a.id === 'acc_exp_maintenance')) {
      missingAccounts.push({ id: 'acc_exp_maintenance', code: '525', name: 'مصاريف صيانة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency });
    }
    // Check utilities group (parent for electricity/water split)
    if (!accounts.find(a => a.id === 'acc_exp_utilities')) {
      missingAccounts.push({ id: 'acc_exp_utilities', code: '523', name: 'خدمات (كهرباء ومياه)', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', isGroup: true, currency: baseCurrency });
    }
    // Check split utilities children
    if (!accounts.find(a => a.id === 'acc_exp_electricity')) {
      missingAccounts.push({ id: 'acc_exp_electricity', code: '5231', name: 'مصاريف كهرباء', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency });
    }
    if (!accounts.find(a => a.id === 'acc_exp_water')) {
      missingAccounts.push({ id: 'acc_exp_water', code: '5232', name: 'مصاريف مياه', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency });
    }

    const ensureFromTemplate = (accountId: string) => {
      if (!accounts.find(a => a.id === accountId)) {
        const template = initialAccounts.find(a => a.id === accountId);
        if (template) missingAccounts.push(template);
      }
    };

    // Fixed assets subtree additions
    ensureFromTemplate('acc_buildings');
    ensureFromTemplate('acc_machinery');
    ensureFromTemplate('acc_vehicles');
    ensureFromTemplate('acc_cheques_under_collection');
    ensureFromTemplate('acc_gain_asset_disposal');
    ensureFromTemplate('acc_loss_asset_disposal');
    ensureFromTemplate('acc_employee_advances');
    ensureFromTemplate('acc_payable_group');
    ensureFromTemplate('acc_payroll_deductions_payable');
    ensureFromTemplate('acc_inventory_adjustments');
    ensureFromTemplate('acc_inventory_variance');
    ensureFromTemplate('acc_damaged_goods');

    // Equity partners subtree additions
    ensureFromTemplate('acc_partners_accounts_group');
    ensureFromTemplate('acc_partners_capital');
    ensureFromTemplate('acc_partner_current');
    ensureFromTemplate('acc_partner_drawings');
    ensureFromTemplate('acc_long_term_liabilities');
    // keep legacy "acc_profit_distribution" if it already exists, but do not auto-create it

    const vatPayableLegacy = accounts.find(a => a.id === 'acc_vat_payable');
    const shouldNormalizeVatPayable = Boolean(
      vatPayableLegacy &&
      (vatPayableLegacy.code !== '222' || vatPayableLegacy.name !== 'ضريبة القيمة المضافة المستحقة')
    );

    const utilitiesLegacy = accounts.find(a => a.id === 'acc_exp_utilities');
    const shouldNormalizeUtilitiesAccount = Boolean(
      utilitiesLegacy && (
        utilitiesLegacy.code !== '523' ||
        utilitiesLegacy.name !== 'خدمات (كهرباء ومياه)' ||
        utilitiesLegacy.parentId !== 'acc_admin_exp' ||
        utilitiesLegacy.type !== 'EXPENSE' ||
        utilitiesLegacy.isGroup !== true
      )
    );

    const retainedLegacy = accounts.find(a => a.id === 'acc_retained_earnings');
    const shouldNormalizeRetainedEarnings = Boolean(
      retainedLegacy && (
        retainedLegacy.parentId !== 'acc_equity_root' ||
        retainedLegacy.type !== 'EQUITY' ||
        retainedLegacy.code !== '32' ||
        retainedLegacy.name !== 'الأرباح غير الموزعة'
      )
    );

    const payableGroupLegacy = accounts.find(a => a.id === 'acc_payable_group');
    const payableLegacy = accounts.find(a => a.id === 'acc_payable');
    const shouldNormalizePayables = Boolean(
      (payableGroupLegacy && (
        payableGroupLegacy.parentId !== 'acc_current_liabilities' ||
        payableGroupLegacy.type !== 'LIABILITY' ||
        payableGroupLegacy.isGroup !== true ||
        payableGroupLegacy.code !== '211' ||
        payableGroupLegacy.name !== 'الذمم الدائنة (الموردون)'
      )) ||
      (payableLegacy && (
        payableLegacy.parentId !== 'acc_payable_group' ||
        payableLegacy.type !== 'LIABILITY' ||
        payableLegacy.isGroup === true ||
        payableLegacy.code !== '21101' ||
        payableLegacy.name !== 'ذمم الموردين التجارية'
      ))
    );

    const employeeAdvancesLegacy = accounts.find(a => a.id === 'acc_employee_advances');
    const shouldNormalizeEmployeeAdvances = Boolean(
      employeeAdvancesLegacy && (
        employeeAdvancesLegacy.parentId !== 'acc_current_assets' ||
        employeeAdvancesLegacy.type !== 'ASSET' ||
        employeeAdvancesLegacy.code !== '117' ||
        employeeAdvancesLegacy.name !== 'سلف الموظفين'
      )
    );

    const payrollDeductionsLegacy = accounts.find(a => a.id === 'acc_payroll_deductions_payable');
    const shouldNormalizePayrollDeductions = Boolean(
      payrollDeductionsLegacy && (
        payrollDeductionsLegacy.parentId !== 'acc_current_liabilities' ||
        payrollDeductionsLegacy.type !== 'LIABILITY' ||
        payrollDeductionsLegacy.code !== '214' ||
        payrollDeductionsLegacy.name !== 'استقطاعات ومستحقات الرواتب'
      )
    );

    const inventoryAdjustmentsLegacy = accounts.find(a => a.id === 'acc_inventory_adjustments');
    const inventoryVarianceLegacy = accounts.find(a => a.id === 'acc_inventory_variance');
    const damagedGoodsLegacy = accounts.find(a => a.id === 'acc_damaged_goods');
    const shouldNormalizeInventoryAdjustmentAccounts = Boolean(
      (inventoryAdjustmentsLegacy && (
        inventoryAdjustmentsLegacy.parentId !== 'acc_expense_root' ||
        inventoryAdjustmentsLegacy.type !== 'EXPENSE' ||
        inventoryAdjustmentsLegacy.isGroup !== true ||
        inventoryAdjustmentsLegacy.code !== '57' ||
        inventoryAdjustmentsLegacy.name !== 'تسويات وفروقات المخزون'
      )) ||
      (inventoryVarianceLegacy && (
        inventoryVarianceLegacy.parentId !== 'acc_inventory_adjustments' ||
        inventoryVarianceLegacy.type !== 'EXPENSE' ||
        inventoryVarianceLegacy.code !== '571' ||
        inventoryVarianceLegacy.name !== 'فروقات المخزون'
      )) ||
      (damagedGoodsLegacy && (
        damagedGoodsLegacy.parentId !== 'acc_inventory_adjustments' ||
        damagedGoodsLegacy.type !== 'EXPENSE' ||
        damagedGoodsLegacy.code !== '572' ||
        damagedGoodsLegacy.name !== 'بضاعة تالفة'
      ))
    );

    const shouldNormalizePartnerParents = Boolean(
      accounts.some(a => (
        (a.id === 'acc_partners_accounts_group' && (a.parentId !== 'acc_equity_root' || a.type !== 'EQUITY' || a.isGroup !== true)) ||
        (a.id === 'acc_partners_capital' && (a.parentId !== 'acc_partners_accounts_group' || a.type !== 'EQUITY' || a.isGroup !== true || a.code !== '331' || a.name !== 'رأس مال الشركاء')) ||
        (a.id === 'acc_partner_current' && (a.parentId !== 'acc_partners_accounts_group' || a.type !== 'EQUITY' || a.isGroup !== true || a.code !== '332' || a.name !== 'جاري الشركاء')) ||
        (a.id === 'acc_partner_drawings' && (a.parentId !== 'acc_partners_accounts_group' || a.type !== 'EQUITY' || a.isGroup !== true || a.code !== '333' || a.name !== 'مسحوبات الشركاء'))
      ))
    );

    if (
      missingAccounts.length > 0 ||
      shouldNormalizeVatPayable ||
      shouldNormalizeUtilitiesAccount ||
      shouldNormalizeRetainedEarnings ||
      shouldNormalizePartnerParents ||
      shouldNormalizePayables ||
      shouldNormalizeEmployeeAdvances ||
      shouldNormalizePayrollDeductions ||
      shouldNormalizeInventoryAdjustmentAccounts
    ) {
      setAccounts(prev => {
        let next = prev;
        if (missingAccounts.length > 0) {
          next = [...next, ...missingAccounts];
        }
        if (shouldNormalizeVatPayable) {
          next = next.map(account => (
            account.id === 'acc_vat_payable'
              ? {
                ...account,
                code: '222',
                name: 'ضريبة القيمة المضافة المستحقة',
                parentId: 'acc_current_liabilities',
                type: 'LIABILITY',
                currency: account.currency || baseCurrency
              }
              : account
          ));
        }
        if (shouldNormalizeUtilitiesAccount) {
          next = next.map(account => (
            account.id === 'acc_exp_utilities'
              ? {
                ...account,
                code: '523',
                name: 'خدمات (كهرباء ومياه)',
                parentId: 'acc_admin_exp',
                type: 'EXPENSE',
                isGroup: true,
                currency: account.currency || baseCurrency
              }
              : account
          ));
        }
        if (shouldNormalizeRetainedEarnings) {
          next = next.map(account => (
            account.id === 'acc_retained_earnings'
              ? {
                ...account,
                code: '32',
                name: 'الأرباح غير الموزعة',
                parentId: 'acc_equity_root',
                type: 'EQUITY',
                currency: account.currency || baseCurrency
              }
              : account
          ));
        }
        if (shouldNormalizePayables) {
          next = next.map(account => {
            if (account.id === 'acc_payable_group') {
              return {
                ...account,
                code: '211',
                name: 'الذمم الدائنة (الموردون)',
                parentId: 'acc_current_liabilities',
                type: 'LIABILITY',
                isGroup: true,
                currency: account.currency || baseCurrency
              };
            }
            if (account.id === 'acc_payable') {
              return {
                ...account,
                code: '21101',
                name: 'ذمم الموردين التجارية',
                parentId: 'acc_payable_group',
                type: 'LIABILITY',
                isGroup: undefined,
                currency: account.currency || baseCurrency
              };
            }
            return account;
          });
        }
        if (shouldNormalizeEmployeeAdvances) {
          next = next.map(account => (
            account.id === 'acc_employee_advances'
              ? {
                ...account,
                code: '117',
                name: 'سلف الموظفين',
                parentId: 'acc_current_assets',
                type: 'ASSET',
                isGroup: undefined,
                currency: account.currency || baseCurrency
              }
              : account
          ));
        }
        if (shouldNormalizePayrollDeductions) {
          next = next.map(account => (
            account.id === 'acc_payroll_deductions_payable'
              ? {
                ...account,
                code: '214',
                name: 'استقطاعات ومستحقات الرواتب',
                parentId: 'acc_current_liabilities',
                type: 'LIABILITY',
                isGroup: undefined,
                currency: account.currency || baseCurrency
              }
              : account
          ));
        }
        if (shouldNormalizeInventoryAdjustmentAccounts) {
          next = next.map(account => {
            if (account.id === 'acc_inventory_adjustments') {
              return {
                ...account,
                code: '57',
                name: 'تسويات وفروقات المخزون',
                parentId: 'acc_expense_root',
                type: 'EXPENSE',
                isGroup: true,
                currency: account.currency || baseCurrency
              };
            }
            if (account.id === 'acc_inventory_variance') {
              return {
                ...account,
                code: '571',
                name: 'فروقات المخزون',
                parentId: 'acc_inventory_adjustments',
                type: 'EXPENSE',
                isGroup: undefined,
                currency: account.currency || baseCurrency
              };
            }
            if (account.id === 'acc_damaged_goods') {
              return {
                ...account,
                code: '572',
                name: 'بضاعة تالفة',
                parentId: 'acc_inventory_adjustments',
                type: 'EXPENSE',
                isGroup: undefined,
                currency: account.currency || baseCurrency
              };
            }
            return account;
          });
        }
        if (shouldNormalizePartnerParents) {
          next = next.map(account => {
            if (account.id === 'acc_partners_accounts_group') {
              return {
                ...account,
                code: '33',
                name: 'حسابات الشركاء',
                parentId: 'acc_equity_root',
                type: 'EQUITY',
                isGroup: true,
                currency: account.currency || baseCurrency
              };
            }
            if (account.id === 'acc_partners_capital') {
              return {
                ...account,
                code: '331',
                name: 'رأس مال الشركاء',
                parentId: 'acc_partners_accounts_group',
                type: 'EQUITY',
                isGroup: true,
                currency: account.currency || baseCurrency
              };
            }
            if (account.id === 'acc_partner_current') {
              return {
                ...account,
                code: '332',
                name: 'جاري الشركاء',
                parentId: 'acc_partners_accounts_group',
                type: 'EQUITY',
                isGroup: true,
                currency: account.currency || baseCurrency
              };
            }
            if (account.id === 'acc_partner_drawings') {
              return {
                ...account,
                code: '333',
                name: 'مسحوبات الشركاء',
                parentId: 'acc_partners_accounts_group',
                type: 'EQUITY',
                isGroup: true,
                currency: account.currency || baseCurrency
              };
            }
            return account;
          });
        }
        return next;
      });
    }
    migrationAccountsEnsuredRef.current.add(companyKey);
  }, [currentCompanyId, workspaceHydratedForCompanyId, baseCurrency]); // Depend on length to avoid infinite loop with simple dependency, but ideally run once or check existence safely

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationEmployeeAdvancesRef.current.has(companyKey)) return;
    migrationEmployeeAdvancesRef.current.add(companyKey);
    const employeeAdvancesAccount = accounts.find(a => a.id === 'acc_employee_advances' && !a.isGroup);
    if (!employeeAdvancesAccount) return;

    setTransactions(prev => {
      let changed = false;
      const next = prev.map(transaction => {
        let debitAccountId = transaction.debitAccountId;
        let creditAccountId = transaction.creditAccountId;
        if (transaction.category === 'employee_advance' && debitAccountId === 'acc_receivable') {
          debitAccountId = employeeAdvancesAccount.id;
        }
        if (transaction.category === 'employee_payment_received' && creditAccountId === 'acc_receivable') {
          creditAccountId = employeeAdvancesAccount.id;
        }
        if (
          transaction.category === 'employee_deduction' &&
          creditAccountId === 'acc_receivable' &&
          transaction.employeeId &&
          /تسوية|settlement/i.test(String(transaction.description || ''))
        ) {
          creditAccountId = employeeAdvancesAccount.id;
        }
        if (debitAccountId !== transaction.debitAccountId || creditAccountId !== transaction.creditAccountId) {
          changed = true;
          return { ...transaction, debitAccountId, creditAccountId };
        }
        return transaction;
      });
      return changed ? next : prev;
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  // Cleanup: remove legacy partner withdrawals account when unused.
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationLegacyPartnerRef.current.has(companyKey)) return;
    migrationLegacyPartnerRef.current.add(companyKey);
    const legacy = accounts.find(a => a.id === 'acc_partner_withdrawals');
    if (!legacy) return;

    const hasChildren = accounts.some(a => a.parentId === legacy.id);
    const hasMovements = transactions.some(t => t.debitAccountId === legacy.id || t.creditAccountId === legacy.id);
    const isLinkedToContact = contacts.some(c =>
      c.linkedAccountId === legacy.id ||
      c.currentAccountId === legacy.id ||
      c.capitalAccountId === legacy.id ||
      c.drawingsAccountId === legacy.id
    );
    if (hasChildren || hasMovements || isLinkedToContact) return;

    setAccounts(prev => prev.filter(a => a.id !== legacy.id));
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  // Cleanup: remove legacy opening balances branch and remap any postings to retained earnings.
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationOpeningBalancesRef.current.has(companyKey)) return;
    migrationOpeningBalancesRef.current.add(companyKey);
    const openingBranchIds = new Set(['acc_opening_balances_group', 'acc_opening_inventory']);
    const hasOpeningBranch = accounts.some(account => openingBranchIds.has(account.id));
    const hasOpeningChildren = accounts.some(account => account.parentId === 'acc_opening_balances_group');
    if (!hasOpeningBranch && !hasOpeningChildren) return;

    const targetAccount = accounts.find(account => account.id === 'acc_retained_earnings' && !account.isGroup)
      || accounts.find(account => account.id === 'acc_capital' && !account.isGroup);
    if (!targetAccount) return;

    const affectedTransactions = transactions.reduce((count, tx) => {
      const touched = openingBranchIds.has(String(tx.debitAccountId || '')) || openingBranchIds.has(String(tx.creditAccountId || ''));
      return touched ? count + 1 : count;
    }, 0);

    if (affectedTransactions > 0) {
      setTransactions(prev => {
        let changed = false;
        const next = prev.map(tx => {
          const nextDebit = openingBranchIds.has(String(tx.debitAccountId || '')) ? targetAccount.id : tx.debitAccountId;
          const nextCredit = openingBranchIds.has(String(tx.creditAccountId || '')) ? targetAccount.id : tx.creditAccountId;
          if (nextDebit !== tx.debitAccountId || nextCredit !== tx.creditAccountId) {
            changed = true;
            return { ...tx, debitAccountId: nextDebit, creditAccountId: nextCredit };
          }
          return tx;
        });
        return changed ? next : prev;
      });
    }

    setAccounts(prev => {
      let changed = false;
      const reparented = prev.map(account => {
        if (account.parentId === 'acc_opening_balances_group' && !openingBranchIds.has(account.id)) {
          changed = true;
          return { ...account, parentId: 'acc_equity_root' };
        }
        return account;
      });
      const filtered = reparented.filter(account => !openingBranchIds.has(account.id));
      if (filtered.length !== prev.length) changed = true;
      return changed ? filtered : prev;
    });

    appendAuditLog({
      entityType: 'account',
      action: 'REMOVE_OPENING_BALANCES_BRANCH',
      screen: 'System Migration',
      metadata: {
        removedAccountIds: Array.from(openingBranchIds),
        targetAccountId: targetAccount.id,
        remappedTransactionsCount: affectedTransactions
      }
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  // Migration: merge legacy "profit distribution" account(s) into retained earnings, then delete them.
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationProfitDistRef.current.has(companyKey)) return;
    migrationProfitDistRef.current.add(companyKey);
    const retained = accounts.find(a => a.id === 'acc_retained_earnings' && !a.isGroup);
    if (!retained) return;

    const legacyCandidates = accounts.filter(account => {
      if (account.id === retained.id) return false;
      if (account.id === 'acc_profit_distribution') return true;
      if (account.type !== 'EQUITY' || account.isGroup) return false;
      const name = String(account.name || '').toLowerCase();
      return account.code === '34' || name.includes('توزيع الأرباح') || name.includes('profit distribution');
    });
    if (legacyCandidates.length === 0) return;

    const legacyIds = new Set(legacyCandidates.map(a => a.id));
    const remappedTransactionsCount = transactions.reduce((count, tx) => {
      const touched = legacyIds.has(String(tx.debitAccountId || '')) || legacyIds.has(String(tx.creditAccountId || ''));
      return touched ? count + 1 : count;
    }, 0);

    setTransactions(prev => {
      let changed = false;
      const next = prev.map(tx => {
        const nextDebit = legacyIds.has(String(tx.debitAccountId || '')) ? retained.id : tx.debitAccountId;
        const nextCredit = legacyIds.has(String(tx.creditAccountId || '')) ? retained.id : tx.creditAccountId;
        if (nextDebit !== tx.debitAccountId || nextCredit !== tx.creditAccountId) {
          changed = true;
          return { ...tx, debitAccountId: nextDebit, creditAccountId: nextCredit };
        }
        return tx;
      });
      return changed ? next : prev;
    });

    const reparentTarget = retained.parentId || 'acc_equity_root';
    setAccounts(prev => {
      let changed = false;
      const reparented = prev.map(account => {
        if (legacyIds.has(account.id)) {
          changed = true;
          return account;
        }
        if (legacyIds.has(String(account.parentId || ''))) {
          changed = true;
          return { ...account, parentId: reparentTarget };
        }
        return account;
      });
      const filtered = reparented.filter(account => !legacyIds.has(account.id));
      return changed ? filtered : prev;
    });

    appendAuditLog({
      entityType: 'account',
      action: 'MERGE_LEGACY_PROFIT_DISTRIBUTION',
      screen: 'System Migration',
      metadata: {
        legacyAccountIds: Array.from(legacyIds),
        targetAccountId: retained.id,
        remappedTransactionsCount
      }
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  // MIGRATION: Ensure every fixed asset group is linked to accounts in COA
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationAssetGroupsRef.current.has(companyKey)) return;
    setAssetGroups(prev => {
      let hasChanges = false;

      const normalizedGroups = prev.map(group => {
        const assetAccountId = group.assetAccountId || defaultAssetGroupAccountMap[group.id] || 'acc_fixed_assets_root';
        const accumulatedDepreciationAccountId = group.accumulatedDepreciationAccountId || 'acc_accumulated_depreciation';
        const depreciationExpenseAccountId = group.depreciationExpenseAccountId || 'acc_depreciation_exp';

        if (
          assetAccountId !== group.assetAccountId ||
          accumulatedDepreciationAccountId !== group.accumulatedDepreciationAccountId ||
          depreciationExpenseAccountId !== group.depreciationExpenseAccountId
        ) {
          hasChanges = true;
        }

        return {
          ...group,
          assetAccountId,
          accumulatedDepreciationAccountId,
          depreciationExpenseAccountId
        };
      });

      return hasChanges ? normalizedGroups : prev;
    });
    migrationAssetGroupsRef.current.add(companyKey);
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  // MIGRATION: Backfill HR contracts and salary history for existing employees.
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationHrBackfillRef.current.has(companyKey)) return;
    migrationHrBackfillRef.current.add(companyKey);
    if (!employees.length) return;

    setEmployeeContracts(prev => {
      const existingByEmployee = new Set(prev.map(c => c.employeeId));
      const missing = employees
        .filter(emp => !existingByEmployee.has(emp.id))
        .map(emp => {
          const snapshot = buildEmployeeSalarySnapshot(emp);
          const contract: EmployeeContract = {
            id: newId('empctr'),
            employeeId: emp.id,
            contractType: 'OPEN_ENDED',
            startDate: emp.hireDate || new Date().toISOString().slice(0, 10),
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            title: emp.position || undefined,
            annualLeaveEntitlementDays: emp.annualLeaveEntitlementDays,
            ...snapshot
          };
          return contract;
        });
      return missing.length ? [...prev, ...missing] : prev;
    });

    setSalaryHistory(prev => {
      const existingByEmployee = new Set(prev.map(h => h.employeeId));
      const missing = employees
        .filter(emp => !existingByEmployee.has(emp.id))
        .map(emp => ({
          id: newId('salaryhist'),
          employeeId: emp.id,
          date: emp.hireDate || new Date().toISOString().slice(0, 10),
          source: 'EMPLOYEE_FORM' as const,
          action: 'EMPLOYEE_CREATED' as const,
          after: buildEmployeeSalarySnapshot(emp),
          note: 'Backfilled baseline record'
        }));
      return missing.length ? [...prev, ...missing] : prev;
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);


  const summary: FinancialSummary = useMemo(() => {
    const totalIncome = transactions.filter(t => t.type === 'INCOME' && t.status !== 'DRAFT' && t.category !== 'voucher_receipt' && t.category !== 'supplier_debit_note').reduce((sum, t) => sum + (t.amount * (t.exchangeRate || 1)), 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE' && t.status !== 'DRAFT' && t.category !== 'voucher_payment' && t.category !== 'customer_credit_note').reduce((sum, t) => sum + (t.amount * (t.exchangeRate || 1)), 0);
    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense
    };
  }, [transactions]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (autoFiscalPostingCheckedRef.current.has(companyKey)) return;
    if (autoFiscalPostingInFlightRef.current) return;
    autoFiscalPostingCheckedRef.current.add(companyKey);

    const autoCloseEnabled = companySettings.autoFiscalYearCloseEntries !== false;
    const autoOpeningEnabled = companySettings.autoFiscalYearOpeningEntries !== false;
    if (!autoCloseEnabled && !autoOpeningEnabled) return;

    const retainedAccount =
      accounts.find(acc => acc.id === 'acc_retained_earnings' && !acc.isGroup)
      || accounts.find(acc => acc.id === 'acc_capital' && !acc.isGroup);
    if (!retainedAccount) return;

    const postingAccounts = accounts.filter(acc => !acc.isGroup);
    if (postingAccounts.length === 0) return;
    const accountById = new Map<string, Account>(postingAccounts.map(acc => [acc.id, acc]));
    const round2 = (value: number) => Number((Number(value) || 0).toFixed(2));
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    const isPostedWithIsoDate = (tx: Transaction) =>
      (tx.status || 'POSTED') !== 'DRAFT' && isoDateRe.test(String(tx.date || ''));

    const postedTransactions = transactions.filter(isPostedWithIsoDate);
    if (postedTransactions.length === 0) return;

    const years = postedTransactions
      .map(tx => Number(String(tx.date).slice(0, 4)))
      .filter(year => Number.isInteger(year) && year >= 1900 && year <= 3000);
    if (years.length === 0) return;

    const firstYear = Math.min(...years);
    const latestClosableYear = new Date().getFullYear() - 1;
    if (latestClosableYear < firstYear) return;

    const entriesToAppend: Transaction[] = [];
    const yearlySummary: Array<{ year: number; closeEntries: number; openingEntries: number }> = [];
    const addBucket = (map: Map<string, { debit: number; credit: number }>, accountId: string, debit: number, credit: number) => {
      const current = map.get(accountId) || { debit: 0, credit: 0 };
      current.debit = round2(current.debit + (Number(debit) || 0));
      current.credit = round2(current.credit + (Number(credit) || 0));
      map.set(accountId, current);
    };

    for (let year = firstYear; year <= latestClosableYear; year += 1) {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const nextYearStart = `${year + 1}-01-01`;
      const closeVoucherId = `YEC-${year}`;
      const openingVoucherId = `YOP-${year + 1}`;

      const closeAlreadyExists = transactions.some(tx => tx.voucherId === closeVoucherId);
      const openingAlreadyExists = transactions.some(tx => tx.voucherId === openingVoucherId);

      const yearCloseEntries: Transaction[] = [];
      if (autoCloseEnabled && !closeAlreadyExists) {
        const plByAccount = new Map<string, { debit: number; credit: number }>();
        postedTransactions.forEach(tx => {
          if (tx.date < yearStart || tx.date > yearEnd) return;
          const amountBase = round2((Number(tx.amount) || 0) * (Number(tx.exchangeRate) || 1));
          if (amountBase <= 0) return;

          const debitAccount = tx.debitAccountId ? accountById.get(tx.debitAccountId) : undefined;
          if (debitAccount && isProfitLossAccount(debitAccount.type)) {
            addBucket(plByAccount, debitAccount.id, amountBase, 0);
          }

          const creditAccount = tx.creditAccountId ? accountById.get(tx.creditAccountId) : undefined;
          if (creditAccount && isProfitLossAccount(creditAccount.type)) {
            addBucket(plByAccount, creditAccount.id, 0, amountBase);
          }
        });

        plByAccount.forEach((bucket, accountId) => {
          const account = accountById.get(accountId);
          if (!account) return;
          const net = account.type === 'EXPENSE'
            ? round2(bucket.debit - bucket.credit)
            : round2(bucket.credit - bucket.debit);
          const amount = round2(Math.abs(net));
          if (amount <= 0.009) return;

          let debitAccountId = '';
          let creditAccountId = '';
          if (account.type === 'REVENUE') {
            if (net >= 0) {
              debitAccountId = account.id;
              creditAccountId = retainedAccount.id;
            } else {
              debitAccountId = retainedAccount.id;
              creditAccountId = account.id;
            }
          } else {
            if (net >= 0) {
              debitAccountId = retainedAccount.id;
              creditAccountId = account.id;
            } else {
              debitAccountId = account.id;
              creditAccountId = retainedAccount.id;
            }
          }

          yearCloseEntries.push({
            id: newId('tx'),
            voucherId: closeVoucherId,
            amount,
            description: `Auto year-end close ${year} - ${account.name}`,
            category: 'journal',
            type: TransactionType.TRANSFER,
            date: yearEnd,
            debitAccountId,
            creditAccountId,
            currency: baseCurrency,
            exchangeRate: 1,
            status: 'POSTED'
          });
        });
      }

      const simulatedUpToYearEnd = [
        ...postedTransactions.filter(tx => tx.date <= yearEnd),
        ...yearCloseEntries
      ];

      const yearOpeningEntries: Transaction[] = [];
      if (autoOpeningEnabled && !openingAlreadyExists) {
        const bsByAccount = new Map<string, { debit: number; credit: number }>();
        simulatedUpToYearEnd.forEach(tx => {
          const amountBase = round2((Number(tx.amount) || 0) * (Number(tx.exchangeRate) || 1));
          if (amountBase <= 0) return;

          const debitAccount = tx.debitAccountId ? accountById.get(tx.debitAccountId) : undefined;
          if (debitAccount && !isProfitLossAccount(debitAccount.type)) {
            addBucket(bsByAccount, debitAccount.id, amountBase, 0);
          }

          const creditAccount = tx.creditAccountId ? accountById.get(tx.creditAccountId) : undefined;
          if (creditAccount && !isProfitLossAccount(creditAccount.type)) {
            addBucket(bsByAccount, creditAccount.id, 0, amountBase);
          }
        });

        bsByAccount.forEach((bucket, accountId) => {
          const account = accountById.get(accountId);
          if (!account || account.id === retainedAccount.id) return;

          const isDebitNature = account.type === 'ASSET';
          const net = isDebitNature
            ? round2(bucket.debit - bucket.credit)
            : round2(bucket.credit - bucket.debit);
          const amount = round2(Math.abs(net));
          if (amount <= 0.009) return;

          let debitAccountId = '';
          let creditAccountId = '';
          if (account.type === 'ASSET') {
            if (net >= 0) {
              debitAccountId = account.id;
              creditAccountId = retainedAccount.id;
            } else {
              debitAccountId = retainedAccount.id;
              creditAccountId = account.id;
            }
          } else {
            if (net >= 0) {
              debitAccountId = retainedAccount.id;
              creditAccountId = account.id;
            } else {
              debitAccountId = account.id;
              creditAccountId = retainedAccount.id;
            }
          }

          yearOpeningEntries.push({
            id: newId('tx'),
            voucherId: openingVoucherId,
            amount,
            description: `Auto opening ${year + 1} - ${account.name}`,
            category: 'journal',
            type: TransactionType.TRANSFER,
            date: nextYearStart,
            debitAccountId,
            creditAccountId,
            currency: baseCurrency,
            exchangeRate: 1,
            status: 'POSTED'
          });
        });
      }

      if (yearCloseEntries.length > 0 || yearOpeningEntries.length > 0) {
        entriesToAppend.push(...yearCloseEntries, ...yearOpeningEntries);
        yearlySummary.push({
          year,
          closeEntries: yearCloseEntries.length,
          openingEntries: yearOpeningEntries.length
        });
      }
    }

    if (entriesToAppend.length === 0) return;

    autoFiscalPostingInFlightRef.current = true;
    setTransactions(prev => [...entriesToAppend, ...prev]);
    appendAuditLog({
      entityType: 'fiscal_close',
      action: 'AUTO_POST',
      screen: 'System',
      metadata: {
        companyId: currentCompanyId,
        years: yearlySummary,
        generatedEntries: entriesToAppend.length
      }
    });
    Promise.resolve().then(() => {
      autoFiscalPostingInFlightRef.current = false;
    });
  }, [
    currentCompanyId,
    workspaceHydratedForCompanyId,
    transactions,
    accounts,
    companySettings.autoFiscalYearCloseEntries,
    companySettings.autoFiscalYearOpeningEntries,
    baseCurrency
  ]);

  const resolveTxModule = (tx: Pick<Transaction, 'category'>): PermissionModule => {
    const category = tx.category || '';
    if (category === 'sales_invoice' || category === 'sales_return' || category === 'customer_credit_note') return 'SALES';
    if (category === 'purchase_invoice' || category === 'purchase_return' || category === 'expense' || category === 'supplier_debit_note') return 'PURCHASES';
    if (category === 'receipt' || category === 'payment' || category === 'voucher_receipt' || category === 'voucher_payment') return 'VOUCHERS';
    if (category === 'bank_reconciliation') return 'BANK_RECON';
    if (category === 'settlement') return 'SETTLEMENTS';
    return 'JOURNAL';
  };

  const resolveInvoiceModule = (invoice: Pick<Invoice, 'type' | 'category'>): PermissionModule => {
    if (invoice.category === 'sales_return' || invoice.category === 'customer_credit_note' || invoice.type === TransactionType.INCOME) return 'SALES';
    return 'PURCHASES';
  };

  const commitTransaction = (
    t: Omit<Transaction, 'id'>,
    accountSnapshot: Account[] = getActiveAccounts()
  ): MutationResult => {
    const validation = validateTransactionInput(t);
    if (validation.length > 0) {
      appendAuditLog({
        entityType: 'transaction',
        action: 'CREATE_REJECTED',
        screen: 'Accounting',
        metadata: { issues: validation }
      });
      return makeError('VALIDATION_ERROR', validation[0].message);
    }

    const debitAccount = accountSnapshot.find(a => a.id === t.debitAccountId);
    if (!debitAccount) {
      appendAuditLog({
        entityType: 'transaction',
        action: 'CREATE_REJECTED',
        screen: 'Accounting',
        metadata: { reason: 'DEBIT_ACCOUNT_NOT_FOUND', debitAccountId: t.debitAccountId }
      });
      return makeError('VALIDATION_ERROR', 'Debit account does not exist.');
    }
    if (debitAccount.isGroup) {
      appendAuditLog({
        entityType: 'transaction',
        action: 'CREATE_REJECTED',
        screen: 'Accounting',
        metadata: { reason: 'DEBIT_ACCOUNT_GROUP', debitAccountId: t.debitAccountId }
      });
      return makeError('VALIDATION_ERROR', 'Debit account must be a posting account.');
    }

    const creditAccount = accountSnapshot.find(a => a.id === t.creditAccountId);
    if (!creditAccount) {
      appendAuditLog({
        entityType: 'transaction',
        action: 'CREATE_REJECTED',
        screen: 'Accounting',
        metadata: { reason: 'CREDIT_ACCOUNT_NOT_FOUND', creditAccountId: t.creditAccountId }
      });
      return makeError('VALIDATION_ERROR', 'Credit account does not exist.');
    }
    if (creditAccount.isGroup) {
      appendAuditLog({
        entityType: 'transaction',
        action: 'CREATE_REJECTED',
        screen: 'Accounting',
        metadata: { reason: 'CREDIT_ACCOUNT_GROUP', creditAccountId: t.creditAccountId }
      });
      return makeError('VALIDATION_ERROR', 'Credit account must be a posting account.');
    }

    const created: Transaction = {
      ...t,
      id: newId('tx'),
      status: t.status || 'POSTED'
    };

    const journalDateLockEnabled = companySettings.journalDateLockEnabled === true;
    const dateInRange = (dateIso?: string) => {
      if (!journalDateLockEnabled) return true;
      const raw = String(dateIso || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
      const from = String(companySettings.journalDateLockFrom || '').trim();
      const to = String(companySettings.journalDateLockTo || '').trim();
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from) && raw < from) return false;
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to) && raw > to) return false;
      return true;
    };
    if (created.status !== 'DRAFT' && !dateInRange(created.date)) {
      appendAuditLog({
        entityType: 'transaction',
        action: 'CREATE_REJECTED',
        screen: 'Accounting',
        metadata: {
          reason: 'POSTING_DATE_OUT_OF_LOCKED_PERIOD',
          category: created.category,
          status: created.status,
          date: created.date,
          from: companySettings.journalDateLockFrom || null,
          to: companySettings.journalDateLockTo || null
        }
      });
      return makeError('VALIDATION_ERROR', 'Posting date is outside the locked allowed period.');
    }

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const path = `users/${currentUser.id}/companies/${currentCompanyId}/transactions/${created.id}`;
        const cleanTx = JSON.parse(JSON.stringify(created));
        withTimeout(
          executeFirestoreWrite(fbUser, [{ type: 'set', path, data: cleanTx }]),
          15000,
          'انتهت مهلة حفظ الحركة في السحابة.'
        ).catch(err => {
          console.error('Direct Firestore write failed for transaction:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل حفظ الحركة على السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    setTransactions(prev => [created, ...prev]);
    appendAuditLog({
      entityType: 'transaction',
      entityId: created.id,
      action: 'CREATE',
      screen: 'Accounting',
      after: safeClone(created)
    });
    return makeSuccess();
  };

  const addTransaction = (t: Omit<Transaction, 'id'>): MutationResult => (
    commitTransaction(t, getActiveAccounts())
  );

  const isAutoCommercialSubAccountType = (type: Contact['type']): type is CommercialSubAccountContactType =>
    type === 'CUSTOMER' || type === 'SUPPLIER';

  const shouldAutoCreateCommercialSubAccount = (contactId: string, type: Contact['type']) =>
    type === 'SUPPLIER' && !/^cash_/i.test(String(contactId || '').trim());

  const getUnifiedCommercialPostingAccountId = (type: Contact['type']) => (
    type === 'CUSTOMER' ? 'acc_receivable' : type === 'SUPPLIER' ? 'acc_payable' : ''
  );

  const getCommercialAccountTemplate = (
    type: CommercialSubAccountContactType,
    contactName: string
  ) => ({
    rootId: type === 'CUSTOMER' ? 'acc_receivable_group' : 'acc_payable_group',
    fallbackId: type === 'CUSTOMER' ? 'acc_receivable' : 'acc_payable',
    idPrefix: type === 'CUSTOMER' ? 'acc_receivable' : 'acc_payable',
    accountType: (type === 'CUSTOMER' ? 'ASSET' : 'LIABILITY') as AccountType,
    expectedName: type === 'CUSTOMER'
      ? `ذمم العميل ${contactName}`
      : `ذمم المورد ${contactName}`
  });

  const ensureCommercialContactSubAccountSnapshot = (
    sourceAccounts: Account[],
    contactId: string,
    contactName: string,
    type: CommercialSubAccountContactType,
    preferredId?: string
  ): EnsuredCommercialSubAccountResult => {
    const safeContactId = sanitizePartnerAccountId(contactId) || newId(type === 'CUSTOMER' ? 'customer' : 'supplier');
    const normalizedName = String(contactName || '').trim() || safeContactId;
    const template = getCommercialAccountTemplate(type, normalizedName);
    const parent = sourceAccounts.find(a => a.id === template.rootId);

    const usedCodes = new Set<string>(sourceAccounts.map(a => a.code));
    const patches = new Map<string, Partial<Account>>();
    const additions: Account[] = [];

    const prepareExistingAccount = (account: Account) => {
      if (!parent || account.parentId !== parent.id) return account.id;
      const patch: Partial<Account> = {};
      if (account.name !== template.expectedName) patch.name = template.expectedName;
      if (account.parentId !== parent.id) patch.parentId = parent.id;
      if (account.type !== template.accountType) patch.type = template.accountType;
      if (account.currency !== baseCurrency) patch.currency = baseCurrency;
      if (account.isGroup) patch.isGroup = undefined;
      if (Object.keys(patch).length > 0) patches.set(account.id, patch);
      return account.id;
    };

    const preferredAccount = preferredId && preferredId !== template.fallbackId
      ? sourceAccounts.find(a => a.id === preferredId && !a.isGroup)
      : undefined;
    if (preferredAccount) {
      const linkedAccountId = prepareExistingAccount(preferredAccount);
      const accountSnapshot = patches.size > 0
        ? sourceAccounts.map(account => {
          const patch = patches.get(account.id);
          return patch ? { ...account, ...patch } : account;
        })
        : sourceAccounts;
      return {
        linkedAccountId,
        accountSnapshot,
        changed: accountSnapshot !== sourceAccounts
      };
    }

    const targetId = `${template.idPrefix}_${safeContactId}`;
    const existing = sourceAccounts.find(a => a.id === targetId);
    if (existing && !existing.isGroup) {
      const linkedAccountId = prepareExistingAccount(existing);
      const accountSnapshot = patches.size > 0
        ? sourceAccounts.map(account => {
          const patch = patches.get(account.id);
          return patch ? { ...account, ...patch } : account;
        })
        : sourceAccounts;
      return {
        linkedAccountId,
        accountSnapshot,
        changed: accountSnapshot !== sourceAccounts
      };
    }

    if (!parent) {
      return {
        linkedAccountId: preferredId || template.fallbackId,
        accountSnapshot: sourceAccounts,
        changed: false
      };
    }

    additions.push({
      id: targetId,
      code: buildPartnerChildCode(parent.code, safeContactId, usedCodes),
      name: template.expectedName,
      type: template.accountType,
      balance: 0,
      parentId: parent.id,
      currency: baseCurrency
    });

    return {
      linkedAccountId: targetId,
      accountSnapshot: [...sourceAccounts, ...additions],
      changed: true
    };
  };

  const ensureCommercialContactSubAccount = (
    contactId: string,
    contactName: string,
    type: CommercialSubAccountContactType,
    preferredId?: string
  ): { linkedAccountId: string } => {
    const activeAccs = getActiveAccounts();
    const prepared = ensureCommercialContactSubAccountSnapshot(activeAccs, contactId, contactName, type, preferredId);
    if (prepared.changed) {
      activeAccountsRef.current = prepared.accountSnapshot;
      setAccounts(prev => {
        const next = ensureCommercialContactSubAccountSnapshot(prev, contactId, contactName, type, preferredId);
        return next.changed ? next.accountSnapshot : prev;
      });
    }
    return { linkedAccountId: prepared.linkedAccountId };
  };

  const ensurePartnerEquitySubAccountsSnapshot = (
    sourceAccounts: Account[],
    contactId: string,
    contactName: string,
    preferred?: PartnerAccountPreference
  ): EnsuredPartnerEquityAccountsResult => {
    const safeContactId = sanitizePartnerAccountId(contactId) || newId('partner');
    const partnerName = String(contactName || '').trim() || safeContactId;

    const parentCurrent = sourceAccounts.find(a => a.id === 'acc_partner_current');
    const parentCapital = sourceAccounts.find(a => a.id === 'acc_partners_capital');
    const parentDrawings = sourceAccounts.find(a => a.id === 'acc_partner_drawings');

    const usedCodes = new Set<string>(sourceAccounts.map(a => a.code));
    const patches = new Map<string, Partial<Account>>();
    const additions: Account[] = [];

    const ensureChild = (opts: {
      id: string;
      expectedName: string;
      parent?: Account;
      fallbackId: string;
      preferredId?: string;
    }) => {
      const preferredAccount = opts.preferredId ? sourceAccounts.find(a => a.id === opts.preferredId) : undefined;
      if (preferredAccount) {
        if (opts.parent && preferredAccount.parentId === opts.parent.id && preferredAccount.name !== opts.expectedName) {
          patches.set(preferredAccount.id, { name: opts.expectedName });
        }
        return preferredAccount.id;
      }

      const existing = sourceAccounts.find(a => a.id === opts.id);
      if (existing) {
        if (opts.parent) {
          const patch: Partial<Account> = {};
          if (existing.name !== opts.expectedName) patch.name = opts.expectedName;
          if (existing.parentId !== opts.parent.id) patch.parentId = opts.parent.id;
          if (existing.type !== 'EQUITY') patch.type = 'EQUITY';
          if (existing.currency !== baseCurrency) patch.currency = baseCurrency;
          if (existing.isGroup) patch.isGroup = undefined;
          if (Object.keys(patch).length > 0) patches.set(existing.id, patch);
        }
        return existing.id;
      }

      if (!opts.parent) {
        return opts.preferredId || opts.fallbackId;
      }

      additions.push({
        id: opts.id,
        code: buildPartnerChildCode(opts.parent.code, safeContactId, usedCodes),
        name: opts.expectedName,
        type: 'EQUITY',
        balance: 0,
        parentId: opts.parent.id,
        currency: baseCurrency
      });
      return opts.id;
    };

    const currentAccountId = ensureChild({
      id: `acc_partner_current_${safeContactId}`,
      expectedName: `جاري ${partnerName}`,
      parent: parentCurrent,
      fallbackId: 'acc_partner_current',
      preferredId: preferred?.currentAccountId
    });
    const capitalAccountId = ensureChild({
      id: `acc_partner_capital_${safeContactId}`,
      expectedName: `رأس مال ${partnerName}`,
      parent: parentCapital,
      fallbackId: 'acc_partners_capital',
      preferredId: preferred?.capitalAccountId
    });


    let accountSnapshot = sourceAccounts;
    if (patches.size > 0 || additions.length > 0) {
      accountSnapshot = sourceAccounts.map(account => {
        const patch = patches.get(account.id);
        return patch ? { ...account, ...patch } : account;
      });
      if (additions.length > 0) {
        const existingIds = new Set(accountSnapshot.map(a => a.id));
        accountSnapshot = [...accountSnapshot, ...additions.filter(a => !existingIds.has(a.id))];
      }
    }

    return {
      currentAccountId,
      capitalAccountId,
      accountSnapshot,
      changed: accountSnapshot !== sourceAccounts
    };
  };

  const resolvePartnerPostingAccounts = (partnerId: string, partnerName?: string) => {
    const partnerContact = contacts.find(c => c.id === partnerId && c.type === 'PARTNER');
    const resolvedName = partnerName || partnerContact?.name || String(partnerId || '').trim() || 'Partner';
    const activeAccs = getActiveAccounts();
    const prepared = ensurePartnerEquitySubAccountsSnapshot(activeAccs, partnerId, resolvedName, {
      currentAccountId: partnerContact?.currentAccountId || partnerContact?.linkedAccountId,
      capitalAccountId: partnerContact?.capitalAccountId
    });
    if (prepared.changed) {
      activeAccountsRef.current = prepared.accountSnapshot;
      setAccounts(prev => {
        const next = ensurePartnerEquitySubAccountsSnapshot(prev, partnerId, resolvedName, {
          currentAccountId: partnerContact?.currentAccountId || partnerContact?.linkedAccountId,
          capitalAccountId: partnerContact?.capitalAccountId
        });
        return next.changed ? next.accountSnapshot : prev;
      });
    }
    const ensured = {
      currentAccountId: prepared.currentAccountId,
      capitalAccountId: prepared.capitalAccountId
    };
    return { partnerContact, resolvedName, ensured, accountSnapshot: prepared.accountSnapshot };
  };

  const postPartnerCapitalContribution = (input: PartnerCapitalContributionInput): MutationResult => {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (!input.partnerId || amount <= 0 || !input.fundingAccountId || !input.date) {
      return makeError('VALIDATION_ERROR', 'Partner capital contribution input is invalid.');
    }

    const fundingAccount = accounts.find(a => a.id === input.fundingAccountId);
    if (!fundingAccount || fundingAccount.isGroup) {
      return makeError('VALIDATION_ERROR', 'Funding account is missing or non-posting.');
    }

    const { resolvedName, ensured, accountSnapshot } = resolvePartnerPostingAccounts(input.partnerId, input.partnerName);
    
    const isReduction = !!input.isReduction;
    const descPrefix = isReduction ? 'Partner capital reduction' : 'Partner capital contribution';
    
    return commitTransaction({
      amount: Number(amount.toFixed(2)),
      description: `${descPrefix} - ${resolvedName}${input.note ? ` - ${input.note}` : ''}`,
      category: 'partner_capital',
      type: TransactionType.TRANSFER,
      date: input.date,
      debitAccountId: isReduction ? ensured.capitalAccountId : input.fundingAccountId,
      creditAccountId: isReduction ? input.fundingAccountId : ensured.capitalAccountId,
      contactId: input.partnerId,
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    }, accountSnapshot);
  };

  const postPartnerCurrentReceipt = (input: PartnerCurrentReceiptInput): MutationResult => {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (!input.partnerId || amount <= 0 || !input.fundingAccountId || !input.date) {
      return makeError('VALIDATION_ERROR', 'Partner receipt input is invalid.');
    }

    const fundingAccount = accounts.find(a => a.id === input.fundingAccountId);
    if (!fundingAccount || fundingAccount.isGroup) {
      return makeError('VALIDATION_ERROR', 'Funding account is missing or non-posting.');
    }

    const { resolvedName, ensured, accountSnapshot } = resolvePartnerPostingAccounts(input.partnerId, input.partnerName);
    return commitTransaction({
      amount: Number(amount.toFixed(2)),
      description: `Partner current receipt - ${resolvedName}${input.note ? ` - ${input.note}` : ''}`,
      category: 'partner_current_receipt',
      type: TransactionType.TRANSFER,
      date: input.date,
      debitAccountId: input.fundingAccountId,
      creditAccountId: ensured.currentAccountId,
      contactId: input.partnerId,
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    }, accountSnapshot);
  };

  const postPartnerCashDisbursement = (input: PartnerCashDisbursementInput): MutationResult => {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (!input.partnerId || amount <= 0 || !input.fundingAccountId || !input.date) {
      return makeError('VALIDATION_ERROR', 'Partner disbursement input is invalid.');
    }

    const fundingAccount = accounts.find(a => a.id === input.fundingAccountId);
    if (!fundingAccount || fundingAccount.isGroup) {
      return makeError('VALIDATION_ERROR', 'Funding account is missing or non-posting.');
    }

    const { resolvedName, ensured, accountSnapshot } = resolvePartnerPostingAccounts(input.partnerId, input.partnerName);

    return commitTransaction({
      amount: Number(amount.toFixed(2)),
      description: `Partner cash disbursement - ${resolvedName}${input.note ? ` - ${input.note}` : ''}`,
      category: 'partner_current_payment',
      type: TransactionType.TRANSFER,
      date: input.date,
      debitAccountId: ensured.currentAccountId,
      creditAccountId: input.fundingAccountId,
      contactId: input.partnerId,
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    }, accountSnapshot);
  };

  const addImportExpenseDistribution = (record: Omit<ImportExpenseDistribution, 'id'>): MutationResult => {
    const created: ImportExpenseDistribution = {
      ...record,
      id: newId('impdist'),
      lines: Array.isArray(record.lines) ? record.lines : []
    };
    setImportExpenseDistributions(prev => [created, ...prev]);
    appendAuditLog({
      entityType: 'import_expense_distribution',
      entityId: created.id,
      action: 'CREATE',
      screen: 'Import Expenses Wizard',
      after: safeClone(created)
    });
    return makeSuccess();
  };

  const normalizeInvoiceStatusesWithSettlements = (
    targetSettlements: InvoiceSettlement[],
    targetInvoiceIds?: string[]
  ) => {
    const invoiceIdSet = targetInvoiceIds && targetInvoiceIds.length > 0 ? new Set(targetInvoiceIds) : null;
    setInvoices(prev => prev.map(inv => {
      if (inv.status === 'CANCELLED' || inv.status === 'QUOTATION') return inv;
      if (inv.paymentType !== 'CREDIT') return inv;
      if (inv.category === 'sales_return' || inv.category === 'purchase_return') return inv;
      if (invoiceIdSet && !invoiceIdSet.has(inv.id)) return inv;

      const remainingBase = getInvoiceRemainingBase(inv, targetSettlements);
      const nextStatus: Invoice['status'] = remainingBase <= 0.005 ? 'PAID' : 'PENDING';
      return nextStatus === inv.status ? inv : { ...inv, status: nextStatus };
    }));
  };

  const isAdjustmentNoticeCategory = (category?: string) =>
    category === 'customer_credit_note' || category === 'supplier_debit_note';

  const upsertInvoiceSettlementForAdjustmentNotice = (noteInvoice: Invoice): MutationResult => {
    if (!isAdjustmentNoticeCategory(noteInvoice.category)) return makeSuccess();

    const previousByVoucher = invoiceSettlements.filter(s => s.voucherId === noteInvoice.id);
    const impactedIds = new Set<string>(previousByVoucher.map(s => s.invoiceId));
    let nextSettlements = invoiceSettlements.filter(s => s.voucherId !== noteInvoice.id);

    if (
      noteInvoice.postingStatus === 'POSTED' &&
      noteInvoice.paymentType === 'CREDIT' &&
      noteInvoice.linkedInvoiceId
    ) {
      const targetInvoice = invoices.find(inv => inv.id === noteInvoice.linkedInvoiceId);
      if (targetInvoice) {
        impactedIds.add(targetInvoice.id);
        const noteAmount = Math.max(0, Number(noteInvoice.totalAmount) || 0);
        const noteRate = Math.max(0.0001, Number(noteInvoice.exchangeRate) || 1);
        const amountBaseRaw = Number((noteAmount * noteRate).toFixed(6));
        const remainingBase = getInvoiceRemainingBase(targetInvoice, nextSettlements);
        const amountBase = Number(Math.max(0, Math.min(amountBaseRaw, remainingBase)).toFixed(6));
        const amount = Number((amountBase / noteRate).toFixed(6));

        if (amount > 0 && amountBase > 0) {
          nextSettlements = [
            ...nextSettlements,
            {
              id: newId('invset'),
              invoiceId: targetInvoice.id,
              voucherId: noteInvoice.id,
              contactId: noteInvoice.customerId,
              date: noteInvoice.date,
              amount,
              amountBase,
              currency: noteInvoice.currency,
              exchangeRate: noteRate,
              sourceType: noteInvoice.category === 'customer_credit_note' ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
              note: noteInvoice.notes || `${noteInvoice.invoiceNumber}`
            }
          ];
        }
      }
    }

    setInvoiceSettlements(nextSettlements);
    if (impactedIds.size > 0) {
      normalizeInvoiceStatusesWithSettlements(nextSettlements, [...impactedIds]);
    }

    return makeSuccess();
  };

  const upsertInvoiceSettlementsForVoucher = (
    voucherId: string,
    allocations: Omit<InvoiceSettlement, 'id'>[]
  ): MutationResult => {
    const cleaned = (Array.isArray(allocations) ? allocations : [])
      .map(a => ({
        ...a,
        voucherId,
        amount: Math.max(0, Number(a.amount) || 0),
        amountBase: Math.max(0, Number(a.amountBase) || 0),
        exchangeRate: Math.max(0, Number(a.exchangeRate) || 0) || 1
      }))
      .filter(a => a.invoiceId && a.amount > 0 && a.amountBase > 0);

    const impactedIds = Array.from(new Set([
      ...invoiceSettlements.filter(s => s.voucherId === voucherId).map(s => s.invoiceId),
      ...cleaned.map(s => s.invoiceId)
    ]));

    const nextSettlements = [
      ...invoiceSettlements.filter(s => s.voucherId !== voucherId),
      ...cleaned.map(s => ({ ...s, id: newId('invset') }))
    ];

    setInvoiceSettlements(nextSettlements);
    normalizeInvoiceStatusesWithSettlements(nextSettlements, impactedIds);

    appendAuditLog({
      entityType: 'invoice_settlement',
      entityId: voucherId,
      action: 'UPSERT_VOUCHER_ALLOCATIONS',
      screen: 'Voucher Form',
      metadata: {
        voucherId,
        allocations: cleaned.length,
        invoiceIds: impactedIds
      }
    });
    return makeSuccess();
  };

  const updateTransaction = (id: string, updates: Partial<Transaction>): MutationResult => {
    const existing = transactions.find(t => t.id === id);
    if (!existing) {
      return makeError('VALIDATION_ERROR', 'Transaction not found.');
    }

    const permission = enforcePermission(resolveTxModule(existing), 'EDIT', 'Transactions');
    if (!permission.ok) return permission;

    if (existing.category === 'partner_capital' && existing.status === 'POSTED') {
      return buildPostedLockedResult('partner_capital', id);
    }

    if (strictPostedLockEnabled && existing.status === 'POSTED') {
      return buildPostedLockedResult('transaction', id);
    }

    if (
      companySettings.allowEditEntryDate === false &&
      existing.category === 'journal' &&
      typeof updates.date === 'string' &&
      updates.date !== existing.date
    ) {
      return makeError('VALIDATION_ERROR', 'Editing journal entry date is disabled in settings.');
    }

    if (
      companySettings.journalDateLockEnabled === true &&
      (existing.category === 'journal' || updates.category === 'journal')
    ) {
      const nextDate = typeof updates.date === 'string' ? updates.date : existing.date;
      const normalized = String(nextDate || '').trim();
      const from = String(companySettings.journalDateLockFrom || '').trim();
      const to = String(companySettings.journalDateLockTo || '').trim();
      const validIso = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
      const beforeFrom = !!(from && /^\d{4}-\d{2}-\d{2}$/.test(from) && normalized < from);
      const afterTo = !!(to && /^\d{4}-\d{2}-\d{2}$/.test(to) && normalized > to);
      if (!validIso || beforeFrom || afterTo) {
        appendAuditLog({
          entityType: 'transaction',
          entityId: id,
          action: 'UPDATE_REJECTED',
          screen: 'Transactions',
          metadata: {
            reason: 'JOURNAL_DATE_OUT_OF_LOCKED_PERIOD',
            existingDate: existing.date,
            requestedDate: nextDate,
            from: companySettings.journalDateLockFrom || null,
            to: companySettings.journalDateLockTo || null
          }
        });
        return makeError('VALIDATION_ERROR', 'Journal entry date is outside the locked allowed period.');
      }
    }

    const next = { ...existing, ...updates };

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const path = `users/${currentUser.id}/companies/${currentCompanyId}/transactions/${id}`;
        const cleanTx = JSON.parse(JSON.stringify(next));
        withTimeout(
          executeFirestoreWrite(fbUser, [{ type: 'set', path, data: cleanTx }]),
          15000,
          'انتهت مهلة تحديث الحركة في السحابة.'
        ).catch(err => {
          console.error('Direct Firestore write failed for transaction update:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل تحديث الحركة على السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    setTransactions(prev => prev.map(t => t.id === id ? next : t));
    appendAuditLog({
      entityType: 'transaction',
      entityId: id,
      action: 'UPDATE',
      screen: 'Transactions',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteTransaction = (id: string): MutationResult => {
    const existing = transactions.find(t => t.id === id);
    if (!existing) {
      return makeError('VALIDATION_ERROR', 'Transaction not found.');
    }

    const permission = enforcePermission(resolveTxModule(existing), 'DELETE', 'Transactions');
    if (!permission.ok) return permission;

    if (existing.category === 'partner_capital' && existing.status === 'POSTED') {
      return buildPostedLockedResult('partner_capital', id);
    }

    if (strictPostedLockEnabled && existing.status === 'POSTED') {
      return buildPostedLockedResult('transaction', id);
    }

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const path = `users/${currentUser.id}/companies/${currentCompanyId}/transactions/${id}`;
        withTimeout(
          executeFirestoreWrite(fbUser, [{ type: 'delete', path }]),
          15000,
          'انتهت مهلة حذف الحركة من السحابة.'
        ).catch(err => {
          console.error('Direct Firestore delete failed for transaction:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل حذف الحركة من السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    setTransactions(prev => prev.filter(t => t.id !== id));
    appendAuditLog({
      entityType: 'transaction',
      entityId: id,
      action: 'DELETE',
      screen: 'Transactions',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const postVoucher = (voucherId: string): MutationResult => {
    const permission = enforcePermission('VOUCHERS', 'POST', 'Voucher Manager');
    if (!permission.ok) return permission;

    const related = transactions.filter(t => t.voucherId === voucherId || t.id === voucherId);
    if (related.length === 0) return makeError('VALIDATION_ERROR', 'Voucher not found.');
    const hasDraft = related.some(t => t.status === 'DRAFT');
    if (!hasDraft) return makeSuccess();

    // Posting is not an edit/delete; allow posting remaining draft lines even if some lines are already posted.
    setTransactions(prev => prev.map(t => (
      (t.voucherId === voucherId || t.id === voucherId) && t.status === 'DRAFT'
        ? { ...t, status: 'POSTED' }
        : t
    )));
    appendAuditLog({
      entityType: 'voucher',
      entityId: voucherId,
      action: 'POST',
      screen: 'Voucher Manager',
      before: safeClone(related),
      metadata: { postedDraftLines: related.filter(t => t.status === 'DRAFT').length }
    });
    return makeSuccess();
  };

  const resolveVoucherCheckFromTransaction = (transaction: Transaction): Check | undefined => {
    if (transaction.checkId) {
      return checks.find(check => check.id === transaction.checkId);
    }

    const accountTouchesChecks =
      transaction.debitAccountId === 'acc_cheques_hand'
      || transaction.creditAccountId === 'acc_cheques_hand'
      || transaction.creditAccountId === 'acc_notes_payable';
    if (!accountTouchesChecks) return undefined;

    const hashIndex = String(transaction.description || '').indexOf('#');
    if (hashIndex < 0) return undefined;
    const tail = String(transaction.description || '').slice(hashIndex + 1);
    const checkNumber = tail.split(' ')[0]?.split('-')[0]?.trim();
    if (!checkNumber) return undefined;

    return checks.find(check =>
      String(check.checkNumber || '').trim() === checkNumber &&
      Math.abs((Number(check.amount) || 0) - (Number(transaction.amount) || 0)) <= 0.005 &&
      (
        check.contactId === transaction.contactId ||
        check.endorseeContactId === transaction.contactId
      )
    );
  };

  const deleteVoucher = (voucherId: string): MutationResult => {
    const related = transactions.filter(t => t.voucherId === voucherId || t.id === voucherId);
    if (related.length === 0) return makeError('VALIDATION_ERROR', 'Voucher not found.');

    const permission = enforcePermission('VOUCHERS', 'DELETE', 'Voucher Manager');
    if (!permission.ok) return permission;

    if (related.some(t => t.isReversal || t.reversedById)) {
      return makeError('VALIDATION_ERROR', 'Reversed vouchers cannot be edited or deleted directly.');
    }

    const createdCheckIds = new Set<string>();
    const endorsedCheckIds = new Set<string>();
    const blockedCheck = related.find(tx => {
      const check = resolveVoucherCheckFromTransaction(tx);
      if (!check) return false;
      const isEndorsedSource = (
        tx.category === 'voucher_payment'
        && tx.creditAccountId === 'acc_cheques_hand'
        && check.type === 'INCOMING'
        && check.status === 'ENDORSED'
      );
      return isEndorsedSource ? false : check.status !== 'PENDING';
    });
    if (blockedCheck) {
      return makeError('VALIDATION_ERROR', 'Voucher includes checks with later movements. Delete is blocked.');
    }

    related.forEach(tx => {
      const check = resolveVoucherCheckFromTransaction(tx);
      if (!check) return;
      const isEndorsedSource = (
        tx.category === 'voucher_payment'
        && tx.creditAccountId === 'acc_cheques_hand'
        && check.type === 'INCOMING'
        && check.status === 'ENDORSED'
      );
      if (isEndorsedSource) {
        endorsedCheckIds.add(check.id);
        return;
      }
      createdCheckIds.add(check.id);
    });

    const removedSettlementInvoiceIds = invoiceSettlements.filter(s => s.voucherId === voucherId).map(s => s.invoiceId);
    setTransactions(prev => prev.filter(t => t.voucherId !== voucherId && t.id !== voucherId));
    if (createdCheckIds.size > 0 || endorsedCheckIds.size > 0) {
      setChecks(prev => prev
        .filter(check => !createdCheckIds.has(check.id))
        .map(check => endorsedCheckIds.has(check.id)
          ? {
            ...check,
            status: 'PENDING',
            endorseeContactId: undefined,
            endorseeName: undefined
          }
          : check
        ));
    }
    if (removedSettlementInvoiceIds.length > 0) {
      const nextSettlements = invoiceSettlements.filter(s => s.voucherId !== voucherId);
      setInvoiceSettlements(nextSettlements);
      normalizeInvoiceStatusesWithSettlements(nextSettlements, removedSettlementInvoiceIds);
    }
    appendAuditLog({
      entityType: 'voucher',
      entityId: voucherId,
      action: 'DELETE',
      screen: 'Voucher Manager',
      before: safeClone(related),
      metadata: {
        removedSettlements: removedSettlementInvoiceIds.length,
        removedChecks: createdCheckIds.size,
        revertedEndorsements: endorsedCheckIds.size
      }
    });
    return makeSuccess();
  };

  const reverseTransaction = (transactionId: string, reverseDate = new Date().toISOString().split('T')[0]): MutationResult => {
    const original = transactions.find(t => t.id === transactionId);
    if (!original) return makeError('VALIDATION_ERROR', 'Transaction not found.');

    const permission = enforcePermission(resolveTxModule(original), 'REVERSE', 'Transactions');
    if (!permission.ok) return permission;

    if (original.status !== 'POSTED') {
      return makeError('VALIDATION_ERROR', 'Only posted transactions can be reversed.');
    }
    if (original.reversedById) {
      return makeError('VALIDATION_ERROR', 'This transaction has already been reversed.');
    }

    const reverseType = original.type === TransactionType.INCOME
      ? TransactionType.EXPENSE
      : original.type === TransactionType.EXPENSE
        ? TransactionType.INCOME
        : TransactionType.TRANSFER;

    const reversal: Transaction = {
      ...original,
      id: newId('txr'),
      date: reverseDate,
      type: reverseType,
      description: `Reverse of ${original.id} - ${original.description}`,
      debitAccountId: original.creditAccountId,
      creditAccountId: original.debitAccountId,
      isReversal: true,
      reversalOfId: original.id,
      reversedById: undefined,
      status: 'POSTED'
    };

    const { id: _removedId, ...reversalInput } = reversal;
    void _removedId;
    const validation = validateTransactionInput(reversalInput);
    if (validation.length > 0) {
      return makeError('VALIDATION_ERROR', validation[0].message);
    }

    setTransactions(prev =>
      prev.map(t => t.id === original.id ? { ...t, reversedById: reversal.id } : t).concat(reversal)
    );

    appendAuditLog({
      entityType: 'transaction',
      entityId: original.id,
      action: 'REVERSE',
      screen: 'Transactions',
      before: safeClone(original),
      after: safeClone(reversal),
      metadata: { reversalId: reversal.id }
    });

    return makeSuccess();
  };

  const parseIsoDate = (value: string): Date | null => {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;

    const directMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (directMatch) {
      const year = Number(directMatch[1]);
      const monthIndex = Number(directMatch[2]) - 1;
      const day = Number(directMatch[3]);
      const parsed = new Date(year, monthIndex, day);
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === monthIndex &&
        parsed.getDate() === day
      ) {
        return parsed;
      }
    }

    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  };

  const toIsoDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateExpiryFromPurchaseDate = (invoiceDate: string, expiryPeriodDays?: number): string | undefined => {
    const days = Math.floor(Number(expiryPeriodDays));
    if (!Number.isFinite(days) || days <= 0) return undefined;

    const purchaseDate = parseIsoDate(invoiceDate);
    if (!purchaseDate) return undefined;

    const computedExpiry = new Date(purchaseDate);
    computedExpiry.setDate(computedExpiry.getDate() + days);
    return toIsoDate(computedExpiry);
  };

  const getCurrentInventoryValuationMethod = (): InventoryValuationMethod =>
    normalizeInventoryValuationMethod(companySettings);

  const applyFifoCostingForQtyChange = (
    product: Product,
    inv: Invoice,
    item: Pick<Invoice['items'][number], 'quantity' | 'unitPrice'>,
    qtyChange: number,
    reverse = false
  ): { nextCost: number; layers: ProductFifoLayer[]; outgoingCost: number } => {
    const baseCost = Math.max(0, Number(product.buyPrice) || 0);
    let layers = normalizeProductFifoLayers(product);
    let outgoingCost = 0;

    if (qtyChange > 0) {
      const incomingQty = roundToFour(qtyChange);
      const incomingCostFromItem = Math.max(0, Number(item.unitPrice) || 0);
      const incomingUnitCost = inv.category === 'purchase_invoice' && incomingCostFromItem > 0
        ? incomingCostFromItem
        : baseCost;
      layers = [...layers, { qty: incomingQty, unitCost: roundToFour(incomingUnitCost) }];
    } else if (qtyChange < 0) {
      const requestedQty = Math.abs(qtyChange);
      const shouldConsumeFromTail = inv.category === 'purchase_return' || (reverse && inv.category === 'purchase_invoice');
      const consumed = shouldConsumeFromTail
        ? consumeLifoLayers(layers, requestedQty, baseCost)
        : consumeFifoLayers(layers, requestedQty, baseCost);
      layers = consumed.layers;
      outgoingCost = consumed.cost;
    }

    const nextCost = layers[0]?.unitCost ?? baseCost;
    return { nextCost: roundToFour(nextCost), layers, outgoingCost: roundToFour(outgoingCost) };
  };

  const resolveNextInventoryCost = (
    product: Product,
    inv: Invoice,
    item: Pick<Invoice['items'][number], 'quantity' | 'unitPrice'>,
    qtyChange: number,
    reverse = false
  ): { nextCost: number; layers?: ProductFifoLayer[] } => {
    const method = getCurrentInventoryValuationMethod();
    if (method === 'FIFO') {
      const fifoResult = applyFifoCostingForQtyChange(product, inv, item, qtyChange, reverse);
      return { nextCost: fifoResult.nextCost, layers: fifoResult.layers };
    }

    if (method === 'AVERAGE') {
      if (reverse) return { nextCost: product.buyPrice, layers: product.fifoLayers };
      if (inv.category !== 'purchase_invoice') return { nextCost: product.buyPrice, layers: product.fifoLayers };
      if (qtyChange <= 0) return { nextCost: product.buyPrice, layers: product.fifoLayers };

      const incomingQty = Math.max(0, Number(item.quantity) || 0);
      const incomingUnitCost = Math.max(0, Number(item.unitPrice) || 0);
      if (incomingQty <= 0 || incomingUnitCost <= 0) return { nextCost: product.buyPrice, layers: product.fifoLayers };

      const currentQty = Math.max(0, Number(product.stock) || 0);
      const currentCost = Math.max(0, Number(product.buyPrice) || 0);
      const nextQty = currentQty + incomingQty;
      if (nextQty <= 0) return { nextCost: product.buyPrice, layers: product.fifoLayers };

      const nextCost = ((currentQty * currentCost) + (incomingQty * incomingUnitCost)) / nextQty;
      return { nextCost: roundToFour(nextCost), layers: product.fifoLayers };
    }

    return { nextCost: product.buyPrice, layers: product.fifoLayers };
  };

  const calculateSalesInvoiceCost = (invoice: Invoice): number => {
    if (invoice.type !== TransactionType.INCOME) return 0;
    if (invoice.category === 'sales_return' || invoice.category === 'purchase_return') return 0;

    const method = getCurrentInventoryValuationMethod();
    if (method !== 'FIFO') {
      return roundToFour(invoice.items.reduce((sum, item) => {
        const product = products.find(p => p.id === item.productId);
        if (!isStockProduct(product)) return sum;
        return sum + ((Number(item.quantity) || 0) * (Number(product?.buyPrice) || 0));
      }, 0));
    }

    const productMap = new Map<string, Product>(products.map(product => [product.id, product]));
    let totalCost = 0;
    invoice.items.forEach(item => {
      if (!item.productId) return;
      const product = productMap.get(item.productId);
      if (!product || !isStockProduct(product)) return;
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (qty <= 0) return;

      const fifoResult = applyFifoCostingForQtyChange(product, invoice, item, -qty, false);
      totalCost += fifoResult.outgoingCost;
      productMap.set(item.productId, {
        ...product,
        buyPrice: fifoResult.nextCost,
        fifoLayers: fifoResult.layers
      });
    });

    return roundToFour(totalCost);
  };

  const resolveContactPostingAccount = (
    contactId?: string,
    paymentType?: Invoice['paymentType']
  ): string | null => {
    if (!contactId || paymentType === 'CASH') return null;

    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return null;

    if (contact.type === 'PARTNER') {
      const { ensured, accountSnapshot } = resolvePartnerPostingAccounts(contact.id, contact.name);
      const currentAccount = accountSnapshot.find(a => a.id === ensured.currentAccountId);
      return currentAccount && !currentAccount.isGroup ? currentAccount.id : null;
    }

    if (contact.type === 'CUSTOMER') {
      return 'acc_receivable';
    }

    if (shouldAutoCreateCommercialSubAccount(contact.id, contact.type)) {
      const { linkedAccountId } = ensureCommercialContactSubAccount(
        contact.id,
        contact.name,
        contact.type as CommercialSubAccountContactType,
        contact.currentAccountId || contact.linkedAccountId
      );
      const linkedAccount = accounts.find(a => a.id === linkedAccountId);
      if (linkedAccount && !linkedAccount.isGroup) return linkedAccount.id;
      return linkedAccountId || 'acc_payable';
    }

    if (contact.type === 'SUPPLIER') return contact.currentAccountId || contact.linkedAccountId || 'acc_payable';
    return contact.currentAccountId || contact.linkedAccountId || null;
  };

  const createInvoice = async (invoiceData: Omit<Invoice, 'id'> & { id?: string }) => {
    const permission = enforcePermission(resolveInvoiceModule(invoiceData), 'ADD', 'Invoice Form');
    if (!permission.ok) return permission;

    const issues = validateInvoiceInput(invoiceData);
    if (issues.length > 0) {
      appendAuditLog({
        entityType: 'invoice',
        action: 'CREATE_REJECTED',
        screen: 'Invoice Form',
        metadata: { issues }
      });
      return makeError('VALIDATION_ERROR', issues[0].message);
    }

    const newInvoice: Invoice = {
      ...invoiceData,
      id: invoiceData.id || newId('inv'),
      postingStatus: invoiceData.postingStatus || (invoiceData.status === 'QUOTATION' ? 'DRAFT' : 'POSTED')
    };

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const path = `users/${currentUser.id}/companies/${currentCompanyId}/invoices/${newInvoice.id}`;
        const cleanInv = JSON.parse(JSON.stringify(newInvoice));
        withTimeout(
          executeFirestoreWrite(fbUser, [{ type: 'set', path, data: cleanInv }]),
          15000,
          'انتهت مهلة حفظ الفاتورة في السحابة.'
        ).catch(err => {
          console.error('Direct Firestore write failed for invoice:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل حفظ الفاتورة على السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    const contactPostingAccountId = resolveContactPostingAccount(newInvoice.customerId, newInvoice.paymentType);
    setInvoices(prev => [newInvoice, ...prev]);
    appendAuditLog({
      entityType: 'invoice',
      entityId: newInvoice.id,
      action: 'CREATE',
      screen: 'Invoice Form',
      after: safeClone(newInvoice)
    });

    // If it's a Quotation, stop here. No GL transactions, no stock update.
    if (newInvoice.status === 'QUOTATION') return makeSuccess();

    let debitAccount = '';
    let creditAccount = '';
    let transactionCategory = '';

    if (newInvoice.category === 'sales_return') {
      // Sales Return: Debit Sales Returns (Revenue Reduction), Credit Customer/Cash
      debitAccount = 'acc_sales_returns';
      creditAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (contactPostingAccountId || 'acc_receivable');
      transactionCategory = 'sales_return';
    } else if (newInvoice.category === 'customer_credit_note') {
      // Customer credit note (discount/allowance): Debit contra revenue, Credit customer receivable
      debitAccount = 'acc_sales_discounts';
      creditAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (contactPostingAccountId || 'acc_receivable');
      transactionCategory = 'customer_credit_note';
    } else if (newInvoice.category === 'purchase_return') {
      // Purchase Return: Debit Supplier/Cash, Credit Inventory
      // This acts like a reversal of Purchase.
      debitAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (contactPostingAccountId || 'acc_payable');
      creditAccount = 'acc_inventory';
      transactionCategory = 'purchase_return';
    } else if (newInvoice.category === 'supplier_debit_note') {
      // Supplier debit note (earned discount): Debit payable, Credit purchase returns/contra-expense
      debitAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (contactPostingAccountId || 'acc_payable');
      creditAccount = 'acc_purchase_discounts_earned';
      transactionCategory = 'supplier_debit_note';
    } else if (newInvoice.type === TransactionType.INCOME) {
      // Sales Invoice
      creditAccount = 'acc_sales';
      debitAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (contactPostingAccountId || 'acc_receivable');
      transactionCategory = 'sales_invoice';
    } else {
      // Purchase or Expense
      if (newInvoice.category === 'purchase_invoice') {
        debitAccount = 'acc_inventory'; // Stock purchase goes to Inventory Asset
        transactionCategory = 'purchase_invoice';
      } else {
        // General Expense
        const directExpenseAccount = newInvoice.items.find(i => i.accountId)?.accountId;
        debitAccount = directExpenseAccount || 'acc_admin_exp'; // Fallback to general admin exp
        transactionCategory = 'expense'; // General expense category
      }

      creditAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (contactPostingAccountId || 'acc_payable');
    }

    const contactName = contacts.find(c => c.id === newInvoice.customerId)?.name || 'عميل نقدي';
    let descriptionType = '';
    if (newInvoice.category === 'sales_return') descriptionType = 'مرتجع مبيعات';
    else if (newInvoice.category === 'customer_credit_note') descriptionType = 'إشعار دائن';
    else if (newInvoice.category === 'purchase_return') descriptionType = 'مرتجع مشتريات';
    else if (newInvoice.category === 'supplier_debit_note') descriptionType = 'إشعار مدين';
    else if (newInvoice.type === TransactionType.INCOME) descriptionType = 'مبيعات';
    else if (newInvoice.category === 'purchase_invoice') descriptionType = 'شراء مخزون';
    else descriptionType = 'مصروف';

    const isGeneralExpense = newInvoice.category === 'general_expense';
    const txType = newInvoice.category === 'sales_return' || newInvoice.category === 'customer_credit_note'
      ? TransactionType.EXPENSE
      : (newInvoice.category === 'purchase_return' || newInvoice.category === 'supplier_debit_note' ? TransactionType.INCOME : newInvoice.type);
    const invoiceTotal = Math.max(0, Number(newInvoice.totalAmount) || 0);
    const invoiceTax = Math.max(0, Number(newInvoice.taxAmount) || 0);
    const taxAmount = Number(Math.min(invoiceTax, invoiceTotal).toFixed(2));
    const netAmount = Number((invoiceTotal - taxAmount).toFixed(2));
    const primaryAmount = netAmount > 0 ? netAmount : invoiceTotal;

    const addInvoiceEntry = ({
      amount,
      debitAccountId,
      creditAccountId,
      descriptionSuffix = '',
      entryType = txType
    }: {
      amount: number;
      debitAccountId?: string;
      creditAccountId?: string;
      descriptionSuffix?: string;
      entryType?: TransactionType;
    }) => {
      if (!debitAccountId || !creditAccountId || amount <= 0) return;
      addTransaction({
        amount,
        description: `Invoice ${descriptionType} #${newInvoice.invoiceNumber} - ${contactName}${descriptionSuffix}`,
        category: transactionCategory,
        type: entryType,
        date: newInvoice.date,
        invoiceId: newInvoice.id,
        contactId: newInvoice.customerId,
        debitAccountId,
        creditAccountId,
        currency: newInvoice.currency,
        exchangeRate: newInvoice.exchangeRate,
        status: newInvoice.postingStatus
      });
    };

    const allocateInvoicePostingLines = <T extends { amount: number }>(lines: T[], targetTotal: number): T[] => {
      const sourceTotal = lines.reduce((sum, line) => sum + Math.max(0, Number(line.amount) || 0), 0);
      if (lines.length === 0) return [];
      if (targetTotal <= 0 || sourceTotal <= 0) {
        return lines.map(line => ({ ...line, amount: 0 }));
      }
      return lines.map((line, index) => {
        if (index === lines.length - 1) {
          const previousSum = lines
            .slice(0, -1)
            .reduce((sum, current) => sum + Number(((Math.max(0, Number(current.amount) || 0) / sourceTotal) * targetTotal).toFixed(2)), 0);
          return {
            ...line,
            amount: Number((targetTotal - previousSum).toFixed(2))
          };
        }
        return {
          ...line,
          amount: Number(((Math.max(0, Number(line.amount) || 0) / sourceTotal) * targetTotal).toFixed(2))
        };
      });
    };

    const purchasePostingLines = allocateInvoicePostingLines(
      newInvoice.items
        .map(item => {
          const linkedProduct = item.productId ? products.find(product => product.id === item.productId) : undefined;
          return {
            amount: Math.max(0, Number(item.total) || 0),
            accountId: isStockProduct(linkedProduct) ? 'acc_inventory' : (item.accountId || 'acc_admin_exp'),
            description: item.description
          };
        })
        .filter(line => line.amount > 0),
      primaryAmount
    );

    if (isGeneralExpense) {
      // Split expense value across item accounts, then book input VAT separately.
      const mappedLines = newInvoice.items
        .map(item => ({
          accountId: item.accountId || 'acc_admin_exp',
          description: item.description,
          amount: Math.max(0, item.total || 0)
        }))
        .filter(line => line.amount > 0);

      const sourceTotal = mappedLines.reduce((sum, line) => sum + line.amount, 0);
      const targetNetTotal = netAmount > 0 || taxAmount > 0
        ? netAmount
        : (invoiceTotal > 0 ? invoiceTotal : sourceTotal);

      const postingLines = mappedLines.length > 0
        ? mappedLines.map((line, index) => {
          const proportionalAmount = sourceTotal > 0
            ? Number(((line.amount / sourceTotal) * targetNetTotal).toFixed(2))
            : 0;
          if (index === mappedLines.length - 1) {
            const previousSum = mappedLines
              .slice(0, -1)
              .reduce((sum, l) => sum + (sourceTotal > 0 ? Number(((l.amount / sourceTotal) * targetNetTotal).toFixed(2)) : 0), 0);
            return {
              ...line,
              amount: Number((targetNetTotal - previousSum).toFixed(2))
            };
          }
          return { ...line, amount: proportionalAmount };
        })
        : [{ accountId: 'acc_admin_exp', description: 'General expense', amount: targetNetTotal }];

      postingLines.forEach((line, index) => {
        addInvoiceEntry({
          amount: line.amount,
          debitAccountId: line.accountId,
          creditAccountId: creditAccount,
          descriptionSuffix: `${line.description ? ` - ${line.description}` : ''}${postingLines.length > 1 ? ` (${index + 1}/${postingLines.length})` : ''}`,
          entryType: TransactionType.EXPENSE
        });
      });

      if (taxAmount > 0) {
        addInvoiceEntry({
          amount: taxAmount,
          debitAccountId: 'acc_vat_input',
          creditAccountId: creditAccount,
          descriptionSuffix: ' - ضريبة مدخلات',
          entryType: TransactionType.TRANSFER
        });
      }
    } else if (newInvoice.category === 'sales_return' || newInvoice.category === 'customer_credit_note') {
      addInvoiceEntry({
        amount: primaryAmount,
        debitAccountId: newInvoice.category === 'customer_credit_note' ? 'acc_sales_discounts' : 'acc_sales_returns',
        creditAccountId: creditAccount,
        entryType: TransactionType.EXPENSE
      });
      if (taxAmount > 0) {
        addInvoiceEntry({
          amount: taxAmount,
          debitAccountId: 'acc_vat_output',
          creditAccountId: creditAccount,
          descriptionSuffix: ' - عكس ضريبة المخرجات',
          entryType: TransactionType.TRANSFER
        });
      }
    } else if (newInvoice.category === 'purchase_return') {
      purchasePostingLines.forEach((line, index) => {
        addInvoiceEntry({
          amount: line.amount,
          debitAccountId: debitAccount,
          creditAccountId: line.accountId,
          descriptionSuffix: `${line.description ? ` - ${line.description}` : ''}${purchasePostingLines.length > 1 ? ` (${index + 1}/${purchasePostingLines.length})` : ''}`,
          entryType: TransactionType.INCOME
        });
      });
      if (taxAmount > 0) {
        addInvoiceEntry({
          amount: taxAmount,
          debitAccountId: debitAccount,
          creditAccountId: 'acc_vat_input',
          descriptionSuffix: ' - عكس ضريبة المدخلات',
          entryType: TransactionType.TRANSFER
        });
      }
    } else if (newInvoice.category === 'supplier_debit_note') {
      addInvoiceEntry({
        amount: primaryAmount,
        debitAccountId: debitAccount,
        creditAccountId: 'acc_purchase_discounts_earned',
        entryType: TransactionType.INCOME
      });
      if (taxAmount > 0) {
        addInvoiceEntry({
          amount: taxAmount,
          debitAccountId: debitAccount,
          creditAccountId: 'acc_vat_input',
          descriptionSuffix: ' - عكس/تخفيض ضريبة المدخلات',
          entryType: TransactionType.TRANSFER
        });
      }
    } else if (newInvoice.category === 'purchase_invoice') {
      purchasePostingLines.forEach((line, index) => {
        addInvoiceEntry({
          amount: line.amount,
          debitAccountId: line.accountId,
          creditAccountId: creditAccount,
          descriptionSuffix: `${line.description ? ` - ${line.description}` : ''}${purchasePostingLines.length > 1 ? ` (${index + 1}/${purchasePostingLines.length})` : ''}`,
          entryType: TransactionType.EXPENSE
        });
      });
      if (taxAmount > 0) {
        addInvoiceEntry({
          amount: taxAmount,
          debitAccountId: 'acc_vat_input',
          creditAccountId: creditAccount,
          descriptionSuffix: ' - ضريبة مدخلات',
          entryType: TransactionType.TRANSFER
        });
      }
    } else if (newInvoice.type === TransactionType.INCOME) {
      addInvoiceEntry({
        amount: primaryAmount,
        debitAccountId: debitAccount,
        creditAccountId: 'acc_sales',
        entryType: TransactionType.INCOME
      });
      if (taxAmount > 0) {
        addInvoiceEntry({
          amount: taxAmount,
          debitAccountId: debitAccount,
          creditAccountId: 'acc_vat_output',
          descriptionSuffix: ' - ضريبة مخرجات',
          entryType: TransactionType.TRANSFER
        });
      }
    } else {
      addInvoiceEntry({
        amount: invoiceTotal,
        debitAccountId: debitAccount,
        creditAccountId: creditAccount,
        entryType: txType
      });
    }

    // COGS Calculation for Sales Invoice (Cost of Goods Sold)
    if (newInvoice.type === TransactionType.INCOME && newInvoice.postingStatus === 'POSTED' && newInvoice.category !== 'sales_return' && newInvoice.category !== 'purchase_return') {
      const totalCost = calculateSalesInvoiceCost(newInvoice);

      if (totalCost > 0) {
        addTransaction({
          amount: totalCost,
          description: `Cost of goods sold (COGS) - Invoice #${newInvoice.invoiceNumber}`,
          category: 'journal',
          type: TransactionType.EXPENSE,
          date: newInvoice.date,
          invoiceId: newInvoice.id,
          debitAccountId: 'acc_cogs',
          creditAccountId: 'acc_inventory',
          currency: baseCurrency,
          exchangeRate: 1,
          status: 'POSTED'
        });
      }
    }

    // Update stock only if it's posted. Keep global and warehouse balances in sync.
    if (newInvoice.postingStatus === 'POSTED') {
      const getQtyChange = (inv: Invoice, qty: number) => {
        if (inv.category === 'sales_return') return qty;
        if (inv.category === 'purchase_return') return -qty;
        if (inv.type === TransactionType.INCOME) return -qty;
        if (inv.category === 'purchase_invoice') return qty;
        return 0;
      };

      setProducts(prev => prev.map(p => {
        const item = newInvoice.items.find(i => i.productId === p.id);
        if (!item || !isStockProduct(p)) return p;

        const qtyChange = getQtyChange(newInvoice, item.quantity);
        if (qtyChange === 0) return p;

        const computedExpiryDate = newInvoice.category === 'purchase_invoice' && qtyChange > 0
          ? calculateExpiryFromPurchaseDate(newInvoice.date, p.expiryPeriodDays)
          : undefined;

        let newWarehouseStock = p.warehouseStock || [];
        if (newInvoice.warehouseId) {
          const whIndex = newWarehouseStock.findIndex(w => w.warehouseId === newInvoice.warehouseId);
          if (whIndex >= 0) {
            const updatedWh = { ...newWarehouseStock[whIndex], quantity: newWarehouseStock[whIndex].quantity + qtyChange };
            newWarehouseStock = [...newWarehouseStock];
            newWarehouseStock[whIndex] = updatedWh;
          } else {
            newWarehouseStock = [...newWarehouseStock, { warehouseId: newInvoice.warehouseId, quantity: qtyChange }];
          }
        }

        const costOutcome = resolveNextInventoryCost(p, newInvoice, item, qtyChange, false);
        const pricingPatch = buildProductPricingPatch(p, costOutcome.nextCost);
        return {
          ...p,
          ...pricingPatch,
          stock: p.stock + qtyChange,
          warehouseStock: newWarehouseStock,
          fifoLayers: costOutcome.layers ?? p.fifoLayers,
          expiryDate: computedExpiryDate || p.expiryDate
        };
      }));
    }

    if (newInvoice.postingStatus === 'POSTED' && isAdjustmentNoticeCategory(newInvoice.category)) {
      upsertInvoiceSettlementForAdjustmentNotice(newInvoice);
    }

    if (
      newInvoice.postingStatus === 'POSTED' &&
      newInvoice.paymentType === 'CREDIT' &&
      newInvoice.category !== 'sales_return' &&
      newInvoice.category !== 'purchase_return'
    ) {
      normalizeInvoiceStatusesWithSettlements(invoiceSettlements, [newInvoice.id]);
    }

    return makeSuccess();
  };

  const getInvoiceQtyChange = (inv: Invoice, itemQty: number) => {
    if (inv.category === 'sales_return') return itemQty;
    if (inv.category === 'purchase_return') return -itemQty;
    if (inv.type === TransactionType.INCOME) return -itemQty;
    if (inv.category === 'purchase_invoice') return itemQty;
    return 0;
  };

  const applyInvoiceStockEffect = (inv: Invoice, reverse = false) => {
    setProducts(prev => prev.map(p => {
      const item = inv.items.find(i => i.productId === p.id);
      if (!item || !isStockProduct(p)) return p;

      const qtyChange = getInvoiceQtyChange(inv, item.quantity) * (reverse ? -1 : 1);
      if (qtyChange === 0) return p;

      const computedExpiryDate = !reverse && inv.category === 'purchase_invoice' && qtyChange > 0
        ? calculateExpiryFromPurchaseDate(inv.date, p.expiryPeriodDays)
        : undefined;

      let newWarehouseStock = p.warehouseStock || [];
      if (inv.warehouseId) {
        const whIndex = newWarehouseStock.findIndex(w => w.warehouseId === inv.warehouseId);
        if (whIndex >= 0) {
          const updatedWh = { ...newWarehouseStock[whIndex], quantity: newWarehouseStock[whIndex].quantity + qtyChange };
          newWarehouseStock = [...newWarehouseStock];
          newWarehouseStock[whIndex] = updatedWh;
        } else {
          newWarehouseStock = [...newWarehouseStock, { warehouseId: inv.warehouseId, quantity: qtyChange }];
        }
      }

      const costOutcome = resolveNextInventoryCost(p, inv, item, qtyChange, reverse);
      const pricingPatch = buildProductPricingPatch(p, costOutcome.nextCost);
      return {
        ...p,
        ...pricingPatch,
        stock: p.stock + qtyChange,
        warehouseStock: newWarehouseStock,
        fifoLayers: costOutcome.layers ?? p.fifoLayers,
        expiryDate: computedExpiryDate || p.expiryDate
      };
    }));
  };

  const applyReturnedInvoiceItemsStockEffect = (inv: Invoice, reverse = false) => {
    if (!(inv.type === TransactionType.INCOME || inv.category === 'purchase_invoice')) return;
    const returnedItems = inv.items.filter(item => item.returned && item.productId);
    if (returnedItems.length === 0) return;

    setProducts(prev => prev.map(product => {
      const item = returnedItems.find(entry => entry.productId === product.id);
      if (!item || !isStockProduct(product)) return product;

      const originalQtyChange = inv.type === TransactionType.INCOME ? item.quantity : -item.quantity;
      const qtyChange = originalQtyChange * (reverse ? -1 : 1);
      if (qtyChange === 0) return product;

      let updatedWarehouseStock = product.warehouseStock || [];
      if (inv.warehouseId) {
        const index = updatedWarehouseStock.findIndex(entry => entry.warehouseId === inv.warehouseId);
        if (index >= 0) {
          updatedWarehouseStock = [...updatedWarehouseStock];
          updatedWarehouseStock[index] = {
            ...updatedWarehouseStock[index],
            quantity: updatedWarehouseStock[index].quantity + qtyChange
          };
        } else {
          updatedWarehouseStock = [...updatedWarehouseStock, { warehouseId: inv.warehouseId, quantity: qtyChange }];
        }
      }

      const costOutcome = resolveNextInventoryCost(product, inv, item, qtyChange, reverse);
      const pricingPatch = buildProductPricingPatch(product, costOutcome.nextCost);
      return {
        ...product,
        ...pricingPatch,
        stock: product.stock + qtyChange,
        warehouseStock: updatedWarehouseStock,
        fifoLayers: costOutcome.layers ?? product.fifoLayers
      };
    }));
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>): MutationResult => {
    const existing = invoices.find(inv => inv.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Invoice not found.');

    const permission = enforcePermission(resolveInvoiceModule(existing), 'EDIT', 'Invoice List');
    if (!permission.ok) return permission;

    if (strictPostedLockEnabled && existing.postingStatus === 'POSTED') {
      return buildPostedLockedResult('invoice', id);
    }

    const next = { ...existing, ...updates };

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const path = `users/${currentUser.id}/companies/${currentCompanyId}/invoices/${id}`;
        const cleanInv = JSON.parse(JSON.stringify(next));
        withTimeout(
          executeFirestoreWrite(fbUser, [{ type: 'set', path, data: cleanInv }]),
          15000,
          'انتهت مهلة تحديث الفاتورة في السحابة.'
        ).catch(err => {
          console.error('Direct Firestore write failed for invoice update:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل تحديث الفاتورة على السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    setInvoices(prev => prev.map(inv => inv.id === id ? next : inv));
    appendAuditLog({
      entityType: 'invoice',
      entityId: id,
      action: 'UPDATE',
      screen: 'Invoice List',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteInvoice = (id: string, options: DeleteInvoiceOptions = {}): MutationResult => {
    const existing = invoices.find(inv => inv.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Invoice not found.');

    const permission = enforcePermission(resolveInvoiceModule(existing), 'DELETE', 'Invoice List');
    if (!permission.ok) return permission;

    if (existing.isReversal || existing.reversedById) {
      return makeError('VALIDATION_ERROR', 'Reversed invoices cannot be edited or deleted directly.');
    }

    const relatedTx = transactions.filter(t => t.invoiceId === id);
    if (relatedTx.some(tx => tx.isReversal || tx.reversedById)) {
      return makeError('VALIDATION_ERROR', 'Invoice includes reversed accounting entries and cannot be deleted directly.');
    }

    if (existing.postingStatus === 'POSTED') {
      applyInvoiceStockEffect(existing, true);
      applyReturnedInvoiceItemsStockEffect(existing, true);
    }

    const preserveSettlements = options.preserveSettlements === true;
    const removedSettlements = invoiceSettlements.filter(s =>
      s.voucherId === id || (!preserveSettlements && s.invoiceId === id)
    );
    const impactedSettlementInvoiceIds = Array.from(new Set<string>(removedSettlements.map(s => s.invoiceId)));
    const remainingSettlements = invoiceSettlements.filter(s =>
      s.voucherId !== id && (preserveSettlements || s.invoiceId !== id)
    );
    if (remainingSettlements.length !== invoiceSettlements.length) {
      setInvoiceSettlements(remainingSettlements);
      if (impactedSettlementInvoiceIds.length > 0) {
        normalizeInvoiceStatusesWithSettlements(remainingSettlements, impactedSettlementInvoiceIds);
      }
    }
    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const ops: Array<{ type: 'set' | 'delete'; path: string; data?: any }> = [];
        ops.push({ type: 'delete', path: `users/${currentUser.id}/companies/${currentCompanyId}/invoices/${id}` });

        const relatedTx = transactions.filter(t => t.invoiceId === id);
        relatedTx.forEach(tx => {
          ops.push({ type: 'delete', path: `users/${currentUser.id}/companies/${currentCompanyId}/transactions/${tx.id}` });
        });

        withTimeout(
          executeFirestoreWrite(fbUser, ops),
          15000,
          'انتهت مهلة حذف الفاتورة والحركات المرتبطة بها من السيرفر.'
        ).catch(err => {
          console.error('Direct Firestore delete failed for invoice:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل حذف الفاتورة والحركات من السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    setInvoices(prev => prev.filter(inv => inv.id !== id));
    setTransactions(prev => prev.filter(t => t.invoiceId !== id));

    appendAuditLog({
      entityType: 'invoice',
      entityId: id,
      action: 'DELETE',
      screen: 'Invoice List',
      before: safeClone(existing),
      metadata: {
        removedTransactions: relatedTx.length,
        removedSettlements: removedSettlements.length,
        preservedSettlements: preserveSettlements
      }
    });
    return makeSuccess();
  };

  const postInvoice = (id: string): MutationResult => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return makeError('VALIDATION_ERROR', 'Invoice not found.');
    if (inv.postingStatus === 'POSTED') return makeSuccess();
    if (inv.status === 'QUOTATION') return makeError('VALIDATION_ERROR', 'Quotation cannot be posted.');

    const permission = enforcePermission(resolveInvoiceModule(inv), 'POST', 'Invoice List');
    if (!permission.ok) return permission;

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser) && currentCompanyId) {
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        const ops: Array<{ type: 'set' | 'delete'; path: string; data?: any }> = [];
        const cleanInv = JSON.parse(JSON.stringify({ ...inv, postingStatus: 'POSTED' }));
        ops.push({ type: 'set', path: `users/${currentUser.id}/companies/${currentCompanyId}/invoices/${id}`, data: cleanInv });

        const relatedTx = transactions.filter(t => t.invoiceId === id);
        relatedTx.forEach(tx => {
          const cleanTx = JSON.parse(JSON.stringify({ ...tx, status: 'POSTED' }));
          ops.push({ type: 'set', path: `users/${currentUser.id}/companies/${currentCompanyId}/transactions/${tx.id}`, data: cleanTx });
        });

        withTimeout(
          executeFirestoreWrite(fbUser, ops),
          15000,
          'انتهت مهلة ترحيل الفاتورة في السحابة.'
        ).catch(err => {
          console.error('Direct Firestore update failed for postInvoice:', err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ فشل ترحيل الفاتورة على السيرفر مباشرة: ${err.message || 'حدث خطأ غير معروف'}`);
          }
        });
      }
    }

    setInvoices(prev => prev.map(i => i.id === id ? { ...i, postingStatus: 'POSTED' } : i));
    setTransactions(prev => prev.map(t => t.invoiceId === id ? { ...t, status: 'POSTED' } : t));

    if (isAdjustmentNoticeCategory(inv.category)) {
      upsertInvoiceSettlementForAdjustmentNotice({ ...inv, postingStatus: 'POSTED' });
    }

    if (inv.type === TransactionType.INCOME && inv.category !== 'sales_return' && inv.category !== 'purchase_return') {
      const totalCost = calculateSalesInvoiceCost(inv);

      if (totalCost > 0) {
        addTransaction({
          amount: totalCost,
          description: `Cost of goods sold (COGS) - Invoice #${inv.invoiceNumber}`,
          category: 'journal',
          type: TransactionType.EXPENSE,
          date: inv.date,
          invoiceId: inv.id,
          debitAccountId: 'acc_cogs',
          creditAccountId: 'acc_inventory',
          currency: baseCurrency,
          exchangeRate: 1,
          status: 'POSTED'
        });
      }
    }

    applyInvoiceStockEffect({ ...inv, postingStatus: 'POSTED' });
    appendAuditLog({
      entityType: 'invoice',
      entityId: id,
      action: 'POST',
      screen: 'Invoice List',
      before: safeClone(inv),
      after: safeClone({ ...inv, postingStatus: 'POSTED' })
    });
    return makeSuccess();
  };

  const reverseInvoice = (invoiceId: string, reverseDate = new Date().toISOString().split('T')[0]): MutationResult => {
    const original = invoices.find(inv => inv.id === invoiceId);
    if (!original) return makeError('VALIDATION_ERROR', 'Invoice not found.');
    if (original.postingStatus !== 'POSTED') return makeError('VALIDATION_ERROR', 'Only posted invoices can be reversed.');
    if (original.reversedById) return makeError('VALIDATION_ERROR', 'Invoice already reversed.');

    const permission = enforcePermission(resolveInvoiceModule(original), 'REVERSE', 'Invoice List');
    if (!permission.ok) return permission;

    const reversalId = newId('invr');
    const reversalInvoice: Invoice = {
      ...original,
      id: reversalId,
      invoiceNumber: `${original.invoiceNumber}-REV`,
      date: reverseDate,
      status: 'CANCELLED',
      postingStatus: 'POSTED',
      isReversal: true,
      reversalOfId: original.id,
      reversedById: undefined,
      notes: `${original.notes || ''}\nReversal for invoice ${original.invoiceNumber}`.trim()
    };

    const relatedTx = transactions.filter(tx => tx.invoiceId === original.id && tx.status === 'POSTED' && !tx.isReversal);
    const reverseMap: Record<string, string> = {};
    const reversalEntries: Transaction[] = relatedTx.map(tx => {
      const reversalTxId = newId('txr');
      reverseMap[tx.id] = reversalTxId;
      return {
        ...tx,
        id: reversalTxId,
        date: reverseDate,
        description: `Reverse of ${tx.id} - ${tx.description}`,
        debitAccountId: tx.creditAccountId,
        creditAccountId: tx.debitAccountId,
        type: tx.type === TransactionType.INCOME
          ? TransactionType.EXPENSE
          : tx.type === TransactionType.EXPENSE
            ? TransactionType.INCOME
            : TransactionType.TRANSFER,
        invoiceId: reversalId,
        isReversal: true,
        reversalOfId: tx.id,
        reversedById: undefined,
        status: 'POSTED'
      };
    });

    setInvoices(prev =>
      prev.map(inv => inv.id === original.id ? { ...inv, reversedById: reversalId, status: 'CANCELLED' } : inv).concat(reversalInvoice)
    );

    setTransactions(prev =>
      prev.map(tx => (reverseMap[tx.id] ? { ...tx, reversedById: reverseMap[tx.id] } : tx)).concat(reversalEntries)
    );

    applyInvoiceStockEffect(original, true);

    appendAuditLog({
      entityType: 'invoice',
      entityId: original.id,
      action: 'REVERSE',
      screen: 'Invoice List',
      before: safeClone(original),
      after: safeClone(reversalInvoice),
      metadata: { reversedTransactions: reversalEntries.length }
    });
    return makeSuccess();
  };

  const returnInvoiceItem = (invoiceId: string, itemId: string): MutationResult => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv || inv.postingStatus !== 'POSTED') return makeError('VALIDATION_ERROR', 'Posted invoice is required.');

    const permission = enforcePermission(resolveInvoiceModule(inv), 'REVERSE', 'Invoice Item Return');
    if (!permission.ok) return permission;

    const item = inv.items.find(i => i.id === itemId);
    if (!item || item.returned) return makeError('VALIDATION_ERROR', 'Invoice item not available for return.');

    const isSales = inv.type === TransactionType.INCOME;
    const postingDate = new Date().toISOString().split('T')[0];
    const roundMoney = (value: number) => Number((Math.max(0, Number(value) || 0)).toFixed(2));
    const itemBaseAmount = roundMoney(item.total);
    const itemsBaseTotal = inv.items.reduce((sum, line) => sum + roundMoney(line.total), 0);
    const invoiceDiscount = roundMoney(inv.discountAmount);
    const itemDiscountShare = itemsBaseTotal > 0
      ? roundMoney(invoiceDiscount * (itemBaseAmount / itemsBaseTotal))
      : 0;
    const itemNetAmount = roundMoney(itemBaseAmount - itemDiscountShare);
    const invoiceTaxableBase = roundMoney((Number(inv.totalAmount) || 0) - (Number(inv.taxAmount) || 0));
    const taxShareBase = invoiceTaxableBase > 0
      ? itemNetAmount / invoiceTaxableBase
      : (itemsBaseTotal > 0 ? itemBaseAmount / itemsBaseTotal : 0);
    const itemTaxAmount = roundMoney((Number(inv.taxAmount) || 0) * Math.max(0, Math.min(1, taxShareBase)));
    const primaryAmount = itemNetAmount > 0 ? itemNetAmount : itemBaseAmount;
    const contactPostingAccountId = resolveContactPostingAccount(inv.customerId, inv.paymentType);

    const debitAccount = isSales
      ? 'acc_sales_returns'
      : (inv.paymentType === 'CASH' ? (inv.paymentAccountId || 'acc_cash') : (contactPostingAccountId || 'acc_payable'));
    const creditAccount = isSales
      ? (inv.paymentType === 'CASH' ? (inv.paymentAccountId || 'acc_cash') : (contactPostingAccountId || 'acc_receivable'))
      : (inv.category === 'purchase_invoice' ? 'acc_inventory' : (item.accountId || 'acc_admin_exp'));

    const invoiceCogsTotal = isSales
      ? transactions
        .filter(tx =>
          tx.status === 'POSTED' &&
          tx.invoiceId === inv.id &&
          tx.debitAccountId === 'acc_cogs' &&
          tx.creditAccountId === 'acc_inventory'
        )
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
      : 0;
    const cogsShare = itemsBaseTotal > 0 ? (itemBaseAmount / itemsBaseTotal) : 0;
    const cogsReversalAmount = roundMoney(invoiceCogsTotal * cogsShare);

    const requiredAccountIds = new Set<string>([debitAccount, creditAccount]);
    if (itemTaxAmount > 0) requiredAccountIds.add(isSales ? 'acc_vat_output' : 'acc_vat_input');
    if (cogsReversalAmount > 0) {
      requiredAccountIds.add('acc_inventory');
      requiredAccountIds.add('acc_cogs');
    }
    for (const accountId of requiredAccountIds) {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return makeError('VALIDATION_ERROR', `Posting account not found: ${accountId}`);
      if (account.isGroup) return makeError('VALIDATION_ERROR', `Posting account must be leaf: ${accountId}`);
    }

    const mainResult = addTransaction({
      amount: primaryAmount,
      description: `Returned item - Invoice #${inv.invoiceNumber} - ${item.description}`,
      category: isSales ? 'sales_return' : 'purchase_return',
      type: isSales ? TransactionType.EXPENSE : TransactionType.INCOME,
      date: postingDate,
      debitAccountId: debitAccount,
      creditAccountId: creditAccount,
      contactId: inv.customerId,
      invoiceId: inv.id,
      currency: inv.currency,
      exchangeRate: inv.exchangeRate,
      status: 'POSTED'
    });
    if (!mainResult.ok) return mainResult;

    if (itemTaxAmount > 0) {
      const vatResult = addTransaction({
        amount: itemTaxAmount,
        description: `Returned item VAT - Invoice #${inv.invoiceNumber} - ${item.description}`,
        category: isSales ? 'sales_return' : 'purchase_return',
        type: TransactionType.TRANSFER,
        date: postingDate,
        debitAccountId: isSales ? 'acc_vat_output' : debitAccount,
        creditAccountId: isSales ? creditAccount : 'acc_vat_input',
        contactId: inv.customerId,
        invoiceId: inv.id,
        currency: inv.currency,
        exchangeRate: inv.exchangeRate,
        status: 'POSTED'
      });
      if (!vatResult.ok) return vatResult;
    }

    if (isSales && cogsReversalAmount > 0) {
      const cogsResult = addTransaction({
        amount: cogsReversalAmount,
        description: `COGS reversal - Returned item - Invoice #${inv.invoiceNumber} - ${item.description}`,
        category: 'journal',
        type: TransactionType.TRANSFER,
        date: postingDate,
        debitAccountId: 'acc_inventory',
        creditAccountId: 'acc_cogs',
        invoiceId: inv.id,
        currency: baseCurrency,
        exchangeRate: 1,
        status: 'POSTED'
      });
      if (!cogsResult.ok) return cogsResult;
    }

    setInvoices(prev => prev.map(i => i.id === invoiceId ? {
      ...i,
      items: i.items.map(it => it.id === itemId ? { ...it, returned: true } : it)
    } : i));

    if (item.productId && (inv.type === TransactionType.INCOME || inv.category === 'purchase_invoice')) {
      const product = products.find(p => p.id === item.productId);
      if (product && isStockProduct(product)) {
        const qtyChange = inv.type === TransactionType.INCOME ? item.quantity : -item.quantity;
        let updatedWarehouseStock = product.warehouseStock || [];
        if (inv.warehouseId) {
          const idx = updatedWarehouseStock.findIndex(w => w.warehouseId === inv.warehouseId);
          if (idx >= 0) {
            updatedWarehouseStock = [...updatedWarehouseStock];
            updatedWarehouseStock[idx] = { ...updatedWarehouseStock[idx], quantity: updatedWarehouseStock[idx].quantity + qtyChange };
          } else {
            updatedWarehouseStock = [...updatedWarehouseStock, { warehouseId: inv.warehouseId, quantity: qtyChange }];
          }
        }

        const costOutcome = resolveNextInventoryCost(product, inv, item, qtyChange, false);
        const pricingPatch = buildProductPricingPatch(product, costOutcome.nextCost);
        updateProduct(product.id, {
          ...pricingPatch,
          stock: product.stock + qtyChange,
          warehouseStock: updatedWarehouseStock,
          fifoLayers: costOutcome.layers ?? product.fifoLayers
        });
      }
    }

    appendAuditLog({
      entityType: 'invoice',
      entityId: inv.id,
      action: 'ITEM_RETURN',
      screen: 'Invoice Item Return',
      metadata: {
        itemId,
        itemNetAmount: primaryAmount,
        itemTaxAmount,
        cogsReversalAmount
      }
    });

    return makeSuccess();
  };

  const getAccountUsageSummary = (accountId: string): { count: number; sample: string[] } => {
    const hits: string[] = [];

    const txCount = transactions.filter(t => t.debitAccountId === accountId || t.creditAccountId === accountId).length;
    if (txCount > 0) hits.push(`transactions:${txCount}`);

    const invoicePaymentCount = invoices.filter(inv => inv.paymentAccountId === accountId).length;
    if (invoicePaymentCount > 0) hits.push(`invoicePayment:${invoicePaymentCount}`);

    const invoiceItemCount = invoices.reduce((sum, inv) => (
      sum + inv.items.filter(item => item.accountId === accountId).length
    ), 0);
    if (invoiceItemCount > 0) hits.push(`invoiceItems:${invoiceItemCount}`);

    const checkBankCount = checks.filter(ch => ch.bankAccountId === accountId || ch.depositedBankId === accountId).length;
    if (checkBankCount > 0) hits.push(`checks:${checkBankCount}`);

    const linkedContactCount = contacts.filter(c =>
      c.linkedAccountId === accountId ||
      c.currentAccountId === accountId ||
      c.capitalAccountId === accountId ||
      c.drawingsAccountId === accountId
    ).length;
    if (linkedContactCount > 0) hits.push(`contacts:${linkedContactCount}`);

    const fixedAssetGroupCount = assetGroups.filter(group =>
      group.assetAccountId === accountId ||
      group.accumulatedDepreciationAccountId === accountId ||
      group.depreciationExpenseAccountId === accountId
    ).length;
    if (fixedAssetGroupCount > 0) hits.push(`fixedAssetGroups:${fixedAssetGroupCount}`);

    return { count: hits.length, sample: hits };
  };

  // Cleanup legacy seeded bank accounts if they still exist and are unused.
  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationLegacyBankRef.current.has(companyKey)) return;
    migrationLegacyBankRef.current.add(companyKey);
    const legacySeededBankIds = ['acc_bank_local', 'acc_bank_usd'];
    const removableIds = legacySeededBankIds.filter(accountId => {
      if (!accounts.some(account => account.id === accountId)) return false;
      const hasChildren = accounts.some(account => account.parentId === accountId);
      if (hasChildren) return false;
      const usage = getAccountUsageSummary(accountId);
      return usage.count === 0;
    });

    if (removableIds.length === 0) return;

    setAccounts(prev => prev.filter(account => !removableIds.includes(account.id)));

    removableIds.forEach(accountId => {
      appendAuditLog({
        entityType: 'account',
        entityId: accountId,
        action: 'DELETE',
        screen: 'System Migration',
        metadata: { reason: 'REMOVE_LEGACY_DEFAULT_BANK_ACCOUNT' }
      });
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  const addAccount = (account: Omit<Account, 'id'> & { id?: string }): MutationResult => {
    const permission = enforcePermission('ACCOUNTS', 'ADD', 'Chart of Accounts');
    if (!permission.ok) return permission;

    const created = {
      ...account,
      id: account.id || Math.random().toString(36).substr(2, 9),
      currency: account.currency || baseCurrency
    } as Account;
    setAccounts(prev => [...prev, created]);
    appendAuditLog({
      entityType: 'account',
      entityId: created.id,
      action: 'CREATE',
      screen: 'Chart of Accounts',
      after: safeClone(created)
    });
    return makeSuccess();
  };

  const updateAccount = (id: string, updates: Partial<Account>): MutationResult => {
    const permission = enforcePermission('ACCOUNTS', 'EDIT', 'Chart of Accounts');
    if (!permission.ok) return permission;

    const existing = accounts.find(a => a.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Account not found.');

    const nextType = updates.type;
    if (nextType && nextType !== existing.type) {
      const hasMovements = transactions.some(t => t.debitAccountId === id || t.creditAccountId === id);
      if (hasMovements) {
        appendAuditLog({
          entityType: 'account',
          entityId: id,
          action: 'UPDATE_REJECTED',
          screen: 'Chart of Accounts',
          before: safeClone(existing),
          metadata: { reason: 'ACCOUNT_TYPE_CHANGE_WITH_MOVEMENTS', fromType: existing.type, toType: nextType }
        });
        return makeError('VALIDATION_ERROR', 'Cannot change account type because this account has journal movements.');
      }
    }

    const next = { ...existing, ...updates };
    setAccounts(prev => prev.map(a => a.id === id ? next : a));
    appendAuditLog({
      entityType: 'account',
      entityId: id,
      action: 'UPDATE',
      screen: 'Chart of Accounts',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteAccount = (id: string): MutationResult => {
    const permission = enforcePermission('ACCOUNTS', 'DELETE', 'Chart of Accounts');
    if (!permission.ok) return permission;

    const existing = accounts.find(a => a.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Account not found.');

    const hasChildren = accounts.some(a => a.parentId === id);
    if (hasChildren) {
      appendAuditLog({
        entityType: 'account',
        entityId: id,
        action: 'DELETE_REJECTED',
        screen: 'Chart of Accounts',
        before: safeClone(existing),
        metadata: { reason: 'HAS_CHILDREN' }
      });
      return makeError('VALIDATION_ERROR', 'Cannot delete account because it has child accounts.');
    }

    const usage = getAccountUsageSummary(id);
    if (usage.count > 0) {
      appendAuditLog({
        entityType: 'account',
        entityId: id,
        action: 'DELETE_REJECTED',
        screen: 'Chart of Accounts',
        before: safeClone(existing),
        metadata: { reason: 'ACCOUNT_IN_USE', usage: usage.sample }
      });
      return makeError('VALIDATION_ERROR', `Cannot delete account because it is used in records (${usage.sample.join(', ')}).`);
    }

    setAccounts(prev => prev.filter(a => a.id !== id));
    appendAuditLog({
      entityType: 'account',
      entityId: id,
      action: 'DELETE',
      screen: 'Chart of Accounts',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const normalizeEntityName = (value: string) => normalizeEntityNameKey(value);

  const findCompanyNameConflict = (
    list: CompanyProfile[],
    candidateName: string,
    excludeId?: string
  ) => findCompanyProfileNameConflict(list, candidateName, excludeId);

  const getCompanyNameConflictMessage = (conflictName: string) => (
    companySettings.language === 'AR'
      ? `اسم الشركة "${conflictName}" مستخدم بالفعل. اختر اسمًا مختلفًا.`
      : `The company name "${conflictName}" is already in use. Please choose a different name.`
  );

  const isCommercialContactType = (type: Contact['type']) =>
    type === 'CUSTOMER' || type === 'SUPPLIER' || type === 'PARTNER';

  const getCommercialContactTypeLabel = (type: Contact['type']) => {
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    if (type === 'SUPPLIER') return isEnglish ? 'supplier' : 'المورد';
    if (type === 'PARTNER') return isEnglish ? 'partner' : 'الشريك';
    return isEnglish ? 'customer' : 'العميل';
  };

  const findCommercialContactNameConflict = (
    list: Contact[],
    candidateName: string,
    candidateType: Contact['type'],
    excludeId?: string
  ) => {
    const normalizedCandidate = normalizeEntityName(candidateName);
    if (!normalizedCandidate) return undefined;
    return list.find((contact) =>
      contact.id !== excludeId
      && contact.type === candidateType
      && normalizeEntityName(contact.name) === normalizedCandidate
    );
  };

  const getCommercialContactNameConflictMessage = (
    candidateName: string,
    candidateType: Contact['type']
  ) => {
    const typeLabel = getCommercialContactTypeLabel(candidateType);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    if (isEnglish) {
      return `The ${typeLabel} name "${candidateName}" already exists. Please use a different name.`;
    }
    return `اسم ${typeLabel} "${candidateName}" مكرر. الرجاء اختيار اسم مختلف.`;
  };

  const findProductNameConflict = (
    list: Product[],
    candidateName: string,
    excludeId?: string
  ) => {
    const normalizedCandidate = normalizeEntityName(candidateName);
    if (!normalizedCandidate) return undefined;
    return list.find((product) => product.id !== excludeId && normalizeEntityName(product.name) === normalizedCandidate);
  };

  const showValidationAlert = (messageAr: string, messageEn: string) => {
    if (typeof window === 'undefined') return;
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    window.alert(isEnglish ? messageEn : messageAr);
  };

  const guardSubscriptionOnlyMutation = (
    module: PermissionModule,
    action: PermissionAction,
    screen: string
  ): boolean => {
    const blocked = getSubscriptionMutationBlockResult(module, action, screen);
    if (!blocked) return true;
    showValidationAlert(blocked.message, blocked.message);
    return false;
  };

  const addProduct = (product: Omit<Product, 'id'> & { id?: string }): MutationResult => {
    const permission = enforcePermission('PRODUCTS', 'ADD', 'Products');
    if (!permission.ok) return permission;

    const candidateName = String(product.name || '').trim();
    if (!candidateName) {
      return makeError('VALIDATION_ERROR', 'Item name is required.');
    }

    const conflict = findProductNameConflict(products, candidateName);
    if (conflict) {
      appendAuditLog({
        entityType: 'product',
        action: 'CREATE_REJECTED',
        screen: 'Products',
        metadata: {
          reason: 'DUPLICATE_NAME',
          candidateName,
          existingId: conflict.id
        }
      });
      showValidationAlert(
        `اسم الصنف "${candidateName}" مكرر. الرجاء اختيار اسم مختلف.`,
        `Item name "${candidateName}" already exists. Please use a different name.`
      );
      return makeError('VALIDATION_ERROR', `Duplicate item name: ${candidateName}`);
    }

    const createdProduct = normalizeProductInventoryFields({
      ...product,
      id: product.id || Math.random().toString(36).substr(2, 9)
    });
    setProducts(prev => [...prev, createdProduct]);
    return makeSuccess();
  };

  const updateProduct = (id: string, updates: Partial<Product>): MutationResult => {
    const permission = enforcePermission('PRODUCTS', 'EDIT', 'Products');
    if (!permission.ok) return permission;

    const existing = products.find(product => product.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Product not found.');

    const nextName = String(updates.name ?? existing.name ?? '').trim();
    const currentNormalizedName = normalizeEntityName(existing.name);
    const nextNormalizedName = normalizeEntityName(nextName);
    const nameChanged = nextNormalizedName !== currentNormalizedName;

    if (nameChanged) {
      const conflict = findProductNameConflict(products, nextName, id);
      if (conflict) {
        appendAuditLog({
          entityType: 'product',
          entityId: id,
          action: 'UPDATE_REJECTED',
          screen: 'Products',
          metadata: {
            reason: 'DUPLICATE_NAME',
            candidateName: nextName,
            existingId: conflict.id
          }
        });
        showValidationAlert(
          `اسم الصنف "${nextName}" مكرر. الرجاء اختيار اسم مختلف.`,
          `Item name "${nextName}" already exists. Please use a different name.`
        );
        return makeError('VALIDATION_ERROR', `Duplicate item name: ${nextName}`);
      }
    }

    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p;
      return normalizeProductInventoryFields({ ...p, ...updates });
    }));
    return makeSuccess();
  };
  const deleteProduct = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Products')) return;
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const addItemGroup = (group: Omit<ItemGroup, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'ADD', 'Settings > Item Groups')) return;
    setItemGroups(prev => [...prev, { ...group, id: 'ig_' + Math.random().toString(36).substr(2, 9) }]);
  };
  const updateItemGroup = (id: string, updates: Partial<ItemGroup>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Settings > Item Groups')) return;
    setItemGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };
  const deleteItemGroup = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Settings > Item Groups')) return;
    setItemGroups(prev => prev.filter(g => g.id !== id));
  };

  const addUnit = (unit: Omit<UnitOfMeasure, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'ADD', 'Settings > Units')) return;
    setUnits(prev => [...prev, { ...unit, id: 'u_' + Math.random().toString(36).substr(2, 9) }]);
  };
  const updateUnit = (id: string, updates: Partial<UnitOfMeasure>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Settings > Units')) return;
    setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  };
  const deleteUnit = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Settings > Units')) return;
    setUnits(prev => prev.filter(u => u.id !== id));
  };

  const sanitizePartnerAccountId = (value: string) =>
    String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();

  const buildPartnerChildCode = (parentCode: string, safeContactId: string, usedCodes: Set<string>) => {
    let hash = 0;
    for (const ch of safeContactId) {
      hash = (hash * 33 + ch.charCodeAt(0)) % 1_000_000;
    }
    let code = `${parentCode}${String(hash).padStart(6, '0')}`;
    while (usedCodes.has(code)) {
      hash = (hash + 1) % 1_000_000;
      code = `${parentCode}${String(hash).padStart(6, '0')}`;
    }
    usedCodes.add(code);
    return code;
  };

  const ensurePartnerEquitySubAccounts = (
    contactId: string,
    contactName: string,
    preferred?: PartnerAccountPreference
  ): {
    currentAccountId: string;
    capitalAccountId: string;
    drawingsAccountId: string;
  } => {
    const activeAccs = getActiveAccounts();
    const prepared = ensurePartnerEquitySubAccountsSnapshot(activeAccs, contactId, contactName, preferred);
    if (prepared.changed) {
      activeAccountsRef.current = prepared.accountSnapshot;
      setAccounts(prev => {
        const next = ensurePartnerEquitySubAccountsSnapshot(prev, contactId, contactName, preferred);
        return next.changed ? next.accountSnapshot : prev;
      });
    }

    return {
      currentAccountId: prepared.currentAccountId,
      capitalAccountId: prepared.capitalAccountId,
      drawingsAccountId: prepared.drawingsAccountId
    };
  };

  const addContact = (contact: Omit<Contact, 'id'> & { id?: string }): MutationResult => {
    const permission = enforcePermission('DIRECTORY', 'ADD', 'Directory');
    if (!permission.ok) return permission;

    const candidateName = String(contact.name || '').trim();
    if (!candidateName) {
      return makeError('VALIDATION_ERROR', 'Contact name is required.');
    }

    if (isCommercialContactType(contact.type)) {
      const conflict = findCommercialContactNameConflict(contacts, candidateName, contact.type);
      if (conflict) {
        appendAuditLog({
          entityType: 'contact',
          action: 'CREATE_REJECTED',
          screen: 'Directory',
          metadata: {
            reason: 'DUPLICATE_NAME',
            candidateName,
            candidateType: contact.type,
            existingId: conflict.id,
            existingType: conflict.type
          }
        });
        const duplicateMessage = getCommercialContactNameConflictMessage(candidateName, contact.type);
        showValidationAlert(duplicateMessage, duplicateMessage);
        return makeError('VALIDATION_ERROR', `Duplicate contact name: ${candidateName}`);
      }
    }

    const contactId = contact.id || Math.random().toString(36).substr(2, 9);
    const nextType = contact.type;
    const unifiedCommercialPostingAccountId = getUnifiedCommercialPostingAccountId(nextType);
    const preferredCommercialPostingAccountId = contact.currentAccountId || contact.linkedAccountId;
    const ensuredPartnerAccounts = nextType === 'PARTNER'
      ? ensurePartnerEquitySubAccounts(contactId, contact.name, {
        currentAccountId: contact.currentAccountId || contact.linkedAccountId,
        capitalAccountId: contact.capitalAccountId,
        drawingsAccountId: contact.drawingsAccountId
      })
      : undefined;
    const ensuredCommercialAccount = shouldAutoCreateCommercialSubAccount(contactId, nextType)
      ? ensureCommercialContactSubAccount(
        contactId,
        contact.name,
        nextType as CommercialSubAccountContactType,
        preferredCommercialPostingAccountId
      )
      : undefined;

    const resolvedCommercialPostingAccountId = ensuredCommercialAccount?.linkedAccountId || preferredCommercialPostingAccountId || unifiedCommercialPostingAccountId;

    setContacts(prev => {
      if (contact.type === 'EMPLOYEE') {
        const candidateEmployeeName = normalizeEntityName(contact.name || '');
        const existing = prev.find(c => c.type === 'EMPLOYEE' && normalizeEntityName(c.name || '') === candidateEmployeeName);

        if (existing) {
          // Avoid duplicate employee contacts; enrich missing fields on existing row instead.
          return prev.map(c => c.id === existing.id ? {
            ...c,
            phone: c.phone || contact.phone,
            address: c.address || contact.address
          } : c);
        }
      }

      return [...prev, {
        ...contact,
        id: contactId,
        linkedAccountId: ensuredPartnerAccounts?.currentAccountId || resolvedCommercialPostingAccountId || contact.linkedAccountId,
        currentAccountId: ensuredPartnerAccounts?.currentAccountId || resolvedCommercialPostingAccountId || contact.currentAccountId,
        capitalAccountId: ensuredPartnerAccounts?.capitalAccountId,
        drawingsAccountId: ensuredPartnerAccounts?.drawingsAccountId
      }];
    });
    return makeSuccess();
  };

  const updateContact = (id: string, updates: Partial<Contact>): MutationResult => {
    const permission = enforcePermission('DIRECTORY', 'EDIT', 'Directory');
    if (!permission.ok) return permission;

    const existing = contacts.find(c => c.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Contact not found.');

    const nextType = updates.type || existing.type;
    const nextName = String(updates.name ?? existing.name ?? '').trim();
    const currentNormalizedName = normalizeEntityName(existing.name);
    const nextNormalizedName = normalizeEntityName(nextName);
    const nameChanged = nextNormalizedName !== currentNormalizedName;
    const typeChanged = nextType !== existing.type;
    const unifiedCommercialPostingAccountId = getUnifiedCommercialPostingAccountId(nextType);
    const preferredCommercialPostingAccountId = updates.currentAccountId || updates.linkedAccountId || existing.currentAccountId || existing.linkedAccountId;

    if ((nameChanged || typeChanged) && isCommercialContactType(nextType)) {
      const conflict = findCommercialContactNameConflict(contacts, nextName, nextType, id);
      if (conflict) {
        appendAuditLog({
          entityType: 'contact',
          entityId: id,
          action: 'UPDATE_REJECTED',
          screen: 'Directory',
          metadata: {
            reason: 'DUPLICATE_NAME',
            candidateName: nextName,
            candidateType: nextType,
            existingId: conflict.id,
            existingType: conflict.type
          }
        });
        const duplicateMessage = getCommercialContactNameConflictMessage(nextName, nextType);
        showValidationAlert(duplicateMessage, duplicateMessage);
        return makeError('VALIDATION_ERROR', `Duplicate contact name: ${nextName}`);
      }
    }

    const ensuredPartnerAccounts = nextType === 'PARTNER'
      ? ensurePartnerEquitySubAccounts(id, nextName, {
        currentAccountId: updates.currentAccountId || updates.linkedAccountId || existing.currentAccountId || existing.linkedAccountId,
        capitalAccountId: updates.capitalAccountId || existing.capitalAccountId,
        drawingsAccountId: updates.drawingsAccountId || existing.drawingsAccountId
      })
      : undefined;
    const ensuredCommercialAccount = shouldAutoCreateCommercialSubAccount(id, nextType)
      ? ensureCommercialContactSubAccount(
        id,
        nextName,
        nextType as CommercialSubAccountContactType,
        preferredCommercialPostingAccountId
      )
      : undefined;

    const resolvedCommercialPostingAccountId = ensuredCommercialAccount?.linkedAccountId || preferredCommercialPostingAccountId || unifiedCommercialPostingAccountId;

    setContacts(prev => prev.map(c => c.id === id ? {
      ...c,
      ...updates,
      linkedAccountId: ensuredPartnerAccounts?.currentAccountId || resolvedCommercialPostingAccountId || updates.linkedAccountId || c.linkedAccountId,
      currentAccountId: ensuredPartnerAccounts?.currentAccountId || resolvedCommercialPostingAccountId || updates.currentAccountId || c.currentAccountId,
      capitalAccountId: ensuredPartnerAccounts?.capitalAccountId,
      drawingsAccountId: ensuredPartnerAccounts?.drawingsAccountId
    } : c));
    return makeSuccess();
  };

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationContactCommercialRef.current.has(companyKey)) return;
    migrationContactCommercialRef.current.add(companyKey);
    const commercialContacts = contacts.filter((contact): contact is Contact & { type: CommercialSubAccountContactType } =>
      shouldAutoCreateCommercialSubAccount(contact.id, contact.type)
    );
    if (!commercialContacts.length) return;

    const patches = new Map<string, Partial<Contact>>();
    commercialContacts.forEach(contact => {
      const ensured = ensureCommercialContactSubAccount(
        contact.id,
        contact.name,
        contact.type as CommercialSubAccountContactType,
        contact.currentAccountId || contact.linkedAccountId
      );
      const patch: Partial<Contact> = {};
      if (contact.linkedAccountId !== ensured.linkedAccountId) patch.linkedAccountId = ensured.linkedAccountId;
      if (contact.currentAccountId !== ensured.linkedAccountId) patch.currentAccountId = ensured.linkedAccountId;
      if (Object.keys(patch).length > 0) {
        patches.set(contact.id, patch);
      }
    });

    if (patches.size === 0) return;
    setContacts(prev => prev.map(contact => {
      const patch = patches.get(contact.id);
      return patch ? { ...contact, ...patch } : contact;
    }));
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationContactCustomerRef.current.has(companyKey)) return;
    migrationContactCustomerRef.current.add(companyKey);
    const customerContacts = contacts.filter(contact => contact.type === 'CUSTOMER');
    if (!customerContacts.length) return;

    const legacyCustomerAccountIds = new Set<string>();
    const patches = new Map<string, Partial<Contact>>();

    customerContacts.forEach(contact => {
      const postingAccountId = contact.currentAccountId || contact.linkedAccountId || '';
      if (postingAccountId && postingAccountId !== 'acc_receivable') {
        legacyCustomerAccountIds.add(postingAccountId);
      }

      const patch: Partial<Contact> = {};
      if (contact.linkedAccountId !== 'acc_receivable') patch.linkedAccountId = 'acc_receivable';
      if (contact.currentAccountId !== 'acc_receivable') patch.currentAccountId = 'acc_receivable';
      if (Object.keys(patch).length > 0) {
        patches.set(contact.id, patch);
      }
    });

    if (legacyCustomerAccountIds.size > 0) {
      setTransactions(prev => {
        let changed = false;
        const next = prev.map(transaction => {
          let debitAccountId = transaction.debitAccountId;
          let creditAccountId = transaction.creditAccountId;

          if (legacyCustomerAccountIds.has(String(debitAccountId || ''))) {
            debitAccountId = 'acc_receivable';
          }
          if (legacyCustomerAccountIds.has(String(creditAccountId || ''))) {
            creditAccountId = 'acc_receivable';
          }

          if (debitAccountId !== transaction.debitAccountId || creditAccountId !== transaction.creditAccountId) {
            changed = true;
            return { ...transaction, debitAccountId, creditAccountId };
          }
          return transaction;
        });
        return changed ? next : prev;
      });
    }

    if (patches.size === 0) return;
    setContacts(prev => prev.map(contact => {
      const patch = patches.get(contact.id);
      return patch ? { ...contact, ...patch } : contact;
    }));
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationRemovableReceivableRef.current.has(companyKey)) return;
    migrationRemovableReceivableRef.current.add(companyKey);
    const removableIds = accounts
      .filter(account => (
        account.id !== 'acc_receivable'
        && (
          account.parentId === 'acc_receivable_group'
          || String(account.id || '').startsWith('acc_receivable_')
        )
      ))
      .filter(account => !accounts.some(candidate => candidate.parentId === account.id))
      .filter(account => getAccountUsageSummary(account.id).count === 0)
      .map(account => account.id);

    if (removableIds.length === 0) return;

    setAccounts(prev => prev.filter(account => !removableIds.includes(account.id)));

    removableIds.forEach(accountId => {
      appendAuditLog({
        entityType: 'account',
        entityId: accountId,
        action: 'DELETE',
        screen: 'System Migration',
        metadata: { reason: 'REMOVE_LEGACY_CUSTOMER_SUBACCOUNT' }
      });
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationContactPartnerRef.current.has(companyKey)) return;
    migrationContactPartnerRef.current.add(companyKey);
    const partnerContacts = contacts.filter(c => c.type === 'PARTNER');
    if (!partnerContacts.length) return;

    const patches = new Map<string, Partial<Contact>>();
    partnerContacts.forEach(partner => {
      const ensured = ensurePartnerEquitySubAccounts(partner.id, partner.name, {
        currentAccountId: partner.currentAccountId || partner.linkedAccountId,
        capitalAccountId: partner.capitalAccountId,
        drawingsAccountId: partner.drawingsAccountId
      });
      const patch: Partial<Contact> = {};
      if (partner.linkedAccountId !== ensured.currentAccountId) patch.linkedAccountId = ensured.currentAccountId;
      if (partner.currentAccountId !== ensured.currentAccountId) patch.currentAccountId = ensured.currentAccountId;
      if (partner.capitalAccountId !== ensured.capitalAccountId) patch.capitalAccountId = ensured.capitalAccountId;
      if (partner.drawingsAccountId !== ensured.drawingsAccountId) patch.drawingsAccountId = ensured.drawingsAccountId;
      if (Object.keys(patch).length > 0) {
        patches.set(partner.id, patch);
      }
    });

    if (patches.size === 0) return;
    setContacts(prev => prev.map(contact => {
      const patch = patches.get(contact.id);
      return patch ? { ...contact, ...patch } : contact;
    }));
  }, [currentCompanyId, workspaceHydratedForCompanyId]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationContactTxRemapRef.current.has(companyKey)) return;
    migrationContactTxRemapRef.current.add(companyKey);
    const commercialContacts: Array<Contact & { type: CommercialSubAccountContactType; postingAccountId: string }> = contacts
      .filter((contact): contact is Contact & { type: CommercialSubAccountContactType } =>
        shouldAutoCreateCommercialSubAccount(contact.id, contact.type)
      )
      .filter(contact => Boolean(contact.currentAccountId || contact.linkedAccountId))
      .map(contact => ({
        ...contact,
        postingAccountId: contact.currentAccountId || contact.linkedAccountId || ''
      }))
      .filter(contact => contact.postingAccountId && contact.postingAccountId !== 'acc_receivable' && contact.postingAccountId !== 'acc_payable');

    if (!commercialContacts.length) return;

    const byContactId = new Map<string, Contact & { type: CommercialSubAccountContactType; postingAccountId: string }>(
      commercialContacts.map(contact => [contact.id, contact])
    );
    setTransactions(prev => {
      let changed = false;
      const next = prev.map(transaction => {
        const commercialContact = byContactId.get(String(transaction.contactId || ''));
        if (!commercialContact) return transaction;

        let debitAccountId = transaction.debitAccountId;
        let creditAccountId = transaction.creditAccountId;
        if (commercialContact.type === 'CUSTOMER') {
          if (debitAccountId === 'acc_receivable') debitAccountId = commercialContact.postingAccountId;
          if (creditAccountId === 'acc_receivable') creditAccountId = commercialContact.postingAccountId;
        } else {
          if (debitAccountId === 'acc_payable') debitAccountId = commercialContact.postingAccountId;
          if (creditAccountId === 'acc_payable') creditAccountId = commercialContact.postingAccountId;
        }

        if (debitAccountId !== transaction.debitAccountId || creditAccountId !== transaction.creditAccountId) {
          changed = true;
          return { ...transaction, debitAccountId, creditAccountId };
        }
        return transaction;
      });
      return changed ? next : prev;
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);
  const deleteContact = (id: string): MutationResult => {
    const existing = contacts.find(c => c.id === id);
    if (!existing) {
      return makeError('VALIDATION_ERROR', 'Contact not found.');
    }

    const permission = enforcePermission('DIRECTORY', 'DELETE', 'Directory');
    if (!permission.ok) return permission;

    if (existing.type === 'PARTNER') {
      const linkedAccounts = [
        existing.currentAccountId || existing.linkedAccountId,
        existing.capitalAccountId,
        existing.drawingsAccountId
      ].filter((value): value is string => Boolean(value));

      const hasPostings = transactions.some(tx => (
        tx.contactId === id
        || linkedAccounts.includes(String(tx.debitAccountId || ''))
        || linkedAccounts.includes(String(tx.creditAccountId || ''))
      ));

      if (hasPostings) {
        appendAuditLog({
          entityType: 'contact',
          entityId: id,
          action: 'DELETE_REJECTED',
          screen: 'Directory',
          metadata: { reason: 'PARTNER_HAS_POSTINGS' }
        });
        return makeError('VALIDATION_ERROR', 'Partner cannot be deleted because it has posted movements.');
      }
    }

    setContacts(prev => prev.filter(c => c.id !== id));
    appendAuditLog({
      entityType: 'contact',
      entityId: id,
      action: 'DELETE',
      screen: 'Directory',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const addEmployee = (emp: Omit<Employee, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('HR', 'ADD', 'HR')) return;
    const created: Employee = { ...emp, id: 'emp_' + Math.random().toString(36).substr(2, 9) };
    setEmployees(prev => [...prev, created]);

    const salarySnapshot = buildEmployeeSalarySnapshot(created);
    addSalaryHistoryEntry({
      employeeId: created.id,
      date: created.hireDate || new Date().toISOString().slice(0, 10),
      source: 'EMPLOYEE_FORM',
      action: 'EMPLOYEE_CREATED',
      after: salarySnapshot,
      note: 'Initial employee setup'
    });

    const initialContract: EmployeeContract = {
      id: newId('empctr'),
      employeeId: created.id,
      contractType: 'OPEN_ENDED',
      startDate: created.hireDate || new Date().toISOString().slice(0, 10),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      title: created.position || undefined,
      annualLeaveEntitlementDays: created.annualLeaveEntitlementDays,
      ...salarySnapshot
    };
    setEmployeeContracts(prev => [initialContract, ...prev]);
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    if (!guardSubscriptionOnlyMutation('HR', 'EDIT', 'HR')) return;
    const existing = employees.find(e => e.id === id);
    if (!existing) return;
    const next = { ...existing, ...updates };
    const beforeSnapshot = buildEmployeeSalarySnapshot(existing);
    const afterSnapshot = buildEmployeeSalarySnapshot(next);
    setEmployees(prev => prev.map(e => e.id === id ? next : e));
    if (!isSameSalarySnapshot(beforeSnapshot, afterSnapshot)) {
      addSalaryHistoryEntry({
        employeeId: id,
        date: new Date().toISOString().slice(0, 10),
        source: 'EMPLOYEE_FORM',
        action: 'SALARY_CHANGED',
        before: beforeSnapshot,
        after: afterSnapshot,
        note: 'Updated from employee form'
      });
    }
  };

  const deleteEmployee = (id: string) => {
    if (!guardSubscriptionOnlyMutation('HR', 'DELETE', 'HR')) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
    setEmployeeContracts(prev => prev.filter(c => c.employeeId !== id));
    setSalaryHistory(prev => prev.filter(h => h.employeeId !== id));
    setEmployeeLeaveRequests(prev => prev.filter(r => r.employeeId !== id));
    setEmployeeRecurringDeductions(prev => prev.filter(d => d.employeeId !== id));
  };
  const addEmployeeContract = (contract: Omit<EmployeeContract, 'id' | 'createdAt'>, applyToEmployee = true): MutationResult => {
    const permission = enforcePermission('HR', 'ADD', 'HR > Contracts');
    if (!permission.ok) return permission;

    const employee = employees.find(e => e.id === contract.employeeId);
    if (!employee) return makeError('VALIDATION_ERROR', 'Employee not found.');

    const startDate = contract.startDate || new Date().toISOString().slice(0, 10);
    const created: EmployeeContract = {
      ...contract,
      id: newId('empctr'),
      createdAt: new Date().toISOString(),
      startDate,
      status: contract.status || 'ACTIVE'
    };

    setEmployeeContracts(prev => {
      const next = prev.map(item => (
        item.employeeId === created.employeeId && item.status === 'ACTIVE' && created.status === 'ACTIVE'
          ? { ...item, status: 'CLOSED', endDate: item.endDate || created.startDate }
          : item
      ));
      return [created, ...next];
    });

    const afterSnapshot = buildEmployeeSalarySnapshot(created);

    addSalaryHistoryEntry({
      employeeId: created.employeeId,
      contractId: created.id,
      date: created.startDate,
      source: 'CONTRACT',
      action: 'CONTRACT_ADDED',
      before: buildEmployeeSalarySnapshot(employee),
      after: afterSnapshot,
      note: created.title || created.notes || 'Contract added'
    });

    if (applyToEmployee) {
      setEmployees(prev => applyContractSnapshotToEmployee(prev, created));
    }

    return makeSuccess();
  };
  const updateEmployeeContract = (id: string, updates: Partial<EmployeeContract>, applyToEmployee = false): MutationResult => {
    const permission = enforcePermission('HR', 'EDIT', 'HR > Contracts');
    if (!permission.ok) return permission;

    const existing = employeeContracts.find(c => c.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Employee contract not found.');
    const employee = employees.find(e => e.id === existing.employeeId);
    const { id: _ignoredId, employeeId: _ignoredEmployeeId, createdAt: _ignoredCreatedAt, ...allowedUpdates } = updates;
    const next: EmployeeContract = {
      ...existing,
      ...allowedUpdates
    };
    const beforeSnapshot = buildEmployeeSalarySnapshot(existing);
    const afterSnapshot = buildEmployeeSalarySnapshot(next);
    setEmployeeContracts(prev => prev.map(c => c.id === id ? next : c));
    if (!isSameSalarySnapshot(beforeSnapshot, afterSnapshot)) {
      addSalaryHistoryEntry({
        employeeId: existing.employeeId,
        contractId: existing.id,
        date: new Date().toISOString().slice(0, 10),
        source: 'CONTRACT',
        action: 'SALARY_CHANGED',
        before: beforeSnapshot,
        after: afterSnapshot,
        note: next.title || existing.title || 'Contract updated'
      });
    }
    if (applyToEmployee && employee) {
      setEmployees(prev => applyContractSnapshotToEmployee(prev, next));
    }
    appendAuditLog({
      entityType: 'employee_contract',
      entityId: id,
      action: 'UPDATE',
      screen: 'HR > Contracts',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };
  const deleteEmployeeContract = (id: string): MutationResult => {
    const permission = enforcePermission('HR', 'DELETE', 'HR > Contracts');
    if (!permission.ok) return permission;

    const existing = employeeContracts.find(c => c.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Employee contract not found.');
    setEmployeeContracts(prev => prev.filter(c => c.id !== id));
    setSalaryHistory(prev => prev.filter(entry => entry.contractId !== id));
    appendAuditLog({
      entityType: 'employee_contract',
      entityId: id,
      action: 'DELETE',
      screen: 'HR',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const calcInclusiveDays = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return 0;
    const a = new Date(`${startDate}T00:00:00Z`);
    const b = new Date(`${endDate}T00:00:00Z`);
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;
    const ms = end.getTime() - start.getTime();
    return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  const addEmployeeLeaveRequest: AccountingContextType['addEmployeeLeaveRequest'] = (req) => {
    const permission = enforcePermission('HR', 'ADD', 'HR > Leaves');
    if (!permission.ok) return permission;

    const employee = employees.find(e => e.id === req.employeeId);
    if (!employee) return makeError('VALIDATION_ERROR', 'Employee not found.');
    if (!req.effectiveFrom || !req.effectiveTo) return makeError('VALIDATION_ERROR', 'Leave dates are required.');
    const days = Number.isFinite(Number(req.days)) && Number(req.days) > 0
      ? Math.max(1, Math.floor(Number(req.days)))
      : calcInclusiveDays(req.effectiveFrom, req.effectiveTo);
    const created: EmployeeLeaveRequest = {
      ...req,
      id: newId('leave'),
      createdAt: new Date().toISOString(),
      days,
      status: req.status || 'PENDING',
      deductFromPayroll: req.deductFromPayroll ?? (req.leaveType === 'UNPAID'),
      postedReferences: Array.isArray(req.postedReferences) ? req.postedReferences : []
    };
    setEmployeeLeaveRequests(prev => [created, ...prev]);
    appendAuditLog({
      entityType: 'employee_leave',
      entityId: created.id,
      action: 'CREATE',
      screen: 'HR > Leaves',
      after: safeClone(created)
    });
    return makeSuccess();
  };

  const updateEmployeeLeaveRequest: AccountingContextType['updateEmployeeLeaveRequest'] = (id, updates) => {
    const permission = enforcePermission('HR', 'EDIT', 'HR > Leaves');
    if (!permission.ok) return permission;

    const existing = employeeLeaveRequests.find(r => r.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Leave request not found.');
    const next: EmployeeLeaveRequest = {
      ...existing,
      ...updates
    };
    if ((updates.effectiveFrom || updates.effectiveTo) && !(updates.days && updates.days > 0)) {
      next.days = calcInclusiveDays(next.effectiveFrom, next.effectiveTo);
    }
    if (updates.status && updates.status !== existing.status) {
      next.decisionAt = new Date().toISOString();
    }
    setEmployeeLeaveRequests(prev => prev.map(r => r.id === id ? next : r));
    appendAuditLog({
      entityType: 'employee_leave',
      entityId: id,
      action: 'UPDATE',
      screen: 'HR > Leaves',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteEmployeeLeaveRequest: AccountingContextType['deleteEmployeeLeaveRequest'] = (id) => {
    const permission = enforcePermission('HR', 'DELETE', 'HR > Leaves');
    if (!permission.ok) return permission;

    const existing = employeeLeaveRequests.find(r => r.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Leave request not found.');
    setEmployeeLeaveRequests(prev => prev.filter(r => r.id !== id));
    appendAuditLog({
      entityType: 'employee_leave',
      entityId: id,
      action: 'DELETE',
      screen: 'HR > Leaves',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const addEmployeeRecurringDeduction: AccountingContextType['addEmployeeRecurringDeduction'] = (item) => {
    const permission = enforcePermission('HR', 'ADD', 'HR > Recurring Deductions');
    if (!permission.ok) return permission;

    const employee = employees.find(e => e.id === item.employeeId);
    if (!employee) return makeError('VALIDATION_ERROR', 'Employee not found.');
    if (!item.label?.trim()) return makeError('VALIDATION_ERROR', 'Deduction label is required.');
    if (!Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) {
      return makeError('VALIDATION_ERROR', 'Deduction amount must be greater than zero.');
    }
    const created: EmployeeRecurringDeduction = {
      ...item,
      id: newId('recded'),
      createdAt: new Date().toISOString(),
      amount: Number(item.amount),
      installmentsApplied: 0,
      postedReferences: Array.isArray(item.postedReferences) ? item.postedReferences : []
    };
    setEmployeeRecurringDeductions(prev => [created, ...prev]);
    appendAuditLog({
      entityType: 'employee_recurring_deduction',
      entityId: created.id,
      action: 'CREATE',
      screen: 'HR > Recurring Deductions',
      after: safeClone(created)
    });
    return makeSuccess();
  };

  const updateEmployeeRecurringDeduction: AccountingContextType['updateEmployeeRecurringDeduction'] = (id, updates) => {
    const permission = enforcePermission('HR', 'EDIT', 'HR > Recurring Deductions');
    if (!permission.ok) return permission;

    const existing = employeeRecurringDeductions.find(d => d.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Recurring deduction not found.');
    const next: EmployeeRecurringDeduction = {
      ...existing,
      ...updates,
      amount: updates.amount !== undefined ? Number(updates.amount) : existing.amount
    };
    setEmployeeRecurringDeductions(prev => prev.map(d => d.id === id ? next : d));
    appendAuditLog({
      entityType: 'employee_recurring_deduction',
      entityId: id,
      action: 'UPDATE',
      screen: 'HR > Recurring Deductions',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteEmployeeRecurringDeduction: AccountingContextType['deleteEmployeeRecurringDeduction'] = (id) => {
    const permission = enforcePermission('HR', 'DELETE', 'HR > Recurring Deductions');
    if (!permission.ok) return permission;

    const existing = employeeRecurringDeductions.find(d => d.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Recurring deduction not found.');
    setEmployeeRecurringDeductions(prev => prev.filter(d => d.id !== id));
    appendAuditLog({
      entityType: 'employee_recurring_deduction',
      entityId: id,
      action: 'DELETE',
      screen: 'HR > Recurring Deductions',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const addFingerprintDevice: AccountingContextType['addFingerprintDevice'] = (device) => {
    const permission = enforcePermission('SETTINGS', 'ADD', 'Settings > Fingerprint Readers');
    if (!permission.ok) return permission;

    const created: FingerprintReaderDevice = {
      id: device.id || newId('fpdev'),
      name: (device.name || '').trim() || 'Fingerprint Reader',
      vendor: device.vendor || 'OTHER',
      mode: device.mode || 'MANUAL',
      protocol: device.protocol || (device.mode === 'DIRECT' ? 'TCP' : 'FILE'),
      model: device.model || '',
      serialNumber: device.serialNumber || '',
      host: device.host || '',
      port: typeof device.port === 'number' ? device.port : undefined,
      localAgentUrl: device.localAgentUrl || '',
      location: device.location || '',
      isActive: device.isActive !== false,
      notes: device.notes || '',
      createdAt: new Date().toISOString(),
      lastSyncAt: device.lastSyncAt
    };
    setFingerprintDevices(prev => [created, ...prev]);
    appendAuditLog({
      entityType: 'fingerprint_device',
      entityId: created.id,
      action: 'CREATE',
      screen: 'Settings > Fingerprint Readers',
      after: safeClone(created)
    });
    return makeSuccess();
  };

  const updateFingerprintDevice: AccountingContextType['updateFingerprintDevice'] = (id, updates) => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings > Fingerprint Readers');
    if (!permission.ok) return permission;

    const existing = fingerprintDevices.find(d => d.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Fingerprint device not found.');
    const next: FingerprintReaderDevice = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };
    setFingerprintDevices(prev => prev.map(d => d.id === id ? next : d));
    appendAuditLog({
      entityType: 'fingerprint_device',
      entityId: id,
      action: 'UPDATE',
      screen: 'Settings > Fingerprint Readers',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteFingerprintDevice: AccountingContextType['deleteFingerprintDevice'] = (id) => {
    const permission = enforcePermission('SETTINGS', 'DELETE', 'Settings > Fingerprint Readers');
    if (!permission.ok) return permission;

    const existing = fingerprintDevices.find(d => d.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Fingerprint device not found.');
    setFingerprintDevices(prev => prev.filter(d => d.id !== id));
    appendAuditLog({
      entityType: 'fingerprint_device',
      entityId: id,
      action: 'DELETE',
      screen: 'Settings > Fingerprint Readers',
      before: safeClone(existing)
    });
    return makeSuccess();
  };

  const addFingerprintAttendanceBatch: AccountingContextType['addFingerprintAttendanceBatch'] = (batch) => {
    const permission = enforcePermission('SETTINGS', 'ADD', 'Settings > Fingerprint Readers');
    if (!permission.ok) return permission;

    const created: FingerprintAttendanceBatch = {
      id: batch.id || newId('fpbatch'),
      deviceId: batch.deviceId,
      fileName: batch.fileName,
      source: batch.source || 'MANUAL_UPLOAD',
      importedAt: new Date().toISOString(),
      status: batch.status || 'STAGED',
      rows: Array.isArray(batch.rows) ? batch.rows : []
    };
    setFingerprintAttendanceBatches(prev => [created, ...prev].slice(0, 200));
    appendAuditLog({
      entityType: 'fingerprint_batch',
      entityId: created.id,
      action: 'IMPORT',
      screen: 'Settings > Fingerprint Readers',
      metadata: { source: created.source, rows: created.rows.length, deviceId: created.deviceId || null }
    });
    return makeSuccess();
  };

  const updateFingerprintAttendanceBatch: AccountingContextType['updateFingerprintAttendanceBatch'] = (id, updates) => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings > Fingerprint Readers');
    if (!permission.ok) return permission;

    const existing = fingerprintAttendanceBatches.find(b => b.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Fingerprint batch not found.');
    const next: FingerprintAttendanceBatch = { ...existing, ...updates, id: existing.id, importedAt: existing.importedAt };
    setFingerprintAttendanceBatches(prev => prev.map(b => b.id === id ? next : b));
    appendAuditLog({
      entityType: 'fingerprint_batch',
      entityId: id,
      action: 'UPDATE',
      screen: 'Settings > Fingerprint Readers',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const deleteFingerprintAttendanceBatch: AccountingContextType['deleteFingerprintAttendanceBatch'] = (id) => {
    const permission = enforcePermission('SETTINGS', 'DELETE', 'Settings > Fingerprint Readers');
    if (!permission.ok) return permission;

    const existing = fingerprintAttendanceBatches.find(b => b.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Fingerprint batch not found.');
    setFingerprintAttendanceBatches(prev => prev.filter(b => b.id !== id));
    appendAuditLog({
      entityType: 'fingerprint_batch',
      entityId: id,
      action: 'DELETE',
      screen: 'Settings > Fingerprint Readers',
      before: safeClone(existing)
    });
    return makeSuccess();
  };
  const addDepartment = (dept: Omit<Department, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('HR', 'ADD', 'HR > Departments')) return;
    setDepartments(prev => [...prev, { ...dept, id: 'dept_' + Math.random().toString(36).substr(2, 9) }]);
  };
  const deleteDepartment = (id: string) => {
    if (!guardSubscriptionOnlyMutation('HR', 'DELETE', 'HR > Departments')) return;
    setDepartments(prev => prev.filter(d => d.id !== id));
  };

  const addTicket = (ticket: Omit<SupportTicket, 'id' | 'createdAt'>) => {
    if (!guardSubscriptionOnlyMutation('DIRECTORY', 'ADD', 'Support Tickets')) return;
    setTickets(prev => [{ ...ticket, id: 'tkt_' + Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() }, ...prev]);
  };
  const updateTicketStatus = (id: string, status: TicketStatus) => {
    if (!guardSubscriptionOnlyMutation('DIRECTORY', 'EDIT', 'Support Tickets')) return;
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };
  const deleteTicket = (id: string) => {
    if (!guardSubscriptionOnlyMutation('DIRECTORY', 'DELETE', 'Support Tickets')) return;
    setTickets(prev => prev.filter(t => t.id !== id));
  };
  const addFixedAsset = (asset: Omit<FixedAsset, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('ACCOUNTS', 'ADD', 'Fixed Assets')) return null;
    const id = Math.random().toString(36).substr(2, 9);
    setFixedAssets(prev => [...prev, { ...asset, id }]);
    return id;
  };
  const updateFixedAsset = (id: string, updates: Partial<FixedAsset>) => {
    if (!guardSubscriptionOnlyMutation('ACCOUNTS', 'EDIT', 'Fixed Assets')) return;
    setFixedAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };
  const deleteFixedAsset = (id: string) => {
    if (!guardSubscriptionOnlyMutation('ACCOUNTS', 'DELETE', 'Fixed Assets')) return;
    setFixedAssets(prev => prev.filter(a => a.id !== id));
  };
  const addAssetGroup = (group: Omit<FixedAssetGroup, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('ACCOUNTS', 'ADD', 'Fixed Asset Groups')) return;
    setAssetGroups(prev => [
      ...prev,
      {
        ...group,
        id: 'ag_' + Math.random().toString(36).substr(2, 9),
        assetAccountId: group.assetAccountId || 'acc_fixed_assets_root',
        accumulatedDepreciationAccountId: group.accumulatedDepreciationAccountId || 'acc_accumulated_depreciation',
        depreciationExpenseAccountId: group.depreciationExpenseAccountId || 'acc_depreciation_exp'
      }
    ]);
  };
  const deleteAssetGroup = (id: string) => {
    if (!guardSubscriptionOnlyMutation('ACCOUNTS', 'DELETE', 'Fixed Asset Groups')) return;
    setAssetGroups(prev => prev.filter(g => g.id !== id));
  };
  const addCheck = (check: Omit<Check, 'id'> & { id?: string }) => {
    if (!guardSubscriptionOnlyMutation('TREASURY', 'ADD', 'Checks')) return;
    setChecks(prev => [...prev, { ...check, id: check.id || Math.random().toString(36).substr(2, 9) }]);
  };
  const updateCheck = (id: string, updates: Partial<Check>) => {
    if (!guardSubscriptionOnlyMutation('TREASURY', 'EDIT', 'Checks')) return;
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };
  const deleteCheck = (id: string) => {
    if (!guardSubscriptionOnlyMutation('TREASURY', 'DELETE', 'Checks')) return;
    setChecks(prev => prev.filter(c => c.id !== id));
  };
  const setBaseCurrency = (code: string) => {
    if (!guardSubscriptionOnlyMutation('SETTINGS', 'EDIT', 'Settings > Currency')) return;
    setBaseCurrencyState(code);

    // Immediately persist workspace settings to prevent loss during rapid page refreshes
    if (currentCompanyId) {
      if (useBackend && isFirebaseAuthEnabled) {
        if (currentUser) {
          callBackendApi(currentUser, `/companies/${currentCompanyId}`, 'PUT', {
            baseCurrency: code,
            settings: companySettings
          })
            .then((res) => {
              console.log('[Backend Sync] Base currency updated successfully:', res);
              if (res && res.company) {
                setCompanies(prev => prev.map(c => c.id === currentCompanyId ? res.company : c));
              }
            })
            .catch(err => {
              console.error('[Backend Sync ERROR] Failed to update base currency:', err);
            });
        }
      } else {
        const snapshot: CompanyWorkspaceSnapshot = {
          schemaVersion: 1,
          companyId: currentCompanyId,
          updatedAt: new Date().toISOString(),
          baseCurrency: code,
          companySettings,
          users: [],
          accounts: [],
          transactions: [],
          invoices: [],
          invoiceSettlements: [],
          importExpenseDistributions: [],
          products: [],
          itemGroups: [],
          units: [],
          contacts: [],
          employees: [],
          employeeContracts: [],
          salaryHistory: [],
          employeeLeaveRequests: [],
          employeeRecurringDeductions: [],
          fingerprintDevices,
          fingerprintAttendanceBatches,
          departments: [],
          tickets: [],
          fixedAssets: [],
          assetGroups: [],
          checks: [],
          currencies: [],
          warehouses: [],
          stockTransfers: [],
          boms: [],
          productionOrders: [],
          permissions,
          auditLogs
        };
        
        void persistWorkspaceSnapshot(currentCompanyId, snapshot).then(didPersist => {
          if (didPersist) {
            upsertWorkspaceSyncQueueItem(currentCompanyId, snapshot.updatedAt, currentUser?.id);
            setSyncQueueVersion(prev => prev + 1);
          }
        });
      }
    }
  };
  const addCurrency = (currency: Currency) => {
    if (!guardSubscriptionOnlyMutation('SETTINGS', 'ADD', 'Settings > Currency')) return;
    setCurrencies(prev => [...prev, currency]);
  };
  const deleteCurrency = (code: string) => {
    if (!guardSubscriptionOnlyMutation('SETTINGS', 'DELETE', 'Settings > Currency')) return;
    setCurrencies(prev => prev.filter(c => c.code !== code));
  };
  const updateCurrencyRate = (code: string, rate: number) => {
    if (!guardSubscriptionOnlyMutation('SETTINGS', 'EDIT', 'Settings > Currency')) return;
    setCurrencies(prev => prev.map(c => c.code === code ? { ...c, rate } : c));
  };
  const updateCompanySettings = (settings: CompanySettings): MutationResult => {
    const next = withNormalizedValuationSettings({
      ...companySettings,
      ...settings
    });
    const languageOnlyChange = isLanguageOnlyCompanySettingsChange(companySettings, next);
    if (!languageOnlyChange) {
      const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings');
      if (!permission.ok) return permission;
    }

    setCompanySettings(next);
    setCompanies(prev => prev.map(company => (
      company.id === currentCompanyId
        ? {
          ...company,
          name: next.name,
          taxNumber: next.taxNumber,
          address: next.address,
          phone: next.phone,
          logoUrl: next.logoUrl,
          baseCurrency: company.baseCurrency,
          settings: next
        }
        : company
    )));

    // Immediately persist settings snapshot to prevent loss during rapid page refreshes or closures
    if (currentCompanyId) {
      if (useBackend && isFirebaseAuthEnabled) {
        if (currentUser) {
          callBackendApi(currentUser, `/companies/${currentCompanyId}`, 'PUT', {
            name: next.name,
            taxNumber: next.taxNumber,
            address: next.address,
            phone: next.phone,
            logoUrl: next.logoUrl,
            baseCurrency,
            settings: next
          })
            .then((res) => {
              console.log('[Backend Sync] Company settings updated successfully:', res);
              if (res && res.company) {
                setCompanies(prev => prev.map(c => c.id === currentCompanyId ? res.company : c));
              }
            })
            .catch(err => {
              console.error('[Backend Sync ERROR] Failed to update company settings:', err);
            });
        }
      } else {
        const snapshot: CompanyWorkspaceSnapshot = {
          schemaVersion: 1,
          companyId: currentCompanyId,
          updatedAt: new Date().toISOString(),
          baseCurrency,
          companySettings: next,
          users: [],
          accounts: [],
          transactions: [],
          invoices: [],
          invoiceSettlements: [],
          importExpenseDistributions: [],
          products: [],
          itemGroups: [],
          units: [],
          contacts: [],
          employees: [],
          employeeContracts: [],
          salaryHistory: [],
          employeeLeaveRequests: [],
          employeeRecurringDeductions: [],
          fingerprintDevices,
          fingerprintAttendanceBatches,
          departments: [],
          tickets: [],
          fixedAssets: [],
          assetGroups: [],
          checks: [],
          currencies: [],
          warehouses: [],
          stockTransfers: [],
          boms: [],
          productionOrders: [],
          permissions,
          auditLogs: [
            {
              entityType: 'company_settings',
              action: 'UPDATE',
              screen: 'Settings',
              before: safeClone(companySettings),
              after: safeClone(next)
            },
            ...auditLogs
          ]
        };
        
        void persistWorkspaceSnapshot(currentCompanyId, snapshot).then(didPersist => {
          if (didPersist) {
            upsertWorkspaceSyncQueueItem(currentCompanyId, snapshot.updatedAt, currentUser?.id);
            setSyncQueueVersion(prev => prev + 1);
          }
        });
      }
    }

    appendAuditLog({
      entityType: 'company_settings',
      action: 'UPDATE',
      screen: 'Settings',
      before: safeClone(companySettings),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const buildEmployeeSalarySnapshot = (emp: Pick<Employee, 'salaryType' | 'payBasis' | 'basicSalary' | 'dailyWorkHours' | 'hourlyRate' | 'dailyRate' | 'weeklyRate' | 'commissionRatePercent' | 'overtimeHourlyRate' | 'housingAllowance' | 'transportAllowance' | 'otherAllowances'>): EmployeeSalarySnapshot => ({
    salaryType: emp.salaryType,
    payBasis: emp.payBasis || (emp.salaryType === 'HOURLY' ? 'HOURLY' : 'FIXED_MONTHLY'),
    basicSalary: Number(emp.basicSalary) || 0,
    dailyWorkHours: Number(emp.dailyWorkHours) || 0,
    hourlyRate: Number(emp.hourlyRate) || 0,
    dailyRate: Number(emp.dailyRate) || 0,
    weeklyRate: Number(emp.weeklyRate) || 0,
    commissionRatePercent: Number(emp.commissionRatePercent) || 0,
    overtimeHourlyRate: Number(emp.overtimeHourlyRate) || 0,
    housingAllowance: Number(emp.housingAllowance) || 0,
    transportAllowance: Number(emp.transportAllowance) || 0,
    otherAllowances: Number(emp.otherAllowances) || 0
  });

  const isSameSalarySnapshot = (a?: EmployeeSalarySnapshot, b?: EmployeeSalarySnapshot): boolean => {
    if (!a || !b) return false;
    return a.salaryType === b.salaryType &&
      (a.payBasis || (a.salaryType === 'HOURLY' ? 'HOURLY' : 'FIXED_MONTHLY')) === (b.payBasis || (b.salaryType === 'HOURLY' ? 'HOURLY' : 'FIXED_MONTHLY')) &&
      a.basicSalary === b.basicSalary &&
      a.dailyWorkHours === b.dailyWorkHours &&
      a.hourlyRate === b.hourlyRate &&
      (a.dailyRate || 0) === (b.dailyRate || 0) &&
      (a.weeklyRate || 0) === (b.weeklyRate || 0) &&
      (a.commissionRatePercent || 0) === (b.commissionRatePercent || 0) &&
      a.overtimeHourlyRate === b.overtimeHourlyRate &&
      a.housingAllowance === b.housingAllowance &&
      a.transportAllowance === b.transportAllowance &&
      a.otherAllowances === b.otherAllowances;
  };

  const addSalaryHistoryEntry = (entry: Omit<SalaryHistoryEntry, 'id'>) => {
    const created: SalaryHistoryEntry = { ...entry, id: newId('salaryhist') };
    setSalaryHistory(prev => [created, ...prev]);
    appendAuditLog({
      entityType: 'salary_history',
      entityId: created.id,
      action: entry.action,
      screen: 'HR',
      after: safeClone(created)
    });
  };

  const applyContractSnapshotToEmployee = (
    prevEmployees: Employee[],
    contract: Pick<EmployeeContract, 'employeeId' | 'title' | 'salaryType' | 'payBasis' | 'basicSalary' | 'dailyWorkHours' | 'hourlyRate' | 'dailyRate' | 'weeklyRate' | 'commissionRatePercent' | 'overtimeHourlyRate' | 'housingAllowance' | 'transportAllowance' | 'otherAllowances' | 'annualLeaveEntitlementDays'>
  ) => prevEmployees.map(employee => (
    employee.id === contract.employeeId
      ? {
        ...employee,
        position: contract.title || employee.position,
        salaryType: contract.salaryType,
        payBasis: contract.payBasis,
        basicSalary: contract.basicSalary,
        dailyWorkHours: contract.dailyWorkHours,
        hourlyRate: contract.hourlyRate,
        dailyRate: contract.dailyRate,
        weeklyRate: contract.weeklyRate,
        commissionRatePercent: contract.commissionRatePercent,
        overtimeHourlyRate: contract.overtimeHourlyRate,
        housingAllowance: contract.housingAllowance,
        transportAllowance: contract.transportAllowance,
        otherAllowances: contract.otherAllowances,
        annualLeaveEntitlementDays: contract.annualLeaveEntitlementDays
      }
      : employee
  ));

  const addUser = (user: Omit<User, 'id'> & { id?: string }) => setUsers(prev => [...prev, { ...user, id: user.id || Math.random().toString(36).substr(2, 9) } as User]);
  const updateUser = (id: string, user: Partial<User>) => setUsers(prev => prev.map(u => u.id === id ? { ...u, ...user } : u));
  const deleteUser = (id: string) => setUsers(prev => prev.filter(u => u.id !== id));

  // --- WAREHOUSE STATE ---
  const [warehouses, setWarehouses] = useFirestoreSyncState<Warehouse>('warehouses', initialWarehouses, currentCompanyId, currentUser?.id || null);
  const [stockTransfers, setStockTransfers] = useFirestoreSyncState<StockTransfer>('stockTransfers', initialStockTransfers, currentCompanyId, currentUser?.id || null);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    const companyKey = currentCompanyId;
    if (migrationDraftAutoPostRef.current.has(companyKey)) return;
    migrationDraftAutoPostRef.current.add(companyKey);

    setTransactions(prev => {
      let changed = false;
      const next = prev.map(transaction => {
        if (transaction.status === 'DRAFT') {
          changed = true;
          return { ...transaction, status: 'POSTED' };
        }
        return transaction;
      });
      return changed ? next : prev;
    });

    setInvoices(prev => {
      let changed = false;
      const next = prev.map(invoice => {
        const desiredPostingStatus = invoice.status === 'QUOTATION' ? 'DRAFT' : 'POSTED';
        if ((invoice.postingStatus || 'POSTED') !== desiredPostingStatus) {
          changed = true;
          return { ...invoice, postingStatus: desiredPostingStatus };
        }
        return invoice;
      });
      return changed ? next : prev;
    });

    setStockTransfers(prev => {
      let changed = false;
      const next = prev.map(transfer => {
        if (transfer.status !== 'POSTED') {
          changed = true;
          return { ...transfer, status: 'POSTED' };
        }
        return transfer;
      });
      return changed ? next : prev;
    });
  }, [currentCompanyId, workspaceHydratedForCompanyId]);


  // --- MANUFACTURING STATE ---
  const [boms, setBoms] = useFirestoreSyncState<BillOfMaterial>('boms', initialBoms, currentCompanyId, currentUser?.id || null);
  const [productionOrders, setProductionOrders] = useFirestoreSyncState<ProductionOrder>('productionOrders', initialProductionOrders, currentCompanyId, currentUser?.id || null);

  const buildDefaultWorkspaceSnapshot = (companyId: string): CompanyWorkspaceSnapshot => {
    const meta = companies.find(c => c.id === companyId);
    return {
      schemaVersion: 1,
      companyId,
      updatedAt: new Date().toISOString(),
      baseCurrency: 'ILS',
      companySettings: {
        ...defaultCompanySettings,
        name: meta?.name || defaultCompanySettings.name,
        taxNumber: meta?.taxNumber || defaultCompanySettings.taxNumber,
        address: meta?.address || defaultCompanySettings.address,
        phone: meta?.phone || defaultCompanySettings.phone,
        logoUrl: normalizeBrandLogoUrl(meta?.logoUrl, defaultCompanySettings.logoUrl)
      },
      users: safeClone(initialUsers),
      accounts: safeClone(initialAccounts),
      transactions: safeClone(initialTransactions),
      invoices: safeClone(initialInvoices),
      invoiceSettlements: [],
      importExpenseDistributions: [],
      products: safeClone(seededProducts),
      itemGroups: safeClone(defaultItemGroups),
      units: safeClone(initialUnits),
      contacts: safeClone(seededContacts),
      employees: safeClone(initialEmployees),
      employeeContracts: [],
      salaryHistory: [],
      employeeLeaveRequests: [],
      employeeRecurringDeductions: [],
      fingerprintDevices: [],
      fingerprintAttendanceBatches: [],
      departments: safeClone(defaultDepartments),
      tickets: safeClone(initialTickets),
      fixedAssets: safeClone(initialFixedAssets),
      assetGroups: safeClone(initialAssetGroups),
      checks: safeClone(initialChecks),
      currencies: safeClone(defaultCurrencies),
      warehouses: safeClone(initialWarehouses),
      stockTransfers: safeClone(initialStockTransfers),
      boms: safeClone(initialBoms),
      productionOrders: safeClone(initialProductionOrders),
      permissions: normalizePermissionMatrix(),
      auditLogs: []
    };
  };

  const buildEmptyWorkspaceSnapshot = (profile: CompanyProfile): CompanyWorkspaceSnapshot => {
    const seededCurrentUser: User[] = currentUser ? [{
      ...currentUser,
      companyId: profile.id,
      status: 'ACTIVE',
      lastActive: currentUser.lastActive || new Date().toISOString()
    }] : [];

    return {
      schemaVersion: 1,
      companyId: profile.id,
      updatedAt: new Date().toISOString(),
      baseCurrency: 'ILS',
      companySettings: {
        ...defaultCompanySettings,
        name: profile.name,
        taxNumber: profile.taxNumber || '',
        address: profile.address || '',
        phone: profile.phone || '',
        logoUrl: normalizeBrandLogoUrl(profile.logoUrl, defaultCompanySettings.logoUrl)
      },
      users: seededCurrentUser,
      accounts: safeClone(initialAccounts),
      transactions: [],
      invoices: [],
      invoiceSettlements: [],
      importExpenseDistributions: [],
      products: [],
      itemGroups: [],
      units: safeClone(initialUnits),
      contacts: safeClone(initialContacts.filter(contact => contact.id === 'cash_customer')),
      employees: [],
      employeeContracts: [],
      salaryHistory: [],
      employeeLeaveRequests: [],
      employeeRecurringDeductions: [],
      fingerprintDevices: [],
      fingerprintAttendanceBatches: [],
      departments: safeClone(defaultDepartments),
      tickets: [],
      fixedAssets: [],
      assetGroups: safeClone(initialAssetGroups),
      checks: [],
      currencies: safeClone(defaultCurrencies),
      warehouses: safeClone(initialWarehouses),
      stockTransfers: [],
      boms: [],
      productionOrders: [],
      permissions: normalizePermissionMatrix(),
      auditLogs: []
    };
  };

  const isUntouchedSeededWorkspaceSnapshot = (
    companyId: string,
    snapshot: CompanyWorkspaceSnapshot
  ): boolean => {
    if (companyId === 'cmp_default') return false;
    return (
      snapshot.transactions.length === initialTransactions.length &&
      snapshot.invoices.length === initialInvoices.length &&
      snapshot.products.length === seededProducts.length &&
      snapshot.contacts.length === seededContacts.length &&
      snapshot.employees.length === initialEmployees.length &&
      snapshot.tickets.length === initialTickets.length &&
      snapshot.fixedAssets.length === initialFixedAssets.length &&
      snapshot.checks.length === initialChecks.length &&
      snapshot.stockTransfers.length === initialStockTransfers.length &&
      snapshot.boms.length === initialBoms.length &&
      snapshot.productionOrders.length === initialProductionOrders.length
    );
  };

  const buildInitialWorkspaceSnapshot = (
    companyId: string,
    existing: CompanyWorkspaceSnapshot | null
  ): CompanyWorkspaceSnapshot => {
    const companyProfile = companies.find(company => company.id === companyId) || {
      id: companyId,
      name: defaultCompanySettings.name,
      taxNumber: '',
      address: '',
      phone: '',
      logoUrl: defaultCompanySettings.logoUrl,
      createdAt: new Date().toISOString(),
      trialEndsAt: addDaysIso(new Date().toISOString(), 14),
      subscriptionStatus: 'TRIAL' as const,
      subscriptionPlan: 'TRIAL' as const,
      subscriptionStartsAt: new Date().toISOString(),
      graceDays: 0
    };

    if (forceEmptyBootstrap) {
      return buildEmptyWorkspaceSnapshot(companyProfile);
    }

    const isCloudCompany = cloudMemberships.some(membership => membership.companyId === companyId);

    if (existing) {
      if (isCloudCompany && isUntouchedSeededWorkspaceSnapshot(companyId, existing)) {
        return buildEmptyWorkspaceSnapshot(companyProfile);
      }
      return existing;
    }

    if (isCloudCompany) {
      return buildEmptyWorkspaceSnapshot(companyProfile);
    }

    return buildDefaultWorkspaceSnapshot(companyId);
  };

  const parseWorkspaceSnapshot = (
    companyId: string,
    raw: unknown
  ): CompanyWorkspaceSnapshot | null => {
    try {
      if (!raw) return null;
      const parsed = typeof raw === 'string'
        ? JSON.parse(raw) as Partial<CompanyWorkspaceSnapshot>
        : raw as Partial<CompanyWorkspaceSnapshot>;
      if (!parsed || parsed.companyId !== companyId) return null;
      return normalizeWorkspaceSnapshotCashContact({
        schemaVersion: 1,
        companyId,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        baseCurrency: parsed.baseCurrency || 'ILS',
        companySettings: withNormalizedValuationSettings({ ...defaultCompanySettings, ...(parsed.companySettings || {}) }),
        users: Array.isArray(parsed.users) ? parsed.users : safeClone(initialUsers),
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : safeClone(initialAccounts),
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : safeClone(initialTransactions),
        invoices: Array.isArray(parsed.invoices) ? sanitizeInvoices(parsed.invoices) : safeClone(initialInvoices),
        invoiceSettlements: Array.isArray((parsed as any).invoiceSettlements) ? ((parsed as any).invoiceSettlements as InvoiceSettlement[]) : [],
        importExpenseDistributions: Array.isArray(parsed.importExpenseDistributions) ? parsed.importExpenseDistributions : [],
        products: Array.isArray(parsed.products) ? parsed.products : safeClone(seededProducts),
        itemGroups: Array.isArray(parsed.itemGroups) ? parsed.itemGroups : safeClone(defaultItemGroups),
        units: Array.isArray(parsed.units) ? parsed.units : safeClone(initialUnits),
        contacts: Array.isArray(parsed.contacts) ? parsed.contacts : safeClone(seededContacts),
        employees: Array.isArray(parsed.employees) ? parsed.employees : safeClone(initialEmployees),
        employeeContracts: Array.isArray((parsed as any).employeeContracts) ? ((parsed as any).employeeContracts as EmployeeContract[]) : [],
        salaryHistory: Array.isArray((parsed as any).salaryHistory) ? ((parsed as any).salaryHistory as SalaryHistoryEntry[]) : [],
        employeeLeaveRequests: Array.isArray((parsed as any).employeeLeaveRequests) ? ((parsed as any).employeeLeaveRequests as EmployeeLeaveRequest[]) : [],
        employeeRecurringDeductions: Array.isArray((parsed as any).employeeRecurringDeductions) ? ((parsed as any).employeeRecurringDeductions as EmployeeRecurringDeduction[]) : [],
        fingerprintDevices: Array.isArray((parsed as any).fingerprintDevices) ? ((parsed as any).fingerprintDevices as FingerprintReaderDevice[]) : [],
        fingerprintAttendanceBatches: Array.isArray((parsed as any).fingerprintAttendanceBatches) ? ((parsed as any).fingerprintAttendanceBatches as FingerprintAttendanceBatch[]) : [],
        departments: Array.isArray(parsed.departments) ? parsed.departments : safeClone(defaultDepartments),
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : safeClone(initialTickets),
        fixedAssets: Array.isArray(parsed.fixedAssets) ? parsed.fixedAssets : safeClone(initialFixedAssets),
        assetGroups: Array.isArray(parsed.assetGroups) ? parsed.assetGroups : safeClone(initialAssetGroups),
        checks: Array.isArray(parsed.checks) ? parsed.checks : safeClone(initialChecks),
        currencies: Array.isArray(parsed.currencies) ? parsed.currencies : safeClone(defaultCurrencies),
        warehouses: Array.isArray(parsed.warehouses) ? parsed.warehouses : safeClone(initialWarehouses),
        stockTransfers: Array.isArray(parsed.stockTransfers) ? parsed.stockTransfers : safeClone(initialStockTransfers),
        boms: Array.isArray(parsed.boms) ? parsed.boms : safeClone(initialBoms),
        productionOrders: Array.isArray(parsed.productionOrders) ? parsed.productionOrders : safeClone(initialProductionOrders),
        permissions: resolveWorkspacePermissions(parsed.permissions, Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []),
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []
      });
    } catch {
      return null;
    }
  };

  const readLegacyWorkspaceSnapshot = (companyId: string): CompanyWorkspaceSnapshot | null => {
    return null;
  };

  const persistWorkspaceSnapshot = async (
    companyId: string,
    snapshot: CompanyWorkspaceSnapshot
  ): Promise<boolean> => {
    try {
      // Disabled localStorage write
      return true;
    } catch (e) {
      console.warn('Failed to persist workspace settings snapshot locally:', e);
      return false;
    }
  };

  const readWorkspaceSnapshot = async (companyId: string): Promise<WorkspaceSnapshotReadResult> => {
    // Backend mode (Odoo-style): NEVER read localStorage
    // All data loads from PostgreSQL via useFirestoreSyncState hooks
    console.log('[AccountingContext] Backend mode: skipping localStorage read for company', companyId);
    return {
      snapshot: null,
      source: 'none',
      needsRewrite: false
    };

    /* OLD CODE DISABLED - kept for reference
    console.log('[AccountingContext] readWorkspaceSnapshot called', {
      useBackend,
      isFirebaseAuthEnabled,
      companyId
    });

    if (useBackend && isFirebaseAuthEnabled) {
      console.log('[AccountingContext] ✅ Backend mode enabled, skipping localStorage read');
      return {
        snapshot: null,
        source: 'none',
        needsRewrite: false
      };
    }

    console.warn('[AccountingContext] ⚠️ Backend mode disabled or Firebase not enabled, will read localStorage', {
      useBackend,
      isFirebaseAuthEnabled
    });

    let localSnapshot: CompanyWorkspaceSnapshot | null = null;
    try {
      const raw = localStorage.getItem(getCompanyWorkspaceKey(companyId));
      if (raw) {
        const sizeMB = (raw.length / 1024 / 1024).toFixed(2);
        console.log(`[AccountingContext] Reading localStorage: ${sizeMB} MB`);
      }
      localSnapshot = parseWorkspaceSnapshot(companyId, raw);
    } catch (e) {
      console.warn('Failed to read local workspace snapshot:', e);
    }

    if (isFirebaseSyncEnabled && firebaseDb && currentUser && !isGuestUser(currentUser)) {
      try {
        const syncDocRef = doc(firebaseDb, `users/${currentUser.id}/workspace_sync_snapshots`, companyId);
        const syncDocSnap = await getDoc(syncDocRef);
        if (syncDocSnap.exists()) {
          const remoteData = syncDocSnap.data();
          const remoteSnapshot = parseWorkspaceSnapshot(companyId, remoteData.snapshot);
          if (remoteSnapshot) {
            return {
              snapshot: remoteSnapshot,
              source: 'remote',
              needsRewrite: true
            };
          }
        }
      } catch (error) {
        console.warn('Failed to fetch remote workspace snapshot:', error);
      }
    }

    if (localSnapshot) {
      return {
        snapshot: localSnapshot,
        source: 'local',
        needsRewrite: false
      };
    }

    return {
      snapshot: null,
      source: 'none',
      needsRewrite: false
    };
    */
  };

  const applyWorkspaceSnapshot = (snapshot: CompanyWorkspaceSnapshot) => {
    (window as any).__IS_HYDRATING__ = true;
    try {
      const normalizedSnapshot = normalizeWorkspaceSnapshotCashContact(snapshot);
      setBaseCurrencyState(normalizedSnapshot.baseCurrency || 'ILS');
      const profile = companies.find(c => c.id === normalizedSnapshot.companyId);
      const profileName = profile?.name || '';
      const resolvedName = normalizedSnapshot.companySettings?.name && normalizedSnapshot.companySettings.name !== 'Flex Accountant'
        ? normalizedSnapshot.companySettings.name
        : (profileName || defaultCompanySettings.name);
      setCompanySettings(withNormalizedValuationSettings({
        ...defaultCompanySettings,
        ...(normalizedSnapshot.companySettings || {}),
        name: resolvedName
      }));
      // Heavy data collections are fetched and synced directly via useFirestoreSyncState hooks.
      // We no longer overwrite them with snapshot data to avoid wiping server-loaded data,
      // EXCEPT when sync is disabled or the user is a guest user (where we rely entirely on local snapshots).
      const shouldHydrateCollections = !isFirebaseSyncEnabled || !firebaseDb || !currentUser || isGuestUser(currentUser);
      if (shouldHydrateCollections) {
        setUsers(normalizedSnapshot.users || []);
        setAccounts(normalizedSnapshot.accounts || []);
        setTransactions(normalizedSnapshot.transactions || []);
        setInvoices(normalizedSnapshot.invoices || []);
        setInvoiceSettlements((normalizedSnapshot as any).invoiceSettlements || []);
        setImportExpenseDistributions(normalizedSnapshot.importExpenseDistributions || []);
        setProducts(normalizedSnapshot.products || []);
        setItemGroups(normalizedSnapshot.itemGroups || []);
        setUnits(normalizedSnapshot.units || []);
        setContacts(normalizedSnapshot.contacts || []);
        setEmployees(normalizedSnapshot.employees || []);
        setEmployeeContracts((normalizedSnapshot as any).employeeContracts || []);
        setSalaryHistory((normalizedSnapshot as any).salaryHistory || []);
        setEmployeeLeaveRequests((normalizedSnapshot as any).employeeLeaveRequests || []);
        setEmployeeRecurringDeductions((normalizedSnapshot as any).employeeRecurringDeductions || []);
        setDepartments(normalizedSnapshot.departments || []);
        setTickets(normalizedSnapshot.tickets || []);
        setFixedAssets(normalizedSnapshot.fixedAssets || []);
        setAssetGroups(normalizedSnapshot.assetGroups || []);
        setChecks(normalizedSnapshot.checks || []);
        setCurrencies(normalizedSnapshot.currencies || []);
        setWarehouses(normalizedSnapshot.warehouses || []);
        setStockTransfers(normalizedSnapshot.stockTransfers || []);
        setBoms(normalizedSnapshot.boms || []);
        setProductionOrders(normalizedSnapshot.productionOrders || []);
      }
      setPermissions(resolveWorkspacePermissions(normalizedSnapshot.permissions, normalizedSnapshot.auditLogs));
      setAuditLogs(normalizedSnapshot.auditLogs || []);
    } finally {
      // Use setTimeout to ensure the React state updates are processed before unsetting the flag
      setTimeout(() => {
        (window as any).__IS_HYDRATING__ = false;
      }, 0);
    }
  };

  const saveCurrentWorkspaceSnapshot = async (companyId: string): Promise<boolean> => {
    // Backend mode (Odoo-style): workspace syncs automatically via useFirestoreSyncState hooks
    // No need to build massive snapshot objects in memory - each collection saves independently
    console.log('[AccountingContext] Backend mode: skipping workspace snapshot save for company', companyId);
    return true;

    /* OLD CODE DISABLED - kept for reference
    const snapshot: CompanyWorkspaceSnapshot = {
      schemaVersion: 1,
      companyId,
      updatedAt: new Date().toISOString(),
      baseCurrency,
      companySettings,
      users: [],
      accounts: [],
      transactions: [],
      invoices: [],
      invoiceSettlements: [],
      importExpenseDistributions: [],
      products: [],
      itemGroups: [],
      units: [],
      contacts: [],
      employees: [],
      employeeContracts: [],
      salaryHistory: [],
      employeeLeaveRequests: [],
      employeeRecurringDeductions: [],
      fingerprintDevices,
      fingerprintAttendanceBatches,
      departments: [],
      tickets: [],
      fixedAssets: [],
      assetGroups: [],
      checks: [],
      currencies: [],
      warehouses: [],
      stockTransfers: [],
      boms: [],
      productionOrders: [],
      permissions,
      auditLogs
    };
    const isSnapshotEqual = (a: CompanyWorkspaceSnapshot, b: CompanyWorkspaceSnapshot) => {
      if (a.baseCurrency !== b.baseCurrency) return false;
      const settingsA = { ...a.companySettings, autoBackupLastRunAt: undefined };
      const settingsB = { ...b.companySettings, autoBackupLastRunAt: undefined };
      if (JSON.stringify(settingsA) !== JSON.stringify(settingsB)) return false;
      if (JSON.stringify(a.permissions) !== JSON.stringify(b.permissions)) return false;
      if (JSON.stringify(a.auditLogs) !== JSON.stringify(b.auditLogs)) return false;
      const collections: Array<keyof CompanyWorkspaceSnapshot> = [
        'users', 'accounts', 'transactions', 'invoices', 'invoiceSettlements',
        'importExpenseDistributions', 'products', 'itemGroups', 'units', 'contacts',
        'employees', 'employeeContracts', 'salaryHistory', 'employeeLeaveRequests',
        'employeeRecurringDeductions', 'fingerprintDevices', 'fingerprintAttendanceBatches',
        'departments', 'tickets', 'fixedAssets', 'assetGroups', 'checks', 'currencies',
        'warehouses', 'stockTransfers', 'boms', 'productionOrders'
      ];
      for (const key of collections) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
      }
      return true;
    };

    const isRedundant = lastSavedSnapshotRef.current && isSnapshotEqual(snapshot, lastSavedSnapshotRef.current);
    const didPersist = await persistWorkspaceSnapshot(companyId, snapshot);
    if (!didPersist) return false;

    lastSavedSnapshotRef.current = snapshot;

    if (isRedundant) {
      return true;
    }

    upsertWorkspaceSyncQueueItem(companyId, snapshot.updatedAt, currentUser?.id);
    setSyncQueueVersion(prev => prev + 1);
    return true;
    */
  };

  const persistLastWorkspaceSyncAt = (value: Date) => {
    try {
      localStorage.setItem(LAST_WORKSPACE_SYNC_AT_KEY, value.toISOString());
    } catch {
      // Ignore storage errors so sync status doesn't block data operations.
    }
  };

  const syncData = useCallback<AccountingContextType['syncData']>(async () => {
    // Backend mode (Odoo-style): useFirestoreSyncState handles sync automatically
    // Each collection syncs to PostgreSQL immediately on change via /api/.../sync endpoint
    console.log('[AccountingContext] syncData called but backend mode handles sync automatically');
    return;

    /* OLD CODE DISABLED - kept for reference
    if (!isOnline || isSyncing) return;
    if (!isFirebaseSyncEnabled || !firebaseDb || !firebaseAuth) return;
    if (!currentUser || isGuestUser(currentUser)) return;

    const authUserId = firebaseAuth.currentUser?.uid;
    if (!authUserId) return;

    const queueItems = readWorkspaceSyncQueue().filter(item => (
      !item.ownerUserId || item.ownerUserId === authUserId
    ));
    if (!queueItems.length) return;

    setIsSyncing(true);
    try {
      for (const queueItem of queueItems) {
        const { snapshot } = await readWorkspaceSnapshot(queueItem.companyId);
        if (!snapshot) {
          removeWorkspaceSyncQueueItem(queueItem.companyId);
          continue;
        }

        try {
          await setDoc(
            doc(firebaseDb, `users/${authUserId}/workspace_sync_snapshots`, snapshot.companyId),
            {
              schemaVersion: snapshot.schemaVersion,
              companyId: snapshot.companyId,
              userId: authUserId,
              clientUpdatedAt: snapshot.updatedAt,
              queuedAt: queueItem.queuedAt,
              syncAttempt: queueItem.attempts + 1,
              syncedAt: serverTimestamp(),
              snapshot
            },
            { merge: true }
          );

          const latestQueueState = readWorkspaceSyncQueue().find(item => item.companyId === snapshot.companyId);
          if (latestQueueState && latestQueueState.workspaceUpdatedAt !== snapshot.updatedAt) {
            updateWorkspaceSyncQueueItem(snapshot.companyId, { attempts: 0, lastError: undefined });
          } else {
            removeWorkspaceSyncQueueItem(snapshot.companyId);
          }

          const syncedAt = new Date();
          setLastSyncTime(syncedAt);
          persistLastWorkspaceSyncAt(syncedAt);
        } catch (error: any) {
          updateWorkspaceSyncQueueItem(queueItem.companyId, {
            attempts: Math.max(0, Number(queueItem.attempts) || 0) + 1,
            lastError: String(error?.message || 'SYNC_FAILED')
          });
        }
      }
    } finally {
      setIsSyncing(false);
    }
    */
  }, [currentUser?.id, isOnline, isSyncing, firebaseDb]);

  useEffect(() => {
    // Disabled localStorage caching of currentUser
  }, [currentUser?.id]);

  useEffect(() => {
    const fallback = buildDefaultWorkspaceSubscription({
      userId: currentUser?.id,
      userEmail: currentUser?.email,
      status: 'TRIAL',
      plan: 'TRIAL',
      provider: 'TRIAL',
      maxCompanies: Math.max(3, companies.length),
      expiresAt: currentCompany?.trialEndsAt
    });

    if (!currentUser || isGuestUser(currentUser) || !firebaseDb) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.workspaceSubscription);
        if (stored) {
          setWorkspaceSubscription(JSON.parse(stored));
          return;
        }
      } catch (e) {
        console.error(e);
      }
      setWorkspaceSubscription(normalizeWorkspaceSubscription(fallback, fallback));
      return;
    }

    const workspaceRef = doc(firebaseDb, WORKSPACE_SUBSCRIPTIONS_COLLECTION, currentUser.id);
    const unsubscribe = onSnapshot(workspaceRef, (snapshot) => {
      if (snapshot.exists()) {
        setWorkspaceSubscription(normalizeWorkspaceSubscription(snapshot.data(), fallback));
        return;
      }

      const bootstrap = normalizeWorkspaceSubscription(fallback, fallback);
      setWorkspaceSubscription(bootstrap);
      if (!bootstrappedWorkspacesRef.current.has(currentUser.id)) {
        bootstrappedWorkspacesRef.current.add(currentUser.id);
        void setDoc(workspaceRef, sanitizeFirestorePayload(bootstrap as unknown as Record<string, unknown>), { merge: true }).catch(() => {
          // Ignore bootstrap sync errors and keep local fallback.
        });
      }
    }, () => {
      setWorkspaceSubscription(prev => normalizeWorkspaceSubscription(prev, fallback));
    });

    return unsubscribe;
  }, [currentCompany?.trialEndsAt, currentUser?.id, currentUser?.email, firebaseDb]);

  // Keep workspaceSubscriptionRef in sync with workspaceSubscription state
  useEffect(() => {
    workspaceSubscriptionRef.current = workspaceSubscription;
  }, [workspaceSubscription]);

  // Removed: Re-normalize companies when workspaceSubscription changes
  // This was causing infinite render loops. Companies are already normalized
  // in the onSnapshot callback (line 1727) when loaded from Firebase.

  // LocalStorage backups removed for server-only mode

  useEffect(() => {
    // Disabled localStorage caching of currentCompanyId
  }, [currentCompanyId]);

  useEffect(() => {
    if (!companies.length) return;
    if (companies.some(c => c.id === currentCompanyId)) return;
    setCurrentCompanyId(companies[0].id);
  }, [companies, currentCompanyId]);

  // Hydrate settings directly from database when useBackend is true
  useEffect(() => {
    if (!useBackend) return;
    if (isFirebaseAuthEnabled && firebaseAuth && !isAuthInitialized) return;
    if (!currentCompanyId || !currentCompany) return;

    setBaseCurrencyState(currentCompany.baseCurrency || 'ILS');
    const resolvedName = currentCompany.settings?.name && currentCompany.settings.name !== 'Flex Accountant'
      ? currentCompany.settings.name
      : (currentCompany.name || defaultCompanySettings.name);
    setCompanySettings(withNormalizedValuationSettings({
      ...defaultCompanySettings,
      ...(currentCompany.settings || {}),
      name: resolvedName
    }));
    setWorkspaceHydratedForCompanyId(currentCompanyId);
  }, [useBackend, currentCompanyId, currentCompany, isAuthInitialized]);

  useEffect(() => {
    // DISABLED: Backend mode handles all data loading via useFirestoreSyncState hooks
    // This effect caused Out of Memory crashes by reading large localStorage snapshots
    // In Odoo-style online-only mode, we never read from localStorage
    console.log('[AccountingContext] localStorage hydration disabled - using backend mode');
    return;

    /* OLD CODE DISABLED - kept for reference
    if (useBackend) return; // Managed by the backend settings useEffect

    if (isFirebaseAuthEnabled && firebaseAuth && !isAuthInitialized) {
      return;
    }

    if (!currentCompanyId) return;
    // Rehydrate only when the active company context changes.
    // Depending on `companies` here causes settings updates to reload a stale
    // workspace snapshot before the latest state is persisted.
    const activeCompanyId = currentCompanyId;
    let cancelled = false;
    setWorkspaceHydratedForCompanyId('');

    const hydrateWorkspace = async () => {
      try {
        const readResult = forceEmptyBootstrap
          ? { snapshot: null, source: 'none' as const, needsRewrite: false }
          : await readWorkspaceSnapshot(activeCompanyId);
        const existing = readResult.snapshot;
        if (cancelled) return;

        const loaded = buildInitialWorkspaceSnapshot(activeCompanyId, existing);
        applyWorkspaceSnapshot(loaded);
        if (cancelled) return;

        setWorkspaceHydratedForCompanyId(activeCompanyId);

        const shouldPersistLoaded = !existing || readResult.needsRewrite || loaded !== existing;
        if (shouldPersistLoaded) {
          // Persist in the background so a slow storage layer does not block app boot.
          void persistWorkspaceSnapshot(activeCompanyId, loaded);
        }
      } catch (error) {
        console.error('Failed to hydrate workspace snapshot. Falling back to a safe bootstrap.', error);
        if (cancelled) return;

        const fallbackSnapshot = (() => {
          try {
            return buildInitialWorkspaceSnapshot(activeCompanyId, null);
          } catch {
            return buildDefaultWorkspaceSnapshot(activeCompanyId);
          }
        })();

        applyWorkspaceSnapshot(fallbackSnapshot);
        if (cancelled) return;

        setWorkspaceHydratedForCompanyId(activeCompanyId);
        void persistWorkspaceSnapshot(activeCompanyId, fallbackSnapshot);
      }
    };

    void hydrateWorkspace();

    return () => {
      cancelled = true;
    };
    */
  }, [currentCompanyId, cloudMemberships, isAuthInitialized]);

  useEffect(() => {
    // DISABLED: Backend mode persists data via useFirestoreSyncState hooks automatically
    // No need to build workspace snapshots manually - this was causing memory exhaustion
    // In Odoo-style online-only mode, every change syncs to PostgreSQL immediately
    console.log('[AccountingContext] Workspace snapshot persistence disabled - using backend mode');
    return;

    /* OLD CODE DISABLED - kept for reference
    if (useBackend) return;
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;

    // Debounce the heavy JSON stringification process
    // This prevents the browser from crashing (OOM/Aw Snap) when multiple collections sync concurrently from Firestore.
    const timer = setTimeout(() => {
      void saveCurrentWorkspaceSnapshot(currentCompanyId);
    }, 1500);

    return () => clearTimeout(timer);
    */
  }, [
    currentCompanyId,
    workspaceHydratedForCompanyId,
    baseCurrency,
    companySettings,
    users,
    accounts,
    transactions,
    invoices,
    invoiceSettlements,
    importExpenseDistributions,
    products,
    itemGroups,
    units,
    contacts,
    employees,
    employeeContracts,
    salaryHistory,
    employeeLeaveRequests,
    employeeRecurringDeductions,
    fingerprintDevices,
    fingerprintAttendanceBatches,
    departments,
    tickets,
    fixedAssets,
    assetGroups,
    checks,
    currencies,
    warehouses,
    stockTransfers,
    boms,
    productionOrders,
    permissions,
    auditLogs
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline || isSyncing) return;
    
    const queue = readWorkspaceSyncQueue();
    if (queue.length === 0) return;

    // If all items in the queue have already failed at least once,
    // delay the retry by 15 seconds to prevent an infinite crash loop.
    const hasNewItems = queue.some(item => !item.attempts);
    
    if (hasNewItems) {
      void syncData();
    } else {
      const timer = window.setTimeout(() => {
        void syncData();
      }, 15000);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline, isSyncing, syncQueueVersion, syncData]);

  useEffect(() => {
    if (!currentUser) return;

    const matched = users.find(u => u.id === currentUser.id) || users.find(u => u.email === currentUser.email);
    const hasCloudMembership = cloudMemberships.some(membership => membership.userId === currentUser.id);
    if (!matched) {
      setUsers(prev => {
        const exists = prev.find(u => u.id === currentUser.id) || prev.find(u => u.email === currentUser.email);
        if (exists) return prev;
        return [{
          ...currentUser,
          companyId: currentCompanyId || currentUser.companyId
        }, ...prev];
      });
      return;
    }

    if (matched.status !== 'ACTIVE') {
      setCurrentUser(null);
      return;
    }

    if (hasCloudMembership) {
      if (
        matched.name !== currentUser.name ||
        matched.role !== currentUser.role ||
        matched.status !== currentUser.status ||
        matched.picture !== currentUser.picture ||
        matched.companyId !== (currentCompanyId || currentUser.companyId)
      ) {
        setUsers(prev => prev.map(user => (
          user.id === matched.id
            ? {
              ...user,
              name: currentUser.name,
              role: currentUser.role,
              status: currentUser.status,
              picture: currentUser.picture,
              companyId: currentCompanyId || currentUser.companyId
            }
            : user
        )));
      }
      return;
    }

    if (
      matched.id !== currentUser.id ||
      matched.name !== currentUser.name ||
      matched.role !== currentUser.role ||
      matched.status !== currentUser.status ||
      matched.picture !== currentUser.picture ||
      matched.companyId !== currentUser.companyId
    ) {
      setCurrentUser({ ...currentUser, ...matched });
    }
  }, [users, currentCompanyId, currentUser, cloudMemberships]);

  useEffect(() => {
    if (!currentUser || isGuestUser(currentUser)) return;
    const pendingTrialDays = consumePendingSignupTrialSelectionDays();
    const pendingCompanyName = consumePendingSignupCompanyName();
    if (pendingTrialDays === null && !pendingCompanyName) return;

    const targetCompanyId = currentCompanyId || currentUser.companyId || companies[0]?.id;
    if (!targetCompanyId) return;

    const nowIso = new Date().toISOString();
    const nextTrialEndsAt = pendingTrialDays > 0 ? addDaysIso(nowIso, pendingTrialDays) : nowIso;
    setCompanies(prev => prev.map(company => (
      company.id === targetCompanyId
        ? withNormalizedCompanyProfile({
          ...company,
          name: pendingCompanyName || company.name,
          trialEndsAt: pendingTrialDays === null ? company.trialEndsAt : nextTrialEndsAt,
          subscriptionStatus: pendingTrialDays === null
            ? company.subscriptionStatus
            : (pendingTrialDays > 0 ? 'TRIAL' : 'EXPIRED'),
          subscriptionPlan: pendingTrialDays === null
            ? company.subscriptionPlan
            : (pendingTrialDays > 0 ? 'TRIAL' : 'NONE'),
          subscriptionStartsAt: pendingTrialDays === null
            ? company.subscriptionStartsAt
            : nowIso,
          subscriptionEndsAt: pendingTrialDays === null
            ? company.subscriptionEndsAt
            : undefined
        })
        : company
    )));
    if (pendingCompanyName && targetCompanyId === currentCompanyId) {
      setCompanySettings(prev => ({
        ...prev,
        name: pendingCompanyName
      }));
    }
  }, [currentUser, currentCompanyId, companies]);




  // Restore companies logic removed for strict server-only execution

  const switchCompany = (companyId: string): MutationResult => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return makeError('VALIDATION_ERROR', 'Company not found.');
    if (cloudMemberships.length && !cloudMemberships.some(membership => membership.companyId === companyId && membership.status === 'ACTIVE')) {
      return makeError('VALIDATION_ERROR', 'This company is not linked to your account.');
    }
    if (companyId === currentCompanyId) return makeSuccess();
    if (!useBackend) {
      void saveCurrentWorkspaceSnapshot(currentCompanyId);
    }

    // Wipe all data collections prior to switching companies to prevent flash of old company data
    setTransactions([]);
    setInvoices([]);
    setImportExpenseDistributions([]);
    setInvoiceSettlements([]);
    setAccounts([]);
    setProducts([]);
    setItemGroups([]);
    setUnits([]);
    setContacts([]);
    setEmployees([]);
    setEmployeeContracts([]);
    setSalaryHistory([]);
    setEmployeeLeaveRequests([]);
    setEmployeeRecurringDeductions([]);
    setDepartments([]);
    setTickets([]);
    setAssetGroups([]);
    setFixedAssets([]);
    setChecks([]);
    setCurrencies([]);
    setUsers([]);
    setWarehouses([]);
    setStockTransfers([]);
    setBoms([]);
    setProductionOrders([]);

    setCurrentCompanyId(companyId);
    try {
      localStorage.setItem(STORAGE_KEYS.currentCompany, companyId);
    } catch (e) {
      console.warn('Failed to save selected company to localStorage:', e);
    }
    return makeSuccess();
  };

  const createCompany = async (input: CreateCompanyInput): Promise<MutationResult> => {
    const permission = enforcePermission('SETTINGS', 'ADD', 'Company Switcher');
    if (!permission.ok) return permission;
    const name = (input.name || '').trim();
    if (!name) return makeError('VALIDATION_ERROR', 'Company name is required.');
    if (companyCreateInFlightRef.current) {
      return makeError(
        'VALIDATION_ERROR',
        companySettings.language === 'AR'
          ? 'يجري الآن إنشاء شركة أخرى. انتظر قليلًا ثم أعد المحاولة.'
          : 'Another company is being created right now. Please wait a moment and try again.'
      );
    }
    const nameConflict = findCompanyNameConflict(companies, name);
    if (nameConflict) {
      return makeError('VALIDATION_ERROR', getCompanyNameConflictMessage(nameConflict.name));
    }
    if (companies.length >= workspaceMaxCompanies) {
      const message = companySettings.language === 'AR'
        ? `الخطة الحالية تسمح حتى ${workspaceMaxCompanies} شركة فقط. لديك الآن ${companies.length} شركة. قم بترقية الاشتراك أو إضافة شركات إضافية من شاشة الاشتراك.`
        : `Your current subscription allows up to ${workspaceMaxCompanies} companies. You already use ${companies.length}. Upgrade the subscription or add extra company slots first.`;
      return makeError('SUBSCRIPTION_LIMIT', message);
    }

    try {
      companyCreateInFlightRef.current = true;
      const nowIso = new Date().toISOString();
      const companyId = newId('cmp');

      const isWorkspaceActive = workspaceSubscription && workspaceSubscription.status === 'ACTIVE';
      const companySubStatus = isWorkspaceActive ? 'ACTIVE' : 'TRIAL';
      const companySubPlan = isWorkspaceActive ? workspaceSubscription.plan : 'TRIAL';
      const companySubEndsAt = isWorkspaceActive ? workspaceSubscription.expiresAt : undefined;
      const companyTrialEnds = isWorkspaceActive ? undefined : (workspaceSubscription.expiresAt || addDaysIso(nowIso, 14));

      const profile: CompanyProfile = {
        id: companyId,
        name,
        taxNumber: input.taxNumber || '',
        address: input.address || '',
        phone: input.phone || '',
        logoUrl: normalizeBrandLogoUrl(input.logoUrl, defaultCompanySettings.logoUrl),
        createdAt: nowIso,
        trialEndsAt: companyTrialEnds || addDaysIso(nowIso, 14),
        subscriptionStatus: input.subscriptionStatus || companySubStatus,
        subscriptionPlan: input.subscriptionPlan || companySubPlan,
        subscriptionStartsAt: input.subscriptionStartsAt || nowIso,
        subscriptionEndsAt: input.subscriptionEndsAt || companySubEndsAt,
        activationCode: String(input.activationCode || '').trim() || undefined,
        graceDays: Number.isFinite(Number(input.graceDays)) ? Math.max(0, Math.min(30, Math.floor(Number(input.graceDays)))) : 0
      };

      if (!useBackend) {
        await saveCurrentWorkspaceSnapshot(currentCompanyId);
      }

      const snapshot = buildEmptyWorkspaceSnapshot(profile);
      const didPersistSnapshot = await persistWorkspaceSnapshot(profile.id, snapshot);
      if (didPersistSnapshot) {
        upsertWorkspaceSyncQueueItem(profile.id, snapshot.updatedAt, currentUser?.id);
        setSyncQueueVersion(prev => prev + 1);
      }

      await persistCloudSubscription(profile, {
        source: profile.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL',
        boundDevices: [currentDeviceBinding]
      });

      if (useBackend && isFirebaseAuthEnabled && currentUser && !isGuestUser(currentUser)) {
        const user = firebaseAuth?.currentUser || currentUser;
        if (user) {
          const res = await callBackendApi(user, '/companies', 'POST', {
            id: profile.id,
            name: profile.name,
            taxNumber: profile.taxNumber,
            address: profile.address,
            phone: profile.phone,
            logoUrl: profile.logoUrl,
            baseCurrency: 'ILS',
            settings: {
              subscriptionStatus: profile.subscriptionStatus,
              subscriptionPlan: profile.subscriptionPlan,
              subscriptionStartsAt: profile.subscriptionStartsAt,
              subscriptionEndsAt: profile.subscriptionEndsAt,
              activationCode: profile.activationCode,
              graceDays: profile.graceDays
            }
          });
          if (!res || !res.ok) {
            throw new Error(res?.error || 'Failed to create company on the custom backend.');
          }
        }
      }

      setCompanies(prev => [profile, ...prev.filter(company => company.id !== profile.id)]);
      setCurrentUser(prev => (
        prev
          ? {
            ...prev,
            companyId: profile.id
          }
          : prev
      ));
      setCurrentCompanyId(profile.id);
      try {
        localStorage.setItem(STORAGE_KEYS.currentCompany, profile.id);
      } catch (e) {
        console.warn('Failed to save selected company to localStorage:', e);
      }
      return makeSuccess();
    } catch (error: any) {
      return makeError('VALIDATION_ERROR', error?.message || 'Failed to create company.');
    } finally {
      companyCreateInFlightRef.current = false;
    }
  };

  const deleteCompany = async (companyId: string): Promise<MutationResult> => {
    const permission = enforcePermission('SETTINGS', 'DELETE', 'Company Switcher');
    if (!permission.ok) return permission;
    if (companyDeleteInFlightRef.current.has(companyId)) {
      return makeError(
        'VALIDATION_ERROR',
        companySettings.language === 'AR'
          ? 'يجري حذف هذه الشركة الآن. انتظر قليلًا.'
          : 'This company is already being deleted. Please wait a moment.'
      );
    }

    const deletionTarget = resolveCompanyDeletionTarget(companies, companyId);
    if ('reason' in deletionTarget) {
      if (deletionTarget.reason === 'NOT_FOUND') {
        return makeError('VALIDATION_ERROR', 'Company not found.');
      }
      if (deletionTarget.reason === 'LAST_COMPANY') {
        return makeError(
          'VALIDATION_ERROR',
          companySettings.language === 'AR'
            ? 'يجب أن تبقى شركة واحدة على الأقل داخل الحساب.'
            : 'At least one company must remain in the account.'
        );
      }
      return makeError('VALIDATION_ERROR', 'Could not determine a fallback company after deletion.');
    }

    const existing = deletionTarget.target;
    const fallbackCompany = deletionTarget.fallback;

    companyDeleteInFlightRef.current.add(companyId);
    try {
      const nextCompanies = companies.filter(company => company.id !== companyId);
      let didDeleteSnapshot = false;
      const cleanupWarnings: string[] = [];

      if (currentCompanyId === companyId) {
        setCurrentCompanyId(fallbackCompany.id);
        try {
          localStorage.setItem(STORAGE_KEYS.currentCompany, fallbackCompany.id);
        } catch {
          // Ignore storage failures and keep the in-memory switch.
        }
        setCurrentUser(prev => (
          prev
            ? {
              ...prev,
              companyId: fallbackCompany.id
            }
            : prev
        ));
        setCloudSubscription(null);
      }

      setCompanies(nextCompanies);
      removeWorkspaceSyncQueueItem(companyId);
      setSyncQueueVersion(prev => prev + 1);

      if (useBackend && isFirebaseAuthEnabled && currentUser && !isGuestUser(currentUser)) {
        try {
          await callBackendApi(currentUser, `/companies/${companyId}`, 'DELETE');
          console.log('[Backend Sync] Company deleted successfully on backend');
        } catch (error: any) {
          console.error('[Backend Sync ERROR] Failed to delete company:', error);
          cleanupWarnings.push(String(error?.message || 'Failed to delete company on custom backend.'));
        }
      }

      try {
        localStorage.removeItem(getCompanyWorkspaceKey(companyId));
        localStorage.removeItem(getBackupHistoryKey(companyId));
        didDeleteSnapshot = await deleteWorkspaceSnapshotRecord(companyId);
      } catch (error: any) {
        cleanupWarnings.push(String(error?.message || 'Failed to delete local company snapshot artifacts.'));
      }

      if (firebaseDb && currentUser && !isGuestUser(currentUser)) {
        const cleanupResults = await Promise.allSettled([
          deleteDoc(doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, companyId)),
          deleteDoc(doc(firebaseDb, `users/${currentUser.id}/workspace_sync_snapshots`, companyId))
        ]);

        cleanupResults.forEach((result) => {
          if (result.status === 'rejected') {
            cleanupWarnings.push(String(result.reason?.message || result.reason || 'Failed to delete cloud company artifacts.'));
          }
        });
      }

      appendAuditLog({
        entityType: 'company',
        entityId: companyId,
        action: 'DELETE',
        screen: 'Settings > Companies',
        before: safeClone(existing),
        metadata: {
          deletedCompanyName: existing.name,
          fallbackCompanyId: fallbackCompany.id,
          deletedSnapshotFromIndexedDb: didDeleteSnapshot,
          cleanupWarnings: cleanupWarnings.length ? cleanupWarnings : undefined
        }
      });

      return makeSuccess();
    } catch (error: any) {
      return makeError('VALIDATION_ERROR', error?.message || 'Failed to delete company.');
    } finally {
      companyDeleteInFlightRef.current.delete(companyId);
    }
  };

  const wipeAllCompanyData = async (): Promise<MutationResult> => {
    const permission = enforcePermission('SETTINGS', 'DELETE', 'Company Settings');
    if (!permission.ok) return permission;

    if (!currentCompanyId || !currentCompany) {
      return makeError('VALIDATION_ERROR', 'No active company found.');
    }

    try {
      const emptySnapshot = buildEmptyWorkspaceSnapshot(currentCompany);
      emptySnapshot.companySettings = companySettings;
      
      const didPersist = await persistWorkspaceSnapshot(currentCompany.id, emptySnapshot);
      if (!didPersist) {
        return makeError('VALIDATION_ERROR', 'Failed to save wiped data.');
      }

      upsertWorkspaceSyncQueueItem(currentCompany.id, emptySnapshot.updatedAt, currentUser?.id);
      setSyncQueueVersion(prev => prev + 1);

      setWorkspaceHydratedForCompanyId(null);
      
      return makeSuccess();
    } catch (e: any) {
      return makeError('VALIDATION_ERROR', e.message || 'Wipe failed');
    }
  };

  const buildWorkspaceSubscriptionFromOfferCode = useCallback((
    base: WorkspaceSubscriptionAccount,
    offer: WorkspaceOfferCode
  ): WorkspaceSubscriptionAccount => {
    const nowIso = new Date().toISOString();
    const grantedCompanyCount = clampWorkspaceOfferCompanyCount(offer.companyCount);
    const nextMaxCompanies = Math.max(companies.length, base.maxCompanies || 1, grantedCompanyCount || 0);
    const nextUnlimitedCompanies = base.unlimitedCompanies === true || (offer.kind === 'LIFETIME' && !grantedCompanyCount);
    const fallback = {
      ...base,
      userId: currentUser?.id || base.userId,
      userEmail: currentUser?.email || base.userEmail,
      maxCompanies: nextMaxCompanies,
      unlimitedCompanies: nextUnlimitedCompanies
    };
    const nextPlan = base.plan === 'TRIAL' || base.plan === 'NONE' ? 'BASIC' : base.plan;

    if (offer.kind === 'DISCOUNT_PERCENT') {
      return normalizeWorkspaceSubscription({
        ...base,
        status: base.status,
        plan: base.plan,
        billingCycle: 'YEARLY',
        maxCompanies: nextMaxCompanies,
        discountPercent: offer.discountPercent || 0,
        offerCode: offer.code,
        offerNote: offer.notes || `Discount ${offer.discountPercent || 0}%${grantedCompanyCount ? ` | ${grantedCompanyCount} companies` : ''}`,
        lifetimeAccess: base.lifetimeAccess === true,
        unlimitedCompanies: nextUnlimitedCompanies,
        updatedAt: nowIso
      }, fallback);
    }

    if (offer.kind === 'LIFETIME') {
      return normalizeWorkspaceSubscription({
        ...base,
        status: 'ACTIVE',
        plan: nextPlan,
        billingCycle: 'YEARLY',
        provider: 'MANUAL',
        maxCompanies: nextMaxCompanies,
        renewalDate: undefined,
        expiresAt: undefined,
        discountPercent: 0,
        offerCode: offer.code,
        offerNote: offer.notes || (grantedCompanyCount ? `Lifetime access | ${grantedCompanyCount} companies` : 'Lifetime access'),
        lifetimeAccess: true,
        unlimitedCompanies: nextUnlimitedCompanies,
        updatedAt: nowIso
      }, fallback);
    }

    const extensionDays = Math.max(1, Math.min(3650, Math.floor(Number(offer.freeDays) || 30)));
    const referenceEndsAt = String(base.expiresAt || base.renewalDate || '');
    const referenceEndsAtMs = Date.parse(referenceEndsAt);
    const extensionBaseIso = base.status === 'ACTIVE' && Number.isFinite(referenceEndsAtMs) && referenceEndsAtMs > Date.now()
      ? referenceEndsAt
      : nowIso;
    const nextEndsAt = addDaysIso(extensionBaseIso, extensionDays);

    return normalizeWorkspaceSubscription({
      ...base,
      status: 'ACTIVE',
      plan: nextPlan,
      billingCycle: 'YEARLY',
      provider: 'MANUAL',
      maxCompanies: nextMaxCompanies,
      renewalDate: nextEndsAt,
      expiresAt: nextEndsAt,
      discountPercent: 0,
      offerCode: offer.code,
      offerNote: offer.notes || `${extensionDays} free days${grantedCompanyCount ? ` | ${grantedCompanyCount} companies` : ''}`,
      lifetimeAccess: false,
      unlimitedCompanies: nextUnlimitedCompanies,
      updatedAt: nowIso
    }, fallback);
  }, [companies.length, currentUser?.email, currentUser?.id]);

  const issueWorkspaceOfferCode = async (input: {
    kind: WorkspaceOfferCodeKind;
    discountPercent?: number;
    freeDays?: number;
    companyCount?: number;
    expiresAt?: string;
    notes?: string;
  }): Promise<SubscriptionCodeIssueResult> => {
    if (!currentUser || isGuestUser(currentUser) || !programOwnerEnabled) {
      return { ok: false, code: 'PERMISSION_DENIED', message: 'Only the main program owner can issue workspace offer codes.' };
    }

    const kind: WorkspaceOfferCodeKind = input.kind === 'DISCOUNT_PERCENT' || input.kind === 'LIFETIME'
      ? input.kind
      : 'FREE_DAYS';
    const discountPercent = kind === 'DISCOUNT_PERCENT'
      ? Math.max(1, Math.min(100, Math.floor(Number(input.discountPercent) || 0)))
      : undefined;
    const freeDays = kind === 'FREE_DAYS'
      ? Math.max(1, Math.min(3650, Math.floor(Number(input.freeDays) || 30)))
      : undefined;
    const companyCount = clampWorkspaceOfferCompanyCount(input.companyCount);

    if (kind === 'DISCOUNT_PERCENT' && !discountPercent) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'A valid discount percentage is required.' };
    }
    if (kind === 'FREE_DAYS' && !freeDays) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'A valid free-days duration is required.' };
    }

    const expiresAt = normalizeOptionalIsoDate(input.expiresAt);
    const notes = String(input.notes || '').trim() || undefined;
    const nowIso = new Date().toISOString();
    const companyCountSuffix = companyCount ? `-${companyCount}C` : '';
    const codePrefix = kind === 'DISCOUNT_PERCENT'
      ? `FLX-D-${discountPercent}${companyCountSuffix}`
      : kind === 'LIFETIME'
        ? `FLX-LT${companyCountSuffix}`
        : `FLX-F-${freeDays}${companyCountSuffix}`;

    const issueLocalWorkspaceOfferCode = (): SubscriptionCodeIssueResult => {
      const existingCodes = loadLocalWorkspaceOfferCodes();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        const candidateCode = normalizeActivationCode(`${codePrefix}-${suffix}`);
        if (existingCodes.some(code => code.code === candidateCode)) continue;

        const payload: WorkspaceOfferCode = {
          code: candidateCode,
          status: 'AVAILABLE',
          kind,
          discountPercent,
          freeDays,
          companyCount,
          createdAt: nowIso,
          createdByUserId: currentUser.id,
          createdByEmail: currentUser.email,
          expiresAt,
          notes
        };

        replaceLocalWorkspaceOfferCodes([payload, ...existingCodes.filter(code => code.code !== candidateCode)]);
        return { ok: true, code: candidateCode };
      }

      return { ok: false, code: 'VALIDATION_ERROR', message: 'Could not generate a unique workspace offer code. Try again.' };
    };

    if (!firebaseDb || subscriptionAdminScope !== 'CLOUD') {
      return issueLocalWorkspaceOfferCode();
    }

    try {
      await ensureProgramOwnerAdminDocument();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        const candidateCode = normalizeActivationCode(`${codePrefix}-${suffix}`);
        const candidateRef = doc(firebaseDb, WORKSPACE_OFFER_CODES_COLLECTION, candidateCode);
        const existing = await getDoc(candidateRef);
        if (existing.exists()) continue;

        const payload: WorkspaceOfferCode = {
          code: candidateCode,
          status: 'AVAILABLE',
          kind,
          discountPercent,
          freeDays,
          companyCount,
          createdAt: nowIso,
          createdByUserId: currentUser.id,
          createdByEmail: currentUser.email,
          expiresAt,
          notes
        };

        await setDoc(candidateRef, sanitizeFirestorePayload(payload as unknown as Record<string, unknown>), { merge: false });
        try {
          await callBackendApi(currentUser, '/workspace-offer-codes', 'POST', {
            code: candidateCode,
            kind,
            discountPercent,
            freeDays,
            companyCount,
            expiresAt,
            notes
          });
        } catch (dbErr) {
          console.warn('[issueWorkspaceOfferCode] Neon DB sync failed:', dbErr);
        }
        return { ok: true, code: candidateCode };
      }

      return { ok: false, code: 'VALIDATION_ERROR', message: 'Could not generate a unique workspace offer code. Try again.' };
    } catch (error: any) {
      const fallbackResult = issueLocalWorkspaceOfferCode();
      if (fallbackResult.ok) {
        setSubscriptionCloudError(String(error?.message || 'Failed to sync workspace offer code to cloud.'));
        return fallbackResult;
      }
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: String(error?.message || 'Failed to issue workspace offer code.')
      };
    }
  };

  const redeemWorkspaceOfferCode = async (code: string, desiredCompanyCount = workspaceSubscription.maxCompanies): Promise<MutationResult> => {
    if (!currentUser || isGuestUser(currentUser)) {
      return makeError('PERMISSION_DENIED', 'Sign in with a Firebase account before applying an offer code.');
    }

    const normalizedCode = normalizeActivationCode(code);
    if (!normalizedCode) return makeError('VALIDATION_ERROR', 'Offer code is required.');
    void desiredCompanyCount;

    if (useBackend) {
      try {
        const res = await callBackendApi(currentUser, `/workspace-offer-codes/${normalizedCode}/redeem`, 'POST');
        if (res && res.offer) {
          const next = buildWorkspaceSubscriptionFromOfferCode(workspaceSubscription, res.offer);
          setWorkspaceSubscription(next);
          setSubscriptionCloudError('');
          return makeSuccess();
        }
        return makeError('VALIDATION_ERROR', 'Offer code is invalid.');
      } catch (err: any) {
        const msg = err?.response?.data?.error || err.message || 'Offer code is invalid.';
        return makeError('VALIDATION_ERROR', msg);
      }
    }

    const applyLocalNextWorkspace = async (offer: WorkspaceOfferCode): Promise<MutationResult> => {
      const next = buildWorkspaceSubscriptionFromOfferCode(workspaceSubscription, offer);
      setWorkspaceSubscription(next);
      try {
        await persistWorkspaceSubscriptionDoc(next);
      } catch {
        // Keep the updated local subscription even if the cloud sync is temporarily unavailable.
      }
      appendAuditLog({
        entityType: 'workspace_subscription',
        entityId: currentUser.id,
        action: 'APPLY_OFFER_CODE',
        screen: 'Settings > Subscription',
        before: safeClone(workspaceSubscription),
        after: safeClone(next),
        metadata: { offerCode: offer.code, kind: offer.kind }
      });
      return makeSuccess();
    };

    const consumeLocalWorkspaceOfferCode = async (offer: WorkspaceOfferCode): Promise<MutationResult> => {
      if (offer.status !== 'AVAILABLE') return makeError('VALIDATION_ERROR', 'This offer code is no longer available.');
      if (offer.expiresAt && Date.parse(offer.expiresAt) < Date.now()) {
        return makeError('VALIDATION_ERROR', 'This offer code has expired.');
      }

      const result = await applyLocalNextWorkspace(offer);
      if (!result.ok) return result;

      const existingCodes = loadLocalWorkspaceOfferCodes();
      replaceLocalWorkspaceOfferCodes(existingCodes.map(item => (
        item.code === normalizedCode
          ? {
            ...item,
            status: 'USED',
            usedAt: new Date().toISOString(),
            usedByUserId: currentUser.id,
            usedByEmail: currentUser.email
          }
          : item
      )));
      setSubscriptionCloudError('');
      return makeSuccess();
    };

    if (!firebaseDb) {
      const existingCodes = loadLocalWorkspaceOfferCodes();
      const offer = existingCodes.find(item => item.code === normalizedCode);
      if (!offer) return makeError('VALIDATION_ERROR', 'Offer code is invalid.');
      return consumeLocalWorkspaceOfferCode(offer);
    }

    try {
      const workspaceRef = doc(firebaseDb, WORKSPACE_SUBSCRIPTIONS_COLLECTION, currentUser.id);
      const codeRef = doc(firebaseDb, WORKSPACE_OFFER_CODES_COLLECTION, normalizedCode);
      const nowIso = new Date().toISOString();
      const nextWorkspace = await runTransaction(firebaseDb, async (transaction) => {
        const codeSnapshot = await transaction.get(codeRef);
        const offer = codeSnapshot.exists() ? normalizeWorkspaceOfferCode(codeSnapshot.data()) : null;
        if (!offer) throw new Error('Offer code is invalid.');
        if (offer.status !== 'AVAILABLE') throw new Error('This offer code is no longer available.');
        if (offer.expiresAt && Date.parse(offer.expiresAt) < Date.now()) {
          throw new Error('This offer code has expired.');
        }

        const workspaceSnapshot = await transaction.get(workspaceRef);
        const baseWorkspace = workspaceSnapshot.exists()
          ? normalizeWorkspaceSubscription(workspaceSnapshot.data(), {
            userId: currentUser.id,
            userEmail: currentUser.email,
            maxCompanies: Math.max(workspaceSubscription.maxCompanies, companies.length)
          })
          : normalizeWorkspaceSubscription(workspaceSubscription, {
            userId: currentUser.id,
            userEmail: currentUser.email,
            maxCompanies: Math.max(workspaceSubscription.maxCompanies, companies.length)
          });
        const next = buildWorkspaceSubscriptionFromOfferCode(baseWorkspace, offer);

        transaction.set(
          workspaceRef,
          sanitizeFirestorePayload(next as unknown as Record<string, unknown>),
          { merge: true }
        );
        transaction.set(codeRef, sanitizeFirestorePayload({
          status: 'USED',
          usedAt: nowIso,
          usedByUserId: currentUser.id,
          usedByEmail: currentUser.email
        }), { merge: true });

        return next;
      });

      setWorkspaceSubscription(nextWorkspace);
      setSubscriptionCloudError('');
      appendAuditLog({
        entityType: 'workspace_subscription',
        entityId: currentUser.id,
        action: 'APPLY_OFFER_CODE',
        screen: 'Settings > Subscription',
        before: safeClone(workspaceSubscription),
        after: safeClone(nextWorkspace),
        metadata: { offerCode: normalizedCode }
      });
      try {
        await callBackendApi(currentUser, `/workspace-offer-codes/${normalizedCode}/redeem`, 'POST');
      } catch (dbErr) {
        console.warn('[redeemWorkspaceOfferCode] Neon DB redeem failed:', dbErr);
      }
      return makeSuccess();
    } catch (error: any) {
      const localOffer = loadLocalWorkspaceOfferCodes().find(item => item.code === normalizedCode);
      if (localOffer) {
        return consumeLocalWorkspaceOfferCode(localOffer);
      }
      const message = String(error?.message || 'Failed to apply the workspace offer code.');
      setSubscriptionCloudError(message);
      return makeError('VALIDATION_ERROR', message);
    }
  };

  const issueSubscriptionCode = async (input: {
    plan: CompanySubscriptionPlan;
    durationDays: number;
    maxDevices: number;
    expiresAt?: string;
    notes?: string;
    reservedCompanyId?: string;
    reservedCompanyName?: string;
  }): Promise<SubscriptionCodeIssueResult> => {
    if (!currentUser || isGuestUser(currentUser) || !subscriptionAdminEnabled) {
      return { ok: false, code: 'PERMISSION_DENIED', message: 'You do not have permission to issue subscription codes.' };
    }

    const plan = input.plan === 'BASIC' || input.plan === 'PRO' || input.plan === 'ENTERPRISE'
      ? input.plan
      : null;
    if (!plan) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'A paid plan is required for cloud activation codes.' };
    }

    const durationDays = Math.max(1, Math.min(3650, Math.floor(Number(input.durationDays) || 0)));
    const maxDevices = Math.max(1, Math.min(20, Math.floor(Number(input.maxDevices) || 1)));
    const expiresAt = normalizeOptionalIsoDate(input.expiresAt);
    const notes = String(input.notes || '').trim() || undefined;
    const reservedCompanyId = String(input.reservedCompanyId || '').trim() || undefined;
    const reservedCompanyName = String(input.reservedCompanyName || '').trim() || undefined;
    const nowIso = new Date().toISOString();

    if (!firebaseDb || subscriptionAdminScope !== 'CLOUD') {
      const existingCodes = loadLocalSubscriptionCodes();

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        const candidateCode = normalizeActivationCode(`FLEX-${plan}-${durationDays}-${suffix}`);
        if (existingCodes.some(code => code.code === candidateCode)) continue;

        const payload: CloudSubscriptionCode = {
          code: candidateCode,
          status: 'AVAILABLE',
          plan,
          durationDays,
          maxDevices,
          createdAt: nowIso,
          createdByUserId: currentUser.id,
          createdByEmail: currentUser.email,
          expiresAt,
          notes,
          reservedCompanyId,
          reservedCompanyName
        };

        replaceLocalSubscriptionCodes([payload, ...existingCodes.filter(code => code.code !== candidateCode)]);
        return { ok: true, code: candidateCode };
      }

      return { ok: false, code: 'VALIDATION_ERROR', message: 'Could not generate a unique activation code. Try again.' };
    }

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        const candidateCode = normalizeActivationCode(`FLEX-${plan}-${durationDays}-${suffix}`);
        const candidateRef = doc(firebaseDb, SUBSCRIPTION_CODES_COLLECTION, candidateCode);
        const existing = await getDoc(candidateRef);
        if (existing.exists()) continue;

        const payload: CloudSubscriptionCode = {
          code: candidateCode,
          status: 'AVAILABLE',
          plan,
          durationDays,
          maxDevices,
          createdAt: nowIso,
          createdByUserId: currentUser.id,
          createdByEmail: currentUser.email,
          expiresAt,
          notes,
          reservedCompanyId,
          reservedCompanyName
        };

        await setDoc(candidateRef, sanitizeFirestorePayload(payload as unknown as Record<string, unknown>), { merge: false });
        return { ok: true, code: candidateCode };
      }

      return { ok: false, code: 'VALIDATION_ERROR', message: 'Could not generate a unique activation code. Try again.' };
    } catch (error: any) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: String(error?.message || 'Failed to issue subscription code.')
      };
    }
  };

  const cancelSubscriptionCode = async (code: string): Promise<MutationResult> => {
    if (!currentUser || isGuestUser(currentUser) || !subscriptionAdminEnabled) {
      return makeError('PERMISSION_DENIED', 'You do not have permission to cancel activation codes.');
    }

    const normalizedCode = normalizeActivationCode(code);
    if (!normalizedCode) return makeError('VALIDATION_ERROR', 'Activation code is required.');

    if (!firebaseDb || subscriptionAdminScope !== 'CLOUD') {
      const existingCodes = loadLocalSubscriptionCodes();
      const existing = existingCodes.find(item => item.code === normalizedCode);
      if (!existing) return makeError('VALIDATION_ERROR', 'Activation code not found.');
      if (existing.status === 'USED') return makeError('VALIDATION_ERROR', 'Used activation codes cannot be cancelled.');
      if (existing.status === 'CANCELLED') return makeSuccess();

      replaceLocalSubscriptionCodes(existingCodes.map(item => (
        item.code === normalizedCode
          ? { ...item, status: 'CANCELLED' }
          : item
      )));
      return makeSuccess();
    }

    const codeRef = doc(firebaseDb, SUBSCRIPTION_CODES_COLLECTION, normalizedCode);
    const snapshot = await getDoc(codeRef);
    const existing = snapshot.exists() ? normalizeCloudSubscriptionCode(snapshot.data()) : null;
    if (!existing) return makeError('VALIDATION_ERROR', 'Activation code not found.');
    if (existing.status === 'USED') return makeError('VALIDATION_ERROR', 'Used activation codes cannot be cancelled.');
    if (existing.status === 'CANCELLED') return makeSuccess();

    await setDoc(codeRef, {
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      cancelledByUserId: currentUser.id,
      cancelledByEmail: currentUser.email
    }, { merge: true });
    return makeSuccess();
  };

  const linkCurrentSubscriptionDevice = async (companyId = currentCompanyId): Promise<MutationResult> => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser)) {
      return makeError('VALIDATION_ERROR', 'Cloud subscriptions require a signed-in Firebase account.');
    }

    const company = companies.find(item => item.id === companyId);
    if (!company) return makeError('VALIDATION_ERROR', 'Company not found.');
    const subscriptionRef = doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, companyId);

    try {
      setSubscriptionCloudBusy(true);
      const nextRemote = await runTransaction(firebaseDb, async (transaction) => {
        const snapshot = await transaction.get(subscriptionRef);
        const remote = snapshot.exists()
          ? normalizeCloudCompanySubscription(companyId, snapshot.data(), company)
          : buildCloudSubscriptionFromCompanyProfile(company, {
            source: company.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL',
            updatedByUserId: currentUser.id,
            updatedByEmail: currentUser.email,
            boundDevices: []
          });

        const existingDevice = remote.boundDevices.find(device => device.deviceId === currentDeviceBinding.deviceId);
        const boundDevices = existingDevice
          ? remote.boundDevices.map(device => (
            device.deviceId === currentDeviceBinding.deviceId
              ? {
                ...device,
                lastSeenAt: new Date().toISOString(),
                lastUserId: currentUser.id,
                lastUserEmail: currentUser.email
              }
              : device
          ))
          : [...remote.boundDevices, currentDeviceBinding];

        const next: CloudCompanySubscription = {
          ...remote,
          companyName: company.name,
          boundDevices,
          updatedAt: new Date().toISOString(),
          updatedByUserId: currentUser.id,
          updatedByEmail: currentUser.email
        };

        transaction.set(
          subscriptionRef,
          sanitizeFirestorePayload(next as unknown as Record<string, unknown>),
          { merge: true }
        );
        return next;
      });

      setCloudSubscription(nextRemote);
      applyCompanySubscriptionLocally(companyId, buildCompanyProfilePatchFromCloud(nextRemote, company));
      setSubscriptionCloudBusy(false);
      setSubscriptionCloudError('');
      return makeSuccess();
    } catch (error: any) {
      setSubscriptionCloudBusy(false);
      const message = String(error?.message || 'Failed to link this device.');
      setSubscriptionCloudError(message);
      return makeError('VALIDATION_ERROR', message);
    }
  };

  const unlinkSubscriptionDevice = async (companyId: string, deviceId: string): Promise<MutationResult> => {
    if (!firebaseDb || !currentUser || isGuestUser(currentUser)) {
      return makeError('VALIDATION_ERROR', 'Cloud subscriptions require a signed-in Firebase account.');
    }
    if (!can('SETTINGS', 'EDIT')) {
      return makeError('PERMISSION_DENIED', 'You do not have permission to manage subscription devices.');
    }

    const company = companies.find(item => item.id === companyId);
    if (!company) return makeError('VALIDATION_ERROR', 'Company not found.');
    const subscriptionRef = doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, companyId);

    try {
      setSubscriptionCloudBusy(true);
      const nextRemote = await runTransaction(firebaseDb, async (transaction) => {
        const snapshot = await transaction.get(subscriptionRef);
        const remote = snapshot.exists()
          ? normalizeCloudCompanySubscription(companyId, snapshot.data(), company)
          : null;
        if (!remote) throw new Error('Cloud subscription not found.');

        const nextDevices = remote.boundDevices.filter(device => device.deviceId !== deviceId);
        if (nextDevices.length === remote.boundDevices.length) {
          throw new Error('Device not found in this company subscription.');
        }

        const next: CloudCompanySubscription = {
          ...remote,
          boundDevices: nextDevices,
          updatedAt: new Date().toISOString(),
          updatedByUserId: currentUser.id,
          updatedByEmail: currentUser.email
        };
        transaction.set(
          subscriptionRef,
          sanitizeFirestorePayload(next as unknown as Record<string, unknown>),
          { merge: true }
        );
        return next;
      });

      setCloudSubscription(nextRemote);
      applyCompanySubscriptionLocally(
        companyId,
        buildCompanyProfilePatchFromCloud(
          nextRemote,
          company,
          deviceId === currentDeviceBinding.deviceId ? 'SUSPENDED' : undefined
        )
      );
      setSubscriptionCloudBusy(false);
      setSubscriptionCloudError('');
      return makeSuccess();
    } catch (error: any) {
      setSubscriptionCloudBusy(false);
      const message = String(error?.message || 'Failed to unlink the selected device.');
      setSubscriptionCloudError(message);
      return makeError('VALIDATION_ERROR', message);
    }
  };

  const updateCompanySubscription = async (companyId: string, updates: Partial<CompanyProfile>): Promise<MutationResult> => {
    if (!can('SETTINGS', 'EDIT')) {
      appendAuditLog({
        entityType: 'company_subscription',
        entityId: companyId,
        action: 'UPDATE_DENIED',
        screen: 'Settings > Subscription',
        metadata: { reason: 'PERMISSION_DENIED' }
      });
      return makeError('PERMISSION_DENIED', 'You do not have permission to manage company subscriptions.');
    }

    const existing = companies.find(company => company.id === companyId);
    if (!existing) return makeError('VALIDATION_ERROR', 'Company not found.');

    const next = withNormalizedCompanyProfile({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt
    }, workspaceSubscription);

    try {
      await persistCloudSubscription(next, {
        source: 'MANUAL',
        maxDevices: cloudSubscription?.maxDevices || 1,
        boundDevices: cloudSubscription?.boundDevices || [currentDeviceBinding]
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to sync subscription settings to the cloud.');
      setSubscriptionCloudError(message);
      return makeError('VALIDATION_ERROR', message);
    }

    applyCompanySubscriptionLocally(companyId, next);
    if (companyId === currentCompanyId) {
      setCloudSubscription(prev => prev ? {
        ...prev,
        ...buildCloudSubscriptionFromCompanyProfile(next, {
          source: 'MANUAL',
          updatedByUserId: currentUser?.id,
          updatedByEmail: currentUser?.email,
          maxDevices: prev.maxDevices,
          boundDevices: prev.boundDevices
        })
      } : prev);
    }
    appendAuditLog({
      entityType: 'company_subscription',
      entityId: companyId,
      action: 'UPDATE',
      screen: 'Settings > Subscription',
      before: safeClone(existing),
      after: safeClone(next)
    });
    return makeSuccess();
  };

  const activateCompanySubscription = async (companyId: string, activationCode: string): Promise<MutationResult> => {
    if (!can('SETTINGS', 'EDIT')) {
      appendAuditLog({
        entityType: 'company_subscription',
        entityId: companyId,
        action: 'ACTIVATE_DENIED',
        screen: 'Settings > Subscription',
        metadata: { reason: 'PERMISSION_DENIED' }
      });
      return makeError('PERMISSION_DENIED', 'You do not have permission to activate subscriptions.');
    }

    const existing = companies.find(company => company.id === companyId);
    if (!existing) return makeError('VALIDATION_ERROR', 'Company not found.');

    const normalizedCode = normalizeActivationCode(activationCode);
    if (!normalizedCode) return makeError('VALIDATION_ERROR', 'Activation code is required.');

    if (firebaseDb && currentUser && !isGuestUser(currentUser)) {
      try {
        setSubscriptionCloudBusy(true);
        const subscriptionRef = doc(firebaseDb, COMPANY_SUBSCRIPTIONS_COLLECTION, companyId);
        const codeRef = doc(firebaseDb, SUBSCRIPTION_CODES_COLLECTION, normalizedCode);
        const nextRemote = await runTransaction(firebaseDb, async (transaction) => {
          const codeSnapshot = await transaction.get(codeRef);
          const codeRecord = codeSnapshot.exists() ? normalizeCloudSubscriptionCode(codeSnapshot.data()) : null;
          if (!codeRecord) throw new Error('Activation code is invalid.');
          if (codeRecord.status !== 'AVAILABLE') throw new Error('This activation code is no longer available.');
          if (codeRecord.expiresAt && Date.parse(codeRecord.expiresAt) < Date.now()) {
            throw new Error('This activation code has expired.');
          }
          if (codeRecord.reservedCompanyId && codeRecord.reservedCompanyId !== companyId) {
            throw new Error('This activation code is reserved for another company.');
          }

          const subscriptionSnapshot = await transaction.get(subscriptionRef);
          const remote = subscriptionSnapshot.exists()
            ? normalizeCloudCompanySubscription(companyId, subscriptionSnapshot.data(), existing)
            : buildCloudSubscriptionFromCompanyProfile(existing, {
              source: existing.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL',
              updatedByUserId: currentUser.id,
              updatedByEmail: currentUser.email,
              boundDevices: []
            });

          const existingDevice = remote.boundDevices.find(device => device.deviceId === currentDeviceBinding.deviceId);
          const nextDevices = existingDevice
            ? remote.boundDevices.map(device => (
              device.deviceId === currentDeviceBinding.deviceId
                ? {
                  ...device,
                  lastSeenAt: new Date().toISOString(),
                  lastUserId: currentUser.id,
                  lastUserEmail: currentUser.email
                }
                : device
            ))
            : [...remote.boundDevices, currentDeviceBinding];

          const nowIso = new Date().toISOString();
          const currentEndsAtMs = Date.parse(String(remote.endsAt || ''));
          const extensionBaseIso = remote.status === 'ACTIVE' && Number.isFinite(currentEndsAtMs) && currentEndsAtMs > Date.now()
            ? String(remote.endsAt)
            : nowIso;

          const next: CloudCompanySubscription = {
            ...remote,
            companyId,
            companyName: existing.name,
            status: 'ACTIVE',
            plan: codeRecord.plan,
            startsAt: remote.status === 'ACTIVE' ? (remote.startsAt || nowIso) : nowIso,
            endsAt: addDaysIso(extensionBaseIso, codeRecord.durationDays),
            activationCode: codeRecord.code,
            maxDevices: Math.max(remote.maxDevices, codeRecord.maxDevices),
            source: 'ACTIVATION_CODE',
            updatedAt: nowIso,
            updatedByUserId: currentUser.id,
            updatedByEmail: currentUser.email,
            boundDevices: nextDevices,
            reservedCompanyId: codeRecord.reservedCompanyId,
            reservedCompanyName: codeRecord.reservedCompanyName
          };

          transaction.set(
            subscriptionRef,
            sanitizeFirestorePayload(next as unknown as Record<string, unknown>),
            { merge: true }
          );
          transaction.set(codeRef, sanitizeFirestorePayload({
            status: 'USED',
            usedAt: nowIso,
            usedByCompanyId: companyId,
            usedByCompanyName: existing.name,
            usedByDeviceId: currentDeviceBinding.deviceId,
            usedByUserId: currentUser.id,
            usedByEmail: currentUser.email
          }), { merge: true });

          return next;
        });

        setCloudSubscription(nextRemote);
        applyCompanySubscriptionLocally(companyId, buildCompanyProfilePatchFromCloud(nextRemote, existing));
        setSubscriptionCloudBusy(false);
        setSubscriptionCloudError('');
        appendAuditLog({
          entityType: 'company_subscription',
          entityId: companyId,
          action: existing.subscriptionStatus === 'ACTIVE' ? 'RENEW' : 'ACTIVATE',
          screen: 'Settings > Subscription',
          before: safeClone(existing),
          after: safeClone(nextRemote),
          metadata: {
            activationCode: normalizedCode,
            source: 'FIRESTORE'
          }
        });
        return makeSuccess();
      } catch (error: any) {
        setSubscriptionCloudBusy(false);
        const message = String(error?.message || 'Failed to activate the company subscription.');
        if (message !== 'Activation code is invalid.') {
          setSubscriptionCloudError(message);
          appendAuditLog({
            entityType: 'company_subscription',
            entityId: companyId,
            action: 'ACTIVATE_REJECTED',
            screen: 'Settings > Subscription',
            metadata: { reason: message, activationCode: normalizedCode, source: 'FIRESTORE' }
          });
          return makeError('VALIDATION_ERROR', message);
        }
      }
    }

    const localIssuedCode = loadLocalSubscriptionCodes().find(code => code.code === normalizedCode);
    if (localIssuedCode) {
      if (localIssuedCode.status !== 'AVAILABLE') {
        return makeError('VALIDATION_ERROR', 'This activation code is no longer available.');
      }
      if (localIssuedCode.expiresAt && Date.parse(localIssuedCode.expiresAt) < Date.now()) {
        return makeError('VALIDATION_ERROR', 'This activation code has expired.');
      }
      if (localIssuedCode.reservedCompanyId && localIssuedCode.reservedCompanyId !== companyId) {
        return makeError('VALIDATION_ERROR', 'This activation code is reserved for another company.');
      }

      const nowIso = new Date().toISOString();
      const currentEndsAtMs = Date.parse(String(existing.subscriptionEndsAt || ''));
      const extensionBaseIso = existing.subscriptionStatus === 'ACTIVE' && Number.isFinite(currentEndsAtMs) && currentEndsAtMs > Date.now()
        ? String(existing.subscriptionEndsAt)
        : nowIso;

      const next = withNormalizedCompanyProfile({
        ...existing,
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: localIssuedCode.plan,
        subscriptionStartsAt: existing.subscriptionStatus === 'ACTIVE'
          ? existing.subscriptionStartsAt || nowIso
          : nowIso,
        subscriptionEndsAt: addDaysIso(extensionBaseIso, localIssuedCode.durationDays),
        activationCode: localIssuedCode.code
      }, workspaceSubscription);

      applyCompanySubscriptionLocally(companyId, next);
      if (currentUser && !isGuestUser(currentUser)) {
        void persistCloudSubscription(next, {
          source: 'ACTIVATION_CODE',
          maxDevices: localIssuedCode.maxDevices,
          boundDevices: cloudSubscription?.boundDevices || [currentDeviceBinding],
          notes: localIssuedCode.notes,
          reservedCompanyId: localIssuedCode.reservedCompanyId,
          reservedCompanyName: localIssuedCode.reservedCompanyName
        }).catch(() => undefined);
      }

      replaceLocalSubscriptionCodes(loadLocalSubscriptionCodes().map(code => (
        code.code === normalizedCode
          ? {
            ...code,
            status: 'USED',
            usedAt: nowIso,
            usedByCompanyId: companyId,
            usedByCompanyName: existing.name,
            usedByDeviceId: currentDeviceBinding.deviceId,
            usedByUserId: currentUser?.id,
            usedByEmail: currentUser?.email
          }
          : code
      )));

      appendAuditLog({
        entityType: 'company_subscription',
        entityId: companyId,
        action: existing.subscriptionStatus === 'ACTIVE' ? 'RENEW' : 'ACTIVATE',
        screen: 'Settings > Subscription',
        before: safeClone(existing),
        after: safeClone(next),
        metadata: {
          plan: localIssuedCode.plan,
          durationDays: localIssuedCode.durationDays,
          source: 'LOCAL_ADMIN_CODE'
        }
      });
      setSubscriptionCloudError('');
      return makeSuccess();
    }

    const parsedCode = parseActivationCode(normalizedCode);
    if (!parsedCode) {
      appendAuditLog({
        entityType: 'company_subscription',
        entityId: companyId,
        action: 'ACTIVATE_REJECTED',
        screen: 'Settings > Subscription',
        metadata: { reason: 'INVALID_ACTIVATION_CODE', source: 'LOCAL_FALLBACK' }
      });
      return makeError('VALIDATION_ERROR', 'Activation code is invalid.');
    }

    const nowIso = new Date().toISOString();
    const currentEndsAtMs = Date.parse(String(existing.subscriptionEndsAt || ''));
    const extensionBaseIso = existing.subscriptionStatus === 'ACTIVE' && Number.isFinite(currentEndsAtMs) && currentEndsAtMs > Date.now()
      ? String(existing.subscriptionEndsAt)
      : nowIso;

    const next = withNormalizedCompanyProfile({
      ...existing,
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: parsedCode.plan,
      subscriptionStartsAt: existing.subscriptionStatus === 'ACTIVE'
        ? existing.subscriptionStartsAt || nowIso
        : nowIso,
      subscriptionEndsAt: addDaysIso(extensionBaseIso, parsedCode.durationDays),
      activationCode: parsedCode.code
    }, workspaceSubscription);

    applyCompanySubscriptionLocally(companyId, next);
    setSubscriptionCloudError('');
    appendAuditLog({
      entityType: 'company_subscription',
      entityId: companyId,
      action: existing.subscriptionStatus === 'ACTIVE' ? 'RENEW' : 'ACTIVATE',
      screen: 'Settings > Subscription',
      before: safeClone(existing),
      after: safeClone(next),
      metadata: {
        plan: parsedCode.plan,
        durationDays: parsedCode.durationDays,
        source: 'LOCAL_FALLBACK'
      }
    });
    return makeSuccess();
  };

  const updateCompanyProfile = (companyId: string, updates: Partial<CompanyProfile>): MutationResult => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Company Switcher');
    if (!permission.ok) return permission;
    const existing = companies.find(c => c.id === companyId);
    if (!existing) return makeError('VALIDATION_ERROR', 'Company not found.');

    const requestedName = Object.prototype.hasOwnProperty.call(updates, 'name')
      ? String(updates.name || '').trim()
      : String(existing.name || '').trim();
    if (!requestedName) return makeError('VALIDATION_ERROR', 'Company name is required.');

    const nameConflict = findCompanyNameConflict(companies, requestedName, companyId);
    if (nameConflict) {
      return makeError('VALIDATION_ERROR', getCompanyNameConflictMessage(nameConflict.name));
    }

    const next = withNormalizedCompanyProfile({
      ...existing,
      ...updates,
      name: requestedName,
      id: existing.id,
      createdAt: existing.createdAt
    }, workspaceSubscription);

    applyCompanySubscriptionLocally(companyId, next);
    if (useBackend && isFirebaseAuthEnabled) {
      if (currentUser && !isGuestUser(currentUser)) {
        callBackendApi(currentUser, `/companies/${companyId}`, 'PUT', {
          name: next.name,
          taxNumber: next.taxNumber,
          address: next.address,
          phone: next.phone,
          logoUrl: next.logoUrl,
          settings: (next as any).settings,
          baseCurrency: (next as any).baseCurrency
        })
          .then((res) => {
            console.log('[Backend Sync] Company profile updated successfully:', res);
            if (res && res.company) {
              setCompanies(prev => prev.map(c => c.id === companyId ? res.company : c));
            }
          })
          .catch(err => {
            console.error('[Backend Sync ERROR] Failed to update company profile:', err);
          });
      }
    }
    if (firebaseDb && currentUser && !isGuestUser(currentUser)) {
      void persistCloudSubscription(next, {
        source: cloudSubscription?.source || (next.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL'),
        maxDevices: cloudSubscription?.maxDevices || 1,
        boundDevices: cloudSubscription?.boundDevices || [currentDeviceBinding]
      }).catch((error: any) => {
        setSubscriptionCloudError(String(error?.message || 'Failed to sync company profile to cloud subscription.'));
      });
    }
    return makeSuccess();
  };

  // --- WAREHOUSE METHODS ---
  const addWarehouse = (w: Omit<Warehouse, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'ADD', 'Warehouses')) return;
    setWarehouses(prev => [...prev, { ...w, id: 'wh_' + Math.random().toString(36).substr(2, 9) }]);
  };
  const updateWarehouse = (id: string, updates: Partial<Warehouse>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Warehouses')) return;
    setWarehouses(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };
  const deleteWarehouse = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Warehouses')) return;
    setWarehouses(prev => prev.filter(w => w.id !== id));
  };

  const applyStockTransferToProducts = (
    prevProducts: Product[],
    transfer: StockTransfer,
    direction: 1 | -1
  ) => prevProducts.map(product => {
    const transferItem = transfer.items.find(item => item.productId === product.id);
    if (!transferItem || !Number.isFinite(Number(transferItem.quantity))) return product;

    const quantity = Number(transferItem.quantity) || 0;
    if (quantity === 0) return product;

    const nextWarehouseStock = [...(product.warehouseStock || [])];
    const applyWarehouseDelta = (warehouseId: string, delta: number) => {
      if (!warehouseId || delta === 0) return;
      const index = nextWarehouseStock.findIndex(stock => stock.warehouseId === warehouseId);
      if (index >= 0) {
        nextWarehouseStock[index] = {
          ...nextWarehouseStock[index],
          quantity: (nextWarehouseStock[index].quantity || 0) + delta
        };
        return;
      }
      nextWarehouseStock.push({ warehouseId, quantity: delta });
    };

    applyWarehouseDelta(transfer.fromWarehouseId, -quantity * direction);
    applyWarehouseDelta(transfer.toWarehouseId, quantity * direction);

    return {
      ...product,
      warehouseStock: nextWarehouseStock,
      stock: nextWarehouseStock.reduce((sum, stock) => sum + (Number(stock.quantity) || 0), 0)
    };
  });

  const resolveInventoryAdjustmentCostOutcome = (
    product: Product,
    qtyChange: number
  ): { amount: number; nextCost: number; layers?: ProductFifoLayer[] } => {
    if (Math.abs(qtyChange) <= 0.0001) {
      return {
        amount: 0,
        nextCost: roundToFour(Math.max(0, Number(product.buyPrice) || 0)),
        layers: product.fifoLayers
      };
    }

    const baseCost = roundToFour(Math.max(0, Number(product.buyPrice) || 0));
    const pseudoInvoice: Invoice = {
      id: 'inv_inventory_adjustment_preview',
      invoiceNumber: 'INV-ADJ',
      customerId: '',
      type: qtyChange > 0 ? TransactionType.EXPENSE : TransactionType.INCOME,
      category: qtyChange > 0 ? 'purchase_invoice' : 'sales_invoice',
      date: new Date().toISOString().split('T')[0],
      items: [],
      subTotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 0,
      status: 'PAID',
      postingStatus: 'POSTED',
      paymentType: 'CASH',
      currency: baseCurrency,
      exchangeRate: 1
    };
    const pseudoItem = { quantity: Math.abs(qtyChange), unitPrice: baseCost };

    if (getCurrentInventoryValuationMethod() === 'FIFO') {
      const fifoResult = applyFifoCostingForQtyChange(product, pseudoInvoice, pseudoItem, qtyChange, false);
      return {
        amount: qtyChange < 0 ? roundToFour(fifoResult.outgoingCost) : roundToFour(Math.abs(qtyChange) * baseCost),
        nextCost: fifoResult.nextCost,
        layers: fifoResult.layers
      };
    }

    const costOutcome = resolveNextInventoryCost(product, pseudoInvoice, pseudoItem, qtyChange, false);
    return {
      amount: roundToFour(Math.abs(qtyChange) * baseCost),
      nextCost: costOutcome.nextCost,
      layers: costOutcome.layers ?? product.fifoLayers
    };
  };

  const addStockTransfer = (t: Omit<StockTransfer, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'ADD', 'Stock Transfers')) return;
    const nextTransfer = { ...t, id: 'st_' + Math.random().toString(36).substr(2, 9) };
    setStockTransfers(prev => [...prev, nextTransfer]);
    if (nextTransfer.status === 'POSTED') {
      setProducts(prev => applyStockTransferToProducts(prev, nextTransfer, 1));
    }
  };

  const updateStockTransfer = (id: string, updates: Partial<StockTransfer>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Stock Transfers')) return;
    const existingTransfer = stockTransfers.find(transfer => transfer.id === id);
    if (!existingTransfer) return;

    const nextTransfer: StockTransfer = {
      ...existingTransfer,
      ...updates,
      id
    };

    setStockTransfers(prev => prev.map(transfer => transfer.id === id ? nextTransfer : transfer));
    setProducts(prev => {
      let nextProducts = prev;
      if (existingTransfer.status === 'POSTED') {
        nextProducts = applyStockTransferToProducts(nextProducts, existingTransfer, -1);
      }
      if (nextTransfer.status === 'POSTED') {
        nextProducts = applyStockTransferToProducts(nextProducts, nextTransfer, 1);
      }
      return nextProducts;
    });
  };

  const deleteStockTransfer = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Stock Transfers')) return;
    const existingTransfer = stockTransfers.find(transfer => transfer.id === id);
    if (!existingTransfer) return;

    setStockTransfers(prev => prev.filter(transfer => transfer.id !== id));
    if (existingTransfer.status === 'POSTED') {
      setProducts(prev => applyStockTransferToProducts(prev, existingTransfer, -1));
    }
  };

  const adjustWarehouseStock = (
    productId: string,
    warehouseId: string,
    quantity: number,
    options?: {
      reason?: 'VARIANCE' | 'DAMAGED';
      date?: string;
      note?: string;
      source?: 'MANUAL' | 'INLINE' | 'BARCODE';
    }
  ): MutationResult => {
    const permission = enforcePermission('PRODUCTS', 'EDIT', 'Warehouse Stock');
    if (!permission.ok) return permission;
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Warehouse Stock')) {
      return makeError('SUBSCRIPTION_LIMIT', 'Subscription access is blocked for warehouse adjustments.');
    }

    const numericQuantity = roundToFour(Number(quantity) || 0);
    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      return makeError('VALIDATION_ERROR', 'Warehouse quantity must be zero or greater.');
    }

    const product = products.find(p => p.id === productId);
    if (!product || !isStockProduct(product)) {
      return makeError('VALIDATION_ERROR', 'Stock item not found.');
    }

    const warehouse = warehouses.find(entry => entry.id === warehouseId);
    if (!warehouse) {
      return makeError('VALIDATION_ERROR', 'Warehouse not found.');
    }

    const currentQuantity = roundToFour(product.warehouseStock?.find(stock => stock.warehouseId === warehouseId)?.quantity ?? 0);
    const qtyChange = roundToFour(numericQuantity - currentQuantity);
    if (Math.abs(qtyChange) <= 0.0001) return makeSuccess();

    const reason = options?.reason === 'DAMAGED' ? 'DAMAGED' : 'VARIANCE';
    if (reason === 'DAMAGED' && qtyChange > 0) {
      return makeError('VALIDATION_ERROR', 'Damaged goods adjustment must reduce stock, not increase it.');
    }

    const offsetAccountId = reason === 'DAMAGED' ? 'acc_damaged_goods' : 'acc_inventory_variance';
    const inventoryAccount = accounts.find(a => a.id === 'acc_inventory' && !a.isGroup);
    const offsetAccount = accounts.find(a => a.id === offsetAccountId && !a.isGroup);
    if (!inventoryAccount || !offsetAccount) {
      return makeError('VALIDATION_ERROR', 'Required inventory adjustment accounts are missing.');
    }

    const costOutcome = resolveInventoryAdjustmentCostOutcome(product, qtyChange);
    const adjustmentAmount = roundToFour(costOutcome.amount);
    const postingDate = options?.date || new Date().toISOString().split('T')[0];
    const sourceLabel = reason === 'DAMAGED'
      ? 'إتلاف بضاعة'
      : options?.source === 'BARCODE'
        ? 'تسوية جرد بالباركود'
        : options?.source === 'INLINE'
          ? 'تسوية جرد مباشرة'
          : 'تسوية جرد يدوي';
    const deltaLabel = `${qtyChange > 0 ? '+' : ''}${roundToFour(qtyChange)}`;
    const quantityNote = options?.note || `من ${currentQuantity} إلى ${numericQuantity} (فرق ${deltaLabel})`;
    const description = [
      sourceLabel,
      product.name,
      warehouse.name,
      quantityNote
    ].join(' - ');

    if (adjustmentAmount > 0.0001) {
      const postingResult = addTransaction({
        amount: adjustmentAmount,
        description,
        category: 'journal',
        type: TransactionType.TRANSFER,
        date: postingDate,
        debitAccountId: qtyChange > 0 ? inventoryAccount.id : offsetAccount.id,
        creditAccountId: qtyChange > 0 ? offsetAccount.id : inventoryAccount.id,
        currency: baseCurrency,
        exchangeRate: 1,
        status: 'POSTED'
      });
      if (!postingResult.ok) return postingResult;
    }

    setProducts(prev => prev.map(entry => {
      if (entry.id !== productId) return entry;
      const currentStock = entry.warehouseStock || [];
      const idx = currentStock.findIndex(stock => stock.warehouseId === warehouseId);
      let nextWarehouseStock = [...currentStock];
      if (idx >= 0) {
        nextWarehouseStock[idx] = { ...nextWarehouseStock[idx], quantity: numericQuantity };
      } else {
        nextWarehouseStock.push({ warehouseId, quantity: numericQuantity });
      }
      const nextGlobalStock = roundToFour(nextWarehouseStock.reduce((sum, stock) => sum + (Number(stock.quantity) || 0), 0));
      const pricingPatch = buildProductPricingPatch(entry, costOutcome.nextCost);
      return {
        ...entry,
        ...pricingPatch,
        warehouseStock: nextWarehouseStock,
        stock: nextGlobalStock,
        fifoLayers: costOutcome.layers ?? entry.fifoLayers
      };
    }));

    return makeSuccess();
  };

  const postStockTransfer = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'POST', 'Stock Transfers')) return;
    const transfer = stockTransfers.find(t => t.id === id);
    if (!transfer || transfer.status === 'POSTED') return;

    // 1. Update Transfer Status
    setStockTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'POSTED' } : t));

    // 2. Adjust Stock
    setProducts(prevProducts => applyStockTransferToProducts(prevProducts, transfer, 1));
  };

  // --- MANUFACTURING METHODS ---
  const addBOM = (bom: Omit<BillOfMaterial, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'ADD', 'Manufacturing BOM')) return;
    setBoms(prev => [...prev, { ...bom, id: 'bom_' + Math.random().toString(36).substr(2, 9) }]);
  };
  const updateBOM = (id: string, updates: Partial<BillOfMaterial>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Manufacturing BOM')) return;
    setBoms(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };
  const deleteBOM = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Manufacturing BOM')) return;
    setBoms(prev => prev.filter(b => b.id !== id));
  };

  const addProductionOrder = (order: Omit<ProductionOrder, 'id'>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'ADD', 'Production Orders')) return;
    setProductionOrders(prev => [...prev, { ...order, id: 'po_' + Math.random().toString(36).substr(2, 9) }]);
  };
  const updateProductionOrder = (id: string, updates: Partial<ProductionOrder>) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'EDIT', 'Production Orders')) return;
    setProductionOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };
  const deleteProductionOrder = (id: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'DELETE', 'Production Orders')) return;
    setProductionOrders(prev => prev.filter(o => o.id !== id));
  };

  const executeProduction = (orderId: string) => {
    if (!guardSubscriptionOnlyMutation('PRODUCTS', 'POST', 'Production Orders')) return;
    const order = productionOrders.find(o => o.id === orderId);
    if (!order || order.status === 'COMPLETED') return;

    const bom = boms.find(b => b.id === order.bomId);
    if (!bom) return;

    // --- FINANCIAL TRANSACTION LOGIC ---
    let totalMaterialCost = 0;

    // 1. Calculate Material Cost & Verify Stock (Optional: could block if insufficient)
    bom.components.forEach(comp => {
      const product = products.find(p => p.id === comp.productId);
      if (product) {
        const cost = (product.buyPrice || 0) * comp.quantity * order.plannedQuantity;
        totalMaterialCost += cost;
      }
    });

    const laborCost = (bom.laborCost || 0) * order.plannedQuantity;
    const overheadCost = (bom.overheadCost || 0) * order.plannedQuantity;
    const totalCost = totalMaterialCost + laborCost + overheadCost;
    const postingDate = new Date().toISOString().split('T')[0];

    // 2. Post production absorption entries.
    // Material value moves within inventory in this model (same control account), so only labor/overhead need GL entries.
    const postingEntries: Omit<Transaction, 'id'>[] = [];
    if (laborCost > 0) {
      postingEntries.push({
        amount: laborCost,
        description: `Labor cost - Production order #${order.orderNumber}`,
        category: 'production_labor',
        type: TransactionType.EXPENSE,
        date: postingDate,
        debitAccountId: 'acc_inventory',
        creditAccountId: 'acc_direct_labor',
        currency: baseCurrency,
        exchangeRate: 1,
        status: 'POSTED'
      });
    }

    if (overheadCost > 0) {
      postingEntries.push({
        amount: overheadCost,
        description: `Manufacturing overhead - Production order #${order.orderNumber}`,
        category: 'production_overhead',
        type: TransactionType.EXPENSE,
        date: postingDate,
        debitAccountId: 'acc_inventory',
        creditAccountId: 'acc_manufacturing_overhead',
        currency: baseCurrency,
        exchangeRate: 1,
        status: 'POSTED'
      });
    }

    for (const entry of postingEntries) {
      const result = addTransaction(entry);
      if (!result.ok) return;
    }

    // 3. Mark Order as Completed
    updateProductionOrder(orderId, {
      status: 'COMPLETED',
      completedQuantity: order.plannedQuantity,
      endDate: postingDate,
      totalCost: totalCost // Store the historical cost
    });

    const valuationMethod = getCurrentInventoryValuationMethod();

    // 4. Adjust Stock (Deduct Components, Add Finished Good)
    setProducts(prevProducts => prevProducts.map(p => {
      // Is this the finished good?
      if (p.id === bom.productId) {
        const currentVal = p.stock * p.buyPrice;
        const newTotalStock = p.stock + order.plannedQuantity;
        const newAvgPrice = newTotalStock > 0 ? (currentVal + totalCost) / newTotalStock : (totalCost / order.plannedQuantity);
        const producedUnitCost = order.plannedQuantity > 0
          ? roundToFour(totalCost / order.plannedQuantity)
          : Math.max(0, Number(p.buyPrice) || 0);
        const baseLayers = normalizeProductFifoLayers(p);
        const fifoLayers = order.plannedQuantity > 0
          ? [...baseLayers, { qty: roundToFour(order.plannedQuantity), unitCost: producedUnitCost }]
          : baseLayers;
        const nextCost = valuationMethod === 'AVERAGE'
          ? roundToFour(newAvgPrice)
          : valuationMethod === 'FIFO'
            ? (fifoLayers[0]?.unitCost ?? p.buyPrice)
            : p.buyPrice;
        const pricingPatch = buildProductPricingPatch(p, roundToFour(nextCost));
        return {
          ...p,
          ...pricingPatch,
          stock: newTotalStock,
          fifoLayers: valuationMethod === 'FIFO' ? fifoLayers : p.fifoLayers
        };
      }

      // Is this a component?
      const component = bom.components.find(c => c.productId === p.id);
      if (component) {
        // Calculate total required quantity for the order
        const requiredQty = component.quantity * order.plannedQuantity;
        if (valuationMethod === 'FIFO' && requiredQty > 0) {
          const consumed = consumeFifoLayers(normalizeProductFifoLayers(p), requiredQty, p.buyPrice);
          const nextCost = consumed.layers[0]?.unitCost ?? p.buyPrice;
          const pricingPatch = buildProductPricingPatch(p, roundToFour(nextCost));
          return {
            ...p,
            ...pricingPatch,
            stock: p.stock - requiredQty,
            fifoLayers: consumed.layers
          };
        }
        return { ...p, stock: p.stock - requiredQty };
      }

      return p;
    }));
  };

  const buildBackupFileName = (isoDate: string) =>
    `flex-accountant-backup-${isoDate.slice(0, 19).replace(/[:T]/g, '-')}.json`;

  const buildBackupSnapshot = () => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    companyId: currentCompanyId,
    companyProfile: currentCompany,
    baseCurrency,
    companySettings,
    users,
    accounts,
    transactions,
    invoices,
    invoiceSettlements,
    importExpenseDistributions,
    products,
    itemGroups,
    units,
    contacts,
    employees,
    employeeContracts,
    salaryHistory,
    employeeLeaveRequests,
    employeeRecurringDeductions,
    fingerprintDevices,
    fingerprintAttendanceBatches,
    departments,
    tickets,
    fixedAssets,
    assetGroups,
    checks,
    currencies,
    warehouses,
    stockTransfers,
    boms,
    productionOrders,
    permissions,
    auditLogs
  });

  const createEncryptedBackupPayload = async (
    password: string,
    source: 'MANUAL' | 'AUTO'
  ): Promise<BackupPayloadV1 | null> => {
    const normalizedPassword = String(password || '').trim();


    const encrypted = await encryptBackupPayload(buildBackupSnapshot(), normalizedPassword);
    return encrypted;
  };

  const persistBackupHistory = (
    payload: BackupPayloadV1,
    source: 'MANUAL' | 'AUTO',
    upload?: { uploadedToDrive?: boolean; driveFileId?: string }
  ) => {
    // Avoid saving the full ciphertext in history since it is never displayed or retrieved,
    // which prevents LocalStorage quota limits from being exceeded and reduces memory leaks.
    const cleanPayload: BackupPayloadV1 = {
      ...payload,
      cipherText: `[OMITTED_FOR_SPACE: ${payload.cipherText.length} chars]`
    };
    appendBackupHistoryEntry(
      currentCompanyId,
      {
        id: newId('backup_history'),
        companyId: currentCompanyId,
        createdAt: payload.createdAt,
        source,
        payload: cleanPayload,
        driveFileId: upload?.driveFileId,
        uploadedToDrive: Boolean(upload?.uploadedToDrive)
      },
      companySettings.autoBackupKeepCount || 30
    );
  };

  const requestGoogleAccessToken = async (interactive: boolean): Promise<string> => {
    const now = Date.now();
    if (googleTokenRef.current && now < googleTokenExpiresAtRef.current - 60_000) {
      return googleTokenRef.current;
    }

    if (!interactive) {
      throw new Error(companySettings.language === 'EN' ? 'Session expired. Please connect Google Drive manually again.' : 'انتهت صلاحية الجلسة. يرجى ربط Google Drive يدوياً مرة أخرى.');
    }

    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle({
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });
      if (!result.credential?.accessToken) {
        throw new Error('No access token returned from Google Sign In.');
      }
      googleTokenRef.current = result.credential.accessToken;
      googleTokenExpiresAtRef.current = Date.now() + 3500 * 1000;
      return result.credential.accessToken;
    } else {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({ prompt: 'consent' });
      const result = await signInWithPopup(firebaseAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('No access token returned from Google Sign In.');
      }
      googleTokenRef.current = credential.accessToken;
      googleTokenExpiresAtRef.current = Date.now() + 3500 * 1000;
      return credential.accessToken;
    }
  };

  const fetchGoogleDriveUserEmail = async (token: string): Promise<string | undefined> => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return undefined;
      const profile = await response.json() as { email?: string };
      return profile.email;
    } catch {
      return undefined;
    }
  };

  const uploadBackupPayloadToGoogleDrive = async (
    payload: BackupPayloadV1,
    fileName: string,
    interactiveAuth: boolean
  ): Promise<{ ok: true; fileId?: string } | { ok: false; message: string }> => {
    try {
      setGoogleDriveStatus(prev => ({ ...prev, isBusy: true, lastError: undefined }));
      const token = await requestGoogleAccessToken(interactiveAuth);
      const metadata: Record<string, unknown> = {
        name: fileName,
        mimeType: 'application/json'
      };
      const folderId = String(companySettings.googleDriveFolderId || '').trim();
      if (folderId) {
        metadata.parents = [folderId];
      }

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), fileName);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Google Drive upload failed (${response.status}): ${body.slice(0, 180)}`);
      }

      const result = await response.json() as { id?: string };
      const userEmail = await fetchGoogleDriveUserEmail(token);
      setGoogleDriveStatus(prev => ({
        ...prev,
        isConnected: true,
        userEmail: userEmail || prev.userEmail,
        connectedAt: prev.connectedAt || new Date(),
        lastBackupId: result.id || prev.lastBackupId,
        lastBackupTime: new Date(),
        isBusy: false,
        lastError: undefined
      }));
      return { ok: true, fileId: result.id };
    } catch (error: any) {
      const message = String(error?.message || 'Google Drive upload failed.');
      setGoogleDriveStatus(prev => ({
        ...prev,
        isBusy: false,
        lastError: message
      }));
      return { ok: false, message };
    }
  };

  const connectGoogleDrive: AccountingContextType['connectGoogleDrive'] = async () => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings > Backup');
    if (!permission.ok) return permission;

    try {
      setGoogleDriveStatus(prev => ({ ...prev, isBusy: true, lastError: undefined }));
      const token = await requestGoogleAccessToken(true);
      const userEmail = await fetchGoogleDriveUserEmail(token);
      setGoogleDriveStatus(prev => ({
        ...prev,
        isConnected: true,
        userEmail: userEmail || prev.userEmail,
        connectedAt: new Date(),
        isBusy: false,
        lastError: undefined
      }));
      appendAuditLog({
        entityType: 'backup',
        action: 'GOOGLE_DRIVE_CONNECT',
        screen: 'Settings > Backup',
        metadata: { userEmail: userEmail || '' }
      });
      return makeSuccess();
    } catch (error: any) {
      const message = String(error?.message || 'Could not connect Google Drive.');
      setGoogleDriveStatus(prev => ({
        ...prev,
        isConnected: false,
        isBusy: false,
        lastError: message
      }));
      appendAuditLog({
        entityType: 'backup',
        action: 'GOOGLE_DRIVE_CONNECT_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: message }
      });
      return makeError('VALIDATION_ERROR', message);
    }
  };

  const disconnectGoogleDrive: AccountingContextType['disconnectGoogleDrive'] = () => {
    googleTokenRef.current = '';
    googleTokenExpiresAtRef.current = 0;
    setGoogleDriveStatus({
      isConnected: false,
      userEmail: undefined,
      connectedAt: undefined,
      lastBackupId: undefined,
      lastBackupTime: undefined,
      isBusy: false,
      lastError: undefined
    });
    appendAuditLog({
      entityType: 'backup',
      action: 'GOOGLE_DRIVE_DISCONNECT',
      screen: 'Settings > Backup'
    });
  };

  const uploadBackupToGoogleDrive: AccountingContextType['uploadBackupToGoogleDrive'] = async (payload, fileName) => {
    const permission = enforcePermission('SETTINGS', 'PRINT', 'Settings > Backup');
    if (!permission.ok) return permission;

    const targetFileName = fileName || buildBackupFileName(payload.createdAt);
    const upload = await uploadBackupPayloadToGoogleDrive(payload, targetFileName, true);
    if (upload.ok === false) {
      appendAuditLog({
        entityType: 'backup',
        action: 'GOOGLE_DRIVE_UPLOAD_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: upload.message }
      });
      return makeError('VALIDATION_ERROR', upload.message);
    }

    appendAuditLog({
      entityType: 'backup',
      action: 'GOOGLE_DRIVE_UPLOAD',
      screen: 'Settings > Backup',
      metadata: { fileId: upload.fileId || '' }
    });
    return makeSuccess();
  };

  const runAutoBackupCycle = async (interactiveDriveAuth: boolean): Promise<MutationResult> => {
    if (autoBackupInFlightRef.current) {
      return makeError('VALIDATION_ERROR', 'Auto backup is already running.');
    }

    const password = String(companySettings.autoBackupPassword || '').trim();


    autoBackupInFlightRef.current = true;
    try {
      const payload = await createEncryptedBackupPayload(password, 'AUTO');
      if (!payload) {
        throw new Error('Could not create automatic backup payload.');
      }

      let uploadedToDrive = false;
      let driveFileId: string | undefined;

      if (companySettings.googleDriveAutoUpload) {
        const upload = await uploadBackupPayloadToGoogleDrive(
          payload,
          buildBackupFileName(payload.createdAt),
          interactiveDriveAuth
        );
        uploadedToDrive = upload.ok;
        driveFileId = upload.ok ? upload.fileId : undefined;
      }

      persistBackupHistory(payload, 'AUTO', { uploadedToDrive, driveFileId });
      setCompanySettings(prev => withNormalizedValuationSettings({
        ...prev,
        autoBackupLastRunAt: payload.createdAt
      }));

      appendAuditLog({
        entityType: 'backup',
        action: 'AUTO_EXPORT',
        screen: 'Settings > Backup',
        metadata: {
          createdAt: payload.createdAt,
          uploadedToDrive,
          driveFileId: driveFileId || ''
        }
      });
      lastBackedUpVersionRef.current = syncQueueVersion;
      return makeSuccess();
    } catch (error: any) {
      const message = String(error?.message || 'Automatic backup failed.');
      
      try {
        setCompanySettings(prev => withNormalizedValuationSettings({
          ...prev,
          autoBackupLastRunAt: new Date().toISOString()
        }));
      } catch (settingsError) {
        console.error('Failed to update autoBackupLastRunAt on backup failure:', settingsError);
      }

      appendAuditLog({
        entityType: 'backup',
        action: 'AUTO_EXPORT_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: message }
      });

      lastBackedUpVersionRef.current = syncQueueVersion;

      return makeError('VALIDATION_ERROR', message);
    } finally {
      autoBackupInFlightRef.current = false;
    }
  };

  const runAutoBackupNow: AccountingContextType['runAutoBackupNow'] = async () => {
    const permission = enforcePermission('SETTINGS', 'PRINT', 'Settings > Backup');
    if (!permission.ok) return permission;
    return runAutoBackupCycle(true);
  };

  const exportData = async (password: string): Promise<BackupPayloadV1 | null> => {
    const permission = enforcePermission('SETTINGS', 'PRINT', 'Settings > Backup');
    if (!permission.ok) return null;

    const encrypted = await createEncryptedBackupPayload(password, 'MANUAL');
    if (!encrypted) return null;

    persistBackupHistory(encrypted, 'MANUAL');
    appendAuditLog({
      entityType: 'backup',
      action: 'EXPORT',
      screen: 'Settings > Backup',
      metadata: { createdAt: encrypted.createdAt }
    });
    return encrypted;
  };

  const importData = async (json: string, password: string): Promise<boolean> => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings > Backup');
    if (!permission.ok) return false;

    try {
      const parsed = JSON.parse(json);
      if (!isBackupPayloadV1(parsed)) {
        appendAuditLog({
          entityType: 'backup',
          action: 'IMPORT_REJECTED',
          screen: 'Settings > Backup',
          metadata: { reason: 'INVALID_PAYLOAD' }
        });
        return false;
      }

      const restored = await decryptBackupPayload(parsed, password.trim());
      const data = restored as Record<string, unknown>;
      const restoredSettings = withNormalizedValuationSettings({
        ...defaultCompanySettings,
        ...((data.companySettings as CompanySettings) || {})
      });

      setBaseCurrencyState((data.baseCurrency as string) || 'ILS');
      setCompanySettings(restoredSettings);
      setUsers(Array.isArray(data.users) ? (data.users as User[]) : users);
      setAccounts(Array.isArray(data.accounts) ? (data.accounts as Account[]) : accounts);
      setTransactions(Array.isArray(data.transactions) ? normalizeContactIdReferences(data.transactions as Transaction[]) : transactions);
      setInvoices(Array.isArray(data.invoices) ? sanitizeInvoices(normalizeInvoiceCustomerReferences(data.invoices as Invoice[])) : invoices);
      setInvoiceSettlements(Array.isArray((data as any).invoiceSettlements) ? normalizeContactIdReferences((data as any).invoiceSettlements as InvoiceSettlement[]) : invoiceSettlements);
      setImportExpenseDistributions(Array.isArray(data.importExpenseDistributions) ? (data.importExpenseDistributions as ImportExpenseDistribution[]) : importExpenseDistributions);
      setProducts(Array.isArray(data.products) ? (data.products as Product[]) : products);
      setItemGroups(Array.isArray(data.itemGroups) ? (data.itemGroups as ItemGroup[]) : itemGroups);
      setUnits(Array.isArray(data.units) ? (data.units as UnitOfMeasure[]) : units);
      setContacts(Array.isArray(data.contacts) ? normalizeContactsList(data.contacts as Contact[]) : contacts);
      setEmployees(Array.isArray(data.employees) ? (data.employees as Employee[]) : employees);
      setEmployeeContracts(Array.isArray((data as any).employeeContracts) ? ((data as any).employeeContracts as EmployeeContract[]) : employeeContracts);
      setSalaryHistory(Array.isArray((data as any).salaryHistory) ? ((data as any).salaryHistory as SalaryHistoryEntry[]) : salaryHistory);
      setEmployeeLeaveRequests(Array.isArray((data as any).employeeLeaveRequests) ? ((data as any).employeeLeaveRequests as EmployeeLeaveRequest[]) : employeeLeaveRequests);
      setEmployeeRecurringDeductions(Array.isArray((data as any).employeeRecurringDeductions) ? ((data as any).employeeRecurringDeductions as EmployeeRecurringDeduction[]) : employeeRecurringDeductions);
      setFingerprintDevices(Array.isArray((data as any).fingerprintDevices) ? ((data as any).fingerprintDevices as FingerprintReaderDevice[]) : fingerprintDevices);
      setFingerprintAttendanceBatches(Array.isArray((data as any).fingerprintAttendanceBatches) ? ((data as any).fingerprintAttendanceBatches as FingerprintAttendanceBatch[]) : fingerprintAttendanceBatches);
      setDepartments(Array.isArray(data.departments) ? (data.departments as Department[]) : departments);
      setTickets(Array.isArray(data.tickets) ? (data.tickets as SupportTicket[]) : tickets);
      setFixedAssets(Array.isArray(data.fixedAssets) ? (data.fixedAssets as FixedAsset[]) : fixedAssets);
      setAssetGroups(Array.isArray(data.assetGroups) ? (data.assetGroups as FixedAssetGroup[]) : assetGroups);
      setChecks(Array.isArray(data.checks) ? normalizeContactIdReferences(data.checks as Check[]) : checks);
      setCurrencies(Array.isArray(data.currencies) ? (data.currencies as Currency[]) : currencies);
      setWarehouses(Array.isArray(data.warehouses) ? (data.warehouses as Warehouse[]) : warehouses);
      setStockTransfers(Array.isArray(data.stockTransfers) ? (data.stockTransfers as StockTransfer[]) : stockTransfers);
      setBoms(Array.isArray(data.boms) ? (data.boms as BillOfMaterial[]) : boms);
      setProductionOrders(Array.isArray(data.productionOrders) ? (data.productionOrders as ProductionOrder[]) : productionOrders);
      const importedAudit = Array.isArray(data.auditLogs) ? (data.auditLogs as AuditLogEntry[]) : [];
      setPermissions(resolveWorkspacePermissions((data.permissions as PermissionMatrix) || permissions, importedAudit));
      setCompanies(prev => prev.map(company => (
        company.id === currentCompanyId
          ? {
            ...company,
            name: restoredSettings.name,
            taxNumber: restoredSettings.taxNumber,
            address: restoredSettings.address,
            phone: restoredSettings.phone,
            logoUrl: restoredSettings.logoUrl
          }
          : company
      )));

      const restoreLog: AuditLogEntry = {
        id: newId('audit'),
        timestamp: new Date().toISOString(),
        userId: currentUser?.id,
        userName: currentUser?.name,
        entityType: 'backup',
        action: 'IMPORT',
        screen: 'Settings > Backup',
        device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      };
      setAuditLogs([restoreLog, ...importedAudit].slice(0, 5000));
      setSyncQueueVersion(prev => prev + 1);
      return true;
    } catch {
      appendAuditLog({
        entityType: 'backup',
        action: 'IMPORT_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: 'DECRYPT_OR_PARSE_FAILED' }
      });
      return false;
    }
  };

  const restoreFromGoogleDrive: AccountingContextType['restoreFromGoogleDrive'] = async (password) => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings > Backup');
    if (!permission.ok) return permission;

    const normalizedPassword = String(password || '').trim();


    try {
      setGoogleDriveStatus(prev => ({ ...prev, isBusy: true, lastError: undefined }));
      const token = await requestGoogleAccessToken(true);
      const folderId = String(companySettings.googleDriveFolderId || '').trim();
      const queryParts = [
        "(name contains 'flex-accountant-backup-' or name contains 'aiflex-erp-backup-' or name contains 'smart-accountant-backup-')",
        "mimeType = 'application/json'",
        'trashed = false'
      ];
      if (folderId) {
        queryParts.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);
      }
      const query = encodeURIComponent(queryParts.join(' and '));
      const listUrl = `https://www.googleapis.com/drive/v3/files?pageSize=1&orderBy=createdTime desc&fields=files(id,name,createdTime)&q=${query}`;
      const listResponse = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!listResponse.ok) {
        const body = await listResponse.text();
        throw new Error(`Could not fetch backup list (${listResponse.status}): ${body.slice(0, 180)}`);
      }
      const list = await listResponse.json() as { files?: Array<{ id: string; name: string; createdTime?: string }> };
      const latest = list.files?.[0];
      if (!latest?.id) {
        throw new Error('No backup file found on Google Drive.');
      }

      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!fileResponse.ok) {
        const body = await fileResponse.text();
        throw new Error(`Could not download backup file (${fileResponse.status}): ${body.slice(0, 180)}`);
      }
      const rawBackup = await fileResponse.text();
      const restored = await importData(rawBackup, normalizedPassword);
      if (!restored) {
        throw new Error('Restore failed. Check password and backup file.');
      }

      setGoogleDriveStatus(prev => ({
        ...prev,
        isConnected: true,
        lastBackupId: latest.id,
        lastBackupTime: latest.createdTime ? new Date(latest.createdTime) : new Date(),
        isBusy: false,
        lastError: undefined
      }));
      appendAuditLog({
        entityType: 'backup',
        action: 'GOOGLE_DRIVE_RESTORE',
        screen: 'Settings > Backup',
        metadata: { fileId: latest.id, fileName: latest.name || '' }
      });
      return makeSuccess();
    } catch (error: any) {
      const message = String(error?.message || 'Could not restore backup from Google Drive.');
      setGoogleDriveStatus(prev => ({ ...prev, isBusy: false, lastError: message }));
      appendAuditLog({
        entityType: 'backup',
        action: 'GOOGLE_DRIVE_RESTORE_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: message }
      });
      return makeError('VALIDATION_ERROR', message);
    }
  };

  useEffect(() => {
    googleTokenRef.current = '';
    googleTokenExpiresAtRef.current = 0;
    lastBackedUpVersionRef.current = null;
    lastSavedSnapshotRef.current = null;
    setGoogleDriveStatus({ isConnected: false });
  }, [currentCompanyId]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    if (!companySettings.autoBackupEnabled) return;


    let cancelled = false;
    const frequencyMs = companySettings.autoBackupFrequency === 'INSTANT'
      ? 10 * 1000
      : companySettings.autoBackupFrequency === 'HOURLY'
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

    const runIfDue = async () => {
      if (cancelled || autoBackupInFlightRef.current) return;
      if (lastBackedUpVersionRef.current === syncQueueVersion) return;
      const lastRunAt = Date.parse(String(companySettings.autoBackupLastRunAt || ''));
      const due = !Number.isFinite(lastRunAt) || (Date.now() - lastRunAt) >= frequencyMs;
      if (!due) return;
      await runAutoBackupCycle(false);
    };

    void runIfDue();
    const intervalMs = companySettings.autoBackupFrequency === 'INSTANT' ? 10 * 1000 : 60 * 1000;
    const timer = window.setInterval(() => {
      void runIfDue();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    currentCompanyId,
    workspaceHydratedForCompanyId,
    companySettings.autoBackupEnabled,
    companySettings.autoBackupFrequency,
    companySettings.autoBackupPassword,
    companySettings.autoBackupLastRunAt,
    companySettings.googleDriveAutoUpload,
    companySettings.googleDriveClientId,
    companySettings.googleDriveFolderId,
    companySettings.autoBackupKeepCount,
    syncQueueVersion
  ]);

  const showWorkspaceBootstrapping = Boolean(
    currentUser &&
    currentCompanyId &&
    workspaceHydratedForCompanyId !== currentCompanyId
  );

  return (
    <AccountingContext.Provider value={{
      currentUser, setCurrentUser, logout,
      companies, currentCompanyId, currentCompany, companiesLoaded, trialDaysLeft, companyAccessStatus, companyAccessDaysLeft, companyAccessEndsAt,
      workspaceSubscription, workspaceMaxCompanies, workspaceRemainingCompanySlots, workspaceCompanyLimitReached, workspaceProviderAvailability,
      switchCompany, createCompany, deleteCompany, wipeAllCompanyData, updateWorkspaceSubscription, prepareSubscriptionCheckout: prepareSubscriptionCheckoutAction, updateCompanyProfile, updateCompanySubscription, activateCompanySubscription,
      deviceBindingId, cloudSubscription, subscriptionCloudBusy, subscriptionCloudError, subscriptionAdminEnabled, programOwnerEnabled, subscriptionCodes, subscriptionCodesLoading, workspaceOfferCodes, workspaceOfferCodesLoading, subscriptionCompanies, subscriptionCompaniesLoading, issueSubscriptionCode, cancelSubscriptionCode, issueWorkspaceOfferCode, redeemWorkspaceOfferCode, linkCurrentSubscriptionDevice, unlinkSubscriptionDevice,
      transactions, addTransaction, deleteTransaction, setTransactions, updateTransaction, postVoucher, deleteVoucher, reverseTransaction,
      invoices, createInvoice, updateInvoice, deleteInvoice, postInvoice, reverseInvoice, returnInvoiceItem, setInvoices,
      invoiceSettlements, upsertInvoiceSettlementsForVoucher,
      importExpenseDistributions, addImportExpenseDistribution, setImportExpenseDistributions,
      accounts, addAccount, updateAccount, deleteAccount,
      products, addProduct, updateProduct, deleteProduct, setProducts,
      itemGroups, addItemGroup, updateItemGroup, deleteItemGroup,
      units, addUnit, updateUnit, deleteUnit,
      contacts, addContact, updateContact, deleteContact, postPartnerCapitalContribution, postPartnerCurrentReceipt, postPartnerCashDisbursement,
      employees, addEmployee, updateEmployee, deleteEmployee, employeeContracts, addEmployeeContract, updateEmployeeContract, deleteEmployeeContract, salaryHistory,
      employeeLeaveRequests, addEmployeeLeaveRequest, updateEmployeeLeaveRequest, deleteEmployeeLeaveRequest,
      employeeRecurringDeductions, addEmployeeRecurringDeduction, updateEmployeeRecurringDeduction, deleteEmployeeRecurringDeduction,
      fingerprintDevices, addFingerprintDevice, updateFingerprintDevice, deleteFingerprintDevice,
      fingerprintAttendanceBatches, addFingerprintAttendanceBatch, updateFingerprintAttendanceBatch, deleteFingerprintAttendanceBatch,
      departments, addDepartment, deleteDepartment,
      tickets, addTicket, updateTicketStatus, deleteTicket,
      fixedAssets, addFixedAsset, updateFixedAsset, deleteFixedAsset,
      assetGroups, addAssetGroup, deleteAssetGroup,
      checks, addCheck, updateCheck, deleteCheck,
      currencies, baseCurrency, setBaseCurrency, addCurrency, deleteCurrency, updateCurrencyRate,
      companySettings, updateCompanySettings,
      users, addUser, updateUser, deleteUser,
      summary,
      isOnline, isSyncing, lastSyncTime, syncData, exportData, importData,
      googleDriveStatus, connectGoogleDrive, disconnectGoogleDrive, uploadBackupToGoogleDrive, restoreFromGoogleDrive, runAutoBackupNow,
      permissions, updatePermissions, can, auditLogs, appendAuditLog,

      // Warehouse Module
      warehouses, addWarehouse, updateWarehouse, deleteWarehouse,
      stockTransfers, addStockTransfer, updateStockTransfer, deleteStockTransfer, postStockTransfer, adjustWarehouseStock,

      // Manufacturing Module
      boms, addBOM, updateBOM, deleteBOM,
      productionOrders, addProductionOrder, updateProductionOrder, deleteProductionOrder, executeProduction
    }}>
      {showWorkspaceBootstrapping ? (
        <div className="min-h-dvh bg-slate-950 text-white flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900/80 px-6 py-7 text-center shadow-[0_28px_90px_rgba(2,6,23,0.58)]">
            <div className="mx-auto mb-4 h-2 w-24 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
            </div>
            <div className="text-lg font-black">
              {companySettings.language === 'EN' ? 'Loading workspace...' : 'جارٍ تحميل بيانات الشركة...'}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {companySettings.language === 'EN'
                ? 'We are restoring the latest company data safely.'
                : 'نستعيد الآن آخر بيانات الشركة بشكل آمن.'}
            </p>
          </div>
        </div>
      ) : children}
    </AccountingContext.Provider>
  );
};

export default useAccounting;
