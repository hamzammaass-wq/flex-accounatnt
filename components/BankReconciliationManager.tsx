import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Lightbulb,
  Landmark,
  Printer,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Upload
} from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import EnglishDateInput from './EnglishDateInput';
import DocumentActions from './DocumentActions';
import { BankMatchSuggestion, TransactionType } from '../types';
import { buildBankMatchSuggestions } from '../utils/bankAutoMatch';
import { getDisplayAccountName, getDisplayContactName } from '../utils/displayNames';
import { downloadElementAsPdf, exportElementAsCsv, extractElementReadableText, settleElementBeforeSnapshot, printHtmlContent } from '../utils/documentExport';
import { openDrilldown } from '../utils/drilldown';
import {
  BANK_STATEMENT_PROFILES,
  BankStatementColumnMapping,
  ParsedBankStatementEntry,
  autoMatchBankStatementEntries,
  loadBankStatementProfileMapping,
  parseBankStatementRows,
  saveBankStatementProfileMapping
} from '../utils/bankStatementImport';

interface BankReconciliationManagerProps {
  onBack?: () => void;
}

type ClearedMap = Record<string, Record<string, string>>;
type RowStatusFilter = 'ALL' | 'CLEARED' | 'PENDING';
type StatementRawRow = Record<string, unknown>;

const STORAGE_KEY = 'al_mohaseb_bank_reconciliation';

const toIsoDate = (value: Date) => value.toISOString().split('T')[0];

const loadClearedMap = (): ClearedMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ClearedMap) : {};
  } catch {
    return {};
  }
};

