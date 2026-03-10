export interface BankStatementColumnMapping {
  date: string;
  amount: string;
  debit: string;
  credit: string;
  description: string;
  reference: string;
  balance: string;
}

export interface BankStatementProfile {
  id: string;
  nameAr: string;
  nameEn: string;
  mapping: BankStatementColumnMapping;
}

export interface ParsedBankStatementEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  reference: string;
  balance?: number;
  raw: Record<string, unknown>;
}

export interface ReconciliationCandidateRow {
  transactionId: string;
  date: string;
  amount: number;
  reference?: string;
  description?: string;
  isCleared: boolean;
}

export interface StatementAutoMatchResult {
  matchedTransactionIds: string[];
  unmatchedEntries: ParsedBankStatementEntry[];
  matchedEntries: ParsedBankStatementEntry[];
}

const STORAGE_KEY_PREFIX = 'al_mohaseb_bank_statement_profile_map_v1';

export const BANK_STATEMENT_PROFILES: BankStatementProfile[] = [
  {
    id: 'GENERIC_CSV',
    nameAr: 'ملف عام (CSV)',
    nameEn: 'Generic CSV',
    mapping: {
      date: 'Date',
      amount: 'Amount',
      debit: 'Debit',
      credit: 'Credit',
      description: 'Description',
      reference: 'Reference',
      balance: 'Balance'
    }
  },
  {
    id: 'BANK_OF_PALESTINE',
    nameAr: 'بنك فلسطين',
    nameEn: 'Bank of Palestine',
    mapping: {
      date: 'Transaction Date',
      amount: 'Amount',
      debit: 'Debit',
      credit: 'Credit',
      description: 'Description',
      reference: 'Reference',
      balance: 'Balance'
    }
  },
  {
    id: 'CAIRO_AMMAN_BANK',
    nameAr: 'بنك القاهرة عمان',
    nameEn: 'Cairo Amman Bank',
    mapping: {
      date: 'Date',
      amount: 'Amount',
      debit: 'Withdrawal',
      credit: 'Deposit',
      description: 'Details',
      reference: 'Reference',
      balance: 'Balance'
    }
  },
  {
    id: 'ARAB_BANK',
    nameAr: 'البنك العربي',
    nameEn: 'Arab Bank',
    mapping: {
      date: 'Value Date',
      amount: 'Amount',
      debit: 'Debit',
      credit: 'Credit',
      description: 'Description',
      reference: 'Transaction Ref',
      balance: 'Running Balance'
    }
  }
];

const storageKey = (companyId?: string | null) => `${STORAGE_KEY_PREFIX}_${companyId || 'default'}`;

const toEnglishDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));

const parseNumber = (value: unknown): number | null => {
  const normalized = toEnglishDigits(String(value ?? ''))
    .replace(/\u066B/g, '.')
    .replace(/[\u066C\u060C,]/g, '')
    .replace(/[^\d.\-]/g, '')
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseIsoDate = (value: unknown): string | null => {
  const raw = toEnglishDigits(String(value ?? '')).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ymd = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const keyByLower = (row: Record<string, unknown>) => {
  const map = new Map<string, unknown>();
  Object.keys(row).forEach(key => {
    map.set(key.trim().toLowerCase(), row[key]);
  });
  return map;
};

const rowValue = (row: Record<string, unknown>, field: string): unknown => {
  if (!field) return undefined;
  if (field in row) return row[field];
  const normalizedMap = keyByLower(row);
  return normalizedMap.get(field.trim().toLowerCase());
};

export const loadBankStatementProfileMapping = (
  companyId: string | null | undefined,
  profileId: string
): BankStatementColumnMapping => {
  const profile = BANK_STATEMENT_PROFILES.find(item => item.id === profileId) || BANK_STATEMENT_PROFILES[0];
  if (typeof window === 'undefined') return profile.mapping;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return profile.mapping;
    const parsed = JSON.parse(raw) as Record<string, Partial<BankStatementColumnMapping>>;
    return { ...profile.mapping, ...(parsed?.[profile.id] || {}) };
  } catch {
    return profile.mapping;
  }
};

export const saveBankStatementProfileMapping = (
  companyId: string | null | undefined,
  profileId: string,
  mapping: Partial<BankStatementColumnMapping>
): BankStatementColumnMapping => {
  const merged = {
    ...loadBankStatementProfileMapping(companyId, profileId),
    ...mapping
  };
  if (typeof window === 'undefined') return merged;
  let current: Record<string, Partial<BankStatementColumnMapping>> = {};
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (raw) current = JSON.parse(raw);
  } catch {
    current = {};
  }
  const next = { ...current, [profileId]: merged };
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(next));
  return merged;
};

