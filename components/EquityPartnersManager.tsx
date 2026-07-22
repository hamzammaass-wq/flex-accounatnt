import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, Layers3, Percent, Plus, Printer, Wallet, Minus } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import EnglishDateInput from './EnglishDateInput';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { printHtmlContent } from '../utils/documentExport';
import { getDisplayAccountName, getDisplayContactName } from '../utils/displayNames';
import {
  buildAccountBalanceMap,
  buildProfitDistributionDraft,
  createEquitySettlementPosting,
  isIsoDate,
  isPostedTransaction,
  roundMoney,
  validateEquitySettlementInput
} from '../utils/equityPartners';
import { compressImageFile } from '../utils/imageCompression';
import QuickAddAccountModal from './QuickAddAccountModal';

type TabKey = 'DASHBOARD' | 'CAPITAL' | 'PARTNER_ACCOUNTS' | 'PROFIT_DISTRIBUTION' | 'SETTLEMENT';

type PartnerMeta = { sharePercent?: number; partnerType?: string };

type SettlementAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

type ProfitDocument = {
  id: string;
  reference: string;
  period: string;
  date: string;
  method: 'CAPITAL_RATIO' | 'CUSTOM_RATIO' | 'FIXED_AMOUNT';
  sourceAccountId: string;
  totalProfit: number;
  totalAllocated: number;
};

type SettlementDocument = {
  id: string;
  reference: string;
  mode: 'MANUAL' | 'BULK';
  date: string;
  reason: string;
  amount: number;
  debitAccountId: string;
  creditAccountId: string;
  attachments?: SettlementAttachment[];
};

type Snapshot = {
  partnerMeta: Record<string, PartnerMeta>;
  profitDocs: ProfitDocument[];
  settlementDocs: SettlementDocument[];
};

type PartnerRow = {
  id: string;
  name: string;
  partnerType?: string;
  capitalAccountId?: string;
  currentAccountId?: string;
  sharePercent: number;
  capital: number;
  current: number;
  net: number;
};

