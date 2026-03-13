
import React, { useState, useMemo, useRef } from 'react';
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
import { buildElementPdfFile, downloadBlobFile, downloadTextFile, exportElementAsCsv } from '../utils/documentExport';

const Directory: React.FC = () => {
    const { contacts, addContact, updateContact, deleteContact, transactions, invoices, baseCurrency, companySettings, products, accounts, checks } = useAccounting();

    const [activeTab, setActiveTab] = useState<ContactType | 'ALL'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
    const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);
    const [deleteContactId, setDeleteContactId] = useState<string | null>(null);

    const [stmtStartDate, setStmtStartDate] = useState('');
    const [stmtEndDate, setStmtEndDate] = useState('');
    const [printCheckImagesInStatement, setPrintCheckImagesInStatement] = useState(false);

    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newType, setNewType] = useState<ContactType>('CUSTOMER');
    const [newLinkedAccountId, setNewLinkedAccountId] = useState('');
    const statementExportRef = useRef<HTMLDivElement | null>(null);
    const statementContentRef = useRef<HTMLDivElement | null>(null);
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

    const buildStatementPrintHtml = (contact: Contact, includeCheckImages = false): string => {
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
            const invoice = t.invoiceId ? invoices.find(inv => inv.id === t.invoiceId) : null;
            let detailsHtml = '';
            let paymentDetailsHtml = '';

            if (t.subTransactions && t.subTransactions.length > 0) {
                const details = t.subTransactions.map((sub: any) => {
                    const relatedCheck = sub.checkId ? checks.find(c => c.id === sub.checkId) : null;
                    if (relatedCheck) {
                        const checkImages = includeCheckImages ? getCheckImageUrls(relatedCheck) : [];
                        const checkImagesHtml = checkImages.length > 0
                            ? `
                            <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px;">
                                ${checkImages.map((src, idx) => `
                                    <div style="border:1px solid #d9d9d9; border-radius:6px; padding:3px; background:#fff;">
                                        <img src="${escapeAttr(src)}" alt="${tr('صورة الشيك', 'Check image')} ${idx + 1}" style="display:block; width:170px; max-width:42vw; height:104px; object-fit:cover; border-radius:4px;" />
                                    </div>
                                `).join('')}
                            </div>`
                            : '';
                        return `
                        <div style="margin-top: 5px; font-size: 10px; color: #444; background: #f0f0f0; padding: 4px; border-radius: 4px; display: inline-block; width: 100%;">
                            <strong>${tr('شيك:', 'Check:')}</strong> ${relatedCheck.checkNumber} | <strong>${displayAccountName(relatedCheck.bankAccountId ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null : { id: '', name: relatedCheck.bankName })}</strong> | ${formatDate(relatedCheck.dueDate)} | <strong>${formatPrintAmount(relatedCheck.amount, relatedCheck.currency)}</strong>
                            ${checkImagesHtml}
                        </div>`;
                    }

                    const { contraAccountId, isReceipt } = getPaymentLineMeta(sub, contact);
                    const account = accounts.find(a => a.id === contraAccountId);
                    if (account && !invoice) {
                        const label = isReceipt ? tr('تم القبض في:', 'Received in:') : tr('تم الصرف من:', 'Paid from:');
                        const amountStr = sub.amount !== t.debit && sub.amount !== t.credit ? ` (${formatPrintAmount(sub.amount, t.currency)})` : '';
                        return `<div style="margin-top: 5px; font-size: 10px; color: #555;"><strong>${label}</strong> ${displayAccountName(account)}${amountStr}</div>`;
                    }
                    return '';
                }).join('');
                paymentDetailsHtml = details;
            }

            if (invoice) {
                const itemsRows = invoice.items.map(item => {
                    const product = products.find(p => p.id === item.productId);
                    return `
                        <tr>
                            <td style="padding: 2px 4px; border-bottom: 1px solid #eee;">${item.description || displayProductName(product)}</td>
                            <td style="padding: 2px 4px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                            <td style="padding: 2px 4px; border-bottom: 1px solid #eee; text-align: center;">${formatPrintAmount(item.unitPrice, invoice.currency)}</td>
                            <td style="padding: 2px 4px; border-bottom: 1px solid #eee; text-align: center;">${formatPrintAmount(item.total, invoice.currency)}</td>
                        </tr>
                    `;
                }).join('');

                detailsHtml = `
                    <div style="margin-top: 8px; border-top: 1px dashed #ddd; padding-top: 4px;">
                        <table style="width: 100%; font-size: 9px; color: #555;">
                            <thead>
                                <tr style="background: #f9f9f9;">
                                    <th style="text-align: right; padding: 2px;">${tr('الصنف', 'Item')}</th>
                                    <th style="padding: 2px;">${tr('الكمية', 'Qty')}</th>
                                    <th style="padding: 2px;">${tr('السعر', 'Price')}</th>
                                    <th style="padding: 2px;">${tr('الإجمالي', 'Total')}</th>
                                </tr>
                            </thead>
                            <tbody>${itemsRows}</tbody>
                        </table>
                        ${(printExpiryDate && invoice.dueDate) ? `<div style="font-size:10px; color:#777; margin-top:4px;"><strong>${tr('تاريخ الاستحقاق', 'Expiry Date')}:</strong> ${formatDate(invoice.dueDate)}</div>` : ''}
                    </div>
                `;
            }

            return `
            <tr>
                <td style="text-align: center; vertical-align: top;">${formatDate(t.date)}</td>
                ${!hideVoucherColumnInStatement ? `<td style="text-align: center; vertical-align: top;">${t.voucherId || '-'}</td>` : ''}
                <td style="padding: 10px; vertical-align: top;">
                    <div style="font-weight: bold;">${t.description}</div>
                    ${paymentDetailsHtml}
                    ${detailsHtml}
                </td>
                <td style="text-align:center; vertical-align: top;">${t.debit > 0 ? formatPrintAmount(t.debit, t.currency) : '-'}</td>
                <td style="text-align:center; vertical-align: top;">${t.credit > 0 ? formatPrintAmount(t.credit, t.currency) : '-'}</td>
                <td style="text-align:center; vertical-align: top; background:#f9f9f9;">${formatPrintAmount(t.runningBalance, t.currency)}</td>
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
    * { box-sizing: border-box; }
    body {
      font-family: 'Tajawal', sans-serif;
      margin: 0;
      padding: var(--statement-body-pad);
      background: #f8fafc;
      color: #111827;
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
      overflow-x: auto;
      margin-top: 10px;
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
      <table>
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
            <td>-</td>
            ${!hideVoucherColumnInStatement ? '<td>-</td>' : ''}
            <td>${tr('الرصيد الافتتاحي', 'Opening balance')}</td>
            <td>-</td>
            <td>-</td>
            <td>${formatPrintAmount(openingBalance, baseCurrency)}</td>
          </tr>
          ${rows}
        </tbody>
      </table>
    </div>
    ${statementFooterNote ? `<p style="margin-top:10px; color:#555;">${statementFooterNote}</p>` : ''}
    ${(companySettings.showAccountBalanceUnderVoucher ?? false) ? `<p style="margin-top:8px; font-weight:700;">${tr('الرصيد الختامي', 'Closing Balance')}: ${formatPrintAmount(closingBalance, baseCurrency)}</p>` : ''}
  </div>
  <script>
    (() => {
      const closeBtn = document.getElementById('statement-close-btn');
      const printBtn = document.getElementById('statement-print-btn');
      const shareBtn = document.getElementById('statement-share-btn');
      const actions = document.getElementById('statement-actions');
      const shareSummary = actions?.getAttribute('data-share-summary') || document.title;
      const copySuccess = actions?.getAttribute('data-copy-success') || 'Copied';
      const shareFailed = actions?.getAttribute('data-share-failed') || 'Share failed';

      closeBtn?.addEventListener('click', () => {
        window.close();
        if (!window.closed) {
          if (window.history.length > 1) window.history.back();
          else window.location.replace('about:blank');
        }
      });

      printBtn?.addEventListener('click', () => window.print());

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
        window.print();
      });
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

    const buildStatementPdfName = (contact: Contact) =>
        `${tr('كشف حساب', 'Statement')}-${displayContactName(contact)}-${stmtStartDate || 'start'}-${stmtEndDate || 'end'}.pdf`;

    const handleShareStatementWhatsApp = async (contact: Contact, closingBalance: number) => {
        const pdfFile = await buildElementPdfFile(statementExportRef.current, {
            title: `${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`,
            fileName: buildStatementPdfName(contact),
            dir: isEnglish ? 'ltr' : 'rtl',
            lang: isEnglish ? 'en' : 'ar'
        });

        if (!pdfFile) {
            alert(tr('تعذر تجهيز ملف PDF للكشف الآن.', 'Could not prepare the statement PDF right now.'));
            return;
        }

        const shareText = buildStatementShareText(contact, closingBalance);
        let canShareFiles = Boolean(navigator.share);
        if (canShareFiles && typeof navigator.canShare === 'function') {
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

        downloadBlobFile(pdfFile, pdfFile.name);
        window.open(
            `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${tr('تم تنزيل ملف PDF للكشف. أرفقه داخل واتساب لإرسال الكشف كاملًا.', 'The statement PDF was downloaded. Attach it in WhatsApp to send the full statement.')}`)}`,
            '_blank'
        );
    };

    const handlePrintStatement = (contact: Contact) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert(tr('تعذر فتح نافذة كشف الحساب.', 'Could not open statement window.'));
            return;
        }
        const html = buildStatementPrintHtml(contact, printCheckImagesInStatement);
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
    };

    const downloadStatementSnapshot = (contact: Contact) => {
        downloadTextFile(
            buildStatementPrintHtml(contact, printCheckImagesInStatement),
            `${tr('كشف حساب', 'Statement')}-${displayContactName(contact)}-${stmtStartDate || 'start'}-${stmtEndDate || 'end'}.html`,
            'text/html;charset=utf-8'
        );
    };

    const exportStatementExcel = (contact: Contact) => {
        const success = exportElementAsCsv(
            statementContentRef.current,
            `${tr('كشف حساب', 'Statement')}-${displayContactName(contact)}-${stmtStartDate || 'start'}-${stmtEndDate || 'end'}`
        );
        if (!success) {
            alert(tr('تعذر تصدير كشف الحساب الآن.', 'Could not export the statement right now.'));
        }
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
                        <div key={contact.id} onClick={() => setSelectedContactId(contact.id)} className="bg-white px-3 py-2.5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer">
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
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{tr('كشف حساب تفصيلي', 'Detailed Statement')}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <DocumentActions
                                            title={`${tr('كشف حساب', 'Statement')} - ${displayContactName(contact)}`}
                                            shareText={buildStatementShareText(contact, closingBalance)}
                                            isEnglish={isEnglish}
                                            tr={tr}
                                            onPrint={() => handlePrintStatement(contact)}
                                            onSave={() => downloadStatementSnapshot(contact)}
                                            onExcel={() => exportStatementExcel(contact)}
                                            onWhatsapp={() => handleShareStatementWhatsApp(contact, closingBalance)}
                                            saveTitle={tr('تنزيل كشف الحساب', 'Download statement')}
                                            showSaveButton={false}
                                        />
                                        <button onClick={() => setSelectedContactId(null)} className="p-3 bg-white border border-gray-300 rounded-xl hover:bg-gray-100"><X size={18} /></button>
                                    </div>
                                </div>

                                <div className="p-4 grid grid-cols-2 gap-3 bg-white border-b border-gray-100">
                                    <EnglishDateInput
                                        value={stmtStartDate}
                                        onChange={setStmtStartDate}
                                        className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold text-right outline-none"
                                        aria-label={tr('من تاريخ', 'From date')}
                                    />
                                    <EnglishDateInput
                                        value={stmtEndDate}
                                        onChange={setStmtEndDate}
                                        className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-bold text-right outline-none"
                                        aria-label={tr('إلى تاريخ', 'To date')}
                                    />
                                </div>

                                <div ref={statementContentRef} className="flex-1 overflow-x-auto p-4">
                                    <table className="w-full min-w-[max-content] text-sm border-collapse">
                                        <thead className="bg-slate-800 text-white rounded-t-xl">
                                            <tr>
                                                <th className="p-3 text-right first:rounded-tr-xl text-[10px] font-black uppercase tracking-wider">{tr('التاريخ', 'Date')}</th>
                                                <th className="p-3 text-right text-[10px] font-black uppercase tracking-wider">{tr('البيان', 'Description')}</th>
                                                <th className="p-3 text-center text-[10px] font-black uppercase tracking-wider bg-white/10">{tr('مدين', 'Debit')}</th>
                                                <th className="p-3 text-center text-[10px] font-black uppercase tracking-wider bg-white/10">{tr('دائن', 'Credit')}</th>
                                                <th className="p-3 text-center last:rounded-tl-xl text-[10px] font-black uppercase tracking-wider">{tr('الرصيد', 'Balance')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            <tr className="bg-amber-50/50 font-bold">
                                                <td className="p-3 text-center text-xs">-</td>
                                                <td className="p-3 text-xs">{tr('الرصيد الافتتاحي', 'Opening balance')}</td>
                                                <td className="p-3 text-center text-xs">-</td>
                                                <td className="p-3 text-center text-xs">-</td>
                                                <td className="p-3 text-center font-black text-xs dir-ltr">{openingBalance.toLocaleString()}</td>
                                            </tr>
                                            {stmts.map(t => {
                                                const invoice = t.invoiceId ? invoices.find(inv => inv.id === t.invoiceId) : null;

                                                // Helper to extract Checks and Payment Methods from subTransactions
                                                const subTrans = t.subTransactions || [t];
                                                const checksInGroup = subTrans.map((sub: any) => sub.checkId ? checks.find(c => c.id === sub.checkId) : null).filter((c: any) => c);

                                                // Determine Non-Check Payment Methods (Cash/Bank)
                                                const cashMethods = subTrans.filter((sub: any) => !sub.checkId).map((sub: any) => {
                                                    const { contraAccountId, isReceipt } = getPaymentLineMeta(sub, contact);
                                                    const account = accounts.find(a => a.id === contraAccountId);
                                                    return { account, amount: sub.amount, isReceipt };
                                                }).filter((m: any) => m.account);

                                                return (
                                                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="p-3 text-[10px] font-bold text-gray-500 whitespace-nowrap align-top">{formatDate(t.date)}</td>
                                                        <td className="p-3 text-xs font-bold text-gray-700 align-top">
                                                            <div>{t.description}</div>

                                                            {/* Check Details */}
                                                            {checksInGroup.length > 0 && (
                                                                <div className="mt-1.5 space-y-1">
                                                                    {checksInGroup.map((relatedCheck: any, idx: number) => (
                                                                        <div key={idx} className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10px] text-gray-500 inline-block w-full">
                                                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                                                                <div><span className="font-black text-gray-700">{tr('رقم الشيك:', 'Check #:')}</span> {relatedCheck.checkNumber}</div>
                                                                                <div><span className="font-black text-gray-700">{tr('البنك:', 'Bank:')}</span> {displayAccountName(relatedCheck.bankAccountId ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null : { id: '', name: relatedCheck.bankName })}</div>
                                                                                {relatedCheck.accountNumber && <div><span className="font-black text-gray-700">{tr('الحساب:', 'Account:')}</span> {relatedCheck.accountNumber}</div>}
                                                                                <div><span className="font-black text-gray-700">{tr('الاستحقاق:', 'Due:')}</span> {formatDate(relatedCheck.dueDate)}</div>
                                                                                <div className="col-span-2 border-t border-gray-200 mt-1 pt-1 flex justify-between">
                                                                                    <span><span className="font-black text-emerald-600">{tr('المبلغ:', 'Amount:')}</span> <span className="dir-ltr font-bold text-gray-800">{relatedCheck.amount.toLocaleString()}</span></span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Cash/Bank Details */}
                                                            {cashMethods.length > 0 && !invoice && (
                                                                <div className="mt-1.5 text-[10px] text-gray-500 font-bold space-y-1">
                                                                    {cashMethods.map((m: any, idx: number) => (
                                                                        <div key={idx}>
                                                                            <span className="text-gray-400">{m.isReceipt ? tr('تم القبض في:', 'Received in:') : tr('تم الصرف من:', 'Paid from:')}</span> <span className="text-gray-700">{displayAccountName(m.account)}</span>
                                                                            {(m.amount !== t.debit && m.amount !== t.credit) && <span className="text-gray-400 font-normal"> ({m.amount.toLocaleString()})</span>}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Invoice Items */}
                                                            {invoice && (
                                                                <div className="mt-2 text-[10px] text-gray-500">
                                                                    <div className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-2 border-b border-dashed border-gray-200 pb-1 mb-1 font-black bg-gray-50/50 p-1 rounded-t-md">
                                                                        <div>{tr('الصنف', 'Item')}</div>
                                                                        <div className="text-center">{tr('الكمية', 'Qty')}</div>
                                                                        <div className="text-center">{tr('السعر', 'Price')}</div>
                                                                        <div className="text-center">{tr('الإجمالي', 'Total')}</div>
                                                                    </div>
                                                                    {invoice.items.map((item, idx) => {
                                                                        const product = products.find(p => p.id === item.productId);
                                                                        return (
                                                                            <div key={idx} className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-2 py-1 px-1 hover:bg-gray-50 rounded-sm">
                                                                                <div className="truncate">{item.description || displayProductName(product)}</div>
                                                                                <div className="text-center">{item.quantity}</div>
                                                                                <div className="text-center">{item.unitPrice.toLocaleString()}</div>
                                                                                <div className="text-center">{item.total.toLocaleString()}</div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-center text-emerald-600 font-bold text-xs dir-ltr bg-emerald-50/30 align-top">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                                        <td className="p-3 text-center text-rose-600 font-bold text-xs dir-ltr bg-rose-50/30 align-top">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                                        <td className="p-3 text-center font-black text-xs dir-ltr align-top">{t.runningBalance.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center gap-3">
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
                                    <div className="text-left">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">{tr('الرصيد الختامي', 'Closing Balance')}</span>
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




