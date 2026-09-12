import React, { useEffect, useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, Invoice, Product, ImportExpenseDistributionLine, ImportExpenseDistribution } from '../types';
import { getDisplayContactName, getDisplayProductName } from '../utils/displayNames';
import { buildProductPricingPatch, resolveProductPricing } from '../utils/productPricing';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import EnglishDateInput from './EnglishDateInput';
import { 
    Plus, Search, Ship, Calendar, 
    ArrowUpRight, Link as LinkIcon, TrendingUp, Filter, Receipt,
    User, Package, ChevronRight, CheckCircle, Info, X, DollarSign, Calculator,
    Layers, Scale, ArrowLeft, Save, ListChecks, Percent, Hash, AlertTriangle,
    History, CheckCircle2, RefreshCw, Edit2, Contact2, UserPlus
} from 'lucide-react';

interface ImportManagerProps {
    onAddNew?: () => void;
    initialInvoiceId?: string;
    autoStartWizard?: boolean;
    onLaunchConsumed?: () => void;
}

type ImportExpenseDistributionWithJournalRef = ImportExpenseDistribution & {
    journalTransactionRef?: string;
};

const round2 = (value: number): number => {
    const safe = Number.isFinite(value) ? value : 0;
    return Number(safe.toFixed(2));
};