export const parseBankStatementRows = (
  rows: Record<string, unknown>[],
  mapping: BankStatementColumnMapping
): ParsedBankStatementEntry[] => {
  return rows.flatMap((row, index) => {
    const date = parseIsoDate(rowValue(row, mapping.date));
    if (!date) return [];

    const amountDirect = parseNumber(rowValue(row, mapping.amount));
    const debit = parseNumber(rowValue(row, mapping.debit));
    const credit = parseNumber(rowValue(row, mapping.credit));
    const balance = parseNumber(rowValue(row, mapping.balance));
    const amount = amountDirect ?? ((credit || 0) - (debit || 0));
    if (!amount || Math.abs(amount) < 0.0001) return [];

    return [{
      id: `stmt_${index + 1}_${Math.random().toString(36).slice(2, 7)}`,
      date,
      amount,
      description: String(rowValue(row, mapping.description) ?? '').trim(),
      reference: String(rowValue(row, mapping.reference) ?? '').trim(),
      balance: balance == null ? undefined : balance,
      raw: row
    }];
  });
};

const dayDiff = (a: string, b: string): number => {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 30;
  return Math.floor(Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
};

const includesEitherWay = (a: string, b: string): boolean => {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
};

export const autoMatchBankStatementEntries = (
  entries: ParsedBankStatementEntry[],
  rows: ReconciliationCandidateRow[],
  options?: { maxDateDiffDays?: number; amountTolerance?: number }
): StatementAutoMatchResult => {
  const maxDateDiffDays = Math.max(0, Number(options?.maxDateDiffDays ?? 5));
  const amountTolerance = Math.max(0, Number(options?.amountTolerance ?? 0.05));
  const pendingRows = rows.filter(row => !row.isCleared);
  const usedTransactionIds = new Set<string>();
  const matchedTransactionIds: string[] = [];
  const matchedEntries: ParsedBankStatementEntry[] = [];
  const unmatchedEntries: ParsedBankStatementEntry[] = [];

  entries.forEach(entry => {
    let best: { row: ReconciliationCandidateRow; score: number } | null = null;

    pendingRows.forEach(row => {
      if (usedTransactionIds.has(row.transactionId)) return;
      const amountGap = Math.abs(Math.abs(entry.amount) - Math.abs(row.amount));
      if (amountGap > amountTolerance) return;
      const days = dayDiff(entry.date, row.date);
      if (days > maxDateDiffDays) return;

      let score = 0;
      score += Math.max(0, 70 - (days * 10));
      score += Math.max(0, 25 - (amountGap * 100));
      if (includesEitherWay(entry.reference, row.reference || '')) score += 20;
      if (includesEitherWay(entry.description, row.description || '')) score += 8;

      if (!best || score > best.score) {
        best = { row, score };
      }
    });

    if (best && best.score >= 45) {
      usedTransactionIds.add(best.row.transactionId);
      matchedTransactionIds.push(best.row.transactionId);
      matchedEntries.push(entry);
    } else {
      unmatchedEntries.push(entry);
    }
  });

  return { matchedTransactionIds, unmatchedEntries, matchedEntries };
};
