
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { AccountType, Account } from '../types';
import { getDisplayAccountName } from '../utils/displayNames';
import ResponsiveDialog from './layout/ResponsiveDialog';
import {
    Plus, Trash2, Folder, FileText, ChevronDown, ChevronRight,
    Search, CornerDownLeft, Info, Settings2, FolderPlus, FilePlus, XCircle, Edit2, Globe, Coins
} from 'lucide-react';

const AccountsTree: React.FC = () => {
    const { accounts, addAccount, deleteAccount, updateAccount, currencies, baseCurrency, companySettings } = useAccounting();
    const [activeType, setActiveType] = useState<AccountType | 'ALL'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([
        'acc_assets',
        'acc_liabilities',
        'acc_equity_root',
        'acc_partners_accounts_group',
        'acc_partners_capital',
        'acc_partner_current',
        'acc_partner_drawings',
        'acc_revenue_root',
        'acc_expense_root'
    ]));
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);

    // Account Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newCode, setNewCode] = useState('');
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<AccountType>('ASSET');
    const [parentId, setParentId] = useState<string>('');
    const [isGroup, setIsGroup] = useState(false);
    const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency);

    const toggleGroup = (id: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedGroups(newExpanded);
    };

    const getAccountColor = (type: AccountType) => {
        switch (type) {
            case 'ASSET': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
            case 'LIABILITY': return 'text-orange-600 bg-orange-50 border-orange-100';
            case 'EQUITY': return 'text-purple-600 bg-purple-50 border-purple-100';
            case 'REVENUE': return 'text-blue-600 bg-blue-50 border-blue-100';
            case 'EXPENSE': return 'text-rose-600 bg-rose-50 border-rose-100';
            default: return 'text-slate-600 bg-slate-50 border-slate-100';
        }
    };

    const getTypeLabel = (type: AccountType) => {
        switch (type) {
            case 'ASSET': return tr('الأصول', 'Assets');
            case 'LIABILITY': return tr('الالتزامات', 'Liabilities');
            case 'EQUITY': return tr('حقوق الملكية', 'Equity');
            case 'REVENUE': return tr('الإيرادات', 'Revenue');
            case 'EXPENSE': return tr('المصروفات', 'Expenses');
            default: return type;
        }
    };

    const displayAccountName = (account: Pick<Account, 'id' | 'name' | 'code'>) =>
        getDisplayAccountName(account, isEnglish);

    const buildTree = (parentId: string | undefined, list: Account[]): any[] => {
        return list
            .filter(a => a.parentId === parentId)
            .sort((a, b) => a.code.localeCompare(b.code))
            .map(a => ({
                ...a,
                children: buildTree(a.id, list)
            }));
    };

    const treeData = useMemo(() => {
        let filtered = accounts;
        if (activeType !== 'ALL') {
            filtered = accounts.filter(a => a.type === activeType);
        }
        if (searchTerm) {
            return accounts.filter(a =>
                a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                displayAccountName(a).toLowerCase().includes(searchTerm.toLowerCase()) ||
                a.code.includes(searchTerm)
            );
        }
        return buildTree(undefined, filtered);
    }, [accounts, activeType, searchTerm]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCode || !newName) return;

        // Validation: Check for duplicates
        const codeExists = accounts.some(a => a.code === newCode && a.id !== editingId);
        if (codeExists) {
            alert(tr('عذراً، كود الحساب هذا مستخدم مسبقاً. يرجى استخدام كود فريد.', 'This account code is already used. Please use a unique code.'));
            return;
        }

        const nameExists = accounts.some(a => a.name === newName && a.id !== editingId);
        if (nameExists) {
            alert(tr('عذراً، اسم الحساب هذا موجود مسبقاً.', 'This account name already exists.'));
            return;
        }

        const accountData = {
            code: newCode,
            name: newName,
            type: newType,
            parentId: parentId || undefined,
            isGroup: isGroup,
            currency: isGroup ? baseCurrency : selectedCurrency
        };

        const result = editingId
            ? updateAccount(editingId, accountData)
            : addAccount({ ...accountData, balance: 0 });
        if (!result.ok) {
            alert(result.message);
            return;
        }

        // UX Improvement: Ensure the user sees the new account
        if (activeType !== 'ALL' && activeType !== newType) {
            setActiveType(newType);
        }

        // Expand parent automatically if it's a child account
        if (parentId) {
            setExpandedGroups(prev => new Set(prev).add(parentId));
        }

        resetForm();
    };

    const openAddModal = (parentIdVal: string = '', typeVal: AccountType = 'ASSET') => {
        setEditingId(null);
        setNewCode('');
        setNewName('');
        setNewType(typeVal);
        setParentId(parentIdVal);
        setIsGroup(false);
        setSelectedCurrency(baseCurrency);
        setShowAddForm(true);
    };

    const openEditModal = (account: Account) => {
        setEditingId(account.id);
        setNewCode(account.code);
        setNewName(account.name);
        setNewType(account.type);
        setParentId(account.parentId || '');
        setIsGroup(account.isGroup || false);
        setSelectedCurrency(account.currency || baseCurrency);
        setShowAddForm(true);
    };

    const resetForm = () => {
        setNewCode('');
        setNewName('');
        setParentId('');
        setIsGroup(false);
        setEditingId(null);
        setShowAddForm(false);
    };

    const renderAccountNode = (account: any, depth = 0) => {
        const isExpanded = expandedGroups.has(account.id);
        const hasChildren = account.children && account.children.length > 0;
        const theme = getAccountColor(account.type);
        const isFlatView = !!searchTerm;
        const isForeign = account.currency && account.currency !== baseCurrency;

        return (
            <div key={account.id} className="animate-in fade-in slide-in-from-right-2">
                <div
                    className={`flex items-center justify-between p-3 mb-1 rounded-2xl border transition-all ${account.isGroup ? 'bg-white font-black border-slate-100 shadow-sm' : 'bg-slate-50/40 border-transparent font-medium'
                        }`}
                    style={{ marginRight: isFlatView ? '0' : `${depth * 16}px` }}
                >
                    <div className="flex items-center gap-3 flex-1">
                        {!isFlatView && account.isGroup && (
                            <button onClick={() => toggleGroup(account.id)} className="p-1 text-slate-400 hover:text-slate-800">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                        )}
                        {!isFlatView && !account.isGroup && depth > 0 && (
                            <CornerDownLeft size={12} className="text-slate-300" />
                        )}

                        <div className={`p-2 rounded-xl border ${theme}`}>
                            {account.isGroup ? <Folder size={16} /> : <FileText size={16} />}
                        </div>

                        <div className="text-right">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-800">{displayAccountName(account)}</span>
                                <span className="text-[9px] font-mono text-slate-400 dir-ltr">{account.code}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[8px] text-slate-400 uppercase tracking-widest">{getTypeLabel(account.type)}</span>
                                {!account.isGroup && (
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black flex items-center gap-1 ${isForeign ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                                        <Coins size={8} />
                                        {account.currency || baseCurrency}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {account.isGroup && (
                            <button
                                onClick={() => openAddModal(account.id, account.type)}
                                className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        )}

                        <button
                            onClick={() => openEditModal(account)}
                            className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                            <Edit2 size={14} />
                        </button>

                        {!['acc_assets', 'acc_liabilities', 'acc_equity_root', 'acc_revenue_root', 'acc_expense_root'].includes(account.id) && (
                            <button
                                onClick={() => {
                                    if (!confirm(tr('حذف الحساب نهائياً؟', 'Delete account permanently?'))) return;
                                    const result = deleteAccount(account.id);
                                    if (!result.ok) alert(result.message);
                                }}
                                className="p-2 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {!isFlatView && hasChildren && isExpanded && (
                    <div className="mr-2 border-r border-slate-100/50">
                        {account.children.map((child: any) => renderAccountNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="app-page font-tajawal animate-in fade-in duration-500">
            <header className="mb-6 flex justify-between items-center px-1">
                <div className="flex-1 relative ml-4">
                    <input
                        type="text"
                        placeholder={tr('ابحث بالاسم أو الكود...', 'Search by account name or code...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-3.5 pr-12 bg-white rounded-2xl border border-slate-100 shadow-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all font-bold text-xs"
                    />
                    <Search className="w-5 h-5 text-slate-300 absolute top-1/2 -translate-y-1/2 right-4 pointer-events-none" />
                </div>
                <button
                    onClick={() => openAddModal()}
                    className="bg-slate-800 text-white p-3.5 rounded-2xl shadow-xl active:scale-90 transition-all"
                >
                    <Plus size={24} />
                </button>
            </header>

            <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar px-1">
                {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => (
                    <button
                        key={t}
                        onClick={() => setActiveType(t as any)}
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter whitespace-nowrap transition-all border ${activeType === t
                                ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                                : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300 shadow-sm'
                            }`}
                    >
                        {t === 'ALL' ? tr('كافة الحسابات', 'All Accounts') : getTypeLabel(t as AccountType)}
                    </button>
                ))}
            </div>

            <div className="space-y-1 px-1">
                {treeData.length > 0 ? (
                    treeData.map(node => renderAccountNode(node))
                ) : (
                    <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-100">
                        <Info size={40} className="mx-auto text-slate-200 mb-4" />
                        <p className="text-slate-400 font-bold text-sm">{tr('لا توجد حسابات مطابقة', 'No matching accounts')}</p>
                    </div>
                )}
            </div>

            {showAddForm && (
                <ResponsiveDialog
                    open={showAddForm}
                    onClose={resetForm}
                    size="md"
                    zIndexClassName="z-[200]"
                    panelClassName="rounded-[2.5rem] p-8 shadow-3xl"
                >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-slate-800 text-xl tracking-tight">
                                {editingId ? tr('تعديل بيانات الحساب', 'Edit Account') : tr('إضافة حساب جديد', 'Add New Account')}
                            </h3>
                            <button onClick={resetForm} className="text-gray-300 hover:text-gray-500 transition-colors"><XCircle size={24} /></button>
                        </div>

                        <form onSubmit={handleFormSubmit} className="space-y-4">
                            <div className="flex bg-slate-50 p-1 rounded-xl mb-4 border border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsGroup(false)}
                                    className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-2 ${!isGroup ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}
                                >
                                    <FilePlus size={14} /> {tr('حساب فرعي', 'Sub Account')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsGroup(true)}
                                    className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-2 ${isGroup ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}
                                >
                                    <FolderPlus size={14} /> {tr('مجموعة رئيسية', 'Main Group')}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">{tr('نوع الحساب', 'Account Type')}</label>
                                    <select
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value as AccountType)}
                                        className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all appearance-none"
                                    >
                                        <option value="ASSET">{tr('أصول', 'Assets')}</option>
                                        <option value="LIABILITY">{tr('خصوم', 'Liabilities')}</option>
                                        <option value="EQUITY">{tr('حقوق ملكية', 'Equity')}</option>
                                        <option value="REVENUE">{tr('إيرادات', 'Revenue')}</option>
                                        <option value="EXPENSE">{tr('مصروفات', 'Expenses')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">{tr('عملة الحساب', 'Account Currency')}</label>
                                    <div className="relative">
                                        <select
                                            value={selectedCurrency}
                                            onChange={(e) => setSelectedCurrency(e.target.value)}
                                            className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all appearance-none disabled:opacity-50"
                                            disabled={isGroup}
                                        >
                                            {currencies.map(c => <option key={c.code} value={c.code}>{c.code} - {c.symbol}</option>)}
                                        </select>
                                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">{tr('الحساب الأب (المجموعة)', 'Parent Account (Group)')}</label>
                                <select
                                    value={parentId}
                                    onChange={(e) => setParentId(e.target.value)}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all appearance-none"
                                >
                                    <option value="">{tr('-- حساب رئيسي مستقل --', '-- Standalone Main Account --')}</option>
                                    {accounts.filter(a => a.isGroup && (activeType === 'ALL' || a.type === newType) && a.id !== editingId).map(a => (
                                        <option key={a.id} value={a.id}>{a.code} - {displayAccountName(a)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">{tr('كود الحساب', 'Account Code')}</label>
                                    <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder={tr('مثال: 1101', 'Example: 1101')} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all dir-ltr text-right" required />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">{tr('اسم الحساب', 'Account Name')}</label>
                                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={tr('اسم الحساب...', 'Account name...')} className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-50 transition-all" required />
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
                                <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-blue-700 font-bold leading-relaxed">
                                    {isGroup
                                        ? tr('الحسابات الرئيسية (المجموعات) تعمل فقط كحاويات للحسابات الفرعية ولا تقبل العمليات المباشرة.', 'Main accounts (groups) are containers for sub-accounts and do not accept direct transactions.')
                                        : tr(`سيتم تثبيت العملة لهذا الحساب كـ (${selectedCurrency}). لا يُنصح بتغيير العملة بعد بدء العمليات.`, `Currency will be fixed for this account as (${selectedCurrency}). Changing it after posting transactions is not recommended.`)
                                    }
                                </p>
                            </div>

                            <button type="submit" className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black text-xs shadow-xl active:scale-95 transition-all mt-2">
                                {editingId ? tr('حفظ التعديلات', 'Save Changes') : tr('تأكيد إضافة الحساب', 'Confirm Account Creation')}
                            </button>
                        </form>
                </ResponsiveDialog>
            )}
        </div>
    );
};

export default AccountsTree;

