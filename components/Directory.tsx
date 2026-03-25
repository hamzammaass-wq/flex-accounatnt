
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
import { buildElementPdfFile, downloadBlobFile, downloadWorkbookFile, sanitizeDownloadName, settleElementBeforeSnapshot } from '../utils/documentExport';
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

            const showSplitAmount = sub.amount !== entry.debit && sub.amount !== entry.credit;
            return [{
                id: `${entry.id || entry.voucherId || 'statement'}-payment-${index}`,
                label: isReceipt ? tr('تم القبض في', 'Received in') : tr('تم الصرف من', 'Paid from'),
                accountName: displayAccountName(account),
                amount: showSplitAmount ? Number(sub.amount) || 0 : null,
                currency: sub.currency || entry.currency || baseCurrency
            }];
        });

        return { invoice, checkRows, paymentRows };
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
            const statementCheckDetailsHtml = entryPreview.checkRows.length > 0
                ? `
                    <div class="statement-entry-detail statement-entry-detail--checks">
                        <div class="statement-entry-detail-title">${tr('تفاصيل الشيكات', 'Check details')}</div>
                        <table class="statement-detail-table statement-detail-table--checks">
                            <colgroup>
                                <col style="width:18%" />
                                <col style="width:28%" />
                                <col style="width:18%" />
                                <col style="width:16%" />
                                <col style="width:20%" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>${tr('رقم الشيك', 'Check #')}</th>
                                    <th>${tr('البنك', 'Bank')}</th>
                                    <th>${tr('الحساب', 'Account')}</th>
                                    <th>${tr('الاستحقاق', 'Due')}</th>
                                    <th>${tr('المبلغ', 'Amount')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${entryPreview.checkRows.map(checkRow => `
                                    <tr>
                                        <td>${escapeHtml(checkRow.checkNumber)}</td>
                                        <td>${escapeHtml(checkRow.bankName)}</td>
                                        <td>${escapeHtml(checkRow.accountNumber || '-')}</td>
                                        <td class="statement-number-cell">${escapeHtml(checkRow.dueDate)}</td>
                                        <td class="statement-number-cell">${escapeHtml(formatPrintAmount(checkRow.amount, checkRow.currency))}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${entryPreview.checkRows.some(checkRow => checkRow.imageUrls.length > 0)
                            ? `
                                <div class="statement-check-gallery">
                                    ${entryPreview.checkRows.map((checkRow, checkIndex) => checkRow.imageUrls.map((src, imageIndex) => `
                                        <div class="statement-check-image-frame">
                                            <img src="${escapeAttr(src)}" alt="${escapeAttr(`${tr('صورة الشيك', 'Check image')} ${checkIndex + 1}-${imageIndex + 1}`)}" class="statement-check-image" />
                                        </div>
                                    `).join('')).join('')}
                                </div>
                            `
                            : ''
                        }
                    </div>
                `
                : '';

            const statementPaymentDetailsHtml = entryPreview.paymentRows.length > 0
                ? `
                    <div class="statement-entry-detail statement-entry-detail--payments">
                        <div class="statement-entry-detail-title">${tr('تفاصيل السند', 'Voucher details')}</div>
                        <table class="statement-detail-table statement-detail-table--payments">
                            <colgroup>
                                <col style="width:28%" />
                                <col style="width:48%" />
                                <col style="width:24%" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>${tr('الحركة', 'Movement')}</th>
                                    <th>${tr('الحساب', 'Account')}</th>
                                    <th>${tr('المبلغ', 'Amount')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${entryPreview.paymentRows.map(paymentRow => `
                                    <tr>
                                        <td>${escapeHtml(paymentRow.label)}</td>
                                        <td>${escapeHtml(paymentRow.accountName)}</td>
                                        <td class="statement-number-cell">${paymentRow.amount === null ? '-' : escapeHtml(formatPrintAmount(paymentRow.amount, paymentRow.currency))}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `
                : '';

            const statementInvoiceDetailsHtml = entryPreview.invoice
                ? `
                    <div class="statement-entry-detail statement-entry-detail--invoice">
                        <div class="statement-entry-detail-title">${tr('تفاصيل الفاتورة', 'Invoice details')}</div>
                        <table class="statement-detail-table statement-detail-table--invoice">
                            <colgroup>
                                <col style="width:52%" />
                                <col style="width:12%" />
                                <col style="width:16%" />
                                <col style="width:20%" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>${tr('الصنف', 'Item')}</th>
                                    <th>${tr('الكمية', 'Qty')}</th>
                                    <th>${tr('السعر', 'Price')}</th>
                                    <th>${tr('الإجمالي', 'Total')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${entryPreview.invoice.items.map(item => {
                                    const product = products.find(p => p.id === item.productId);
                                    return `
                                        <tr>
                                            <td>${escapeHtml(item.description || displayProductName(product))}</td>
                                            <td class="statement-number-cell">${escapeHtml(formatPrintNumber(item.quantity))}</td>
                                            <td class="statement-number-cell">${escapeHtml(formatPrintAmount(item.unitPrice, entryPreview.invoice?.currency))}</td>
                                            <td class="statement-number-cell">${escapeHtml(formatPrintAmount(item.total, entryPreview.invoice?.currency))}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                        ${(printExpiryDate && entryPreview.invoice.dueDate)
                            ? `<div class="statement-entry-detail-footer"><strong>${tr('تاريخ الاستحقاق', 'Expiry Date')}:</strong> <span class="statement-number-cell">${escapeHtml(formatDate(entryPreview.invoice.dueDate) || '-')}</span></div>`
                            : ''
                        }
                    </div>
                `
                : '';

            return `
                <tr>
                    <td class="statement-main-date statement-number-cell">${escapeHtml(formatDate(t.date) || '-')}</td>
                    ${!hideVoucherColumnInStatement ? `<td class="statement-main-voucher statement-number-cell">${escapeHtml(t.voucherId || '-')}</td>` : ''}
                    <td class="statement-main-description">
                        <div class="statement-main-description-text">${escapeHtml(t.description || '-')}</div>
                        ${statementPaymentDetailsHtml}
                        ${statementCheckDetailsHtml}
                        ${statementInvoiceDetailsHtml}
                    </td>
                    <td class="statement-main-amount statement-number-cell">${t.debit > 0 ? escapeHtml(formatPrintAmount(t.debit, t.currency)) : '-'}</td>
                    <td class="statement-main-amount statement-number-cell">${t.credit > 0 ? escapeHtml(formatPrintAmount(t.credit, t.currency)) : '-'}</td>
                    <td class="statement-main-balance statement-number-cell">${escapeHtml(formatPrintAmount(t.runningBalance, t.currency))}</td>
                </tr>
            `;
        }).join('');

        const statementTitle = `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`;
        const statementPeriodText = `${tr('الفترة', 'Period')}: ${stmtStartDate || tr('بداية النشاط', 'Start of activity')} - ${stmtEndDate || tr('الآن', 'Now')}`;
        const basePadding = 30 + (Math.max(0, headerTopLines) * 20);
        const shareSummary = `${statementTitle}\n${statementPeriodText}\n${tr('الرصيد الختامي', 'Closing Balance')}: ${formatPrintAmount(closingBalance, baseCurrency)}`;

        return `<!DOCTYPE html>
<html dir="${isEnglish ? 'ltr' : 'rtl'}" lang="${isEnglish ? 'en' : 'ar'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(statementTitle)}</title>
  <style>
    :root { --statement-body-pad: ${basePadding}px; }
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=block');
    * { box-sizing: border-box; }
    body {
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      margin: 0;
      padding: var(--statement-body-pad);
      background: #f8fafc;
      color: #111827;
      line-height: 1.5;
      letter-spacing: 0;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    table, th, td, h1, p, div, span, strong {
      letter-spacing: 0 !important;
    }
    .statement-actions {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(248, 250, 252, 0.95);
      backdrop-filter: blur(6px);
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 10px;
      margin-bottom: 12px;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .statement-actions button {
      border: 1px solid #d1d5db;
      background: #fff;
      color: #111827;
      padding: 8px 12px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      min-width: 92px;
    }
    .statement-actions button:hover {
      background: #f3f4f6;
    }
    .statement-sheet {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 14px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
    }
    .statement-title {
      margin: 0 0 10px;
      font-size: 32px;
      line-height: 1.25;
      word-break: break-word;
    }
    .statement-sub {
      margin: 0 0 8px;
      color: #4b5563;
      font-size: 16px;
      font-weight: 600;
    }
    .statement-table-wrap {
      width: 100%;
      overflow-x: hidden;
      margin-top: 10px;
    }
    .statement-number-cell {
      direction: ltr;
      unicode-bidi: embed;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .statement-main-table {
      table-layout: fixed;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .statement-main-table th,
    .statement-main-table td {
      font-size: 11px;
      line-height: 1.5;
      padding: 7px 6px;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: top;
    }
    .statement-main-table thead th {
      background: #eef2ff;
      color: #1e293b;
      font-size: 11px;
      font-weight: 800;
    }
    .statement-main-date,
    .statement-main-voucher,
    .statement-main-amount,
    .statement-main-balance {
      text-align: center;
      font-size: 10px;
      line-height: 1.35;
      white-space: nowrap;
      overflow-wrap: normal;
      word-break: normal;
    }
    .statement-main-date {
      padding-left: 4px;
      padding-right: 4px;
    }
    .statement-main-description {
      text-align: ${isEnglish ? 'left' : 'right'};
    }
    .statement-main-description-text {
      font-weight: 800;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.6;
    }
    .statement-main-balance {
      background: #f8fafc;
      font-weight: 800;
    }
    .statement-entry-detail {
      margin-top: 8px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      background: #ffffff;
    }
    .statement-entry-detail-title {
      padding: 7px 10px;
      font-size: 10px;
      font-weight: 800;
      color: #334155;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .statement-entry-detail--checks .statement-entry-detail-title {
      background: #fff7ed;
      color: #9a3412;
      border-bottom-color: #fed7aa;
    }
    .statement-entry-detail--payments .statement-entry-detail-title {
      background: #f8fafc;
      color: #334155;
    }
    .statement-entry-detail--invoice .statement-entry-detail-title {
      background: #eff6ff;
      color: #1d4ed8;
      border-bottom-color: #bfdbfe;
    }
    .statement-detail-table {
      width: 100%;
      min-width: 0;
      table-layout: fixed;
      border-collapse: collapse;
    }
    .statement-detail-table th,
    .statement-detail-table td {
      border: 1px solid #e2e8f0;
      padding: 4px 5px;
      font-size: 9px;
      line-height: 1.35;
      text-align: ${isEnglish ? 'left' : 'right'};
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .statement-detail-table thead th {
      background: #f8fafc;
      color: #475569;
      font-weight: 800;
    }
    .statement-entry-detail--checks .statement-detail-table thead th {
      background: #fff7ed;
      color: #9a3412;
    }
    .statement-entry-detail--invoice .statement-detail-table thead th {
      background: #eff6ff;
      color: #1d4ed8;
    }
    .statement-detail-table th:not(:first-child),
    .statement-detail-table td:not(:first-child) {
      text-align: center;
    }
    .statement-entry-detail-footer {
      padding: 7px 10px;
      font-size: 10px;
      color: #475569;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
    .statement-check-gallery {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 10px 10px;
      background: #fff;
      border-top: 1px solid #fed7aa;
    }
    .statement-check-image-frame {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 4px;
      background: #fff;
    }
    .statement-check-image {
      display: block;
      width: 132px;
      max-width: 28vw;
      height: 82px;
      object-fit: cover;
      border-radius: 7px;
    }
    .statement-closing-summary {
      width: 100%;
      margin-top: 12px;
      text-align: left;
    }
    .statement-closing-summary-label {
      display: block;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 800;
      line-height: 1.4;
    }
    .statement-closing-summary-value {
      display: inline-block;
      margin-top: 2px;
      color: #e11d48;
      font-size: 18px;
      font-weight: 900;
      line-height: 1.2;
    }
    table {
      width: 100%;
      min-width: 680px;
      border-collapse: collapse;
      background: #fff;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: center;
      vertical-align: top;
      font-size: 13px;
      line-height: 1.45;
    }
    th { background: #f8fafc; }
    @media (max-width: 640px) {
      body { padding: 10px; }
      .statement-actions { margin-bottom: 8px; }
      .statement-actions button {
        flex: 1 1 30%;
        min-width: 0;
        padding: 10px 8px;
        font-size: 12px;
      }
      .statement-sheet { border-radius: 12px; padding: 10px; }
      .statement-title { font-size: 24px; }
      .statement-sub { font-size: 14px; }
      .statement-main-table th,
      .statement-main-table td {
        font-size: 10px;
        padding: 6px 4px;
      }
      .statement-main-date,
      .statement-main-voucher,
      .statement-main-amount,
      .statement-main-balance {
        font-size: 9px;
      }
      .statement-main-description-text {
        font-size: 10px;
      }
      .statement-detail-table th,
      .statement-detail-table td {
        font-size: 8px;
        padding: 4px;
      }
      .statement-closing-summary-label {
        font-size: 9px;
      }
      .statement-closing-summary-value {
        font-size: 16px;
      }
      .statement-check-image {
        width: 108px;
        max-width: 24vw;
        height: 68px;
      }
    }
    @media print {
      body {
        background: #fff;
        padding: var(--statement-body-pad);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .statement-actions { display: none !important; }
      .statement-sheet {
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }
      .statement-table-wrap { overflow: visible; }
      table { min-width: 0; }
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
  <div class="statement-sheet">
    <h1 class="statement-title">${tr('كشف حساب', 'Statement')}: ${escapeHtml(displayContactName(contact))}</h1>
    <p class="statement-sub">${escapeHtml(statementPeriodText)}</p>
    ${printPersonalData ? `<p class="statement-sub">${tr('الهاتف', 'Phone')}: ${escapeHtml(contact.phone || '-')} ${contact.address ? `| ${tr('العنوان', 'Address')}: ${escapeHtml(contact.address)}` : ''}</p>` : ''}
    <div class="statement-table-wrap">
      <table class="statement-main-table">
        <colgroup>
          <col style="width:${hideVoucherColumnInStatement ? '14%' : '12%'}" />
          ${!hideVoucherColumnInStatement ? '<col style="width:10%" />' : ''}
          <col style="width:${hideVoucherColumnInStatement ? '47%' : '40%'}" />
          <col style="width:${hideVoucherColumnInStatement ? '10%' : '10%'}" />
          <col style="width:${hideVoucherColumnInStatement ? '10%' : '10%'}" />
          <col style="width:${hideVoucherColumnInStatement ? '19%' : '18%'}" />
        </colgroup>
        <thead>
          <tr>
            <th>${tr('التاريخ', 'Date')}</th>
            ${!hideVoucherColumnInStatement ? `<th>${tr('السند', 'Voucher')}</th>` : ''}
            <th>${tr('البيان', 'Description')}</th>
            <th>${debitLabel}</th>
            <th>${creditLabel}</th>
            <th>${tr('الرصيد', 'Balance')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="statement-main-date statement-number-cell">-</td>
            ${!hideVoucherColumnInStatement ? '<td class="statement-main-voucher statement-number-cell">-</td>' : ''}
            <td class="statement-main-description"><div class="statement-main-description-text">${tr('الرصيد الافتتاحي', 'Opening balance')}</div></td>
            <td class="statement-main-amount statement-number-cell">-</td>
            <td class="statement-main-amount statement-number-cell">-</td>
            <td class="statement-main-balance statement-number-cell">${formatPrintAmount(openingBalance, baseCurrency)}</td>
          </tr>
          ${rows}
        </tbody>
      </table>
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
        return buildElementPdfFile(statementExportRef.current, {
            title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
            fileName: buildStatementPdfName(contact),
            dir: isEnglish ? 'ltr' : 'rtl',
            lang: isEnglish ? 'en' : 'ar',
            orientation: 'landscape',
            minRenderWidth: 980,
            maxRenderWidth: 1220,
            canvasScale: 2.0,
            padding: 18,
            backgroundColor: '#ffffff'
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
                ...(!hideVoucherColumnInStatement ? [entry.voucherId || '-'] : []),
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
        const targetWindow = printWindow || window.open('', '_blank');
        if (!targetWindow) {
            alert(tr('تعذر فتح نافذة كشف الحساب.', 'Could not open statement window.'));
            return;
        }
        const html = buildStatementPrintHtml(contact, printCheckImagesInStatement, true);
        targetWindow.document.open();
        targetWindow.document.write(html);
        targetWindow.document.close();
        targetWindow.focus();
    };

    const printStatementSafe = async (contact: Contact, printWindow?: Window | null) => {
        try {
            await handlePrintStatement(contact, printWindow);
        } catch {
            if (printWindow && !printWindow.closed) {
                printWindow.document.open();
                printWindow.document.write(`<!doctype html><html><head><title>${tr('تعذر تجهيز الطباعة', 'Print unavailable')}</title></head><body style="font-family:Arial,sans-serif;padding:24px;">${tr('تعذر تجهيز كشف الحساب للطباعة الآن.', 'Could not prepare the statement for printing right now.')}</body></html>`);
                printWindow.document.close();
                printWindow.focus();
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
                    ...(!hideVoucherColumnInStatement ? [entry.voucherId || '-'] : []),
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
                            <div ref={statementExportRef} className="h-full flex flex-col bg-white">
                                <div className="bg-slate-50 p-6 border-b border-gray-200 flex justify-between items-center gap-3">
                                    <div>
                                        <h2 className="text-xl font-black text-gray-800">{displayContactName(contact)}</h2>
                                        <p className={`text-[10px] font-bold text-gray-400 mt-1 ${isEnglish ? 'uppercase tracking-widest' : 'tracking-normal leading-relaxed'}`}>{tr('كشف حساب تفصيلي', 'Detailed Statement')}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <DocumentActions
                                            title={`${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`}
                                            shareText={buildStatementShareText(contact, closingBalance)}
                                            smsText={buildStatementNotificationText(contact, closingBalance)}
                                            whatsappText={buildStatementNotificationText(contact, closingBalance)}
                                            notificationPhone={contact.phone}
                                            isEnglish={isEnglish}
                                            tr={tr}
                                            onPrint={() => {
                                                const printWindow = window.open('', '_blank');
                                                if (!printWindow) {
                                                    alert(tr('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
                                                    return;
                                                }
                                                void printStatementSafe(contact, printWindow);
                                            }}
                                            onShare={() => shareStatementDocumentSafe(contact, closingBalance)}
                                            onSave={() => downloadStatementPdfSafe(contact)}
                                            onExcel={() => exportStatementExcelSafe(contact)}
                                            saveTitle={tr('تنزيل PDF', 'Download PDF')}
                                        />
                                        <button onClick={() => setSelectedContactId(null)} className="p-3 bg-white border border-gray-300 rounded-xl hover:bg-gray-100"><X size={18} /></button>
                                    </div>
                                </div>

                                <div className="p-3 sm:p-4 grid grid-cols-2 gap-2 sm:gap-3 bg-white border-b border-gray-100">
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

                                <div ref={statementContentRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
                                    <table className="w-full min-w-0 max-w-full text-sm border-collapse table-fixed" dir={isEnglish ? 'ltr' : 'rtl'}>
                                        <colgroup>
                                            <col style={{ width: '17%' }} />
                                            <col style={{ width: '42%' }} />
                                            <col style={{ width: '11%' }} />
                                            <col style={{ width: '11%' }} />
                                            <col style={{ width: '19%' }} />
                                        </colgroup>
                                        <thead className="bg-slate-800 text-white rounded-t-xl">
                                            <tr>
                                                <th className={`px-1.5 sm:px-2 py-3 whitespace-nowrap ${isEnglish ? 'text-left uppercase tracking-wider' : 'text-right tracking-normal leading-relaxed'} first:rounded-tr-xl text-[9px] sm:text-[10px] font-black`}>{tr('التاريخ', 'Date')}</th>
                                                <th className={`px-3 py-3 ${isEnglish ? 'text-left uppercase tracking-wider' : 'text-right tracking-normal leading-relaxed'} text-[10px] sm:text-[10px] font-black`}>{tr('البيان', 'Description')}</th>
                                                <th className={`px-2 py-3 text-center text-[10px] sm:text-[10px] font-black bg-white/10 ${isEnglish ? 'uppercase tracking-wider' : 'tracking-normal leading-relaxed'}`}>{tr('مدين', 'Debit')}</th>
                                                <th className={`px-2 py-3 text-center text-[10px] sm:text-[10px] font-black bg-white/10 ${isEnglish ? 'uppercase tracking-wider' : 'tracking-normal leading-relaxed'}`}>{tr('دائن', 'Credit')}</th>
                                                <th className={`px-2 py-3 text-center last:rounded-tl-xl text-[10px] sm:text-[10px] font-black ${isEnglish ? 'uppercase tracking-wider' : 'tracking-normal leading-relaxed'}`}>{tr('الرصيد', 'Balance')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            <tr className="bg-amber-50/50 font-bold">
                                                <td className="px-1.5 sm:px-2 py-3 text-center text-[9px] sm:text-[10px] dir-ltr whitespace-nowrap">-</td>
                                                <td className="px-3 py-3 text-[11px] sm:text-[10px] leading-6" dir={isEnglish ? 'ltr' : 'rtl'}>{tr('الرصيد الافتتاحي', 'Opening balance')}</td>
                                                <td className="px-2 py-3 text-center text-[10px] sm:text-[10px] dir-ltr">-</td>
                                                <td className="px-2 py-3 text-center text-[10px] sm:text-[10px] dir-ltr">-</td>
                                                <td className="px-2 py-3 text-center font-black text-[10px] sm:text-[10px] dir-ltr">{openingBalance.toLocaleString()}</td>
                                            </tr>
                                            {stmts.map(t => {
                                                const entryPreview = buildStatementEntryPreview(t, contact, { includeCheckImages: printCheckImagesInStatement });
                                                const invoiceRows = entryPreview.invoice?.items || [];

                                                return (
                                                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-1.5 sm:px-2 py-3 text-[9px] sm:text-[10px] font-bold text-gray-500 whitespace-nowrap align-top dir-ltr">{formatDate(t.date) || '-'}</td>
                                                        <td className="px-3 py-3 text-[11px] sm:text-[10px] font-bold text-gray-700 align-top" dir={isEnglish ? 'ltr' : 'rtl'}>
                                                            <div className="break-words leading-6">{t.description}</div>

                                                            {entryPreview.paymentRows.length > 0 && (
                                                                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
                                                                    <div className={`px-2.5 py-1.5 text-[10px] font-black text-slate-700 ${isEnglish ? 'uppercase tracking-[0.18em]' : 'tracking-normal leading-relaxed'}`}>{tr('تفاصيل السند', 'Voucher details')}</div>
                                                                    <table className="w-full table-fixed border-collapse text-[9px]">
                                                                        <colgroup>
                                                                            <col style={{ width: '28%' }} />
                                                                            <col style={{ width: '48%' }} />
                                                                            <col style={{ width: '24%' }} />
                                                                        </colgroup>
                                                                        <thead className="bg-slate-100 text-slate-600">
                                                                            <tr>
                                                                                <th className={`border border-slate-200 px-2 py-1.5 font-black ${isEnglish ? 'text-left uppercase tracking-[0.16em]' : 'text-right tracking-normal leading-relaxed'}`}>{tr('الحركة', 'Movement')}</th>
                                                                                <th className={`border border-slate-200 px-2 py-1.5 font-black ${isEnglish ? 'text-left uppercase tracking-[0.16em]' : 'text-right tracking-normal leading-relaxed'}`}>{tr('الحساب', 'Account')}</th>
                                                                                <th className={`border border-slate-200 px-2 py-1.5 text-center font-black ${isEnglish ? 'uppercase tracking-[0.16em]' : 'tracking-normal leading-relaxed'}`}>{tr('المبلغ', 'Amount')}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="text-slate-600">
                                                                            {entryPreview.paymentRows.map(paymentRow => (
                                                                                <tr key={paymentRow.id}>
                                                                                    <td className={`border border-slate-200 px-2 py-1.5 align-top ${isEnglish ? 'text-left' : 'text-right'}`}>{paymentRow.label}</td>
                                                                                    <td className={`border border-slate-200 px-2 py-1.5 align-top ${isEnglish ? 'text-left' : 'text-right'}`}>{paymentRow.accountName}</td>
                                                                                    <td className="border border-slate-200 px-2 py-1.5 text-center dir-ltr font-semibold">{paymentRow.amount === null ? '-' : paymentRow.amount.toLocaleString()}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}

                                                            {entryPreview.checkRows.length > 0 && (
                                                                <div className="mt-2 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
                                                                    <div className={`px-2.5 py-1.5 text-[10px] font-black text-amber-700 ${isEnglish ? 'uppercase tracking-[0.18em]' : 'tracking-normal leading-relaxed'}`}>{tr('تفاصيل الشيكات', 'Check details')}</div>
                                                                    <table className="w-full table-fixed border-collapse text-[9px]">
                                                                        <colgroup>
                                                                            <col style={{ width: '18%' }} />
                                                                            <col style={{ width: '28%' }} />
                                                                            <col style={{ width: '18%' }} />
                                                                            <col style={{ width: '16%' }} />
                                                                            <col style={{ width: '20%' }} />
                                                                        </colgroup>
                                                                        <thead className="bg-amber-100/70 text-amber-800">
                                                                            <tr>
                                                                                <th className={`border border-amber-200 px-2 py-1.5 font-black ${isEnglish ? 'text-left uppercase tracking-[0.16em]' : 'text-right tracking-normal leading-relaxed'}`}>{tr('رقم الشيك', 'Check #')}</th>
                                                                                <th className={`border border-amber-200 px-2 py-1.5 font-black ${isEnglish ? 'text-left uppercase tracking-[0.16em]' : 'text-right tracking-normal leading-relaxed'}`}>{tr('البنك', 'Bank')}</th>
                                                                                <th className={`border border-amber-200 px-2 py-1.5 font-black ${isEnglish ? 'text-left uppercase tracking-[0.16em]' : 'text-right tracking-normal leading-relaxed'}`}>{tr('الحساب', 'Account')}</th>
                                                                                <th className={`border border-amber-200 px-2 py-1.5 text-center font-black ${isEnglish ? 'uppercase tracking-[0.16em]' : 'tracking-normal leading-relaxed'}`}>{tr('الاستحقاق', 'Due')}</th>
                                                                                <th className={`border border-amber-200 px-2 py-1.5 text-center font-black ${isEnglish ? 'uppercase tracking-[0.16em]' : 'tracking-normal leading-relaxed'}`}>{tr('المبلغ', 'Amount')}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="text-amber-900/80">
                                                                            {entryPreview.checkRows.map(checkRow => (
                                                                                <React.Fragment key={checkRow.id}>
                                                                                    <tr>
                                                                                        <td className={`border border-amber-200 px-2 py-1.5 align-top ${isEnglish ? 'text-left' : 'text-right'}`}>{checkRow.checkNumber}</td>
                                                                                        <td className={`border border-amber-200 px-2 py-1.5 align-top ${isEnglish ? 'text-left' : 'text-right'}`}>{checkRow.bankName}</td>
                                                                                        <td className={`border border-amber-200 px-2 py-1.5 align-top ${isEnglish ? 'text-left' : 'text-right'}`}>{checkRow.accountNumber || '-'}</td>
                                                                                        <td className="border border-amber-200 px-2 py-1.5 text-center dir-ltr">{checkRow.dueDate}</td>
                                                                                        <td className="border border-amber-200 px-2 py-1.5 text-center dir-ltr font-semibold">{checkRow.amount.toLocaleString()}</td>
                                                                                    </tr>
                                                                                    {checkRow.imageUrls.length > 0 && (
                                                                                        <tr>
                                                                                            <td colSpan={5} className="border border-amber-200 px-2 py-2">
                                                                                                <div className="flex flex-wrap gap-2">
                                                                                                    {checkRow.imageUrls.map((src, imageIndex) => (
                                                                                                        <div key={`${checkRow.id}-image-${imageIndex}`} className="rounded-lg border border-amber-200 bg-white p-1">
                                                                                                            <img src={src} alt={`${tr('صورة الشيك', 'Check image')} ${imageIndex + 1}`} className="h-20 w-28 sm:w-32 rounded-md object-cover" />
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}

                                                            {entryPreview.invoice && (
                                                                <div className="mt-2 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/60">
                                                                    <div className={`px-2.5 py-1.5 text-[10px] font-black text-blue-700 ${isEnglish ? 'uppercase tracking-[0.18em]' : 'tracking-normal leading-relaxed'}`}>{tr('تفاصيل الفاتورة', 'Invoice details')}</div>
                                                                    <table className="w-full table-fixed border-collapse text-[9px]">
                                                                        <colgroup>
                                                                            <col style={{ width: '52%' }} />
                                                                            <col style={{ width: '12%' }} />
                                                                            <col style={{ width: '16%' }} />
                                                                            <col style={{ width: '20%' }} />
                                                                        </colgroup>
                                                                        <thead className="bg-blue-100/70 text-blue-800">
                                                                            <tr>
                                                                                <th className={`border border-blue-200 px-2 py-1.5 font-black ${isEnglish ? 'text-left uppercase tracking-[0.16em]' : 'text-right tracking-normal leading-relaxed'}`}>{tr('الصنف', 'Item')}</th>
                                                                                <th className={`border border-blue-200 px-2 py-1.5 text-center font-black ${isEnglish ? 'uppercase tracking-[0.16em]' : 'tracking-normal leading-relaxed'}`}>{tr('الكمية', 'Qty')}</th>
                                                                                <th className={`border border-blue-200 px-2 py-1.5 text-center font-black ${isEnglish ? 'uppercase tracking-[0.16em]' : 'tracking-normal leading-relaxed'}`}>{tr('السعر', 'Price')}</th>
                                                                                <th className={`border border-blue-200 px-2 py-1.5 text-center font-black ${isEnglish ? 'uppercase tracking-[0.16em]' : 'tracking-normal leading-relaxed'}`}>{tr('الإجمالي', 'Total')}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="text-slate-700">
                                                                            {invoiceRows.map((item, idx) => {
                                                                                const product = products.find(p => p.id === item.productId);
                                                                                return (
                                                                                    <tr key={item.id || `${t.id}-invoice-item-${idx}`}>
                                                                                        <td className={`border border-blue-200 px-2 py-1.5 align-top ${isEnglish ? 'text-left' : 'text-right'}`}>{item.description || displayProductName(product)}</td>
                                                                                        <td className="border border-blue-200 px-2 py-1.5 text-center dir-ltr">{item.quantity.toLocaleString()}</td>
                                                                                        <td className="border border-blue-200 px-2 py-1.5 text-center dir-ltr">{item.unitPrice.toLocaleString()}</td>
                                                                                        <td className="border border-blue-200 px-2 py-1.5 text-center dir-ltr font-semibold">{item.total.toLocaleString()}</td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                    {printExpiryDate && entryPreview.invoice.dueDate && (
                                                                        <div className={`border-t border-blue-200 bg-white/70 px-2.5 py-1.5 text-[10px] text-slate-600 ${isEnglish ? 'text-left' : 'text-right'}`}>
                                                                            <span className="font-black">{tr('تاريخ الاستحقاق', 'Expiry Date')}:</span>{' '}
                                                                            <span className="dir-ltr">{formatDate(entryPreview.invoice.dueDate)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-3 text-center text-[10px] sm:text-[10px] text-emerald-600 font-bold dir-ltr bg-emerald-50/30 align-top">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                                        <td className="px-2 py-3 text-center text-[10px] sm:text-[10px] text-rose-600 font-bold dir-ltr bg-rose-50/30 align-top">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-[10px] sm:text-[10px] dir-ltr align-top">{t.runningBalance.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col items-stretch gap-3">
                                    <div data-document-actions className="flex items-center gap-2 flex-wrap">
                                        <label className="inline-flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-xl text-[11px] font-bold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={printCheckImagesInStatement}
                                                onChange={(e) => setPrintCheckImagesInStatement(e.target.checked)}
                                                className="accent-blue-600"
                                            />
                                            <span>{tr('طباعة صور الشيكات مع الكشف', 'Print check images with statement')}</span>
                                        </label>
                                    </div>
                                    <div className="w-full text-left">
                                        <span className={`text-[10px] font-black text-gray-400 block ${isEnglish ? 'uppercase tracking-widest' : 'tracking-normal leading-relaxed'}`}>{tr('الرصيد الختامي', 'Closing Balance')}</span>
                                        <span className={`text-xl font-black dir-ltr ${closingBalance > 0 ? 'text-rose-600' : closingBalance < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{closingBalance.toLocaleString()}</span>
                                    </div>
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