const createImportJournalRef = (): string =>
    `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const ImportManager: React.FC<ImportManagerProps> = ({
    initialInvoiceId,
    autoStartWizard = false,
    onLaunchConsumed
}) => {
    const { invoices, products, transactions, updateProduct, addTransaction, reverseTransaction, addImportExpenseDistribution, updateImportExpenseDistribution, importExpenseDistributions, baseCurrency, contacts, companySettings } = useAccounting();
    const [searchTerm, setSearchTerm] = useState('');
    const [distributionMethodFilter, setDistributionMethodFilter] = useState<'ALL' | 'VALUE' | 'QUANTITY' | 'MANUAL'>('ALL');
    const [distributionContactFilter, setDistributionContactFilter] = useState('ALL');
    const [distributionFromDateFilter, setDistributionFromDateFilter] = useState('');
    const [distributionToDateFilter, setDistributionToDateFilter] = useState('');
    const [distributionMinAmountFilter, setDistributionMinAmountFilter] = useState('');
    const [distributionMaxAmountFilter, setDistributionMaxAmountFilter] = useState('');
    const [showWizard, setShowWizard] = useState(false);
    const [editingDistribution, setEditingDistribution] = useState<ImportExpenseDistribution | null>(null);
    const [wizardStep, setWizardStep] = useState(1);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayContactName = (contact?: { id: string; name: string } | null) =>
        getDisplayContactName(contact || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) =>
        getDisplayProductName(product || undefined, isEnglish);

    // Wizard State
    const [expenseAmount, setExpenseAmount] = useState('');
    const [selectedContactId, setSelectedContactId] = useState(''); // New: To track the party to credit
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
    const [distributionMethod, setDistributionMethod] = useState<'VALUE' | 'QUANTITY' | 'MANUAL'>('VALUE');
    const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});
    const [wizardDesc, setWizardDesc] = useState(() => tr('مصاريف شحن وجمارك واردة', 'Inbound shipping and customs expenses'));

    const resetWizard = () => {
        setShowWizard(false); setWizardStep(1); setExpenseAmount(''); setSelectedInvoiceIds([]);
        setSelectedContactId(''); setManualAllocations({}); setDistributionMethod('VALUE'); setEditingDistribution(null);
    };

    const startEditDistribution = (record: ImportExpenseDistribution) => {
        setEditingDistribution(record);
        setExpenseAmount(String(record.totalAmountBase || ''));
        setSelectedContactId(record.contactId || '');
        setSelectedInvoiceIds(record.purchaseInvoiceIds || []);
        setDistributionMethod(record.method);
        setWizardDesc(record.description || '');
        setManualAllocations(Object.fromEntries(record.lines.map(line => [`${line.purchaseInvoiceId}-${line.invoiceItemId}`, String(line.allocatedAmountBase || '')])));
        setWizardStep(1); setShowWizard(true);
    };

    useEffect(() => {
        if (!autoStartWizard && !initialInvoiceId) return;
        setShowWizard(true);
        setWizardStep(1);
        if (initialInvoiceId) {
            setSelectedInvoiceIds(prev => (prev.includes(initialInvoiceId) ? prev : [initialInvoiceId, ...prev]));
        }
        onLaunchConsumed?.();
    }, [autoStartWizard, initialInvoiceId, onLaunchConsumed]);

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
    };

    const selectedInvoicesData = useMemo(() => {
        return invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
    }, [invoices, selectedInvoiceIds]);

    const parseAmountFilter = (raw: string): number | null => {
        const normalized = toEnglishDigits(String(raw || '').trim()).replace(/[^\d.-]/g, '');
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const distributionContactOptions = useMemo(() => {
        const ids = new Set(importExpenseDistributions.map(record => record.contactId).filter((value): value is string => !!value));
        return contacts
            .filter(contact => ids.has(contact.id))
            .sort((a, b) => displayContactName(a).localeCompare(displayContactName(b), isEnglish ? 'en' : 'ar'));
    }, [importExpenseDistributions, contacts, isEnglish]);

    const filteredDistributionHistory = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const minAmount = parseAmountFilter(distributionMinAmountFilter);
        const maxAmount = parseAmountFilter(distributionMaxAmountFilter);

        return importExpenseDistributions
            .filter(record => distributionMethodFilter === 'ALL' || record.method === distributionMethodFilter)
            .filter(record => distributionContactFilter === 'ALL' || record.contactId === distributionContactFilter)
            .filter(record => !distributionFromDateFilter || record.date >= distributionFromDateFilter)
            .filter(record => !distributionToDateFilter || record.date <= distributionToDateFilter)
            .filter(record => minAmount === null || Number(record.totalAmountBase || 0) >= minAmount)
            .filter(record => maxAmount === null || Number(record.totalAmountBase || 0) <= maxAmount)
            .filter(record => {
                if (!q) return true;
                const contact = contacts.find(c => c.id === record.contactId) || null;
                const contactName = contact ? displayContactName(contact) : '';
                const methodLabel = record.method === 'VALUE'
                    ? tr('حسب القيمة', 'By Value')
                    : record.method === 'QUANTITY'
                        ? tr('حسب الكمية', 'By Quantity')
                        : tr('يدوي', 'Manual');
                return (record.id || '').toLowerCase().includes(q) ||
                    (record.description || '').toLowerCase().includes(q) ||
                    contactName.toLowerCase().includes(q) ||
                    methodLabel.toLowerCase().includes(q) ||
                    record.purchaseInvoiceIds.some(id => id.toLowerCase().includes(q)) ||
                    record.lines.some(line => String(line.description || '').toLowerCase().includes(q));
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [
        importExpenseDistributions,
        contacts,
        searchTerm,
        distributionMethodFilter,
        distributionContactFilter,
        distributionFromDateFilter,
        distributionToDateFilter,
        distributionMinAmountFilter,
        distributionMaxAmountFilter,
        isEnglish
    ]);

    const hasDistributionFilters =
        !!searchTerm.trim() ||
        distributionMethodFilter !== 'ALL' ||
        distributionContactFilter !== 'ALL' ||
        !!distributionFromDateFilter ||
        !!distributionToDateFilter ||
        !!distributionMinAmountFilter ||
        !!distributionMaxAmountFilter;

    const clearDistributionFilters = () => {
        setSearchTerm('');
        setDistributionMethodFilter('ALL');
        setDistributionContactFilter('ALL');
        setDistributionFromDateFilter('');
        setDistributionToDateFilter('');
        setDistributionMinAmountFilter('');
        setDistributionMaxAmountFilter('');
    };

    const allItemsToDistribute = useMemo(() => {
        const items: any[] = [];
        selectedInvoicesData.forEach(inv => {
            inv.items.forEach(item => {
                items.push({
                    ...item,
                    invoiceId: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    invoiceDate: inv.date,
                    invoiceExchangeRate: inv.exchangeRate || 1,
                    key: `${inv.id}-${item.id}`
                });
            });
        });
        return items;
    }, [selectedInvoicesData]);

    const totals = useMemo(() => {
        const qty = allItemsToDistribute.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
        // VALUE allocation must compare invoice lines in the same (base) currency.
        const val = allItemsToDistribute.reduce(
            (s: number, i: any) => s + ((Number(i.total) || 0) * (Number(i.invoiceExchangeRate) || 1)),
            0
        );
        return { qty, val };
    }, [allItemsToDistribute]);

    const distributions = useMemo(() => {
        const totalExp = parseFloat(expenseAmount) || 0;
        const results: Record<string, number> = {};

        if (totalExp <= 0 || allItemsToDistribute.length === 0) return results;

        if (distributionMethod === 'VALUE') {
            allItemsToDistribute.forEach(item => {
                const lineValueBase = (Number(item.total) || 0) * (Number(item.invoiceExchangeRate) || 1);
                const ratio = totals.val > 0 ? lineValueBase / totals.val : 0;
                results[item.key] = ratio * totalExp;
            });
        } else if (distributionMethod === 'QUANTITY') {
            allItemsToDistribute.forEach(item => {
                const ratio = totals.qty > 0 ? (Number(item.quantity) || 0) / totals.qty : 0;
                results[item.key] = ratio * totalExp;
            });
        } else {
            allItemsToDistribute.forEach(item => {
                results[item.key] = parseFloat(manualAllocations[item.key]) || 0;
            });
        }

        return results;
    }, [distributionMethod, expenseAmount, allItemsToDistribute, totals, manualAllocations]);

    const projectedPricingByProduct = useMemo(() => {
        const aggregates = new Map<string, { product: Product; totalQty: number; directAmount: number; allocated: number }>();

        allItemsToDistribute.forEach(item => {
            if (!item.productId) return;
            const product = products.find(p => p.id === item.productId);
            if (!product) return;

            const qty = Number(item.quantity) || 0;
            if (qty <= 0) return;

            const allocated = Number(distributions[item.key] || 0);
            const directAmount = (Number(item.total) || 0) * (Number(item.invoiceExchangeRate) || 1);
            const prev = aggregates.get(product.id);
            if (!prev) {
                aggregates.set(product.id, { product, totalQty: qty, directAmount, allocated });
                return;
            }
            aggregates.set(product.id, {
                product,
                totalQty: prev.totalQty + qty,
                directAmount: prev.directAmount + directAmount,
                allocated: prev.allocated + allocated
            });
        });

        const projected = new Map<string, {
            product: Product;
            totalQty: number;
            allocated: number;
            currentCost: number;
            nextCost: number;
            wholesalePrice: number;
            retailPrice: number;
        }>();

        aggregates.forEach((entry, productId) => {
            // Landed cost must start from the selected purchase lines, not the product's
            // latest cost (which may belong to another purchase batch).
            const currentCost = round2(entry.totalQty > 0 ? entry.directAmount / entry.totalQty : 0);
            const extraPerUnit = entry.totalQty > 0 ? (entry.allocated / entry.totalQty) : 0;
            const nextCost = round2(currentCost + extraPerUnit);
            const pricing = resolveProductPricing(entry.product, nextCost);

            projected.set(productId, {
                product: entry.product,
                totalQty: round2(entry.totalQty),
                allocated: round2(entry.allocated),
                currentCost,
                nextCost: pricing.cost,
                wholesalePrice: pricing.wholesalePrice,
                retailPrice: pricing.retailPrice
            });
        });

        return projected;
    }, [allItemsToDistribute, distributions, products]);

    const projectedPricingRows = useMemo(
        () => Array.from(projectedPricingByProduct.values()),
        [projectedPricingByProduct]
    );

    const totalDistributed = (Object.values(distributions) as number[]).reduce((s, v) => s + v, 0);
    const isBalanced = Math.abs(totalDistributed - (parseFloat(expenseAmount) || 0)) < 0.1;

    const handleConfirmDistribution = () => {
        if (!isBalanced) return alert(tr('إجمالي المبالغ الموزعة يجب أن يساوي مبلغ المصروف!', 'Total distributed amount must equal expense amount!'));
        if (!selectedContactId) return alert(tr('يرجى اختيار الطرف الذي سيتم الخصم من حسابه', 'Please select party to apply the credit account'));
        
        const totalExp = parseFloat(expenseAmount);
        const party = contacts.find(c => c.id === selectedContactId);
        if (party?.type === 'PARTNER' && !(party.currentAccountId || party.linkedAccountId)) {
            return alert(tr('يرجى ربط الشريك بحساب حقوق الملكية من شاشة الدليل أولاً.', 'Please link this partner to an equity account from Directory first.'));
        }
        
        // Determine the credit account based on contact type
        // Suppliers go to Accounts Payable, Customers to Accounts Receivable, Partners to linked equity account.
        const creditAccountId = party?.type === 'SUPPLIER'
            ? (party.currentAccountId || party.linkedAccountId || 'acc_payable')
            : party?.type === 'PARTNER'
                ? (party.currentAccountId || party.linkedAccountId || 'acc_partner_current')
                : (party?.currentAccountId || party?.linkedAccountId || 'acc_receivable');

        const existingJournalRef = editingDistribution
            ? (editingDistribution as ImportExpenseDistributionWithJournalRef).journalTransactionRef
            : undefined;
        const journalTransactionRef = existingJournalRef || createImportJournalRef();
        
        // 1. Post Accounting Transaction (Move from Expense to Asset/Inventory Value)
        // The stable voucher reference links this distribution to exactly one journal entry.
        const transactionPayload = {
            amount: totalExp,
            description: `${wizardDesc} - ${tr('مستحق لـ', 'Payable to')} ${displayContactName(party || null)}`,
            category: 'import_expenses',
            type: TransactionType.EXPENSE,
            date: new Date().toISOString().split('T')[0],
            debitAccountId: 'acc_inventory',
            creditAccountId: creditAccountId, 
            contactId: selectedContactId,
            voucherId: journalTransactionRef,
            currency: baseCurrency,
            exchangeRate: 1,
            status: 'POSTED'
        };

        const matchingTransactions = editingDistribution ? transactions.filter(tx => {
            if (existingJournalRef) {
                return tx.voucherId === existingJournalRef && tx.category === 'import_expenses' && !tx.isReversal && !tx.reversedById;
            }
            // Legacy fallback: older distributions did not retain a stable journal reference.
            return tx.category === 'import_expenses' && tx.contactId === editingDistribution.contactId &&
                !tx.isReversal && !tx.reversedById &&
                Math.abs(Number(tx.amount || 0) - Number(editingDistribution.totalAmountBase || 0)) < 0.01;
        }) : [];
        if (editingDistribution && matchingTransactions.length !== 1) {
            alert(tr('تعذر تحديد القيد المحاسبي المرتبط بهذا التوزيع بأمان. لا يمكن حفظ التعديل.', 'The accounting entry linked to this distribution could not be identified safely. Changes were not saved.'));
            return;
        }
        const linkedTransaction = matchingTransactions[0];
        // Posted entries are immutable. Replace the economic effect through a reversal
        // and a fresh posted entry, preserving a complete audit trail.
        if (linkedTransaction) {
            const reversalResult = reverseTransaction(linkedTransaction.id);
            if (!reversalResult.ok) {
                alert(reversalResult.message);
                return;
            }
        }
        const postResult = addTransaction(transactionPayload);
        if (!postResult.ok) {
            alert(postResult.message);
            return;
        }

        // 2. Update Inventory Product Costs and pricing (only after successful posting)
        projectedPricingByProduct.forEach(entry => {
            updateProduct(entry.product.id, buildProductPricingPatch(entry.product, entry.nextCost));
        });

        // 3. Persist detailed distribution rows (invoice/item level) for reports
        const distributionLines: ImportExpenseDistributionLine[] = allItemsToDistribute.map((item: any) => {
            const qty = Number(item.quantity) || 0;
            const directLineAmountBase = (Number(item.total) || 0) * (Number(item.invoiceExchangeRate) || 1);
            const allocatedAmountBase = Number(distributions[item.key] || 0);
            return {
                id: item.key,
                purchaseInvoiceId: item.invoiceId,
                purchaseInvoiceNumber: item.invoiceNumber,
                purchaseInvoiceDate: item.invoiceDate,
                invoiceItemId: item.id,
                productId: item.productId,
                description: item.description || '',
                quantity: qty,
                directLineAmountBase,
                allocatedAmountBase,
                landedLineAmountBase: directLineAmountBase + allocatedAmountBase,
                unitCostBeforeBase: qty > 0 ? round2(directLineAmountBase / qty) : 0,
                unitCostAfterBase: qty > 0 ? round2((directLineAmountBase + allocatedAmountBase) / qty) : 0,
                suggestedWholesalePrice: item.productId ? projectedPricingByProduct.get(item.productId)?.wholesalePrice : undefined,
                suggestedRetailPrice: item.productId ? projectedPricingByProduct.get(item.productId)?.retailPrice : undefined
            };
        });

        const distributionRecord = {
            date: new Date().toISOString().split('T')[0],
            totalAmountBase: totalExp,
            currency: baseCurrency,
            exchangeRate: 1,
            method: distributionMethod,
            contactId: selectedContactId,
            description: wizardDesc,
            purchaseInvoiceIds: Array.from(new Set(selectedInvoiceIds)),
            journalCategory: 'import_expenses',
            journalTransactionRef,
            lines: distributionLines
        };
        const distributionResult = editingDistribution
            ? updateImportExpenseDistribution(editingDistribution.id, distributionRecord)
            : addImportExpenseDistribution(distributionRecord);
        if (!distributionResult.ok) { alert(distributionResult.message); return; }

        alert(tr('تم توزيع المصاريف بنجاح وتقييدها في حساب الطرف المختار ✅', 'Expenses distributed successfully and posted to selected party account ✅'));
        resetWizard();
    };

    return (
        <div className="app-page animate-in fade-in duration-700 p-3 md:p-4 font-tajawal" dir={isEnglish ? 'ltr' : 'rtl'}>
            <header className="mb-3 flex justify-between items-center px-1">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{tr('مصاريف الاستيراد', 'Import Expenses')}</h1>
                    <p className="text-gray-400 text-[10px] font-black mt-1 uppercase tracking-widest">{tr('توزيع التكاليف اللوجستية (Landing Cost)', 'Logistics Cost Allocation (Landing Cost)')}</p>
                </div>
                <div className="p-3 rounded-2xl bg-white shadow-sm border border-cyan-100 text-cyan-600">
                    <Ship size={22} />
                </div>
            </header>

            {!showWizard ? (
                <div className="space-y-3">
                    <div className="bg-slate-900 p-3 sm:p-4 rounded-2xl text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:scale-110 transition-transform duration-1000"><Calculator size={120} /></div>
                        <div className="relative z-10">
                            <h3 className="text-base font-black mb-1 flex items-center gap-2">{tr('توزيع مصاريف ذكي', 'Smart Expense Distribution')}</h3>
                            <p className="text-[10px] text-slate-400 font-bold mb-3 leading-relaxed">{tr('حمل تكاليف الشحن والجمارك على حساب المورد أو العميل المعني ووزعها على المخزون.', 'Allocate shipping and customs costs to the relevant supplier/customer account and distribute them to inventory.')}</p>
                            <button 
                                onClick={() => setShowWizard(true)}
                                className="w-full h-10 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-black text-xs shadow-xl shadow-cyan-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={16} />
                                {tr('بدء عملية توزيع جديدة', 'Start New Distribution')}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                            <input 
                                type="text"
                                placeholder={tr('بحث في السجلات...', 'Search records...')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full h-10 px-3 pr-9 bg-white rounded-xl border border-gray-100 shadow-sm outline-none font-bold text-xs"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2.5">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                            <select
                                value={distributionMethodFilter}
                                onChange={(e) => setDistributionMethodFilter(e.target.value as 'ALL' | 'VALUE' | 'QUANTITY' | 'MANUAL')}
                                className="h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
                            >
                                <option value="ALL">{tr('كل الطرق', 'All methods')}</option>
                                <option value="VALUE">{tr('حسب القيمة', 'By Value')}</option>
                                <option value="QUANTITY">{tr('حسب الكمية', 'By Quantity')}</option>
                                <option value="MANUAL">{tr('يدوي', 'Manual')}</option>
                            </select>
                            <select
                                value={distributionContactFilter}
                                onChange={(e) => setDistributionContactFilter(e.target.value)}
                                className="h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
                            >
                                <option value="ALL">{tr('كل الأطراف', 'All parties')}</option>
                                {distributionContactOptions.map(contact => (
                                    <option key={contact.id} value={contact.id}>{displayContactName(contact)}</option>
                                ))}
                            </select>
                            <EnglishDateInput
                                value={distributionFromDateFilter}
                                onChange={setDistributionFromDateFilter}
                                displayFormat="DMY"
                                wrapperClassName="w-full"
                                className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
                                placeholder={tr('من تاريخ', 'From date')}
                            />
                            <EnglishDateInput
                                value={distributionToDateFilter}
                                onChange={setDistributionToDateFilter}
                                displayFormat="DMY"
                                wrapperClassName="w-full"
                                className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
                                placeholder={tr('إلى تاريخ', 'To date')}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                value={toEnglishDigits(distributionMinAmountFilter)}
                                onChange={(e) => setDistributionMinAmountFilter(toEnglishDigits(e.target.value))}
                                className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
                                placeholder={tr('الحد الأدنى', 'Min amount')}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                value={toEnglishDigits(distributionMaxAmountFilter)}
                                onChange={(e) => setDistributionMaxAmountFilter(toEnglishDigits(e.target.value))}
                                className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
                                placeholder={tr('الحد الأعلى', 'Max amount')}
                            />
                        </div>
                        <div className="flex items-center justify-between mt-2 gap-2">
                            <span className="text-[10px] font-black text-gray-500">
                                {tr('نتائج الفلترة', 'Filtered results')}: <span className="text-slate-800">{filteredDistributionHistory.length}</span>
                            </span>
                            {hasDistributionFilters && (
                                <button
                                    type="button"
                                    onClick={clearDistributionFilters}
                                    className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-black"
                                >
                                    {tr('مسح الفلاتر', 'Clear filters')}
                                </button>
                            )}
                        </div>
                    </div>

                    {filteredDistributionHistory.length === 0 && (
                        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-100">
                            <History size={48} className="mx-auto text-gray-100 mb-4" />
                            <p className="text-gray-400 font-black text-sm uppercase tracking-widest">{tr('سجل عمليات التوزيع السابقة', 'Previous Distribution History')}</p>
                        </div>
                    )}
                    <div className="space-y-3">
                        {filteredDistributionHistory.map(record => {
                            const contact = contacts.find(c => c.id === record.contactId) || null;
                            const methodLabel = record.method === 'VALUE'
                                ? tr('حسب القيمة', 'By Value')
                                : record.method === 'QUANTITY'
                                    ? tr('حسب الكمية', 'By Quantity')
                                    : tr('يدوي', 'Manual');
                            return (
                                <div key={record.id} className="bg-white border border-gray-100 rounded-[2rem] p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <h4 className="font-black text-slate-800 text-sm">
                                                {record.description || tr('توزيع مصاريف استيراد', 'Import Expense Distribution')}
                                            </h4>
                                            <div className="text-[10px] text-gray-400 font-black mt-1 flex items-center gap-2 flex-wrap">
                                                <span>{formatDate(record.date)}</span>
                                                <span>•</span>
                                                <span>{methodLabel}</span>
                                                <span>•</span>
                                                <span>{contact ? displayContactName(contact) : tr('بدون طرف', 'No party')}</span>
                                            </div>
                                        </div>
                                        <div className="text-left">
                                            <div className="text-lg font-black text-cyan-700 dir-ltr">
                                                {Number(record.totalAmountBase || 0).toLocaleString('en-US')} {baseCurrency}
                                            </div>
                                            <div className="text-[10px] text-gray-400 font-black">
                                                {tr('فواتير', 'Invoices')}: {record.purchaseInvoiceIds.length} • {tr('بنود', 'Lines')}: {record.lines.length}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-gray-50 flex justify-end">
                                        <button type="button" onClick={() => startEditDistribution(record)} className="h-9 px-3 rounded-xl bg-cyan-50 text-cyan-700 text-xs font-black flex items-center gap-1.5">
                                            <Edit2 size={14} /> {tr('تعديل', 'Edit')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="animate-in slide-in-from-left-4 duration-500 pb-10">
                    <div className="flex items-center justify-between mb-8">
                        <button onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : resetWizard()} className="p-3 bg-white rounded-2xl border border-gray-100 text-gray-500 shadow-sm"><ArrowLeft size={20} className="rotate-180" /></button>
                        <div className="flex gap-2">
                            {[1, 2, 3].map(s => (
                                <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${wizardStep === s ? 'w-8 bg-cyan-600' : 'w-2 bg-gray-200'}`}></div>
                            ))}
                        </div>
                        <div className="text-[10px] font-black text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full uppercase tracking-widest">{tr('الخطوة', 'Step')} {wizardStep}/3</div>
                    </div>

                    {wizardStep === 1 && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
                                <h3 className="font-black text-slate-800 text-lg mb-6 flex items-center gap-3">
                                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><DollarSign size={20} /></div>
                                    {tr('بيانات المصروف والطرف', 'Expense and Party Data')}
                                </h3>
                                <div className="space-y-5">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-2">{tr('المبلغ المراد توزيعه (سيُقيد في حساب الطرف)', 'Amount to distribute (will be posted to party account)')}</label>
                                        <input 
                                            type="number" inputMode="decimal" 
                                            value={expenseAmount} 
                                            onChange={e => setExpenseAmount(e.target.value)}
                                            placeholder="0.00" 
                                            className="w-full p-5 bg-emerald-50 rounded-[1.8rem] border border-emerald-100 text-2xl font-black text-emerald-700 dir-ltr text-center outline-none focus:ring-4 ring-emerald-50/50"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-2">{tr('الطرف المستحق (مورد/عميل/شريك)', 'Payable Party (Supplier/Customer/Partner)')}</label>
                                        <div className="relative">
                                            <select 
                                                value={selectedContactId} 
                                                onChange={e => setSelectedContactId(e.target.value)} 
                                                className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-sm text-gray-800 appearance-none focus:ring-4 ring-blue-50"
                                            >
                                                <option value="">{tr('-- اختر الطرف المستحق --', '-- Select payable party --')}</option>
                                                {contacts.map(c => (
                                                    <option key={c.id} value={c.id}>{displayContactName(c)} ({c.type === 'SUPPLIER' ? tr('مورد', 'Supplier') : c.type === 'PARTNER' ? tr('شريك', 'Partner') : c.type === 'EMPLOYEE' ? tr('موظف', 'Employee') : tr('عميل', 'Customer')})</option>
                                                ))}
                                            </select>
                                            <Contact2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-2">{tr('وصف المصروف', 'Expense Description')}</label>
                                        <input 
                                            type="text"
                                            value={wizardDesc} 
                                            onChange={e => setWizardDesc(e.target.value)}
                                            placeholder={tr('مثال: جمارك ومناولة حاوية رقم 102', 'Example: Customs and handling for container #102')}
                                            className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none text-sm font-bold"
                                        />
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => (parseFloat(expenseAmount) > 0 && selectedContactId) ? setWizardStep(2) : alert(tr('يرجى تحديد المبلغ واختيار الطرف', 'Please set amount and select party'))}
                                className="w-full py-4.5 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all"
                            >
                                {tr('التالي: تحديد الفواتير', 'Next: Select Invoices')}
                            </button>
                        </div>
                    )}

                    {wizardStep === 2 && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
                                <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Receipt size={20} /></div>
                                    {tr('اختيار فواتير الشراء', 'Select Purchase Invoices')}
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold mb-6 px-1">{tr('اختر فاتورة واحدة أو أكثر ليتم تحميل المصروف على بنودها.', 'Choose one or more invoices to distribute this expense across their items.')}</p>
                                
                                <div className="max-h-[40vh] overflow-y-auto space-y-3 no-scrollbar pr-1">
                                    {invoices.filter(i => i.type === TransactionType.EXPENSE).map(inv => (
                                        <button 
                                            key={inv.id}
                                            onClick={() => setSelectedInvoiceIds(prev => prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id])}
                                            className={`w-full p-4.5 rounded-[1.8rem] border flex items-center justify-between transition-all ${selectedInvoiceIds.includes(inv.id) ? 'bg-blue-50 border-blue-200 ring-4 ring-blue-100 shadow-sm' : 'bg-gray-50 border-gray-100 hover:bg-white'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedInvoiceIds.includes(inv.id) ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-gray-200 border border-gray-100'}`}>
                                                    <CheckCircle size={18} />
                                                </div>
                                                <div className="text-start">
                                                    <h4 className="font-black text-xs text-slate-800">{inv.invoiceNumber}</h4>
                                                    <p className="text-[9px] font-bold text-gray-400">{formatDate(inv.date)} ? {displayContactName(contacts.find(c => c.id === inv.customerId) || null)}</p>
                                                </div>
                                            </div>
                                            <span className="font-black text-sm dir-ltr text-slate-700">{inv.totalAmount.toLocaleString('en-US')}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button 
                                onClick={() => selectedInvoiceIds.length > 0 ? setWizardStep(3) : alert(tr('يرجى اختيار فاتورة واحدة على الأقل', 'Please select at least one invoice'))}
                                className="w-full py-4.5 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all"
                            >
                                {tr('التالي: منهجية التوزيع', 'Next: Distribution Method')}
                            </button>
                        </div>
                    )}

                    {wizardStep === 3 && (
                        <div className="space-y-6 animate-in fade-in pb-10">
                            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
                                <h3 className="font-black text-slate-800 text-lg mb-6 flex items-center gap-3">
                                    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Percent size={20} /></div>
                                    {tr('طريقة توزيع التكاليف', 'Cost Distribution Method')}
                                </h3>
                                
                                <div className="grid grid-cols-3 gap-2 mb-8">
                                    {[
                                        { id: 'VALUE', label: tr('حسب السعر', 'By Value'), icon: <TrendingUp size={20} /> },
                                        { id: 'QUANTITY', label: tr('حسب الكمية', 'By Quantity'), icon: <Layers size={20} /> },
                                        { id: 'MANUAL', label: tr('توزيع يدوي', 'Manual'), icon: <Edit2 size={20} /> }
                                    ].map(m => (
                                        <button 
                                            key={m.id}
                                            onClick={() => setDistributionMethod(m.id as any)}
                                            className={`p-3.5 rounded-2xl border flex flex-col items-center gap-2 transition-all ${distributionMethod === m.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                        >
                                            {m.icon}
                                            <span className="text-[8px] font-black uppercase whitespace-nowrap">{m.label}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">
                                        <span>{tr('الصنف الموزع عليه', 'Distributed Item')}</span>
                                        <span>{tr('نصيبه من التكلفة', 'Allocated Cost')}</span>
                                    </div>
                                    <div className="space-y-3 max-h-[35vh] overflow-y-auto no-scrollbar pr-1">
                                        {allItemsToDistribute.map(item => {
                                            const projected = item.productId ? projectedPricingByProduct.get(item.productId) : undefined;
                                            return (
                                            <div key={item.key} className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between group hover:bg-white transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-[10px] font-black text-blue-500 shadow-sm">{item.quantity}</div>
                                                    <div>
                                                        <h4 className="font-black text-[11px] text-slate-800 line-clamp-1">
                                                            {item.productId ? displayProductName(products.find(p => p.id === item.productId) || null) : item.description}
                                                        </h4>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase">{item.invoiceNumber}</p>
                                                    </div>
                                                </div>
                                                <div className="text-end w-44">
                                                    {distributionMethod === 'MANUAL' ? (
                                                        <input 
                                                            type="number" inputMode="decimal"
                                                            value={manualAllocations[item.key] || ''}
                                                            onChange={e => setManualAllocations(prev => ({ ...prev, [item.key]: e.target.value }))}
                                                            className="w-full p-2 bg-white rounded-lg border border-gray-200 text-xs font-black dir-ltr text-center outline-none focus:ring-2 ring-indigo-100"
                                                            placeholder="0.00"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-black text-xs text-emerald-600 dir-ltr">+{distributions[item.key]?.toLocaleString('en-US')}</span>
                                                            <span className="text-[7px] text-gray-300 font-black uppercase mt-0.5 tracking-tighter">{tr('من أصل', 'out of')} {expenseAmount}</span>
                                                        </div>
                                                    )}
                                                    {projected && (
                                                        <div className="mt-1.5 text-[9px] font-black text-slate-500 leading-5">
                                                            <div className="dir-ltr">{tr('صافي التكلفة', 'Net Cost')}: {projected.nextCost.toLocaleString('en-US')}</div>
                                                            <div className="dir-ltr">{tr('جملة', 'Wholesale')}: {projected.wholesalePrice.toLocaleString('en-US')} | {tr('مفرق', 'Retail')}: {projected.retailPrice.toLocaleString('en-US')}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                </div>

                                <div className="mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-black text-cyan-700">{tr('قائمة أسعار البيع المقترحة بعد المصاريف', 'Suggested Selling Price List After Import Expenses')}</h4>
                                        <span className="text-[10px] font-black text-cyan-600">{projectedPricingRows.length}</span>
                                    </div>
                                    {projectedPricingRows.length === 0 ? (
                                        <p className="text-[11px] font-bold text-slate-500">{tr('لا توجد أصناف مخزنية لحساب أسعار بيع مقترحة.', 'No inventory items available for suggested selling prices.')}</p>
                                    ) : (
                                        <div className="space-y-2 max-h-44 overflow-y-auto no-scrollbar pr-1">
                                            {projectedPricingRows.map(entry => (
                                                <div key={entry.product.id} className="bg-white border border-cyan-100 rounded-xl p-3 text-[11px] font-black">
                                                    <div className="flex justify-between items-center mb-1.5">
                                                        <span className="text-slate-700">{displayProductName(entry.product)}</span>
                                                        <span className="text-slate-400 dir-ltr">{entry.totalQty.toLocaleString('en-US')}</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <div className="bg-blue-50 text-blue-700 rounded-lg px-2 py-1.5 dir-ltr">{tr('صافي التكلفة', 'Net Cost')}: {entry.nextCost.toLocaleString('en-US')}</div>
                                                        <div className="bg-violet-50 text-violet-700 rounded-lg px-2 py-1.5 dir-ltr">{tr('جملة', 'Wholesale')}: {entry.wholesalePrice.toLocaleString('en-US')}</div>
                                                        <div className="bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1.5 dir-ltr">{tr('مفرق', 'Retail')}: {entry.retailPrice.toLocaleString('en-US')}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl space-y-4">
                                <div className="flex justify-between items-center px-2">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{tr('إجمالي المبلغ الموزع', 'Total Distributed Amount')}</span>
                                    <div className="flex items-center gap-2">
                                        {isBalanced ? <CheckCircle2 size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-rose-400 animate-pulse" />}
                                        <h4 className={`text-2xl font-black dir-ltr tracking-tighter ${isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>{totalDistributed.toLocaleString('en-US')}</h4>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleConfirmDistribution}
                                    disabled={!isBalanced}
                                    className={`w-full py-4.5 rounded-[1.5rem] font-black text-sm shadow-xl transition-all flex items-center justify-center gap-3 ${isBalanced ? 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-900/50 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                                >
                                    <Save size={20} />
                                    {editingDistribution ? tr('حفظ التعديلات', 'Save Changes') : tr('ترحيل القيد وتحديث التكاليف', 'Post Entry and Update Costs')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ImportManager;
