
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType } from '../types';
import { getDisplayContactName, getDisplayProductName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { 
    Plus, Search, Receipt, ChevronDown, ChevronUp, Printer, Pencil, Trash2, Filter, X
} from 'lucide-react';
import { TabView } from '../App';
import { TransactionTabType } from './TransactionForm';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { openDrilldown } from '../utils/drilldown';
import { printHtmlContent } from '../utils/documentExport';

interface PurchasesExpensesProps {
    onNavigate: (tab: TabView, formTab?: TransactionTabType, voucherType?: 'RECEIPT' | 'PAYMENT') => void;
    onEditInvoice?: (invoiceId: string, mode: TransactionTabType) => void;
}

const PurchasesExpenses: React.FC<PurchasesExpensesProps> = ({ onNavigate, onEditInvoice }) => {
  const { invoices, contacts, products, baseCurrency, companySettings, deleteInvoice } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED'>('ALL');
  const [contactFilterId, setContactFilterId] = useState('ALL');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [maxAmountFilter, setMaxAmountFilter] = useState('');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);
  const displayProductName = (product?: { id: string; name: string } | null) =>
    getDisplayProductName(product || undefined, isEnglish);
  const openContactStatement = (contactId?: string) => {
    if (!contactId) return;
    openDrilldown({ kind: 'CONTACT_STATEMENT', contactId });
  };
  const openProductMovement = (productId?: string) => {
    if (!productId) return;
    openDrilldown({ kind: 'PRODUCT_MOVEMENT', productId });
  };
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

  const handlePrintExpense = (inv: any) => {
      const contactName = getContactName(inv.customerId);
      const invoiceItems = getInvoiceItems(inv) as Array<{ productId?: string; description?: string; quantity?: number; total?: number }>;
      const isImport = inv.category === 'import_expenses';
      const title = isImport ? tr('سند مصروفات استيراد', 'Import Expense Voucher') : tr('سند مصروف', 'Expense Voucher');

      const tableRows = invoiceItems.map((item, idx) => {
          const itemName = item.productId ? displayProductName(products.find(p => p.id === item.productId) || null) : item.description;
          const qty = Number(item.quantity) || 0;
          const total = Number(item.total) || 0;
          const price = qty > 0 ? (total / qty) : total;

          return `
              <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${idx + 1}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>${itemName}</strong></td>
                  <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${qty > 0 ? qty : '-'}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${price > 0 ? price.toLocaleString('en-US') : '-'}</td>
                  <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left; font-weight: bold; color: var(--primary);">${total.toLocaleString('en-US')} ${baseCurrency}</td>
              </tr>
          `;
      }).join('');

      const html = `
          <div style="font-family: 'Cairo', system-ui, sans-serif; max-width: 800px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
              <!-- Header Section -->
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid var(--primary); padding-bottom: 20px;">
                  <div>
                      <h1 style="color: var(--primary); font-size: 28px; font-weight: 900; margin: 0 0 5px 0;">${companySettings?.name || 'Smart Accountant'}</h1>
                      <div style="color: #64748b; font-size: 14px;">
                          ${companySettings?.address ? `<p style="margin: 2px 0;">${companySettings.address}</p>` : ''}
                          ${companySettings?.taxNumber ? `<p style="margin: 2px 0;">${tr('الرقم الضريبي', 'Tax No')}: ${companySettings.taxNumber}</p>` : ''}
                      </div>
                  </div>
                  <div style="text-align: left;">
                      <h2 style="font-size: 24px; font-weight: 900; margin: 0 0 10px 0; color: #0f172a;">${title}</h2>
                      <div style="background: var(--bg-light); padding: 10px 15px; border-radius: 8px; display: inline-block;">
                          <p style="margin: 0; font-size: 14px;"><strong>${tr('رقم القيد', 'Entry No.')}:</strong> ${inv.invoiceNumber}</p>
                          <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>${tr('التاريخ', 'Date')}:</strong> ${formatDate(inv.date)}</p>
                      </div>
                  </div>
              </div>

              <!-- Meta Info Cards -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                  <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px;">
                      <h3 style="font-size: 12px; color: #64748b; text-transform: uppercase; margin: 0 0 5px 0;">${tr('المستفيد / المورد', 'Beneficiary / Supplier')}</h3>
                      <p style="font-size: 16px; font-weight: 700; margin: 0; color: #0f172a;">${contactName}</p>
                  </div>
                  <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px;">
                      <h3 style="font-size: 12px; color: #64748b; text-transform: uppercase; margin: 0 0 5px 0;">${tr('طريقة الدفع', 'Payment Method')}</h3>
                      <p style="font-size: 16px; font-weight: 700; margin: 0; color: #0f172a;">
                          ${inv.cashAmount ? tr('نقدي', 'Cash') : inv.bankAmount ? tr('تحويل بنكي', 'Bank Transfer') : tr('آجل', 'Credit')}
                      </p>
                  </div>
              </div>

              <!-- Table -->
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                  <thead>
                      <tr style="background-color: var(--primary); color: white;">
                          <th style="padding: 12px; text-align: center; border-radius: 0 8px 8px 0; width: 50px;">#</th>
                          <th style="padding: 12px; text-align: right;">${tr('البيان', 'Description')}</th>
                          <th style="padding: 12px; text-align: center;">${tr('الكمية', 'Qty')}</th>
                          <th style="padding: 12px; text-align: center;">${tr('السعر', 'Price')}</th>
                          <th style="padding: 12px; text-align: left; border-radius: 8px 0 0 8px;">${tr('المجموع', 'Total')}</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${tableRows}
                  </tbody>
              </table>

              <!-- Totals Section -->
              <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
                  <div style="width: 350px; background: var(--bg-light); border-radius: 12px; padding: 20px;">
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 20px; font-weight: 900; color: var(--primary);">
                          <span>${tr('الإجمالي', 'Total')}:</span>
                          <span>${getInvoiceTotal(inv).toLocaleString('en-US')} ${baseCurrency}</span>
                      </div>
                  </div>
              </div>

              ${inv.notes ? `
                  <div style="margin-bottom: 40px; padding: 15px; background: #f8fafc; border-radius: 8px; border-right: 4px solid var(--primary);">
                      <strong style="color: #64748b; font-size: 12px; text-transform: uppercase;">${tr('ملاحظات', 'Notes')}</strong>
                      <p style="margin: 5px 0 0 0; font-size: 14px; color: #334155;">${inv.notes}</p>
                  </div>
              ` : ''}

              <!-- Signatures -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; padding-top: 40px; border-top: 1px dashed #cbd5e1;">
                  <div style="text-align: center;">
                      <p style="margin: 0 0 40px 0; color: #64748b; font-weight: bold;">${tr('المحاسب', 'Accountant')}</p>
                      <div style="border-bottom: 1px solid #cbd5e1; width: 80%; margin: 0 auto;"></div>
                  </div>
                  <div style="text-align: center;">
                      <p style="margin: 0 0 40px 0; color: #64748b; font-weight: bold;">${tr('المستلم / المعتمد', 'Receiver / Approver')}</p>
                      <div style="border-bottom: 1px solid #cbd5e1; width: 80%; margin: 0 auto;"></div>
                  </div>
              </div>
              
              <div style="text-align: center; margin-top: 40px; font-size: 11px; color: #94a3b8;">
                  ${tr('تم إنشاء هذا السند بواسطة نظام فليكس إي آر بي', 'Generated by Flex ERP')}
              </div>
          </div>
      `;

      printHtmlContent(html);
  };


  const activeAdvancedFilterCount = [
    statusFilter !== 'ALL',
    contactFilterId !== 'ALL',
    !!fromDateFilter,
    !!toDateFilter,
    !!minAmountFilter,
    !!maxAmountFilter,
  ].filter(Boolean).length;

  const hasAdvancedFilters = activeAdvancedFilterCount > 0;

  const hasActiveFilters = !!searchTerm.trim() || hasAdvancedFilters;

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
          <h2 className="text-4xl font-black text-rose-600 dir-ltr tracking-tighter">{totalExpenses.toLocaleString('en-US')} <span className="text-sm text-gray-400">{baseCurrency}</span></h2>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsFilterDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-[1rem] border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <Filter size={16} className="text-rose-500" />
            <span>{tr('فلتر', 'Filter')}</span>
            {activeAdvancedFilterCount > 0 && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">
                {activeAdvancedFilterCount}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 transition hover:border-gray-300 hover:bg-gray-50"
            >
              {tr('مسح الكل', 'Clear all')}
            </button>
          )}
        </div>

        {hasAdvancedFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700">
              {tr('فلاتر نشطة', 'Active filters')}: {activeAdvancedFilterCount}
            </span>
          </div>
        )}
      </div>

      <ResponsiveDialog
        open={isFilterDialogOpen}
        onClose={() => setIsFilterDialogOpen(false)}
        size="lg"
        panelClassName="font-tajawal bg-white"
      >
        <div className={`p-4 sm:p-6 ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900">{tr('تصفية المصاريف', 'Expense filters')}</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {tr('افتح الفلاتر فقط عند الحاجة للحفاظ على الشاشة مرتبة.', 'Open filters only when needed to keep the screen focused.')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsFilterDialogOpen(false)}
              className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={tr('إغلاق', 'Close')}
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الحالة', 'Status')}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'POSTED')}
                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
              >
                <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
                <option value="POSTED">{tr('مرحل فقط', 'Posted only')}</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('المستفيد', 'Beneficiary')}</label>
              <select
                value={contactFilterId}
                onChange={(e) => setContactFilterId(e.target.value)}
                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
              >
                <option value="ALL">{tr('كل المستفيدين', 'All beneficiaries')}</option>
                {expenseContactOptions.map(contact => (
                  <option key={contact.id} value={contact.id}>{displayContactName(contact)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('من تاريخ', 'From date')}</label>
              <EnglishDateInput
                value={fromDateFilter}
                onChange={setFromDateFilter}
                displayFormat="DMY"
                wrapperClassName="w-full"
                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr"
                placeholder={tr('من تاريخ', 'From date')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('إلى تاريخ', 'To date')}</label>
              <EnglishDateInput
                value={toDateFilter}
                onChange={setToDateFilter}
                displayFormat="DMY"
                wrapperClassName="w-full"
                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr"
                placeholder={tr('إلى تاريخ', 'To date')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الحد الأدنى', 'Min amount')}</label>
              <input
                type="text"
                inputMode="decimal"
                lang="en"
                value={toEnglishDigits(minAmountFilter)}
                onChange={(e) => setMinAmountFilter(toEnglishDigits(e.target.value))}
                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr text-right"
                placeholder={tr('الحد الأدنى', 'Min amount')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الحد الأعلى', 'Max amount')}</label>
              <input
                type="text"
                inputMode="decimal"
                lang="en"
                value={toEnglishDigits(maxAmountFilter)}
                onChange={(e) => setMaxAmountFilter(toEnglishDigits(e.target.value))}
                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr text-right"
                placeholder={tr('الحد الأعلى', 'Max amount')}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-black text-slate-500">
              {tr('النتائج الحالية', 'Current results')}: <span className="text-slate-900">{expenses.length}</span>
            </span>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {tr('مسح الفلاتر', 'Clear filters')}
              </button>
              <button
                type="button"
                onClick={() => setIsFilterDialogOpen(false)}
                className="rounded-[1.1rem] bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700"
              >
                {tr('عرض النتائج', 'Show results')}
              </button>
            </div>
          </div>
        </div>
      </ResponsiveDialog>

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
                                    <span
                                        className="text-[9px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100 cursor-pointer hover:text-rose-600"
                                        onClick={(event) => event.stopPropagation()}
                                        onDoubleClick={(event) => {
                                            event.stopPropagation();
                                            openContactStatement(inv.customerId);
                                        }}
                                        title={tr('اضغط مرتين لفتح كشف الطرف', 'Double-click to open contact statement')}
                                    >
                                        {getContactName(inv.customerId)}
                                    </span>
                                    <span className="text-[9px] font-bold text-gray-300">{formatDate(inv.date)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-end">
                            <span className="block font-black text-rose-600 dir-ltr text-lg tracking-tighter">
                                {getInvoiceTotal(inv).toLocaleString('en-US')}
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
                                        <span
                                            className={`font-bold text-gray-700 ${item.productId ? 'cursor-pointer hover:text-rose-600' : ''}`}
                                            onClick={(event) => event.stopPropagation()}
                                            onDoubleClick={(event) => {
                                                event.stopPropagation();
                                                if (item.productId) openProductMovement(item.productId);
                                            }}
                                            title={item.productId ? tr('اضغط مرتين لفتح حركة الصنف', 'Double-click to open item movement') : undefined}
                                        >
                                            {item.productId ? displayProductName(products.find(p => p.id === item.productId) || null) : item.description}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {(Number(item.quantity) || 0) > 1 && <span className="text-[10px] text-gray-400 font-bold">x{item.quantity}</span>}
                                            <span className="font-black text-rose-600 dir-ltr">{Number(item.total || 0).toLocaleString('en-US')}</span>
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
                                <button onClick={(e) => { e.stopPropagation(); handlePrintExpense(inv); }} className="flex items-center gap-1 hover:text-rose-600 transition-colors">
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