const STORAGE_PREFIX = 'al_mohaseb_equity_partners_v2';
const inputClass = 'w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-bold outline-none';
const today = () => new Date().toISOString().slice(0, 10);
const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const buildRef = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const EquityPartnersManager: React.FC = () => {
  const {
    companySettings,
    updateCompanySettings,
    currentCompanyId,
    baseCurrency,
    contacts,
    accounts,
    transactions,
    addTransaction,
    addContact,
    postPartnerCapitalContribution,
    currentUser,
    can,
    appendAuditLog
  } = useAccounting();

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayAccountName = (account?: { id: string; name: string; code?: string } | null) =>
    getDisplayAccountName(account || undefined, isEnglish);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);
  const fmt = (value: number) => new Intl.NumberFormat('en-US-u-nu-latn', { maximumFractionDigits: 2 }).format(value || 0);
  const fmtDate = (value: string) => toEnglishDigits(String(value || '')).trim();
  const normalizeDecimalInput = (value: string): string => {
    const normalized = toEnglishDigits(String(value || ''))
      .replace(/\u066B/g, '.')
      .replace(/\u066C/g, ',')
      .replace(/\u060C/g, ',')
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '');

    const firstDotIndex = normalized.indexOf('.');
    if (firstDotIndex < 0) return normalized;
    return `${normalized.slice(0, firstDotIndex + 1)}${normalized.slice(firstDotIndex + 1).replace(/\./g, '')}`;
  };
  const normalizeDigitsText = (value: string): string => toEnglishDigits(String(value || ''));
  const englishDigits = (value: string | number): string => toEnglishDigits(String(value ?? ''));
  const englishNumberLang = 'en-u-nu-latn';
  const storageKey = `${STORAGE_PREFIX}_${currentCompanyId || 'cmp_default'}`;

  const [tab, setTab] = useState<TabKey>('DASHBOARD');
  const [partnerMeta, setPartnerMeta] = useState<Record<string, PartnerMeta>>({});
  const [profitDocs, setProfitDocs] = useState<ProfitDocument[]>([]);
  const [settlementDocs, setSettlementDocs] = useState<SettlementDocument[]>([]);

  const [capitalMode, setCapitalMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [capitalPartnerId, setCapitalPartnerId] = useState('');
  const [capitalPartnerName, setCapitalPartnerName] = useState('');
  const [capitalAmount, setCapitalAmount] = useState('');
  const [capitalDate, setCapitalDate] = useState(today());
  const [capitalSharePercent, setCapitalSharePercent] = useState('');
  const [capitalPartnerType, setCapitalPartnerType] = useState('');
  const [capitalFundingAccountId, setCapitalFundingAccountId] = useState('');
  const [capitalFilterPartnerId, setCapitalFilterPartnerId] = useState('ALL');
  const [capitalFilterFrom, setCapitalFilterFrom] = useState('');
  const [capitalFilterTo, setCapitalFilterTo] = useState('');

  const [ledgerPartnerId, setLedgerPartnerId] = useState('');

  const [distPeriod, setDistPeriod] = useState(String(new Date().getFullYear()));
  const [distTotalProfit, setDistTotalProfit] = useState('');
  const [distDate, setDistDate] = useState(today());
  const [distMethod, setDistMethod] = useState<'CAPITAL_RATIO' | 'CUSTOM_RATIO' | 'FIXED_AMOUNT'>('CAPITAL_RATIO');
  const [distNote, setDistNote] = useState('');
  const [distCustomRatios, setDistCustomRatios] = useState<Record<string, string>>({});
  const [distFixedAmounts, setDistFixedAmounts] = useState<Record<string, string>>({});

  const [settlementDate, setSettlementDate] = useState(today());
  const [settlementDebitAccountId, setSettlementDebitAccountId] = useState('');
  const [settlementCreditAccountId, setSettlementCreditAccountId] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementReason, setSettlementReason] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [settlementAttachments, setSettlementAttachments] = useState<SettlementAttachment[]>([]);

  const [bulkDate, setBulkDate] = useState(today());
  const [bulkSourceAccountId, setBulkSourceAccountId] = useState('acc_retained_earnings');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkMethod, setBulkMethod] = useState<'CAPITAL_RATIO' | 'CUSTOM_RATIO'>('CAPITAL_RATIO');
  const [bulkCustomRatios, setBulkCustomRatios] = useState<Record<string, string>>({});

  const partners = useMemo(() => contacts.filter(c => c.type === 'PARTNER'), [contacts]);
  const postedTransactions = useMemo(() => transactions.filter(isPostedTransaction), [transactions]);
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const accountBalanceById = useMemo(() => buildAccountBalanceMap(postedTransactions), [postedTransactions]);

  const postingAccounts = useMemo(() => accounts.filter(a => !a.isGroup), [accounts]);
  const equityAccounts = useMemo(() => postingAccounts.filter(a => a.type === 'EQUITY'), [postingAccounts]);
  const fundingAccounts = useMemo(
    () => postingAccounts.filter(a => a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root'),
    [postingAccounts]
  );
  const retainedEarningsAccount = useMemo(() => {
    const account = accountById.get('acc_retained_earnings');
    if (!account || account.isGroup) return undefined;
    return account;
  }, [accountById]);
  const retainedEarningsAccountId = retainedEarningsAccount?.id || '';
  const settlementAccounts = useMemo(() => {
    const partnerAccountIds = new Set(
      contacts
        .filter(contact => contact.type === 'PARTNER')
        .flatMap(contact => [contact.capitalAccountId, contact.currentAccountId || contact.linkedAccountId])
        .filter((value): value is string => Boolean(value))
    );
    return equityAccounts.filter(account => partnerAccountIds.has(account.id));
  }, [equityAccounts, contacts]);

  const canCreateEntries = can('SETTLEMENTS', 'ADD') || currentUser?.role === 'ADMIN';
  const canPostEntries = can('SETTLEMENTS', 'POST') || currentUser?.role === 'ADMIN';

  // Load from company settings on mount/switch
  useEffect(() => {
    const state = companySettings.equityPartnersState || {};
    if (state.partnerMeta) setPartnerMeta(state.partnerMeta);
    if (Array.isArray(state.profitDocs)) setProfitDocs(state.profitDocs);
    if (Array.isArray(state.settlementDocs)) setSettlementDocs(state.settlementDocs);
  }, [currentCompanyId]); // Only on company switch, don't run on every settings change to avoid loops!

  // Save to company settings on changes
  useEffect(() => {
    const currentSettingsState = companySettings.equityPartnersState || {};
    if (
      JSON.stringify(currentSettingsState.partnerMeta) === JSON.stringify(partnerMeta) &&
      JSON.stringify(currentSettingsState.profitDocs) === JSON.stringify(profitDocs) &&
      JSON.stringify(currentSettingsState.settlementDocs) === JSON.stringify(settlementDocs)
    ) {
      return;
    }

    const timer = setTimeout(() => {
      updateCompanySettings({
        ...companySettings,
        equityPartnersState: {
          partnerMeta,
          profitDocs,
          settlementDocs
        }
      });
    }, 500); // debounce setting updates

    return () => clearTimeout(timer);
  }, [partnerMeta, profitDocs, settlementDocs]);

  useEffect(() => {
    if (!partners.length) {
      setCapitalPartnerId('');
      return;
    }
    if (!partners.some(p => p.id === capitalPartnerId)) {
      setCapitalPartnerId(partners[0].id);
    }
  }, [partners, capitalPartnerId]);

  useEffect(() => {
    if (!partners.length) {
      setLedgerPartnerId('');
      return;
    }
    if (!partners.some(p => p.id === ledgerPartnerId)) {
      setLedgerPartnerId(partners[0].id);
    }
  }, [partners, ledgerPartnerId]);

  useEffect(() => {
    if (fundingAccounts.length && !fundingAccounts.some(a => a.id === capitalFundingAccountId)) {
      setCapitalFundingAccountId(fundingAccounts[0].id);
    }
  }, [fundingAccounts, capitalFundingAccountId]);

  useEffect(() => {
    if (equityAccounts.length && !equityAccounts.some(a => a.id === bulkSourceAccountId)) {
      setBulkSourceAccountId(equityAccounts[0].id);
    }
  }, [equityAccounts, bulkSourceAccountId]);

  useEffect(() => {
    if (settlementAccounts.length === 0) return;
    if (!settlementAccounts.some(a => a.id === settlementDebitAccountId)) setSettlementDebitAccountId(settlementAccounts[0].id);
    if (!settlementAccounts.some(a => a.id === settlementCreditAccountId)) setSettlementCreditAccountId(settlementAccounts[1]?.id || settlementAccounts[0].id);
  }, [settlementAccounts, settlementDebitAccountId, settlementCreditAccountId]);

  useEffect(() => {
    setDistCustomRatios(prev => {
      const next: Record<string, string> = {};
      partners.forEach(p => { next[p.id] = prev[p.id] ?? ''; });
      return next;
    });
    setDistFixedAmounts(prev => {
      const next: Record<string, string> = {};
      partners.forEach(p => { next[p.id] = prev[p.id] ?? ''; });
      return next;
    });
    setBulkCustomRatios(prev => {
      const next: Record<string, string> = {};
      partners.forEach(p => { next[p.id] = prev[p.id] ?? ''; });
      return next;
    });
  }, [partners]);

  useEffect(() => {
    const printBlockedMessage = tr('طباعة كشف الشركاء غير متاحة من هذه الشاشة.', 'Printing partner ledger is disabled on this screen.');
    const onPrintShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        alert(printBlockedMessage);
      }
    };
    const onBeforePrint = () => {
      alert(printBlockedMessage);
    };

    const originalPrint = window.print.bind(window);
    document.body.classList.add('equity-partners-print-locked');
    window.print = () => {
      alert(printBlockedMessage);
    };

    window.addEventListener('keydown', onPrintShortcut);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      document.body.classList.remove('equity-partners-print-locked');
      window.print = originalPrint;
      window.removeEventListener('keydown', onPrintShortcut);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [tr]);

  const isPostingDateAllowed = (value: string): boolean => {
    if (companySettings.journalDateLockEnabled !== true) return true;
    const date = String(value || '').trim();
    if (!isIsoDate(date)) return false;
    const from = String(companySettings.journalDateLockFrom || '').trim();
    const to = String(companySettings.journalDateLockTo || '').trim();
    if (isIsoDate(from) && date < from) return false;
    if (isIsoDate(to) && date > to) return false;
    return true;
  };

  const partnerRows = useMemo<PartnerRow[]>(() => {
    const rows = partners.map(partner => {
      const capitalAccountId = partner.capitalAccountId;
      const currentAccountId = partner.currentAccountId || partner.linkedAccountId;
      const capital = roundMoney(accountBalanceById.get(capitalAccountId || '') || 0);
      const current = roundMoney(accountBalanceById.get(currentAccountId || '') || 0);
      const partnerType = String(partnerMeta[partner.id]?.partnerType || (partner as unknown as { partnerType?: string }).partnerType || '').trim() || undefined;
      const sharePercent = roundMoney(Number(partnerMeta[partner.id]?.sharePercent || 0));
      return {
        id: partner.id,
        name: displayContactName(partner),
        partnerType,
        capitalAccountId,
        currentAccountId,
        sharePercent,
        capital,
        current,
        net: roundMoney(capital + current)
      };
    });
    const totalCap = rows.reduce((s, r) => s + r.capital, 0);
    return rows.map(row => ({
      ...row,
      sharePercent: row.sharePercent > 0 ? row.sharePercent : (totalCap > 0 ? roundMoney((row.capital / totalCap) * 100) : 0)
    }));
  }, [partners, partnerMeta, accountBalanceById, postedTransactions, isEnglish]);

  const partnerById = useMemo(() => new Map(partnerRows.map(p => [p.id, p])), [partnerRows]);

  const totalCapital = roundMoney(partnerRows.reduce((s, p) => s + p.capital, 0));
  const totalRetained = roundMoney(accountBalanceById.get('acc_retained_earnings') || 0);
  const totalDistributed = roundMoney(postedTransactions.reduce((sum, tx) => (
    tx.category === 'partner_profit_distribution' ? sum + tx.amount : sum
  ), 0));
  const totalCurrent = roundMoney(partnerRows.reduce((s, p) => s + p.current, 0));
  const netEquity = roundMoney(totalCapital + totalRetained + totalCurrent);
  const availableProfitPool = roundMoney(Math.max(0, totalRetained));

  const ledgerLines = useMemo(() => {
    const partner = partnerById.get(ledgerPartnerId);
    if (!partner) return [] as Array<{ id: string; date: string; docType: string; docNo: string; debit: number; credit: number; running: number; note: string }>;
    const ids = [partner.capitalAccountId, partner.currentAccountId].filter((v): v is string => Boolean(v));
    let running = 0;
    return postedTransactions
      .filter(tx => ids.some(id => tx.debitAccountId === id || tx.creditAccountId === id))
      .sort((a, b) => `${a.date}__${a.id}`.localeCompare(`${b.date}__${b.id}`))
      .map(tx => {
        const debit = ids.some(id => tx.debitAccountId === id) ? tx.amount : 0;
        const credit = ids.some(id => tx.creditAccountId === id) ? tx.amount : 0;
        running = roundMoney(running + credit - debit);
        return {
          id: tx.id,
          date: tx.date,
          docType: tx.category,
          docNo: tx.voucherId || tx.id,
          debit: roundMoney(debit),
          credit: roundMoney(credit),
          running,
          note: tx.description
        };
      });
  }, [ledgerPartnerId, partnerById, postedTransactions]);

  const buildPartnerLedgerPrintHtml = (partnerId: string, autoPrint = true): string => {
    const partner = partnerById.get(partnerId);
    if (!partner) return '';
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const rows = ledgerLines.map(line => `
      <tr>
        <td dir="ltr">${escapeHtml(fmtDate(line.date))}</td>
        <td>${escapeHtml(line.docType)}</td>
        <td dir="ltr">${escapeHtml(line.docNo)}</td>
        <td dir="ltr">${line.debit > 0 ? escapeHtml(fmt(line.debit)) : '-'}</td>
        <td dir="ltr">${line.credit > 0 ? escapeHtml(fmt(line.credit)) : '-'}</td>
        <td dir="ltr">${escapeHtml(fmt(line.running))}</td>
        <td>${escapeHtml(line.note)}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html dir="${isEnglish ? 'ltr' : 'rtl'}" lang="${isEnglish ? 'en' : 'ar'}">
  <head>
    <meta charset="UTF-8" />
    <title>${tr('كشف حساب تفصيلي', 'Detailed Ledger')} - ${escapeHtml(partner.name)}</title>
    <style>
      body { font-family: ${isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', sans-serif"}; padding: 24px; color: #0f172a; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 16px; color: #475569; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; text-align: center; }
      th { background: #f8fafc; color: #0f172a; font-weight: 800; }
      td:last-child, th:last-child { text-align: right; }
      @media print { body { padding: 8px; } }
    </style>
  </head>
  <body>
    <h1>${tr('كشف حساب تفصيلي', 'Detailed Ledger')} - ${escapeHtml(partner.name)}</h1>
    <p>${tr('الشريك', 'Partner')}: ${escapeHtml(partner.name)}</p>
    <table>
      <thead>
        <tr>
          <th>${tr('التاريخ', 'Date')}</th>
          <th>${tr('نوع المستند', 'Doc Type')}</th>
          <th>${tr('رقم المستند', 'Doc No')}</th>
          <th>${tr('مدين', 'Debit')}</th>
          <th>${tr('دائن', 'Credit')}</th>
          <th>${tr('الرصيد الجاري', 'Running')}</th>
          <th>${tr('ملاحظة', 'Note')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${autoPrint ? '<script>window.focus(); window.print();</script>' : ''}
  </body>
</html>`;
  };

  const handlePrintPartnerLedger = () => {
    if (!ledgerPartnerId) return;
    const html = buildPartnerLedgerPrintHtml(ledgerPartnerId, true);
    if (!html) return;
    printHtmlContent(html);
  };

  const capitalEntries = useMemo(() => transactions
    .filter(tx => tx.category === 'partner_capital')
    .filter(tx => (capitalFilterPartnerId === 'ALL' || tx.contactId === capitalFilterPartnerId))
    .filter(tx => (!capitalFilterFrom || tx.date >= capitalFilterFrom))
    .filter(tx => (!capitalFilterTo || tx.date <= capitalFilterTo))
    .sort((a, b) => `${b.date}__${b.id}`.localeCompare(`${a.date}__${a.id}`)),
    [transactions, capitalFilterPartnerId, capitalFilterFrom, capitalFilterTo]);

  const distributionPreview = useMemo(() => {
    const draft = buildProfitDistributionDraft({
      date: distDate,
      periodLabel: distPeriod,
      totalProfit: roundMoney(Number(distTotalProfit) || 0),
      method: distMethod,
      sourceAccountId: retainedEarningsAccountId,
      partners: partnerRows.map(p => ({ partnerId: p.id, partnerName: p.name, currentAccountId: p.currentAccountId || '', capital: p.capital })),
      currency: baseCurrency,
      customRatios: Object.fromEntries(partnerRows.map(p => [p.id, roundMoney(Number(distCustomRatios[p.id] || 0))])),
      fixedAmounts: Object.fromEntries(partnerRows.map(p => [p.id, roundMoney(Number(distFixedAmounts[p.id] || 0))])),
      reference: 'PREVIEW',
      note: distNote
    });
    if (!draft.ok) return { ok: false, totalAllocated: 0, remainder: 0, message: (draft as { message: string }).message };
    return { ok: true, totalAllocated: draft.totalAllocated, remainder: draft.remainder, message: '' };
  }, [distDate, distPeriod, distTotalProfit, distMethod, retainedEarningsAccountId, partnerRows, baseCurrency, distCustomRatios, distFixedAmounts, distNote]);

  const postCapital = (mode: 'CREATE' | 'INCREASE' | 'DECREASE') => {
    if (!canCreateEntries || !canPostEntries) return alert(tr('لا تملك صلاحية كافية.', 'Insufficient permission.'));
    const amount = roundMoney(Number(capitalAmount) || 0);
    if (amount <= 0) return alert(tr('أدخل مبلغ رأس مال صحيح.', 'Enter a valid capital amount.'));
    if (!capitalFundingAccountId) return alert(tr('اختر حساب تمويل.', 'Select funding account.'));
    if (!isPostingDateAllowed(capitalDate)) return alert(tr('الفترة مقفلة لهذا التاريخ.', 'Period is closed for this date.'));

    let partnerId = capitalPartnerId;
    let partnerName = '';
    if (capitalMode === 'NEW') {
      partnerName = String(capitalPartnerName || '').trim();
      if (!partnerName) return alert(tr('أدخل اسم الشريك.', 'Enter partner name.'));
      partnerId = newId('partner');
      const addPartnerResult = addContact({ id: partnerId, name: partnerName, type: 'PARTNER' });
      if (!addPartnerResult.ok) return;
    } else {
      const partner = partnerById.get(partnerId);
      if (!partner) return alert(tr('اختر شريكاً موجوداً.', 'Select an existing partner.'));
      partnerName = partner.name;
    }

    const result = postPartnerCapitalContribution({
      partnerId,
      partnerName,
      amount,
      fundingAccountId: capitalFundingAccountId,
      date: capitalDate,
      note: mode === 'CREATE' ? 'create_capital_entry' : mode === 'INCREASE' ? 'increase_capital_entry' : 'decrease_capital_entry',
      isReduction: mode === 'DECREASE'
    });
    if (!result.ok) return alert(result.message);

    const share = roundMoney(Number(capitalSharePercent) || 0);
    const typeText = String(capitalPartnerType || '').trim();
    if (share > 0 || typeText) {
      setPartnerMeta(prev => ({ ...prev, [partnerId]: { ...prev[partnerId], ...(share > 0 ? { sharePercent: share } : {}), ...(typeText ? { partnerType: typeText } : {}) } }));
    }

    appendAuditLog({ entityType: 'partner_capital', entityId: partnerId, action: mode === 'CREATE' ? 'CREATE_CAPITAL_ENTRY' : mode === 'INCREASE' ? 'INCREASE_CAPITAL' : 'DECREASE_CAPITAL', screen: 'Equity & Partners > Capital' });
    setCapitalAmount('');
    setCapitalPartnerName('');
    alert(mode === 'CREATE' ? tr('تمت إضافة رأس المال.', 'Capital entry posted.') : mode === 'INCREASE' ? tr('تمت زيادة رأس المال.', 'Capital increase posted.') : tr('تم تخفيض رأس المال.', 'Capital reduction posted.'));
  };

  const updatePartnerSharePercent = (partnerId: string, value: string) => {
    if (!partnerId) return;
    const raw = normalizeDecimalInput(value).trim();
    const parsed = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(parsed)) return;
    const bounded = roundMoney(Math.min(100, Math.max(0, parsed)));
    setPartnerMeta(prev => ({
      ...prev,
      [partnerId]: {
        ...prev[partnerId],
        sharePercent: bounded
      }
    }));
  };

  const postDistribution = () => {
    if (!canPostEntries) return alert(tr('لا تملك صلاحية الترحيل.', 'You do not have posting permission.'));
    if (!retainedEarningsAccountId) return alert(tr('حساب الأرباح غير الموزعة غير متاح.', 'Retained earnings account is not available.'));
    const totalProfit = roundMoney(Number(distTotalProfit) || 0);
    if (totalProfit <= 0) return alert(tr('لا يسمح بالتوزيع إذا الربح = 0.', 'Distribution is not allowed when profit = 0.'));
    if (totalProfit > availableProfitPool) return alert(tr('قيمة التوزيع أكبر من الربح المتاح.', 'Distribution exceeds available profit.'));
    if (!isPostingDateAllowed(distDate)) return alert(tr('الفترة مقفلة لهذا التاريخ.', 'Period is closed for this date.'));

    const reference = buildRef('PD');
    const draft = buildProfitDistributionDraft({
      date: distDate,
      periodLabel: distPeriod,
      totalProfit,
      method: distMethod,
      sourceAccountId: retainedEarningsAccountId,
      partners: partnerRows.map(p => ({ partnerId: p.id, partnerName: p.name, currentAccountId: p.currentAccountId || '', capital: p.capital })),
      currency: baseCurrency,
      customRatios: Object.fromEntries(partnerRows.map(p => [p.id, roundMoney(Number(distCustomRatios[p.id] || 0))])),
      fixedAmounts: Object.fromEntries(partnerRows.map(p => [p.id, roundMoney(Number(distFixedAmounts[p.id] || 0))])),
      reference,
      note: distNote
    });
    if (!draft.ok) return alert((draft as { message: string }).message);
    if (!confirm(tr('تأكيد ترحيل التوزيع؟', 'Confirm posting distribution?'))) return;

    const errors: string[] = [];
    draft.postings.forEach(posting => {
      const result = addTransaction(posting);
      if (!result.ok) errors.push(result.message);
    });
    if (errors.length > 0) return alert(errors.join('\n'));

    setProfitDocs(prev => [{ id: newId('pdoc'), reference, period: distPeriod, date: distDate, method: distMethod, sourceAccountId: retainedEarningsAccountId, totalProfit, totalAllocated: draft.totalAllocated }, ...prev]);
    appendAuditLog({ entityType: 'profit_distribution', action: 'POST', screen: 'Equity & Partners > Profit Distribution', metadata: { reference, totalProfit, totalAllocated: draft.totalAllocated } });
    alert(tr('تم ترحيل توزيع الأرباح.', 'Profit distribution posted.'));
  };

  const readAttachments = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const prepared: SettlementAttachment[] = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        alert(tr(`الملف ${file.name} أكبر من 5MB.`, `File ${file.name} exceeds 5MB.`));
        continue;
      }
      try {
        const dataUrl = await compressImageFile(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.7, mimeType: 'image/jpeg' });
        prepared.push({ id: newId('att'), name: file.name, dataUrl });
      } catch {
        alert(tr(`تعذر قراءة أو معالجة الملف ${file.name}.`, `Could not process file ${file.name}.`));
      }
    }
    setSettlementAttachments(prev => [...prev, ...prepared].slice(0, 5));
  };

  const postManualSettlement = () => {
    if (!canPostEntries) return alert(tr('لا تملك صلاحية الترحيل.', 'You do not have posting permission.'));
    const amount = roundMoney(Number(settlementAmount) || 0);
    if (amount <= 0) return alert(tr('أدخل مبلغ تسوية صحيح.', 'Enter a valid settlement amount.'));
    if (!String(settlementReason || '').trim()) return alert(tr('سبب التسوية إلزامي.', 'Settlement reason is mandatory.'));
    if (!isPostingDateAllowed(settlementDate)) return alert(tr('الفترة مقفلة لهذا التاريخ.', 'Period is closed for this date.'));

    const validation = validateEquitySettlementInput({
      amount,
      debitAccountId: settlementDebitAccountId,
      creditAccountId: settlementCreditAccountId,
      accountsById: accountById,
      accountBalanceById,
      allowNonEquity: false,
      negativePolicy: 'BLOCK_NEGATIVE',
      creditLimit: 0
    });
    if (!validation.ok) return alert((validation as { message: string }).message);

    if (!confirm(tr('تأكيد ترحيل التسوية؟', 'Confirm posting settlement?'))) return;
    const reference = buildRef('EQS');
    const result = addTransaction(createEquitySettlementPosting({
      amount,
      date: settlementDate,
      debitAccountId: settlementDebitAccountId,
      creditAccountId: settlementCreditAccountId,
      reason: settlementReason,
      reference,
      currency: baseCurrency,
      category: 'equity_settlement'
    }));
    if (!result.ok) return alert(result.message);

    setSettlementDocs(prev => [{
      id: newId('sdoc'),
      reference,
      mode: 'MANUAL',
      date: settlementDate,
      reason: settlementReason,
      amount,
      debitAccountId: settlementDebitAccountId,
      creditAccountId: settlementCreditAccountId,
      attachments: settlementAttachments.length > 0 ? settlementAttachments : undefined
    }, ...prev]);
    appendAuditLog({ entityType: 'equity_settlement', action: 'POST', screen: 'Equity & Partners > Settlement', metadata: { reference, amount } });
    setSettlementAmount('');
    setSettlementReason('');
    setSettlementNote('');
    setSettlementAttachments([]);
    alert(tr('تم ترحيل التسوية.', 'Settlement posted.'));
  };

  const postBulkSettlement = () => {
    if (!canPostEntries) return alert(tr('لا تملك صلاحية الترحيل.', 'You do not have posting permission.'));
    const totalAmount = roundMoney(Number(bulkAmount) || 0);
    if (totalAmount <= 0) return alert(tr('أدخل مبلغ تسوية جماعية صحيح.', 'Enter a valid bulk settlement amount.'));
    if (!String(bulkReason || '').trim()) return alert(tr('سبب التسوية الجماعية إلزامي.', 'Bulk settlement reason is mandatory.'));
    if (!isPostingDateAllowed(bulkDate)) return alert(tr('الفترة مقفلة لهذا التاريخ.', 'Period is closed for this date.'));

    const eligible = partnerRows.filter(p => Boolean(p.currentAccountId));
    if (eligible.length === 0) return alert(tr('لا يوجد شركاء مرتبطون بحساب جاري.', 'No partners linked to current accounts.'));

    const allocations = (() => {
      if (bulkMethod === 'CAPITAL_RATIO') {
        const totalCap = eligible.reduce((s, p) => s + p.capital, 0);
        if (totalCap <= 0) return null;
        let running = 0;
        return eligible.map((partner, idx) => {
          const isLast = idx === eligible.length - 1;
          const amount = isLast ? roundMoney(Math.max(0, totalAmount - running)) : roundMoney((totalAmount * partner.capital) / totalCap);
          running = roundMoney(running + amount);
          return { partnerId: partner.id, partnerName: partner.name, currentAccountId: partner.currentAccountId as string, amount, percent: roundMoney((partner.capital / totalCap) * 100) };
        });
      }
      const withRatios = eligible.map(partner => ({ partner, ratio: roundMoney(Number(bulkCustomRatios[partner.id] || 0)) }));
      const totalRatio = withRatios.reduce((s, item) => s + item.ratio, 0);
      if (totalRatio <= 0 || totalRatio > 100.0001) return null;
      let running = 0;
      return withRatios.map((item, idx) => {
        const isLast = idx === withRatios.length - 1;
        const amount = isLast ? roundMoney(Math.max(0, totalAmount - running)) : roundMoney((totalAmount * item.ratio) / 100);
        running = roundMoney(running + amount);
        return { partnerId: item.partner.id, partnerName: item.partner.name, currentAccountId: item.partner.currentAccountId as string, amount, percent: item.ratio };
      });
    })();

    if (!allocations) return alert(tr('تحقق من نسب/رؤوس أموال التسوية الجماعية.', 'Check bulk settlement ratios/capital values.'));

    const projectedBalances = new Map<string, number>(accountBalanceById);
    for (const line of allocations) {
      const validation = validateEquitySettlementInput({
        amount: line.amount,
        debitAccountId: bulkSourceAccountId,
        creditAccountId: line.currentAccountId,
        accountsById: accountById,
        accountBalanceById: projectedBalances,
        allowNonEquity: false,
        negativePolicy: 'BLOCK_NEGATIVE',
        creditLimit: 0
      });
      if (!validation.ok) return alert(`${line.partnerName}: ${(validation as { message: string }).message}`);

      projectedBalances.set(
        bulkSourceAccountId,
        roundMoney((projectedBalances.get(bulkSourceAccountId) || 0) - line.amount)
      );
      projectedBalances.set(
        line.currentAccountId,
        roundMoney((projectedBalances.get(line.currentAccountId) || 0) + line.amount)
      );
    }

    if (!confirm(tr('تأكيد ترحيل التسوية الجماعية؟', 'Confirm posting bulk settlement?'))) return;

    const reference = buildRef('BSET');
    const errors: string[] = [];
    allocations.forEach(line => {
      const result = addTransaction(createEquitySettlementPosting({
        amount: line.amount,
        date: bulkDate,
        debitAccountId: bulkSourceAccountId,
        creditAccountId: line.currentAccountId,
        reason: `${bulkReason} - ${line.partnerName}`,
        reference,
        currency: baseCurrency,
        category: 'equity_bulk_settlement',
        contactId: line.partnerId
      }));
      if (!result.ok) errors.push(`${line.partnerName}: ${result.message}`);
    });
    if (errors.length > 0) return alert(errors.join('\n'));

    setSettlementDocs(prev => [{ id: newId('bdoc'), reference, mode: 'BULK', date: bulkDate, reason: bulkReason, amount: totalAmount, debitAccountId: bulkSourceAccountId, creditAccountId: allocations[0]?.currentAccountId || bulkSourceAccountId }, ...prev]);
    appendAuditLog({ entityType: 'equity_bulk_settlement', action: 'POST', screen: 'Equity & Partners > Settlement', metadata: { reference, totalAmount, lines: allocations.length } });
    setBulkAmount('');
    setBulkReason('');
    alert(tr('تم ترحيل التسوية الجماعية.', 'Bulk settlement posted.'));
  };

  return (
    <div className={`app-page equity-partners-no-print p-3 md:p-4 font-tajawal animate-in fade-in duration-500 ${isEnglish ? 'text-left' : ''}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-3">
        <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{tr('حقوق الملكية والشركاء', 'Equity & Partners')}</h1>
      </header>

      <div className="grid grid-cols-5 gap-1 bg-white border border-gray-100 rounded-[1.4rem] mb-3 shadow-sm p-1">
        <button onClick={() => setTab('DASHBOARD')} className={`min-w-0 py-2 px-1 rounded-xl text-[9px] sm:text-[10px] font-black flex flex-col sm:flex-row items-center justify-center gap-1 ${tab === 'DASHBOARD' ? 'bg-white shadow-md text-sky-600' : 'text-gray-500'}`}><BarChart3 size={13} /><span className="hidden sm:inline">{tr('حقوق الملكية والشركاء', 'Dashboard')}</span><span className="sm:hidden">{tr('الملخص', 'Dash')}</span></button>
        <button onClick={() => setTab('CAPITAL')} className={`min-w-0 py-2 px-1 rounded-xl text-[9px] sm:text-[10px] font-black flex flex-col sm:flex-row items-center justify-center gap-1 ${tab === 'CAPITAL' ? 'bg-white shadow-md text-sky-600' : 'text-gray-500'}`}><Wallet size={13} /><span>{tr('رأس المال', 'Capital')}</span></button>
        <button onClick={() => setTab('PARTNER_ACCOUNTS')} className={`min-w-0 py-2 px-1 rounded-xl text-[9px] sm:text-[10px] font-black flex flex-col sm:flex-row items-center justify-center gap-1 ${tab === 'PARTNER_ACCOUNTS' ? 'bg-white shadow-md text-sky-600' : 'text-gray-500'}`}><FileText size={13} /><span className="hidden sm:inline">{tr('حساب الشركاء', 'Partner Accounts')}</span><span className="sm:hidden">{tr('الحسابات', 'Accounts')}</span></button>
        <button onClick={() => setTab('PROFIT_DISTRIBUTION')} className={`min-w-0 py-2 px-1 rounded-xl text-[9px] sm:text-[10px] font-black flex flex-col sm:flex-row items-center justify-center gap-1 ${tab === 'PROFIT_DISTRIBUTION' ? 'bg-white shadow-md text-sky-600' : 'text-gray-500'}`}><Percent size={13} /><span className="hidden sm:inline">{tr('توزيع الأرباح', 'Profit Distribution')}</span><span className="sm:hidden">{tr('الأرباح', 'Profits')}</span></button>
        <button onClick={() => setTab('SETTLEMENT')} className={`min-w-0 py-2 px-1 rounded-xl text-[9px] sm:text-[10px] font-black flex flex-col sm:flex-row items-center justify-center gap-1 ${tab === 'SETTLEMENT' ? 'bg-white shadow-md text-sky-600' : 'text-gray-500'}`}><Layers3 size={13} /><span className="hidden sm:inline">{tr('تسوية الحقوق', 'Settlement')}</span><span className="sm:hidden">{tr('تسوية', 'Settle')}</span></button>
      </div>

      {tab === 'DASHBOARD' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm text-xs font-black text-slate-700">
            {tr('عرض فقط. القيم محسوبة من القيود المرحّلة.', 'Read-only. Values are calculated from posted ledger entries.')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {[{ label: tr('إجمالي رأس المال', 'Total Capital'), value: totalCapital }, { label: tr('إجمالي الأرباح المتراكمة', 'Total Retained Earnings'), value: totalRetained }, { label: tr('الأرباح الموزعة', 'Distributed Profits'), value: totalDistributed }, { label: tr('صافي جاري الشركاء', 'Net Partners Current'), value: totalCurrent }].map(card => (
              <div key={card.label} className="rounded-[1.6rem] border p-4 bg-slate-50 text-slate-700 border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-wider">{card.label}</p>
                <p className="text-xl font-black dir-ltr text-right">{fmt(card.value)}</p>
              </div>
            ))}
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
            <div className="text-sm font-black text-slate-700 mb-2">{tr('صافي حقوق الملكية', 'Net Equity')}</div>
            <div className="text-2xl font-black text-indigo-700 dir-ltr text-right">{fmt(netEquity)} {baseCurrency}</div>
            <p className="text-[11px] text-gray-500 font-bold mt-2">{tr('المعادلة: رأس المال + الأرباح المحتجزة + جاري الشركاء', 'Formula: Capital + Retained Earnings + Partners Current')}</p>
          </div>
        </div>
      )}

      {tab === 'CAPITAL' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={capitalMode} onChange={e => setCapitalMode(e.target.value as 'EXISTING' | 'NEW')} className={`${inputClass} text-[11px]`}><option value="EXISTING">{tr('شريك موجود', 'Existing Partner')}</option><option value="NEW">{tr('شريك جديد', 'New Partner')}</option></select>
              {capitalMode === 'EXISTING' ? <select value={capitalPartnerId} onChange={e => setCapitalPartnerId(e.target.value)} className={`${inputClass} text-[11px]`}>{partners.map(p => <option key={p.id} value={p.id}>{displayContactName(p)}</option>)}</select> : <input value={capitalPartnerName} onChange={e => setCapitalPartnerName(e.target.value)} placeholder={tr('اسم الشريك', 'Partner name')} className={inputClass} />}
              <input type="text" min="0" inputMode="decimal" lang={englishNumberLang} value={englishDigits(capitalAmount)} onChange={e => setCapitalAmount(normalizeDecimalInput(e.target.value))} placeholder={tr('مبلغ رأس المال', 'Capital amount')} className={`${inputClass} col-span-2 md:col-span-2 dir-ltr text-right`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <EnglishDateInput value={capitalDate} onChange={setCapitalDate} displayFormat="DMY" className={`${inputClass} text-[11px] dir-ltr`} />
              <input type="text" min="0" max="100" inputMode="decimal" lang={englishNumberLang} value={englishDigits(capitalSharePercent)} onChange={e => setCapitalSharePercent(normalizeDecimalInput(e.target.value))} placeholder={tr('نسبة المشاركة %', 'Share %')} className={`${inputClass} dir-ltr text-right`} />
              <input value={capitalPartnerType} onChange={e => setCapitalPartnerType(e.target.value)} placeholder={tr('نوع الشريك (اختياري)', 'Partner type (optional)')} className={inputClass} />
              <select value={capitalFundingAccountId} onChange={e => setCapitalFundingAccountId(e.target.value)} className={`${inputClass} text-[11px]`}>{fundingAccounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}</select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={!canCreateEntries || !canPostEntries} onClick={() => postCapital('CREATE')} className="p-2.5 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus size={13} />{tr('إضافة رأس مال', 'Create Capital Entry')}</button>
              <button disabled={!canCreateEntries || !canPostEntries} onClick={() => postCapital('INCREASE')} className="p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus size={13} />{tr('زيادة رأس مال', 'Increase Capital')}</button>
              <button disabled={!canCreateEntries || !canPostEntries} onClick={() => postCapital('DECREASE')} className="p-2.5 rounded-xl bg-red-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"><Minus size={13} />{tr('تخفيض رأس مال', 'Decrease Capital')}</button>
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <select value={capitalFilterPartnerId} onChange={e => setCapitalFilterPartnerId(e.target.value)} className={`${inputClass} col-span-2 md:col-span-1 text-[11px]`}><option value="ALL">{tr('كل الشركاء', 'All partners')}</option>{partners.map(p => <option key={p.id} value={p.id}>{displayContactName(p)}</option>)}</select>
              <EnglishDateInput value={capitalFilterFrom} onChange={setCapitalFilterFrom} displayFormat="DMY" placeholder={tr('من تاريخ', 'From date')} className={`${inputClass} text-[11px] dir-ltr`} />
              <EnglishDateInput value={capitalFilterTo} onChange={setCapitalFilterTo} displayFormat="DMY" placeholder={tr('إلى تاريخ', 'To date')} className={`${inputClass} text-[11px] dir-ltr`} />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[12px] font-black">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="py-2 px-2 text-right">{tr('التاريخ', 'Date')}</th>
                    <th className="py-2 px-2 text-right">{tr('الشريك', 'Partner')}</th>
                    <th className="py-2 px-2 text-center">{tr('نسبة الشريك %', 'Partner Share %')}</th>
                    <th className="py-2 px-2 text-center">{tr('المبلغ', 'Amount')}</th>
                    <th className="py-2 px-2 text-center">{tr('المرجع', 'Reference')}</th>
                    <th className="py-2 px-2 text-center">{tr('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {capitalEntries.map(tx => {
                    const partnerId = tx.contactId || '';
                    const partner = partnerById.get(partnerId);
                    const shareValue = partner ? englishDigits(partner.sharePercent ?? 0) : '';

                    return (
                      <tr key={tx.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 px-2">
                          <span className="dir-ltr inline-block">{fmtDate(tx.date)}</span>
                        </td>
                        <td className="py-2 px-2">{partner?.name || displayContactName(contacts.find(c => c.id === tx.contactId)) || tx.contactId || '-'}</td>
                        <td className="py-2 px-2 text-center">
                          {partnerId ? (
                            <input
                              type="text"
                              min="0"
                              max="100"
                              step="0.01"
                              value={englishDigits(shareValue)}
                              inputMode="decimal"
                              lang={englishNumberLang}
                              onChange={e => updatePartnerSharePercent(partnerId, normalizeDecimalInput(e.target.value))}
                              className="w-[110px] p-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-black text-center dir-ltr"
                            />
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 px-2 text-center dir-ltr">{fmt(tx.amount)}</td>
                        <td className="py-2 px-2 text-center dir-ltr">{tx.voucherId || tx.id}</td>
                        <td className="py-2 px-2 text-center">{tx.status || 'POSTED'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'PARTNER_ACCOUNTS' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm text-xs font-black text-slate-700">
            {tr('عرض فقط. الحركات اليومية للشريك تُرحّل على الجاري، والتسوية السنوية تكون بين الجاري ورأس المال.', 'Read-only. Daily partner activity is posted to current, and year-end settlement is between current and capital.')}
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
            <table className="min-w-full text-[12px] font-black">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="py-2 px-2 text-right">{tr('الشريك', 'Partner')}</th>
                  <th className="py-2 px-2 text-center">{tr('رأس المال', 'Capital')}</th>
                  <th className="py-2 px-2 text-center">{tr('جاري الشريك', 'Partner Current')}</th>
                  <th className="py-2 px-2 text-center">{tr('Ledger', 'Ledger')}</th>
                </tr>
              </thead>
              <tbody>
                {partnerRows.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-2">{row.name}</td>
                    <td className="py-2 px-2 text-center dir-ltr">{fmt(row.capital)}</td>
                    <td className="py-2 px-2 text-center dir-ltr">{fmt(row.current)}</td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => setLedgerPartnerId(row.id)} className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-[10px] font-black">
                        {tr('عرض كشف حساب تفصيلي', 'Open Ledger')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledgerPartnerId && (
            <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-black text-sm">{tr('كشف حساب تفصيلي', 'Detailed Ledger')} - {partnerById.get(ledgerPartnerId)?.name}</h4>
                <button onClick={handlePrintPartnerLedger} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-slate-700 hover:bg-gray-50 inline-flex items-center gap-2">
                  <Printer size={14} />
                  {tr('طباعة الكشف', 'Print Ledger')}
                </button>
              </div>
              <table className="min-w-full text-[12px] font-black">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="py-2 px-2 text-right">{tr('التاريخ', 'Date')}</th>
                    <th className="py-2 px-2 text-right">{tr('نوع المستند', 'Doc Type')}</th>
                    <th className="py-2 px-2 text-center">{tr('رقم المستند', 'Doc No')}</th>
                    <th className="py-2 px-2 text-center">{tr('مدين', 'Debit')}</th>
                    <th className="py-2 px-2 text-center">{tr('دائن', 'Credit')}</th>
                    <th className="py-2 px-2 text-center">{tr('الرصيد الجاري', 'Running')}</th>
                    <th className="py-2 px-2 text-right">{tr('ملاحظة', 'Note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLines.map(line => (
                    <tr key={line.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 px-2"><span className="dir-ltr inline-block">{fmtDate(line.date)}</span></td>
                      <td className="py-2 px-2">{line.docType}</td>
                      <td className="py-2 px-2 text-center dir-ltr">{line.docNo}</td>
                      <td className="py-2 px-2 text-center dir-ltr">{line.debit > 0 ? fmt(line.debit) : '-'}</td>
                      <td className="py-2 px-2 text-center dir-ltr">{line.credit > 0 ? fmt(line.credit) : '-'}</td>
                      <td className="py-2 px-2 text-center dir-ltr">{fmt(line.running)}</td>
                      <td className="py-2 px-2">{line.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'PROFIT_DISTRIBUTION' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input
                value={englishDigits(distPeriod)}
                onChange={e => setDistPeriod(normalizeDigitsText(e.target.value))}
                placeholder={tr('السنة/الفترة المالية', 'Fiscal period')}
                className={`${inputClass} text-[11px]`}
              />
              <input
                type="text"
                min="0"
                inputMode="decimal"
                lang={englishNumberLang}
                value={englishDigits(distTotalProfit)}
                onChange={e => setDistTotalProfit(normalizeDecimalInput(e.target.value))}
                placeholder={tr('إجمالي الربح المتاح', 'Total available profit')}
                className={`${inputClass} dir-ltr text-right`}
              />
              <select
                value={distMethod}
                onChange={e => setDistMethod(e.target.value as 'CAPITAL_RATIO' | 'CUSTOM_RATIO' | 'FIXED_AMOUNT')}
                className={`${inputClass} col-span-2 md:col-span-1 text-[11px]`}
              >
                <option value="CAPITAL_RATIO">{tr('حسب نسبة رأس المال', 'By capital share')}</option>
                <option value="CUSTOM_RATIO">{tr('نسبة مخصصة', 'Custom ratio')}</option>
                <option value="FIXED_AMOUNT">{tr('مبلغ ثابت', 'Fixed amount')}</option>
              </select>
              <EnglishDateInput
                value={distDate}
                onChange={setDistDate}
                displayFormat="DMY"
                className={`${inputClass} text-[11px] dir-ltr`}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-black">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex justify-between text-blue-700">
                <span className="truncate">{tr('الربح المتاح', 'Available profit')}</span>
                <span className="dir-ltr shrink-0">{fmt(availableProfitPool)}</span>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 flex justify-between text-indigo-700">
                <span className="truncate">{tr('الموزع', 'Allocated')}</span>
                <span className="dir-ltr shrink-0">{fmt(distributionPreview.totalAllocated)}</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex justify-between text-slate-700">
                <span className="truncate">{tr('المتبقي', 'Remainder')}</span>
                <span className="dir-ltr shrink-0">{fmt(distributionPreview.remainder)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={displayAccountName(retainedEarningsAccount) || tr('الأرباح غير الموزعة', 'Retained Earnings')}
                readOnly
                className={`${inputClass} text-[11px] bg-gray-100 text-gray-700`}
              />
              <input
                value={distNote}
                onChange={e => setDistNote(e.target.value)}
                placeholder={tr('ملاحظة', 'Note')}
                className={inputClass}
              />
            </div>

            {(distMethod === 'CUSTOM_RATIO' || distMethod === 'FIXED_AMOUNT') && (
              <div className="space-y-2">
                {partnerRows.map(p => (
                  <div key={p.id} className="grid grid-cols-2 md:grid-cols-3 gap-2 items-center bg-gray-50 border border-gray-100 rounded-xl p-2">
                    <div className="text-xs font-black text-gray-700 col-span-2 md:col-span-1">{p.name}</div>
                    {distMethod === 'CUSTOM_RATIO' ? (
                      <input
                        type="text"
                        min="0"
                        max="100"
                        inputMode="decimal"
                        lang={englishNumberLang}
                        value={englishDigits(distCustomRatios[p.id] || '')}
                        onChange={e => setDistCustomRatios(prev => ({ ...prev, [p.id]: normalizeDecimalInput(e.target.value) }))}
                        placeholder={tr('النسبة %', 'Ratio %')}
                        className={`${inputClass} dir-ltr text-right`}
                      />
                    ) : (
                      <input
                        type="text"
                        min="0"
                        inputMode="decimal"
                        lang={englishNumberLang}
                        value={englishDigits(distFixedAmounts[p.id] || '')}
                        onChange={e => setDistFixedAmounts(prev => ({ ...prev, [p.id]: normalizeDecimalInput(e.target.value) }))}
                        placeholder={tr('المبلغ', 'Amount')}
                        className={`${inputClass} dir-ltr text-right`}
                      />
                    )}
                    <div className="hidden md:block text-[11px] text-gray-500 font-bold">{tr('الترحيل على جاري الشريك', 'Posted to partner current account')}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              disabled={!canPostEntries}
              onClick={postDistribution}
              className="w-full p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Plus size={13} />
              {tr('ترحيل', 'Post Distribution')}
            </button>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-sm mb-2">{tr('مستندات توزيع الأرباح', 'Profit Distribution Documents')}</h3>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {profitDocs.map(doc => (
                <div key={doc.id} className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-black">
                  <div>{doc.reference} - {doc.period} - <span className="dir-ltr">{fmtDate(doc.date)}</span></div>
                  <div>{doc.method} - {fmt(doc.totalAllocated)} / {fmt(doc.totalProfit)}</div>
                </div>
              ))}
              {profitDocs.length === 0 && (
                <div className="text-[11px] font-black text-gray-400">{tr('لا توجد مستندات بعد', 'No documents yet')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'SETTLEMENT' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={settlementDebitAccountId} onChange={e => setSettlementDebitAccountId(e.target.value)} className={`${inputClass} text-[11px]`}>
                {settlementAccounts.map(a => <option key={a.id} value={a.id}>{tr('مدين', 'Debit')}: {displayAccountName(a)}</option>)}
              </select>
              <select value={settlementCreditAccountId} onChange={e => setSettlementCreditAccountId(e.target.value)} className={`${inputClass} text-[11px]`}>
                {settlementAccounts.map(a => <option key={a.id} value={a.id}>{tr('دائن', 'Credit')}: {displayAccountName(a)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input type="text" min="0" inputMode="decimal" lang={englishNumberLang} value={englishDigits(settlementAmount)} onChange={e => setSettlementAmount(normalizeDecimalInput(e.target.value))} placeholder={tr('المبلغ', 'Amount')} className={`${inputClass} dir-ltr text-right`} />
              <EnglishDateInput value={settlementDate} onChange={setSettlementDate} displayFormat="DMY" className={`${inputClass} text-[11px] dir-ltr`} />
              <input value={settlementReason} onChange={e => setSettlementReason(e.target.value)} placeholder={tr('السبب (إلزامي)', 'Reason (required)')} className={inputClass} />
              <input value={settlementNote} onChange={e => setSettlementNote(e.target.value)} placeholder={tr('ملاحظة', 'Note')} className={inputClass} />
            </div>
            <button disabled={!canPostEntries} onClick={postManualSettlement} className="w-full p-2.5 rounded-xl bg-sky-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus size={13} />{tr('ترحيل تسوية الحقوق', 'Post Settlement')}</button>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-2">
            <h3 className="font-black text-sm">{tr('تسوية جماعية', 'Bulk Settlement')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={bulkMethod} onChange={e => setBulkMethod(e.target.value as 'CAPITAL_RATIO' | 'CUSTOM_RATIO')} className={`${inputClass} text-[11px]`}>
                <option value="CAPITAL_RATIO">{tr('حسب نسبة رأس المال', 'By capital ratio')}</option>
                <option value="CUSTOM_RATIO">{tr('حسب نسبة مخصصة', 'By custom ratio')}</option>
              </select>
              <input type="text" min="0" inputMode="decimal" lang={englishNumberLang} value={englishDigits(bulkAmount)} onChange={e => setBulkAmount(normalizeDecimalInput(e.target.value))} placeholder={tr('المبلغ الإجمالي', 'Total amount')} className={`${inputClass} dir-ltr text-right`} />
              <EnglishDateInput value={bulkDate} onChange={setBulkDate} displayFormat="DMY" className={`${inputClass} text-[11px] dir-ltr`} />
              <select value={bulkSourceAccountId} onChange={e => setBulkSourceAccountId(e.target.value)} className={`${inputClass} col-span-2 md:col-span-1 text-[11px]`}>
                {equityAccounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
              </select>
            </div>
            {bulkMethod === 'CUSTOM_RATIO' && (
              <div className="space-y-2">
                {partnerRows.map(p => (
                  <div key={p.id} className="grid grid-cols-2 md:grid-cols-3 gap-2 items-center bg-gray-50 border border-gray-100 rounded-xl p-2">
                    <div className="text-xs font-black text-gray-700 col-span-2 md:col-span-1">{p.name}</div>
                    <input type="text" min="0" max="100" inputMode="decimal" lang={englishNumberLang} value={englishDigits(bulkCustomRatios[p.id] || '')} onChange={e => setBulkCustomRatios(prev => ({ ...prev, [p.id]: normalizeDecimalInput(e.target.value) }))} placeholder={tr('النسبة %', 'Ratio %')} className={`${inputClass} dir-ltr text-right`} />
                    <div className="hidden md:block text-[11px] text-gray-500 font-bold">{tr('التوزيع على جاري الشركاء', 'Allocated to partner current accounts')}</div>
                  </div>
                ))}
              </div>
            )}
            <input value={bulkReason} onChange={e => setBulkReason(e.target.value)} placeholder={tr('سبب التسوية الجماعية', 'Bulk reason')} className={inputClass} />
            <button disabled={!canPostEntries} onClick={postBulkSettlement} className="w-full p-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus size={13} />{tr('ترحيل التسوية الجماعية', 'Post Bulk Settlement')}</button>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-sm mb-2">{tr('سجل التسويات', 'Settlement Documents')}</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {settlementDocs.map(doc => (
                <div key={doc.id} className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-black">
                  <div>{doc.reference} - {doc.mode} - <span className="dir-ltr">{fmtDate(doc.date)}</span></div>
                  <div>{doc.reason} - {fmt(doc.amount)}</div>
                  {doc.attachments && doc.attachments.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {doc.attachments.map(att => (
                        <a key={att.id} href={att.dataUrl} download={att.name} className="block text-[11px] text-blue-700 truncate">
                          {att.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {settlementDocs.length === 0 && (
                <div className="text-[11px] font-black text-gray-400">{tr('لا توجد تسويات بعد', 'No settlement documents yet')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquityPartnersManager;
