
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType } from '../types';
import { getDisplayContactName, getDisplayProductName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { 
    Plus, Search, Receipt, ChevronDown, ChevronUp, Printer, Pencil, Trash2
} from 'lucide-react';
import { TabView } from '../App';
import { TransactionTabType } from './TransactionForm';
import EnglishDateInput from './EnglishDateInput';

interface PurchasesExpensesProps {
    onNavigate: (tab: TabView, formTab?: TransactionTabType, voucherType?: 'RECEIPT' | 'PAYMENT') => void;
    onEditInvoice?: (invoiceId: string, mode: TransactionTabType) => void;
}

const PurchasesExpenses: React.FC<PurchasesExpensesProps> = ({ onNavigate, onEditInvoice }) => {
  const { invoices, contacts, products, baseCurrency, companySettings, deleteInvoice } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED' | 'DRAFT'>('ALL');
  const [contactFilterId, setContactFilterId] = useState('ALL');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [maxAmountFilter, setMaxAmountFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);
  const displayProductName = (product?: { id: string; name: string } | null) =>
    getDisplayProductName(product || undefined, isEnglish);
  const asText = (value: unknown) => String(value ?? '');
  const getInvoiceItems = (inv: { items?: unknown }) => Array.isArray(inv.items) ? inv.items : [];
  const getInvoiceTotal = (inv: { totalAmount?: unknown }) => Number(inv.totalAmount || 0);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
  };

  const parseAmountFilter = (raw: string): number | null => {
    const normalized = toEnglishDigits(String(raw || '').trim()).replace(/[^\d.-]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const expenseContactOptions = useMemo(() => {
    const ids = new Set(
      invoices
        .filter(inv => inv.type === TransactionType.EXPENSE && inv.category !== 'purchase_invoice')
        .map(inv => inv.customerId)
        .filter((value): value is string => !!value)
    );
    return contacts
      .filter(contact => ids.has(contact.id))
      .sort((a, b) => displayContactName(a).localeCompare(displayContactName(b), isEnglish ? 'en' : 'ar'));
  }, [invoices, contacts, isEnglish]);

  // Filter only General Expense Invoices (Exclude purchase_invoice which affects stock)
  const expenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const minAmount = parseAmountFilter(minAmountFilter);
    const maxAmount = parseAmountFilter(maxAmountFilter);

    return invoices
      .filter(inv => inv.type === TransactionType.EXPENSE && inv.category !== 'purchase_invoice')
      .filter(inv => statusFilter === 'ALL' || inv.postingStatus === statusFilter)
      .filter(inv => contactFilterId === 'ALL' || inv.customerId === contactFilterId)
      .filter(inv => !fromDateFilter || inv.date >= fromDateFilter)
      .filter(inv => !toDateFilter || inv.date <= toDateFilter)
      .filter(inv => minAmount === null || getInvoiceTotal(inv) >= minAmount)
      .filter(inv => maxAmount === null || getInvoiceTotal(inv) <= maxAmount)
      .filter(inv => {
        if (!q) return true;
        const contact = contacts.find(c => c.id === inv.customerId) || null;
        const contactRawName = contact?.name || '';
        const contactName = displayContactName(contact);
        return asText(inv.invoiceNumber).toLowerCase().includes(q) ||
          (inv.notes || '').toLowerCase().includes(q) ||
          contactRawName.toLowerCase().includes(q) ||
          contactName.toLowerCase().includes(q) ||
          getInvoiceItems(inv).some((i: any) => asText(i?.description).toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    invoices,
    contacts,
    searchTerm,
    statusFilter,
    contactFilterId,
    fromDateFilter,
    toDateFilter,
    minAmountFilter,
    maxAmountFilter,
    isEnglish
  ]);

  const totalExpenses = useMemo(() => expenses.reduce((sum, inv) => sum + getInvoiceTotal(inv), 0), [expenses]);

  const getContactName = (id?: string) => {
      if (!id) return tr('مصروف عام', 'General Expense');
      return displayContactName(contacts.find(c => c.id === id) || null) || tr('مورد خدمات', 'Service Supplier');
  };

  const hasActiveFilters =
    !!searchTerm.trim() ||
    statusFilter !== 'ALL' ||
    contactFilterId !== 'ALL' ||
    !!fromDateFilter ||
    !!toDateFilter ||
    !!minAmountFilter ||
    !!maxAmountFilter;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setContactFilterId('ALL');
    setFromDateFilter('');
    setToDateFilter('');
    setMinAmountFilter('');
    setMaxAmountFilter('');
  };

  const handleDelete = (id: string) => {
    if (!confirm(tr('هل أنت متأكد من حذف هذا المصروف نهائياً؟', 'Are you sure you want to permanently delete this expense?'))) return;
    const result = deleteInvoice(id);
    if (!result.ok) alert(result.message);
  };

  return (
    <div className={`app-page p-4 font-tajawal animate-in fade-in ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-6 flex justify-between items-start px-1">
        <div>
           <h1 className="text-3xl font-black text-gray-800 tracking-tight">{tr('المصاريف', 'Expenses')}</h1>
           <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">{tr('سجل المصروفات التشغيلية والإدارية', 'Operating and administrative expenses ledger')}</p>
        </div>
        <button 
            onClick={() => onNavigate('purchases-expenses', 'EXPENSES')}
            className="bg-rose-600 text-white p-3.5 rounded-2xl shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all active:scale-90"
        >
            <Plus size={24} />
        </button>
      </header>

      {/* Summary Card */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm mb-8">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{tr('إجمالي المصروفات', 'Total Expenses')}</span>
          <h2 className="text-4xl font-black text-rose-600 dir-ltr tracking-tighter">{totalExpenses.toLocaleString()} <span className="text-sm text-gray-400">{baseCurrency}</span></h2>
      </div>

      {/* Search */}
      <div className="mb-6 relative group">
          <input 
              type="text"
              placeholder={tr('بحث في المصاريف (البيان، المبلغ، المستفيد)...', 'Search expenses (description, amount, beneficiary)...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-4 pr-12 bg-white rounded-[1.8rem] border border-gray-100 shadow-sm font-bold text-sm outline-none focus:ring-4 focus:ring-rose-50 transition-all text-slate-700"
          />
          <Search className="w-5 h-5 text-gray-300 absolute top-1/2 -translate-y-1/2 right-4 pointer-events-none" />
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-3 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'POSTED' | 'DRAFT')}
            className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
          >
            <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
            <option value="POSTED">{tr('مرحل فقط', 'Posted only')}</option>
            <option value="DRAFT">{tr('مسودات فقط', 'Draft only')}</option>
          </select>
          <select
            value={contactFilterId}
            onChange={(e) => setContactFilterId(e.target.value)}
            className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
          >
            <option value="ALL">{tr('كل المستفيدين', 'All beneficiaries')}</option>
            {expenseContactOptions.map(contact => (
              <option key={contact.id} value={contact.id}>{displayContactName(contact)}</option>
            ))}
          </select>
          <EnglishDateInput
            value={fromDateFilter}
            onChange={setFromDateFilter}
            displayFormat="YMD"
            wrapperClassName="w-full"
            className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
            placeholder={tr('من تاريخ', 'From date')}
          />
          <EnglishDateInput
            value={toDateFilter}
            onChange={setToDateFilter}
            displayFormat="YMD"
            wrapperClassName="w-full"
            className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
            placeholder={tr('إلى تاريخ', 'To date')}
          />
          <input
            type="text"
            inputMode="decimal"
            lang="en"
            value={toEnglishDigits(minAmountFilter)}
            onChange={(e) => setMinAmountFilter(toEnglishDigits(e.target.value))}
            className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
            placeholder={tr('الحد الأدنى', 'Min amount')}
          />
          <input
            type="text"
            inputMode="decimal"
            lang="en"
            value={toEnglishDigits(maxAmountFilter)}
            onChange={(e) => setMaxAmountFilter(toEnglishDigits(e.target.value))}
            className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
            placeholder={tr('الحد الأعلى', 'Max amount')}
          />
        </div>
        <div className="flex items-center justify-between mt-3 gap-2">
          <span className="text-[11px] font-black text-gray-500">
            {tr('نتائج الفلترة', 'Filtered results')}: <span className="text-slate-800">{expenses.length}</span>
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-black"
            >
              {tr('مسح الفلاتر', 'Clear filters')}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {expenses.map((inv) => {
            const isExpanded = expandedId === inv.id;
            const canMutateDirectly = !inv.isReversal && !inv.reversedById;
            const invoiceItems = getInvoiceItems(inv) as Array<{ productId?: string; description?: string; quantity?: number; total?: number }>;
            const firstItem = invoiceItems[0];
            return (
                <div key={inv.id} className={`bg-white p-5 rounded-[2.5rem] border shadow-sm transition-all ${isExpanded ? 'border-rose-100 ring-4 ring-rose-50' : 'border-gray-50'}`}>
                    <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isExpanded ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600'}`}>
                                <Receipt size={24} />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-800 text-sm">
                                    {(firstItem?.productId
                                        ? displayProductName((products.find(p => p.id === firstItem.productId) || null))
                                        : firstItem?.description) || tr('مصروف متنوع', 'Misc expense')}
                                    {invoiceItems.length > 1 && ` + ${invoiceItems.length - 1} ${tr('بنود', 'items')}`}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100">
                                        {getContactName(inv.customerId)}
                                    </span>
                                    <span className="text-[9px] font-bold text-gray-300">{formatDate(inv.date)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-end">
                            <span className="block font-black text-rose-600 dir-ltr text-lg tracking-tighter">
                                {getInvoiceTotal(inv).toLocaleString()}
                            </span>
                            <span className="flex justify-end mt-1 text-gray-300">
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </span>
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="mt-6 pt-6 border-t border-gray-50 animate-in slide-in-from-top-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{tr('تفاصيل الفاتورة', 'Invoice Details')}</p>
                            <div className="space-y-3 mb-4">
                                {invoiceItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-xs bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <span className="font-bold text-gray-700">
                                            {item.productId ? displayProductName(products.find(p => p.id === item.productId) || null) : item.description}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {(Number(item.quantity) || 0) > 1 && <span className="text-[10px] text-gray-400 font-bold">x{item.quantity}</span>}
                                            <span className="font-black text-rose-600 dir-ltr">{Number(item.total || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {inv.notes && (
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-[10px] text-amber-800 font-bold mb-4">
                                    {tr('ملاحظات', 'Notes')}: {inv.notes}
                                </div>
                            )}
                            {canMutateDirectly && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditInvoice?.(inv.id, inv.category === 'import_expenses' ? 'IMPORT_EXPENSES' : 'EXPENSES');
                                        }}
                                        className="py-3 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                                    >
                                        <Pencil size={16} /> {tr('تعديل', 'Edit')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(inv.id);
                                        }}
                                        className="py-3 bg-gray-50 hover:bg-rose-50 text-rose-500 rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={16} /> {tr('حذف', 'Delete')}
                                    </button>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-[10px] text-gray-400 font-black uppercase tracking-widest">
                                <span>{tr('رقم القيد', 'Entry No.')}: {inv.invoiceNumber}</span>
                                <button className="flex items-center gap-1 hover:text-rose-600 transition-colors">
                                    <Printer size={14} /> {tr('طباعة', 'Print')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            );
        })}

        {expenses.length === 0 && (
            <div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-gray-100">
                <Receipt className="w-16 h-16 mx-auto mb-4 text-gray-100" />
                <p className="text-gray-400 font-black">{tr('لا توجد مصاريف مسجلة', 'No expenses recorded')}</p>
                <button onClick={() => onNavigate('purchases-expenses', 'EXPENSES')} className="mt-4 px-6 py-2 bg-rose-50 text-rose-600 rounded-xl font-bold text-xs">{tr('تسجيل مصروف جديد', 'Record New Expense')}</button>
            </div>
        )}
      </div>
    </div>
  );
};

export default PurchasesExpenses;

