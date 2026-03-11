
import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, Transaction } from '../types';
import { getDisplayAccountName, getDisplayContactName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { executeDeviceHubCommand } from '../utils/deviceHub';
import { getSelectedThermalTemplate, getThermalTemplateCustomization } from '../utils/thermalPrintTemplates';
import {
    Plus, Search, Wallet, ArrowDownLeft, ArrowUpRight,
    Calendar, User, Receipt,
    TrendingUp, Clock, Trash2, Archive, CheckCircle, Printer, RotateCcw, Pencil
} from 'lucide-react';
import EnglishDateInput from './EnglishDateInput';

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
            .sort((a, b) => new Date((b.parts[0]?.date || '')).getTime() - new Date((a.parts[0]?.date || '')).getTime());
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
        isEnglish
    ]);

    const hasActiveFilters =
        !!searchTerm.trim() ||
        statusFilter !== 'ALL' ||
        contactFilterId !== 'ALL' ||
        !!fromDateFilter ||
        !!toDateFilter ||
        !!minAmountFilter ||
        !!maxAmountFilter;

    const clearFilters = () => {
        setSearchTerm('');
        setStatusFilter('ALL');
        setContactFilterId('ALL');
        setFromDateFilter('');
        setToDateFilter('');
        setMinAmountFilter('');
        setMaxAmountFilter('');
    };

    // Total of POSTED vouchers shown in the header
    const totalPostedAmount = useMemo(() => {
        return transactions
            .filter(t => t.status === 'POSTED' && !!t.voucherId && (isReceipt ? t.type === TransactionType.INCOME : t.type === TransactionType.EXPENSE))
            .reduce((sum, t) => sum + t.amount, 0);
    }, [transactions, isReceipt]);

    const getContactName = (id?: string) => displayContactName(contacts.find(c => c.id === id) || null) || tr('غير محدد', 'Unknown');

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
            className={`app-page voucher-list-page p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`}
            dir={isEnglish ? 'ltr' : 'rtl'}
        >
            <header className="mb-6 flex justify-between items-center px-1">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">
                        {isReceipt ? tr('سندات القبض', 'Receipt Vouchers') : tr('سندات الصرف', 'Payment Vouchers')}
                    </h1>
                    <p className="text-gray-400 text-[10px] font-black mt-1 uppercase tracking-widest">
                        {tr('إدارة السيولة النقدية والمقبوضات', 'Cash flow and voucher management')}
                    </p>
                </div>
                <div className={`p-4 rounded-[1.5rem] bg-white shadow-xl border border-gray-50 ${theme.primary}`}>
                    {isReceipt ? <ArrowDownLeft size={28} /> : <ArrowUpRight size={28} />}
                </div>
            </header>

            <div className={`relative overflow-hidden rounded-[2.5rem] p-7 mb-8 shadow-2xl bg-gradient-to-br ${theme.gradient} ${theme.shadow}`}>
                <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12">
                    <Receipt size={140} className="text-white" />
                </div>
                <div className="relative z-10 text-white">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                        {tr(isReceipt ? 'إجمالي المقبوضات المرحلة' : 'إجمالي المدفوعات المرحلة', isReceipt ? 'Total Posted Receipts' : 'Total Posted Payments')}
                    </span>
                    <div className="flex items-baseline gap-2 mt-3">
                        <h2 className="text-4xl font-black dir-ltr tracking-tighter">
                            {totalPostedAmount.toLocaleString()}
                        </h2>
                        <span className="text-sm font-bold opacity-70">{baseCurrency}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-8">
                <div className="flex-1 bg-white rounded-[1.8rem] shadow-sm border border-gray-100 flex items-center p-1.5 transition-all focus-within:ring-4 focus-within:ring-blue-50">
                    <div className="p-3 text-gray-300"><Search size={20} /></div>
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={tr('بحث برقم السند أو الطرف...', 'Search by voucher number or contact...')}
                        className="flex-1 bg-transparent border-none outline-none text-sm font-bold h-11 text-gray-700"
                    />
                </div>
                <button
                    onClick={onAddNew}
                    className={`${theme.button} text-white p-4.5 rounded-[1.8rem] shadow-xl active:scale-90 transition-all`}
                >
                    <Plus size={24} />
                </button>
            </div>

            <div className="list-card bg-white rounded-[2rem] border border-gray-100 shadow-sm p-3 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'POSTED' | 'DRAFT')}
                        className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
                    >
                        <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
                        <option value="POSTED">{tr('مرحل فقط', 'Posted only')}</option>
                        <option value="DRAFT">{tr('مسودات فقط', 'Draft only')}</option>
                    </select>
                    <select
                        value={contactFilterId}
                        onChange={(e) => setContactFilterId(e.target.value)}
                        className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none"
                    >
                        <option value="ALL">{tr('كل الأطراف', 'All contacts')}</option>
                        {voucherContactOptions.map(contact => (
                            <option key={contact.id} value={contact.id}>{displayContactName(contact)}</option>
                        ))}
                    </select>
                    <EnglishDateInput
                        value={fromDateFilter}
                        onChange={setFromDateFilter}
                        displayFormat="YMD"
                        wrapperClassName="w-full"
                        className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
                        placeholder={tr('من تاريخ', 'From date')}
                    />
                    <EnglishDateInput
                        value={toDateFilter}
                        onChange={setToDateFilter}
                        displayFormat="YMD"
                        wrapperClassName="w-full"
                        className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr"
                        placeholder={tr('إلى تاريخ', 'To date')}
                    />
                    <input
                        type="text"
                        inputMode="decimal"
                        lang="en"
                        value={toEnglishDigits(minAmountFilter)}
                        onChange={(e) => setMinAmountFilter(toEnglishDigits(e.target.value))}
                        className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
                        placeholder={tr('الحد الأدنى', 'Min amount')}
                    />
                    <input
                        type="text"
                        inputMode="decimal"
                        lang="en"
                        value={toEnglishDigits(maxAmountFilter)}
                        onChange={(e) => setMaxAmountFilter(toEnglishDigits(e.target.value))}
                        className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-black outline-none dir-ltr text-right"
                        placeholder={tr('الحد الأعلى', 'Max amount')}
                    />
                </div>
                <div className="flex items-center justify-between mt-3 gap-2">
                    <span className="text-[11px] font-black text-gray-500">
                        {tr('نتائج الفلترة', 'Filtered results')}: <span className="text-slate-800">{groupedVouchers.length}</span>
                    </span>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-black"
                        >
                            {tr('مسح الفلاتر', 'Clear filters')}
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-5">
                {groupedVouchers.length > 0 ? (
                    groupedVouchers.map(({ id, parts }) => {
                        const totalAmount = parts.reduce((sum, p) => sum + p.amount, 0);
                        const isDraft = parts.some(p => p.status === 'DRAFT');
                        const isExpanded = selectedVoucherId === id;
                        const processing = isProcessing === id;
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
                            <div
                                key={id}
                                onClick={() => setSelectedVoucherId(isExpanded ? null : id)}
                                className={`list-card bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-50 group transition-all duration-300 cursor-pointer overflow-hidden ${isExpanded ? 'ring-4 ring-blue-50 shadow-xl border-blue-100' : 'hover:shadow-md hover:border-gray-200'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-4">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${isDraft ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'}`}>
                                            {isReceipt ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-black text-gray-800 text-base tracking-tight">{id}</h4>
                                                {isDraft && (
                                                    <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded font-black border border-amber-100">
                                                        {tr('مسودة', 'Draft')}
                                                    </span>
                                                )}
                                                {!isDraft && (
                                                    <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-black border border-emerald-100">
                                                        {tr('مرحل', 'Posted')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                                                <User size={12} className="text-blue-400" />
                                                {getContactName(parts[0].contactId)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-left flex flex-col items-end">
                                        <span className={`block font-black text-xl tracking-tighter dir-ltr ${isDraft ? 'text-gray-400' : isReceipt ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {totalAmount.toLocaleString()}
                                        </span>
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 font-bold uppercase">
                                            <Calendar size={12} />
                                            {formatDate(parts[0].date)}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                onClick={(e) => handlePrintVoucher(id, parts, e)}
                                                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all"
                                                title={tr('طباعة السند', 'Print Voucher')}
                                            >
                                                <Printer size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="mt-6 pt-6 border-t border-gray-100 space-y-3 animate-in slide-in-from-top-4 duration-300">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp size={14} className="text-blue-500" />
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                {tr('تفاصيل السداد والمبالغ المجزأة:', 'Payment details and split amounts:')}
                                            </p>
                                        </div>

                                        {parts.map((p, idx) => {
                                            const relatedCheck = p.checkId ? checks.find(c => c.id === p.checkId) : null;

                                            // Identify if this part is the "Payment Method" side (e.g. Cash/Bank)
                                            // In a Receipt: Debit is Cash/Bank. Credit is Customer/Income.
                                            // p.debitAccountId -> Cash/Bank Account ID
                                            const paymentAccount = isReceipt
                                                ? accounts.find(a => a.id === p.debitAccountId)
                                                : accounts.find(a => a.id === p.creditAccountId);

                                            return (
                                                <div key={idx} className="flex flex-col gap-2 bg-gray-50/50 p-3 rounded-2xl border border-gray-50 group/item hover:bg-white hover:shadow-sm transition-all mb-2">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-[10px] font-black text-gray-300 border border-gray-100">
                                                                {idx + 1}
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-black text-gray-700 block">{p.description}</span>
                                                                {paymentAccount && !relatedCheck && (
                                                                    <span className="text-[10px] font-bold text-gray-400 block mt-0.5">
                                                                        {isReceipt
                                                                            ? tr('تم الاستلام في: ', 'Received in: ')
                                                                            : tr('تم الصرف من: ', 'Paid from: ')} {displayAccountName(paymentAccount)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-sm font-black text-gray-800 dir-ltr">{p.amount.toLocaleString()}</span>
                                                    </div>

                                                    {/* Check Details */}
                                                    {relatedCheck && (
                                                        <div className="mr-11 bg-white border border-gray-100 p-2 rounded-xl text-[10px] text-gray-500 grid grid-cols-2 gap-x-4 gap-y-1">
                                                            <div><span className="font-black text-gray-700">{tr('شيك رقم:', 'Check #')} </span> {relatedCheck.checkNumber}</div>
                                                            <div><span className="font-black text-gray-700">{tr('البنك:', 'Bank:')}</span> {displayAccountName(relatedCheck.bankAccountId ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null : { id: '', name: relatedCheck.bankName })}</div>
                                                            {relatedCheck.accountNumber && <div><span className="font-black text-gray-700">{tr('رقم الحساب:', 'Account #:')}</span> {relatedCheck.accountNumber}</div>}
                                                            <div><span className="font-black text-gray-700">{tr('استحقاق:', 'Due:')}</span> {formatDate(relatedCheck.dueDate)}</div>
                                                            <div className="col-span-2 border-t border-gray-50 pt-1 mt-1">
                                                                <span className="font-black text-emerald-600">{tr('قيمة الشيك:', 'Check Amount:')}</span>{' '}
                                                                <span className="dir-ltr font-bold text-gray-800">{relatedCheck.amount.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        <div className="flex gap-3 pt-6">
                                            {canMutateDirectly && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditVoucher?.(id, type);
                                                    }}
                                                    className="flex-[2] bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95"
                                                >
                                                    <Pencil size={18} />
                                                    {tr('تعديل', 'Edit')}
                                                </button>
                                            )}
                                            {isDraft && (
                                                <button
                                                    onClick={(e) => handlePostGroup(id, e)}
                                                    disabled={processing}
                                                    className="flex-[3] bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 shadow-xl shadow-emerald-100 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                                                >
                                                    {processing ? <Clock size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                                                    {processing ? tr('جاري الترحيل...', 'Posting...') : tr('اعتماد وترحيل السند', 'Post Voucher')}
                                                </button>
                                            )}
                                            {!isDraft && (
                                                <button
                                                    onClick={(e) => handleReverseGroup(parts, e)}
                                                    className="flex-[2] bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95"
                                                >
                                                    <RotateCcw size={18} />
                                                    {tr('عكس', 'Reverse')}
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteGroup(id, e)}
                                                disabled={!canMutateDirectly}
                                                className="flex-1 bg-gray-50 text-gray-400 hover:bg-rose-50 hover:text-rose-500 py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center"
                                                title={tr('حذف السند', 'Delete voucher')}
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 flex justify-center items-center">
                                    <div className="w-12 h-1 bg-gray-100 rounded-full group-hover:bg-blue-100 transition-colors"></div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-28 bg-white rounded-[3.5rem] border border-dashed border-gray-100 animate-in fade-in">
                        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Archive size={40} className="text-gray-200" />
                        </div>
                        <h3 className="text-gray-400 font-black text-lg">{tr('لا توجد سندات لعرضها', 'No vouchers to display')}</h3>
                        <p className="text-gray-300 text-sm font-bold mt-2">
                            {tr(isReceipt ? 'ابدأ بإضافة أول سند قبض الآن' : 'ابدأ بإضافة أول سند صرف الآن', isReceipt ? 'Start by adding your first receipt voucher' : 'Start by adding your first payment voucher')}
                        </p>
                        <button
                            onClick={onAddNew}
                            className={`mt-8 px-10 py-4 rounded-2xl text-white font-black text-sm shadow-xl ${theme.button} active:scale-95 transition-all`}
                        >
                            {tr('إضافة سند جديد', 'Add New Voucher')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VoucherManager;

