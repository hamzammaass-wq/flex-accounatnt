import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import EnglishDateInput from './EnglishDateInput';
import { 
    Calculator, Settings2, Percent, Globe, CheckCircle, 
    Building2, Coins, ArrowRight, ArrowRightLeft, PackageCheck, Info
} from 'lucide-react';
import { TransactionType } from '../types';
import { getDisplayAccountName, getDisplayProductName } from '../utils/displayNames';

interface SettlementManagerProps {
    onBack?: () => void;
}

const SettlementManager: React.FC<SettlementManagerProps> = ({ onBack }) => {
    const { 
        fixedAssets, accounts, addTransaction, baseCurrency, companySettings,
        invoices, transactions, currencies, products, updateProduct 
    } = useAccounting();
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayAccountName = (account?: { id: string; name: string; code?: string } | null) =>
        getDisplayAccountName(account || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) =>
        getDisplayProductName(product || undefined, isEnglish);
    
    const [activeTab, setActiveTab] = useState<'INVENTORY' | 'DEPRECIATION' | 'TAX' | 'CURRENCY'>('DEPRECIATION');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [taxStart, setTaxStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [taxEnd, setTaxEnd] = useState(new Date().toISOString().split('T')[0]);

    // Account Selections
    const [depreciationExpAcc, setDepreciationExpAcc] = useState('acc_depreciation_exp');
    const [accumulatedDepAcc, setAccumulatedDepAcc] = useState('acc_accumulated_depreciation');
    const [vatOutputAcc, setVatOutputAcc] = useState('acc_vat_output');
    const [vatInputAcc, setVatInputAcc] = useState('acc_vat_input');
    const [vatPayableAcc, setVatPayableAcc] = useState('acc_vat_payable');
    const [exchangeDiffAcc, setExchangeDiffAcc] = useState('acc_exchange_diff');

    // Inventory Settlement State
    const [invProductId, setInvProductId] = useState('');
    const [actualQty, setActualQty] = useState('');
    const [invAdjAcc, setInvAdjAcc] = useState('acc_cogs'); // Usually adjusted against COGS or Inventory Loss/Gain

    // --- Depreciation Logic ---
    const depreciationData = useMemo(() => {
        return fixedAssets.filter(a => a.status === 'ACTIVE').map(asset => {
            if (!asset.lifeInYears || asset.lifeInYears === 0) return { ...asset, monthlyDep: 0 };
            const monthlyDep = (asset.cost - asset.salvageValue) / (asset.lifeInYears * 12);
            return { ...asset, monthlyDep };
        });
    }, [fixedAssets]);

    const totalMonthlyDepreciation = depreciationData.reduce((sum, a) => sum + a.monthlyDep, 0);

    const postDepreciation = () => {
        if (totalMonthlyDepreciation <= 0) return alert(tr('لا يوجد إهلاك للحساب', 'No depreciation amount to post'));
        if (confirm(`${tr('ترحيل قيد إهلاك بقيمة', 'Post depreciation entry amount')} ${totalMonthlyDepreciation.toLocaleString()}?`)) {
            const monthNumber = new Date(date).getMonth() + 1;
            const result = addTransaction({
                amount: totalMonthlyDepreciation,
                description: tr(
                    `تسوية إهلاك الأصول الثابتة - شهر ${monthNumber}`,
                    `Fixed assets depreciation settlement - month ${monthNumber}`
                ),
                category: 'journal',
                type: TransactionType.EXPENSE,
                date: date,
                debitAccountId: depreciationExpAcc,
                creditAccountId: accumulatedDepAcc,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED'
            });
            if (!result.ok) {
                alert(result.message);
                return;
            }
            alert(tr('تم ترحيل قيد الإهلاك بنجاح', 'Depreciation entry posted successfully'));
        }
    };

    // --- Tax Logic ---
    const taxData = useMemo(() => {
        const start = new Date(taxStart);
        start.setHours(0, 0, 0, 0);
        const end = new Date(taxEnd);
        end.setHours(23, 59, 59, 999);

        const inPeriodPostedInvoices = invoices.filter(i =>
            i.postingStatus === 'POSTED' &&
            new Date(i.date) >= start &&
            new Date(i.date) <= end
        );

        const salesInvoiceCount = inPeriodPostedInvoices.filter(i => i.type === TransactionType.INCOME && i.category !== 'sales_return').length;
        const salesReturnCount = inPeriodPostedInvoices.filter(i => i.category === 'sales_return').length;
        const purchaseInvoiceCount = inPeriodPostedInvoices.filter(i => i.type === TransactionType.EXPENSE && i.category !== 'purchase_return').length;
        const purchaseReturnCount = inPeriodPostedInvoices.filter(i => i.category === 'purchase_return').length;

        const salesTax = inPeriodPostedInvoices.reduce((sum, inv) => {
            const taxBase = (Number(inv.taxAmount) || 0) * (Number(inv.exchangeRate) || 1);
            if (inv.category === 'sales_return') return sum - taxBase;
            if (inv.type === TransactionType.INCOME) return sum + taxBase;
            return sum;
        }, 0);

        const purchaseTax = inPeriodPostedInvoices.reduce((sum, inv) => {
            const taxBase = (Number(inv.taxAmount) || 0) * (Number(inv.exchangeRate) || 1);
            if (inv.category === 'purchase_return') return sum - taxBase;
            if (inv.type === TransactionType.EXPENSE) return sum + taxBase;
            return sum;
        }, 0);

        const vatSourceCategories = new Set(['sales_invoice', 'purchase_invoice', 'sales_return', 'purchase_return']);
        const vatEntries = transactions.filter(tx =>
            tx.status === 'POSTED' &&
            vatSourceCategories.has(tx.category) &&
            new Date(tx.date) >= start &&
            new Date(tx.date) <= end
        );

        const vatOutputPosted = vatEntries.reduce((sum, tx) => {
            const amountBase = (Number(tx.amount) || 0) * (Number(tx.exchangeRate) || 1);
            let delta = 0;
            if (tx.creditAccountId === vatOutputAcc) delta += amountBase;
            if (tx.debitAccountId === vatOutputAcc) delta -= amountBase;
            return sum + delta;
        }, 0);

        const vatInputPosted = vatEntries.reduce((sum, tx) => {
            const amountBase = (Number(tx.amount) || 0) * (Number(tx.exchangeRate) || 1);
            let delta = 0;
            if (tx.debitAccountId === vatInputAcc) delta += amountBase;
            if (tx.creditAccountId === vatInputAcc) delta -= amountBase;
            return sum + delta;
        }, 0);

        const settlementEntries = transactions.filter(tx => {
            const inDateRange = tx.status === 'POSTED' && new Date(tx.date) >= start && new Date(tx.date) <= end;
            const referencesVatAccount = [vatOutputAcc, vatInputAcc, vatPayableAcc].includes(tx.debitAccountId || '')
                || [vatOutputAcc, vatInputAcc, vatPayableAcc].includes(tx.creditAccountId || '');
            return inDateRange && tx.category === 'settlement' && referencesVatAccount;
        });

        const netTax = salesTax - purchaseTax;
        const ledgerNet = vatOutputPosted - vatInputPosted;
        const outputDiff = salesTax - vatOutputPosted;
        const inputDiff = purchaseTax - vatInputPosted;
        const netDiff = netTax - ledgerNet;

        return {
            salesTax,
            purchaseTax,
            netTax,
            ledgerNet,
            vatOutputPosted,
            vatInputPosted,
            outputDiff,
            inputDiff,
            netDiff,
            salesInvoiceCount,
            salesReturnCount,
            purchaseInvoiceCount,
            purchaseReturnCount,
            settlementCount: settlementEntries.length
        };
    }, [invoices, transactions, taxStart, taxEnd, vatOutputAcc, vatInputAcc, vatPayableAcc]);

    const postTaxSettlement = () => {
        if (taxData.salesTax === 0 && taxData.purchaseTax === 0) return alert(tr('لا توجد مبالغ ضريبية للتسوية', 'No tax amounts available for settlement'));
        
        const desc = tr(
            `تسوية ضريبة القيمة المضافة (${taxStart} - ${taxEnd})`,
            `VAT settlement (${taxStart} - ${taxEnd})`
        );
        
        // 1. Close VAT output into the VAT payable account
        if (taxData.salesTax > 0) {
            const result = addTransaction({
                amount: taxData.salesTax,
                description: `${desc} - ${tr('إقفال ضريبة المبيعات', 'Sales tax closing')}`,
                category: 'settlement',
                type: TransactionType.TRANSFER,
                date: taxEnd,
                debitAccountId: vatOutputAcc,
                creditAccountId: vatPayableAcc,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED'
            });
            if (!result.ok) {
                alert(result.message);
                return;
            }
        }

        // 2. Close VAT input against the VAT payable account
        if (taxData.purchaseTax > 0) {
            const result = addTransaction({
                amount: taxData.purchaseTax,
                description: `${desc} - ${tr('إقفال ضريبة المشتريات', 'Purchase tax closing')}`,
                category: 'settlement',
                type: TransactionType.TRANSFER,
                date: taxEnd,
                debitAccountId: vatPayableAcc,
                creditAccountId: vatInputAcc,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED'
            });
            if (!result.ok) {
                alert(result.message);
                return;
            }
        }

        alert(tr('تم ترحيل قيود تسوية الضريبة. الرصيد الصافي موجود الآن في حساب ضريبة القيمة المضافة.', 'Tax settlement entries posted. Net balance is now in the VAT account.'));
    };

    // --- Currency Logic ---
    const currencyData = useMemo(() => {
        const foreignAccounts = accounts.filter(a => a.currency && a.currency !== baseCurrency);
        return foreignAccounts.map(acc => {
            const bookBalance = transactions.reduce((sum, t) => {
                if (t.status === 'DRAFT') return sum;
                let change = 0;
                const baseAmount = t.amount * (t.exchangeRate || 1);
                if (t.debitAccountId === acc.id) change += baseAmount;
                if (t.creditAccountId === acc.id) change -= baseAmount;
                return sum + change;
            }, 0);

            const foreignBalance = transactions.reduce((sum, t) => {
                if (t.status === 'DRAFT') return sum;
                let change = 0;
                if (t.debitAccountId === acc.id) change += t.amount;
                if (t.creditAccountId === acc.id) change -= t.amount;
                return sum + change;
            }, 0);

            const currentRate = currencies.find(c => c.code === acc.currency)?.rate || 1;
            const revaluedBalance = foreignBalance * currentRate;
            const diff = revaluedBalance - bookBalance;

            return { acc, bookBalance, foreignBalance, currentRate, revaluedBalance, diff };
        });
    }, [accounts, transactions, currencies, baseCurrency]);

    const postCurrencyRevaluation = () => {
        let count = 0;
        for (const item of currencyData) {
            if (Math.abs(item.diff) > 0.01) {
                const isGain = item.diff > 0;
                
                const result = addTransaction({
                    amount: Math.abs(item.diff), 
                    description: `${tr('تسوية فروقات عملة', 'Currency revaluation settlement')} - ${displayAccountName(item.acc)} (${item.acc.currency})`,
                    category: 'journal',
                    type: isGain ? TransactionType.INCOME : TransactionType.EXPENSE,
                    date: date,
                    debitAccountId: isGain ? item.acc.id : exchangeDiffAcc,
                    creditAccountId: isGain ? exchangeDiffAcc : item.acc.id,
                    currency: baseCurrency, 
                    exchangeRate: 1,
                    status: 'POSTED'
                });
                if (!result.ok) {
                    alert(result.message);
                    return;
                }
                count++;
            }
        }
        if (count > 0) alert(`${tr('تم ترحيل', 'Posted')} ${count} ${tr('قيود تسوية فروقات عملة.', 'currency difference settlement entries.')}`);
        else alert(tr('لا توجد فروقات جوهرية للتسوية.', 'No material differences to settle.'));
    };

    // --- Inventory Adjustment Logic ---
    const handleInventoryAdjustment = () => {
        if (!invProductId || actualQty === '') return alert(tr('يرجى اختيار صنف وإدخال الكمية الفعلية', 'Please select item and enter actual quantity'));
        
        const product = products.find(p => p.id === invProductId);
        if (!product) return;

        const actual = parseFloat(actualQty);
        const diff = actual - product.stock;
        
        if (diff === 0) return alert(tr('الكمية الفعلية مطابقة للكمية الدفترية، لا توجد تسوية.', 'Actual quantity matches book quantity. No adjustment needed.'));

        const adjustmentValue = Math.abs(diff) * product.buyPrice;
        const isSurplus = diff > 0;

        if (confirm(`${tr('تسوية مخزون الصنف', 'Inventory adjustment for item')} "${displayProductName(product)}":\n${tr('الفرق', 'Difference')}: ${diff} ${tr('قطعة', 'pcs')}\n${tr('القيمة', 'Amount')}: ${adjustmentValue.toLocaleString()}\n${tr('هل أنت متأكد من الترحيل؟', 'Are you sure you want to post?')}`)) {
            // Post journal entry first to prevent stock drift if posting is blocked.
            const result = addTransaction({
                amount: adjustmentValue,
                description: `${tr('تسوية جرد مخزون', 'Inventory count adjustment')} - ${displayProductName(product)} (${tr('فرق', 'Difference')} ${diff})`,
                category: 'journal',
                type: isSurplus ? TransactionType.INCOME : TransactionType.EXPENSE,
                date: date,
                debitAccountId: isSurplus ? 'acc_inventory' : invAdjAcc,
                creditAccountId: isSurplus ? invAdjAcc : 'acc_inventory',
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED'
            });
            if (!result.ok) {
                alert(result.message);
                return;
            }

            // Update stock only after successful posting.
            updateProduct(product.id, { stock: actual });

            alert(tr('تم تعديل رصيد المخزون وترحيل القيد المحاسبي بنجاح.', 'Inventory balance adjusted and accounting entry posted successfully.'));
            setInvProductId('');
            setActualQty('');
        }
    };

    return (
        <div className={`app-page animate-in fade-in p-3 md:p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
            <header className="mb-3 flex justify-between items-center px-1">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{tr('التسويات والإقفال', 'Settlements & Closing')}</h1>
                    <p className="text-gray-400 text-[10px] font-black mt-1 uppercase tracking-[0.15em]">{tr('العمليات الختامية الدورية', 'Periodic Closing Operations')}</p>
                </div>
                {onBack ? (
                    <button onClick={onBack} className="app-back-btn w-10 h-10 bg-white text-gray-500 rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 flex items-center justify-center">
                        <ArrowRight size={18} />
                    </button>
                ) : (
                    <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl shadow-sm shadow-pink-100/50">
                        <Settings2 size={22} />
                    </div>
                )}
            </header>

            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100/60 backdrop-blur rounded-2xl mb-3 shadow-inner border border-gray-200/20">
                <button onClick={() => setActiveTab('DEPRECIATION')} className={`py-2 px-1 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-0 ${activeTab === 'DEPRECIATION' ? 'bg-white shadow-md text-pink-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Building2 size={13} /> <span className="truncate">{tr('الإهلاك', 'Depreciation')}</span>
                </button>
                <button onClick={() => setActiveTab('INVENTORY')} className={`py-2 px-1 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-0 ${activeTab === 'INVENTORY' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <PackageCheck size={13} /> <span className="truncate">{tr('المخزون', 'Inventory')}</span>
                </button>
                <button onClick={() => setActiveTab('TAX')} className={`py-2 px-1 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-0 ${activeTab === 'TAX' ? 'bg-white shadow-md text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Percent size={13} /> <span className="truncate">{tr('الضريبة', 'Tax')}</span>
                </button>
                <button onClick={() => setActiveTab('CURRENCY')} className={`py-2 px-1 rounded-xl text-[9px] font-black transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-0 ${activeTab === 'CURRENCY' ? 'bg-white shadow-md text-amber-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Globe size={13} /> <span className="truncate">{tr('العملات', 'Currencies')}</span>
                </button>
            </div>

            {/* Content */}
            {activeTab === 'DEPRECIATION' && (
                <div className="space-y-3 animate-in slide-in-from-bottom-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                            <h3 className="font-black text-gray-800 text-sm">{tr('إهلاك الأصول الثابتة', 'Fixed Assets Depreciation')}</h3>
                            <EnglishDateInput
                                value={date}
                                onChange={setDate}
                                className="bg-gray-50 h-10 px-3 rounded-xl text-xs font-bold outline-none border border-gray-100"
                                aria-label={tr('تاريخ الإهلاك', 'Depreciation date')}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1">{tr('حساب مصروف الإهلاك (مدين)', 'Depreciation Expense Account (Debit)')}</label>
                                <select value={depreciationExpAcc} onChange={e => setDepreciationExpAcc(e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-50">
                                    {accounts.filter(a => a.type === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1">{tr('حساب مجمع الإهلاك (دائن)', 'Accumulated Depreciation Account (Credit)')}</label>
                                <select value={accumulatedDepAcc} onChange={e => setAccumulatedDepAcc(e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-50">
                                    {accounts.filter(a => a.type === 'ASSET' || a.type === 'LIABILITY').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {depreciationData.map(asset => (
                            <div key={asset.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                                <div>
                                    <h4 className="font-black text-xs text-gray-800 mb-1">{asset.name}</h4>
                                <p className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg w-fit">{tr('التكلفة', 'Cost')}: {asset.cost.toLocaleString()}</p>
                                </div>
                                <div className="text-left">
                                    <span className="block font-black text-pink-600 dir-ltr text-sm">{asset.monthlyDep.toFixed(2)}</span>
                                    <span className="text-[9px] font-bold text-gray-400">{tr('قسط شهري', 'Monthly Amount')}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="fixed left-4 right-4 md:left-8 md:right-8 max-w-md md:max-w-xl mx-auto" style={{ bottom: 'calc(var(--app-nav-height) + var(--app-safe-bottom) + 0.5rem)' }}>
                        <button onClick={postDepreciation} className="w-full bg-pink-600 text-white h-11 rounded-xl text-xs font-black shadow-xl shadow-pink-200 hover:bg-pink-700 active:scale-95 transition-all flex justify-center items-center gap-2">
                            <Calculator size={16} />
                            {tr('اعتماد إهلاك بقيمة', 'Post depreciation amount')} {totalMonthlyDepreciation.toLocaleString()}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'INVENTORY' && (
                <div className="space-y-3 animate-in slide-in-from-bottom-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                        <h3 className="font-black text-gray-800 text-sm mb-2">{tr('تسوية فروقات الجرد', 'Inventory Count Adjustment')}</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block">{tr('اختر الصنف', 'Select Item')}</label>
                                <select value={invProductId} onChange={e => setInvProductId(e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-50">
                                    <option value="">{tr('-- اختر الصنف --', '-- Select Item --')}</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{displayProductName(p)} ({tr('المخزون', 'Stock')}: {p.stock})</option>)}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block">{tr('الكمية الفعلية (الجرد)', 'Actual counted quantity')}</label>
                                <input type="number" value={actualQty} onChange={e => setActualQty(e.target.value)} placeholder={tr('أدخل الكمية الموجودة فعلياً', 'Enter actual quantity')} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-sm font-black outline-none border border-gray-50 dir-ltr text-center focus:ring-2 ring-blue-100 transition-all" />
                            </div>

                            {invProductId && (
                                <div className="col-span-2 p-2.5 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center gap-2">
                                    <Info size={14} className="text-blue-500" />
                                    <span className="text-[11px] font-bold text-blue-700">
                                        {tr('الرصيد الدفتري الحالي', 'Current book quantity')}: <span className="font-black">{products.find(p => p.id === invProductId)?.stock}</span>
                                    </span>
                                </div>
                            )}

                            <div className="col-span-2 space-y-1">
                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block">{tr('حساب التسوية (العجز/الزيادة)', 'Adjustment account (shortage/surplus)')}</label>
                                <select value={invAdjAcc} onChange={e => setInvAdjAcc(e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-50">
                                    {accounts.filter(a => a.type === 'EXPENSE' || a.type === 'REVENUE').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <button onClick={handleInventoryAdjustment} className="w-full bg-blue-600 text-white h-11 rounded-xl text-xs font-black shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2">
                        <CheckCircle size={16} />
                        {tr('اعتماد تسوية المخزون', 'Post inventory adjustment')}
                    </button>
                </div>
            )}

            {activeTab === 'TAX' && (
                <div className="space-y-4 animate-in slide-in-from-bottom-4">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <div>
                                <label className="text-[9px] text-gray-400 font-black uppercase mb-1 block px-1">{tr('من تاريخ', 'From Date')}</label>
                                <EnglishDateInput value={taxStart} onChange={setTaxStart} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none" aria-label={tr('من تاريخ', 'From date')} />
                            </div>
                            <div>
                                <label className="text-[9px] text-gray-400 font-black uppercase mb-1 block px-1">{tr('إلى تاريخ', 'To Date')}</label>
                                <EnglishDateInput value={taxEnd} onChange={setTaxEnd} className="w-full h-10 px-3 bg-gray-50 rounded-xl text-xs font-bold outline-none" aria-label={tr('إلى تاريخ', 'To date')} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1 min-w-0">
                                <label className="text-[9px] text-gray-400 font-black uppercase tracking-wide px-1 leading-tight">{tr('حساب ضريبة المخرجات (دائن)', 'VAT output account (Credit)')}</label>
                                <select value={vatOutputAcc} onChange={e => setVatOutputAcc(e.target.value)} className="w-full h-10 px-2.5 bg-gray-50 rounded-xl text-[11px] font-bold outline-none border border-gray-50">
                                    {accounts.filter(a => a.type === 'LIABILITY').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1 min-w-0">
                                <label className="text-[9px] text-gray-400 font-black uppercase tracking-wide px-1 leading-tight">{tr('حساب ضريبة المدخلات (مدين)', 'VAT input account (Debit)')}</label>
                                <select value={vatInputAcc} onChange={e => setVatInputAcc(e.target.value)} className="w-full h-10 px-2.5 bg-gray-50 rounded-xl text-[11px] font-bold outline-none border border-gray-50">
                                    {accounts.filter(a => a.type === 'ASSET').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                            </div>
                            <div className="col-span-2 space-y-1">
                                <label className="text-[9px] text-gray-400 font-black uppercase tracking-wide px-1 leading-tight">{tr('حساب تسوية الضريبة (دائن/مدين)', 'Tax settlement account (Credit/Debit)')}</label>
                                <select value={vatPayableAcc} onChange={e => setVatPayableAcc(e.target.value)} className="w-full h-10 px-2.5 bg-gray-50 rounded-xl text-[11px] font-bold outline-none border border-gray-50">
                                    {accounts.filter(a => a.type === 'LIABILITY').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-emerald-50 p-3.5 rounded-xl text-center border border-emerald-100">
                            <p className="text-[9px] font-black text-emerald-600 mb-1 uppercase tracking-wide">{tr('ضريبة المبيعات', 'Sales Tax')}</p>
                            <h3 className="text-base font-black text-emerald-800 dir-ltr">{taxData.salesTax.toLocaleString()}</h3>
                        </div>
                        <div className="bg-amber-50 p-3.5 rounded-xl text-center border border-amber-100">
                            <p className="text-[9px] font-black text-amber-600 mb-1 uppercase tracking-wide">{tr('ضريبة المشتريات', 'Purchase Tax')}</p>
                            <h3 className="text-base font-black text-amber-800 dir-ltr">{taxData.purchaseTax.toLocaleString()}</h3>
                        </div>
                    </div>

                    <div className="bg-slate-800 p-4 rounded-2xl text-white text-center shadow-lg relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-wide">{tr('صافي الضريبة واجبة السداد', 'Net Tax Payable')}</p>
                            <h2 className="text-3xl font-black dir-ltr mb-3">{taxData.netTax.toLocaleString()}</h2>
                            <button onClick={postTaxSettlement} className="bg-white text-slate-900 h-10 rounded-xl font-black text-[11px] hover:bg-slate-100 transition-all w-full flex items-center justify-center gap-2">
                                <CheckCircle size={15} /> {tr('ترحيل قيود الإقفال الضريبي', 'Post tax closing entries')}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="font-black text-xs text-gray-800">{tr('تقرير مطابقة الضريبة', 'VAT Matching Report')}</h4>
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black whitespace-nowrap ${Math.abs(taxData.netDiff) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {Math.abs(taxData.netDiff) < 0.01 ? tr('مطابق', 'Matched') : tr('يوجد فرق', 'Difference')}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-500 mb-1">{tr('مخرجات من الفواتير', 'Output from invoices')}</p>
                                <p className="text-base font-black text-indigo-700 dir-ltr">{taxData.salesTax.toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-500 mb-1">{tr('مخرجات من القيود', 'Output from entries')}</p>
                                <p className="text-base font-black text-indigo-700 dir-ltr">{taxData.vatOutputPosted.toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-500 mb-1">{tr('مدخلات من الفواتير', 'Input from invoices')}</p>
                                <p className="text-base font-black text-emerald-700 dir-ltr">{taxData.purchaseTax.toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-500 mb-1">{tr('مدخلات من القيود', 'Input from entries')}</p>
                                <p className="text-base font-black text-emerald-700 dir-ltr">{taxData.vatInputPosted.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5">
                                <p className="text-[9px] text-gray-400 font-black mb-1">{tr('فرق المخرجات', 'Output difference')}</p>
                                <p className={`text-sm font-black dir-ltr ${Math.abs(taxData.outputDiff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>{taxData.outputDiff.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5">
                                <p className="text-[9px] text-gray-400 font-black mb-1">{tr('فرق المدخلات', 'Input difference')}</p>
                                <p className={`text-sm font-black dir-ltr ${Math.abs(taxData.inputDiff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>{taxData.inputDiff.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5">
                                <p className="text-[9px] text-gray-400 font-black mb-1">{tr('صافي الفرق', 'Net difference')}</p>
                                <p className={`text-sm font-black dir-ltr ${Math.abs(taxData.netDiff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>{taxData.netDiff.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-[10px] font-bold text-gray-600 leading-5">
                            <span>
                                {tr('عدد مستندات الفترة', 'Period documents')}:
                                {' '}
                                {taxData.salesInvoiceCount + taxData.purchaseInvoiceCount + taxData.salesReturnCount + taxData.purchaseReturnCount}
                            </span>
                            {' • '}
                            <span>{tr('مبيعات', 'Sales')}: {taxData.salesInvoiceCount}</span>
                            {' • '}
                            <span>{tr('مرتجع مبيعات', 'Sales returns')}: {taxData.salesReturnCount}</span>
                            {' • '}
                            <span>{tr('مشتريات', 'Purchases')}: {taxData.purchaseInvoiceCount}</span>
                            {' • '}
                            <span>{tr('مرتجع مشتريات', 'Purchase returns')}: {taxData.purchaseReturnCount}</span>
                            {' • '}
                            <span>{tr('قيود تسوية ضريبية', 'Tax settlement entries')}: {taxData.settlementCount}</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'CURRENCY' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4">
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
                        <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1 block mb-2">{tr('حساب فروقات العملة (أرباح/خسائر)', 'Currency difference account (gain/loss)')}</label>
                        <select value={exchangeDiffAcc} onChange={e => setExchangeDiffAcc(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl text-xs font-bold outline-none border border-gray-50">
                            {accounts.filter(a => a.type === 'EXPENSE' || a.type === 'REVENUE').map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                        </select>
                    </div>

                    <div className="space-y-3">
                        {currencyData.length > 0 ? currencyData.map(item => (
                            <div key={item.acc.id} className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><Coins size={18} /></div>
                                        <div>
                                            <h4 className="font-black text-xs text-gray-800">{displayAccountName(item.acc)}</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mt-0.5 dir-ltr">{item.foreignBalance.toLocaleString()} {item.acc.currency}</p>
                                        </div>
                                    </div>
                                    <div className="text-left">
                                        <span className={`text-sm font-black dir-ltr ${item.diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {item.diff > 0 ? '+' : ''}{item.diff.toLocaleString()}
                                        </span>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{tr('فرق تقييم', 'Revaluation Diff')}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-center text-[9px] bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                    <div>
                                        <span className="block text-gray-400 font-bold mb-1">{tr('الرصيد الدفتري', 'Book Balance')}</span>
                                        <span className="font-black dir-ltr text-gray-700">{item.bookBalance.toLocaleString()}</span>
                                    </div>
                                    <div className="border-r border-gray-200">
                                        <span className="block text-gray-400 font-bold mb-1">{tr('الرصيد المقيم', 'Revalued Balance')}</span>
                                        <span className="font-black dir-ltr text-gray-700">{item.revaluedBalance.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-12 text-gray-400 text-xs font-bold border-2 border-dashed border-gray-100 rounded-[2rem]">{tr('لا توجد حسابات بعملات أجنبية', 'No foreign-currency accounts found')}</div>
                        )}
                    </div>

                    <button onClick={postCurrencyRevaluation} className="w-full bg-amber-600 text-white py-4 rounded-[2rem] font-black shadow-xl shadow-amber-100 hover:bg-amber-700 transition-all flex justify-center gap-2 active:scale-95">
                        <ArrowRightLeft size={20} />
                        {tr('اعتماد فروقات العملة', 'Post currency differences')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default SettlementManager;


