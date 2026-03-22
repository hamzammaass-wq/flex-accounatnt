import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Layers3, Package, Pin, Plus, Receipt, Search, Truck, Users, Wallet, X } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, type Account, type Contact, type ContactType } from '../types';
import { getDisplayAccountName, getDisplayContactName } from '../utils/displayNames';
import { openDrilldown } from '../utils/drilldown';
import { getFiscalYear, getFiscalYearStart, isProfitLossAccount } from '../utils/fiscalYear';

type ImportantAccountsTab =
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'CASHBOXES'
  | 'INVENTORY'
  | 'SALES'
  | 'PURCHASES'
  | 'EXPENSES';

interface ImportantAccountsHubProps {
  onBack: () => void;
  onOpenDirectory: () => void;
  onOpenTreasury: () => void;
  onOpenAccountsTree: () => void;
  onOpenWarehouses: () => void;
}

type ContactRow = {
  id: string;
  name: string;
  phone?: string;
  balance: number;
  type: Extract<ContactType, 'CUSTOMER' | 'SUPPLIER'>;
  searchText: string;
};

type AccountRow = {
  id: string;
  code: string;
  name: string;
  balance: number;
  currency: string;
  parentLabel: string;
  isTemporary: boolean;
  searchText: string;
};

const PURCHASE_ACCOUNT_IDS = new Set(['acc_purchases', 'acc_purchase_returns', 'acc_purchase_discounts_earned']);

