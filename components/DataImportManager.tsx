import React, { useEffect, useMemo, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import * as XLSX from 'xlsx';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { Account, Contact, Invoice, InvoiceItem, Product, TransactionType } from '../types';
import { openAppNavigation, type AppNavigationTarget } from '../utils/appNavigation';
import { areEntityNamesSimilar, buildSuggestedUniqueEntityName, normalizeEntityNameKey } from '../utils/entityNameMatching';
import { normalizeItemCode } from '../utils/itemCode';

type ImportEntity = 'CONTACTS' | 'PRODUCTS' | 'TRANSACTIONS' | 'INVOICES' | 'ACCOUNTS';
type ImportMode = 'IMPORT' | 'DRY_RUN';
type BackupImportScope =
  | 'ALL_DATA'
  | 'MASTER_DATA'
  | 'CUSTOMERS_ONLY'
  | 'CUSTOMERS_WITH_BALANCES'
  | 'CONTACTS_ONLY'
  | 'ACCOUNTS_ONLY'
  | 'ACCOUNTS_WITH_BALANCES'
  | 'PRODUCTS_ONLY'
  | 'MOVEMENTS_ONLY'
  | 'TRANSACTIONS_ONLY'
  | 'INVOICES_ONLY';
type Row = Record<string, unknown> & { __rowNumber?: number };
type ColumnMap = Partial<Record<string, string>>;
type ColumnMapTemplate = {
  id: string;
  name: string;
  entity: ImportEntity;
  columnMap: ColumnMap;
  updatedAt: string;
};
type ImportSummary = {
  mode: ImportMode;
  totalRows: number;
  success: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
};
type BackupCandidate = {
  id: string;
  sourceLabel: string;
  rows: Row[];
  headers: string[];
  rowCount: number;
  inferredEntity: ImportEntity;
  confidence: number;
  reason: string;
  suggestedColumnMap: ColumnMap;
  aiEntity?: ImportEntity;
  aiConfidence?: number;
  aiReason?: string;
  aiColumnMap?: ColumnMap;
  recommended?: boolean;
  score?: number;
};
type BackupAnalysisSource = {
  sourceLabel: string;
  rows: Row[];
  headers: string[];
};
type SqliteTableDataset = {
  tableName: string;
  rows: Row[];
  headers: string[];
  objectRows: Record<string, unknown>[];
};
type SqliteAnalysisResult = {
  candidates: BackupAnalysisSource[];
  tableCount: number;
  analysisHint?: string;
};
type PreparedImportTask = {
  id: string;
  entity: ImportEntity;
  sourceLabel: string;
  rows: Row[];
  headers: string[];
  columnMap: ColumnMap;
  options?: {
    customersOnly?: boolean;
    importOpeningBalances?: boolean;
    balancesOnly?: boolean;
    skipInvoiceDerivedTransactions?: boolean;
  };
};
type ReviewableImportEntity = 'CONTACTS' | 'PRODUCTS' | 'ACCOUNTS';
type PreparedImportReviewDecision = 'AUTO' | 'MERGE' | 'CREATE' | 'SKIP';
type PreparedImportChoiceOption = {
  id: string;
  label: string;
};
type PreparedImportReviewItem = {
  id: string;
  taskId: string;
  entity: ReviewableImportEntity;
  sourceLabel: string;
  rowNumber: number;
  title: string;
  subtitle?: string;
  preview: string[];
  autoMatchId?: string;
  autoMatchLabel?: string;
  similarMatchLabel?: string;
  targetOptions: PreparedImportChoiceOption[];
  parentOptions?: PreparedImportChoiceOption[];
  suggestedParentId?: string;
  postingAccountOptions?: PreparedImportChoiceOption[];
  suggestedPostingAccountId?: string;
};
type PreparedImportReviewSelection = {
  decision: PreparedImportReviewDecision;
  targetId?: string;
  parentId?: string;
  postingAccountId?: string;
};
type PreparedImportReview = {
  mode: ImportMode;
  scopeLabel: string;
  tasks: PreparedImportTask[];
  items: PreparedImportReviewItem[];
};
type PendingBackupPhase = {
  remainingTasks: PreparedImportTask[];
  aggregate: ImportSummary;
  finalScopeLabel: string;
  reviewActions: PostImportReviewAction[];
  reviewContext?: ImportExecutionReviewContext;
};
type WorkingImportState = {
  accounts: Account[];
  contacts: Contact[];
  products: Product[];
  txKeys: Set<string>;
  invoiceKeys: Set<string>;
};
type PostImportReviewAction = {
  id: string;
  label: string;
  target: AppNavigationTarget;
};
type ImportExecutionReviewContext = {
  selections: Record<string, PreparedImportReviewSelection>;
  accountAliasById: Map<string, string>;
  accountAliasByCode: Map<string, string>;
  accountAliasByName: Map<string, string>;
  contactAliasById: Map<string, string>;
  contactAliasByPhone: Map<string, string>;
  contactAliasByName: Map<string, string>;
  productAliasById: Map<string, string>;
  productAliasByCode: Map<string, string>;
  productAliasByBarcode: Map<string, string>;
  productAliasByName: Map<string, string>;
};

const IMPORT_MAPPING_TEMPLATES_STORAGE_PREFIX = 'smart_accountant_import_mapping_templates_v1';
const BACKUP_ANALYSIS_ACCEPT_ATTR = '.json,.txt,.xlsx,.xls,.csv,.ods,.xlsb,.xml,.db,.sqlite,.sqlite3,.db3';
const DIRECT_IMPORT_ACCEPT_ATTR = '.xlsx,.xls,.csv,.ods,.xlsb,.xml';
const JSON_BACKUP_EXTENSIONS = ['.json', '.txt'];
const SPREADSHEET_BACKUP_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.ods', '.xlsb', '.xml'];
const SQLITE_BACKUP_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.db3'];

const TEMPLATES: Record<ImportEntity, string[]> = {
  CONTACTS: ['name', 'type', 'phone', 'address', 'openingBalance', 'openingDebit', 'openingCredit'],
  PRODUCTS: ['name', 'category', 'itemCode', 'barcode', 'buyPrice', 'sellPrice', 'stock', 'expiryPeriodDays', 'expiryDate'],
  TRANSACTIONS: ['date', 'amount', 'description', 'category', 'transactionType', 'debitAccountCode', 'creditAccountCode', 'currency', 'exchangeRate', 'status', 'contactName'],
  INVOICES: ['invoiceNumber', 'invoiceMode', 'date', 'contactName', 'phone', 'paymentType', 'currency', 'exchangeRate', 'taxRate', 'discountAmount', 'postingStatus', 'itemDescription', 'productName', 'quantity', 'unitPrice', 'lineTotal', 'accountCode'],
  ACCOUNTS: ['code', 'name', 'type', 'parentCode', 'parentName', 'currency', 'openingBalance', 'openingDebit', 'openingCredit', 'isGroup']
};

const BACKUP_FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'full_name', 'customer', 'customer_name', 'supplier', 'supplier_name', 'contact', 'contact_name', 'اسم', 'اسم_الصنف', 'اسم_العميل', 'اسم_المورد'],
  type: ['type', 'contact_type', 'partner_type', 'نوع', 'النوع'],
  phone: ['phone', 'mobile', 'cell', 'tel', 'الجوال', 'الهاتف', 'موبايل'],
  address: ['address', 'addr', 'location', 'العنوان'],
  category: ['category', 'group', 'class', 'الفئة', 'المجموعة'],
  itemCode: ['itemcode', 'item_code', 'code', 'sku', 'رمز_الصنف', 'رمز'],
  barcode: ['barcode', 'باركود', 'الباركود'],
  buyPrice: ['buyprice', 'buy_price', 'cost', 'costprice', 'purchase_price', 'سعر_الشراء', 'التكلفة'],
  sellPrice: ['sellprice', 'sell_price', 'sale_price', 'retail_price', 'سعر_البيع'],
  stock: ['stock', 'qty', 'quantity', 'onhand', 'balance_qty', 'المخزون', 'الكمية'],
  expiryPeriodDays: ['expiryperioddays', 'expiry_days', 'shelf_life_days', 'فترة_الصلاحية_بالأيام'],
  expiryDate: ['expirydate', 'exp_date', 'expiration_date', 'تاريخ_الانتهاء'],
  date: ['date', 'doc_date', 'invoice_date', 'entry_date', 'التاريخ'],
  amount: ['amount', 'value', 'net', 'المبلغ', 'القيمة'],
  description: ['description', 'memo', 'narration', 'remark', 'البيان', 'الوصف', 'ملاحظات'],
  transactionType: ['transactiontype', 'type', 'tx_type', 'نوع_الحركة'],
  debitAccountCode: ['debitaccountcode', 'debit_code', 'debitacc', 'حساب_مدين', 'رمز_الحساب_المدين'],
  creditAccountCode: ['creditaccountcode', 'credit_code', 'creditacc', 'حساب_دائن', 'رمز_الحساب_الدائن'],
  currency: ['currency', 'curr', 'العملة'],
  exchangeRate: ['exchangerate', 'fx_rate', 'rate', 'سعر_الصرف'],
  status: ['status', 'posting_status', 'الحالة'],
  contactName: ['contactname', 'partner_name', 'customer_name', 'supplier_name', 'اسم_الطرف', 'الطرف'],
  invoiceNumber: ['invoicenumber', 'invoice_no', 'no', 'number', 'doc_no', 'رقم_الفاتورة'],
  invoiceMode: ['invoicemode', 'invoice_type', 'doc_type', 'نوع_الفاتورة'],
  paymentType: ['paymenttype', 'payment_type', 'cash_credit', 'نوع_الدفع'],
  taxRate: ['taxrate', 'vat_rate', 'tax_percent', 'نسبة_الضريبة'],
  discountAmount: ['discountamount', 'discount', 'disc', 'الخصم'],
  postingStatus: ['postingstatus', 'post_status', 'حالة_الترحيل'],
  itemDescription: ['itemdescription', 'line_description', 'item_name', 'وصف_البند'],
  productName: ['productname', 'item_name', 'name', 'اسم_الصنف'],
  quantity: ['quantity', 'qty', 'الكمية'],
  unitPrice: ['unitprice', 'price', 'rate', 'سعر_الوحدة', 'السعر'],
  lineTotal: ['linetotal', 'line_total', 'total', 'row_total', 'إجمالي_السطر'],
  accountCode: ['accountcode', 'acc_code', 'expense_account', 'رمز_الحساب']
};

Object.assign(BACKUP_FIELD_ALIASES, {
  code: ['code', 'account_code', 'acc_code', 'ledger_code', 'رقم_الحساب', 'رمز_الحساب'],
  parentCode: ['parentcode', 'parent_code', 'parent_acc_code', 'main_account_code', 'رمز_الحساب_الأب'],
  parentName: ['parentname', 'parent_name', 'main_account_name', 'group_name', 'اسم_الحساب_الأب'],
  openingBalance: ['openingbalance', 'opening_balance', 'balance', 'start_balance', 'رصيد_افتتاحي', 'الرصيد_الافتتاحي'],
  openingDebit: ['openingdebit', 'opening_debit', 'initial_debit', 'debit_opening', 'مدين_افتتاحي'],
  openingCredit: ['openingcredit', 'opening_credit', 'initial_credit', 'credit_opening', 'دائن_افتتاحي'],
  isGroup: ['isgroup', 'group_account', 'header_account', 'is_parent', 'is_group', 'حساب_رئيسي', 'تجميعي']
});

Object.assign(BACKUP_FIELD_ALIASES, {
  phone: Array.from(new Set([...(BACKUP_FIELD_ALIASES.phone || []), 'gsm', 'mobile_no', 'phone1', 'phone2', 'cell_phone'])),
  name: Array.from(new Set([...(BACKUP_FIELD_ALIASES.name || []), 'client_name', 'vendor_name', 'cust_name', 'customer_title', 'supplier_title']))
});

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .replace(/[ظ -ظ©]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[غ°-غ¹]/g, d => String(d.charCodeAt(0) - 1776))
    .toLowerCase();

