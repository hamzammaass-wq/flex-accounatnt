import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileDown,
  Filter,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  User
} from 'lucide-react';
import { TabView } from '../App';
import { TransactionTabType } from './TransactionForm';
import { getDisplayContactName } from '../utils/displayNames';
import { openDrilldown } from '../utils/drilldown';

interface TransactionListProps {
  onNavigate?: (tab: TabView, fTab?: TransactionTabType, vType?: 'RECEIPT' | 'PAYMENT') => void;
}

const CATEGORY_TRANSLATIONS: Record<string, { ar: string; en: string }> = {
  journal: { ar: 'قيد يومية', en: 'Journal Entry' },
  sales_invoice: { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
  purchase_invoice: { ar: 'فاتورة مشتريات', en: 'Purchase Invoice' },
  import_expenses: { ar: 'مصاريف استيراد', en: 'Import Expenses' },
  sales_return: { ar: 'مرتجع مبيعات', en: 'Sales Return' },
  rent: { ar: 'إيجار', en: 'Rent' },
  groceries: { ar: 'تموين', en: 'Supplies' },
  utilities: { ar: 'فواتير', en: 'Utilities' },
  transport: { ar: 'نقل', en: 'Transport' },
  salaries: { ar: 'رواتب', en: 'Salaries' },
  marketing: { ar: 'تسويق', en: 'Marketing' },
  maintenance: { ar: 'صيانة', en: 'Maintenance' },
  other: { ar: 'أخرى', en: 'Other' },
  purchase_return: { ar: 'مرتجع مشتريات', en: 'Purchase Return' },
  services: { ar: 'خدمات', en: 'Services' },
  investments: { ar: 'استثمارات', en: 'Investments' },
  freelance: { ar: 'عمل حر', en: 'Freelance' },
  other_income: { ar: 'أخرى', en: 'Other Income' }
};

const TransactionList: React.FC<TransactionListProps> = () => {
  const { transactions, deleteTransaction, reverseTransaction, updateTransaction, baseCurrency, contacts, companySettings, loadMoreTransactions, setTransactionDateRange, useBackend, transactionsLoading, transactionsHasMore } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const openContactStatement = (contactId?: string) => {
    if (!contactId) return;
    openDrilldown({ kind: 'CONTACT_STATEMENT', contactId });
  };

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!useBackend || !transactionsHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !transactionsLoading) {
          loadMoreTransactions();
        }
      },
      { threshold: 0.1 }
    );
    
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    
    return () => {
      if (loadMoreRef.current) observer.unobserve(loadMoreRef.current);
    };
  }, [useBackend, loadMoreTransactions, transactionsLoading, transactionsHasMore]);

  React.useEffect(() => {
    if (useBackend) {
      setTransactionDateRange(startDate || undefined, endDate || undefined);
    }
  }, [startDate, endDate, useBackend, setTransactionDateRange]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const formatAmount = (value: number) => new Intl.NumberFormat('en-US-u-nu-latn', { maximumFractionDigits: 2 }).format(value || 0);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
  };

  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);

  const getCategoryLabel = (id: string, fallbackArabicName?: string) => {
    const translated = CATEGORY_TRANSLATIONS[id];
    if (translated) return tr(translated.ar, translated.en);
    if (!fallbackArabicName) return tr('غير محدد', 'Unspecified');
    return fallbackArabicName;
  };

  const getCategoryDetails = (id: string, type: string) => {
    if (id === 'journal') return { name: tr('قيد يومية', 'Journal Entry'), icon: '📒' };
    if (id === 'sales_invoice') return { name: tr('فاتورة مبيعات', 'Sales Invoice'), icon: '🧾' };
    if (id === 'purchase_invoice') return { name: tr('فاتورة مشتريات', 'Purchase Invoice'), icon: '🛒' };
    const list = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const category = list.find((c) => c.id === id);
    if (!category) return { name: tr('غير محدد', 'Unspecified'), icon: '❓' };
    return { name: getCategoryLabel(category.id, category.name), icon: category.icon };
  };

  const getContactName = (id?: string) => {
    if (!id) return null;
    if (id === 'WALK_IN') return tr('عميل نقدي', 'Cash Customer');
    const contact = contacts.find((c) => c.id === id);
    return displayContactName(contact || null) || tr('طرف غير معروف', 'Unknown contact');
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const tDate = new Date(t.date);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (tDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (tDate > end) return false;
      }

      const contactName = getContactName(t.contactId) || '';
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch =
        t.description.toLowerCase().includes(lowerSearch) ||
        contactName.toLowerCase().includes(lowerSearch) ||
        formatAmount(t.amount).includes(searchTerm);
      if (!matchesSearch) return false;

      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;

      return true;
    });
  }, [transactions, startDate, endDate, searchTerm, selectedCategory, contacts, isEnglish]);

  const rangeSummary = useMemo(() => {
    return filteredTransactions.reduce(
      (acc, t) => {
        if (t.status === 'DRAFT') return acc;
        const value = t.amount * (t.exchangeRate || 1);
        if (t.type === 'INCOME') acc.income += value;
        else if (t.type === 'EXPENSE') acc.expense += value;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [filteredTransactions]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
    setSelectedCategory('ALL');
  };

  const setQuickRange = (range: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH') => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (range) {
      case 'TODAY':
        start = today;
        end = today;
        break;
      case 'YESTERDAY':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = start;
        break;
      case 'WEEK':
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        break;
      case 'MONTH':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;

    const BOM = '\uFEFF';
    const headers = [
      tr('التاريخ', 'Date'),
      tr('النوع', 'Type'),
      tr('الوصف', 'Description'),
      tr('المبلغ', 'Amount'),
      tr('العملة', 'Currency'),
      tr('الطرف', 'Contact'),
      tr('التصنيف', 'Category')
    ];

    const rows = filteredTransactions.map((t) => {
      const typeLabel =
        t.type === 'INCOME'
          ? tr('قبض', 'Receipt')
          : t.type === 'EXPENSE'
            ? tr('صرف', 'Payment')
            : tr('قيد', 'Entry');
      const contact = getContactName(t.contactId) || '-';
      const category = getCategoryDetails(t.category, t.type).name;
      const description = `"${t.description.replace(/"/g, '""')}"`;
      return [
        formatDate(t.date),
        typeLabel,
        description,
        formatAmount(t.amount),
        t.currency || baseCurrency,
        contact,
        category
      ].join(',');
    });

    const csvContent = BOM + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial_report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const result = deleteTransaction(deleteId);
    if (!result.ok) {
      alert(result.message);
      setDeleteId(null);
      return;
    }
    setDeleteId(null);
  };

  const handleReverse = (id: string) => {
    if (!confirm(tr('سيتم إنشاء قيد عكسي لهذه الحركة. متابعة؟', 'A reversal entry will be created for this transaction. Continue?'))) {
      return;
    }

    const result = reverseTransaction(id);
    if (!result.ok) {
      alert(result.message);
      return;
    }

    alert(tr('تم إنشاء قيد العكس بنجاح.', 'Reversal entry created successfully.'));
  };

  const handlePostDraftJournal = (id: string) => {
    const tx = transactions.find(item => item.id === id);
    if (!tx) return;
    if (!(tx.status === 'DRAFT' && tx.category === 'journal' && tx.type === 'TRANSFER')) return;

    if (!confirm(tr('هل أنت متأكد من ترحيل القيد؟', 'Are you sure you want to post this entry?'))) {
      return;
    }

    const result = updateTransaction(id, { status: 'POSTED' });
    if (!result.ok) {
      alert(result.message);
      return;
    }

    alert(tr('تم ترحيل القيد بنجاح.', 'Journal entry posted successfully.'));
  };

  const isFilterActive = Boolean(startDate || endDate || searchTerm || selectedCategory !== 'ALL');
  const searchInputClass = isEnglish ? 'pl-12 text-left' : 'pr-12 text-right';
  const searchIconClass = isEnglish ? 'left-4' : 'right-4';

  return (
    <div className="app-page font-tajawal animate-in fade-in duration-500 p-4" dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-6 flex justify-between items-start px-1 gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-800 tracking-tight">{tr('الأستاذ العام', 'General Ledger')}</h1>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">
            {tr('سجل كافة الحركات والقيود المالية', 'Record of all financial movements and entries')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="p-3.5 rounded-2xl transition-all shadow-sm border bg-white text-gray-400 border-gray-100 hover:text-emerald-600 hover:bg-emerald-50"
            title={tr('تصدير CSV', 'Export CSV')}
          >
            <FileDown className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3.5 rounded-2xl transition-all shadow-sm border ${showFilters || isFilterActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'}`}
            title={tr('تصفية', 'Filters')}
          >
            <Filter className="w-6 h-6" />
          </button>
        </div>
      </header>

      {showFilters && (
        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl mb-8 animate-in slide-in-from-top-4 fade-in">
          <div className="flex justify-between items-center mb-6 gap-2">
            <h3 className="text-sm font-black text-gray-700 flex items-center gap-2">
              <Filter className="w-5 h-5 text-indigo-500" />
              {tr('فلترة ذكية للبيانات', 'Smart data filters')}
            </h3>
            {isFilterActive && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-rose-500 font-black flex items-center gap-1 hover:bg-rose-50 px-3 py-1.5 rounded-full transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {tr('إعادة ضبط', 'Reset')}
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder={tr('بحث في البيان أو اسم الطرف أو المبلغ...', 'Search in description, contact, or amount...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all ${searchInputClass}`}
              />
              <Search className={`absolute ${searchIconClass} top-1/2 -translate-y-1/2 text-gray-300`} size={18} />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              <button onClick={() => setQuickRange('TODAY')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all whitespace-nowrap">{tr('اليوم', 'Today')}</button>
              <button onClick={() => setQuickRange('WEEK')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all whitespace-nowrap">{tr('7 أيام', '7 days')}</button>
              <button onClick={() => setQuickRange('MONTH')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all whitespace-nowrap">{tr('هذا الشهر', 'This month')}</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('من تاريخ', 'From date')}</label>
                <EnglishDateInput
                  value={startDate}
                  onChange={setStartDate}
                  className="w-full p-3.5 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-bold outline-none focus:bg-white transition-all dir-ltr"
                  aria-label={tr('من تاريخ', 'From date')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('إلى تاريخ', 'To date')}</label>
                <EnglishDateInput
                  value={endDate}
                  onChange={setEndDate}
                  className="w-full p-3.5 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-bold outline-none focus:bg-white transition-all dir-ltr"
                  aria-label={tr('إلى تاريخ', 'To date')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('حسب التصنيف', 'By category')}</label>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-bold outline-none appearance-none focus:bg-white transition-all ${isEnglish ? 'text-left' : 'text-right'}`}
                >
                  <option value="ALL">{tr('كافة التصنيفات', 'All categories')}</option>
                  <optgroup label={tr('المقبوضات', 'Receipts')}>
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{getCategoryLabel(c.id, c.name)}</option>
                    ))}
                  </optgroup>
                  <optgroup label={tr('المصروفات', 'Payments')}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{getCategoryLabel(c.id, c.name)}</option>
                    ))}
                  </optgroup>
                  <option value="journal">{tr('قيود يومية', 'Journal entries')}</option>
                </select>
                <Tag className={`absolute ${isEnglish ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none`} size={16} />
              </div>
            </div>
          </div>
        </div>
      )}

      {isFilterActive && (
        <div className="grid grid-cols-2 gap-3 mb-8 animate-in zoom-in-95">
          <div className="bg-white p-5 rounded-[2.5rem] border border-emerald-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-2 -bottom-2 opacity-5 rotate-12 transition-transform group-hover:scale-125">
              <TrendingUp size={60} className="text-emerald-600" />
            </div>
            <div className="relative z-10">
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-2">{tr('مقبوضات الفترة', 'Period Receipts')}</span>
              <h2 className="text-xl font-black text-emerald-700 dir-ltr">{formatAmount(rangeSummary.income)} {baseCurrency}</h2>
            </div>
          </div>
          <div className="bg-white p-5 rounded-[2.5rem] border border-rose-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-2 -bottom-2 opacity-5 -rotate-12 transition-transform group-hover:scale-125">
              <TrendingDown size={60} className="text-rose-600" />
            </div>
            <div className="relative z-10">
              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block mb-2">{tr('مصروفات الفترة', 'Period Payments')}</span>
              <h2 className="text-xl font-black text-rose-700 dir-ltr">{formatAmount(rangeSummary.expense)} {baseCurrency}</h2>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {filteredTransactions.map((t) => {
          const category = getCategoryDetails(t.category, t.type);
          const contactName = getContactName(t.contactId);
          return (
            <div key={t.id} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-gray-50 transition-all animate-in slide-in-from-bottom-2 hover:border-indigo-100">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm transition-all ${t.type === 'INCOME' ? 'bg-emerald-50 text-emerald-600' : t.type === 'EXPENSE' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                  {category.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-black text-gray-800 text-sm truncate">{t.description}</h4>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {contactName && (
                      <div
                        className="flex items-center gap-1 text-[9px] text-blue-500 font-black uppercase tracking-widest cursor-pointer hover:text-indigo-600"
                        onDoubleClick={() => openContactStatement(t.contactId)}
                        title={t.contactId ? tr('اضغط مرتين لفتح كشف الطرف', 'Double-click to open contact statement') : undefined}
                      >
                        <User size={10} />
                        {contactName}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[9px] text-gray-400 font-bold">
                      <span className="bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1"><Tag size={8} /> {category.name}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Calendar size={10} /> {formatDate(t.date)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-left flex flex-col items-end gap-1">
                  <span className={`font-black dir-ltr text-lg tracking-tighter ${t.type === 'INCOME' ? 'text-emerald-600' : t.type === 'EXPENSE' ? 'text-rose-600' : 'text-indigo-600'}`}>
                    {t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '-' : ''}{formatAmount(t.amount)}
                  </span>
                  <div className="flex items-center gap-1 mt-1">
                    {t.status === 'POSTED' && !t.isReversal && !t.reversedById && (
                      <button
                        onClick={() => handleReverse(t.id)}
                        className="text-gray-200 hover:text-indigo-500 transition-all p-1 active:scale-90"
                        title={tr('إنشاء قيد عكسي', 'Create reversal entry')}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    <button onClick={() => setDeleteId(t.id)} className="text-gray-200 hover:text-red-500 transition-all p-1 active:scale-90" title={tr('حذف', 'Delete')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {useBackend && transactionsHasMore && (
        <div className="flex justify-center mt-6 h-10 items-center">
          <div ref={loadMoreRef} className="text-gray-400 text-xs flex flex-col items-center gap-2">
             <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
             {tr('جاري التحميل...', 'Loading...')}
          </div>
        </div>
      )}

      {deleteId && (
        <ResponsiveDialog
          open={Boolean(deleteId)}
          onClose={() => setDeleteId(null)}
          size="md"
          zIndexClassName="z-[300]"
          panelClassName="bg-white rounded-[2.5rem] p-8 shadow-2xl text-center"
        >
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-sm">
            <AlertTriangle size={32} />
          </div>
          <h3 className="font-black text-gray-800 text-lg mb-2">{tr('حذف العملية نهائيًا؟', 'Delete transaction permanently?')}</h3>
          <p className="text-gray-500 text-xs font-bold mb-8 leading-relaxed">
            {tr(
              'هل أنت متأكد من حذف هذا القيد المالي؟ لا يمكن التراجع عن هذا الإجراء وقد يؤثر على الأرصدة.',
              'Are you sure you want to delete this financial entry? This action cannot be undone and may affect balances.'
            )}
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all active:scale-95">
              {tr('إلغاء', 'Cancel')}
            </button>
            <button onClick={confirmDelete} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95">
              {tr('نعم، حذف', 'Yes, Delete')}
            </button>
          </div>
        </ResponsiveDialog>
      )}
    </div>
  );
};

export default TransactionList;
