
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER' // For Journal Entries
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type MutationResult =
  | { ok: true }
  | { ok: false; code: 'POSTED_LOCKED' | 'PERMISSION_DENIED' | 'VALIDATION_ERROR' | 'SUBSCRIPTION_LIMIT'; message: string };

export type PermissionAction = 'VIEW' | 'ADD' | 'EDIT' | 'DELETE' | 'POST' | 'PRINT' | 'REVERSE';
export type PermissionModule =
  | 'DASHBOARD'
  | 'TREASURY'
  | 'VOUCHERS'
  | 'SALES'
  | 'PURCHASES'
  | 'JOURNAL'
  | 'REPORTS'
  | 'DIRECTORY'
  | 'ACCOUNTS'
  | 'PRODUCTS'
  | 'HR'
  | 'SETTLEMENTS'
  | 'BANK_RECON'
  | 'SETTINGS'
  | 'FIXED_ASSETS';

export interface PermissionMatrix {
  modules: Record<PermissionModule, Record<PermissionAction, boolean>>;
  userOverrides?: Record<string, Partial<Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>>>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  entityType: string;
  entityId?: string;
  action: string;
  screen?: string;
  device?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface BackupPayloadV1 {
  version: 1;
  createdAt: string;
  salt: string;
  iv: string;
  cipherText: string;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  iterations: number;
}

export interface BankMatchSuggestion {
  id: string;
  transactionId: string;
  confidence: number;
  reason: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  balance: number;
  parentId?: string;
  isGroup?: boolean;
  currency: string; // Made explicit as a required field for multi-currency handling
}

export interface Currency {
  id?: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

export interface UnitOfMeasure {
  id: string;
  name: string;
  code: string; // e.g., PCS, KG, CTN
  baseUnitId?: string; // For future conversion logic (e.g., Carton = 12 PCS)
  conversionFactor?: number;
}

export interface Transaction {
  id: string;
  voucherId?: string;
  amount: number;
  description: string;
  category: string;
  type: TransactionType;
  date: string;
  invoiceId?: string;
  debitAccountId?: string;
  creditAccountId?: string;
  contactId?: string;
  employeeId?: string;
  assetId?: string; // New field for linking to fixed assets
  checkId?: string; // Link to Check Record
  currency: string;
  exchangeRate: number;
  status?: 'DRAFT' | 'POSTED';
  reversalOfId?: string;
  reversedById?: string;
  isReversal?: boolean;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  icon: string;
}

export interface ItemGroup {
  id: string;
  name: string;
  icon: string;
  parentId?: string;
}

export type ProductKind = 'STOCK' | 'SERVICE';
export type ItemCodeMode = 'AUTO' | 'MANUAL';

export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'PARTNER' | 'EMPLOYEE';
export type ContactPreferredPriceTier = 'RETAIL' | 'WHOLESALE';

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  phone?: string;
  address?: string;
  preferredPriceTier?: ContactPreferredPriceTier;
  linkedAccountId?: string;
  currentAccountId?: string;
  capitalAccountId?: string;
}

// HR Types
export interface Department {
  id: string;
  name: string;
  managerId?: string;
}

export interface Employee {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  position: string;
  hireDate: string;
  salaryType: 'FIXED' | 'HOURLY'; // Added this field
  payBasis?: EmployeePayBasis;
  basicSalary: number;
  dailyWorkHours: number;
  hourlyRate: number;
  dailyRate?: number;
  weeklyRate?: number;
  commissionRatePercent?: number;
  overtimeHourlyRate: number; // Added separate field
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  annualLeaveEntitlementDays?: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  bankAccount?: string;
  bankName?: string;
  iban?: string;
  phone?: string;
  employmentEndDate?: string;
}

export type EmployeePayBasis =
  | 'FIXED_MONTHLY'
  | 'MONTHLY_PRORATED'
  | 'MONTHLY_BY_HOURS'
  | 'DAILY'
  | 'WEEKLY'
  | 'HOURLY'
  | 'COMMISSION';

export interface EmployeeSalarySnapshot {
  salaryType: 'FIXED' | 'HOURLY';
  payBasis?: EmployeePayBasis;
  basicSalary: number;
  dailyWorkHours: number;
  hourlyRate: number;
  dailyRate?: number;
  weeklyRate?: number;
  commissionRatePercent?: number;
  overtimeHourlyRate: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
}

export interface EmployeeContract extends EmployeeSalarySnapshot {
  id: string;
  employeeId: string;
  contractType: 'FIXED_TERM' | 'OPEN_ENDED';
  startDate: string;
  endDate?: string;
  status: 'ACTIVE' | 'CLOSED';
  title?: string;
  notes?: string;
  annualLeaveEntitlementDays?: number;
  createdAt: string;
}

export interface SalaryHistoryEntry {
  id: string;
  employeeId: string;
  contractId?: string;
  date: string;
  source: 'EMPLOYEE_FORM' | 'CONTRACT';
  action: 'EMPLOYEE_CREATED' | 'SALARY_CHANGED' | 'CONTRACT_ADDED';
  before?: EmployeeSalarySnapshot;
  after: EmployeeSalarySnapshot;
  note?: string;
}

export type LeaveRequestType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PayrollPostedReference {
  periodStart: string;
  periodEnd: string;
  postedAt: string;
  amount?: number;
  transactionIds?: string[];
}

export interface EmployeeLeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveRequestType;
  status: LeaveRequestStatus;
  effectiveFrom: string;
  effectiveTo: string;
  days: number;
  note?: string;
  deductFromPayroll?: boolean; // Optional payroll linkage (e.g. unpaid leave)
  deductionAccountId?: string;
  createdAt: string;
  decisionAt?: string;
  postedReferences?: PayrollPostedReference[];
}

