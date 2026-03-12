
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, Transaction } from '../types';
import { getDisplayAccountName, getDisplayContactName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { executeDeviceHubCommand } from '../utils/deviceHub';
import { getSelectedThermalTemplate, getThermalTemplateCustomization } from '../utils/thermalPrintTemplates';
import {
    Plus, Search, ArrowDownLeft, ArrowUpRight,
    Calendar, User, Receipt,
    TrendingUp, Clock, Trash2, Archive, CheckCircle, Printer, RotateCcw, Pencil,
    SlidersHorizontal, X
} from 'lucide-react';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';

interface VoucherManagerProps {
    type: 'RECEIPT' | 'PAYMENT';
    onAddNew: () => void;
    onEditVoucher?: (voucherId: string, voucherType: 'RECEIPT' | 'PAYMENT') => void;
}

const VoucherManager: React.FC<VoucherManagerProps> = ({ type, onAddNew, onEditVoucher }) => {
    const { transactions, accounts, baseCurrency, postVoucher, deleteVoucher, reverseTransaction, contacts, checks, companySettings, currentCompanyId } = useAccounting();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED' | 'DRAFT'>('ALL');
    const [contactFilterId, setContactFilterId] = useState('ALL');
    const [fromDateFilter, setFromDateFilter] = useState('');
    const [toDateFilter, setToDateFilter] = useState('');
    const [minAmountFilter, setMinAmountFilter] = useState('');
    const [maxAmountFilter, setMaxAmountFilter] = useState('');
    const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
    const [sortMode, setSortMode] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC' | 'VOUCHER_ASC'>('DATE_DESC');

    const isReceipt = type === 'RECEIPT';
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const theme = isReceipt
        ? { primary: 'text-emerald-600', gradient: 'from-emerald-600 to-teal-700', button: 'bg-emerald-600', shadow: 'shadow-emerald-100' }
        : { primary: 'text-rose-600', gradient: 'from-rose-600 to-pink-700', button: 'bg-rose-600', shadow: 'shadow-rose-100' };

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
    };

    const formatAmount = (value: number) => Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const parseAmountFilter = (raw: string): number | null => {
        const normalized = toEnglishDigits(String(raw || '').trim()).replace(/[^\d.-]/g, '');
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const baseVoucherGroups = useMemo(() => {
        const groups: Record<string, Transaction[]> = {};
        transactions.forEach(t => {
            const matchesType = isReceipt ? t.type === TransactionType.INCOME : t.type === TransactionType.EXPENSE;
            if (!matchesType || !t.voucherId) return;
            if (!groups[t.voucherId]) groups[t.voucherId] = [];
            groups[t.voucherId].push(t);
        });
        return Object.entries(groups).map(([id, parts]) => ({ id, parts }));
    }, [transactions, isReceipt]);

    const voucherContactOptions = useMemo(() => {
        const ids = new Set(
            baseVoucherGroups
                .map(group => group.parts[0]?.contactId)
                .filter((value): value is string => !!value)
        );
        return contacts
            .filter(contact => ids.has(contact.id))
            .sort((a, b) => displayContactName(a).localeCompare(displayContactName(b), isEnglish ? 'en' : 'ar'));
    }, [baseVoucherGroups, contacts, isEnglish]);

    // Grouping Logic - Filter only Voucher transactions (those with voucherId)
    const groupedVouchers = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const minAmount = parseAmountFilter(minAmountFilter);
        const maxAmount = parseAmountFilter(maxAmountFilter);

        return baseVoucherGroups
            .filter(({ id, parts }) => {
                const first = parts[0];
                if (!first) return false;

                const contact = contacts.find(c => c.id === first.contactId) || null;
                const contactName = displayContactName(contact);
                const totalAmount = parts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const voucherStatus: 'DRAFT' | 'POSTED' = parts.some(item => item.status === 'DRAFT') ? 'DRAFT' : 'POSTED';

                if (statusFilter !== 'ALL' && voucherStatus !== statusFilter) return false;
                if (contactFilterId !== 'ALL' && first.contactId !== contactFilterId) return false;
                if (fromDateFilter && first.date < fromDateFilter) return false;
                if (toDateFilter && first.date > toDateFilter) return false;
                if (minAmount !== null && totalAmount < minAmount) return false;
                if (maxAmount !== null && totalAmount > maxAmount) return false;

                if (!q) return true;
                const matchesText = id.toLowerCase().includes(q) ||
                    contactName.toLowerCase().includes(q) ||
                    parts.some(item => String(item.description || '').toLowerCase().includes(q));
                return matchesText;
            })
            .sort((a, b) => {
                const aDate = new Date((a.parts[0]?.date || '')).getTime();
                const bDate = new Date((b.parts[0]?.date || '')).getTime();
                const aAmount = a.parts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const bAmount = b.parts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

                switch (sortMode) {
                    case 'DATE_ASC':
                        return aDate - bDate;
                    case 'AMOUNT_DESC':
                        return bAmount - aAmount;
                    case 'AMOUNT_ASC':
                        return aAmount - bAmount;
                    case 'VOUCHER_ASC':
                        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
                    case 'DATE_DESC':
                    default:
                        return bDate - aDate;
                }
            });
    }, [
        baseVoucherGroups,
        contacts,
        searchTerm,
        statusFilter,
        contactFilterId,
        fromDateFilter,
        toDateFilter,
        minAmountFilter,
        maxAmountFilter,
        isEnglish,
        sortMode
    ]);

    const hasSearch = !!searchTerm.trim();
    const hasAdvancedFilters =
        statusFilter !== 'ALL' ||
        contactFilterId !== 'ALL' ||
        !!fromDateFilter ||
        !!toDateFilter ||
        !!minAmountFilter ||
        !!maxAmountFilter;
    const hasActiveFilters = hasSearch || hasAdvancedFilters;
    const activeAdvancedFilterCount = [
        statusFilter !== 'ALL',
        contactFilterId !== 'ALL',
        !!fromDateFilter,
        !!toDateFilter,
        !!minAmountFilter,
        !!maxAmountFilter
    ].filter(Boolean).length;

    const clearAdvancedFilters = () => {
        setStatusFilter('ALL');
        setContactFilterId('ALL');
        setFromDateFilter('');
        setToDateFilter('');
        setMinAmountFilter('');
        setMaxAmountFilter('');
    };

    const clearFilters = () => {
        setSearchTerm('');
        clearAdvancedFilters();
    };

    // Total of POSTED vouchers shown in the header
    const totalPostedAmount = useMemo(() => {
        return transactions
            .filter(t => t.status === 'POSTED' && !!t.voucherId && (isReceipt ? t.type === TransactionType.INCOME : t.type === TransactionType.EXPENSE))
            .reduce((sum, t) => sum + t.amount, 0);
    }, [transactions, isReceipt]);

    const getVoucherPreview = (parts: Transaction[]) => {
        const descriptions = Array.from(new Set(parts.map(part => String(part.description || '').trim()).filter(Boolean)));
        if (descriptions.length === 0) return tr('بدون وصف إضافي', 'No extra description');
        if (descriptions.length === 1) return descriptions[0];
        return isEnglish
            ? `${descriptions[0]} + ${descriptions.length - 1} more`
            : `${descriptions[0]} + ${descriptions.length - 1} إضافية`;
    };

    const getContactName = (id?: string) => displayContactName(contacts.find(c => c.id === id) || null) || tr('طرف غير محدد', 'Unknown');

    const handlePostGroup = async (vId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(tr(
            'هل أنت متأكد من اعتماد وترحيل هذا السند؟ سيتم تحديث الأرصدة المالية فوراً.',
            'Are you sure you want to post this voucher? Account balances will be updated immediately.'
        ))) {
            setIsProcessing(vId);
            setTimeout(() => {
                const result = postVoucher(vId);
                if (!result.ok) {
                    alert(result.message);
                } else {
                    setSelectedVoucherId(null);
                    alert(tr('تم ترحيل السند بنجاح', 'Voucher posted successfully.'));
                }
                setIsProcessing(null);
            }, 400);
        }
    };

    const handleDeleteGroup = (vId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(tr('حذف السند نهائياً؟', 'Delete this voucher permanently?'))) {
            const result = deleteVoucher(vId);
            if (!result.ok) alert(result.message);
        }
    };

    const handleReverseGroup = (parts: Transaction[], e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(tr('سيتم إنشاء قيود عكسية لكل بنود السند المرحّل. متابعة؟', 'This will create reversal entries for posted voucher lines. Continue?'))) return;

        const postedParts = parts.filter(part => part.status === 'POSTED' && !part.reversedById);
        if (postedParts.length === 0) {
            alert(tr('لا توجد بنود قابلة للعكس', 'No posted lines available for reversal.'));
            return;
        }

        const failed: string[] = [];
        postedParts.forEach(part => {
            const result = reverseTransaction(part.id);
            if (!result.ok) {
                failed.push(`${part.id}: ${result.message}`);
            }
        });

        if (failed.length > 0) {
            alert(`${tr('تم عكس جزئي مع أخطاء', 'Partial reversal with errors')}\n${failed.join('\n')}`);
            return;
        }

        alert(tr('تم إنشاء قيود العكس بنجاح', 'Voucher reversal entries created successfully.'));
    };

    const buildVoucherPrintHtml = (voucherId: string, parts: Transaction[], autoPrint = true): string => {
        const first = parts[0];
        if (!first) return '';
        const escapeHtml = (value: unknown) =>
            String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const printLang = isEnglish ? 'en' : 'ar';
        const printDir = isEnglish ? 'ltr' : 'rtl';
        const printFont = isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', sans-serif";
        const contact = contacts.find(c => c.id === first.contactId);
        const contactName = getContactName(first.contactId);
        const voucherStatus = parts.every(part => part.status === 'POSTED')
            ? tr('مرحل', 'Posted')
            : parts.some(part => part.status === 'DRAFT')
                ? tr('مسودة', 'Draft')
                : '-';
        const currency = first.currency || baseCurrency;
        const exchangeRate = Number(first.exchangeRate || 1);
        const totalAmount = parts.reduce((sum, part) => sum + (part.amount || 0), 0);
        const showAccountBalanceUnderVoucher = companySettings.showAccountBalanceUnderVoucher ?? false;
        const voucherDate = first.date;
        const computeAccountBalanceUntilDate = (accountId: string, dateIso: string): number => {
            const account = accounts.find(item => item.id === accountId);
            if (!account) return 0;
            const isDebitNature = account.type === 'ASSET' || account.type === 'EXPENSE';
            return transactions
                .filter(tx => tx.status === 'POSTED')
                .filter(tx => tx.date <= dateIso)
                .filter(tx => tx.debitAccountId === accountId || tx.creditAccountId === accountId)
                .reduce((sum, tx) => {
                    const amountBase = Number(tx.amount || 0) * (Number(tx.exchangeRate) || 1);
                    const debit = tx.debitAccountId === accountId ? amountBase : 0;
                    const credit = tx.creditAccountId === accountId ? amountBase : 0;
                    return sum + (isDebitNature ? (debit - credit) : (credit - debit));
                }, 0);
        };
        const voucherCounterAccountIds = Array.from(new Set(
            parts
                .map(part => (isReceipt ? part.creditAccountId : part.debitAccountId))
                .filter((id): id is string => !!id)
        ));
        const accountBalanceRows = showAccountBalanceUnderVoucher
            ? voucherCounterAccountIds.map(accountId => {
                const account = accounts.find(item => item.id === accountId);
                const balance = computeAccountBalanceUntilDate(accountId, voucherDate);
                return {
                    accountId,
                    accountName: account ? displayAccountName(account) : accountId,
                    balance
                };
            })
            : [];
        const accountBalancesHtml = accountBalanceRows.length > 0
            ? `
                <div class="account-balance-box">
                  <div class="account-balance-title">${tr('أرصدة الحسابات بعد السند', 'Account balances after voucher')}</div>
                  ${accountBalanceRows.map(row => `
                    <div class="account-balance-row">
                      <span>${escapeHtml(row.accountName)}</span>
                      <span dir="ltr">${row.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  `).join('')}
                </div>
              `
            : '';
        const rows = parts.map((part, index) => {
            const paymentAccount = isReceipt
                ? accounts.find(account => account.id === part.debitAccountId)
                : accounts.find(account => account.id === part.creditAccountId);
            const counterAccount = isReceipt
                ? accounts.find(account => account.id === part.creditAccountId)
                : accounts.find(account => account.id === part.debitAccountId);
            const relatedCheck = part.checkId ? checks.find(item => item.id === part.checkId) : null;
            const references: string[] = [];
            if (relatedCheck) {
                references.push(`${tr('شيك', 'Check')} #${relatedCheck.checkNumber}`);
                if (relatedCheck.bankName) references.push(`${tr('بنك', 'Bank')}: ${relatedCheck.bankName}`);
                if (relatedCheck.dueDate) references.push(`${tr('استحقاق', 'Due')}: ${formatDate(relatedCheck.dueDate)}`);
            }
            if (part.invoiceId) references.push(`${tr('فاتورة', 'Invoice')}: ${part.invoiceId}`);
            if (part.category) references.push(`${tr('تصنيف', 'Category')}: ${part.category}`);
            const referenceText = references.join(' - ') || '-';
            return `
              <tr>
                <td>${index + 1}</td>
                <td style="text-align:right;">${escapeHtml(part.description)}</td>
                <td style="text-align:right;">${escapeHtml(paymentAccount ? displayAccountName(paymentAccount) : '-')}</td>
                <td style="text-align:right;">${escapeHtml(counterAccount ? displayAccountName(counterAccount) : '-')}</td>
                <td style="text-align:right;">${escapeHtml(referenceText)}</td>
                <td dir="ltr">${Number(part.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            `;
        }).join('');

        return `
        <!DOCTYPE html>
        <html dir="${printDir}" lang="${printLang}">
          <head>
            <title>${isReceipt ? tr('سند قبض', 'Receipt Voucher') : tr('سند صرف', 'Payment Voucher')} - ${voucherId}</title>
            <style>
              body { font-family: ${printFont}; padding: 32px; color: #1f2937; }
              .header { display:flex; justify-content:space-between; border-bottom:2px solid #1e40af; padding-bottom:16px; margin-bottom:20px; }
              .meta-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; margin-bottom:14px; }
              .meta-card { border:1px solid #e5e7eb; background:#f8fafc; border-radius:8px; padding:8px; font-size:11px; }
              .meta-card .k { color:#64748b; font-weight:700; margin-bottom:2px; display:block; }
              .meta-card .v { color:#0f172a; font-weight:800; }
              table { width:100%; border-collapse:collapse; margin-top:12px; }
              th, td { border-bottom:1px solid #e5e7eb; padding:10px; font-size:13px; text-align:center; }
              th { background:#eef2ff; color:#1e40af; font-weight:800; }
              .account-balance-box { margin-top: 14px; border:1px solid #dbeafe; background:#eff6ff; border-radius:10px; padding:10px 12px; }
              .account-balance-title { font-size:12px; font-weight:800; color:#1e40af; margin-bottom:8px; }
              .account-balance-row { display:flex; justify-content:space-between; gap:10px; padding:4px 0; font-size:12px; border-top:1px dashed #bfdbfe; }
              .account-balance-row:first-of-type { border-top:none; }
              .footer-note { margin-top: 12px; font-size: 11px; color:#64748b; }
              @media print {
                body { padding: 10px; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <h2>${escapeHtml(companySettings.name)}</h2>
                <div>${isReceipt ? tr('سند قبض', 'Receipt Voucher') : tr('سند صرف', 'Payment Voucher')}</div>
              </div>
              <div style="text-align:left;">
                <div>${tr('رقم السند', 'Voucher')}: ${voucherId}</div>
                <div>${tr('التاريخ', 'Date')}: ${formatDate(first.date)}</div>
                <div>${tr('الطرف', 'Contact')}: ${escapeHtml(contactName)}</div>
              </div>
            </div>
            <div class="meta-grid">
              <div class="meta-card"><span class="k">${tr('الحالة', 'Status')}</span><span class="v">${voucherStatus}</span></div>
              <div class="meta-card"><span class="k">${tr('العملة', 'Currency')}</span><span class="v">${escapeHtml(currency)}</span></div>
              <div class="meta-card"><span class="k">${tr('سعر الصرف', 'Exchange Rate')}</span><span class="v">${exchangeRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span></div>
              <div class="meta-card"><span class="k">${tr('عدد البنود', 'Lines')}</span><span class="v">${parts.length}</span></div>
              <div class="meta-card" style="grid-column: span 4;"><span class="k">${tr('تفاصيل الطرف', 'Contact details')}</span><span class="v">${escapeHtml(contactName)}${contact?.phone ? ` - ${escapeHtml(contact.phone)}` : ''}</span></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th style="text-align:right;">${tr('البيان', 'Description')}</th>
                  <th style="text-align:right;">${tr(isReceipt ? 'حساب التحصيل' : 'حساب الدفع', isReceipt ? 'Receipt Account' : 'Payment Account')}</th>
                  <th style="text-align:right;">${tr('الحساب المقابل', 'Counter Account')}</th>
                  <th style="text-align:right;">${tr('المرجع/التفاصيل', 'Reference / Details')}</th>
                  <th>${tr('المبلغ', 'Amount')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <h3 style="text-align:left; margin-top:16px;">${tr('الإجمالي', 'Total')}: ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}</h3>
            ${accountBalancesHtml}
            ${companySettings.statementFooterNote ? `<div class="footer-note">${escapeHtml(companySettings.statementFooterNote)}</div>` : ''}
            ${autoPrint ? '<script>window.onload = () => window.print();</script>' : ''}
          </body>
        </html>`;
    };

    const printVoucherBrowser = (voucherId: string, parts: Transaction[]) => {
        const html = buildVoucherPrintHtml(voucherId, parts, true);
        if (!html) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert(tr('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
            return;
        }
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const buildThermalVoucherPayload = (voucherId: string, parts: Transaction[]) => {
        const first = parts[0];
        const contactName = first ? getContactName(first.contactId) : '-';
        const total = parts.reduce((sum, part) => sum + (part.amount || 0), 0);
        const template = getSelectedThermalTemplate(currentCompanyId, isReceipt ? 'RECEIPT' : 'VOUCHER');
        const customization = getThermalTemplateCustomization(currentCompanyId, isReceipt ? 'RECEIPT' : 'VOUCHER');
        const isCompactTemplate = template.style === 'COMPACT';
        const compactLimit = Math.max(3, Math.min(20, Math.floor(Number(customization.compactMaxItems || 8))));
        const partLines = (isCompactTemplate ? parts.slice(0, compactLimit) : parts).map((part, index) => {
            const account = isReceipt
                ? accounts.find(item => item.id === part.debitAccountId)
                : accounts.find(item => item.id === part.creditAccountId);
            const amount = Number(part.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (isCompactTemplate) {
                return `${index + 1}. ${part.description} = ${amount}`;
            }
            return `${index + 1}. ${part.description} | ${account ? displayAccountName(account) : '-'} | ${amount}`;
        });
        const lines = [
            (customization.headerText || companySettings.name) || (isReceipt ? tr('سند قبض', 'Receipt Voucher') : tr('سند صرف', 'Payment Voucher')),
            `${isReceipt ? tr('سند قبض', 'Receipt Voucher') : tr('سند صرف', 'Payment Voucher')} - ${voucherId}`,
            `${tr('التاريخ', 'Date')}: ${first ? formatDate(first.date) : '-'}`,
            `${tr('الطرف', 'Contact')}: ${contactName}`,
            '----------------------------------------',
            ...partLines,
            ...(isCompactTemplate && parts.length > partLines.length
                ? [`... ${tr('بنود إضافية', 'More lines')}: ${parts.length - partLines.length}`]
                : []),
            '----------------------------------------',
            `${tr('الإجمالي', 'Total')}: ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${first?.currency || baseCurrency}`,
            customization.footerText ? customization.footerText : '',
            ...(customization.showPrintedAt ? [`${tr('تاريخ الطباعة', 'Printed')}: ${new Date().toLocaleString('en-GB')}`] : [])
        ];
        return {
            format: 'escpos.receipt.v1',
            receiptType: isReceipt ? 'voucher-receipt' : 'voucher-payment',
            locale: isEnglish ? 'en' : 'ar',
            paperWidthMm: customization.paperWidthMm,
            cut: true,
            openDrawer: true,
            templateId: template.id,
            templateType: isReceipt ? 'RECEIPT' : 'VOUCHER',
            templateCustomization: customization,
            voucher: {
                voucherId,
                type: isReceipt ? 'RECEIPT' : 'PAYMENT',
                date: first?.date || '',
                currency: first?.currency || baseCurrency,
                contactId: first?.contactId || null,
                contactName,
                total,
                lines: parts.map(part => ({
                    id: part.id,
                    description: part.description,
                    amount: part.amount,
                    debitAccountId: part.debitAccountId || null,
                    creditAccountId: part.creditAccountId || null
                }))
            },
            textLines: lines
        } as Record<string, unknown>;
    };

    const handlePrintVoucher = async (voucherId: string, parts: Transaction[], e: React.MouseEvent) => {
        e.stopPropagation();
        if (parts.length === 0) return;
        const result = await executeDeviceHubCommand({
            companyId: currentCompanyId,
            action: 'PRINT_RECEIPT',
            deviceType: 'RECEIPT_PRINTER',
            source: 'voucher-print',
            enqueueOnFailure: true,
            payload: buildThermalVoucherPayload(voucherId, parts)
        });
        if (result.ok) {
            alert(tr('تم إرسال السند للطابعة الحرارية بنجاح.', 'Voucher sent to thermal printer successfully.'));
            return;
        }
        if (result.queued) {
            alert(tr('تعذر الطباعة المباشرة. تمت إضافة المهمة إلى الطابور.', 'Direct print failed. Job was queued.'));
            return;
        }
        printVoucherBrowser(voucherId, parts);
    };

    return (
        <div
            className={`app-page voucher-list-page px-2 py-3 font-tajawal sm:p-4 ${isEnglish ? 'text-left' : 'text-right'}`}
            dir={isEnglish ? 'ltr' : 'rtl'}
        >
            <section className="mb-3 rounded-[1.2rem] border border-slate-200/90 bg-white px-3 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:mb-4 sm:rounded-[1.8rem] sm:px-5 sm:py-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black tracking-[0.08em] text-slate-400 sm:text-[11px]">
                            {tr('إدارة السندات اليومية', 'Daily voucher workspace')}
                        </p>
                        <h1 className="mt-1 text-[1.28rem] font-black tracking-tight text-slate-900 sm:text-2xl">
                            {isReceipt ? tr('سندات القبض', 'Receipt Vouchers') : tr('سندات الصرف', 'Payment Vouchers')}
                        </h1>
                        <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500 sm:text-sm">
                            {tr('البحث والإضافة والترحيل من شاشة واحدة مرتبة للجوال.', 'Search, add, and post vouchers from one mobile-friendly screen.')}
                        </p>
                    </div>

                    <div className={`shrink-0 min-w-[6.5rem] rounded-[1rem] border px-3 py-2.5 shadow-sm sm:min-w-[8.5rem] sm:rounded-[1.3rem] sm:px-4 sm:py-3 ${isReceipt ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
                        <p className="text-[9px] font-black tracking-[0.08em] text-slate-400 sm:text-[11px]">
                            {tr('إجمالي السندات المرحلة', 'Posted vouchers total')}
                        </p>
                        <div className="mt-1 flex items-end gap-1.5 sm:mt-2 sm:gap-2">
                            <span className={`text-[1.25rem] font-black dir-ltr sm:text-2xl ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {formatAmount(totalPostedAmount)}
                            </span>
                            <span className="pb-0.5 text-[11px] font-bold text-slate-500 sm:pb-1 sm:text-sm">{baseCurrency}</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mb-3 rounded-[1.2rem] border border-slate-200/90 bg-white p-2.5 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:mb-4 sm:rounded-[1.8rem] sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-slate-300 focus-within:bg-white sm:rounded-[1.3rem] sm:px-3.5 sm:py-2.5">
                        <Search size={16} className="shrink-0 text-slate-400 sm:h-[18px] sm:w-[18px]" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={tr('ابحث برقم السند أو الطرف...', 'Search by voucher number or contact...')}
                            className="min-w-0 flex-1 bg-transparent px-2.5 text-[13px] font-bold text-slate-700 outline-none sm:px-3 sm:text-sm"
                        />
                        {hasSearch && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                                aria-label={tr('مسح البحث', 'Clear search')}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-[0.9fr_1.1fr] gap-2 lg:grid-cols-[auto_auto]">
                        <button
                            type="button"
                            onClick={() => setIsFilterDialogOpen(true)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[1rem] border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:gap-2 sm:rounded-[1.25rem] sm:px-4 sm:py-3 sm:text-sm"
                        >
                            <SlidersHorizontal size={16} className="sm:h-[18px] sm:w-[18px]" />
                            <span>{tr('فلتر', 'Filter')}</span>
                            {activeAdvancedFilterCount > 0 && (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${isReceipt ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {activeAdvancedFilterCount}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={onAddNew}
                            className={`${theme.button} inline-flex items-center justify-center gap-1.5 rounded-[1rem] px-3 py-2.5 text-xs font-black text-white shadow-sm transition active:scale-[0.98] sm:gap-2 sm:rounded-[1.25rem] sm:px-4 sm:py-3 sm:text-sm`}
                        >
                            <Plus size={16} className="sm:h-[18px] sm:w-[18px]" />
                            <span>{tr('إضافة سند', 'Add voucher')}</span>
                        </button>
                    </div>
                </div>

                <div className="hidden mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-3 sm:gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600 sm:px-3 sm:py-1.5 sm:text-xs">
                        {tr('النتائج', 'Results')}: {groupedVouchers.length}
                    </span>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-600 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                        <span>{tr('الترتيب', 'Sort')}</span>
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                            className="bg-transparent text-[11px] font-black text-slate-700 outline-none sm:text-xs"
                        >
                            <option value="DATE_DESC">{tr('الأحدث أولاً', 'Newest first')}</option>
                            <option value="DATE_ASC">{tr('الأقدم أولاً', 'Oldest first')}</option>
                            <option value="AMOUNT_DESC">{tr('الأعلى قيمة', 'Highest amount')}</option>
                            <option value="AMOUNT_ASC">{tr('الأقل قيمة', 'Lowest amount')}</option>
                            <option value="VOUCHER_ASC">{tr('رقم السند', 'Voucher no.')}</option>
                        </select>
                    </div>
                    {hasAdvancedFilters && (
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black sm:px-3 sm:py-1.5 sm:text-xs ${isReceipt ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
                            {tr('فلاتر نشطة', 'Active filters')}: {activeAdvancedFilterCount}
                        </span>
                    )}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:px-3 sm:py-1.5 sm:text-xs"
                        >
                            {tr('مسح الكل', 'Clear all')}
                        </button>
                    )}
                </div>
            </section>

            <ResponsiveDialog
                open={isFilterDialogOpen}
                onClose={() => setIsFilterDialogOpen(false)}
                size="lg"
                panelClassName="font-tajawal bg-white"
            >
                <div className={`p-4 sm:p-6 ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-xl font-black text-slate-900">
                                {tr('الفلاتر المتقدمة', 'Advanced filters')}
                            </h2>
                            <p className="mt-1 text-sm font-bold text-slate-500">
                                {tr('افتح الفلاتر فقط عند الحاجة للحفاظ على الشاشة مرتبة.', 'Open filters only when needed to keep the screen focused.')}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsFilterDialogOpen(false)}
                            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={tr('إغلاق', 'Close')}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الحالة', 'Status')}</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'POSTED' | 'DRAFT')}
                                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                            >
                                <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
                                <option value="POSTED">{tr('مرحل فقط', 'Posted only')}</option>
                                <option value="DRAFT">{tr('مسودات فقط', 'Draft only')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الطرف', 'Contact')}</label>
                            <select
                                value={contactFilterId}
                                onChange={(e) => setContactFilterId(e.target.value)}
                                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                            >
                                <option value="ALL">{tr('كل الأطراف', 'All contacts')}</option>
                                {voucherContactOptions.map(contact => (
                                    <option key={contact.id} value={contact.id}>{displayContactName(contact)}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('من تاريخ', 'From date')}</label>
                            <EnglishDateInput
                                value={fromDateFilter}
                                onChange={setFromDateFilter}
                                displayFormat="YMD"
                                wrapperClassName="w-full"
                                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr"
                                placeholder={tr('من تاريخ', 'From date')}
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('إلى تاريخ', 'To date')}</label>
                            <EnglishDateInput
                                value={toDateFilter}
                                onChange={setToDateFilter}
                                displayFormat="YMD"
                                wrapperClassName="w-full"
                                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr"
                                placeholder={tr('إلى تاريخ', 'To date')}
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الحد الأدنى', 'Min amount')}</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                value={toEnglishDigits(minAmountFilter)}
                                onChange={(e) => setMinAmountFilter(toEnglishDigits(e.target.value))}
                                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr text-right"
                                placeholder={tr('الحد الأدنى', 'Min amount')}
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('الحد الأعلى', 'Max amount')}</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                value={toEnglishDigits(maxAmountFilter)}
                                onChange={(e) => setMaxAmountFilter(toEnglishDigits(e.target.value))}
                                className="w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white dir-ltr text-right"
                                placeholder={tr('الحد الأعلى', 'Max amount')}
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-black text-slate-500">
                            {tr('النتائج الحالية', 'Current results')}: <span className="text-slate-900">{groupedVouchers.length}</span>
                        </span>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={clearAdvancedFilters}
                                className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                                {tr('مسح الفلاتر', 'Clear filters')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFilterDialogOpen(false)}
                                className={`${theme.button} rounded-[1.1rem] px-4 py-3 text-sm font-black text-white transition`}
                            >
                                {tr('عرض النتائج', 'Show results')}
                            </button>
                        </div>
                    </div>
                </div>
            </ResponsiveDialog>

            <div className="space-y-2 sm:space-y-2.5">
                <div className={`hidden md:grid items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 ${isEnglish ? 'grid-cols-[6.4rem_minmax(0,1fr)_4.1rem]' : 'grid-cols-[4.1rem_minmax(0,1fr)_6.4rem]'}`}>
                    <div className={`${isEnglish ? 'text-right' : 'text-left'}`}>{tr('المرجع', 'Reference')}</div>
                    <div>{tr('الطرف والبيان', 'Contact and note')}</div>
                    <div className="text-center">{tr('القيمة', 'Amount')}</div>
                </div>
                {groupedVouchers.length > 0 ? (
                    groupedVouchers.map(({ id, parts }) => {
                        const totalAmount = parts.reduce((sum, p) => sum + p.amount, 0);
                        const isDraft = parts.some(p => p.status === 'DRAFT');
                        const isExpanded = selectedVoucherId === id;
                        const processing = isProcessing === id;
                        const firstPart = parts[0];
                        const previewText = getVoucherPreview(parts);
                        const summaryText = previewText;
                        const hasLockedCheckFlow = parts.some(part => {
                            const relatedCheck = part.checkId ? checks.find(check => check.id === part.checkId) : null;
                            if (!relatedCheck) return false;
                            const isEndorsedSource = (
                                part.category === 'voucher_payment'
                                && part.creditAccountId === 'acc_cheques_hand'
                                && relatedCheck.type === 'INCOMING'
                                && relatedCheck.status === 'ENDORSED'
                            );
                            return isEndorsedSource ? false : relatedCheck.status !== 'PENDING';
                        });
                        const canMutateDirectly = parts.every(part => !part.isReversal && !part.reversedById) && !hasLockedCheckFlow;

                        return (
                            <article
                                key={id}
                                className={`list-card overflow-hidden rounded-[1rem] border bg-white transition sm:rounded-[1.1rem] ${isExpanded ? 'border-slate-300 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-100' : 'border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.05)] hover:border-slate-300'}`}
                            >
                                <div
                                    onClick={() => setSelectedVoucherId(isExpanded ? null : id)}
                                    className="cursor-pointer p-2.5 sm:p-3.5"
                                >
                                    <div className={`grid items-start gap-2.5 sm:gap-3 ${isEnglish ? 'grid-cols-[4.95rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[6.4rem_minmax(0,1fr)_4.4rem]' : 'grid-cols-[2.75rem_minmax(0,1fr)_4.95rem] sm:grid-cols-[4.4rem_minmax(0,1fr)_6.4rem]'}`}>
                                        <div className={`flex flex-col gap-1.5 ${isEnglish ? 'order-3 items-end' : 'order-1 items-start'}`}>
                                            <div className={`flex flex-wrap gap-1 ${isEnglish ? 'justify-end' : 'justify-start'} sm:gap-1.5`}>
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black sm:px-3 sm:py-1 sm:text-[11px] ${isDraft ? 'border border-amber-200 bg-amber-50 text-amber-700' : isReceipt ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'border border-rose-100 bg-rose-50 text-rose-700'}`}>
                                                    {isDraft ? tr('مسودة', 'Draft') : tr('مرحل', 'Posted')}
                                                </span>
                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500 sm:px-3 sm:py-1 sm:text-[11px]">
                                                    {id}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={`min-w-0 ${isEnglish ? 'order-2 text-left' : 'order-2 text-right'}`}>
                                            <div className={`flex items-start gap-2.5 ${isEnglish ? 'flex-row' : 'flex-row-reverse'} sm:gap-3`}>
                                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] sm:h-11 sm:w-11 ${isReceipt ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {isReceipt ? <ArrowDownLeft size={15} className="sm:h-[18px] sm:w-[18px]" /> : <ArrowUpRight size={15} className="sm:h-[18px] sm:w-[18px]" />}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:gap-2 sm:text-[11px] sm:tracking-[0.16em]">
                                                        <User size={13} />
                                                        <span>{tr('الطرف', 'Contact')}</span>
                                                    </div>
                                                    <div className="mt-0.5 text-[1.02rem] font-black leading-6 text-slate-900 sm:mt-1 sm:text-base">
                                                        {getContactName(firstPart?.contactId)}
                                                    </div>
                                                    <div className="mt-0.5 truncate text-[11px] font-bold leading-4 text-slate-500 sm:mt-1 sm:text-xs">
                                                        {summaryText}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black text-slate-500 sm:text-[11px]">
                                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                                                    <Calendar size={12} />
                                                    <span>{formatDate(firstPart?.date) || '-'}</span>
                                                </span>
                                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                                                    <Receipt size={12} />
                                                    <span>{parts.length} {tr('بنود', 'lines')}</span>
                                                </span>
                                            </div>
                                        </div>

                                        <div className={`rounded-[1rem] border px-2.5 py-2.5 text-center sm:rounded-[1.2rem] sm:px-3 sm:py-3 ${isDraft ? 'border-slate-200 bg-slate-50' : isReceipt ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'} ${isEnglish ? 'order-1' : 'order-3'}`}>
                                            <div className="text-[9px] font-black tracking-[0.08em] text-slate-400 sm:text-[11px]">
                                                {tr('قيمة السند', 'Voucher amount')}
                                            </div>
                                            <div className={`mt-1.5 text-[1.05rem] font-black leading-none dir-ltr sm:mt-2 sm:text-[1.65rem] ${isDraft ? 'text-slate-600' : isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                {formatAmount(totalAmount)}
                                            </div>
                                            <div className="mt-1 text-[10px] font-black text-slate-500 sm:text-xs">
                                                {firstPart?.currency || baseCurrency}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/80 p-2.5 sm:p-3.5">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 sm:text-[11px] sm:tracking-[0.18em]">
                                            <TrendingUp size={14} className={isReceipt ? 'text-emerald-600' : 'text-rose-600'} />
                                            <span>{tr('تفاصيل السند', 'Voucher details')}</span>
                                        </div>

                                        <div className="mt-2 space-y-1.5 sm:mt-2.5 sm:space-y-2">
                                            {parts.map((p, idx) => {
                                                const relatedCheck = p.checkId ? checks.find(c => c.id === p.checkId) : null;
                                                const paymentAccount = isReceipt
                                                    ? accounts.find(a => a.id === p.debitAccountId)
                                                    : accounts.find(a => a.id === p.creditAccountId);

                                                return (
                                                    <div key={idx} className="rounded-[0.9rem] border border-slate-200 bg-white p-2 shadow-sm sm:rounded-[1rem] sm:p-2.5">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-1 text-[9px] font-black text-slate-500 sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-[10px]">
                                                                        {idx + 1}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <div className="text-[11px] font-black text-slate-900 sm:text-xs">{p.description}</div>
                                                                        {paymentAccount && !relatedCheck && (
                                                                            <div className="mt-0.5 text-[10px] font-bold text-slate-500 sm:text-[11px]">
                                                                                {isReceipt ? tr('تم التحصيل في', 'Received in') : tr('تم الصرف من', 'Paid from')}: {displayAccountName(paymentAccount)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {relatedCheck && (
                                                                    <div className="mt-1.5 rounded-[0.8rem] border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold text-slate-600 sm:mt-2 sm:rounded-[0.9rem] sm:px-2.5 sm:py-2 sm:text-[11px]">
                                                                        <div>{tr('رقم الشيك', 'Check #')}: {relatedCheck.checkNumber}</div>
                                                                        <div>{tr('البنك', 'Bank')}: {displayAccountName(relatedCheck.bankAccountId ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null : { id: '', name: relatedCheck.bankName })}</div>
                                                                        {relatedCheck.accountNumber && <div>{tr('رقم الحساب', 'Account #')}: {relatedCheck.accountNumber}</div>}
                                                                        <div>{tr('الاستحقاق', 'Due')}: {formatDate(relatedCheck.dueDate)}</div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="shrink-0 text-left">
                                                                <div className="text-[11px] font-black dir-ltr text-slate-900 sm:text-xs">{formatAmount(p.amount)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:mt-3 sm:gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            {canMutateDirectly && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditVoucher?.(id, type);
                                                    }}
                                                    className="inline-flex items-center justify-center gap-2 rounded-[0.85rem] border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:rounded-[0.95rem] sm:py-2.5 sm:text-xs"
                                                >
                                                    <Pencil size={16} />
                                                    {tr('تعديل', 'Edit')}
                                                </button>
                                            )}

                                            {isDraft ? (
                                                <button
                                                    onClick={(e) => handlePostGroup(id, e)}
                                                    disabled={processing}
                                                    className="inline-flex items-center justify-center gap-2 rounded-[0.85rem] bg-emerald-600 px-3 py-2 text-[11px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-[0.95rem] sm:py-2.5 sm:text-xs"
                                                >
                                                    {processing ? <Clock size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                                    {processing ? tr('جاري الترحيل...', 'Posting...') : tr('اعتماد وترحيل', 'Post voucher')}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => handleReverseGroup(parts, e)}
                                                    className="inline-flex items-center justify-center gap-2 rounded-[0.85rem] border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700 transition hover:bg-indigo-100 sm:rounded-[0.95rem] sm:py-2.5 sm:text-xs"
                                                >
                                                    <RotateCcw size={16} />
                                                    {tr('عكس القيد', 'Reverse')}
                                                </button>
                                            )}

                                            <button
                                                onClick={(e) => handlePrintVoucher(id, parts, e)}
                                                className="inline-flex items-center justify-center gap-2 rounded-[0.85rem] border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:rounded-[0.95rem] sm:py-2.5 sm:text-xs"
                                                title={tr('طباعة السند', 'Print voucher')}
                                            >
                                                <Printer size={16} />
                                                {tr('طباعة', 'Print')}
                                            </button>

                                            <button
                                                onClick={(e) => handleDeleteGroup(id, e)}
                                                disabled={!canMutateDirectly}
                                                className="inline-flex items-center justify-center gap-2 rounded-[0.85rem] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:rounded-[0.95rem] sm:py-2.5 sm:text-xs"
                                                title={tr('حذف السند', 'Delete voucher')}
                                            >
                                                <Trash2 size={16} />
                                                {tr('حذف', 'Delete')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })
                ) : (
                    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                            <Archive size={34} />
                        </div>
                        <h3 className="mt-5 text-xl font-black text-slate-900">
                            {hasActiveFilters ? tr('لا توجد نتائج مطابقة', 'No matching vouchers') : tr('لا توجد سندات لعرضها', 'No vouchers to display')}
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-7 text-slate-500">
                            {hasActiveFilters
                                ? tr('جرّب تعديل البحث أو الفلاتر لعرض السندات المطلوبة.', 'Adjust your search or filters to reveal matching vouchers.')
                                : tr(
                                    isReceipt ? 'ابدأ بإضافة أول سند قبض لعرضه هنا.' : 'ابدأ بإضافة أول سند صرف لعرضه هنا.',
                                    isReceipt ? 'Add your first receipt voucher to see it here.' : 'Add your first payment voucher to see it here.'
                                )}
                        </p>
                        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="rounded-[1.1rem] border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                    {tr('مسح الفلاتر', 'Clear filters')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onAddNew}
                                className={`${theme.button} rounded-[1.1rem] px-5 py-3 text-sm font-black text-white transition`}
                            >
                                {tr('إضافة سند جديد', 'Add New Voucher')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VoucherManager;









