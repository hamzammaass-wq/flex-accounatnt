import React, { useMemo, useState } from 'react';
import { CheckCircle2, Info, Layers, Save, Search, Truck, Users } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { Account, Contact, Transaction, TransactionType } from '../types';
import EnglishDateInput from './EnglishDateInput';
import { getDisplayAccountName } from '../utils/displayNames';

type OpeningBalanceTab = 'CUSTOMERS' | 'SUPPLIERS' | 'ACCOUNTS';
type BalanceSide = 'DEBIT' | 'CREDIT';

type DraftState = {
  amountText: string;
  side: BalanceSide;
};

type ContactOpeningRow = {
  key: string;
  kind: 'CONTACT';
  contact: Contact;
  postingAccountId: string;
  postingAccount: Account | null;
  currentNet: number;
  defaultSide: BalanceSide;
};

type AccountOpeningRow = {
  key: string;
  kind: 'ACCOUNT';
  account: Account;
  postingAccountId: string;
  currentNet: number;
  defaultSide: BalanceSide;
};

type OpeningRow = ContactOpeningRow | AccountOpeningRow;

const OPENING_BALANCE_CATEGORIES = new Set(['opening_balance_setup', 'opening_balance_import']);
const OFFSET_ACCOUNT_PRIORITY = ['acc_import_opening_balances', 'acc_retained_earnings', 'acc_capital'];

const round2 = (value: number): number => Math.round(value * 100) / 100;

const isZero = (value: number): boolean => Math.abs(value) <= 0.009;

const parseAmountText = (value: string): number => {
  const normalized = String(value || '').replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? round2(Math.abs(parsed)) : Number.NaN;
};

const formatAmountInput = (value: number): string => {
  if (!Number.isFinite(value) || isZero(value)) return '';
  return String(round2(value));
};