export type RecurringDeductionType = 'ADVANCE' | 'LOAN' | 'INSURANCE' | 'SUBSCRIPTION' | 'OTHER';
export type RecurringDeductionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface EmployeeRecurringDeduction {
  id: string;
  employeeId: string;
  type: RecurringDeductionType;
  status: RecurringDeductionStatus;
  label: string;
  amount: number;
  accountId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  installmentsTotal?: number;
  installmentsApplied?: number;
  notes?: string;
  createdAt: string;
  postedReferences?: PayrollPostedReference[];
}

export type FingerprintDeviceVendor = 'ZKTECO' | 'ANVIZ' | 'SUPREMA' | 'OTHER';
export type FingerprintDeviceMode = 'DIRECT' | 'MANUAL';
export type FingerprintDeviceProtocol = 'TCP' | 'UDP' | 'HTTP' | 'FILE';

export interface FingerprintReaderDevice {
  id: string;
  name: string;
  vendor: FingerprintDeviceVendor;
  mode: FingerprintDeviceMode;
  protocol: FingerprintDeviceProtocol;
  model?: string;
  serialNumber?: string;
  host?: string;
  port?: number;
  localAgentUrl?: string;
  location?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  lastSyncAt?: string;
}

export type FingerprintPunchType = 'IN' | 'OUT' | 'UNKNOWN';
export type FingerprintBatchSource = 'DIRECT_SYNC' | 'MANUAL_UPLOAD';

export interface FingerprintAttendanceEntry {
  id: string;
  deviceId?: string;
  employeeCode?: string;
  employeeName?: string;
  punchAt: string; // ISO date-time
  punchType: FingerprintPunchType;
  source: FingerprintBatchSource;
  raw?: Record<string, unknown>;
}

export interface FingerprintAttendanceBatch {
  id: string;
  deviceId?: string;
  fileName?: string;
  source: FingerprintBatchSource;
  importedAt: string;
  status: 'STAGED' | 'APPLIED';
  rows: FingerprintAttendanceEntry[];
}

export interface Product {
  id: string;
  name: string;
  kind?: ProductKind;
  category?: string;
  buyPrice: number;
  sellPrice: number;
  wholesalePrice?: number;
  retailPrice?: number;
  wholesalePricingMode?: 'FIXED' | 'MARKUP';
  retailPricingMode?: 'FIXED' | 'MARKUP';
  wholesaleMarkupPercent?: number;
  retailMarkupPercent?: number;
  stock: number;
  barcode?: string;
  itemCode?: string;
  itemCodeMode?: ItemCodeMode;
  expiryPeriodDays?: number;
  expiryAlertLeadDays?: number; // Per-item warning threshold (days before expiry)
  lowStockAlertQty?: number; // Per-item low stock warning threshold (quantity)
  reorderQty?: number; // Suggested reorder quantity when stock reaches threshold
  expiryDate?: string;
  imageUrl?: string;
  unitId?: string; // Linked Unit
  fifoLayers?: ProductFifoLayer[];
}

