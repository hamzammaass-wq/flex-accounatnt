
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
  CompanyMembership, CompanyProfile, CreateCompanyInput, ImportExpenseDistribution, InventoryValuationMethod, ProductFifoLayer
  , InvoiceSettlement, FingerprintReaderDevice, FingerprintAttendanceBatch
} from '../types';
import { validateInvoiceInput, validateTransactionInput } from '../utils/validationRules';
import { decryptBackupPayload, encryptBackupPayload, isBackupPayloadV1 } from '../utils/backupCrypto';
import { getInvoiceRemainingBase } from '../utils/invoiceSettlement';
import { sanitizeInvoices } from '../utils/invoiceSanitizer';
import { buildProductPricingPatch } from '../utils/productPricing';
import { isProfitLossAccount } from '../utils/fiscalYear';
import { DEFAULT_BRAND_MARK_URL, normalizeBrandLogoUrl } from '../utils/brandAssets';
import { detectPreferredAppLanguage, normalizeAppLanguage } from '../utils/i18n';
import { normalizeCompanyDisplaySettings, normalizeInvoiceTaxSettings } from '../utils/companySettings';
import { onAuthStateChanged, type User as FirebaseAuthUser, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseAuth, firebaseDb, isFirebaseAuthEnabled, isFirebaseSyncEnabled } from '../firebaseClient';

// ... (Existing Interfaces)

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

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
  drawingsAccountId?: string;
};

type EnsuredPartnerEquityAccountsResult = {
  currentAccountId: string;
  capitalAccountId: string;
  drawingsAccountId: string;
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
  trialDaysLeft: number;
  switchCompany: (companyId: string) => MutationResult;
  createCompany: (input: CreateCompanyInput) => Promise<MutationResult>;
  updateCompanyProfile: (companyId: string, updates: Partial<CompanyProfile>) => MutationResult;

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
  addFixedAsset: (asset: Omit<FixedAsset, 'id'>) => void;
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
  adjustWarehouseStock: (productId: string, warehouseId: string, quantity: number) => void;

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
  'SETTINGS'
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
    darkModeEnabled: Boolean(normalizedSettings.darkModeEnabled),
    language: normalizeAppLanguage(normalizedSettings.language)
  };
};

const withNormalizedCompanyProfile = (profile: CompanyProfile): CompanyProfile => ({
  ...profile,
  logoUrl: normalizeBrandLogoUrl(profile.logoUrl, DEFAULT_BRAND_MARK_URL)
});

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
  currentCompany: 'al_mohaseb_current_company'
} as const;

const GUEST_USER_ID = 'guest_user';

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
const BACKUP_HISTORY_KEY_PREFIX = 'al_mohaseb_backup_history_';
const WORKSPACE_SYNC_QUEUE_KEY = 'al_mohaseb_workspace_sync_queue_v1';
const LAST_WORKSPACE_SYNC_AT_KEY = 'al_mohaseb_workspace_last_sync_at';
const WORKSPACE_SYNC_COLLECTION = 'workspace_sync_snapshots';
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
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(WORKSPACE_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkspaceSyncQueueItem);
  } catch {
    return [];
  }
};

const writeWorkspaceSyncQueue = (items: WorkspaceSyncQueueItem[]) => {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACE_SYNC_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage write failures so the app keeps working offline-first.
  }
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
    queue.unshift(nextItem);
  }
  writeWorkspaceSyncQueue(queue);
};

const updateWorkspaceSyncQueueItem = (companyId: string, updates: Partial<WorkspaceSyncQueueItem>) => {
  const queue = readWorkspaceSyncQueue();
  const index = queue.findIndex(item => item.companyId === companyId);
  if (index < 0) return;
  queue[index] = {
    ...queue[index],
    ...updates
  };
  writeWorkspaceSyncQueue(queue);
};

const removeWorkspaceSyncQueueItem = (companyId: string) => {
  const queue = readWorkspaceSyncQueue();
  writeWorkspaceSyncQueue(queue.filter(item => item.companyId !== companyId));
};

const readLastWorkspaceSyncAt = (): Date | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(LAST_WORKSPACE_SYNC_AT_KEY);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
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

  if ('caches' in window) {
    const cacheKeys = await window.caches.keys();
    await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
  }
};

const addDaysIso = (dateIso: string, days: number): string => {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const readBackupHistory = (companyId: string): BackupHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(getBackupHistoryKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BackupHistoryEntry => (
      item &&
      typeof item === 'object' &&
      item.companyId === companyId &&
      typeof item.createdAt === 'string' &&
      item.payload &&
      typeof item.payload === 'object' &&
      typeof (item.payload as BackupPayloadV1).cipherText === 'string'
    ));
  } catch {
    return [];
  }
};

