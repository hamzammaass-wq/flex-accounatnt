import React, { useMemo, useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { CheckStatus, CheckType, TransactionType } from '../types';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayAccountName, getDisplayContactName } from '../utils/displayNames';
import {
    AlertTriangle,
    ArrowRightLeft,
    ArrowUpRight,
    Banknote,
    Building2,
    Calendar,
    CheckCircle,
    Image as ImageIcon,
    Info,
    Plus,
    Printer,
    ScrollText,
    Search,
    Wallet,
    X,
    XCircle
} from 'lucide-react';

const CheckPortfolio: React.FC = () => {
    const {
        checks,
        addCheck,
        updateCheck,
        contacts,
        accounts,
        addTransaction,
        transactions,
        baseCurrency,
        companySettings
    } = useAccounting();

    const [activeTab, setActiveTab] = useState<'VAULT' | 'OUTGOING' | 'UNDER_COLLECTION' | 'ENDORSED' | 'BOUNCED' | 'ARCHIVE'>('VAULT');
    const [quickFilter, setQuickFilter] = useState<'ALL' | 'DEPOSITED' | 'ENDORSED' | 'BOUNCED' | 'DUE_TODAY'>('ALL');
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [showClearModal, setShowClearModal] = useState<string | null>(null);
    const [clearAccountId, setClearAccountId] = useState('');

    const [showBounceModal, setShowBounceModal] = useState<string | null>(null);

    const [showDepositModal, setShowDepositModal] = useState<string | null>(null);
    const [depositBankId, setDepositBankId] = useState('');
    const [showCheckDetailsId, setShowCheckDetailsId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);

    const [checkType, setCheckType] = useState<CheckType>('INCOMING');
    const [checkNumber, setCheckNumber] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
    const [contactId, setContactId] = useState('');
    const [notes, setNotes] = useState('');

    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayBankName = (bankName: string, bankAccountId?: string) => {
        const linkedAccount = bankAccountId ? accounts.find(a => a.id === bankAccountId) : undefined;
        if (linkedAccount) return displayAccountName(linkedAccount);
        return getDisplayAccountName({ id: bankAccountId || '', name: bankName }, isEnglish);
    };
    const todayIso = new Date().toISOString().split('T')[0];
    const formatDate = (value?: string) => {
        if (!value) return '-';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB');
    };
    const escapeHtml = (value: string) =>
        String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const getCheckImageUrls = (check: { imageUrls?: string[]; imageUrl?: string }) => {
        if (Array.isArray(check.imageUrls) && check.imageUrls.length > 0) {
            return check.imageUrls.filter(Boolean).slice(0, 2);
        }
        return check.imageUrl ? [check.imageUrl] : [];
    };

    const getContactName = (id?: string) => {
        if (!id) return tr('غير محدد', 'Unknown');
        const contact = contacts.find(c => c.id === id);
        return displayContactName(contact || null) || tr('طرف غير معروف', 'Unknown contact');
    };
    const getAccountNameById = (id?: string) => {
        if (!id) return tr('غير محدد', 'Unknown');
        const acc = accounts.find(a => a.id === id);
        return displayAccountName(acc || null) || id;
    };

    const getStatusLabel = (status: CheckStatus) => {
        switch (status) {
            case 'PENDING': return tr('قيد الانتظار', 'Pending');
            case 'CLEARED': return tr('تم التحصيل/الصرف', 'Cleared');
            case 'BOUNCED': return tr('مرتجع (بدون رصيد)', 'Bounced');
            case 'UNDER_COLLECTION': return tr('برسم التحصيل', 'Under Collection');
            case 'ENDORSED': return tr('مجير', 'Endorsed');
            case 'CANCELLED': return tr('ملغى', 'Cancelled');
            default: return status;
        }
    };

    const getStatusStyle = (status: CheckStatus) => {
        switch (status) {
            case 'PENDING': return 'bg-amber-50 text-amber-600 border-amber-200';
            case 'CLEARED': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
            case 'BOUNCED': return 'bg-rose-50 text-rose-600 border-rose-200';
            case 'UNDER_COLLECTION': return 'bg-blue-50 text-blue-600 border-blue-200';
            case 'ENDORSED': return 'bg-purple-50 text-purple-600 border-purple-200';
            case 'CANCELLED': return 'bg-slate-50 text-slate-500 border-slate-200';
            default: return 'bg-gray-50 text-gray-600';
        }
    };

    const getBounceSettlementLabel = (check: { status: CheckStatus; bounceSettlementStatus?: 'UNPAID' | 'PAID' }) => {
        if (check.status !== 'BOUNCED') return '';
        return check.bounceSettlementStatus === 'PAID'
            ? tr('مرتجع - مسدد', 'Bounced - Settled')
            : tr('مرتجع - غير مسدد', 'Bounced - Unsettled');
    };

    const getBounceSettlementStyle = (check: { status: CheckStatus; bounceSettlementStatus?: 'UNPAID' | 'PAID' }) => {
        if (check.status !== 'BOUNCED') return '';
        return check.bounceSettlementStatus === 'PAID'
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
            : 'bg-rose-50 text-rose-600 border-rose-200';
    };

    const stats = useMemo(() => {
        const incomingPending = checks
            .filter(c => c.type === 'INCOMING' && c.status === 'PENDING')
            .reduce((sum, c) => sum + c.amount, 0);
        const outgoingPending = checks
            .filter(c => c.type === 'OUTGOING' && c.status === 'PENDING')
            .reduce((sum, c) => sum + c.amount, 0);
        const underCollection = checks
            .filter(c => c.status === 'UNDER_COLLECTION')
            .reduce((sum, c) => sum + c.amount, 0);
        const bouncedAmount = checks
            .filter(c => c.status === 'BOUNCED')
            .reduce((sum, c) => sum + c.amount, 0);
        const bouncedPaidCount = checks.filter(c => c.status === 'BOUNCED' && c.bounceSettlementStatus === 'PAID').length;
        const bouncedUnpaidCount = checks.filter(c => c.status === 'BOUNCED' && c.bounceSettlementStatus !== 'PAID').length;

        return { incomingPending, outgoingPending, underCollection, bouncedAmount, bouncedPaidCount, bouncedUnpaidCount };
    }, [checks]);

    const filteredChecks = checks.filter(c => {
        const matchesSearch =
            c.checkNumber.includes(searchTerm) ||
            c.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            displayBankName(c.bankName, c.bankAccountId).toLowerCase().includes(searchTerm.toLowerCase()) ||
            getContactName(c.contactId).toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (activeTab === 'VAULT') return c.type === 'INCOMING' && c.status === 'PENDING';
        if (activeTab === 'OUTGOING') return c.type === 'OUTGOING' && c.status === 'PENDING';
        if (activeTab === 'UNDER_COLLECTION') return c.status === 'UNDER_COLLECTION';
        if (activeTab === 'ENDORSED') return c.status === 'ENDORSED';
        if (activeTab === 'BOUNCED') return c.status === 'BOUNCED';
        const matchesTab = ['CLEARED', 'BOUNCED', 'CANCELLED'].includes(c.status);
        return matchesTab;
    }).filter(c => {
        if (quickFilter === 'ALL') return true;
        if (quickFilter === 'DEPOSITED') return Boolean(c.depositedBankId);
        if (quickFilter === 'ENDORSED') return c.status === 'ENDORSED' || Boolean(c.endorseeContactId || c.endorseeName);
        if (quickFilter === 'BOUNCED') return c.status === 'BOUNCED';
        if (quickFilter === 'DUE_TODAY') return c.dueDate === todayIso && c.status !== 'CANCELLED';
        return true;
    });

    const financialAccounts = useMemo(() => {
        return accounts.filter(a => !a.isGroup && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root'));
    }, [accounts]);

    const bankAccounts = useMemo(() => {
        return accounts.filter(a => !a.isGroup && a.parentId === 'acc_bank_root');
    }, [accounts]);

    const resetForm = () => {
        setCheckType('INCOMING');
        setCheckNumber('');
        setBankName('');
        setAccountNumber('');
        setAmount('');
        setDueDate('');
        setIssueDate(new Date().toISOString().split('T')[0]);
        setContactId('');
        setNotes('');
    };

    const handleAddCheck = (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkNumber || !amount || !dueDate) return;

        const checkAmount = parseFloat(amount);
        const isIncoming = checkType === 'INCOMING';
        const contact = contacts.find(c => c.id === contactId);
        const contactName = displayContactName(contact || null) || tr('غير محدد', 'Unknown');
        const newCheckId = `chk_${Math.random().toString(36).slice(2, 11)}`;

        addCheck({
            id: newCheckId,
            checkNumber,
            bankName,
            accountNumber,
            amount: checkAmount,
            currency: baseCurrency,
            dueDate,
            issueDate,
            type: checkType,
            status: 'PENDING',
            contactId,
            originalContactId: isIncoming ? contactId : undefined,
            description: notes
        });

        addTransaction({
            amount: checkAmount,
            description: `${isIncoming ? tr('استلام', 'Received') : tr('تحرير', 'Issued')} ${tr('شيك رقم', 'Check #')} ${checkNumber} - ${tr('استحقاق', 'Due')} ${dueDate} - ${contactName}${notes ? ` (${notes})` : ''}`,
            category: 'journal',
            type: isIncoming ? TransactionType.INCOME : TransactionType.EXPENSE,
            date: issueDate,
            debitAccountId: isIncoming ? 'acc_cheques_hand' : 'acc_payable',
            creditAccountId: isIncoming ? 'acc_receivable' : 'acc_notes_payable',
            checkId: newCheckId,
            contactId,
            currency: baseCurrency,
            exchangeRate: 1,
            status: 'POSTED'
        });

        setShowForm(false);
        resetForm();
    };

    const confirmClear = (e: React.FormEvent) => {
        e.preventDefault();
        if (!showClearModal || !clearAccountId) return;

        const check = checks.find(c => c.id === showClearModal);
        if (!check) return;

        const targetAccount = accounts.find(a => a.id === clearAccountId);
        const isIncoming = check.type === 'INCOMING';

        addTransaction({
            amount: check.amount,
            description: `${isIncoming ? tr('تحصيل', 'Collection') : tr('صرف', 'Payment')} ${tr('شيك رقم', 'Check #')} ${check.checkNumber} - ${displayAccountName(targetAccount || null)}`,
            category: 'journal',
            type: isIncoming ? TransactionType.INCOME : TransactionType.EXPENSE,
            date: new Date().toISOString().split('T')[0],
            debitAccountId: isIncoming ? clearAccountId : 'acc_notes_payable',
            creditAccountId: isIncoming ? 'acc_cheques_hand' : clearAccountId,
            checkId: check.id,
            currency: check.currency,
            exchangeRate: 1,
            status: 'POSTED'
        });

        updateCheck(showClearModal, { status: 'CLEARED' });
        setShowClearModal(null);
        setClearAccountId('');
    };

    const confirmBounce = () => {
        if (!showBounceModal) return;
        const check = checks.find(c => c.id === showBounceModal);
        if (!check) return;

        updateCheck(showBounceModal, {
            status: 'BOUNCED',
            bounceSettlementStatus: 'UNPAID',
            bounceSettlementDate: undefined,
            bounceSettlementNote: undefined
        });

        const isIncoming = check.type === 'INCOMING';
        const contactName = getContactName(check.contactId);

        addTransaction({
            amount: check.amount,
            description: `${tr('شيك مرتجع رقم', 'Bounced check #')} ${check.checkNumber} - ${contactName} - (${tr('عكس قيد', 'Reversal Entry')})`,
            category: 'journal',
            type: TransactionType.TRANSFER,
            date: new Date().toISOString().split('T')[0],
            debitAccountId: isIncoming ? 'acc_receivable' : 'acc_notes_payable',
            creditAccountId: isIncoming ? 'acc_cheques_hand' : 'acc_payable',
            checkId: check.id,
            contactId: check.contactId,
            currency: check.currency,
            exchangeRate: 1,
            status: 'POSTED'
        });

        setShowBounceModal(null);
    };

    const toggleBouncedSettlement = (checkId: string) => {
        const check = checks.find(c => c.id === checkId);
        if (!check || check.status !== 'BOUNCED') return;
        const nextIsPaid = check.bounceSettlementStatus !== 'PAID';
        updateCheck(checkId, {
            bounceSettlementStatus: nextIsPaid ? 'PAID' : 'UNPAID',
            bounceSettlementDate: nextIsPaid ? new Date().toISOString().split('T')[0] : undefined,
        });
    };

    const handleDepositCheck = (e: React.FormEvent) => {
        e.preventDefault();
        if (!showDepositModal || !depositBankId) return;

        const check = checks.find(c => c.id === showDepositModal);
        if (!check) return;

        const bankAccount = accounts.find(a => a.id === depositBankId);

        addTransaction({
            amount: check.amount,
            description: `${tr('إيداع شيك رقم', 'Deposit check #')} ${check.checkNumber} ${tr('برسم التحصيل في', 'under collection at')} ${displayAccountName(bankAccount || null)}`,
            category: 'journal',
            type: TransactionType.TRANSFER,
            date: new Date().toISOString().split('T')[0],
            debitAccountId: 'acc_cheques_under_collection',
            creditAccountId: 'acc_cheques_hand',
            checkId: check.id,
            contactId: check.contactId,
            currency: check.currency,
            exchangeRate: 1,
            status: 'POSTED'
        });

        updateCheck(showDepositModal, {
            status: 'UNDER_COLLECTION',
            depositedBankId: depositBankId
        });

        setShowDepositModal(null);
        setDepositBankId('');
    };

    const tabLabels: Array<{ id: 'VAULT' | 'OUTGOING' | 'UNDER_COLLECTION' | 'ENDORSED' | 'BOUNCED' | 'ARCHIVE'; label: string; icon: React.ReactNode }> = [
        { id: 'VAULT', label: tr('في الصندوق', 'In Vault'), icon: <Wallet size={14} /> },
        { id: 'OUTGOING', label: tr('شيكات صادرة', 'Outgoing Checks'), icon: <ArrowUpRight size={14} /> },
        { id: 'UNDER_COLLECTION', label: tr('برسم التحصيل', 'Under Collection'), icon: <Building2 size={14} /> },
        { id: 'ENDORSED', label: tr('شيكات مجيرة', 'Endorsed Checks'), icon: <ArrowRightLeft size={14} /> },
        { id: 'BOUNCED', label: tr('شيكات مرتجعة', 'Bounced Checks'), icon: <XCircle size={14} /> },
        { id: 'ARCHIVE', label: tr('الأرشيف', 'Archive'), icon: <ScrollText size={14} /> }
    ];

    const getRelatedTransactionsForCheck = (checkId: string) => {
        const check = checks.find(c => c.id === checkId);
        if (!check) return [];
        return transactions
            .filter(t => {
                if (t.checkId === checkId) return true;
                if (!t.description) return false;
                return t.description.includes(check.checkNumber);
            })
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.id.localeCompare(b.id);
            });
    };

    const getCheckFlowSummary = (checkId: string) => {
        const check = checks.find(c => c.id === checkId);
        if (!check) return null;

        const related = getRelatedTransactionsForCheck(checkId);
        const depositTx = related.find(t =>
            (t.description || '').includes(check.checkNumber) &&
            ((t.description || '').includes('إيداع') || (t.debitAccountId === 'acc_cheques_under_collection'))
        );
        const bounceTx = related.find(t => (t.description || '').includes('مرتجع') || (t.description || '').toLowerCase().includes('bounced'));
        const clearTx = [...related].reverse().find(t => {
            if (check.type === 'INCOMING') {
                return t.creditAccountId === 'acc_cheques_hand' || t.creditAccountId === 'acc_cheques_under_collection';
            }
            return t.debitAccountId === 'acc_notes_payable';
        });

        const endorseeName = check.endorseeContactId ? getContactName(check.endorseeContactId) : (check.endorseeName || '');
        const depositedBankName = check.depositedBankId ? getAccountNameById(check.depositedBankId) : '';

        return {
            check,
            related,
            depositTx,
            bounceTx,
            clearTx,
            sourceContactName: check.type === 'INCOMING' ? getContactName(check.originalContactId || check.contactId) : '',
            primaryContactName: getContactName(check.contactId),
            endorseeName,
            depositedBankName
        };
    };
    const buildCheckTimeline = (checkId: string) => {
        const data = getCheckFlowSummary(checkId);
        if (!data) return [];
        const { check, depositedBankName, endorseeName, clearTx, bounceTx } = data;
        const events: Array<{ key: string; date: string; title: string; detail: string; tone: 'slate' | 'blue' | 'emerald' | 'rose' | 'purple' }> = [];

        events.push({
            key: 'created',
            date: check.issueDate,
            title: check.type === 'INCOMING' ? tr('قبض شيك', 'Check Receipt') : tr('تحرير شيك', 'Check Issuance'),
            detail: check.type === 'INCOMING'
                ? `${tr('تم القبض من', 'Received from')} ${getContactName(check.originalContactId || check.contactId)}`
                : `${tr('تم الصرف/التحرير لصالح', 'Issued to')} ${getContactName(check.contactId)}`,
            tone: 'slate'
        });

        if (depositedBankName) {
            events.push({
                key: 'deposit',
                date: data.depositTx?.date || check.issueDate,
                title: tr('إيداع بالبنك (برسم التحصيل)', 'Deposited to bank (under collection)'),
                detail: `${tr('البنك', 'Bank')}: ${depositedBankName}`,
                tone: 'blue'
            });
        }

        if (endorseeName) {
            events.push({
                key: 'endorsed',
                date: check.dueDate || check.issueDate,
                title: tr('تجيير الشيك', 'Check endorsement'),
                detail: `${tr('تم التجيير إلى', 'Endorsed to')} ${endorseeName}`,
                tone: 'purple'
            });
        }

        if (check.status === 'CLEARED') {
            const finalAccountId = check.type === 'INCOMING' ? clearTx?.debitAccountId : clearTx?.creditAccountId;
            events.push({
                key: 'cleared',
                date: clearTx?.date || check.dueDate || check.issueDate,
                title: check.type === 'INCOMING' ? tr('تم التحصيل', 'Collected') : tr('تم الصرف', 'Paid'),
                detail: finalAccountId
                    ? `${tr('الحساب النهائي', 'Final account')}: ${getAccountNameById(finalAccountId)}`
                    : tr('تمت التسوية المالية للشيك', 'Check financial settlement completed'),
                tone: 'emerald'
            });
        }

        if (check.status === 'BOUNCED' || bounceTx) {
            events.push({
                key: 'bounced',
                date: bounceTx?.date || check.dueDate || check.issueDate,
                title: tr('شيك مرتجع', 'Bounced check'),
                detail: tr('تم عكس الأثر المحاسبي وإعادة الرصيد للطرف المعني', 'Accounting effect was reversed and balance restored to related party'),
                tone: 'rose'
            });
        }

        if (check.status === 'BOUNCED' && check.bounceSettlementStatus === 'PAID') {
            events.push({
                key: 'bounce-settled',
                date: check.bounceSettlementDate || check.dueDate || check.issueDate,
                title: tr('تسوية الشيك المرتجع', 'Bounced check settlement'),
                detail: tr('تم سداد/تسوية قيمة الشيك المرتجع', 'Bounced check amount was settled/paid'),
                tone: 'emerald'
            });
        }

        if (check.status === 'CANCELLED') {
            events.push({
                key: 'cancelled',
                date: check.dueDate || check.issueDate,
                title: tr('إلغاء الشيك', 'Check cancelled'),
                detail: tr('تم إلغاء الشيك', 'The check was cancelled'),
                tone: 'slate'
            });
        }

        const toneClass: Record<typeof events[number]['tone'], string> = {
            slate: 'bg-slate-50 border-slate-100 text-slate-700',
            blue: 'bg-blue-50 border-blue-100 text-blue-700',
            emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
            rose: 'bg-rose-50 border-rose-100 text-rose-700',
            purple: 'bg-purple-50 border-purple-100 text-purple-700'
        };

        return events
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(event => ({ ...event, toneClass: toneClass[event.tone] }));
    };

    const handlePrintCheckReport = (checkId: string) => {
        const data = getCheckFlowSummary(checkId);
        if (!data) return;
        const { check, related, sourceContactName, primaryContactName, endorseeName, depositedBankName, clearTx } = data;
        const finalSettlementAccount = check.type === 'INCOMING' ? clearTx?.debitAccountId : clearTx?.creditAccountId;
        const timeline = buildCheckTimeline(checkId);
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (!printWindow) {
            alert(tr('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
            return;
        }

        const timelineRows = timeline.length > 0
            ? timeline.map((step, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(formatDate(step.date))}</td>
                    <td>${escapeHtml(step.title)}</td>
                    <td>${escapeHtml(step.detail)}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="4" class="muted">${escapeHtml(tr('لا يوجد تسلسل حركة مسجل', 'No timeline events recorded'))}</td></tr>`;

        const relatedRows = related.length > 0
            ? related.map((t, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(formatDate(t.date))}</td>
                    <td>${escapeHtml(t.category || '-')}</td>
                    <td>${escapeHtml(t.description || '-')}</td>
                    <td>${escapeHtml(getAccountNameById(t.debitAccountId))}</td>
                    <td>${escapeHtml(getAccountNameById(t.creditAccountId))}</td>
                    <td class="num">${escapeHtml(t.amount.toLocaleString())} ${escapeHtml(t.currency || '')}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="7" class="muted">${escapeHtml(tr('لا توجد قيود مرتبطة بهذا الشيك', 'No related entries for this check'))}</td></tr>`;

        const html = `
            <!doctype html>
            <html lang="${isEnglish ? 'en' : 'ar'}" dir="${isEnglish ? 'ltr' : 'rtl'}">
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtml(tr('تقرير الشيك', 'Check Report'))} #${escapeHtml(check.checkNumber)}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
                    .head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:14px; }
                    h1 { margin:0; font-size:22px; }
                    .sub { color:#6b7280; font-size:12px; margin-top:4px; }
                    .grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; margin-bottom:14px; }
                    .card { border:1px solid #e5e7eb; border-radius:10px; padding:10px; background:#f9fafb; }
                    .lbl { color:#6b7280; font-size:11px; margin-bottom:4px; font-weight:700; }
                    .val { font-weight:800; font-size:13px; }
                    table { width:100%; border-collapse:collapse; margin-top:8px; }
                    th, td { border:1px solid #e5e7eb; padding:7px; font-size:11px; vertical-align:top; }
                    th { background:#f3f4f6; }
                    .num { direction:ltr; text-align:right; font-weight:700; }
                    .sec { margin-top:14px; }
                    .sec h2 { margin:0 0 8px; font-size:14px; }
                    .muted { color:#6b7280; text-align:center; padding:12px; }
                    @media print { body { margin: 8px; } }
                </style>
            </head>
            <body>
                <div class="head">
                    <div>
                        <h1>${escapeHtml(tr('تقرير الشيك', 'Check Report'))} #${escapeHtml(check.checkNumber)}</h1>
                        <div class="sub">${escapeHtml(companySettings.name || '---')}</div>
                    </div>
                    <div class="sub">
                        <div>${escapeHtml(tr('تاريخ الطباعة', 'Printed At'))}: ${escapeHtml(new Date().toLocaleString(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn'))}</div>
                    </div>
                </div>

                <div class="grid">
                    <div class="card"><div class="lbl">${escapeHtml(tr('نوع الشيك', 'Check Type'))}</div><div class="val">${escapeHtml(check.type === 'INCOMING' ? tr('وارد', 'Incoming') : tr('صادر', 'Outgoing'))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('الحالة', 'Status'))}</div><div class="val">${escapeHtml(getStatusLabel(check.status))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('المبلغ', 'Amount'))}</div><div class="val">${escapeHtml(check.amount.toLocaleString())} ${escapeHtml(check.currency)}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('البنك', 'Bank'))}</div><div class="val">${escapeHtml(displayBankName(check.bankName, check.bankAccountId))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('تاريخ الإصدار', 'Issue Date'))}</div><div class="val">${escapeHtml(formatDate(check.issueDate))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('تاريخ الاستحقاق', 'Due Date'))}</div><div class="val">${escapeHtml(formatDate(check.dueDate))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(check.type === 'INCOMING' ? tr('قبض من', 'Received from') : tr('صرف/تحرير إلى', 'Issued to'))}</div><div class="val">${escapeHtml(check.type === 'INCOMING' ? (sourceContactName || primaryContactName) : primaryContactName)}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('مودع بالبنك', 'Deposited Bank'))}</div><div class="val">${escapeHtml(depositedBankName || tr('غير مودع', 'Not deposited'))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('مُجير إلى', 'Endorsed To'))}</div><div class="val">${escapeHtml(endorseeName || tr('غير مجير', 'Not endorsed'))}</div></div>
                    <div class="card"><div class="lbl">${escapeHtml(tr('حساب التسوية النهائي', 'Final Settlement Account'))}</div><div class="val">${escapeHtml(finalSettlementAccount ? getAccountNameById(finalSettlementAccount) : tr('غير متاح بعد', 'Not available yet'))}</div></div>
                </div>

                <div class="sec">
                    <h2>${escapeHtml(tr('تسلسل حركة الشيك', 'Check Timeline'))}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${escapeHtml(tr('التاريخ', 'Date'))}</th>
                                <th>${escapeHtml(tr('الحدث', 'Event'))}</th>
                                <th>${escapeHtml(tr('التفاصيل', 'Details'))}</th>
                            </tr>
                        </thead>
                        <tbody>${timelineRows}</tbody>
                    </table>
                </div>

                <div class="sec">
                    <h2>${escapeHtml(tr('القيود/الحركات المرتبطة', 'Related Entries / Movements'))}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${escapeHtml(tr('التاريخ', 'Date'))}</th>
                                <th>${escapeHtml(tr('النوع', 'Type'))}</th>
                                <th>${escapeHtml(tr('البيان', 'Description'))}</th>
                                <th>${escapeHtml(tr('مدين', 'Debit'))}</th>
                                <th>${escapeHtml(tr('دائن', 'Credit'))}</th>
                                <th>${escapeHtml(tr('المبلغ', 'Amount'))}</th>
                            </tr>
                        </thead>
                        <tbody>${relatedRows}</tbody>
                    </table>
                </div>
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
    };

    const selectedCheckFlow = showCheckDetailsId ? getCheckFlowSummary(showCheckDetailsId) : null;

    return (
        <div className={`app-page p-3 md:p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
            <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight leading-tight break-normal">{tr('حافظة الشيكات', 'Checks Portfolio')}</h1>
                    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1 break-normal">{tr('المقبوضات والمدفوعات الآجلة', 'Deferred receivables and payables')}</p>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                    <div className="relative flex-1 sm:flex-none">
                        <input
                            type="text"
                            placeholder={tr('بحث برقم الشيك، البنك، أو المستفيد...', 'Search by check number, bank, or beneficiary...')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white border border-gray-100 pl-9 pr-3 h-10 rounded-xl text-[11px] font-bold w-full sm:w-60 outline-none sm:focus:w-72 transition-all shadow-sm"
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={14} />
                    </div>
                    <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white w-10 h-10 rounded-xl shadow-sm active:scale-90 transition-all flex items-center justify-center">
                        {showForm ? <X size={18} /> : <Plus size={18} />}
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                <div className="bg-white p-2.5 rounded-xl border border-emerald-50 shadow-sm text-center">
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-1">{tr('واردة', 'Incoming')}</span>
                    <p className="text-sm font-black text-emerald-700 dir-ltr">{stats.incomingPending.toLocaleString()}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-rose-50 shadow-sm text-center">
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block mb-1">{tr('صادرة', 'Outgoing')}</span>
                    <p className="text-sm font-black text-rose-700 dir-ltr">{stats.outgoingPending.toLocaleString()}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-50 shadow-sm text-center">
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest block mb-1">{tr('برسم التحصيل', 'Under Collection')}</span>
                    <p className="text-sm font-black text-blue-700 dir-ltr">{stats.underCollection.toLocaleString()}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-50 shadow-sm text-center">
                    <div className="flex items-center justify-center gap-1 mb-1 text-amber-500">
                        <XCircle size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{tr('مرتجعة', 'Bounced')}</span>
                    </div>
                    <p className="text-sm font-black text-amber-700 dir-ltr">{stats.bouncedAmount.toLocaleString()}</p>
                    <div className="mt-1 text-[9px] font-black text-gray-400">
                        <span className="text-emerald-600">{stats.bouncedPaidCount}</span> {tr('مسدد', 'Settled')} • <span className="text-rose-600">{stats.bouncedUnpaidCount}</span> {tr('غير مسدد', 'Unsettled')}
                    </div>
                </div>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-[2.5rem] border border-blue-100 shadow-xl mb-6 animate-in zoom-in-95">
                    <h3 className="font-black text-gray-800 mb-4">{tr('قبض/تحرير شيك جديد', 'Receive/Issue New Check')}</h3>
                    <form onSubmit={handleAddCheck} className="space-y-4">
                        <div className="flex bg-gray-50 p-1 rounded-xl">
                            <button type="button" onClick={() => setCheckType('INCOMING')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${checkType === 'INCOMING' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}>{tr('شيك وارد (قبض)', 'Incoming Check (Receipt)')}</button>
                            <button type="button" onClick={() => setCheckType('OUTGOING')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${checkType === 'OUTGOING' ? 'bg-white shadow text-rose-600' : 'text-gray-400'}`}>{tr('شيك صادر (دفع)', 'Outgoing Check (Payment)')}</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input placeholder={tr('رقم الشيك', 'Check Number')} value={checkNumber} onChange={e => setCheckNumber(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm" required />
                            <input placeholder={tr('اسم البنك او رقم البنك', 'Bank Name or Bank Code')} value={bankName} onChange={e => setBankName(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm" required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input placeholder={tr('رقم الحساب', 'Account Number')} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm" />
                            <input type="number" placeholder={tr('المبلغ', 'Amount')} value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-sm dir-ltr" required />
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <select value={contactId} onChange={e => setContactId(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm">
                                <option value="">{tr('-- اختر الطرف --', '-- Select Contact --')}</option>
                                {contacts.map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 mr-2">{tr('تاريخ الاستحقاق', 'Due Date')}</label>
                            <EnglishDateInput
                                value={dueDate}
                                onChange={setDueDate}
                                className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm"
                                required
                                aria-label={tr('تاريخ الاستحقاق', 'Due date')}
                            />
                        </div>
                        <div className="space-y-1">
                            <input placeholder={tr('ملاحظات إضافية', 'Additional Notes')} value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm" />
                        </div>
                        <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all">
                            {tr('حفظ وإنشاء القيد', 'Save and Create Entry')}
                        </button>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mb-2">
                {tabLabels.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-1.5 py-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1.5 border min-w-0 ${activeTab === tab.id ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-gray-500 border-gray-100'}`}
                    >
                        {tab.icon}
                        <span className="truncate">{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mb-3">
                {([
                    { key: 'ALL', ar: 'الكل', en: 'All', className: 'bg-slate-50 text-slate-700 border-slate-100' },
                    { key: 'DEPOSITED', ar: 'مودع بالبنك', en: 'Deposited', className: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { key: 'ENDORSED', ar: 'مجير', en: 'Endorsed', className: 'bg-purple-50 text-purple-700 border-purple-100' },
                    { key: 'BOUNCED', ar: 'مرتجع', en: 'Bounced', className: 'bg-rose-50 text-rose-700 border-rose-100' },
                    { key: 'DUE_TODAY', ar: 'مستحق اليوم', en: 'Due Today', className: 'bg-amber-50 text-amber-700 border-amber-100' }
                ] as const).map(filter => (
                    <button
                        key={filter.key}
                        type="button"
                        onClick={() => setQuickFilter(filter.key)}
                        className={`px-1.5 py-1.5 rounded-lg border text-[9px] font-black transition-all min-w-0 ${quickFilter === filter.key
                                ? `${filter.className} shadow-sm ring-1 ring-current/10`
                                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
                            }`}
                    >
                        <span className="truncate block">{tr(filter.ar, filter.en)}</span>
                    </button>
                ))}
                <div className="col-span-3 sm:col-span-6 text-[9px] font-bold text-gray-400 px-1 pt-1">
                    {filteredChecks.length} {tr('شيك', 'check(s)')}
                </div>
            </div>

            <div className="space-y-2.5">
                {filteredChecks.map(check => {
                    const isOverdue = new Date(check.dueDate) < new Date() && check.status === 'PENDING';
                    const checkImages = getCheckImageUrls(check);
                    return (
                        <div key={check.id} className={`bg-white p-3 rounded-xl border shadow-sm animate-in slide-in-from-bottom-2 ${isOverdue ? 'border-rose-100' : 'border-gray-100'}`}>
                            <div className="flex justify-between items-start mb-2.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${check.type === 'INCOMING' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                        <Banknote size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-black text-gray-800 text-xs truncate">#{check.checkNumber} - {displayBankName(check.bankName, check.bankAccountId)}</h4>
                                        {check.accountNumber && <p className="text-[10px] font-bold text-gray-400 mt-0.5 dir-ltr">{check.accountNumber}</p>}
                                        <p className="text-[10px] font-bold text-gray-400 mt-0.5 truncate">{getContactName(check.contactId)}</p>
                                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                                            <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border ${getStatusStyle(check.status)}`}>
                                                {getStatusLabel(check.status)}
                                            </span>
                                            {check.type === 'INCOMING'
                                                ? <span className="text-[8px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-black border border-emerald-100">{tr('وارد', 'Incoming')}</span>
                                                : <span className="text-[8px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md font-black border border-rose-100">{tr('صادر', 'Outgoing')}</span>}
                                            {checkImages.length > 0 && (
                                                <span className="text-[8px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-black border border-indigo-100 inline-flex items-center gap-1">
                                                    <ImageIcon size={10} />
                                                    {checkImages.length}
                                                </span>
                                            )}
                                            {check.status === 'BOUNCED' && (
                                                <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border ${getBounceSettlementStyle(check)}`}>
                                                    {getBounceSettlementLabel(check)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-end">
                                    <span className={`block font-black text-sm dir-ltr ${check.type === 'INCOMING' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {check.amount.toLocaleString()}
                                    </span>
                                    <div className={`flex items-center gap-1 text-[8px] font-bold mt-1 ${isOverdue ? 'text-rose-500' : 'text-gray-400'}`}>
                                        <Calendar size={10} />
                                        {check.dueDate}
                                    </div>
                                </div>
                            </div>

                            {checkImages.length > 0 && (
                                <div className="border-t border-gray-50 pt-2.5 mb-2.5">
                                    <p className="text-[9px] font-black text-gray-400 mb-2">{tr('صور الشيك', 'Check images')}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {checkImages.map((imageSrc, imageIndex) => (
                                            <button
                                                type="button"
                                                key={`${check.id}-image-${imageIndex}`}
                                                onClick={() => setPreviewImage({
                                                    src: imageSrc,
                                                    title: tr(`صورة الشيك ${imageIndex + 1} - شيك رقم ${check.checkNumber}`, `Check image ${imageIndex + 1} - #${check.checkNumber}`)
                                                })}
                                                className="block rounded-xl overflow-hidden border border-gray-100 bg-gray-50 hover:border-indigo-200 transition-colors"
                                                title={tr('عرض صورة الشيك', 'View check image')}
                                            >
                                                <img
                                                    src={imageSrc}
                                                    alt={tr(`صورة الشيك ${imageIndex + 1}`, `Check image ${imageIndex + 1}`)}
                                                    className="w-full h-24 object-cover"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 border-t border-gray-50 pt-2.5">
                                <button
                                    type="button"
                                    onClick={() => setShowCheckDetailsId(check.id)}
                                    className="flex-1 h-9 bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
                                >
                                    <Info size={14} /> {tr('تفاصيل الشيك', 'Check Details')}
                                </button>
                                {checkImages.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setPreviewImage({
                                            src: checkImages[0],
                                            title: tr(`صورة الشيك - ${check.checkNumber}`, `Check image - ${check.checkNumber}`)
                                        })}
                                        className="flex-1 h-9 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors"
                                    >
                                        <ImageIcon size={14} /> {tr('عرض الصورة', 'View Image')}
                                    </button>
                                )}
                            </div>

                            {check.status === 'PENDING' && (
                                <div className="grid grid-cols-3 gap-1.5 pt-1.5">
                                    <button onClick={() => setShowClearModal(check.id)} className="h-9 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-colors">
                                        <CheckCircle size={14} /> {tr('تحصيل / صرف', 'Clear / Pay')}
                                    </button>
                                    <button onClick={() => setShowDepositModal(check.id)} className="h-9 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-blue-100 transition-colors">
                                        <Building2 size={14} /> {tr('إيداع بالبنك', 'Deposit to Bank')}
                                    </button>
                                    <button onClick={() => setShowBounceModal(check.id)} className="h-9 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors">
                                        <XCircle size={14} /> {tr('مرتجع', 'Bounce')}
                                    </button>
                                </div>
                            )}

                            {check.status === 'UNDER_COLLECTION' && (
                                <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                                    <button onClick={() => setShowClearModal(check.id)} className="h-9 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-colors">
                                        <CheckCircle size={14} /> {tr('تم التحصيل', 'Collected')}
                                    </button>
                                    <button onClick={() => setShowBounceModal(check.id)} className="h-9 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors">
                                        <XCircle size={14} /> {tr('شيك مرتجع', 'Bounced Check')}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredChecks.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-100">
                        <ScrollText size={40} className="mx-auto text-gray-100 mb-3" />
                        <p className="text-gray-400 font-bold text-xs">{tr('لا توجد شيكات في هذا القسم', 'No checks in this section')}</p>
                    </div>
                )}
            </div>

            {showClearModal && (
                <ResponsiveDialog
                    open={Boolean(showClearModal)}
                    onClose={() => setShowClearModal(null)}
                    size="md"
                    zIndexClassName="z-[200]"
                    panelClassName="rounded-[2.5rem] p-8 shadow-2xl"
                >
                    <h3 className="font-black text-gray-800 text-lg mb-6">{tr('تحديد حساب التحصيل / الصرف', 'Select Clearing / Payment Account')}</h3>
                    <form onSubmit={confirmClear} className="space-y-6">
                        <select
                            value={clearAccountId}
                            onChange={e => setClearAccountId(e.target.value)}
                            className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none font-bold text-sm"
                            required
                        >
                            <option value="">{tr('-- اختر الصندوق أو البنك --', '-- Select Cashbox or Bank --')}</option>
                            {financialAccounts.map(acc => <option key={acc.id} value={acc.id}>{displayAccountName(acc)}</option>)}
                        </select>
                        <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl">{tr('إتمام العملية', 'Complete Action')}</button>
                        <button type="button" onClick={() => setShowClearModal(null)} className="w-full py-2 text-gray-400 font-bold text-xs">{tr('إلغاء', 'Cancel')}</button>
                    </form>
                </ResponsiveDialog>
            )}

            {showBounceModal && (
                <ResponsiveDialog
                    open={Boolean(showBounceModal)}
                    onClose={() => setShowBounceModal(null)}
                    size="md"
                    zIndexClassName="z-[200]"
                    panelClassName="rounded-[2.5rem] p-8 shadow-2xl text-center"
                >
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-sm">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="font-black text-gray-800 text-lg mb-2">{tr('تسجيل شيك مرتجع', 'Register Bounced Check')}</h3>
                    <p className="text-gray-500 text-xs font-bold mb-8 leading-relaxed">
                        {tr(
                            'هل أنت متأكد من تسجيل هذا الشيك كمرتجع؟ سيتم عكس القيد المحاسبي وإعادة المديونية على الطرف المعني.',
                            'Are you sure you want to mark this check as bounced? A reversal entry will be posted and the balance will be restored to the related party.'
                        )}
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setShowBounceModal(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all active:scale-95">
                            {tr('إلغاء', 'Cancel')}
                        </button>
                        <button onClick={confirmBounce} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95">
                            {tr('تأكيد', 'Confirm')}
                        </button>
                    </div>
                </ResponsiveDialog>
            )}

            {showDepositModal && (
                <ResponsiveDialog
                    open={Boolean(showDepositModal)}
                    onClose={() => setShowDepositModal(null)}
                    size="md"
                    zIndexClassName="z-[200]"
                    panelClassName="rounded-[2.5rem] p-8 shadow-2xl"
                >
                    <h3 className="font-black text-gray-800 text-lg mb-6">{tr('إيداع شيك في البنك (برسم التحصيل)', 'Deposit Check to Bank (Under Collection)')}</h3>
                    <form onSubmit={handleDepositCheck} className="space-y-6">
                        <select
                            value={depositBankId}
                            onChange={e => setDepositBankId(e.target.value)}
                            className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none font-bold text-sm"
                            required
                        >
                            <option value="">{tr('-- اختر البنك المودع فيه --', '-- Select Destination Bank --')}</option>
                            {bankAccounts.map(acc => <option key={acc.id} value={acc.id}>{displayAccountName(acc)}</option>)}
                        </select>
                        <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl">{tr('إتمام الإيداع', 'Complete Deposit')}</button>
                        <button type="button" onClick={() => setShowDepositModal(null)} className="w-full py-2 text-gray-400 font-bold text-xs">{tr('إلغاء', 'Cancel')}</button>
                    </form>
                </ResponsiveDialog>
            )}

            {selectedCheckFlow && (() => {
                const { check, related, sourceContactName, primaryContactName, endorseeName, depositedBankName, clearTx } = selectedCheckFlow;
                const timeline = buildCheckTimeline(check.id);
                const images = getCheckImageUrls(check);
                const finalSettlementAccount = check.type === 'INCOMING' ? clearTx?.debitAccountId : clearTx?.creditAccountId;
                return (
                    <ResponsiveDialog
                        open={Boolean(showCheckDetailsId)}
                        onClose={() => setShowCheckDetailsId(null)}
                        size="xl"
                        zIndexClassName="z-[210]"
                        panelClassName="rounded-[2rem] p-0 overflow-hidden"
                    >
                        <div className={`max-h-[90dvh] flex flex-col ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
                            <div className="p-4 bg-slate-900 text-white flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] px-2 py-1 rounded-lg font-black border ${getStatusStyle(check.status)}`}>{getStatusLabel(check.status)}</span>
                                        <span className={`text-[10px] px-2 py-1 rounded-lg font-black border ${check.type === 'INCOMING' ? 'bg-emerald-500/10 border-emerald-300/20 text-emerald-200' : 'bg-rose-500/10 border-rose-300/20 text-rose-200'}`}>
                                            {check.type === 'INCOMING' ? tr('شيك وارد', 'Incoming Check') : tr('شيك صادر', 'Outgoing Check')}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-black">{tr('تفاصيل الشيك', 'Check Details')} #{check.checkNumber}</h3>
                                    <p className="text-xs text-white/60 font-bold mt-1">{displayBankName(check.bankName, check.bankAccountId)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handlePrintCheckReport(check.id)}
                                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-xs font-black inline-flex items-center gap-1.5"
                                    >
                                        <Printer size={14} />
                                        {tr('طباعة تقرير الشيك', 'Print Check Report')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowCheckDetailsId(null)}
                                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                                        aria-label={tr('إغلاق', 'Close')}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-2">
                                        <h4 className="text-xs font-black text-gray-700">{tr('ملخص الشيك', 'Check Summary')}</h4>
                                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('المبلغ', 'Amount')}</span><span className="font-black dir-ltr">{check.amount.toLocaleString()} {check.currency}</span></div>
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('الاستحقاق', 'Due Date')}</span><span className="font-black dir-ltr">{check.dueDate}</span></div>
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('تاريخ الإصدار', 'Issue Date')}</span><span className="font-black dir-ltr">{check.issueDate}</span></div>
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('رقم الحساب', 'Account Number')}</span><span className="font-black dir-ltr">{check.accountNumber || '-'}</span></div>
                                        </div>
                                        {check.description && (
                                            <div className="bg-gray-50 rounded-xl p-3 text-[11px]">
                                                <span className="text-gray-400 font-bold block mb-1">{tr('ملاحظات', 'Notes')}</span>
                                                <p className="font-bold text-gray-700">{check.description}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-2">
                                        <h4 className="text-xs font-black text-gray-700">{tr('مسار الشيك', 'Check Flow')}</h4>
                                        <div className="space-y-2 text-[11px]">
                                            {check.type === 'INCOMING' ? (
                                                <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('قبض من', 'Received from')}</span><span className="font-black text-gray-800">{sourceContactName || primaryContactName}</span></div>
                                            ) : (
                                                <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('صرف/تحرير إلى', 'Issued to')}</span><span className="font-black text-gray-800">{primaryContactName}</span></div>
                                            )}
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('الحالة الحالية', 'Current Status')}</span><span className="font-black text-gray-800">{getStatusLabel(check.status)}</span></div>
                                            {check.status === 'BOUNCED' && (
                                                <div className="bg-gray-50 rounded-xl p-2">
                                                    <span className="text-gray-400 font-bold block">{tr('تسوية الارتجاع', 'Bounce Settlement')}</span>
                                                    <span className={`font-black ${check.bounceSettlementStatus === 'PAID' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {check.bounceSettlementStatus === 'PAID' ? tr('تم السداد/التسوية', 'Settled / Paid') : tr('غير مسدد بعد', 'Not settled yet')}
                                                    </span>
                                                    {check.bounceSettlementDate && (
                                                        <span className="block text-[10px] text-gray-400 font-bold mt-1 dir-ltr">{check.bounceSettlementDate}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('مودع بالبنك', 'Deposited Bank')}</span><span className="font-black text-gray-800">{depositedBankName || tr('غير مودع', 'Not deposited')}</span></div>
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('مُجير إلى', 'Endorsed To')}</span><span className="font-black text-gray-800">{endorseeName || tr('غير مجير', 'Not endorsed')}</span></div>
                                            <div className="bg-gray-50 rounded-xl p-2"><span className="text-gray-400 font-bold block">{tr('حساب التسوية النهائي', 'Final Settlement Account')}</span><span className="font-black text-gray-800">{finalSettlementAccount ? getAccountNameById(finalSettlementAccount) : tr('غير متاح بعد', 'Not available yet')}</span></div>
                                        </div>
                                    </div>
                                </div>

                                {images.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <h4 className="text-xs font-black text-gray-700">{tr('صور الشيك', 'Check Images')}</h4>
                                            <span className="text-[10px] text-gray-400 font-bold">{images.length} {tr('صورة', 'image(s)')}</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {images.map((src, idx) => (
                                                <button
                                                    key={`${check.id}-preview-${idx}`}
                                                    type="button"
                                                    onClick={() => setPreviewImage({ src, title: tr(`صورة الشيك ${idx + 1} - ${check.checkNumber}`, `Check image ${idx + 1} - ${check.checkNumber}`) })}
                                                    className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 hover:border-indigo-200 transition-colors text-right"
                                                >
                                                    <img src={src} alt={tr(`صورة الشيك ${idx + 1}`, `Check image ${idx + 1}`)} className="w-full h-40 object-cover" />
                                                    <div className="px-3 py-2 text-[10px] font-black text-indigo-600 inline-flex items-center gap-1">
                                                        <ImageIcon size={12} /> {tr('عرض الصورة', 'View image')}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                    {check.status === 'BOUNCED' && (
                                        <div className="mb-3 p-3 rounded-xl border border-rose-100 bg-rose-50/60 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <div className="text-[10px] font-black text-rose-600">{tr('متابعة الشيك المرتجع', 'Bounced check follow-up')}</div>
                                                <div className="text-xs font-bold text-gray-600">
                                                    {check.bounceSettlementStatus === 'PAID'
                                                        ? tr('تمت تسوية قيمة الشيك المرتجع.', 'Bounced check amount has been settled.')
                                                        : tr('الشيك المرتجع ما زال غير مسدد.', 'Bounced check is still unsettled.')}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggleBouncedSettlement(check.id)}
                                                className={`px-3 py-2 rounded-xl text-[11px] font-black border inline-flex items-center gap-1.5 ${check.bounceSettlementStatus === 'PAID'
                                                        ? 'bg-white text-rose-600 border-rose-200'
                                                        : 'bg-emerald-600 text-white border-emerald-600'
                                                    }`}
                                            >
                                                {check.bounceSettlementStatus === 'PAID' ? <XCircle size={13} /> : <CheckCircle size={13} />}
                                                {check.bounceSettlementStatus === 'PAID'
                                                    ? tr('تحديد كغير مسدد', 'Mark as unsettled')
                                                    : tr('تحديد كمسدد', 'Mark as settled')}
                                            </button>
                                        </div>
                                    )}
                                    <h4 className="text-xs font-black text-gray-700 mb-3">{tr('تسلسل حركة الشيك', 'Check Timeline')}</h4>
                                    <div className="space-y-2">
                                        {timeline.map((step) => (
                                            <div key={step.key + step.date} className={`rounded-xl border p-3 ${step.toneClass}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-black text-[11px]">{step.title}</span>
                                                    <span className="text-[10px] font-bold dir-ltr">{step.date}</span>
                                                </div>
                                                <p className="text-[10px] font-bold mt-1 opacity-90">{step.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <h4 className="text-xs font-black text-gray-700">{tr('القيود/الحركات المرتبطة', 'Related Entries / Movements')}</h4>
                                        <span className="text-[10px] text-gray-400 font-bold">{related.length} {tr('حركة', 'entry')}</span>
                                    </div>
                                    {related.length === 0 ? (
                                        <div className="text-center py-6 text-gray-400 text-xs font-bold">{tr('لا توجد قيود مرتبطة بهذا الشيك', 'No related entries for this check')}</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-right min-w-[900px] text-xs">
                                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                                    <tr>
                                                        <th className="p-2">{tr('التاريخ', 'Date')}</th>
                                                        <th className="p-2">{tr('النوع', 'Type')}</th>
                                                        <th className="p-2">{tr('البيان', 'Description')}</th>
                                                        <th className="p-2">{tr('مدين', 'Debit')}</th>
                                                        <th className="p-2">{tr('دائن', 'Credit')}</th>
                                                        <th className="p-2 text-center">{tr('المبلغ', 'Amount')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {related.map((t) => (
                                                        <tr key={t.id} className="hover:bg-gray-50">
                                                            <td className="p-2 dir-ltr font-bold">{t.date}</td>
                                                            <td className="p-2">{t.category}</td>
                                                            <td className="p-2 font-bold text-gray-700">{t.description}</td>
                                                            <td className="p-2 text-[11px] text-gray-600">{getAccountNameById(t.debitAccountId)}</td>
                                                            <td className="p-2 text-[11px] text-gray-600">{getAccountNameById(t.creditAccountId)}</td>
                                                            <td className="p-2 text-center dir-ltr font-black">{t.amount.toLocaleString()} {t.currency}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </ResponsiveDialog>
                );
            })()}

            {previewImage && (
                <ResponsiveDialog
                    open={Boolean(previewImage)}
                    onClose={() => setPreviewImage(null)}
                    size="xl"
                    zIndexClassName="z-[220]"
                    panelClassName="rounded-[1.5rem] p-0 overflow-hidden bg-black"
                >
                    <div className={`bg-black text-white ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
                            <h4 className="text-xs font-black truncate">{previewImage.title}</h4>
                            <button type="button" onClick={() => setPreviewImage(null)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-3 bg-black">
                            <img src={previewImage.src} alt={previewImage.title} className="w-full max-h-[75dvh] object-contain rounded-xl bg-black" />
                        </div>
                    </div>
                </ResponsiveDialog>
            )}
        </div>
    );
};

export default CheckPortfolio;