export interface InvoiceItem {
  id: string;
  productId?: string;
  accountId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  returned?: boolean; // Added field to track returns
  width?: number; // For m2 calculations
  length?: number; // For m2 calculations
}

export type PartnerInvoiceMode = 'DIRECT_DRAWINGS' | 'AR_THEN_TRANSFER';
export type InvoiceTaxMode = 'NONE' | 'EXCLUSIVE' | 'INCLUSIVE';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  linkedInvoiceId?: string;
  type: TransactionType;
  category?: string; // Added to distinguish Purchase Invoice vs General Expense
  date: string;
  dueDate?: string;
  items: InvoiceItem[];
  subTotal: number;
  taxRate: number;
  taxAmount: number;
  taxMode?: InvoiceTaxMode;
  discountAmount: number;
  totalAmount: number;
  status: 'PAID' | 'PENDING' | 'CANCELLED' | 'QUOTATION';
  postingStatus?: 'DRAFT' | 'POSTED';
  paymentType: 'CASH' | 'CREDIT';
  paymentAccountId?: string;
  isPartnerDrawings?: boolean;
  partnerDrawingsMode?: PartnerInvoiceMode;
  notes?: string;
  currency: string;
  exchangeRate: number;
  warehouseId?: string; // Link invoice to a specific warehouse
  reversalOfId?: string;
  reversedById?: string;
  isReversal?: boolean;
}

export interface InvoiceSettlement {
  id: string;
  invoiceId: string;
  voucherId: string;
  contactId?: string;
  date: string;
  amount: number; // Entered amount in voucher currency
  amountBase: number; // Base-currency amount for consistent aging/open balance calculations
  currency: string;
  exchangeRate: number;
  sourceType: 'VOUCHER_RECEIPT' | 'VOUCHER_PAYMENT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  note?: string;
}

export type ImportExpenseDistributionMethod = 'VALUE' | 'QUANTITY' | 'MANUAL';

export interface ImportExpenseDistributionLine {
  id: string;
  purchaseInvoiceId: string;
  purchaseInvoiceNumber: string;
  purchaseInvoiceDate: string;
  invoiceItemId: string;
  productId?: string;
  description: string;
  quantity: number;
  directLineAmountBase: number;
  allocatedAmountBase: number;
  landedLineAmountBase: number;
  unitCostBeforeBase?: number;
  unitCostAfterBase?: number;
  suggestedWholesalePrice?: number;
  suggestedRetailPrice?: number;
}

export interface ImportExpenseDistribution {
  id: string;
  date: string;
  totalAmountBase: number;
  currency: string;
  exchangeRate: number;
  method: ImportExpenseDistributionMethod;
  contactId?: string;
  description?: string;
  purchaseInvoiceIds: string[];
  journalCategory?: string;
  lines: ImportExpenseDistributionLine[];
}

// --- WAREHOUSE MODULE TYPES ---

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  manager?: string;
  isMain?: boolean; // Indicate if this is the default/main warehouse
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  items: {
    productId: string;
    quantity: number;
    description?: string;
  }[];
  notes?: string;
  status: 'DRAFT' | 'POSTED';
}

export interface Product {
  id: string;
  name: string;
  kind?: ProductKind;
  category?: string;
  buyPrice: number;
  sellPrice: number;
  wholesalePrice?: number;
  retailPrice?: number;
  wholesalePricingMode?: 'FIXED' | 'MARKUP';
  retailPricingMode?: 'FIXED' | 'MARKUP';
  wholesaleMarkupPercent?: number;
  retailMarkupPercent?: number;
  stock: number; // Global Total Stock
  warehouseStock?: { warehouseId: string; quantity: number }[]; // Breakdown by warehouse
  barcode?: string;
  itemCode?: string;
  itemCodeMode?: ItemCodeMode;
  expiryPeriodDays?: number;
  expiryAlertLeadDays?: number;
  lowStockAlertQty?: number;
  reorderQty?: number;
  expiryDate?: string;
  imageUrl?: string;
  unitId?: string;
  fifoLayers?: ProductFifoLayer[];
}
export interface ProductFifoLayer {
  qty: number;
  unitCost: number;
}

