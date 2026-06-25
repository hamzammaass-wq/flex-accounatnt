
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAccounting } from '../contexts/AccountingContext';
import { ContactType, TransactionType, Contact, Invoice } from '../types';
import ContactEditorDialog from './ContactEditorDialog';
import DocumentActions from './DocumentActions';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import {
    UserPlus, Trash2, Users, Truck, Search, FileText, X,
    Phone, LayoutGrid, Edit2,
    Calendar, AlertCircle, ShoppingBag, ArrowUpRight, ArrowDownLeft, MapPin, CheckCircle2, AlertTriangle, Briefcase, Scale
} from 'lucide-react';
import { getDisplayAccountName, getDisplayContactName, getDisplayProductName } from '../utils/displayNames';
import { buildElementPdfFile, downloadBlobFile, downloadWorkbookFile, printElementContent, sanitizeDownloadName, settleElementBeforeSnapshot } from '../utils/documentExport';
import { clearPendingDrilldown, consumePendingDrilldown, DRILLDOWN_EVENT_NAME, DrilldownTarget } from '../utils/drilldown';
import { getCurrentFiscalYearRange } from '../utils/fiscalYear';

const DIRECTORY_TAB_STORAGE_KEY = 'smart-account:directory-tab:v1';

const Directory: React.FC = () => {
    const { contacts, addContact, updateContact, deleteContact, transactions, invoices, baseCurrency, companySettings, products, accounts, checks } = useAccounting();
    const currentFiscalYearRange = useMemo(() => getCurrentFiscalYearRange(), []);

    const [activeTab, setActiveTab] = useState<ContactType | 'ALL'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
    const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);
    const [deleteContactId, setDeleteContactId] = useState<string | null>(null);

    const [stmtStartDate, setStmtStartDate] = useState(currentFiscalYearRange.startDate);
    const [stmtEndDate, setStmtEndDate] = useState(currentFiscalYearRange.endDate);
    const [printCheckImagesInStatement, setPrintCheckImagesInStatement] = useState(false);

    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newType, setNewType] = useState<ContactType>('CUSTOMER');
    const [newLinkedAccountId, setNewLinkedAccountId] = useState('');
    const statementExportRef = useRef<HTMLDivElement | null>(null);
    const statementContentRef = useRef<HTMLDivElement | null>(null);
    const settleStatementSnapshot = () => settleElementBeforeSnapshot(statementExportRef.current);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const printPersonalData = companySettings.printPersonalData ?? true;
    const printStatementAllCurrencies = companySettings.printStatementAllCurrencies ?? false;
    const statementDateAscending = companySettings.statementDateAscending ?? true;
    const statementFooterNote = companySettings.statementFooterNote ?? '';
    const headerTopLines = companySettings.headerTopLines ?? 0;
    const dottedNumbers = companySettings.dottedNumbers ?? false;
    const hideVoucherColumnInStatement = companySettings.hideVoucherColumnInStatement ?? false;
    const printExpiryDate = companySettings.printExpiryDate ?? false;
    const debitLabel = tr('\u0645\u062f\u064a\u0646', 'Debit');
    const creditLabel = tr('\u062f\u0627\u0626\u0646', 'Credit');
    const displayContactName = (contact?: Pick<Contact, 'id' | 'name'> | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) => getDisplayProductName(product || undefined, isEnglish);
    const openContactStatement = (contactId: string) => {
        setStmtStartDate(currentFiscalYearRange.startDate);
        setStmtEndDate(currentFiscalYearRange.endDate);
        setSelectedContactId(contactId);
    };

    useEffect(() => {
        const applyDrilldownTarget = (target: DrilldownTarget | null) => {
            if (!target || target.kind !== 'CONTACT_STATEMENT') return;
            openContactStatement(target.contactId);
        };

        applyDrilldownTarget(consumePendingDrilldown());

        const handleDrilldown = (event: Event) => {
            const target = (event as CustomEvent<DrilldownTarget>).detail;
            if (!target || target.kind !== 'CONTACT_STATEMENT') {
                return;
            }
            clearPendingDrilldown();
            applyDrilldownTarget(target);
        };
        window.addEventListener(DRILLDOWN_EVENT_NAME, handleDrilldown as EventListener);
        return () => window.removeEventListener(DRILLDOWN_EVENT_NAME, handleDrilldown as EventListener);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const nextTab = window.sessionStorage.getItem(DIRECTORY_TAB_STORAGE_KEY);
            if (nextTab === 'CUSTOMER' || nextTab === 'SUPPLIER' || nextTab === 'PARTNER' || nextTab === 'EMPLOYEE' || nextTab === 'ALL') {
                setActiveTab(nextTab as ContactType | 'ALL');
            }
            window.sessionStorage.removeItem(DIRECTORY_TAB_STORAGE_KEY);
        } catch {
            // Ignore storage failures and keep the default tab.
        }
    }, []);

    const tabLabel = (tab: 'ALL' | ContactType) => {
        if (isEnglish) {
            if (tab === 'ALL') return 'All';
            if (tab === 'CUSTOMER') return 'Customers';
            if (tab === 'SUPPLIER') return 'Suppliers';
            if (tab === 'PARTNER') return 'Partners';
            return 'Employees';
        }
        if (tab === 'ALL') return 'الكل';
        if (tab === 'CUSTOMER') return 'العملاء';
        if (tab === 'SUPPLIER') return 'الموردين';
        if (tab === 'PARTNER') return 'الشركاء';
        return 'الموظفين';
    };

    const typeBadgeLabel = (type: ContactType) => {
        if (isEnglish) {
            if (type === 'CUSTOMER') return 'Customer';
            if (type === 'SUPPLIER') return 'Supplier';
            if (type === 'PARTNER') return 'Partner';
            return 'Employee';
        }
        if (type === 'CUSTOMER') return 'عميل';
        if (type === 'SUPPLIER') return 'مورد';
        if (type === 'PARTNER') return 'شريك';
        return 'موظف';
    };

    const balanceStatus = (balance: number, type: ContactType) => {
        if (Math.abs(balance) < 0.01) return '';
        if (isEnglish) {
            if (balance > 0) return type === 'CUSTOMER' ? 'Due' : 'Credit';
            return type === 'CUSTOMER' ? 'Credit' : 'Due';
        }
        if (balance > 0) return type === 'CUSTOMER' ? 'عليه' : 'له';
        return type === 'CUSTOMER' ? 'له' : 'عليه';
    };

    const getPaymentLineMeta = (line: typeof transactions[0], contact: Contact) => {
        if (contact.type === 'CUSTOMER') {
            return { contraAccountId: line.debitAccountId, isReceipt: true };
        }
        if (contact.type === 'SUPPLIER' || contact.type === 'EMPLOYEE') {
            return { contraAccountId: line.creditAccountId, isReceipt: false };
        }
        const partnerCurrentAccountId = contact.currentAccountId || contact.linkedAccountId;
        if (partnerCurrentAccountId) {
            if (line.creditAccountId === partnerCurrentAccountId) {
                return { contraAccountId: line.debitAccountId, isReceipt: true };
            }
            if (line.debitAccountId === partnerCurrentAccountId) {
                return { contraAccountId: line.creditAccountId, isReceipt: false };
            }
        }
        const inferredReceipt = line.type === TransactionType.INCOME;
        return {
            contraAccountId: inferredReceipt ? line.debitAccountId : line.creditAccountId,
            isReceipt: inferredReceipt
        };
    };

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
    };

    const getCheckImageUrls = (check: { imageUrls?: string[]; imageUrl?: string }) => {
        if (Array.isArray(check.imageUrls) && check.imageUrls.length > 0) {
            return check.imageUrls.filter(Boolean).slice(0, 2);
        }
        return check.imageUrl ? [check.imageUrl] : [];
    };

    const buildStatementEntryPreview = (entry: any, contact: Contact, options?: { includeCheckImages?: boolean }) => {
        const invoice = entry.invoiceId ? invoices.find(inv => inv.id === entry.invoiceId) || null : null;
        const subTransactions = Array.isArray(entry.subTransactions) && entry.subTransactions.length > 0
            ? entry.subTransactions
            : [entry];

        const checkRows = subTransactions.flatMap((sub: any, index: number) => {
            const relatedCheck = sub.checkId ? checks.find(c => c.id === sub.checkId) : null;
            if (!relatedCheck) return [];

            return [{
                id: relatedCheck.id || `${entry.id || entry.voucherId || 'statement'}-check-${index}`,
                checkNumber: relatedCheck.checkNumber || '-',
                bankName: displayAccountName(
                    relatedCheck.bankAccountId
                        ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null
                        : { id: '', name: relatedCheck.bankName }
                ),
                accountNumber: relatedCheck.accountNumber || '',
                dueDate: formatDate(relatedCheck.dueDate) || '-',
                amount: Number(relatedCheck.amount) || 0,
                currency: relatedCheck.currency || entry.currency || baseCurrency,
                imageUrls: options?.includeCheckImages ? getCheckImageUrls(relatedCheck) : []
            }];
        });

        const paymentRows = invoice ? [] : subTransactions.flatMap((sub: any, index: number) => {
            const { contraAccountId, isReceipt } = getPaymentLineMeta(sub, contact);
            const account = accounts.find(a => a.id === contraAccountId);
            if (!account) return [];
            const relatedCheck = sub.checkId ? checks.find(c => c.id === sub.checkId) : null;

            return [{
                id: `${entry.id || entry.voucherId || 'statement'}-payment-${index}`,
                label: isReceipt ? tr('تم القبض في', 'Received in') : tr('تم الصرف من', 'Paid from'),
                accountName: displayAccountName(account),
                amount: Number(sub.amount ?? sub.debit ?? sub.credit ?? entry.amount ?? entry.debit ?? entry.credit ?? 0) || 0,
                currency: sub.currency || entry.currency || baseCurrency,
                checkMeta: relatedCheck ? {
                    checkNumber: relatedCheck.checkNumber || '-',
                    bankName: displayAccountName(
                        relatedCheck.bankAccountId
                            ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null
                            : { id: '', name: relatedCheck.bankName }
                    ) || relatedCheck.bankName || '-',
                    dueDate: formatDate(relatedCheck.dueDate) || '-'
                } : null
            }];
        });

        return { invoice, checkRows, paymentRows };
    };

    const getStatementDocumentNumber = (entry?: { voucherId?: string; invoiceId?: string | null } | null) => {
        if (!entry) return '-';
        const voucherId = String(entry.voucherId || '').trim();
        if (voucherId) return voucherId;

        const linkedInvoice = entry.invoiceId ? invoices.find(inv => inv.id === entry.invoiceId) || null : null;
        if (linkedInvoice?.invoiceNumber) {
            return linkedInvoice.invoiceNumber;
        }

        return '-';
    };

    type ClassicStatementPreview = ReturnType<typeof buildStatementEntryPreview>;

    type ClassicStatementRow = {
        id: string;
        entry: any;
        preview: ClassicStatementPreview;
        dateText: string;
        documentNumber: string;
        notesText: string;
        primaryDescription: string;
        secondaryDescription: string;
        debit: number;
        credit: number;
        balance: number;
    };

    const formatStatementFigure = (value: number, fractionDigits = 2) => {
        const normalized = Number(value || 0).toLocaleString('en-US', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
            useGrouping: false
        });
        return dottedNumbers ? normalized.replace(/,/g, '.') : normalized;
    };

    const getClassicStatementBalanceColumnLabel = () => {
        return tr('الرصيد', 'Balance');
    };

    const getClassicStatementDocumentLabel = (entry: any, preview: ClassicStatementPreview) => {
        const rawDescription = String(entry.description || '').trim().toLowerCase();
        const hasBankAccount = preview.paymentRows.some(row => /bank|بنك/i.test(String(row.accountName || '')));

        switch (entry.category) {
            case 'sales_invoice': return tr('مبيعات', 'Sales');
            case 'sales_return': return tr('مردود مبيعات', 'Sales Return');
            case 'purchase_invoice': return tr('مشتريات', 'Purchases');
            case 'purchase_return': return tr('مردود مشتريات', 'Purchase Return');
            case 'receipt':
            case 'voucher_receipt':
                return tr('قبض', 'Receipt');
            case 'payment':
            case 'voucher_payment':
                return hasBankAccount || /bank|بنك/.test(rawDescription)
                    ? tr('قيد بنكي', 'Bank Entry')
                    : tr('صرف', 'Payment');
            case 'returned_check':
            case 'returned_checks':
            case 'check_return': return tr('بدل شيك راجع', 'Returned Check');
            default: break;
        }

        if (preview.checkRows.length > 0) return tr('قبض', 'Receipt');
        if (hasBankAccount || /bank|بنك/.test(rawDescription)) return tr('قيد بنكي', 'Bank Entry');
        return tr('قيد', 'Entry');
    };

    const getClassicStatementDescriptionText = (entry: any, preview: ClassicStatementPreview) => {
        const rawDescription = String(entry.description || '').trim();
        const documentLabel = getClassicStatementDocumentLabel(entry, preview);
        if (rawDescription && rawDescription !== documentLabel) {
            return rawDescription;
        }

        const paymentNames = preview.paymentRows.map(row => row.accountName).filter(Boolean).join(' - ');
        if (paymentNames) return paymentNames;

        if (preview.invoice?.notes?.trim()) return preview.invoice.notes.trim();

        return tr('بدون بيان', 'No description');
    };

    const buildClassicStatementRows = (contact: Contact, entries: any[]) => {
        const printableEntries = statementDateAscending ? [...entries] : [...entries].reverse();
        return printableEntries.map((entry): ClassicStatementRow => {
            const preview = buildStatementEntryPreview(entry, contact, { includeCheckImages: false });
            const paymentNames = preview.paymentRows.map(row => row.accountName).filter(Boolean);
            const invoiceNotes = String(preview.invoice?.notes || '').trim();
            const notesText = [...paymentNames, ...(invoiceNotes ? [invoiceNotes] : [])].join(' - ');
            const primaryDescription = getClassicStatementDocumentLabel(entry, preview);
            const secondaryDescription = getClassicStatementDescriptionText(entry, preview);

            return {
                id: entry.id,
                entry,
                preview,
                dateText: formatDate(entry.date) || entry.date || '-',
                documentNumber: hideVoucherColumnInStatement ? '' : getStatementDocumentNumber(entry),
                notesText,
                primaryDescription,
                secondaryDescription,
                debit: Number(entry.debit) || 0,
                credit: Number(entry.credit) || 0,
                balance: Number(entry.runningBalance) || 0
            };
        });
    };

    const renderClassicStatementInlineDetails = (preview: ClassicStatementPreview, mainDescription: string) => {
        const notesText = String(preview.invoice?.notes || '').trim();
        const paymentRows = preview.paymentRows.filter(row => row.amount > 0 || row.accountName);
        const standaloneCheckRows = paymentRows.length > 0 ? [] : preview.checkRows;
        const paymentTotal = paymentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
        const formatVoucherAmount = (value: number, currency?: string) => {
            const formatted = formatStatementFigure(value);
            return printStatementAllCurrencies ? `${formatted} ${currency || baseCurrency}` : formatted;
        };
        const showNotesLine = Boolean(notesText && notesText !== mainDescription);
        if (!preview.invoice?.items?.length && !standaloneCheckRows.length && !paymentRows.length && !showNotesLine) return null;

        return (
            <div className="statement-classic-detail-block">
                {standaloneCheckRows.length > 0 && (
                    <div className="statement-classic-detail-meta-list">
                        {standaloneCheckRows.map(check => (
                            <div key={check.id} className="statement-classic-detail-line statement-classic-detail-line--check">
                                <span className="statement-classic-detail-label">{tr('شيك', 'Check')}</span>
                                <span className="statement-classic-detail-pill statement-inline-value">{check.checkNumber || '-'}</span>
                                <span>{tr('البنك', 'Bank')}: {check.bankName || '-'}</span>
                                <span className="dir-ltr">{tr('الاستحقاق', 'Due')}: {check.dueDate || '-'}</span>
                                <span className="statement-inline-value">{formatStatementFigure(check.amount)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {paymentRows.length > 0 && (
                    <table className="statement-classic-inline-table statement-classic-inline-table--voucher w-full" dir={isEnglish ? 'ltr' : 'rtl'}>
                        <colgroup>
                            <col style={{ width: '24%' }} />
                            <col style={{ width: '50%' }} />
                            <col style={{ width: '26%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-center">{tr('العملية', 'Action')}</th>
                                <th className="text-start">{tr('الحساب', 'Account')}</th>
                                <th className="text-center">{tr('المبلغ', 'Amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paymentRows.map(row => (
                                <tr key={row.id}>
                                    <td className="text-center">{row.label}</td>
                                    <td>
                                        <div className="statement-classic-voucher-account">
                                            <div className="statement-classic-voucher-account-name">{row.accountName || '-'}</div>
                                            {row.checkMeta && (
                                                <div className="statement-classic-voucher-check-meta">
                                                    <div>
                                                        <span className="statement-classic-voucher-check-meta-label">{tr('شيك', 'Check')}:</span>{' '}
                                                        <span className="statement-inline-value">{row.checkMeta.checkNumber}</span>
                                                    </div>
                                                    <div>
                                                        <span className="statement-classic-voucher-check-meta-label">{tr('البنك', 'Bank')}:</span>{' '}
                                                        <span>{row.checkMeta.bankName}</span>
                                                    </div>
                                                    <div className="dir-ltr">
                                                        <span className="statement-classic-voucher-check-meta-label">{tr('الاستحقاق', 'Due')}:</span>{' '}
                                                        <span>{row.checkMeta.dueDate}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="text-center dir-ltr font-black">{formatVoucherAmount(row.amount, row.currency)}</td>
                                </tr>
                            ))}
                            <tr className="statement-classic-inline-summary-row">
                                <td className="statement-classic-inline-summary-label text-center">{tr('الإجمالي', 'Total')}</td>
                                <td className="text-center statement-classic-placeholder">-</td>
                                <td className="text-center dir-ltr font-black">{formatVoucherAmount(paymentTotal, paymentRows[0]?.currency)}</td>
                            </tr>
                        </tbody>
                    </table>
                )}

                {preview.invoice && preview.invoice.items.length > 0 && (
                    <table className="statement-classic-inline-table w-full" dir={isEnglish ? 'ltr' : 'rtl'}>
                        <colgroup>
                            <col style={{ width: '39%' }} />
                            <col style={{ width: '17%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '26%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-start">{tr('اسم الصنف', 'Item')}</th>
                                <th className="text-center">{tr('الكمية', 'Qty')}</th>
                                <th className="text-center">{tr('السعر', 'Price')}</th>
                                <th className="text-center">{tr('إجمالي', 'Total')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {preview.invoice.items.map((item, idx) => {
                                const product = products.find(p => p.id === item.productId);
                                return (
                                    <tr key={item.id || idx}>
                                        <td>{item.description || displayProductName(product) || product?.itemCode || product?.barcode || '-'}</td>
                                        <td className="text-center dir-ltr">{formatStatementFigure(Number(item.quantity) || 0, 2)}</td>
                                        <td className="text-center dir-ltr">{formatStatementFigure(Number(item.unitPrice) || 0, 3)}</td>
                                        <td className="text-center dir-ltr font-black">{formatStatementFigure(Number(item.total) || 0)}</td>
                                    </tr>
                                );
                            })}
                            <tr className="statement-classic-inline-summary-row">
                                <td className="statement-classic-inline-summary-label">{tr('المجموع', 'Total')}</td>
                                <td className="text-center dir-ltr">{tr('خصم:', 'Discount:')} {formatStatementFigure(Number(preview.invoice.discountAmount) || 0)}</td>
                                <td className="text-center statement-classic-placeholder">-</td>
                                <td className="text-center dir-ltr font-black">{formatStatementFigure(Number(preview.invoice.totalAmount) || 0)}</td>
                            </tr>
                        </tbody>
                    </table>
                )}

                {showNotesLine && <div className="statement-classic-note-line">{notesText}</div>}
            </div>
        );
    };

    const renderClassicContactStatement = (
        contact: Contact,
        openingBalance: number,
        closingBalance: number,
        entries: any[],
        sheetRef?: React.Ref<HTMLDivElement>
    ) => {
        const rows = buildClassicStatementRows(contact, entries);
        const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
        const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
        const openingRowDate = stmtStartDate ? (formatDate(stmtStartDate) || stmtStartDate) : '-';
        const phoneValue = String(contact.phone || '').trim();
        const statementKind = contact.type === 'SUPPLIER'
            ? tr('كشف حساب مورد', 'Supplier Statement')
            : tr('كشف حساب زبون', 'Customer Statement');

        const companyName = String(companySettings.name || '').trim();
        const companyPhone = String(companySettings.phone || '').trim();

        return (
            <div ref={sheetRef} className="statement-classic-sheet directory-statement-classic bg-white rounded-[1.75rem] border border-gray-200 shadow-sm overflow-hidden">
                <div className="statement-classic-header">
                    <div className="statement-classic-title-block">
                        <h3 className="statement-classic-title">{tr('كشف حساب', 'Statement of Account')}</h3>
                        {companyName && (
                            <p className="statement-classic-company-name">{companyName}{companyPhone ? <span className="statement-classic-company-phone dir-ltr"> | {companyPhone}</span> : null}</p>
                        )}
                    </div>

                    <div className="statement-classic-identity-row statement-classic-identity-row--paper">
                        <div className="statement-classic-identity statement-classic-identity--party">
                            <span className="statement-classic-identity-label">{tr('حضرة السيد', 'To')}</span>
                            <span className="statement-classic-identity-value">{displayContactName(contact)}</span>
                        </div>
                        <div className="statement-classic-identity statement-classic-identity--phone">
                            <span className={`statement-classic-identity-value statement-inline-value ${phoneValue ? '' : 'statement-classic-placeholder'}`}>{phoneValue ? `( ${phoneValue} )` : '( - )'}</span>
                            <span className="statement-classic-identity-label">{tr('تلفون', 'Phone')}</span>
                        </div>
                    </div>

                    <div className="statement-classic-meta-row">
                        <span>{statementKind}</span>
                        <span>{tr('الفترة', 'Period')}: <span className="statement-inline-value">{stmtStartDate}</span> - <span className="statement-inline-value">{stmtEndDate}</span></span>
                        <span>{tr('العملة', 'Currency')}: <span className="statement-inline-value">{baseCurrency}</span></span>
                    </div>
                </div>

                <div className="statement-mobile-viewport">
                    <div className="statement-mobile-canvas">
                        <table
                            dir={isEnglish ? 'ltr' : 'rtl'}
                            className="directory-statement-table statement-classic-table statement-classic-table--paper w-full text-start table-fixed min-w-0 max-w-full"
                        >
                            <colgroup>
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '41%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '12%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>{tr('التاريخ', 'Date')}</th>
                                    <th>{tr('المستند', 'Document')}</th>
                                    <th>{tr('البيان', 'Description')}</th>
                                    <th>{tr('مدين', 'Debit')}</th>
                                    <th>{tr('دائن', 'Credit')}</th>
                                    <th>{getClassicStatementBalanceColumnLabel()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="statement-classic-row statement-classic-row--opening">
                                    <td className="statement-classic-date-cell dir-ltr">{openingRowDate}</td>
                                    <td className="statement-classic-document-cell"></td>
                                    <td className="statement-classic-description">{tr('رصيد منقول', 'Balance B/F')}</td>
                                    <td className="statement-classic-placeholder"></td>
                                    <td className="statement-classic-placeholder"></td>
                                    <td className="statement-classic-balance-cell dir-ltr">{formatStatementFigure(openingBalance)}</td>
                                </tr>

                                {rows.map(row => {
                                    const detailBlock = renderClassicStatementInlineDetails(row.preview, row.secondaryDescription);
                                    return (
                                        <React.Fragment key={row.id}>
                                            <tr className={`statement-classic-row ${row.entry.invoiceId ? 'statement-classic-row--invoice' : ''}`}>
                                                <td className="statement-classic-date-cell dir-ltr">{row.dateText}</td>
                                                <td className="statement-classic-document-cell">
                                                    <div className="statement-classic-document-wrap">
                                                        <span className="statement-classic-document-label">{row.primaryDescription}</span>
                                                        <span className="statement-classic-document-number dir-ltr">{row.documentNumber}</span>
                                                    </div>
                                                </td>
                                                <td className="statement-classic-description">
                                                    <div className="statement-classic-primary">{row.secondaryDescription}</div>
                                                </td>
                                                <td className="statement-classic-amount-cell dir-ltr">{row.debit > 0 ? formatStatementFigure(row.debit) : '-'}</td>
                                                <td className="statement-classic-amount-cell dir-ltr">{row.credit > 0 ? formatStatementFigure(row.credit) : '-'}</td>
                                                <td className="statement-classic-balance-cell dir-ltr">{formatStatementFigure(row.balance)}</td>
                                            </tr>
                                            {detailBlock && (
                                                <tr className="statement-classic-detail-row">
                                                    <td className="statement-classic-placeholder"></td>
                                                    <td className="statement-classic-placeholder"></td>
                                                    <td className="statement-classic-detail-cell">{detailBlock}</td>
                                                    <td className="statement-classic-placeholder"></td>
                                                    <td className="statement-classic-placeholder"></td>
                                                    <td className="statement-classic-placeholder"></td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}

                                {rows.length === 0 && (
                                    <tr className="statement-classic-empty-row">
                                        <td colSpan={6}>{tr('لا توجد حركات ضمن الفترة المحددة', 'No movements in selected period')}</td>
                                    </tr>
                                )}

                                <tr className="statement-classic-summary-inline-row">
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td className="statement-classic-summary-inline-cell dir-ltr">{formatStatementFigure(totalDebit)}</td>
                                    <td className="statement-classic-summary-inline-cell dir-ltr">{formatStatementFigure(totalCredit)}</td>
                                    <td className="statement-classic-summary-inline-cell dir-ltr">{formatStatementFigure(closingBalance)}</td>
                                </tr>
                                <tr className="statement-classic-fill-row">
                                    <td colSpan={6}></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {statementFooterNote && (
                    <div className="statement-classic-note-panel">
                        <div className="statement-classic-note">{statementFooterNote}</div>
                    </div>
                )}
            </div>
        );
    };

    const getTransactionDC = (t: typeof transactions[0], contact: Contact) => {
        const type = contact.type;
        const linkedAccountId = contact.currentAccountId || contact.linkedAccountId;
        let d = 0, c = 0;

        if (type === 'PARTNER' && linkedAccountId) {
            if (t.debitAccountId === linkedAccountId) d = t.amount;
            if (t.creditAccountId === linkedAccountId) c = t.amount;
            if (d > 0 || c > 0) return { d, c };
        }

        if (t.invoiceId) {
            const invoice = invoices.find(i => i.id === t.invoiceId);
            if (invoice) {
                if (type === 'CUSTOMER') {
                    if (invoice.type === TransactionType.INCOME) d = t.amount;
                    else c = t.amount;
                } else if (type === 'PARTNER') {
                    if (invoice.type === TransactionType.INCOME) c = t.amount;
                    else d = t.amount;
                } else {
                    if (invoice.type === TransactionType.EXPENSE) c = t.amount;
                    else d = t.amount;
                }
                return { d, c };
            }
        }
        if (t.category === 'journal' || t.debitAccountId || t.creditAccountId) {
            const debitAccId = t.debitAccountId || '';
            const creditAccId = t.creditAccountId || '';
            if (type === 'CUSTOMER') {
                if (debitAccId.includes('receivable')) d = t.amount;
                else if (creditAccId.includes('receivable')) c = t.amount;
            } else if (type === 'PARTNER') {
                if (linkedAccountId) {
                    if (debitAccId === linkedAccountId) d = t.amount;
                    else if (creditAccId === linkedAccountId) c = t.amount;
                } else {
                    if (debitAccId.includes('capital') || debitAccId.includes('equity')) d = t.amount;
                    else if (creditAccId.includes('capital') || creditAccId.includes('equity')) c = t.amount;
                }
            } else {
                if (creditAccId.includes('payable')) c = t.amount;
                else if (debitAccId.includes('payable')) d = t.amount;
            }
            if (d > 0 || c > 0) return { d, c };
        }
        if (t.category === 'employee_payment_received') {
            c = t.amount;
            return { d, c };
        }
        if (type === 'CUSTOMER') {
            if (t.type === TransactionType.INCOME) { if (t.category === 'sales_invoice') d = t.amount; else c = t.amount; } else { c = t.amount; }
        } else if (type === 'PARTNER') {
            if (t.type === TransactionType.INCOME) c = t.amount;
            else if (t.type === TransactionType.EXPENSE) d = t.amount;
        } else {
            if (t.type === TransactionType.EXPENSE) { if (t.category === 'purchase_invoice' || t.category === 'expense') c = t.amount; else d = t.amount; } else { d = t.amount; }
        }
        return { d, c };
    };

    const getStatementData = (contact: Contact, start?: string, end?: string) => {
        const rawTransactions = transactions.filter(t => t.contactId === contact.id);

        // Group by Voucher ID
        const groupedMap = new Map<string, any>();
        const groupedList: any[] = [];

        rawTransactions.forEach(t => {
            const { d, c } = getTransactionDC(t, contact);
            // Use voucherId if present, otherwise unique id
            const key = t.voucherId || t.id;

            if (!groupedMap.has(key)) {
                // Initialize group with first transaction details
                const group = {
                    ...t,
                    debit: d,
                    credit: c,
                    subTransactions: [t]
                };
                groupedMap.set(key, group);
                groupedList.push(group);
            } else {
                // Aggregate into existing group
                const group = groupedMap.get(key);
                group.debit += d;
                group.credit += c;
                group.subTransactions.push(t);
            }
        });

        groupedList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let openingBalance = 0;
        let periodTransactions: any[] = [];
        const startDateObj = start ? new Date(start) : null;
        const endDateObj = end ? new Date(end) : null;
        if (endDateObj) endDateObj.setHours(23, 59, 59, 999);

        groupedList.forEach(t => {
            // Net for this group
            const net = contact.type === 'CUSTOMER' ? (t.debit - t.credit) : (t.credit - t.debit);
            const tDate = new Date(t.date);

            if (startDateObj && !isNaN(startDateObj.getTime()) && tDate < startDateObj) {
                openingBalance += net;
            } else if (!endDateObj || isNaN(endDateObj.getTime()) || tDate <= endDateObj) {
                // Only add if it has non-zero value or relevant info
                if (t.debit > 0 || t.credit > 0 || t.subTransactions.length > 0) {
                    periodTransactions.push(t);
                }
            }
        });

        let currentBalance = openingBalance;
        const dataWithRunningBalance = periodTransactions.map(t => {
            const net = contact.type === 'CUSTOMER' ? (t.debit - t.credit) : (t.credit - t.debit);
            currentBalance += net;
            return { ...t, runningBalance: currentBalance };
        });

        return { openingBalance, transactions: dataWithRunningBalance, closingBalance: currentBalance };
    };

    const calculateCurrentBalance = (contact: Contact) => {
        const { closingBalance } = getStatementData(contact);
        return closingBalance;
    };

    const customerDueTotal = useMemo(() => (
        contacts
            .filter(contact => contact.type === 'CUSTOMER')
            .reduce((sum, contact) => sum + Math.max(0, calculateCurrentBalance(contact)), 0)
    ), [contacts, transactions, invoices]);

    const supplierDueTotal = useMemo(() => (
        contacts
            .filter(contact => contact.type === 'SUPPLIER')
            .reduce((sum, contact) => sum + Math.max(0, calculateCurrentBalance(contact)), 0)
    ), [contacts, transactions, invoices]);

    const filteredContacts = useMemo(() => contacts.filter(c => activeTab === 'ALL' || c.type === activeTab).filter(c => {
        const displayName = displayContactName(c);
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || displayName.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone?.includes(searchTerm);
        if (!matchesSearch) return false;
        if (showOutstandingOnly) { const balance = calculateCurrentBalance(c); return Math.abs(balance) > 0.01; }
        return true;
    }), [contacts, activeTab, searchTerm, showOutstandingOnly, transactions, isEnglish]);

    const visibleContacts = useMemo(() => {
        const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
        const seenEmployees = new Set<string>();
        const result: Contact[] = [];

        filteredContacts.forEach(contact => {
            if (contact.type !== 'EMPLOYEE') {
                result.push(contact);
                return;
            }

            const key = normalizeName(contact.name || '');
            if (seenEmployees.has(key)) return;
            seenEmployees.add(key);
            result.push(contact);
        });

        return result;
    }, [filteredContacts]);

    const buildStatementPrintHtml = (contact: Contact, includeCheckImages = false, autoPrint = false): string => {
        const { transactions: stmts, openingBalance, closingBalance } = getStatementData(contact, stmtStartDate, stmtEndDate);
        const escapeAttr = (value: string) =>
            String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/'/g, '&#39;');
        const escapeHtml = (value: string) =>
            String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const formatPrintNumber = (value: number) => {
            const normalized = value.toLocaleString();
            return dottedNumbers ? normalized.replace(/,/g, '.') : normalized;
        };
        const formatPrintAmount = (value: number, currency?: string) => {
            const formatted = formatPrintNumber(value);
            if (!printStatementAllCurrencies) return formatted;
            return `${formatted} ${currency || baseCurrency}`;
        };
        const printableStatements = statementDateAscending ? [...stmts] : [...stmts].reverse();

        const rows = printableStatements.map(t => {
            const entryPreview = buildStatementEntryPreview(t, contact, { includeCheckImages });

            const statementCheckDetailsHtml = entryPreview.checkRows.length > 0 && entryPreview.paymentRows.length === 0
                ? `<div class="stmt-detail stmt-detail--checks">
                    <div class="stmt-detail-title">${tr('تفاصيل الشيكات', 'Check details')}</div>
                    ${entryPreview.checkRows.map((checkRow, ci) => `
                        <div class="stmt-check-item">
                            <div class="stmt-check-row1">
                                <span>${tr('شيك', 'Check')} <strong>#${escapeHtml(checkRow.checkNumber)}</strong></span>
                                <span class="stmt-num">${escapeHtml(formatPrintAmount(checkRow.amount, checkRow.currency))}</span>
                            </div>
                            <div class="stmt-check-row2">
                                <span>${tr('البنك', 'Bank')}: ${escapeHtml(checkRow.bankName)}</span>
                                ${checkRow.accountNumber ? `<span>${tr('الحساب', 'Acct')}: ${escapeHtml(checkRow.accountNumber)}</span>` : ''}
                                <span>${tr('الاستحقاق', 'Due')}: ${escapeHtml(checkRow.dueDate)}</span>
                            </div>
                            ${checkRow.imageUrls.length > 0 ? `<div class="stmt-check-gallery">${checkRow.imageUrls.map((src, ii) => `<div class="stmt-check-image-frame"><img src="${escapeAttr(src)}" alt="${escapeAttr(`${tr('صورة الشيك', 'Check')} ${ci + 1}-${ii + 1}`)}" class="stmt-check-image" /></div>`).join('')}</div>` : ''}
                        </div>
                    `).join('')}
                </div>`
                : '';

            const statementPaymentDetailsHtml = entryPreview.paymentRows.length > 0
                ? `<div class="stmt-detail stmt-detail--payment">
                    <div class="stmt-detail-title">${tr('تفاصيل السند', 'Voucher details')}</div>
                    <table class="stmt-detail-table stmt-detail-table--voucher">
                        <colgroup>
                            <col style="width:24%" />
                            <col style="width:50%" />
                            <col style="width:26%" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>${tr('العملية', 'Action')}</th>
                                <th>${tr('الحساب', 'Account')}</th>
                                <th>${tr('المبلغ', 'Amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${entryPreview.paymentRows.map(pr => `
                                <tr>
                                    <td>${escapeHtml(pr.label)}</td>
                                    <td>
                                        <div class="stmt-voucher-account">
                                            <div class="stmt-voucher-account-name">${escapeHtml(pr.accountName)}</div>
                                            ${pr.checkMeta ? `
                                                <div class="stmt-voucher-check-meta">
                                                    <div><span class="stmt-voucher-check-meta-label">${tr('شيك', 'Check')}:</span> <span class="stmt-num">${escapeHtml(pr.checkMeta.checkNumber)}</span></div>
                                                    <div><span class="stmt-voucher-check-meta-label">${tr('البنك', 'Bank')}:</span> ${escapeHtml(pr.checkMeta.bankName)}</div>
                                                    <div><span class="stmt-voucher-check-meta-label">${tr('الاستحقاق', 'Due')}:</span> <span class="stmt-num">${escapeHtml(pr.checkMeta.dueDate)}</span></div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </td>
                                    <td class="stmt-num">${escapeHtml(formatPrintAmount(pr.amount, pr.currency))}</td>
                                </tr>
                            `).join('')}
                            <tr class="stmt-detail-table-summary">
                                <td>${tr('الإجمالي', 'Total')}</td>
                                <td>-</td>
                                <td class="stmt-num">${escapeHtml(formatPrintAmount(entryPreview.paymentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), entryPreview.paymentRows[0]?.currency))}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>`
                : '';

            const statementInvoiceDetailsHtml = entryPreview.invoice
                ? `<div class="stmt-detail stmt-detail--invoice">
                    <div class="stmt-detail-title">${tr('تفاصيل الفاتورة', 'Invoice details')}</div>
                    <div class="stmt-invoice-head">
                        <span>${tr('الصنف', 'Item')}</span>
                        <span>${tr('الكمية', 'Qty')} × ${tr('السعر', 'Price')}</span>
                        <span>${tr('الإجمالي', 'Total')}</span>
                    </div>
                    ${entryPreview.invoice.items.map(item => {
                        const product = products.find(p => p.id === item.productId);
                        return `<div class="stmt-invoice-item">
                            <span class="stmt-item-name">${escapeHtml(item.description || displayProductName(product))}</span>
                            <span class="stmt-item-meta">${escapeHtml(formatPrintNumber(item.quantity))} × ${escapeHtml(formatPrintAmount(item.unitPrice, entryPreview.invoice?.currency))}</span>
                            <span class="stmt-item-total">${escapeHtml(formatPrintAmount(item.total, entryPreview.invoice?.currency))}</span>
                        </div>`;
                    }).join('')}
                    ${(printExpiryDate && entryPreview.invoice.dueDate)
                        ? `<div class="stmt-invoice-footer"><strong>${tr('تاريخ الاستحقاق', 'Due Date')}:</strong> ${escapeHtml(formatDate(entryPreview.invoice.dueDate) || '-')}</div>`
                        : ''}
                </div>`
                : '';

            return `
                <div class="stmt-row">
                    <div class="stmt-row-header">
                        <span class="stmt-date">${escapeHtml(formatDate(t.date) || '-')}</span>
                        ${!hideVoucherColumnInStatement ? `<span class="stmt-voucher">${escapeHtml(getStatementDocumentNumber(t))}</span>` : ''}
                    </div>
                    <div class="stmt-desc">${escapeHtml(t.description || '-')}</div>
                    <div class="stmt-amounts">
                        <div class="stmt-amount-item stmt-debit">
                            <span class="stmt-amount-label">${debitLabel}</span>
                            <span class="stmt-amount-value">${t.debit > 0 ? escapeHtml(formatPrintAmount(t.debit, t.currency)) : '-'}</span>
                        </div>
                        <div class="stmt-amount-item stmt-credit">
                            <span class="stmt-amount-label">${creditLabel}</span>
                            <span class="stmt-amount-value">${t.credit > 0 ? escapeHtml(formatPrintAmount(t.credit, t.currency)) : '-'}</span>
                        </div>
                        <div class="stmt-amount-item stmt-balance">
                            <span class="stmt-amount-label">${tr('الرصيد', 'Balance')}</span>
                            <span class="stmt-amount-value">${escapeHtml(formatPrintAmount(t.runningBalance, t.currency))}</span>
                        </div>
                    </div>
                    ${statementPaymentDetailsHtml}
                    ${statementCheckDetailsHtml}
                    ${statementInvoiceDetailsHtml}
                </div>
            `;
        }).join('');

        const statementTitle = `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`;
        const statementPeriodText = `${tr('الفترة', 'Period')}: ${stmtStartDate || tr('بداية النشاط', 'Start of activity')} - ${stmtEndDate || tr('الآن', 'Now')}`;
        const printDateLabel = tr('تاريخ الطباعة', 'Print Date');
        const pageLabel = tr('الصفحة', 'Page');
        const ofLabel = tr('من', 'of');
        const basePadding = 30 + (Math.max(0, headerTopLines) * 20);
        const shareSummary = `${statementTitle}\n${statementPeriodText}\n${tr('الرصيد الختامي', 'Closing Balance')}: ${formatPrintAmount(closingBalance, baseCurrency)}`;

        return `<!DOCTYPE html>
<html dir="${isEnglish ? 'ltr' : 'rtl'}" lang="${isEnglish ? 'en' : 'ar'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(statementTitle)}</title>
  <style>
    :root { --stmt-pad: ${basePadding}px; }
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=block');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      padding: var(--stmt-pad) 10px 20px;
      background: #f1f5f9;
      color: #0f172a;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    /* Actions bar */
    .statement-actions {
      position: sticky; top: 0; z-index: 10;
      background: rgba(241,245,249,0.97); backdrop-filter: blur(8px);
      border: 1px solid #e2e8f0; border-radius: 14px;
      padding: 8px 10px; margin-bottom: 10px;
      display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;
    }
    .statement-actions button {
      border: 1px solid #cbd5e1; background: #fff; color: #1e293b;
      padding: 8px 14px; border-radius: 10px; font-family: inherit;
      font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .statement-actions button:hover { background: #f8fafc; }
    /* Sheet */
    .statement-sheet {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
      padding: 14px 12px; box-shadow: 0 4px 20px rgba(15,23,42,0.07);
    }
    .statement-title { font-size: 20px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
    .statement-sub { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 3px; }
    /* Card list */
    .stmt-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
    /* Transaction card */
    .stmt-row {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 10px 12px; box-shadow: 0 1px 3px rgba(15,23,42,0.04);
    }
    .stmt-row--special { background: #f8fafc; border-color: #cbd5e1; }
    .stmt-row--closing { background: #fff7ed; border-color: #fed7aa; }
    /* Card header */
    .stmt-row-header {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 5px;
    }
    .stmt-date { font-size: 11px; font-weight: 700; color: #64748b; direction: ltr; }
    .stmt-voucher {
      font-size: 11px; font-weight: 800; color: #4f46e5;
      background: #eef2ff; padding: 1px 7px; border-radius: 6px; direction: ltr;
    }
    /* Description */
    .stmt-desc { font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 8px; line-height: 1.4; }
    .stmt-desc-bold { font-size: 13px; font-weight: 900; color: #334155; }
    /* Amounts */
    .stmt-amounts { display: flex; gap: 5px; margin-top: 2px; }
    .stmt-amount-item {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      background: #f8fafc; border-radius: 8px; padding: 5px 4px;
    }
    .stmt-amount-label { font-size: 9px; font-weight: 700; color: #94a3b8; }
    .stmt-amount-value {
      font-size: 12px; font-weight: 900; margin-top: 1px;
      direction: ltr; white-space: nowrap; font-variant-numeric: tabular-nums;
    }
    .stmt-debit .stmt-amount-value { color: #1d4ed8; }
    .stmt-credit .stmt-amount-value { color: #0891b2; }
    .stmt-balance .stmt-amount-value { color: #be123c; }
    /* Detail block */
    .stmt-detail { margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .stmt-detail-title {
      padding: 5px 10px; font-size: 10px; font-weight: 800;
      color: #334155; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .stmt-detail--invoice .stmt-detail-title { background: #eff6ff; color: #1d4ed8; border-bottom-color: #bfdbfe; }
    .stmt-detail--checks .stmt-detail-title { background: #fff7ed; color: #9a3412; border-bottom-color: #fed7aa; }
    .stmt-detail--payment .stmt-detail-title { background: #f0fdf4; color: #166534; border-bottom-color: #bbf7d0; }
    /* Payment row */
    .stmt-detail-row {
      display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap;
      padding: 5px 10px; border-top: 1px solid #f1f5f9; font-size: 11px;
    }
    .stmt-detail-row + .stmt-detail-row { border-top: 1px solid #f1f5f9; }
    .stmt-detail-label { font-weight: 800; color: #334155; flex-shrink: 0; }
    .stmt-detail-value { flex: 1; font-weight: 600; color: #0f172a; }
    .stmt-num { font-weight: 800; color: #0f172a; direction: ltr; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .stmt-detail-table {
      width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff;
    }
    .stmt-detail-table th,
    .stmt-detail-table td {
      border: 1px solid #cbd5e1; padding: 6px 7px; font-size: 10px; line-height: 1.45; color: #0f172a;
    }
    .stmt-detail-table th { background: #f8fafc; font-weight: 900; }
    .stmt-detail-table th:first-child,
    .stmt-detail-table td:first-child { text-align: center; }
    .stmt-detail-table th:last-child,
    .stmt-detail-table td:last-child { text-align: center; }
    .stmt-detail-table-summary td { background: #f8fafc; font-weight: 900; }
    .stmt-voucher-account { display: grid; gap: 3px; }
    .stmt-voucher-account-name { font-weight: 700; color: #0f172a; word-break: break-word; }
    .stmt-voucher-check-meta { display: grid; gap: 2px; font-size: 9px; color: #64748b; line-height: 1.35; }
    .stmt-voucher-check-meta-label { font-weight: 800; color: #475569; }
    /* Invoice */
    .stmt-invoice-head {
      display: flex; gap: 6px; padding: 4px 10px;
      font-size: 9px; font-weight: 800; color: #64748b;
      background: #f8fafc; border-bottom: 1px solid #dbeafe;
    }
    .stmt-invoice-head span:first-child { flex: 1; }
    .stmt-invoice-item {
      display: flex; gap: 6px; align-items: baseline;
      padding: 5px 10px; border-top: 1px solid #f1f5f9; font-size: 11px;
    }
    .stmt-item-name { flex: 1; font-weight: 700; color: #0f172a; word-break: break-word; }
    .stmt-item-meta { font-size: 10px; color: #64748b; direction: ltr; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .stmt-item-total { font-weight: 900; color: #1d4ed8; direction: ltr; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .stmt-invoice-footer { padding: 5px 10px; font-size: 10px; color: #475569; background: #f8fafc; border-top: 1px solid #bfdbfe; }
    /* Check */
    .stmt-check-item { padding: 6px 10px; border-top: 1px solid #f1f5f9; }
    .stmt-check-row1 {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11px; font-weight: 700; color: #0f172a; flex-wrap: wrap; gap: 4px;
    }
    .stmt-check-row2 { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: #64748b; margin-top: 2px; }
    /* Check gallery */
    .stmt-check-gallery {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 8px 10px; border-top: 1px solid #fed7aa; background: #fff;
    }
    .stmt-check-image-frame { border: 1px solid #e2e8f0; border-radius: 8px; padding: 3px; background: #fff; }
    .stmt-check-image { display: block; width: 120px; height: 75px; object-fit: cover; border-radius: 6px; }
    /* Closing summary */
    .statement-closing-summary { margin-top: 12px; text-align: ${isEnglish ? 'left' : 'right'}; }
    .statement-closing-summary-label { display: block; font-size: 10px; font-weight: 800; color: #94a3b8; }
    .statement-closing-summary-value { display: inline-block; margin-top: 2px; color: #e11d48; font-size: 18px; font-weight: 900; direction: ltr; font-variant-numeric: tabular-nums; }
    .statement-print-footer { display: none; }
    .statement-print-footer__meta {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; width: 100%;
    }
    .statement-print-footer__item {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; color: #334155; white-space: nowrap;
    }
    .statement-print-footer__label { color: #64748b; font-weight: 800; }
    .statement-print-footer__value {
      color: #0f172a; font-weight: 900;
      font-variant-numeric: tabular-nums;
    }
    .statement-print-footer__counter {
      display: inline-flex; align-items: center; gap: 5px;
      font-variant-numeric: tabular-nums;
    }
    .statement-print-footer__page-current::before { content: counter(page); }
    @media (max-width: 480px) {
      body { padding: 8px 6px 16px; }
      .statement-actions { padding: 6px 8px; margin-bottom: 8px; }
      .statement-actions button { flex: 1 1 28%; padding: 8px 6px; font-size: 12px; }
      .statement-sheet { padding: 10px 8px; border-radius: 12px; }
      .statement-title { font-size: 17px; }
      .stmt-row { padding: 8px 10px; }
      .stmt-desc { font-size: 12px; }
      .stmt-amount-value { font-size: 11px; }
      .stmt-check-image { width: 100px; height: 63px; }
    }
    @media print {
      @page { margin: 10mm 10mm 18mm 10mm; }
      body { background: #fff; padding: var(--stmt-pad) 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .statement-actions { display: none !important; }
      .statement-sheet { border: none; border-radius: 0; box-shadow: none; padding: 0; }
      .stmt-row { box-shadow: none; border-color: #d1d5db; }
      .statement-print-footer {
        position: fixed; left: 10mm; right: 10mm; bottom: 4mm; z-index: 50;
        display: flex !important; align-items: center; justify-content: space-between;
        padding-top: 3mm; border-top: 1px solid #cbd5e1; background: #fff;
      }
    }
  </style>
</head>
<body>
  <div
    class="statement-actions"
    id="statement-actions"
    data-share-summary="${escapeAttr(shareSummary)}"
    data-auto-print="${autoPrint ? 'true' : 'false'}"
    data-copy-success="${escapeAttr(tr('تم نسخ ملخص كشف الحساب. يمكنك مشاركته الآن.', 'Statement summary copied. You can share it now.'))}"
    data-share-failed="${escapeAttr(tr('تعذر فتح المشاركة. سيتم فتح الطباعة بدلًا من ذلك.', 'Could not open share sheet. Opening print instead.'))}"
  >
    <button type="button" id="statement-close-btn">${tr('إغلاق', 'Close')}</button>
    <button type="button" id="statement-print-btn">${tr('طباعة', 'Print')}</button>
    <button type="button" id="statement-share-btn">${tr('مشاركة', 'Share')}</button>
  </div>
  <div class="statement-sheet" data-statement-print-root>
    <h1 class="statement-title">${tr('كشف حساب', 'Statement')}: ${escapeHtml(displayContactName(contact))}</h1>
    <p class="statement-sub">${escapeHtml(statementPeriodText)}</p>
    ${printPersonalData ? `<p class="statement-sub">${tr('الهاتف', 'Phone')}: ${escapeHtml(contact.phone || '-')} ${contact.address ? `| ${tr('العنوان', 'Address')}: ${escapeHtml(contact.address)}` : ''}</p>` : ''}
    <div class="stmt-list">
      <div class="stmt-row stmt-row--special">
        <div class="stmt-desc-bold">${tr('الرصيد الافتتاحي', 'Opening balance')}</div>
        <div class="stmt-amounts">
          <div class="stmt-amount-item stmt-balance">
            <span class="stmt-amount-label">${tr('الرصيد', 'Balance')}</span>
            <span class="stmt-amount-value">${formatPrintAmount(openingBalance, baseCurrency)}</span>
          </div>
        </div>
      </div>
      ${rows}
      <div class="stmt-row stmt-row--closing">
        <div class="stmt-desc-bold">${tr('الرصيد الختامي', 'Closing balance')}</div>
        <div class="stmt-amounts">
          <div class="stmt-amount-item stmt-balance">
            <span class="stmt-amount-label">${tr('الرصيد', 'Balance')}</span>
            <span class="stmt-amount-value">${formatPrintAmount(closingBalance, baseCurrency)}</span>
          </div>
        </div>
      </div>
    </div>
    ${statementFooterNote ? `<p style="margin-top:10px; color:#555;">${statementFooterNote}</p>` : ''}
    ${(companySettings.showAccountBalanceUnderVoucher ?? false)
      ? `
        <div class="statement-closing-summary">
          <span class="statement-closing-summary-label">${tr('الرصيد الختامي', 'Closing Balance')}</span>
          <span class="statement-closing-summary-value statement-number-cell">${formatPrintAmount(closingBalance, baseCurrency)}</span>
        </div>
      `
      : ''
    }
  </div>
  <div class="statement-print-footer" aria-hidden="true">
    <div class="statement-print-footer__meta">
      <span class="statement-print-footer__item">
        <span class="statement-print-footer__label">${escapeHtml(printDateLabel)}</span>
        <span class="statement-print-footer__value" data-statement-print-date></span>
      </span>
      <span class="statement-print-footer__item">
        <span class="statement-print-footer__label">${escapeHtml(pageLabel)}</span>
        <span class="statement-print-footer__counter">
          <span class="statement-print-footer__value statement-print-footer__page-current"></span>
          <span class="statement-print-footer__label">${escapeHtml(ofLabel)}</span>
          <span class="statement-print-footer__value" data-statement-page-count>1</span>
        </span>
      </span>
    </div>
  </div>
  <script>
    (() => {
      const closeBtn = document.getElementById('statement-close-btn');
      const printBtn = document.getElementById('statement-print-btn');
      const shareBtn = document.getElementById('statement-share-btn');
      const actions = document.getElementById('statement-actions');
      const shareSummary = actions?.getAttribute('data-share-summary') || document.title;
      const shouldAutoPrint = actions?.getAttribute('data-auto-print') === 'true';
      const copySuccess = actions?.getAttribute('data-copy-success') || 'Copied';
      const shareFailed = actions?.getAttribute('data-share-failed') || 'Share failed';
      const syncPrintFooterMeta = () => {
        const printDate = new Intl.DateTimeFormat('${isEnglish ? 'en-GB' : 'ar-EG-u-nu-latn'}', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date());
        document.querySelectorAll('[data-statement-print-date]').forEach(node => {
          node.textContent = printDate;
        });

        const mmToPx = ${96 / 25.4};
        const pageHeightMm = 297;
        const topMarginPx = 10 * mmToPx;
        const bottomMarginPx = 18 * mmToPx;
        const bodyStyle = window.getComputedStyle(document.body);
        const bodyPaddingTop = parseFloat(bodyStyle.paddingTop) || 0;
        const bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
        const printableHeight = Math.max(1, (pageHeightMm * mmToPx) - topMarginPx - bottomMarginPx - bodyPaddingTop - bodyPaddingBottom);
        const root = document.querySelector('[data-statement-print-root]') || document.body;
        const contentHeight = Math.max(root.scrollHeight, root.getBoundingClientRect().height, 1);
        const pageCount = Math.max(1, Math.ceil(contentHeight / printableHeight));
        document.querySelectorAll('[data-statement-page-count]').forEach(node => {
          node.textContent = String(pageCount);
        });
      };
      const waitForStatementFonts = async () => {
        try {
          if (document.fonts?.ready) {
            await document.fonts.ready;
          }
        } catch (error) {
          // Ignore font loading failures and continue with print fallback.
        }
      };
      const triggerPrint = async () => {
        await waitForStatementFonts();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        syncPrintFooterMeta();
        window.print();
      };

      closeBtn?.addEventListener('click', () => {
        window.close();
        if (!window.closed) {
          if (window.history.length > 1) window.history.back();
          else window.location.replace('about:blank');
        }
      });

      printBtn?.addEventListener('click', () => {
        void triggerPrint();
      });

      shareBtn?.addEventListener('click', async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: document.title, text: shareSummary });
            return;
          }
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareSummary);
            alert(copySuccess);
            return;
          }
        } catch (error) {
          // Ignore and fallback to print.
        }
        alert(shareFailed);
        await triggerPrint();
      });

      if (shouldAutoPrint) {
        window.setTimeout(() => {
          void triggerPrint();
        }, 120);
      }
    })();
    </script>
</body>
</html>`;
    };

    const buildStatementShareText = (contact: Contact, closingBalance: number) => [
        `${tr('كشف حساب', 'Statement')}: ${displayContactName(contact)}`,
        `${tr('الفترة', 'Period')}: ${stmtStartDate || tr('بداية النشاط', 'Start of activity')} - ${stmtEndDate || tr('الآن', 'Now')}`,
        `${tr('الرصيد الختامي', 'Closing Balance')}: ${closingBalance.toLocaleString()} ${baseCurrency}`
    ].join('\n');

    const buildStatementNotificationText = (contact: Contact, closingBalance: number) => [
        tr('تم تحديث كشف حسابكم.', 'Your account statement was updated.'),
        `${tr('الطرف', 'Contact')}: ${displayContactName(contact)}`,
        `${tr('الفترة', 'Period')}: ${stmtStartDate || tr('بداية النشاط', 'Start of activity')} - ${stmtEndDate || tr('الآن', 'Now')}`,
        `${tr('الرصيد الختامي', 'Closing Balance')}: ${closingBalance.toLocaleString()} ${baseCurrency}`
    ].join('\n');

    const buildStatementPdfName = (contact: Contact) =>
        `${tr('كشف حساب', 'Statement')}-${displayContactName(contact)}-${stmtStartDate || 'start'}-${stmtEndDate || 'end'}.pdf`;

    const buildStatementExcelName = (contact: Contact) =>
        sanitizeDownloadName(`${tr('كشف حساب', 'Statement')}-${displayContactName(contact)}-${stmtStartDate || 'start'}-${stmtEndDate || 'end'}.xlsx`);

    const buildStatementEntryDetails = (entry: any, contact: Contact, invoice: Invoice | null) => {
        const detailLines: string[] = [];
        const subTransactions = entry.subTransactions || [entry];

        subTransactions.forEach((sub: any) => {
            const relatedCheck = sub.checkId ? checks.find(c => c.id === sub.checkId) : null;
            if (relatedCheck) {
                detailLines.push(
                    [
                        `${tr('شيك', 'Check')}: ${relatedCheck.checkNumber}`,
                        `${tr('البنك', 'Bank')}: ${displayAccountName(relatedCheck.bankAccountId ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null : { id: '', name: relatedCheck.bankName })}`,
                        relatedCheck.accountNumber ? `${tr('الحساب', 'Account')}: ${relatedCheck.accountNumber}` : '',
                        `${tr('الاستحقاق', 'Due')}: ${formatDate(relatedCheck.dueDate) || '-'}`,
                        `${tr('المبلغ', 'Amount')}: ${relatedCheck.amount.toLocaleString()} ${relatedCheck.currency || entry.currency || baseCurrency}`
                    ].filter(Boolean).join(' | ')
                );
                return;
            }

            const { contraAccountId, isReceipt } = getPaymentLineMeta(sub, contact);
            const account = accounts.find(a => a.id === contraAccountId);
            if (account && !invoice) {
                const label = isReceipt ? tr('تم القبض في', 'Received in') : tr('تم الصرف من', 'Paid from');
                const amountSuffix = sub.amount !== entry.debit && sub.amount !== entry.credit
                    ? ` (${sub.amount.toLocaleString()} ${sub.currency || entry.currency || baseCurrency})`
                    : '';
                detailLines.push(`${label}: ${displayAccountName(account)}${amountSuffix}`);
            }
        });

        if (invoice) {
            detailLines.push(tr('تفاصيل الفاتورة', 'Invoice details'));
            invoice.items.forEach((item, index) => {
                const product = products.find(p => p.id === item.productId);
                detailLines.push(
                    `${index + 1}. ${item.description || displayProductName(product)} | ${tr('الكمية', 'Qty')}: ${item.quantity} | ${tr('السعر', 'Price')}: ${item.unitPrice.toLocaleString()} | ${tr('الإجمالي', 'Total')}: ${item.total.toLocaleString()}`
                );
            });
            if (printExpiryDate && invoice.dueDate) {
                detailLines.push(`${tr('تاريخ الاستحقاق', 'Expiry Date')}: ${formatDate(invoice.dueDate)}`);
            }
        }

        return detailLines.join('\n');
    };

    const buildStatementPdfFile = async (contact: Contact) => {
        await settleStatementSnapshot();
        // A4 portrait width in pixels at 96 DPI
        const a4PortraitWidth = 794;
        return buildElementPdfFile(statementExportRef.current, {
            title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
            fileName: buildStatementPdfName(contact),
            dir: isEnglish ? 'ltr' : 'rtl',
            lang: isEnglish ? 'en' : 'ar',
            orientation: 'portrait',
            canvasScale: 2.5,
            padding: 20,
            backgroundColor: '#ffffff',
            minRenderWidth: a4PortraitWidth,
            maxRenderWidth: a4PortraitWidth
        });
    };

    const downloadStatementPdf = async (contact: Contact) => {
        const { closingBalance } = getStatementData(contact, stmtStartDate, stmtEndDate);
        const shareText = buildStatementShareText(contact, closingBalance);
        const shareWindow: Window | null = null;
        const openWhatsappLink = (message: string) => {
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
        };
        try {
            const pdfFile = await buildStatementPdfFile(contact);
            if (!pdfFile) {
            alert(tr('تعذر تجهيز ملف PDF للكشف الآن.', 'Could not prepare the statement PDF right now.'));
            openWhatsappLink(shareText);
            return;
        }
        const whatsappMessage = `${shareText}\n\n${tr('تم تنزيل ملف PDF للكشف على جهازك. أرفقه داخل واتساب لإرسال الكشف كاملًا بشكل مرتب.', 'The statement PDF was downloaded to your device. Attach it in WhatsApp to send the full statement in a clean layout.')}`;
        if (shareWindow && !shareWindow.closed) {
            downloadBlobFile(pdfFile, pdfFile.name);
            shareWindow.location.href = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
            shareWindow.focus();
            return;
        }
        downloadBlobFile(pdfFile, pdfFile.name);
        } catch {
            alert(tr('تعذر حفظ كشف الحساب بصيغة PDF.', 'Could not save the statement as PDF.'));
        }
    };

    const exportStatementExcel = (contact: Contact) => {
        try {
        const { transactions: stmts, openingBalance, closingBalance } = getStatementData(contact, stmtStartDate, stmtEndDate);
        const printableStatements = statementDateAscending ? [...stmts] : [...stmts].reverse();
        const title = `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`;
        const periodText = `${tr('الفترة', 'Period')}: ${stmtStartDate || tr('بداية النشاط', 'Start of activity')} - ${stmtEndDate || tr('الآن', 'Now')}`;
        const contactInfo = printPersonalData
            ? `${tr('الهاتف', 'Phone')}: ${contact.phone || '-'}${contact.address ? ` | ${tr('العنوان', 'Address')}: ${contact.address}` : ''}`
            : '';
        const toExcelNumber = (value: number) => Number((Number(value) || 0).toFixed(2));
        const descriptionColumnIndex = hideVoucherColumnInStatement ? 1 : 2;
        const tableHeader = [
            tr('التاريخ', 'Date'),
            ...(!hideVoucherColumnInStatement ? [tr('السند', 'Voucher')] : []),
            tr('البيان', 'Description'),
            debitLabel,
            creditLabel,
            tr('الرصيد', 'Balance')
        ];
        const rows: (string | number)[][] = [
            [title],
            [periodText]
        ];

        if (contactInfo) {
            rows.push([contactInfo]);
        }

        rows.push([]);
        const headerRowIndex = rows.length;
        rows.push(tableHeader);
        rows.push([
            '-',
            ...(!hideVoucherColumnInStatement ? ['-'] : []),
            tr('الرصيد الافتتاحي', 'Opening balance'),
            '',
            '',
            toExcelNumber(openingBalance)
        ]);

        printableStatements.forEach(entry => {
            const invoice = entry.invoiceId ? invoices.find(inv => inv.id === entry.invoiceId) || null : null;
            const details = buildStatementEntryDetails(entry, contact, invoice);
            rows.push([
                formatDate(entry.date) || '',
                ...(!hideVoucherColumnInStatement ? [getStatementDocumentNumber(entry)] : []),
                [entry.description, details].filter(Boolean).join('\n'),
                entry.debit > 0 ? toExcelNumber(entry.debit) : '',
                entry.credit > 0 ? toExcelNumber(entry.credit) : '',
                toExcelNumber(entry.runningBalance)
            ]);
        });

        rows.push([]);
        const closingRow = new Array(tableHeader.length).fill('');
        closingRow[descriptionColumnIndex] = tr('الرصيد الختامي', 'Closing Balance');
        closingRow[tableHeader.length - 1] = toExcelNumber(closingBalance);
        rows.push(closingRow);

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = [
            { wch: 14 },
            ...(!hideVoucherColumnInStatement ? [{ wch: 16 }] : []),
            { wch: 68 },
            { wch: 14 },
            { wch: 14 },
            { wch: 16 }
        ];
        worksheet['!autofilter'] = {
            ref: XLSX.utils.encode_range({
                s: { r: headerRowIndex, c: 0 },
                e: { r: headerRowIndex, c: tableHeader.length - 1 }
            })
        };

        const workbook = XLSX.utils.book_new();
        workbook.Workbook = { Views: [{ RTL: !isEnglish }] };
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
        downloadWorkbookFile(workbook, { fileName: buildStatementExcelName(contact) });
        } catch {
            alert(tr('تعذر تصدير كشف الحساب إلى Excel.', 'Could not export the statement to Excel.'));
        }
    };

    const handleShareStatementWhatsApp = async (contact: Contact, closingBalance: number, shareWindow?: Window | null) => {
        const shareText = buildStatementShareText(contact, closingBalance);
        const openWhatsappLink = (message: string) => {
            const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
            if (shareWindow && !shareWindow.closed) {
                shareWindow.location.href = url;
                shareWindow.focus();
                return;
            }
            window.open(url, '_blank');
        };
        let pdfFile: File | null = null;
        try {
            pdfFile = await buildStatementPdfFile(contact);
        } catch {
            pdfFile = null;
        }

        if (!pdfFile) {
            alert(tr('تعذر تجهيز ملف PDF للكشف الآن.', 'Could not prepare the statement PDF right now.'));
            return;
        }

        let canShareFiles = Boolean(pdfFile && navigator.share);
        if (pdfFile && canShareFiles && typeof navigator.canShare === 'function') {
            try {
                canShareFiles = navigator.canShare({ files: [pdfFile] });
            } catch {
                canShareFiles = false;
            }
        }

        if (canShareFiles) {
            try {
                await navigator.share({
                    title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
                    text: shareText,
                    files: [pdfFile]
                });
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') {
                    return;
                }
            }
        }

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(shareText);
            } catch {
                // Ignore clipboard fallback errors.
            }
        }

        downloadBlobFile(pdfFile, pdfFile.name);
        window.open(
            `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${tr('تم تنزيل ملف PDF للكشف على جهازك. أرفقه داخل واتساب لإرسال الكشف كاملًا بشكل مرتب.', 'The statement PDF was downloaded to your device. Attach it in WhatsApp to send the full statement in a clean layout.')}`)}`,
            '_blank'
        );
    };

    const handlePrintStatement = async (contact: Contact, printWindow?: Window | null) => {
        if (printWindow && !printWindow.closed) {
            try {
                printWindow.close();
            } catch {}
        }

        try {
            await settleStatementSnapshot();
            const printed = printElementContent(statementExportRef.current, {
                title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
                dir: isEnglish ? 'ltr' : 'rtl',
                lang: isEnglish ? 'en' : 'ar',
                pageOrientation: 'portrait',
                autoCloseAfterPrint: true
            });
            if (!printed) {
                throw new Error('statement_print_failed');
            }
        } catch (error) {
            throw error;
        }
    };

    const printStatementSafe = async (contact: Contact, printWindow?: Window | null) => {
        try {
            await handlePrintStatement(contact, printWindow);
        } catch {
            if (printWindow && !printWindow.closed) {
                try {
                    printWindow.close();
                } catch {}
            }
            alert(tr('تعذر تجهيز كشف الحساب للطباعة الآن.', 'Could not prepare the statement for printing right now.'));
        }
    };

    const downloadStatementPdfSafe = async (contact: Contact) => {
        try {
            const pdfFile = await buildStatementPdfFile(contact);
            if (!pdfFile) {
                alert(tr('تعذر تجهيز ملف PDF للكشف الآن.', 'Could not prepare the statement PDF right now.'));
                return;
            }
            downloadBlobFile(pdfFile, pdfFile.name);
        } catch {
            alert(tr('تعذر حفظ كشف الحساب بصيغة PDF.', 'Could not save the statement as PDF.'));
        }
    };

    const shareStatementDocumentSafe = async (contact: Contact, closingBalance: number) => {
        const shareText = buildStatementShareText(contact, closingBalance);
        let pdfFile: File | null = null;
        try {
            pdfFile = await buildStatementPdfFile(contact);
        } catch {
            pdfFile = null;
        }

        let canShareFiles = Boolean(pdfFile && navigator.share);
        if (pdfFile && canShareFiles && typeof navigator.canShare === 'function') {
            try {
                canShareFiles = navigator.canShare({ files: [pdfFile] });
            } catch {
                canShareFiles = false;
            }
        }

        if (canShareFiles && pdfFile) {
            try {
                await navigator.share({
                    title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
                    text: shareText,
                    files: [pdfFile]
                });
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') {
                    return;
                }
            }
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
                    text: shareText
                });
                if (pdfFile) {
                    downloadBlobFile(pdfFile, pdfFile.name);
                }
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') {
                    return;
                }
            }
        }

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(shareText);
            } catch {
                // Ignore clipboard fallback failure.
            }
        }

        if (pdfFile) {
            downloadBlobFile(pdfFile, pdfFile.name);
        }
        window.prompt(tr('انسخ كشف الحساب التالي', 'Copy the statement below'), shareText);
    };

    const exportStatementExcelSafe = (contact: Contact) => {
        try {
            const { transactions: stmts, openingBalance, closingBalance } = getStatementData(contact, stmtStartDate, stmtEndDate);
            const printableStatements = statementDateAscending ? [...stmts] : [...stmts].reverse();
            const title = `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`;
            const periodText = `${tr('الفترة', 'Period')}: ${stmtStartDate || tr('بداية النشاط', 'Start of activity')} - ${stmtEndDate || tr('الآن', 'Now')}`;
            const contactInfo = printPersonalData
                ? `${tr('الهاتف', 'Phone')}: ${contact.phone || '-'}${contact.address ? ` | ${tr('العنوان', 'Address')}: ${contact.address}` : ''}`
                : '';
            const toExcelNumber = (value: number) => Number((Number(value) || 0).toFixed(2));
            const descriptionColumnIndex = hideVoucherColumnInStatement ? 1 : 2;
            const tableHeader = [
                tr('التاريخ', 'Date'),
                ...(!hideVoucherColumnInStatement ? [tr('السند', 'Voucher')] : []),
                tr('البيان', 'Description'),
                debitLabel,
                creditLabel,
                tr('الرصيد', 'Balance')
            ];
            const rows: (string | number)[][] = [
                [title],
                [periodText]
            ];

            if (contactInfo) {
                rows.push([contactInfo]);
            }

            rows.push([]);
            const headerRowIndex = rows.length;
            rows.push(tableHeader);
            rows.push([
                '-',
                ...(!hideVoucherColumnInStatement ? ['-'] : []),
                tr('الرصيد الافتتاحي', 'Opening balance'),
                '',
                '',
                toExcelNumber(openingBalance)
            ]);

            printableStatements.forEach(entry => {
                const invoice = entry.invoiceId ? invoices.find(inv => inv.id === entry.invoiceId) || null : null;
                const details = buildStatementEntryDetails(entry, contact, invoice);
                rows.push([
                    formatDate(entry.date) || '',
                    ...(!hideVoucherColumnInStatement ? [getStatementDocumentNumber(entry)] : []),
                    [entry.description, details].filter(Boolean).join('\n'),
                    entry.debit > 0 ? toExcelNumber(entry.debit) : '',
                    entry.credit > 0 ? toExcelNumber(entry.credit) : '',
                    toExcelNumber(entry.runningBalance)
                ]);
            });

            rows.push([]);
            const closingRow = new Array(tableHeader.length).fill('');
            closingRow[descriptionColumnIndex] = tr('الرصيد الختامي', 'Closing Balance');
            closingRow[tableHeader.length - 1] = toExcelNumber(closingBalance);
            rows.push(closingRow);

            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 14 },
                ...(!hideVoucherColumnInStatement ? [{ wch: 16 }] : []),
                { wch: 68 },
                { wch: 14 },
                { wch: 14 },
                { wch: 16 }
            ];
            worksheet['!autofilter'] = {
                ref: XLSX.utils.encode_range({
                    s: { r: headerRowIndex, c: 0 },
                    e: { r: headerRowIndex, c: tableHeader.length - 1 }
                })
            };

            const workbook = XLSX.utils.book_new();
            workbook.Workbook = { Views: [{ RTL: !isEnglish }] };
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
            downloadWorkbookFile(workbook, { fileName: buildStatementExcelName(contact) });
        } catch {
            alert(tr('تعذر تصدير كشف الحساب إلى Excel.', 'Could not export the statement to Excel.'));
        }
    };

    const shareStatementOnWhatsAppSafe = async (contact: Contact, closingBalance: number, shareWindow?: Window | null) => {
        const shareText = buildStatementShareText(contact, closingBalance);
        const whatsappAttachmentHint = tr(
            'تم تنزيل ملف PDF للكشف على جهازك. أرفقه داخل واتساب لإرسال الكشف كاملًا بشكل مرتب.',
            'The statement PDF was downloaded to your device. Attach it in WhatsApp to send the full statement in a clean layout.'
        );
        const openWhatsappLink = (message: string) => {
            const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
            if (shareWindow && !shareWindow.closed) {
                shareWindow.location.href = url;
                shareWindow.focus();
                return;
            }
            const popup = window.open(url, '_blank');
            if (!popup) {
                alert(tr('تعذر فتح واتساب. يرجى السماح بالنوافذ المنبثقة.', 'Unable to open WhatsApp. Please allow pop-ups.'));
            }
        };

        let pdfFile: File | null = null;
        try {
            pdfFile = await buildStatementPdfFile(contact);
        } catch {
            pdfFile = null;
        }

        let canShareFiles = Boolean(pdfFile && navigator.share);
        if (pdfFile && canShareFiles && typeof navigator.canShare === 'function') {
            try {
                canShareFiles = navigator.canShare({ files: [pdfFile] });
            } catch {
                canShareFiles = false;
            }
        }

        if (canShareFiles && pdfFile) {
            try {
                await navigator.share({
                    title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
                    text: shareText,
                    files: [pdfFile]
                });
                if (shareWindow && !shareWindow.closed) {
                    shareWindow.close();
                }
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') {
                    if (shareWindow && !shareWindow.closed) {
                        shareWindow.close();
                    }
                    return;
                }
            }
        }

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(shareText);
            } catch {
                // Ignore clipboard fallback errors.
            }
        }

        if (!pdfFile) {
            openWhatsappLink(shareText);
            return;
        }

        downloadBlobFile(pdfFile, pdfFile.name);
        openWhatsappLink(`${shareText}\n\n${whatsappAttachmentHint}`);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        const data = {
            name: newName,
            phone: newPhone,
            address: newAddress,
            type: newType,
            linkedAccountId: newType === 'PARTNER' ? (newLinkedAccountId || undefined) : undefined,
            currentAccountId: newType === 'PARTNER' ? (newLinkedAccountId || undefined) : undefined
        };

        if (editingContactId) {
            const result = updateContact(editingContactId, data);
            if (!result.ok) return;
        } else {
            const result = addContact(data);
            if (!result.ok) return;
        }
        resetForm();
    };

    const resetForm = () => {
        setNewName('');
        setNewPhone('');
        setNewAddress('');
        setNewType('CUSTOMER');
        setNewLinkedAccountId('');
        setEditingContactId(null);
        setShowAddForm(false);
    };

    const handleEdit = (e: React.MouseEvent, c: Contact) => {
        e.stopPropagation();
        setEditingContactId(c.id);
        setNewName(c.name);
        setNewPhone(c.phone || '');
        setNewAddress(c.address || '');
        setNewType(c.type);
        setNewLinkedAccountId(c.currentAccountId || c.linkedAccountId || '');
        setShowAddForm(true);
    };

    const confirmDelete = () => {
        if (deleteContactId) {
            const result = deleteContact(deleteContactId);
            if (!result.ok) {
                alert(result.message);
            }
            setDeleteContactId(null);
        }
    };

    return (
        <div
            className={`app-page p-4 font-tajawal animate-in fade-in duration-500 ${isEnglish ? 'text-left' : ''}`}
            dir={isEnglish ? 'ltr' : 'rtl'}
        >
            <header className="mb-6 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">{tr('الدليل', 'Directory')}</h1>
                    <p className="text-gray-400 text-xs font-bold mt-1 uppercase tracking-widest">{tr('العملاء والموردون والشركاء', 'Customers, Suppliers & Partners')}</p>
                </div>
                {activeTab === 'EMPLOYEE' ? (
                    <div className="bg-purple-50 text-purple-600 px-4 py-2 rounded-xl text-[10px] font-bold border border-purple-100 flex items-center gap-2 animate-in fade-in">
                        <AlertCircle size={14} />
                        <span>{tr('يتم إضافة الموظفين من شؤون الموظفين', 'Employees are added from HR')}</span>
                    </div>
                ) : (
                    <button onClick={() => { resetForm(); setShowAddForm(true); }} className="bg-blue-600 text-white p-3.5 rounded-2xl shadow-xl hover:bg-blue-700 transition-all"><UserPlus size={24} /></button>
                )}
            </header>

            {/* Tabs */}
            <div className="flex p-1.5 bg-white border border-gray-100 rounded-[2rem] mb-6 shadow-sm overflow-x-auto no-scrollbar">
                {(['ALL', 'CUSTOMER', 'SUPPLIER', 'PARTNER', 'EMPLOYEE'] as Array<'ALL' | ContactType>).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[1.6rem] font-black text-[10px] whitespace-nowrap transition-all ${activeTab === tab ? 'bg-slate-800 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        {tab === 'ALL' ? <LayoutGrid size={16} /> : tab === 'CUSTOMER' ? <Users size={16} /> : tab === 'SUPPLIER' ? <Truck size={16} /> : tab === 'PARTNER' ? <Scale size={16} /> : <Briefcase size={16} />}
                        {tabLabel(tab as 'ALL' | ContactType)}
                    </button>
                ))}
            </div>

            {(activeTab === 'ALL' || activeTab === 'CUSTOMER' || activeTab === 'SUPPLIER') && (
                <div className={`grid gap-3 mb-6 ${activeTab === 'ALL' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    {(activeTab === 'ALL' || activeTab === 'CUSTOMER') && (
                        <div className="rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-black text-blue-500">{tr('المستحق من الزبائن', 'Due From Customers')}</div>
                                    <div className="mt-2 text-2xl font-black text-blue-700 dir-ltr">{customerDueTotal.toLocaleString()} {baseCurrency}</div>
                                </div>
                                <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                                    <Users size={20} />
                                </div>
                            </div>
                        </div>
                    )}
                    {(activeTab === 'ALL' || activeTab === 'SUPPLIER') && (
                        <div className="rounded-[2rem] border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-black text-orange-500">{tr('المستحق للموردين', 'Due To Suppliers')}</div>
                                    <div className="mt-2 text-2xl font-black text-orange-700 dir-ltr">{supplierDueTotal.toLocaleString()} {baseCurrency}</div>
                                </div>
                                <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                                    <Truck size={20} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="relative mb-6">
                <input
                    type="text"
                    placeholder={tr('ابحث بالاسم أو الهاتف...', 'Search by name or phone...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-4 pr-12 bg-white rounded-[1.8rem] border border-gray-100 shadow-sm outline-none font-bold text-sm"
                />
                <Search className="w-5 h-5 text-gray-300 absolute top-1/2 -translate-y-1/2 right-4 pointer-events-none" />
            </div>

            <div className="space-y-3">
                {visibleContacts.map(contact => {
                    const balance = calculateCurrentBalance(contact);
                    return (
                        <div key={contact.id} onClick={() => openContactStatement(contact.id)} onDoubleClick={() => openContactStatement(contact.id)} className="bg-white px-3 py-2.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer">
                            <div className="flex justify-between items-center mb-0 gap-2 min-w-0">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0 ${contact.type === 'CUSTOMER' ? 'bg-gradient-to-br from-blue-500 to-blue-600' : contact.type === 'SUPPLIER' ? 'bg-gradient-to-br from-orange-500 to-orange-600' : contact.type === 'PARTNER' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' : 'bg-gradient-to-br from-purple-500 to-purple-600'}`}>{displayContactName(contact).charAt(0)}</div>
                                    <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
                                        <h4 className="shrink-0 font-black text-gray-800 text-sm">{displayContactName(contact)}</h4>
                                        <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${contact.type === 'CUSTOMER' ? 'bg-blue-50 text-blue-600' : contact.type === 'SUPPLIER' ? 'bg-orange-50 text-orange-600' : contact.type === 'PARTNER' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>
                                            {typeBadgeLabel(contact.type)}
                                        </span>
                                        {(contact.type === 'CUSTOMER' || contact.type === 'SUPPLIER') && contact.preferredPriceTier && (
                                            <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-indigo-50 text-indigo-600">
                                                {contact.preferredPriceTier === 'WHOLESALE'
                                                    ? tr('جملة', 'Wholesale')
                                                    : tr('مفرق', 'Retail')}
                                            </span>
                                        )}
                                        {contact.phone && <span className="shrink-0 text-[10px] text-gray-400 font-bold flex items-center gap-1"><Phone size={10} /> {contact.phone}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`shrink-0 font-black text-sm dir-ltr ${balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {balance === 0 ? '0.00' : Math.abs(balance).toLocaleString()} {balanceStatus(balance, contact.type)}
                                    </span>
                                    <button onClick={(e) => handleEdit(e, contact)} className="p-1.5 bg-gray-50 rounded-lg text-blue-500 hover:bg-blue-50"><Edit2 size={14} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteContactId(contact.id); }} className="p-1.5 bg-gray-50 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {visibleContacts.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-[2.5rem] border border-dashed border-gray-100">
                        <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-bold text-sm">{tr('لا توجد أطراف مطابقة', 'No matching contacts found')}</p>
                        <button onClick={() => setShowAddForm(true)} className="mt-4 text-blue-600 font-black text-xs">{tr('إضافة جديد +', 'Add new +')}</button>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showAddForm && (
                <ContactEditorDialog
                    mode="DIRECTORY"
                    contact={editingContactId ? (contacts.find(c => c.id === editingContactId) || null) : null}
                    initialType={editingContactId
                        ? (contacts.find(c => c.id === editingContactId)?.type || 'CUSTOMER')
                        : (activeTab !== 'ALL' && activeTab !== 'EMPLOYEE' ? activeTab : 'CUSTOMER')
                    }
                    allowedTypes={['CUSTOMER', 'SUPPLIER', 'PARTNER']}
                    onClose={resetForm}
                    onSave={resetForm}
                />
            )}
            {false && showAddForm && (
                <ResponsiveDialog
                    open={showAddForm}
                    onClose={resetForm}
                    size="md"
                    zIndexClassName="z-[250]"
                    panelClassName="rounded-[2.5rem] p-8 shadow-2xl"
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-gray-800 text-lg">{editingContactId ? tr('تعديل الطرف', 'Edit Contact') : tr('إضافة طرف جديد', 'Add New Contact')}</h3>
                        <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                    </div>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="flex bg-gray-50 p-1 rounded-2xl mb-2">
                            <button type="button" onClick={() => setNewType('CUSTOMER')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${newType === 'CUSTOMER' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>{tr('عميل', 'Customer')}</button>
                            <button type="button" onClick={() => setNewType('SUPPLIER')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${newType === 'SUPPLIER' ? 'bg-white shadow text-orange-600' : 'text-gray-400'}`}>{tr('مورد', 'Supplier')}</button>
                            <button type="button" onClick={() => setNewType('PARTNER')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${newType === 'PARTNER' ? 'bg-white shadow text-emerald-600' : 'text-gray-400'}`}>{tr('شريك', 'Partner')}</button>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('اسم الطرف / الشخص', 'Contact Name')}</label>
                            <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none focus:ring-4 ring-blue-50 transition-all" placeholder={tr('الاسم...', 'Name...')} required />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('الهاتف (اختياري)', 'Phone (optional)')}</label>
                            <div className="relative">
                                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none text-right dir-ltr focus:ring-4 ring-blue-50 transition-all" placeholder="05xxxxxxxx" />
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('العنوان (اختياري)', 'Address (optional)')}</label>
                            <div className="relative">
                                <input value={newAddress} onChange={e => setNewAddress(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none focus:ring-4 ring-blue-50 transition-all" placeholder={tr('المدينة - الحي', 'City - District')} />
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                            </div>
                        </div>

                        {newType === 'PARTNER' && (
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('الحساب الجاري للشريك', 'Partner Current Account')}</label>
                                <div className="w-full p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-[11px] font-black text-emerald-800">
                                    {tr('يتم إنشاء حسابات الشريك تلقائياً. تُرحّل الحركة اليومية إلى الحساب الجاري للشريك، بينما تتم تسوية نهاية السنة بين الجاري ورأس المال.', 'Partner accounts are auto-created. Daily activity is posted to partner current, while year-end settlement is between current and capital.')}
                                </div>
                                {editingContactId && newLinkedAccountId && (
                                    <div className="mt-2 w-full p-3 bg-white rounded-2xl border border-gray-200 text-[11px] font-black text-gray-700">
                                        {tr('الحساب المرتبط الحالي:', 'Current linked account:')} {displayAccountName(accounts.find(a => a.id === newLinkedAccountId) || { id: newLinkedAccountId, name: newLinkedAccountId })}
                                    </div>
                                )}
                            </div>
                        )}

                        <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-[1.8rem] font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 mt-4">
                            <CheckCircle2 size={18} />
                            {editingContactId ? tr('حفظ التعديلات', 'Save Changes') : tr('إضافة إلى القائمة', 'Add to List')}
                        </button>
                    </form>
                </ResponsiveDialog>
            )}

            {selectedContactId && (
                <ResponsiveDialog
                    open={Boolean(selectedContactId)}
                    onClose={() => setSelectedContactId(null)}
                    variant="fullscreen"
                    zIndexClassName="z-[200]"
                    backdropClassName="bg-gray-900/95 backdrop-blur-md"
                    panelClassName="bg-white w-full h-full md:h-[90dvh] md:max-w-4xl md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
                    closeOnBackdrop={false}
                    showHandle={false}
                >
                    {(() => {
                        const contact = contacts.find(c => c.id === selectedContactId);
                        if (!contact) return null;
                        const { transactions: stmts, openingBalance, closingBalance } = getStatementData(contact, stmtStartDate, stmtEndDate);
                        return (
                            <div className="directory-statement-sheet h-full flex flex-col bg-white">
                                <div className="directory-statement-header directory-statement-header-modal bg-slate-50 p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center gap-3">
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-black text-gray-800 break-words">{displayContactName(contact)}</h2>
                                        <p className={`text-[9px] sm:text-[10px] font-bold text-gray-400 mt-1 ${isEnglish ? 'uppercase tracking-widest' : 'tracking-normal leading-relaxed'}`}>{tr('كشف حساب تفصيلي', 'Detailed Statement')}</p>
                                    </div>
                                    <div className="directory-statement-toolbar flex items-center gap-2 shrink-0">
                                        <DocumentActions
                                            title={`${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`}
                                            shareText={buildStatementShareText(contact, closingBalance)}
                                            smsText={buildStatementNotificationText(contact, closingBalance)}
                                            whatsappText={buildStatementNotificationText(contact, closingBalance)}
                                            notificationPhone={contact.phone}
                                            isEnglish={isEnglish}
                                            tr={tr}
                                            onPrint={() => printStatementSafe(contact)}
                                            onShare={() => shareStatementDocumentSafe(contact, closingBalance)}
                                            onSave={() => downloadStatementPdfSafe(contact)}
                                            onExcel={() => exportStatementExcelSafe(contact)}
                                            saveTitle={tr('تنزيل PDF', 'Download PDF')}
                                        />
                                        <button onClick={() => setSelectedContactId(null)} className="p-2.5 sm:p-3 bg-white border border-gray-300 rounded-xl hover:bg-gray-100"><X size={18} /></button>
                                    </div>
                                </div>

                                <div className="directory-statement-filters p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 bg-white border-b border-gray-100">
                                    <EnglishDateInput
                                        value={stmtStartDate}
                                        onChange={setStmtStartDate}
                                        wrapperClassName="min-w-0"
                                        className={`w-full min-w-0 bg-gray-50 border border-gray-200 py-2.5 pr-2.5 rounded-xl text-[11px] sm:text-xs font-bold ${isEnglish ? 'text-left' : 'text-right'} outline-none`}
                                        aria-label={tr('من تاريخ', 'From date')}
                                    />
                                    <EnglishDateInput
                                        value={stmtEndDate}
                                        onChange={setStmtEndDate}
                                        wrapperClassName="min-w-0"
                                        className={`w-full min-w-0 bg-gray-50 border border-gray-200 py-2.5 pr-2.5 rounded-xl text-[11px] sm:text-xs font-bold ${isEnglish ? 'text-left' : 'text-right'} outline-none`}
                                        aria-label={tr('إلى تاريخ', 'To date')}
                                    />
                                </div>

                                <div ref={statementContentRef} className="directory-statement-content flex-1 overflow-y-auto p-2.5 sm:p-4">
                                    {renderClassicContactStatement(contact, openingBalance, closingBalance, stmts, statementExportRef)}
                                </div>

                            </div>
                        );
                    })()}
                </ResponsiveDialog>
            )}

            {deleteContactId && (
                <ResponsiveDialog
                    open={Boolean(deleteContactId)}
                    onClose={() => setDeleteContactId(null)}
                    size="md"
                    zIndexClassName="z-[300]"
                    panelClassName="rounded-[2.5rem] p-8 shadow-2xl text-center"
                >
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-sm">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="font-black text-gray-800 text-lg mb-2">{tr('حذف الطرف نهائيًا؟', 'Delete contact permanently?')}</h3>
                    <p className="text-gray-500 text-xs font-bold mb-8 leading-relaxed">
                        {tr('هل أنت متأكد من حذف هذا الطرف؟ قد يؤثر ذلك على السجلات المالية المرتبطة.', 'Are you sure you want to delete this contact? This may affect linked financial records.')}
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setDeleteContactId(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all active:scale-95">
                            {tr('إلغاء', 'Cancel')}
                        </button>
                        <button onClick={confirmDelete} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95">
                            {tr('نعم، حذف', 'Yes, Delete')}
                        </button>
                    </div>
                </ResponsiveDialog>
            )}
        </div>
    );
};

export default Directory;




