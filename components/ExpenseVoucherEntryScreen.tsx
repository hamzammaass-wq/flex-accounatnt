import React, { useMemo, useState } from 'react';
import {
  Plus,
  ReceiptText,
  ArrowRight,
  FileText,
  Search,
  Pencil,
  Wallet,
  Calendar,
  Users,
  TrendingUp,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { getDisplayContactName } from '../utils/displayNames';

interface ExpenseVoucherEntryScreenProps {
  onBack: () => void;
  onCreateNew: () => void;
  onOpenLedger?: () => void;
  onEditInvoice?: (invoiceId: string) => void;
}

const ExpenseVoucherEntryScreen: React.FC<ExpenseVoucherEntryScreenProps> = ({
  onBack,
  onCreateNew,
  onOpenLedger,
  onEditInvoice
}) => {
  const { companySettings, invoices, contacts, baseCurrency } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const [searchTerm, setSearchTerm] = useState('');

  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);

  const formatAmount = (value: number) =>
    Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB');
  };

  const expenseInvoices = useMemo(
    () => invoices
      .filter(inv => inv.category === 'general_expense')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [invoices]
  );

  const summary = useMemo(() => {
    const total = expenseInvoices.length;
    const posted = expenseInvoices.filter(inv => (inv.postingStatus || 'POSTED') === 'POSTED').length;
    const drafts = Math.max(0, total - posted);
    const totalAmount = expenseInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
    const monthKey = new Date().toISOString().slice(0, 7);
    const thisMonth = expenseInvoices.filter(inv => String(inv.date || '').slice(0, 7) === monthKey).length;
    const beneficiaries = new Set(
      expenseInvoices
        .map(inv => inv.customerId)
        .filter((value): value is string => Boolean(value))
    ).size;

    return {
      total,
      posted,
      drafts,
      totalAmount,
      thisMonth,
      beneficiaries,
      latest: expenseInvoices[0] || null
    };
  }, [expenseInvoices]);

  const filteredRecent = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return expenseInvoices
      .filter(inv => {
        if (!query) return true;
        const contact = contacts.find(entry => entry.id === inv.customerId) || null;
        const invoiceNumber = String(inv.invoiceNumber || '').toLowerCase();
        const contactName = displayContactName(contact).toLowerCase();
        const notes = String(inv.notes || '').toLowerCase();
        const total = String(inv.totalAmount || '').toLowerCase();
        return invoiceNumber.includes(query) || contactName.includes(query) || notes.includes(query) || total.includes(query);
      })
      .slice(0, 6);
  }, [contacts, displayContactName, expenseInvoices, searchTerm]);

  const featureCards = [
    {
      icon: <Users className="h-4 w-4" />,
      title: tr('اختيار الطرف', 'Counterparty'),
      description: tr('تحديد المستفيد أو المورد مثل شاشة الفاتورة.', 'Select beneficiary or supplier like the invoice screen.')
    },
    {
      icon: <FileText className="h-4 w-4" />,
      title: tr('ملاحظات وترقيم', 'Notes & Numbering'),
      description: tr('رقم السند والتفاصيل متاحة مباشرة داخل النموذج.', 'Voucher number and notes are ready inside the form.')
    },
    {
      icon: <TrendingUp className="h-4 w-4" />,
      title: tr('إجمالي مباشر', 'Live Totals'),
      description: tr('إجمالي حيّ مع الخصم وطريقة الضريبة عند الحاجة.', 'Live total with discount and tax mode when needed.')
    },
    {
      icon: <ArrowUpRight className="h-4 w-4" />,
      title: tr('مشاركة وطباعة', 'Share & Print'),
      description: tr('مشاركة السند أو طباعته من شاشة الإدخال نفسها.', 'Share or print directly from the entry form.')
    }
  ];

  const quickFacts = [
    {
      icon: <Wallet className="h-4 w-4" />,
      label: tr('العملة الأساسية', 'Base currency'),
      value: baseCurrency
    },
    {
      icon: <Calendar className="h-4 w-4" />,
      label: tr('تاريخ اليوم', 'Today'),
      value: formatDate(new Date().toISOString())
    },
    {
      icon: <Users className="h-4 w-4" />,
      label: tr('المستفيدون', 'Beneficiaries'),
      value: String(summary.beneficiaries)
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: tr('هذا الشهر', 'This month'),
      value: String(summary.thisMonth)
    }
  ];

  return (
    <div className="app-page p-3 md:p-5 space-y-3 md:space-y-4">
      <div className="relative overflow-hidden rounded-[2rem] border border-rose-100 bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(255,241,242,0.92)_48%,rgba(239,246,255,0.9)_100%)] shadow-sm">
        <div className="absolute -top-10 -right-8 h-32 w-32 rounded-full bg-rose-200/30 blur-2xl" />
        <div className="absolute -bottom-10 left-0 h-28 w-28 rounded-full bg-sky-200/30 blur-2xl" />
        <div className="relative p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex rounded-full border border-rose-200 bg-white/80 px-2.5 py-1 text-[10px] font-black text-rose-600">
                {tr('شاشة تشغيل محسّنة', 'Enhanced launcher')}
              </span>
              <h1 className="mt-2 text-2xl font-black text-slate-900">{tr('سند المصروف', 'Expense Voucher')}</h1>
              <p className="mt-1 max-w-[280px] text-xs font-bold leading-5 text-slate-500">
                {tr(
                  'ابدأ السند بسرعة، راقب آخر الحركات، وافتح سجل المصروفات أو عدّل آخر سند مباشرة من نفس الشاشة.',
                  'Start faster, monitor recent activity, and open the expense ledger or edit the latest voucher from one screen.'
                )}
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] border border-rose-100 bg-white/90 text-rose-600 shadow-sm">
              <ReceiptText className="h-7 w-7" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm">
              <div className="text-[10px] font-black text-slate-400">{tr('إجمالي السندات', 'Total vouchers')}</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{summary.total}</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm">
              <div className="text-[10px] font-black text-slate-400">{tr('إجمالي المبالغ', 'Total amount')}</div>
              <div className="mt-1 text-xl font-black tracking-tight text-rose-600 dir-ltr">
                {formatAmount(summary.totalAmount)}
                <span className="ms-1 text-[10px] text-slate-400">{baseCurrency}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm">
              <div className="text-[10px] font-black text-slate-400">{tr('السندات المرحلة', 'Posted vouchers')}</div>
              <div className="mt-1 text-lg font-black text-blue-600">{summary.posted}</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm">
              <div className="text-[10px] font-black text-slate-400">{tr('المسودات', 'Drafts')}</div>
              <div className="mt-1 text-lg font-black text-amber-600">{summary.drafts}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={onCreateNew}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-200/70 transition-transform active:scale-[0.99]"
            >
              <Plus className="h-4 w-4" />
              {tr('إنشاء سند جديد', 'Create New Voucher')}
            </button>
            <button
              type="button"
              onClick={() => summary.latest && onEditInvoice?.(summary.latest.id)}
              disabled={!summary.latest || !onEditInvoice}
              className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black transition-colors ${summary.latest && onEditInvoice ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-100 bg-white/70 text-slate-300 cursor-not-allowed'}`}
            >
              <Pencil className="h-4 w-4" />
              {tr('متابعة آخر سند', 'Continue latest voucher')}
            </button>
            <button
              type="button"
              onClick={onOpenLedger}
              disabled={!onOpenLedger}
              className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black transition-colors ${onOpenLedger ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-100 bg-white/70 text-slate-300 cursor-not-allowed'}`}
            >
              <ArrowUpRight className="h-4 w-4" />
              {tr('فتح سجل المصروفات', 'Open expenses ledger')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {quickFacts.map((fact) => (
          <div key={fact.label} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                {fact.icon}
              </span>
              <span className="text-[10px] font-black">{fact.label}</span>
            </div>
            <div className="mt-2 text-sm font-black text-slate-800 dir-ltr">{fact.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[1.8rem] border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black text-slate-700">{tr('مزايا شاشة الفاتورة داخل السند', 'Invoice-style features in this screen')}</div>
            <p className="mt-1 text-[10px] font-bold leading-5 text-slate-400">
              {tr('نفس راحة شاشة الفواتير لكن مهيأة لسندات المصروف.', 'The same invoice comfort, adapted for expense vouchers.')}
            </p>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-600">
            {tr('جاهزة للاستخدام', 'Ready to use')}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {featureCards.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                {feature.icon}
              </div>
              <div className="mt-2 text-[11px] font-black text-slate-800">{feature.title}</div>
              <div className="mt-1 text-[10px] font-bold leading-5 text-slate-500">{feature.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-gray-100 bg-white p-3 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black text-slate-700">{tr('آخر السندات', 'Recent vouchers')}</div>
            <p className="mt-1 text-[10px] font-bold text-slate-400">
              {tr('استعراض سريع مع إمكانية فتح السند للتعديل.', 'Quick review with direct edit access.')}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">
            {filteredRecent.length}
          </span>
        </div>

        {expenseInvoices.length > 0 && (
          <div className="relative">
            <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-300 ${isEnglish ? 'left-3' : 'right-3'}`} size={15} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={tr('ابحث برقم السند أو المستفيد أو الملاحظات...', 'Search by number, beneficiary, or notes...')}
              className={`w-full rounded-2xl border border-gray-100 bg-slate-50 py-3 text-xs font-black text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50 ${isEnglish ? 'pl-10 pr-3 text-left' : 'pr-10 pl-3 text-right'}`}
            />
          </div>
        )}

        {filteredRecent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center">
            <div className="text-sm font-black text-slate-700">
              {expenseInvoices.length === 0
                ? tr('لا توجد سندات مصروف بعد.', 'No expense vouchers yet.')
                : tr('لا توجد نتائج مطابقة للبحث.', 'No matching vouchers found.')}
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-400">
              {expenseInvoices.length === 0
                ? tr('ابدأ بإنشاء أول سند وسيظهر هنا آخر النشاط مباشرة.', 'Create your first voucher and recent activity will appear here.')
                : tr('جرّب كلمة بحث مختلفة أو افتح سجل المصروفات الكامل.', 'Try a different query or open the full expense ledger.')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRecent.map((inv) => {
              const contact = contacts.find(entry => entry.id === inv.customerId) || null;
              const detailLabel = String(inv.notes || '').trim()
                || String(inv.items?.[0]?.description || '').trim()
                || tr('بدون تفاصيل إضافية', 'No extra details');
              const posted = (inv.postingStatus || 'POSTED') === 'POSTED';

              return (
                <div key={inv.id} className="rounded-2xl border border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.94)_100%)] p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-black text-slate-800">{inv.invoiceNumber}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${posted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {posted ? tr('مرحل', 'Posted') : tr('مسودة', 'Draft')}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <span className="truncate">{contact ? displayContactName(contact) : tr('مصروف عام', 'General expense')}</span>
                        <span className="text-slate-300">•</span>
                        <span className="dir-ltr">{formatDate(inv.date)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="text-sm font-black tracking-tight text-rose-600 dir-ltr">
                        {formatAmount(Number(inv.totalAmount) || 0)}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400">{inv.currency || baseCurrency}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="truncate text-[10px] font-bold text-slate-400">{detailLabel}</div>
                    {onEditInvoice && (
                      <button
                        type="button"
                        onClick={() => onEditInvoice(inv.id)}
                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        {tr('فتح', 'Open')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-xs font-black text-slate-600 shadow-sm"
        >
          <ArrowRight className={`h-4 w-4 ${isEnglish ? 'rotate-180' : ''}`} />
          {tr('رجوع', 'Back')}
        </button>
        <div className="flex min-h-[46px] items-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white px-3 text-[11px] font-bold text-gray-500">
          <FileText className="h-4 w-4 shrink-0 text-gray-400" />
          <span>{tr('بعد الضغط على إنشاء سند جديد سيتم فتح نموذج السند مباشرة مع كل أدوات الإدخال.', 'Click Create New Voucher to open the full entry form with all input tools.')}</span>
        </div>
      </div>
    </div>
  );
};

export default ExpenseVoucherEntryScreen;