const saveBackupHistory = (companyId: string, entries: BackupHistoryEntry[]) => {
  localStorage.setItem(getBackupHistoryKey(companyId), JSON.stringify(entries));
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

export const AccountingProvider = ({ children }: { children?: ReactNode }) => {
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

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEYS.currentUser);
      if (!savedUser) return null;
      const parsed = JSON.parse(savedUser);
      if (!parsed || typeof parsed !== 'object') {
        localStorage.removeItem(STORAGE_KEYS.currentUser);
        return null;
      }
      return parsed as User;
    } catch {
      // Guard against corrupted localStorage that can crash app bootstrap.
      try {
        localStorage.removeItem(STORAGE_KEYS.currentUser);
      } catch {
        // ignore cleanup failure
      }
      return null;
    }
  });

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

  const [baseCurrency, setBaseCurrency] = useState('ILS');

  const initialAccounts: Account[] = [
    // 1 - ASSETS
    { id: 'acc_assets', code: '1', name: 'الأصول', type: 'ASSET', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_current_assets', code: '11', name: 'الأصول المتداولة', type: 'ASSET', balance: 0, parentId: 'acc_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_cash_root', code: '111', name: 'نقدية بالصناديق (الخزائن)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_cash', code: '11101', name: 'الصندوق الرئيسي', type: 'ASSET', balance: 0, parentId: 'acc_cash_root', currency: baseCurrency },
    { id: 'acc_bank_root', code: '112', name: 'نقدية بالبنوك (حسابات جارية)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_receivable_group', code: '113', name: 'الذمم المدينة (العملاء)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_receivable', code: '11301', name: 'ذمم العملاء التجارية', type: 'ASSET', balance: 0, parentId: 'acc_receivable_group', currency: baseCurrency },
    { id: 'acc_notes_receivable', code: '114', name: 'أوراق القبض (شيكات واردة)', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_cheques_hand', code: '11401', name: 'شيكات برسم التحصيل', type: 'ASSET', balance: 0, parentId: 'acc_notes_receivable', currency: baseCurrency },
    { id: 'acc_cheques_under_collection', code: '11402', name: 'شيكات تحت التحصيل', type: 'ASSET', balance: 0, parentId: 'acc_notes_receivable', currency: baseCurrency },
    { id: 'acc_inventory_group', code: '115', name: 'المخزون', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', isGroup: true, currency: baseCurrency },
    { id: 'acc_inventory', code: '11501', name: 'مخزون البضائع', type: 'ASSET', balance: 0, parentId: 'acc_inventory_group', currency: baseCurrency },
    { id: 'acc_vat_input', code: '116', name: 'ضريبة المدخلات القابلة للاسترداد', type: 'ASSET', balance: 0, parentId: 'acc_current_assets', currency: baseCurrency },
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
    { id: 'acc_payable', code: '211', name: 'ذمم الموردين التجارية', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
    { id: 'acc_notes_payable', code: '212', name: 'أوراق الدفع (شيكات صادرة)', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
    { id: 'acc_accrued_salaries', code: '213', name: 'ذمم موظفين', type: 'LIABILITY', balance: 0, parentId: 'acc_current_liabilities', currency: baseCurrency },
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
    { id: 'acc_sales_returns', code: '43', name: 'مرتجع المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency }, // Added Separated Account
    { id: 'acc_sales_discounts', code: '44', name: 'خصومات المبيعات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
    { id: 'acc_gain_asset_disposal', code: '45', name: 'أرباح بيع الأصول', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },
    { id: 'acc_service_income', code: '42', name: 'إيرادات الخدمات', type: 'REVENUE', balance: 0, parentId: 'acc_revenue_root', currency: baseCurrency },

    // 5 - EXPENSES
    { id: 'acc_expense_root', code: '5', name: 'المصروفات', type: 'EXPENSE', balance: 0, isGroup: true, currency: baseCurrency },
    { id: 'acc_cogs', code: '51', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_purchases', code: '511', name: 'المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency }, // Added Purchases Account
    { id: 'acc_purchase_returns', code: '512', name: 'مردودات المشتريات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency }, // Added Purchase Returns Account
    { id: 'acc_admin_exp', code: '52', name: 'مصاريف إدارية وعمومية', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', isGroup: true, currency: baseCurrency },
    { id: 'acc_exp_salaries', code: '521', name: 'الرواتب والأجور المباشرة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_exp_rent', code: '522', name: 'إيجار المكاتب والفروع', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_exp_utilities', code: '523', name: 'خدمات (كهرباء ومياه)', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', isGroup: true, currency: baseCurrency },
    { id: 'acc_exp_electricity', code: '5231', name: 'مصاريف كهرباء', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency },
    { id: 'acc_exp_water', code: '5232', name: 'مصاريف مياه', type: 'EXPENSE', balance: 0, parentId: 'acc_exp_utilities', currency: baseCurrency },
    { id: 'acc_exp_marketing', code: '524', name: 'مصاريف تسويق وإعلان', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency },
    { id: 'acc_exp_maintenance', code: '525', name: 'مصاريف صيانة', type: 'EXPENSE', balance: 0, parentId: 'acc_admin_exp', currency: baseCurrency }, // Added Maintenance Expenses
    { id: 'acc_bank_fees', code: '53', name: 'مصاريف وعمولات بنكية', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_depreciation_exp', code: '54', name: 'مصروف الإهلاك', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_exchange_diff', code: '55', name: 'فروقات أسعار العملات', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_loss_asset_disposal', code: '56', name: 'خسائر بيع الأصول', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    // Manufacturing Accounts
    { id: 'acc_direct_labor', code: '513', name: 'أجور عمالة مباشرة (صناعية)', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_manufacturing_overhead', code: '514', name: 'ت. صناعية غير مباشرة (محملة)', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
    { id: 'acc_purchase_discounts_earned', code: '515', name: 'خصومات مشتريات مكتسبة', type: 'EXPENSE', balance: 0, parentId: 'acc_expense_root', currency: baseCurrency },
  ];

  const initialProducts: Product[] = [
    { id: 'p1', name: 'جهاز كمبيوتر محمول i7', itemCode: 'ITM-001', buyPrice: 2500, sellPrice: 3200, stock: 15, category: 'ig_electronics', barcode: '628100000001' },
    { id: 'p2', name: 'شاشة LED 27 بوصة', itemCode: 'ITM-002', buyPrice: 450, sellPrice: 650, stock: 24, category: 'ig_electronics', barcode: '628100000002' },
    { id: 'p3', name: 'طابعة ليزر ملونة', itemCode: 'ITM-003', buyPrice: 800, sellPrice: 1100, stock: 8, category: 'ig_electronics', barcode: '628100000003' },
    { id: 'p4', name: 'كرسي مكتب مريح', itemCode: 'ITM-004', buyPrice: 300, sellPrice: 450, stock: 12, category: 'ig_furniture', barcode: '628100000004' },
  ];

  const initialContacts: Contact[] = [
    { id: 'cash_customer', name: 'عميل نقدي', type: 'CUSTOMER', phone: '0000000000', preferredPriceTier: 'RETAIL' },
    { id: 'c1', name: 'شركة التوريدات الحديثة', type: 'SUPPLIER', phone: '0501234567', preferredPriceTier: 'WHOLESALE' },
    { id: 'c2', name: 'مؤسسة النجاح التجارية', type: 'CUSTOMER', phone: '0559876543', preferredPriceTier: 'RETAIL' },
  ];

  const initialEmployees: Employee[] = [
    { id: 'emp_1', name: 'محمد عبد الله', code: 'E001', departmentId: 'dept_admin', position: 'محاسب عام', salaryType: 'FIXED', basicSalary: 8000, dailyWorkHours: 8, hourlyRate: 33.33, overtimeHourlyRate: 50, housingAllowance: 1000, transportAllowance: 500, otherAllowances: 0, status: 'ACTIVE', hireDate: '2023-01-10' },
    { id: 'emp_2', name: 'خالد إبراهيم', code: 'E002', departmentId: 'dept_sales', position: 'مندوب مبيعات', salaryType: 'FIXED', basicSalary: 5000, dailyWorkHours: 8, hourlyRate: 20.83, overtimeHourlyRate: 31.25, housingAllowance: 500, transportAllowance: 1000, otherAllowances: 0, status: 'ACTIVE', hireDate: '2023-05-15' },
  ];

  const initialAssetGroups: FixedAssetGroup[] = [
    {
      id: 'ag_buildings',
      name: 'مباني ومنشآت',
      defaultUsefulLife: 25,
      depreciationRate: 4,
      description: 'العقارات والمباني الإدارية والإنتاجية',
      assetAccountId: 'acc_buildings',
      accumulatedDepreciationAccountId: 'acc_accumulated_depreciation',
      depreciationExpenseAccountId: 'acc_depreciation_exp'
    },
    {
      id: 'ag_machinery',
      name: 'آلات ومعدات',
      defaultUsefulLife: 10,
      depreciationRate: 10,
      description: 'الآلات الصناعية والمعدات الثقيلة',
      assetAccountId: 'acc_machinery',
      accumulatedDepreciationAccountId: 'acc_accumulated_depreciation',
      depreciationExpenseAccountId: 'acc_depreciation_exp'
    },
    {
      id: 'ag_furniture',
      name: 'أثاث ومكتبية',
      defaultUsefulLife: 7,
      depreciationRate: 14.28,
      description: 'أثاث المكاتب والمفروشات',
      assetAccountId: 'acc_furniture',
      accumulatedDepreciationAccountId: 'acc_accumulated_depreciation',
      depreciationExpenseAccountId: 'acc_depreciation_exp'
    },
    {
      id: 'ag_vehicles',
      name: 'سيارات ووسائل نقل',
      defaultUsefulLife: 5,
      depreciationRate: 20,
      description: 'سيارات الشركة وشاحنات النقل',
      assetAccountId: 'acc_vehicles',
      accumulatedDepreciationAccountId: 'acc_accumulated_depreciation',
      depreciationExpenseAccountId: 'acc_depreciation_exp'
    },
    {
      id: 'ag_computers',
      name: 'أجهزة حاسب وبرامج',
      defaultUsefulLife: 3,
      depreciationRate: 33.33,
      description: 'الحواسيب، السيرفرات، والبرمجيات المحاسبية',
      assetAccountId: 'acc_equipment',
      accumulatedDepreciationAccountId: 'acc_accumulated_depreciation',
      depreciationExpenseAccountId: 'acc_depreciation_exp'
    }
  ];

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

  const seededProducts: Product[] = initialProducts.map(product => ({
    ...product,
    warehouseStock: [{ warehouseId: 'wh_main', quantity: product.stock }]
  }));

  const seededContacts: Contact[] = [
    ...initialContacts,
    { id: 'c3', name: 'Al Noor Stores', type: 'CUSTOMER', phone: '0561122334' },
    { id: 'c4', name: 'North Traders Co.', type: 'SUPPLIER', phone: '0599988776' },
  ];

  const initialInvoices: Invoice[] = [
    {
      id: 'inv_sale_001',
      invoiceNumber: 'INV-260108',
      customerId: 'c2',
      type: TransactionType.INCOME,
      category: 'sales_invoice',
      date: '2026-01-08',
      dueDate: '2026-02-08',
      items: [
        { id: 'inv_sale_001_it1', productId: 'p1', description: 'Laptop i7', quantity: 1, unitPrice: 3200, total: 3200 },
        { id: 'inv_sale_001_it2', productId: 'p2', description: 'LED Monitor 27"', quantity: 2, unitPrice: 650, total: 1300 },
      ],
      subTotal: 4500,
      taxRate: 15,
      taxAmount: 675,
      discountAmount: 175,
      totalAmount: 5000,
      status: 'PENDING',
      postingStatus: 'POSTED',
      paymentType: 'CREDIT',
      notes: 'Credit sales invoice',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
    {
      id: 'inv_purchase_001',
      invoiceNumber: 'PINV-260112',
      customerId: 'c1',
      type: TransactionType.EXPENSE,
      category: 'purchase_invoice',
      date: '2026-01-12',
      dueDate: '2026-02-12',
      items: [
        { id: 'inv_purchase_001_it1', productId: 'p2', description: 'LED Monitor 27"', quantity: 4, unitPrice: 450, total: 1800 },
        { id: 'inv_purchase_001_it2', productId: 'p4', description: 'Office Chair', quantity: 4, unitPrice: 300, total: 1200 },
      ],
      subTotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 3000,
      status: 'PENDING',
      postingStatus: 'POSTED',
      paymentType: 'CREDIT',
      notes: 'Supplier invoice',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
    {
      id: 'inv_sale_002',
      invoiceNumber: 'INV-260202',
      customerId: 'cash_customer',
      type: TransactionType.INCOME,
      category: 'sales_invoice',
      date: '2026-02-02',
      items: [
        { id: 'inv_sale_002_it1', productId: 'p3', description: 'Color Laser Printer', quantity: 1, unitPrice: 1100, total: 1100 },
        { id: 'inv_sale_002_it2', productId: 'p4', description: 'Office Chair', quantity: 3, unitPrice: 450, total: 1350 },
      ],
      subTotal: 2450,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 150,
      totalAmount: 2300,
      status: 'PAID',
      postingStatus: 'POSTED',
      paymentType: 'CASH',
      paymentAccountId: 'acc_cash',
      notes: 'Cash sales invoice',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
    {
      id: 'inv_purchase_ret_001',
      invoiceNumber: 'PRET-260203',
      customerId: 'c1',
      type: TransactionType.INCOME,
      category: 'purchase_return',
      date: '2026-02-03',
      items: [
        { id: 'inv_purchase_ret_001_it1', productId: 'p4', description: 'Office Chair Return', quantity: 1, unitPrice: 300, total: 300 },
      ],
      subTotal: 300,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 300,
      status: 'PAID',
      postingStatus: 'POSTED',
      paymentType: 'CREDIT',
      notes: 'Purchase return',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
    {
      id: 'inv_sale_ret_001',
      invoiceNumber: 'SRET-260205',
      customerId: 'c2',
      type: TransactionType.EXPENSE,
      category: 'sales_return',
      date: '2026-02-05',
      items: [
        { id: 'inv_sale_ret_001_it1', productId: 'p2', description: 'Sales return item', quantity: 1, unitPrice: 650, total: 650 },
      ],
      subTotal: 650,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 650,
      status: 'PAID',
      postingStatus: 'POSTED',
      paymentType: 'CREDIT',
      notes: 'Sales return',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
    {
      id: 'inv_expense_001',
      invoiceNumber: 'EXP-260206',
      customerId: 'cash_customer',
      type: TransactionType.EXPENSE,
      category: 'general_expense',
      date: '2026-02-06',
      items: [
        { id: 'inv_expense_001_it1', accountId: 'acc_exp_electricity', description: 'Electricity bill', quantity: 1, unitPrice: 700, total: 700 },
      ],
      subTotal: 700,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 700,
      status: 'PAID',
      postingStatus: 'POSTED',
      paymentType: 'CASH',
      paymentAccountId: 'acc_cash',
      notes: 'Operating expense',
      currency: baseCurrency,
      exchangeRate: 1
    },
    {
      id: 'inv_purchase_002',
      invoiceNumber: 'PINV-260208',
      customerId: 'c4',
      type: TransactionType.EXPENSE,
      category: 'purchase_invoice',
      date: '2026-02-08',
      dueDate: '2026-03-08',
      items: [
        { id: 'inv_purchase_002_it1', productId: 'p3', description: 'Color Laser Printer', quantity: 2, unitPrice: 800, total: 1600 },
      ],
      subTotal: 1600,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 1600,
      status: 'PENDING',
      postingStatus: 'POSTED',
      paymentType: 'CREDIT',
      notes: 'Second supplier invoice',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
    {
      id: 'inv_quote_001',
      invoiceNumber: 'QT-260210',
      customerId: 'c3',
      type: TransactionType.INCOME,
      category: 'sales_invoice',
      date: '2026-02-10',
      items: [
        { id: 'inv_quote_001_it1', productId: 'p1', description: 'Laptop i7', quantity: 1, unitPrice: 3200, total: 3200 },
      ],
      subTotal: 3200,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 3200,
      status: 'QUOTATION',
      postingStatus: 'DRAFT',
      paymentType: 'CASH',
      paymentAccountId: 'acc_cash',
      notes: 'Open quotation',
      currency: baseCurrency,
      exchangeRate: 1,
      warehouseId: 'wh_main'
    },
  ];

  const initialTransactions: Transaction[] = [
    {
      id: 'tx_open_cash_capital',
      amount: 60000,
      description: 'Opening capital in cash',
      category: 'journal',
      type: TransactionType.TRANSFER,
      date: '2026-01-01',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_capital',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_open_bank_capital',
      amount: 15000,
      description: 'Opening capital in bank',
      category: 'journal',
      type: TransactionType.TRANSFER,
      date: '2026-01-01',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_capital',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_emp1_advance_001',
      amount: 1200,
      description: 'Employee advance - E001',
      category: 'employee_advance',
      type: TransactionType.EXPENSE,
      date: '2026-01-05',
      debitAccountId: 'acc_receivable',
      creditAccountId: 'acc_cash',
      employeeId: 'emp_1',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_sale_001',
      amount: 5000,
      description: 'Sales invoice #INV-260108',
      category: 'sales_invoice',
      type: TransactionType.INCOME,
      date: '2026-01-08',
      invoiceId: 'inv_sale_001',
      contactId: 'c2',
      debitAccountId: 'acc_receivable',
      creditAccountId: 'acc_sales',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_sale_001_cogs',
      amount: 3400,
      description: 'COGS for sales invoice #INV-260108',
      category: 'journal',
      type: TransactionType.EXPENSE,
      date: '2026-01-08',
      invoiceId: 'inv_sale_001',
      debitAccountId: 'acc_cogs',
      creditAccountId: 'acc_inventory',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_purchase_001',
      amount: 3000,
      description: 'Purchase invoice #PINV-260112',
      category: 'purchase_invoice',
      type: TransactionType.EXPENSE,
      date: '2026-01-12',
      invoiceId: 'inv_purchase_001',
      contactId: 'c1',
      debitAccountId: 'acc_inventory',
      creditAccountId: 'acc_payable',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_emp1_payment_received_001',
      amount: 300,
      description: 'Advance settlement cash - E001',
      category: 'employee_payment_received',
      type: TransactionType.INCOME,
      date: '2026-01-20',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_receivable',
      employeeId: 'emp_1',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_voucher_receipt_001_a',
      voucherId: 'RV-0001',
      amount: 1200,
      description: 'Receipt voucher RV-0001 - cash',
      category: 'voucher_receipt',
      type: TransactionType.INCOME,
      date: '2026-01-20',
      contactId: 'c2',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_receivable',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_voucher_receipt_001_b',
      voucherId: 'RV-0001',
      amount: 800,
      description: 'Receipt voucher RV-0001 - bank',
      category: 'voucher_receipt',
      type: TransactionType.INCOME,
      date: '2026-01-20',
      contactId: 'c2',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_receivable',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_voucher_payment_001',
      voucherId: 'PV-0001',
      amount: 1000,
      description: 'Payment voucher PV-0001',
      category: 'voucher_payment',
      type: TransactionType.EXPENSE,
      date: '2026-01-25',
      contactId: 'c1',
      debitAccountId: 'acc_payable',
      creditAccountId: 'acc_cash',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_salary_emp1_accrual_jan',
      amount: 9800,
      description: 'Salary accrual - E001 (2026-01-01 / 2026-01-31)',
      category: 'salaries',
      type: TransactionType.EXPENSE,
      date: '2026-01-31',
      debitAccountId: 'acc_exp_salaries',
      creditAccountId: 'acc_accrued_salaries',
      employeeId: 'emp_1',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_salary_emp1_penalty_jan',
      amount: 200,
      description: 'خصم تأخير/جزاءات ضمن احتساب الراتب - E001 (2026-01-01 / 2026-01-31)',
      category: 'employee_deduction',
      type: TransactionType.TRANSFER,
      date: '2026-01-31',
      debitAccountId: 'acc_accrued_salaries',
      creditAccountId: 'acc_exp_salaries',
      employeeId: 'emp_1',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_salary_emp1_dues_jan',
      amount: 600,
      description: 'خصم تسوية ذمم ضمن احتساب الراتب - E001 (2026-01-01 / 2026-01-31)',
      category: 'employee_deduction',
      type: TransactionType.TRANSFER,
      date: '2026-01-31',
      debitAccountId: 'acc_accrued_salaries',
      creditAccountId: 'acc_receivable',
      employeeId: 'emp_1',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_salary_emp2_direct_jan',
      amount: 6200,
      description: 'Direct salary payment - E002 (2026-01-01 / 2026-01-31)',
      category: 'salary_direct_payment',
      type: TransactionType.EXPENSE,
      date: '2026-01-31',
      debitAccountId: 'acc_exp_salaries',
      creditAccountId: 'acc_cash',
      employeeId: 'emp_2',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_sale_002',
      amount: 2300,
      description: 'Sales invoice #INV-260202',
      category: 'sales_invoice',
      type: TransactionType.INCOME,
      date: '2026-02-02',
      invoiceId: 'inv_sale_002',
      contactId: 'cash_customer',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_sales',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_sale_002_cogs',
      amount: 1700,
      description: 'COGS for sales invoice #INV-260202',
      category: 'journal',
      type: TransactionType.EXPENSE,
      date: '2026-02-02',
      invoiceId: 'inv_sale_002',
      debitAccountId: 'acc_cogs',
      creditAccountId: 'acc_inventory',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_salary_emp1_payment_feb',
      amount: 9000,
      description: 'Salary payment - E001 (2026-01-01 / 2026-01-31)',
      category: 'salary_payment',
      type: TransactionType.EXPENSE,
      date: '2026-02-02',
      debitAccountId: 'acc_accrued_salaries',
      creditAccountId: 'acc_cash',
      employeeId: 'emp_1',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_purchase_return_001',
      amount: 300,
      description: 'Purchase return #PRET-260203',
      category: 'purchase_return',
      type: TransactionType.INCOME,
      date: '2026-02-03',
      invoiceId: 'inv_purchase_ret_001',
      contactId: 'c1',
      debitAccountId: 'acc_payable',
      creditAccountId: 'acc_inventory',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_sales_return_001',
      amount: 650,
      description: 'Sales return #SRET-260205',
      category: 'sales_return',
      type: TransactionType.EXPENSE,
      date: '2026-02-05',
      invoiceId: 'inv_sale_ret_001',
      contactId: 'c2',
      debitAccountId: 'acc_sales_returns',
      creditAccountId: 'acc_receivable',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_expense_001',
      amount: 700,
      description: 'Operating expense #EXP-260206',
      category: 'expense',
      type: TransactionType.EXPENSE,
      date: '2026-02-06',
      invoiceId: 'inv_expense_001',
      contactId: 'cash_customer',
      debitAccountId: 'acc_exp_electricity',
      creditAccountId: 'acc_cash',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_purchase_002',
      amount: 1600,
      description: 'Purchase invoice #PINV-260208',
      category: 'purchase_invoice',
      type: TransactionType.EXPENSE,
      date: '2026-02-08',
      invoiceId: 'inv_purchase_002',
      contactId: 'c4',
      debitAccountId: 'acc_inventory',
      creditAccountId: 'acc_payable',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_service_usd_001',
      amount: 1000,
      description: 'Consulting service in USD',
      category: 'service_income',
      type: TransactionType.INCOME,
      date: '2026-02-09',
      contactId: 'c3',
      debitAccountId: 'acc_cash',
      creditAccountId: 'acc_service_income',
      currency: 'USD',
      exchangeRate: 3.75,
      status: 'POSTED'
    },
    {
      id: 'tx_import_expense_001',
      amount: 350,
      description: 'Import handling expense',
      category: 'import_expenses',
      type: TransactionType.EXPENSE,
      date: '2026-02-10',
      contactId: 'c1',
      debitAccountId: 'acc_inventory',
      creditAccountId: 'acc_payable',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_salary_emp2_accrual_feb',
      amount: 6100,
      description: 'Salary accrual - E002 (2026-02-01 / 2026-02-28)',
      category: 'salaries',
      type: TransactionType.EXPENSE,
      date: '2026-02-10',
      debitAccountId: 'acc_exp_salaries',
      creditAccountId: 'acc_accrued_salaries',
      employeeId: 'emp_2',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    },
    {
      id: 'tx_voucher_payment_002_draft',
      voucherId: 'PV-0002',
      amount: 450,
      description: 'Payment voucher PV-0002 (draft)',
      category: 'voucher_payment',
      type: TransactionType.EXPENSE,
      date: '2026-02-12',
      contactId: 'c1',
      debitAccountId: 'acc_payable',
      creditAccountId: 'acc_cash',
      currency: baseCurrency,
      exchangeRate: 1,
      status: 'DRAFT'
    },
  ];

  const initialTickets: SupportTicket[] = [
    {
      id: 'tkt_001',
      contactId: 'c2',
      title: 'Invoice print issue',
      description: 'Customer requested a reprint for invoice INV-260108.',
      status: 'PENDING',
      priority: 'MEDIUM',
      createdAt: '2026-02-07T09:30:00.000Z'
    },
    {
      id: 'tkt_002',
      contactId: 'c1',
      title: 'Delivery mismatch',
      description: 'Supplier reported a mismatch in delivered quantities.',
      status: 'RESOLVED',
      priority: 'HIGH',
      createdAt: '2026-02-03T11:00:00.000Z'
    }
  ];

  const initialFixedAssets: FixedAsset[] = [
    {
      id: 'asset_001',
      name: 'Office Server',
      groupId: 'ag_computers',
      purchaseDate: '2025-06-01',
      cost: 18000,
      salvageValue: 2000,
      lifeInYears: 3,
      description: 'Primary accounting and file server',
      status: 'ACTIVE'
    },
    {
      id: 'asset_002',
      name: 'Delivery Van',
      groupId: 'ag_vehicles',
      purchaseDate: '2024-09-15',
      cost: 95000,
      salvageValue: 10000,
      lifeInYears: 5,
      description: 'Distribution vehicle',
      status: 'ACTIVE'
    },
    {
      id: 'asset_003',
      name: 'Old Office Printer',
      groupId: 'ag_computers',
      purchaseDate: '2022-01-10',
      cost: 4200,
      salvageValue: 400,
      lifeInYears: 3,
      description: 'Disposed legacy printer',
      status: 'DISPOSED',
      disposalDate: '2025-12-20',
      disposalPrice: 500
    }
  ];

  const initialChecks: Check[] = [
    {
      id: 'chk_in_001',
      checkNumber: 'IN-10045',
      bankName: 'National Bank',
      amount: 1800,
      currency: baseCurrency,
      dueDate: '2026-02-20',
      issueDate: '2026-01-20',
      type: 'INCOMING',
      status: 'PENDING',
      contactId: 'c2',
      description: 'Customer check in vault'
    },
    {
      id: 'chk_in_002',
      checkNumber: 'IN-10089',
      bankName: 'Capital Bank',
      amount: 3200,
      currency: baseCurrency,
      dueDate: '2026-02-18',
      issueDate: '2026-01-25',
      type: 'INCOMING',
      status: 'UNDER_COLLECTION',
      contactId: 'c2',
      description: 'Under collection check'
    },
    {
      id: 'chk_in_003',
      checkNumber: 'IN-09910',
      bankName: 'National Bank',
      amount: 1500,
      currency: baseCurrency,
      dueDate: '2026-01-30',
      issueDate: '2026-01-05',
      type: 'INCOMING',
      status: 'CLEARED',
      contactId: 'c2',
      description: 'Cleared incoming check'
    },
    {
      id: 'chk_out_001',
      checkNumber: 'OUT-5540',
      bankName: 'Capital Bank',
      amount: 2100,
      currency: baseCurrency,
      dueDate: '2026-02-25',
      issueDate: '2026-02-01',
      type: 'OUTGOING',
      status: 'PENDING',
      contactId: 'c1',
      description: 'Supplier payment check'
    },
    {
      id: 'chk_out_002',
      checkNumber: 'OUT-5491',
      bankName: 'Capital Bank',
      amount: 900,
      currency: baseCurrency,
      dueDate: '2026-01-20',
      issueDate: '2026-01-02',
      type: 'OUTGOING',
      status: 'BOUNCED',
      contactId: 'cash_customer',
      description: 'Bounced outgoing check'
    }
  ];

  const initialUsers: User[] = [
    {
      id: 'usr_admin',
      name: 'System Admin',
      email: 'admin@smart.local',
      role: 'ADMIN',
      status: 'ACTIVE',
      lastActive: '2026-02-14T09:00:00.000Z'
    },
    {
      id: 'usr_accountant',
      name: 'Main Accountant',
      email: 'accountant@smart.local',
      role: 'ACCOUNTANT',
      status: 'ACTIVE',
      lastActive: '2026-02-14T08:45:00.000Z'
    },
    {
      id: 'usr_viewer',
      name: 'Audit Viewer',
      email: 'viewer@smart.local',
      role: 'VIEWER',
      status: 'INACTIVE',
      lastActive: '2026-02-10T12:30:00.000Z'
    }
  ];

  const initialWarehouses: Warehouse[] = [
    { id: 'wh_main', name: 'المستودع الرئيسي', isMain: true, location: 'المقر الرئيسي' },
  ];

  const initialStockTransfers: StockTransfer[] = [];

  const initialBoms: BillOfMaterial[] = [
    {
      id: 'bom_001',
      name: 'Laptop Bundle BOM',
      productId: 'p1',
      outputQuantity: 1,
      components: [
        { id: 'bom_001_c1', productId: 'p2', quantity: 1, unitCost: 450 },
        { id: 'bom_001_c2', productId: 'p3', quantity: 0.5, unitCost: 800 },
      ],
      laborCost: 120,
      overheadCost: 80,
      status: 'ACTIVE',
      notes: 'Standard assembly bundle'
    },
    {
      id: 'bom_002',
      name: 'Office Chair Kit',
      productId: 'p4',
      outputQuantity: 1,
      components: [
        { id: 'bom_002_c1', productId: 'p2', quantity: 0.2, unitCost: 450 },
      ],
      laborCost: 30,
      overheadCost: 20,
      status: 'ACTIVE',
      notes: 'Chair finishing workflow'
    }
  ];

  const initialProductionOrders: ProductionOrder[] = [
    {
      id: 'po_001',
      orderNumber: 'MO-260211',
      bomId: 'bom_001',
      productId: 'p1',
      plannedQuantity: 2,
      completedQuantity: 0,
      status: 'PLANNED',
      startDate: '2026-02-11',
      notes: 'Planned for weekend batch',
      laborCost: 240,
      overheadCost: 160,
      rawMaterialsCost: 1700,
      totalCost: 2100
    },
    {
      id: 'po_002',
      orderNumber: 'MO-260120',
      bomId: 'bom_002',
      productId: 'p4',
      plannedQuantity: 10,
      completedQuantity: 10,
      status: 'COMPLETED',
      startDate: '2026-01-20',
      endDate: '2026-01-21',
      notes: 'Completed production lot',
      laborCost: 300,
      overheadCost: 200,
      rawMaterialsCost: 900,
      totalCost: 1400
    }
  ];

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

  const defaultCompanySettings: CompanySettings = {
    name: 'AIFLEX ERP',
    taxNumber: '300012345600003',
    address: 'الرياض - حي الملز',
    phone: '920001234',
    logoUrl: DEFAULT_BRAND_MARK_URL,
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
  };

  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [importExpenseDistributions, setImportExpenseDistributions] = useState<ImportExpenseDistribution[]>([]);
  const [invoiceSettlements, setInvoiceSettlements] = useState<InvoiceSettlement[]>([]);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [products, setProducts] = useState<Product[]>(seededProducts);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>(defaultItemGroups);
  const [units, setUnits] = useState<UnitOfMeasure[]>(initialUnits);
  const [contacts, setContacts] = useState<Contact[]>(seededContacts);

  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [employeeContracts, setEmployeeContracts] = useState<EmployeeContract[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryEntry[]>([]);
  const [employeeLeaveRequests, setEmployeeLeaveRequests] = useState<EmployeeLeaveRequest[]>([]);
  const [employeeRecurringDeductions, setEmployeeRecurringDeductions] = useState<EmployeeRecurringDeduction[]>([]);
  const [fingerprintDevices, setFingerprintDevices] = useState<FingerprintReaderDevice[]>([]);
  const [fingerprintAttendanceBatches, setFingerprintAttendanceBatches] = useState<FingerprintAttendanceBatch[]>([]);
  const [departments, setDepartments] = useState<Department[]>(defaultDepartments);

  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);
  const [assetGroups, setAssetGroups] = useState<FixedAssetGroup[]>(initialAssetGroups);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>(initialFixedAssets);
  const [checks, setChecks] = useState<Check[]>(initialChecks);
  const [currencies, setCurrencies] = useState<Currency[]>(defaultCurrencies);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(withNormalizedValuationSettings(defaultCompanySettings));
  const [companies, setCompanies] = useState<CompanyProfile[]>(() => {
    const nowIso = new Date().toISOString();
    const fallback: CompanyProfile[] = [{
      id: 'cmp_default',
      name: defaultCompanySettings.name,
      taxNumber: defaultCompanySettings.taxNumber,
      address: defaultCompanySettings.address,
      phone: defaultCompanySettings.phone,
      logoUrl: defaultCompanySettings.logoUrl,
      createdAt: nowIso,
      trialEndsAt: addDaysIso(nowIso, 14)
    }];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.companies);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
      return (parsed as CompanyProfile[]).map(withNormalizedCompanyProfile);
    } catch {
      return fallback;
    }
  });
  const [currentCompanyId, setCurrentCompanyId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.currentCompany) || 'cmp_default';
    } catch {
      return 'cmp_default';
    }
  });
  const [cloudMemberships, setCloudMemberships] = useState<CompanyMembership[]>([]);
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => normalizePermissionMatrix());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const currentCompany = useMemo(
    () => companies.find(c => c.id === currentCompanyId) || null,
    [companies, currentCompanyId]
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
  const googleTokenRef = useRef<string>('');
  const googleTokenExpiresAtRef = useRef<number>(0);
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveStatus>({ isConnected: false });
  const trialDaysLeft = useMemo(() => {
    if (!currentCompany?.trialEndsAt) return 0;
    const ms = new Date(currentCompany.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }, [currentCompany]);

  const logout = async () => {
    setCurrentUser(null);
    setCloudMemberships([]);
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
        const persistedCompanyId = resolvePersistedCompanyId();

        if (!authUser) {
          setCloudMemberships([]);
          setCurrentUser(prev => (
            isGuestUser(prev)
              ? {
                ...prev,
                companyId: persistedCompanyId,
                status: 'ACTIVE',
                lastActive: new Date().toISOString()
              }
              : null
          ));
          return;
        }

        setCloudMemberships([]);
        setCurrentUser(mapFirebaseAuthUser(authUser, persistedCompanyId));
      };

      const unsubscribe = onAuthStateChanged(firebaseAuth, syncFirebaseSession);

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    setCloudMemberships([]);
    setCurrentUser(prev => (
      isGuestUser(prev)
        ? {
          ...prev,
          companyId: currentCompanyId || prev.companyId,
          status: 'ACTIVE',
          lastActive: new Date().toISOString()
        }
        : null
    ));

    return () => {
      cancelled = true;
    };
  }, [currentCompanyId]);

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

  const makeSuccess = (): MutationResult => ({ ok: true });
  const makeError = (
    code: 'POSTED_LOCKED' | 'PERMISSION_DENIED' | 'VALIDATION_ERROR',
    message: string
  ): MutationResult => ({ ok: false, code, message });

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

  const enforcePermission = (
    module: PermissionModule,
    action: PermissionAction,
    screen: string
  ): MutationResult => {
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

    const shouldNormalizePartnerParents = Boolean(
      accounts.some(a => (
        (a.id === 'acc_partners_accounts_group' && (a.parentId !== 'acc_equity_root' || a.type !== 'EQUITY' || a.isGroup !== true)) ||
        (a.id === 'acc_partners_capital' && (a.parentId !== 'acc_partners_accounts_group' || a.type !== 'EQUITY' || a.isGroup !== true || a.code !== '331' || a.name !== 'رأس مال الشركاء')) ||
        (a.id === 'acc_partner_current' && (a.parentId !== 'acc_partners_accounts_group' || a.type !== 'EQUITY' || a.isGroup !== true || a.code !== '332' || a.name !== 'جاري الشركاء')) ||
        (a.id === 'acc_partner_drawings' && (a.parentId !== 'acc_partners_accounts_group' || a.type !== 'EQUITY' || a.isGroup !== true || a.code !== '333' || a.name !== 'مسحوبات الشركاء'))
      ))
    );

    if (missingAccounts.length > 0 || shouldNormalizeVatPayable || shouldNormalizeUtilitiesAccount || shouldNormalizeRetainedEarnings || shouldNormalizePartnerParents) {
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
  }, [baseCurrency, accounts.length]); // Depend on length to avoid infinite loop with simple dependency, but ideally run once or check existence safely

  // Cleanup: remove legacy partner withdrawals account when unused.
  useEffect(() => {
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
  }, [accounts, transactions, contacts]);

  // Migration: merge legacy "profit distribution" account(s) into retained earnings, then delete them.
  useEffect(() => {
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
  }, [accounts, transactions]);

  // MIGRATION: Ensure every fixed asset group is linked to accounts in COA
  useEffect(() => {
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
  }, [assetGroups]);

  // MIGRATION: Backfill HR contracts and salary history for existing employees.
  useEffect(() => {
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
  }, [employees]);


  const summary: FinancialSummary = {
    totalIncome: transactions.filter(t => t.type === 'INCOME' && t.status !== 'DRAFT').reduce((sum, t) => sum + (t.amount * (t.exchangeRate || 1)), 0),
    totalExpense: transactions.filter(t => t.type === 'EXPENSE' && t.status !== 'DRAFT').reduce((sum, t) => sum + (t.amount * (t.exchangeRate || 1)), 0),
    netBalance: 0
  };
  summary.netBalance = summary.totalIncome - summary.totalExpense;

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    if (autoFiscalPostingInFlightRef.current) return;

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
    accountSnapshot: Account[] = accounts
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
    commitTransaction(t, accounts)
  );

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
    const drawingsAccountId = ensureChild({
      id: `acc_partner_drawings_${safeContactId}`,
      expectedName: `مسحوبات ${partnerName}`,
      parent: parentDrawings,
      fallbackId: 'acc_partner_drawings',
      preferredId: preferred?.drawingsAccountId
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
      drawingsAccountId,
      accountSnapshot,
      changed: accountSnapshot !== sourceAccounts
    };
  };

  const resolvePartnerPostingAccounts = (partnerId: string, partnerName?: string) => {
    const partnerContact = contacts.find(c => c.id === partnerId && c.type === 'PARTNER');
    const resolvedName = partnerName || partnerContact?.name || String(partnerId || '').trim() || 'Partner';
    const prepared = ensurePartnerEquitySubAccountsSnapshot(accounts, partnerId, resolvedName, {
      currentAccountId: partnerContact?.currentAccountId || partnerContact?.linkedAccountId,
      capitalAccountId: partnerContact?.capitalAccountId,
      drawingsAccountId: partnerContact?.drawingsAccountId
    });
    if (prepared.changed) {
      setAccounts(prev => {
        const next = ensurePartnerEquitySubAccountsSnapshot(prev, partnerId, resolvedName, {
          currentAccountId: partnerContact?.currentAccountId || partnerContact?.linkedAccountId,
          capitalAccountId: partnerContact?.capitalAccountId,
          drawingsAccountId: partnerContact?.drawingsAccountId
        });
        return next.changed ? next.accountSnapshot : prev;
      });
    }
    const ensured = {
      currentAccountId: prepared.currentAccountId,
      capitalAccountId: prepared.capitalAccountId,
      drawingsAccountId: prepared.drawingsAccountId
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
    return commitTransaction({
      amount: Number(amount.toFixed(2)),
      description: `Partner capital contribution - ${resolvedName}${input.note ? ` - ${input.note}` : ''}`,
      category: 'partner_capital',
      type: TransactionType.TRANSFER,
      date: input.date,
      debitAccountId: input.fundingAccountId,
      creditAccountId: ensured.capitalAccountId,
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
        return sum + ((Number(item.quantity) || 0) * (Number(product?.buyPrice) || 0));
      }, 0));
    }

    const productMap = new Map<string, Product>(products.map(product => [product.id, product]));
    let totalCost = 0;
    invoice.items.forEach(item => {
      if (!item.productId) return;
      const product = productMap.get(item.productId);
      if (!product) return;
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

  const resolvePartnerCurrentAccountForInvoice = (
    invoice: Pick<Invoice, 'customerId' | 'paymentType'>
  ): string | null => {
    if (!invoice.customerId || invoice.paymentType === 'CASH') return null;

    const partner = contacts.find(c => c.id === invoice.customerId && c.type === 'PARTNER');
    if (!partner) return null;

    const { ensured, accountSnapshot } = resolvePartnerPostingAccounts(partner.id, partner.name);
    const currentAccount = accountSnapshot.find(a => a.id === ensured.currentAccountId);
    if (!currentAccount || currentAccount.isGroup) return null;

    return currentAccount.id;
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
      postingStatus: invoiceData.postingStatus || 'POSTED'
    };
    const partnerCurrentAccountId = resolvePartnerCurrentAccountForInvoice(newInvoice);
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
        : (partnerCurrentAccountId || 'acc_receivable');
      transactionCategory = 'sales_return';
    } else if (newInvoice.category === 'customer_credit_note') {
      // Customer credit note (discount/allowance): Debit contra revenue, Credit customer receivable
      debitAccount = 'acc_sales_discounts';
      creditAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (partnerCurrentAccountId || 'acc_receivable');
      transactionCategory = 'customer_credit_note';
    } else if (newInvoice.category === 'purchase_return') {
      // Purchase Return: Debit Supplier/Cash, Credit Inventory
      // This acts like a reversal of Purchase.
      debitAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (partnerCurrentAccountId || 'acc_payable');
      creditAccount = 'acc_inventory';
      transactionCategory = 'purchase_return';
    } else if (newInvoice.category === 'supplier_debit_note') {
      // Supplier debit note (earned discount): Debit payable, Credit purchase returns/contra-expense
      debitAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (partnerCurrentAccountId || 'acc_payable');
      creditAccount = 'acc_purchase_discounts_earned';
      transactionCategory = 'supplier_debit_note';
    } else if (newInvoice.type === TransactionType.INCOME) {
      // Sales Invoice
      creditAccount = 'acc_sales';
      debitAccount = newInvoice.paymentType === 'CASH'
        ? (newInvoice.paymentAccountId || 'acc_cash')
        : (partnerCurrentAccountId || 'acc_receivable');
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
        : (partnerCurrentAccountId || 'acc_payable');
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
      addInvoiceEntry({
        amount: primaryAmount,
        debitAccountId: debitAccount,
        creditAccountId: 'acc_inventory',
        entryType: TransactionType.INCOME
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
      addInvoiceEntry({
        amount: primaryAmount,
        debitAccountId: 'acc_inventory',
        creditAccountId: creditAccount,
        entryType: TransactionType.EXPENSE
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
        if (!item) return p;

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
      if (!item) return p;

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
      if (!item) return product;

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

    const debitAccount = isSales
      ? 'acc_sales_returns'
      : (inv.paymentType === 'CASH' ? (inv.paymentAccountId || 'acc_cash') : 'acc_payable');
    const creditAccount = isSales
      ? (inv.paymentType === 'CASH' ? (inv.paymentAccountId || 'acc_cash') : 'acc_receivable')
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
      if (product) {
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
  }, [accounts, transactions, invoices, checks, contacts, assetGroups]);

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

  const normalizeEntityName = (value: string) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const isCommercialContactType = (type: Contact['type']) =>
    type === 'CUSTOMER' || type === 'SUPPLIER' || type === 'PARTNER';

  const findCommercialContactNameConflict = (
    list: Contact[],
    candidateName: string,
    excludeId?: string
  ) => {
    const normalizedCandidate = normalizeEntityName(candidateName);
    if (!normalizedCandidate) return undefined;
    return list.find((contact) =>
      contact.id !== excludeId
      && isCommercialContactType(contact.type)
      && normalizeEntityName(contact.name) === normalizedCandidate
    );
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

  const addProduct = (product: Omit<Product, 'id'> & { id?: string }): MutationResult => {
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

    setProducts(prev => [...prev, { ...product, id: product.id || Math.random().toString(36).substr(2, 9) }]);
    return makeSuccess();
  };

  const updateProduct = (id: string, updates: Partial<Product>): MutationResult => {
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

    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    return makeSuccess();
  };
  const deleteProduct = (id: string) => setProducts(prev => prev.filter(p => p.id !== id));

  const addItemGroup = (group: Omit<ItemGroup, 'id'>) => setItemGroups(prev => [...prev, { ...group, id: 'ig_' + Math.random().toString(36).substr(2, 9) }]);
  const updateItemGroup = (id: string, updates: Partial<ItemGroup>) => setItemGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  const deleteItemGroup = (id: string) => setItemGroups(prev => prev.filter(g => g.id !== id));

  const addUnit = (unit: Omit<UnitOfMeasure, 'id'>) => setUnits(prev => [...prev, { ...unit, id: 'u_' + Math.random().toString(36).substr(2, 9) }]);
  const updateUnit = (id: string, updates: Partial<UnitOfMeasure>) => setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  const deleteUnit = (id: string) => setUnits(prev => prev.filter(u => u.id !== id));

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
    const prepared = ensurePartnerEquitySubAccountsSnapshot(accounts, contactId, contactName, preferred);
    if (prepared.changed) {
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
    const candidateName = String(contact.name || '').trim();
    if (!candidateName) {
      return makeError('VALIDATION_ERROR', 'Contact name is required.');
    }

    if (isCommercialContactType(contact.type)) {
      const conflict = findCommercialContactNameConflict(contacts, candidateName);
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
        showValidationAlert(
          `اسم الطرف "${candidateName}" مكرر ضمن العملاء/الموردين/الشركاء.`,
          `Contact name "${candidateName}" already exists in customers/suppliers/partners.`
        );
        return makeError('VALIDATION_ERROR', `Duplicate contact name: ${candidateName}`);
      }
    }

    const contactId = contact.id || Math.random().toString(36).substr(2, 9);
    const nextType = contact.type;
    const ensuredPartnerAccounts = nextType === 'PARTNER'
      ? ensurePartnerEquitySubAccounts(contactId, contact.name, {
        currentAccountId: contact.currentAccountId || contact.linkedAccountId,
        capitalAccountId: contact.capitalAccountId,
        drawingsAccountId: contact.drawingsAccountId
      })
      : undefined;

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
        linkedAccountId: ensuredPartnerAccounts?.currentAccountId,
        currentAccountId: ensuredPartnerAccounts?.currentAccountId,
        capitalAccountId: ensuredPartnerAccounts?.capitalAccountId,
        drawingsAccountId: ensuredPartnerAccounts?.drawingsAccountId
      }];
    });
    return makeSuccess();
  };

  const updateContact = (id: string, updates: Partial<Contact>): MutationResult => {
    const existing = contacts.find(c => c.id === id);
    if (!existing) return makeError('VALIDATION_ERROR', 'Contact not found.');

    const nextType = updates.type || existing.type;
    const nextName = String(updates.name ?? existing.name ?? '').trim();
    const currentNormalizedName = normalizeEntityName(existing.name);
    const nextNormalizedName = normalizeEntityName(nextName);
    const nameChanged = nextNormalizedName !== currentNormalizedName;
    const typeChanged = nextType !== existing.type;

    if ((nameChanged || typeChanged) && isCommercialContactType(nextType)) {
      const conflict = findCommercialContactNameConflict(contacts, nextName, id);
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
        showValidationAlert(
          `اسم الطرف "${nextName}" مكرر ضمن العملاء/الموردين/الشركاء.`,
          `Contact name "${nextName}" already exists in customers/suppliers/partners.`
        );
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

    setContacts(prev => prev.map(c => c.id === id ? {
      ...c,
      ...updates,
      linkedAccountId: ensuredPartnerAccounts?.currentAccountId,
      currentAccountId: ensuredPartnerAccounts?.currentAccountId,
      capitalAccountId: ensuredPartnerAccounts?.capitalAccountId,
      drawingsAccountId: ensuredPartnerAccounts?.drawingsAccountId
    } : c));
    return makeSuccess();
  };

  useEffect(() => {
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
  }, [contacts, accounts, baseCurrency]);
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
    setEmployees(prev => prev.filter(e => e.id !== id));
    setEmployeeContracts(prev => prev.filter(c => c.employeeId !== id));
    setSalaryHistory(prev => prev.filter(h => h.employeeId !== id));
    setEmployeeLeaveRequests(prev => prev.filter(r => r.employeeId !== id));
    setEmployeeRecurringDeductions(prev => prev.filter(d => d.employeeId !== id));
  };
  const addEmployeeContract = (contract: Omit<EmployeeContract, 'id' | 'createdAt'>, applyToEmployee = true): MutationResult => {
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
  const addDepartment = (dept: Omit<Department, 'id'>) => setDepartments(prev => [...prev, { ...dept, id: 'dept_' + Math.random().toString(36).substr(2, 9) }]);
  const deleteDepartment = (id: string) => setDepartments(prev => prev.filter(d => d.id !== id));

  const addTicket = (ticket: Omit<SupportTicket, 'id' | 'createdAt'>) => setTickets(prev => [{ ...ticket, id: 'tkt_' + Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() }, ...prev]);
  const updateTicketStatus = (id: string, status: TicketStatus) => setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  const deleteTicket = (id: string) => setTickets(prev => prev.filter(t => t.id !== id));
  const addFixedAsset = (asset: Omit<FixedAsset, 'id'>) => setFixedAssets(prev => [...prev, { ...asset, id: Math.random().toString(36).substr(2, 9) }]);
  const updateFixedAsset = (id: string, updates: Partial<FixedAsset>) => setFixedAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  const deleteFixedAsset = (id: string) => setFixedAssets(prev => prev.filter(a => a.id !== id));
  const addAssetGroup = (group: Omit<FixedAssetGroup, 'id'>) => setAssetGroups(prev => [
    ...prev,
    {
      ...group,
      id: 'ag_' + Math.random().toString(36).substr(2, 9),
      assetAccountId: group.assetAccountId || 'acc_fixed_assets_root',
      accumulatedDepreciationAccountId: group.accumulatedDepreciationAccountId || 'acc_accumulated_depreciation',
      depreciationExpenseAccountId: group.depreciationExpenseAccountId || 'acc_depreciation_exp'
    }
  ]);
  const deleteAssetGroup = (id: string) => setAssetGroups(prev => prev.filter(g => g.id !== id));
  const addCheck = (check: Omit<Check, 'id'> & { id?: string }) => setChecks(prev => [...prev, { ...check, id: check.id || Math.random().toString(36).substr(2, 9) }]);
  const updateCheck = (id: string, updates: Partial<Check>) => setChecks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const deleteCheck = (id: string) => setChecks(prev => prev.filter(c => c.id !== id));
  const addCurrency = (currency: Currency) => setCurrencies(prev => [...prev, currency]);
  const deleteCurrency = (code: string) => setCurrencies(prev => prev.filter(c => c.code !== code));
  const updateCurrencyRate = (code: string, rate: number) => setCurrencies(prev => prev.map(c => c.code === code ? { ...c, rate } : c));
  const updateCompanySettings = (settings: CompanySettings): MutationResult => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Settings');
    if (!permission.ok) return permission;

    const next = withNormalizedValuationSettings({
      ...companySettings,
      ...settings
    });
    setCompanySettings(next);
    setCompanies(prev => prev.map(company => (
      company.id === currentCompanyId
        ? {
          ...company,
          name: next.name,
          taxNumber: next.taxNumber,
          address: next.address,
          phone: next.phone,
          logoUrl: next.logoUrl
        }
        : company
    )));
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

  const addUser = (user: Omit<User, 'id'>) => setUsers(prev => [...prev, { ...user, id: Math.random().toString(36).substr(2, 9) }]);
  const updateUser = (id: string, user: Partial<User>) => setUsers(prev => prev.map(u => u.id === id ? { ...u, ...user } : u));
  const deleteUser = (id: string) => setUsers(prev => prev.filter(u => u.id !== id));

  // --- WAREHOUSE STATE ---
  const [warehouses, setWarehouses] = useState<Warehouse[]>(initialWarehouses);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(initialStockTransfers);


  // --- MANUFACTURING STATE ---
  const [boms, setBoms] = useState<BillOfMaterial[]>(initialBoms);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>(initialProductionOrders);

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

  const buildInitialWorkspaceSnapshot = (companyId: string): CompanyWorkspaceSnapshot => {
    const companyProfile = companies.find(company => company.id === companyId) || {
      id: companyId,
      name: defaultCompanySettings.name,
      taxNumber: '',
      address: '',
      phone: '',
      logoUrl: defaultCompanySettings.logoUrl,
      createdAt: new Date().toISOString(),
      trialEndsAt: addDaysIso(new Date().toISOString(), 14)
    };

    if (forceEmptyBootstrap) {
      return buildEmptyWorkspaceSnapshot(companyProfile);
    }

    const existing = readWorkspaceSnapshot(companyId);
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

  const readWorkspaceSnapshot = (companyId: string): CompanyWorkspaceSnapshot | null => {
    try {
      const raw = localStorage.getItem(getCompanyWorkspaceKey(companyId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CompanyWorkspaceSnapshot>;
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

  const applyWorkspaceSnapshot = (snapshot: CompanyWorkspaceSnapshot) => {
    const normalizedSnapshot = normalizeWorkspaceSnapshotCashContact(snapshot);
    setBaseCurrency(normalizedSnapshot.baseCurrency || 'ILS');
    setCompanySettings(withNormalizedValuationSettings({ ...defaultCompanySettings, ...(normalizedSnapshot.companySettings || {}) }));
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
    setFingerprintDevices((normalizedSnapshot as any).fingerprintDevices || []);
    setFingerprintAttendanceBatches((normalizedSnapshot as any).fingerprintAttendanceBatches || []);
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
    setPermissions(resolveWorkspacePermissions(normalizedSnapshot.permissions, normalizedSnapshot.auditLogs));
    setAuditLogs(normalizedSnapshot.auditLogs || []);
  };

  const saveCurrentWorkspaceSnapshot = (companyId: string) => {
    const snapshot: CompanyWorkspaceSnapshot = {
      schemaVersion: 1,
      companyId,
      updatedAt: new Date().toISOString(),
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
    };
    localStorage.setItem(getCompanyWorkspaceKey(companyId), JSON.stringify(snapshot));
    upsertWorkspaceSyncQueueItem(companyId, snapshot.updatedAt, currentUser?.id);
    setSyncQueueVersion(prev => prev + 1);
  };

  const persistLastWorkspaceSyncAt = (value: Date) => {
    try {
      localStorage.setItem(LAST_WORKSPACE_SYNC_AT_KEY, value.toISOString());
    } catch {
      // Ignore storage errors so sync status doesn't block data operations.
    }
  };

  const syncData = useCallback<AccountingContextType['syncData']>(async () => {
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
        const snapshot = readWorkspaceSnapshot(queueItem.companyId);
        if (!snapshot) {
          removeWorkspaceSyncQueueItem(queueItem.companyId);
          continue;
        }

        try {
          await setDoc(
            doc(firebaseDb, WORKSPACE_SYNC_COLLECTION, `${snapshot.companyId}_${authUserId}`),
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
  }, [currentUser, isOnline, isSyncing]);

  useEffect(() => {
    if (!currentUser) {
      localStorage.removeItem(STORAGE_KEYS.currentUser);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    if (!companies.length) return;
    localStorage.setItem(STORAGE_KEYS.companies, JSON.stringify(companies));
  }, [companies]);

  useEffect(() => {
    if (!currentCompanyId) return;
    localStorage.setItem(STORAGE_KEYS.currentCompany, currentCompanyId);
  }, [currentCompanyId]);

  useEffect(() => {
    if (!companies.length) return;
    if (companies.some(c => c.id === currentCompanyId)) return;
    setCurrentCompanyId(companies[0].id);
  }, [companies, currentCompanyId]);

  useEffect(() => {
    if (!currentCompanyId) return;
    // Rehydrate only when the active company context changes.
    // Depending on `companies` here causes settings updates to reload a stale
    // workspace snapshot before the latest state is persisted.
    const loaded = buildInitialWorkspaceSnapshot(currentCompanyId);
    applyWorkspaceSnapshot(loaded);
    localStorage.setItem(getCompanyWorkspaceKey(currentCompanyId), JSON.stringify(loaded));
    setWorkspaceHydratedForCompanyId(currentCompanyId);
  }, [currentCompanyId, cloudMemberships, currentUser]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    saveCurrentWorkspaceSnapshot(currentCompanyId);
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
    if (readWorkspaceSyncQueue().length === 0) return;
    void syncData();
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
    if (pendingTrialDays === null) return;

    const targetCompanyId = currentCompanyId || currentUser.companyId || companies[0]?.id;
    if (!targetCompanyId) return;

    const nowIso = new Date().toISOString();
    const nextTrialEndsAt = pendingTrialDays > 0 ? addDaysIso(nowIso, pendingTrialDays) : nowIso;
    setCompanies(prev => prev.map(company => (
      company.id === targetCompanyId
        ? {
          ...company,
          trialEndsAt: nextTrialEndsAt
        }
        : company
    )));
  }, [currentUser, currentCompanyId, companies]);

  const switchCompany = (companyId: string): MutationResult => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return makeError('VALIDATION_ERROR', 'Company not found.');
    if (cloudMemberships.length && !cloudMemberships.some(membership => membership.companyId === companyId && membership.status === 'ACTIVE')) {
      return makeError('VALIDATION_ERROR', 'This company is not linked to your account.');
    }
    if (companyId === currentCompanyId) return makeSuccess();
    saveCurrentWorkspaceSnapshot(currentCompanyId);
    setCurrentCompanyId(companyId);
    return makeSuccess();
  };

  const createCompany = async (input: CreateCompanyInput): Promise<MutationResult> => {
    const permission = enforcePermission('SETTINGS', 'ADD', 'Company Switcher');
    if (!permission.ok) return permission;
    const name = (input.name || '').trim();
    if (!name) return makeError('VALIDATION_ERROR', 'Company name is required.');

    try {
      const nowIso = new Date().toISOString();
      const companyId = newId('cmp');
      const profile: CompanyProfile = {
      id: companyId,
      name,
      taxNumber: input.taxNumber || '',
      address: input.address || '',
      phone: input.phone || '',
      logoUrl: normalizeBrandLogoUrl(input.logoUrl, defaultCompanySettings.logoUrl),
      createdAt: nowIso,
      trialEndsAt: addDaysIso(nowIso, 14)
    };

      saveCurrentWorkspaceSnapshot(currentCompanyId);

      const snapshot = buildEmptyWorkspaceSnapshot(profile);
      localStorage.setItem(getCompanyWorkspaceKey(profile.id), JSON.stringify(snapshot));
      upsertWorkspaceSyncQueueItem(profile.id, snapshot.updatedAt, currentUser?.id);
      setSyncQueueVersion(prev => prev + 1);

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
      return makeSuccess();
    } catch (error: any) {
      return makeError('VALIDATION_ERROR', error?.message || 'Failed to create company.');
    }
  };

  const updateCompanyProfile = (companyId: string, updates: Partial<CompanyProfile>): MutationResult => {
    const permission = enforcePermission('SETTINGS', 'EDIT', 'Company Switcher');
    if (!permission.ok) return permission;
    if (!companies.some(c => c.id === companyId)) return makeError('VALIDATION_ERROR', 'Company not found.');

    setCompanies(prev => prev.map(company => (
      company.id === companyId
        ? withNormalizedCompanyProfile({
          ...company,
          ...updates,
          id: company.id,
          createdAt: company.createdAt
        })
        : company
    )));
    if (companyId === currentCompanyId) {
      setCompanySettings(prev => ({
        ...prev,
        name: updates.name ?? prev.name,
        taxNumber: updates.taxNumber ?? prev.taxNumber,
        address: updates.address ?? prev.address,
        phone: updates.phone ?? prev.phone,
        logoUrl: normalizeBrandLogoUrl(updates.logoUrl ?? prev.logoUrl, defaultCompanySettings.logoUrl)
      }));
    }
    return makeSuccess();
  };

  // --- WAREHOUSE METHODS ---
  const addWarehouse = (w: Omit<Warehouse, 'id'>) => setWarehouses(prev => [...prev, { ...w, id: 'wh_' + Math.random().toString(36).substr(2, 9) }]);
  const updateWarehouse = (id: string, updates: Partial<Warehouse>) => setWarehouses(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  const deleteWarehouse = (id: string) => setWarehouses(prev => prev.filter(w => w.id !== id));

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

  const addStockTransfer = (t: Omit<StockTransfer, 'id'>) => {
    const nextTransfer = { ...t, id: 'st_' + Math.random().toString(36).substr(2, 9) };
    setStockTransfers(prev => [...prev, nextTransfer]);
    if (nextTransfer.status === 'POSTED') {
      setProducts(prev => applyStockTransferToProducts(prev, nextTransfer, 1));
    }
  };

  const updateStockTransfer = (id: string, updates: Partial<StockTransfer>) => {
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
    const existingTransfer = stockTransfers.find(transfer => transfer.id === id);
    if (!existingTransfer) return;

    setStockTransfers(prev => prev.filter(transfer => transfer.id !== id));
    if (existingTransfer.status === 'POSTED') {
      setProducts(prev => applyStockTransferToProducts(prev, existingTransfer, -1));
    }
  };

  const adjustWarehouseStock = (productId: string, warehouseId: string, quantity: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const currentStock = p.warehouseStock || [];
      const idx = currentStock.findIndex(s => s.warehouseId === warehouseId);
      let newWs = [...currentStock];

      if (idx >= 0) {
        newWs[idx] = { ...newWs[idx], quantity };
      } else {
        newWs.push({ warehouseId, quantity });
      }

      // Update global stock to match sum of warehouses
      const newGlobalStock = newWs.reduce((acc, curr) => acc + curr.quantity, 0);

      return { ...p, warehouseStock: newWs, stock: newGlobalStock };
    }));
  };

  const postStockTransfer = (id: string) => {
    const transfer = stockTransfers.find(t => t.id === id);
    if (!transfer || transfer.status === 'POSTED') return;

    // 1. Update Transfer Status
    setStockTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'POSTED' } : t));

    // 2. Adjust Stock
    setProducts(prevProducts => applyStockTransferToProducts(prevProducts, transfer, 1));
  };

  // --- MANUFACTURING METHODS ---
  const addBOM = (bom: Omit<BillOfMaterial, 'id'>) => setBoms(prev => [...prev, { ...bom, id: 'bom_' + Math.random().toString(36).substr(2, 9) }]);
  const updateBOM = (id: string, updates: Partial<BillOfMaterial>) => setBoms(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  const deleteBOM = (id: string) => setBoms(prev => prev.filter(b => b.id !== id));

  const addProductionOrder = (order: Omit<ProductionOrder, 'id'>) => setProductionOrders(prev => [...prev, { ...order, id: 'po_' + Math.random().toString(36).substr(2, 9) }]);
  const updateProductionOrder = (id: string, updates: Partial<ProductionOrder>) => setProductionOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  const deleteProductionOrder = (id: string) => setProductionOrders(prev => prev.filter(o => o.id !== id));

  const executeProduction = (orderId: string) => {
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
    `aiflex-erp-backup-${isoDate.slice(0, 19).replace(/[:T]/g, '-')}.json`;

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
    if (normalizedPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
      appendAuditLog({
        entityType: 'backup',
        action: source === 'AUTO' ? 'AUTO_EXPORT_REJECTED' : 'EXPORT_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: 'WEAK_PASSWORD' }
      });
      return null;
    }

    const encrypted = await encryptBackupPayload(buildBackupSnapshot(), normalizedPassword);
    return encrypted;
  };

  const persistBackupHistory = (
    payload: BackupPayloadV1,
    source: 'MANUAL' | 'AUTO',
    upload?: { uploadedToDrive?: boolean; driveFileId?: string }
  ) => {
    appendBackupHistoryEntry(
      currentCompanyId,
      {
        id: newId('backup_history'),
        companyId: currentCompanyId,
        createdAt: payload.createdAt,
        source,
        payload,
        driveFileId: upload?.driveFileId,
        uploadedToDrive: Boolean(upload?.uploadedToDrive)
      },
      companySettings.autoBackupKeepCount || 30
    );
  };

  const requestGoogleAccessToken = async (interactive: boolean): Promise<string> => {
    const clientId = String(companySettings.googleDriveClientId || '').trim();
    if (!clientId) throw new Error('Google Drive Client ID is required.');

    const now = Date.now();
    if (googleTokenRef.current && now < googleTokenExpiresAtRef.current - 60_000) {
      return googleTokenRef.current;
    }

    await loadGoogleIdentityScript();
    const googleApi = (window as any).google;
    if (!googleApi?.accounts?.oauth2?.initTokenClient) {
      throw new Error('Google identity SDK is not available.');
    }

    const tokenResponse = await new Promise<GoogleTokenResponse>((resolve) => {
      const tokenClient = googleApi.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DRIVE_SCOPES,
        callback: (response: GoogleTokenResponse) => resolve(response)
      });
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });

    if (!tokenResponse?.access_token || tokenResponse.error) {
      throw new Error(tokenResponse?.error_description || tokenResponse?.error || 'Google authentication failed.');
    }

    googleTokenRef.current = tokenResponse.access_token;
    googleTokenExpiresAtRef.current = Date.now() + ((tokenResponse.expires_in || 3600) * 1000);
    return tokenResponse.access_token;
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
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
      return makeError('VALIDATION_ERROR', 'Auto backup password must be at least 4 characters.');
    }

    autoBackupInFlightRef.current = true;
    try {
      const payload = await createEncryptedBackupPayload(password, 'AUTO');
      if (!payload) {
        return makeError('VALIDATION_ERROR', 'Could not create automatic backup payload.');
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
      return makeSuccess();
    } catch (error: any) {
      const message = String(error?.message || 'Automatic backup failed.');
      appendAuditLog({
        entityType: 'backup',
        action: 'AUTO_EXPORT_REJECTED',
        screen: 'Settings > Backup',
        metadata: { reason: message }
      });
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

      setBaseCurrency((data.baseCurrency as string) || 'ILS');
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
    if (normalizedPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
      return makeError('VALIDATION_ERROR', 'Backup password must be at least 4 characters.');
    }

    try {
      setGoogleDriveStatus(prev => ({ ...prev, isBusy: true, lastError: undefined }));
      const token = await requestGoogleAccessToken(true);
      const folderId = String(companySettings.googleDriveFolderId || '').trim();
      const queryParts = [
        "(name contains 'aiflex-erp-backup-' or name contains 'smart-accountant-backup-')",
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
    setGoogleDriveStatus({ isConnected: false });
  }, [currentCompanyId]);

  useEffect(() => {
    if (!currentCompanyId || workspaceHydratedForCompanyId !== currentCompanyId) return;
    if (!companySettings.autoBackupEnabled) return;
    if (String(companySettings.autoBackupPassword || '').trim().length < MIN_BACKUP_PASSWORD_LENGTH) return;

    let cancelled = false;
    const frequencyMs = companySettings.autoBackupFrequency === 'HOURLY'
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const runIfDue = async () => {
      if (cancelled || autoBackupInFlightRef.current) return;
      const lastRunAt = Date.parse(String(companySettings.autoBackupLastRunAt || ''));
      const due = !Number.isFinite(lastRunAt) || (Date.now() - lastRunAt) >= frequencyMs;
      if (!due) return;
      const result = await runAutoBackupCycle(false);
      if (result.ok === false) {
        appendAuditLog({
          entityType: 'backup',
          action: 'AUTO_EXPORT_REJECTED',
          screen: 'Settings > Backup',
          metadata: { reason: result.message }
        });
      }
    };

    void runIfDue();
    const timer = window.setInterval(() => {
      void runIfDue();
    }, 60 * 1000);

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
    companySettings.autoBackupKeepCount
  ]);

  return (
    <AccountingContext.Provider value={{
      currentUser, setCurrentUser, logout,
      companies, currentCompanyId, currentCompany, trialDaysLeft, switchCompany, createCompany, updateCompanyProfile,
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
      {children}
    </AccountingContext.Provider>
  );
};

export default useAccounting;
