
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Building2, Trash2, Plus, Calendar, RefreshCw, X, Activity, Archive, Layers, List, Percent, HardDrive, Car, Monitor, Hammer, Home, Edit3, Image as ImageIcon, Wand2, Loader2, Save, User, Truck, Wallet, Calculator, CreditCard, Clock, CheckCircle2 } from 'lucide-react';
import { FixedAsset, TransactionType } from '../types';
import { GoogleGenAI } from '@google/genai';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayAccountName, getDisplayAssetGroupName, getDisplayContactName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';

const FixedAssetsManager: React.FC = () => {
    const { fixedAssets, addFixedAsset, updateFixedAsset, deleteFixedAsset, assetGroups, addAssetGroup, deleteAssetGroup, baseCurrency, contacts, accounts, addTransaction, companySettings } = useAccounting();
    const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY' | 'GROUPS'>('ACTIVE');
    const [showAddForm, setShowAddForm] = useState(false);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [showDisposeModal, setShowDisposeModal] = useState<string | null>(null);
    const [assetSearchTerm, setAssetSearchTerm] = useState('');
    const [assetGroupFilterId, setAssetGroupFilterId] = useState('ALL');
    const [assetFromDateFilter, setAssetFromDateFilter] = useState('');
    const [assetToDateFilter, setAssetToDateFilter] = useState('');
    const [assetMinBookValueFilter, setAssetMinBookValueFilter] = useState('');
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayAssetGroupName = (group?: { id: string; name: string } | null) => getDisplayAssetGroupName(group || undefined, isEnglish);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);

    // Selected Asset for Edit/View
    const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);

    // AI Image Editing State
    const [editingImageId, setEditingImageId] = useState<string | null>(null);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // New Asset State
    const [name, setName] = useState('');
    const [groupId, setGroupId] = useState('');
    const [cost, setCost] = useState(''); // Purchase Price
    const [clearanceCost, setClearanceCost] = useState(''); // New: Clearance Expenses
    const [supplierId, setSupplierId] = useState(''); // New: Supplier

    // Clearance Expenses Handling
    const [clearancePaymentType, setClearancePaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
    const [expensePaymentAccountId, setExpensePaymentAccountId] = useState(''); // For Cash/Bank
    const [clearanceSupplierId, setClearanceSupplierId] = useState(''); // For Credit (Service Provider)

    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [lifeInYears, setLifeInYears] = useState('');
    const [salvageValue, setSalvageValue] = useState('');

    // New Group State
    const [groupName, setGroupName] = useState('');
    const [groupLife, setGroupLife] = useState('');
    const [groupRate, setGroupRate] = useState('');
    const [groupAssetAccountId, setGroupAssetAccountId] = useState('');
    const [groupAccumulatedDepAccountId, setGroupAccumulatedDepAccountId] = useState('acc_accumulated_depreciation');
    const [groupDepreciationExpenseAccountId, setGroupDepreciationExpenseAccountId] = useState('acc_depreciation_exp');

    // Dispose Asset State
    const [disposeDate, setDisposeDate] = useState(new Date().toISOString().split('T')[0]);
    const [disposePrice, setDisposePrice] = useState('');
    const [disposeType, setDisposeType] = useState<'SOLD' | 'DISPOSED'>('SOLD');

    const financialAccounts = useMemo(() => accounts.filter(a => !a.isGroup && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root')), [accounts]);
    const fixedAssetAccounts = useMemo(
        () => accounts.filter(a => !a.isGroup && a.parentId === 'acc_fixed_assets_root' && a.id !== 'acc_accumulated_depreciation'),
        [accounts]
    );
    const accumulatedDepreciationAccounts = useMemo(
        () => accounts.filter(a => !a.isGroup && a.id === 'acc_accumulated_depreciation'),
        [accounts]
    );
    const depreciationExpenseAccounts = useMemo(
        () => accounts.filter(a => !a.isGroup && a.type === 'EXPENSE'),
        [accounts]
    );

    const totalCapitalizedCost = (parseFloat(cost) || 0) + (parseFloat(clearanceCost) || 0);

    const handleAiEdit = async () => {
        if (!aiPrompt.trim() || !process.env.API_KEY) return;
        setIsAiLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        { text: `Edit the image based on this request: ${aiPrompt}` }
                    ]
                }
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    setPreviewImage(`data:image/png;base64,${part.inlineData.data}`);
                    break;
                }
            }
            alert(tr('تمت معالجة الصورة بذكاء Gemini بنجاح! ✨', 'Image processed successfully with Gemini AI.'));
        } catch (e) {
            console.error(e);
            alert(tr('فشل معالجة الصورة بالذكاء الاصطناعي.', 'AI image processing failed.'));
        } finally {
            setIsAiLoading(false);
        }
    };

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? dateString : d.toLocaleDateString(isEnglish ? 'en-GB' : 'ar-EG-u-nu-latn');
    };

    const getGroupIcon = (groupId: string) => {
        if (groupId.includes('building')) return <Home className="w-5 h-5" />;
        if (groupId.includes('vehicle')) return <Car className="w-5 h-5" />;
        if (groupId.includes('computer')) return <Monitor className="w-5 h-5" />;
        if (groupId.includes('machinery')) return <Hammer className="w-5 h-5" />;
        if (groupId.includes('furniture')) return <Layers className="w-5 h-5" />;
        return <Building2 className="w-5 h-5" />;
    };

    const getAccountDisplay = (accountId?: string) => {
        const account = accounts.find(a => a.id === accountId);
        return account ? `${account.code} - ${displayAccountName(account)}` : '-';
    };

    const handleAddAsset = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !cost || !supplierId) return alert(tr('يرجى تعبئة الحقول الأساسية (الاسم، السعر، المورد)', 'Please fill required fields (name, price, supplier)'));

        const basePrice = parseFloat(cost) || 0;
        const extraExp = parseFloat(clearanceCost) || 0;
        const finalCost = basePrice + extraExp;
        const selectedGroup = assetGroups.find(g => g.id === groupId);
        const assetPostingAccountId = selectedGroup?.assetAccountId || 'acc_equipment';
        const resolvedLifeInYears = parseFloat(lifeInYears) || selectedGroup?.defaultUsefulLife || 0;

        if (extraExp > 0) {
            if (clearancePaymentType === 'CASH' && !expensePaymentAccountId) return alert(tr('يرجى تحديد الصندوق/البنك لدفع مصاريف التخليص', 'Please select cashbox/bank for clearance payment'));
            if (clearancePaymentType === 'CREDIT' && !clearanceSupplierId) return alert(tr('يرجى تحديد مورد الخدمات (المخلص/الشاحن) لمصاريف التخليص الآجلة', 'Please select service supplier for deferred clearance cost'));
        }

        addFixedAsset({
            name,
            groupId,
            cost: finalCost,
            purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
            lifeInYears: resolvedLifeInYears,
            salvageValue: parseFloat(salvageValue) || 0,
            status: 'ACTIVE'
        });

        const supplierName = displayContactName(contacts.find(c => c.id === supplierId));

        addTransaction({
            amount: basePrice,
            description: `${tr('شراء أصل ثابت', 'Fixed asset purchase')}: ${name} - ${tr('المورد', 'Supplier')}: ${supplierName}`,
            category: 'journal',
            type: TransactionType.EXPENSE,
            date: purchaseDate,
            debitAccountId: assetPostingAccountId,
            creditAccountId: 'acc_payable',
            contactId: supplierId,
            currency: baseCurrency,
            exchangeRate: 1,
            status: 'POSTED'
        });

        if (extraExp > 0) {
            const isCredit = clearancePaymentType === 'CREDIT';
            const creditAccount = isCredit ? 'acc_payable' : expensePaymentAccountId;
            const clearanceContact = isCredit ? clearanceSupplierId : undefined;
            const clearanceContactName = displayContactName(contacts.find(c => c.id === clearanceContact)) || '';

            addTransaction({
                amount: extraExp,
                description: `${tr('رسملة مصاريف تخليص وشحن للأصل', 'Capitalize clearance and shipping cost for asset')}: ${name}${isCredit ? ` - ${tr('المستحق', 'Payable')}: ${clearanceContactName}` : ''}`,
                category: 'journal',
                type: TransactionType.EXPENSE,
                date: purchaseDate,
                debitAccountId: assetPostingAccountId,
                creditAccountId: creditAccount,
                contactId: clearanceContact,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED'
            });
        }

        setName(''); setGroupId(''); setCost(''); setClearanceCost(''); setSupplierId('');
        setExpensePaymentAccountId(''); setClearanceSupplierId(''); setClearancePaymentType('CASH');
        setPurchaseDate(''); setLifeInYears(''); setSalvageValue('');
        setShowAddForm(false);
        alert(tr('تم إضافة الأصل وإنشاء القيود المالية بنجاح ✅', 'Asset added and journal entries posted successfully.'));
    };

    const handleAddGroup = (e: React.FormEvent) => {
        e.preventDefault();

        const normalizedName = groupName.trim();
        const usefulLife = parseFloat(groupLife);

        if (!normalizedName || !usefulLife || usefulLife <= 0) {
            return alert(tr('يرجى إدخال اسم المجموعة والعمر الإنتاجي بشكل صحيح', 'Please enter valid group name and useful life'));
        }

        if (!groupAssetAccountId) {
            return alert(tr('يرجى اختيار حساب الأصل للمجموعة', 'Please select an asset account for this group'));
        }

        const duplicateByName = assetGroups.some(g => g.name.trim().toLowerCase() === normalizedName.toLowerCase());
        if (duplicateByName) {
            return alert(tr('اسم مجموعة الأصل موجود مسبقاً', 'Asset group name already exists'));
        }

        addAssetGroup({
            name: normalizedName,
            defaultUsefulLife: usefulLife,
            depreciationRate: parseFloat(groupRate) || undefined,
            assetAccountId: groupAssetAccountId,
            accumulatedDepreciationAccountId: groupAccumulatedDepAccountId || 'acc_accumulated_depreciation',
            depreciationExpenseAccountId: groupDepreciationExpenseAccountId || 'acc_depreciation_exp'
        });

        setGroupName('');
        setGroupLife('');
        setGroupRate('');
        setGroupAssetAccountId('');
        setGroupAccumulatedDepAccountId('acc_accumulated_depreciation');
        setGroupDepreciationExpenseAccountId('acc_depreciation_exp');
        setShowGroupForm(false);
        alert(tr('تم إنشاء مجموعة الأصل وربطها بالحسابات بنجاح', 'Asset group created and linked to accounts successfully.'));
    };

    const handleUpdateAsset = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAsset) return;
        updateFixedAsset(selectedAsset.id, {
            name: selectedAsset.name,
            groupId: selectedAsset.groupId,
            cost: selectedAsset.cost,
            lifeInYears: selectedAsset.lifeInYears,
            salvageValue: selectedAsset.salvageValue,
            purchaseDate: selectedAsset.purchaseDate
        });
        setSelectedAsset(null);
        alert(tr('تم تحديث بيانات الأصل بنجاح ✅', 'Asset details updated successfully.'));
    };

    const handleDispose = (e: React.FormEvent) => {
        e.preventDefault();
        if (!showDisposeModal) return;
        const asset = fixedAssets.find(a => a.id === showDisposeModal);
        if (!asset) return;

        const disposalAmount = Math.max(0, parseFloat(disposePrice) || 0);
        const disposalDate = disposeDate || new Date().toISOString().split('T')[0];
        const selectedGroup = assetGroups.find(g => g.id === asset.groupId);

        const assetAccountId = selectedGroup?.assetAccountId || 'acc_equipment';
        const accumulatedDepAccountId = selectedGroup?.accumulatedDepreciationAccountId || 'acc_accumulated_depreciation';
        const proceedsAccountId = 'acc_cash';
        const gainAccountId = 'acc_gain_asset_disposal';
        const lossAccountId = 'acc_loss_asset_disposal';

        const requiredAccountIds = [assetAccountId, accumulatedDepAccountId, proceedsAccountId, gainAccountId, lossAccountId];
        for (const accountId of requiredAccountIds) {
            const account = accounts.find(a => a.id === accountId);
            if (!account) {
                alert(tr(`الحساب غير موجود: ${accountId}`, `Account not found: ${accountId}`));
                return;
            }
            if (account.isGroup) {
                alert(tr(`الحساب يجب أن يكون تفصيلياً: ${accountId}`, `Posting account required: ${accountId}`));
                return;
            }
        }

        const accumulatedDepreciation = Math.min(asset.cost, Math.max(0, calculateDepreciation(asset)));
        const bookValue = Math.max(0, asset.cost - accumulatedDepreciation);
        const gainOrLoss = disposalAmount - bookValue;
        const postingResultMessages: string[] = [];

        if (accumulatedDepreciation > 0) {
            const result = addTransaction({
                amount: accumulatedDepreciation,
                description: `${tr('استبعاد أصل - عكس مجمع الإهلاك', 'Asset disposal - accumulated depreciation reversal')}: ${asset.name}`,
                category: 'journal',
                type: TransactionType.TRANSFER,
                date: disposalDate,
                debitAccountId: accumulatedDepAccountId,
                creditAccountId: assetAccountId,
                assetId: asset.id,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED'
            });
            if (!result.ok) {
                alert(result.message);
                return;
            }
        }

        if (bookValue > 0) {
            if (disposalAmount >= bookValue) {
                const removeBookResult = addTransaction({
                    amount: bookValue,
                    description: `${tr('استبعاد أصل - إزالة صافي القيمة الدفترية', 'Asset disposal - remove net book value')}: ${asset.name}`,
                    category: 'journal',
                    type: TransactionType.TRANSFER,
                    date: disposalDate,
                    debitAccountId: proceedsAccountId,
                    creditAccountId: assetAccountId,
                    assetId: asset.id,
                    currency: baseCurrency,
                    exchangeRate: 1,
                    status: 'POSTED'
                });
                if (!removeBookResult.ok) {
                    alert(removeBookResult.message);
                    return;
                }

                if (gainOrLoss > 0.01) {
                    const gainResult = addTransaction({
                        amount: gainOrLoss,
                        description: `${tr('استبعاد أصل - إثبات ربح بيع', 'Asset disposal - gain recognition')}: ${asset.name}`,
                        category: 'journal',
                        type: TransactionType.TRANSFER,
                        date: disposalDate,
                        debitAccountId: proceedsAccountId,
                        creditAccountId: gainAccountId,
                        assetId: asset.id,
                        currency: baseCurrency,
                        exchangeRate: 1,
                        status: 'POSTED'
                    });
                    if (!gainResult.ok) {
                        alert(gainResult.message);
                        return;
                    }
                    postingResultMessages.push(tr('ربح', 'Gain'));
                }
            } else {
                if (disposalAmount > 0) {
                    const proceedResult = addTransaction({
                        amount: disposalAmount,
                        description: `${tr('استبعاد أصل - إثبات متحصلات البيع', 'Asset disposal - proceeds recognition')}: ${asset.name}`,
                        category: 'journal',
                        type: TransactionType.TRANSFER,
                        date: disposalDate,
                        debitAccountId: proceedsAccountId,
                        creditAccountId: assetAccountId,
                        assetId: asset.id,
                        currency: baseCurrency,
                        exchangeRate: 1,
                        status: 'POSTED'
                    });
                    if (!proceedResult.ok) {
                        alert(proceedResult.message);
                        return;
                    }
                }

                const lossAmount = Math.max(0, bookValue - disposalAmount);
                if (lossAmount > 0.01) {
                    const lossResult = addTransaction({
                        amount: lossAmount,
                        description: `${tr('استبعاد أصل - إثبات خسارة بيع', 'Asset disposal - loss recognition')}: ${asset.name}`,
                        category: 'journal',
                        type: TransactionType.TRANSFER,
                        date: disposalDate,
                        debitAccountId: lossAccountId,
                        creditAccountId: assetAccountId,
                        assetId: asset.id,
                        currency: baseCurrency,
                        exchangeRate: 1,
                        status: 'POSTED'
                    });
                    if (!lossResult.ok) {
                        alert(lossResult.message);
                        return;
                    }
                    postingResultMessages.push(tr('خسارة', 'Loss'));
                }
            }
        }

        updateFixedAsset(showDisposeModal, {
            status: disposeType,
            disposalDate,
            disposalPrice: disposalAmount
        });

        setShowDisposeModal(null); setDisposePrice(''); setDisposeDate(new Date().toISOString().split('T')[0]);
        if (postingResultMessages.length > 0) {
            alert(tr('تم استبعاد الأصل وترحيل قيوده بنجاح', 'Asset disposal and journal posting completed successfully.'));
        }
    };

    const calculateDepreciation = (asset: FixedAsset) => {
        if (!asset.lifeInYears || asset.lifeInYears === 0) return 0;
        const endDate = asset.status === 'ACTIVE' ? new Date() : new Date(asset.disposalDate || new Date());
        const startDate = new Date(asset.purchaseDate);
        const yearsPassed = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const depreciableCost = asset.cost - asset.salvageValue;
        const yearlyDepreciation = depreciableCost / asset.lifeInYears;
        const totalDepreciation = yearlyDepreciation * Math.max(0, yearsPassed);
        return Math.min(depreciableCost, totalDepreciation);
    };

    const parseAmountFilter = (raw: string): number | null => {
        const normalized = toEnglishDigits(String(raw || '').trim()).replace(/[^\d.-]/g, '');
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const filteredAssets = useMemo(() => {
        const q = assetSearchTerm.trim().toLowerCase();
        const minBookValue = parseAmountFilter(assetMinBookValueFilter);

        return fixedAssets
            .filter(a => activeTab === 'ACTIVE'
                ? a.status === 'ACTIVE'
                : activeTab === 'HISTORY'
                    ? a.status !== 'ACTIVE'
                    : false
            )
            .filter(asset => assetGroupFilterId === 'ALL' || asset.groupId === assetGroupFilterId)
            .filter(asset => !assetFromDateFilter || asset.purchaseDate >= assetFromDateFilter)
            .filter(asset => !assetToDateFilter || asset.purchaseDate <= assetToDateFilter)
            .filter(asset => {
                const bookValue = asset.cost - calculateDepreciation(asset);
                return minBookValue === null || bookValue >= minBookValue;
            })
            .filter(asset => {
                if (!q) return true;
                const groupName = displayAssetGroupName(assetGroups.find(g => g.id === asset.groupId) || null);
                return asset.name.toLowerCase().includes(q) ||
                    groupName.toLowerCase().includes(q);
            })
            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
    }, [
        fixedAssets,
        activeTab,
        assetSearchTerm,
        assetGroupFilterId,
        assetFromDateFilter,
        assetToDateFilter,
        assetMinBookValueFilter,
        assetGroups,
        isEnglish
    ]);

    const hasAssetFilters =
        !!assetSearchTerm.trim() ||
        assetGroupFilterId !== 'ALL' ||
        !!assetFromDateFilter ||
        !!assetToDateFilter ||
        !!assetMinBookValueFilter;

    const clearAssetFilters = () => {
        setAssetSearchTerm('');
        setAssetGroupFilterId('ALL');
        setAssetFromDateFilter('');
        setAssetToDateFilter('');
        setAssetMinBookValueFilter('');
    };

    return (
        <div className={`app-page space-y-4 animate-in fade-in slide-in-from-right-4 relative font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className="flex p-1.5 bg-gray-100/60 backdrop-blur rounded-[2rem] mb-6 shadow-inner border border-gray-200/20 overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveTab('ACTIVE')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-[1.6rem] font-black text-[10px] transition-all duration-500 ${activeTab === 'ACTIVE' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-gray-500'}`}>
                    <Activity size={16} /> {tr('الأصول النشطة', 'Active Assets')}
                </button>
                <button onClick={() => setActiveTab('HISTORY')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-[1.6rem] font-black text-[10px] transition-all duration-500 ${activeTab === 'HISTORY' ? 'bg-white shadow-md text-gray-800 scale-[1.02]' : 'text-gray-500'}`}>
                    <Archive size={16} /> {tr('المستبعدة', 'Disposed')}
                </button>
                <button onClick={() => setActiveTab('GROUPS')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-[1.6rem] font-black text-[10px] transition-all duration-500 ${activeTab === 'GROUPS' ? 'bg-white shadow-md text-purple-600 scale-[1.02]' : 'text-gray-500'}`}>
                    <List size={16} /> {tr('المجموعات', 'Groups')}
                </button>
            </div>

            {activeTab === 'ACTIVE' && (
                <button onClick={() => setShowAddForm(!showAddForm)} className="w-full py-5 border-2 border-dashed border-gray-200 rounded-[2.5rem] text-gray-400 font-black hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center justify-center gap-3 active:scale-95 mb-6">
                    <Plus size={24} /> {tr('شراء أصل ثابت جديد', 'Purchase New Fixed Asset')}
                </button>
            )}

            {/* Add Form */}
            {activeTab === 'ACTIVE' && showAddForm && (
                <div className="bg-white p-7 rounded-[2.5rem] border border-blue-100 shadow-xl animate-in slide-in-from-bottom-5 mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-gray-800 text-lg">{tr('شراء وتعريف أصل جديد', 'Purchase and Define New Asset')}</h3>
                        <button onClick={() => setShowAddForm(false)} className="text-gray-300 hover:text-gray-500 p-2"><X size={24} /></button>
                    </div>
                    <form onSubmit={handleAddAsset} className="space-y-5">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('اسم الأصل', 'Asset Name')}</label>
                                <input type="text" placeholder={tr('مثال: سيارة توزيع مرسيدس', 'Example: Mercedes Delivery Truck')} value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none" required />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('مجموعة الأصول', 'Asset Group')}</label>
                                    <select
                                        value={groupId}
                                        onChange={e => {
                                            const selectedGroupId = e.target.value;
                                            setGroupId(selectedGroupId);
                                            const group = assetGroups.find(g => g.id === selectedGroupId);
                                            if (group && !lifeInYears) setLifeInYears(String(group.defaultUsefulLife));
                                        }}
                                        className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none appearance-none"
                                    >
                                        <option value="">{tr('-- اختر المجموعة --', '-- Select Group --')}</option>
                                        {assetGroups.map(g => <option key={g.id} value={g.id}>{displayAssetGroupName(g)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('تاريخ الشراء', 'Purchase Date')}</label>
                                    <EnglishDateInput
                                        value={purchaseDate}
                                        onChange={setPurchaseDate}
                                        className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none text-right"
                                        required
                                        aria-label={tr('تاريخ الشراء', 'Purchase date')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Financial Info */}
                        <div className="bg-slate-50/50 p-5 rounded-3xl border border-slate-100 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Calculator size={16} className="text-blue-500" />
                                <h4 className="text-xs font-black text-slate-700">{tr('التكاليف والرسملة', 'Costs and Capitalization')}</h4>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('المورد (البائع الأصلي)', 'Supplier (Original Seller)')}</label>
                                <div className="relative">
                                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full p-4 bg-white rounded-2xl border border-gray-100 text-sm font-bold outline-none appearance-none" required>
                                        <option value="">{tr('-- اختر المورد --', '-- Select Supplier --')}</option>
                                        {contacts.filter(c => c.type === 'SUPPLIER').map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                                    </select>
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-1 block mb-1">{tr('سعر الشراء الأساسي', 'Base Purchase Price')}</label>
                                    <input type="number" placeholder="0.00" value={cost} onChange={e => setCost(e.target.value)} className="w-full p-3 bg-white rounded-2xl border border-emerald-100 text-sm font-black outline-none dir-ltr text-center text-emerald-700" required />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest px-1 block mb-1">{tr('مصاريف تخليص/شحن', 'Clearance/Shipping Cost')}</label>
                                    <input type="number" placeholder="0.00" value={clearanceCost} onChange={e => setClearanceCost(e.target.value)} className="w-full p-3 bg-white rounded-2xl border border-orange-100 text-sm font-black outline-none dir-ltr text-center text-orange-700" />
                                </div>
                            </div>

                            {parseFloat(clearanceCost) > 0 && (
                                <div className="animate-in fade-in slide-in-from-top-2 bg-white p-3 rounded-2xl border border-gray-100">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-2">{tr('طريقة دفع مصاريف الشحن/التخليص', 'Clearance Cost Payment Method')}</label>

                                    <div className="flex bg-gray-50 p-1 rounded-xl mb-3">
                                        <button type="button" onClick={() => setClearancePaymentType('CASH')} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${clearancePaymentType === 'CASH' ? 'bg-white shadow text-emerald-600' : 'text-gray-400'}`}>{tr('نقدي / بنك', 'Cash / Bank')}</button>
                                        <button type="button" onClick={() => setClearancePaymentType('CREDIT')} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${clearancePaymentType === 'CREDIT' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>{tr('آجل (مورد خدمات)', 'Deferred (Service Supplier)')}</button>
                                    </div>

                                    {clearancePaymentType === 'CASH' ? (
                                        <div className="relative animate-in fade-in">
                                            <select value={expensePaymentAccountId} onChange={e => setExpensePaymentAccountId(e.target.value)} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none appearance-none" required>
                                                <option value="">{tr('-- اختر الصندوق/البنك --', '-- Select Cashbox/Bank --')}</option>
                                                {financialAccounts.map(acc => <option key={acc.id} value={acc.id}>{displayAccountName(acc)}</option>)}
                                            </select>
                                            <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={14} />
                                        </div>
                                    ) : (
                                        <div className="relative animate-in fade-in">
                                            <select value={clearanceSupplierId} onChange={e => setClearanceSupplierId(e.target.value)} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none appearance-none" required>
                                                <option value="">{tr('-- اختر المورد (المخلص/الشاحن) --', '-- Select Supplier (broker/shipper) --')}</option>
                                                {contacts.filter(c => c.type === 'SUPPLIER').map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                                            </select>
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={14} />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-2 border-t border-slate-200 flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{tr('إجمالي تكلفة الأصل (المرسملة)', 'Total Asset Cost (Capitalized)')}</span>
                                <span className="text-base font-black text-blue-700 dir-ltr">{totalCapitalizedCost.toLocaleString()} {baseCurrency}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('العمر الإنتاجي (سنة)', 'Useful Life (Years)')}</label>
                                <input type="number" value={lifeInYears} onChange={e => setLifeInYears(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none text-center" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('قيمة الخردة', 'Salvage Value')}</label>
                                <input type="number" value={salvageValue} onChange={e => setSalvageValue(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none text-center" />
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-[1.8rem] text-sm font-black shadow-xl shadow-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Truck size={18} />
                            {tr('تأكيد الشراء وتعريف الأصل', 'Confirm Purchase and Define Asset')}
                        </button>
                    </form>
                </div>
            )}

            {activeTab !== 'GROUPS' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
                            <input
                                type="text"
                                value={assetSearchTerm}
                                onChange={(e) => setAssetSearchTerm(e.target.value)}
                                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
                                placeholder={tr('بحث باسم الأصل أو المجموعة...', 'Search by asset/group...')}
                            />
                            <select
                                value={assetGroupFilterId}
                                onChange={(e) => setAssetGroupFilterId(e.target.value)}
                                className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
                            >
                                <option value="ALL">{tr('كل المجموعات', 'All groups')}</option>
                                {assetGroups.map(group => (
                                    <option key={group.id} value={group.id}>{displayAssetGroupName(group)}</option>
                                ))}
                            </select>
                            <EnglishDateInput
                                value={assetFromDateFilter}
                                onChange={setAssetFromDateFilter}
                                displayFormat="YMD"
                                wrapperClassName="w-full"
                                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
                                placeholder={tr('من تاريخ شراء', 'From purchase date')}
                            />
                            <EnglishDateInput
                                value={assetToDateFilter}
                                onChange={setAssetToDateFilter}
                                displayFormat="YMD"
                                wrapperClassName="w-full"
                                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
                                placeholder={tr('إلى تاريخ شراء', 'To purchase date')}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                value={toEnglishDigits(assetMinBookValueFilter)}
                                onChange={(e) => setAssetMinBookValueFilter(toEnglishDigits(e.target.value))}
                                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
                                placeholder={tr('أدنى قيمة دفترية', 'Min book value')}
                            />
                        </div>
                        <div className="flex items-center justify-between mt-3 gap-2">
                            <span className="text-[11px] font-black text-gray-500">
                                {tr('نتائج الفلترة', 'Filtered results')}: <span className="text-slate-800">{filteredAssets.length}</span>
                            </span>
                            {hasAssetFilters && (
                                <button
                                    type="button"
                                    onClick={clearAssetFilters}
                                    className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-black"
                                >
                                    {tr('مسح الفلاتر', 'Clear filters')}
                                </button>
                            )}
                        </div>
                    </div>

                    {filteredAssets.map(asset => {
                        const depreciation = calculateDepreciation(asset);
                        const bookValue = asset.cost - depreciation;
                        const progress = (depreciation / (asset.cost - asset.salvageValue)) * 100;

                        return (
                            <div
                                key={asset.id}
                                onClick={() => setSelectedAsset({ ...asset })}
                                className="bg-white p-6 rounded-[2.8rem] border border-gray-50 shadow-sm relative overflow-hidden group hover:shadow-xl hover:border-blue-100 transition-all duration-300 cursor-pointer active:scale-[0.98]"
                            >
                                <div className="flex justify-between items-start mb-5">
                                    <div className="flex gap-4">
                                        <div className={`p-4 rounded-2xl h-fit shadow-inner ${activeTab === 'ACTIVE' ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' : 'bg-gray-100 text-gray-500'} transition-all`}>
                                            {getGroupIcon(asset.groupId || '')}
                                        </div>
                                        <div>
                                            <h3 className="font-black text-gray-800 text-base mb-1">{asset.name}</h3>
                                            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-bold uppercase">
                                                <span className="flex items-center gap-1.5"><Calendar size={12} /> {formatDate(asset.purchaseDate)}</span>
                                                <span>&bull;</span>
                                                <span>{tr('قيمة', 'Cost')}: {asset.cost.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {activeTab === 'ACTIVE' && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); setShowDisposeModal(asset.id); }} className="text-gray-400 hover:text-amber-500 p-2.5 rounded-xl hover:bg-amber-50 transition-all"><RefreshCw size={18} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteFixedAsset(asset.id); }} className="text-gray-400 hover:text-rose-500 p-2.5 rounded-xl hover:bg-rose-50 transition-all"><Trash2 size={18} /></button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="mb-5">
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2 px-1">
                                        <span className="text-gray-400">{tr('الإهلاك التراكمي', 'Accumulated Depreciation')} ({isNaN(progress) ? 0 : progress.toFixed(0)}%)</span>
                                        <span className="text-gray-800 dir-ltr">{depreciation.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-gray-50 rounded-full h-2.5 border border-gray-100 overflow-hidden shadow-inner">
                                        <div className={`h-full rounded-full transition-all duration-1000 bg-blue-600`} style={{ width: `${Math.min(progress || 0, 100)}%` }}></div>
                                    </div>
                                </div>

                                <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex justify-between items-center group-hover:bg-white transition-all">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tr('القيمة الدفترية الحالية', 'Current Book Value')}</span>
                                    <span className="font-black text-slate-800 text-sm dir-ltr">{bookValue.toLocaleString()} {baseCurrency}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeTab === 'GROUPS' && (
                <div className="space-y-4">
                    <button
                        onClick={() => {
                            if (!showGroupForm && !groupAssetAccountId && fixedAssetAccounts.length > 0) {
                                setGroupAssetAccountId(fixedAssetAccounts[0].id);
                            }
                            setShowGroupForm(!showGroupForm);
                        }}
                        className="w-full py-5 border-2 border-dashed border-purple-200 rounded-[2.5rem] text-purple-500 font-black hover:bg-purple-50 transition-all flex items-center justify-center gap-3 active:scale-95"
                    >
                        <Plus size={20} />
                        {tr('إضافة مجموعة أصل ثابت', 'Add Fixed Asset Group')}
                    </button>

                    {showGroupForm && (
                        <div className="bg-white p-6 rounded-[2.5rem] border border-purple-100 shadow-sm">
                            <form onSubmit={handleAddGroup} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('اسم المجموعة', 'Group Name')}</label>
                                        <input
                                            type="text"
                                            value={groupName}
                                            onChange={e => setGroupName(e.target.value)}
                                            className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('العمر الإنتاجي (سنة)', 'Useful Life (Years)')}</label>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={groupLife}
                                            onChange={e => setGroupLife(e.target.value)}
                                            className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none text-center"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('نسبة الإهلاك السنوية (اختياري)', 'Annual Depreciation Rate (Optional)')}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={groupRate}
                                        onChange={e => setGroupRate(e.target.value)}
                                        className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none text-center"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('حساب الأصل', 'Asset Account')}</label>
                                        <select
                                            value={groupAssetAccountId}
                                            onChange={e => setGroupAssetAccountId(e.target.value)}
                                            className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none appearance-none"
                                            required
                                        >
                                            <option value="">{tr('-- اختر الحساب --', '-- Select Account --')}</option>
                                            {fixedAssetAccounts.map(account => (
                                                <option key={account.id} value={account.id}>
                                                    {account.code} - {displayAccountName(account)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('حساب مجمع الإهلاك', 'Accumulated Depreciation Account')}</label>
                                        <select
                                            value={groupAccumulatedDepAccountId}
                                            onChange={e => setGroupAccumulatedDepAccountId(e.target.value)}
                                            className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none appearance-none"
                                        >
                                            {accumulatedDepreciationAccounts.map(account => (
                                                <option key={account.id} value={account.id}>
                                                    {account.code} - {displayAccountName(account)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1">{tr('حساب مصروف الإهلاك', 'Depreciation Expense Account')}</label>
                                        <select
                                            value={groupDepreciationExpenseAccountId}
                                            onChange={e => setGroupDepreciationExpenseAccountId(e.target.value)}
                                            className="w-full p-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold outline-none appearance-none"
                                        >
                                            {depreciationExpenseAccounts.map(account => (
                                                <option key={account.id} value={account.id}>
                                                    {account.code} - {displayAccountName(account)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <button type="submit" className="w-full bg-slate-900 text-white py-3.5 rounded-[1.6rem] text-sm font-black">
                                    {tr('حفظ المجموعة', 'Save Group')}
                                </button>
                            </form>
                        </div>
                    )}

                    <div className="space-y-3">
                        {assetGroups.map(group => (
                            <div key={group.id} className="bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-sm">
                                <div className="flex justify-between items-start gap-3 mb-4">
                                    <div>
                                        <h4 className="font-black text-slate-800 text-base">{displayAssetGroupName(group)}</h4>
                                        <p className="text-[11px] font-bold text-gray-500 mt-1">
                                            {tr('العمر الإنتاجي', 'Useful Life')}: {group.defaultUsefulLife} {tr('سنة', 'years')}
                                            {group.depreciationRate ? ` | ${tr('إهلاك', 'Depreciation')}: ${group.depreciationRate}%` : ''}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const hasLinkedAssets = fixedAssets.some(a => a.groupId === group.id);
                                            if (hasLinkedAssets) {
                                                return alert(tr('لا يمكن حذف المجموعة لأنها مرتبطة بأصول ثابتة', 'Cannot delete this group because it is linked to fixed assets'));
                                            }
                                            if (confirm(tr('هل تريد حذف مجموعة الأصل؟', 'Do you want to delete this asset group?'))) deleteAssetGroup(group.id);
                                        }}
                                        className="text-gray-400 hover:text-rose-500 p-2 rounded-xl hover:bg-rose-50 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-bold">
                                    <div className="bg-slate-50 rounded-xl p-2.5">
                                        <span className="text-gray-400 block mb-0.5">{tr('حساب الأصل', 'Asset Account')}</span>
                                        <span className="text-slate-700">{getAccountDisplay(group.assetAccountId)}</span>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-2.5">
                                        <span className="text-gray-400 block mb-0.5">{tr('مجمع الإهلاك', 'Accumulated Depreciation')}</span>
                                        <span className="text-slate-700">{getAccountDisplay(group.accumulatedDepreciationAccountId)}</span>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-2.5">
                                        <span className="text-gray-400 block mb-0.5">{tr('مصروف الإهلاك', 'Depreciation Expense')}</span>
                                        <span className="text-slate-700">{getAccountDisplay(group.depreciationExpenseAccountId)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Edit/View Asset Modal */}
            {selectedAsset && (
                <ResponsiveDialog
                    open={Boolean(selectedAsset)}
                    onClose={() => setSelectedAsset(null)}
                    size="lg"
                    zIndexClassName="z-[400]"
                    panelClassName="rounded-[3rem] p-8 shadow-3xl max-h-[90dvh] overflow-y-auto"
                >
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Edit3 size={24} /></div>
                            <div>
                                <h3 className="font-black text-lg text-slate-800">{tr('تفاصيل الأصل', 'Asset Details')}</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{selectedAsset.status === 'ACTIVE' ? tr('أصل نشط', 'Active Asset') : tr('أصل مستبعد', 'Disposed Asset')}</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedAsset(null)} className="p-2 bg-gray-50 text-gray-400 rounded-full hover:bg-gray-100"><X size={20} /></button>
                    </div>

                    <form onSubmit={handleUpdateAsset} className="space-y-6">
                        {/* Stats Banner */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">{tr('القيمة الدفترية', 'Book Value')}</span>
                                <span className="text-xl font-black text-slate-800 dir-ltr">{(selectedAsset.cost - calculateDepreciation(selectedAsset)).toLocaleString()}</span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">{tr('مجمع الإهلاك', 'Accumulated Depreciation')}</span>
                                <span className="text-xl font-black text-rose-600 dir-ltr">{calculateDepreciation(selectedAsset).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('اسم الأصل', 'Asset Name')}</label>
                                <input value={selectedAsset.name} onChange={e => setSelectedAsset({ ...selectedAsset, name: e.target.value })} className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-sm outline-none focus:ring-2 ring-blue-50" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('التكلفة (المرسملة)', 'Capitalized Cost')}</label>
                                    <input type="number" value={selectedAsset.cost} onChange={e => setSelectedAsset({ ...selectedAsset, cost: parseFloat(e.target.value) || 0 })} className="w-full p-3 bg-gray-50 rounded-2xl border-none font-bold text-sm outline-none text-center dir-ltr" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('تاريخ الشراء', 'Purchase Date')}</label>
                                    <EnglishDateInput
                                        value={selectedAsset.purchaseDate}
                                        onChange={value => setSelectedAsset({ ...selectedAsset, purchaseDate: value })}
                                        className="w-full p-3 bg-gray-50 rounded-2xl border-none font-bold text-sm outline-none text-right"
                                        aria-label={tr('تاريخ الشراء', 'Purchase date')}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('العمر الإنتاجي (سنة)', 'Useful Life (Years)')}</label>
                                    <input type="number" value={selectedAsset.lifeInYears} onChange={e => setSelectedAsset({ ...selectedAsset, lifeInYears: parseFloat(e.target.value) || 0 })} className="w-full p-3 bg-gray-50 rounded-2xl border-none font-bold text-sm outline-none text-center" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('قيمة الخردة', 'Salvage Value')}</label>
                                    <input type="number" value={selectedAsset.salvageValue} onChange={e => setSelectedAsset({ ...selectedAsset, salvageValue: parseFloat(e.target.value) || 0 })} className="w-full p-3 bg-gray-50 rounded-2xl border-none font-bold text-sm outline-none text-center" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('مجموعة الأصول', 'Asset Group')}</label>
                                <select value={selectedAsset.groupId} onChange={e => setSelectedAsset({ ...selectedAsset, groupId: e.target.value })} className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-sm outline-none appearance-none">
                                    <option value="">{tr('-- اختر المجموعة --', '-- Select Group --')}</option>
                                    {assetGroups.map(g => <option key={g.id} value={g.id}>{displayAssetGroupName(g)}</option>)}
                                </select>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-[1.8rem] font-black shadow-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Save size={18} />
                            {tr('حفظ التعديلات', 'Save Changes')}
                        </button>
                    </form>
                </ResponsiveDialog>
            )}

            {/* AI Image Editor Modal */}
            {editingImageId && (
                <ResponsiveDialog
                    open={Boolean(editingImageId)}
                    onClose={() => { setEditingImageId(null); setPreviewImage(null); }}
                    size="md"
                    zIndexClassName="z-[400]"
                    backdropClassName="bg-black/80 backdrop-blur-md"
                    panelClassName="rounded-[3rem] p-8 shadow-3xl overflow-hidden"
                >
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl"><Wand2 size={24} /></div>
                            <h3 className="font-black text-lg text-slate-800 tracking-tight">{tr('محرر الصور الذكي', 'Smart Image Editor')}</h3>
                        </div>
                        <button onClick={() => { setEditingImageId(null); setPreviewImage(null); }} className="p-2 bg-gray-50 text-gray-400 rounded-full hover:bg-gray-100"><X size={20} /></button>
                    </div>

                    <div className="space-y-6">
                        <div className="aspect-square bg-slate-100 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group">
                            {previewImage ? (
                                <img src={previewImage} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="Preview" />
                            ) : (
                                <div className="text-center space-y-2">
                                    <ImageIcon size={48} className="mx-auto text-slate-300" />
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tr('صورة الأصل الافتراضية', 'Default Asset Image')}</p>
                                </div>
                            )}
                            {isAiLoading && (
                                <div className="absolute inset-0 bg-indigo-600/20 backdrop-blur-sm flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{tr('ماذا تريد أن تفعل بالصورة؟', 'What do you want to do with the image?')}</label>
                            <textarea
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                placeholder={tr('مثال: أضف تأثيراً واقعياً، أو قم بإزالة الخلفية البيضاء...', 'Example: Add a realistic effect, or remove the white background...')}
                                className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none text-sm font-bold text-slate-700 resize-none h-24 focus:ring-4 ring-indigo-50 transition-all"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleAiEdit}
                                disabled={isAiLoading || !aiPrompt.trim()}
                                className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-xs shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                {tr('معالجة بالذكاء الاصطناعي', 'Process with AI')}
                            </button>
                            <button
                                onClick={() => { setEditingImageId(null); setPreviewImage(null); }}
                                className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-xs active:scale-95"
                            >
                                {tr('حفظ', 'Save')}
                            </button>
                        </div>
                    </div>
                </ResponsiveDialog>
            )}

            {/* Dispose Modal (Simplified) */}
            {showDisposeModal && (
                <ResponsiveDialog
                    open={Boolean(showDisposeModal)}
                    onClose={() => setShowDisposeModal(null)}
                    size="md"
                    zIndexClassName="z-[350]"
                    backdropClassName="bg-slate-900/90 backdrop-blur-md"
                    panelClassName="rounded-[2.5rem] p-8 shadow-2xl"
                >
                    <h3 className="font-black text-xl text-gray-800 mb-6">{tr('استبعاد أصل ثابت', 'Dispose Fixed Asset')}</h3>
                    <form onSubmit={handleDispose} className="space-y-6">
                        <div className="flex bg-gray-100 p-1 rounded-2xl">
                            <button type="button" onClick={() => setDisposeType('SOLD')} className={`flex-1 text-[10px] font-black py-3 rounded-xl transition-all ${disposeType === 'SOLD' ? 'bg-white shadow-md text-emerald-600' : 'text-gray-400'}`}>{tr('بيع نقدي', 'Cash Sale')}</button>
                            <button type="button" onClick={() => setDisposeType('DISPOSED')} className={`flex-1 text-[10px] font-black py-3 rounded-xl transition-all ${disposeType === 'DISPOSED' ? 'bg-white shadow-md text-rose-600' : 'text-gray-400'}`}>{tr('إتلاف / خردة', 'Scrap / Disposal')}</button>
                        </div>
                        <EnglishDateInput
                            value={disposeDate}
                            onChange={setDisposeDate}
                            className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm text-right"
                            aria-label={tr('تاريخ الاستبعاد', 'Disposal date')}
                        />
                        <button type="submit" className="w-full py-4.5 bg-slate-900 text-white rounded-[1.5rem] font-black text-sm shadow-xl active:scale-95">{tr('تأكيد عملية الاستبعاد', 'Confirm Disposal')}</button>
                    </form>
                </ResponsiveDialog>
            )}
        </div>
    );
};

export default FixedAssetsManager;

