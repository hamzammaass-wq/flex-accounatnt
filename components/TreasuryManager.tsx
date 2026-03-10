
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Landmark, Wallet, Plus, Trash2, ArrowDownLeft, ArrowUpRight, Briefcase, Edit2, Check, X, Coins, TrendingUp, TrendingDown, Sparkles, Globe, Hash } from 'lucide-react';
import { TransactionType } from '../types';
import { getDisplayAccountName, getDisplayCurrencyName } from '../utils/displayNames';

const TreasuryManager: React.FC = () => {
    const { accounts, addAccount, updateAccount, deleteAccount, transactions, baseCurrency, currencies, companySettings } = useAccounting();
    const [activeTab, setActiveTab] = useState<'BOX' | 'BANK'>('BOX');
    const [showForm, setShowForm] = useState(false);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);

    // Form States
    const [newName, setNewName] = useState('');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const displayAccountName = (account: { id: string; name: string }) => getDisplayAccountName(account, isEnglish);
    const displayCurrencyName = (currency: { code: string; name: string }) => getDisplayCurrencyName(currency, isEnglish);

    // Filtering logic based on Chart of Accounts Hierarchy
    const boxes = useMemo(() => accounts.filter(a =>
        !a.isGroup && a.type === 'ASSET' && a.parentId === 'acc_cash_root'
    ), [accounts]);

    const banks = useMemo(() => accounts.filter(a =>
        !a.isGroup && a.type === 'ASSET' && a.parentId === 'acc_bank_root'
    ), [accounts]);

    const filteredAccounts = activeTab === 'BOX' ? boxes : banks;

    // Get Balance in Account's specific currency
    const getBalance = (accountId: string) => {
        return transactions.reduce((sum, t) => {
            if (t.status === 'DRAFT') return sum;
            let change = 0;
            if (t.debitAccountId === accountId) change += t.amount;
            if (t.creditAccountId === accountId) change -= t.amount;
            return sum + change;
        }, 0);
    };

    // Helper to convert to base currency
    const getBaseEquivalent = (amount: number, currencyCode?: string) => {
        const rate = currencies.find(c => c.code === currencyCode)?.rate || 1;
        return amount * rate;
    };

    // Summary Totals (Always in Base Currency)
    const totalBoxBalance = boxes.reduce((sum, acc) => sum + getBaseEquivalent(getBalance(acc.id), acc.currency), 0);
    const totalBankBalance = banks.reduce((sum, acc) => sum + getBaseEquivalent(getBalance(acc.id), acc.currency), 0);

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        // Determination of Parent Group and Code Prefix based on ERP best practices
        const isBox = activeTab === 'BOX';
        const parentId = isBox ? 'acc_cash_root' : 'acc_bank_root';
        const codePrefix = isBox ? '111' : '112';

        // Generate a new sequential sub-account code
        const siblings = accounts.filter(a => a.parentId === parentId);
        const lastCode = siblings.length > 0
            ? Math.max(...siblings.map(a => parseInt(a.code.slice(-2))))
            : 0;
        const newSuffix = (lastCode + 1).toString().padStart(2, '0');
        const newCode = `${codePrefix}${newSuffix}`;

        const finalName = isBox ? newName : `${newName} (${bankAccountNumber})`;

        const result = addAccount({
            code: newCode,
            name: finalName,
            type: 'ASSET',
            balance: 0,
            parentId: parentId,
            isGroup: false,
            currency: selectedCurrency
        });
        if (!result.ok) {
            alert(result.message);
            return;
        }

        setNewName('');
        setBankAccountNumber('');
        setSelectedCurrency(baseCurrency);
        setShowForm(false);
    };

    const handleEditSave = (id: string) => {
        if (!editValue.trim()) return;
        const result = updateAccount(id, { name: editValue });
        if (!result.ok) {
            alert(result.message);
            return;
        }
        setEditingId(null);
    };

    const startEditing = (id: string, currentName: string) => {
        setEditingId(id);
        setEditValue(currentName);
    };

    return (
        <div className={`app-page animate-in fade-in duration-700 p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
            <header className="mb-5 flex justify-between items-start px-2">
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">{tr('النقدية والبنوك', 'Cash & Banks')}</h1>
                    <p className="text-gray-400 text-[10px] font-black mt-1 uppercase tracking-[0.3em]">{tr('إدارة الصناديق والحسابات الجارية', 'Manage cashboxes and current bank accounts')}</p>
                </div>
                <div className={`p-3 rounded-2xl bg-white shadow-xl border border-gray-50 shrink-0 ms-2 ${activeTab === 'BOX' ? 'text-emerald-500' : 'text-blue-500'}`}>
                    {activeTab === 'BOX' ? <Wallet size={24} /> : <Landmark size={24} />}
                </div>
            </header>

            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 sm:p-5 rounded-[2rem] text-white shadow-lg shadow-emerald-100 relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-125 transition-transform duration-700">
                        <Wallet size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 opacity-90">
                            <Sparkles size={14} />
                            <span className="text-[9px] font-black uppercase tracking-widest">{tr('إجمالي الصناديق', 'Total Cashboxes')}</span>
                        </div>
                        <div className="flex flex-col items-start">
                            <h2 className="text-xl sm:text-2xl font-black dir-ltr tracking-tighter">{totalBoxBalance.toLocaleString()}</h2>
                            <span className="text-[10px] font-bold opacity-60">{baseCurrency}</span>
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-4 sm:p-5 rounded-[2rem] text-white shadow-lg shadow-blue-100 relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-125 transition-transform duration-700">
                        <Landmark size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 opacity-90">
                            <Sparkles size={14} />
                            <span className="text-[9px] font-black uppercase tracking-widest">{tr('إجمالي البنوك', 'Total Banks')}</span>
                        </div>
                        <div className="flex flex-col items-start">
                            <h2 className="text-xl sm:text-2xl font-black dir-ltr tracking-tighter">{totalBankBalance.toLocaleString()}</h2>
                            <span className="text-[10px] font-bold opacity-60">{baseCurrency}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex p-1.5 bg-gray-100/60 backdrop-blur rounded-[2rem] mb-6 shadow-inner border border-gray-200/20">
                <button onClick={() => setActiveTab('BOX')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.6rem] font-black text-[10px] transition-all duration-500 ${activeTab === 'BOX' ? 'bg-white shadow-md text-emerald-600 scale-[1.02] z-10' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Wallet size={16} />
                    {tr('الخزائن النقدية', 'Cash Boxes')}
                </button>
                <button onClick={() => setActiveTab('BANK')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.6rem] font-black text-[10px] transition-all duration-500 ${activeTab === 'BANK' ? 'bg-white shadow-md text-blue-600 scale-[1.02] z-10' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Landmark size={16} />
                    {tr('الحسابات البنكية', 'Bank Accounts')}
                </button>
            </div>

            <div className="space-y-4">
                {filteredAccounts.map(account => {
                    const balance = getBalance(account.id);
                    const baseEquiv = getBaseEquivalent(balance, account.currency);
                    const isEditing = editingId === account.id;
                    const isForeign = account.currency && account.currency !== baseCurrency;
                    return (
                        <div key={account.id} className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm flex flex-col items-stretch group animate-in slide-in-from-bottom-5 transition-all hover:shadow-lg hover:border-gray-100">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className={`p-4 rounded-2xl transition-all duration-500 shadow-sm ${activeTab === 'BOX' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'}`}>
                                        {activeTab === 'BOX' ? <Wallet size={20} /> : <Landmark size={20} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {isEditing ? (
                                            <div className="flex gap-2 items-center">
                                                <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full p-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-black outline-none focus:ring-4 focus:ring-blue-50" autoFocus />
                                                <button onClick={() => handleEditSave(account.id)} className="p-2 bg-emerald-500 text-white rounded-xl shadow-lg"><Check size={14} /></button>
                                                <button onClick={() => setEditingId(null)} className="p-2 bg-gray-100 text-gray-400 rounded-xl"><X size={14} /></button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-black text-gray-800 text-base tracking-tight leading-none truncate">{displayAccountName(account)}</h4>
                                                <button onClick={() => startEditing(account.id, account.name)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-blue-500 transition-all active:scale-90 shrink-0">
                                                    <Edit2 size={12} />
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em]">{tr('كود الحساب', 'Account Code')}: {account.code}</p>
                                            <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black">{account.currency}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-left flex flex-col items-end ms-2 min-w-[96px] sm:min-w-[120px] max-w-[45%] overflow-hidden">
                                    <div className={`font-black dir-ltr text-lg sm:text-xl tracking-tighter whitespace-nowrap max-w-full truncate ${balance >= 0 ? 'text-gray-800' : 'text-rose-600'}`}>
                                        {balance.toLocaleString()}
                                        <span className="text-[9px] text-gray-400 font-bold ml-1">{account.currency}</span>
                                    </div>
                                    {isForeign && (
                                        <span className="text-[9px] font-black text-gray-300 dir-ltr uppercase tracking-tighter mt-1 whitespace-nowrap max-w-full truncate">
                                            ≈ {baseEquiv.toLocaleString()} {baseCurrency}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] text-gray-400 font-black uppercase tracking-widest">{tr('الحالة المحاسبية', 'Accounting Status')}:</span>
                                    {balance >= 0 ? <TrendingUp size={12} className="text-emerald-500" /> : <TrendingDown size={12} className="text-rose-500" />}
                                    <span className={`text-[8px] font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{tr('مربوط بالدليل', 'Linked to chart')}</span>
                                </div>
                                <div className="flex gap-2">
                                    {account.id !== 'acc_cash' && (
                                        <button onClick={() => { const result = deleteAccount(account.id); if (!result.ok) alert(result.message); }} className="bg-rose-50 p-2 rounded-xl text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <button onClick={() => setShowForm(!showForm)} className={`w-full py-5 border-2 border-dashed rounded-[2.5rem] font-black text-sm flex items-center justify-center gap-3 transition-all active:scale-95 ${activeTab === 'BOX' ? 'border-emerald-100 text-emerald-400 hover:bg-emerald-50 hover:border-emerald-200' : 'border-blue-100 text-blue-400 hover:bg-blue-50 hover:border-blue-200'}`}>
                    {showForm ? <X size={20} /> : <Plus size={20} />}
                    {showForm ? tr('إلغاء الإضافة', 'Cancel Add') : (activeTab === 'BOX' ? tr('إضافة صندوق (خزينة) جديد', 'Add New Cashbox') : tr('فتح حساب بنكي جديد', 'Open New Bank Account'))}
                </button>
                {showForm && (
                    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl animate-in slide-in-from-bottom-10 duration-500">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">{tr('الاسم الرسمي (يظهر في الدليل)', 'Official Name (shown in chart)')}</label>
                                <input type="text" placeholder={activeTab === 'BOX' ? tr('مثال: خزينة المبيعات الرئيسية', 'Example: Main Sales Cashbox') : tr('مثال: بنك القاهرة عمان', 'Example: Cairo Amman Bank')} value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-[1.5rem] border-none outline-none focus:ring-4 focus:ring-gray-100 font-bold text-sm text-gray-800" autoFocus />
                            </div>
                            {activeTab === 'BANK' && (
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1 flex items-center gap-1.5">
                                        <Hash size={12} /> {tr('رقم الحساب البنكي', 'Bank Account Number')}
                                    </label>
                                    <input type="text" placeholder="000-000-0000000-00" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className="w-full p-4 bg-gray-50 rounded-[1.5rem] border-none outline-none focus:ring-4 focus:ring-gray-100 font-bold text-sm text-gray-800 dir-ltr text-right" />
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">{tr('عملة الحساب', 'Account Currency')}</label>
                                    <select value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value)} className="w-full p-4 bg-gray-50 rounded-[1.5rem] border-none outline-none focus:ring-4 focus:ring-gray-100 font-bold text-sm text-gray-800 appearance-none">
                                        {currencies.map(c => <option key={c.code} value={c.code}>{c.code} - {displayCurrencyName(c)}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button onClick={handleAdd} className={`w-full p-4 rounded-[1.5rem] text-white shadow-xl active:scale-90 transition-all flex items-center justify-center gap-2 ${activeTab === 'BOX' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-blue-600 shadow-blue-100'}`}>
                                        <Check size={20} />
                                        <span className="font-black">{tr('تأكيد الإضافة', 'Confirm Add')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TreasuryManager;
