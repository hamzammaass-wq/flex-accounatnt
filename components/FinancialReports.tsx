
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Account, AccountType, TransactionType, Product, Invoice, Check, Transaction, ImportExpenseDistribution } from '../types';
import EnglishDateInput from './EnglishDateInput';
import DocumentActions from './DocumentActions';
import { getDisplayAccountName, getDisplayContactName, getDisplayProductName } from '../utils/displayNames';
import { downloadElementAsPdf, exportElementAsCsv, printElementContent } from '../utils/documentExport';
import { getFiscalYear, getFiscalYearStart, isProfitLossAccount, isReportYearClosed } from '../utils/fiscalYear';
import {
    FileText, TrendingUp, Landmark, ChevronDown,
    ArrowLeft, Scale, Package, BarChart3, PieChart, Coins,
    ArrowRightLeft, Calendar, User, ShoppingBag, Layers, Activity,
    Building2, Wallet, Globe, ScrollText, CheckCircle2, XCircle, AlertCircle,
    Calculator, Percent, ArrowUpRight, ArrowDownLeft, Search, Filter, RotateCcw,
    RefreshCw, TrendingDown, Clock, BookOpen, ListFilter, Box, ClipboardList,
    UserCheck, Receipt, Banknote, ListChecks, Hash, Tag, FileSpreadsheet, Factory
} from 'lucide-react';

type ReportCategory = 'FINANCIAL' | 'SALES' | 'PURCHASES' | 'INVENTORY' | 'TREASURY' | 'JOURNALS' | 'MANUFACTURING' | 'ANALYTICS' | 'MENU';

type ReportType =
    | 'TRIAL_BALANCE' | 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'ACCOUNT_LEDGER'
    | 'CURRENCY_POSITIONS' | 'WORKING_CAPITAL' | 'STOCK_REMAINING' | 'LOW_STOCK_ALERTS' | 'ITEM_PROFIT'
    | 'DAILY_OPS' | 'DAILY_JOURNALS' | 'CASH_FLOW' | 'ACCOUNT_ACTIVITY'
    | 'CAT_TOTALS' | 'CUSTOMER_PROFIT' | 'CUSTOMER_AGING' | 'CUSTOMER_STATEMENT' | 'SUPPLIER_AGING' | 'SUPPLIER_STATEMENT' | 'SALES_BY_ITEM' | 'PURCHASES_BY_ITEM'
    | 'ITEM_MOVEMENT' | 'AVERAGE_COST_AUDIT' | 'CHECKS_IN' | 'CHECKS_OUT' | 'CHECKS_VAULT' | 'CHECKS_UNDER_COLLECTION_BANK' | 'CHECKS_MATURITY' | 'PURCHASES_LIST' | 'SALES_LIST'
    | 'PURCHASES_COST_SUMMARY' | 'PURCHASE_COST_BY_ITEM' | 'PURCHASE_PRICE_VARIANCE' | 'SUPPLIER_ANALYSIS' | 'IMPORT_EXPENSES_DETAIL'
    | 'RECEIPTS_LIST' | 'PAYMENTS_LIST' | 'MANUFACTURING_COST' | 'LIABILITIES_REPORT'
    | 'ACCOUNTING_ANALYTICS' | 'FINANCIAL_RATIOS' | 'EQUITY_CHANGES' | 'FIXED_ASSETS_CHANGES' | 'INVENTORY_COUNT_LIST'
    | 'MENU';

interface AccountNode extends Account {
    children: AccountNode[];
    nodeValue: number; // Aggregated net value
    selfValue: number; // Self net value
    totalDebit: number; // Aggregated debit
    totalCredit: number; // Aggregated credit
}

const AccountRow: React.FC<{
    node: AccountNode;
    level?: number;
    colorClass: string;
    formatValue: (val: number) => string;
    displayAccountName: (account: Pick<Account, 'id' | 'name'>) => string;
}> = ({ node, level = 0, colorClass, formatValue, displayAccountName }) => {
    // Skip if 0 balance and no children activity
    if (Math.abs(node.nodeValue) < 0.01 && node.children.every(c => Math.abs(c.nodeValue) < 0.01)) return null;

    return (
        <div className="flex flex-col">
            <div
                className={`flex justify-between items-center py-2 px-2 hover:bg-gray-50 rounded-lg transition-colors ${level === 0 ? 'font-black text-gray-800 bg-gray-50/50 mb-1' : 'text-xs text-gray-600'} ${level > 0 ? 'border-r-2 border-gray-100 pr-3' : ''}`}
                style={{ paddingRight: `${level * 1.5 + 0.5}rem` }}
            >
                <div className="flex items-center gap-2">
                    {level > 0 && <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>}
                    <span>{displayAccountName(node)} <span className="text-[9px] text-gray-300 font-normal">({node.code})</span></span>
                </div>
                <span className={`font-black dir-ltr ${colorClass} ${level === 0 ? 'text-sm' : ''}`}>
                    {formatValue(Math.abs(node.nodeValue))}
                </span>
            </div>
            {node.children.length > 0 && (
                <div className="border-r border-dashed border-gray-100 mr-4">
                    {node.children.map(child => <AccountRow key={child.id} node={child} level={level + 1} colorClass={colorClass} formatValue={formatValue} displayAccountName={displayAccountName} />)}
                </div>
            )}
        </div>
    );
};

const BalanceSheetSection: React.FC<{
    title: string;
    rootNode: AccountNode | undefined;
    color: string;
    formatValue: (val: number) => string;
    displayAccountName: (account: Pick<Account, 'id' | 'name'>) => string;
}> = ({ title, rootNode, color, formatValue, displayAccountName }) => {
    if (!rootNode) return null;
    return (
        <div className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm mb-4">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-50">
                <h4 className="font-black text-gray-800">{title}</h4>
                <span className={`font-black text-lg dir-ltr ${color}`}>{formatValue(rootNode.nodeValue)}</span>
            </div>
            <div className="space-y-1">
                {rootNode.children.map(child => <AccountRow key={child.id} node={child} colorClass="text-gray-600" formatValue={formatValue} displayAccountName={displayAccountName} />)}
            </div>
        </div>
    );
};