export type InventoryValuationMethod = 'STANDARD' | 'AVERAGE' | 'FIFO';
export interface FixedAssetGroup {
  id: string;
  name: string;
  defaultUsefulLife: number;
  depreciationRate?: number;
  description?: string;
  assetAccountId?: string;
  accumulatedDepreciationAccountId?: string;
  depreciationExpenseAccountId?: string;
}

export interface FixedAsset {
  id: string;
  name: string;
  groupId?: string;
  purchaseDate: string;
  cost: number;
  salvageValue: number;
  lifeInYears: number;
  description?: string;
  status: 'ACTIVE' | 'SOLD' | 'DISPOSED';
  disposalDate?: string;
  disposalPrice?: number;
}

export interface CompanySettings {
  name: string;
  taxNumber: string;
  address: string;
  phone: string;
  logoUrl?: string;
  importantAccountIds?: string[];
  defaultTaxRate: number;
  annualLeaveDefaultOpenEndedDays: number;
  annualLeaveDefaultFixedTermDays: number;
  leaveAccrualPolicy: 'ANNUAL' | 'MONTHLY';
  monthlyLeaveAccrualDays: number;
  lowStockAlertQtyDefault: number;
  showTaxInInvoices: boolean;
  hidePurchaseTax: boolean;
  hideSalesTax: boolean;

  // Other options
  biometricLoginEnabled: boolean;
  notifyAfterAmountAdded: boolean;
  alertsDesktopNotificationsEnabled: boolean;
  alertsDesktopNotifySystem: boolean;
  alertsDesktopNotifyManual: boolean;
  alertsDesktopNotifyChecks: boolean;
  alertsDesktopNotifyLowStock: boolean;
  alertsDesktopNotifyExpiry: boolean;
  alertsDesktopNotifyOverdueInvoices: boolean;
  alertsDesktopNotifyContractExpiry: boolean;
  alertsSoundEnabled: boolean;
  allowNegativeSalesQuantity: boolean;
  allowNegativeStock: boolean;
  allowEditEntryDate: boolean;
  journalDateLockEnabled: boolean;
  journalDateLockFrom?: string;
  journalDateLockTo?: string;
  inventoryValuationMethod?: InventoryValuationMethod;
  useAverageCosting: boolean;
  voucherInvoiceAllocationEnabled: boolean;
  autoAddItemPriceInInvoice: boolean;
  updateSalesPriceOnInvoiceEntry: boolean;
  barcodeEnabled: boolean;
  invoiceExpiryDateEnabled: boolean;
  reportYearCloseEnabled: boolean;
  strictPostedLockEnabled: boolean;
  showFiscalCloseBadgeInReports: boolean;
  autoFiscalYearCloseEntries: boolean;
  autoFiscalYearOpeningEntries: boolean;

  // Print options
  printPersonalData: boolean;
  printElectronicInvoice: boolean;
  printItemBarcodeInInvoice: boolean;
  printStatementAllCurrencies: boolean;
  statementDateAscending: boolean;
  statementFooterNote: string;
  invoiceFooterNote: string;
  headerTopLines: number;
  debitLabel: string;
  creditLabel: string;
  showAccountBalanceUnderVoucher: boolean;
  dottedNumbers: boolean;
  hideVoucherColumnInStatement: boolean;
  printExpiryDate: boolean;

  // Backup options
  autoBackupEnabled: boolean;
  autoBackupFrequency: 'INSTANT' | 'HOURLY' | 'DAILY';
  autoBackupPassword: string;
  autoBackupKeepCount: number;
  autoBackupLastRunAt?: string;
  googleDriveAutoUpload: boolean;
  googleDriveClientId: string;
  googleDriveFolderId: string;

  darkModeEnabled: boolean;
  language: 'AR' | 'EN';

  // Server-saved states to replace local storage
  equityPartnersState?: {
    partnerMeta?: any;
    profitDocs?: any[];
    settlementDocs?: any[];
  };
  alertsState?: {
    manualAlerts?: any[];
    notifiedAlertIds?: string[];
  };
  expenseLinePresetsState?: {
    presets?: any[];
  };
  hrState?: {
    payrollRuns?: any[];
    attendanceLog?: any;
  };
  importTemplatesState?: {
    templates?: any[];
  };
}

