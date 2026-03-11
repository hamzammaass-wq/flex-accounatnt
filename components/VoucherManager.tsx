
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
    SlidersHorizontal, X, ChevronDown, ChevronUp
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

    const getPrimaryAccountName = (parts: Transaction[]) => {
        const first = parts[0];
        if (!first) return tr('غير محدد', 'Not set');
        const account = isReceipt
            ? accounts.find(a => a.id === first.debitAccountId)
            : accounts.find(a => a.id === first.creditAccountId);
        return account ? displayAccountName(account) : tr('غير محدد', 'Not set');
    };

    const getContactName = (id?: string) => displayContactName(contacts.find(c => c.id === id) || null) || tr('طرف غير محدد', 'Unknown');

    const handlePostGroup = async (vId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(tr(
            'ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† ط§ط¹طھظ…ط§ط¯ ظˆطھط±ط­ظٹظ„ ظ‡ط°ط§ ط§ظ„ط³ظ†ط¯طں ط³ظٹطھظ… طھط­ط¯ظٹط« ط§ظ„ط£ط±طµط¯ط© ط§ظ„ظ…ط§ظ„ظٹط© ظپظˆط±ط§ظ‹.',
            'Are you sure you want to post this voucher? Account balances will be updated immediately.'
        ))) {
            setIsProcessing(vId);
            setTimeout(() => {
                const result = postVoucher(vId);
                if (!result.ok) {
                    alert(result.message);
                } else {
                    setSelectedVoucherId(null);
                    alert(tr('طھظ… طھط±ط­ظٹظ„ ط§ظ„ط³ظ†ط¯ ط¨ظ†ط¬ط§ط­', 'Voucher posted successfully.'));
                }
                setIsProcessing(null);
            }, 400);
        }
    };

    const handleDeleteGroup = (vId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(tr('ط­ط°ظپ ط§ظ„ط³ظ†ط¯ ظ†ظ‡ط§ط¦ظٹط§ظ‹طں', 'Delete this voucher permanently?'))) {
            const result = deleteVoucher(vId);
            if (!result.ok) alert(result.message);
        }
    };

    const handleReverseGroup = (parts: Transaction[], e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(tr('ط³ظٹطھظ… ط¥ظ†ط´ط§ط، ظ‚ظٹظˆط¯ ط¹ظƒط³ظٹط© ظ„ظƒظ„ ط¨ظ†ظˆط¯ ط§ظ„ط³ظ†ط¯ ط§ظ„ظ…ط±ط­ظ‘ظ„. ظ…طھط§ط¨ط¹ط©طں', 'This will create reversal entries for posted voucher lines. Continue?'))) return;

        const postedParts = parts.filter(part => part.status === 'POSTED' && !part.reversedById);
        if (postedParts.length === 0) {
            alert(tr('ظ„ط§ طھظˆط¬ط¯ ط¨ظ†ظˆط¯ ظ‚ط§ط¨ظ„ط© ظ„ظ„ط¹ظƒط³', 'No posted lines available for reversal.'));
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
            alert(`${tr('طھظ… ط¹ظƒط³ ط¬ط²ط¦ظٹ ظ…ط¹ ط£ط®ط·ط§ط،', 'Partial reversal with errors')}\n${failed.join('\n')}`);
            return;
        }

        alert(tr('طھظ… ط¥ظ†ط´ط§ط، ظ‚ظٹظˆط¯ ط§ظ„ط¹ظƒط³ ط¨ظ†ط¬ط§ط­', 'Voucher reversal entries created successfully.'));
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
            ? tr('ظ…ط±ط­ظ„', 'Posted')
            : parts.some(part => part.status === 'DRAFT')
                ? tr('ظ…ط³ظˆط¯ط©', 'Draft')
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
                  <div class="account-balance-title">${tr('ط£ط±طµط¯ط© ط§ظ„ط­ط³ط§ط¨ط§طھ ط¨ط¹ط¯ ط§ظ„ط³ظ†ط¯', 'Account balances after voucher')}</div>
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
                references.push(`${tr('ط´ظٹظƒ', 'Check')} #${relatedCheck.checkNumber}`);
                if (relatedCheck.bankName) references.push(`${tr('ط¨ظ†ظƒ', 'Bank')}: ${relatedCheck.bankName}`);
                if (relatedCheck.dueDate) references.push(`${tr('ط§ط³طھط­ظ‚ط§ظ‚', 'Due')}: ${formatDate(relatedCheck.dueDate)}`);
            }
            if (part.invoiceId) references.push(`${tr('ظپط§طھظˆط±ط©', 'Invoice')}: ${part.invoiceId}`);
            if (part.category) references.push(`${tr('طھطµظ†ظٹظپ', 'Category')}: ${part.category}`);
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
            <title>${isReceipt ? tr('ط³ظ†ط¯ ظ‚ط¨ط¶', 'Receipt Voucher') : tr('ط³ظ†ط¯ طµط±ظپ', 'Payment Voucher')} - ${voucherId}</title>
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
                <div>${isReceipt ? tr('ط³ظ†ط¯ ظ‚ط¨ط¶', 'Receipt Voucher') : tr('ط³ظ†ط¯ طµط±ظپ', 'Payment Voucher')}</div>
              </div>
              <div style="text-align:left;">
                <div>${tr('ط±ظ‚ظ… ط§ظ„ط³ظ†ط¯', 'Voucher')}: ${voucherId}</div>
                <div>${tr('ط§ظ„طھط§ط±ظٹط®', 'Date')}: ${formatDate(first.date)}</div>
                <div>${tr('ط§ظ„ط·ط±ظپ', 'Contact')}: ${escapeHtml(contactName)}</div>
              </div>
            </div>
            <div class="meta-grid">
              <div class="meta-card"><span class="k">${tr('ط§ظ„ط­ط§ظ„ط©', 'Status')}</span><span class="v">${voucherStatus}</span></div>
              <div class="meta-card"><span class="k">${tr('ط§ظ„ط¹ظ…ظ„ط©', 'Currency')}</span><span class="v">${escapeHtml(currency)}</span></div>
              <div class="meta-card"><span class="k">${tr('ط³ط¹ط± ط§ظ„طµط±ظپ', 'Exchange Rate')}</span><span class="v">${exchangeRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span></div>
              <div class="meta-card"><span class="k">${tr('ط¹ط¯ط¯ ط§ظ„ط¨ظ†ظˆط¯', 'Lines')}</span><span class="v">${parts.length}</span></div>
              <div class="meta-card" style="grid-column: span 4;"><span class="k">${tr('طھظپط§طµظٹظ„ ط§ظ„ط·ط±ظپ', 'Contact details')}</span><span class="v">${escapeHtml(contactName)}${contact?.phone ? ` - ${escapeHtml(contact.phone)}` : ''}</span></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th style="text-align:right;">${tr('ط§ظ„ط¨ظٹط§ظ†', 'Description')}</th>
                  <th style="text-align:right;">${tr(isReceipt ? 'ط­ط³ط§ط¨ ط§ظ„طھط­طµظٹظ„' : 'ط­ط³ط§ط¨ ط§ظ„ط¯ظپط¹', isReceipt ? 'Receipt Account' : 'Payment Account')}</th>
                  <th style="text-align:right;">${tr('ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ…ظ‚ط§ط¨ظ„', 'Counter Account')}</th>
                  <th style="text-align:right;">${tr('ط§ظ„ظ…ط±ط¬ط¹/ط§ظ„طھظپط§طµظٹظ„', 'Reference / Details')}</th>
                  <th>${tr('ط§ظ„ظ…ط¨ظ„ط؛', 'Amount')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <h3 style="text-align:left; margin-top:16px;">${tr('ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ', 'Total')}: ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}</h3>
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
            alert(tr('طھط¹ط°ط± ظپطھط­ ظ†ط§ظپط°ط© ط§ظ„ط·ط¨ط§ط¹ط©. ظٹط±ط¬ظ‰ ط§ظ„ط³ظ…ط§ط­ ط¨ط§ظ„ظ†ظˆط§ظپط° ط§ظ„ظ…ظ†ط¨ط«ظ‚ط©.', 'Unable to open print window. Please allow pop-ups.'));
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
            (customization.headerText || companySettings.name) || (isReceipt ? tr('ط³ظ†ط¯ ظ‚ط¨ط¶', 'Receipt Voucher') : tr('ط³ظ†ط¯ طµط±ظپ', 'Payment Voucher')),
            `${isReceipt ? tr('ط³ظ†ط¯ ظ‚ط¨ط¶', 'Receipt Voucher') : tr('ط³ظ†ط¯ طµط±ظپ', 'Payment Voucher')} - ${voucherId}`,
            `${tr('ط§ظ„طھط§ط±ظٹط®', 'Date')}: ${first ? formatDate(first.date) : '-'}`,
            `${tr('ط§ظ„ط·ط±ظپ', 'Contact')}: ${contactName}`,
            '----------------------------------------',
            ...partLines,
            ...(isCompactTemplate && parts.length > partLines.length
                ? [`... ${tr('ط¨ظ†ظˆط¯ ط¥ط¶ط§ظپظٹط©', 'More lines')}: ${parts.length - partLines.length}`]
                : []),
            '----------------------------------------',
            `${tr('ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ', 'Total')}: ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${first?.currency || baseCurrency}`,
            customization.footerText ? customization.footerText : '',
            ...(customization.showPrintedAt ? [`${tr('طھط§ط±ظٹط® ط§ظ„ط·ط¨ط§ط¹ط©', 'Printed')}: ${new Date().toLocaleString('en-GB')}`] : [])
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
            alert(tr('طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط³ظ†ط¯ ظ„ظ„ط·ط§ط¨ط¹ط© ط§ظ„ط­ط±ط§ط±ظٹط© ط¨ظ†ط¬ط§ط­.', 'Voucher sent to thermal printer successfully.'));
            return;
        }
        if (result.queued) {
            alert(tr('طھط¹ط°ط± ط§ظ„ط·ط¨ط§ط¹ط© ط§ظ„ظ…ط¨ط§ط´ط±ط©. طھظ…طھ ط¥ط¶ط§ظپط© ط§ظ„ظ…ظ‡ظ…ط© ط¥ظ„ظ‰ ط§ظ„ط·ط§ط¨ظˆط±.', 'Direct print failed. Job was queued.'));
            return;
        }
        printVoucherBrowser(voucherId, parts);
    };

    return (
        <div
            className={`app-page voucher-list-page p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`}
            dir={isEnglish ? 'ltr' : 'rtl'}
        >
            <section className="mb-4 rounded-[1.8rem] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                            {tr('الصفحة الحالية', 'Current page')}
                        </p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                            {isReceipt ? tr('سندات القبض', 'Receipt Vouchers') : tr('سندات الصرف', 'Payment Vouchers')}
                        </h1>
                    </div>

                    <div className={`rounded-[1.3rem] border px-4 py-3 ${isReceipt ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {tr('إجمالي السندات المرحلة', 'Posted vouchers total')}
                        </p>
                        <div className="mt-2 flex items-end gap-2">
                            <span className={`text-2xl font-black dir-ltr ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {formatAmount(totalPostedAmount)}
                            </span>
                            <span className="pb-1 text-sm font-bold text-slate-500">{baseCurrency}</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mb-4 rounded-[1.8rem] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-center rounded-[1.3rem] border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-slate-300 focus-within:bg-white">
                        <Search size={18} className="shrink-0 text-slate-400" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={tr('ابحث برقم السند أو الطرف...', 'Search by voucher number or contact...')}
                            className="min-w-0 flex-1 bg-transparent px-3 text-sm font-bold text-slate-700 outline-none"
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

                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-[auto_auto]">
                        <button
                            type="button"
                            onClick={() => setIsFilterDialogOpen(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                            <SlidersHorizontal size={18} />
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
                            className={`${theme.button} inline-flex items-center justify-center gap-2 rounded-[1.25rem] px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.98]`}
                        >
                            <Plus size={18} />
                            <span>{tr('إضافة سند', 'Add voucher')}</span>
                        </button>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
                        {tr('النتائج', 'Results')}: {groupedVouchers.length}
                    </span>
                    {hasAdvancedFilters && (
                        <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${isReceipt ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
                            {tr('فلاتر نشطة', 'Active filters')}: {activeAdvancedFilterCount}
                        </span>
                    )}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
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

            <div className="space-y-5">
                {groupedVouchers.length > 0 ? (
                    groupedVouchers.map(({ id, parts }) => {
                        const totalAmount = parts.reduce((sum, p) => sum + p.amount, 0);
                        const isDraft = parts.some(p => p.status === 'DRAFT');
                        const isExpanded = selectedVoucherId === id;
                        const processing = isProcessing === id;
                        const firstPart = parts[0];
                        const previewText = getVoucherPreview(parts);
                        const primaryAccountName = getPrimaryAccountName(parts);
                        const hasChecks = parts.some(part => !!part.checkId);
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
                                className={`list-card overflow-hidden rounded-[1.8rem] border bg-white shadow-sm transition ${isExpanded ? 'border-slate-300 ring-4 ring-slate-100' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div
                                    onClick={() => setSelectedVoucherId(isExpanded ? null : id)}
                                    className="cursor-pointer p-4 sm:p-5"
                                >
                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`rounded-full px-3 py-1 text-[11px] font-black ${isDraft ? 'border border-amber-200 bg-amber-50 text-amber-700' : isReceipt ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'border border-rose-100 bg-rose-50 text-rose-700'}`}>
                                                        {isDraft ? tr('مسودة', 'Draft') : tr('مرحل', 'Posted')}
                                                    </span>
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-500">
                                                        {id}
                                                    </span>
                                                </div>

                                                <div className="mt-3 flex items-start gap-3">
                                                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] ${isReceipt ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {isReceipt ? <ArrowDownLeft size={22} /> : <ArrowUpRight size={22} />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                            <User size={13} />
                                                            <span>{tr('الطرف', 'Contact')}</span>
                                                        </div>
                                                        <div className="mt-1 text-base font-black text-slate-900">
                                                            {getContactName(firstPart?.contactId)}
                                                        </div>
                                                        <div className="mt-1 text-sm font-bold leading-6 text-slate-500">
                                                            {previewText}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={`rounded-[1.3rem] border px-4 py-3 ${isDraft ? 'border-slate-200 bg-slate-50' : isReceipt ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
                                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                    {tr('قيمة السند', 'Voucher amount')}
                                                </div>
                                                <div className={`mt-2 text-2xl font-black dir-ltr ${isDraft ? 'text-slate-600' : isReceipt ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    {formatAmount(totalAmount)}
                                                </div>
                                                <div className="mt-1 text-sm font-bold text-slate-500">
                                                    {firstPart?.currency || baseCurrency}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                    <Calendar size={13} />
                                                    <span>{tr('التاريخ', 'Date')}</span>
                                                </div>
                                                <div className="mt-2 text-sm font-black text-slate-800">{formatDate(firstPart?.date) || '-'}</div>
                                            </div>

                                            <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                    <Receipt size={13} />
                                                    <span>{tr('الحساب', 'Account')}</span>
                                                </div>
                                                <div className="mt-2 truncate text-sm font-black text-slate-800">{primaryAccountName}</div>
                                            </div>

                                            <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                    <TrendingUp size={13} />
                                                    <span>{tr('البنود', 'Lines')}</span>
                                                </div>
                                                <div className="mt-2 text-sm font-black text-slate-800">
                                                    {hasChecks ? tr(`${parts.length} بند مع شيكات`, `${parts.length} lines with checks`) : tr(`${parts.length} بند`, `${parts.length} lines`)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                            <button
                                                onClick={(e) => handlePrintVoucher(id, parts, e)}
                                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                                title={tr('طباعة السند', 'Print voucher')}
                                            >
                                                <Printer size={14} />
                                                <span>{tr('طباعة', 'Print')}</span>
                                            </button>

                                            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                                <span>{isExpanded ? tr('إخفاء التفاصيل', 'Hide details') : tr('عرض التفاصيل', 'View details')}</span>
                                                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/80 p-4 sm:p-5">
                                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                            <TrendingUp size={14} className={isReceipt ? 'text-emerald-600' : 'text-rose-600'} />
                                            <span>{tr('تفاصيل السند', 'Voucher details')}</span>
                                        </div>

                                        <div className="mt-3 space-y-2.5">
                                            {parts.map((p, idx) => {
                                                const relatedCheck = p.checkId ? checks.find(c => c.id === p.checkId) : null;
                                                const paymentAccount = isReceipt
                                                    ? accounts.find(a => a.id === p.debitAccountId)
                                                    : accounts.find(a => a.id === p.creditAccountId);

                                                return (
                                                    <div key={idx} className="rounded-[1.2rem] border border-slate-200 bg-white p-3 shadow-sm">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] font-black text-slate-500">
                                                                        {idx + 1}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-black text-slate-900">{p.description}</div>
                                                                        {paymentAccount && !relatedCheck && (
                                                                            <div className="mt-1 text-xs font-bold text-slate-500">
                                                                                {isReceipt ? tr('تم التحصيل في', 'Received in') : tr('تم الصرف من', 'Paid from')}: {displayAccountName(paymentAccount)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {relatedCheck && (
                                                                    <div className="mt-3 rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                                                                        <div>{tr('رقم الشيك', 'Check #')}: {relatedCheck.checkNumber}</div>
                                                                        <div>{tr('البنك', 'Bank')}: {displayAccountName(relatedCheck.bankAccountId ? accounts.find(a => a.id === relatedCheck.bankAccountId) || null : { id: '', name: relatedCheck.bankName })}</div>
                                                                        {relatedCheck.accountNumber && <div>{tr('رقم الحساب', 'Account #')}: {relatedCheck.accountNumber}</div>}
                                                                        <div>{tr('الاستحقاق', 'Due')}: {formatDate(relatedCheck.dueDate)}</div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="shrink-0 text-left">
                                                                <div className="text-sm font-black dir-ltr text-slate-900">{formatAmount(p.amount)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            {canMutateDirectly && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditVoucher?.(id, type);
                                                    }}
                                                    className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                                >
                                                    <Pencil size={16} />
                                                    {tr('تعديل', 'Edit')}
                                                </button>
                                            )}

                                            {isDraft ? (
                                                <button
                                                    onClick={(e) => handlePostGroup(id, e)}
                                                    disabled={processing}
                                                    className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {processing ? <Clock size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                                    {processing ? tr('جاري الترحيل...', 'Posting...') : tr('اعتماد وترحيل', 'Post voucher')}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => handleReverseGroup(parts, e)}
                                                    className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700 transition hover:bg-indigo-100"
                                                >
                                                    <RotateCcw size={16} />
                                                    {tr('عكس القيد', 'Reverse')}
                                                </button>
                                            )}

                                            <button
                                                onClick={(e) => handleDeleteGroup(id, e)}
                                                disabled={!canMutateDirectly}
                                                className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
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