const formatAmountLabel = (value: number): string => (
  round2(Math.abs(value)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
);

const createOpeningTransactionId = (rowKey: string): string => {
  const safeRowKey = rowKey.replace(/[^\w-]/g, '_');
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `tx_opening_${safeRowKey}_${Date.now().toString(36)}_${randomPart}`;
};

const resolveContactPostingAccountId = (contact: Contact): string | null => {
  const preferred = String(contact.currentAccountId || contact.linkedAccountId || '').trim();
  if (preferred) return preferred;
  if (contact.type === 'CUSTOMER') return 'acc_receivable';
  if (contact.type === 'SUPPLIER') return 'acc_payable';
  return null;
};

const getTargetNet = (sourceTransactions: Transaction[], targetAccountId: string): number => (
  round2(sourceTransactions.reduce((sum, transaction) => {
    if (transaction.debitAccountId === targetAccountId) return sum + Number(transaction.amount || 0);
    if (transaction.creditAccountId === targetAccountId) return sum - Number(transaction.amount || 0);
    return sum;
  }, 0))
);

const OpeningBalancesManager: React.FC = () => {
  const {
    accounts,
    contacts,
    transactions,
    setTransactions,
    appendAuditLog,
    baseCurrency,
    companySettings
  } = useAccounting();

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

  const [activeTab, setActiveTab] = useState<OpeningBalanceTab>('CUSTOMERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [openingDate, setOpeningDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);

  const offsetAccount = useMemo(
    () => OFFSET_ACCOUNT_PRIORITY
      .map(id => accounts.find(account => account.id === id && !account.isGroup) || null)
      .find((account): account is Account => Boolean(account)) || null,
    [accounts]
  );

  const offsetAccountIds = useMemo(
    () => new Set(
      OFFSET_ACCOUNT_PRIORITY
        .map(id => accounts.find(account => account.id === id && !account.isGroup)?.id || '')
        .filter(Boolean)
    ),
    [accounts]
  );

  const commercialLinkedAccountIds = useMemo(
    () => new Set(
      contacts
        .filter(contact => contact.type === 'CUSTOMER' || contact.type === 'SUPPLIER')
        .map(contact => resolveContactPostingAccountId(contact) || '')
        .filter(Boolean)
    ),
    [contacts]
  );

  const getOpeningTransactionsForRow = (row: OpeningRow): Transaction[] => {
    if (row.kind === 'CONTACT') {
      return transactions.filter(transaction => (
        OPENING_BALANCE_CATEGORIES.has(String(transaction.category || ''))
        && transaction.contactId === row.contact.id
        && (
          (transaction.debitAccountId === row.postingAccountId && offsetAccountIds.has(String(transaction.creditAccountId || '')))
          || (transaction.creditAccountId === row.postingAccountId && offsetAccountIds.has(String(transaction.debitAccountId || '')))
        )
      ));
    }

    return transactions.filter(transaction => (
      OPENING_BALANCE_CATEGORIES.has(String(transaction.category || ''))
      && !transaction.contactId
      && (
        (transaction.debitAccountId === row.account.id && offsetAccountIds.has(String(transaction.creditAccountId || '')))
        || (transaction.creditAccountId === row.account.id && offsetAccountIds.has(String(transaction.debitAccountId || '')))
      )
    ));
  };

  const customerRows = useMemo<ContactOpeningRow[]>(
    () => contacts
      .filter(contact => contact.type === 'CUSTOMER' && !/^cash_/i.test(String(contact.id || '').trim()))
      .map(contact => {
        const postingAccountId = resolveContactPostingAccountId(contact);
        const postingAccount = postingAccountId
          ? (accounts.find(account => account.id === postingAccountId && !account.isGroup) || null)
          : null;
        if (!postingAccountId || !postingAccount) return null;

        const row: ContactOpeningRow = {
          key: `contact:${contact.id}`,
          kind: 'CONTACT',
          contact,
          postingAccountId,
          postingAccount,
          currentNet: 0,
          defaultSide: 'DEBIT'
        };

        return {
          ...row,
          currentNet: getTargetNet(getOpeningTransactionsForRow(row), postingAccountId)
        };
      })
      .filter((row): row is ContactOpeningRow => Boolean(row))
      .sort((left, right) => left.contact.name.localeCompare(right.contact.name, 'ar')),
    [accounts, contacts, transactions, offsetAccountIds]
  );

  const supplierRows = useMemo<ContactOpeningRow[]>(
    () => contacts
      .filter(contact => contact.type === 'SUPPLIER' && !/^cash_/i.test(String(contact.id || '').trim()))
      .map(contact => {
        const postingAccountId = resolveContactPostingAccountId(contact);
        const postingAccount = postingAccountId
          ? (accounts.find(account => account.id === postingAccountId && !account.isGroup) || null)
          : null;
        if (!postingAccountId || !postingAccount) return null;

        const row: ContactOpeningRow = {
          key: `contact:${contact.id}`,
          kind: 'CONTACT',
          contact,
          postingAccountId,
          postingAccount,
          currentNet: 0,
          defaultSide: 'CREDIT'
        };

        return {
          ...row,
          currentNet: getTargetNet(getOpeningTransactionsForRow(row), postingAccountId)
        };
      })
      .filter((row): row is ContactOpeningRow => Boolean(row))
      .sort((left, right) => left.contact.name.localeCompare(right.contact.name, 'ar')),
    [accounts, contacts, transactions, offsetAccountIds]
  );

  const accountRows = useMemo<AccountOpeningRow[]>(
    () => accounts
      .filter(account => (
        !account.isGroup
        && !offsetAccountIds.has(account.id)
        && !commercialLinkedAccountIds.has(account.id)
      ))
      .map(account => {
        const row: AccountOpeningRow = {
          key: `account:${account.id}`,
          kind: 'ACCOUNT',
          account,
          postingAccountId: account.id,
          currentNet: 0,
          defaultSide: account.type === 'ASSET' || account.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
        };

        return {
          ...row,
          currentNet: getTargetNet(getOpeningTransactionsForRow(row), account.id)
        };
      })
      .sort((left, right) => left.account.code.localeCompare(right.account.code)),
    [accounts, transactions, offsetAccountIds, commercialLinkedAccountIds]
  );

  const getCurrentDraft = (row: OpeningRow): DraftState => {
    const existingDraft = drafts[row.key];
    if (existingDraft) return existingDraft;

    return {
      amountText: formatAmountInput(Math.abs(row.currentNet)),
      side: isZero(row.currentNet)
        ? row.defaultSide
        : row.currentNet >= 0 ? 'DEBIT' : 'CREDIT'
    };
  };

  const getRowSearchText = (row: OpeningRow): string => {
    if (row.kind === 'CONTACT') {
      return [
        row.contact.name,
        row.contact.phone,
        row.postingAccount?.name,
        getDisplayAccountName(row.postingAccount || undefined, isEnglish)
      ].join(' ').toLowerCase();
    }

    return [
      row.account.name,
      row.account.code,
      getDisplayAccountName(row.account, isEnglish)
    ].join(' ').toLowerCase();
  };

  const visibleRows = useMemo(() => {
    const source = activeTab === 'CUSTOMERS'
      ? customerRows
      : activeTab === 'SUPPLIERS'
        ? supplierRows
        : accountRows;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return source;
    return source.filter(row => getRowSearchText(row).includes(normalizedSearch));
  }, [activeTab, accountRows, customerRows, searchTerm, supplierRows]);

  const totalConfiguredRows = useMemo(
    () => ({
      customers: customerRows.filter(row => !isZero(row.currentNet)).length,
      suppliers: supplierRows.filter(row => !isZero(row.currentNet)).length,
      accounts: accountRows.filter(row => !isZero(row.currentNet)).length
    }),
    [accountRows, customerRows, supplierRows]
  );

  const updateDraft = (rowKey: string, patch: Partial<DraftState>) => {
    setDrafts(prev => {
      const base = prev[rowKey] || { amountText: '', side: 'DEBIT' as BalanceSide };
      return {
        ...prev,
        [rowKey]: {
          ...base,
          ...patch
        }
      };
    });
  };

  const getRowDisplayName = (row: OpeningRow): string => (
    row.kind === 'CONTACT'
      ? row.contact.name
      : getDisplayAccountName(row.account, isEnglish)
  );

  const getRowSecondaryLabel = (row: OpeningRow): string => {
    if (row.kind === 'CONTACT') {
      const postingLabel = row.postingAccount
        ? getDisplayAccountName(row.postingAccount, isEnglish)
        : row.postingAccountId;
      return row.contact.phone
        ? `${postingLabel} - ${row.contact.phone}`
        : postingLabel;
    }

    return `${row.account.code} - ${(row.account.currency || baseCurrency)}`;
  };

  const getCurrentBalanceLabel = (row: OpeningRow): string => {
    if (isZero(row.currentNet)) return tr('غير مضبوط', 'Not set');
    const sideLabel = row.kind === 'CONTACT'
      ? (row.currentNet >= 0 ? tr('عليه', 'Due') : tr('له', 'Credit'))
      : (row.currentNet >= 0 ? tr('مدين', 'Debit') : tr('دائن', 'Credit'));
    return `${formatAmountLabel(row.currentNet)} ${sideLabel}`;
  };

  const applyRows = (rowsToApply: OpeningRow[]) => {
    if (!offsetAccount) {
      setStatusTone('error');
      setStatusMessage(tr('تعذر تحديد حساب مقابل للأرصدة الافتتاحية. يرجى التحقق من حساب الأرباح المبقاة أو رأس المال.', 'Could not resolve the offset account for opening balances. Check retained earnings or capital account.'));
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(openingDate || '').trim())) {
      setStatusTone('error');
      setStatusMessage(tr('يرجى إدخال تاريخ افتتاحي صحيح بصيغة السنة-الشهر-اليوم.', 'Enter a valid opening date in YYYY-MM-DD format.'));
      return;
    }

    if (rowsToApply.length === 0) {
      setStatusTone('error');
      setStatusMessage(tr('لا توجد عناصر للحفظ في هذا العرض.', 'There are no rows to save in this view.'));
      return;
    }

    const idsToRemove = new Set<string>();
    const createdTransactions: Transaction[] = [];

    for (const row of rowsToApply) {
      const draft = getCurrentDraft(row);
      const amount = parseAmountText(draft.amountText);
      if (Number.isNaN(amount)) {
        setStatusTone('error');
        setStatusMessage(tr(`قيمة الرصيد في "${getRowDisplayName(row)}" غير صالحة.`, `The opening balance in "${getRowDisplayName(row)}" is invalid.`));
        return;
      }

      const existingTransactions = getOpeningTransactionsForRow(row);
      existingTransactions.forEach(transaction => idsToRemove.add(transaction.id));

      if (isZero(amount)) continue;

      const postingAccountId = row.postingAccountId;
      const currency = row.kind === 'CONTACT'
        ? (row.postingAccount?.currency || baseCurrency)
        : (row.account.currency || baseCurrency);

      createdTransactions.push({
        id: createOpeningTransactionId(row.key),
        amount,
        description: row.kind === 'CONTACT'
          ? `Opening balance - ${row.contact.name}`
          : `Opening balance - ${row.account.name}`,
        category: 'opening_balance_setup',
        type: TransactionType.TRANSFER,
        date: openingDate,
        debitAccountId: draft.side === 'DEBIT' ? postingAccountId : offsetAccount.id,
        creditAccountId: draft.side === 'DEBIT' ? offsetAccount.id : postingAccountId,
        contactId: row.kind === 'CONTACT' ? row.contact.id : undefined,
        currency,
        exchangeRate: 1,
        status: 'POSTED'
      });
    }

    setTransactions(prev => {
      const filtered = prev.filter(transaction => !idsToRemove.has(transaction.id));
      return [...createdTransactions, ...filtered];
    });

    rowsToApply.forEach(row => {
      const draft = getCurrentDraft(row);
      const amount = parseAmountText(draft.amountText);
      appendAuditLog({
        entityType: 'opening_balance',
        entityId: row.kind === 'CONTACT' ? row.contact.id : row.account.id,
        action: 'UPSERT',
        screen: 'Settings > Opening Balances',
        metadata: {
          rowKind: row.kind,
          rowKey: row.key,
          date: openingDate,
          amount: Number.isNaN(amount) ? 0 : amount,
          side: draft.side,
          postingAccountId: row.postingAccountId,
          offsetAccountId: offsetAccount.id
        }
      });
    });

    setDrafts(prev => {
      const next = { ...prev };
      rowsToApply.forEach(row => {
        delete next[row.key];
      });
      return next;
    });

    setStatusTone('success');
    setStatusMessage(
      rowsToApply.length === 1
        ? tr(`تم حفظ الرصيد الافتتاحي لـ "${getRowDisplayName(rowsToApply[0])}".`, `Opening balance saved for "${getRowDisplayName(rowsToApply[0])}".`)
        : tr(`تم حفظ ${rowsToApply.length} أرصدة افتتاحية بنجاح.`, `${rowsToApply.length} opening balances were saved successfully.`)
    );
  };

  const renderSideOptions = (row: OpeningRow) => {
    if (row.kind === 'CONTACT') {
      return (
        <>
          <option value="DEBIT">{tr('عليه', 'Due')}</option>
          <option value="CREDIT">{tr('له', 'Credit')}</option>
        </>
      );
    }

    return (
      <>
        <option value="DEBIT">{tr('مدين', 'Debit')}</option>
        <option value="CREDIT">{tr('دائن', 'Credit')}</option>
      </>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="rounded-[1.9rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-black text-slate-900">{tr('الأرصدة الافتتاحية', 'Opening Balances')}</h3>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
              {tr(
                'أدخل رصيد البداية للعملاء والموردين والحسابات. يتم ترحيل كل رصيد كقيد افتتاحي مقابل حساب الأرباح المبقاة أو رأس المال.',
                'Enter start balances for customers, suppliers, and accounts. Each balance is posted as an opening entry against retained earnings or capital.'
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700">
            {tr('الحساب المقابل', 'Offset account')}: {offsetAccount ? getDisplayAccountName(offsetAccount, isEnglish) : tr('غير متاح', 'Unavailable')}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
          <EnglishDateInput
            value={openingDate}
            onChange={setOpeningDate}
            displayFormat="YMD"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none dir-ltr"
            aria-label={tr('تاريخ القيد الافتتاحي', 'Opening entry date')}
          />
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={tr('ابحث بالاسم أو الكود أو الهاتف...', 'Search by name, code, or phone...')}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm font-bold outline-none"
            />
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <button
            type="button"
            onClick={() => applyRows(visibleRows)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <Save className="h-4 w-4" />
            {tr('حفظ الظاهر', 'Save Visible')}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setActiveTab('CUSTOMERS')}
            className={`rounded-2xl border px-4 py-3 text-right transition ${activeTab === 'CUSTOMERS' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-black">{tr('العملاء', 'Customers')}</span>
            </div>
            <div className="mt-1 text-[11px] font-bold">{tr('أرصدة مضبوطة', 'Configured')}: {totalConfiguredRows.customers}</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SUPPLIERS')}
            className={`rounded-2xl border px-4 py-3 text-right transition ${activeTab === 'SUPPLIERS' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          >
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              <span className="text-sm font-black">{tr('الموردون', 'Suppliers')}</span>
            </div>
            <div className="mt-1 text-[11px] font-bold">{tr('أرصدة مضبوطة', 'Configured')}: {totalConfiguredRows.suppliers}</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ACCOUNTS')}
            className={`rounded-2xl border px-4 py-3 text-right transition ${activeTab === 'ACCOUNTS' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span className="text-sm font-black">{tr('الحسابات', 'Accounts')}</span>
            </div>
            <div className="mt-1 text-[11px] font-bold">{tr('أرصدة مضبوطة', 'Configured')}: {totalConfiguredRows.accounts}</div>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-800">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {activeTab === 'ACCOUNTS'
                ? tr(
                  'لمنع التكرار، الحسابات المرتبطة مباشرة بالعملاء والموردين لا تظهر هنا وتتم إدارتها من تبويبي العملاء أو الموردين.',
                  'To prevent duplicates, accounts linked directly to customers or suppliers are hidden here and should be managed from the customer or supplier tabs.'
                )
                : tr(
                  'يمكنك ترك المبلغ فارغًا أو صفرًا لإزالة الرصيد الافتتاحي عن هذا الطرف.',
                  'Leave the amount blank or zero to remove the opening balance from this party.'
                )}
            </span>
          </div>
        </div>

        {statusMessage && (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-xs font-black ${statusTone === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
            {statusMessage}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {visibleRows.map(row => {
          const draft = getCurrentDraft(row);
          return (
            <div key={row.key} className="rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-black text-slate-900">{getRowDisplayName(row)}</div>
                  <div className="mt-1 text-[11px] font-bold text-slate-500">{getRowSecondaryLabel(row)}</div>
                </div>
                <div className={`rounded-2xl px-3 py-2 text-[11px] font-black ${isZero(row.currentNet) ? 'bg-slate-100 text-slate-500' : row.currentNet >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {getCurrentBalanceLabel(row)}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto]">
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.amountText}
                  onChange={(event) => updateDraft(row.key, { amountText: event.target.value.replace(/[^\d.,]/g, '') })}
                  placeholder={tr('المبلغ', 'Amount')}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none dir-ltr"
                />
                <select
                  value={draft.side}
                  onChange={(event) => updateDraft(row.key, { side: event.target.value as BalanceSide })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none"
                >
                  {renderSideOptions(row)}
                </select>
                <button
                  type="button"
                  onClick={() => applyRows([row])}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {tr('حفظ', 'Save')}
                </button>
              </div>
            </div>
          );
        })}

        {visibleRows.length === 0 && (
          <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
            <div className="text-sm font-black text-slate-500">{tr('لا توجد عناصر مطابقة', 'No matching rows')}</div>
            <div className="mt-2 text-xs font-bold text-slate-400">
              {tr('جرّب تغيير البحث أو انتقل إلى تبويب آخر.', 'Try a different search or switch to another tab.')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OpeningBalancesManager;