const FinancialReports: React.FC = () => {
    const { transactions, accounts, baseCurrency, products, invoices, contacts, fixedAssets, currencies, checks, boms, companySettings, importExpenseDistributions } = useAccounting();
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) => getDisplayProductName(product || undefined, isEnglish);

    const [activeReport, setActiveReport] = useState<ReportType>('MENU');
    const [activeCategory, setActiveCategory] = useState<ReportCategory>('MENU');
    const [reportCurrency, setReportCurrency] = useState(baseCurrency);
    const [dupontBasis, setDupontBasis] = useState<'NET_SALES' | 'TOTAL_REVENUE'>('NET_SALES');

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<string>('');
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

    useEffect(() => {
        if (accounts.length > 0 && !selectedLedgerAccount) {
            const cashAcc = accounts.find(a => a.id === 'acc_cash');
            setSelectedLedgerAccount(cashAcc?.id || accounts[0].id);
        }
        if (products.length > 0 && !selectedProductId) {
            setSelectedProductId(products[0].id);
        }
        if (!selectedCustomerId) {
            const firstCustomer = contacts.find(c => c.type === 'CUSTOMER');
            if (firstCustomer) setSelectedCustomerId(firstCustomer.id);
        }
        if (!selectedSupplierId) {
            const firstSupplier = contacts.find(c => c.type === 'SUPPLIER');
            if (firstSupplier) setSelectedSupplierId(firstSupplier.id);
        }
    }, [accounts, products, contacts, selectedCustomerId, selectedSupplierId]);

    const formatValue = (amountInBase: number) => {
        const targetCurrencyObj = currencies.find(c => c.code === reportCurrency);
        const targetRate = targetCurrencyObj ? targetCurrencyObj.rate : 1;
        const converted = amountInBase / targetRate;

        return new Intl.NumberFormat(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn', {
            style: 'currency',
            currency: reportCurrency,
            maximumFractionDigits: 2
        }).format(converted);
    };

    const formatPlainNumber = (value: number) =>
        new Intl.NumberFormat(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn', {
            maximumFractionDigits: 2
        }).format(value);

    const getOperationCategoryLabel = (category?: string) => {
        switch (category) {
            case 'sales_invoice': return tr('فاتورة مبيعات', 'Sales Invoice');
            case 'sales_return': return tr('مرتجع مبيعات', 'Sales Return');
            case 'purchase_invoice': return tr('فاتورة مشتريات', 'Purchase Invoice');
            case 'purchase_return': return tr('مرتجع مشتريات', 'Purchase Return');
            case 'receipt': return tr('سند قبض', 'Receipt Voucher');
            case 'payment': return tr('سند صرف', 'Payment Voucher');
            case 'journal': return tr('قيد يومية', 'Journal Entry');
            default: return category || tr('عملية', 'Operation');
        }
    };

    const renderStatementOperationDetails = (tx: Transaction, controlAccountIds: string[]) => {
        const invoice = tx.invoiceId ? invoices.find(inv => inv.id === tx.invoiceId) : undefined;
        const voucherTransactions = tx.voucherId
            ? transactions.filter(line => line.voucherId === tx.voucherId)
            : [tx];

        const checkIds = Array.from(new Set(
            voucherTransactions
                .map(line => line.checkId)
                .filter((id): id is string => Boolean(id))
        ));

        const relatedChecks = checkIds
            .map(id => checks.find(ch => ch.id === id))
            .filter((ch): ch is Check => Boolean(ch));

        const counterpartAccountIds = Array.from(new Set(
            voucherTransactions
                .flatMap(line => [line.debitAccountId, line.creditAccountId])
                .filter((id): id is string => Boolean(id && !controlAccountIds.includes(id)))
        ));

        const counterpartAccounts = counterpartAccountIds
            .map(id => accounts.find(acc => acc.id === id))
            .filter((acc): acc is Account => Boolean(acc));

        const hasDetails = Boolean(
            tx.voucherId ||
            tx.invoiceId ||
            tx.category ||
            invoice ||
            relatedChecks.length > 0 ||
            counterpartAccounts.length > 0
        );

        if (!hasDetails) return null;

        return (
            <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {tx.voucherId && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-black">
                            {tr('السند', 'Voucher')}: {tx.voucherId}
                        </span>
                    )}
                    {invoice && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-black">
                            {tr('فاتورة', 'Invoice')}: #{invoice.invoiceNumber}
                        </span>
                    )}
                    {tx.category && (
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-black">
                            {getOperationCategoryLabel(tx.category)}
                        </span>
                    )}
                </div>

                {counterpartAccounts.length > 0 && (
                    <div className="text-[10px] text-gray-500 font-bold">
                        <span className="text-gray-400">{tr('الحسابات المقابلة', 'Counter accounts')}:</span>{' '}
                        {counterpartAccounts.map(acc => displayAccountName(acc)).join(' • ')}
                    </div>
                )}

                {relatedChecks.length > 0 && (
                    <div className="space-y-1">
                        {relatedChecks.map(check => (
                            <div key={check.id} className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-[10px] text-gray-600">
                                <div className="grid grid-cols-2 gap-2">
                                    <div><span className="font-black text-gray-700">{tr('شيك', 'Check')}:</span> {check.checkNumber}</div>
                                    <div><span className="font-black text-gray-700">{tr('البنك', 'Bank')}:</span> {displayAccountName(check.bankAccountId ? accounts.find(a => a.id === check.bankAccountId) || null : { id: '', name: check.bankName })}</div>
                                    <div><span className="font-black text-gray-700">{tr('الاستحقاق', 'Due')}:</span> {check.dueDate}</div>
                                    <div className="dir-ltr"><span className="font-black text-emerald-600">{tr('القيمة', 'Amount')}:</span> {formatPlainNumber(check.amount)} {check.currency}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {invoice && (
                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                        <div className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-2 p-2 text-[10px] font-black text-gray-500 bg-gray-50">
                            <div>{tr('الصنف', 'Item')}</div>
                            <div className="text-center">{tr('الكمية', 'Qty')}</div>
                            <div className="text-center">{tr('السعر', 'Price')}</div>
                            <div className="text-center">{tr('الإجمالي', 'Total')}</div>
                        </div>
                        {invoice.items.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            return (
                                <div key={item.id} className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-2 p-2 text-[10px] text-gray-600 border-t border-gray-50">
                                    <div className="truncate">{item.description || displayProductName(product)}</div>
                                    <div className="text-center dir-ltr">{formatPlainNumber(item.quantity)}</div>
                                    <div className="text-center dir-ltr">{formatPlainNumber(item.unitPrice)}</div>
                                    <div className="text-center dir-ltr font-bold">{formatPlainNumber(item.total)}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const renderStatementLedgerDetails = (tx: Transaction, controlAccountIds: string[]) => {
        const invoice = tx.invoiceId ? invoices.find(inv => inv.id === tx.invoiceId) : undefined;
        const voucherTransactions = tx.voucherId
            ? transactions.filter(line => line.voucherId === tx.voucherId)
            : [tx];

        const checkIds = Array.from(new Set(
            voucherTransactions
                .map(line => line.checkId)
                .filter((id): id is string => Boolean(id))
        ));

        const relatedChecks = checkIds
            .map(id => checks.find(ch => ch.id === id))
            .filter((ch): ch is Check => Boolean(ch));

        const counterpartAccountIds = Array.from(new Set(
            voucherTransactions
                .flatMap(line => [line.debitAccountId, line.creditAccountId])
                .filter((id): id is string => Boolean(id && !controlAccountIds.includes(id)))
        ));

        const counterpartAccounts = counterpartAccountIds
            .map(id => accounts.find(acc => acc.id === id))
            .filter((acc): acc is Account => Boolean(acc));

        const hasDetails = Boolean(
            tx.voucherId ||
            tx.invoiceId ||
            tx.category ||
            invoice ||
            relatedChecks.length > 0 ||
            counterpartAccounts.length > 0
        );

        if (!hasDetails) return null;

        return (
            <div className="statement-operation-details mt-2 space-y-2">
                <div className="statement-operation-badges flex flex-wrap gap-1.5 text-[10px]">
                    {tx.voucherId && (
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-black text-indigo-700">
                            {tr('السند', 'Voucher')}: {tx.voucherId}
                        </span>
                    )}
                    {invoice && (
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 font-black text-blue-700">
                            {tr('فاتورة', 'Invoice')}: #{invoice.invoiceNumber}
                        </span>
                    )}
                    {tx.category && (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 font-black text-gray-600">
                            {getOperationCategoryLabel(tx.category)}
                        </span>
                    )}
                </div>

                {counterpartAccounts.length > 0 && (
                    <div className="statement-detail-note rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 text-[10px] font-bold text-slate-600">
                        <span className="text-gray-400">{tr('الحسابات المقابلة', 'Counter accounts')}:</span>{' '}
                        {counterpartAccounts.map(acc => displayAccountName(acc)).join(' • ')}
                    </div>
                )}

                {relatedChecks.length > 0 && (
                    <div className="statement-check-list space-y-1.5">
                        {relatedChecks.map(check => (
                            <div key={check.id} className="statement-detail-card rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 text-[10px] text-slate-600">
                                <div className="statement-detail-grid grid gap-1.5 sm:grid-cols-2">
                                    <div><span className="font-black text-slate-700">{tr('شيك', 'Check')}:</span> {check.checkNumber}</div>
                                    <div><span className="font-black text-slate-700">{tr('البنك', 'Bank')}:</span> {displayAccountName(check.bankAccountId ? accounts.find(a => a.id === check.bankAccountId) || null : { id: '', name: check.bankName })}</div>
                                    <div><span className="font-black text-slate-700">{tr('الاستحقاق', 'Due')}:</span> <span className="statement-ledger-date dir-ltr">{check.dueDate}</span></div>
                                    <div className="statement-ledger-amount dir-ltr"><span className="font-black text-emerald-600">{tr('القيمة', 'Amount')}:</span> {formatPlainNumber(check.amount)} {check.currency}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {invoice && (
                    <div className="statement-detail-card rounded-xl border border-blue-100 bg-blue-50/40 p-2.5">
                        <div className="mb-2 text-[10px] font-black text-blue-700">
                            {tr('بنود الفاتورة', 'Invoice items')}
                        </div>
                        <div className="statement-line-items space-y-1.5">
                            {invoice.items.map(item => {
                                const product = products.find(p => p.id === item.productId);
                                return (
                                    <div key={item.id} className="rounded-lg border border-white/80 bg-white/90 px-2.5 py-2 text-[10px] text-slate-600 shadow-sm">
                                        <div className="font-black text-slate-700">
                                            {item.description || displayProductName(product)}
                                        </div>
                                        <div className="statement-line-item-meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                            <span className="statement-ledger-amount dir-ltr">
                                                {tr('الكمية', 'Qty')}: {formatPlainNumber(item.quantity)}
                                            </span>
                                            <span className="statement-ledger-amount dir-ltr">
                                                {tr('السعر', 'Price')}: {formatPlainNumber(item.unitPrice)}
                                            </span>
                                            <span className="statement-ledger-amount dir-ltr font-black text-slate-700">
                                                {tr('الإجمالي', 'Total')}: {formatPlainNumber(item.total)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const reportYearCloseEnabled = companySettings.reportYearCloseEnabled !== false;
    const showFiscalCloseBadge = companySettings.showFiscalCloseBadgeInReports !== false;
    const fiscalStartDate = getFiscalYearStart(getFiscalYear(startDate));
    const todayIso = new Date().toISOString().split('T')[0];
    const reportYearClosed = isReportYearClosed(startDate, endDate, todayIso);

    const financialData = useMemo(() => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const fiscalYearStart = getFiscalYearStart(getFiscalYear(startDate));

        const balances: Record<string, {
            openingDebit: number;
            openingCredit: number;
            periodDebit: number;
            periodCredit: number;
            debit: number;
            credit: number;
            openingNet: number;
            periodNet: number;
            net: number;
        }> = {};
        const plBeforeRange = { revenue: 0, expense: 0 };

        accounts.forEach(acc => {
            balances[acc.id] = {
                openingDebit: 0,
                openingCredit: 0,
                periodDebit: 0,
                periodCredit: 0,
                debit: 0,
                credit: 0,
                openingNet: 0,
                periodNet: 0,
                net: 0
            };
        });

        transactions.forEach(t => {
            if (t.status === 'DRAFT') return;
            const tDate = new Date(t.date);
            const amountInBase = t.amount * (t.exchangeRate || 1);
            const accD = accounts.find(a => a.id === t.debitAccountId);
            const accC = accounts.find(a => a.id === t.creditAccountId);

            const isBeforeRange = tDate < start;
            const isInRange = tDate >= start && tDate <= end;

            const shouldIncludeOpeningFor = (acc: Account): boolean => {
                if (!isBeforeRange) return false;
                if (!reportYearCloseEnabled || !isProfitLossAccount(acc.type)) return true;
                return t.date >= fiscalYearStart;
            };

            if (accD) {
                if (isInRange) {
                    balances[accD.id].periodDebit += amountInBase;
                } else if (shouldIncludeOpeningFor(accD)) {
                    balances[accD.id].openingDebit += amountInBase;
                }
                if (isBeforeRange && accD.type === 'REVENUE' && (!reportYearCloseEnabled || t.date < fiscalYearStart)) {
                    plBeforeRange.revenue += amountInBase;
                }
                if (isBeforeRange && accD.type === 'EXPENSE' && (!reportYearCloseEnabled || t.date < fiscalYearStart)) {
                    plBeforeRange.expense += amountInBase;
                }
            }
            if (accC) {
                if (isInRange) {
                    balances[accC.id].periodCredit += amountInBase;
                } else if (shouldIncludeOpeningFor(accC)) {
                    balances[accC.id].openingCredit += amountInBase;
                }
                if (isBeforeRange && accC.type === 'REVENUE' && (!reportYearCloseEnabled || t.date < fiscalYearStart)) {
                    plBeforeRange.revenue -= amountInBase;
                }
                if (isBeforeRange && accC.type === 'EXPENSE' && (!reportYearCloseEnabled || t.date < fiscalYearStart)) {
                    plBeforeRange.expense -= amountInBase;
                }
            }
        });

        // Compute account net by normal balance nature.
        accounts.forEach(acc => {
            const bucket = balances[acc.id];
            if (!bucket) return;
            const isDebitNature = acc.type === 'ASSET' || acc.type === 'EXPENSE';
            bucket.debit = bucket.openingDebit + bucket.periodDebit;
            bucket.credit = bucket.openingCredit + bucket.periodCredit;

            bucket.openingNet = isDebitNature
                ? bucket.openingDebit - bucket.openingCredit
                : bucket.openingCredit - bucket.openingDebit;
            bucket.periodNet = isDebitNature
                ? bucket.periodDebit - bucket.periodCredit
                : bucket.periodCredit - bucket.periodDebit;
            bucket.net = bucket.openingNet + bucket.periodNet;
        });


        const accountMap = new Map<string, AccountNode>();
        const rootNodes: AccountNode[] = [];

        // 1. Initialize Nodes
        accounts.forEach(acc => {
            accountMap.set(acc.id, {
                ...acc,
                children: [],
                nodeValue: 0,
                selfValue: balances[acc.id]?.net || 0,
                totalDebit: balances[acc.id]?.debit || 0,
                totalCredit: balances[acc.id]?.credit || 0
            });
        });

        // 2. Build Hierarchy
        accounts.forEach(acc => {
            const node = accountMap.get(acc.id)!;
            if (acc.parentId && accountMap.has(acc.parentId)) {
                accountMap.get(acc.parentId)!.children.push(node);
            } else {
                rootNodes.push(node);
            }
        });

        // 3. Aggregate Values (Post-order traversal)
        const aggregate = (node: AccountNode) => {
            let sumNet = node.selfValue;
            let sumDebit = node.totalDebit;
            let sumCredit = node.totalCredit;

            node.children.forEach(child => {
                aggregate(child);
                sumNet += child.nodeValue;
                sumDebit += child.totalDebit;
                sumCredit += child.totalCredit;
            });

            node.nodeValue = sumNet;
            node.totalDebit = sumDebit;
            node.totalCredit = sumCredit;
        };

        rootNodes.forEach(aggregate);

        return {
            balances,
            priorProfit: plBeforeRange.revenue - plBeforeRange.expense,
            accountTree: rootNodes,
            accountMap
        };
    }, [transactions, accounts, startDate, endDate, reportYearCloseEnabled]);

    const getBalanceNature = (accType: AccountType, net: number) => {
        if (Math.abs(net) < 0.01) return '-';
        const debitNature = accType === 'ASSET' || accType === 'EXPENSE';
        if (net >= 0) return debitNature ? tr('مدين', 'Debit') : tr('دائن', 'Credit');
        return debitNature ? tr('دائن', 'Credit') : tr('مدين', 'Debit');
    };

    const getDetailedAccounts = (allowedTypes: AccountType[], mode: 'closing' | 'period' = 'closing') => {
        return accounts
            .filter(acc => !acc.isGroup && allowedTypes.includes(acc.type))
            .map(acc => {
                const bal = financialData.balances[acc.id] || { debit: 0, credit: 0, net: 0 };
                if (mode === 'period') {
                    return {
                        ...acc,
                        debit: bal.periodDebit || 0,
                        credit: bal.periodCredit || 0,
                        net: bal.periodNet || 0
                    };
                }
                return {
                    ...acc,
                    debit: bal.debit || 0,
                    credit: bal.credit || 0,
                    net: bal.net || 0
                };
            })
            .filter(acc => Math.abs(acc.debit) > 0.01 || Math.abs(acc.credit) > 0.01 || Math.abs(acc.net) > 0.01)
            .sort((a, b) => a.code.localeCompare(b.code, 'ar'));
    };

    const safeDivide = (numerator: number, denominator: number) => {
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
        return numerator / denominator;
    };

    const analyticsData = useMemo(() => {
        const postedTransactions = transactions.filter(t => t.status !== 'DRAFT');
        const inRangeTransactions = postedTransactions.filter(t => t.date >= startDate && t.date <= endDate);
        const inRangeInvoices = invoices.filter(inv => (inv.postingStatus || 'POSTED') !== 'DRAFT' && inv.date >= startDate && inv.date <= endDate);

        const leafAccounts = accounts.filter(acc => !acc.isGroup);
        const periodRevenueAccounts = leafAccounts
            .filter(acc => acc.type === 'REVENUE')
            .map(acc => {
                const bal = financialData.balances[acc.id];
                return {
                    ...acc,
                    periodNet: bal?.periodNet || 0,
                    periodDebit: bal?.periodDebit || 0,
                    periodCredit: bal?.periodCredit || 0,
                    periodMovement: (bal?.periodDebit || 0) + (bal?.periodCredit || 0)
                };
            });
        const periodExpenseAccounts = leafAccounts
            .filter(acc => acc.type === 'EXPENSE')
            .map(acc => {
                const bal = financialData.balances[acc.id];
                return {
                    ...acc,
                    periodNet: bal?.periodNet || 0,
                    periodDebit: bal?.periodDebit || 0,
                    periodCredit: bal?.periodCredit || 0,
                    periodMovement: (bal?.periodDebit || 0) + (bal?.periodCredit || 0)
                };
            });
        const allLeafPeriodActivity = leafAccounts
            .map(acc => {
                const bal = financialData.balances[acc.id];
                return {
                    ...acc,
                    periodNet: bal?.periodNet || 0,
                    periodDebit: bal?.periodDebit || 0,
                    periodCredit: bal?.periodCredit || 0,
                    periodMovement: (bal?.periodDebit || 0) + (bal?.periodCredit || 0)
                };
            })
            .filter(acc => acc.periodMovement > 0.009)
            .sort((a, b) => b.periodMovement - a.periodMovement);

        const totalRevenue = periodRevenueAccounts.reduce((sum, acc) => sum + acc.periodNet, 0);
        const totalExpense = periodExpenseAccounts.reduce((sum, acc) => sum + acc.periodNet, 0);
        const netProfit = totalRevenue - totalExpense;

        const nodeValue = (id: string) => financialData.accountMap.get(id)?.nodeValue || 0;
        const subtreeCache = new Map<string, { opening: number; period: number; closing: number }>();
        const getSubtreeTotals = (rootId: string) => {
            const cached = subtreeCache.get(rootId);
            if (cached) return cached;

            const rootNode = financialData.accountMap.get(rootId);
            if (!rootNode) {
                const empty = { opening: 0, period: 0, closing: 0 };
                subtreeCache.set(rootId, empty);
                return empty;
            }

            let opening = 0;
            let period = 0;
            let closing = 0;
            const walk = (node: AccountNode) => {
                const bal = financialData.balances[node.id];
                if (bal) {
                    opening += bal.openingNet || 0;
                    period += bal.periodNet || 0;
                    closing += bal.net || 0;
                }
                node.children.forEach(walk);
            };
            walk(rootNode);

            const result = { opening, period, closing };
            subtreeCache.set(rootId, result);
            return result;
        };

        const currentAssets = nodeValue('acc_current_assets');
        const currentLiabilities = nodeValue('acc_current_liabilities');
        const cashOnHand = nodeValue('acc_cash_root');
        const bankBalances = nodeValue('acc_bank_root');
        const receivables = nodeValue('acc_receivable_group');
        const inventoryValue = nodeValue('acc_inventory_group');
        const notesReceivable = nodeValue('acc_notes_receivable');
        const payables = Math.max(0, nodeValue('acc_payable'));
        const totalAssets = Math.max(0, nodeValue('acc_assets'));
        const totalLiabilities = Math.max(0, nodeValue('acc_liabilities'));
        const totalEquity = Math.max(0, nodeValue('acc_equity_root') + financialData.priorProfit);
        const liquidAssets = Math.max(0, cashOnHand + bankBalances + receivables + notesReceivable);
        const quickAssets = Math.max(0, liquidAssets - inventoryValue);

        const openingInventoryValue = Math.max(0, getSubtreeTotals('acc_inventory_group').opening);
        const openingReceivables = Math.max(0, getSubtreeTotals('acc_receivable_group').opening);
        const openingPayables = Math.max(0, getSubtreeTotals('acc_payable').opening);
        const openingTotalAssets = Math.max(0, getSubtreeTotals('acc_assets').opening);
        const openingTotalEquity = Math.max(0, getSubtreeTotals('acc_equity_root').opening + financialData.priorProfit);

        const invoiceTotalBase = (inv: Invoice) => (inv.totalAmount || 0) * (inv.exchangeRate || 1);
        const byCategory = {
            sales: inRangeInvoices.filter(inv => inv.type === TransactionType.INCOME && inv.category === 'sales_invoice' && inv.status !== 'QUOTATION'),
            purchases: inRangeInvoices.filter(inv => inv.category === 'purchase_invoice'),
            expenses: inRangeInvoices.filter(inv => inv.category === 'general_expense'),
            importExpenses: inRangeInvoices.filter(inv => inv.category === 'import_expenses'),
            salesReturns: inRangeInvoices.filter(inv => inv.category === 'sales_return'),
            purchaseReturns: inRangeInvoices.filter(inv => inv.category === 'purchase_return'),
            quotations: invoices.filter(inv => inv.status === 'QUOTATION' && inv.date >= startDate && inv.date <= endDate)
        };

        const salesTotal = byCategory.sales.reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const purchasesTotal = byCategory.purchases.reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const expensesDocsTotal = byCategory.expenses.reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const importExpensesTotal = byCategory.importExpenses.reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const salesReturnsTotal = byCategory.salesReturns.reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const purchaseReturnsTotal = byCategory.purchaseReturns.reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const creditSalesTotal = byCategory.sales.filter(inv => inv.paymentType === 'CREDIT').reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const creditPurchasesTotal = byCategory.purchases.filter(inv => inv.paymentType === 'CREDIT').reduce((sum, inv) => sum + invoiceTotalBase(inv), 0);
        const avgSalesInvoice = byCategory.sales.length > 0 ? salesTotal / byCategory.sales.length : 0;
        const avgPurchaseInvoice = byCategory.purchases.length > 0 ? purchasesTotal / byCategory.purchases.length : 0;

        const netSales = Math.max(0, salesTotal - salesReturnsTotal);
        const netPurchases = Math.max(0, purchasesTotal - purchaseReturnsTotal);
        const cogsValue = Math.max(0, getSubtreeTotals('acc_cogs').period);
        const grossProfit = netSales - cogsValue;
        const avgInventoryValue = (openingInventoryValue + Math.max(0, inventoryValue)) / 2;
        const avgReceivables = (openingReceivables + Math.max(0, receivables)) / 2;
        const avgPayables = (openingPayables + Math.max(0, payables)) / 2;
        const avgTotalAssets = (openingTotalAssets + Math.max(0, totalAssets)) / 2;
        const avgTotalEquity = (openingTotalEquity + Math.max(0, totalEquity)) / 2;
        const periodDays = Math.max(
            1,
            Math.floor(
                (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000
            ) + 1
        );

        const dupontSalesBase = netSales > 0 ? netSales : totalRevenue;

        const receiptVoucherIds = new Set(inRangeTransactions.filter(t => t.category === 'receipt').map(t => t.voucherId || t.id));
        const paymentVoucherIds = new Set(inRangeTransactions.filter(t => t.category === 'payment').map(t => t.voucherId || t.id));

        const receiptsTotal = inRangeTransactions
            .filter(t => t.category === 'receipt')
            .reduce((sum, t) => sum + (t.amount * (t.exchangeRate || 1)), 0);
        const paymentsTotal = inRangeTransactions
            .filter(t => t.category === 'payment')
            .reduce((sum, t) => sum + (t.amount * (t.exchangeRate || 1)), 0);

        const topRevenueAccounts = periodRevenueAccounts
            .filter(acc => Math.abs(acc.periodNet) > 0.01)
            .sort((a, b) => Math.abs(b.periodNet) - Math.abs(a.periodNet))
            .slice(0, 5);

        const topExpenseAccounts = periodExpenseAccounts
            .filter(acc => Math.abs(acc.periodNet) > 0.01)
            .sort((a, b) => Math.abs(b.periodNet) - Math.abs(a.periodNet))
            .slice(0, 5);

        const ratios = {
            currentRatio: safeDivide(currentAssets, currentLiabilities),
            quickRatio: safeDivide(quickAssets, currentLiabilities),
            cashRatio: safeDivide(Math.max(0, cashOnHand + bankBalances), currentLiabilities),
            debtRatio: safeDivide(totalLiabilities, totalAssets),
            debtToEquity: safeDivide(totalLiabilities, totalEquity),
            netProfitMargin: safeDivide(netProfit, totalRevenue),
            expenseToRevenue: safeDivide(totalExpense, totalRevenue),
            returnOnAssets: safeDivide(netProfit, totalAssets),
            returnOnEquity: safeDivide(netProfit, totalEquity),
            receivablesToSales: safeDivide(receivables, salesTotal),
            inventoryToCurrentAssets: safeDivide(inventoryValue, currentAssets),

            grossMargin: safeDivide(grossProfit, dupontSalesBase),
            inventoryTurnover: safeDivide(cogsValue, avgInventoryValue),
            dioDays: safeDivide(avgInventoryValue * periodDays, Math.max(0, cogsValue)),
            dsoDays: safeDivide(avgReceivables * periodDays, Math.max(0, creditSalesTotal)),
            dpoDays: safeDivide(avgPayables * periodDays, Math.max(0, creditPurchasesTotal)),

            dupontProfitMargin: safeDivide(netProfit, dupontSalesBase),
            dupontAssetTurnover: safeDivide(dupontSalesBase, avgTotalAssets),
            dupontEquityMultiplier: safeDivide(avgTotalAssets, avgTotalEquity),
            dupontRoe: null as number | null,
            cashConversionCycleDays: null as number | null
        };

        const dupontRoe =
            ratios.dupontProfitMargin !== null &&
            ratios.dupontAssetTurnover !== null &&
            ratios.dupontEquityMultiplier !== null
                ? ratios.dupontProfitMargin * ratios.dupontAssetTurnover * ratios.dupontEquityMultiplier
                : null;
        ratios.dupontRoe = dupontRoe;
        ratios.cashConversionCycleDays =
            ratios.dioDays !== null && ratios.dsoDays !== null && ratios.dpoDays !== null
                ? (ratios.dioDays + ratios.dsoDays - ratios.dpoDays)
                : null;

        return {
            totalRevenue,
            totalExpense,
            netProfit,
            currentAssets,
            currentLiabilities,
            cashOnHand,
            bankBalances,
            receivables,
            inventoryValue,
            payables,
            totalAssets,
            totalLiabilities,
            totalEquity,
            quickAssets,
            liquidAssets,
            receiptsTotal,
            paymentsTotal,
            salesTotal,
            netSales,
            salesReturnsTotal,
            purchasesTotal,
            netPurchases,
            purchaseReturnsTotal,
            creditSalesTotal,
            creditPurchasesTotal,
            expensesDocsTotal,
            importExpensesTotal,
            avgSalesInvoice,
            avgPurchaseInvoice,
            cogsValue,
            grossProfit,
            periodDays,
            openingInventoryValue,
            avgInventoryValue,
            avgReceivables,
            avgPayables,
            avgTotalAssets,
            avgTotalEquity,
            postedTransactionsCount: inRangeTransactions.length,
            receiptVoucherCount: receiptVoucherIds.size,
            paymentVoucherCount: paymentVoucherIds.size,
            documentCounts: {
                sales: byCategory.sales.length,
                purchases: byCategory.purchases.length,
                expenses: byCategory.expenses.length,
                importExpenses: byCategory.importExpenses.length,
                salesReturns: byCategory.salesReturns.length,
                purchaseReturns: byCategory.purchaseReturns.length,
                quotations: byCategory.quotations.length,
            },
            topRevenueAccounts,
            topExpenseAccounts,
            topActiveAccounts: allLeafPeriodActivity.slice(0, 8),
            ratios
        };
    }, [transactions, invoices, accounts, financialData, startDate, endDate]);

    const formatPercent = (ratioValue: number | null, digits = 1) => {
        if (ratioValue === null) return tr('غير متاح', 'N/A');
        return `${(ratioValue * 100).toFixed(digits)}%`;
    };

    const formatRatioX = (ratioValue: number | null, digits = 2) => {
        if (ratioValue === null) return tr('غير متاح', 'N/A');
        return `${ratioValue.toFixed(digits)}x`;
    };

    const activeReportRef = useRef<HTMLDivElement | null>(null);

    const buildReportShareText = (title: string) => [
        title,
        `${tr('������', 'Period')}: ${startDate} - ${endDate}`,
        `${tr('������', 'Currency')}: ${reportCurrency}`
    ].join('\n');

    const handleSaveReportPdf = async (title: string) => {
        const success = await downloadElementAsPdf(activeReportRef.current, {
            title: `${title} - ${startDate} - ${endDate}`,
            fileName: `${title}-${startDate}-${endDate}`,
            dir: isEnglish ? 'ltr' : 'rtl',
            lang: isEnglish ? 'en' : 'ar',
            backgroundColor: '#f9fafb',
            padding: 18
        });
        if (!success) {
            alert(tr('تعذر حفظ التقرير بصيغة PDF حاليًا.', 'Could not save this report as PDF right now.'));
        }
    };

    const handlePrintActiveReport = (title: string) => {
        const success = printElementContent(activeReportRef.current, {
            title: `${title} - ${startDate} - ${endDate}`,
            dir: isEnglish ? 'ltr' : 'rtl',
            lang: isEnglish ? 'en' : 'ar'
        });
        if (!success) {
            alert(tr('تعذر فتح نافذة طباعة التقرير.', 'Could not open the report print window.'));
        }
    };

    const handleExportReportExcel = (title: string) => {
        const success = exportElementAsCsv(activeReportRef.current, `${title}-${startDate}-${endDate}`);
        if (!success) {
            alert(tr('���� ����� ��� ������� ������.', 'Could not export this report right now.'));
        }
    };

    const RatioCard = ({
        title,
        value,
        description,
        tone = 'blue'
    }: {
        title: string;
        value: string;
        description: string;
        tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'gray' | 'cyan';
    }) => {
        const toneClasses = {
            blue: 'bg-blue-50 border-blue-100 text-blue-700',
            emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
            amber: 'bg-amber-50 border-amber-100 text-amber-700',
            rose: 'bg-rose-50 border-rose-100 text-rose-700',
            indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
            gray: 'bg-gray-50 border-gray-100 text-gray-700',
            cyan: 'bg-cyan-50 border-cyan-100 text-cyan-700'
        } as const;
        return (
            <div className={`p-4 rounded-2xl border ${toneClasses[tone]}`}>
                <p className="text-[10px] font-black opacity-80 uppercase tracking-widest">{title}</p>
                <h4 className="mt-2 text-2xl font-black dir-ltr">{value}</h4>
                <p className="mt-1 text-[10px] font-bold opacity-70">{description}</p>
            </div>
        );
    };



    const ReportHeader = ({ title }: { title: string }) => (
        <div className="report-header sticky top-[calc(var(--app-safe-top)+0.25rem)] z-40 mb-2 flex flex-col gap-1.5 bg-gray-50/95 pb-1.5 pt-1 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                    <button
                        onClick={() => setActiveReport('MENU')}
                        className="h-9 w-9 shrink-0 rounded-xl border border-gray-100 bg-white text-gray-500 shadow-sm flex items-center justify-center"
                    >
                        <ArrowLeft className={isEnglish ? '' : 'rotate-180'} size={15} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="break-words text-[13px] font-black text-gray-800 sm:text-base">{title}</h2>
                        <p className="dir-ltr text-[9px] font-bold uppercase tracking-widest text-gray-400">{startDate} - {endDate}</p>
                    </div>
                </div>
                <DocumentActions
                    title={title}
                    shareText={buildReportShareText(title)}
                    isEnglish={isEnglish}
                    tr={tr}
                    onPrint={() => handlePrintActiveReport(title)}
                    onSave={() => handleSaveReportPdf(title)}
                    onExcel={() => handleExportReportExcel(title)}
                    saveTitle={tr('حفظ PDF', 'Save PDF')}
                    saveButtonIcon="fileText"
                    showSaveButton
                />
            </div>

            {showFiscalCloseBadge && (
                <div
                    className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black ${
                        reportYearClosed
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : 'border-amber-100 bg-amber-50 text-amber-700'
                    }`}
                >
                    {reportYearClosed
                        ? tr('مغلق (إقفال تقريري سنوي)', 'Closed (Report-Year Close)')
                        : tr('سنة مالية مفتوحة', 'Open Fiscal Year')}
                    {reportYearCloseEnabled && (
                        <span className="dir-ltr text-[9px] opacity-80">
                            {tr('تصفير قائمة الدخل من', 'P&L reset from')} {fiscalStartDate}
                        </span>
                    )}
                </div>
            )}

            <div className="report-header-controls rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-1.5">
                    <EnglishDateInput
                        value={startDate}
                        onChange={setStartDate}
                        className="h-9 w-full rounded-xl border border-gray-100 bg-gray-50 px-2.5 text-[10px] font-bold outline-none"
                        aria-label={tr('من تاريخ', 'From date')}
                    />
                    <EnglishDateInput
                        value={endDate}
                        onChange={setEndDate}
                        className="h-9 w-full rounded-xl border border-gray-100 bg-gray-50 px-2.5 text-[10px] font-bold outline-none"
                        aria-label={tr('إلى تاريخ', 'To date')}
                    />
                </div>
                <div className="mt-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {currencies.map(c => (
                        <button
                            key={c.code}
                            onClick={() => setReportCurrency(c.code)}
                            className={`min-w-[56px] shrink-0 rounded-lg px-2 py-1.5 text-[9px] font-black transition-all ${
                                reportCurrency === c.code ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                            }`}
                        >
                            {c.code}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
    // --- 1. Stock Remaining Report ---
    const renderStockReport = () => (
        <div className="animate-in slide-in-from-bottom-4">
            <ReportHeader title={tr('المخزون المتبقي', 'Remaining Stock')} />
            <div className="space-y-3">
                {products.map(p => (
                    <div key={p.id} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Package size={20} /></div>
                            <div><h4 className="font-black text-sm text-gray-800">{displayProductName(p)}</h4><p className="text-[9px] text-gray-400 font-bold uppercase">{p.barcode || tr('بدون باركود', 'No Barcode')}</p></div>
                        </div>
                        <div className="text-left">
                            <span className={`block font-black text-sm ${p.stock <= 5 ? 'text-rose-600' : 'text-emerald-600'}`}>{p.stock} {tr('قطعة', 'pcs')}</span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase">{tr('القيمة', 'Value')}: {formatValue(p.stock * p.buyPrice)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // --- 1A. Statement of Changes in Equity ---
    const renderEquityChangesReport = () => {
        const equityRows = accounts
            .filter(acc => !acc.isGroup && acc.type === 'EQUITY')
            .map(acc => {
                const bal = financialData.balances[acc.id];
                const opening = bal?.openingNet || 0;
                const movement = bal?.periodNet || 0;
                const increase = Math.max(0, movement);
                const decrease = Math.max(0, -movement);
                const closing = opening + movement;
                return { account: acc, opening, movement, increase, decrease, closing };
            })
            .sort((a, b) => a.account.code.localeCompare(b.account.code, 'ar'));

        const periodRevenue = accounts
            .filter(acc => !acc.isGroup && acc.type === 'REVENUE')
            .reduce((sum, acc) => sum + (financialData.balances[acc.id]?.periodNet || 0), 0);
        const periodExpense = accounts
            .filter(acc => !acc.isGroup && acc.type === 'EXPENSE')
            .reduce((sum, acc) => sum + (financialData.balances[acc.id]?.periodNet || 0), 0);
        const periodNetProfit = periodRevenue - periodExpense;

        const openingTotal = equityRows.reduce((sum, row) => sum + row.opening, 0);
        const periodIncrease = equityRows.reduce((sum, row) => sum + row.increase, 0);
        const periodDecrease = equityRows.reduce((sum, row) => sum + row.decrease, 0);
        const closingBeforeProfit = equityRows.reduce((sum, row) => sum + row.closing, 0);
        const closingTotal = closingBeforeProfit + periodNetProfit;

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('قائمة التغير في حقوق الملكية', 'Statement of Changes in Equity')} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('رصيد أول المدة', 'Opening Equity')}</p>
                        <p className="text-sm font-black dir-ltr text-gray-800">{formatValue(Math.abs(openingTotal))}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي الزيادات', 'Total Increases')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-700">{formatValue(periodIncrease + Math.max(0, periodNetProfit))}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي الانخفاضات', 'Total Decreases')}</p>
                        <p className="text-sm font-black dir-ltr text-rose-700">{formatValue(periodDecrease + Math.max(0, -periodNetProfit))}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('رصيد آخر المدة', 'Closing Equity')}</p>
                        <p className={`text-sm font-black dir-ltr ${closingTotal >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{formatValue(Math.abs(closingTotal))}</p>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="overflow-x-auto">
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('بند حقوق الملكية', 'Equity Item')}</th>
                                    <th className="p-3 text-center">{tr('أول المدة', 'Opening')}</th>
                                    <th className="p-3 text-center">{tr('زيادات', 'Increases')}</th>
                                    <th className="p-3 text-center">{tr('انخفاضات', 'Decreases')}</th>
                                    <th className="p-3 text-center">{tr('آخر المدة', 'Closing')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {equityRows.map(row => (
                                    <tr key={row.account.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-black text-gray-800">
                                            {displayAccountName(row.account)} <span className="text-[9px] text-gray-400 font-normal">({row.account.code})</span>
                                        </td>
                                        <td className="p-3 text-center dir-ltr font-bold text-gray-700">{formatValue(Math.abs(row.opening))}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-emerald-700">{row.increase > 0 ? formatValue(row.increase) : '-'}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-rose-700">{row.decrease > 0 ? formatValue(row.decrease) : '-'}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(Math.abs(row.closing))}</td>
                                    </tr>
                                ))}
                                <tr className="bg-indigo-50/60 font-black text-indigo-800">
                                    <td className="p-3">{tr('صافي ربح/خسارة الفترة', 'Period Net Profit/Loss')}</td>
                                    <td className="p-3 text-center">-</td>
                                    <td className="p-3 text-center dir-ltr">{periodNetProfit >= 0 ? formatValue(periodNetProfit) : '-'}</td>
                                    <td className="p-3 text-center dir-ltr">{periodNetProfit < 0 ? formatValue(Math.abs(periodNetProfit)) : '-'}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(Math.abs(closingTotal))}</td>
                                </tr>
                                <tr className="bg-blue-50/60 font-black text-blue-800 border-t border-blue-100">
                                    <td className="p-3">{tr('الإجمالي', 'Total')}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(Math.abs(openingTotal))}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(periodIncrease + Math.max(0, periodNetProfit))}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(periodDecrease + Math.max(0, -periodNetProfit))}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(Math.abs(closingTotal))}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 1D. Fixed Assets Changes Report ---
    const renderFixedAssetsChangesReport = () => {
        const parseDate = (value?: string) => {
            if (!value) return null;
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const start = parseDate(startDate);
        const end = parseDate(endDate);
        if (!start || !end) {
            return (
                <div className="animate-in slide-in-from-bottom-4">
                    <ReportHeader title={tr('قائمة الموجودات الثابتة والتغيرات', 'Fixed Assets Changes Statement')} />
                    <div className="bg-white p-8 rounded-[2rem] border border-dashed border-gray-200 text-center text-xs font-bold text-gray-400">
                        {tr('يرجى إدخال فترة زمنية صحيحة لعرض التقرير.', 'Please select a valid date range to view this report.')}
                    </div>
                </div>
            );
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        const openingCutoff = new Date(start);
        openingCutoff.setMilliseconds(openingCutoff.getMilliseconds() - 1);

        const isDisposedByDate = (asset: any, asOf: Date) => {
            const disposal = parseDate(asset.disposalDate);
            return asset.status !== 'ACTIVE' && disposal !== null && disposal <= asOf;
        };

        const isOnBooksAt = (asset: any, asOf: Date) => {
            const purchase = parseDate(asset.purchaseDate);
            if (!purchase || purchase > asOf) return false;
            return !isDisposedByDate(asset, asOf);
        };

        const calcAccumulatedDep = (asset: any, asOf: Date) => {
            const purchase = parseDate(asset.purchaseDate);
            if (!purchase || purchase > asOf) return 0;

            const cost = Math.max(0, Number(asset.cost) || 0);
            const salvage = Math.max(0, Number(asset.salvageValue) || 0);
            const life = Math.max(0, Number(asset.lifeInYears) || 0);
            const depreciable = Math.max(0, cost - salvage);
            if (depreciable <= 0 || life <= 0) return 0;

            let effectiveEnd = asOf;
            const disposal = parseDate(asset.disposalDate);
            if (asset.status !== 'ACTIVE' && disposal && disposal < effectiveEnd) {
                effectiveEnd = disposal;
            }
            if (effectiveEnd < purchase) return 0;

            const elapsedDays = (effectiveEnd.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24);
            const elapsedYears = Math.max(0, elapsedDays / 365);
            const annualDep = depreciable / life;
            return Math.min(depreciable, annualDep * elapsedYears);
        };

        const additions = fixedAssets.filter(asset => {
            const purchase = parseDate(asset.purchaseDate);
            return purchase !== null && purchase >= start && purchase <= end;
        });

        const disposals = fixedAssets.filter(asset => {
            const disposal = parseDate(asset.disposalDate);
            return asset.status !== 'ACTIVE' && disposal !== null && disposal >= start && disposal <= end;
        });

        const openingAssets = fixedAssets.filter(asset => isOnBooksAt(asset, openingCutoff));
        const closingAssets = fixedAssets.filter(asset => isOnBooksAt(asset, end));

        const openingCost = openingAssets.reduce((sum, asset) => sum + (Number(asset.cost) || 0), 0);
        const additionsCost = additions.reduce((sum, asset) => sum + (Number(asset.cost) || 0), 0);
        const disposalsCost = disposals.reduce((sum, asset) => sum + (Number(asset.cost) || 0), 0);
        const closingCost = openingCost + additionsCost - disposalsCost;

        const openingAccumulated = openingAssets.reduce((sum, asset) => sum + calcAccumulatedDep(asset, openingCutoff), 0);
        const closingAccumulated = closingAssets.reduce((sum, asset) => sum + calcAccumulatedDep(asset, end), 0);
        const openingNet = Math.max(0, openingCost - openingAccumulated);
        const closingNet = Math.max(0, closingCost - closingAccumulated);

        const activityRows = [
            ...additions.map(asset => ({
                id: `add_${asset.id}`,
                date: asset.purchaseDate,
                type: tr('إضافة', 'Addition'),
                typeKey: 'ADD' as const,
                name: asset.name,
                amount: Number(asset.cost) || 0,
                proceeds: 0
            })),
            ...disposals.map(asset => ({
                id: `disp_${asset.id}`,
                date: asset.disposalDate || '',
                type: asset.status === 'SOLD' ? tr('استبعاد - بيع', 'Disposal - Sold') : tr('استبعاد - إتلاف', 'Disposal - Scrapped'),
                typeKey: 'DISPOSE' as const,
                name: asset.name,
                amount: Number(asset.cost) || 0,
                proceeds: Number(asset.disposalPrice) || 0
            }))
        ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('قائمة الموجودات الثابتة والتغيرات', 'Fixed Assets Changes Statement')} />

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('أول المدة (تكلفة)', 'Opening Cost')}</p>
                        <p className="text-sm font-black dir-ltr text-gray-800">{formatValue(openingCost)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إضافات الفترة', 'Additions')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-700">{formatValue(additionsCost)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('استبعادات الفترة', 'Disposals')}</p>
                        <p className="text-sm font-black dir-ltr text-rose-700">{formatValue(disposalsCost)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('آخر المدة (تكلفة)', 'Closing Cost')}</p>
                        <p className="text-sm font-black dir-ltr text-blue-700">{formatValue(closingCost)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('صافي أول المدة', 'Opening Net')}</p>
                        <p className="text-sm font-black dir-ltr text-gray-800">{formatValue(openingNet)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('صافي آخر المدة', 'Closing Net')}</p>
                        <p className="text-sm font-black dir-ltr text-indigo-700">{formatValue(closingNet)}</p>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto mb-4">
                    <div className="px-4 py-3 border-b border-gray-50">
                        <h4 className="font-black text-sm text-gray-800">{tr('حركة الموجودات الثابتة خلال الفترة', 'Fixed Assets Movement During Period')}</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                    <th className="p-3">{tr('النوع', 'Type')}</th>
                                    <th className="p-3">{tr('الأصل', 'Asset')}</th>
                                    <th className="p-3 text-center">{tr('القيمة الدفترية (التكلفة)', 'Book Cost')}</th>
                                    <th className="p-3 text-center">{tr('قيمة البيع/التصفية', 'Sale/Scrap Proceeds')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {activityRows.map(row => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold text-gray-600">{row.date || '-'}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded-md text-[10px] font-black ${row.typeKey === 'ADD' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                {row.type}
                                            </span>
                                        </td>
                                        <td className="p-3 font-black text-gray-800">{row.name}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-gray-700">{formatValue(row.amount)}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-blue-700">{row.proceeds > 0 ? formatValue(row.proceeds) : '-'}</td>
                                    </tr>
                                ))}
                                {activityRows.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-5 text-center text-xs font-bold text-gray-400">
                                            {tr('لا توجد إضافات أو استبعادات في الفترة المحددة', 'No additions or disposals in the selected period')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="px-4 py-3 border-b border-gray-50">
                        <h4 className="font-black text-sm text-gray-800">{tr('الأصول القائمة بنهاية الفترة (الصافي)', 'Assets on Books at Period End (Net)')}</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الأصل', 'Asset')}</th>
                                    <th className="p-3 text-center">{tr('تاريخ الشراء', 'Purchase Date')}</th>
                                    <th className="p-3 text-center">{tr('التكلفة', 'Cost')}</th>
                                    <th className="p-3 text-center">{tr('مجمع الإهلاك', 'Accumulated Depreciation')}</th>
                                    <th className="p-3 text-center">{tr('الصافي الدفتري', 'Net Book Value')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {closingAssets
                                    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
                                    .map(asset => {
                                        const cost = Number(asset.cost) || 0;
                                        const accDep = calcAccumulatedDep(asset, end);
                                        const netBook = Math.max(0, cost - accDep);
                                        return (
                                            <tr key={asset.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-black text-gray-800">{asset.name}</td>
                                                <td className="p-3 text-center text-gray-600 font-bold">{asset.purchaseDate}</td>
                                                <td className="p-3 text-center dir-ltr font-bold text-gray-700">{formatValue(cost)}</td>
                                                <td className="p-3 text-center dir-ltr font-bold text-amber-700">{formatValue(accDep)}</td>
                                                <td className="p-3 text-center dir-ltr font-black text-indigo-700">{formatValue(netBook)}</td>
                                            </tr>
                                        );
                                    })}
                                {closingAssets.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-5 text-center text-xs font-bold text-gray-400">
                                            {tr('لا توجد أصول ثابتة قائمة بنهاية الفترة', 'No fixed assets on books at period end')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 1E. Inventory Count List ---
    const renderInventoryCountListReport = () => {
        const rows = products
            .map(product => {
                const quantity = Number(product.stock) || 0;
                const unitCost = Number(product.buyPrice) || 0;
                const value = quantity * unitCost;
                return { product, quantity, unitCost, value };
            })
            .sort((a, b) => displayProductName(a.product).localeCompare(displayProductName(b.product)));

        const totals = rows.reduce((acc, row) => {
            acc.items += 1;
            acc.quantity += row.quantity;
            acc.value += row.value;
            return acc;
        }, { items: 0, quantity: 0, value: 0 });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('قائمة جرد المخزون', 'Inventory Count List')} />

                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('عدد الأصناف', 'Item Count')}</p>
                        <p className="text-sm font-black dir-ltr text-gray-800">{totals.items.toLocaleString(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn')}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي الكمية الدفترية', 'Total Book Quantity')}</p>
                        <p className="text-sm font-black dir-ltr text-blue-700">{totals.quantity.toLocaleString(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn')}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي قيمة المخزون', 'Total Inventory Value')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-700">{formatValue(totals.value)}</p>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="overflow-x-auto">
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الصنف', 'Item')}</th>
                                    <th className="p-3 text-center">{tr('كود الصنف', 'Item Code')}</th>
                                    <th className="p-3 text-center">{tr('الباركود', 'Barcode')}</th>
                                    <th className="p-3 text-center">{tr('الكمية الدفترية', 'Book Quantity')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة الوحدة', 'Unit Cost')}</th>
                                    <th className="p-3 text-center">{tr('قيمة الصنف', 'Item Value')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {rows.map(row => (
                                    <tr key={row.product.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-black text-gray-800">{displayProductName(row.product)}</td>
                                        <td className="p-3 text-center font-bold text-gray-600">{row.product.itemCode || '-'}</td>
                                        <td className="p-3 text-center font-bold text-gray-600">{row.product.barcode || '-'}</td>
                                        <td className={`p-3 text-center dir-ltr font-black ${row.quantity < 0 ? 'text-rose-600' : 'text-blue-700'}`}>
                                            {row.quantity.toLocaleString(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn')}
                                        </td>
                                        <td className="p-3 text-center dir-ltr font-bold text-gray-700">{formatValue(row.unitCost)}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-emerald-700">{formatValue(row.value)}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-5 text-center text-xs font-bold text-gray-400">
                                            {tr('لا توجد أصناف متاحة في المخزون', 'No items available in inventory')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-3 p-3 rounded-xl border border-blue-100 bg-blue-50 text-xs text-blue-800 font-bold">
                    {tr('ملاحظة: هذه القائمة تعتمد على الرصيد الدفتري الحالي للأصناف (قبل الجرد الفعلي).', 'Note: This list is based on current book stock quantities (before physical count adjustments).')}
                </div>
            </div>
        );
    };

    // --- 1B. Low Stock Alerts Report ---
    const renderLowStockAlertsReport = () => {
        const globalThreshold = Math.max(0, Number(companySettings.lowStockAlertQtyDefault ?? 5) || 5);
        const rows = products
            .map(p => {
                const stock = Number(p.stock ?? 0) || 0;
                const threshold = Math.max(0, Number((p as any).lowStockAlertQty ?? globalThreshold) || 0);
                const reorderQty = Math.max(0, Number((p as any).reorderQty ?? 0) || 0);
                const shortage = Math.max(0, threshold - stock);
                const isOut = stock <= 0;
                const isLow = stock <= threshold;
                const shouldOrderNow = isLow && reorderQty > 0;
                return { product: p, stock, threshold, reorderQty, shortage, isOut, isLow, shouldOrderNow };
            })
            .filter(row => row.isLow)
            .sort((a, b) => {
                const sevA = (a.isOut ? 2 : 0) + (a.shouldOrderNow ? 1 : 0);
                const sevB = (b.isOut ? 2 : 0) + (b.shouldOrderNow ? 1 : 0);
                if (sevA !== sevB) return sevB - sevA;
                if (a.shortage !== b.shortage) return b.shortage - a.shortage;
                return displayProductName(a.product).localeCompare(displayProductName(b.product));
            });

        const summary = rows.reduce((acc, row) => {
            acc.items += 1;
            if (row.isOut) acc.outOfStock += 1;
            if (!row.isOut) acc.lowOnly += 1;
            if (row.shouldOrderNow) acc.orderNow += 1;
            acc.reorderQty += row.reorderQty;
            acc.stockValue += row.stock * (Number(row.product.buyPrice ?? 0) || 0);
            return acc;
        }, { items: 0, outOfStock: 0, lowOnly: 0, orderNow: 0, reorderQty: 0, stockValue: 0 });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('نواقص المخزون', 'Low Stock Alerts')} />

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('أصناف منخفضة', 'Low Items')}</p>
                        <p className="text-sm font-black dir-ltr text-amber-600">{summary.items}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('نافدة', 'Out')}</p>
                        <p className="text-sm font-black dir-ltr text-rose-600">{summary.outOfStock}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('اطلب الآن', 'Order Now')}</p>
                        <p className="text-sm font-black dir-ltr text-blue-700">{summary.orderNow}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي إعادة الطلب', 'Total Reorder Qty')}</p>
                        <p className="text-sm font-black dir-ltr text-indigo-700">{summary.reorderQty.toLocaleString(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn')}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('قيمة المخزون الحالي', 'Current Stock Value')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-700">{formatValue(summary.stockValue)}</p>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="font-black text-sm text-gray-800">{tr('تفاصيل الأصناف الناقصة', 'Low Stock Item Details')}</h4>
                            <p className="text-[10px] text-gray-400 font-bold">
                                {tr('الحد الافتراضي العام', 'Global default threshold')}: <span className="dir-ltr">{globalThreshold}</span>
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الصنف', 'Item')}</th>
                                    <th className="p-3 text-center">{tr('الباركود', 'Barcode')}</th>
                                    <th className="p-3 text-center">{tr('الرصيد', 'Stock')}</th>
                                    <th className="p-3 text-center">{tr('حد التنبيه', 'Threshold')}</th>
                                    <th className="p-3 text-center">{tr('النقص', 'Shortage')}</th>
                                    <th className="p-3 text-center">{tr('إعادة الطلب', 'Reorder')}</th>
                                    <th className="p-3 text-center">{tr('الحالة', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {rows.map(row => (
                                    <tr key={row.product.id} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-black text-gray-800">{displayProductName(row.product)}</div>
                                            <div className="text-[10px] text-gray-400 font-bold">{row.product.unit || tr('بدون وحدة', 'No Unit')}</div>
                                        </td>
                                        <td className="p-3 text-center text-gray-500 font-bold">{row.product.barcode || '-'}</td>
                                        <td className={`p-3 text-center dir-ltr font-black ${row.isOut ? 'text-rose-600' : 'text-amber-600'}`}>{row.stock}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-gray-700">{row.threshold}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-rose-600">{row.shortage}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-indigo-700">{row.reorderQty > 0 ? row.reorderQty : '-'}</td>
                                        <td className="p-3 text-center">
                                            <div className="flex flex-wrap items-center justify-center gap-1">
                                                {row.isOut ? (
                                                    <span className="px-2 py-1 rounded-md text-[10px] font-black bg-rose-50 text-rose-600">{tr('نافد', 'Out')}</span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded-md text-[10px] font-black bg-amber-50 text-amber-600">{tr('منخفض', 'Low')}</span>
                                                )}
                                                {row.shouldOrderNow && (
                                                    <span className="px-2 py-1 rounded-md text-[10px] font-black bg-blue-50 text-blue-700">{tr('اطلب الآن', 'Order Now')}</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-5 text-center text-xs font-bold text-gray-400">
                                            {tr('لا توجد أصناف ناقصة حسب الحدود الحالية', 'No low stock items based on current thresholds')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 1C. Average Cost Audit Report ---
    const renderAverageCostAuditReport = () => {
        type CostAuditRow = {
            id: string;
            date: string;
            invoiceId: string;
            invoiceNumber: string;
            contactName: string;
            product: Product;
            previousQty: number;
            previousCost: number;
            incomingQty: number;
            incomingUnitCost: number;
            incomingAmount: number;
            newQty: number;
            newAvgCost: number;
        };

        const postedInventoryInvoices = invoices
            .filter(inv => inv.postingStatus === 'POSTED')
            .filter(inv =>
                inv.category === 'purchase_invoice' ||
                inv.category === 'purchase_return' ||
                inv.category === 'sales_return' ||
                inv.type === TransactionType.INCOME
            )
            .slice()
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
            });

        const tracker = new Map<string, { qty: number; avg: number }>();
        const rows: CostAuditRow[] = [];

        const applyQtyOnlyMovement = (productId: string, qtyDelta: number) => {
            const current = tracker.get(productId);
            if (!current) {
                const product = products.find(p => p.id === productId);
                tracker.set(productId, { qty: qtyDelta, avg: Math.max(0, Number(product?.buyPrice || 0)) });
                return;
            }
            tracker.set(productId, { ...current, qty: current.qty + qtyDelta });
        };

        postedInventoryInvoices.forEach(inv => {
            inv.items.forEach((item, lineIndex) => {
                if (!item.productId) return;
                const product = products.find(p => p.id === item.productId);
                if (!product) return;
                const qty = Math.max(0, Number(item.quantity) || 0);
                if (qty <= 0) return;

                if (inv.category === 'purchase_invoice') {
                    const current = tracker.get(product.id) || { qty: 0, avg: Math.max(0, Number(product.buyPrice || 0)) };
                    const previousQty = Number(current.qty || 0);
                    const previousCost = Math.max(0, Number(current.avg || 0));
                    const incomingUnitCost = Math.max(0, Number(item.unitPrice || 0));
                    const incomingAmount = qty * incomingUnitCost;
                    const newQty = previousQty + qty;
                    const newAvgCost = newQty > 0
                        ? Number((((previousQty * previousCost) + incomingAmount) / newQty).toFixed(4))
                        : previousCost;

                    rows.push({
                        id: `${inv.id}_${item.id || lineIndex}`,
                        date: inv.date,
                        invoiceId: inv.id,
                        invoiceNumber: inv.invoiceNumber,
                        contactName: displayContactName(contacts.find(c => c.id === inv.customerId)),
                        product,
                        previousQty,
                        previousCost,
                        incomingQty: qty,
                        incomingUnitCost,
                        incomingAmount,
                        newQty,
                        newAvgCost
                    });

                    tracker.set(product.id, { qty: newQty, avg: newAvgCost });
                    return;
                }

                if (inv.category === 'purchase_return') {
                    applyQtyOnlyMovement(product.id, -qty);
                    return;
                }
                if (inv.category === 'sales_return') {
                    applyQtyOnlyMovement(product.id, qty);
                    return;
                }
                if (inv.type === TransactionType.INCOME) {
                    applyQtyOnlyMovement(product.id, -qty);
                    return;
                }
            });
        });

        const filteredRows = rows.filter(row => row.date >= startDate && row.date <= endDate);
        const summary = filteredRows.reduce((acc, row) => {
            acc.rows += 1;
            acc.qty += row.incomingQty;
            acc.amount += row.incomingAmount;
            acc.products.add(row.product.id);
            return acc;
        }, { rows: 0, qty: 0, amount: 0, products: new Set<string>() });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تدقيق متوسط التكلفة', 'Average Cost Audit')} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('صفوف الشراء', 'Purchase Rows')}</p>
                        <p className="text-sm font-black dir-ltr text-indigo-700">{formatPlainNumber(summary.rows)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('أصناف متأثرة', 'Affected Items')}</p>
                        <p className="text-sm font-black dir-ltr text-blue-700">{formatPlainNumber(summary.products.size)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('كمية واردة', 'Incoming Qty')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-700">{formatPlainNumber(summary.qty)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('قيمة الوارد', 'Incoming Amount')}</p>
                        <p className="text-sm font-black dir-ltr text-amber-700">{formatValue(summary.amount)}</p>
                    </div>
                </div>

                <div className="mb-4 p-3 rounded-xl border border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-800">
                    {tr(
                        'يعيد التقرير بناء متوسط التكلفة زمنيًا من فواتير الشراء المرحّلة. إذا كانت هناك أرصدة افتتاحية/تسويات مخزون غير ممثلة بفواتير شراء فقد تختلف أول حركة لكل صنف.',
                        'This report reconstructs average cost chronologically from posted purchase invoices. If opening balances or stock adjustments exist outside purchase invoices, the first row per item may differ.'
                    )}
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1180px] text-start text-xs">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                    <th className="p-3">{tr('الفاتورة', 'Invoice')}</th>
                                    <th className="p-3">{tr('المورد', 'Supplier')}</th>
                                    <th className="p-3">{tr('الصنف', 'Item')}</th>
                                    <th className="p-3 text-center">{tr('التكلفة السابقة', 'Previous Cost')}</th>
                                    <th className="p-3 text-center">{tr('الرصيد السابق', 'Previous Qty')}</th>
                                    <th className="p-3 text-center">{tr('الوارد', 'Incoming Qty')}</th>
                                    <th className="p-3 text-center">{tr('سعر الوارد', 'Incoming Unit Cost')}</th>
                                    <th className="p-3 text-center">{tr('المتوسط الجديد', 'New Average')}</th>
                                    <th className="p-3 text-center">{tr('الرصيد الجديد', 'New Qty')}</th>
                                    <th className="p-3 text-center">{tr('قيمة الوارد', 'Incoming Amount')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredRows.map(row => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="p-3 dir-ltr font-bold whitespace-nowrap">{row.date}</td>
                                        <td className="p-3 dir-ltr font-black text-slate-700">#{row.invoiceNumber}</td>
                                        <td className="p-3 text-gray-700">{row.contactName || '-'}</td>
                                        <td className="p-3">
                                            <div className="font-black text-gray-800">{displayProductName(row.product)}</div>
                                            <div className="text-[10px] text-gray-400 font-bold dir-ltr">{row.product.itemCode || row.product.barcode || '-'}</div>
                                        </td>
                                        <td className="p-3 text-center dir-ltr font-bold text-slate-700">{formatPlainNumber(row.previousCost)}</td>
                                        <td className="p-3 text-center dir-ltr font-bold">{formatPlainNumber(row.previousQty)}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-emerald-700">{formatPlainNumber(row.incomingQty)}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-blue-700">{formatPlainNumber(row.incomingUnitCost)}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-amber-700">{formatPlainNumber(row.newAvgCost)}</td>
                                        <td className="p-3 text-center dir-ltr font-bold">{formatPlainNumber(row.newQty)}</td>
                                        <td className="p-3 text-center dir-ltr font-bold text-indigo-700">{formatValue(row.incomingAmount)}</td>
                                    </tr>
                                ))}
                                {filteredRows.length === 0 && (
                                    <tr>
                                        <td colSpan={11} className="p-6 text-center text-xs font-bold text-gray-400">
                                            {tr('لا توجد صفوف شراء مرحّلة ضمن الفترة المحددة.', 'No posted purchase rows found in the selected period.')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 2. Item Profit Report ---
    const renderItemProfitReport = () => {
        const profits = products.map(p => {
            const salesItems = invoices.filter(inv => inv.type === TransactionType.INCOME && inv.postingStatus === 'POSTED')
                .flatMap(inv => inv.items.filter(i => i.productId === p.id));
            const totalSales = salesItems.reduce((s, i) => s + i.total, 0);
            const totalQty = salesItems.reduce((s, i) => s + i.quantity, 0);
            const totalCost = totalQty * p.buyPrice;
            return { ...p, totalSales, totalCost, profit: totalSales - totalCost };
        }).sort((a, b) => b.profit - a.profit);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('أرباح الأصناف', 'Item Profit')} />
                <div className="space-y-4">
                    {profits.map(p => (
                        <div key={p.id} className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <h4 className="font-black text-gray-800">{displayProductName(p)}</h4>
                                <div className="text-left"><span className="block text-[9px] font-black text-gray-400 uppercase">{tr('الربح المحقق', 'Realized Profit')}</span><span className="text-lg font-black text-emerald-600 dir-ltr">{formatValue(p.profit)}</span></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center text-[9px] bg-gray-50 p-2 rounded-xl">
                                <div><span className="block text-gray-400">{tr('إجمالي المبيعات', 'Total Sales')}</span><span className="font-bold">{formatValue(p.totalSales)}</span></div>
                                <div className="border-r border-gray-200"><span className="block text-gray-400">{tr('تكلفة المبيعات', 'Cost of Sales')}</span><span className="font-bold">{formatValue(p.totalCost)}</span></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 3. Daily Operations Report ---
    const renderDailyOps = () => {
        const ops = transactions
            .filter(t => t.status !== 'DRAFT' && t.date >= startDate && t.date <= endDate)
            .sort((a, b) => b.date.localeCompare(a.date));
        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('العمليات اليومية', 'Daily Operations')} />
                <div className="space-y-3">
                    {ops.map(t => (
                        <div key={t.id} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${t.type === 'INCOME' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                    {t.type === 'INCOME' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                                </div>
                                <div><h4 className="font-black text-xs text-gray-800 line-clamp-1">{t.description}</h4><p className="text-[9px] text-gray-400 font-bold uppercase">{t.date}</p></div>
                            </div>
                            <span className={`font-black text-sm dir-ltr ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.type === 'INCOME' ? '+' : '-'}{t.amount.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 4. Cash Movement Report ---
    const renderCashFlow = () => {
        const cashAccs = accounts.filter(a => !a.isGroup && a.type === 'ASSET' && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root'));
        const movements = transactions.filter(t =>
            (cashAccs.some(a => a.id === t.debitAccountId) || cashAccs.some(a => a.id === t.creditAccountId)) &&
            t.status !== 'DRAFT' &&
            t.date >= startDate && t.date <= endDate
        ).sort((a, b) => b.date.localeCompare(a.date));

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('حركة الصندوق والبنوك', 'Cash & Bank Movement')} />
                <div className="space-y-4">
                    {movements.map(t => {
                        const isIn = cashAccs.some(a => a.id === t.debitAccountId);
                        const accName = isIn
                            ? displayAccountName(accounts.find(a => a.id === t.debitAccountId) || null)
                            : displayAccountName(accounts.find(a => a.id === t.creditAccountId) || null);
                        return (
                            <div key={t.id} className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-3 rounded-2xl ${isIn ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                            <Banknote size={22} />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-sm text-gray-800">{t.description}</h4>
                                            <p className="text-[9px] text-blue-500 font-bold uppercase tracking-widest mt-1">{accName}</p>
                                        </div>
                                    </div>
                                    <div className="text-left">
                                        <span className={`block font-black text-base dir-ltr ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {isIn ? '+' : '-'}{t.amount.toLocaleString()}
                                        </span>
                                        <span className="text-[9px] text-gray-400 font-bold">{t.date}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // --- 5. Checks Reports (Incoming & Outgoing) ---
    const renderChecksReport = (type: 'INCOMING' | 'OUTGOING') => {
        const list = checks.filter(c => c.type === type && c.dueDate >= startDate && c.dueDate <= endDate);
        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={type === 'INCOMING' ? tr('الشيكات الواردة', 'Incoming Checks') : tr('الشيكات الصادرة', 'Outgoing Checks')} />
                <div className="space-y-4">
                    {list.map(c => (
                        <div key={c.id} className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
                                <div className="flex items-start gap-4 min-w-0">
                                    <div className={`p-3 rounded-2xl ${type === 'INCOMING' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}><ListChecks size={22} /></div>
                                    <div className="min-w-0">
                                        <h4 className="font-black text-gray-800 break-words">{tr('شيك رقم', 'Check #')} {c.checkNumber}</h4>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 break-words">
                                            {displayAccountName(c.bankAccountId ? accounts.find(a => a.id === c.bankAccountId) || null : { id: '', name: c.bankName })}
                                        </p>
                                    </div>
                                </div>
                                <div className={`${isEnglish ? 'text-left' : 'text-right'} shrink-0`}><span className="block font-black text-base dir-ltr">{c.amount.toLocaleString()}</span><span className="text-[9px] text-gray-400 font-bold">{c.status}</span></div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center pt-3 border-t border-gray-50 text-[10px] font-black text-gray-400 uppercase">
                                <span className="flex items-center gap-1"><Calendar size={12} /> {tr('استحقاق', 'Due')}: {c.dueDate}</span>
                                <span className="flex items-center gap-1"><User size={12} /> {displayContactName(contacts.find(con => con.id === c.contactId) || null) || tr('غير معروف', 'Unknown')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 6. Working Capital Report ---
    const renderWorkingCapital = () => {
        const currentAssetsNode = financialData.accountMap.get('acc_current_assets');
        const currentLiabilitiesNode = financialData.accountMap.get('acc_current_liabilities');

        const currentAssets = currentAssetsNode ? currentAssetsNode.nodeValue : 0;
        const currentLiabilities = currentLiabilitiesNode ? currentLiabilitiesNode.nodeValue : 0;

        const wc = currentAssets - currentLiabilities;
        const ratio = currentLiabilities !== 0 ? (currentAssets / currentLiabilities).toFixed(2) : '-';

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('رأس المال العامل', 'Working Capital')} />
                <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl mb-8 relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12"><Calculator size={150} /></div>
                    <div className="relative z-10 text-center">
                        <p className="text-white/60 text-xs font-black uppercase tracking-widest mb-2">{tr('صافي رأس المال العامل', 'Net Working Capital')}</p>
                        <h2 className="text-4xl font-black dir-ltr tracking-tighter mb-4">{formatValue(wc)}</h2>
                        <div className="bg-white/10 px-4 py-2 rounded-full w-fit mx-auto text-[10px] font-bold">{tr('نسبة التداول', 'Current Ratio')}: {ratio} : 1</div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-3"><div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><ArrowDownLeft size={18} /></div><span className="font-black text-gray-700">{tr('الأصول المتداولة', 'Current Assets')}</span></div>
                        <span className="font-black text-emerald-600 dir-ltr">{formatValue(currentAssets)}</span>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-3"><div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl"><ArrowUpRight size={18} /></div><span className="font-black text-gray-700">{tr('الالتزامات المتداولة', 'Current Liabilities')}</span></div>
                        <span className="font-black text-rose-600 dir-ltr">{formatValue(currentLiabilities)}</span>
                    </div>
                </div>
            </div>
        );
    };

    // --- Report Menu & Categories ---
    const renderMenu = () => {
        const categories: { id: ReportCategory, label: string, icon: any, color: string }[] = [
            { id: 'FINANCIAL', label: tr('التقارير المالية', 'Financial Reports'), icon: <Landmark />, color: 'bg-blue-100 text-blue-600' },
            { id: 'ANALYTICS', label: tr('التحليلات', 'Analytics'), icon: <BarChart3 />, color: 'bg-cyan-100 text-cyan-700' },
            { id: 'SALES', label: tr('المبيعات والعملاء', 'Sales & Customers'), icon: <TrendingUp />, color: 'bg-emerald-100 text-emerald-600' },
            { id: 'PURCHASES', label: tr('المشتريات والموردين', 'Purchases & Suppliers'), icon: <ShoppingBag />, color: 'bg-purple-100 text-purple-600' },
            { id: 'INVENTORY', label: tr('المخزون والمستودعات', 'Inventory & Warehouses'), icon: <Package />, color: 'bg-orange-100 text-orange-600' },
            { id: 'TREASURY', label: tr('النقدية والشيكات', 'Treasury & Checks'), icon: <Wallet />, color: 'bg-amber-100 text-amber-600' },
            { id: 'JOURNALS', label: tr('المحاسبة والقيود', 'Accounting & Journals'), icon: <Scale />, color: 'bg-indigo-100 text-indigo-600' },
            { id: 'MANUFACTURING', label: tr('التصنيع والتكاليف', 'Manufacturing & Costing'), icon: <Factory />, color: 'bg-slate-100 text-slate-800' },
        ];

        if (activeCategory === 'MENU') {
            return (
                <div className="animate-in fade-in duration-700">
                    <header className="mb-3 text-center">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mx-auto mb-2 border border-gray-100 text-blue-600"><BarChart3 size={24} /></div>
                        <h1 className="text-xl font-black text-gray-800">{tr('مركز التقارير', 'Reports Center')}</h1>
                        <p className="text-gray-400 text-[9px] font-bold mt-1 uppercase tracking-[0.15em]">{tr('تحليلات الأعمال الذكية', 'Smart Business Analytics')}</p>
                    </header>
                    <div className="grid grid-cols-2 gap-2">
                        {categories.map(cat => (
                            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className="bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center gap-2 min-h-[96px] transition-all hover:shadow-md active:scale-95">
                                <div className={`p-2.5 rounded-xl ${cat.color}`}>{cat.icon}</div>
                                <span className="font-black text-[11px] text-gray-800 break-words leading-4">{cat.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        const reportList: Record<ReportCategory, { id: ReportType, label: string, icon: any }[]> = {
            FINANCIAL: [
                { id: 'INCOME_STATEMENT', label: tr('قائمة الدخل', 'Income Statement'), icon: <TrendingUp size={16} /> },
                { id: 'BALANCE_SHEET', label: tr('الميزانية العمومية', 'Balance Sheet'), icon: <Building2 size={16} /> },
                { id: 'EQUITY_CHANGES', label: tr('التغير في حقوق الملكية', 'Changes in Equity'), icon: <ScrollText size={16} /> },
                { id: 'FIXED_ASSETS_CHANGES', label: tr('الموجودات الثابتة والتغيرات', 'Fixed Assets Changes'), icon: <Building2 size={16} /> },
                { id: 'LIABILITIES_REPORT', label: tr('تقرير الالتزامات', 'Liabilities Report'), icon: <ScrollText size={16} /> },
                { id: 'TRIAL_BALANCE', label: tr('ميزان المراجعة', 'Trial Balance'), icon: <Scale size={16} /> },
                { id: 'WORKING_CAPITAL', label: tr('رأس المال العامل', 'Working Capital'), icon: <Calculator size={16} /> },
            ],
            ANALYTICS: [
                { id: 'ACCOUNTING_ANALYTICS', label: tr('التحليلات المحاسبية', 'Accounting Analytics'), icon: <Activity size={16} /> },
                { id: 'FINANCIAL_RATIOS', label: tr('النسب المالية (Ratio)', 'Financial Ratios (Ratio)'), icon: <Percent size={16} /> },
            ],
            SALES: [
                { id: 'SALES_LIST', label: tr('سجل المبيعات', 'Sales List'), icon: <Receipt size={16} /> },
                { id: 'SALES_BY_ITEM', label: tr('المبيعات حسب الصنف', 'Sales by Item'), icon: <Tag size={16} /> },
                { id: 'CUSTOMER_PROFIT', label: tr('الأرباح لكل عميل', 'Profit by Customer'), icon: <UserCheck size={16} /> },
                { id: 'CUSTOMER_AGING', label: tr('تعمير ذمم الزبائن', 'Customer Aging'), icon: <Clock size={16} /> },
                { id: 'CUSTOMER_STATEMENT', label: tr('كشف حساب الزبائن', 'Customer Statement'), icon: <BookOpen size={16} /> },
            ],
            PURCHASES: [
                { id: 'PURCHASES_LIST', label: tr('سجل المشتريات', 'Purchases List'), icon: <ShoppingBag size={16} /> },
                { id: 'PURCHASES_BY_ITEM', label: tr('المشتريات حسب الصنف', 'Purchases by Item'), icon: <ClipboardList size={16} /> },
                { id: 'PURCHASES_COST_SUMMARY', label: tr('تكلفة المشتريات', 'Purchases Cost'), icon: <Calculator size={16} /> },
                { id: 'PURCHASE_COST_BY_ITEM', label: tr('تكلفة المشتريات لكل صنف', 'Purchase Cost by Item'), icon: <Tag size={16} /> },
                { id: 'PURCHASE_PRICE_VARIANCE', label: tr('فروقات أسعار الشراء', 'Purchase Price Variance'), icon: <TrendingDown size={16} /> },
                { id: 'SUPPLIER_ANALYSIS', label: tr('تحليل الموردين', 'Supplier Analysis'), icon: <UserCheck size={16} /> },
                { id: 'IMPORT_EXPENSES_DETAIL', label: tr('مصاريف الاستيراد التفصيلية', 'Import Expenses Detail'), icon: <Receipt size={16} /> },
                { id: 'SUPPLIER_AGING', label: tr('تعمير ذمم الموردين', 'Supplier Aging'), icon: <Clock size={16} /> },
                { id: 'SUPPLIER_STATEMENT', label: tr('كشف حساب الموردين', 'Supplier Statement'), icon: <BookOpen size={16} /> },
            ],
            INVENTORY: [
                { id: 'STOCK_REMAINING', label: tr('المخزون المتبقي', 'Remaining Stock'), icon: <Box size={16} /> },
                { id: 'INVENTORY_COUNT_LIST', label: tr('قائمة جرد المخزون', 'Inventory Count List'), icon: <ClipboardList size={16} /> },
                { id: 'LOW_STOCK_ALERTS', label: tr('نواقص المخزون', 'Low Stock Alerts'), icon: <AlertCircle size={16} /> },
                { id: 'AVERAGE_COST_AUDIT', label: tr('تدقيق متوسط التكلفة', 'Average Cost Audit'), icon: <Calculator size={16} /> },
                { id: 'ITEM_PROFIT', label: tr('أرباح الأصناف', 'Item Profit'), icon: <TrendingUp size={16} /> },
                { id: 'ITEM_MOVEMENT', label: tr('حركة صنف تفصيلية', 'Detailed Item Movement'), icon: <RefreshCw size={16} /> },
            ],
            TREASURY: [
                { id: 'CASH_FLOW', label: tr('حركة الصندوق', 'Cash Flow'), icon: <Banknote size={16} /> },
                { id: 'CHECKS_IN', label: tr('الشيكات الواردة', 'Incoming Checks'), icon: <ListChecks size={16} /> },
                { id: 'CHECKS_OUT', label: tr('الشيكات الصادرة', 'Outgoing Checks'), icon: <ListChecks size={16} /> },
                { id: 'CHECKS_VAULT', label: tr('الشيكات بالصندوق', 'Checks in Vault'), icon: <Wallet size={16} /> },
                { id: 'CHECKS_UNDER_COLLECTION_BANK', label: tr('شيكات برسم التحصيل حسب البنك', 'Under-Collection Checks by Bank'), icon: <Building2 size={16} /> },
                { id: 'CHECKS_MATURITY', label: tr('آجال استحقاق الشيكات', 'Checks Maturity Dates'), icon: <Calendar size={16} /> },
                { id: 'CURRENCY_POSITIONS', label: tr('فروقات العملات', 'Currency Differences'), icon: <Globe size={16} /> },
                { id: 'RECEIPTS_LIST', label: tr('سندات القبض', 'Receipt Vouchers'), icon: <ArrowDownLeft size={16} /> },
                { id: 'PAYMENTS_LIST', label: tr('سندات الصرف', 'Payment Vouchers'), icon: <ArrowUpRight size={16} /> },
            ],
            JOURNALS: [
                { id: 'DAILY_OPS', label: tr('العمليات اليومية', 'Daily Operations'), icon: <Activity size={16} /> },
                { id: 'DAILY_JOURNALS', label: tr('القيود اليومية', 'Daily Journals'), icon: <FileSpreadsheet size={16} /> },
                { id: 'ACCOUNT_ACTIVITY', label: tr('حركة الحسابات', 'Account Activity'), icon: <Hash size={16} /> },
                { id: 'ACCOUNT_LEDGER', label: tr('دفتر الأستاذ', 'General Ledger'), icon: <BookOpen size={16} /> },
            ],
            MANUFACTURING: [
                { id: 'MANUFACTURING_COST', label: tr('تحليل تكلفة التصنيع', 'Manufacturing Cost Analysis'), icon: <Calculator size={16} /> },
            ],
            MENU: []
        };

        return (
            <div className="animate-in slide-in-from-right-4 duration-500">
                <button onClick={() => setActiveCategory('MENU')} className="mb-2 flex items-center gap-2 text-blue-600 font-black text-[10px] bg-blue-50 px-3 py-1.5 rounded-full w-fit"><ArrowLeft className={isEnglish ? '' : 'rotate-180'} size={12} /> {tr('العودة للتصنيفات', 'Back to Categories')}</button>
                <div className="grid grid-cols-2 gap-2">
                    {reportList[activeCategory].map(report => (
                        <button key={report.id} onClick={() => setActiveReport(report.id)} className="w-full bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between gap-2 group active:scale-95 transition-all text-start min-h-[74px]">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="p-2 bg-gray-50 text-gray-400 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">{report.icon}</div>
                                <span className="font-black text-[11px] text-gray-800 break-words leading-4 min-w-0">{report.label}</span>
                            </div>
                            <ChevronDown className={`text-gray-300 ${isEnglish ? '-rotate-90' : 'rotate-90'} shrink-0`} size={14} />
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    // --- 7. Trial Balance ---
    const renderTrialBalance = () => {
        const trialData = accounts.map(acc => {
            const balance = financialData.balances[acc.id];
            // Only show accounts with movement or balance
            if (Math.abs(balance.debit) < 0.01 && Math.abs(balance.credit) < 0.01 && Math.abs(balance.net) < 0.01) return null;
            return { ...acc, ...balance };
        }).filter(Boolean) as (Account & { debit: number, credit: number, net: number })[];

        const totals = trialData.reduce((acc, curr) => ({
            debit: acc.debit + curr.debit,
            credit: acc.credit + curr.credit
        }), { debit: 0, credit: 0 });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('ميزان المراجعة', 'Trial Balance')} />
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-4">{tr('الحساب', 'Account')}</th>
                                <th className="p-4 dir-ltr text-center">{tr('مدين', 'Debit')}</th>
                                <th className="p-4 dir-ltr text-center">{tr('دائن', 'Credit')}</th>
                                <th className="p-4 dir-ltr text-center">{tr('الرصيد', 'Balance')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {trialData.map(acc => (
                                <tr key={acc.id} className="text-sm hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-bold text-gray-700">{displayAccountName(acc)} <span className="text-[9px] text-gray-400 font-normal">({acc.code})</span></td>
                                    <td className="p-4 font-bold text-gray-600 dir-ltr text-center">{formatValue(acc.debit)}</td>
                                    <td className="p-4 font-bold text-gray-600 dir-ltr text-center">{formatValue(acc.credit)}</td>
                                    <td className={`p-4 font-black dir-ltr text-center ${acc.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {formatValue(Math.abs(acc.net))} {acc.net >= 0 ? (acc.type === 'ASSET' || acc.type === 'EXPENSE' ? tr('مدين', 'Debit') : tr('دائن', 'Credit')) : (acc.type === 'ASSET' || acc.type === 'EXPENSE' ? tr('دائن', 'Credit') : tr('مدين', 'Debit'))}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-blue-50/50 font-black text-blue-800 border-t-2 border-blue-100">
                                <td className="p-4">{tr('الإجمالي', 'Total')}</td>
                                <td className="p-4 dir-ltr text-center">{formatValue(totals.debit)}</td>
                                <td className="p-4 dir-ltr text-center">{formatValue(totals.credit)}</td>
                                <td className="p-4 text-center text-xs">-</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- 8. Income Statement ---
    const renderIncomeStatement = () => {
        const revenueDetails = getDetailedAccounts(['REVENUE'], 'period');
        const expenseDetails = getDetailedAccounts(['EXPENSE'], 'period');

        const totalRevenue = revenueDetails.reduce((sum, acc) => sum + acc.net, 0);
        const totalExpense = expenseDetails.reduce((sum, acc) => sum + acc.net, 0);
        const netProfit = totalRevenue - totalExpense;

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('قائمة الدخل (الأرباح والخسائر)', 'Income Statement (P&L)')} />

                <div className="grid gap-6">
                    {/* Summary Card */}
                    <div className={`p-8 rounded-[3rem] text-white shadow-xl text-center relative overflow-hidden ${netProfit >= 0 ? 'bg-gradient-to-br from-emerald-600 to-emerald-900' : 'bg-gradient-to-br from-rose-600 to-rose-900'}`}>
                        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                        <h3 className="text-lg font-bold mb-2 opacity-90">{netProfit >= 0 ? tr('صافي الربح', 'Net Profit') : tr('صافي الخسارة', 'Net Loss')}</h3>
                        <h1 className="text-5xl font-black dir-ltr tracking-tighter">{formatValue(Math.abs(netProfit))}</h1>
                        <p className="text-[10px] mt-4 opacity-75 font-bold uppercase tracking-widest">{tr('عن الفترة من', 'For period from')} {startDate} {tr('إلى', 'to')} {endDate}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-6">
                        <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm content-start">
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-50">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={20} /></div>
                                <div className="flex-1">
                                    <h3 className="font-black text-gray-800">{tr('الإيرادات', 'Revenue')}</h3>
                                    <p className="text-[10px] text-gray-400">{tr('تحليل مصادر الدخل', 'Income sources analysis')}</p>
                                </div>
                                <h4 className="text-xl font-black text-emerald-600 dir-ltr">{formatValue(Math.abs(totalRevenue))}</h4>
                            </div>
                            <div className="space-y-1">
                                {revenueDetails.map(acc => (
                                    <div key={acc.id} className="flex justify-between items-center py-2 px-2 hover:bg-gray-50 rounded-lg text-xs">
                                        <span className="font-bold text-gray-700">{displayAccountName(acc)} <span className="text-[9px] text-gray-400">({acc.code})</span></span>
                                        <span className="font-black text-emerald-600 dir-ltr">{formatValue(Math.abs(acc.net))}</span>
                                    </div>
                                ))}
                                {revenueDetails.length === 0 && (
                                    <p className="text-center text-gray-400 py-4">{tr('لا توجد إيرادات ضمن الفترة المحددة', 'No revenue in selected period')}</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm content-start">
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-50">
                                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><TrendingDown size={20} /></div>
                                <div className="flex-1">
                                    <h3 className="font-black text-gray-800">{tr('المصروفات', 'Expenses')}</h3>
                                    <p className="text-[10px] text-gray-400">{tr('تحليل النفقات والتكاليف', 'Expense and cost analysis')}</p>
                                </div>
                                <h4 className="text-xl font-black text-rose-600 dir-ltr">{formatValue(Math.abs(totalExpense))}</h4>
                            </div>
                            <div className="space-y-1">
                                {expenseDetails.map(acc => (
                                    <div key={acc.id} className="flex justify-between items-center py-2 px-2 hover:bg-gray-50 rounded-lg text-xs">
                                        <span className="font-bold text-gray-700">{displayAccountName(acc)} <span className="text-[9px] text-gray-400">({acc.code})</span></span>
                                        <span className="font-black text-rose-600 dir-ltr">{formatValue(Math.abs(acc.net))}</span>
                                    </div>
                                ))}
                                {expenseDetails.length === 0 && (
                                    <p className="text-center text-gray-400 py-4">{tr('لا توجد مصروفات ضمن الفترة المحددة', 'No expenses in selected period')}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-50">
                            <h4 className="font-black text-gray-800">{tr('تفاصيل حسابات قائمة الدخل', 'Income statement account details')}</h4>
                            <span className="text-[10px] font-black text-gray-400">{tr('إيرادات ومصروفات', 'Revenue and expenses')}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div className="overflow-x-auto rounded-2xl border border-emerald-100">
                                <table className="w-full text-start min-w-[520px]">
                                    <thead className="bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase">
                                        <tr>
                                            <th className="p-3">{tr('الإيرادات', 'Revenue')}</th>
                                            <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                                            <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                                            <th className="p-3 text-center">{tr('الرصيد', 'Balance')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-emerald-50">
                                        {revenueDetails.map(acc => (
                                            <tr key={acc.id} className="text-xs hover:bg-gray-50 transition-colors">
                                                <td className="p-3 font-bold text-gray-700">
                                                    {displayAccountName(acc)} <span className="text-[9px] text-gray-400 font-normal">({acc.code})</span>
                                                </td>
                                                <td className="p-3 dir-ltr text-center font-bold text-gray-600">{formatValue(acc.debit)}</td>
                                                <td className="p-3 dir-ltr text-center font-bold text-gray-600">{formatValue(acc.credit)}</td>
                                                <td className="p-3 dir-ltr text-center font-black text-emerald-600">
                                                    {formatValue(Math.abs(acc.net))} {getBalanceNature(acc.type, acc.net)}
                                                </td>
                                            </tr>
                                        ))}
                                        {revenueDetails.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات إيرادات خلال الفترة', 'No revenue data in this period')}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-x-auto rounded-2xl border border-rose-100">
                                <table className="w-full text-start min-w-[520px]">
                                    <thead className="bg-rose-50 text-rose-700 text-[10px] font-black uppercase">
                                        <tr>
                                            <th className="p-3">{tr('المصروفات', 'Expenses')}</th>
                                            <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                                            <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                                            <th className="p-3 text-center">{tr('الرصيد', 'Balance')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rose-50">
                                        {expenseDetails.map(acc => (
                                            <tr key={acc.id} className="text-xs hover:bg-gray-50 transition-colors">
                                                <td className="p-3 font-bold text-gray-700">
                                                    {displayAccountName(acc)} <span className="text-[9px] text-gray-400 font-normal">({acc.code})</span>
                                                </td>
                                                <td className="p-3 dir-ltr text-center font-bold text-gray-600">{formatValue(acc.debit)}</td>
                                                <td className="p-3 dir-ltr text-center font-bold text-gray-600">{formatValue(acc.credit)}</td>
                                                <td className="p-3 dir-ltr text-center font-black text-rose-600">
                                                    {formatValue(Math.abs(acc.net))} {getBalanceNature(acc.type, acc.net)}
                                                </td>
                                            </tr>
                                        ))}
                                        {expenseDetails.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات مصروفات خلال الفترة', 'No expense data in this period')}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- 5-B. Checks In Vault (Incoming Pending) ---
    const renderChecksVault = () => {
        const list = checks
            .filter(c => c.type === 'INCOMING' && c.status === 'PENDING' && c.dueDate >= startDate && c.dueDate <= endDate)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const total = list.reduce((sum, c) => sum + (c.amount || 0), 0);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('الشيكات بالصندوق', 'Checks in Vault')} />
                <div className="bg-white p-4 rounded-[1.8rem] border border-gray-100 shadow-sm mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-gray-400 font-black">{tr('عدد الشيكات', 'Checks Count')}</p>
                        <h4 className="text-sm font-black text-gray-800 dir-ltr">{list.length}</h4>
                    </div>
                    <div className="text-left">
                        <p className="text-[10px] text-gray-400 font-black">{tr('الإجمالي', 'Total')}</p>
                        <h4 className="text-sm font-black text-emerald-600 dir-ltr">{formatValue(total)}</h4>
                    </div>
                </div>
                <div className="space-y-3">
                    {list.map(c => (
                        <div key={c.id} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><Wallet size={18} /></div>
                                <div>
                                    <h4 className="font-black text-xs text-gray-800">#{c.checkNumber} - {displayAccountName(c.bankAccountId ? accounts.find(a => a.id === c.bankAccountId) || null : { id: '', name: c.bankName })}</h4>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                                        {displayContactName(contacts.find(con => con.id === c.contactId) || null) || tr('غير معروف', 'Unknown')}
                                    </p>
                                </div>
                            </div>
                            <div className="text-left">
                                <p className="font-black text-sm dir-ltr text-gray-800">{formatValue(c.amount)}</p>
                                <p className="text-[9px] text-gray-400 font-bold">{c.dueDate}</p>
                            </div>
                        </div>
                    ))}
                    {list.length === 0 && (
                        <div className="bg-white p-8 rounded-[2rem] border border-dashed border-gray-200 text-center">
                            <p className="text-xs font-bold text-gray-400">{tr('لا توجد شيكات واردة قيد الانتظار ضمن الفترة المحددة', 'No pending incoming checks in the selected period')}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- 5-C. Checks Under Collection By Bank ---
    const renderChecksUnderCollectionByBank = () => {
        const underCollection = checks
            .filter(c => c.type === 'INCOMING' && c.status === 'UNDER_COLLECTION' && c.dueDate >= startDate && c.dueDate <= endDate)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const grouped = underCollection.reduce((acc, check) => {
            const key = check.depositedBankId || 'UNASSIGNED';
            if (!acc[key]) acc[key] = [];
            acc[key].push(check);
            return acc;
        }, {} as Record<string, Check[]>);

        const groupRows = (Object.entries(grouped) as [string, Check[]][])
            .map(([bankId, list]) => {
                const total = list.reduce((sum, c) => sum + (c.amount || 0), 0);
                const bankName = bankId === 'UNASSIGNED'
                    ? tr('بدون بنك محدد', 'No Assigned Bank')
                    : (displayAccountName(accounts.find(a => a.id === bankId) || null) || tr('بنك غير معروف', 'Unknown Bank'));
                return { bankId, bankName, total, count: list.length, list };
            })
            .sort((a, b) => b.total - a.total);

        const grandTotal = groupRows.reduce((sum, row) => sum + row.total, 0);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('شيكات برسم التحصيل حسب البنك', 'Under-Collection Checks by Bank')} />
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('عدد الشيكات', 'Checks Count')}</p>
                        <p className="text-sm font-black dir-ltr text-blue-700">{underCollection.length}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('الإجمالي', 'Total')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-600">{formatValue(grandTotal)}</p>
                    </div>
                </div>
                <div className="space-y-4">
                    {groupRows.map(group => (
                        <div key={group.bankId} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                            <div className="p-4 border-b border-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Building2 size={16} /></div>
                                    <div>
                                        <h4 className="font-black text-sm text-gray-800">{group.bankName}</h4>
                                        <p className="text-[9px] text-gray-400 font-bold">{group.count} {tr('شيك', 'check')}</p>
                                    </div>
                                </div>
                                <span className="font-black text-sm text-blue-700 dir-ltr">{formatValue(group.total)}</span>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {group.list.map(c => (
                                    <div key={c.id} className="p-3 flex justify-between items-center text-xs">
                                        <div className="min-w-0">
                                            <p className="font-black text-gray-700 truncate">#{c.checkNumber} - {displayAccountName(c.bankAccountId ? accounts.find(a => a.id === c.bankAccountId) || null : { id: '', name: c.bankName })}</p>
                                            <p className="text-[9px] text-gray-400 font-bold truncate">{displayContactName(contacts.find(con => con.id === c.contactId) || null) || tr('غير معروف', 'Unknown')}</p>
                                        </div>
                                        <div className="text-left">
                                            <p className="font-black dir-ltr text-gray-800">{formatValue(c.amount)}</p>
                                            <p className="text-[9px] text-gray-400 font-bold">{c.dueDate}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {groupRows.length === 0 && (
                        <div className="bg-white p-8 rounded-[2rem] border border-dashed border-gray-200 text-center">
                            <p className="text-xs font-bold text-gray-400">{tr('لا توجد شيكات برسم التحصيل ضمن الفترة المحددة', 'No under-collection checks in the selected period')}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- 5-D. Checks Maturity (Weekly/Monthly) ---
    const renderChecksMaturity = () => {
        const warningDays = 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const getWeekStartKey = (dateStr: string) => {
            const d = new Date(dateStr);
            d.setHours(0, 0, 0, 0);
            const day = d.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diffToMonday);
            return d.toISOString().slice(0, 10);
        };

        const maturityRows = checks
            .filter(c => (c.status === 'PENDING' || c.status === 'UNDER_COLLECTION') && c.dueDate >= startDate && c.dueDate <= endDate)
            .map(check => {
                const due = new Date(check.dueDate);
                due.setHours(0, 0, 0, 0);
                const daysToDue = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const alertLevel = daysToDue < 0 ? 'OVERDUE' : daysToDue <= warningDays ? 'SOON' : 'NORMAL';
                return {
                    ...check,
                    daysToDue,
                    alertLevel,
                    weekKey: getWeekStartKey(check.dueDate),
                    monthKey: check.dueDate.slice(0, 7)
                };
            })
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const summary = maturityRows.reduce((sum, row) => ({
            totalAmount: sum.totalAmount + row.amount,
            overdueCount: sum.overdueCount + (row.alertLevel === 'OVERDUE' ? 1 : 0),
            soonCount: sum.soonCount + (row.alertLevel === 'SOON' ? 1 : 0)
        }), { totalAmount: 0, overdueCount: 0, soonCount: 0 });

        type MaturityRow = typeof maturityRows[number];

        const weeklyGroups = (Object.entries(
            maturityRows.reduce((acc, row) => {
                if (!acc[row.weekKey]) acc[row.weekKey] = [];
                acc[row.weekKey].push(row);
                return acc;
            }, {} as Record<string, MaturityRow[]>)
        ) as [string, MaturityRow[]][])
            .map(([weekKey, list]) => ({
                weekKey,
                count: list.length,
                amount: list.reduce((sum, item) => sum + item.amount, 0),
                overdueCount: list.filter(item => item.alertLevel === 'OVERDUE').length,
                soonCount: list.filter(item => item.alertLevel === 'SOON').length
            }))
            .sort((a, b) => a.weekKey.localeCompare(b.weekKey));

        const monthlyGroups = (Object.entries(
            maturityRows.reduce((acc, row) => {
                if (!acc[row.monthKey]) acc[row.monthKey] = [];
                acc[row.monthKey].push(row);
                return acc;
            }, {} as Record<string, MaturityRow[]>)
        ) as [string, MaturityRow[]][])
            .map(([monthKey, list]) => ({
                monthKey,
                count: list.length,
                amount: list.reduce((sum, item) => sum + item.amount, 0),
                overdueCount: list.filter(item => item.alertLevel === 'OVERDUE').length,
                soonCount: list.filter(item => item.alertLevel === 'SOON').length
            }))
            .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تقرير آجال استحقاق الشيكات', 'Checks Maturity Report')} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('عدد الشيكات', 'Checks Count')}</p>
                        <p className="text-sm font-black dir-ltr text-blue-700">{maturityRows.length}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('متأخرة', 'Overdue')}</p>
                        <p className="text-sm font-black dir-ltr text-rose-600">{summary.overdueCount}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('قريبة الاستحقاق', 'Due Soon')} (? {warningDays} {tr('أيام', 'days')})</p>
                        <p className="text-sm font-black dir-ltr text-amber-600">{summary.soonCount}</p>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي المبلغ', 'Total Amount')}</p>
                        <p className="text-sm font-black dir-ltr text-emerald-600">{formatValue(summary.totalAmount)}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                        <div className="px-4 py-3 border-b border-gray-50">
                            <h4 className="font-black text-sm text-gray-800">{tr('تجميع أسبوعي', 'Weekly Grouping')}</h4>
                        </div>
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('بداية الأسبوع', 'Week Start')}</th>
                                    <th className="p-3 text-center">{tr('العدد', 'Count')}</th>
                                    <th className="p-3 text-center">{tr('متأخر', 'Overdue')}</th>
                                    <th className="p-3 text-center">{tr('قريب', 'Soon')}</th>
                                    <th className="p-3 text-center">{tr('المبلغ', 'Amount')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {weeklyGroups.map(group => (
                                    <tr key={group.weekKey} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold text-gray-700">{group.weekKey}</td>
                                        <td className="p-3 text-center dir-ltr">{group.count}</td>
                                        <td className="p-3 text-center dir-ltr text-rose-600">{group.overdueCount}</td>
                                        <td className="p-3 text-center dir-ltr text-amber-600">{group.soonCount}</td>
                                        <td className="p-3 text-center dir-ltr font-black">{formatValue(group.amount)}</td>
                                    </tr>
                                ))}
                                {weeklyGroups.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات ضمن الفترة', 'No data in selected period')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                        <div className="px-4 py-3 border-b border-gray-50">
                            <h4 className="font-black text-sm text-gray-800">{tr('تجميع شهري', 'Monthly Grouping')}</h4>
                        </div>
                        <table className="w-full text-start min-w-[760px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الشهر', 'Month')}</th>
                                    <th className="p-3 text-center">{tr('العدد', 'Count')}</th>
                                    <th className="p-3 text-center">{tr('متأخر', 'Overdue')}</th>
                                    <th className="p-3 text-center">{tr('قريب', 'Soon')}</th>
                                    <th className="p-3 text-center">{tr('المبلغ', 'Amount')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {monthlyGroups.map(group => (
                                    <tr key={group.monthKey} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold text-gray-700">{group.monthKey}</td>
                                        <td className="p-3 text-center dir-ltr">{group.count}</td>
                                        <td className="p-3 text-center dir-ltr text-rose-600">{group.overdueCount}</td>
                                        <td className="p-3 text-center dir-ltr text-amber-600">{group.soonCount}</td>
                                        <td className="p-3 text-center dir-ltr font-black">{formatValue(group.amount)}</td>
                                    </tr>
                                ))}
                                {monthlyGroups.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات ضمن الفترة', 'No data in selected period')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="px-4 py-3 border-b border-gray-50">
                        <h4 className="font-black text-sm text-gray-800">{tr('تفاصيل الاستحقاقات', 'Maturity Details')}</h4>
                    </div>
                    <table className="w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('رقم الشيك', 'Check Number')}</th>
                                <th className="p-3">{tr('النوع', 'Type')}</th>
                                <th className="p-3">{tr('الطرف', 'Party')}</th>
                                <th className="p-3 text-center">{tr('تاريخ الاستحقاق', 'Due Date')}</th>
                                <th className="p-3 text-center">{tr('الحالة', 'Status')}</th>
                                <th className="p-3 text-center">{tr('المبلغ', 'Amount')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            {maturityRows.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    <td className="p-3 font-bold text-gray-700">#{row.checkNumber}</td>
                                    <td className="p-3">{row.type === 'INCOMING' ? tr('وارد', 'Incoming') : tr('صادر', 'Outgoing')}</td>
                                    <td className="p-3">{displayContactName(contacts.find(c => c.id === row.contactId) || null) || tr('غير معروف', 'Unknown')}</td>
                                    <td className="p-3 text-center">{row.dueDate}</td>
                                    <td className="p-3 text-center">
                                        {row.alertLevel === 'OVERDUE' && <span className="px-2 py-1 rounded-md text-[10px] font-black bg-rose-50 text-rose-600">{tr('متأخر', 'Overdue')} {Math.abs(row.daysToDue)} {tr('يوم', 'day')}</span>}
                                        {row.alertLevel === 'SOON' && <span className="px-2 py-1 rounded-md text-[10px] font-black bg-amber-50 text-amber-600">{tr('قريب', 'Soon')} {row.daysToDue} {tr('يوم', 'day')}</span>}
                                        {row.alertLevel === 'NORMAL' && <span className="px-2 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-600">{tr('مستقبلي', 'Future')}</span>}
                                    </td>
                                    <td className="p-3 text-center dir-ltr font-black">{formatValue(row.amount)}</td>
                                </tr>
                            ))}
                            {maturityRows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد شيكات مطابقة للفترة المحددة', 'No checks matching the selected period')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- 9. Balance Sheet ---
    const renderBalanceSheet = () => {
        // Assets
        const assetsRoot = financialData.accountMap.get('acc_assets');
        const currentAssets = financialData.accountMap.get('acc_current_assets');
        const fixedAssetsAcc = financialData.accountMap.get('acc_fixed_assets_root');

        // Liabilities
        const liabilitiesRoot = financialData.accountMap.get('acc_liabilities');
        const currentLiabilities = financialData.accountMap.get('acc_current_liabilities');
        const longTermLiabilities = financialData.accountMap.get('acc_long_term_liabilities');

        // Equity
        const equityRoot = financialData.accountMap.get('acc_equity_root');
        const positionDetails = getDetailedAccounts(['ASSET', 'LIABILITY', 'EQUITY']);

        const totalAssets = assetsRoot ? assetsRoot.nodeValue : 0;

        // Equity needs special handling for Prior Profit
        const totalEquityRaw = equityRoot ? equityRoot.nodeValue : 0;

        // Calculate Period Net Profit
        const revenueRoot = financialData.accountMap.get('acc_revenue_root');
        const expenseRoot = financialData.accountMap.get('acc_expense_root');
        const totalRevenue = revenueRoot ? revenueRoot.nodeValue : 0;
        const totalExpense = expenseRoot ? expenseRoot.nodeValue : 0;
        const periodNetProfit = totalRevenue - totalExpense;

        const totalEquityFinal = totalEquityRaw + periodNetProfit + financialData.priorProfit;
        const totalLiabilities = liabilitiesRoot ? liabilitiesRoot.nodeValue : 0;

        const totalLiabAndEquity = totalLiabilities + totalEquityFinal;

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('الميزانية العمومية', 'Balance Sheet')} />

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3 md:gap-6">
                        {/* Assets Side */}
                        <div>
                            <h3 className="text-center font-black text-blue-800 bg-blue-100 py-2 rounded-xl mb-4">{tr('الأصول', 'Assets')}</h3>
                            <BalanceSheetSection title={tr('الأصول المتداولة', 'Current Assets')} rootNode={currentAssets} color="text-emerald-600" formatValue={formatValue} displayAccountName={displayAccountName} />
                            <BalanceSheetSection title={tr('الأصول الثابتة', 'Fixed Assets')} rootNode={fixedAssetsAcc} color="text-indigo-600" formatValue={formatValue} displayAccountName={displayAccountName} />

                            {/* Any other assets that are not current or fixed? */}
                            {assetsRoot && assetsRoot.children
                                .filter(c => c.id !== 'acc_current_assets' && c.id !== 'acc_fixed_assets_root')
                                .map(c => <BalanceSheetSection key={c.id} title={displayAccountName(c)} rootNode={c} color="text-blue-600" formatValue={formatValue} displayAccountName={displayAccountName} />)
                            }

                            <div className="mt-4 bg-blue-600 text-white p-6 rounded-[2rem] flex justify-between items-center font-black shadow-lg shadow-blue-200">
                                <span>{tr('إجمالي الأصول', 'Total Assets')}</span>
                                <span className="dir-ltr text-2xl">{formatValue(totalAssets)}</span>
                            </div>
                        </div>

                        {/* Liabilities & Equity Side */}
                        <div>
                            <h3 className="text-center font-black text-rose-800 bg-rose-100 py-2 rounded-xl mb-4">{tr('الخصوم وحقوق الملكية', 'Liabilities and Equity')}</h3>

                            <BalanceSheetSection title={tr('الخصوم المتداولة', 'Current Liabilities')} rootNode={currentLiabilities} color="text-rose-600" formatValue={formatValue} displayAccountName={displayAccountName} />
                            {longTermLiabilities && <BalanceSheetSection title={tr('الخصوم طويلة الأجل', 'Long-term Liabilities')} rootNode={longTermLiabilities} color="text-rose-600" formatValue={formatValue} displayAccountName={displayAccountName} />}

                            {/* Any other liabilities */}
                            {liabilitiesRoot && liabilitiesRoot.children
                                .filter(c => c.id !== 'acc_current_liabilities' && c.id !== 'acc_long_term_liabilities')
                                .map(c => <BalanceSheetSection key={c.id} title={displayAccountName(c)} rootNode={c} color="text-rose-600" formatValue={formatValue} displayAccountName={displayAccountName} />)
                            }

                            <div className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm mb-4">
                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-50">
                                    <h4 className="font-black text-gray-800">{tr('حقوق الملكية', 'Equity')}</h4>
                                    <span className="font-black text-lg dir-ltr text-amber-600">{formatValue(totalEquityFinal)}</span>
                                </div>
                                <div className="space-y-1">
                                    {equityRoot && equityRoot.children.map(child => <AccountRow key={child.id} node={child} colorClass="text-gray-600" formatValue={formatValue} displayAccountName={displayAccountName} />)}

                                    <div className="flex justify-between items-center py-2 px-2 border-t border-dashed border-gray-100 mt-2">
                                        <span className="text-xs font-bold text-gray-500">{tr('أرباح الفترة الحالية', 'Current Period Profit')}</span>
                                        <span className="font-black dir-ltr text-emerald-600">{formatValue(periodNetProfit)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 px-2">
                                        <span className="text-xs font-bold text-gray-500">{tr('الأرباح المرحلة (السابقة)', 'Retained Earnings (Previous)')}</span>
                                        <span className="font-black dir-ltr text-gray-600">{formatValue(financialData.priorProfit)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 bg-gray-900 text-white p-6 rounded-[2rem] flex justify-between items-center font-black shadow-lg shadow-gray-200">
                                <span>{tr('إجمالي الخصوم وحقوق الملكية', 'Total Liabilities and Equity')}</span>
                                <span className="dir-ltr text-2xl">{formatValue(totalLiabAndEquity)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-50">
                            <h4 className="font-black text-gray-800">{tr('تفاصيل حسابات المركز المالي', 'Financial Position Accounts Details')}</h4>
                            <span className="text-[10px] font-black text-gray-400">{tr('أصول / خصوم / حقوق ملكية', 'Assets / Liabilities / Equity')}</span>
                        </div>
                        <table className="w-full text-start min-w-[700px]">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الحساب', 'Account')}</th>
                                    <th className="p-3 text-center">{tr('النوع', 'Type')}</th>
                                    <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                                    <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                                    <th className="p-3 text-center">{tr('الرصيد', 'Balance')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {positionDetails.map(acc => (
                                    <tr key={acc.id} className="text-xs hover:bg-gray-50 transition-colors">
                                        <td className="p-3 font-bold text-gray-700">
                                            {displayAccountName(acc)} <span className="text-[9px] text-gray-400 font-normal">({acc.code})</span>
                                        </td>
                                        <td className="p-3 text-center font-black text-gray-500">
                                            {acc.type === 'ASSET'
                                                ? tr('أصل', 'Asset')
                                                : acc.type === 'LIABILITY'
                                                    ? tr('خصم', 'Liability')
                                                    : tr('حقوق ملكية', 'Equity')}
                                        </td>
                                        <td className="p-3 dir-ltr text-center font-bold text-gray-600">{formatValue(acc.debit)}</td>
                                        <td className="p-3 dir-ltr text-center font-bold text-gray-600">{formatValue(acc.credit)}</td>
                                        <td className={`p-3 dir-ltr text-center font-black ${acc.type === 'ASSET' ? 'text-blue-600' : acc.type === 'LIABILITY' ? 'text-rose-600' : 'text-amber-600'}`}>
                                            {formatValue(Math.abs(acc.net))} {getBalanceNature(acc.type, acc.net)}
                                        </td>
                                    </tr>
                                ))}
                                {positionDetails.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد حركة حسابات خلال الفترة المحددة', 'No account movements in selected period')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 9-B. Liabilities Report ---
    const renderLiabilitiesReport = () => {
        const accountById = new Map<string, Account>(accounts.map(acc => [acc.id, acc]));

        const isUnderParent = (account: Account, targetParentId: string) => {
            let currId = account.parentId;
            while (currId) {
                if (currId === targetParentId) return true;
                const parent = accountById.get(currId);
                currId = parent?.parentId;
            }
            return false;
        };

        const liabilities = accounts
            .filter(acc => !acc.isGroup && acc.type === 'LIABILITY')
            .map(acc => {
                const bal = financialData.balances[acc.id] || { debit: 0, credit: 0, net: 0 };
                const closingBalance = bal.credit - bal.debit;

                let bucket: 'CURRENT' | 'LONG_TERM' | 'OTHER' = 'OTHER';
                if (isUnderParent(acc, 'acc_current_liabilities')) bucket = 'CURRENT';
                else if (isUnderParent(acc, 'acc_long_term_liabilities')) bucket = 'LONG_TERM';

                return { ...acc, debit: bal.debit, credit: bal.credit, closingBalance, bucket };
            })
            .filter(acc => Math.abs(acc.debit) > 0.01 || Math.abs(acc.credit) > 0.01 || Math.abs(acc.closingBalance) > 0.01)
            .sort((a, b) => a.code.localeCompare(b.code, 'ar'));

        const totals = liabilities.reduce((sum, acc) => {
            sum.debit += acc.debit;
            sum.credit += acc.credit;

            if (acc.bucket === 'CURRENT') sum.current += acc.closingBalance;
            else if (acc.bucket === 'LONG_TERM') sum.longTerm += acc.closingBalance;
            else sum.other += acc.closingBalance;

            return sum;
        }, { debit: 0, credit: 0, current: 0, longTerm: 0, other: 0 });

        const totalLiabilities = totals.current + totals.longTerm + totals.other;
        const currentShare = totalLiabilities > 0 ? (totals.current / totalLiabilities) * 100 : 0;

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تقرير الالتزامات', 'Liabilities Report')} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                        <p className="text-[10px] font-black text-rose-600 mb-1">{tr('إجمالي الالتزامات', 'Total Liabilities')}</p>
                        <p className="font-black text-rose-800 dir-ltr">{formatValue(totalLiabilities)}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                        <p className="text-[10px] font-black text-amber-600 mb-1">{tr('الالتزامات المتداولة', 'Current Liabilities')}</p>
                        <p className="font-black text-amber-800 dir-ltr">{formatValue(totals.current)}</p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                        <p className="text-[10px] font-black text-indigo-600 mb-1">{tr('الالتزامات طويلة الأجل', 'Long-term Liabilities')}</p>
                        <p className="font-black text-indigo-800 dir-ltr">{formatValue(totals.longTerm)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100">
                        <p className="text-[10px] font-black text-gray-500 mb-1">{tr('نسبة المتداول من الإجمالي', 'Current Share of Total')}</p>
                        <p className="font-black text-blue-700 dir-ltr">{currentShare.toFixed(1)}%</p>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="w-full text-start min-w-[720px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('الحساب', 'Account')}</th>
                                <th className="p-3 text-center">{tr('التصنيف', 'Classification')}</th>
                                <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                                <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                                <th className="p-3 text-center">{tr('الرصيد', 'Balance')}</th>
                                <th className="p-3 text-center">{tr('الطبيعة', 'Nature')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            {liabilities.map(acc => (
                                <tr key={acc.id} className="hover:bg-gray-50">
                                    <td className="p-3 font-bold text-gray-700">
                                        {displayAccountName(acc)} <span className="text-[9px] text-gray-400 font-normal">({acc.code})</span>
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-black ${acc.bucket === 'CURRENT' ? 'bg-amber-50 text-amber-700' : acc.bucket === 'LONG_TERM' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {acc.bucket === 'CURRENT'
                                                ? tr('متداولة', 'Current')
                                                : acc.bucket === 'LONG_TERM'
                                                    ? tr('طويلة الأجل', 'Long Term')
                                                    : tr('أخرى', 'Other')}
                                        </span>
                                    </td>
                                    <td className="p-3 text-center dir-ltr text-rose-600">{formatValue(acc.debit)}</td>
                                    <td className="p-3 text-center dir-ltr text-emerald-600">{formatValue(acc.credit)}</td>
                                    <td className="p-3 text-center dir-ltr font-black text-rose-700">{formatValue(Math.abs(acc.closingBalance))}</td>
                                    <td className="p-3 text-center font-black text-gray-600">{acc.closingBalance >= 0 ? tr('دائن', 'Credit') : tr('مدين', 'Debit')}</td>
                                </tr>
                            ))}
                            {liabilities.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد حركات التزامات ضمن الفترة المحددة', 'No liability movements in selected period')}</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-rose-50/60 text-rose-800 text-xs font-black">
                            <tr>
                                <td className="p-3">{tr('الإجمالي', 'Total')}</td>
                                <td className="p-3 text-center">-</td>
                                <td className="p-3 text-center dir-ltr">{formatValue(totals.debit)}</td>
                                <td className="p-3 text-center dir-ltr">{formatValue(totals.credit)}</td>
                                <td className="p-3 text-center dir-ltr">{formatValue(Math.abs(totalLiabilities))}</td>
                                <td className="p-3 text-center">{tr('دائن', 'Credit')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    // --- 10. Sales & Purchases Lists ---
    const renderTransactionList = (type: 'SALES' | 'PURCHASES' | 'RECEIPTS' | 'PAYMENTS') => {
        let title = '';
        let list: Invoice[] = [];

        if (type === 'SALES') {
            title = tr('سجل المبيعات', 'Sales List');
            list = invoices.filter(i => i.type === TransactionType.INCOME && i.date >= startDate && i.date <= endDate);
        } else if (type === 'PURCHASES') {
            title = tr('سجل المشتريات', 'Purchases List');
            list = invoices.filter(i => i.type === TransactionType.EXPENSE && i.date >= startDate && i.date <= endDate);
        } else if (type === 'RECEIPTS') {
            title = tr('سندات القبض', 'Receipt Vouchers');
            // Placeholder logic for receipts if separate from invoices, or filter invoices by specific criteria
            list = invoices.filter(i => i.type === TransactionType.INCOME && i.date >= startDate && i.date <= endDate);
        } else {
            title = tr('سندات الصرف', 'Payment Vouchers');
            list = invoices.filter(i => i.type === TransactionType.EXPENSE && i.date >= startDate && i.date <= endDate);
        }

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={title} />
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="statement-report-table w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-4">{tr('رقم السند', 'Voucher No.')}</th>
                                <th className="p-4">{tr('الطرف الثاني', 'Counterparty')}</th>
                                <th className="p-4">{tr('التاريخ', 'Date')}</th>
                                <th className="p-4 dir-ltr text-center">{tr('المبلغ', 'Amount')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {list.map(inv => (
                                <tr key={inv.id} className="text-sm hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-bold text-gray-700">#{inv.id}</td>
                                    <td className="p-4 text-gray-600">{displayContactName(contacts.find(c => c.id === inv.customerId) || null) || tr('غير معروف', 'Unknown')}</td>
                                    <td className="p-4 text-gray-500 font-bold text-xs">{inv.date}</td>
                                    <td className="p-4 font-black dir-ltr text-center text-blue-600">{formatValue(inv.totalAmount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- 11. Sales/Purchases By Item ---
    const renderItemAnalysis = (type: 'SALES' | 'PURCHASES') => {
        const title = type === 'SALES' ? tr('المبيعات حسب الصنف', 'Sales by Item') : tr('المشتريات حسب الصنف', 'Purchases by Item');
        const itemStats = products.map(p => {
            const relevantItems = invoices
                .filter(inv => inv.type === (type === 'SALES' ? TransactionType.INCOME : TransactionType.EXPENSE) && inv.date >= startDate && inv.date <= endDate)
                .flatMap(inv => inv.items.filter(i => i.productId === p.id));

            const totalQty = relevantItems.reduce((s, i) => s + i.quantity, 0);
            const totalVal = relevantItems.reduce((s, i) => s + i.total, 0);

            if (totalQty === 0) return null;
            return { product: p, totalQty, totalVal };
        }).filter(Boolean).sort((a, b) => b!.totalVal - a!.totalVal);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={title} />
                <div className="space-y-3">
                    {itemStats.map((stat, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Tag size={20} /></div>
                                <div><h4 className="font-black text-sm text-gray-800">{displayProductName(stat!.product)}</h4><p className="text-[9px] text-gray-400 font-bold uppercase">{stat!.totalQty} {tr('قطعة', 'pcs')}</p></div>
                            </div>
                            <span className="font-black text-sm text-gray-800 dir-ltr">{formatValue(stat!.totalVal)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 11-B. Purchases Cost Summary ---
    const renderPurchasesCostSummary = () => {
        const inRangePostedInvoices = invoices.filter(inv =>
            inv.postingStatus === 'POSTED' &&
            inv.date >= startDate &&
            inv.date <= endDate
        );

        const purchaseInvoices = inRangePostedInvoices.filter(inv => inv.category === 'purchase_invoice');
        const purchaseReturnInvoices = inRangePostedInvoices.filter(inv => inv.category === 'purchase_return');
        const importExpenseInvoices = inRangePostedInvoices.filter(inv => inv.category === 'import_expenses');

        const invoiceBase = (inv: Invoice) => (inv.totalAmount || 0) * (inv.exchangeRate || 1);
        const lineBase = (inv: Invoice, lineTotal: number) => (lineTotal || 0) * (inv.exchangeRate || 1);

        const grossPurchases = purchaseInvoices.reduce((sum, inv) => sum + invoiceBase(inv), 0);
        const purchaseReturns = purchaseReturnInvoices.reduce((sum, inv) => sum + invoiceBase(inv), 0);
        const importExpenses = importExpenseInvoices.reduce((sum, inv) => sum + invoiceBase(inv), 0);
        const netPurchases = Math.max(0, grossPurchases - purchaseReturns);
        const landedPurchases = netPurchases + importExpenses;

        const purchaseTax = purchaseInvoices.reduce((sum, inv) => sum + ((inv.taxAmount || 0) * (inv.exchangeRate || 1)), 0);
        const returnTax = purchaseReturnInvoices.reduce((sum, inv) => sum + ((inv.taxAmount || 0) * (inv.exchangeRate || 1)), 0);
        const importExpenseTax = importExpenseInvoices.reduce((sum, inv) => sum + ((inv.taxAmount || 0) * (inv.exchangeRate || 1)), 0);
        const netTax = (purchaseTax - returnTax) + importExpenseTax;

        const purchaseDiscounts = purchaseInvoices.reduce((sum, inv) => sum + ((inv.discountAmount || 0) * (inv.exchangeRate || 1)), 0);
        const returnDiscounts = purchaseReturnInvoices.reduce((sum, inv) => sum + ((inv.discountAmount || 0) * (inv.exchangeRate || 1)), 0);
        const netDiscounts = purchaseDiscounts - returnDiscounts;

        const purchasedQty = purchaseInvoices.reduce((sum, inv) => sum + inv.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);
        const returnedQty = purchaseReturnInvoices.reduce((sum, inv) => sum + inv.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);
        const netQty = purchasedQty - returnedQty;
        const avgPurchaseInvoice = purchaseInvoices.length > 0 ? grossPurchases / purchaseInvoices.length : 0;
        const avgLandedCostPerUnit = netQty > 0 ? landedPurchases / netQty : 0;

        const monthly = new Map<string, {
            purchases: number;
            returns: number;
            importExpenses: number;
        }>();
        const ensureMonth = (key: string) => {
            if (!monthly.has(key)) monthly.set(key, { purchases: 0, returns: 0, importExpenses: 0 });
            return monthly.get(key)!;
        };
        purchaseInvoices.forEach(inv => { ensureMonth(inv.date.slice(0, 7)).purchases += invoiceBase(inv); });
        purchaseReturnInvoices.forEach(inv => { ensureMonth(inv.date.slice(0, 7)).returns += invoiceBase(inv); });
        importExpenseInvoices.forEach(inv => { ensureMonth(inv.date.slice(0, 7)).importExpenses += invoiceBase(inv); });
        const monthlyRows = Array.from(monthly.entries())
            .map(([month, v]) => ({
                month,
                purchases: v.purchases,
                returns: v.returns,
                importExpenses: v.importExpenses,
                net: Math.max(0, v.purchases - v.returns),
                landed: Math.max(0, v.purchases - v.returns) + v.importExpenses
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        const supplierMap = new Map<string, {
            supplierId?: string;
            supplierName: string;
            purchases: number;
            returns: number;
            importExpenses: number;
            purchaseCount: number;
        }>();
        const pushSupplier = (inv: Invoice, bucket: 'purchases' | 'returns' | 'importExpenses') => {
            const key = inv.customerId || `unknown:${inv.id}`;
            const supplier = inv.customerId ? contacts.find(c => c.id === inv.customerId) : null;
            if (!supplierMap.has(key)) {
                supplierMap.set(key, {
                    supplierId: inv.customerId,
                    supplierName: supplier ? displayContactName(supplier) : tr('غير محدد', 'Unspecified'),
                    purchases: 0,
                    returns: 0,
                    importExpenses: 0,
                    purchaseCount: 0
                });
            }
            const row = supplierMap.get(key)!;
            row[bucket] += invoiceBase(inv);
            if (bucket === 'purchases') row.purchaseCount += 1;
        };
        purchaseInvoices.forEach(inv => pushSupplier(inv, 'purchases'));
        purchaseReturnInvoices.forEach(inv => pushSupplier(inv, 'returns'));
        importExpenseInvoices.forEach(inv => pushSupplier(inv, 'importExpenses'));
        const supplierRows = Array.from(supplierMap.values())
            .map(row => ({
                ...row,
                netPurchases: Math.max(0, row.purchases - row.returns),
                landed: Math.max(0, row.purchases - row.returns) + row.importExpenses
            }))
            .sort((a, b) => b.landed - a.landed);

        const uncodedPurchaseLinesCost = purchaseInvoices.reduce((sum, inv) =>
            sum + inv.items.filter(i => !i.productId).reduce((s, i) => s + lineBase(inv, i.total), 0), 0
        );

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تكلفة المشتريات', 'Purchases Cost')} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('إجمالي المشتريات', 'Gross Purchases')}</p>
                        <h3 className="text-lg font-black text-purple-700 dir-ltr mt-1">{formatValue(grossPurchases)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('مرتجعات المشتريات', 'Purchase Returns')}</p>
                        <h3 className="text-lg font-black text-rose-700 dir-ltr mt-1">{formatValue(purchaseReturns)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('مصاريف الاستيراد', 'Import Expenses')}</p>
                        <h3 className="text-lg font-black text-cyan-700 dir-ltr mt-1">{formatValue(importExpenses)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('صافي تكلفة المشتريات (Landed)', 'Net Purchases Cost (Landed)')}</p>
                        <h3 className="text-lg font-black text-blue-700 dir-ltr mt-1">{formatValue(landedPurchases)}</h3>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('صافي المشتريات قبل الاستيراد', 'Net Purchases (Before Import Exp.)')}</p>
                        <h4 className="font-black text-gray-800 dir-ltr">{formatValue(netPurchases)}</h4>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('صافي الضريبة', 'Net Tax')}</p>
                        <h4 className="font-black text-amber-700 dir-ltr">{formatValue(netTax)}</h4>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('صافي الكمية المشتراة', 'Net Purchased Qty')}</p>
                        <h4 className="font-black text-emerald-700 dir-ltr">{formatPlainNumber(netQty)}</h4>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('متوسط تكلفة الوحدة (تقريبي)', 'Avg Unit Cost (Estimated)')}</p>
                        <h4 className="font-black text-indigo-700 dir-ltr">{netQty > 0 ? formatValue(avgLandedCostPerUnit) : tr('غير متاح', 'N/A')}</h4>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Calendar size={16} className="text-blue-600" />
                            <h3 className="font-black text-gray-800">{tr('التكلفة الشهرية للمشتريات', 'Monthly Purchases Cost')}</h3>
                        </div>
                        <div className="space-y-2">
                            {monthlyRows.map(row => (
                                <div key={row.month} className="p-3 rounded-xl border border-gray-100 bg-gray-50/60">
                                    <div className="flex items-center justify-between">
                                        <p className="font-black text-gray-700 dir-ltr">{row.month}</p>
                                        <p className="font-black text-blue-700 dir-ltr">{formatValue(row.landed)}</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] font-bold">
                                        <div className="bg-white rounded-lg px-2 py-1 border border-gray-100">
                                            <span className="text-gray-400">{tr('شراء', 'Purch.')}</span>
                                            <p className="dir-ltr text-gray-700">{formatValue(row.purchases)}</p>
                                        </div>
                                        <div className="bg-white rounded-lg px-2 py-1 border border-gray-100">
                                            <span className="text-gray-400">{tr('مرتجع', 'Returns')}</span>
                                            <p className="dir-ltr text-rose-700">{formatValue(row.returns)}</p>
                                        </div>
                                        <div className="bg-white rounded-lg px-2 py-1 border border-gray-100">
                                            <span className="text-gray-400">{tr('استيراد', 'Import Exp.')}</span>
                                            <p className="dir-ltr text-cyan-700">{formatValue(row.importExpenses)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {monthlyRows.length === 0 && (
                                <div className="text-center py-6 text-xs font-bold text-gray-400">
                                    {tr('لا توجد حركات مشتريات ضمن الفترة المحددة', 'No purchase movements in selected period')}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <UserCheck size={16} className="text-purple-600" />
                            <h3 className="font-black text-gray-800">{tr('تكلفة المشتريات حسب المورد', 'Purchases Cost by Supplier')}</h3>
                        </div>
                        <div className="space-y-2">
                            {supplierRows.slice(0, 12).map((row, idx) => (
                                <div key={`${row.supplierId || row.supplierName}-${idx}`} className="p-3 rounded-xl border border-gray-100 bg-white">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-black text-gray-800 text-sm truncate">{row.supplierName}</p>
                                            <p className="text-[10px] text-gray-400 font-bold">{tr('فواتير شراء', 'Purchase Invoices')}: {row.purchaseCount}</p>
                                        </div>
                                        <p className="font-black text-blue-700 dir-ltr">{formatValue(row.landed)}</p>
                                    </div>
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-bold">
                                        <div className="bg-purple-50 border border-purple-100 rounded-lg px-2 py-1 text-purple-700 dir-ltr">{formatValue(row.purchases)}</div>
                                        <div className="bg-rose-50 border border-rose-100 rounded-lg px-2 py-1 text-rose-700 dir-ltr">{formatValue(row.returns)}</div>
                                        <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-2 py-1 text-cyan-700 dir-ltr">{formatValue(row.importExpenses)}</div>
                                    </div>
                                </div>
                            ))}
                            {supplierRows.length === 0 && (
                                <div className="text-center py-6 text-xs font-bold text-gray-400">
                                    {tr('لا توجد بيانات موردين ضمن الفترة المحددة', 'No supplier data in selected period')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <BookOpen size={16} className="text-gray-600" />
                        <h3 className="font-black text-gray-800">{tr('مراجع وأرقام مساعدة', 'Reference Values')}</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('عدد فواتير الشراء', 'Purchase Invoices')}</p><p className="font-black text-gray-800 dir-ltr">{formatPlainNumber(purchaseInvoices.length)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('عدد مرتجعات الشراء', 'Purchase Returns')}</p><p className="font-black text-gray-800 dir-ltr">{formatPlainNumber(purchaseReturnInvoices.length)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('عدد فواتير مصاريف الاستيراد', 'Import Expense Invoices')}</p><p className="font-black text-gray-800 dir-ltr">{formatPlainNumber(importExpenseInvoices.length)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('متوسط فاتورة الشراء', 'Avg Purchase Invoice')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(avgPurchaseInvoice)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('خصومات الشراء (صافي)', 'Net Purchase Discounts')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(netDiscounts)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('كمية مشتراة', 'Purchased Qty')}</p><p className="font-black text-gray-800 dir-ltr">{formatPlainNumber(purchasedQty)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('كمية مرتجعة', 'Returned Qty')}</p><p className="font-black text-gray-800 dir-ltr">{formatPlainNumber(returnedQty)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('بنود مشتريات بدون صنف', 'Purchase Lines Without Product')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(uncodedPurchaseLinesCost)}</p></div>
                    </div>
                </div>
            </div>
        );
    };

    // --- 11-C. Purchase Cost by Item ---
    const renderPurchaseCostByItem = () => {
        const postedRangeInvoices = invoices.filter(inv =>
            inv.postingStatus === 'POSTED' &&
            inv.date >= startDate &&
            inv.date <= endDate
        );
        const purchaseInvoices = postedRangeInvoices.filter(inv => inv.category === 'purchase_invoice');
        const purchaseReturnInvoices = postedRangeInvoices.filter(inv => inv.category === 'purchase_return');
        const importExpenseInvoices = postedRangeInvoices.filter(inv => inv.category === 'import_expenses');

        const toBase = (inv: Invoice, amount: number) => (amount || 0) * (inv.exchangeRate || 1);
        const importExpensesTotal = importExpenseInvoices.reduce((sum, inv) => sum + toBase(inv, inv.totalAmount || 0), 0);

        const byProduct = new Map<string, {
            product: Product;
            purchaseQty: number;
            returnQty: number;
            grossDirectCost: number;
            returnDirectCost: number;
            invoiceCount: number;
            lastPurchaseDate?: string;
        }>();

        const applyLine = (inv: Invoice, sign: 1 | -1) => {
            inv.items.forEach(item => {
                if (!item.productId) return;
                const product = products.find(p => p.id === item.productId);
                if (!product) return;

                if (!byProduct.has(product.id)) {
                    byProduct.set(product.id, {
                        product,
                        purchaseQty: 0,
                        returnQty: 0,
                        grossDirectCost: 0,
                        returnDirectCost: 0,
                        invoiceCount: 0,
                        lastPurchaseDate: undefined
                    });
                }
                const row = byProduct.get(product.id)!;
                const qty = Number(item.quantity) || 0;
                const cost = toBase(inv, Number(item.total) || 0);
                if (sign === 1) {
                    row.purchaseQty += qty;
                    row.grossDirectCost += cost;
                    row.invoiceCount += 1;
                    if (!row.lastPurchaseDate || inv.date > row.lastPurchaseDate) row.lastPurchaseDate = inv.date;
                } else {
                    row.returnQty += qty;
                    row.returnDirectCost += cost;
                }
            });
        };

        purchaseInvoices.forEach(inv => applyLine(inv, 1));
        purchaseReturnInvoices.forEach(inv => applyLine(inv, -1));

        const rawRows = Array.from(byProduct.values()).map(row => {
            const netQty = row.purchaseQty - row.returnQty;
            const netDirectCost = row.grossDirectCost - row.returnDirectCost;
            return {
                ...row,
                netQty,
                netDirectCost,
                avgDirectCost: netQty > 0 ? netDirectCost / netQty : null
            };
        });

        const totalNetDirectCost = rawRows.reduce((sum, row) => sum + Math.max(0, row.netDirectCost), 0);

        const itemRows = rawRows
            .map(row => {
                const allocRatio = totalNetDirectCost > 0 ? Math.max(0, row.netDirectCost) / totalNetDirectCost : 0;
                const allocatedImportCost = importExpensesTotal * allocRatio;
                const landedCost = row.netDirectCost + allocatedImportCost;
                const avgLandedCost = row.netQty > 0 ? landedCost / row.netQty : null;
                return {
                    ...row,
                    allocatedImportCost,
                    landedCost,
                    avgLandedCost
                };
            })
            .filter(row => Math.abs(row.purchaseQty) > 0.0001 || Math.abs(row.grossDirectCost) > 0.0001)
            .sort((a, b) => b.landedCost - a.landedCost);

        const totals = itemRows.reduce((sum, row) => ({
            purchaseQty: sum.purchaseQty + row.purchaseQty,
            returnQty: sum.returnQty + row.returnQty,
            netQty: sum.netQty + row.netQty,
            grossDirectCost: sum.grossDirectCost + row.grossDirectCost,
            returnDirectCost: sum.returnDirectCost + row.returnDirectCost,
            netDirectCost: sum.netDirectCost + row.netDirectCost,
            allocatedImportCost: sum.allocatedImportCost + row.allocatedImportCost,
            landedCost: sum.landedCost + row.landedCost
        }), {
            purchaseQty: 0,
            returnQty: 0,
            netQty: 0,
            grossDirectCost: 0,
            returnDirectCost: 0,
            netDirectCost: 0,
            allocatedImportCost: 0,
            landedCost: 0
        });

        const avgLandedUnit = totals.netQty > 0 ? totals.landedCost / totals.netQty : null;

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تكلفة المشتريات لكل صنف', 'Purchase Cost by Item')} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('عدد الأصناف المشتراة', 'Purchased Items Count')}</p>
                        <h3 className="text-lg font-black text-gray-800 dir-ltr mt-1">{formatPlainNumber(itemRows.length)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('التكلفة المباشرة الصافية', 'Net Direct Purchase Cost')}</p>
                        <h3 className="text-lg font-black text-purple-700 dir-ltr mt-1">{formatValue(totals.netDirectCost)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('توزيع مصاريف الاستيراد (تقريبي)', 'Allocated Import Expenses (Estimated)')}</p>
                        <h3 className="text-lg font-black text-cyan-700 dir-ltr mt-1">{formatValue(totals.allocatedImportCost)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('متوسط تكلفة الوحدة (Landed)', 'Avg Unit Cost (Landed)')}</p>
                        <h3 className="text-lg font-black text-blue-700 dir-ltr mt-1">{avgLandedUnit !== null ? formatValue(avgLandedUnit) : tr('غير متاح', 'N/A')}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="p-4 border-b border-gray-50 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <ClipboardList size={16} className="text-purple-600" />
                            <h3 className="font-black text-gray-800">{tr('تفاصيل تكلفة المشتريات لكل صنف', 'Purchase Cost Details by Item')}</h3>
                        </div>
                        <span className="text-[10px] font-black text-gray-400">
                            {tr('مرتب حسب أعلى تكلفة إجمالية', 'Sorted by highest total cost')}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-start">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الصنف', 'Item')}</th>
                                    <th className="p-3 text-center">{tr('كمية شراء', 'Purchased Qty')}</th>
                                    <th className="p-3 text-center">{tr('كمية مرتجع', 'Return Qty')}</th>
                                    <th className="p-3 text-center">{tr('الصافي', 'Net Qty')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة مباشرة', 'Direct Cost')}</th>
                                    <th className="p-3 text-center">{tr('توزيع استيراد', 'Import Alloc.')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة Landed', 'Landed Cost')}</th>
                                    <th className="p-3 text-center">{tr('متوسط مباشر', 'Avg Direct')}</th>
                                    <th className="p-3 text-center">{tr('متوسط Landed', 'Avg Landed')}</th>
                                    <th className="p-3 text-center">{tr('آخر شراء', 'Last Purchase')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {itemRows.map(row => (
                                    <tr key={row.product.id} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-black text-gray-800">{displayProductName(row.product)}</div>
                                            <div className="text-[10px] text-gray-400 font-bold dir-ltr">{row.product.itemCode || row.product.barcode || '-'}</div>
                                        </td>
                                        <td className="p-3 text-center dir-ltr">{formatPlainNumber(row.purchaseQty)}</td>
                                        <td className="p-3 text-center dir-ltr text-rose-600">{row.returnQty > 0 ? formatPlainNumber(row.returnQty) : '-'}</td>
                                        <td className={`p-3 text-center dir-ltr font-black ${row.netQty >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPlainNumber(row.netQty)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(row.netDirectCost)}</td>
                                        <td className="p-3 text-center dir-ltr text-cyan-700">{formatValue(row.allocatedImportCost)}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(row.landedCost)}</td>
                                        <td className="p-3 text-center dir-ltr">{row.avgDirectCost !== null ? formatValue(row.avgDirectCost) : '-'}</td>
                                        <td className="p-3 text-center dir-ltr">{row.avgLandedCost !== null ? formatValue(row.avgLandedCost) : '-'}</td>
                                        <td className="p-3 text-center text-gray-500 dir-ltr">{row.lastPurchaseDate || '-'}</td>
                                    </tr>
                                ))}
                                {itemRows.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="p-5 text-center text-xs font-bold text-gray-400">
                                            {tr('لا توجد أصناف مشتراة ضمن الفترة المحددة', 'No purchased items in selected period')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {itemRows.length > 0 && (
                                <tfoot className="bg-blue-50/40 text-xs font-black">
                                    <tr>
                                        <td className="p-3 text-gray-700">{tr('الإجمالي', 'Total')}</td>
                                        <td className="p-3 text-center dir-ltr">{formatPlainNumber(totals.purchaseQty)}</td>
                                        <td className="p-3 text-center dir-ltr text-rose-700">{formatPlainNumber(totals.returnQty)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatPlainNumber(totals.netQty)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(totals.netDirectCost)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(totals.allocatedImportCost)}</td>
                                        <td className="p-3 text-center dir-ltr text-blue-700">{formatValue(totals.landedCost)}</td>
                                        <td className="p-3 text-center">-</td>
                                        <td className="p-3 text-center dir-ltr">{avgLandedUnit !== null ? formatValue(avgLandedUnit) : '-'}</td>
                                        <td className="p-3 text-center">-</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                <div className="mt-4 p-3 rounded-xl border border-cyan-100 bg-cyan-50 text-xs text-cyan-800 font-bold">
                    {tr(
                        'ملاحظة: تم توزيع مصاريف الاستيراد على الأصناف بشكل تقديري حسب نسبة التكلفة المباشرة لكل صنف داخل الفترة المحددة (وليس توزيعًا دفتريًا على مستوى الفاتورة).',
                        'Note: Import expenses are allocated to items using a period-level proportional estimate based on each item direct purchase cost (not a document-level accounting allocation).'
                    )}
                </div>
            </div>
        );
    };

    const getPurchasesReportScope = () => {
        const postedRangeInvoices = invoices.filter(inv =>
            inv.postingStatus === 'POSTED' &&
            inv.date >= startDate &&
            inv.date <= endDate
        );
        const purchaseInvoices = postedRangeInvoices.filter(inv => inv.category === 'purchase_invoice');
        const purchaseReturnInvoices = postedRangeInvoices.filter(inv => inv.category === 'purchase_return');
        const importExpenseInvoices = postedRangeInvoices.filter(inv => inv.category === 'import_expenses');
        const invoiceBase = (inv: Invoice) => (inv.totalAmount || 0) * (inv.exchangeRate || 1);
        const lineBase = (inv: Invoice, amount: number) => (amount || 0) * (inv.exchangeRate || 1);
        return { postedRangeInvoices, purchaseInvoices, purchaseReturnInvoices, importExpenseInvoices, invoiceBase, lineBase };
    };

    // --- 11-D. Purchase Price Variance ---
    const renderPurchasePriceVariance = () => {
        const { purchaseInvoices, lineBase } = getPurchasesReportScope();

        type PriceLine = {
            supplierId?: string;
            supplierName: string;
            productId: string;
            productName: string;
            invoiceNumber: string;
            date: string;
            qty: number;
            unitPriceBase: number;
            lineTotalBase: number;
        };

        const lines: PriceLine[] = [];
        purchaseInvoices.forEach(inv => {
            const supplier = inv.customerId ? contacts.find(c => c.id === inv.customerId) : null;
            inv.items.forEach(item => {
                if (!item.productId) return;
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) return;
                const lineTotalBase = lineBase(inv, Number(item.total) || 0);
                const product = products.find(p => p.id === item.productId);
                lines.push({
                    supplierId: inv.customerId,
                    supplierName: supplier ? displayContactName(supplier) : tr('غير محدد', 'Unspecified'),
                    productId: item.productId,
                    productName: product ? displayProductName(product) : item.description,
                    invoiceNumber: inv.invoiceNumber,
                    date: inv.date,
                    qty,
                    unitPriceBase: lineTotalBase / qty,
                    lineTotalBase
                });
            });
        });

        const groups = new Map<string, PriceLine[]>();
        lines.forEach(line => {
            const key = `${line.supplierId || 'none'}::${line.productId}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(line);
        });

        const rows = Array.from(groups.values()).map(group => {
            const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber));
            const latest = sorted[sorted.length - 1];
            const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
            const qtyTotal = sorted.reduce((s, r) => s + r.qty, 0);
            const totalBase = sorted.reduce((s, r) => s + r.lineTotalBase, 0);
            const avgPrice = qtyTotal > 0 ? totalBase / qtyTotal : 0;
            const varPrev = previous ? latest.unitPriceBase - previous.unitPriceBase : null;
            const varAvg = latest.unitPriceBase - avgPrice;
            return {
                supplierId: latest.supplierId,
                supplierName: latest.supplierName,
                productId: latest.productId,
                productName: latest.productName,
                latestDate: latest.date,
                latestInvoiceNumber: latest.invoiceNumber,
                latestPrice: latest.unitPriceBase,
                previousPrice: previous?.unitPriceBase ?? null,
                avgPrice,
                qtyTotal,
                purchasesCount: sorted.length,
                varianceVsPrev: varPrev,
                varianceVsAvg: varAvg,
                impactVsAvg: varAvg * qtyTotal
            };
        }).sort((a, b) => Math.abs(b.impactVsAvg) - Math.abs(a.impactVsAvg));

        const favorableImpact = rows.filter(r => r.impactVsAvg < 0).reduce((s, r) => s + Math.abs(r.impactVsAvg), 0);
        const unfavorableImpact = rows.filter(r => r.impactVsAvg > 0).reduce((s, r) => s + r.impactVsAvg, 0);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('فروقات أسعار الشراء', 'Purchase Price Variance')} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('صفوف التحليل', 'Analyzed Rows')}</p><h3 className="text-lg font-black text-gray-800 dir-ltr mt-1">{formatPlainNumber(rows.length)}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('صفوف لها سعر سابق', 'Rows with Prior Price')}</p><h3 className="text-lg font-black text-indigo-700 dir-ltr mt-1">{formatPlainNumber(rows.filter(r => r.previousPrice !== null).length)}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('أثر موفر', 'Favorable Impact')}</p><h3 className="text-lg font-black text-emerald-700 dir-ltr mt-1">{formatValue(favorableImpact)}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('أثر زيادة', 'Unfavorable Impact')}</p><h3 className="text-lg font-black text-rose-700 dir-ltr mt-1">{formatValue(unfavorableImpact)}</h3></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="p-4 border-b border-gray-50 flex items-center gap-2"><TrendingDown size={16} className="text-purple-600" /><h3 className="font-black text-gray-800">{tr('مقارنة السعر الأخير مقابل السعر السابق ومتوسط الفترة', 'Latest Price vs Previous/Period Average')}</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1080px] text-start">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('المورد', 'Supplier')}</th>
                                    <th className="p-3">{tr('الصنف', 'Item')}</th>
                                    <th className="p-3 text-center">{tr('آخر فاتورة', 'Latest Invoice')}</th>
                                    <th className="p-3 text-center">{tr('آخر سعر', 'Latest')}</th>
                                    <th className="p-3 text-center">{tr('السابق', 'Previous')}</th>
                                    <th className="p-3 text-center">{tr('متوسط الفترة', 'Period Avg')}</th>
                                    <th className="p-3 text-center">{tr('فرق/المتوسط', 'Var/Avg')}</th>
                                    <th className="p-3 text-center">{tr('أثر تقديري', 'Est. Impact')}</th>
                                    <th className="p-3 text-center">{tr('كمية الفترة', 'Period Qty')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {rows.map((row, idx) => (
                                    <tr key={`${row.supplierId || row.supplierName}-${row.productId}-${idx}`} className="hover:bg-gray-50">
                                        <td className="p-3 font-black text-gray-800">{row.supplierName}</td>
                                        <td className="p-3"><div className="font-black text-gray-800">{row.productName}</div><div className="text-[10px] text-gray-400 dir-ltr">{row.productId}</div></td>
                                        <td className="p-3 text-center"><div className="font-black text-gray-700 dir-ltr">#{row.latestInvoiceNumber}</div><div className="text-[10px] text-gray-400 dir-ltr">{row.latestDate}</div></td>
                                        <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(row.latestPrice)}</td>
                                        <td className="p-3 text-center dir-ltr">{row.previousPrice !== null ? formatValue(row.previousPrice) : '-'}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(row.avgPrice)}</td>
                                        <td className={`p-3 text-center dir-ltr font-black ${row.varianceVsAvg <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatValue(row.varianceVsAvg)}</td>
                                        <td className={`p-3 text-center dir-ltr font-black ${row.impactVsAvg <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatValue(row.impactVsAvg)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatPlainNumber(row.qtyTotal)}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && <tr><td colSpan={9} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات كافية لتحليل فروقات الأسعار', 'No sufficient data for PPV analysis')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 11-E. Supplier Analysis ---
    const renderSupplierAnalysis = () => {
        const { purchaseInvoices, purchaseReturnInvoices, importExpenseInvoices, invoiceBase, lineBase } = getPurchasesReportScope();
        const dayDiff = (fromIso: string, toIso: string) =>
            Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24)));

        type SupplierRow = {
            supplierId?: string;
            supplierName: string;
            purchaseCount: number;
            returnCount: number;
            importExpenseCount: number;
            purchases: number;
            returns: number;
            importExpenses: number;
            avgInvoice: number;
            avgFrequencyDays: number | null;
            avgCreditTermDays: number | null;
            avgLeadTimeDays: number | null;
            priceCompliancePct: number | null;
            netPurchases: number;
            landedPurchases: number;
        };

        const buckets = new Map<string, {
            supplierId?: string;
            supplierName: string;
            purchaseCount: number;
            returnCount: number;
            importExpenseCount: number;
            purchases: number;
            returns: number;
            importExpenses: number;
            purchaseDates: string[];
            creditDaysSum: number;
            creditDaysCount: number;
            leadDaysSum: number;
            leadDaysCount: number;
            benchmarkedLines: number;
            compliantLines: number;
            lastPriceByProduct: Map<string, number>;
        }>();

        const getBucket = (supplierId?: string, fallbackId?: string) => {
            const key = supplierId || `unknown:${fallbackId || 'n/a'}`;
            if (!buckets.has(key)) {
                const supplier = supplierId ? contacts.find(c => c.id === supplierId) : null;
                buckets.set(key, {
                    supplierId,
                    supplierName: supplier ? displayContactName(supplier) : tr('غير محدد', 'Unspecified'),
                    purchaseCount: 0,
                    returnCount: 0,
                    importExpenseCount: 0,
                    purchases: 0,
                    returns: 0,
                    importExpenses: 0,
                    purchaseDates: [],
                    creditDaysSum: 0,
                    creditDaysCount: 0,
                    leadDaysSum: 0,
                    leadDaysCount: 0,
                    benchmarkedLines: 0,
                    compliantLines: 0,
                    lastPriceByProduct: new Map<string, number>()
                });
            }
            return buckets.get(key)!;
        };

        [...purchaseInvoices].sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber)).forEach(inv => {
            const b = getBucket(inv.customerId, inv.id);
            b.purchaseCount += 1;
            b.purchases += invoiceBase(inv);
            b.purchaseDates.push(inv.date);
            if (inv.dueDate) {
                b.creditDaysSum += dayDiff(inv.date, inv.dueDate);
                b.creditDaysCount += 1;
            }
            inv.items.forEach(item => {
                if (!item.productId) return;
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) return;
                const unitBase = lineBase(inv, Number(item.total) || 0) / qty;
                const prev = b.lastPriceByProduct.get(item.productId);
                if (prev && prev > 0) {
                    b.benchmarkedLines += 1;
                    if (unitBase <= prev * 1.02) b.compliantLines += 1;
                }
                b.lastPriceByProduct.set(item.productId, unitBase);
            });
        });

        purchaseReturnInvoices.forEach(inv => {
            const b = getBucket(inv.customerId, inv.id);
            b.returnCount += 1;
            b.returns += invoiceBase(inv);
        });

        importExpenseInvoices.forEach(inv => {
            const linkedPurchase = inv.linkedInvoiceId ? invoices.find(i => i.id === inv.linkedInvoiceId) : undefined;
            const b = getBucket(linkedPurchase?.customerId || inv.customerId, inv.id);
            b.importExpenseCount += 1;
            b.importExpenses += invoiceBase(inv);
            if (linkedPurchase) {
                b.leadDaysSum += dayDiff(linkedPurchase.date, inv.date);
                b.leadDaysCount += 1;
            }
        });

        const rows: SupplierRow[] = Array.from(buckets.values()).map(b => {
            const dates = [...b.purchaseDates].sort();
            let gapSum = 0;
            let gapCount = 0;
            for (let i = 1; i < dates.length; i += 1) {
                gapSum += dayDiff(dates[i - 1], dates[i]);
                gapCount += 1;
            }
            const netPurchases = Math.max(0, b.purchases - b.returns);
            return {
                supplierId: b.supplierId,
                supplierName: b.supplierName,
                purchaseCount: b.purchaseCount,
                returnCount: b.returnCount,
                importExpenseCount: b.importExpenseCount,
                purchases: b.purchases,
                returns: b.returns,
                importExpenses: b.importExpenses,
                avgInvoice: b.purchaseCount > 0 ? b.purchases / b.purchaseCount : 0,
                avgFrequencyDays: gapCount > 0 ? gapSum / gapCount : null,
                avgCreditTermDays: b.creditDaysCount > 0 ? b.creditDaysSum / b.creditDaysCount : null,
                avgLeadTimeDays: b.leadDaysCount > 0 ? b.leadDaysSum / b.leadDaysCount : null,
                priceCompliancePct: b.benchmarkedLines > 0 ? (b.compliantLines / b.benchmarkedLines) * 100 : null,
                netPurchases,
                landedPurchases: netPurchases + b.importExpenses
            };
        }).sort((a, b) => b.landedPurchases - a.landedPurchases);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تحليل الموردين', 'Supplier Analysis')} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('موردون نشطون', 'Active Suppliers')}</p><h3 className="text-lg font-black text-gray-800 dir-ltr mt-1">{formatPlainNumber(rows.length)}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('إجمالي المشتريات', 'Total Purchases')}</p><h3 className="text-lg font-black text-purple-700 dir-ltr mt-1">{formatValue(rows.reduce((s, r) => s + r.purchases, 0))}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-cyan-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('إجمالي مصاريف الاستيراد', 'Total Import Expenses')}</p><h3 className="text-lg font-black text-cyan-700 dir-ltr mt-1">{formatValue(rows.reduce((s, r) => s + r.importExpenses, 0))}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('متوسط الالتزام السعري', 'Avg Price Compliance')}</p><h3 className="text-lg font-black text-indigo-700 dir-ltr mt-1">{rows.filter(r => r.priceCompliancePct !== null).length ? `${formatPlainNumber(rows.filter(r => r.priceCompliancePct !== null).reduce((s, r) => s + (r.priceCompliancePct || 0), 0) / rows.filter(r => r.priceCompliancePct !== null).length)}%` : '-'}</h3></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
                    <div className="p-4 border-b border-gray-50 flex items-center gap-2"><UserCheck size={16} className="text-purple-600" /><h3 className="font-black text-gray-800">{tr('مؤشرات أداء الموردين', 'Supplier Performance Metrics')}</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1180px] text-start">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('المورد', 'Supplier')}</th>
                                    <th className="p-3 text-center">{tr('فواتير شراء', 'Purchase Invoices')}</th>
                                    <th className="p-3 text-center">{tr('متوسط الفاتورة', 'Avg Invoice')}</th>
                                    <th className="p-3 text-center">{tr('تكرار الشراء (يوم)', 'Purchase Frequency')}</th>
                                    <th className="p-3 text-center">{tr('Lead Time (تقديري)', 'Lead Time (Est.)')}</th>
                                    <th className="p-3 text-center">{tr('الاستحقاق (يوم)', 'Credit Term')}</th>
                                    <th className="p-3 text-center">{tr('الالتزام بالسعر', 'Price Compliance')}</th>
                                    <th className="p-3 text-center">{tr('صافي المشتريات', 'Net Purchases')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة Landed', 'Landed Cost')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {rows.map((row, idx) => (
                                    <tr key={`${row.supplierId || row.supplierName}-${idx}`} className="hover:bg-gray-50">
                                        <td className="p-3"><div className="font-black text-gray-800">{row.supplierName}</div><div className="text-[10px] text-gray-400 dir-ltr">{row.supplierId || '-'}</div></td>
                                        <td className="p-3 text-center dir-ltr">{formatPlainNumber(row.purchaseCount)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(row.avgInvoice)}</td>
                                        <td className="p-3 text-center dir-ltr">{row.avgFrequencyDays !== null ? formatPlainNumber(row.avgFrequencyDays) : '-'}</td>
                                        <td className="p-3 text-center dir-ltr">{row.avgLeadTimeDays !== null ? formatPlainNumber(row.avgLeadTimeDays) : '-'}</td>
                                        <td className="p-3 text-center dir-ltr">{row.avgCreditTermDays !== null ? formatPlainNumber(row.avgCreditTermDays) : '-'}</td>
                                        <td className={`p-3 text-center dir-ltr font-black ${row.priceCompliancePct === null ? 'text-gray-400' : row.priceCompliancePct >= 80 ? 'text-emerald-700' : row.priceCompliancePct >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>{row.priceCompliancePct !== null ? `${formatPlainNumber(row.priceCompliancePct)}%` : '-'}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(row.netPurchases)}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(row.landedPurchases)}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && <tr><td colSpan={9} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات موردين ضمن الفترة المحددة', 'No supplier data in selected period')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- 11-F. Import Expenses Detail ---
    const renderImportExpensesDetail = () => {
        const { importExpenseInvoices, purchaseInvoices, invoiceBase } = getPurchasesReportScope();
        const directImportTx = transactions.filter(tx =>
            tx.status === 'POSTED' &&
            tx.category === 'import_expenses' &&
            !tx.invoiceId &&
            tx.date >= startDate &&
            tx.date <= endDate
        );
        const purchaseById = new Map<string, Invoice>(purchaseInvoices.map(inv => [inv.id, inv]));
        const anyInvoiceById = new Map<string, Invoice>(invoices.map(inv => [inv.id, inv]));
        const wizardDistributions = importExpenseDistributions.filter(d => d.date >= startDate && d.date <= endDate);
        const daysBetween = (fromIso: string, toIso: string) =>
            Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24)));
        const methodLabel = (method: ImportExpenseDistribution['method']) => {
            switch (method) {
                case 'VALUE': return tr('حسب القيمة', 'By Value');
                case 'QUANTITY': return tr('حسب الكمية', 'By Quantity');
                case 'MANUAL': return tr('توزيع يدوي', 'Manual');
                default: return method;
            }
        };

        const rows = importExpenseInvoices.map(inv => {
            const party = inv.customerId ? contacts.find(c => c.id === inv.customerId) : null;
            const linkedPurchase = inv.linkedInvoiceId ? (purchaseById.get(inv.linkedInvoiceId) || anyInvoiceById.get(inv.linkedInvoiceId)) : undefined;
            const linkedSupplier = linkedPurchase?.customerId ? contacts.find(c => c.id === linkedPurchase.customerId) : null;
            return {
                inv,
                amountBase: invoiceBase(inv),
                taxBase: (inv.taxAmount || 0) * (inv.exchangeRate || 1),
                partyName: party ? displayContactName(party) : tr('غير محدد', 'Unspecified'),
                linkedPurchase,
                linkedSupplierName: linkedSupplier ? displayContactName(linkedSupplier) : null,
                delayDays: linkedPurchase ? daysBetween(linkedPurchase.date, inv.date) : null
            };
        }).sort((a, b) => a.inv.date.localeCompare(b.inv.date) || a.inv.invoiceNumber.localeCompare(b.inv.invoiceNumber));

        const linkedRows = rows.filter(r => r.linkedPurchase);
        const unlinkedRows = rows.filter(r => !r.linkedPurchase);
        const directImportTxTotal = directImportTx.reduce((s, tx) => s + (tx.amount * (tx.exchangeRate || 1)), 0);
        const wizardDistributionsTotal = wizardDistributions.reduce((s, d) => s + (d.totalAmountBase || 0), 0);

        const wizardLineRows = wizardDistributions.flatMap(dist => {
            const payableParty = dist.contactId ? contacts.find(c => c.id === dist.contactId) : null;
            return (dist.lines || []).map(line => {
                const purchase = anyInvoiceById.get(line.purchaseInvoiceId);
                const supplier = purchase?.customerId ? contacts.find(c => c.id === purchase.customerId) : null;
                const product = line.productId ? products.find(p => p.id === line.productId) : null;
                return {
                    dist,
                    line,
                    purchase,
                    supplierName: supplier ? displayContactName(supplier) : tr('غير محدد', 'Unspecified'),
                    payablePartyName: payableParty ? displayContactName(payableParty) : tr('غير محدد', 'Unspecified'),
                    itemName: product ? displayProductName(product) : (line.description || tr('بند غير معرف', 'Unspecified line'))
                };
            });
        }).sort((a, b) =>
            a.dist.date.localeCompare(b.dist.date) ||
            a.line.purchaseInvoiceDate.localeCompare(b.line.purchaseInvoiceDate) ||
            a.line.purchaseInvoiceNumber.localeCompare(b.line.purchaseInvoiceNumber)
        );

        const groupedByPurchase = new Map<string, {
            purchase: Invoice;
            importInvoiceTotal: number;
            wizardAllocationTotal: number;
            importInvoiceDocs: number;
            wizardBatches: number;
        }>();
        linkedRows.forEach(row => {
            const p = row.linkedPurchase!;
            if (!groupedByPurchase.has(p.id)) groupedByPurchase.set(p.id, {
                purchase: p,
                importInvoiceTotal: 0,
                wizardAllocationTotal: 0,
                importInvoiceDocs: 0,
                wizardBatches: 0
            });
            const g = groupedByPurchase.get(p.id)!;
            g.importInvoiceTotal += row.amountBase;
            g.importInvoiceDocs += 1;
        });
        wizardDistributions.forEach(dist => {
            const perPurchaseAllocation = new Map<string, number>();
            (dist.lines || []).forEach(line => {
                perPurchaseAllocation.set(
                    line.purchaseInvoiceId,
                    (perPurchaseAllocation.get(line.purchaseInvoiceId) || 0) + (line.allocatedAmountBase || 0)
                );
            });
            perPurchaseAllocation.forEach((allocatedBase, purchaseId) => {
                const p = anyInvoiceById.get(purchaseId);
                if (!p) return;
                if (!groupedByPurchase.has(p.id)) groupedByPurchase.set(p.id, {
                    purchase: p,
                    importInvoiceTotal: 0,
                    wizardAllocationTotal: 0,
                    importInvoiceDocs: 0,
                    wizardBatches: 0
                });
                const g = groupedByPurchase.get(p.id)!;
                g.wizardAllocationTotal += allocatedBase;
                g.wizardBatches += 1;
            });
        });
        const groupedRows = Array.from(groupedByPurchase.values()).map(g => {
            const purchaseAmount = invoiceBase(g.purchase);
            const importTotal = g.importInvoiceTotal + g.wizardAllocationTotal;
            return {
                ...g,
                purchaseAmount,
                importTotal,
                landedAmount: purchaseAmount + importTotal,
                importRatioPct: purchaseAmount > 0 ? (importTotal / purchaseAmount) * 100 : 0
            };
        }).sort((a, b) => b.importTotal - a.importTotal);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('مصاريف الاستيراد التفصيلية', 'Import Expenses Detail')} />
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('فواتير الاستيراد', 'Import Expense Invoices')}</p><h3 className="text-lg font-black text-gray-800 dir-ltr mt-1">{formatPlainNumber(rows.length)}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-cyan-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('إجمالي المصاريف', 'Total Import Expenses')}</p><h3 className="text-lg font-black text-cyan-700 dir-ltr mt-1">{formatValue(rows.reduce((s, r) => s + r.amountBase, 0))}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('مربوط بفواتير شراء', 'Linked to Purchases')}</p><h3 className="text-lg font-black text-emerald-700 dir-ltr mt-1">{formatValue(linkedRows.reduce((s, r) => s + r.amountBase, 0))}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('غير مربوط', 'Unlinked')}</p><h3 className="text-lg font-black text-amber-700 dir-ltr mt-1">{formatValue(unlinkedRows.reduce((s, r) => s + r.amountBase, 0))}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('قيود توزيع مباشرة', 'Direct Allocation Entries')}</p><h3 className="text-lg font-black text-indigo-700 dir-ltr mt-1">{formatValue(directImportTxTotal)}</h3></div>
                    <div className="bg-white p-4 rounded-2xl border border-violet-100 shadow-sm"><p className="text-[10px] text-gray-400 font-black">{tr('توزيعات محفوظة (المعالج)', 'Saved Wizard Allocations')}</p><h3 className="text-lg font-black text-violet-700 dir-ltr mt-1">{formatValue(wizardDistributionsTotal)}</h3><p className="text-[9px] text-gray-400 mt-1">{formatPlainNumber(wizardDistributions.length)} {tr('عملية', 'batches')}</p></div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto mb-6">
                    <div className="p-4 border-b border-gray-50 flex items-center gap-2"><Receipt size={16} className="text-cyan-600" /><h3 className="font-black text-gray-800">{tr('تفاصيل فواتير مصاريف الاستيراد', 'Import Expense Invoice Details')}</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-start">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('الفاتورة', 'Invoice')}</th>
                                    <th className="p-3 text-center">{tr('التاريخ', 'Date')}</th>
                                    <th className="p-3">{tr('الطرف', 'Party')}</th>
                                    <th className="p-3 text-center">{tr('المبلغ', 'Amount')}</th>
                                    <th className="p-3 text-center">{tr('الضريبة', 'Tax')}</th>
                                    <th className="p-3 text-center">{tr('فاتورة شراء مرتبطة', 'Linked Purchase')}</th>
                                    <th className="p-3 text-center">{tr('المورد المرتبط', 'Linked Supplier')}</th>
                                    <th className="p-3 text-center">{tr('فرق الأيام', 'Delay Days')}</th>
                                    <th className="p-3 text-center">{tr('الحالة', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {rows.map(row => (
                                    <tr key={row.inv.id} className="hover:bg-gray-50">
                                        <td className="p-3"><div className="font-black text-gray-800 dir-ltr">#{row.inv.invoiceNumber}</div><div className="text-[10px] text-gray-400">{row.inv.items.length} {tr('بند', 'line')}</div></td>
                                        <td className="p-3 text-center dir-ltr">{row.inv.date}</td>
                                        <td className="p-3">{row.partyName}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-cyan-700">{formatValue(row.amountBase)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(row.taxBase)}</td>
                                        <td className="p-3 text-center">{row.linkedPurchase ? <><div className="font-black text-gray-800 dir-ltr">#{row.linkedPurchase.invoiceNumber}</div><div className="text-[10px] text-gray-400 dir-ltr">{row.linkedPurchase.date}</div></> : '-'}</td>
                                        <td className="p-3 text-center">{row.linkedSupplierName || '-'}</td>
                                        <td className="p-3 text-center dir-ltr">{row.delayDays !== null ? formatPlainNumber(row.delayDays) : '-'}</td>
                                        <td className="p-3 text-center">{row.linkedPurchase ? <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-black">{tr('مربوط', 'Linked')}</span> : <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-black">{tr('غير مربوط', 'Unlinked')}</span>}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && <tr><td colSpan={9} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد فواتير مصاريف استيراد ضمن الفترة المحددة', 'No import expense invoices in selected period')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto mb-6">
                    <div className="p-4 border-b border-gray-50 flex items-center gap-2"><Calculator size={16} className="text-blue-600" /><h3 className="font-black text-gray-800">{tr('تحميل مصاريف الاستيراد على فواتير الشراء (المربوطة)', 'Import Cost Load on Linked Purchase Invoices')}</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1040px] text-start">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('فاتورة الشراء', 'Purchase Invoice')}</th>
                                    <th className="p-3">{tr('المورد', 'Supplier')}</th>
                                    <th className="p-3 text-center">{tr('قيمة الشراء', 'Purchase Amount')}</th>
                                    <th className="p-3 text-center">{tr('فواتير مصاريف استيراد', 'Import Expense Invoices')}</th>
                                    <th className="p-3 text-center">{tr('توزيع المعالج', 'Wizard Allocation')}</th>
                                    <th className="p-3 text-center">{tr('إجمالي مصاريف استيراد', 'Total Import Expenses')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة Landed', 'Landed Cost')}</th>
                                    <th className="p-3 text-center">{tr('نسبة التحميل', 'Load Ratio')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {groupedRows.map(row => {
                                    const supplier = row.purchase.customerId ? contacts.find(c => c.id === row.purchase.customerId) : null;
                                    return (
                                        <tr key={row.purchase.id} className="hover:bg-gray-50">
                                            <td className="p-3"><div className="font-black text-gray-800 dir-ltr">#{row.purchase.invoiceNumber}</div><div className="text-[10px] text-gray-400 dir-ltr">{row.purchase.date}</div></td>
                                            <td className="p-3">{supplier ? displayContactName(supplier) : tr('غير محدد', 'Unspecified')}</td>
                                            <td className="p-3 text-center dir-ltr">{formatValue(row.purchaseAmount)}</td>
                                            <td className="p-3 text-center dir-ltr text-cyan-700">{formatValue(row.importInvoiceTotal)}</td>
                                            <td className="p-3 text-center dir-ltr text-violet-700">{formatValue(row.wizardAllocationTotal)}</td>
                                            <td className="p-3 text-center dir-ltr text-cyan-700 font-black">{formatValue(row.importTotal)}</td>
                                            <td className="p-3 text-center dir-ltr text-blue-700 font-black">{formatValue(row.landedAmount)}</td>
                                            <td className="p-3 text-center dir-ltr">{formatPlainNumber(row.importRatioPct)}%</td>
                                        </tr>
                                    );
                                })}
                                {groupedRows.length === 0 && <tr><td colSpan={8} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد فواتير شراء مرتبطة بمصاريف استيراد ضمن الفترة', 'No purchase invoices linked to import expenses in selected period')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto mb-6">
                    <div className="p-4 border-b border-gray-50 flex items-center gap-2"><ListChecks size={16} className="text-violet-600" /><h3 className="font-black text-gray-800">{tr('تفاصيل توزيع المعالج (سطر بسطر)', 'Wizard Distribution Details (Line by Line)')}</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1320px] text-start">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                <tr>
                                    <th className="p-3">{tr('تاريخ التوزيع', 'Distribution Date')}</th>
                                    <th className="p-3">{tr('فاتورة الشراء', 'Purchase Invoice')}</th>
                                    <th className="p-3">{tr('المورد', 'Supplier')}</th>
                                    <th className="p-3">{tr('الصنف/البند', 'Item / Line')}</th>
                                    <th className="p-3 text-center">{tr('الكمية', 'Qty')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة مباشرة', 'Direct Cost')}</th>
                                    <th className="p-3 text-center">{tr('تحميل استيراد', 'Import Allocation')}</th>
                                    <th className="p-3 text-center">{tr('تكلفة Landed', 'Landed Cost')}</th>
                                    <th className="p-3 text-center">{tr('طريقة التوزيع', 'Method')}</th>
                                    <th className="p-3">{tr('الطرف المستحق', 'Payable Party')}</th>
                                    <th className="p-3">{tr('الوصف', 'Description')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-xs">
                                {wizardLineRows.map((row, idx) => (
                                    <tr key={`${row.dist.id}-${row.line.id}-${idx}`} className="hover:bg-gray-50">
                                        <td className="p-3 text-center dir-ltr">{row.dist.date}</td>
                                        <td className="p-3">
                                            <div className="font-black text-gray-800 dir-ltr">#{row.line.purchaseInvoiceNumber}</div>
                                            <div className="text-[10px] text-gray-400 dir-ltr">{row.line.purchaseInvoiceDate}</div>
                                        </td>
                                        <td className="p-3">{row.supplierName}</td>
                                        <td className="p-3">
                                            <div className="font-black text-gray-800">{row.itemName}</div>
                                            <div className="text-[10px] text-gray-400 dir-ltr">{row.line.productId || row.line.invoiceItemId}</div>
                                        </td>
                                        <td className="p-3 text-center dir-ltr">{formatPlainNumber(row.line.quantity || 0)}</td>
                                        <td className="p-3 text-center dir-ltr">{formatValue(row.line.directLineAmountBase || 0)}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-violet-700">{formatValue(row.line.allocatedAmountBase || 0)}</td>
                                        <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(row.line.landedLineAmountBase || 0)}</td>
                                        <td className="p-3 text-center"><span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 font-black">{methodLabel(row.dist.method)}</span></td>
                                        <td className="p-3">{row.payablePartyName}</td>
                                        <td className="p-3"><div className="line-clamp-1">{row.dist.description || '-'}</div></td>
                                    </tr>
                                ))}
                                {wizardLineRows.length === 0 && <tr><td colSpan={11} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد توزيعات محفوظة من معالج مصاريف الاستيراد ضمن الفترة', 'No saved wizard allocations in selected period')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                {wizardLineRows.length > 0 && (
                    <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50 text-xs text-emerald-800 font-bold mb-3">
                        {tr(
                            'يعرض هذا التقرير الآن التوزيع الحقيقي المحفوظ من معالج مصاريف الاستيراد على مستوى الفاتورة والبند (سطرًا بسطر).',
                            'This report now shows the actual persisted wizard allocation by purchase invoice and item (line by line).'
                        )}
                    </div>
                )}
                {directImportTx.length > 0 && wizardDistributions.length === 0 && (
                    <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50 text-xs text-indigo-800 font-bold">
                        {tr(
                            'يوجد قيود توزيع مباشرة من شاشة مصاريف الاستيراد (المعالج)، لكن لا توجد تفاصيل توزيع محفوظة للفترة الحالية (قد تكون القيود قديمة قبل تفعيل الحفظ التفصيلي).',
                            'There are direct allocation entries from the Import Expenses wizard, but no persisted line-level allocations for this period (these may be older entries before detailed persistence was enabled).'
                        )}
                    </div>
                )}
            </div>
        );
    };

    // --- 12. Customer Profit ---
    const renderCustomerProfit = () => {
        const profitByCustomer = contacts.filter(c => c.type === 'CUSTOMER' || c.type === 'BOTH').map(c => {
            const customerInvoices = invoices.filter(inv => inv.customerId === c.id && inv.type === TransactionType.INCOME && inv.postingStatus === 'POSTED' && inv.date >= startDate && inv.date <= endDate);
            let totalRevenue = 0;
            let totalCost = 0;

            customerInvoices.forEach(inv => {
                totalRevenue += inv.totalAmount;
                inv.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    if (product) totalCost += product.buyPrice * item.quantity;
                });
            });

            if (totalRevenue === 0) return null;
            return { contact: c, profit: totalRevenue - totalCost, revenue: totalRevenue };
        }).filter(Boolean).sort((a, b) => b!.profit - a!.profit);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('الأرباح لكل عميل', 'Profit by Customer')} />
                <div className="space-y-3">
                    {profitByCustomer.map((stat, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><UserCheck size={20} /></div>
                                <div><h4 className="font-black text-sm text-gray-800">{displayContactName(stat!.contact)}</h4><p className="text-[9px] text-gray-400 font-bold uppercase">{tr('المبيعات', 'Sales')}: {formatValue(stat!.revenue)}</p></div>
                            </div>
                            <span className="font-black text-sm text-emerald-600 dir-ltr">{formatValue(stat!.profit)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 12-B. Customer Aging (Receivables) ---
    const renderCustomerAging = () => {
        const receivableAccountIds = accounts
            .filter(a => !a.isGroup && (a.id === 'acc_receivable' || a.parentId === 'acc_receivable_group'))
            .map(a => a.id);

        const reportDate = new Date(endDate);
        reportDate.setHours(23, 59, 59, 999);

        const agingRows = contacts
            .filter(c => c.type === 'CUSTOMER')
            .map(customer => {
                const customerTx = transactions
                    .filter(t =>
                        t.status === 'POSTED' &&
                        t.contactId === customer.id &&
                        t.date <= endDate &&
                        (receivableAccountIds.includes(t.debitAccountId || '') || receivableAccountIds.includes(t.creditAccountId || ''))
                    )
                    .sort((a, b) => a.date.localeCompare(b.date));

                const debitOpenItems: { date: string; remaining: number }[] = [];

                customerTx.forEach(t => {
                    const amountInBase = t.amount * (t.exchangeRate || 1);
                    const debitIsReceivable = receivableAccountIds.includes(t.debitAccountId || '');
                    const creditIsReceivable = receivableAccountIds.includes(t.creditAccountId || '');

                    if (debitIsReceivable && amountInBase > 0) {
                        debitOpenItems.push({ date: t.date, remaining: amountInBase });
                    }

                    if (creditIsReceivable && amountInBase > 0) {
                        let remainingCredit = amountInBase;
                        for (const item of debitOpenItems) {
                            if (remainingCredit <= 0) break;
                            if (item.remaining <= 0) continue;
                            const applied = Math.min(item.remaining, remainingCredit);
                            item.remaining -= applied;
                            remainingCredit -= applied;
                        }
                    }
                });

                const buckets = { d30: 0, d60: 0, d90: 0, dMore: 0 };
                debitOpenItems
                    .filter(item => item.remaining > 0.0001)
                    .forEach(item => {
                        const itemDate = new Date(item.date);
                        const diffDays = Math.floor((reportDate.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 30) buckets.d30 += item.remaining;
                        else if (diffDays <= 60) buckets.d60 += item.remaining;
                        else if (diffDays <= 90) buckets.d90 += item.remaining;
                        else buckets.dMore += item.remaining;
                    });

                const total = buckets.d30 + buckets.d60 + buckets.d90 + buckets.dMore;
                return total > 0.01 ? { customer, ...buckets, total } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b!.total - a!.total) as {
                customer: typeof contacts[number];
                d30: number;
                d60: number;
                d90: number;
                dMore: number;
                total: number;
            }[];

        const totals = agingRows.reduce((sum, row) => ({
            d30: sum.d30 + row.d30,
            d60: sum.d60 + row.d60,
            d90: sum.d90 + row.d90,
            dMore: sum.dMore + row.dMore,
            total: sum.total + row.total
        }), { d30: 0, d60: 0, d90: 0, dMore: 0, total: 0 });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تعمير ذمم الزبائن', 'Customer Aging')} />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">0-30</p><p className="text-sm font-black dir-ltr text-emerald-600">{formatValue(totals.d30)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">31-60</p><p className="text-sm font-black dir-ltr text-amber-600">{formatValue(totals.d60)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">61-90</p><p className="text-sm font-black dir-ltr text-orange-600">{formatValue(totals.d90)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">+90</p><p className="text-sm font-black dir-ltr text-rose-600">{formatValue(totals.dMore)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-blue-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('الإجمالي', 'Total')}</p><p className="text-sm font-black dir-ltr text-blue-700">{formatValue(totals.total)}</p></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('الزبون', 'Customer')}</th>
                                <th className="p-3 text-center">0-30</th>
                                <th className="p-3 text-center">31-60</th>
                                <th className="p-3 text-center">61-90</th>
                                <th className="p-3 text-center">+90</th>
                                <th className="p-3 text-center">{tr('الإجمالي', 'Total')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            {agingRows.map(row => (
                                <tr key={row.customer.id} className="hover:bg-gray-50">
                                    <td className="p-3 font-bold text-gray-700">{displayContactName(row.customer)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.d30)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.d60)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.d90)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.dMore)}</td>
                                    <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(row.total)}</td>
                                </tr>
                            ))}
                            {agingRows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد ذمم عملاء مفتوحة ضمن الفترة المحددة', 'No open customer balances in selected period')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- 12-C. Customer Statement ---
    const renderCustomerStatement = () => {
        const receivableAccountIds = accounts
            .filter(a => !a.isGroup && (a.id === 'acc_receivable' || a.parentId === 'acc_receivable_group'))
            .map(a => a.id);
        const customers = contacts.filter(c => c.type === 'CUSTOMER');
        const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

        if (!selectedCustomer) {
            return (
                <div className="animate-in slide-in-from-bottom-4">
                    <ReportHeader title={tr('كشف حساب الزبائن', 'Customer Statement')} />
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 text-center text-sm font-bold text-gray-400">{tr('لا يوجد زبون محدد', 'No customer selected')}</div>
                </div>
            );
        }

        const customerTx = transactions
            .filter(t =>
                t.status === 'POSTED' &&
                t.contactId === selectedCustomer.id &&
                (receivableAccountIds.includes(t.debitAccountId || '') || receivableAccountIds.includes(t.creditAccountId || ''))
            )
            .sort((a, b) => a.date.localeCompare(b.date));

        const openingBalance = customerTx
            .filter(t => t.date < startDate)
            .reduce((sum, t) => {
                const amountInBase = t.amount * (t.exchangeRate || 1);
                const debit = receivableAccountIds.includes(t.debitAccountId || '') ? amountInBase : 0;
                const credit = receivableAccountIds.includes(t.creditAccountId || '') ? amountInBase : 0;
                return sum + debit - credit;
            }, 0);

        const rangeEntries = customerTx
            .filter(t => t.date >= startDate && t.date <= endDate)
            .map(t => {
                const amountInBase = t.amount * (t.exchangeRate || 1);
                return {
                    id: t.id,
                    tx: t,
                    date: t.date,
                    description: t.description,
                    debit: receivableAccountIds.includes(t.debitAccountId || '') ? amountInBase : 0,
                    credit: receivableAccountIds.includes(t.creditAccountId || '') ? amountInBase : 0
                };
            });

        let running = openingBalance;
        const entriesWithBalance = rangeEntries.map(e => {
            running += e.debit - e.credit;
            return { ...e, balance: running };
        });

        const totalDebit = rangeEntries.reduce((sum, e) => sum + e.debit, 0);
        const totalCredit = rangeEntries.reduce((sum, e) => sum + e.credit, 0);
        const closingBalance = openingBalance + (totalDebit - totalCredit);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('كشف حساب الزبائن', 'Customer Statement')} />
                <div className="bg-white p-4 rounded-[1.8rem] border border-gray-100 shadow-sm mb-4">
                    <label className="block text-[10px] text-gray-400 font-black mb-2">{tr('اختيار الزبون', 'Select Customer')}</label>
                    <select
                        value={selectedCustomerId}
                        onChange={e => setSelectedCustomerId(e.target.value)}
                        className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 outline-none font-black text-xs"
                    >
                        {customers.map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('افتتاحي', 'Opening')}</p><p className="text-sm font-black dir-ltr">{formatValue(openingBalance)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('مدين', 'Debit')}</p><p className="text-sm font-black dir-ltr text-rose-600">{formatValue(totalDebit)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('دائن', 'Credit')}</p><p className="text-sm font-black dir-ltr text-emerald-600">{formatValue(totalCredit)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-blue-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('ختامي', 'Closing')}</p><p className="text-sm font-black dir-ltr text-blue-700">{formatValue(closingBalance)}</p></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                <th className="p-3">{tr('البيان', 'Description')}</th>
                                <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                                <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                                <th className="p-3 text-center">{tr('الرصيد', 'Balance')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            <tr className="bg-amber-50/50">
                                <td className="p-3">{startDate}</td>
                                <td className="p-3 font-bold text-gray-600">{tr('رصيد افتتاحي', 'Opening Balance')}</td>
                                <td className="p-3 text-center">-</td>
                                <td className="p-3 text-center">-</td>
                                <td className="p-3 text-center dir-ltr font-black">{formatValue(openingBalance)}</td>
                            </tr>
                            {entriesWithBalance.map(e => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-gray-500">{e.date}</td>
                                    <td className="statement-report-description p-3 align-top">
                                        <div className="font-bold text-gray-700">{e.description}</div>
                                        {renderStatementLedgerDetails(e.tx, receivableAccountIds)}
                                    </td>
                                    <td className="p-3 text-center dir-ltr text-rose-600">{e.debit > 0 ? formatValue(e.debit) : '-'}</td>
                                    <td className="p-3 text-center dir-ltr text-emerald-600">{e.credit > 0 ? formatValue(e.credit) : '-'}</td>
                                    <td className="p-3 text-center dir-ltr font-black">{formatValue(e.balance)}</td>
                                </tr>
                            ))}
                            {entriesWithBalance.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد حركات ضمن الفترة المحددة', 'No movements in selected period')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const payableSupplierAccountIds = useMemo(() => {
        const childrenByParent = new Map<string, Account[]>();
        accounts.forEach(account => {
            if (!account.parentId) return;
            const bucket = childrenByParent.get(account.parentId) || [];
            bucket.push(account);
            childrenByParent.set(account.parentId, bucket);
        });

        const visited = new Set<string>();
        const postingIds = new Set<string>();
        const queue: string[] = ['acc_payable'];

        while (queue.length > 0) {
            const accountId = queue.shift() as string;
            if (visited.has(accountId)) continue;
            visited.add(accountId);

            const account = accounts.find(a => a.id === accountId);
            if (account && !account.isGroup) {
                postingIds.add(account.id);
            }

            const children = childrenByParent.get(accountId) || [];
            children.forEach(child => queue.push(child.id));
        }

        return Array.from(postingIds);
    }, [accounts]);

    // --- 12-D. Supplier Aging (Payables) ---
    const renderSupplierAging = () => {
        const payableAccountIds = payableSupplierAccountIds;

        const reportDate = new Date(endDate);
        reportDate.setHours(23, 59, 59, 999);

        const agingRows = contacts
            .filter(c => c.type === 'SUPPLIER')
            .map(supplier => {
                const supplierTx = transactions
                    .filter(t =>
                        t.status === 'POSTED' &&
                        t.contactId === supplier.id &&
                        t.date <= endDate &&
                        (payableAccountIds.includes(t.debitAccountId || '') || payableAccountIds.includes(t.creditAccountId || ''))
                    )
                    .sort((a, b) => a.date.localeCompare(b.date));

                const creditOpenItems: { date: string; remaining: number }[] = [];

                supplierTx.forEach(t => {
                    const amountInBase = t.amount * (t.exchangeRate || 1);
                    const debitIsPayable = payableAccountIds.includes(t.debitAccountId || '');
                    const creditIsPayable = payableAccountIds.includes(t.creditAccountId || '');

                    if (creditIsPayable && amountInBase > 0) {
                        creditOpenItems.push({ date: t.date, remaining: amountInBase });
                    }

                    if (debitIsPayable && amountInBase > 0) {
                        let remainingDebit = amountInBase;
                        for (const item of creditOpenItems) {
                            if (remainingDebit <= 0) break;
                            if (item.remaining <= 0) continue;
                            const applied = Math.min(item.remaining, remainingDebit);
                            item.remaining -= applied;
                            remainingDebit -= applied;
                        }
                    }
                });

                const buckets = { d30: 0, d60: 0, d90: 0, dMore: 0 };
                creditOpenItems
                    .filter(item => item.remaining > 0.0001)
                    .forEach(item => {
                        const itemDate = new Date(item.date);
                        const diffDays = Math.floor((reportDate.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 30) buckets.d30 += item.remaining;
                        else if (diffDays <= 60) buckets.d60 += item.remaining;
                        else if (diffDays <= 90) buckets.d90 += item.remaining;
                        else buckets.dMore += item.remaining;
                    });

                const total = buckets.d30 + buckets.d60 + buckets.d90 + buckets.dMore;
                return total > 0.01 ? { supplier, ...buckets, total } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b!.total - a!.total) as {
                supplier: typeof contacts[number];
                d30: number;
                d60: number;
                d90: number;
                dMore: number;
                total: number;
            }[];

        const totals = agingRows.reduce((sum, row) => ({
            d30: sum.d30 + row.d30,
            d60: sum.d60 + row.d60,
            d90: sum.d90 + row.d90,
            dMore: sum.dMore + row.dMore,
            total: sum.total + row.total
        }), { d30: 0, d60: 0, d90: 0, dMore: 0, total: 0 });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تعمير ذمم الموردين', 'Supplier Aging')} />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">0-30</p><p className="text-sm font-black dir-ltr text-emerald-600">{formatValue(totals.d30)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">31-60</p><p className="text-sm font-black dir-ltr text-amber-600">{formatValue(totals.d60)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">61-90</p><p className="text-sm font-black dir-ltr text-orange-600">{formatValue(totals.d90)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">+90</p><p className="text-sm font-black dir-ltr text-rose-600">{formatValue(totals.dMore)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-blue-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('الإجمالي', 'Total')}</p><p className="text-sm font-black dir-ltr text-blue-700">{formatValue(totals.total)}</p></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('المورد', 'Supplier')}</th>
                                <th className="p-3 text-center">0-30</th>
                                <th className="p-3 text-center">31-60</th>
                                <th className="p-3 text-center">61-90</th>
                                <th className="p-3 text-center">+90</th>
                                <th className="p-3 text-center">{tr('الإجمالي', 'Total')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            {agingRows.map(row => (
                                <tr key={row.supplier.id} className="hover:bg-gray-50">
                                    <td className="p-3 font-bold text-gray-700">{displayContactName(row.supplier)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.d30)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.d60)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.d90)}</td>
                                    <td className="p-3 text-center dir-ltr">{formatValue(row.dMore)}</td>
                                    <td className="p-3 text-center dir-ltr font-black text-blue-700">{formatValue(row.total)}</td>
                                </tr>
                            ))}
                            {agingRows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد ذمم موردين مفتوحة ضمن الفترة المحددة', 'No open supplier balances in selected period')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- 12-E. Supplier Statement ---
    const renderSupplierStatement = () => {
        const payableAccountIds = payableSupplierAccountIds;
        const suppliers = contacts.filter(c => c.type === 'SUPPLIER');
        const selectedSupplier = suppliers.find(c => c.id === selectedSupplierId);

        if (!selectedSupplier) {
            return (
                <div className="animate-in slide-in-from-bottom-4">
                    <ReportHeader title={tr('كشف حساب الموردين', 'Supplier Statement')} />
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 text-center text-sm font-bold text-gray-400">{tr('لا يوجد مورد محدد', 'No supplier selected')}</div>
                </div>
            );
        }

        const supplierTx = transactions
            .filter(t =>
                t.status === 'POSTED' &&
                t.contactId === selectedSupplier.id &&
                (payableAccountIds.includes(t.debitAccountId || '') || payableAccountIds.includes(t.creditAccountId || ''))
            )
            .sort((a, b) => a.date.localeCompare(b.date));

        const openingBalance = supplierTx
            .filter(t => t.date < startDate)
            .reduce((sum, t) => {
                const amountInBase = t.amount * (t.exchangeRate || 1);
                const debit = payableAccountIds.includes(t.debitAccountId || '') ? amountInBase : 0;
                const credit = payableAccountIds.includes(t.creditAccountId || '') ? amountInBase : 0;
                return sum + credit - debit;
            }, 0);

        const rangeEntries = supplierTx
            .filter(t => t.date >= startDate && t.date <= endDate)
            .map(t => {
                const amountInBase = t.amount * (t.exchangeRate || 1);
                return {
                    id: t.id,
                    tx: t,
                    date: t.date,
                    description: t.description,
                    debit: payableAccountIds.includes(t.debitAccountId || '') ? amountInBase : 0,
                    credit: payableAccountIds.includes(t.creditAccountId || '') ? amountInBase : 0
                };
            });

        let running = openingBalance;
        const entriesWithBalance = rangeEntries.map(e => {
            running += e.credit - e.debit;
            return { ...e, balance: running };
        });

        const totalDebit = rangeEntries.reduce((sum, e) => sum + e.debit, 0);
        const totalCredit = rangeEntries.reduce((sum, e) => sum + e.credit, 0);
        const closingBalance = openingBalance + (totalCredit - totalDebit);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('كشف حساب الموردين', 'Supplier Statement')} />
                <div className="bg-white p-4 rounded-[1.8rem] border border-gray-100 shadow-sm mb-4">
                    <label className="block text-[10px] text-gray-400 font-black mb-2">{tr('اختيار المورد', 'Select Supplier')}</label>
                    <select
                        value={selectedSupplierId}
                        onChange={e => setSelectedSupplierId(e.target.value)}
                        className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 outline-none font-black text-xs"
                    >
                        {suppliers.map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('افتتاحي', 'Opening')}</p><p className="text-sm font-black dir-ltr">{formatValue(openingBalance)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('مدين', 'Debit')}</p><p className="text-sm font-black dir-ltr text-rose-600">{formatValue(totalDebit)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('دائن', 'Credit')}</p><p className="text-sm font-black dir-ltr text-emerald-600">{formatValue(totalCredit)}</p></div>
                    <div className="bg-white p-3 rounded-2xl border border-blue-100 text-center"><p className="text-[9px] text-gray-400 font-black">{tr('ختامي', 'Closing')}</p><p className="text-sm font-black dir-ltr text-blue-700">{formatValue(closingBalance)}</p></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="statement-report-table w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                <th className="p-3">{tr('البيان', 'Description')}</th>
                                <th className="p-3 text-center">{tr('مدين', 'Debit')}</th>
                                <th className="p-3 text-center">{tr('دائن', 'Credit')}</th>
                                <th className="p-3 text-center">{tr('الرصيد', 'Balance')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            <tr className="bg-amber-50/50">
                                <td className="p-3">{startDate}</td>
                                <td className="p-3 font-bold text-gray-600">{tr('رصيد افتتاحي', 'Opening Balance')}</td>
                                <td className="p-3 text-center">-</td>
                                <td className="p-3 text-center">-</td>
                                <td className="p-3 text-center dir-ltr font-black">{formatValue(openingBalance)}</td>
                            </tr>
                            {entriesWithBalance.map(e => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-gray-500">{e.date}</td>
                                    <td className="statement-report-description p-3 align-top">
                                        <div className="font-bold text-gray-700">{e.description}</div>
                                        {renderStatementLedgerDetails(e.tx, payableAccountIds)}
                                    </td>
                                    <td className="p-3 text-center dir-ltr text-rose-600">{e.debit > 0 ? formatValue(e.debit) : '-'}</td>
                                    <td className="p-3 text-center dir-ltr text-emerald-600">{e.credit > 0 ? formatValue(e.credit) : '-'}</td>
                                    <td className="p-3 text-center dir-ltr font-black">{formatValue(e.balance)}</td>
                                </tr>
                            ))}
                            {entriesWithBalance.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-5 text-center text-xs font-bold text-gray-400">{tr('لا توجد حركات ضمن الفترة المحددة', 'No movements in selected period')}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- 13. Currency Positions ---
    const renderCurrencyPositions = () => {
        // Mock calculation for currency exposure
        const positions = currencies.map(c => {
            // Sum of assets in this currency - Liabilities in this currency
            // For now, we don't track account currency strictly in the schema presented, 
            // but we can assume checking 'cash' accounts with specific names or just Mock it.
            return { code: c.code, net: 0, rate: c.rate };
        });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('فروقات العملات (تجريبي)', 'Currency Differences (Beta)')} />
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-yellow-700 text-xs font-bold mb-4 flex items-center gap-2">
                    <AlertCircle size={16} /> {tr('هذا التقرير يتطلب تفعيل تعدد العملات للحسابات', 'This report requires enabling multi-currency for accounts')}
                </div>
            </div>
        );
    };

    // --- 14. Daily Journals ---
    const renderDailyJournals = () => {
        const journals = transactions
            .filter(t => t.status !== 'DRAFT' && t.date >= startDate && t.date <= endDate)
            .sort((a, b) => b.date.localeCompare(a.date));
        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('القيود اليومية', 'Daily Journals')} />
                <div className="space-y-4">
                    {journals.map(t => (
                        <div key={t.id} className="bg-white p-5 rounded-[2rem] border border-gray-50 shadow-sm">
                            <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                                <h4 className="font-black text-gray-800 text-sm">{tr('قيد رقم', 'Entry #')} #{t.id} <span className="text-[10px] text-gray-400 font-normal">({t.date})</span></h4>
                                <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-lg font-bold">{t.type}</span>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">{t.description}</div>
                            <div className="grid grid-cols-2 gap-4 text-[10px]">
                                <div className="bg-emerald-50 p-2 rounded-xl text-emerald-700">
                                    <span className="block text-emerald-400 font-bold mb-1">{tr('من حـ/ (مدين)', 'From A/C (Debit)')}</span>
                                    {displayAccountName(accounts.find(a => a.id === t.debitAccountId) || null)}
                                </div>
                                <div className="bg-rose-50 p-2 rounded-xl text-rose-700">
                                    <span className="block text-rose-400 font-bold mb-1">{tr('إلى حـ/ (دائن)', 'To A/C (Credit)')}</span>
                                    {displayAccountName(accounts.find(a => a.id === t.creditAccountId) || null)}
                                </div>
                            </div>
                            <div className="mt-3 text-center dir-ltr font-black text-lg text-blue-600">{formatValue(t.amount)}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 15. Item Movement Detail ---
    const renderItemMovement = () => {
        // Detailed movement for selected item
        if (!selectedProductId) return <div className="p-10 text-center text-gray-400">{tr('الرجاء اختيار صنف', 'Please select an item')}</div>;
        const product = products.find(p => p.id === selectedProductId);
        if (!product) return null;

        const movements = invoices.filter(inv => inv.postingStatus === 'POSTED' && inv.date >= startDate && inv.date <= endDate)
            .flatMap(inv => inv.items.filter(i => i.productId === selectedProductId).map(item => ({
                date: inv.date,
                type: inv.type,
                qty: item.quantity,
                invId: inv.id,
                contact: displayContactName(contacts.find(c => c.id === inv.customerId) || null)
            }))).sort((a, b) => b.date.localeCompare(a.date));

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={`${tr('حركة الصنف', 'Item Movement')}: ${displayProductName(product)}`} />
                <div className="mb-4">
                    <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                        {products.map(p => <option key={p.id} value={p.id}>{displayProductName(p)}</option>)}
                    </select>
                </div>
                <div className="space-y-3">
                    {movements.map((mov, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center">
                            <div>
                                <h4 className="font-black text-xs text-gray-800">{mov.type === TransactionType.INCOME ? tr('مبيعات', 'Sales') : tr('مشتريات', 'Purchases')} - {tr('الفاتورة', 'Invoice')} #{mov.invId}</h4>
                                <p className="text-[9px] text-gray-400 font-bold uppercase">{mov.date} - {mov.contact}</p>
                            </div>
                            <span className={`font-black text-sm dir-ltr ${mov.type === TransactionType.INCOME ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {mov.type === TransactionType.INCOME ? '-' : '+'}{mov.qty}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 16. Account Ledger & Activity ---
    const renderAccountLedger = () => {
        if (!selectedLedgerAccount) return null;
        const acc = accounts.find(a => a.id === selectedLedgerAccount);
        if (!acc) return null;

        const isDebitNature = acc.type === 'ASSET' || acc.type === 'EXPENSE';
        const amountInBase = (tx: Transaction) => tx.amount * (tx.exchangeRate || 1);
        const entryDelta = (tx: Transaction) => {
            const debit = tx.debitAccountId === acc.id ? amountInBase(tx) : 0;
            const credit = tx.creditAccountId === acc.id ? amountInBase(tx) : 0;
            return isDebitNature ? (debit - credit) : (credit - debit);
        };
        const shouldIncludeOpening = (tx: Transaction) => {
            if (tx.status !== 'POSTED') return false;
            if (tx.debitAccountId !== acc.id && tx.creditAccountId !== acc.id) return false;
            if (tx.date >= startDate) return false;
            if (!reportYearCloseEnabled || !isProfitLossAccount(acc.type)) return true;
            return tx.date >= fiscalStartDate;
        };

        const openingBalance = transactions
            .filter(shouldIncludeOpening)
            .reduce((sum, tx) => sum + entryDelta(tx), 0);

        const periodRows = transactions
            .filter(t => t.status === 'POSTED')
            .filter(t => t.debitAccountId === acc.id || t.creditAccountId === acc.id)
            .filter(t => t.date >= startDate && t.date <= endDate)
            .sort((a, b) => {
                const byDate = a.date.localeCompare(b.date);
                return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
            });

        let runningBalance = openingBalance;
        const ledgerEntries = periodRows.map(tx => {
            const debit = tx.debitAccountId === acc.id ? amountInBase(tx) : 0;
            const credit = tx.creditAccountId === acc.id ? amountInBase(tx) : 0;
            runningBalance += entryDelta(tx);
            return {
                tx,
                debit,
                credit,
                runningBalance
            };
        });

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={`${tr('دفتر الأستاذ', 'General Ledger')}: ${displayAccountName(acc)}`} />
                <div className="mb-4">
                    <select value={selectedLedgerAccount} onChange={e => setSelectedLedgerAccount(e.target.value)} className="w-full p-3 rounded-2xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                        {accounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                    </select>
                </div>
                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                    <table className="statement-report-table w-full text-start min-w-[760px]">
                        <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                            <tr>
                                <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                <th className="p-3">{tr('البيان', 'Description')}</th>
                                <th className="p-3 dir-ltr text-center">{tr('مدين', 'Debit')}</th>
                                <th className="p-3 dir-ltr text-center">{tr('دائن', 'Credit')}</th>
                                <th className="p-3 dir-ltr text-center">{tr('الرصيد الجاري', 'Running Balance')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            <tr className="text-xs bg-blue-50/40">
                                <td className="p-3 text-gray-500">{startDate}</td>
                                <td className="p-3 font-black text-gray-700">{tr('رصيد افتتاحي', 'Opening Balance')}</td>
                                <td className="p-3 dir-ltr text-center text-gray-400">-</td>
                                <td className="p-3 dir-ltr text-center text-gray-400">-</td>
                                <td className={`p-3 dir-ltr text-center font-black ${openingBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {formatValue(Math.abs(openingBalance))} {getBalanceNature(acc.type, openingBalance)}
                                </td>
                            </tr>
                            {ledgerEntries.map(({ tx, debit, credit, runningBalance: rowBalance }) => (
                                <tr key={tx.id} className="text-xs hover:bg-gray-50">
                                    <td className="p-3 text-gray-500">{tx.date}</td>
                                    <td className="statement-report-description p-3 align-top">
                                        <div className="font-bold text-gray-700">{tx.description}</div>
                                        {renderStatementLedgerDetails(tx, [acc.id])}
                                    </td>
                                    <td className="p-3 dir-ltr text-center text-emerald-600">{debit > 0 ? formatValue(debit) : '-'}</td>
                                    <td className="p-3 dir-ltr text-center text-rose-600">{credit > 0 ? formatValue(credit) : '-'}</td>
                                    <td className={`p-3 dir-ltr text-center font-black ${rowBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {formatValue(Math.abs(rowBalance))} {getBalanceNature(acc.type, rowBalance)}
                                    </td>
                                </tr>
                            ))}
                            {ledgerEntries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-4 text-center text-xs font-black text-gray-400">
                                        {tr('لا توجد حركة خلال الفترة المحددة', 'No entries in selected period')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderAccountActivity = () => {
        // Just the summary of all accounts activity
        const summary = accounts.map(acc => {
            const bal = financialData.balances[acc.id];
            if (bal.debit === 0 && bal.credit === 0) return null;
            return { acc, ...bal };
        }).filter(Boolean);

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('حركة الحسابات', 'Account Activity')} />
                <div className="space-y-3">
                    {summary.map(item => (
                        <div key={item!.acc.id} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-800">{displayAccountName(item!.acc)}</span>
                            <div className="text-left flex gap-4">
                                <span className="text-emerald-600 dir-ltr">+{formatValue(item!.debit)}</span>
                                <span className="text-rose-600 dir-ltr">-{formatValue(item!.credit)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- 16. Manufacturing Cost Report ---
    const renderManufacturingCostReport = () => {
        const productWithBOMs = products.filter(p => boms.some(b => b.productId === p.id));
        const selectedProduct = products.find(p => p.id === selectedProductId);
        const activeBOM = boms.find(b => b.productId === selectedProductId);

        let totalMaterialCost = 0;
        let laborCost = 0;
        let overheadCost = 0;

        if (activeBOM) {
            activeBOM.components.forEach(comp => {
                const p = products.find(prod => prod.id === comp.productId);
                if (p) {
                    totalMaterialCost += (p.buyPrice || 0) * comp.quantity;
                }
            });
            laborCost = activeBOM.laborCost || 0;
            overheadCost = activeBOM.overheadCost || 0;
        }

        const totalCost = totalMaterialCost + laborCost + overheadCost;
        const profitMargin = selectedProduct ? (selectedProduct.sellPrice - totalCost) : 0;
        const marginPercent = selectedProduct && selectedProduct.sellPrice > 0 ? (profitMargin / selectedProduct.sellPrice) * 100 : 0;

        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('تحليل تكلفة التصنيع', 'Manufacturing Cost Analysis')} />

                <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">{tr('اختر المنتج المصنع', 'Select manufactured product')}</label>
                    <div className="relative">
                        <select
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                            className="w-full p-4 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-blue-500 appearance-none font-bold text-gray-700"
                        >
                            <option value="">{tr('-- اختر منتج --', '-- Select Product --')}</option>
                            {productWithBOMs.map(p => (
                                <option key={p.id} value={p.id}>{displayProductName(p)}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    </div>
                </div>

                {selectedProduct && activeBOM ? (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                                <p className="text-xs text-blue-600 font-bold mb-1">{tr('تكلفة المواد الخام', 'Raw Materials Cost')}</p>
                                <h3 className="text-xl font-black text-blue-800 dir-ltr">{formatValue(totalMaterialCost)}</h3>
                            </div>
                            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                                <p className="text-xs text-purple-600 font-bold mb-1">{tr('اجور ومصاريف', 'Labor and Overhead')}</p>
                                <h3 className="text-xl font-black text-purple-800 dir-ltr">{formatValue(laborCost + overheadCost)}</h3>
                            </div>
                            <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-lg">
                                <p className="text-xs text-gray-400 font-bold mb-1">{tr('التكلفة الإجمالية', 'Total Cost')}</p>
                                <h3 className="text-xl font-black text-white dir-ltr">{formatValue(totalCost)}</h3>
                            </div>
                            <div className={`p-5 rounded-2xl border ${profitMargin >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                <p className={`text-xs font-bold mb-1 ${profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{tr('هامش الربح المتوقع', 'Expected Profit Margin')}</p>
                                <h3 className={`text-xl font-black dir-ltr ${profitMargin >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                                    {formatValue(profitMargin)} <span className="text-sm opacity-75">({marginPercent.toFixed(1)}%)</span>
                                </h3>
                            </div>
                        </div>

                        {/* Breakdown Table */}
                        <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-x-auto">
                            <div className="p-6 border-b border-gray-50 flex items-center gap-3">
                                <div className="p-2 bg-gray-100 rounded-lg text-gray-600"><Layers size={20} /></div>
                                <h3 className="font-bold text-gray-800">{tr('تفاصيل التكلفة (BOM)', 'Cost Breakdown (BOM)')}</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px]">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                                        <tr>
                                            <th className="px-6 py-4 text-right">{tr('المكون / البند', 'Component / Item')}</th>
                                            <th className="px-6 py-4 text-center">{tr('الكمية', 'Quantity')}</th>
                                            <th className="px-6 py-4 text-center">{tr('التكلفة الفردية', 'Unit Cost')}</th>
                                            <th className="px-6 py-4 text-left">{tr('التكلفة الإجمالية', 'Total Cost')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {/* Materials */}
                                        {activeBOM.components.map(comp => {
                                            const p = products.find(prod => prod.id === comp.productId);
                                            const cost = (p?.buyPrice || 0);
                                            const total = cost * comp.quantity;
                                            return (
                                                <tr key={comp.id} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-gray-700">{p ? displayProductName(p) : tr('منتج غير معروف', 'Unknown Product')}</td>
                                                    <td className="px-6 py-4 text-center text-gray-600 dir-ltr">{comp.quantity}</td>
                                                    <td className="px-6 py-4 text-center text-gray-600 dir-ltr">{formatValue(cost)}</td>
                                                    <td className="px-6 py-4 text-left font-bold text-gray-800 dir-ltr">{formatValue(total)}</td>
                                                </tr>
                                            );
                                        })}
                                        {/* Labor */}
                                        <tr className="bg-purple-50/30">
                                            <td className="px-6 py-4 font-bold text-purple-700">{tr('أجور عمالة مباشرة', 'Direct Labor')}</td>
                                            <td className="px-6 py-4 text-center text-gray-400">-</td>
                                            <td className="px-6 py-4 text-center text-gray-400">-</td>
                                            <td className="px-6 py-4 text-left font-bold text-purple-700 dir-ltr">{formatValue(laborCost)}</td>
                                        </tr>
                                        {/* Overhead */}
                                        <tr className="bg-purple-50/30">
                                            <td className="px-6 py-4 font-bold text-purple-700">{tr('مصاريف صناعية غير مباشرة', 'Manufacturing Overhead')}</td>
                                            <td className="px-6 py-4 text-center text-gray-400">-</td>
                                            <td className="px-6 py-4 text-center text-gray-400">-</td>
                                            <td className="px-6 py-4 text-left font-bold text-purple-700 dir-ltr">{formatValue(overheadCost)}</td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-gray-900 text-white">
                                        <tr>
                                            <td colSpan={3} className="px-6 py-4 font-bold text-right">{tr('إجمالي تكلفة الوحدة الواحدة', 'Total Unit Cost')}</td>
                                            <td className="px-6 py-4 text-left font-black dir-ltr md:text-lg">{formatValue(totalCost)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Product Info */}
                        <div className="grid grid-cols-2 gap-3 md:gap-6">
                            <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="text-gray-500 text-xs font-bold mb-1">{tr('سعر البيع الحالي', 'Current Selling Price')}</p>
                                    <h3 className="text-2xl font-black text-gray-800 dir-ltr">{formatValue(selectedProduct.sellPrice)}</h3>
                                </div>
                                <div className="p-3 bg-gray-100 rounded-full text-gray-600"><Tag size={24} /></div>
                            </div>
                            <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="text-gray-500 text-xs font-bold mb-1">{tr('الكمية الناتجة في النموذج', 'Output Quantity in BOM')}</p>
                                    <h3 className="text-2xl font-black text-gray-800 dir-ltr">{activeBOM.outputQuantity}</h3>
                                </div>
                                <div className="p-3 bg-gray-100 rounded-full text-gray-600"><Box size={24} /></div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                        <div className="inline-flex p-4 bg-white rounded-full shadow-sm mb-4">
                            <Factory size={32} className="text-gray-300" />
                        </div>
                        <h3 className="text-gray-500 font-bold mb-1">{tr('اختر منتجًا لعرض التحليل', 'Select a product to view analysis')}</h3>
                        <p className="text-gray-400 text-xs">{tr('يجب أن يكون للمنتج نموذج تصنيع (BOM) معرف مسبقًا', 'The product must have a predefined Bill of Materials (BOM)')}</p>
                    </div>
                )}
            </div>
        );
    };

    const renderAccountingAnalytics = () => {
        const maxMovement = Math.max(1, ...analyticsData.topActiveAccounts.map(a => a.periodMovement));
        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('التحليلات المحاسبية', 'Accounting Analytics')} />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('إجمالي الإيرادات', 'Total Revenue')}</p>
                        <h3 className="text-lg font-black text-emerald-600 dir-ltr mt-1">{formatValue(analyticsData.totalRevenue)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('إجمالي المصروفات', 'Total Expenses')}</p>
                        <h3 className="text-lg font-black text-rose-600 dir-ltr mt-1">{formatValue(analyticsData.totalExpense)}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('صافي الفترة', 'Net Period Result')}</p>
                        <h3 className={`text-lg font-black dir-ltr mt-1 ${analyticsData.netProfit >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{formatValue(Math.abs(analyticsData.netProfit))}</h3>
                        <p className="text-[10px] font-bold text-gray-400 mt-1">{analyticsData.netProfit >= 0 ? tr('ربح', 'Profit') : tr('خسارة', 'Loss')}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-black">{tr('الحركات المرحلة', 'Posted Transactions')}</p>
                        <h3 className="text-lg font-black text-indigo-700 dir-ltr mt-1">{formatPlainNumber(analyticsData.postedTransactionsCount)}</h3>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div className="lg:col-span-2 bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-black text-gray-800">{tr('ملخص الوثائق والحركة', 'Documents & Activity Summary')}</h3>
                            <span className="text-[10px] text-gray-400 font-black">{startDate} - {endDate}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                <p className="text-[10px] font-black text-emerald-700">{tr('فواتير المبيعات', 'Sales Invoices')}</p>
                                <p className="text-lg font-black text-emerald-700 dir-ltr">{analyticsData.documentCounts.sales}</p>
                                <p className="text-[10px] font-bold text-emerald-600 dir-ltr">{formatValue(analyticsData.salesTotal)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
                                <p className="text-[10px] font-black text-purple-700">{tr('فواتير المشتريات', 'Purchase Invoices')}</p>
                                <p className="text-lg font-black text-purple-700 dir-ltr">{analyticsData.documentCounts.purchases}</p>
                                <p className="text-[10px] font-bold text-purple-600 dir-ltr">{formatValue(analyticsData.purchasesTotal)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                                <p className="text-[10px] font-black text-rose-700">{tr('مصاريف عامة', 'General Expenses')}</p>
                                <p className="text-lg font-black text-rose-700 dir-ltr">{analyticsData.documentCounts.expenses}</p>
                                <p className="text-[10px] font-bold text-rose-600 dir-ltr">{formatValue(analyticsData.expensesDocsTotal)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-100">
                                <p className="text-[10px] font-black text-cyan-700">{tr('مصاريف استيراد', 'Import Expenses')}</p>
                                <p className="text-lg font-black text-cyan-700 dir-ltr">{analyticsData.documentCounts.importExpenses}</p>
                                <p className="text-[10px] font-bold text-cyan-600 dir-ltr">{formatValue(analyticsData.importExpensesTotal)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                <p className="text-[10px] font-black text-indigo-700">{tr('سندات القبض', 'Receipt Vouchers')}</p>
                                <p className="text-lg font-black text-indigo-700 dir-ltr">{analyticsData.receiptVoucherCount}</p>
                                <p className="text-[10px] font-bold text-indigo-600 dir-ltr">{formatValue(analyticsData.receiptsTotal)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                                <p className="text-[10px] font-black text-amber-700">{tr('سندات الصرف', 'Payment Vouchers')}</p>
                                <p className="text-lg font-black text-amber-700 dir-ltr">{analyticsData.paymentVoucherCount}</p>
                                <p className="text-[10px] font-bold text-amber-600 dir-ltr">{formatValue(analyticsData.paymentsTotal)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[10px] font-black text-gray-700">{tr('متوسط فاتورة بيع', 'Avg Sales Invoice')}</p>
                                <p className="text-lg font-black text-gray-800 dir-ltr">{formatValue(analyticsData.avgSalesInvoice)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <p className="text-[10px] font-black text-gray-700">{tr('متوسط فاتورة شراء', 'Avg Purchase Invoice')}</p>
                                <p className="text-lg font-black text-gray-800 dir-ltr">{formatValue(analyticsData.avgPurchaseInvoice)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm space-y-3">
                        <h3 className="font-black text-gray-800">{tr('مؤشرات سريعة', 'Quick Indicators')}</h3>
                        <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                            <p className="text-[10px] text-gray-400 font-black">{tr('رأس المال العامل', 'Working Capital')}</p>
                            <p className={`text-xl font-black dir-ltr ${analyticsData.currentAssets - analyticsData.currentLiabilities >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {formatValue(Math.abs(analyticsData.currentAssets - analyticsData.currentLiabilities))}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                            <p className="text-[10px] text-gray-400 font-black">{tr('السيولة النقدية (صندوق+بنوك)', 'Cash & Banks Liquidity')}</p>
                            <p className="text-xl font-black text-blue-700 dir-ltr">{formatValue(analyticsData.cashOnHand + analyticsData.bankBalances)}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                            <p className="text-[10px] text-gray-400 font-black">{tr('الذمم المدينة', 'Receivables')}</p>
                            <p className="text-xl font-black text-indigo-700 dir-ltr">{formatValue(analyticsData.receivables)}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                            <p className="text-[10px] text-gray-400 font-black">{tr('الذمم الدائنة', 'Payables')}</p>
                            <p className="text-xl font-black text-amber-700 dir-ltr">{formatValue(analyticsData.payables)}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Activity size={16} className="text-blue-600" />
                            <h3 className="font-black text-gray-800">{tr('أكثر الحسابات حركة', 'Most Active Accounts')}</h3>
                        </div>
                        <div className="space-y-2">
                            {analyticsData.topActiveAccounts.map(acc => {
                                const widthPct = Math.max(8, (acc.periodMovement / maxMovement) * 100);
                                return (
                                    <div key={acc.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-gray-800 truncate">{displayAccountName(acc)}</p>
                                                <p className="text-[10px] text-gray-400 font-bold">({acc.code})</p>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs font-black text-blue-700 dir-ltr">{formatValue(acc.periodMovement)}</p>
                                                <p className="text-[10px] text-gray-400 font-bold">{tr('إجمالي حركة', 'Total movement')}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${widthPct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                            {analyticsData.topActiveAccounts.length === 0 && (
                                <p className="text-xs text-gray-400 font-bold text-center py-6">{tr('لا توجد حركة ضمن الفترة', 'No activity in selected period')}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                            <h3 className="font-black text-gray-800 mb-3">{tr('أعلى حسابات الإيراد', 'Top Revenue Accounts')}</h3>
                            <div className="space-y-2">
                                {analyticsData.topRevenueAccounts.map(acc => (
                                    <div key={acc.id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-emerald-800 truncate">{displayAccountName(acc)}</p>
                                            <p className="text-[10px] text-emerald-600/70 font-bold">({acc.code})</p>
                                        </div>
                                        <p className="text-xs font-black text-emerald-700 dir-ltr">{formatValue(Math.abs(acc.periodNet))}</p>
                                    </div>
                                ))}
                                {analyticsData.topRevenueAccounts.length === 0 && <p className="text-xs text-gray-400 font-bold">{tr('لا توجد إيرادات ضمن الفترة', 'No revenue in selected period')}</p>}
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                            <h3 className="font-black text-gray-800 mb-3">{tr('أعلى حسابات المصروف', 'Top Expense Accounts')}</h3>
                            <div className="space-y-2">
                                {analyticsData.topExpenseAccounts.map(acc => (
                                    <div key={acc.id} className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-rose-800 truncate">{displayAccountName(acc)}</p>
                                            <p className="text-[10px] text-rose-600/70 font-bold">({acc.code})</p>
                                        </div>
                                        <p className="text-xs font-black text-rose-700 dir-ltr">{formatValue(Math.abs(acc.periodNet))}</p>
                                    </div>
                                ))}
                                {analyticsData.topExpenseAccounts.length === 0 && <p className="text-xs text-gray-400 font-bold">{tr('لا توجد مصروفات ضمن الفترة', 'No expenses in selected period')}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderFinancialRatios = () => {
        const r = analyticsData.ratios;
        const formatDaysMetric = (value: number | null, digits = 1) => {
            if (value === null) return tr('غير متاح', 'N/A');
            return `${formatPlainNumber(Number(value.toFixed(digits)))} ${tr('يوم', 'days')}`;
        };
        const dupontBaseAmount = dupontBasis === 'NET_SALES' ? analyticsData.netSales : analyticsData.totalRevenue;
        const dupontBaseLabel = dupontBasis === 'NET_SALES'
            ? tr('صافي المبيعات', 'Net Sales')
            : tr('إجمالي الإيرادات', 'Total Revenue');
        const dupontProfitMargin = safeDivide(analyticsData.netProfit, dupontBaseAmount);
        const dupontAssetTurnover = safeDivide(dupontBaseAmount, analyticsData.avgTotalAssets);
        const dupontEquityMultiplier = safeDivide(analyticsData.avgTotalAssets, analyticsData.avgTotalEquity);
        const dupontRoe =
            dupontProfitMargin !== null && dupontAssetTurnover !== null && dupontEquityMultiplier !== null
                ? dupontProfitMargin * dupontAssetTurnover * dupontEquityMultiplier
                : null;
        return (
            <div className="animate-in slide-in-from-bottom-4">
                <ReportHeader title={tr('النسب المالية (ريشيو)', 'Financial Ratios (Ratio)')} />

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Percent size={16} className="text-blue-600" />
                            <h3 className="font-black text-gray-800">{tr('نسب السيولة', 'Liquidity Ratios')}</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                            <RatioCard title={tr('النسبة الجارية', 'Current Ratio')} value={formatRatioX(r.currentRatio)} description={tr('الأصول المتداولة ÷ الالتزامات المتداولة', 'Current Assets أ· Current Liabilities')} tone="blue" />
                            <RatioCard title={tr('النسبة السريعة', 'Quick Ratio')} value={formatRatioX(r.quickRatio)} description={tr('الأصول السريعة ÷ الالتزامات المتداولة', 'Quick Assets أ· Current Liabilities')} tone="indigo" />
                            <RatioCard title={tr('النسبة النقدية', 'Cash Ratio')} value={formatRatioX(r.cashRatio)} description={tr('النقدية والبنوك ÷ الالتزامات المتداولة', 'Cash & Banks أ· Current Liabilities')} tone="emerald" />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Scale size={16} className="text-amber-600" />
                            <h3 className="font-black text-gray-800">{tr('نسب المديونية', 'Leverage Ratios')}</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                            <RatioCard title={tr('نسبة الدين للأصول', 'Debt Ratio')} value={formatPercent(r.debtRatio)} description={tr('إجمالي الخصوم ÷ إجمالي الأصول', 'Total Liabilities أ· Total Assets')} tone="amber" />
                            <RatioCard title={tr('الدين إلى حقوق الملكية', 'Debt to Equity')} value={formatRatioX(r.debtToEquity)} description={tr('إجمالي الخصوم ÷ حقوق الملكية', 'Total Liabilities أ· Equity')} tone="rose" />
                            <RatioCard title={tr('رأس المال العامل', 'Working Capital')} value={formatValue(analyticsData.currentAssets - analyticsData.currentLiabilities)} description={tr('الأصول المتداولة - الالتزامات المتداولة', 'Current Assets - Current Liabilities')} tone="gray" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <TrendingUp size={16} className="text-emerald-600" />
                            <h3 className="font-black text-gray-800">{tr('نسب الربحية', 'Profitability Ratios')}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                            <RatioCard title={tr('هامش صافي الربح', 'Net Profit Margin')} value={formatPercent(r.netProfitMargin)} description={tr('صافي الربح ÷ الإيرادات', 'Net Profit أ· Revenue')} tone={analyticsData.netProfit >= 0 ? 'emerald' : 'rose'} />
                            <RatioCard title={tr('نسبة المصروفات للإيرادات', 'Expense to Revenue')} value={formatPercent(r.expenseToRevenue)} description={tr('المصروفات ÷ الإيرادات', 'Expenses أ· Revenue')} tone="rose" />
                            <RatioCard title={tr('العائد على الأصول', 'ROA')} value={formatPercent(r.returnOnAssets)} description={tr('صافي الربح ÷ إجمالي الأصول', 'Net Profit أ· Total Assets')} tone="blue" />
                            <RatioCard title={tr('العائد على حقوق الملكية', 'ROE')} value={formatPercent(r.returnOnEquity)} description={tr('صافي الربح ÷ حقوق الملكية', 'Net Profit أ· Equity')} tone="indigo" />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <BarChart3 size={16} className="text-cyan-600" />
                            <h3 className="font-black text-gray-800">{tr('نسب تشغيلية مختصرة', 'Operational Ratios')}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                            <RatioCard title={tr('الذمم إلى المبيعات', 'Receivables to Sales')} value={formatPercent(r.receivablesToSales)} description={tr('الذمم المدينة ÷ مبيعات الفترة', 'Receivables أ· Period Sales')} tone="cyan" />
                            <RatioCard title={tr('المخزون من المتداول', 'Inventory / Current Assets')} value={formatPercent(r.inventoryToCurrentAssets)} description={tr('المخزون ÷ الأصول المتداولة', 'Inventory أ· Current Assets')} tone="amber" />
                            <RatioCard title={tr('نسبة تغطية الموردين نقديًا', 'Payables Cash Coverage')} value={formatRatioX(safeDivide(analyticsData.cashOnHand + analyticsData.bankBalances, analyticsData.payables))} description={tr('النقدية والبنوك ÷ ذمم الموردين', 'Cash & Banks أ· Payables')} tone="indigo" />
                            <RatioCard title={tr('صافي التدفق (قبض-صرف)', 'Net Cash Movement')} value={formatValue(analyticsData.receiptsTotal - analyticsData.paymentsTotal)} description={tr('سندات القبض - سندات الصرف', 'Receipt Vouchers - Payment Vouchers')} tone="blue" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Calculator size={16} className="text-violet-600" />
                            <h3 className="font-black text-gray-800">{tr('نسب متقدمة (تحليل الأداء)', 'Advanced Performance Ratios')}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                            <RatioCard
                                title={tr('هامش الربح الإجمالي', 'Gross Margin')}
                                value={formatPercent(r.grossMargin)}
                                description={tr('مجمل الربح ÷ صافي المبيعات', 'Gross Profit أ· Net Sales')}
                                tone={analyticsData.grossProfit >= 0 ? 'emerald' : 'rose'}
                            />
                            <RatioCard
                                title={tr('دوران المخزون', 'Inventory Turnover')}
                                value={formatRatioX(r.inventoryTurnover)}
                                description={tr('تكلفة المبيعات ÷ متوسط المخزون', 'COGS أ· Average Inventory')}
                                tone="amber"
                            />
                            <RatioCard
                                title="DSO"
                                value={formatDaysMetric(r.dsoDays)}
                                description={tr('متوسط أيام التحصيل (ذمم العملاء الائتمانية)', 'Days Sales Outstanding (credit receivables)')}
                                tone="cyan"
                            />
                            <RatioCard
                                title="DPO"
                                value={formatDaysMetric(r.dpoDays)}
                                description={tr('متوسط أيام سداد الموردين (ائتمان)', 'Days Payables Outstanding (credit payables)')}
                                tone="indigo"
                            />
                            <RatioCard
                                title="DIO"
                                value={formatDaysMetric(r.dioDays)}
                                description={tr('متوسط أيام بقاء المخزون (على COGS)', 'Days Inventory Outstanding (using COGS)')}
                                tone="amber"
                            />
                            <RatioCard
                                title="CCC"
                                value={formatDaysMetric(r.cashConversionCycleDays)}
                                description={tr('دورة التحويل النقدي = DIO + DSO - DPO', 'Cash Conversion Cycle = DIO + DSO - DPO')}
                                tone="blue"
                            />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <PieChart size={16} className="text-blue-600" />
                            <h3 className="font-black text-gray-800">{tr('تحليل دوبونت (DuPont)', 'DuPont Analysis')}</h3>
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                            <span className="text-[11px] font-black text-gray-500">
                                {tr('أساس دوبونت', 'DuPont Basis')}
                            </span>
                            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                                <button
                                    type="button"
                                    onClick={() => setDupontBasis('NET_SALES')}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${dupontBasis === 'NET_SALES' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}
                                >
                                    {tr('صافي المبيعات', 'Net Sales')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDupontBasis('TOTAL_REVENUE')}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${dupontBasis === 'TOTAL_REVENUE' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}
                                >
                                    {tr('إجمالي الإيراد', 'Total Revenue')}
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                            <RatioCard
                                title={tr('هامش الربح', 'Profit Margin')}
                                value={formatPercent(dupontProfitMargin)}
                                description={`${tr('صافي الربح ÷', 'Net Profit أ·')} ${dupontBaseLabel}`}
                                tone={analyticsData.netProfit >= 0 ? 'emerald' : 'rose'}
                            />
                            <RatioCard
                                title={tr('دوران الأصول', 'Asset Turnover')}
                                value={formatRatioX(dupontAssetTurnover)}
                                description={`${dupontBaseLabel} ${tr('÷ متوسط الأصول', 'أ· Average Assets')}`}
                                tone="blue"
                            />
                            <RatioCard
                                title={tr('مضاعف الملكية', 'Equity Multiplier')}
                                value={formatRatioX(dupontEquityMultiplier)}
                                description={tr('متوسط الأصول ÷ متوسط حقوق الملكية', 'Average Assets أ· Average Equity')}
                                tone="amber"
                            />
                            <RatioCard
                                title={tr('ROE (DuPont)', 'ROE (DuPont)')}
                                value={formatPercent(dupontRoe)}
                                description={tr('هامش الربح × دوران الأصول × مضاعف الملكية', 'Profit Margin أ— Asset Turnover أ— Equity Multiplier')}
                                tone="indigo"
                            />
                        </div>
                        <div className="mt-4 p-3 rounded-xl border border-indigo-100 bg-indigo-50 text-[11px] font-bold text-indigo-800">
                            <div className="flex flex-wrap items-center gap-2 dir-ltr">
                                <span>ROE</span>
                                <span>=</span>
                                <span>{tr('هامش الربح', 'Profit Margin')}</span>
                                <span>أ—</span>
                                <span>{tr('دوران الأصول', 'Asset Turnover')}</span>
                                <span>أ—</span>
                                <span>{tr('مضاعف الملكية', 'Equity Multiplier')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen size={16} className="text-gray-600" />
                        <h3 className="font-black text-gray-800">{tr('أساس احتساب النسب (مرجع)', 'Ratio Base Values (Reference)')}</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('الأصول المتداولة', 'Current Assets')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.currentAssets)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('الالتزامات المتداولة', 'Current Liabilities')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.currentLiabilities)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('إجمالي الأصول', 'Total Assets')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.totalAssets)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('إجمالي الخصوم', 'Total Liabilities')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.totalLiabilities)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('حقوق الملكية', 'Equity')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.totalEquity)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('الإيرادات', 'Revenue')}</p><p className="font-black text-emerald-700 dir-ltr">{formatValue(analyticsData.totalRevenue)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('صافي المبيعات', 'Net Sales')}</p><p className="font-black text-emerald-700 dir-ltr">{formatValue(analyticsData.netSales)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('تكلفة المبيعات', 'COGS')}</p><p className="font-black text-amber-700 dir-ltr">{formatValue(analyticsData.cogsValue)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('المصروفات', 'Expenses')}</p><p className="font-black text-rose-700 dir-ltr">{formatValue(analyticsData.totalExpense)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('صافي الربح/الخسارة', 'Net Result')}</p><p className={`font-black dir-ltr ${analyticsData.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatValue(Math.abs(analyticsData.netProfit))}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('متوسط المخزون', 'Average Inventory')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.avgInventoryValue)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('متوسط الذمم المدينة', 'Average Receivables')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.avgReceivables)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('متوسط ذمم الموردين', 'Average Payables')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.avgPayables)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('مبيعات آجلة (الفترة)', 'Credit Sales (Period)')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.creditSalesTotal)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('مشتريات آجلة (الفترة)', 'Credit Purchases (Period)')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(analyticsData.creditPurchasesTotal)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('عدد أيام الفترة', 'Period Days')}</p><p className="font-black text-gray-800 dir-ltr">{formatPlainNumber(analyticsData.periodDays)}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('أساس دوبونت الحالي', 'Current DuPont Basis')}</p><p className="font-black text-gray-800">{dupontBaseLabel}</p></div>
                        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100"><p className="text-gray-400 font-black">{tr('قيمة أساس دوبونت', 'DuPont Base Amount')}</p><p className="font-black text-gray-800 dir-ltr">{formatValue(dupontBaseAmount)}</p></div>
                    </div>
                    <div className="mt-4 p-3 rounded-xl border border-blue-100 bg-blue-50 text-xs text-blue-800 font-bold">
                        {tr('ملاحظة: النسب تعتمد على أرصدة الفترة المحددة في أعلى التقرير، وبعملة التقرير الحالية. تم احتساب DSO/DPO على الفواتير الآجلة فقط، وDIO/دوران المخزون على تكلفة المبيعات (COGS). يمكن تغيير أساس DuPont بين صافي المبيعات وإجمالي الإيرادات من نفس التقرير.', 'Note: Ratios use balances for the selected report period and current report currency context. DSO/DPO use credit invoices only, and DIO/inventory turnover use COGS. You can switch the DuPont basis between Net Sales and Total Revenue from this report.')}
                    </div>
                </div>
            </div>
        );
    };

    // --- Main Render Switch ---
    const renderContent = () => {
        switch (activeReport) {
            case 'MENU': return renderMenu();
            case 'STOCK_REMAINING': return renderStockReport();
            case 'INVENTORY_COUNT_LIST': return renderInventoryCountListReport();
            case 'LOW_STOCK_ALERTS': return renderLowStockAlertsReport();
            case 'AVERAGE_COST_AUDIT': return renderAverageCostAuditReport();
            case 'ITEM_PROFIT': return renderItemProfitReport();
            case 'DAILY_OPS': return renderDailyOps();
            case 'CASH_FLOW': return renderCashFlow();
            case 'CHECKS_IN': return renderChecksReport('INCOMING');
            case 'CHECKS_OUT': return renderChecksReport('OUTGOING');
            case 'WORKING_CAPITAL': return renderWorkingCapital();
            case 'TRIAL_BALANCE': return renderTrialBalance();
            case 'INCOME_STATEMENT': return renderIncomeStatement();
            case 'BALANCE_SHEET': return renderBalanceSheet();
            case 'EQUITY_CHANGES': return renderEquityChangesReport();
            case 'FIXED_ASSETS_CHANGES': return renderFixedAssetsChangesReport();
            case 'LIABILITIES_REPORT': return renderLiabilitiesReport();
            case 'ACCOUNTING_ANALYTICS': return renderAccountingAnalytics();
            case 'FINANCIAL_RATIOS': return renderFinancialRatios();
            case 'SALES_LIST': return renderTransactionList('SALES');
            case 'PURCHASES_LIST': return renderTransactionList('PURCHASES');
            case 'PURCHASES_COST_SUMMARY': return renderPurchasesCostSummary();
            case 'PURCHASE_COST_BY_ITEM': return renderPurchaseCostByItem();
            case 'PURCHASE_PRICE_VARIANCE': return renderPurchasePriceVariance();
            case 'SUPPLIER_ANALYSIS': return renderSupplierAnalysis();
            case 'IMPORT_EXPENSES_DETAIL': return renderImportExpensesDetail();
            case 'RECEIPTS_LIST': return renderTransactionList('RECEIPTS');
            case 'PAYMENTS_LIST': return renderTransactionList('PAYMENTS');
            case 'SALES_BY_ITEM': return renderItemAnalysis('SALES');
            case 'PURCHASES_BY_ITEM': return renderItemAnalysis('PURCHASES');
            case 'CUSTOMER_PROFIT': return renderCustomerProfit();
            case 'CUSTOMER_AGING': return renderCustomerAging();
            case 'CUSTOMER_STATEMENT': return renderCustomerStatement();
            case 'SUPPLIER_AGING': return renderSupplierAging();
            case 'SUPPLIER_STATEMENT': return renderSupplierStatement();
            case 'CURRENCY_POSITIONS': return renderCurrencyPositions();
            case 'DAILY_JOURNALS': return renderDailyJournals();
            case 'ITEM_MOVEMENT': return renderItemMovement();
            case 'ACCOUNT_LEDGER': return renderAccountLedger();
            case 'ACCOUNT_ACTIVITY': return renderAccountActivity();
            case 'MANUFACTURING_COST': return renderManufacturingCostReport();
            case 'CHECKS_VAULT': return renderChecksVault();
            case 'CHECKS_UNDER_COLLECTION_BANK': return renderChecksUnderCollectionByBank();
            case 'CHECKS_MATURITY': return renderChecksMaturity();
            default: return renderMenu();
        }
    };

    const statementReportActive = activeReport === 'CUSTOMER_STATEMENT'
        || activeReport === 'SUPPLIER_STATEMENT'
        || activeReport === 'ACCOUNT_LEDGER';

    return (
        <div
            className={`financial-reports-page px-3 sm:px-4 pt-[calc(var(--app-safe-top)+0.5rem)] pb-[calc(var(--app-safe-bottom)+5.5rem)] app-page max-w-7xl mx-auto ${statementReportActive ? 'statement-report-active' : ''} ${isEnglish ? 'text-left' : ''}`}
            dir={isEnglish ? 'ltr' : 'rtl'}
        >
            <div ref={activeReportRef}>
                {renderContent()}
            </div>
        </div>
    );
};

export default FinancialReports