const ImportantAccountsHub: React.FC<ImportantAccountsHubProps> = ({
  onBack,
  onOpenDirectory,
  onOpenTreasury,
  onOpenAccountsTree,
  onOpenWarehouses
}) => {
  const { accounts, contacts, invoices, transactions, baseCurrency, companySettings, updateCompanySettings } = useAccounting();
  const [activeTab, setActiveTab] = useState<ImportantAccountsTab>('CUSTOMERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomAccountsPicker, setShowCustomAccountsPicker] = useState(false);
  const [customAccountQuery, setCustomAccountQuery] = useState('');
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayAccountName = (account?: Pick<Account, 'id' | 'name' | 'code'> | null) => getDisplayAccountName(account || undefined, isEnglish);
  const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentFiscalStart = useMemo(() => getFiscalYearStart(getFiscalYear(todayIso)), [todayIso]);
  const formatAmount = (value: number, absolute = false) => {
    const safeValue = absolute ? Math.abs(value) : value;
    return Number(safeValue || 0).toLocaleString(undefined, {
      minimumFractionDigits: Math.abs(safeValue) > 0 && Math.abs(safeValue) < 1 ? 2 : 0,
      maximumFractionDigits: 2
    });
  };

  const accountMap = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);

  const temporaryAccountBalanceMap = useMemo(() => {
    const balances = new Map<string, number>();

    accounts.forEach(account => {
      if (isProfitLossAccount(account.type)) {
        balances.set(account.id, 0);
      }
    });

    transactions.forEach(transaction => {
      if (transaction.status === 'DRAFT' || transaction.date < currentFiscalStart) return;
      const amountInBase = (Number(transaction.amount) || 0) * (Number(transaction.exchangeRate) || 1);
      if (amountInBase === 0) return;

      const applyEntry = (accountId: string | undefined, side: 'DEBIT' | 'CREDIT') => {
        if (!accountId) return;
        const account = accountMap.get(accountId);
        if (!account || !isProfitLossAccount(account.type)) return;

        const isDebitNature = account.type === 'EXPENSE';
        const delta = side === 'DEBIT'
          ? (isDebitNature ? amountInBase : -amountInBase)
          : (isDebitNature ? -amountInBase : amountInBase);
        balances.set(account.id, (balances.get(account.id) || 0) + delta);
      };

      applyEntry(transaction.debitAccountId, 'DEBIT');
      applyEntry(transaction.creditAccountId, 'CREDIT');
    });

    return balances;
  }, [accounts, accountMap, currentFiscalStart, transactions]);

  const getVisibleAccountBalance = (account: Account) => (
    isProfitLossAccount(account.type)
      ? (temporaryAccountBalanceMap.get(account.id) ?? 0)
      : account.balance
  );

  const getVisibleAccountCurrency = (account: Account) => (
    isProfitLossAccount(account.type)
      ? baseCurrency
      : (account.currency || baseCurrency)
  );

  const collectSubtreeIds = (rootId: string) => {
    const ids = new Set<string>();
    const visit = (nodeId: string) => {
      ids.add(nodeId);
      accounts.filter(account => account.parentId === nodeId).forEach(child => visit(child.id));
    };
    if (accountMap.has(rootId)) visit(rootId);
    return ids;
  };

  const inventoryIds = useMemo(() => collectSubtreeIds('acc_inventory_group'), [accounts, accountMap]);
  const revenueIds = useMemo(() => collectSubtreeIds('acc_revenue_root'), [accounts, accountMap]);
  const expenseIds = useMemo(() => collectSubtreeIds('acc_expense_root'), [accounts, accountMap]);
  const getTransactionDC = (transaction: typeof transactions[number], contact: Pick<Contact, 'type' | 'currentAccountId' | 'linkedAccountId'>) => {
    const linkedAccountId = contact.currentAccountId || contact.linkedAccountId;
    let debit = 0;
    let credit = 0;

    if (transaction.invoiceId) {
      const invoice = invoices.find(item => item.id === transaction.invoiceId);
      if (invoice) {
        if (contact.type === 'CUSTOMER') {
          debit = invoice.type === TransactionType.INCOME ? transaction.amount : 0;
          credit = invoice.type === TransactionType.INCOME ? 0 : transaction.amount;
        } else {
          credit = invoice.type === TransactionType.EXPENSE ? transaction.amount : 0;
          debit = invoice.type === TransactionType.EXPENSE ? 0 : transaction.amount;
        }
        return { debit, credit };
      }
    }

    const debitAccountId = transaction.debitAccountId || '';
    const creditAccountId = transaction.creditAccountId || '';

    if (linkedAccountId && (debitAccountId === linkedAccountId || creditAccountId === linkedAccountId)) {
      debit = debitAccountId === linkedAccountId ? transaction.amount : 0;
      credit = creditAccountId === linkedAccountId ? transaction.amount : 0;
      return { debit, credit };
    }

    if (transaction.category === 'journal' || debitAccountId || creditAccountId) {
      if (contact.type === 'CUSTOMER') {
        if (debitAccountId.includes('receivable')) debit = transaction.amount;
        else if (creditAccountId.includes('receivable')) credit = transaction.amount;
      } else {
        if (creditAccountId.includes('payable')) credit = transaction.amount;
        else if (debitAccountId.includes('payable')) debit = transaction.amount;
      }

      if (debit > 0 || credit > 0) {
        return { debit, credit };
      }
    }

    if (contact.type === 'CUSTOMER') {
      if (transaction.type === TransactionType.INCOME) {
        debit = transaction.category === 'sales_invoice' ? transaction.amount : 0;
        credit = transaction.category === 'sales_invoice' ? 0 : transaction.amount;
      } else {
        credit = transaction.amount;
      }
    } else {
      if (transaction.type === TransactionType.EXPENSE) {
        credit = (transaction.category === 'purchase_invoice' || transaction.category === 'expense') ? transaction.amount : 0;
        debit = credit > 0 ? 0 : transaction.amount;
      } else {
        debit = transaction.amount;
      }
    }

    return { debit, credit };
  };

  const contactBalanceMap = useMemo(() => {
    const balances = new Map<string, number>();

    contacts
      .filter(contact => contact.type === 'CUSTOMER' || contact.type === 'SUPPLIER')
      .forEach(contact => {
        let runningBalance = 0;
        let foundTransactions = false;

        transactions.forEach(transaction => {
          if (transaction.contactId !== contact.id) return;
          foundTransactions = true;
          const { debit, credit } = getTransactionDC(transaction, contact);
          runningBalance += debit - credit;
        });

        const linkedAccountId = contact.currentAccountId || contact.linkedAccountId;
        const linkedAccountBalance = linkedAccountId ? (accountMap.get(linkedAccountId)?.balance ?? 0) : 0;
        balances.set(contact.id, foundTransactions ? runningBalance : linkedAccountBalance);
      });

    return balances;
  }, [contacts, transactions, invoices, accountMap]);

  const customerRows = useMemo<ContactRow[]>(() => (
    contacts
      .filter(contact => contact.type === 'CUSTOMER')
      .map(contact => {
        const name = displayContactName(contact);
        return {
          id: contact.id,
          name,
          phone: contact.phone,
          balance: contactBalanceMap.get(contact.id) ?? 0,
          type: 'CUSTOMER',
          searchText: `${name} ${contact.name} ${contact.phone || ''}`.toLowerCase()
        };
      })
      .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance) || left.name.localeCompare(right.name))
  ), [contacts, contactBalanceMap, isEnglish]);

  const supplierRows = useMemo<ContactRow[]>(() => (
    contacts
      .filter(contact => contact.type === 'SUPPLIER')
      .map(contact => {
        const name = displayContactName(contact);
        return {
          id: contact.id,
          name,
          phone: contact.phone,
          balance: contactBalanceMap.get(contact.id) ?? 0,
          type: 'SUPPLIER',
          searchText: `${name} ${contact.name} ${contact.phone || ''}`.toLowerCase()
        };
      })
      .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance) || left.name.localeCompare(right.name))
  ), [contacts, contactBalanceMap, isEnglish]);

  const toAccountRow = (account: Account, fallbackParentLabel: string): AccountRow => {
    const name = displayAccountName(account);
    const parentLabel = displayAccountName(account.parentId ? accountMap.get(account.parentId) : null) || fallbackParentLabel;
    const isTemporary = isProfitLossAccount(account.type);

    return {
      id: account.id,
      code: account.code,
      name,
      balance: getVisibleAccountBalance(account),
      currency: getVisibleAccountCurrency(account),
      parentLabel,
      isTemporary,
      searchText: `${name} ${account.name} ${account.code} ${parentLabel}`.toLowerCase()
    };
  };

  const buildAccountRows = (items: Account[], fallbackParentLabel: string): AccountRow[] => (
    items
      .filter(account => !account.isGroup)
      .map(account => toAccountRow(account, fallbackParentLabel))
      .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance) || left.code.localeCompare(right.code))
  );

  const cashboxRows = useMemo(() => buildAccountRows(
    accounts.filter(account => account.parentId === 'acc_cash_root' && account.type === 'ASSET'),
    tr('الخزينة', 'Cashboxes')
  ), [accounts, accountMap, baseCurrency, isEnglish, temporaryAccountBalanceMap]);

  const inventoryRows = useMemo(() => buildAccountRows(
    accounts.filter(account => inventoryIds.has(account.id)),
    tr('المخزون', 'Inventory')
  ), [accounts, accountMap, baseCurrency, inventoryIds, isEnglish, temporaryAccountBalanceMap]);

  const salesRows = useMemo(() => buildAccountRows(
    accounts.filter(account => revenueIds.has(account.id)),
    tr('المبيعات', 'Sales')
  ), [accounts, accountMap, baseCurrency, revenueIds, isEnglish, temporaryAccountBalanceMap]);

  const purchaseRows = useMemo(() => buildAccountRows(
    accounts.filter(account => PURCHASE_ACCOUNT_IDS.has(account.id)),
    tr('المشتريات', 'Purchases')
  ), [accounts, accountMap, baseCurrency, isEnglish, temporaryAccountBalanceMap]);

  const expenseRows = useMemo(() => buildAccountRows(
    accounts.filter(account => expenseIds.has(account.id) && !PURCHASE_ACCOUNT_IDS.has(account.id)),
    tr('المصروفات', 'Expenses')
  ), [accounts, accountMap, baseCurrency, expenseIds, isEnglish, temporaryAccountBalanceMap]);

  const reservedQuickAccessAccountIds = useMemo(() => {
    const ids = new Set<string>(['acc_receivable', 'acc_payable']);

    contacts.forEach(contact => {
      if (contact.type !== 'CUSTOMER' && contact.type !== 'SUPPLIER') return;
      const linkedId = String(contact.currentAccountId || contact.linkedAccountId || '').trim();
      if (linkedId) ids.add(linkedId);
    });

    return ids;
  }, [contacts]);

  const pinnedAccountIds = useMemo(() => (
    Array.from(new Set(
      (Array.isArray(companySettings.importantAccountIds) ? companySettings.importantAccountIds : [])
        .map(value => String(value || '').trim())
        .filter(value => value && accountMap.has(value) && !reservedQuickAccessAccountIds.has(value))
    ))
  ), [accountMap, companySettings.importantAccountIds, reservedQuickAccessAccountIds]);

  const allPostingAccountRows = useMemo(() => (
    accounts
      .filter(account => !account.isGroup)
      .map(account => toAccountRow(account, tr('الحسابات', 'Accounts')))
      .sort((left, right) => left.code.localeCompare(right.code) || left.name.localeCompare(right.name))
  ), [accounts, accountMap, baseCurrency, isEnglish, temporaryAccountBalanceMap]);

  const allPostingAccountRowMap = useMemo(
    () => new Map(allPostingAccountRows.map(row => [row.id, row])),
    [allPostingAccountRows]
  );

  const pinnedAccountRows = useMemo(() => (
    pinnedAccountIds
      .map(id => allPostingAccountRowMap.get(id))
      .filter((row): row is AccountRow => Boolean(row))
  ), [allPostingAccountRowMap, pinnedAccountIds]);

  const tabs = useMemo(() => ([
    { id: 'CUSTOMERS' as const, label: tr('الزبائن', 'Customers'), icon: Users, count: customerRows.length },
    { id: 'SUPPLIERS' as const, label: tr('الموردون', 'Suppliers'), icon: Truck, count: supplierRows.length },
    { id: 'CASHBOXES' as const, label: tr('الصناديق', 'Cashboxes'), icon: Wallet, count: cashboxRows.length },
    { id: 'INVENTORY' as const, label: tr('المخزن', 'Inventory'), icon: Package, count: inventoryRows.length },
    { id: 'SALES' as const, label: tr('المبيعات', 'Sales'), icon: Receipt, count: salesRows.length },
    { id: 'PURCHASES' as const, label: tr('المشتريات', 'Purchases'), icon: Building2, count: purchaseRows.length },
    { id: 'EXPENSES' as const, label: tr('المصروفات', 'Expenses'), icon: Layers3, count: expenseRows.length }
  ]), [customerRows.length, supplierRows.length, cashboxRows.length, inventoryRows.length, salesRows.length, purchaseRows.length, expenseRows.length, isEnglish]);

  const contactRows = activeTab === 'CUSTOMERS' ? customerRows : supplierRows;
  const accountRows =
    activeTab === 'CASHBOXES' ? cashboxRows :
    activeTab === 'INVENTORY' ? inventoryRows :
    activeTab === 'SALES' ? salesRows :
    activeTab === 'PURCHASES' ? purchaseRows :
    expenseRows;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleContactRows = normalizedSearch
    ? contactRows.filter(row => row.searchText.includes(normalizedSearch))
    : contactRows;
  const visibleAccountRows = normalizedSearch
    ? accountRows.filter(row => row.searchText.includes(normalizedSearch))
    : accountRows;
  const isContactTab = activeTab === 'CUSTOMERS' || activeTab === 'SUPPLIERS';
  const activeTabMeta = tabs.find(tab => tab.id === activeTab) || tabs[0];
  const totalRowCount = isContactTab ? contactRows.length : accountRows.length;
  const visibleRowCount = isContactTab ? visibleContactRows.length : visibleAccountRows.length;
  const totalGroupBalance = isContactTab
    ? contactRows.reduce((sum, row) => sum + Math.max(0, row.balance), 0)
    : accountRows.reduce((sum, row) => sum + row.balance, 0);
  const visibleGroupBalance = isContactTab
    ? visibleContactRows.reduce((sum, row) => sum + Math.max(0, row.balance), 0)
    : visibleAccountRows.reduce((sum, row) => sum + row.balance, 0);
  const summaryBalance = normalizedSearch ? visibleGroupBalance : totalGroupBalance;
  const summaryCurrency = !isContactTab && accountRows.length > 0 && accountRows.every(row => row.currency === accountRows[0].currency)
    ? accountRows[0].currency
    : baseCurrency;
  const summaryTitle = isContactTab
    ? activeTab === 'CUSTOMERS'
      ? tr('إجمالي حسابات الزبائن', 'Total customer balances')
      : tr('إجمالي حسابات الموردين', 'Total supplier balances')
    : tr(`إجمالي حسابات ${activeTabMeta.label}`, `Total ${activeTabMeta.label}`);
  const summaryHint = normalizedSearch
    ? tr('الإجمالي المعروض بعد تطبيق البحث', 'Visible total after applying the search')
    : tr('إجمالي أرصدة المجموعة الحالية', 'Total balances for the current group');
  const temporaryAccountsHint = !isContactTab && accountRows.some(row => row.isTemporary)
    ? tr(`الحسابات المؤقتة معروضة من ${currentFiscalStart}`, `Temporary accounts shown from ${currentFiscalStart}`)
    : '';

  const persistImportantAccountIds = (nextIds: string[]) => {
    const result = updateCompanySettings({
      ...companySettings,
      importantAccountIds: Array.from(new Set(
        nextIds
          .map(value => String(value || '').trim())
          .filter(value => value && accountMap.has(value) && !reservedQuickAccessAccountIds.has(value))
      ))
    });

    if (!result.ok) {
      alert(result.message);
      return false;
    }

    return true;
  };

  const handleAddImportantAccount = (accountId: string) => {
    if (!accountId || pinnedAccountIds.includes(accountId)) return;
    const saved = persistImportantAccountIds([...pinnedAccountIds, accountId]);
    if (saved) {
      setCustomAccountQuery('');
    }
  };

  const handleRemoveImportantAccount = (accountId: string) => {
    if (!accountId) return;
    persistImportantAccountIds(pinnedAccountIds.filter(id => id !== accountId));
  };

  const normalizedCustomQuery = customAccountQuery.trim().toLowerCase();
  const customAccountPickerRows = useMemo(() => (
    allPostingAccountRows
      .filter(row => !reservedQuickAccessAccountIds.has(row.id))
      .filter(row => !pinnedAccountIds.includes(row.id))
      .filter(row => !normalizedCustomQuery || row.searchText.includes(normalizedCustomQuery))
      .slice(0, 18)
  ), [allPostingAccountRows, normalizedCustomQuery, pinnedAccountIds, reservedQuickAccessAccountIds]);

  const getContactStatus = (row: ContactRow) => {
    if (Math.abs(row.balance) < 0.01) return tr('متوازن', 'Settled');
    if (row.type === 'CUSTOMER') return row.balance >= 0 ? tr('مستحق', 'Due') : tr('دائن', 'Credit');
    return row.balance >= 0 ? tr('مستحق', 'Due') : tr('مدفوع', 'Paid');
  };

  return (
    <div className={`app-page p-4 font-tajawal animate-in fade-in duration-500 ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm"
        >
          {isEnglish ? <ArrowLeft size={20} /> : <ArrowRight size={20} />}
        </button>
        <div className="flex-1 rounded-[2rem] border border-slate-100 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{tr('الحسابات المهمة', 'Important Accounts')}</h1>
              <p className="mt-1 text-[11px] font-bold text-slate-400">{tr('شاشة تنقل سريعة للحسابات الأساسية والحسابات الأخرى', 'Quick navigation for primary and other accounts')}</p>
            </div>
            <button
              type="button"
              onClick={onOpenAccountsTree}
              className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700"
            >
              {tr('شجرة الحسابات', 'Accounts Tree')}
            </button>
          </div>
        </div>
      </header>

      <section className="mb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Pin size={16} />
              {tr('وصول سريع للحسابات', 'Account quick access')}
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-400">
              {tr('الحسابات المضافة تظهر هنا بجانب الأقسام لتصل إليها بسرعة ومن دون تكرار', 'Added accounts appear here next to the sections for faster access without duplicates')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCustomAccountsPicker(value => !value)}
            className="shrink-0 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700"
          >
            {showCustomAccountsPicker ? tr('إغلاق', 'Close') : tr('إضافة حساب', 'Add account')}
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <div key={tab.id} className={`rounded-[1.4rem] border px-1.5 py-1 ${active ? 'border-slate-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/80'}`}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-[1rem] px-3 py-2 text-[11px] font-black ${active ? 'text-slate-900' : 'text-slate-500'}`}
                >
                  <Icon size={15} />
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-slate-100 text-slate-700' : 'bg-white text-slate-500'}`}>{tab.count}</span>
                </button>
              </div>
            );
          })}

          {pinnedAccountRows.map(row => (
            <div key={row.id} className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50/80 px-1.5 py-1 shadow-sm">
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => openDrilldown({ kind: 'ACCOUNT_LEDGER', accountId: row.id })}
                  className={`min-w-[10.5rem] max-w-[13rem] rounded-[1rem] px-3 py-2 text-inherit ${isEnglish ? 'text-left' : 'text-right'}`}
                >
                  <div className="flex items-center gap-1 text-[10px] font-black text-emerald-700">
                    <Pin size={11} />
                    {tr('مخصص', 'Custom')}
                  </div>
                  <div className="mt-1 truncate text-sm font-black text-slate-900">{row.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                    <span>{row.code}</span>
                    {row.isTemporary && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">
                        {tr('من أول السنة', 'Year to date')}
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 text-[10px] font-black dir-ltr ${row.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    {formatAmount(row.balance)} {row.currency}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveImportantAccount(row.id)}
                  className="shrink-0 rounded-full bg-white/90 p-1.5 text-slate-400 transition-colors hover:text-rose-600"
                  aria-label={tr('إزالة الحساب', 'Remove account')}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {showCustomAccountsPicker && (
          <div className="mb-3 rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="relative">
              <input
                type="text"
                value={customAccountQuery}
                onChange={(event) => setCustomAccountQuery(event.target.value)}
                placeholder={tr('ابحث عن الحساب المراد إضافته...', 'Search for an account to add...')}
                className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm font-bold outline-none"
              />
              <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            </div>

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {customAccountPickerRows.map(row => (
                <div key={row.id} className="flex items-center gap-2 rounded-[1.4rem] border border-slate-200 bg-white px-3 py-3">
                  <button
                    type="button"
                    onClick={() => openDrilldown({ kind: 'ACCOUNT_LEDGER', accountId: row.id })}
                    className={`min-w-0 flex-1 text-inherit ${isEnglish ? 'text-left' : 'text-right'}`}
                  >
                    <div className="truncate text-sm font-black text-slate-900">{row.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                      <span>{row.code}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{row.parentLabel}</span>
                      {row.isTemporary && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">
                          {tr('من أول السنة', 'Year to date')}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className={`shrink-0 text-left text-sm font-black dir-ltr ${row.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    {formatAmount(row.balance)} {row.currency}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddImportantAccount(row.id)}
                    className="shrink-0 rounded-xl bg-slate-900 p-2 text-white transition-colors hover:bg-slate-700"
                    aria-label={tr('إضافة الحساب', 'Add account')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              ))}

              {customAccountPickerRows.length === 0 && (
                <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-center">
                  <div className="text-sm font-black text-slate-600">{tr('لا توجد حسابات مطابقة', 'No matching accounts')}</div>
                  <div className="mt-1 text-[11px] font-bold text-slate-400">{tr('جرّب اسمًا آخر أو افتح شجرة الحسابات', 'Try another name or open the accounts tree')}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={tr('ابحث داخل المجموعة الحالية...', 'Search inside the current group...')}
            className="w-full rounded-[1.8rem] border border-slate-200 bg-white p-4 pr-12 text-sm font-bold outline-none shadow-sm"
          />
          <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300" />
        </div>
      </section>

      <section className="mb-4">
        <div className="rounded-[1.9rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black text-slate-500">{summaryTitle}</div>
              <div className={`mt-2 text-2xl font-black dir-ltr ${summaryBalance > 0 ? 'text-slate-900' : summaryBalance < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {formatAmount(summaryBalance, isContactTab)} {summaryCurrency}
              </div>
              <div className="mt-1 text-[10px] font-bold text-slate-400">{summaryHint}</div>
              {temporaryAccountsHint && (
                <div className="mt-1 text-[10px] font-black text-amber-600">{temporaryAccountsHint}</div>
              )}
            </div>
            <div className="shrink-0 rounded-[1.4rem] bg-slate-50 px-3 py-2 text-center">
              <div className="text-[10px] font-black text-slate-400">{tr('الحسابات', 'Accounts')}</div>
              <div className="mt-1 text-sm font-black text-slate-800 dir-ltr">
                {visibleRowCount}
                {visibleRowCount !== totalRowCount ? ` / ${totalRowCount}` : ''}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {(activeTab === 'CUSTOMERS' || activeTab === 'SUPPLIERS') ? visibleContactRows.map(row => (
          <button
            key={row.id}
            type="button"
            onClick={() => openDrilldown({ kind: 'CONTACT_STATEMENT', contactId: row.id })}
            className="w-full rounded-[2rem] border border-slate-100 bg-white px-4 py-3 text-inherit shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-900">{row.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                  <span>{row.phone || tr('بدون هاتف', 'No phone')}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{getContactStatus(row)}</span>
                </div>
              </div>
              <div className={`shrink-0 text-left text-sm font-black dir-ltr ${row.balance >= 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                {formatAmount(row.balance, true)} {baseCurrency}
              </div>
            </div>
          </button>
        )) : visibleAccountRows.map(row => (
          <button
            key={row.id}
            type="button"
            onClick={() => openDrilldown({ kind: 'ACCOUNT_LEDGER', accountId: row.id })}
            className="w-full rounded-[2rem] border border-slate-100 bg-white px-4 py-3 text-inherit shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-900">{row.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                  <span>{row.code}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{row.parentLabel}</span>
                  {row.isTemporary && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">{tr('من أول السنة', 'Year to date')}</span>
                  )}
                </div>
              </div>
              <div className={`shrink-0 text-left text-sm font-black dir-ltr ${row.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                {formatAmount(row.balance)} {row.currency}
              </div>
            </div>
          </button>
        ))}

        {((activeTab === 'CUSTOMERS' || activeTab === 'SUPPLIERS') ? visibleContactRows.length === 0 : visibleAccountRows.length === 0) && (
          <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
            <div className="text-sm font-black text-slate-600">{tr('لا توجد نتائج في هذه المجموعة', 'No results in this group')}</div>
            <div className="mt-1 text-[11px] font-bold text-slate-400">{tr('يمكنك تغيير التبويب أو إزالة نص البحث', 'Try another tab or clear the search')}</div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ImportantAccountsHub;