const saveClearedMap = (value: ClearedMap): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const BankReconciliationManager: React.FC<BankReconciliationManagerProps> = ({ onBack }) => {
  const { accounts, contacts, transactions, addTransaction, baseCurrency, companySettings, currentCompanyId } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayAccountName = (account?: { id: string; name: string; code?: string } | null) =>
    getDisplayAccountName(account || undefined, isEnglish);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);
  const openContactStatement = (contactId?: string) => {
    if (!contactId) return;
    openDrilldown({ kind: 'CONTACT_STATEMENT', contactId });
  };

  const bankAccounts = useMemo(
    () => accounts.filter(a => !a.isGroup && a.parentId === 'acc_bank_root'),
    [accounts]
  );

  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [statementStartDate, setStatementStartDate] = useState<string>(() => {
    const now = new Date();
    return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [statementDate, setStatementDate] = useState<string>(toIsoDate(new Date()));
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<RowStatusFilter>('ALL');
  const [adjustmentAccountId, setAdjustmentAccountId] = useState<string>('acc_bank_fees');
  const [adjustmentDescription, setAdjustmentDescription] = useState<string>('');
  const [clearedMap, setClearedMap] = useState<ClearedMap>(() => loadClearedMap());
  const [statementProfileId, setStatementProfileId] = useState<string>(
    BANK_STATEMENT_PROFILES[0]?.id || 'GENERIC_CSV'
  );
  const [statementMapping, setStatementMapping] = useState<BankStatementColumnMapping>(() =>
    loadBankStatementProfileMapping(currentCompanyId, BANK_STATEMENT_PROFILES[0]?.id || 'GENERIC_CSV')
  );
  const [statementRawRows, setStatementRawRows] = useState<StatementRawRow[]>([]);
  const [statementEntries, setStatementEntries] = useState<ParsedBankStatementEntry[]>([]);
  const [statementHeaders, setStatementHeaders] = useState<string[]>([]);
  const [statementFileName, setStatementFileName] = useState('');
  const [statementImportMsg, setStatementImportMsg] = useState('');
  const [showStatementImportTools, setShowStatementImportTools] = useState(false);
  const autoReconcileAppliedScopesRef = useRef<Set<string>>(new Set());
  const reconciliationSnapshotRef = useRef<HTMLDivElement | null>(null);
  const reconciliationExportTableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    if (!selectedBankId && bankAccounts.length > 0) {
      setSelectedBankId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankId]);

  useEffect(() => {
    saveClearedMap(clearedMap);
  }, [clearedMap]);

  useEffect(() => {
    const mapping = loadBankStatementProfileMapping(currentCompanyId, statementProfileId);
    setStatementMapping(mapping);
  }, [currentCompanyId, statementProfileId]);

  useEffect(() => {
    if (!statementRawRows.length) {
      setStatementEntries([]);
      return;
    }
    const parsed = parseBankStatementRows(statementRawRows, statementMapping);
    setStatementEntries(parsed);
  }, [statementMapping, statementRawRows]);

  const selectedBank = bankAccounts.find(a => a.id === selectedBankId);
  const currencyCode = selectedBank?.currency || baseCurrency;
  const periodStartDate = statementStartDate && statementDate && statementStartDate > statementDate ? statementDate : statementStartDate;
  const periodEndDate = statementStartDate && statementDate && statementStartDate > statementDate ? statementStartDate : statementDate;
  const statementProfile = useMemo(
    () => BANK_STATEMENT_PROFILES.find(profile => profile.id === statementProfileId) || BANK_STATEMENT_PROFILES[0],
    [statementProfileId]
  );

  const formatAmount = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const formatDate = (date: string) => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-GB');
  };

  const bankTransactions = useMemo(() => {
    if (!selectedBankId) return [];
    return transactions
      .filter(tx => tx.status !== 'DRAFT')
      .filter(tx => tx.date >= periodStartDate && tx.date <= periodEndDate)
      .filter(tx => tx.debitAccountId === selectedBankId || tx.creditAccountId === selectedBankId)
      .map(tx => {
        const debit = tx.debitAccountId === selectedBankId ? tx.amount : 0;
        const credit = tx.creditAccountId === selectedBankId ? tx.amount : 0;
        const delta = debit - credit;
        return { tx, debit, credit, delta };
      })
      .sort((a, b) => a.tx.date.localeCompare(b.tx.date));
  }, [selectedBankId, periodStartDate, periodEndDate, transactions]);

  const currentBankCleared = clearedMap[selectedBankId] || {};

  const rowsWithCleared = useMemo(
    () =>
      bankTransactions.map(row => {
        const clearedDate = currentBankCleared[row.tx.id];
        const isCleared = Boolean(clearedDate && clearedDate <= periodEndDate);
        const relatedContact = row.tx.contactId
          ? contacts.find(contact => contact.id === row.tx.contactId)
          : undefined;
        return {
          ...row,
          isCleared,
          counterparty: relatedContact ? displayContactName(relatedContact) : '',
          reference: row.tx.voucherId || row.tx.invoiceId || row.tx.id.slice(-6).toUpperCase()
        };
      }),
    [bankTransactions, currentBankCleared, periodEndDate, contacts]
  );

  useEffect(() => {
    if (!selectedBankId || rowsWithCleared.length === 0) return;
    const scopeKey = `${selectedBankId}_${periodStartDate}_${periodEndDate}`;
    if (autoReconcileAppliedScopesRef.current.has(scopeKey)) return;
    autoReconcileAppliedScopesRef.current.add(scopeKey);

    updateClearedForCurrentBank(prev => {
      const next = { ...prev };
      rowsWithCleared.forEach(row => {
        if (!next[row.tx.id]) {
          next[row.tx.id] = periodEndDate;
        }
      });
      return next;
    });
  }, [selectedBankId, periodStartDate, periodEndDate, rowsWithCleared]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return rowsWithCleared.filter(row => {
      if (statusFilter === 'CLEARED' && !row.isCleared) return false;
      if (statusFilter === 'PENDING' && row.isCleared) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        row.tx.description,
        row.tx.category,
        row.tx.date,
        row.reference,
        row.counterparty
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [rowsWithCleared, searchTerm, statusFilter]);

  const matchSuggestions: BankMatchSuggestion[] = useMemo(() => {
    const pendingRows = rowsWithCleared
      .filter(row => !row.isCleared)
      .map(row => ({
        transactionId: row.tx.id,
        date: row.tx.date,
        amount: row.delta,
        reference: row.reference,
        counterparty: row.counterparty,
        description: row.tx.description
      }));

    return buildBankMatchSuggestions(pendingRows, periodEndDate);
  }, [rowsWithCleared, periodEndDate]);

  const suggestionMap = useMemo(
    () => new Map(matchSuggestions.map(suggestion => [suggestion.transactionId, suggestion])),
    [matchSuggestions]
  );

  const bookBalance = rowsWithCleared.reduce((sum, row) => sum + row.delta, 0);
  const clearedBookBalance = rowsWithCleared.reduce((sum, row) => sum + (row.isCleared ? row.delta : 0), 0);
  const outstandingDeposits = rowsWithCleared.reduce((sum, row) => sum + (!row.isCleared && row.delta > 0 ? row.delta : 0), 0);
  const outstandingWithdrawals = rowsWithCleared.reduce((sum, row) => sum + (!row.isCleared && row.delta < 0 ? Math.abs(row.delta) : 0), 0);

  const totalCount = rowsWithCleared.length;
  const clearedCount = rowsWithCleared.filter(row => row.isCleared).length;
  const pendingCount = totalCount - clearedCount;
  const clearedRateByCount = totalCount > 0 ? Math.round((clearedCount / totalCount) * 100) : 0;

  const totalMovementValue = rowsWithCleared.reduce((sum, row) => sum + Math.abs(row.delta), 0);
  const clearedMovementValue = rowsWithCleared.reduce(
    (sum, row) => sum + (row.isCleared ? Math.abs(row.delta) : 0),
    0
  );
  const clearedRateByValue = totalMovementValue > 0 ? Math.round((clearedMovementValue / totalMovementValue) * 100) : 0;

  const parsedStatementBalance = statementBalance.trim() === ''
    ? clearedBookBalance
    : (parseFloat(statementBalance) || 0);
  const reconciliationDifference = Number((parsedStatementBalance - clearedBookBalance).toFixed(2));

  const updateClearedForCurrentBank = (updater: (prev: Record<string, string>) => Record<string, string>) => {
    if (!selectedBankId) return;
    setClearedMap(prev => {
      const prevBankMap = prev[selectedBankId] || {};
      const nextBankMap = updater(prevBankMap);
      return { ...prev, [selectedBankId]: nextBankMap };
    });
  };

  const toggleCleared = (transactionId: string) => {
    updateClearedForCurrentBank(prev => {
      const next = { ...prev };
      if (next[transactionId]) {
        delete next[transactionId];
      } else {
        next[transactionId] = periodEndDate;
      }
      return next;
    });
  };

  const markVisibleRows = (clear: boolean) => {
    updateClearedForCurrentBank(prev => {
      const next = { ...prev };
      if (clear) {
        filteredRows.forEach(row => {
          next[row.tx.id] = periodEndDate;
        });
      } else {
        filteredRows.forEach(row => {
          delete next[row.tx.id];
        });
      }
      return next;
    });
  };

  const applySuggestion = (transactionId: string) => {
    updateClearedForCurrentBank(prev => ({
      ...prev,
      [transactionId]: periodEndDate
    }));
  };

  const applyHighConfidenceSuggestions = () => {
    const strongSuggestions = matchSuggestions.filter(s => s.confidence >= 75);
    if (strongSuggestions.length === 0) return;
    updateClearedForCurrentBank(prev => {
      const next = { ...prev };
      strongSuggestions.forEach(s => {
        next[s.transactionId] = periodEndDate;
      });
      return next;
    });
  };

  const parseStatementFromFile = async (file: File | null) => {
    setStatementImportMsg('');
    setStatementRawRows([]);
    setStatementEntries([]);
    setStatementHeaders([]);
    setStatementFileName('');
    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('NO_SHEET');
      const rows = XLSX.utils.sheet_to_json<StatementRawRow>(firstSheet, { defval: '' });
      const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row || {}))));
      const parsed = parseBankStatementRows(rows, statementMapping);

      setStatementHeaders(headers);
      setStatementRawRows(rows);
      setStatementEntries(parsed);
      setStatementFileName(file.name);
      setStatementImportMsg(
        parsed.length
          ? tr(`تم تحليل ${parsed.length} حركة من كشف البنك`, `Parsed ${parsed.length} statement rows`)
          : tr('لم يتم العثور على حركات صالحة حسب الـ Mapping الحالي', 'No valid rows found using current mapping')
      );
    } catch {
      setStatementImportMsg(tr('تعذر قراءة ملف كشف البنك', 'Failed to read bank statement file'));
    }
  };

  const saveStatementMapping = () => {
    const next = saveBankStatementProfileMapping(currentCompanyId, statementProfile.id, statementMapping);
    setStatementMapping(next);
    setStatementImportMsg(tr('تم حفظ Mapping لهذا البنك بنجاح', 'Bank profile mapping saved successfully'));
  };

  const exportUnmatchedStatementRowsCsv = (rows: ParsedBankStatementEntry[]) => {
    if (rows.length === 0) return;
    const header = ['date', 'amount', 'reference', 'description', 'balance'];
    const csvEsc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [header, ...rows.map(row => [row.date, row.amount, row.reference, row.description, row.balance ?? ''])]
      .map(cols => cols.map(csvEsc).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bank-unmatched-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const applyImportedStatement = () => {
    if (!selectedBankId) {
      alert(tr('يرجى اختيار حساب بنكي أولاً', 'Please select a bank account first.'));
      return;
    }
    if (statementEntries.length === 0) {
      alert(tr('لا توجد بيانات كشف جاهزة للتطبيق', 'No parsed statement rows to apply.'));
      return;
    }

    const matchResult = autoMatchBankStatementEntries(
      statementEntries,
      rowsWithCleared.map(row => ({
        transactionId: row.tx.id,
        date: row.tx.date,
        amount: row.delta,
        reference: row.reference,
        description: row.tx.description,
        isCleared: row.isCleared
      })),
      { maxDateDiffDays: 5, amountTolerance: 0.1 }
    );

    if (matchResult.matchedTransactionIds.length > 0) {
      updateClearedForCurrentBank(prev => {
        const next = { ...prev };
        matchResult.matchedTransactionIds.forEach(txId => {
          next[txId] = periodEndDate;
        });
        return next;
      });
    }

    setStatementImportMsg(
      tr(
        `تمت مطابقة ${matchResult.matchedEntries.length} حركة، غير مطابق ${matchResult.unmatchedEntries.length}`,
        `Matched ${matchResult.matchedEntries.length} row(s), unmatched ${matchResult.unmatchedEntries.length}`
      )
    );

    if (matchResult.unmatchedEntries.length > 0) {
      exportUnmatchedStatementRowsCsv(matchResult.unmatchedEntries);
    }
  };

  const postAdjustmentEntry = () => {
    if (!selectedBankId) return alert(tr('يرجى اختيار حساب بنكي أولاً', 'Please select a bank account first.'));
    if (Math.abs(reconciliationDifference) < 0.005) return alert(tr('لا يوجد فرق يحتاج قيد تسوية', 'No reconciliation difference to adjust.'));
    if (!adjustmentAccountId) return alert(tr('يرجى اختيار حساب التسوية', 'Please select adjustment account.'));

    const amount = Math.abs(reconciliationDifference);
    const defaultDesc = tr('قيد تسوية مطابقة البنك', 'Bank reconciliation adjustment');

    const result = addTransaction({
      amount,
      description: `${adjustmentDescription.trim() || defaultDesc} - ${displayAccountName(selectedBank || null)} (${periodEndDate})`,
      category: 'bank_reconciliation',
      type: reconciliationDifference > 0 ? TransactionType.INCOME : TransactionType.EXPENSE,
      date: periodEndDate,
      debitAccountId: reconciliationDifference > 0 ? selectedBankId : adjustmentAccountId,
      creditAccountId: reconciliationDifference > 0 ? adjustmentAccountId : selectedBankId,
      currency: selectedBank?.currency || baseCurrency,
      exchangeRate: 1,
      status: 'POSTED'
    });

    if (!result.ok) {
      alert(result.message);
      return;
    }

    alert(tr('تم إنشاء قيد تسوية مطابقة البنك بنجاح', 'Bank reconciliation adjustment entry was posted successfully.'));
  };

  const printReconciliation = () => {
    if (!selectedBankId) {
      alert(tr('يرجى اختيار حساب بنكي أولاً', 'Please select a bank account first.'));
      return;
    }

    const reportRowsHtml = filteredRows
      .map(
        row => `
          <tr>
            <td>${escapeHtml(formatDate(row.tx.date))}</td>
            <td>${escapeHtml(row.reference)}</td>
            <td>${escapeHtml(row.tx.description || '-')}</td>
            <td>${escapeHtml(row.counterparty || '-')}</td>
            <td class="num">${escapeHtml(formatAmount(row.debit))}</td>
            <td class="num">${escapeHtml(formatAmount(row.credit))}</td>
            <td class="num ${row.delta >= 0 ? 'plus' : 'minus'}">${row.delta >= 0 ? '+' : '-'}${escapeHtml(formatAmount(Math.abs(row.delta)))}</td>
            <td>${row.isCleared ? escapeHtml(tr('مطابق', 'Cleared')) : escapeHtml(tr('معلق', 'Pending'))}</td>
          </tr>
        `
      )
      .join('');

    const html = `
      <!doctype html>
      <html lang="${isEnglish ? 'en' : 'ar'}" dir="${isEnglish ? 'ltr' : 'rtl'}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(tr('كشف مطابقة البنك', 'Bank Reconciliation Statement'))}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          .meta { margin: 0 0 18px; color: #4b5563; font-size: 12px; }
          .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
          .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
          .stat b { display: block; font-size: 11px; color: #6b7280; margin-bottom: 4px; }
          .num { direction: ltr; text-align: right; font-variant-numeric: tabular-nums; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
          th { background: #f9fafb; }
          .plus { color: #047857; font-weight: 700; }
          .minus { color: #be123c; font-weight: 700; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(tr('كشف مطابقة البنك', 'Bank Reconciliation Statement'))}</h1>
        <p class="meta">${escapeHtml(tr('الحساب البنكي', 'Bank Account'))}: ${escapeHtml(displayAccountName(selectedBank || null))} | ${escapeHtml(tr('الفترة', 'Period'))}: ${escapeHtml(formatDate(periodStartDate))} - ${escapeHtml(formatDate(periodEndDate))}</p>
        <div class="stats">
          <div class="stat"><b>${escapeHtml(tr('الرصيد الدفتري', 'Book Balance'))}</b><span class="num">${escapeHtml(formatAmount(bookBalance))} ${escapeHtml(currencyCode)}</span></div>
          <div class="stat"><b>${escapeHtml(tr('الرصيد المطابق', 'Cleared Balance'))}</b><span class="num">${escapeHtml(formatAmount(clearedBookBalance))} ${escapeHtml(currencyCode)}</span></div>
          <div class="stat"><b>${escapeHtml(tr('رصيد كشف البنك', 'Statement Balance'))}</b><span class="num">${escapeHtml(formatAmount(parsedStatementBalance))} ${escapeHtml(currencyCode)}</span></div>
          <div class="stat"><b>${escapeHtml(tr('فرق المطابقة', 'Difference'))}</b><span class="num ${reconciliationDifference >= 0 ? 'plus' : 'minus'}">${reconciliationDifference >= 0 ? '+' : '-'}${escapeHtml(formatAmount(Math.abs(reconciliationDifference)))} ${escapeHtml(currencyCode)}</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(tr('التاريخ', 'Date'))}</th>
              <th>${escapeHtml(tr('المرجع', 'Reference'))}</th>
              <th>${escapeHtml(tr('البيان', 'Description'))}</th>
              <th>${escapeHtml(tr('الطرف', 'Counterparty'))}</th>
              <th>${escapeHtml(tr('مدين', 'Debit'))}</th>
              <th>${escapeHtml(tr('دائن', 'Credit'))}</th>
              <th>${escapeHtml(tr('الأثر', 'Net'))}</th>
              <th>${escapeHtml(tr('الحالة', 'Status'))}</th>
            </tr>
          </thead>
          <tbody>
            ${reportRowsHtml || `<tr><td colspan="8" style="text-align:center;color:#6b7280;">${escapeHtml(tr('لا توجد بيانات', 'No rows found'))}</td></tr>`}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printHtmlContent(html);
  };

  const reconciliationTitle = tr('كشف مطابقة البنك', 'Bank Reconciliation Statement');
  const reconciliationShareText = [
    reconciliationTitle,
    `${tr('الحساب البنكي', 'Bank Account')}: ${displayAccountName(selectedBank || null) || '-'}`,
    `${tr('الفترة', 'Period')}: ${formatDate(periodStartDate)} - ${formatDate(periodEndDate)}`,
    `${tr('فرق المطابقة', 'Difference')}: ${reconciliationDifference >= 0 ? '+' : '-'}${formatAmount(Math.abs(reconciliationDifference))} ${currencyCode}`,
    `${tr('الصفوف المعروضة', 'Visible Rows')}: ${filteredRows.length}/${rowsWithCleared.length}`
  ]
    .concat(extractElementReadableText(reconciliationSnapshotRef.current) ? ['', extractElementReadableText(reconciliationSnapshotRef.current)] : [])
    .join('\n');

  const handleSaveReconciliationSnapshot = async () => {
    if (!reconciliationSnapshotRef.current) return;
    await settleElementBeforeSnapshot(reconciliationSnapshotRef.current);
    const success = await downloadElementAsPdf(reconciliationSnapshotRef.current, {
      title: `${reconciliationTitle} - ${displayAccountName(selectedBank || null) || 'bank'} - ${periodEndDate}`,
      fileName: `${reconciliationTitle}-${displayAccountName(selectedBank || null) || selectedBankId || 'bank'}-${periodEndDate}`,
      dir: isEnglish ? 'ltr' : 'rtl',
      lang: isEnglish ? 'en' : 'ar',
      backgroundColor: '#f8fafc',
      padding: 18
    });
    if (!success) {
      alert(tr('تعذر حفظ كشف المطابقة بصيغة PDF حاليًا.', 'Could not save the reconciliation statement as PDF right now.'));
    }
  };

  const handleExportReconciliationExcel = () => {
    const success = exportElementAsCsv(
      reconciliationExportTableRef.current,
      `${reconciliationTitle}-${displayAccountName(selectedBank || null) || selectedBankId || 'bank'}-${periodEndDate}`
    );
    if (!success) {
      alert(tr('تعذر تصدير كشف المطابقة حاليًا.', 'Could not export the reconciliation statement right now.'));
    }
  };

  const adjustmentAccounts = useMemo(
    () =>
      accounts.filter(
        a =>
          !a.isGroup &&
          a.id !== selectedBankId &&
          (a.type === 'EXPENSE' || a.type === 'REVENUE' || a.type === 'LIABILITY' || a.type === 'ASSET')
      ),
    [accounts, selectedBankId]
  );

  return (
    <div className={`app-page animate-in fade-in p-3 md:p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{tr('مطابقة البنك', 'Bank Reconciliation')}</h1>
          <p className="text-gray-400 text-[10px] font-black mt-1.5 uppercase tracking-[0.2em]">
            {tr('كشف مطابقة احترافي مع متابعة القيود المعلقة والتسويات', 'Professional reconciliation statement with pending entries and adjustments')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DocumentActions
            title={reconciliationTitle}
            shareText={reconciliationShareText}
            isEnglish={isEnglish}
            tr={tr}
            onPrint={printReconciliation}
            onSave={handleSaveReconciliationSnapshot}
            onExcel={handleExportReconciliationExcel}
            saveTitle={tr('تنزيل PDF', 'Download PDF')}
          />
          {onBack ? (
            <button onClick={onBack} className="app-back-btn p-2.5 bg-white text-gray-500 rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50">
              <ArrowRight size={22} />
            </button>
          ) : (
            <div className="p-4 bg-blue-50 text-blue-600 rounded-[1.8rem] shadow-lg shadow-blue-100/50">
              <Landmark size={26} />
            </div>
          )}
        </div>
      </header>

      <div ref={reconciliationSnapshotRef}>
      <section className="bg-white rounded-3xl p-3 md:p-4 border border-gray-100 shadow-sm mb-3 space-y-2.5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 items-end">
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-1">{tr('الحساب البنكي', 'Bank Account')}</label>
            <select
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value)}
              className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
            >
              <option value="">{tr('-- اختر الحساب البنكي --', '-- Select bank account --')}</option>
              {bankAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {displayAccountName(account)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-1">{tr('من تاريخ', 'From Date')}</label>
            <EnglishDateInput
              value={statementStartDate}
              onChange={setStatementStartDate}
              className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
              aria-label={tr('من تاريخ', 'From Date')}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-1">{tr('إلى تاريخ', 'To Date')}</label>
            <EnglishDateInput
              value={statementDate}
              onChange={setStatementDate}
              className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
              aria-label={tr('إلى تاريخ', 'To Date')}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-1">{tr('رصيد كشف البنك', 'Statement Ending Balance')}</label>
            <input
              type="number"
              inputMode="decimal"
              value={statementBalance}
              onChange={e => setStatementBalance(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 bg-gray-50 rounded-xl text-sm font-black outline-none border border-gray-100 dir-ltr"
            />
          </div>
        </div>
        {statementStartDate > statementDate && (
          <p className="text-[10px] text-amber-600 font-black px-1">
            {tr('تم ترتيب الفترة تلقائيًا (من/إلى).', 'Date range was auto-corrected (from/to).')}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 items-center">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={tr('ابحث في البيان أو المرجع أو الطرف...', 'Search description, reference, or counterparty...')}
              className="w-full h-10 px-3 pl-10 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
            />
          </div>
          <div className="col-span-1 md:col-span-2 flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-1">
            {([
              { key: 'ALL', ar: 'الكل', en: 'All' },
              { key: 'CLEARED', ar: 'مطابق', en: 'Cleared' },
              { key: 'PENDING', ar: 'معلق', en: 'Pending' }
            ] as { key: RowStatusFilter; ar: string; en: string }[]).map(filter => (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-colors ${
                  statusFilter === filter.key ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                }`}
              >
                {tr(filter.ar, filter.en)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-gray-500 font-black bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-lg">
            <SlidersHorizontal size={12} />
            {tr('الصفوف المعروضة', 'Visible Rows')}: <span className="text-slate-700">{filteredRows.length}</span> / <span className="text-slate-700">{rowsWithCleared.length}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
            <button
              onClick={applyHighConfidenceSuggestions}
              className="shrink-0 text-[10px] font-black px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 inline-flex items-center gap-1.5"
              title={tr('تطابق تلقائي باعتماد الاقتراحات عالية الثقة فقط', 'Auto-match using high confidence suggestions only')}
            >
              <Lightbulb size={12} />
              {tr('تطابق تلقائي (ثقة عالية)', 'Auto Match (High Confidence)')}
            </button>
            <button onClick={() => markVisibleRows(true)} className="shrink-0 text-[10px] font-black px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              {tr('تمييز المعروض مطابق', 'Mark Visible as Cleared')}
            </button>
            <button onClick={() => markVisibleRows(false)} className="shrink-0 text-[10px] font-black px-2.5 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
              {tr('إلغاء المعروض', 'Clear Visible')}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] p-5 border border-gray-100 shadow-sm mb-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5 p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Upload size={14} />
            </div>
            <div>
              <h3 className="font-black text-sm text-gray-800">{tr('استيراد كشف بنك (Profiles + Mapping)', 'Bank Statement Import (Profiles + Mapping)')}</h3>
              <p className="text-[10px] text-gray-500 font-bold mt-1">
                {tr('الخيار متاح كإعداد إضافي، ويتم إخفاء التفاصيل افتراضيًا.', 'This is an optional advanced feature, hidden by default.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStatementImportTools(prev => !prev)}
            className="px-3 py-2 rounded-xl bg-gray-50 text-gray-700 border border-gray-200 text-[11px] font-black inline-flex items-center gap-1.5"
          >
            {showStatementImportTools ? tr('إخفاء التفاصيل', 'Hide Details') : tr('خيار إضافي', 'Optional Option')}
            {showStatementImportTools ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {!showStatementImportTools ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-500">
            {tr('تم إخفاء بيانات استيراد كشف البنك حتى لا تظهر جميع تفاصيل الكشف في الشاشة.', 'Bank statement import details are hidden so full statement data is not shown on screen.')}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={saveStatementMapping}
                className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-black inline-flex items-center gap-1.5"
              >
                <Save size={12} />
                {tr('حفظ Mapping', 'Save Mapping')}
              </button>
              <button
                type="button"
                onClick={applyImportedStatement}
                disabled={statementEntries.length === 0}
                className={`px-3 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5 ${
                  statementEntries.length === 0
                    ? 'bg-gray-100 text-gray-400 border border-gray-200'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <CheckCircle2 size={12} />
                {tr('تطبيق المطابقة', 'Apply Matching')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest px-1 block mb-1">{tr('Bank Profile', 'Bank Profile')}</label>
                <select
                  value={statementProfileId}
                  onChange={e => setStatementProfileId(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
                >
                  {BANK_STATEMENT_PROFILES.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {isEnglish ? profile.nameEn : profile.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest px-1 block mb-1">{tr('ملف الكشف', 'Statement File')}</label>
                <label className="w-full p-3 rounded-xl border border-dashed border-blue-200 bg-blue-50 text-xs font-black text-blue-700 flex items-center justify-between gap-2 cursor-pointer">
                  <span className="truncate">{statementFileName || tr('اختر ملف Excel/CSV', 'Choose Excel/CSV file')}</span>
                  <span className="inline-flex items-center gap-1.5 shrink-0"><Upload size={14} />{tr('استعراض', 'Browse')}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={async e => {
                      await parseStatementFromFile(e.target.files?.[0] || null);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {([
                { key: 'date', ar: 'عمود التاريخ', en: 'Date Column' },
                { key: 'amount', ar: 'عمود المبلغ الصافي', en: 'Net Amount Column' },
                { key: 'debit', ar: 'عمود المدين (اختياري)', en: 'Debit Column (Optional)' },
                { key: 'credit', ar: 'عمود الدائن (اختياري)', en: 'Credit Column (Optional)' },
                { key: 'reference', ar: 'عمود المرجع', en: 'Reference Column' },
                { key: 'description', ar: 'عمود البيان', en: 'Description Column' },
                { key: 'balance', ar: 'عمود الرصيد', en: 'Balance Column' }
              ] as { key: keyof BankStatementColumnMapping; ar: string; en: string }[]).map(field => (
                <div key={field.key} className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest px-1 block mb-1">
                    {tr(field.ar, field.en)}
                  </label>
                  <select
                    value={statementMapping[field.key] || ''}
                    onChange={e => setStatementMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full p-2.5 bg-white rounded-lg text-xs font-bold outline-none border border-gray-200"
                  >
                    <option value="">{tr('-- غير مخصص --', '-- Unmapped --')}</option>
                    {statementHeaders.map(header => (
                      <option key={`${field.key}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-black text-gray-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                {tr('حركات الكشف الجاهزة', 'Parsed Statement Rows')}: {statementEntries.length}
              </div>
              {statementImportMsg && (
                <div className="text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                  {statementImportMsg}
                </div>
              )}
            </div>

            {statementEntries.length > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 font-bold">
                {tr(
                  'تم تحميل كشف البنك بنجاح. تم إخفاء تفاصيل الصفوف حتى لا تظهر جميع البيانات.',
                  'Statement imported successfully. Row-level details are hidden to avoid showing all data.'
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="grid md:grid-cols-5 grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-[9px] text-gray-400 font-black uppercase">{tr('الرصيد الدفتري', 'Book Balance')}</p>
          <p className="text-sm font-black dir-ltr text-slate-700">{formatAmount(bookBalance)} {currencyCode}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-[9px] text-gray-400 font-black uppercase">{tr('الرصيد المطابق', 'Cleared Balance')}</p>
          <p className="text-sm font-black dir-ltr text-emerald-700">{formatAmount(clearedBookBalance)} {currencyCode}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-[9px] text-gray-400 font-black uppercase">{tr('إيداعات معلقة', 'Outstanding Deposits')}</p>
          <p className="text-sm font-black dir-ltr text-blue-700">{formatAmount(outstandingDeposits)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-[9px] text-gray-400 font-black uppercase">{tr('سحوبات معلقة', 'Outstanding Withdrawals')}</p>
          <p className="text-sm font-black dir-ltr text-rose-700">{formatAmount(outstandingWithdrawals)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 md:col-span-1 col-span-2">
          <p className="text-[9px] text-gray-400 font-black uppercase">{tr('نسبة الإنجاز', 'Progress')}</p>
          <p className="text-sm font-black text-indigo-700">{clearedRateByCount}% ({clearedCount}/{totalCount})</p>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{ width: `${clearedRateByCount}%` }} />
          </div>
        </div>
      </section>

      <section className={`rounded-[2.2rem] p-5 mb-4 border ${Math.abs(reconciliationDifference) < 0.005 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{tr('فرق المطابقة', 'Reconciliation Difference')}</p>
            <p className={`text-3xl font-black dir-ltr ${Math.abs(reconciliationDifference) < 0.005 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {reconciliationDifference >= 0 ? '+' : '-'}
              {formatAmount(Math.abs(reconciliationDifference))} {currencyCode}
            </p>
            <p className="text-[10px] font-bold text-gray-500 mt-2">
              {Math.abs(reconciliationDifference) < 0.005
                ? tr('تمت المطابقة بنجاح', 'Reconciled successfully')
                : tr('يوجد فرق يحتاج تسوية أو مراجعة قيود', 'Difference requires adjustment or review')}
            </p>
          </div>
          <div className="min-w-[180px]">
            <p className="text-[10px] font-black text-gray-500 mb-1">{tr('مطابقة بالقيمة', 'Reconciled by Value')} {clearedRateByValue}%</p>
            <div className="h-2.5 rounded-full bg-white/80 overflow-hidden border border-white/70">
              <div
                className={`h-full rounded-full transition-all duration-300 ${Math.abs(reconciliationDifference) < 0.005 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ width: `${clearedRateByValue}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-gray-500 mt-1 dir-ltr">{formatAmount(clearedMovementValue)} / {formatAmount(totalMovementValue)} {currencyCode}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] p-5 border border-gray-100 shadow-sm mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-black text-sm text-gray-800 flex items-center gap-2">
            <Lightbulb size={16} className="text-amber-500" />
            {tr('اقتراحات المطابقة الذكية (اعتماد يدوي)', 'Smart Match Suggestions (Manual Approval)')}
          </h3>
          <button
            type="button"
            onClick={applyHighConfidenceSuggestions}
            className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-[11px] font-black border border-amber-100 hover:bg-amber-100"
          >
            {tr('تطابق تلقائي (75%+)', 'Auto Match (75%+)')}
          </button>
        </div>

        {matchSuggestions.length === 0 ? (
          <p className="text-xs font-bold text-gray-400">{tr('لا توجد اقتراحات حالياً', 'No suggestions at the moment')}</p>
        ) : (
          <div className="space-y-2">
            {matchSuggestions.slice(0, 8).map(suggestion => {
              const tx = rowsWithCleared.find(row => row.tx.id === suggestion.transactionId);
              if (!tx) return null;
              return (
                <div key={suggestion.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-gray-800 truncate">{tx.tx.description || '-'}</p>
                    <p className="text-[10px] text-gray-500 font-bold mt-1">
                      {tx.reference} - {tx.tx.date} - {suggestion.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                      suggestion.confidence >= 75
                        ? 'bg-emerald-100 text-emerald-700'
                        : suggestion.confidence >= 60
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-200 text-gray-600'
                    }`}>
                      {suggestion.confidence}%
                    </span>
                    <button
                      type="button"
                      onClick={() => applySuggestion(suggestion.transactionId)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black hover:bg-blue-700"
                    >
                      {tr('اعتماد', 'Approve')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-[2.5rem] p-5 border border-gray-100 shadow-sm mb-4">
        <h3 className="font-black text-sm text-gray-800 mb-3">{tr('كشف مطابقات الحركة البنكية', 'Bank Reconciliation Lines')}</h3>
        <div className="rounded-2xl border border-gray-100 overflow-hidden">
          <div className="md:hidden">
            <table className="w-full table-fixed text-[11px]">
              <thead className="bg-gray-50">
                <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="w-[64px] p-2 text-center">{tr('مطابقة', 'Clear')}</th>
                  <th className="w-[90px] p-2 text-center">{tr('التاريخ', 'Date')}</th>
                  <th className="w-[100px] p-2 text-center">{tr('المرجع', 'Reference')}</th>
                  <th className="p-2 text-right">{tr('البيان', 'Description')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400 font-bold">
                      {tr('لا توجد حركات مطابقة لهذه المعايير', 'No entries found for selected criteria')}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(row => (
                    <tr key={`mobile-${row.tx.id}`} className="border-t border-gray-100">
                      <td className="p-2 text-center">
                        <button
                          onClick={() => toggleCleared(row.tx.id)}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                            row.isCleared ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          title={row.isCleared ? tr('إلغاء المطابقة', 'Mark as pending') : tr('تعليم كمطابق', 'Mark as cleared')}
                        >
                          {row.isCleared ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        </button>
                      </td>
                      <td className="p-2 text-center font-bold text-gray-600 dir-ltr">{formatDate(row.tx.date)}</td>
                      <td className="p-2 text-center">
                        <span className="font-black text-indigo-600 dir-ltr text-[11px]">{row.reference}</span>
                      </td>
                      <td className="p-2 text-right font-bold text-gray-700 truncate">{row.tx.description || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table ref={reconciliationExportTableRef} className="min-w-[860px] w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="p-3 text-center">{tr('مطابقة', 'Clear')}</th>
                  <th className="p-3 text-center">{tr('التاريخ', 'Date')}</th>
                  <th className="p-3 text-center">{tr('المرجع', 'Reference')}</th>
                  <th className="p-3 text-right">{tr('البيان', 'Description')}</th>
                  <th className="p-3 text-right">{tr('الطرف', 'Counterparty')}</th>
                  <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                  <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                  <th className="p-3 text-center">{tr('الأثر', 'Net')}</th>
                  <th className="p-3 text-center">{tr('الحالة', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-400 font-bold">
                      {tr('لا توجد حركات مطابقة لهذه المعايير', 'No entries found for selected criteria')}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(row => (
                    <tr key={row.tx.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleCleared(row.tx.id)}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                            row.isCleared ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          title={row.isCleared ? tr('إلغاء المطابقة', 'Mark as pending') : tr('تعليم كمطابق', 'Mark as cleared')}
                        >
                          {row.isCleared ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        </button>
                      </td>
                      <td className="p-3 text-center font-bold text-gray-600 dir-ltr">{formatDate(row.tx.date)}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-black text-indigo-600 dir-ltr">{row.reference}</span>
                          {!row.isCleared && suggestionMap.has(row.tx.id) && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[9px] font-black">
                              {suggestionMap.get(row.tx.id)?.confidence}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold text-gray-700">{row.tx.description || '-'}</td>
                      <td className="p-3 text-right text-gray-500 font-bold">
                        <span
                          className={row.tx.contactId ? 'cursor-pointer hover:text-indigo-600' : undefined}
                          onDoubleClick={() => openContactStatement(row.tx.contactId)}
                          title={row.tx.contactId ? tr('اضغط مرتين لفتح كشف الطرف', 'Double-click to open contact statement') : undefined}
                        >
                          {row.counterparty || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-black dir-ltr text-emerald-700">{row.debit > 0 ? formatAmount(row.debit) : '-'}</td>
                      <td className="p-3 text-center font-black dir-ltr text-rose-700">{row.credit > 0 ? formatAmount(row.credit) : '-'}</td>
                      <td className={`p-3 text-center font-black dir-ltr ${row.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {row.delta >= 0 ? '+' : '-'}{formatAmount(Math.abs(row.delta))}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black ${
                          row.isCleared ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {row.isCleared ? tr('مطابق', 'Cleared') : tr('معلق', 'Pending')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] p-5 border border-gray-100 shadow-sm space-y-3">
        <h3 className="font-black text-sm text-gray-800">{tr('قيد تسوية فرق المطابقة', 'Post Adjustment Entry')}</h3>
        <div className="grid md:grid-cols-2 grid-cols-1 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-1">{tr('حساب التسوية', 'Adjustment Account')}</label>
            <select
              value={adjustmentAccountId}
              onChange={e => setAdjustmentAccountId(e.target.value)}
              className="w-full p-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
            >
              {adjustmentAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {displayAccountName(account)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-1">{tr('الوصف', 'Description')}</label>
            <input
              value={adjustmentDescription}
              onChange={e => setAdjustmentDescription(e.target.value)}
              placeholder={tr('مثال: عمولة كشف بنك', 'Example: Bank statement fee')}
              className="w-full p-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-100"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={postAdjustmentEntry}
            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50"
            disabled={Math.abs(reconciliationDifference) < 0.005}
          >
            <Save size={16} />
            {tr('ترحيل قيد التسوية', 'Post Adjustment')}
          </button>
          <button
            onClick={() => {
              setStatementBalance('');
              setAdjustmentDescription('');
              setSearchTerm('');
              setStatusFilter('ALL');
              markVisibleRows(false);
            }}
            className="py-3 px-4 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm flex items-center justify-center gap-2"
            title={tr('إعادة ضبط التحديدات', 'Reset selections')}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </section>

      <p className="mt-3 text-[10px] text-gray-400 font-bold px-1">
        {tr('حالة المطابقة تُحفظ لكل حساب بنكي محليًا على هذا الجهاز.', 'Reconciliation status is saved locally per bank account on this device.')}
      </p>
      </div>

      <div className="h-4" />
    </div>
  );
};

export default BankReconciliationManager;