const keyNorm = (v: unknown) => normalize(v).replace(/[\s\-]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
const round2 = (value: number) => Number((Number(value) || 0).toFixed(2));
const n = (v: unknown, fallback = 0) => {
  const x = Number(normalize(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : fallback;
};

const isoDate = (v: unknown): string | null => {
  const raw = normalize(v);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const c = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (c) return `${c[3]}-${c[2]}-${c[1]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const v = (row: Row, ...aliases: string[]) => {
  for (const a of aliases) {
    const val = row[keyNorm(a)];
    if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  }
  return undefined;
};

const parseContactType = (value: unknown): Contact['type'] => {
  const s = keyNorm(value);
  if (s === 'supplier' || s === 'مورد') return 'SUPPLIER';
  if (s === 'partner' || s === 'sharik' || s === 'شريك') return 'PARTNER';
  if (s === 'employee' || s === 'موظف') return 'EMPLOYEE';
  return 'CUSTOMER';
};

const parseTxType = (value: unknown): TransactionType => {
  const s = keyNorm(value);
  if (['income', 'ايراد', 'إيراد'].includes(s)) return TransactionType.INCOME;
  if (['transfer', 'journal', 'تحويل', 'قيد'].includes(s)) return TransactionType.TRANSFER;
  return TransactionType.EXPENSE;
};

const parsePosting = (value: unknown): 'DRAFT' | 'POSTED' => {
  const normalized = keyNorm(value);
  if (['draft', 'pending', 'unposted', 'مسودة', 'معلقة', 'غير_مرحل', 'غير_مرحلة'].includes(normalized)) {
    return 'DRAFT';
  }
  return 'POSTED';
};

const parsePayType = (value: unknown): 'CASH' | 'CREDIT' => {
  const s = keyNorm(value);
  return ['credit', 'آجل', 'اجل'].includes(s) ? 'CREDIT' : 'CASH';
};

const parseInvoiceMode = (value: unknown) => {
  const s = keyNorm(value);
  if (['purchases', 'purchase', 'شراء', 'مشتريات'].includes(s)) return 'PURCHASES' as const;
  if (['expenses', 'expense', 'مصروف', 'مصاريف'].includes(s)) return 'EXPENSES' as const;
  if (['import_expenses', 'importexpenses', 'مصاريف_الاستيراد'].includes(s)) return 'IMPORT_EXPENSES' as const;
  if (['sales_return', 'salesreturn', 'مرتجع_المبيعات'].includes(s)) return 'SALES_RETURN' as const;
  if (['purchase_return', 'purchasereturn', 'مرتجع_المشتريات'].includes(s)) return 'PURCHASE_RETURN' as const;
  if (['quotation', 'quote', 'عرض_سعر'].includes(s)) return 'QUOTATION' as const;
  return 'SALES' as const;
};

const parseAccountType = (value: unknown): Account['type'] => {
  const s = keyNorm(value);
  if (['asset', 'assets', 'اصل', 'اصول', 'asset_account'].includes(s)) return 'ASSET';
  if (['liability', 'liabilities', 'خصم', 'خصوم', 'التزامات'].includes(s)) return 'LIABILITY';
  if (['equity', 'capital', 'حقوق_الملكية', 'راس_المال', 'حقوق'].includes(s)) return 'EQUITY';
  if (['revenue', 'income', 'sale', 'sales', 'ايراد', 'ايرادات'].includes(s)) return 'REVENUE';
  return 'EXPENSE';
};

const parseBooleanLike = (value: unknown) => {
  const s = keyNorm(value);
  if (!s) return undefined;
  if (['1', 'true', 'yes', 'y', 'group', 'header', 'main', 'رئيسي', 'تجميعي', 'نعم'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'detail', 'posting', 'فرعي', 'تفصيلي', 'لا'].includes(s)) return false;
  return undefined;
};

const isDebitNatureAccount = (type: Account['type']) => type === 'ASSET' || type === 'EXPENSE';

const sanitizeImportKey = (value: unknown) =>
  keyNorm(value).replace(/_+/g, '_').replace(/^_+|_+$/g, '');

const inferOpeningAmounts = (row: Row, accountType: Account['type']) => {
  const openingDebit = Math.max(0, n(v(row, 'openingDebit'), 0));
  const openingCredit = Math.max(0, n(v(row, 'openingCredit'), 0));
  if (openingDebit > 0 || openingCredit > 0) {
    const net = round2(openingDebit - openingCredit);
    if (Math.abs(net) <= 0.009) return { debit: 0, credit: 0 };
    return net > 0 ? { debit: net, credit: 0 } : { debit: 0, credit: Math.abs(net) };
  }

  const openingBalance = n(v(row, 'openingBalance'), 0);
  if (Math.abs(openingBalance) <= 0.009) return { debit: 0, credit: 0 };
  const amount = Math.abs(openingBalance);
  if (openingBalance > 0) {
    return isDebitNatureAccount(accountType) ? { debit: amount, credit: 0 } : { debit: 0, credit: amount };
  }
  return isDebitNatureAccount(accountType) ? { debit: 0, credit: amount } : { debit: amount, credit: 0 };
};

const downloadTemplate = (entity: ImportEntity) => {
  const headers = TEMPLATES[entity];
  const csv = headers.join(',') + '\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `template_${entity.toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const csvEscape = (value: unknown) => {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const autoMapColumns = (entity: ImportEntity, sourceHeaders: string[]): ColumnMap => {
  const mapped: ColumnMap = {};
  const normalizedHeaders = sourceHeaders.map(h => ({ raw: h, key: keyNorm(h) }));
  for (const target of TEMPLATES[entity]) {
    const found = normalizedHeaders.find(h => h.key === keyNorm(target));
    if (found) mapped[target] = found.raw;
  }
  return mapped;
};

const smartAutoMapColumns = (entity: ImportEntity, sourceHeaders: string[]): ColumnMap => {
  const exact = autoMapColumns(entity, sourceHeaders);
  const mapped: ColumnMap = { ...exact };
  const normalizedHeaders = sourceHeaders.map(h => ({ raw: h, key: keyNorm(h) }));

  for (const target of TEMPLATES[entity]) {
    if (mapped[target]) continue;
    const aliases = [target, ...(BACKUP_FIELD_ALIASES[target] || [])].map(a => keyNorm(a));
    const found = normalizedHeaders.find(h => aliases.includes(h.key));
    if (found) {
      mapped[target] = found.raw;
      continue;
    }
    const fuzzy = normalizedHeaders.find(h => aliases.some(alias => h.key.includes(alias) || alias.includes(h.key)));
    if (fuzzy) mapped[target] = fuzzy.raw;
  }
  return mapped;
};

const buildRowsFromObjects = (parsedRows: Record<string, unknown>[]) => {
  const rowObjects = parsedRows.filter(r => r && typeof r === 'object' && !Array.isArray(r));
  const headerSet = new Set<string>();
  rowObjects.slice(0, 50).forEach(r => Object.keys(r).forEach(k => headerSet.add(String(k))));
  const rawHeaders = [...headerSet];
  const normalized = rowObjects.map((r, i) => {
    const row: Row = { __rowNumber: i + 1 };
    Object.entries(r).forEach(([k, val]) => { row[keyNorm(k)] = val; });
    return row;
  });
  return { headers: rawHeaders, rows: normalized };
};

const normalizeSourceLabelKey = (sourceLabel: string) =>
  keyNorm(sourceLabel)
    .replace(/^sqlite_/, '')
    .replace(/^sheet_/, '')
    .replace(/^root_/, '');

const SOURCE_ENTITY_KEYWORDS: Record<ImportEntity, string[]> = {
  CONTACTS: ['customer', 'customers', 'client', 'clients', 'contact', 'contacts', 'supplier', 'suppliers', 'vendor', 'vendors', 'partner', 'partners', 'cust', 'cus'],
  PRODUCTS: ['product', 'products', 'item', 'items', 'inventory', 'stock', 'sku', 'barcode', 'warehouse'],
  TRANSACTIONS: ['transaction', 'transactions', 'journal', 'entry', 'entries', 'movement', 'movements', 'ledger', 'statement', 'voucher', 'payment', 'receipt', 'transfer'],
  INVOICES: ['invoice', 'invoices', 'sale', 'sales', 'purchase', 'purchases', 'bill', 'bills', 'quotation', 'quote', 'order', 'orders', 'inv'],
  ACCOUNTS: ['account', 'accounts', 'chart', 'coa', 'ledger_accounts', 'ledger_master']
};

const TECHNICAL_SOURCE_KEYWORDS = [
  'view',
  'tree',
  'type',
  'types',
  'lookup',
  'setting',
  'settings',
  'config',
  'meta',
  'history',
  'log',
  'logs',
  'version',
  'request',
  'req',
  'sync',
  'token',
  'permission',
  'role',
  'tmp',
  'temp'
];

const TECHNICAL_HEADER_PATTERNS = [
  /^f\d+$/,
  /^param\d+$/,
  /^_[a-z0-9_]+$/,
  /^[a-z]_id$/,
  /^t_[a-z0-9_]+_id$/,
  /^online(_ref\d+)?$/,
  /^user_reply$/,
  /^reply$/,
  /^imei$/,
  /^guid$/,
  /^token$/
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasKeyword = (value: string, keyword: string) =>
  new RegExp(`(^|_)${escapeRegExp(keyword)}(_|$)`).test(value);

const findHeaderByHeuristic = (
  headers: string[],
  patterns: RegExp[],
  preferredTokens: string[] = []
) => {
  const normalizedHeaders = headers.map(header => ({ raw: header, key: keyNorm(header) }));
  const preferred = normalizedHeaders.find(header =>
    patterns.some(pattern => pattern.test(header.key))
    && preferredTokens.some(token => header.key.includes(token))
  );
  if (preferred) return preferred.raw;
  return normalizedHeaders.find(header => patterns.some(pattern => pattern.test(header.key)))?.raw;
};

const enhanceColumnMapForCandidate = (
  entity: ImportEntity,
  sourceLabel: string,
  headers: string[],
  initialMap: ColumnMap
) => {
  const sourceKey = normalizeSourceLabelKey(sourceLabel);
  const map: ColumnMap = { ...initialMap };

  if (entity === 'CONTACTS') {
    if (!map.name) {
      map.name = findHeaderByHeuristic(
        headers,
        [/(^|_)(name|full_name|customer_name|supplier_name|client_name|vendor_name|cust_name|c_name|s_name|partner_name|contact_name)$/],
        sourceKey.includes('supplier') ? ['supplier', 'sup', 'vendor', 's_name'] : ['customer', 'cust', 'cus', 'client', 'c_name']
      );
    }
    if (!map.phone) {
      map.phone = findHeaderByHeuristic(headers, [/(^|_)(phone|mobile|gsm|cell|tel|whatsapp|mobile_no|phone1|phone2)$/]);
    }
  }

  if (entity === 'PRODUCTS' && !map.name) {
    map.name = findHeaderByHeuristic(headers, [/(^|_)(name|product_name|item_name|description|item_description|itemdescription)$/]);
  }

  if (entity === 'ACCOUNTS') {
    if (!map.code) {
      map.code = findHeaderByHeuristic(headers, [/(^|_)(code|account_code|acc_code|ledger_code|number)$/]);
    }
    if (!map.name) {
      map.name = findHeaderByHeuristic(headers, [/(^|_)(name|account_name|ledger_name)$/]);
    }
  }

  return map;
};

const countTechnicalHeaders = (headers: string[]) =>
  headers
    .map(header => keyNorm(header))
    .filter(key => TECHNICAL_HEADER_PATTERNS.some(pattern => pattern.test(key)))
    .length;

const analyzeCandidateDataset = (sourceLabel: string, headers: string[], rows: Row[]) => {
  const normalizedHeaders = headers.map(header => keyNorm(header));
  const sourceKey = normalizeSourceLabelKey(sourceLabel);
  let bestEntity: ImportEntity = 'CONTACTS';
  let bestScore = -1;
  let bestMatched = 0;
  let bestPossible = 1;
  let bestMap: ColumnMap = {};
  let bestSourceBoost = 0;
  let bestTechnicalPenalty = 0;

  (Object.keys(TEMPLATES) as ImportEntity[]).forEach((entity) => {
    const autoMap = smartAutoMapColumns(entity, headers);
    const map = enhanceColumnMapForCandidate(entity, sourceLabel, headers, autoMap);
    const matched = Object.values(map).filter(Boolean).length;
    const anchors = TEMPLATES[entity].filter(field => ['name', 'invoiceNumber', 'date', 'amount', 'itemCode', 'quantity', 'code', 'parentCode', 'phone'].includes(field));
    const anchorMatched = anchors.filter(anchor => Boolean(map[anchor])).length;
    const possible = Math.max(1, TEMPLATES[entity].length);
    let score = matched / possible;

    if (entity === 'INVOICES') {
      if (normalizedHeaders.some(header => /invoice|فاتوره|invoice_no/.test(header))) score += 0.35;
      if (normalizedHeaders.some(header => /quantity|qty|line|item/.test(header))) score += 0.15;
    }
    if (entity === 'TRANSACTIONS') {
      if (normalizedHeaders.some(header => /debit|credit|مدين|دائن/.test(header))) score += 0.35;
      if (normalizedHeaders.some(header => /amount|total|in|out|balance|مبلغ/.test(header))) score += 0.1;
    }
    if (entity === 'PRODUCTS') {
      if (normalizedHeaders.some(header => /barcode|sku|itemcode|product_code|رمز_الصنف/.test(header))) score += 0.25;
      if (normalizedHeaders.some(header => /stock|qty|quantity|price|cost|مخزون/.test(header))) score += 0.1;
    }
    if (entity === 'CONTACTS') {
      if (normalizedHeaders.some(header => /phone|mobile|gsm|tel|جوال|هاتف/.test(header))) score += 0.18;
      if (normalizedHeaders.some(header => /address|city|country|عنوان/.test(header))) score += 0.08;
    }
    if (entity === 'ACCOUNTS') {
      if (normalizedHeaders.some(header => /account|ledger|chart|code|رقم_الحساب|رمز_الحساب/.test(header))) score += 0.3;
      if (normalizedHeaders.some(header => /parent|group|main|الأب|رئيسي|تجميعي/.test(header))) score += 0.15;
      if (normalizedHeaders.some(header => /opening|balance|رصيد|افتتاح/.test(header))) score += 0.15;
    }

    let sourceBoost = 0;
    if (SOURCE_ENTITY_KEYWORDS[entity].some(keyword => hasKeyword(sourceKey, keyword))) {
      sourceBoost += entity === 'CONTACTS' || entity === 'PRODUCTS' ? 0.38 : 0.3;
    }
    if (entity === 'TRANSACTIONS' && /(^|_)(tr|trx|txn|statement|movement|journal|voucher)(_|$)/.test(sourceKey)) {
      sourceBoost += 0.28;
    }
    if (entity === 'INVOICES' && /(^|_)(inv|invoice|sale|sales|purchase|purchases|bill)(_|$)/.test(sourceKey)) {
      sourceBoost += 0.28;
    }
    score += sourceBoost;

    let technicalPenalty = 0;
    TECHNICAL_SOURCE_KEYWORDS.forEach(keyword => {
      if (hasKeyword(sourceKey, keyword)) technicalPenalty += keyword === 'view' || keyword === 'tree' ? 0.16 : 0.22;
    });
    const technicalHeaderRatio = headers.length > 0 ? countTechnicalHeaders(headers) / headers.length : 0;
    if (technicalHeaderRatio >= 0.35) technicalPenalty += 0.18;
    if (normalizedHeaders.some(header => /imei|token|user_reply|reply_from|reply/.test(header))) technicalPenalty += 0.18;
    score -= technicalPenalty;

    score += anchorMatched * 0.03;

    if (score > bestScore) {
      bestScore = score;
      bestEntity = entity;
      bestMatched = matched;
      bestPossible = possible;
      bestMap = map;
      bestSourceBoost = sourceBoost;
      bestTechnicalPenalty = technicalPenalty;
    }
  });

  const hasMinimumAnchor = (() => {
    if (bestEntity === 'CONTACTS') return Boolean(bestMap.name) && (Boolean(bestMap.phone) || bestSourceBoost >= 0.35);
    if (bestEntity === 'PRODUCTS') return Boolean(bestMap.name) && (Boolean(bestMap.itemCode) || Boolean(bestMap.barcode) || Boolean(bestMap.stock) || bestSourceBoost >= 0.35);
    if (bestEntity === 'ACCOUNTS') return Boolean(bestMap.code) && Boolean(bestMap.name);
    if (bestEntity === 'TRANSACTIONS') return Boolean(bestMap.date) && (Boolean(bestMap.amount) || Boolean(bestMap.debitAccountCode) || Boolean(bestMap.creditAccountCode));
    if (bestEntity === 'INVOICES') return (Boolean(bestMap.invoiceNumber) && Boolean(bestMap.date)) || (Boolean(bestMap.productName) && Boolean(bestMap.quantity));
    return false;
  })();

  const recommended = (
    (hasMinimumAnchor && bestScore >= 0.26)
    || bestMatched >= 4
    || (bestSourceBoost >= 0.35 && bestMatched >= 2 && bestTechnicalPenalty < 0.34)
  ) && !(
    rows.length <= 3
    && bestMatched < 3
  ) && !(
    bestTechnicalPenalty >= 0.34
    && bestMatched < 4
    && bestSourceBoost < 0.35
  ) && !(
    (hasKeyword(sourceKey, 'type') || hasKeyword(sourceKey, 'lookup'))
    && bestMatched < 4
  ) && !(
    (hasKeyword(sourceKey, 'view') || hasKeyword(sourceKey, 'tree'))
    && bestMatched < 3
  );

  const confidence = Math.min(99, Math.max(recommended ? 35 : 10, Math.round(bestScore * 100)));
  const reason = `Matched ${bestMatched}/${bestPossible} fields`;

  return {
    entity: bestEntity,
    confidence,
    reason,
    columnMap: bestMap,
    recommended,
    score: bestScore
  };
};

const isObjectArrayCandidate = (value: unknown): value is Record<string, unknown>[] => {
  return Array.isArray(value)
    && value.length > 0
    && value.some(v => v && typeof v === 'object' && !Array.isArray(v));
};

const collectJsonArrayCandidates = (
  value: unknown,
  path = 'root',
  out: Array<{ sourceLabel: string; rows: Row[]; headers: string[] }> = [],
  depth = 0
) => {
  if (depth > 6 || value == null) return out;

  if (isObjectArrayCandidate(value)) {
    const { rows, headers } = buildRowsFromObjects(value);
    if (rows.length > 0 && headers.length > 0) {
      out.push({ sourceLabel: path, rows, headers });
    }
    // Continue scanning a small sample for nested arrays.
    value.slice(0, 10).forEach((item, i) => collectJsonArrayCandidates(item, `${path}[${i}]`, out, depth + 1));
    return out;
  }

  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, i) => collectJsonArrayCandidates(item, `${path}[${i}]`, out, depth + 1));
    return out;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      collectJsonArrayCandidates(v, `${path}.${k}`, out, depth + 1);
    });
  }

  return out;
};

const inferEntityFromHeaders = (headers: string[]) => {
  const normalized = headers.map(h => keyNorm(h));
  let bestEntity: ImportEntity = 'CONTACTS';
  let bestScore = -1;
  let bestMatched = 0;
  let bestPossible = 1;

  (Object.keys(TEMPLATES) as ImportEntity[]).forEach((entity) => {
    const map = smartAutoMapColumns(entity, headers);
    const matched = Object.values(map).filter(Boolean).length;
    const anchors = TEMPLATES[entity].filter(f => ['name', 'invoiceNumber', 'date', 'amount', 'itemCode', 'quantity', 'code', 'parentCode'].includes(f));
    const anchorMatched = anchors.filter(a => Boolean(map[a])).length;
    const possible = Math.max(1, TEMPLATES[entity].length);
    let score = matched / possible;

    // Entity-specific boosts based on common fields
    if (entity === 'INVOICES') {
      if (normalized.some(h => /invoice|فاتورة|invoice_no|رقم_الفاتورة/.test(h))) score += 0.35;
      if (normalized.some(h => /quantity|qty|line|item/.test(h))) score += 0.15;
    }
    if (entity === 'TRANSACTIONS') {
      if (normalized.some(h => /debit|credit|مدين|دائن/.test(h))) score += 0.35;
      if (normalized.some(h => /amount|مبلغ/.test(h))) score += 0.1;
    }
    if (entity === 'PRODUCTS') {
      if (normalized.some(h => /barcode|sku|itemcode|رمز_الصنف|باركود/.test(h))) score += 0.25;
      if (normalized.some(h => /stock|qty|quantity|المخزون/.test(h))) score += 0.1;
    }
    if (entity === 'CONTACTS') {
      if (normalized.some(h => /phone|mobile|الجوال|الهاتف/.test(h))) score += 0.15;
      if (normalized.some(h => /address|العنوان/.test(h))) score += 0.1;
    }
    if (entity === 'ACCOUNTS') {
      if (normalized.some(h => /account|ledger|chart|code|رمز|رقم_الحساب/.test(h))) score += 0.3;
      if (normalized.some(h => /parent|group|main|الأب|رئيسي|تجميعي/.test(h))) score += 0.15;
      if (normalized.some(h => /opening|balance|رصيد|افتتاح/.test(h))) score += 0.15;
    }
    score += anchorMatched * 0.02;

    if (score > bestScore) {
      bestScore = score;
      bestEntity = entity;
      bestMatched = matched;
      bestPossible = possible;
    }
  });

  const confidence = Math.min(99, Math.max(10, Math.round(bestScore * 100)));
  const reason = `Matched ${bestMatched}/${bestPossible} fields`;
  return {
    entity: bestEntity,
    confidence,
    reason,
    columnMap: smartAutoMapColumns(bestEntity, headers)
  };
};

const extractJsonFromAiText = (text: string): string | null => {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
};

const extractGeminiApiKey = (): string => {
  const env = (import.meta as any)?.env ?? {};
  const processEnv = (globalThis as any)?.process?.env ?? {};
  const candidates = [
    env.VITE_GEMINI_API_KEY,
    env.GEMINI_API_KEY,
    env.VITE_API_KEY,
    env.API_KEY,
    processEnv.VITE_GEMINI_API_KEY,
    processEnv.GEMINI_API_KEY,
    processEnv.VITE_API_KEY,
    processEnv.API_KEY
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (!normalized) continue;
    if (/^placeholder/i.test(normalized)) continue;
    return normalized;
  }
  return '';
};

const fileHasOneOfExtensions = (fileName: string, extensions: string[]) => {
  const lowerName = String(fileName || '').toLowerCase();
  return extensions.some(extension => lowerName.endsWith(extension));
};

const escapeSqliteIdentifier = (identifier: string) => `"${String(identifier).replace(/"/g, '""')}"`;

const normalizeSqliteCellValue = (value: unknown) => {
  if (value instanceof Uint8Array) return `BLOB(${value.byteLength})`;
  return value;
};

const hasNormalizedHeaders = (headers: string[], expected: string[]) => {
  const normalizedHeaders = new Set(headers.map(header => keyNorm(header)));
  return expected.every(header => normalizedHeaders.has(keyNorm(header)));
};

const hasOneOfNormalizedHeaders = (headers: string[], candidates: string[]) => {
  const normalizedHeaders = new Set(headers.map(header => keyNorm(header)));
  return candidates.some(header => normalizedHeaders.has(keyNorm(header)));
};

const DataImportManager: React.FC = () => {
  const {
    companySettings,
    updateCompanySettings,
    currentCompanyId,
    baseCurrency,
    currencies,
    contacts,
    products,
    accounts,
    transactions,
    invoices,
    warehouses,
    addContact,
    updateContact,
    addProduct,
    updateProduct,
    addAccount,
    updateAccount,
    addTransaction,
    createInvoice
  } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const importedSuffixLabel = tr('مستورد', 'Imported');
  const isCommercialContactType = (type: Contact['type']) =>
    type === 'CUSTOMER' || type === 'SUPPLIER' || type === 'PARTNER';
  const findSimilarCommercialContact = (sourceContacts: Contact[], candidateName: string, excludeId?: string) =>
    sourceContacts.find(contact =>
      contact.id !== excludeId
      && isCommercialContactType(contact.type)
      && areEntityNamesSimilar(candidateName, contact.name)
    );
  const findSimilarProduct = (sourceProducts: Product[], candidateName: string, excludeId?: string) =>
    sourceProducts.find(product =>
      product.id !== excludeId
      && areEntityNamesSimilar(candidateName, product.name)
    );
  const legacySqliteOffsetAccountId = 'acc_import_legacy_customer_ledger_offset';
  const legacySqliteOffsetAccountCode = '39981';
  const buildSuggestedName = (candidateName: string, existingNames: Iterable<string>) =>
    buildSuggestedUniqueEntityName(candidateName, existingNames, importedSuffixLabel);
  const buildSimilarNameWarning = (
    sourceLabel: string,
    rowLabel: string,
    rowIdentifier: string | number,
    entityLabelAr: string,
    entityLabelEn: string,
    candidateName: string,
    existingName: string,
    suggestedName: string
  ) => `${sourceLabel}: ${rowLabel} ${rowIdentifier}: ${tr(
    `تنبيه: اسم ${entityLabelAr} "${candidateName}" مشابه للاسم الحالي "${existingName}". يُقترح تغييره إلى "${suggestedName}" لتجنب الالتباس.`,
    `Warning: ${entityLabelEn} name "${candidateName}" is similar to existing "${existingName}". Suggested rename: "${suggestedName}" to avoid confusion.`
  )}`;

  const [entity, setEntity] = useState<ImportEntity>('CONTACTS');
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [runningMode, setRunningMode] = useState<ImportMode | null>(null);
  const [mappingTemplateName, setMappingTemplateName] = useState('');
  const [savedMappingTemplates, setSavedMappingTemplates] = useState<ColumnMapTemplate[]>([]);
  const [selectedMappingTemplateId, setSelectedMappingTemplateId] = useState('');
  const [backupCandidates, setBackupCandidates] = useState<BackupCandidate[]>([]);
  const [backupFileName, setBackupFileName] = useState('');
  const [backupAnalysisLoading, setBackupAnalysisLoading] = useState(false);
  const [backupAnalysisError, setBackupAnalysisError] = useState('');
  const [backupAnalysisNote, setBackupAnalysisNote] = useState('');
  const [backupImportScope, setBackupImportScope] = useState<BackupImportScope>('ALL_DATA');
  const [pendingBackupPhase, setPendingBackupPhase] = useState<PendingBackupPhase | null>(null);
  const [preparedBackupReview, setPreparedBackupReview] = useState<PreparedImportReview | null>(null);
  const [preparedBackupTaskSelection, setPreparedBackupTaskSelection] = useState<Record<string, boolean>>({});
  const [preparedBackupItemSelections, setPreparedBackupItemSelections] = useState<Record<string, PreparedImportReviewSelection>>({});
  const [postImportReviewActions, setPostImportReviewActions] = useState<PostImportReviewAction[]>([]);

  const mappingTemplatesStorageKey = useMemo(
    () => `${IMPORT_MAPPING_TEMPLATES_STORAGE_PREFIX}:${currentCompanyId || 'default'}`,
    [currentCompanyId]
  );

  const currencyCodes = useMemo(() => new Set([baseCurrency, ...currencies.map(c => c.code)]), [baseCurrency, currencies]);
  const accByCode = useMemo(() => new Map(accounts.map(a => [String(a.code).trim().toLowerCase(), a])), [accounts]);
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const contactById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const contactByPhone = useMemo(() => new Map(contacts.filter(c => c.phone).map(c => [String(c.phone).trim(), c])), [contacts]);
  const contactByName = useMemo(() => new Map(contacts.map(c => [normalizeEntityNameKey(c.name), c])), [contacts]);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const productByCode = useMemo(() => new Map(products.filter(p => p.itemCode).map(p => [String(p.itemCode).trim().toLowerCase(), p])), [products]);
  const productByBarcode = useMemo(() => new Map(products.filter(p => p.barcode).map(p => [String(p.barcode).trim(), p])), [products]);
  const productByName = useMemo(() => new Map(products.map(p => [normalizeEntityNameKey(p.name), p])), [products]);
  const whById = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);
  const whByName = useMemo(() => new Map(warehouses.map(w => [w.name.trim().toLowerCase(), w])), [warehouses]);
  const mappedCount = useMemo(
    () => TEMPLATES[entity].filter(field => Boolean(columnMap[field])).length,
    [entity, columnMap]
  );
  const accountChoiceOptions = useMemo(
    () => [...accounts]
      .sort((left, right) => String(left.code || left.name).localeCompare(String(right.code || right.name), 'ar'))
      .map(account => ({
        id: account.id,
        label: `${account.code ? `${account.code} - ` : ''}${account.name}${account.isGroup ? ` ${tr('(رئيسي)', '(Group)')}` : ''}`
      })),
    [accounts, tr]
  );
  const postingAccountChoiceOptions = useMemo(
    () => accountChoiceOptions.filter(option => !accById.get(option.id)?.isGroup),
    [accountChoiceOptions, accById]
  );
  const contactChoiceOptions = useMemo(
    () => [...contacts]
      .sort((left, right) => left.name.localeCompare(right.name, 'ar'))
      .map(contact => ({
        id: contact.id,
        label: `${contact.name}${contact.phone ? ` - ${contact.phone}` : ''}`
      })),
    [contacts]
  );
  const productChoiceOptions = useMemo(
    () => [...products]
      .sort((left, right) => left.name.localeCompare(right.name, 'ar'))
      .map(product => ({
        id: product.id,
        label: `${product.name}${product.itemCode ? ` - ${product.itemCode}` : ''}`
      })),
    [products]
  );

  const geminiApiKey = useMemo(() => extractGeminiApiKey(), []);
  const hasAiKey = Boolean(geminiApiKey);
  const effectiveRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const targets = TEMPLATES[entity];
    return rows.map(row => {
      const next: Row = { ...row };
      targets.forEach(target => {
        const sourceHeader = columnMap[target];
        if (!sourceHeader) return;
        const sourceVal = row[keyNorm(sourceHeader)];
        if (sourceVal === undefined || sourceVal === null || String(sourceVal).trim() === '') return;
        next[keyNorm(target)] = sourceVal;
      });
      return next;
    });
  }, [rows, entity, columnMap]);

  // Load from company settings on mount/switch
  useEffect(() => {
    const state = companySettings.importTemplatesState || {};
    const parsed = state.templates;
    if (!Array.isArray(parsed)) {
      setSavedMappingTemplates([]);
      return;
    }
    const sanitized = parsed.filter((t): t is ColumnMapTemplate => (
      t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.entity === 'string' && t.columnMap && typeof t.columnMap === 'object'
    )).map(t => ({
      id: t.id,
      name: t.name,
      entity: t.entity as ImportEntity,
      columnMap: t.columnMap || {},
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString()
    }));
    setSavedMappingTemplates(sanitized);
  }, [currentCompanyId]); // Only on company switch, don't run on every settings change to avoid loops!

  const persistMappingTemplates = (next: ColumnMapTemplate[]) => {
    setSavedMappingTemplates(next);
    updateCompanySettings({
      ...companySettings,
      importTemplatesState: {
        templates: next
      }
    });
  };

  useEffect(() => {
    setSelectedMappingTemplateId('');
  }, [entity]);

  useEffect(() => {
    setPreparedBackupReview(null);
    setPreparedBackupTaskSelection({});
    setPreparedBackupItemSelections({});
  }, [backupCandidates, backupImportScope]);

  const entityMappingTemplates = useMemo(
    () => savedMappingTemplates
      .filter(t => t.entity === entity)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedMappingTemplates, entity]
  );

  const applyBackupCandidateToImport = (candidate: BackupCandidate) => {
    const targetEntity = candidate.aiEntity || candidate.inferredEntity;
    setEntity(targetEntity);
    setRows(candidate.rows);
    setHeaders(candidate.headers);
    setFileName(`${backupFileName || tr('ملف خارجي', 'External file')} • ${candidate.sourceLabel}`);
    setSummary(null);
    setError('');
    setColumnMap({
      ...(candidate.suggestedColumnMap || {}),
      ...((candidate.aiEntity || candidate.aiColumnMap) ? (candidate.aiColumnMap || {}) : {})
    });
  };

  const analyzeBackupWithAi = async (candidates: BackupCandidate[]): Promise<BackupCandidate[]> => {
    if (!geminiApiKey || candidates.length === 0) return candidates;
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const payload = candidates.slice(0, 8).map(c => ({
        candidateId: c.id,
        sourceLabel: c.sourceLabel,
        headers: c.headers.slice(0, 40),
        sampleRow: Object.fromEntries(
          c.headers.slice(0, 12).map(h => [h, String(c.rows[0]?.[keyNorm(h)] ?? '')])
        ),
        allowedEntities: ['CONTACTS', 'PRODUCTS', 'TRANSACTIONS', 'INVOICES', 'ACCOUNTS']
      }));

      const prompt = `
You are helping map backup data into an ERP importer.
For each candidate dataset, classify into one entity only: CONTACTS, PRODUCTS, TRANSACTIONS, INVOICES, ACCOUNTS.
Return JSON array only.
Each item schema:
{
  "candidateId": "...",
  "entity": "CONTACTS|PRODUCTS|TRANSACTIONS|INVOICES|ACCOUNTS",
  "confidence": 0-100,
  "reason": "short reason",
  "mapping": { "systemField": "sourceHeader" }
}
Use only system fields valid for the chosen entity.
Candidates:
${JSON.stringify(payload)}
      `.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      const text = response.text || '';
      const jsonText = extractJsonFromAiText(text);
      if (!jsonText) return candidates;
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) return candidates;

      const byId = new Map<string, any>();
      parsed.forEach(item => {
        if (item && typeof item.candidateId === 'string') byId.set(item.candidateId, item);
      });

      return candidates.map(c => {
        const aiPick = byId.get(c.id);
        if (!aiPick) return c;
        const entity = ['CONTACTS', 'PRODUCTS', 'TRANSACTIONS', 'INVOICES', 'ACCOUNTS'].includes(String(aiPick.entity))
          ? (aiPick.entity as ImportEntity)
          : c.inferredEntity;
        const rawMap = (aiPick.mapping && typeof aiPick.mapping === 'object') ? aiPick.mapping as Record<string, string> : {};
        const filteredMap: ColumnMap = {};
        TEMPLATES[entity].forEach(field => {
          const header = rawMap[field];
          if (header && c.headers.includes(header)) filteredMap[field] = header;
        });
        return {
          ...c,
          aiEntity: entity,
          aiConfidence: Math.max(0, Math.min(100, Number(aiPick.confidence) || c.confidence)),
          aiReason: String(aiPick.reason || '').trim() || undefined,
          aiColumnMap: Object.keys(filteredMap).length ? filteredMap : undefined
        };
      });
    } catch {
      return candidates;
    }
  };

  const analyzeSqliteFile = async (file: File): Promise<SqliteAnalysisResult> => {
    const [{ default: initSqlJs }] = await Promise.all([
      import('sql.js')
    ]);
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));

    const inferLegacySqliteContactType = (
      customerRow: Row,
      groupById: Map<string, string>,
      typeById: Map<string, string>
    ): Contact['type'] => {
      const typeName = typeById.get(String(v(customerRow, 'cus_type_id', 'type_id') ?? '').trim()) || '';
      const groupName = groupById.get(String(v(customerRow, 'g_id', 'group_id') ?? '').trim()) || '';
      const combined = `${keyNorm(typeName)} ${keyNorm(groupName)}`;
      if (/supplier|vendor|مورد/.test(combined)) return 'SUPPLIER';
      if (/partner|شريك/.test(combined)) return 'PARTNER';
      return 'CUSTOMER';
    };

    const mapLegacySqliteCurrencyCode = (
      currencyId: unknown,
      currencyById: Map<string, string>
    ) => {
      const rawName = String(currencyById.get(String(currencyId ?? '').trim()) || '').trim();
      const normalized = keyNorm(rawName);
      if (!normalized || normalized === 'محلي' || normalized === 'local') return baseCurrency;
      if (/usd|dollar|دولار/.test(normalized)) return 'USD';
      if (/sar|saudi|riyal|ريال|سعودي/.test(normalized)) return 'SAR';
      if (/eur|euro|يورو/.test(normalized)) return 'EUR';
      return baseCurrency;
    };

    const buildLegacySqliteCandidates = (datasets: Map<string, SqliteTableDataset>): BackupAnalysisSource[] => {
      const datasetList = Array.from(datasets.values());
      const selectBestDataset = (scoreFn: (dataset: SqliteTableDataset) => number) => {
        let bestDataset: SqliteTableDataset | null = null;
        let bestScore = 0;
        datasetList.forEach(dataset => {
          const score = scoreFn(dataset);
          if (score > bestScore) {
            bestScore = score;
            bestDataset = dataset;
          }
        });
        return bestDataset;
      };
      const customersDataset = selectBestDataset((dataset) => {
        const normalizedHeaders = new Set(dataset.headers.map(header => keyNorm(header)));
        const sourceKey = keyNorm(dataset.tableName);
        let score = 0;
        if (normalizedHeaders.has('id')) score += 1;
        if (normalizedHeaders.has('name')) score += 2;
        if (normalizedHeaders.has('gsm') || normalizedHeaders.has('phone') || normalizedHeaders.has('mobile')) score += 2;
        if (/customer|customers|contact|contacts|client|clients|partner|vendor|supplier|cust|cus/.test(sourceKey)) score += 3;
        if (/view|tree|type|req|request|valid|app|ver/.test(sourceKey)) score -= 2;
        return score;
      });
      const transactionsDataset = selectBestDataset((dataset) => {
        const normalizedHeaders = new Set(dataset.headers.map(header => keyNorm(header)));
        const sourceKey = keyNorm(dataset.tableName);
        let score = 0;
        if (normalizedHeaders.has('id')) score += 1;
        if (normalizedHeaders.has('cus_id') || normalizedHeaders.has('customer_id') || normalizedHeaders.has('contact_id')) score += 3;
        if (normalizedHeaders.has('out') || normalizedHeaders.has('amount')) score += 2;
        if (normalizedHeaders.has('in') || normalizedHeaders.has('direction') || normalizedHeaders.has('sign')) score += 2;
        if (normalizedHeaders.has('date_') || normalizedHeaders.has('date') || normalizedHeaders.has('doc_date')) score += 2;
        if (normalizedHeaders.has('remarks') || normalizedHeaders.has('description') || normalizedHeaders.has('memo')) score += 1;
        if (/transaction|transactions|ledger|movement|statement|voucher|receipt|payment|entry|entries|trx|tr/.test(sourceKey)) score += 3;
        if (/view|tree|type|req|request|valid|app|ver/.test(sourceKey)) score -= 1;
        return score;
      });
      if (!customersDataset || !transactionsDataset) return [];
      const hasContactsShape = hasOneOfNormalizedHeaders(customersDataset.headers, ['ID', 'id'])
        && hasOneOfNormalizedHeaders(customersDataset.headers, ['name', 'customer_name', 'contact_name'])
        && hasOneOfNormalizedHeaders(customersDataset.headers, ['gsm', 'phone', 'mobile', 'mobile_no']);
      const hasTransactionsShape = hasOneOfNormalizedHeaders(transactionsDataset.headers, ['ID', 'id'])
        && hasOneOfNormalizedHeaders(transactionsDataset.headers, ['cus_id', 'customer_id', 'contact_id'])
        && hasOneOfNormalizedHeaders(transactionsDataset.headers, ['in', 'direction', 'sign'])
        && hasOneOfNormalizedHeaders(transactionsDataset.headers, ['out', 'amount', 'value'])
        && hasOneOfNormalizedHeaders(transactionsDataset.headers, ['date_', 'date', 'doc_date'])
        && hasOneOfNormalizedHeaders(transactionsDataset.headers, ['remarks', 'description', 'memo', 'note']);
      if (!hasContactsShape || !hasTransactionsShape) return [];

      const groupsDataset = selectBestDataset((dataset) => {
        const normalizedHeaders = new Set(dataset.headers.map(header => keyNorm(header)));
        const sourceKey = keyNorm(dataset.tableName);
        let score = 0;
        if (normalizedHeaders.has('id') && normalizedHeaders.has('name')) score += 2;
        if (/group|groups|class|category/.test(sourceKey)) score += 3;
        if (/view|tree|transaction|customer|contact/.test(sourceKey)) score -= 1;
        return score;
      });
      const customerTypesDataset = selectBestDataset((dataset) => {
        const normalizedHeaders = new Set(dataset.headers.map(header => keyNorm(header)));
        const sourceKey = keyNorm(dataset.tableName);
        let score = 0;
        if (normalizedHeaders.has('id') && normalizedHeaders.has('name')) score += 2;
        if (/type|types|customer_type|cus_type|contact_type/.test(sourceKey)) score += 3;
        if (/view|tree|transaction/.test(sourceKey)) score -= 1;
        return score;
      });
      const currencyDataset = selectBestDataset((dataset) => {
        const normalizedHeaders = new Set(dataset.headers.map(header => keyNorm(header)));
        const sourceKey = keyNorm(dataset.tableName);
        let score = 0;
        if (normalizedHeaders.has('id') && normalizedHeaders.has('name')) score += 2;
        if (/currency|curr|fx|money/.test(sourceKey)) score += 3;
        if (/view|tree|transaction|customer|contact/.test(sourceKey)) score -= 1;
        return score;
      });
      const groupById = new Map<string, string>();
      const typeById = new Map<string, string>();
      const currencyById = new Map<string, string>();

      groupsDataset?.rows.forEach(row => {
        const id = String(v(row, 'ID', 'id') ?? '').trim();
        if (!id) return;
        groupById.set(id, String(v(row, 'name') ?? '').trim());
      });
      customerTypesDataset?.rows.forEach(row => {
        const id = String(v(row, 'ID', 'id') ?? '').trim();
        if (!id) return;
        typeById.set(id, String(v(row, 'name') ?? '').trim());
      });
      currencyDataset?.rows.forEach(row => {
        const id = String(v(row, 'ID', 'id') ?? '').trim();
        if (!id) return;
        currencyById.set(id, String(v(row, 'name') ?? '').trim());
      });

      const contactsSource = customersDataset.rows
        .flatMap((row) => {
          const legacyId = String(v(row, 'ID', 'id') ?? '').trim();
          const name = String(v(row, 'name', 'customer_name', 'contact_name') ?? '').trim();
          if (!legacyId || !name) return [];
          return [{
            id: `legacy_sqlite_contact_${legacyId}`,
            name,
            phone: String(v(row, 'gsm', 'phone', 'mobile', 'mobile_no') ?? '').trim(),
            type: inferLegacySqliteContactType(row, groupById, typeById)
          }];
        });

      const customerNameByLegacyId = new Map<string, string>();
      contactsSource.forEach(row => {
        const id = String(row.id || '').replace(/^legacy_sqlite_contact_/, '');
        if (id) customerNameByLegacyId.set(id, String(row.name || ''));
      });

      const transactionSource = transactionsDataset.rows
        .flatMap((row) => {
          const legacyTxId = String(v(row, 'ID', 'id') ?? '').trim();
          const legacyContactId = String(v(row, 'cus_id', 'customer_id', 'contact_id') ?? '').trim();
          const contactName = customerNameByLegacyId.get(legacyContactId) || '';
          const amount = Math.abs(n(v(row, 'out', 'amount', 'value'), 0));
          const date = isoDate(v(row, 'date_', 'date', 'doc_date')) || String(v(row, 'date_', 'date', 'doc_date') ?? '').trim();
          if (!legacyTxId || !legacyContactId || !contactName || amount <= 0 || !date) return [];
          const isIncrease = n(v(row, 'in', 'direction', 'sign'), 0) >= 0;
          return [{
            importKey: `legacy_sqlite_tx_${legacyTxId}`,
            contactId: `legacy_sqlite_contact_${legacyContactId}`,
            contactName,
            date,
            amount,
            description: String(v(row, 'remarks', 'description', 'memo', 'note') ?? '').trim() || tr('حركة عميل مستوردة', 'Imported customer movement'),
            category: 'legacy_customer_ledger',
            transactionType: 'TRANSFER',
            debitAccountCode: isIncrease ? '11301' : legacySqliteOffsetAccountCode,
            creditAccountCode: isIncrease ? legacySqliteOffsetAccountCode : '11301',
            currency: mapLegacySqliteCurrencyCode(v(row, 'curr_id', 'currency_id', 'curr'), currencyById),
            exchangeRate: 1,
            status: 'POSTED'
          }];
        });

      const accountsSource = [{
        id: legacySqliteOffsetAccountId,
        code: legacySqliteOffsetAccountCode,
        name: tr('مقابل حركات العملاء المستوردة', 'Imported customer ledger offset'),
        type: 'EQUITY',
        parentCode: '3',
        currency: baseCurrency
      }];

      const buildCandidate = (sourceLabel: string, objectRows: Record<string, unknown>[]) => {
        const { rows, headers } = buildRowsFromObjects(objectRows);
        if (!rows.length || !headers.length) return null;
        return { sourceLabel, rows, headers } satisfies BackupAnalysisSource;
      };

      return [
        buildCandidate(tr('SQLite جاهز: حساب مقابل الاستيراد', 'SQLite Ready: import offset account'), accountsSource),
        buildCandidate(tr('SQLite جاهز: العملاء من البرنامج القديم', 'SQLite Ready: legacy customers'), contactsSource),
        buildCandidate(tr('SQLite جاهز: حركات العملاء من البرنامج القديم', 'SQLite Ready: legacy customer ledger'), transactionSource)
      ].filter((candidate): candidate is BackupAnalysisSource => Boolean(candidate));
    };

    try {
      const tablesResult = db.exec(`
        SELECT name
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      const tableNames = (tablesResult[0]?.values || [])
        .map(row => String(row?.[0] || '').trim())
        .filter(Boolean);
      const candidates: BackupAnalysisSource[] = [];
      const datasets = new Map<string, SqliteTableDataset>();

      tableNames.forEach((tableName) => {
        const query = `SELECT * FROM ${escapeSqliteIdentifier(tableName)}`;
        const result = db.exec(query)[0];
        if (!result || result.columns.length === 0 || result.values.length === 0) return;

        const objectRows = result.values.map((valueRow) => {
          const next: Record<string, unknown> = {};
          result.columns.forEach((columnName, index) => {
            next[columnName] = normalizeSqliteCellValue(valueRow[index]);
          });
          return next;
        });
        const { rows: normalizedRows, headers: rawHeaders } = buildRowsFromObjects(objectRows);
        if (!normalizedRows.length || !rawHeaders.length) return;

        datasets.set(keyNorm(tableName), {
          tableName,
          rows: normalizedRows,
          headers: rawHeaders,
          objectRows
        });
        candidates.push({
          sourceLabel: `SQLite: ${tableName}`,
          rows: normalizedRows,
          headers: rawHeaders
        });
      });

      const legacyCandidates = buildLegacySqliteCandidates(datasets);
      if (legacyCandidates.length > 0) {
        return {
          candidates: legacyCandidates,
          tableCount: tableNames.length,
          analysisHint: tr(
            'تم التعرف على قاعدة بيانات قديمة بنمط العملاء والحركات، وتم تجهيز مجموعات جاهزة للاستيراد: العملاء، الحركات، وحساب المقابل.',
            'A legacy customer-ledger SQLite database was recognized and ready-to-import datasets were prepared: contacts, movements, and the offset account.'
          )
        };
      }

      return {
        candidates,
        tableCount: tableNames.length
      };
    } finally {
      db.close();
    }
  };

  const analyzeBackupFile = async (file: File) => {
    setBackupAnalysisLoading(true);
    setBackupAnalysisError('');
    setBackupAnalysisNote('');
    setBackupCandidates([]);
    setBackupFileName(file.name);
    try {
      const lowerName = file.name.toLowerCase();
      const candidatesRaw: Array<{ sourceLabel: string; rows: Row[]; headers: string[] }> = [];
      let analysisSourceKind: 'JSON' | 'SPREADSHEET' | 'SQLITE' = 'SPREADSHEET';
      let sqliteTableCount = 0;
      let sqliteAnalysisHint = '';

      if (fileHasOneOfExtensions(lowerName, JSON_BACKUP_EXTENSIONS)) {
        analysisSourceKind = 'JSON';
        const text = await file.text();
        const data = JSON.parse(text);
        const jsonCandidates = collectJsonArrayCandidates(data);
        candidatesRaw.push(...jsonCandidates);
      } else if (fileHasOneOfExtensions(lowerName, SQLITE_BACKUP_EXTENSIONS)) {
        analysisSourceKind = 'SQLITE';
        const sqliteAnalysis = await analyzeSqliteFile(file);
        sqliteTableCount = sqliteAnalysis.tableCount;
        sqliteAnalysisHint = sqliteAnalysis.analysisHint || '';
        candidatesRaw.push(...sqliteAnalysis.candidates);
      } else if (fileHasOneOfExtensions(lowerName, SPREADSHEET_BACKUP_EXTENSIONS)) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        wb.SheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName];
          const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false, blankrows: false });
          if (!parsed.length) return;
          const { rows: normalizedRows, headers: rawHeaders } = buildRowsFromObjects(parsed);
          if (!normalizedRows.length || !rawHeaders.length) return;
          candidatesRaw.push({
            sourceLabel: `Sheet: ${sheetName}`,
            rows: normalizedRows,
            headers: rawHeaders
          });
        });
      } else {
        throw new Error('UNSUPPORTED_EXTERNAL_ANALYSIS_FORMAT');
      }

      const uniqueCandidates = candidatesRaw
        .filter(c => c.rows.length > 0 && c.headers.length > 0)
        .slice(0, 20)
        .map((c, idx) => {
          const inferred = analyzeCandidateDataset(c.sourceLabel, c.headers, c.rows);
          return {
            id: `cand_${idx + 1}`,
            sourceLabel: c.sourceLabel,
            rows: c.rows,
            headers: c.headers,
            rowCount: c.rows.length,
            inferredEntity: inferred.entity,
            confidence: inferred.confidence,
            reason: inferred.reason,
            suggestedColumnMap: inferred.columnMap,
            recommended: inferred.recommended,
            score: inferred.score
          } satisfies BackupCandidate;
        });

      const sortedCandidates = [...uniqueCandidates].sort((left, right) => {
        const recommendedDelta = Number(Boolean(right.recommended)) - Number(Boolean(left.recommended));
        if (recommendedDelta !== 0) return recommendedDelta;
        return Number(right.score || 0) - Number(left.score || 0);
      });
      const preferredCandidates = sortedCandidates.filter(candidate => candidate.recommended);
      const visibleCandidates = preferredCandidates.length > 0 ? preferredCandidates : sortedCandidates;
      const hiddenCandidatesCount = Math.max(0, sortedCandidates.length - visibleCandidates.length);
      const hiddenCandidatesHint = hiddenCandidatesCount > 0
        ? tr(` تم إخفاء ${hiddenCandidatesCount} جدول/عرض منخفض الصلة.`, ` ${hiddenCandidatesCount} low-relevance tables/views were hidden.`)
        : '';

      if (!visibleCandidates.length) {
        setBackupAnalysisError(tr('لم يتم العثور على جداول قابلة للتحليل داخل الملف.', 'No analyzable tables were found in the file.'));
        return;
      }

      setBackupAnalysisNote(
        hasAiKey
          ? (
            analysisSourceKind === 'SQLITE'
              ? tr(`تم اكتشاف ${sqliteTableCount} جدول/عرض في ملف قاعدة البيانات، وجارٍ تحسين الاقتراحات بالذكاء الاصطناعي...`, `Detected ${sqliteTableCount} SQLite tables/views, improving suggestions with AI...`)
              : tr('تم تنفيذ تحليل أولي، وجارٍ تحسين الاقتراحات بالذكاء الاصطناعي...', 'Initial analysis completed, improving suggestions with AI...')
          )
          : (
            analysisSourceKind === 'SQLITE'
              ? tr(`تم تحليل ملف قاعدة البيانات محليًا واكتشاف ${sqliteTableCount} جدول/عرض. فعّل مفتاح Gemini لتحسين المطابقة.`, `SQLite file analyzed locally and ${sqliteTableCount} tables/views were discovered. Enable Gemini key for better matching.`)
              : tr('تم التحليل الذكي المحلي. لإضافة تحسين بالذكاء الاصطناعي فعّل مفتاح Gemini.', 'Local smart analysis completed. Add Gemini API key for AI-enhanced mapping.')
          ) + hiddenCandidatesHint
      );
      if (sqliteAnalysisHint) {
        setBackupAnalysisNote(prev => [prev, sqliteAnalysisHint].filter(Boolean).join(' '));
      }
      setBackupCandidates(visibleCandidates);

      const aiEnhanced = await analyzeBackupWithAi(visibleCandidates);
      setBackupCandidates(aiEnhanced);
      setBackupAnalysisNote(
        hasAiKey
          ? (
            analysisSourceKind === 'SQLITE'
              ? tr('تم تحليل ملف قاعدة البيانات واقتراح الجداول المناسبة بالذكاء الاصطناعي. اختر الجدول ثم حمّله إلى الاستيراد.', 'SQLite database analyzed and AI suggestions are ready. Choose a table and load it into import.')
              : tr('تم تحليل الملف واقتراح الربط بالذكاء الاصطناعي. اختر الجدول المناسب ثم حمّله للاستيراد.', 'File analyzed and AI suggestions prepared. Choose a dataset and load it into import.')
          )
          : (
            analysisSourceKind === 'SQLITE'
              ? tr('تم تحليل ملف قاعدة البيانات محليًا. اختر الجدول المناسب ثم نفّذ الفحص أو الاستيراد.', 'SQLite database analyzed locally. Choose the appropriate table and run dry-run or import.')
              : tr('تم تحليل الملف محليًا. يمكنك تحميل الجدول المناسب ثم تنفيذ الفحص/الاستيراد.', 'File analyzed locally. You can load the appropriate dataset and run dry-run/import.')
          ) + hiddenCandidatesHint
      );
      if (sqliteAnalysisHint) {
        setBackupAnalysisNote(prev => [prev, sqliteAnalysisHint].filter(Boolean).join(' '));
      }
    } catch (error) {
      const message = String((error as Error | undefined)?.message || '');
      if (message === 'UNSUPPORTED_EXTERNAL_ANALYSIS_FORMAT') {
        setBackupAnalysisError(tr(
          'صيغة الملف غير مدعومة للتحليل. استخدم JSON أو Excel/CSV أو SQLite DB مثل db و sqlite و sqlite3.',
          'Unsupported analysis format. Use JSON, Excel/CSV, or SQLite DB files such as db, sqlite, or sqlite3.'
        ));
      } else {
        setBackupAnalysisError(tr(
          'تعذر تحليل الملف الخارجي. استخدم JSON أو Excel/CSV صالح أو ملف SQLite DB صحيح.',
          'Could not analyze the external file. Use a valid JSON, Excel/CSV, or SQLite DB file.'
        ));
      }
      setBackupCandidates([]);
    } finally {
      setBackupAnalysisLoading(false);
    }
  };

  const saveCurrentMappingTemplate = () => {
    const name = mappingTemplateName.trim();
    if (!name) {
      alert(tr('أدخل اسم قالب الربط.', 'Enter a mapping template name.'));
      return;
    }
    if (mappedCount === 0) {
      alert(tr('اربط عمودًا واحدًا على الأقل قبل الحفظ.', 'Map at least one column before saving.'));
      return;
    }
    const now = new Date().toISOString();
    const next = [...savedMappingTemplates];
    const existingIdx = next.findIndex(t => t.entity === entity && t.name.trim().toLowerCase() === name.toLowerCase());
    const template: ColumnMapTemplate = {
      id: existingIdx >= 0 ? next[existingIdx].id : `map_${Math.random().toString(36).slice(2, 10)}`,
      name,
      entity,
      columnMap: { ...columnMap },
      updatedAt: now
    };
    if (existingIdx >= 0) next[existingIdx] = template;
    else next.push(template);
    persistMappingTemplates(next);
    setSelectedMappingTemplateId(template.id);
  };

  const applySelectedMappingTemplate = () => {
    if (!selectedMappingTemplateId) return;
    const template = entityMappingTemplates.find(t => t.id === selectedMappingTemplateId);
    if (!template) return;
    setColumnMap({ ...template.columnMap });
    setMappingTemplateName(template.name);
  };

  const deleteSelectedMappingTemplate = () => {
    if (!selectedMappingTemplateId) return;
    persistMappingTemplates(savedMappingTemplates.filter(t => t.id !== selectedMappingTemplateId));
    setSelectedMappingTemplateId('');
  };

  const downloadIssuesCsv = (nextSummary: ImportSummary) => {
    const issues = [
      ...nextSummary.errors.map(message => ({ kind: 'error', message })),
      ...nextSummary.warnings.map(message => ({ kind: 'warning', message }))
    ];
    if (issues.length === 0) return;
    const csv = [
      ['index', 'mode', 'entity', 'type', 'message'],
      ...issues.map((issue, index) => [String(index + 1), nextSummary.mode, entity, issue.kind, issue.message])
    ].map(cols => cols.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_issues_${entity.toLowerCase()}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file: File) => {
    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false, blankrows: false });
      const normalized = parsed.map((r, i) => {
        const row: Row = { __rowNumber: i + 2 };
        Object.entries(r).forEach(([k, val]) => { row[keyNorm(k)] = val; });
        return row;
      });
      const rawHeaders = Object.keys(parsed[0] || {});
      setRows(normalized);
      setHeaders(rawHeaders);
      setColumnMap(autoMapColumns(entity, rawHeaders));
      setFileName(file.name);
    } catch {
      setError(tr('تعذر قراءة الملف. استخدم ملف Excel/CSV يحتوي على عناوين أعمدة.', 'Could not read file. Use Excel/CSV with headers.'));
      setRows([]);
      setHeaders([]);
      setColumnMap({});
    } finally {
      setLoading(false);
    }
  };

  const resolveAccount = (idVal: unknown, codeVal: unknown) =>
    (idVal && accById.get(String(idVal))) || (codeVal && accByCode.get(String(codeVal).trim().toLowerCase())) || null;
  const resolveContact = (row: Row) => {
    const id = v(row, 'contactId', 'id');
    const phone = v(row, 'phone');
    const name = v(row, 'contactName', 'name');
    return (id && contactById.get(String(id)))
      || (phone && contactByPhone.get(String(phone).trim()))
      || (name && contactByName.get(normalizeEntityNameKey(name)))
      || null;
  };
  const ensureContact = (name: string, type: Contact['type'], phone?: string) => {
    const found = (phone && contactByPhone.get(phone)) || contactByName.get(normalizeEntityNameKey(name));
    if (found) return found;
    const created = { id: `imp_c_${Math.random().toString(36).slice(2, 10)}`, name, type, phone } as Contact;
    addContact(created);
    return created;
  };
  const resolveProduct = (row: Row) => {
    const id = v(row, 'productId', 'id');
    const code = v(row, 'itemCode', 'code');
    const barcode = v(row, 'barcode');
    const name = v(row, 'productName', 'name', 'itemDescription');
    return (id && productById.get(String(id)))
      || (code && productByCode.get(String(code).trim().toLowerCase()))
      || (barcode && productByBarcode.get(String(barcode).trim()))
      || (name && productByName.get(normalizeEntityNameKey(name)))
      || null;
  };

  const defaultOpeningDate = `${new Date().getFullYear()}-01-01`;

  const resolveCandidateEntity = (candidate: BackupCandidate): ImportEntity =>
    candidate.aiEntity || candidate.inferredEntity;

  const resolveCandidateColumnMap = (candidate: BackupCandidate, targetEntity = resolveCandidateEntity(candidate)): ColumnMap => ({
    ...smartAutoMapColumns(targetEntity, candidate.headers),
    ...(candidate.suggestedColumnMap || {}),
    ...(candidate.aiColumnMap || {})
  });

  const buildMappedRows = (sourceRows: Row[], targetEntity: ImportEntity, taskColumnMap: ColumnMap) =>
    sourceRows.map(row => {
      const next: Row = { ...row };
      TEMPLATES[targetEntity].forEach(target => {
        const sourceHeader = taskColumnMap[target];
        if (!sourceHeader) return;
        const sourceValue = row[keyNorm(sourceHeader)];
        if (sourceValue === undefined || sourceValue === null || String(sourceValue).trim() === '') return;
        next[keyNorm(target)] = sourceValue;
      });
      return next;
    });

  const buildInvoiceReviewActions = (sourceRows: Row[]): PostImportReviewAction[] => {
    const invoiceModes = new Set(
      sourceRows.map(row => parseInvoiceMode(v(row, 'invoiceMode')))
    );
    const actions: PostImportReviewAction[] = [];

    if (['SALES', 'SALES_RETURN', 'QUOTATION'].some(mode => invoiceModes.has(mode as ReturnType<typeof parseInvoiceMode>))) {
      actions.push({
        id: 'sales-invoices',
        label: tr('فتح فواتير المبيعات', 'Open sales invoices'),
        target: { tab: 'sales' }
      });
    }
    if (['PURCHASES', 'PURCHASE_RETURN'].some(mode => invoiceModes.has(mode as ReturnType<typeof parseInvoiceMode>))) {
      actions.push({
        id: 'purchase-invoices',
        label: tr('فتح فواتير الشراء', 'Open purchase invoices'),
        target: { tab: 'purchases' }
      });
    }
    if (['EXPENSES', 'IMPORT_EXPENSES'].some(mode => invoiceModes.has(mode as ReturnType<typeof parseInvoiceMode>))) {
      actions.push({
        id: 'expense-invoices',
        label: tr('فتح المصاريف', 'Open expenses'),
        target: { tab: 'purchases-expenses' }
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: 'sales-invoices',
        label: tr('فتح الفواتير', 'Open invoices'),
        target: { tab: 'sales' }
      });
    }

    return actions;
  };

  const buildPostImportReviewActions = (tasks: PreparedImportTask[]): PostImportReviewAction[] => {
    const uniqueActions = new Map<string, PostImportReviewAction>();
    const registerAction = (action: PostImportReviewAction) => {
      if (!uniqueActions.has(action.id)) {
        uniqueActions.set(action.id, action);
      }
    };

    tasks.forEach(task => {
      if (task.entity === 'CONTACTS') {
        registerAction({
          id: 'contacts',
          label: tr('فتح الأطراف', 'Open contacts'),
          target: { tab: 'directory' }
        });
        return;
      }

      if (task.entity === 'PRODUCTS') {
        registerAction({
          id: 'products',
          label: tr('فتح الأصناف', 'Open products'),
          target: { tab: 'products' }
        });
        return;
      }

      if (task.entity === 'ACCOUNTS') {
        registerAction({
          id: 'accounts',
          label: tr('فتح شجرة الحسابات', 'Open accounts tree'),
          target: { tab: 'definitions', definitionsMode: 'ACCOUNTS' }
        });
        return;
      }

      if (task.entity === 'TRANSACTIONS') {
        registerAction({
          id: 'transactions',
          label: tr('فتح السجلات', 'Open transactions'),
          target: { tab: 'list' }
        });
        return;
      }

      buildInvoiceReviewActions(buildMappedRows(task.rows, task.entity, task.columnMap)).forEach(registerAction);
    });

    return Array.from(uniqueActions.values());
  };

  const buildTransactionDuplicateKey = (input: {
    date?: string | null;
    amount?: number;
    debitAccountId?: string;
    creditAccountId?: string;
    description?: string;
    category?: string;
    currency?: string;
    exchangeRate?: number;
    contactId?: string;
  }) => [
    input.date || '',
    round2(input.amount || 0).toFixed(2),
    input.debitAccountId || '',
    input.creditAccountId || '',
    sanitizeImportKey(input.description || ''),
    sanitizeImportKey(input.category || ''),
    String(input.currency || baseCurrency).trim().toUpperCase(),
    round2(input.exchangeRate || 1).toFixed(4),
    input.contactId || ''
  ].join('|');

  const normalizeInvoiceModeKey = (value: unknown) => {
    const raw = keyNorm(value);
    if (['sales_invoice', 'sales'].includes(raw)) return 'SALES';
    if (['purchase_invoice', 'purchases', 'purchase'].includes(raw)) return 'PURCHASES';
    if (['general_expense', 'expense', 'expenses'].includes(raw)) return 'EXPENSES';
    if (['import_expenses', 'import_expense'].includes(raw)) return 'IMPORT_EXPENSES';
    if (['sales_return'].includes(raw)) return 'SALES_RETURN';
    if (['purchase_return'].includes(raw)) return 'PURCHASE_RETURN';
    if (['quotation', 'quote'].includes(raw)) return 'QUOTATION';
    return parseInvoiceMode(value);
  };

  const buildInvoiceDuplicateKey = (input: {
    invoiceNumber?: string;
    invoiceMode?: string;
    date?: string | null;
    contactName?: string;
    totalAmount?: number;
  }) => [
    sanitizeImportKey(input.invoiceNumber || ''),
    normalizeInvoiceModeKey(input.invoiceMode || ''),
    input.date || '',
    sanitizeImportKey(input.contactName || ''),
    round2(input.totalAmount || 0).toFixed(2)
  ].join('|');

  const resolveAccountRootId = (accountType: Account['type']) => {
    if (accountType === 'ASSET') return 'acc_assets';
    if (accountType === 'LIABILITY') return 'acc_liabilities';
    if (accountType === 'EQUITY') return 'acc_equity_root';
    if (accountType === 'REVENUE') return 'acc_revenue_root';
    return 'acc_expense_root';
  };

  const resolveOpeningOffsetAccount = (sourceAccounts: Account[]) =>
    sourceAccounts.find(account => !account.isGroup && account.id === 'acc_import_opening_balances')
    || sourceAccounts.find(account => !account.isGroup && account.id === 'acc_retained_earnings')
    || sourceAccounts.find(account => !account.isGroup && account.id === 'acc_capital')
    || null;

  const predictContactPostingAccountId = (contact: Contact) => {
    if (contact.currentAccountId || contact.linkedAccountId) return contact.currentAccountId || contact.linkedAccountId;
    const safeId = sanitizeImportKey(contact.id);
    if (!safeId || /^cash_/i.test(String(contact.id || '').trim())) return undefined;
    if (contact.type === 'CUSTOMER') return 'acc_receivable';
    if (contact.type === 'SUPPLIER') return `acc_payable_${safeId}`;
    if (contact.type === 'PARTNER') return `acc_partner_current_${safeId}`;
    return undefined;
  };

  const resolveAccountFromList = (sourceAccounts: Account[], idVal?: unknown, codeVal?: unknown, nameVal?: unknown) => {
    const id = String(idVal || '').trim();
    if (id) {
      const byId = sourceAccounts.find(account => account.id === id);
      if (byId) return byId;
    }
    const code = String(codeVal || '').trim().toLowerCase();
    if (code) {
      const byCode = sourceAccounts.find(account => String(account.code || '').trim().toLowerCase() === code);
      if (byCode) return byCode;
    }
    const name = String(nameVal || '').trim().toLowerCase();
    if (name) {
      const byName = sourceAccounts.find(account => String(account.name || '').trim().toLowerCase() === name);
      if (byName) return byName;
    }
    return null;
  };

  const resolveContactFromList = (sourceContacts: Contact[], idVal?: unknown, phoneVal?: unknown, nameVal?: unknown) => {
    const id = String(idVal || '').trim();
    if (id) {
      const byId = sourceContacts.find(contact => contact.id === id);
      if (byId) return byId;
    }
    const phone = String(phoneVal || '').trim();
    if (phone) {
      const byPhone = sourceContacts.find(contact => String(contact.phone || '').trim() === phone);
      if (byPhone) return byPhone;
    }
    const name = normalizeEntityNameKey(nameVal);
    if (name) {
      const byName = sourceContacts.find(contact => normalizeEntityNameKey(contact.name) === name);
      if (byName) return byName;
    }
    return null;
  };

  const resolveProductFromList = (sourceProducts: Product[], row: Row) => {
    const id = String(v(row, 'productId', 'id') || '').trim();
    if (id) {
      const byId = sourceProducts.find(product => product.id === id);
      if (byId) return byId;
    }
    const itemCode = String(v(row, 'itemCode', 'code') || '').trim().toLowerCase();
    if (itemCode) {
      const byCode = sourceProducts.find(product => String(product.itemCode || '').trim().toLowerCase() === itemCode);
      if (byCode) return byCode;
    }
    const barcode = String(v(row, 'barcode') || '').trim();
    if (barcode) {
      const byBarcode = sourceProducts.find(product => String(product.barcode || '').trim() === barcode);
      if (byBarcode) return byBarcode;
    }
    const name = normalizeEntityNameKey(v(row, 'productName', 'name', 'itemDescription'));
    if (name) {
      const byName = sourceProducts.find(product => normalizeEntityNameKey(product.name) === name);
      if (byName) return byName;
    }
    return null;
  };

  const resolvePreparedReviewSelection = (
    reviewContext: ImportExecutionReviewContext | undefined,
    task: PreparedImportTask,
    row: Row
  ) => reviewContext?.selections[buildPreparedImportRowId(task, row)];

  const resolveAccountFromListWithReview = (
    sourceAccounts: Account[],
    reviewContext: ImportExecutionReviewContext | undefined,
    idVal?: unknown,
    codeVal?: unknown,
    nameVal?: unknown
  ) => {
    if (reviewContext) {
      const id = String(idVal || '').trim();
      if (id) {
        const aliasId = reviewContext.accountAliasById.get(id);
        if (aliasId) {
          const aliased = sourceAccounts.find(account => account.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const code = String(codeVal || '').trim().toLowerCase();
      if (code) {
        const aliasId = reviewContext.accountAliasByCode.get(code);
        if (aliasId) {
          const aliased = sourceAccounts.find(account => account.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const name = String(nameVal || '').trim().toLowerCase();
      if (name) {
        const aliasId = reviewContext.accountAliasByName.get(name);
        if (aliasId) {
          const aliased = sourceAccounts.find(account => account.id === aliasId);
          if (aliased) return aliased;
        }
      }
    }
    return resolveAccountFromList(sourceAccounts, idVal, codeVal, nameVal);
  };

  const resolveContactFromListWithReview = (
    sourceContacts: Contact[],
    reviewContext: ImportExecutionReviewContext | undefined,
    idVal?: unknown,
    phoneVal?: unknown,
    nameVal?: unknown
  ) => {
    if (reviewContext) {
      const id = String(idVal || '').trim();
      if (id) {
        const aliasId = reviewContext.contactAliasById.get(id);
        if (aliasId) {
          const aliased = sourceContacts.find(contact => contact.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const phone = String(phoneVal || '').trim();
      if (phone) {
        const aliasId = reviewContext.contactAliasByPhone.get(phone);
        if (aliasId) {
          const aliased = sourceContacts.find(contact => contact.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const name = normalizeEntityNameKey(nameVal);
      if (name) {
        const aliasId = reviewContext.contactAliasByName.get(name);
        if (aliasId) {
          const aliased = sourceContacts.find(contact => contact.id === aliasId);
          if (aliased) return aliased;
        }
      }
    }
    return resolveContactFromList(sourceContacts, idVal, phoneVal, nameVal);
  };

  const resolveProductFromListWithReview = (
    sourceProducts: Product[],
    reviewContext: ImportExecutionReviewContext | undefined,
    row: Row
  ) => {
    if (reviewContext) {
      const id = String(v(row, 'productId', 'id') || '').trim();
      if (id) {
        const aliasId = reviewContext.productAliasById.get(id);
        if (aliasId) {
          const aliased = sourceProducts.find(product => product.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const itemCode = String(v(row, 'itemCode', 'code') || '').trim().toLowerCase();
      if (itemCode) {
        const aliasId = reviewContext.productAliasByCode.get(itemCode);
        if (aliasId) {
          const aliased = sourceProducts.find(product => product.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const barcode = String(v(row, 'barcode') || '').trim();
      if (barcode) {
        const aliasId = reviewContext.productAliasByBarcode.get(barcode);
        if (aliasId) {
          const aliased = sourceProducts.find(product => product.id === aliasId);
          if (aliased) return aliased;
        }
      }
      const name = normalizeEntityNameKey(v(row, 'productName', 'name', 'itemDescription'));
      if (name) {
        const aliasId = reviewContext.productAliasByName.get(name);
        if (aliasId) {
          const aliased = sourceProducts.find(product => product.id === aliasId);
          if (aliased) return aliased;
        }
      }
    }
    return resolveProductFromList(sourceProducts, row);
  };

  const upsertWorkingAccount = (sourceAccounts: Account[], account: Account) => {
    const index = sourceAccounts.findIndex(item => item.id === account.id);
    if (index >= 0) sourceAccounts[index] = account;
    else sourceAccounts.push(account);
  };

  const upsertWorkingContact = (sourceContacts: Contact[], contact: Contact) => {
    const index = sourceContacts.findIndex(item => item.id === contact.id);
    if (index >= 0) sourceContacts[index] = contact;
    else sourceContacts.push(contact);
  };

  const upsertWorkingProduct = (sourceProducts: Product[], product: Product) => {
    const index = sourceProducts.findIndex(item => item.id === product.id);
    if (index >= 0) sourceProducts[index] = product;
    else sourceProducts.push(product);
  };

  const isPreparedTaskUseful = (task: PreparedImportTask) => {
    if (task.entity === 'CONTACTS') return Boolean(task.columnMap.name);
    if (task.entity === 'PRODUCTS') return Boolean(task.columnMap.name);
    if (task.entity === 'ACCOUNTS') return Boolean(task.columnMap.code || task.columnMap.name);
    if (task.entity === 'TRANSACTIONS') {
      return Boolean(task.columnMap.date)
        && Boolean(task.columnMap.amount)
        && (Boolean(task.columnMap.debitAccountCode) || Boolean(task.columnMap.creditAccountCode) || Boolean(task.columnMap.accountCode));
    }
    return Boolean(task.columnMap.invoiceNumber) && Boolean(task.columnMap.date);
  };

  const taskHasOpeningBalanceColumns = (task: PreparedImportTask) =>
    Boolean(task.columnMap.openingBalance || task.columnMap.openingDebit || task.columnMap.openingCredit);

  const getBackupImportScopeLabel = (scope: BackupImportScope) => {
    if (scope === 'CUSTOMERS_ONLY') return tr('العملاء فقط', 'Customers only');
    if (scope === 'CUSTOMERS_WITH_BALANCES') return tr('العملاء مع الأرصدة', 'Customers with balances');
    if (scope === 'CONTACTS_ONLY') return tr('كل الأطراف', 'All contacts');
    if (scope === 'ACCOUNTS_ONLY') return tr('الحسابات فقط', 'Accounts only');
    if (scope === 'ACCOUNTS_WITH_BALANCES') return tr('الحسابات مع الأرصدة', 'Accounts with balances');
    if (scope === 'PRODUCTS_ONLY') return tr('الأصناف فقط', 'Products only');
    if (scope === 'MOVEMENTS_ONLY') return tr('كل الحركات', 'All movements');
    if (scope === 'TRANSACTIONS_ONLY') return tr('القيود فقط', 'Transactions only');
    if (scope === 'INVOICES_ONLY') return tr('الفواتير فقط', 'Invoices only');
    if (scope === 'MASTER_DATA') return tr('البيانات الأساسية', 'Master data');
    return tr('كل البيانات', 'All data');
  };

  const isReviewablePreparedEntity = (entityType: ImportEntity): entityType is ReviewableImportEntity => (
    entityType === 'CONTACTS' || entityType === 'PRODUCTS' || entityType === 'ACCOUNTS'
  );

  const describePreparedTask = (task: PreparedImportTask) => {
    const baseLabel = (() => {
      if (task.entity === 'CONTACTS') return tr('العملاء والموردون', 'Contacts');
      if (task.entity === 'PRODUCTS') return tr('الأصناف', 'Products');
      if (task.entity === 'ACCOUNTS') return tr('الحسابات', 'Accounts');
      if (task.entity === 'TRANSACTIONS') return tr('القيود والحركات', 'Transactions');
      return tr('الفواتير', 'Invoices');
    })();
    if (task.options?.balancesOnly && task.entity === 'CONTACTS') {
      return tr('أرصدة افتتاحية للأطراف', 'Contact opening balances');
    }
    if (task.options?.balancesOnly && task.entity === 'ACCOUNTS') {
      return tr('أرصدة افتتاحية للحسابات', 'Account opening balances');
    }
    if (task.options?.customersOnly) {
      return tr('الزبائن فقط', 'Customers only');
    }
    return baseLabel;
  };

  const buildPreparedImportRowId = (task: PreparedImportTask, row: Row) => (
    `${task.entity}:${sanitizeImportKey(task.sourceLabel) || 'source'}:${row.__rowNumber || 0}`
  );

  const describeContactType = (type: Contact['type']) => {
    if (type === 'SUPPLIER') return tr('مورد', 'Supplier');
    if (type === 'PARTNER') return tr('شريك', 'Partner');
    if (type === 'EMPLOYEE') return tr('موظف', 'Employee');
    return tr('زبون', 'Customer');
  };

  const getContactPostingAccountSuggestion = (contactType: Contact['type']) => {
    if (contactType === 'SUPPLIER') return 'acc_payable';
    if (contactType === 'PARTNER') return 'acc_partner_current';
    if (contactType === 'EMPLOYEE') return 'acc_payroll';
    return 'acc_receivable';
  };

  const buildPreparedBackupReview = (
    tasks: PreparedImportTask[],
    mode: ImportMode,
    scopeLabel: string
  ): PreparedImportReview => {
    const items: PreparedImportReviewItem[] = [];

    tasks.forEach(task => {
      if (task.options?.balancesOnly || !isReviewablePreparedEntity(task.entity)) return;
      const mappedRows = buildMappedRows(task.rows, task.entity, task.columnMap);

      mappedRows.forEach(row => {
        const rowNumber = row.__rowNumber || 0;
        const itemId = buildPreparedImportRowId(task, row);

        if (task.entity === 'CONTACTS') {
          const name = String(v(row, 'name') || '').trim();
          if (!name) return;
          const phone = String(v(row, 'phone') || '').trim();
          const type = parseContactType(v(row, 'type'));
          const exactMatch = resolveContactFromList(contacts, v(row, 'id'), phone, name);
          const similar = !exactMatch && isCommercialContactType(type)
            ? findSimilarCommercialContact(contacts, name)
            : null;
          const preferredPostingAccountId = exactMatch?.currentAccountId
            || exactMatch?.linkedAccountId
            || getContactPostingAccountSuggestion(type);
          const suggestedPostingAccountId = preferredPostingAccountId && accById.has(preferredPostingAccountId)
            ? preferredPostingAccountId
            : undefined;
          items.push({
            id: itemId,
            taskId: task.id,
            entity: 'CONTACTS',
            sourceLabel: task.sourceLabel,
            rowNumber,
            title: name,
            subtitle: `${describeContactType(type)}${phone ? ` - ${phone}` : ''}`,
            preview: [
              `${tr('النوع', 'Type')}: ${describeContactType(type)}`,
              phone ? `${tr('الهاتف', 'Phone')}: ${phone}` : tr('بدون هاتف', 'No phone'),
              `${tr('المصدر', 'Source')}: ${task.sourceLabel}`
            ],
            autoMatchId: exactMatch?.id,
            autoMatchLabel: exactMatch ? `${exactMatch.name}${exactMatch.phone ? ` - ${exactMatch.phone}` : ''}` : undefined,
            similarMatchLabel: similar ? `${tr('اسم مشابه', 'Similar name')}: ${similar.name}` : undefined,
            targetOptions: contactChoiceOptions,
            postingAccountOptions: postingAccountChoiceOptions,
            suggestedPostingAccountId
          });
          return;
        }

        if (task.entity === 'PRODUCTS') {
          const name = String(v(row, 'name', 'productName') || '').trim();
          if (!name) return;
          const itemCode = String(v(row, 'itemCode', 'code') || '').trim();
          const barcode = String(v(row, 'barcode') || '').trim();
          const exactMatch = resolveProductFromList(products, row);
          const similar = !exactMatch ? findSimilarProduct(products, name) : null;
          items.push({
            id: itemId,
            taskId: task.id,
            entity: 'PRODUCTS',
            sourceLabel: task.sourceLabel,
            rowNumber,
            title: name,
            subtitle: [itemCode, barcode].filter(Boolean).join(' - ') || tr('بدون رمز', 'No code'),
            preview: [
              itemCode ? `${tr('رمز الصنف', 'Item code')}: ${itemCode}` : tr('بدون رمز صنف', 'No item code'),
              barcode ? `${tr('باركود', 'Barcode')}: ${barcode}` : tr('بدون باركود', 'No barcode'),
              `${tr('المصدر', 'Source')}: ${task.sourceLabel}`
            ],
            autoMatchId: exactMatch?.id,
            autoMatchLabel: exactMatch ? `${exactMatch.name}${exactMatch.itemCode ? ` - ${exactMatch.itemCode}` : ''}` : undefined,
            similarMatchLabel: similar ? `${tr('اسم مشابه', 'Similar name')}: ${similar.name}` : undefined,
            targetOptions: productChoiceOptions
          });
          return;
        }

        const code = String(v(row, 'code', 'accountCode') || '').trim();
        const name = String(v(row, 'name') || '').trim();
        if (!code && !name) return;
        const exactMatch = resolveAccountFromList(accounts, v(row, 'id'), code, name);
        const parentCandidate = resolveAccountFromList(accounts, undefined, v(row, 'parentCode'), v(row, 'parentName'));
        const inferredType = (() => {
          const rawType = String(v(row, 'type') || '').trim();
          if (rawType) return parseAccountType(rawType);
          if (exactMatch) return exactMatch.type;
          if (parentCandidate) return parentCandidate.type;
          if (/^1/.test(code)) return 'ASSET' as const;
          if (/^2/.test(code)) return 'LIABILITY' as const;
          if (/^3/.test(code)) return 'EQUITY' as const;
          if (/^4/.test(code)) return 'REVENUE' as const;
          return 'EXPENSE' as const;
        })();
        const rootParent = resolveAccountFromList(accounts, resolveAccountRootId(inferredType));
        items.push({
          id: itemId,
          taskId: task.id,
          entity: 'ACCOUNTS',
          sourceLabel: task.sourceLabel,
          rowNumber,
          title: name || tr('حساب بدون اسم', 'Unnamed account'),
          subtitle: `${code || tr('بدون رمز', 'No code')} - ${inferredType}`,
          preview: [
            `${tr('الرمز', 'Code')}: ${code || tr('غير موجود', 'Missing')}`,
            `${tr('النوع', 'Type')}: ${inferredType}`,
            `${tr('الأب', 'Parent')}: ${String(v(row, 'parentName') || v(row, 'parentCode') || rootParent?.name || tr('الجذر المناسب', 'Suggested root'))}`
          ],
          autoMatchId: exactMatch?.id,
          autoMatchLabel: exactMatch ? `${exactMatch.code} - ${exactMatch.name}` : undefined,
          targetOptions: accountChoiceOptions,
          parentOptions: accountChoiceOptions,
          suggestedParentId: parentCandidate?.id || rootParent?.id
        });
      });
    });

    return { mode, scopeLabel, tasks, items };
  };

  const buildImportExecutionReviewContext = (
    tasks: PreparedImportTask[],
    selections: Record<string, PreparedImportReviewSelection>
  ): ImportExecutionReviewContext => {
    const context: ImportExecutionReviewContext = {
      selections,
      accountAliasById: new Map(),
      accountAliasByCode: new Map(),
      accountAliasByName: new Map(),
      contactAliasById: new Map(),
      contactAliasByPhone: new Map(),
      contactAliasByName: new Map(),
      productAliasById: new Map(),
      productAliasByCode: new Map(),
      productAliasByBarcode: new Map(),
      productAliasByName: new Map()
    };

    tasks.forEach(task => {
      if (task.options?.balancesOnly || !isReviewablePreparedEntity(task.entity)) return;
      const mappedRows = buildMappedRows(task.rows, task.entity, task.columnMap);
      mappedRows.forEach(row => {
        const selection = selections[buildPreparedImportRowId(task, row)];
        if (!selection || selection.decision !== 'MERGE' || !selection.targetId) return;

        if (task.entity === 'CONTACTS') {
          const id = String(v(row, 'id', 'contactId') || '').trim();
          const phone = String(v(row, 'phone') || '').trim();
          const name = normalizeEntityNameKey(v(row, 'contactName', 'name'));
          if (id) context.contactAliasById.set(id, selection.targetId);
          if (phone) context.contactAliasByPhone.set(phone, selection.targetId);
          if (name) context.contactAliasByName.set(name, selection.targetId);
          return;
        }

        if (task.entity === 'PRODUCTS') {
          const id = String(v(row, 'productId', 'id') || '').trim();
          const itemCode = String(v(row, 'itemCode', 'code') || '').trim().toLowerCase();
          const barcode = String(v(row, 'barcode') || '').trim();
          const name = normalizeEntityNameKey(v(row, 'productName', 'name', 'itemDescription'));
          if (id) context.productAliasById.set(id, selection.targetId);
          if (itemCode) context.productAliasByCode.set(itemCode, selection.targetId);
          if (barcode) context.productAliasByBarcode.set(barcode, selection.targetId);
          if (name) context.productAliasByName.set(name, selection.targetId);
          return;
        }

        const id = String(v(row, 'id') || '').trim();
        const code = String(v(row, 'code', 'accountCode') || '').trim().toLowerCase();
        const name = String(v(row, 'name') || '').trim().toLowerCase();
        if (id) context.accountAliasById.set(id, selection.targetId);
        if (code) context.accountAliasByCode.set(code, selection.targetId);
        if (name) context.accountAliasByName.set(name, selection.targetId);
      });
    });

    return context;
  };

  const isLikelyInvoiceDerivedTransactionRow = (row: Row) => {
    const invoiceNumber = v(row, 'invoiceNumber', 'invoice_no', 'doc_no');
    if (invoiceNumber) return true;
    const combined = `${keyNorm(v(row, 'category') || '')} ${keyNorm(v(row, 'description') || '')}`;
    return /invoice|sales_invoice|purchase_invoice|sales_return|purchase_return|expense|فاتورة/.test(combined);
  };

  const prepareBackupTasks = (scope: BackupImportScope) => {
    const candidateTasks = backupCandidates
      .map(candidate => {
        const targetEntity = resolveCandidateEntity(candidate);
        return {
          candidate,
          targetEntity,
          columnMap: resolveCandidateColumnMap(candidate, targetEntity)
        };
      })
      .filter(({ candidate, targetEntity, columnMap }) => isPreparedTaskUseful({
        id: candidate.id,
        entity: targetEntity,
        sourceLabel: candidate.sourceLabel,
        rows: candidate.rows,
        headers: candidate.headers,
        columnMap
      }));

    const tasks: PreparedImportTask[] = [];
    const pushTask = (candidate: BackupCandidate, taskEntity: ImportEntity, options?: PreparedImportTask['options']) => {
      const task: PreparedImportTask = {
        id: `${candidate.id}-${taskEntity}-${options?.balancesOnly ? 'balances' : 'main'}`,
        entity: taskEntity,
        sourceLabel: candidate.sourceLabel,
        rows: candidate.rows,
        headers: candidate.headers,
        columnMap: resolveCandidateColumnMap(candidate, taskEntity),
        options
      };
      if (isPreparedTaskUseful(task)) tasks.push(task);
    };

    candidateTasks.forEach(({ candidate, targetEntity, columnMap }) => {
      const hasOpeningData = Boolean(columnMap.openingBalance || columnMap.openingDebit || columnMap.openingCredit);
      if (scope === 'ALL_DATA') {
        if (targetEntity === 'ACCOUNTS') {
          pushTask(candidate, 'ACCOUNTS');
          if (hasOpeningData) pushTask(candidate, 'ACCOUNTS', { importOpeningBalances: true, balancesOnly: true });
        } else if (targetEntity === 'CONTACTS') {
          pushTask(candidate, 'CONTACTS');
          if (hasOpeningData) pushTask(candidate, 'CONTACTS', { importOpeningBalances: true, balancesOnly: true });
        } else if (targetEntity === 'PRODUCTS' || targetEntity === 'INVOICES' || targetEntity === 'TRANSACTIONS') {
          pushTask(candidate, targetEntity);
        }
        return;
      }

      if (scope === 'MASTER_DATA') {
        if (['ACCOUNTS', 'CONTACTS', 'PRODUCTS'].includes(targetEntity)) pushTask(candidate, targetEntity);
        return;
      }

      if (scope === 'CUSTOMERS_ONLY') {
        if (targetEntity === 'CONTACTS') pushTask(candidate, 'CONTACTS', { customersOnly: true });
        return;
      }

      if (scope === 'CUSTOMERS_WITH_BALANCES') {
        if (targetEntity === 'CONTACTS') {
          pushTask(candidate, 'CONTACTS', { customersOnly: true });
          if (hasOpeningData) pushTask(candidate, 'CONTACTS', { customersOnly: true, importOpeningBalances: true, balancesOnly: true });
        }
        return;
      }

      if (scope === 'CONTACTS_ONLY') {
        if (targetEntity === 'CONTACTS') pushTask(candidate, 'CONTACTS');
        return;
      }

      if (scope === 'ACCOUNTS_ONLY') {
        if (targetEntity === 'ACCOUNTS') pushTask(candidate, 'ACCOUNTS');
        return;
      }

      if (scope === 'ACCOUNTS_WITH_BALANCES') {
        if (targetEntity === 'ACCOUNTS') {
          pushTask(candidate, 'ACCOUNTS');
          if (hasOpeningData) pushTask(candidate, 'ACCOUNTS', { importOpeningBalances: true, balancesOnly: true });
        }
        return;
      }

      if (scope === 'PRODUCTS_ONLY') {
        if (targetEntity === 'PRODUCTS') pushTask(candidate, 'PRODUCTS');
        return;
      }

      if (scope === 'MOVEMENTS_ONLY') {
        if (targetEntity === 'INVOICES' || targetEntity === 'TRANSACTIONS') pushTask(candidate, targetEntity);
        return;
      }

      if (scope === 'TRANSACTIONS_ONLY') {
        if (targetEntity === 'TRANSACTIONS') pushTask(candidate, 'TRANSACTIONS');
        return;
      }

      if (scope === 'INVOICES_ONLY' && targetEntity === 'INVOICES') {
        pushTask(candidate, 'INVOICES');
      }
    });

    const hasInvoiceTasks = tasks.some(task => task.entity === 'INVOICES');
    const prepared = tasks
      .map(task => (
        hasInvoiceTasks && task.entity === 'TRANSACTIONS'
          ? { ...task, options: { ...(task.options || {}), skipInvoiceDerivedTransactions: true } }
          : task
      ))
      .sort((left, right) => {
        const order = (task: PreparedImportTask) => {
          if (task.entity === 'ACCOUNTS' && !task.options?.balancesOnly) return 10;
          if (task.entity === 'CONTACTS' && !task.options?.balancesOnly) return 20;
          if (task.entity === 'PRODUCTS') return 30;
          if (task.entity === 'ACCOUNTS' && task.options?.balancesOnly) return 40;
          if (task.entity === 'CONTACTS' && task.options?.balancesOnly) return 50;
          if (task.entity === 'INVOICES') return 60;
          return 70;
        };
        return order(left) - order(right);
      });

    return { tasks: prepared, scopeLabel: getBackupImportScopeLabel(scope) };
  };

  const ensureOpeningBalanceOffsetAccount = () => {
    const existing = resolveOpeningOffsetAccount(accounts);
    return existing?.id || null;

    const usedCodes = new Set(accounts.map(account => String(account.code || '').trim()));
    let code = '3499';
    let attempt = 0;
    while (usedCodes.has(code) && attempt < 25) {
      attempt += 1;
      code = `349${Math.max(0, 9 - attempt)}`;
    }

    const payload: Account = {
      id: 'acc_import_opening_balances',
      code,
      name: tr('أرصدة افتتاحية مستوردة', 'Imported opening balances'),
      type: 'EQUITY',
      balance: 0,
      parentId: 'acc_opening_balances_group',
      currency: baseCurrency
    };

    const result = addAccount(payload);
    return result.ok ? payload.id : (resolveOpeningOffsetAccount(accounts)?.id || null);
  };

  const createWorkingState = (): WorkingImportState => ({
    accounts: [...accounts],
    contacts: [...contacts],
    products: [...products],
    txKeys: new Set<string>(
      transactions.map(tx => buildTransactionDuplicateKey({
        date: tx.date,
        amount: tx.amount,
        debitAccountId: tx.debitAccountId,
        creditAccountId: tx.creditAccountId,
        description: tx.description,
        category: tx.category,
        currency: tx.currency,
        exchangeRate: tx.exchangeRate,
        contactId: tx.contactId
      }))
    ),
    invoiceKeys: new Set<string>(
      invoices.map(invoice => buildInvoiceDuplicateKey({
        invoiceNumber: invoice.invoiceNumber,
        invoiceMode: invoice.category || invoice.type,
        date: invoice.date,
        contactName: contacts.find(contact => contact.id === invoice.customerId)?.name,
        totalAmount: invoice.totalAmount
      }))
    )
  });

  const executeContactBalanceTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    for (const row of taskRows) {
      const reviewSelection = resolvePreparedReviewSelection(reviewContext, task, row);
      if (reviewSelection?.decision === 'SKIP') {
        summaryState.skipped++;
        continue;
      }
      const rowNo = row.__rowNumber || 0;
      const candidate = resolveContactFromListWithReview(
        working.contacts,
        reviewContext,
        v(row, 'contactId', 'id'),
        v(row, 'phone'),
        v(row, 'contactName', 'name')
      );
      if (!candidate) {
        summaryState.skipped++;
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${tr('تعذر مطابقة الطرف لرصيد افتتاحي', 'Could not match contact for opening balance')}`);
        continue;
      }
      if (task.options?.customersOnly && candidate.type !== 'CUSTOMER') {
        summaryState.skipped++;
        continue;
      }
      const postingAccountId = candidate.currentAccountId || candidate.linkedAccountId || predictContactPostingAccountId(candidate);
      const postingAccount = postingAccountId ? resolveAccountFromListWithReview(working.accounts, reviewContext, postingAccountId) : null;
      const accountType = postingAccount?.type || (candidate.type === 'SUPPLIER' ? 'LIABILITY' : candidate.type === 'PARTNER' ? 'EQUITY' : 'ASSET');
      const opening = inferOpeningAmounts(row, accountType);
      const amount = round2(opening.debit || opening.credit);
      if (amount <= 0.009) {
        summaryState.skipped++;
        continue;
      }
      const offsetAccount = resolveOpeningOffsetAccount(working.accounts);
      if (!postingAccountId || !postingAccount || postingAccount.isGroup || !offsetAccount) {
        summaryState.skipped++;
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${tr('تعذر تحديد حساب الرصيد الافتتاحي للطرف', 'Could not resolve contact opening balance account')}`);
        continue;
      }
      const txKey = buildTransactionDuplicateKey({
        date: defaultOpeningDate,
        amount,
        debitAccountId: opening.debit > 0 ? postingAccountId : offsetAccount.id,
        creditAccountId: opening.debit > 0 ? offsetAccount.id : postingAccountId,
        description: `Opening balance import - ${candidate.name}`,
        category: 'opening_balance_import',
        currency: postingAccount.currency || baseCurrency,
        exchangeRate: 1,
        contactId: candidate.id
      });
      if (working.txKeys.has(txKey)) {
        summaryState.skipped++;
        continue;
      }
      if (mode === 'DRY_RUN') {
        working.txKeys.add(txKey);
        summaryState.success++;
        summaryState.inserted++;
        continue;
      }
      const result = addTransaction({
        amount,
        description: `Opening balance import - ${candidate.name}`,
        category: 'opening_balance_import',
        type: TransactionType.TRANSFER,
        date: defaultOpeningDate,
        debitAccountId: opening.debit > 0 ? postingAccountId : offsetAccount.id,
        creditAccountId: opening.debit > 0 ? offsetAccount.id : postingAccountId,
        contactId: candidate.id,
        currency: postingAccount.currency || baseCurrency,
        exchangeRate: 1,
        status: 'POSTED'
      });
      if (result.ok) {
        working.txKeys.add(txKey);
        summaryState.success++;
        summaryState.inserted++;
      } else {
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
      }
    }
  };

  const executeAccountBalanceTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    for (const row of taskRows) {
      const reviewSelection = resolvePreparedReviewSelection(reviewContext, task, row);
      if (reviewSelection?.decision === 'SKIP') {
        summaryState.skipped++;
        continue;
      }
      const rowNo = row.__rowNumber || 0;
      const account = resolveAccountFromListWithReview(
        working.accounts,
        reviewContext,
        v(row, 'id'),
        v(row, 'code', 'accountCode'),
        v(row, 'name')
      );
      if (!account || account.isGroup) {
        summaryState.skipped++;
        if (!account) {
          summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${tr('تعذر مطابقة الحساب لرصيد افتتاحي', 'Could not match account for opening balance')}`);
        }
        continue;
      }
      const opening = inferOpeningAmounts(row, account.type);
      const amount = round2(opening.debit || opening.credit);
      if (amount <= 0.009) {
        summaryState.skipped++;
        continue;
      }
      const offsetAccount = resolveOpeningOffsetAccount(working.accounts);
      if (!offsetAccount) {
        summaryState.skipped++;
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${tr('تعذر تحديد حساب مقابل للأرصدة الافتتاحية', 'Could not resolve offset account for opening balances')}`);
        continue;
      }
      const txKey = buildTransactionDuplicateKey({
        date: defaultOpeningDate,
        amount,
        debitAccountId: opening.debit > 0 ? account.id : offsetAccount.id,
        creditAccountId: opening.debit > 0 ? offsetAccount.id : account.id,
        description: `Opening balance import - ${account.name}`,
        category: 'opening_balance_import',
        currency: account.currency || baseCurrency,
        exchangeRate: 1
      });
      if (working.txKeys.has(txKey)) {
        summaryState.skipped++;
        continue;
      }
      if (mode === 'DRY_RUN') {
        working.txKeys.add(txKey);
        summaryState.success++;
        summaryState.inserted++;
        continue;
      }
      const result = addTransaction({
        amount,
        description: `Opening balance import - ${account.name}`,
        category: 'opening_balance_import',
        type: TransactionType.TRANSFER,
        date: defaultOpeningDate,
        debitAccountId: opening.debit > 0 ? account.id : offsetAccount.id,
        creditAccountId: opening.debit > 0 ? offsetAccount.id : account.id,
        currency: account.currency || baseCurrency,
        exchangeRate: 1,
        status: 'POSTED'
      });
      if (result.ok) {
        working.txKeys.add(txKey);
        summaryState.success++;
        summaryState.inserted++;
      } else {
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
      }
    }
  };

  const executeContactsTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    for (const row of taskRows) {
      const reviewSelection = resolvePreparedReviewSelection(reviewContext, task, row);
      if (reviewSelection?.decision === 'SKIP') {
        summaryState.skipped++;
        continue;
      }
      const rowNo = row.__rowNumber || 0;
      const name = String(v(row, 'name') || '').trim();
      if (!name) {
        summaryState.skipped++;
        continue;
      }
      const type = parseContactType(v(row, 'type'));
      if (task.options?.customersOnly && type !== 'CUSTOMER') {
        summaryState.skipped++;
        continue;
      }
      const phone = String(v(row, 'phone') || '').trim() || undefined;
      const address = String(v(row, 'address') || '').trim() || undefined;
      const rawId = String(v(row, 'id') || '').trim();
      const manualMergeTarget = reviewSelection?.decision === 'MERGE' && reviewSelection.targetId
        ? working.contacts.find(contact => contact.id === reviewSelection.targetId) || null
        : null;
      const autoMatched = reviewSelection?.decision === 'CREATE'
        ? null
        : resolveContactFromListWithReview(working.contacts, reviewContext, rawId, phone, name);
      const existing = manualMergeTarget || autoMatched;
      if (!existing && isCommercialContactType(type)) {
        const similar = findSimilarCommercialContact(working.contacts, name);
        if (similar) {
          summaryState.warnings.push(buildSimilarNameWarning(
            task.sourceLabel,
            tr('صف', 'Row'),
            rowNo,
            tr('الطرف', 'contact'),
            'contact',
            name,
            similar.name,
            buildSuggestedName(name, working.contacts.map(contact => contact.name))
          ));
        }
      }
      const isManualMerge = Boolean(manualMergeTarget && manualMergeTarget.id !== autoMatched?.id);
      const selectedPostingAccountId = reviewSelection?.postingAccountId
        || existing?.currentAccountId
        || existing?.linkedAccountId;
      const contactId = existing?.id || rawId || `imp_contact_${sanitizeImportKey(phone || name || rowNo) || rowNo}`;
      const payload: Contact = {
        id: contactId,
        name: isManualMerge ? existing?.name || name : name,
        type: isManualMerge ? existing?.type || type : type,
        phone: phone || existing?.phone,
        address: address || existing?.address,
        linkedAccountId: selectedPostingAccountId || existing?.linkedAccountId,
        currentAccountId: selectedPostingAccountId || existing?.currentAccountId,
        capitalAccountId: existing?.capitalAccountId,
        drawingsAccountId: existing?.drawingsAccountId
      };

      if (existing) {
        if (mode === 'IMPORT') {
          const result = updateContact(existing.id, {
            name: payload.name,
            type: payload.type,
            phone: payload.phone,
            address: payload.address,
            linkedAccountId: payload.linkedAccountId,
            currentAccountId: payload.currentAccountId
          });
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingContact(working.contacts, { ...existing, ...payload });
        summaryState.updated++;
        summaryState.success++;
      } else {
        if (mode === 'IMPORT') {
          const result = addContact(payload);
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingContact(working.contacts, payload);
        summaryState.inserted++;
        summaryState.success++;
      }
    }
  };

  const executeProductsTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    for (const row of taskRows) {
      const reviewSelection = resolvePreparedReviewSelection(reviewContext, task, row);
      if (reviewSelection?.decision === 'SKIP') {
        summaryState.skipped++;
        continue;
      }
      const rowNo = row.__rowNumber || 0;
      const name = String(v(row, 'name', 'productName') || '').trim();
      if (!name) {
        summaryState.skipped++;
        continue;
      }
      const itemCode = String(v(row, 'itemCode', 'code') || '').trim() || undefined;
      const barcode = String(v(row, 'barcode') || '').trim() || undefined;
      const manualMergeTarget = reviewSelection?.decision === 'MERGE' && reviewSelection.targetId
        ? working.products.find(product => product.id === reviewSelection.targetId) || null
        : null;
      const autoMatched = reviewSelection?.decision === 'CREATE'
        ? null
        : resolveProductFromListWithReview(working.products, reviewContext, row);
      const existing = manualMergeTarget || autoMatched;
      if (!existing) {
        const similar = findSimilarProduct(working.products, name);
        if (similar) {
          summaryState.warnings.push(buildSimilarNameWarning(
            task.sourceLabel,
            tr('صف', 'Row'),
            rowNo,
            tr('الصنف', 'item'),
            'item',
            name,
            similar.name,
            buildSuggestedName(name, working.products.map(product => product.name))
          ));
        }
      }
      const isManualMerge = Boolean(manualMergeTarget && manualMergeTarget.id !== autoMatched?.id);
      const productId = existing?.id || String(v(row, 'id') || '').trim() || `imp_product_${sanitizeImportKey(itemCode || barcode || name || rowNo) || rowNo}`;
      const resolvedItemCode = isManualMerge ? existing?.itemCode || itemCode : itemCode;
      const resolvedItemCodeMode = isManualMerge
        ? (existing?.itemCodeMode === 'MANUAL' && !!normalizeItemCode(existing?.itemCode || '') ? 'MANUAL' : 'AUTO')
        : (normalizeItemCode(resolvedItemCode || '') ? 'MANUAL' : 'AUTO');
      const payload: Product = {
        id: productId,
        name: isManualMerge ? existing?.name || name : name,
        kind: existing?.kind,
        category: String(v(row, 'category') || '').trim() || undefined,
        buyPrice: n(v(row, 'buyPrice'), 0),
        sellPrice: n(v(row, 'sellPrice'), 0),
        stock: n(v(row, 'stock', 'quantity'), 0),
        itemCode: resolvedItemCode,
        itemCodeMode: resolvedItemCodeMode,
        barcode: isManualMerge ? existing?.barcode || barcode : barcode,
        expiryPeriodDays: (() => {
          const value = n(v(row, 'expiryPeriodDays'), 0);
          return value > 0 ? Math.round(value) : undefined;
        })(),
        expiryDate: isoDate(v(row, 'expiryDate')) || undefined,
        imageUrl: String(v(row, 'imageUrl') || '').trim() || undefined
      };

      if (existing) {
        if (mode === 'IMPORT') {
          const result = updateProduct(existing.id, {
            name: payload.name,
            category: payload.category,
            buyPrice: payload.buyPrice,
            sellPrice: payload.sellPrice,
            stock: payload.stock,
            itemCode: payload.itemCode,
            itemCodeMode: payload.itemCodeMode,
            barcode: payload.barcode,
            expiryPeriodDays: payload.expiryPeriodDays,
            expiryDate: payload.expiryDate,
            imageUrl: payload.imageUrl
          });
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingProduct(working.products, { ...existing, ...payload });
        summaryState.updated++;
        summaryState.success++;
      } else {
        if (mode === 'IMPORT') {
          const result = addProduct(payload);
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingProduct(working.products, payload);
        summaryState.inserted++;
        summaryState.success++;
      }
    }
  };

  const executeAccountsTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    const sortedRows = [...taskRows].sort((left, right) => {
      const leftCode = String(v(left, 'code', 'accountCode') || '').trim();
      const rightCode = String(v(right, 'code', 'accountCode') || '').trim();
      return leftCode.length - rightCode.length;
    });

    for (const row of sortedRows) {
      const reviewSelection = resolvePreparedReviewSelection(reviewContext, task, row);
      if (reviewSelection?.decision === 'SKIP') {
        summaryState.skipped++;
        continue;
      }
      const rowNo = row.__rowNumber || 0;
      const rawId = String(v(row, 'id') || '').trim();
      const code = String(v(row, 'code', 'accountCode') || '').trim();
      const name = String(v(row, 'name') || '').trim();
      if (!code && !name) {
        summaryState.skipped++;
        continue;
      }
      const manualMergeTarget = reviewSelection?.decision === 'MERGE' && reviewSelection.targetId
        ? working.accounts.find(account => account.id === reviewSelection.targetId) || null
        : null;
      const autoMatched = reviewSelection?.decision === 'CREATE'
        ? null
        : resolveAccountFromListWithReview(working.accounts, reviewContext, rawId, code, name);
      const existing = manualMergeTarget || autoMatched;
      const parentCandidate = reviewSelection?.parentId
        ? working.accounts.find(account => account.id === reviewSelection.parentId) || null
        : resolveAccountFromListWithReview(
          working.accounts,
          reviewContext,
          undefined,
          v(row, 'parentCode'),
          v(row, 'parentName')
        );
      const inferredType = (() => {
        const rawType = String(v(row, 'type') || '').trim();
        if (rawType) return parseAccountType(rawType);
        if (existing) return existing.type;
        if (parentCandidate) return parentCandidate.type;
        if (/^1/.test(code)) return 'ASSET';
        if (/^2/.test(code)) return 'LIABILITY';
        if (/^3/.test(code)) return 'EQUITY';
        if (/^4/.test(code)) return 'REVENUE';
        return 'EXPENSE';
      })();
      const isManualMerge = Boolean(manualMergeTarget && manualMergeTarget.id !== autoMatched?.id);
      const isGroup = parseBooleanLike(v(row, 'isGroup')) ?? existing?.isGroup;
      const rootParent = resolveAccountFromListWithReview(working.accounts, reviewContext, resolveAccountRootId(inferredType));
      const currency = String(v(row, 'currency') || existing?.currency || baseCurrency).trim().toUpperCase();
      const accountId = existing?.id || rawId || `imp_account_${sanitizeImportKey(code || name || rowNo) || rowNo}`;
      const payload: Account = {
        id: accountId,
        code: isManualMerge ? existing?.code || code || `IMP${String(rowNo).padStart(4, '0')}` : code || existing?.code || `IMP${String(rowNo).padStart(4, '0')}`,
        name: isManualMerge ? existing?.name || name || `Imported account ${rowNo}` : name || existing?.name || `Imported account ${rowNo}`,
        type: inferredType,
        balance: existing?.balance ?? 0,
        parentId: reviewSelection?.parentId || parentCandidate?.id || existing?.parentId || rootParent?.id,
        isGroup,
        currency: currencyCodes.has(currency) ? currency : baseCurrency
      };

      if (existing) {
        if (isManualMerge) {
          upsertWorkingAccount(working.accounts, existing);
          summaryState.updated++;
          summaryState.success++;
          continue;
        }
        if (mode === 'IMPORT') {
          const result = updateAccount(existing.id, {
            code: payload.code,
            name: payload.name,
            type: payload.type,
            parentId: payload.parentId,
            isGroup: payload.isGroup,
            currency: payload.currency
          });
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingAccount(working.accounts, { ...existing, ...payload });
        summaryState.updated++;
        summaryState.success++;
      } else {
        if (mode === 'IMPORT') {
          const result = addAccount(payload);
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingAccount(working.accounts, payload);
        summaryState.inserted++;
        summaryState.success++;
      }
    }
  };

  const executeTransactionsTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    for (const row of taskRows) {
      const rowNo = row.__rowNumber || 0;
      if (task.options?.skipInvoiceDerivedTransactions && isLikelyInvoiceDerivedTransactionRow(row)) {
        summaryState.skipped++;
        continue;
      }
      const date = isoDate(v(row, 'date'));
      const amount = n(v(row, 'amount'), 0);
      const debit = resolveAccountFromListWithReview(working.accounts, reviewContext, v(row, 'debitAccountId'), v(row, 'debitAccountCode'));
      const credit = resolveAccountFromListWithReview(working.accounts, reviewContext, v(row, 'creditAccountId'), v(row, 'creditAccountCode'));
      if (!date || amount <= 0 || !debit || !credit || debit.isGroup || credit.isGroup) {
        summaryState.skipped++;
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${tr('بيانات مطلوبة مفقودة (التاريخ/المبلغ/المدين/الدائن)', 'Missing required data (date/amount/debit/credit)')}`);
        continue;
      }
      const contact = resolveContactFromListWithReview(
        working.contacts,
        reviewContext,
        v(row, 'contactId'),
        v(row, 'phone'),
        v(row, 'contactName', 'name')
      );
      const currency = String(v(row, 'currency') || baseCurrency).trim().toUpperCase();
      const description = String(v(row, 'description') || tr('حركة مستوردة', 'Imported transaction')).trim();
      const category = String(v(row, 'category') || 'imported').trim() || 'imported';
      const exchangeRate = Math.max(0.0001, n(v(row, 'exchangeRate'), 1));
      const explicitImportKey = String(v(row, 'importKey') || '').trim();
      const txKey = explicitImportKey || buildTransactionDuplicateKey({
        date,
        amount,
        debitAccountId: debit.id,
        creditAccountId: credit.id,
        description,
        category,
        currency: currencyCodes.has(currency) ? currency : baseCurrency,
        exchangeRate,
        contactId: contact?.id
      });
      if (working.txKeys.has(txKey)) {
        summaryState.skipped++;
        continue;
      }
      if (mode === 'DRY_RUN') {
        working.txKeys.add(txKey);
        summaryState.success++;
        summaryState.inserted++;
        continue;
      }
      const result = addTransaction({
        amount,
        description,
        category,
        type: parseTxType(v(row, 'transactionType', 'type')),
        date,
        debitAccountId: debit.id,
        creditAccountId: credit.id,
        contactId: contact?.id,
        currency: currencyCodes.has(currency) ? currency : baseCurrency,
        exchangeRate,
        status: parsePosting(v(row, 'status'))
      });
      if (result.ok) {
        working.txKeys.add(txKey);
        summaryState.success++;
        summaryState.inserted++;
      } else {
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${rowNo}: ${result.message}`);
      }
    }
  };

  const executeInvoicesTask = async (
    task: PreparedImportTask,
    taskRows: Row[],
    mode: ImportMode,
    working: WorkingImportState,
    summaryState: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    const invoiceGroups = new Map<string, Row[]>();
    taskRows.forEach(row => {
      const invoiceNumber = String(v(row, 'invoiceNumber', 'invoice_no', 'doc_no') || '').trim();
      if (!invoiceNumber) {
        summaryState.skipped++;
        summaryState.errors.push(`${task.sourceLabel}: ${tr('صف', 'Row')} ${row.__rowNumber}: ${tr('رقم الفاتورة مطلوب', 'Invoice number is required')}`);
        return;
      }
      if (!invoiceGroups.has(invoiceNumber)) invoiceGroups.set(invoiceNumber, []);
      invoiceGroups.get(invoiceNumber)!.push(row);
    });

    for (const [invoiceNumber, groupRows] of invoiceGroups) {
      const first = groupRows[0];
      const invoiceMode = parseInvoiceMode(v(first, 'invoiceMode'));
      const date = isoDate(v(first, 'date'));
      if (!date) {
        summaryState.skipped++;
        summaryState.errors.push(`${task.sourceLabel}: ${tr('فاتورة', 'Invoice')} ${invoiceNumber}: ${tr('تاريخ غير صالح', 'Invalid date')}`);
        continue;
      }

      let contact = resolveContactFromListWithReview(
        working.contacts,
        reviewContext,
        v(first, 'contactId'),
        v(first, 'phone'),
        v(first, 'contactName', 'name')
      );
      const contactName = String(v(first, 'contactName', 'name') || '').trim();
      const phone = String(v(first, 'phone') || '').trim() || undefined;
      if (!contact && contactName) {
        const inferredType: Contact['type'] = ['SALES', 'SALES_RETURN', 'QUOTATION'].includes(invoiceMode) ? 'CUSTOMER' : 'SUPPLIER';
        const similar = findSimilarCommercialContact(working.contacts, contactName);
        if (similar) {
          summaryState.warnings.push(buildSimilarNameWarning(
            task.sourceLabel,
            tr('فاتورة', 'Invoice'),
            invoiceNumber,
            tr('الطرف', 'contact'),
            'contact',
            contactName,
            similar.name,
            buildSuggestedName(contactName, working.contacts.map(existingContact => existingContact.name))
          ));
        }
        const createdContact: Contact = {
          id: `imp_contact_${sanitizeImportKey(phone || contactName || invoiceNumber) || invoiceNumber}`,
          name: contactName,
          type: inferredType,
          phone
        };
        if (mode === 'IMPORT') {
          const result = addContact(createdContact);
          if (!result.ok) {
            summaryState.errors.push(`${task.sourceLabel}: ${tr('فاتورة', 'Invoice')} ${invoiceNumber}: ${result.message}`);
            continue;
          }
        }
        upsertWorkingContact(working.contacts, createdContact);
        contact = createdContact;
      }

      const items: Omit<InvoiceItem, 'id'>[] = groupRows.map(row => {
        const quantity = n(v(row, 'quantity'), 1) || 1;
        const unitPrice = n(v(row, 'unitPrice', 'price'), 0);
        const explicitTotal = v(row, 'lineTotal');
        const total = explicitTotal !== undefined ? n(explicitTotal, quantity * unitPrice) : quantity * unitPrice;
        const product = resolveProductFromListWithReview(working.products, reviewContext, row);
        const item: Omit<InvoiceItem, 'id'> = {
          productId: product?.id,
          description: String(v(row, 'itemDescription', 'productName', 'name') || product?.name || tr('بند مستورد', 'Imported item')).trim(),
          quantity,
          unitPrice,
          total
        };
        if (invoiceMode === 'EXPENSES' || invoiceMode === 'IMPORT_EXPENSES') {
          const expenseAccount = resolveAccountFromListWithReview(working.accounts, reviewContext, v(row, 'accountId'), v(row, 'accountCode'));
          if (expenseAccount && !expenseAccount.isGroup) item.accountId = expenseAccount.id;
        }
        return item;
      });

      const subTotal = round2(items.reduce((sum, item) => sum + (Number(item.total) || 0), 0));
      const discountAmount = n(v(first, 'discountAmount'), 0);
      const taxRate = n(v(first, 'taxRate'), 0);
      const taxAmount = v(first, 'taxAmount') !== undefined
        ? n(v(first, 'taxAmount'), 0)
        : round2(((subTotal - discountAmount) * taxRate) / 100);
      const totalAmount = v(first, 'totalAmount') !== undefined
        ? n(v(first, 'totalAmount'), subTotal - discountAmount + taxAmount)
        : round2(subTotal - discountAmount + taxAmount);
      const invoiceKey = buildInvoiceDuplicateKey({
        invoiceNumber,
        invoiceMode,
        date,
        contactName: contact?.name || contactName,
        totalAmount
      });
      if (working.invoiceKeys.has(invoiceKey)) {
        summaryState.skipped++;
        continue;
      }

      const paymentType = parsePayType(v(first, 'paymentType'));
      const postingStatus = invoiceMode === 'QUOTATION' ? 'DRAFT' : parsePosting(v(first, 'postingStatus'));
      const paymentAccount = resolveAccountFromListWithReview(working.accounts, reviewContext, v(first, 'paymentAccountId'), v(first, 'paymentAccountCode'));
      const warehouseId = (() => {
        const byId = v(first, 'warehouseId');
        const byName = String(v(first, 'warehouseName') || '').trim().toLowerCase();
        return (byId && whById.get(String(byId))?.id) || (byName && whByName.get(byName)?.id) || undefined;
      })();

      let category = 'sales_invoice';
      let type = TransactionType.INCOME;
      let status: Invoice['status'] = paymentType === 'CASH' ? 'PAID' : 'PENDING';
      const expenseStyle = invoiceMode === 'EXPENSES' || invoiceMode === 'IMPORT_EXPENSES';
      if (invoiceMode === 'PURCHASES') {
        category = 'purchase_invoice';
        type = TransactionType.EXPENSE;
      } else if (invoiceMode === 'EXPENSES') {
        category = 'general_expense';
        type = TransactionType.EXPENSE;
      } else if (invoiceMode === 'IMPORT_EXPENSES') {
        category = 'import_expenses';
        type = TransactionType.EXPENSE;
      } else if (invoiceMode === 'SALES_RETURN') {
        category = 'sales_return';
        type = TransactionType.EXPENSE;
      } else if (invoiceMode === 'PURCHASE_RETURN') {
        category = 'purchase_return';
        type = TransactionType.INCOME;
      } else if (invoiceMode === 'QUOTATION') {
        status = 'QUOTATION';
      }

      if (mode === 'DRY_RUN') {
        working.invoiceKeys.add(invoiceKey);
        summaryState.success++;
        summaryState.inserted++;
        continue;
      }

      const result = await createInvoice({
        invoiceNumber,
        customerId: contact?.id,
        type,
        category,
        date,
        dueDate: isoDate(v(first, 'dueDate')) || undefined,
        items: items.map(item => ({ ...item, id: `tmp_${Math.random().toString(36).slice(2, 8)}` })),
        subTotal,
        taxRate,
        taxAmount,
        discountAmount,
        totalAmount,
        status,
        postingStatus,
        paymentType,
        paymentAccountId: paymentAccount?.id,
        notes: String(v(first, 'description') || '').trim() || undefined,
        currency: (() => {
          const value = String(v(first, 'currency') || baseCurrency).trim().toUpperCase();
          return currencyCodes.has(value) ? value : baseCurrency;
        })(),
        exchangeRate: Math.max(0.0001, n(v(first, 'exchangeRate'), 1)),
        warehouseId: expenseStyle ? undefined : warehouseId
      });

      if (result.ok) {
        working.invoiceKeys.add(invoiceKey);
        summaryState.success++;
        summaryState.inserted++;
      } else {
        summaryState.errors.push(`${task.sourceLabel}: ${tr('فاتورة', 'Invoice')} ${invoiceNumber}: ${result.message}`);
      }
    }
  };

  const executePreparedTasks = async (
    preparedTasks: PreparedImportTask[],
    mode: ImportMode,
    seedSummary?: ImportSummary,
    reviewContext?: ImportExecutionReviewContext
  ) => {
    const working = createWorkingState();
    const summaryState: ImportSummary = seedSummary
      ? { ...seedSummary, errors: [...seedSummary.errors], warnings: [...seedSummary.warnings] }
      : { mode, totalRows: 0, success: 0, inserted: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

    for (const task of preparedTasks) {
      const taskRows = buildMappedRows(task.rows, task.entity, task.columnMap);
      summaryState.totalRows += taskRows.length;

      if (task.entity === 'CONTACTS' && task.options?.balancesOnly) {
        await executeContactBalanceTask(task, taskRows, mode, working, summaryState, reviewContext);
        continue;
      }
      if (task.entity === 'ACCOUNTS' && task.options?.balancesOnly) {
        await executeAccountBalanceTask(task, taskRows, mode, working, summaryState, reviewContext);
        continue;
      }
      if (task.entity === 'CONTACTS') {
        await executeContactsTask(task, taskRows, mode, working, summaryState, reviewContext);
        continue;
      }
      if (task.entity === 'PRODUCTS') {
        await executeProductsTask(task, taskRows, mode, working, summaryState, reviewContext);
        continue;
      }
      if (task.entity === 'ACCOUNTS') {
        await executeAccountsTask(task, taskRows, mode, working, summaryState, reviewContext);
        continue;
      }
      if (task.entity === 'TRANSACTIONS') {
        await executeTransactionsTask(task, taskRows, mode, working, summaryState, reviewContext);
        continue;
      }
      await executeInvoicesTask(task, taskRows, mode, working, summaryState, reviewContext);
    }

    return summaryState;
  };

  const openPreparedBackupReview = () => {
    if (backupCandidates.length === 0) {
      alert(tr('قم بتحليل ملف خارجي أولاً.', 'Analyze an external file first.'));
      return;
    }

    const { tasks, scopeLabel } = prepareBackupTasks(backupImportScope);
    if (tasks.length === 0) {
      setBackupAnalysisError(tr('لم يتم العثور على جداول قابلة للاستيراد ضمن هذا النطاق.', 'No importable datasets were found for this scope.'));
      return;
    }

    const review = buildPreparedBackupReview(tasks, 'IMPORT', scopeLabel);
    setPreparedBackupReview(review);
    setPreparedBackupTaskSelection(Object.fromEntries(tasks.map(task => [task.id, true])));
    setPreparedBackupItemSelections(Object.fromEntries(review.items.map(item => [item.id, {
      decision: 'AUTO' as PreparedImportReviewDecision,
      targetId: item.autoMatchId || '',
      parentId: item.suggestedParentId || '',
      postingAccountId: item.suggestedPostingAccountId || ''
    }])));
    setSummary(null);
    setError('');
    setBackupAnalysisError('');
    setPostImportReviewActions([]);
    setBackupAnalysisNote(tr('راجع البيانات والمطابقات ثم أكد الاستيراد النهائي.', 'Review data and matches, then confirm the final import.'));
  };

  const runReviewedPreparedBackupImport = async () => {
    if (!preparedBackupReview) return;

    const selectedTasks = preparedBackupReview.tasks.filter(task => preparedBackupTaskSelection[task.id] !== false);
    if (selectedTasks.length === 0) {
      setBackupAnalysisError(tr('اختر على الأقل جدولاً واحداً قبل تأكيد الاستيراد.', 'Select at least one dataset before confirming import.'));
      return;
    }

    const filteredSelections = Object.fromEntries(
      Object.entries(preparedBackupItemSelections).filter(([itemId]) => {
        const item = preparedBackupReview.items.find(reviewItem => reviewItem.id === itemId);
        return item && preparedBackupTaskSelection[item.taskId] !== false;
      })
    ) as Record<string, PreparedImportReviewSelection>;
    const missingMergeTarget = preparedBackupReview.items.find(item => {
      if (preparedBackupTaskSelection[item.taskId] === false) return false;
      const selection = filteredSelections[item.id];
      return selection?.decision === 'MERGE' && !selection.targetId && !item.autoMatchId;
    });
    if (missingMergeTarget) {
      setBackupAnalysisError(tr('يوجد عنصر مضبوط على الدمج بدون اختيار السجل الحالي المقابل له.', 'At least one item is set to merge without selecting the matching existing record.'));
      return;
    }
    const reviewContext = buildImportExecutionReviewContext(selectedTasks, filteredSelections);
    const reviewActions = buildPostImportReviewActions(selectedTasks);

    setPreparedBackupReview(null);
    setImporting(true);
    setRunningMode('IMPORT');
    setSummary(null);
    setPostImportReviewActions([]);
    setError('');
    setBackupAnalysisError('');

    try {
      if (selectedTasks.some(task => taskHasOpeningBalanceColumns(task) && task.options?.importOpeningBalances)) {
        ensureOpeningBalanceOffsetAccount();
      }

      const phaseOneTasks = selectedTasks.filter(task => !task.options?.balancesOnly && ['ACCOUNTS', 'CONTACTS', 'PRODUCTS'].includes(task.entity));
      const phaseTwoTasks = selectedTasks.filter(task => !phaseOneTasks.includes(task));
      const phaseOneSummary = phaseOneTasks.length > 0
        ? await executePreparedTasks(phaseOneTasks, 'IMPORT', undefined, reviewContext)
        : { mode: 'IMPORT' as const, totalRows: 0, success: 0, inserted: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

      if (phaseTwoTasks.length > 0) {
        setPendingBackupPhase({
          remainingTasks: phaseTwoTasks,
          aggregate: phaseOneSummary,
          finalScopeLabel: preparedBackupReview.scopeLabel,
          reviewActions,
          reviewContext
        });
        setBackupAnalysisNote(tr('تم اعتماد البيانات الأساسية، ويجري الآن إكمال الحركات والأرصدة المحددة...', 'Master data approved. Completing the selected movements and balances...'));
        return;
      }

      setSummary(phaseOneSummary);
      setPostImportReviewActions(reviewActions);
      setBackupAnalysisNote(tr(`اكتمل الاستيراد المعتمد لنطاق ${preparedBackupReview.scopeLabel}.`, `Confirmed import completed for scope ${preparedBackupReview.scopeLabel}.`));
    } finally {
      const requiresSecondPhase = selectedTasks.some(task =>
        task.entity === 'INVOICES' || task.entity === 'TRANSACTIONS' || task.options?.balancesOnly
      );
      if (!requiresSecondPhase) {
        setImporting(false);
        setRunningMode(null);
      }
    }
  };

  const runPreparedBackupImport = async (mode: ImportMode) => {
    if (backupCandidates.length === 0) {
      alert(tr('قم بتحليل ملف خارجي أولاً.', 'Analyze an external file first.'));
      return;
    }

    const { tasks, scopeLabel } = prepareBackupTasks(backupImportScope);
    if (tasks.length === 0) {
      setBackupAnalysisError(tr('لم يتم العثور على جداول قابلة للاستيراد ضمن هذا النطاق.', 'No importable datasets were found for this scope.'));
      return;
    }

    if (mode === 'IMPORT') {
      openPreparedBackupReview();
      return;
    }

    setPreparedBackupReview(null);
    setImporting(true);
    setRunningMode(mode);
    setSummary(null);
    setPostImportReviewActions([]);
    setError('');
    setBackupAnalysisError('');
    const reviewActions: PostImportReviewAction[] = [];

    try {
      if (mode === 'DRY_RUN') {
        const dryRunSummary = await executePreparedTasks(tasks, mode);
        setSummary(dryRunSummary);
        setBackupAnalysisNote(tr(`اكتمل الفحص الذكي لنطاق ${scopeLabel}.`, `Smart dry run completed for scope ${scopeLabel}.`));
        return;
      }

      const phaseOneTasks = tasks.filter(task => !task.options?.balancesOnly && ['ACCOUNTS', 'CONTACTS', 'PRODUCTS'].includes(task.entity));
      const phaseTwoTasks = tasks.filter(task => !phaseOneTasks.includes(task));
      const phaseOneSummary = phaseOneTasks.length > 0
        ? await executePreparedTasks(phaseOneTasks, mode)
        : { mode, totalRows: 0, success: 0, inserted: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

      if (phaseTwoTasks.length > 0) {
        setPendingBackupPhase({
          remainingTasks: phaseTwoTasks,
          aggregate: phaseOneSummary,
          finalScopeLabel: scopeLabel,
          reviewActions
        });
        setBackupAnalysisNote(tr('تم استيراد البيانات الأساسية، وجارٍ إكمال الحركات والأرصدة...', 'Master data imported. Completing movements and balances...'));
        return;
      }

      setSummary(phaseOneSummary);
      setPostImportReviewActions(reviewActions);
      setBackupAnalysisNote(tr(`اكتمل الاستيراد الذكي لنطاق ${scopeLabel}.`, `Smart import completed for scope ${scopeLabel}.`));
    } finally {
      setImporting(false);
      setRunningMode(null);
    }
  };

  useEffect(() => {
    if (!pendingBackupPhase) return;
    let cancelled = false;
    const phase = pendingBackupPhase;
    setPendingBackupPhase(null);

    const continueImport = async () => {
      try {
        const finalSummary = await executePreparedTasks(phase.remainingTasks, phase.aggregate.mode, phase.aggregate, phase.reviewContext);
        if (cancelled) return;
        setSummary(finalSummary);
        setPostImportReviewActions(phase.reviewActions);
        setBackupAnalysisNote(tr(`اكتمل الاستيراد الذكي لنطاق ${phase.finalScopeLabel}.`, `Smart import completed for scope ${phase.finalScopeLabel}.`));
      } finally {
        if (!cancelled) {
          setImporting(false);
          setRunningMode(null);
        }
      }
    };

    void continueImport();
    return () => {
      cancelled = true;
    };
  }, [pendingBackupPhase]);

  const runImport = async (mode: ImportMode = 'IMPORT') => {
    if (!effectiveRows.length) {
      alert(tr('اختر ملفًا أولًا.', 'Select a file first.'));
      return;
    }

    setImporting(true);
    setRunningMode(mode);
    setSummary(null);
    setPostImportReviewActions([]);
    setError('');

    try {
      const manualTasks: PreparedImportTask[] = [{
        id: `manual-${entity.toLowerCase()}`,
        entity,
        sourceLabel: fileName || tr('ملف يدوي', 'Manual file'),
        rows,
        headers,
        columnMap
      }];
      const manualSummary = await executePreparedTasks(manualTasks, mode);
      setSummary(manualSummary);
      setPostImportReviewActions(mode === 'IMPORT' ? buildPostImportReviewActions(manualTasks) : []);
    } finally {
      setImporting(false);
      setRunningMode(null);
    }
  };

  const selectedPreparedReviewTasks = useMemo(
    () => preparedBackupReview
      ? preparedBackupReview.tasks.filter(task => preparedBackupTaskSelection[task.id] !== false)
      : [],
    [preparedBackupReview, preparedBackupTaskSelection]
  );
  const selectedPreparedReviewItems = useMemo(
    () => preparedBackupReview
      ? preparedBackupReview.items.filter(item => preparedBackupTaskSelection[item.taskId] !== false)
      : [],
    [preparedBackupReview, preparedBackupTaskSelection]
  );

  return (
    <div data-testid="data-import-root" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-blue-900">{tr('تحليل نسخة احتياطية/ملف برنامج آخر (ذكاء اصطناعي)', 'Analyze backup/foreign file (AI-assisted)')}</h3>
            <p className="text-xs text-blue-800/80 font-bold mt-1">
              {tr(
                'ارفع ملف نسخة احتياطية أو ملف برنامج آخر بصيغ مثل JSON وExcel/CSV أو قاعدة SQLite مثل db وsqlite. سيحلل النظام الجداول ويقترح نوع البيانات وربط الأعمدة، ثم يمكنك تحميل النتيجة لمسار الاستيراد العادي.',
                'Upload a backup file or foreign-system file such as JSON, Excel/CSV, or a SQLite database like db/sqlite. The app analyzes datasets, suggests entity type and column mapping, then loads the result into the normal importer.'
              )}
            </p>
          </div>
          <label data-testid="data-import-analyze-trigger" className="px-3 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-black cursor-pointer flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {backupAnalysisLoading ? tr('جارٍ التحليل...', 'Analyzing...') : tr('تحليل ملف خارجي', 'Analyze external file')}
            <input
              type="file"
              accept={BACKUP_ANALYSIS_ACCEPT_ATTR}
              data-testid="data-import-analyze-input"
              className="hidden"
              onChange={async (e) => {
                const input = e.currentTarget;
                const f = input.files?.[0];
                if (!f) return;
                await analyzeBackupFile(f);
                input.value = '';
              }}
            />
          </label>
        </div>

        {!hasAiKey && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
            {tr('تنبيه: سيتم استخدام تحليل ذكي محلي. لتحسين المطابقة بالذكاء الاصطناعي فعّل مفتاح Gemini.', 'Note: Local smart analysis is used. Enable Gemini API key for AI-enhanced mapping.')}
          </div>
        )}
        {backupAnalysisLoading && (
          <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {tr('جاري تحليل الملف واكتشاف الجداول...', 'Analyzing file and discovering datasets...')}
          </div>
        )}
        {backupAnalysisError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {backupAnalysisError}
          </div>
        )}
        {backupAnalysisNote && !backupAnalysisError && (
          <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">
            {backupAnalysisNote}
          </div>
        )}

        {backupCandidates.length > 0 && (
          <div className="space-y-2">
            <div className="rounded-xl border border-blue-100 bg-white p-3 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs font-black text-gray-800">{tr('استيراد ذكي كامل من الملف', 'Smart full-file import')}</div>
                  <div className="text-[11px] text-gray-500 font-bold mt-1">
                    {tr('اختر النطاق المناسب ليتم استيراد كل الجداول المطابقة مرة واحدة مع منع التكرار قدر الإمكان.', 'Choose the scope to import all matching datasets in one pass with duplicate protection where possible.')}
                  </div>
                </div>
                <span data-testid="data-import-detected-datasets" className="text-[11px] font-black text-blue-700 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100">
                  {tr('الجداول المكتشفة', 'Detected datasets')}: {backupCandidates.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <select
                  value={backupImportScope}
                  onChange={(e) => setBackupImportScope(e.target.value as BackupImportScope)}
                  className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-black outline-none"
                >
                  <option value="ALL_DATA">{tr('كل البيانات', 'All data')}</option>
                  <option value="MASTER_DATA">{tr('البيانات الأساسية', 'Master data')}</option>
                  <option value="CUSTOMERS_ONLY">{tr('العملاء فقط', 'Customers only')}</option>
                  <option value="CUSTOMERS_WITH_BALANCES">{tr('العملاء مع الأرصدة', 'Customers with balances')}</option>
                  <option value="CONTACTS_ONLY">{tr('كل الأطراف', 'All contacts')}</option>
                  <option value="ACCOUNTS_ONLY">{tr('الحسابات فقط', 'Accounts only')}</option>
                  <option value="ACCOUNTS_WITH_BALANCES">{tr('الحسابات مع الأرصدة', 'Accounts with balances')}</option>
                  <option value="PRODUCTS_ONLY">{tr('الأصناف فقط', 'Products only')}</option>
                  <option value="MOVEMENTS_ONLY">{tr('كل الحركات', 'All movements')}</option>
                  <option value="TRANSACTIONS_ONLY">{tr('القيود فقط', 'Transactions only')}</option>
                  <option value="INVOICES_ONLY">{tr('الفواتير فقط', 'Invoices only')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => runPreparedBackupImport('DRY_RUN')}
                  data-testid="data-import-full-dry-run"
                  disabled={importing || backupAnalysisLoading}
                  className={`px-3 py-2.5 rounded-xl text-xs font-black border flex items-center justify-center gap-2 ${importing || backupAnalysisLoading ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'}`}
                >
                  {importing && runningMode === 'DRY_RUN' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {tr('فحص كامل', 'Full dry run')}
                </button>
                <button
                  type="button"
                  onClick={() => runPreparedBackupImport('IMPORT')}
                  data-testid="data-import-review-import"
                  disabled={importing || backupAnalysisLoading}
                  className={`px-3 py-2.5 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 ${importing || backupAnalysisLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {importing && runningMode === 'IMPORT' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {tr('مراجعة ثم استيراد', 'Review then import')}
                </button>
              </div>
            </div>
            {preparedBackupReview && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-black text-indigo-900">{tr('مراجعة واعتماد قبل الرفع', 'Pre-import review and approval')}</div>
                    <div className="text-[11px] text-indigo-900/80 font-bold mt-1">
                      {tr(
                        'اختر الجداول التي تريد رفعها، ثم راجع مطابقة الحسابات والعملاء والموردين والأصناف قبل التنفيذ النهائي.',
                        'Select the datasets to import, then review account, contact, supplier, customer, and item matching before the final execution.'
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-black">
                    <span className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700">
                      {tr('الجداول المحددة', 'Selected datasets')}: {selectedPreparedReviewTasks.length}/{preparedBackupReview.tasks.length}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700">
                      {tr('العناصر القابلة للمراجعة', 'Reviewable items')}: {selectedPreparedReviewItems.length}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {preparedBackupReview.tasks.map(task => (
                    <label key={task.id} className="rounded-xl border border-indigo-100 bg-white px-3 py-2 flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={preparedBackupTaskSelection[task.id] !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPreparedBackupTaskSelection(prev => {
                            const next = { ...prev, [task.id]: checked };
                            preparedBackupReview.tasks.forEach(candidateTask => {
                              if (
                                candidateTask.id !== task.id
                                && candidateTask.sourceLabel === task.sourceLabel
                                && candidateTask.entity === task.entity
                              ) {
                                next[candidateTask.id] = checked;
                              }
                            });
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-gray-800">{describePreparedTask(task)}</div>
                        <div className="text-[11px] text-gray-500 font-bold mt-1">
                          {task.sourceLabel} | {tr('الصفوف', 'Rows')}: {task.rows.length}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {selectedPreparedReviewItems.length > 0 && (
                  <div className="max-h-[520px] overflow-auto space-y-2 pr-1">
                    {selectedPreparedReviewItems.map(item => {
                      const selection = preparedBackupItemSelections[item.id] || { decision: 'AUTO' as PreparedImportReviewDecision };
                      return (
                        <div key={item.id} className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="text-xs font-black text-gray-800">{item.title}</div>
                              <div className="text-[11px] text-gray-500 font-bold mt-1">
                                {item.subtitle} | {tr('المصدر', 'Source')}: {item.sourceLabel} | {tr('صف', 'Row')}: {item.rowNumber}
                              </div>
                              {item.autoMatchLabel && (
                                <div className="text-[11px] text-emerald-700 font-black mt-1">
                                  {tr('مطابقة تلقائية', 'Auto match')}: {item.autoMatchLabel}
                                </div>
                              )}
                              {item.similarMatchLabel && (
                                <div className="text-[11px] text-amber-700 font-black mt-1">{item.similarMatchLabel}</div>
                              )}
                            </div>
                            <select
                              value={selection.decision}
                              onChange={(e) => setPreparedBackupItemSelections(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  decision: e.target.value as PreparedImportReviewDecision
                                }
                              }))}
                              className="w-full md:w-[180px] p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-black outline-none"
                            >
                              <option value="AUTO">{tr('تلقائي', 'Auto')}</option>
                              <option value="MERGE">{tr('دمج مع موجود', 'Merge with existing')}</option>
                              <option value="CREATE">{tr('إنشاء جديد', 'Create new')}</option>
                              <option value="SKIP">{tr('تخطي', 'Skip')}</option>
                            </select>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {item.preview.map((previewLine, index) => (
                              <span key={`${item.id}-preview-${index}`} className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-600">
                                {previewLine}
                              </span>
                            ))}
                          </div>

                          {selection.decision === 'MERGE' && item.targetOptions.length > 0 && (
                            <select
                              value={selection.targetId || item.autoMatchId || ''}
                              onChange={(e) => setPreparedBackupItemSelections(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  targetId: e.target.value || undefined
                                }
                              }))}
                              className="w-full p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-bold outline-none"
                            >
                              <option value="">{tr('-- اختر السجل الحالي --', '-- Select existing record --')}</option>
                              {item.targetOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          )}

                          {item.entity === 'ACCOUNTS' && selection.decision !== 'SKIP' && item.parentOptions && (
                            <select
                              value={selection.parentId || item.suggestedParentId || ''}
                              onChange={(e) => setPreparedBackupItemSelections(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  parentId: e.target.value || undefined
                                }
                              }))}
                              className="w-full p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-bold outline-none"
                            >
                              <option value="">{tr('-- الأب في شجرة الحسابات --', '-- Parent in accounts tree --')}</option>
                              {item.parentOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          )}

                          {item.entity === 'CONTACTS' && selection.decision !== 'SKIP' && item.postingAccountOptions && (
                            <select
                              value={selection.postingAccountId || item.suggestedPostingAccountId || ''}
                              onChange={(e) => setPreparedBackupItemSelections(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  postingAccountId: e.target.value || undefined
                                }
                              }))}
                              className="w-full p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-bold outline-none"
                            >
                              <option value="">{tr('-- حساب الذمة/الربط المحاسبي --', '-- Posting account --')}</option>
                              {item.postingAccountOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setPreparedBackupReview(null);
                      setPreparedBackupTaskSelection({});
                      setPreparedBackupItemSelections({});
                    }}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-xs font-black"
                  >
                    {tr('إلغاء المراجعة', 'Cancel review')}
                  </button>
                  <button
                    type="button"
                    onClick={runReviewedPreparedBackupImport}
                    disabled={importing}
                    className={`px-3 py-2 rounded-xl text-xs font-black text-white flex items-center gap-2 ${importing ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {importing && runningMode === 'IMPORT' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {tr('تأكيد الاستيراد النهائي', 'Confirm final import')}
                  </button>
                </div>
              </div>
            )}
            {backupCandidates.map((cand) => {
              const finalEntity = cand.aiEntity || cand.inferredEntity;
              const finalConfidence = cand.aiConfidence ?? cand.confidence;
              const finalReason = cand.aiReason || cand.reason;
              const mappedFields = Object.values(cand.aiColumnMap || cand.suggestedColumnMap || {}).filter(Boolean).length;
              return (
                <div key={cand.id} className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-xs font-black text-gray-800 truncate">{cand.sourceLabel}</div>
                        {cand.recommended && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-black text-emerald-700">
                            {tr('موصى به', 'Recommended')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 font-bold mt-1">
                        {tr('الصفوف', 'Rows')}: {cand.rowCount} | {tr('الأعمدة', 'Columns')}: {cand.headers.length}
                      </div>
                      <div className="text-[11px] text-gray-600 font-bold mt-1">
                        {tr('الاقتراح', 'Suggestion')}: <span className="text-blue-700">{finalEntity}</span> | {tr('الثقة', 'Confidence')}: {finalConfidence}% | {tr('ربط الحقول', 'Mapped fields')}: {mappedFields}
                      </div>
                      <div className="text-[11px] text-gray-500 font-bold mt-1">{finalReason}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyBackupCandidateToImport(cand)}
                      className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      {tr('تحميل إلى الاستيراد', 'Load into importer')}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cand.headers.slice(0, 14).map(h => (
                      <span key={`${cand.id}-${h}`} className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-700">
                        {h}
                      </span>
                    ))}
                    {cand.headers.length > 14 && (
                      <span className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-500">
                        +{cand.headers.length - 14}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-gray-800">{tr('استيراد بيانات خارجية', 'External Data Import')}</h3>
          <p className="text-xs text-gray-500 font-bold mt-1">{tr('Excel / CSV / ODS / XLSB للشركة الحالية فقط. يمكنك استيراد الأطراف والحسابات والأصناف والقيود والفواتير.', 'Excel / CSV / ODS / XLSB for the current company only. You can import contacts, accounts, products, transactions, and invoices.')}</p>
        </div>
        <button type="button" onClick={() => downloadTemplate(entity)} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black flex items-center gap-2">
          <Download className="w-4 h-4" />{tr('قالب', 'Template')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select value={entity} onChange={(e) => { setEntity(e.target.value as ImportEntity); setRows([]); setHeaders([]); setFileName(''); setSummary(null); setError(''); setColumnMap({}); }} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold">
          <option value="CONTACTS">{tr('الزبائن / الموردون / الموظفون', 'Contacts')}</option>
          <option value="ACCOUNTS">{tr('الحسابات', 'Accounts')}</option>
          <option value="PRODUCTS">{tr('الأصناف', 'Products')}</option>
          <option value="TRANSACTIONS">{tr('السجلات / القيود', 'Transactions')}</option>
          <option value="INVOICES">{tr('الفواتير (صف لكل بند)', 'Invoices (row per item)')}</option>
        </select>
        <label className="w-full p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300 cursor-pointer flex items-center justify-between gap-2 hover:bg-white transition-colors">
          <span className="text-sm font-bold text-gray-700 truncate">{fileName || tr('اختر ملف Excel/CSV/ODS', 'Choose Excel/CSV/ODS file')}</span>
          <span className="shrink-0 text-blue-600 flex items-center gap-2 text-xs font-black"><FileSpreadsheet className="w-4 h-4" />{tr('استعراض', 'Browse')}</span>
          <input type="file" accept={DIRECT_IMPORT_ACCEPT_ATTR} className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await readFile(f);
            e.currentTarget.value = '';
          }} />
        </label>
      </div>

      <div className="rounded-xl border border-gray-100 bg-slate-50 p-3">
        <p className="text-xs font-black text-gray-700 mb-1">{tr('العناوين المقبولة', 'Accepted headers')}</p>
        <p className="text-[11px] text-gray-500 font-bold mb-2">{tr('الترتيب لا يهم إذا كانت أسماء الأعمدة صحيحة.', 'Order does not matter if header names are correct.')}</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES[entity].map(h => <span key={h} className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-[11px] font-mono">{h}</span>)}
        </div>
      </div>

      {loading && <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />{tr('جاري قراءة الملف...', 'Reading file...')}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-white border border-gray-100 rounded-xl"><span className="text-gray-400 font-black">{tr('الصفوف', 'Rows')}</span><div className="font-black">{rows.length}</div></div>
            <div className="p-2 bg-white border border-gray-100 rounded-xl"><span className="text-gray-400 font-black">{tr('الأعمدة', 'Columns')}</span><div className="font-black">{headers.length}</div></div>
            <div className="p-2 bg-white border border-gray-100 rounded-xl col-span-2"><span className="text-gray-400 font-black">{tr('الملف', 'File')}</span><div className="font-black truncate">{fileName}</div></div>
          </div>

          <div className="rounded-xl border border-gray-100 overflow-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-right font-black text-gray-500">#</th>
                  {headers.slice(0, 8).map(h => <th key={h} className="p-2 text-right font-black text-gray-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((row, i) => (
                  <tr key={`${row.__rowNumber}-${i}`} className="border-t border-gray-100">
                    <td className="p-2 font-black">{row.__rowNumber}</td>
                    {headers.slice(0, 8).map(h => <td key={h} className="p-2 font-bold truncate max-w-[160px]" title={String(row[keyNorm(h)] ?? '')}>{String(row[keyNorm(h)] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-100 bg-slate-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs font-black text-gray-700">{tr('ربط الأعمدة (اختياري/مفيد)', 'Column Mapping (optional/useful)')}</p>
                <p className="text-[11px] text-gray-500 font-bold">
                  {tr('إذا كان ملفك يستخدم أسماء أعمدة مختلفة، اربطها يدويًا هنا.', 'If your file uses different column names, map them manually here.')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black text-gray-600 px-2 py-1 rounded-lg bg-white border border-gray-200">
                  {tr('المربوط', 'Mapped')}: {mappedCount}/{TEMPLATES[entity].length}
                </span>
                <button
                  type="button"
                  onClick={() => setColumnMap(autoMapColumns(entity, headers))}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-black"
                >
                  {tr('ربط تلقائي', 'Auto Map')}
                </button>
                <button
                  type="button"
                  onClick={() => setColumnMap({})}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-[11px] font-black"
                >
                  {tr('مسح الربط', 'Clear')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_auto_auto_auto] gap-2 items-center">
              <input
                value={mappingTemplateName}
                onChange={(e) => setMappingTemplateName(e.target.value)}
                placeholder={tr('اسم قالب الربط (مثال: ملف المورد X)', 'Mapping template name (e.g. Supplier X file)')}
                className="w-full p-2 bg-white rounded-lg border border-gray-200 text-[11px] font-bold outline-none"
              />
              <select
                value={selectedMappingTemplateId}
                onChange={(e) => {
                  setSelectedMappingTemplateId(e.target.value);
                  const selected = entityMappingTemplates.find(t => t.id === e.target.value);
                  if (selected) setMappingTemplateName(selected.name);
                }}
                className="w-full p-2 bg-white rounded-lg border border-gray-200 text-[11px] font-bold outline-none"
              >
                <option value="">{tr('-- قالب محفوظ --', '-- Saved template --')}</option>
                {entityMappingTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveCurrentMappingTemplate}
                className="px-2.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-black flex items-center justify-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                {tr('حفظ', 'Save')}
              </button>
              <button
                type="button"
                onClick={applySelectedMappingTemplate}
                disabled={!selectedMappingTemplateId}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-black ${selectedMappingTemplateId ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-gray-100 border border-gray-200 text-gray-400'}`}
              >
                {tr('تطبيق', 'Apply')}
              </button>
              <button
                type="button"
                onClick={deleteSelectedMappingTemplate}
                disabled={!selectedMappingTemplateId}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 ${selectedMappingTemplateId ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-gray-100 border border-gray-200 text-gray-400'}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {tr('حذف', 'Delete')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TEMPLATES[entity].map(target => (
                <div key={target} className="bg-white rounded-xl border border-gray-100 p-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-black text-gray-700 truncate">{target}</div>
                    <div className="text-[10px] text-gray-400 font-bold">{tr('حقل النظام', 'System field')}</div>
                  </div>
                  <select
                    value={columnMap[target] || ''}
                    onChange={(e) =>
                      setColumnMap(prev => ({
                        ...prev,
                        [target]: e.target.value || undefined
                      }))
                    }
                    className="w-[52%] p-2 bg-gray-50 rounded-lg border border-gray-200 text-[11px] font-bold outline-none"
                  >
                    <option value="">{tr('-- غير مربوط --', '-- Not mapped --')}</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => runImport('DRY_RUN')}
              disabled={importing}
              className={`px-4 py-3 rounded-xl text-sm font-black flex items-center gap-2 border ${importing ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'}`}
            >
              {importing && runningMode === 'DRY_RUN' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {importing && runningMode === 'DRY_RUN' ? tr('جاري الفحص...', 'Running dry run...') : tr('فحص تجريبي', 'Dry Run')}
            </button>
            <button type="button" onClick={() => runImport('IMPORT')} disabled={importing} className={`px-4 py-3 rounded-xl text-white text-sm font-black flex items-center gap-2 ${importing ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {importing && runningMode === 'IMPORT' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? tr('جاري الاستيراد...', 'Importing...') : tr('تنفيذ الاستيراد', 'Run Import')}
            </button>
          </div>
        </>
      )}

      {summary && (
        <div data-testid="data-import-summary" className="rounded-2xl border border-gray-100 bg-slate-50 p-4 space-y-3">
          {summary.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
              {tr(`يوجد ${summary.warnings.length} تنبيه بخصوص أسماء متشابهة أو تحتاج مراجعة قبل الاعتماد النهائي.`, `There are ${summary.warnings.length} warnings about similar names that should be reviewed.`)}
            </div>
          )}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-gray-800">{tr('نتيجة الاستيراد', 'Import Result')}</h4>
            {summary.errors.length === 0 && <span className="text-xs font-black text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{tr('نجاح', 'Success')}</span>}
          </div>
          <div className={`w-fit text-xs font-black px-2 py-1 rounded-lg border ${summary.mode === 'DRY_RUN' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
            {summary.mode === 'DRY_RUN' ? tr('فحص تجريبي', 'Dry Run') : tr('تم الاستيراد', 'Imported')}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="bg-white rounded-xl border p-2"><div className="text-gray-400 font-black">{tr('الصفوف', 'Rows')}</div><div className="font-black">{summary.totalRows}</div></div>
            <div className="bg-white rounded-xl border p-2"><div className="text-gray-400 font-black">{tr('نجاح', 'Success')}</div><div className="font-black text-emerald-700">{summary.success}</div></div>
            <div className="bg-white rounded-xl border p-2"><div className="text-gray-400 font-black">{tr('مضاف', 'Inserted')}</div><div className="font-black text-blue-700">{summary.inserted}</div></div>
            <div className="bg-white rounded-xl border p-2"><div className="text-gray-400 font-black">{tr('محدّث', 'Updated')}</div><div className="font-black text-indigo-700">{summary.updated}</div></div>
            <div className="bg-white rounded-xl border p-2"><div className="text-gray-400 font-black">{tr('متخطي/أخطاء', 'Skipped/Errors')}</div><div className="font-black text-rose-700">{summary.skipped + summary.errors.length}</div></div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
            {tr('يتم تطبيق الاستيراد على الشركة الحالية فقط (البيانات معزولة).', 'Import applies to current company only (data is isolated).')}
          </div>
          {summary.mode === 'IMPORT' && summary.success > 0 && postImportReviewActions.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
              <div className="text-xs font-black text-blue-800 mb-2">
                {tr('افتح البيانات المستوردة للتأكد من نجاح الاستيراد', 'Open imported data to confirm the import')}
              </div>
              <div className="flex flex-wrap gap-2">
                {postImportReviewActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => openAppNavigation(action.target)}
                    className="px-3 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-[11px] font-black hover:bg-blue-100 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {summary.warnings.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-black text-amber-800">{tr('تنبيهات الأسماء المتشابهة', 'Similar-name warnings')}</div>
                <button
                  type="button"
                  onClick={() => downloadIssuesCsv(summary)}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-black flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  {tr('تصدير التنبيهات CSV', 'Export warnings CSV')}
                </button>
              </div>
              <div className="max-h-48 overflow-auto space-y-1">
                {summary.warnings.slice(0, 60).map((warning, index) => (
                  <div key={`warning-${index}-${warning}`} className="text-[11px] font-bold text-amber-700">- {warning}</div>
                ))}
                {summary.warnings.length > 60 && <div className="text-[11px] font-bold text-gray-500">{tr('تم اختصار القائمة', 'List truncated')}</div>}
              </div>
            </div>
          )}
          {summary.errors.length > 0 && (
            <div className="bg-white rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-black text-gray-700">{tr('الأخطاء والتنبيهات', 'Errors and warnings')}</div>
                <button
                  type="button"
                  onClick={() => downloadIssuesCsv(summary)}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-black flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  {tr('تصدير الأخطاء CSV', 'Export Errors CSV')}
                </button>
              </div>
              <div className="max-h-48 overflow-auto space-y-1">
                {summary.errors.slice(0, 60).map((e, i) => <div key={`${i}-${e}`} className="text-[11px] font-bold text-rose-700">- {e}</div>)}
                {summary.errors.length > 60 && <div className="text-[11px] font-bold text-gray-500">{tr('تم اختصار القائمة', 'List truncated')}</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataImportManager;


