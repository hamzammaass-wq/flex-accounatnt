
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, Invoice } from '../types';
import { getDisplayContactName, getDisplayProductName } from '../utils/displayNames';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { sanitizeInvoiceItems } from '../utils/invoiceSanitizer';
import { getInvoiceTaxVisibility } from '../utils/companySettings';
import { getInvoiceTaxModeDescription, isInvoiceTaxApplied, resolveInvoiceTaxMode } from '../utils/invoiceTax';
import {
  Plus, Search, FileText, User, Calendar,
  CheckCircle2, Clock, XCircle, ShoppingBag,
  ArrowDownRight, Printer, ChevronLeft,
  TrendingUp, Calculator, PackageCheck, Tag, ChevronDown, ChevronUp, Info, Sparkles, Ship, Archive, CheckCircle, RotateCcw, Trash2, Filter, Pencil, X
} from 'lucide-react';
import { TabView } from '../App';
import { TransactionTabType } from './TransactionForm';

interface PurchaseInvoiceListProps {
  onNavigate: (tab: TabView, formTab?: TransactionTabType) => void;
  onEditInvoice?: (invoiceId: string, mode: TransactionTabType) => void;
  onAddImportExpense?: (invoiceId: string) => void;
}

const PurchaseInvoiceList: React.FC<PurchaseInvoiceListProps> = ({ onNavigate, onEditInvoice, onAddImportExpense }) => {
  const { invoices, contacts, products, baseCurrency, companySettings, postInvoice, deleteInvoice, returnInvoiceItem, reverseInvoice } = useAccounting();
  const [activeTab, setActiveTab] = useState<'INVOICES' | 'RETURNS'>('INVOICES');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPostingStatus, setFilterPostingStatus] = useState('ALL');
  const [filterCurrency, setFilterCurrency] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const taxVisibleInInvoices = getInvoiceTaxVisibility(companySettings, 'purchase');
  const printPersonalData = companySettings.printPersonalData ?? true;
  const printElectronicInvoice = companySettings.printElectronicInvoice ?? true;
  const invoiceFooterNote = companySettings.invoiceFooterNote ?? '';
  const headerTopLines = companySettings.headerTopLines ?? 0;
  const printExpiryDate = companySettings.printExpiryDate ?? false;
  const dottedNumbers = companySettings.dottedNumbers ?? false;
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);
  const displayProductName = (product?: { id: string; name: string } | null) =>
    getDisplayProductName(product || undefined, isEnglish);
  const asText = (value: unknown) => String(value ?? '');
  const getInvoiceItems = (invoice: Invoice) => sanitizeInvoiceItems(invoice.items);
  const getInvoiceTotal = (invoice: Invoice) => Number(invoice.totalAmount || 0);
  const parseFilterNumber = (raw: string): number | null => {
    const normalized = toEnglishDigits(String(raw || ''))
      .replace(/[\u066C\u060C,]/g, '')
      .trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const getInvoiceStatusLabel = (status: string) => {
    if (status === 'PAID') return tr('تم السداد', 'Paid');
    if (status === 'PENDING') return tr('آجل (مديونية)', 'Credit (Payable)');
    if (status === 'CANCELLED') return tr('ملغاة', 'Cancelled');
    return status;
  };
  const getPostingStatusLabel = (status: string) => status === 'POSTED'
    ? tr('مرحلة', 'Posted')
    : status === 'DRAFT'
      ? tr('مسودة', 'Draft')
      : status;

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
  };

  const availableSuppliers = useMemo(
    () => contacts.slice().sort((a, b) => displayContactName(a).localeCompare(displayContactName(b))),
    [contacts, isEnglish]
  );

  const availableStatuses = useMemo(() => {
    const values = new Set<string>();
    invoices.forEach(inv => {
      let typeMatch = false;
      if (activeTab === 'INVOICES') typeMatch = inv.type === TransactionType.EXPENSE && inv.category === 'purchase_invoice';
      if (activeTab === 'RETURNS') typeMatch = inv.category === 'purchase_return';
      if (typeMatch) values.add(inv.status);
    });
    return Array.from(values);
  }, [invoices, activeTab]);

  const availablePostingStatuses = useMemo(() => {
    const values = new Set<string>();
    invoices.forEach(inv => {
      let typeMatch = false;
      if (activeTab === 'INVOICES') typeMatch = inv.type === TransactionType.EXPENSE && inv.category === 'purchase_invoice';
      if (activeTab === 'RETURNS') typeMatch = inv.category === 'purchase_return';
      if (typeMatch) values.add(inv.postingStatus || 'DRAFT');
    });
    return Array.from(values);
  }, [invoices, activeTab]);

  const availableCurrencies = useMemo(() => {
    const values = new Set<string>();
    invoices.forEach(inv => {
      if (inv.currency) values.add(inv.currency);
    });
    return Array.from(values);
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    const minAmount = parseFilterNumber(filterMinAmount);
    const maxAmount = parseFilterNumber(filterMaxAmount);
    return invoices.filter(inv => {
      let typeMatch = false;
      if (activeTab === 'INVOICES') typeMatch = inv.type === TransactionType.EXPENSE && inv.category === 'purchase_invoice';
      if (activeTab === 'RETURNS') typeMatch = inv.category === 'purchase_return';

      const contact = contacts.find(c => c.id === inv.customerId);
      const contactRaw = (contact?.name || '').toLowerCase();
      const contactDisplay = displayContactName(contact || null).toLowerCase();
      const searchMatch = (
        asText(inv.invoiceNumber).toLowerCase().includes(normalizedSearch) ||
        contactRaw.includes(normalizedSearch) ||
        contactDisplay.includes(normalizedSearch) ||
        getInvoiceItems(inv).some(i => asText(i.description).toLowerCase().includes(normalizedSearch))
      );
      const supplierMatch = filterSupplierId === 'ALL' || inv.customerId === filterSupplierId;
      const statusMatch = filterStatus === 'ALL' || inv.status === filterStatus;
      const postingMatch = filterPostingStatus === 'ALL' || (inv.postingStatus || 'DRAFT') === filterPostingStatus;
      const currencyMatch = filterCurrency === 'ALL' || inv.currency === filterCurrency;
      const dateFromMatch = !filterDateFrom || inv.date >= filterDateFrom;
      const dateToMatch = !filterDateTo || inv.date <= filterDateTo;
      const totalAmount = getInvoiceTotal(inv);
      const minAmountMatch = minAmount === null || totalAmount >= minAmount;
      const maxAmountMatch = maxAmount === null || totalAmount <= maxAmount;

      return typeMatch
        && searchMatch
        && supplierMatch
        && statusMatch
        && postingMatch
        && currencyMatch
        && dateFromMatch
        && dateToMatch
        && minAmountMatch
        && maxAmountMatch;
    }).sort((a, b) => new Date(asText(b.date)).getTime() - new Date(asText(a.date)).getTime());
  }, [
    invoices, searchTerm, contacts, activeTab, isEnglish,
    filterSupplierId, filterStatus, filterPostingStatus, filterCurrency,
    filterDateFrom, filterDateTo, filterMinAmount, filterMaxAmount
  ]);

  const resetFilters = () => {
    setFilterSupplierId('ALL');
    setFilterStatus('ALL');
    setFilterPostingStatus('ALL');
    setFilterCurrency('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMinAmount('');
    setFilterMaxAmount('');
  };
  const hasSearch = !!searchTerm.trim();
  const hasAdvancedFilters =
    filterSupplierId !== 'ALL' ||
    filterStatus !== 'ALL' ||
    filterPostingStatus !== 'ALL' ||
    filterCurrency !== 'ALL' ||
    !!filterDateFrom ||
    !!filterDateTo ||
    !!filterMinAmount ||
    !!filterMaxAmount;
  const hasActiveFilters = hasSearch || hasAdvancedFilters;
  const activeAdvancedFilterCount = [
    filterSupplierId !== 'ALL',
    filterStatus !== 'ALL',
    filterPostingStatus !== 'ALL',
    filterCurrency !== 'ALL',
    !!filterDateFrom,
    !!filterDateTo,
    !!filterMinAmount,
    !!filterMaxAmount
  ].filter(Boolean).length;
  const clearAllFilters = () => {
    setSearchTerm('');
    resetFilters();
  };

  const stats = useMemo(() => {
    const total = filteredInvoices.reduce((sum, inv) => sum + (inv.postingStatus === 'POSTED' ? getInvoiceTotal(inv) : 0), 0);
    const paid = filteredInvoices.filter(inv => inv.status === 'PAID' && inv.postingStatus === 'POSTED').reduce((sum, inv) => sum + getInvoiceTotal(inv), 0);
    const pending = filteredInvoices.filter(inv => inv.status === 'PENDING' && inv.postingStatus === 'POSTED').reduce((sum, inv) => sum + getInvoiceTotal(inv), 0);
    return { total, paid, pending };
  }, [filteredInvoices]);

  const getSupplierName = (id?: string) => {
    if (!id) return tr('مورد غير محدد', 'Unknown Supplier');
    return displayContactName(contacts.find(c => c.id === id) || null) || tr('مورد غير معروف', 'Unknown Supplier');
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PAID':
        return {
          label: tr('تم السداد', 'Paid'),
          color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
          icon: <CheckCircle2 size={12} />
        };
      case 'PENDING':
        return {
          label: tr('آجل (مديونية)', 'Credit (Payable)'),
          color: 'bg-orange-50 text-orange-600 border-orange-100',
          icon: <Clock size={12} />
        };
      default:
        return {
          label: tr('ملغاة', 'Cancelled'),
          color: 'bg-rose-50 text-rose-600 border-rose-100',
          icon: <XCircle size={12} />
        };
    }
  };

  const buildPurchaseInvoicePrintHtml = (invoice: Invoice, autoPrint = true): string => {
    const printLang = isEnglish ? 'en' : 'ar';
    const printDir = isEnglish ? 'ltr' : 'rtl';
    const printFont = isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', sans-serif";

    const supplier = contacts.find(c => c.id === invoice.customerId);
    const supplierName = getSupplierName(invoice.customerId);
    const formatPrintNumber = (value: number) => {
      const normalized = value.toLocaleString();
      return dottedNumbers ? normalized.replace(/,/g, '.') : normalized;
    };
    const topSpacerPx = Math.max(0, headerTopLines) * 20;
    const dueDateLine = (printExpiryDate && invoice.dueDate)
      ? `<p>${tr('تاريخ الإنتهاء', 'Expiry Date')}: ${formatDate(invoice.dueDate)}</p>`
      : '';
    const date = formatDate(invoice.date);
    const itemsRows = getInvoiceItems(invoice).map((item, index) => {
      const product = item.productId ? products.find(p => p.id === item.productId) : undefined;
      const itemLabel = product ? displayProductName(product) : item.description;
      const itemCode = product?.itemCode || product?.barcode || '-';
      return `
      <tr>
        <td>${index + 1}</td>
        <td dir="ltr">${itemCode}</td>
        <td style="text-align: right;">${itemLabel} ${item.returned ? `<span style="color:red; font-size:10px">(${tr('مرتجع', 'Returned')})</span>` : ''}</td>
        <td>${item.quantity}</td>
        <td dir="ltr">${formatPrintNumber(item.unitPrice)}</td>
        <td dir="ltr">${formatPrintNumber(item.total)}</td>
      </tr>
    `;
    }).join('');

    const title = invoice.category === 'purchase_return'
      ? tr('إشعار مدين (مرتجع مشتريات)', 'Debit Note (Purchase Return)')
      : printElectronicInvoice
        ? tr('فاتورة إلكترونية مشتريات', 'Electronic Purchase Invoice')
        : tr('فاتورة مشتريات', 'Purchase Invoice');
    const invoiceTaxMode = resolveInvoiceTaxMode(invoice);
    const taxableInvoice = taxVisibleInInvoices && isInvoiceTaxApplied(invoiceTaxMode, invoice.taxRate, invoice.taxAmount);

    const totalsBlock = `
      <div style="text-align: left; display: inline-block; min-width: 280px;">
        <p><strong>${tr('الإجمالي قبل الضريبة', 'Subtotal')}:</strong> ${formatPrintNumber(invoice.subTotal)} ${invoice.currency}</p>
        ${invoice.discountAmount > 0 ? `<p><strong>${tr('الخصم', 'Discount')}:</strong> -${formatPrintNumber(invoice.discountAmount)} ${invoice.currency}</p>` : ''}
        ${taxVisibleInInvoices ? `<p><strong>${tr('طريقة الضريبة', 'Tax mode')}:</strong> ${getInvoiceTaxModeDescription(invoiceTaxMode, tr)}</p>` : ''}
        ${(taxableInvoice && invoice.taxAmount > 0) ? `<p><strong>${tr('الضريبة', 'Tax')} (${invoice.taxRate}%):</strong> +${formatPrintNumber(invoice.taxAmount)} ${invoice.currency}</p>` : ''}
        <h3>${tr('الإجمالي النهائي', 'Grand Total')}: ${formatPrintNumber(invoice.totalAmount)} ${invoice.currency}</h3>
        ${invoiceFooterNote ? `<p style="margin-top:8px; color:#666; font-size:12px;">${invoiceFooterNote}</p>` : ''}
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html dir="${printDir}" lang="${printLang}">
        <head>
          <title>${title} - ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: ${printFont}; padding: ${40 + topSpacerPx}px 40px 40px 40px; color: #333; line-height: 1.6; }
            .invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
            .company-info h1 { margin: 0; color: #312e81; font-size: 26px; }
            .company-info p { margin: 4px 0; color: #666; font-size: 13px; }
            .invoice-meta { text-align: left; }
            .invoice-meta h2 { margin: 0; color: #6366f1; font-size: 24px; }
            .invoice-meta p { margin: 4px 0; color: #888; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #6366f1; color: white; padding: 12px; text-align: center; font-size: 14px; }
            td { padding: 12px; text-align: center; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="invoice-header">
            <div class="company-info">
              <h1>${companySettings.name}</h1>
              ${taxVisibleInInvoices ? `<p>${tr('الرقم الضريبي', 'Tax Number')}: ${companySettings.taxNumber || '-'}</p>` : ''}
            </div>
            <div class="invoice-meta">
              <h2>${title}</h2>
              <p>${tr('رقم', 'No.')}: ${invoice.invoiceNumber}</p>
              <p>${tr('التاريخ', 'Date')}: ${date}</p>
              ${dueDateLine}
            </div>
          </div>
          <p><strong>${tr('المورد', 'Supplier')}:</strong> ${supplierName}${printPersonalData && supplier?.phone ? ` | ${tr('الجوال', 'Phone')}: ${supplier.phone}` : ''}</p>
          <table>
            <thead><tr><th>#</th><th>${tr('رقم الصنف', 'Item No.')}</th><th style="text-align:right;">${tr('البيان', 'Description')}</th><th>${tr('الكمية', 'Quantity')}</th><th>${tr('السعر', 'Price')}</th><th>${tr('الإجمالي', 'Total')}</th></tr></thead>
            <tbody>${itemsRows}</tbody></table>
          <div style="text-align: left;">${totalsBlock}</div>
          ${autoPrint ? '<script>window.onload = function() { window.print(); }</script>' : ''}
        </body>
      </html>
    `;
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = buildPurchaseInvoicePrintHtml(invoice, true);
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePost = (id: string) => {
    if (confirm(tr('هل أنت متأكد من ترحيل الفاتورة؟ سيتم تحديث المخزون والقيود.', 'Are you sure you want to post this invoice? Inventory and entries will be updated.'))) {
      const result = postInvoice(id);
      if (!result.ok) alert(result.message);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(tr('هل أنت متأكد من حذف هذه الفاتورة نهائياً؟', 'Are you sure you want to permanently delete this invoice?'))) {
      const result = deleteInvoice(id);
      if (!result.ok) alert(result.message);
    }
  };

  const handleReverseInvoice = (id: string) => {
    if (!confirm(tr('سيتم إنشاء فاتورة عكسية محاسبية. هل تريد المتابعة؟', 'A reversal invoice will be created. Continue?'))) return;
    const result = reverseInvoice(id);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert(tr('تم إنشاء العكس بنجاح', 'Reversal created successfully.'));
  };

  const handleAdd = () => {
    if (activeTab === 'RETURNS') {
      onNavigate('purchases', 'PURCHASE_RETURN');
    } else {
      onNavigate('purchases', 'PURCHASES');
    }
  };

  return (
        <div className="app-page purchase-list-page animate-in fade-in duration-500 p-4" dir={isEnglish ? 'ltr' : 'rtl'}>
          <header className="mb-5 flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">{tr('المشتريات', 'Purchases')}</h1>
              <p className="text-gray-400 text-[10px] font-black mt-1 uppercase tracking-[0.3em]">{tr('إدارة فواتير الموردين والمخزون', 'Manage supplier invoices and inventory')}</p>
            </div>
            <button
              onClick={handleAdd}
              className={`text-white p-3 rounded-2xl shadow-xl transition-all active:scale-90 shrink-0 ms-2 ${activeTab === 'RETURNS' ? 'bg-rose-600 shadow-rose-100 hover:bg-rose-700' : 'bg-purple-600 shadow-purple-100 hover:bg-purple-700'}`}
            >
              <Plus className="w-6 h-6" />
            </button>
          </header>

          {/* Tabs */}
          <div className="flex p-1.5 bg-white border border-gray-100 rounded-[2rem] mb-6 shadow-sm">
            <button onClick={() => setActiveTab('INVOICES')} className={`flex-1 py-3 rounded-[1.6rem] text-xs font-black transition-all ${activeTab === 'INVOICES' ? 'bg-slate-800 text-white shadow-lg' : 'text-gray-400'}`}>{tr('فواتير', 'Invoices')}</button>
            <button onClick={() => setActiveTab('RETURNS')} className={`flex-1 py-3 rounded-[1.6rem] text-xs font-black transition-all ${activeTab === 'RETURNS' ? 'bg-rose-600 text-white shadow-lg' : 'text-gray-400'}`}>{tr('مرتجع', 'Returns')}</button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <div className="list-card bg-white p-3 sm:p-4 rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                {tr('إجمالي', 'Total')} {activeTab === 'RETURNS' ? tr('المرتجع', 'Returns') : tr('المشتريات', 'Purchases')}
              </span>
              <span className="text-base sm:text-lg font-black text-gray-800 dir-ltr">{stats.total.toLocaleString()}</span>
            </div>
            <div className="list-card bg-white p-3 sm:p-4 rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm">
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-1">{tr('المدفوع', 'Paid')}</span>
              <span className="text-base sm:text-lg font-black text-emerald-600 dir-ltr">{stats.paid.toLocaleString()}</span>
            </div>
            <div className="list-card bg-white p-3 sm:p-4 rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm">
              <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest block mb-1">{tr('الآجل (دين)', 'Credit (Debt)')}</span>
              <span className="text-base sm:text-lg font-black text-orange-600 dir-ltr">{stats.pending.toLocaleString()}</span>
            </div>
          </div>

          <div className="relative mb-6">
            <input type="text" placeholder={tr('ابحث برقم الفاتورة أو المورد...', 'Search by invoice number or supplier...')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-4 pr-12 bg-white rounded-2xl border border-gray-100 shadow-sm outline-none font-bold text-sm" />
            <Search className="w-5 h-5 text-gray-400 absolute top-1/2 -translate-y-1/2 right-4 pointer-events-none" />
          </div>

          <div className="list-card bg-white p-3 sm:p-4 rounded-[2rem] border border-gray-100 shadow-sm mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsFilterDialogOpen(true)}
                className="inline-flex items-center gap-2 rounded-[1rem] border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <Filter size={16} className={activeTab === 'RETURNS' ? 'text-rose-500' : 'text-purple-500'} />
                <span>{tr('فلتر', 'Filter')}</span>
                {activeAdvancedFilterCount > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${activeTab === 'RETURNS' ? 'bg-rose-50 text-rose-700' : 'bg-purple-50 text-purple-700'}`}>
                    {activeAdvancedFilterCount}
                  </span>
                )}
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  {tr('مسح الكل', 'Clear all')}
                </button>
              )}
            </div>

            {hasAdvancedFilters && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${activeTab === 'RETURNS' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-purple-100 bg-purple-50 text-purple-700'}`}>
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
                  <h2 className="text-xl font-black text-slate-900">{tr('تصفية الفواتير', 'Invoice filters')}</h2>
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
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('المورد', 'Supplier')}</label>
                  <select value={filterSupplierId} onChange={(e) => setFilterSupplierId(e.target.value)} className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white">
                    <option value="ALL">{tr('كل الموردين', 'All Suppliers')}</option>
                    {availableSuppliers.map(contact => (
                      <option key={contact.id} value={contact.id}>{displayContactName(contact)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('حالة السداد', 'Payment status')}</label>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white">
                    <option value="ALL">{tr('كل حالات السداد', 'All Payment Statuses')}</option>
                    {availableStatuses.map(status => (
                      <option key={status} value={status}>{getInvoiceStatusLabel(status)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('حالة الترحيل', 'Posting status')}</label>
                  <select value={filterPostingStatus} onChange={(e) => setFilterPostingStatus(e.target.value)} className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white">
                    <option value="ALL">{tr('كل حالات الترحيل', 'All Posting Statuses')}</option>
                    {availablePostingStatuses.map(status => (
                      <option key={status} value={status}>{getPostingStatusLabel(status)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('العملة', 'Currency')}</label>
                  <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white">
                    <option value="ALL">{tr('كل العملات', 'All Currencies')}</option>
                    {availableCurrencies.map(currency => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('من تاريخ', 'Date from')}</label>
                  <EnglishDateInput value={filterDateFrom} onChange={setFilterDateFrom} displayFormat="YMD" wrapperClassName="w-full" className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr" />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('إلى تاريخ', 'Date to')}</label>
                  <EnglishDateInput value={filterDateTo} onChange={setFilterDateTo} displayFormat="YMD" wrapperClassName="w-full" className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr" />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('حد أدنى للمبلغ', 'Min amount')}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={filterMinAmount}
                    onChange={(e) => setFilterMinAmount(toEnglishDigits(e.target.value))}
                    className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('حد أعلى للمبلغ', 'Max amount')}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={filterMaxAmount}
                    onChange={(e) => setFilterMaxAmount(toEnglishDigits(e.target.value))}
                    className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-black text-slate-500">
                  {tr('النتائج الحالية', 'Current results')}: <span className="text-slate-900">{filteredInvoices.length}</span>
                </span>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {tr('مسح الفلاتر', 'Clear filters')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFilterDialogOpen(false)}
                    className={`rounded-[1.1rem] px-4 py-3 text-sm font-black text-white transition ${activeTab === 'RETURNS' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                  >
                    {tr('عرض النتائج', 'Show results')}
                  </button>
                </div>
              </div>
            </div>
          </ResponsiveDialog>

          <div className="space-y-4">
            {filteredInvoices.map((inv) => {
              const status = getStatusConfig(inv.status);
              const isDraft = inv.postingStatus === 'DRAFT';
              const isExpanded = expandedInvoiceId === inv.id;
              const canMutateDirectly = !inv.isReversal && !inv.reversedById;
              const invoiceItems = getInvoiceItems(inv);

              return (
                <div key={inv.id} className={`list-card bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm transition-all duration-300 ${isExpanded ? 'ring-4 ring-purple-50 shadow-xl border-purple-100 scale-[1.01]' : 'hover:shadow-md'}`}>
                  <div className="cursor-pointer" onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-2xl transition-all duration-300 ${activeTab === 'RETURNS' ? 'bg-rose-50 text-rose-600' : 'bg-purple-50 text-purple-600'}`}>
                          {activeTab === 'RETURNS' ? <RotateCcw size={24} /> : <ShoppingBag size={24} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-black text-gray-800 text-base tracking-tight">{inv.invoiceNumber}</h4>
                            {isDraft && <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded font-black border border-amber-100">{tr('مسودة', 'Draft')}</span>}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase tracking-wider"><User size={12} className="text-purple-400" />{getSupplierName(inv.customerId)}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${status.color}`}>{status.icon}{status.label}</div>
                        <button onClick={(e) => { e.stopPropagation(); handlePrintInvoice(inv); }} className="p-2 bg-gray-50 text-gray-400 hover:text-purple-600 rounded-xl transition-all" title={tr('طباعة الفاتورة', 'Print Invoice')}>
                          <Printer size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center border-t border-gray-50 pt-4">
                      <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1.5"><Calendar size={14} className="text-gray-300" />{formatDate(inv.date)}</div>
                      <div className="text-left"><span className="text-xl font-black text-gray-800 dir-ltr">{getInvoiceTotal(inv).toLocaleString()}</span></div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2">
                      <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{tr('تفاصيل البنود', 'Items Details')}</h5>
                      <div className="space-y-2 mb-4">
                        {invoiceItems.map((item, idx) => {
                          const product = item.productId ? products.find(p => p.id === item.productId) : undefined;
                          const itemCode = product?.itemCode || product?.barcode || '';
                          return (
                            <div key={idx} className={`flex justify-between items-center text-xs p-3 rounded-xl border ${item.returned ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100'}`}>
                              <div>
                                <span className={`font-bold ${item.returned ? 'text-rose-700 line-through' : 'text-gray-700'}`}>
                                  {product ? displayProductName(product) : item.description}
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] text-gray-400 font-bold">x{item.quantity}</span>
                                  {itemCode && <span className="text-[9px] text-indigo-500 font-black">{tr('رقم الصنف', 'Item No.')}: {itemCode}</span>}
                                  {item.returned && <span className="text-[8px] bg-rose-200 text-rose-800 px-1 rounded font-bold">{tr('مرتجع', 'Returned')}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`font-black dir-ltr ${item.returned ? 'text-rose-400 line-through' : 'text-gray-800'}`}>{item.total.toLocaleString()}</span>
                                {activeTab === 'INVOICES' && !item.returned && !isDraft && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const result = returnInvoiceItem(inv.id, item.id);
                                      if (!result.ok) alert(result.message);
                                    }}
                                    className="p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-rose-500 hover:border-rose-200 rounded-lg shadow-sm transition-all"
                                    title={tr('إرجاع الصنف', 'Return item')}
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {canMutateDirectly && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditInvoice?.(inv.id, activeTab === 'RETURNS' ? 'PURCHASE_RETURN' : 'PURCHASES');
                            }}
                            className="py-3 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                          >
                            <Pencil size={16} /> {tr('تعديل', 'Edit')}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(inv.id); }}
                            className="py-3 bg-gray-50 hover:bg-rose-50 text-rose-500 rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                          >
                            <Trash2 size={16} /> {tr('حذف', 'Delete')}
                          </button>
                        </div>
                      )}

                      {isDraft && (
                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePost(inv.id); }}
                            className={`flex-[2] py-3 rounded-xl font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 text-white ${activeTab === 'RETURNS' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                          >
                            <CheckCircle size={16} /> {activeTab === 'RETURNS' ? tr('اعتماد المرتجع', 'Approve Return') : tr('اعتماد الفاتورة', 'Approve Invoice')}
                          </button>
                        </div>
                      )}

                      {!isDraft && activeTab === 'INVOICES' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {onAddImportExpense && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onAddImportExpense(inv.id); }}
                              className="py-3 bg-cyan-50 text-cyan-600 border border-cyan-200 hover:bg-cyan-100 rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                            >
                              <Ship size={16} /> {tr('إضافة مصاريف استيراد', 'Add Import Expenses')}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReverseInvoice(inv.id); }}
                            className="py-3 bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                          >
                            <RotateCcw size={16} /> {tr('عكس محاسبي', 'Reverse')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredInvoices.length === 0 && (
              <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-100">
                <FileText size={40} className="mx-auto text-gray-100 mb-3" />
                <p className="text-gray-400 font-bold text-xs">{tr('لا توجد', 'No')} {activeTab === 'INVOICES' ? tr('فواتير مشتريات', 'purchase invoices') : tr('مرتجعات', 'returns')} {tr('مطابقة', 'found')}</p>
              </div>
            )}
          </div>
        </div>
      );
    };

    export default PurchaseInvoiceList;