export type CompanySubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
export type CompanySubscriptionPlan = 'NONE' | 'TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE';
export type CloudSubscriptionCodeStatus = 'AVAILABLE' | 'USED' | 'CANCELLED' | 'EXPIRED';
export type WorkspaceOfferCodeStatus = 'AVAILABLE' | 'USED' | 'CANCELLED' | 'EXPIRED';
export type WorkspaceOfferCodeKind = 'DISCOUNT_PERCENT' | 'FREE_DAYS' | 'LIFETIME';
export type SubscriptionBillingCycle = 'YEARLY';
export type SubscriptionProvider = 'NONE' | 'TRIAL' | 'MANUAL' | 'PALPAY' | 'APPLE' | 'GOOGLE' | 'PADDLE';
export type SubscriptionCheckoutProvider = 'PALPAY' | 'APPLE' | 'GOOGLE' | 'PADDLE';
export type SubscriptionCheckoutMode = 'EXTERNAL_URL' | 'STORE_PRODUCT';

export interface SubscriptionDeviceBinding {
  deviceId: string;
  label: string;
  platform?: string;
  userAgent?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastUserId?: string;
  lastUserEmail?: string;
}

export interface CloudCompanySubscription {
  companyId: string;
  companyName?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  status: CompanySubscriptionStatus;
  plan: CompanySubscriptionPlan;
  startsAt?: string;
  endsAt?: string;
  graceDays: number;
  activationCode?: string;
  maxDevices: number;
  source: 'TRIAL' | 'MANUAL' | 'ACTIVATION_CODE' | 'CLOUD_SYNC';
  updatedAt: string;
  updatedByUserId?: string;
  updatedByEmail?: string;
  boundDevices: SubscriptionDeviceBinding[];
  reservedCompanyId?: string;
  reservedCompanyName?: string;
  notes?: string;
}

export interface CloudSubscriptionCode {
  code: string;
  status: CloudSubscriptionCodeStatus;
  plan: CompanySubscriptionPlan;
  durationDays: number;
  maxDevices: number;
  createdAt: string;
  createdByUserId?: string;
  createdByEmail?: string;
  expiresAt?: string;
  notes?: string;
  reservedCompanyId?: string;
  reservedCompanyName?: string;
  usedAt?: string;
  usedByCompanyId?: string;
  usedByCompanyName?: string;
  usedByDeviceId?: string;
  usedByUserId?: string;
  usedByEmail?: string;
}

export interface WorkspaceOfferCode {
  code: string;
  status: WorkspaceOfferCodeStatus;
  kind: WorkspaceOfferCodeKind;
  discountPercent?: number;
  freeDays?: number;
  companyCount?: number;
  createdAt: string;
  createdByUserId?: string;
  createdByEmail?: string;
  expiresAt?: string;
  notes?: string;
  usedAt?: string;
  usedByUserId?: string;
  usedByEmail?: string;
}

export interface WorkspaceSubscriptionAccount {
  userId: string;
  userEmail?: string;
  status: CompanySubscriptionStatus;
  plan: CompanySubscriptionPlan;
  billingCycle: SubscriptionBillingCycle;
  provider: SubscriptionProvider;
  includedCompanies: number;
  extraCompanyCount: number;
  maxCompanies: number;
  currency: 'USD';
  basePriceUsd: number;
  extraCompanyPriceUsd: number;
  startedAt: string;
  renewalDate?: string;
  expiresAt?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerProductId?: string;
  lastCheckoutSessionId?: string;
  discountPercent?: number;
  offerCode?: string;
  offerNote?: string;
  lifetimeAccess?: boolean;
  unlimitedCompanies?: boolean;
  updatedAt: string;
}

export interface SubscriptionProviderAvailability {
  palpayReady: boolean;
  appleReady: boolean;
  googleReady: boolean;
  paddleReady: boolean;
}

export interface WorkspaceSubscriptionQuote {
  plan: CompanySubscriptionPlan;
  billingCycle: SubscriptionBillingCycle;
  provider: SubscriptionCheckoutProvider;
  desiredCompanyCount: number;
  includedCompanies: number;
  extraCompanyCount: number;
  maxCompanies: number;
  currency: 'USD';
  basePriceUsd: number;
  extraCompanyPriceUsd: number;
  subtotalPriceUsd: number;
  discountPercent: number;
  discountAmountUsd: number;
  totalPriceUsd: number;
  providerReady: boolean;
  checkoutMode?: SubscriptionCheckoutMode;
  checkoutUrl?: string;
  productId?: string;
  offerCode?: string;
}

