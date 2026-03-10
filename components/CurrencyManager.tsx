
import React, { useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
// Added Star to the imports from lucide-react
import { Trash2, Plus, RefreshCw, DollarSign, Globe, TrendingUp, Info, ArrowRightLeft, X, Star } from 'lucide-react';
import { getDisplayCurrencyName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';

const CurrencyManager: React.FC = () => {
  const { currencies, addCurrency, deleteCurrency, updateCurrencyRate, baseCurrency, setBaseCurrency, companySettings } = useAccounting();
  const [showAddForm, setShowAddForm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayCurrencyName = (currency: { code: string; name: string }) => getDisplayCurrencyName(currency, isEnglish);

  // New Currency State
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newRate, setNewRate] = useState('');

  const normalizeDecimalInput = (value: string) =>
    toEnglishDigits(value).replace(/\u066B/g, '.').replace(/\u066C/g, ',').replace(/\u060C/g, ',').replace(/,/g, '');
  const parseDecimalInput = (value: string): number => Number(normalizeDecimalInput(value) || 0);

  const handleAdd = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newCode || !newName || !newRate) return;

      addCurrency({
          code: newCode.toUpperCase(),
          name: newName,
          symbol: newSymbol || newCode,
          rate: parseFloat(normalizeDecimalInput(newRate))
      });

      setNewCode('');
      setNewName('');
      setNewSymbol('');
      setNewRate('');
      setShowAddForm(false);
  };

  const handleFetchRates = () => {
      setIsUpdating(true);
      // Simulate real API fetching
      setTimeout(() => {
          currencies.forEach(c => {
              if (c.code !== baseCurrency) {
                  const fluctuation = (Math.random() - 0.5) * 0.05;
                  const newRate = Math.max(0.1, c.rate + fluctuation);
                  updateCurrencyRate(c.code, parseFloat(newRate.toFixed(4)));
              }
          });
          setIsUpdating(false);
      }, 1200);
  };

  const handleSetBase = (code: string) => {
      if (window.confirm(tr(`هل أنت متأكد من تغيير العملة الأساسية إلى ${code}؟ سيتم اعتبار سعر صرفها 1.00.`, `Are you sure you want to set ${code} as the base currency? Its rate will become 1.00.`))) {
          // Update the rate of the new base to 1.0 before setting it
          updateCurrencyRate(code, 1);
          setBaseCurrency(code);
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 font-tajawal">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12">
                <Globe size={140} />
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4 opacity-80">
                    <Info size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{tr('إعدادات النظام المالي', 'Financial System Settings')}</span>
                </div>
                <h3 className="text-lg font-bold mb-1">{tr('العملة الأساسية للنظام', 'System Base Currency')}</h3>
                <div className="flex items-baseline gap-2">
                    <h2 className="text-4xl font-black tracking-tighter">{baseCurrency}</h2>
                    <span className="text-sm font-bold opacity-60">
                        {displayCurrencyName(currencies.find(c => c.code === baseCurrency) || { code: baseCurrency, name: baseCurrency })}
                    </span>
                </div>
                <p className="text-[10px] mt-4 opacity-70 font-medium leading-relaxed">
                    {tr('يتم تسجيل كافة القيود في الأستاذ العام بهذه العملة. العملات الأجنبية يتم تحويلها آلياً بناءً على سعر الصرف المدخل.', 'All general ledger entries are recorded in this currency. Foreign currencies are converted automatically using their exchange rates.')}
                </p>
            </div>
        </div>

        <div className="flex gap-3">
             <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex-1 py-4 bg-white border border-gray-100 rounded-2xl text-gray-600 font-black text-xs shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
            >
                <Plus className="w-5 h-5 text-blue-500" />
                {tr('إضافة عملة', 'Add Currency')}
            </button>
            <button 
                onClick={handleFetchRates}
                disabled={isUpdating}
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-emerald-100 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
                <RefreshCw className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
                {isUpdating ? tr('جاري التحديث...', 'Updating...') : tr('تحديث آلي للأسعار', 'Auto Update Rates')}
            </button>
        </div>

        {showAddForm && (
             <form onSubmit={handleAdd} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl animate-in zoom-in-95 space-y-4">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="font-black text-gray-800 text-sm">{tr('بيانات العملة الجديدة', 'New Currency Data')}</h4>
                    <button type="button" onClick={() => setShowAddForm(false)} className="text-gray-400"><X size={20} /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('كود العملة', 'Currency Code')}</label>
                         <input type="text" placeholder={tr('مثال: ILS', 'Example: ILS')} value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none uppercase dir-ltr" />
                     </div>
                     <div className="space-y-1">
                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('اسم العملة', 'Currency Name')}</label>
                         <input type="text" placeholder={tr('مثال: شيكل', 'Example: Shekel')} value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none" />
                     </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('الرمز', 'Symbol')}</label>
                         <input type="text" placeholder={tr('مثال: ₪', 'Example: ₪')} value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none text-center" />
                     </div>
                     <div className="space-y-1">
                         <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest px-1">{tr('سعر الصرف', 'Exchange Rate')} ({tr('مقابل', 'against')} {baseCurrency})</label>
                         <input type="text" inputMode="decimal" lang="en" dir="ltr" step="0.01" value={newRate} onChange={(e) => setNewRate(normalizeDecimalInput(e.target.value))} className="w-full p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm font-black outline-none dir-ltr text-center" />
                     </div>
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl text-xs font-black shadow-lg hover:bg-blue-700 transition-all">
                    {tr('تأكيد وحفظ العملة', 'Confirm and Save Currency')}
                </button>
             </form>
        )}

        <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                <ArrowRightLeft size={12} /> {tr('قائمة العملات المفعلة', 'Active Currencies List')}
            </h4>
            {currencies.map(currency => {
                const isBase = currency.code === baseCurrency;
                return (
                    <div key={currency.code} className={`bg-white p-5 rounded-[2rem] border shadow-sm flex flex-col gap-4 group transition-all hover:shadow-md ${isBase ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-50'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${isBase ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'}`}>
                                    {currency.symbol}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-black text-gray-800 text-base">{displayCurrencyName(currency)}</h4>
                                        {isBase && <span className="text-[8px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{tr('أساسية', 'Base')}</span>}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 dir-ltr text-right">{currency.code}</div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                {!isBase ? (
                                    <div className="text-left space-y-1">
                                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest block">{tr('سعر الصرف', 'Exchange Rate')}</span>
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-gray-100">
                                            <TrendingUp size={12} className="text-emerald-500" />
                                            <input 
                                                type="text"
                                                inputMode="decimal"
                                                lang="en"
                                                dir="ltr"
                                                value={String(currency.rate)}
                                                onChange={(e) => updateCurrencyRate(currency.code, parseDecimalInput(e.target.value))}
                                                className="w-16 bg-transparent text-xs font-black outline-none text-center dir-ltr text-gray-700"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-left">
                                        <span className="text-[9px] font-black text-blue-300 uppercase tracking-widest block">{tr('ثابتة', 'Fixed')}</span>
                                        <span className="text-sm font-black text-blue-600 dir-ltr">1.0000</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!isBase && (
                            <div className="flex gap-2 pt-2 border-t border-gray-50">
                                <button 
                                    onClick={() => handleSetBase(currency.code)}
                                    className="flex-1 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-2"
                                >
                                    <Star size={14} />
                                    {tr('تعيين كعملة أساسية', 'Set as Base Currency')}
                                </button>
                                <button 
                                    onClick={() => deleteCurrency(currency.code)}
                                    className="p-2.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    </div>
  );
};

export default CurrencyManager;
