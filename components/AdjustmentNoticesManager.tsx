import React, { useMemo, useState } from 'react';
import {
  BadgePercent,
  Calendar,
  CheckCircle2,
  FileText,
  Link2,
  Plus,
  Printer,
  Receipt,
  Send,
  Trash2,
  User,
  XCircle
} from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { Invoice, TransactionType } from '../types';
import { getInvoiceRemainingBase } from '../utils/invoiceSettlement';
import { printHtmlContent } from '../utils/documentExport';
import EnglishDateInput from './EnglishDateInput';
import { getDisplayContactName } from '../utils/displayNames';
import { openDrilldown } from '../utils/drilldown';

type NoticeKind = 'CREDIT_NOTE' | 'DEBIT_NOTE';
type NoticeViewKind = 'ALL' | NoticeKind;

const AdjustmentNoticesManager: React.FC = () => {
  const {
    invoices,
    contacts,
    companySettings,
    baseCurrency,
    invoiceSettlements,
    createInvoice,
    deleteInvoice
  } = useAccounting();

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);
  const openContactStatement = (contactId?: string) => {
    if (!contactId) return;
    openDrilldown({ kind: 'CONTACT_STATEMENT', contactId });
  };

  const [activeKind, setActiveKind] = useState<NoticeKind>('CREDIT_NOTE');
  const [viewKind, setViewKind] = useState<NoticeViewKind>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [linkedInvoiceId, setLinkedInvoiceId] = useState('');
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().slice(0, 10));
  const [noticeAmount, setNoticeAmount] = useState('');
  const [noticeNotes, setNoticeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED'>('ALL');
  const [partyFilterId, setPartyFilterId] = useState('ALL');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  const normalizeNumber = (v: string) =>
    Number(String(v || '').replace(/[ظ -ظ©]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[^\d.]/g, ''));

  const isSalesInvoiceForCreditNote = (inv: Invoice) =>
    inv.type === TransactionType.INCOME &&
    inv.paymentType === 'CREDIT' &&
    inv.status !== 'CANCELLED' &&
    inv.status !== 'QUOTATION' &&
    inv.category !== 'sales_return' &&
    inv.category !== 'customer_credit_note' &&
    inv.category !== 'purchase_return' &&
    inv.category !== 'supplier_debit_note';

  const isPurchaseInvoiceForDebitNote = (inv: Invoice) =>
    inv.category === 'purchase_invoice' &&
    inv.paymentType === 'CREDIT' &&
    inv.status !== 'CANCELLED' &&
    inv.status !== 'QUOTATION';

  const eligibleParties = useMemo(() => {
    const wantedType = activeKind === 'CREDIT_NOTE' ? 'CUSTOMER' : 'SUPPLIER';
    return contacts
      .filter(c => c.type === wantedType)
      .sort((a, b) => String(displayContactName(a)).localeCompare(String(displayContactName(b)), isEnglish ? 'en' : 'ar'));
  }, [contacts, activeKind, isEnglish]);

  const eligibleInvoices = useMemo(() => {
    return invoices
      .filter(inv => activeKind === 'CREDIT_NOTE' ? isSalesInvoiceForCreditNote(inv) : isPurchaseInvoiceForDebitNote(inv))
      .filter(inv => !!selectedPartyId && inv.customerId === selectedPartyId)
      .filter(inv => getInvoiceRemainingBase(inv, invoiceSettlements) > 0.005)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, invoiceSettlements, activeKind, selectedPartyId]);

  const linkedInvoice = useMemo(
    () => eligibleInvoices.find(inv => inv.id === linkedInvoiceId) || invoices.find(inv => inv.id === linkedInvoiceId) || null,
    [eligibleInvoices, invoices, linkedInvoiceId]
  );

  const linkedInvoiceRemaining = useMemo(
    () => linkedInvoice ? getInvoiceRemainingBase(linkedInvoice, invoiceSettlements) : 0,
    [linkedInvoice, invoiceSettlements]
  );

  const allNotices = useMemo(() => {
    return invoices
      .filter(inv => inv.category === 'customer_credit_note' || inv.category === 'supplier_debit_note')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices]);

  const noticeParties = useMemo(() => {
    const partyIds = new Set(
      allNotices
        .filter(inv => (
          viewKind === 'ALL' ||
          (viewKind === 'CREDIT_NOTE' && inv.category === 'customer_credit_note') ||
          (viewKind === 'DEBIT_NOTE' && inv.category === 'supplier_debit_note')
        ))
        .map(inv => inv.customerId)
        .filter((id): id is string => !!id)
    );

    return contacts
      .filter(c => partyIds.has(c.id))
      .sort((a, b) => String(displayContactName(a)).localeCompare(String(displayContactName(b)), isEnglish ? 'en' : 'ar'));
  }, [allNotices, contacts, viewKind, isEnglish]);

  const notices = useMemo(() => {
    return allNotices
      .filter(inv => (
        viewKind === 'ALL' ||
        (viewKind === 'CREDIT_NOTE' && inv.category === 'customer_credit_note') ||
        (viewKind === 'DEBIT_NOTE' && inv.category === 'supplier_debit_note')
      ))
      .filter(inv => statusFilter === 'ALL' || (inv.postingStatus || 'POSTED') === statusFilter)
      .filter(inv => partyFilterId === 'ALL' || inv.customerId === partyFilterId)
      .filter(inv => !fromDateFilter || inv.date >= fromDateFilter)
      .filter(inv => !toDateFilter || inv.date <= toDateFilter)
      .filter(inv => {
        if (!searchTerm.trim()) return true;
        const contact = contacts.find(c => c.id === inv.customerId);
        const contactName = contact?.name || '';
        const contactDisplayName = contact ? displayContactName(contact) : '';
        const q = searchTerm.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          (inv.notes || '').toLowerCase().includes(q) ||
          contactName.toLowerCase().includes(q) ||
          contactDisplayName.toLowerCase().includes(q)
        );
      });
  }, [allNotices, viewKind, statusFilter, partyFilterId, fromDateFilter, toDateFilter, contacts, searchTerm]);

  const summary = useMemo(() => {
    const credit = allNotices.filter(n => n.category === 'customer_credit_note');
    const debit = allNotices.filter(n => n.category === 'supplier_debit_note');
    return {
      total: allNotices.length,
      creditCount: credit.length,
      debitCount: debit.length,
      posted: allNotices.filter(n => n.postingStatus === 'POSTED').length,
      creditAmount: credit.reduce((s, n) => s + (Number(n.totalAmount) || 0), 0),
      debitAmount: debit.reduce((s, n) => s + (Number(n.totalAmount) || 0), 0),
    };
  }, [allNotices]);

  const hasActiveFilters =
    !!searchTerm.trim() ||
    statusFilter !== 'ALL' ||
    partyFilterId !== 'ALL' ||
    !!fromDateFilter ||
    !!toDateFilter;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setPartyFilterId('ALL');
    setFromDateFilter('');
    setToDateFilter('');
  };

  const resetForm = (kind: NoticeKind = activeKind) => {
    setActiveKind(kind);
    setSelectedPartyId('');
    setLinkedInvoiceId('');
    setNoticeDate(new Date().toISOString().slice(0, 10));
    setNoticeAmount('');
    setNoticeNotes('');
  };

  const openCreate = (kind: NoticeKind) => {
    resetForm(kind);
    setShowForm(true);
  };

  const handleSelectLinkedInvoice = (invoiceId: string) => {
    setLinkedInvoiceId(invoiceId);
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    setSelectedPartyId(inv.customerId || '');
    setNoticeDate(new Date().toISOString().slice(0, 10));
    const remaining = getInvoiceRemainingBase(inv, invoiceSettlements);
    if (remaining > 0) setNoticeAmount(String(Number(remaining.toFixed(2))));
    if (!noticeNotes.trim()) {
      setNoticeNotes(
        activeKind === 'CREDIT_NOTE'
          ? `${tr('خصم/تسوية على الفاتورة', 'Discount/allowance on invoice')} #${inv.invoiceNumber}`
          : `${tr('خصم مكتسب على فاتورة المشتريات', 'Earned discount on purchase invoice')} #${inv.invoiceNumber}`
      );
    }
  };

  const createNotice = async () => {
    if (!selectedPartyId) {
      alert(tr('اختر العميل/المورد أولاً.', 'Select the customer/supplier first.'));
      return;
    }
    if (linkedInvoice && linkedInvoice.customerId !== selectedPartyId) {
      alert(tr('الفاتورة المختارة لا تخص الطرف المحدد.', 'Selected invoice does not belong to the selected party.'));
      return;
    }
    const amount = normalizeNumber(noticeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert(tr('أدخل مبلغًا صحيحًا للإشعار.', 'Enter a valid notice amount.'));
      return;
    }
    const remaining = linkedInvoice ? getInvoiceRemainingBase(linkedInvoice, invoiceSettlements) : 0;
    if (linkedInvoice && amount - remaining > 0.005) {
      alert(tr('مبلغ الإشعار أكبر من المتبقي على الفاتورة المرتبطة.', 'Notice amount exceeds linked invoice remaining balance.'));
      return;
    }

    const getNextNoticeNumber = (pref: string) => {
      const currentYear = String(new Date().getFullYear()).slice(-2);
      const yearPrefix = `${pref}-${currentYear}-`;

      const noticeNumbers = new Set<string>();
      invoices.forEach(inv => {
        if (inv.invoiceNumber && inv.invoiceNumber.startsWith(yearPrefix)) {
          noticeNumbers.add(inv.invoiceNumber);
        }
      });

      let maxNum = 0;
      noticeNumbers.forEach(numStr => {
        const numPart = numStr.slice(yearPrefix.length);
        const num = parseInt(numPart, 10);
        if (!isNaN(num)) {
          maxNum = Math.max(maxNum, num);
        }
      });

      const nextNum = maxNum === 0 ? 1 : maxNum + 1;
      const paddedNum = String(nextNum).padStart(6, '0');
      return `${yearPrefix}${paddedNum}`;
    };

    const isCredit = activeKind === 'CREDIT_NOTE';
    const prefix = isCredit ? 'CN' : 'DN';
    const invoiceNumber = getNextNoticeNumber(prefix);
    const currency = linkedInvoice?.currency || baseCurrency || 'ILS';
    const exchangeRate = linkedInvoice ? Math.max(0.0001, Number(linkedInvoice.exchangeRate) || 1) : 1;
    const noteText = noticeNotes.trim() || (isCredit ? tr('إشعار دائن', 'Credit note') : tr('إشعار مدين', 'Debit note'));

    setSubmitting(true);
    try {
      const result = await createInvoice({
        invoiceNumber,
        customerId: selectedPartyId,
        linkedInvoiceId: linkedInvoice?.id,
        type: TransactionType.EXPENSE,
        category: isCredit ? 'customer_credit_note' : 'supplier_debit_note',
        date: noticeDate,
        dueDate: noticeDate,
        items: [{
          id: `note_line_${Math.random().toString(36).slice(2, 8)}`,
          description: noteText,
          quantity: 1,
          unitPrice: amount,
          total: amount
        }],
        subTotal: amount,
        taxRate: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: amount,
        status: 'PAID',
        postingStatus: 'POSTED',
        paymentType: 'CREDIT',
        notes: noteText,
        currency,
        exchangeRate
      });

      if (!result.ok) {
        alert(result.message);
        return;
      }

      alert(
        linkedInvoice
          ? tr('تم ترحيل الإشعار وربطه بالفاتورة بنجاح.', 'Notice posted and linked to invoice successfully.')
          : tr('تم ترحيل الإشعار بنجاح.', 'Notice posted successfully.')
      );
      setShowForm(false);
      resetForm(activeKind);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNotice = (inv: Invoice) => {
    if (!confirm(tr('هل تريد حذف هذا الإشعار؟', 'Delete this notice?'))) return;
    const res = deleteInvoice(inv.id);
    if (!res.ok) {
      alert(res.message);
      return;
    }
  };

  const handlePrintNotice = (inv: Invoice) => {
    const linked = inv.linkedInvoiceId ? invoices.find(i => i.id === inv.linkedInvoiceId) : undefined;
    const contact = contacts.find(c => c.id === inv.customerId);
    const title = inv.category === 'customer_credit_note'
      ? tr('إشعار دائن', 'Credit Note')
      : tr('إشعار مدين', 'Debit Note');
    const html = `
<!doctype html>
<html dir="${isEnglish ? 'ltr' : 'rtl'}" lang="${isEnglish ? 'en' : 'ar'}">
<head>
  <meta charset="utf-8" />
  <title>${title} - ${inv.invoiceNumber}</title>
  <style>
    body{font-family:${isEnglish ? "'Segoe UI',Arial,sans-serif" : "'Tajawal',sans-serif"};padding:24px;color:#0f172a}
    .card{border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:16px}
    .row{display:flex;justify-content:space-between;gap:12px;margin:6px 0}
    .muted{color:#64748b;font-size:12px;font-weight:700}
    .v{font-weight:800}
  </style>
</head>
<body>
  <h2>${title}</h2>
  <div class="card">
    <div class="row"><span class="muted">${tr('رقم الإشعار', 'Notice No')}</span><span class="v">${inv.invoiceNumber}</span></div>
    <div class="row"><span class="muted">${tr('التاريخ', 'Date')}</span><span class="v">${inv.date}</span></div>
    <div class="row"><span class="muted">${tr('الطرف', 'Party')}</span><span class="v">${contact ? displayContactName(contact) : '-'}</span></div>
    <div class="row"><span class="muted">${tr('المبلغ', 'Amount')}</span><span class="v">${Number(inv.totalAmount).toLocaleString('en-US')} ${inv.currency}</span></div>
    <div class="row"><span class="muted">${tr('الحالة', 'Status')}</span><span class="v">${inv.postingStatus || 'POSTED'} / ${inv.status}</span></div>
    <div class="row"><span class="muted">${tr('الفاتورة المرتبطة', 'Linked Invoice (Optional)')}</span><span class="v">${linked ? linked.invoiceNumber : '-'}</span></div>
  </div>
  <div class="card">
    <div class="muted">${tr('البيان', 'Description')}</div>
    <div class="v">${inv.notes || inv.items?.[0]?.description || '-'}</div>
  </div>
  <script>window.focus(); window.print();</script>
</body>
</html>`;
    printHtmlContent(html);
  };

  const getNoticeTypeLabel = (inv: Invoice) =>
    inv.category === 'customer_credit_note'
      ? tr('إشعار دائن (خصم على العميل)', 'Credit Note (Customer Discount)')
      : tr('إشعار مدين (خصم مكتسب)', 'Debit Note (Earned Discount)');

  const formatAmount = (n: number, currency?: string) =>
    `${Number(n || 0).toLocaleString(isEnglish ? 'en-US' : 'ar-EG-u-nu-latn')} ${currency || ''}`.trim();

  return (
    <div className="app-page animate-in fade-in duration-300 p-3 md:p-5 space-y-3 md:space-y-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-3.5 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              {tr('الإشعارات', 'Adjustment Notices')}
            </h1>
            <p className="text-xs font-bold text-gray-400 mt-1">
              {tr('إدارة الإشعار الدائن والإشعار المدين وربطهما بالفواتير لتسويات الخصومات بشكل محاسبي صحيح.', 'Manage credit/debit notices and link them to invoices for proper accounting adjustments.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCreate('CREDIT_NOTE')}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {tr('إشعار دائن', 'Credit Note')}
            </button>
            <button
              type="button"
              onClick={() => openCreate('DEBIT_NOTE')}
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {tr('إشعار مدين', 'Debit Note')}
            </button>
          </div>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2.5 px-1 md:grid md:min-w-0 md:grid-cols-6">
          <div className="min-w-[9rem] rounded-2xl border border-gray-100 bg-white p-2.5 md:min-w-0"><div className="text-[10px] text-gray-400 font-black">{tr('إجمالي الإشعارات', 'Total Notices')}</div><div className="text-lg font-black">{summary.total}</div></div>
          <div className="min-w-[9rem] rounded-2xl border border-gray-100 bg-white p-2.5 md:min-w-0"><div className="text-[10px] text-gray-400 font-black">{tr('إشعارات دائنة', 'Credit Notes')}</div><div className="text-lg font-black text-emerald-600">{summary.creditCount}</div></div>
          <div className="min-w-[9rem] rounded-2xl border border-gray-100 bg-white p-2.5 md:min-w-0"><div className="text-[10px] text-gray-400 font-black">{tr('إشعارات مدينة', 'Debit Notes')}</div><div className="text-lg font-black text-indigo-600">{summary.debitCount}</div></div>
          <div className="min-w-[9rem] rounded-2xl border border-gray-100 bg-white p-2.5 md:min-w-0"><div className="text-[10px] text-gray-400 font-black">{tr('مرحّل', 'Posted')}</div><div className="text-lg font-black text-blue-600">{summary.posted}</div></div>
          <div className="min-w-[9.5rem] rounded-2xl border border-gray-100 bg-white p-2.5 md:min-w-0"><div className="text-[10px] text-gray-400 font-black">{tr('قيمة الدائن', 'Credit Amount')}</div><div className="text-sm font-black text-emerald-600 whitespace-nowrap">{formatAmount(summary.creditAmount)}</div></div>
          <div className="min-w-[9.5rem] rounded-2xl border border-gray-100 bg-white p-2.5 md:min-w-0"><div className="text-[10px] text-gray-400 font-black">{tr('قيمة المدين', 'Debit Amount')}</div><div className="text-sm font-black text-indigo-600 whitespace-nowrap">{formatAmount(summary.debitAmount)}</div></div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-3.5 md:p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              setViewKind('ALL');
              setPartyFilterId('ALL');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black border ${viewKind === 'ALL' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {tr('كل السندات', 'All Notices')}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewKind('CREDIT_NOTE');
              setPartyFilterId('ALL');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black border ${viewKind === 'CREDIT_NOTE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {tr('عرض الدائن', 'Credit View')}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewKind('DEBIT_NOTE');
              setPartyFilterId('ALL');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black border ${viewKind === 'DEBIT_NOTE' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {tr('عرض المدين', 'Debit View')}
          </button>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={tr('بحث برقم الإشعار أو البيان أو الطرف...', 'Search by notice no, description, or party...')}
            className="col-span-3 w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-bold outline-none"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'POSTED')}
            className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
          >
            <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
            <option value="POSTED">{tr('مرحّل فقط', 'Posted only')}</option>
          </select>
          <select
            value={partyFilterId}
            onChange={(e) => setPartyFilterId(e.target.value)}
            className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
          >
            <option value="ALL">{tr('كل الأطراف', 'All parties')}</option>
            {noticeParties.map(p => (
              <option key={p.id} value={p.id}>{displayContactName(p)}</option>
            ))}
          </select>
          <EnglishDateInput
            value={fromDateFilter}
            onChange={setFromDateFilter}
            className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
            wrapperClassName="w-full"
            displayFormat="DMY"
            placeholder={tr('من تاريخ', 'From date')}
          />
          <EnglishDateInput
            value={toDateFilter}
            onChange={setToDateFilter}
            className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
            wrapperClassName="w-full"
            displayFormat="DMY"
            placeholder={tr('إلى تاريخ', 'To date')}
          />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] font-black text-gray-500">
            {tr('نتائج الفلترة', 'Filtered results')}: <span className="text-slate-800">{notices.length}</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-xs font-black"
            >
              {tr('مسح الفلاتر', 'Clear filters')}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {notices.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
              <BadgePercent className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-black text-sm">{tr('لا توجد إشعارات حتى الآن', 'No notices yet')}</p>
            </div>
          )}

          {notices.map(inv => {
            const linked = inv.linkedInvoiceId ? invoices.find(i => i.id === inv.linkedInvoiceId) : undefined;
            const contact = contacts.find(c => c.id === inv.customerId);
            const remainingAfter = linked ? getInvoiceRemainingBase(linked, invoiceSettlements) : undefined;
            return (
              <div key={inv.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${inv.category === 'customer_credit_note' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                        {getNoticeTypeLabel(inv)}
                      </span>
                      <span className="px-2 py-1 rounded-lg text-[10px] font-black border bg-blue-50 text-blue-700 border-blue-200">
                        {tr('مرحّل', 'Posted')}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-800">{inv.invoiceNumber}</h3>
                    <div className="text-[11px] text-gray-500 font-bold mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{inv.date}</span>
                      <span
                        className={`inline-flex items-center gap-1 ${contact ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                        onDoubleClick={() => openContactStatement(inv.customerId)}
                        title={contact ? tr('اضغط مرتين لفتح كشف الطرف', 'Double-click to open contact statement') : undefined}
                      >
                        <User className="w-3.5 h-3.5" />
                        {contact ? displayContactName(contact) : tr('غير محدد', 'N/A')}
                      </span>
                      {linked && <span className="inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />{tr('فاتورة', 'Invoice')}: {linked.invoiceNumber}</span>}
                    </div>
                    {inv.notes && <p className="text-xs text-slate-600 font-bold mt-2">{inv.notes}</p>}
                  </div>
                  <div className="text-left shrink-0">
                    <div className={`text-lg font-black ${inv.category === 'customer_credit_note' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                      {formatAmount(inv.totalAmount, inv.currency)}
                    </div>
                    {linked && (
                      <div className="text-[10px] font-black text-gray-400 mt-1">
                        {tr('متبقي الفاتورة الآن', 'Invoice remaining now')}: {formatAmount(remainingAfter || 0, linked.currency)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handlePrintNotice(inv)}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-black flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    {tr('طباعة', 'Print')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotice(inv)}
                    className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {tr('حذف', 'Delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl border border-gray-100 shadow-2xl max-h-[92dvh] overflow-y-auto p-4 md:p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  {activeKind === 'CREDIT_NOTE' ? tr('إشعار دائن (خصم على العميل)', 'Credit Note (Customer Discount)') : tr('إشعار مدين (خصم مكتسب)', 'Debit Note (Earned Discount)')}
                </h3>
                <p className="text-[11px] font-bold text-gray-400 mt-1">
                  {tr('يرتبط بفواتير آجلة ويُرحّل كتسوية تخفّض المتبقي على الفاتورة المرتبطة.', 'Links to credit invoices and posts as settlement reducing the linked invoice balance.')}
                </p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-rose-50 hover:text-rose-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl border border-gray-100 p-3 bg-gray-50/70 mb-4">
              <label className="text-[10px] font-black text-gray-500 block mb-2">
                {activeKind === 'CREDIT_NOTE' ? tr('العميل', 'Customer') : tr('المورد', 'Supplier')}
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => {
                  setSelectedPartyId(e.target.value);
                  setLinkedInvoiceId('');
                  setNoticeAmount('');
                }}
                className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm font-bold outline-none"
              >
                <option value="">
                  {activeKind === 'CREDIT_NOTE'
                    ? tr('اختر العميل...', 'Select customer...')
                    : tr('اختر المورد...', 'Select supplier...')}
                </option>
                {eligibleParties.map(party => (
                  <option key={party.id} value={party.id}>
                    {displayContactName(party)}
                  </option>
                ))}
              </select>
              <div className="text-[10px] font-black text-gray-400 mt-2">
                {tr('لن تظهر إلا الفواتير المفتوحة الخاصة بالطرف المحدد.', 'Only open invoices for the selected party will be shown.')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-2xl border border-gray-100 p-3 bg-gray-50/70">
                <label className="text-[10px] font-black text-gray-500 block mb-2">{tr('الفاتورة المرتبطة', 'Linked Invoice (Optional)')}</label>
                <select
                  value={linkedInvoiceId}
                  onChange={(e) => handleSelectLinkedInvoice(e.target.value)}
                  disabled={!selectedPartyId}
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm font-bold outline-none"
                >
                  <option value="">{tr('اختر الفاتورة...', 'Select invoice...')}</option>
                  {eligibleInvoices.map(inv => {
                    const contact = contacts.find(c => c.id === inv.customerId);
                    const remaining = getInvoiceRemainingBase(inv, invoiceSettlements);
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} - {contact ? displayContactName(contact) : '-'} - {remaining.toFixed(2)} {inv.currency}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="rounded-2xl border border-gray-100 p-3 bg-gray-50/70">
                <label className="text-[10px] font-black text-gray-500 block mb-2">{tr('تاريخ الإشعار', 'Notice Date')}</label>
                <EnglishDateInput
                  value={noticeDate}
                  onChange={setNoticeDate}
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm font-bold outline-none"
                  wrapperClassName="w-full"
                />
              </div>
            </div>

            {linkedInvoice && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-gray-400 font-black">{tr('الطرف', 'Party')}</span><div className="font-black">{displayContactName(contacts.find(c => c.id === linkedInvoice.customerId) || null)}</div></div>
                  <div><span className="text-gray-400 font-black">{tr('إجمالي الفاتورة', 'Invoice Total')}</span><div className="font-black">{formatAmount(linkedInvoice.totalAmount, linkedInvoice.currency)}</div></div>
                  <div><span className="text-gray-400 font-black">{tr('المتبقي الحالي', 'Current Remaining')}</span><div className="font-black text-amber-700">{formatAmount(linkedInvoiceRemaining, linkedInvoice.currency)}</div></div>
                  <div><span className="text-gray-400 font-black">{tr('العملة', 'Currency')}</span><div className="font-black">{linkedInvoice.currency} / x{linkedInvoice.exchangeRate || 1}</div></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-2xl border border-gray-100 p-3">
                <label className="text-[10px] font-black text-gray-500 block mb-2">{tr('مبلغ الإشعار', 'Notice Amount')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={noticeAmount}
                  onChange={(e) => setNoticeAmount(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white text-center dir-ltr text-lg font-black outline-none"
                  placeholder="0.00"
                />
                {linkedInvoice && (
                  <div className="text-[10px] font-black text-gray-400 mt-2">
                    {tr('المتبقي بعد الإشعار (تقديري)', 'Remaining after notice (estimated)')}: {formatAmount(Math.max(0, linkedInvoiceRemaining - (normalizeNumber(noticeAmount) || 0)), linkedInvoice.currency)}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-gray-100 p-3">
                <label className="text-[10px] font-black text-gray-500 block mb-2">{tr('البيان / سبب الإشعار', 'Description / Reason')}</label>
                <textarea
                  rows={4}
                  value={noticeNotes}
                  onChange={(e) => setNoticeNotes(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm font-bold outline-none resize-none"
                  placeholder={tr('مثال: خصم تسوية على الفاتورة...', 'Example: Settlement discount on invoice...')}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-gray-200 p-3 mb-4 text-[11px] text-gray-500 font-bold">
              {tr(
                'عند الترحيل: يتم إنشاء قيد محاسبي للإشعار وربط تسوية على الفاتورة المرتبطة لتخفيض المتبقي تلقائيًا.',
                'When posted: an accounting entry is created. If a linked invoice is selected, a settlement is also created to reduce its remaining balance automatically.'
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => createNotice()}
                disabled={submitting}
                className={`px-4 py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 ${activeKind === 'CREDIT_NOTE' ? 'bg-emerald-600' : 'bg-indigo-600'} ${submitting ? 'opacity-70' : ''}`}
              >
                {submitting ? <Send className="w-4 h-4 animate-pulse" /> : <CheckCircle2 className="w-4 h-4" />}
                {tr('ترحيل الإشعار', 'Post Notice')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdjustmentNoticesManager;