export type SubscriptionCheckoutResult =
  | {
    ok: true;
    provider: SubscriptionCheckoutProvider;
    mode: SubscriptionCheckoutMode;
    message: string;
    url?: string;
    productId?: string;
  }
  | {
    ok: false;
    code: 'VALIDATION_ERROR' | 'NOT_CONFIGURED';
    message: string;
  };

export type SubscriptionCodeIssueResult =
  | { ok: true; code: string }
  | { ok: false; code: 'PERMISSION_DENIED' | 'VALIDATION_ERROR'; message: string };

export interface CompanyProfile {
  id: string;
  name: string;
  taxNumber?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  createdAt: string;
  trialEndsAt: string;
   subscriptionStatus: CompanySubscriptionStatus;
   subscriptionPlan: CompanySubscriptionPlan;
   subscriptionStartsAt?: string;
   subscriptionEndsAt?: string;
   activationCode?: string;
   graceDays?: number;
}

export interface CreateCompanyInput {
  name: string;
  taxNumber?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  subscriptionStatus?: CompanySubscriptionStatus;
  subscriptionPlan?: CompanySubscriptionPlan;
  subscriptionStartsAt?: string;
  subscriptionEndsAt?: string;
  activationCode?: string;
  graceDays?: number;
}

export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';
export type CompanyMembershipStatus = 'ACTIVE' | 'INACTIVE';

export interface CompanyMembership {
  id: string;
  userId: string;
  companyId: string;
  role: UserRole;
  status: CompanyMembershipStatus;
  createdAt: string;
  company?: CompanyProfile | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  role: UserRole;
  companyId?: string; // Currently selected company for this session
  status: 'ACTIVE' | 'INACTIVE';
  lastActive?: string;
  guestTrialStartedAt?: string;
  guestTrialEndsAt?: string;
  accountCode?: string;
  password?: string;
}

export interface GoogleDriveStatus {
  isConnected: boolean;
  userEmail?: string;
  lastBackupId?: string;
  lastBackupTime?: Date;
  connectedAt?: Date;
  isBusy?: boolean;
  lastError?: string;
}

export type CheckType = 'INCOMING' | 'OUTGOING';
export type CheckStatus = 'PENDING' | 'UNDER_COLLECTION' | 'CLEARED' | 'BOUNCED' | 'ENDORSED' | 'CANCELLED';

export interface Check {
  id: string;
  checkId?: string;
  checkNumber: string;
  bankName: string;
  accountNumber?: string; // New field for account number
  bankAccountId?: string; // Added: Link to internal bank account for outgoing checks
  amount: number;
  currency: string;
  dueDate: string;
  issueDate: string;
  type: CheckType;
  status: CheckStatus;
  depositedBankId?: string; // NEW: Track which bank the check is deposited in (if under collection)
  contactId?: string; // The person we initially got it from or gave it to
  originalContactId?: string; // Explicitly tracking original source for incoming checks
  endorseeContactId?: string; // For endorsed checks
  imageUrl?: string; // Legacy single-image field (kept for backward compatibility)
  imageUrls?: string[]; // Optional attached check images (max 2)
  description?: string;
  endorseeName?: string;
  bounceSettlementStatus?: 'UNPAID' | 'PAID'; // For bounced checks: was the bounced amount later settled?
  bounceSettlementDate?: string;
  bounceSettlementNote?: string;
}

export type TicketStatus = 'NEW' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SupportTicket {
  id: string;
  contactId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
}

// --- MANUFACTURING MODULE TYPES ---

export interface BOMComponent {
  id: string;
  productId: string; // Raw Material
  quantity: number;
  unitCost?: number; // Snapshot of cost at time of definition or dynamic
}

export interface BillOfMaterial {
  id: string;
  name: string;
  productId: string; // Finished Good
  outputQuantity: number;
  components: BOMComponent[];
  laborCost: number;
  overheadCost: number;
  status: 'ACTIVE' | 'ARCHIVED';
  notes?: string;
}

export type ProductionOrderStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  bomId: string;
  productId: string; // Redundant but useful for queries
  plannedQuantity: number;
  completedQuantity: number;
  status: ProductionOrderStatus;
  startDate: string;
  endDate?: string;
  notes?: string;
  laborCost?: number; // Actual/Estimated
  overheadCost?: number; // Actual/Estimated
  rawMaterialsCost?: number; // Calculated from components
  totalCost?: number;
}
