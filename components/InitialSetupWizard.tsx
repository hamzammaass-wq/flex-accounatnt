import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';

interface InitialSetupWizardProps {
  onComplete: () => void;
  onBack?: () => void;
}

const InitialSetupWizard: React.FC<InitialSetupWizardProps> = ({ onComplete, onBack }) => {
  const { currencies, baseCurrency, setBaseCurrency, companySettings, updateCompanySettings } = useAccounting();
  const isArabic = (companySettings.language ?? 'AR') === 'AR';

  const currencyOptions = useMemo(() => {
    const values = new Set<string>(currencies.map(currency => currency.code).filter(Boolean));
    values.add(baseCurrency);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [baseCurrency, currencies]);

  const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency || 'ILS');
  const [showTaxInInvoices, setShowTaxInInvoices] = useState(companySettings.showTaxInInvoices ?? true);
  const [barcodeEnabled, setBarcodeEnabled] = useState(companySettings.barcodeEnabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const saveSettings = () => {
    setSubmitting(true);
    setErrorMessage('');
    setBaseCurrency(selectedCurrency);

    const result = updateCompanySettings({
      ...companySettings,
      showTaxInInvoices,
      barcodeEnabled
    });
    if (!result.ok) {
      setSubmitting(false);
      setErrorMessage(result.message);
      return;
    }

    onComplete();
    setSubmitting(false);
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-800 flex items-start justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h1 className="text-lg font-black">
            {isArabic ? 'معالج الإعداد الأول' : 'Initial Setup Wizard'}
          </h1>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black border border-slate-200 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {isArabic ? 'العودة' : 'Back'}
            </button>
          ) : null}
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-slate-600">
            {isArabic
              ? 'أكمل هذه الخطوات لبداية تشغيل أسرع للتطبيق.'
              : 'Complete these options to start using the app faster.'}
          </p>

          <div className="space-y-2">
            <label className="block text-sm font-black text-slate-700">
              {isArabic ? 'عملة النظام الأساسية' : 'Base currency'}
            </label>
            <select
              value={selectedCurrency}
              onChange={(event) => setSelectedCurrency(event.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
            >
              {currencyOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={showTaxInInvoices}
                onChange={(event) => setShowTaxInInvoices(event.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-slate-700">
                <span className="block font-black">
                  {isArabic ? 'عرض الضريبة في الفواتير' : 'Show tax in invoices'}
                </span>
                <span className="block mt-1 text-slate-500 text-xs">
                  {isArabic ? 'فعّل ظهور ضرائب المبيعات/المشتريات داخل شاشة الفاتورة' : 'Enable tax fields in invoice screens'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={barcodeEnabled}
                onChange={(event) => setBarcodeEnabled(event.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-slate-700">
                <span className="block font-black">
                  {isArabic ? 'تفعيل الباركود في الأصناف' : 'Enable barcode for items'}
                </span>
                <span className="block mt-1 text-slate-500 text-xs">
                  {isArabic ? 'يساعد في الإدخال السريع في شاشة البيع والمشتريات' : 'Enable quicker item input in sales/purchases'}
                </span>
              </span>
            </label>
          </div>

          {errorMessage ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <button
            type="button"
            onClick={saveSettings}
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl transition disabled:opacity-70"
          >
            {submitting
              ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {isArabic ? 'جارِ الحفظ...' : 'Saving...'}
                </span>
              )
              : isArabic ? 'بدء الاستخدام الآن' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={submitting}
            className="w-full border border-slate-200 py-3 rounded-xl font-black text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-70"
          >
            {isArabic ? 'تخطي الآن' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InitialSetupWizard;

