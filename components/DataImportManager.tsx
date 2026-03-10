import React, { useEffect, useMemo, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { Contact, Invoice, InvoiceItem, Product, TransactionType } from '../types';

type ImportEntity = 'CONTACTS' | 'PRODUCTS' | 'TRANSACTIONS' | 'INVOICES';
type ImportMode = 'IMPORT' | 'DRY_RUN';
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
};

const IMPORT_MAPPING_TEMPLATES_STORAGE_PREFIX = 'smart_accountant_import_mapping_templates_v1';

const TEMPLATES: Record<ImportEntity, string[]> = {
  CONTACTS: ['name', 'type', 'phone', 'address'],
  PRODUCTS: ['name', 'category', 'itemCode', 'barcode', 'buyPrice', 'sellPrice', 'stock', 'expiryPeriodDays', 'expiryDate'],
  TRANSACTIONS: ['date', 'amount', 'description', 'category', 'transactionType', 'debitAccountCode', 'creditAccountCode', 'currency', 'exchangeRate', 'status', 'contactName'],
  INVOICES: ['invoiceNumber', 'invoiceMode', 'date', 'contactName', 'phone', 'paymentType', 'currency', 'exchangeRate', 'taxRate', 'discountAmount', 'postingStatus', 'itemDescription', 'productName', 'quantity', 'unitPrice', 'lineTotal', 'accountCode']
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

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .toLowerCase();

const keyNorm = (v: unknown) => normalize(v).replace(/[\s\-]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
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
  const s = keyNorm(value);
  return ['draft', 'مسودة'].includes(s) ? 'DRAFT' : 'POSTED';
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
    const anchors = TEMPLATES[entity].filter(f => ['name', 'invoiceNumber', 'date', 'amount', 'itemCode', 'quantity'].includes(f));
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

const DataImportManager: React.FC = () => {
  const {
    companySettings,
    currentCompanyId,
    baseCurrency,
    currencies,
    contacts,
    products,
    accounts,
    warehouses,
    addContact,
    updateContact,
    addProduct,
    updateProduct,
    addTransaction,
    createInvoice
  } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

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

  const mappingTemplatesStorageKey = useMemo(
    () => `${IMPORT_MAPPING_TEMPLATES_STORAGE_PREFIX}:${currentCompanyId || 'default'}`,
    [currentCompanyId]
  );

  const currencyCodes = useMemo(() => new Set([baseCurrency, ...currencies.map(c => c.code)]), [baseCurrency, currencies]);
  const accByCode = useMemo(() => new Map(accounts.map(a => [String(a.code).trim().toLowerCase(), a])), [accounts]);
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const contactById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const contactByPhone = useMemo(() => new Map(contacts.filter(c => c.phone).map(c => [String(c.phone).trim(), c])), [contacts]);
  const contactByName = useMemo(() => new Map(contacts.map(c => [c.name.trim().toLowerCase(), c])), [contacts]);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const productByCode = useMemo(() => new Map(products.filter(p => p.itemCode).map(p => [String(p.itemCode).trim().toLowerCase(), p])), [products]);
  const productByBarcode = useMemo(() => new Map(products.filter(p => p.barcode).map(p => [String(p.barcode).trim(), p])), [products]);
  const productByName = useMemo(() => new Map(products.map(p => [p.name.trim().toLowerCase(), p])), [products]);
  const whById = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);
  const whByName = useMemo(() => new Map(warehouses.map(w => [w.name.trim().toLowerCase(), w])), [warehouses]);
  const mappedCount = useMemo(
    () => TEMPLATES[entity].filter(field => Boolean(columnMap[field])).length,
    [entity, columnMap]
  );

  const hasAiKey = Boolean(process.env.API_KEY || process.env.GEMINI_API_KEY);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(mappingTemplatesStorageKey);
      if (!raw) {
        setSavedMappingTemplates([]);
        return;
      }
      const parsed = JSON.parse(raw);
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
    } catch {
      setSavedMappingTemplates([]);
    }
  }, [mappingTemplatesStorageKey]);

  useEffect(() => {
    setSelectedMappingTemplateId('');
  }, [entity]);

  const entityMappingTemplates = useMemo(
    () => savedMappingTemplates
      .filter(t => t.entity === entity)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [savedMappingTemplates, entity]
  );

  const persistMappingTemplates = (next: ColumnMapTemplate[]) => {
    setSavedMappingTemplates(next);
    try {
      localStorage.setItem(mappingTemplatesStorageKey, JSON.stringify(next));
    } catch {
      // no-op: import still works even if template persistence fails
    }
  };

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
    if (!hasAiKey || candidates.length === 0) return candidates;
    try {
      const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY || process.env.GEMINI_API_KEY)! });
      const payload = candidates.slice(0, 8).map(c => ({
        candidateId: c.id,
        sourceLabel: c.sourceLabel,
        headers: c.headers.slice(0, 40),
        sampleRow: Object.fromEntries(
          c.headers.slice(0, 12).map(h => [h, String(c.rows[0]?.[keyNorm(h)] ?? '')])
        ),
        allowedEntities: ['CONTACTS', 'PRODUCTS', 'TRANSACTIONS', 'INVOICES']
      }));

      const prompt = `
You are helping map backup data into an ERP importer.
For each candidate dataset, classify into one entity only: CONTACTS, PRODUCTS, TRANSACTIONS, INVOICES.
Return JSON array only.
Each item schema:
{
  "candidateId": "...",
  "entity": "CONTACTS|PRODUCTS|TRANSACTIONS|INVOICES",
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
        const entity = ['CONTACTS', 'PRODUCTS', 'TRANSACTIONS', 'INVOICES'].includes(String(aiPick.entity))
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

  const analyzeBackupFile = async (file: File) => {
    setBackupAnalysisLoading(true);
    setBackupAnalysisError('');
    setBackupAnalysisNote('');
    setBackupCandidates([]);
    setBackupFileName(file.name);
    try {
      const lowerName = file.name.toLowerCase();
      const candidatesRaw: Array<{ sourceLabel: string; rows: Row[]; headers: string[] }> = [];

      if (lowerName.endsWith('.json') || lowerName.endsWith('.txt')) {
        const text = await file.text();
        const data = JSON.parse(text);
        const jsonCandidates = collectJsonArrayCandidates(data);
        candidatesRaw.push(...jsonCandidates);
      } else {
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
      }

      const uniqueCandidates = candidatesRaw
        .filter(c => c.rows.length > 0 && c.headers.length > 0)
        .slice(0, 20)
        .map((c, idx) => {
          const inferred = inferEntityFromHeaders(c.headers);
          return {
            id: `cand_${idx + 1}`,
            sourceLabel: c.sourceLabel,
            rows: c.rows,
            headers: c.headers,
            rowCount: c.rows.length,
            inferredEntity: inferred.entity,
            confidence: inferred.confidence,
            reason: inferred.reason,
            suggestedColumnMap: inferred.columnMap
          } satisfies BackupCandidate;
        });

      if (!uniqueCandidates.length) {
        setBackupAnalysisError(tr('لم يتم العثور على جداول قابلة للتحليل داخل الملف.', 'No analyzable tables were found in the file.'));
        return;
      }

      setBackupAnalysisNote(
        hasAiKey
          ? tr('تم تنفيذ تحليل أولي، وجارٍ تحسين الاقتراحات بالذكاء الاصطناعي...', 'Initial analysis completed, improving suggestions with AI...')
          : tr('تم التحليل الذكي المحلي. لإضافة تحسين بالذكاء الاصطناعي فعّل مفتاح Gemini.', 'Local smart analysis completed. Add Gemini API key for AI-enhanced mapping.')
      );
      setBackupCandidates(uniqueCandidates);

      const aiEnhanced = await analyzeBackupWithAi(uniqueCandidates);
      setBackupCandidates(aiEnhanced);
      setBackupAnalysisNote(
        hasAiKey
          ? tr('تم تحليل الملف واقتراح الربط بالذكاء الاصطناعي. اختر الجدول المناسب ثم حمّله للاستيراد.', 'File analyzed and AI suggestions prepared. Choose a dataset and load it into import.')
          : tr('تم تحليل الملف محليًا. يمكنك تحميل الجدول المناسب ثم تنفيذ الفحص/الاستيراد.', 'File analyzed locally. You can load the appropriate dataset and run dry-run/import.')
      );
    } catch {
      setBackupAnalysisError(tr('تعذر تحليل ملف النسخة الاحتياطية. استخدم JSON أو Excel/CSV صالح.', 'Could not analyze backup file. Use a valid JSON or Excel/CSV file.'));
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

  const downloadErrorsCsv = (nextSummary: ImportSummary) => {
    if (nextSummary.errors.length === 0) return;
    const csv = [
      ['index', 'mode', 'entity', 'message'],
      ...nextSummary.errors.map((msg, i) => [String(i + 1), nextSummary.mode, entity, msg])
    ].map(cols => cols.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${entity.toLowerCase()}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
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
    return (id && contactById.get(String(id))) || (phone && contactByPhone.get(String(phone).trim())) || (name && contactByName.get(String(name).trim().toLowerCase())) || null;
  };
  const ensureContact = (name: string, type: Contact['type'], phone?: string) => {
    const found = (phone && contactByPhone.get(phone)) || contactByName.get(name.trim().toLowerCase());
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
      || (name && productByName.get(String(name).trim().toLowerCase()))
      || null;
  };

  const runImport = async (mode: ImportMode = 'IMPORT') => {
    if (!effectiveRows.length) return alert(tr('اختر ملفًا أولًا.', 'Select a file first.'));
    setImporting(true);
    setRunningMode(mode);
    setSummary(null);
    const result: ImportSummary = { mode, totalRows: effectiveRows.length, success: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
    try {
      if (entity === 'CONTACTS') {
        for (const row of effectiveRows) {
          const name = String(v(row, 'name', 'الاسم') || '').trim();
          if (!name) { result.skipped++; continue; }
          const type = parseContactType(v(row, 'type', 'النوع'));
          const phone = String(v(row, 'phone', 'الهاتف', 'الجوال') || '').trim() || undefined;
          const address = String(v(row, 'address', 'العنوان') || '').trim() || undefined;
          const id = String(v(row, 'id') || '').trim() || undefined;
          const existing = (id && contactById.get(id)) || (phone && contactByPhone.get(phone)) || contactByName.get(name.toLowerCase());
          if (existing) {
            if (mode === 'IMPORT') updateContact(existing.id, { name, type, phone, address });
            result.updated++;
          }
          else {
            if (mode === 'IMPORT') addContact({ id, name, type, phone, address });
            result.inserted++;
          }
          result.success++;
        }
      } else if (entity === 'PRODUCTS') {
        for (const row of effectiveRows) {
          const name = String(v(row, 'name', 'productName', 'اسم_الصنف') || '').trim();
          if (!name) { result.skipped++; continue; }
          const itemCode = String(v(row, 'itemCode', 'code', 'رمز_الصنف') || '').trim() || undefined;
          const barcode = String(v(row, 'barcode', 'الباركود') || '').trim() || undefined;
          const existing = (v(row, 'id', 'productId') && productById.get(String(v(row, 'id', 'productId'))))
            || (itemCode && productByCode.get(itemCode.toLowerCase()))
            || (barcode && productByBarcode.get(barcode))
            || productByName.get(name.toLowerCase());
          const payload = {
            name,
            category: String(v(row, 'category', 'الفئة') || '').trim() || undefined,
            buyPrice: n(v(row, 'buyPrice', 'سعر_الشراء'), 0),
            sellPrice: n(v(row, 'sellPrice', 'سعر_البيع'), 0),
            stock: n(v(row, 'stock', 'quantity', 'الكمية', 'المخزون'), 0),
            itemCode,
            barcode,
            expiryPeriodDays: (() => { const x = n(v(row, 'expiryPeriodDays', 'فترة_الصلاحية_بالأيام'), 0); return x > 0 ? Math.round(x) : undefined; })(),
            expiryDate: isoDate(v(row, 'expiryDate', 'تاريخ_الانتهاء')) || undefined,
            imageUrl: String(v(row, 'imageUrl', 'رابط_الصورة') || '').trim() || undefined
          };
          if (existing) {
            if (mode === 'IMPORT') updateProduct(existing.id, payload);
            result.updated++;
          }
          else {
            if (mode === 'IMPORT') addProduct({ ...payload });
            result.inserted++;
          }
          result.success++;
        }
      } else if (entity === 'TRANSACTIONS') {
        for (const row of effectiveRows) {
          const rowNo = row.__rowNumber || 0;
          const date = isoDate(v(row, 'date', 'التاريخ')); 
          const amount = n(v(row, 'amount', 'المبلغ'), 0);
          const debit = resolveAccount(v(row, 'debitAccountId'), v(row, 'debitAccountCode', 'رمز_الحساب_المدين'));
          const credit = resolveAccount(v(row, 'creditAccountId'), v(row, 'creditAccountCode', 'رمز_الحساب_الدائن'));
          if (!date || amount <= 0 || !debit || !credit) {
            result.skipped++;
            result.errors.push(`${tr('صف', 'Row')} ${rowNo}: ${tr('بيانات مطلوبة مفقودة (التاريخ/المبلغ/المدين/الدائن)', 'Missing required data (date/amount/debit/credit)')}`);
            continue;
          }
          const currency = String(v(row, 'currency', 'العملة') || baseCurrency).trim().toUpperCase();
          if (mode === 'DRY_RUN') {
            result.success++;
            result.inserted++;
            continue;
          }
          const res = addTransaction({
            amount,
            description: String(v(row, 'description', 'البيان') || tr('حركة مستوردة', 'Imported transaction')).trim(),
            category: String(v(row, 'category', 'الفئة') || 'imported').trim() || 'imported',
            type: parseTxType(v(row, 'transactionType', 'type', 'نوع_الحركة')),
            date,
            debitAccountId: debit.id,
            creditAccountId: credit.id,
            contactId: resolveContact(row)?.id,
            currency: currencyCodes.has(currency) ? currency : baseCurrency,
            exchangeRate: Math.max(0.0001, n(v(row, 'exchangeRate', 'سعر_الصرف'), 1)),
            status: parsePosting(v(row, 'status', 'الحالة'))
          });
          if (res.ok) result.success++, result.inserted++;
          else result.errors.push(`${tr('صف', 'Row')} ${rowNo}: ${res.message}`);
        }
      } else {
        const groups = new Map<string, Row[]>();
        for (const row of effectiveRows) {
          const invNo = String(v(row, 'invoiceNumber', 'رقم_الفاتورة') || '').trim();
          if (!invNo) { result.skipped++; result.errors.push(`${tr('صف', 'Row')} ${row.__rowNumber}: ${tr('رقم الفاتورة مطلوب', 'Invoice number is required')}`); continue; }
          if (!groups.has(invNo)) groups.set(invNo, []);
          groups.get(invNo)!.push(row);
        }
        for (const [invoiceNumber, g] of groups) {
          const first = g[0];
          const invoiceMode = parseInvoiceMode(v(first, 'invoiceMode', 'invoice_type', 'نوع_الفاتورة'));
          const date = isoDate(v(first, 'date', 'التاريخ')); 
          if (!date) { result.skipped++; result.errors.push(`${tr('فاتورة', 'Invoice')} ${invoiceNumber}: ${tr('تاريخ غير صالح', 'Invalid date')}`); continue; }
          let contact = resolveContact(first);
          const contactName = String(v(first, 'contactName', 'name', 'اسم_الطرف') || '').trim();
          const phone = String(v(first, 'phone', 'الهاتف', 'الجوال') || '').trim() || undefined;
          if (!contact && contactName) {
            const inferred: Contact['type'] = ['SALES', 'SALES_RETURN', 'QUOTATION'].includes(invoiceMode) ? 'CUSTOMER' : 'SUPPLIER';
            contact = mode === 'IMPORT'
              ? ensureContact(contactName, inferred, phone)
              : ({ id: `dry_contact_${Math.random().toString(36).slice(2, 8)}`, name: contactName, type: inferred, phone } as Contact);
          }
          const items: Omit<InvoiceItem, 'id'>[] = g.map(r => {
            const qty = n(v(r, 'quantity', 'الكمية'), 1) || 1;
            const unitPrice = n(v(r, 'unitPrice', 'price', 'سعر_الوحدة', 'السعر'), 0);
            const total = (() => {
              const explicit = v(r, 'lineTotal', 'إجمالي_السطر');
              return explicit !== undefined ? n(explicit, qty * unitPrice) : qty * unitPrice;
            })();
            const p = resolveProduct(r);
            const item: Omit<InvoiceItem, 'id'> = {
              productId: p?.id,
              description: String(v(r, 'itemDescription', 'productName', 'name', 'اسم_الصنف') || p?.name || tr('بند مستورد', 'Imported item')).trim(),
              quantity: qty,
              unitPrice,
              total
            };
            if (invoiceMode === 'EXPENSES' || invoiceMode === 'IMPORT_EXPENSES') {
              const acc = resolveAccount(v(r, 'accountId'), v(r, 'accountCode', 'رمز_الحساب'));
              if (acc) item.accountId = acc.id;
            }
            return item;
          });
          const subTotal = Number(items.reduce((s, it) => s + it.total, 0).toFixed(2));
          const discountAmount = n(v(first, 'discountAmount', 'الخصم'), 0);
          const taxRate = n(v(first, 'taxRate', 'نسبة_الضريبة'), 0);
          const taxAmount = v(first, 'taxAmount', 'قيمة_الضريبة') !== undefined
            ? n(v(first, 'taxAmount', 'قيمة_الضريبة'), 0)
            : Number((((subTotal - discountAmount) * taxRate) / 100).toFixed(2));
          const totalAmount = v(first, 'totalAmount', 'الإجمالي') !== undefined
            ? n(v(first, 'totalAmount', 'الإجمالي'), subTotal - discountAmount + taxAmount)
            : Number((subTotal - discountAmount + taxAmount).toFixed(2));
          const paymentType = parsePayType(v(first, 'paymentType', 'نوع_الدفع'));
          const postingStatus = invoiceMode === 'QUOTATION' ? 'DRAFT' : parsePosting(v(first, 'postingStatus', 'حالة_الترحيل')); 
          const paymentAcc = resolveAccount(v(first, 'paymentAccountId'), v(first, 'paymentAccountCode', 'رمز_حساب_الدفع')); 
          const whIdVal = v(first, 'warehouseId', 'معرف_المستودع');
          const whNameVal = v(first, 'warehouseName', 'اسم_المستودع');
          const warehouseId = (whIdVal && whById.get(String(whIdVal))?.id) || (whNameVal && whByName.get(String(whNameVal).trim().toLowerCase())?.id) || undefined;

          let category = 'sales_invoice';
          let type = TransactionType.INCOME;
          let status: Invoice['status'] = paymentType === 'CASH' ? 'PAID' : 'PENDING';
          const expenseStyle = invoiceMode === 'EXPENSES' || invoiceMode === 'IMPORT_EXPENSES';
          if (invoiceMode === 'PURCHASES') { category = 'purchase_invoice'; type = TransactionType.EXPENSE; }
          else if (invoiceMode === 'EXPENSES') { category = 'general_expense'; type = TransactionType.EXPENSE; }
          else if (invoiceMode === 'IMPORT_EXPENSES') { category = 'import_expenses'; type = TransactionType.EXPENSE; }
          else if (invoiceMode === 'SALES_RETURN') { category = 'sales_return'; type = TransactionType.EXPENSE; }
          else if (invoiceMode === 'PURCHASE_RETURN') { category = 'purchase_return'; type = TransactionType.INCOME; }
          else if (invoiceMode === 'QUOTATION') { status = 'QUOTATION'; }

          if (mode === 'DRY_RUN') {
            result.success++;
            result.inserted++;
            continue;
          }

          const res = await createInvoice({
            invoiceNumber,
            customerId: contact?.id,
            type,
            category,
            date,
            dueDate: isoDate(v(first, 'dueDate', 'تاريخ_الاستحقاق')) || undefined,
            items: items.map(i => ({ ...i, id: `tmp_${Math.random().toString(36).slice(2, 8)}` })),
            subTotal,
            taxRate,
            taxAmount,
            discountAmount,
            totalAmount,
            status,
            postingStatus,
            paymentType,
            paymentAccountId: paymentAcc?.id,
            notes: String(v(first, 'description', 'البيان') || '').trim() || undefined,
            currency: currencyCodes.has(String(v(first, 'currency', 'العملة') || baseCurrency).trim().toUpperCase()) ? String(v(first, 'currency', 'العملة') || baseCurrency).trim().toUpperCase() : baseCurrency,
            exchangeRate: Math.max(0.0001, n(v(first, 'exchangeRate', 'سعر_الصرف'), 1)),
            warehouseId: expenseStyle ? undefined : warehouseId
          });
          if (res.ok) result.success++, result.inserted++;
          else result.errors.push(`${tr('فاتورة', 'Invoice')} ${invoiceNumber}: ${res.message}`);
        }
      }
      setSummary(result);
    } finally {
      setImporting(false);
      setRunningMode(null);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-blue-900">{tr('تحليل نسخة احتياطية/ملف برنامج آخر (ذكاء اصطناعي)', 'Analyze backup/foreign file (AI-assisted)')}</h3>
            <p className="text-xs text-blue-800/80 font-bold mt-1">
              {tr(
                'ارفع ملف نسخة احتياطية (JSON) أو Excel/CSV من برنامج آخر. سيحلل النظام الجداول ويقترح نوع البيانات وربط الأعمدة، ثم يمكنك تحميل النتيجة لمسار الاستيراد العادي.',
                'Upload a backup file (JSON) or Excel/CSV from another system. The app analyzes datasets, suggests entity type and column mapping, then loads the result into the normal importer.'
              )}
            </p>
          </div>
          <label className="px-3 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-black cursor-pointer flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {backupAnalysisLoading ? tr('جارٍ التحليل...', 'Analyzing...') : tr('تحليل ملف خارجي', 'Analyze external file')}
            <input
              type="file"
              accept=".json,.txt,.xlsx,.xls,.csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await analyzeBackupFile(f);
                e.currentTarget.value = '';
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
            {backupCandidates.map((cand) => {
              const finalEntity = cand.aiEntity || cand.inferredEntity;
              const finalConfidence = cand.aiConfidence ?? cand.confidence;
              const finalReason = cand.aiReason || cand.reason;
              const mappedFields = Object.values(cand.aiColumnMap || cand.suggestedColumnMap || {}).filter(Boolean).length;
              return (
                <div key={cand.id} className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-gray-800 truncate">{cand.sourceLabel}</div>
                      <div className="text-[11px] text-gray-500 font-bold mt-1">
                        {tr('الصفوف', 'Rows')}: {cand.rowCount} • {tr('الأعمدة', 'Columns')}: {cand.headers.length}
                      </div>
                      <div className="text-[11px] text-gray-600 font-bold mt-1">
                        {tr('الاقتراح', 'Suggestion')}: <span className="text-blue-700">{finalEntity}</span> • {tr('الثقة', 'Confidence')}: {finalConfidence}% • {tr('ربط الحقول', 'Mapped fields')}: {mappedFields}
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
          <p className="text-xs text-gray-500 font-bold mt-1">{tr('Excel / CSV للشركة الحالية فقط. يمكنك استيراد الزبائن والأصناف والقيود والفواتير.', 'Excel / CSV for current company only. You can import contacts, products, transactions, and invoices.')}</p>
        </div>
        <button type="button" onClick={() => downloadTemplate(entity)} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black flex items-center gap-2">
          <Download className="w-4 h-4" />{tr('قالب', 'Template')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select value={entity} onChange={(e) => { setEntity(e.target.value as ImportEntity); setRows([]); setHeaders([]); setFileName(''); setSummary(null); setError(''); setColumnMap({}); }} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold">
          <option value="CONTACTS">{tr('الزبائن / الموردون / الموظفون', 'Contacts')}</option>
          <option value="PRODUCTS">{tr('الأصناف', 'Products')}</option>
          <option value="TRANSACTIONS">{tr('السجلات / القيود', 'Transactions')}</option>
          <option value="INVOICES">{tr('الفواتير (صف لكل بند)', 'Invoices (row per item)')}</option>
        </select>
        <label className="w-full p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300 cursor-pointer flex items-center justify-between gap-2 hover:bg-white transition-colors">
          <span className="text-sm font-bold text-gray-700 truncate">{fileName || tr('اختر ملف Excel/CSV', 'Choose Excel/CSV file')}</span>
          <span className="shrink-0 text-blue-600 flex items-center gap-2 text-xs font-black"><FileSpreadsheet className="w-4 h-4" />{tr('استعراض', 'Browse')}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={async (e) => {
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
        <div className="rounded-2xl border border-gray-100 bg-slate-50 p-4 space-y-3">
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
          {summary.errors.length > 0 && (
            <div className="bg-white rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-black text-gray-700">{tr('الأخطاء والتنبيهات', 'Errors and warnings')}</div>
                <button
                  type="button"
                  onClick={() => downloadErrorsCsv(summary)}
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

