import React, { useMemo, useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Transaction, TransactionType } from '../types';
import EnglishDateInput from './EnglishDateInput';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { CheckCircle2, FileText, Filter, Pencil, Plus, RotateCcw, Scale, Search, Trash2, X } from 'lucide-react';
import { getDisplayAccountName } from '../utils/displayNames';

interface JournalManagerProps {
  onAddNew: () => void;
  onEditJournal?: (journalId: string) => void;
}

const JournalManager: React.FC<JournalManagerProps> = ({ onAddNew, onEditJournal }) => {
  const { transactions, accounts, deleteTransaction, updateTransaction, reverseTransaction, companySettings, auditLogs } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(isEnglish ? 'en-GB' : 'ar-SA-u-nu-latn');
  };

  const getAccountName = (id?: string) => {
    const account = accounts.find(a => a.id === id);
    if (!account) return tr('حساب غير محدد', 'Unknown account');
    return getDisplayAccountName(account, isEnglish);
  };

  const journalEntries = useMemo(() => {
    return transactions.filter(t => {
      const isManualJournal = t.category === 'journal' && t.type === TransactionType.TRANSFER;
      const matchesSearch = (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      let matchesDate = true;
      const tDate = new Date(t.date);

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (tDate < start) matchesDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (tDate > end) matchesDate = false;
      }

      return isManualJournal && matchesSearch && matchesDate;
    });
  }, [transactions, searchTerm, startDate, endDate]);

  const createdAtByTransactionId = useMemo(() => {
    const map = new Map<string, number>();
    auditLogs.forEach(log => {
      if (log.entityType !== 'transaction' || log.action !== 'CREATE' || !log.entityId) return;
      if (map.has(log.entityId)) return;
      const time = Date.parse(String(log.timestamp || ''));
      if (!Number.isNaN(time)) map.set(log.entityId, time);
    });
    return map;
  }, [auditLogs]);

  const resolveDetailLines = (entry: Transaction) => {
    if (entry.voucherId) {
      const grouped = transactions.filter(t =>
        t.voucherId === entry.voucherId &&
        t.category === 'journal' &&
        t.type === TransactionType.TRANSFER
      );
      return grouped.length > 0 ? grouped : [entry];
    }

    const entryCreatedAt = createdAtByTransactionId.get(entry.id);
    if (typeof entryCreatedAt !== 'number') return [entry];

    const legacyWindowMs = 2500;
    const fallbackGrouped = transactions.filter(t => {
      if (t.voucherId) return false;
      if (t.category !== 'journal' || t.type !== TransactionType.TRANSFER) return false;
      if ((t.status || 'POSTED') !== (entry.status || 'POSTED')) return false;
      if (String(t.date || '') !== String(entry.date || '')) return false;
      if (String(t.currency || '') !== String(entry.currency || '')) return false;
      if (Math.abs((Number(t.exchangeRate) || 1) - (Number(entry.exchangeRate) || 1)) > 0.000001) return false;
      const candidateCreatedAt = createdAtByTransactionId.get(t.id);
      if (typeof candidateCreatedAt !== 'number') return false;
      return Math.abs(candidateCreatedAt - entryCreatedAt) <= legacyWindowMs;
    });

    return fallbackGrouped.length > 0 ? fallbackGrouped : [entry];
  };

  const handlePost = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm(tr('هل أنت متأكد من ترحيل القيد؟', 'Are you sure you want to post this entry?'))) {
      const result = updateTransaction(id, { status: 'POSTED' });
      if (!result.ok) {
        alert(result.message);
        return;
      }
      setSelectedJournalId(null);
    }
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const entry = transactions.find(t => t.id === id);
    if (!entry) return;
    const detailLines = resolveDetailLines(entry);
    if (confirm(tr('حذف القيد نهائياً؟', 'Delete this journal entry permanently?'))) {
      for (const line of detailLines) {
        const result = deleteTransaction(line.id);
        if (!result.ok) {
          alert(result.message);
          return;
        }
      }
      setSelectedJournalId(null);
    }
  };

  const handleEdit = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onEditJournal) return;
    const entry = transactions.find(t => t.id === id);
    if (!entry) return;
    if (entry.isReversal || entry.reversedById) {
      alert(tr('لا يمكن تعديل قيد معكوس محاسبيًا.', 'Reversed journal entries cannot be edited.'));
      return;
    }
    setSelectedJournalId(null);
    onEditJournal(entry.voucherId || entry.id);
  };

  const handleReverse = (id: string) => {
    if (!confirm(tr('سيتم إنشاء قيد عكسي لهذا القيد المرحّل. متابعة؟', 'A reversal entry will be created for this posted entry. Continue?'))) return;
    const result = reverseTransaction(id);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setSelectedJournalId(null);
    alert(tr('تم إنشاء قيد عكسي بنجاح', 'Reversal entry created successfully.'));
  };

  const renderDetailModal = () => {
    if (!selectedJournalId) return null;
    const entry = transactions.find(t => t.id === selectedJournalId);
    if (!entry) return null;

    const detailLines = resolveDetailLines(entry).sort((a, b) => {
      const byDate = String(a.date || '').localeCompare(String(b.date || ''));
      return byDate !== 0 ? byDate : String(a.id || '').localeCompare(String(b.id || ''));
    });
    const postingLineMap = new Map<string, { key: string; side: 'DEBIT' | 'CREDIT'; accountId?: string; amount: number }>();
    detailLines.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (amount <= 0) return;

      const debitKey = `D:${String(tx.debitAccountId || '')}`;
      const existingDebit = postingLineMap.get(debitKey);
      if (existingDebit) existingDebit.amount += amount;
      else postingLineMap.set(debitKey, { key: debitKey, side: 'DEBIT', accountId: tx.debitAccountId, amount });

      const creditKey = `C:${String(tx.creditAccountId || '')}`;
      const existingCredit = postingLineMap.get(creditKey);
      if (existingCredit) existingCredit.amount += amount;
      else postingLineMap.set(creditKey, { key: creditKey, side: 'CREDIT', accountId: tx.creditAccountId, amount });
    });
    const postingLines = Array.from(postingLineMap.values())
      .map(row => ({ ...row, amount: Number(row.amount.toFixed(2)) }))
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        if (a.side !== b.side) return a.side === 'CREDIT' ? -1 : 1;
        return getAccountName(a.accountId).localeCompare(getAccountName(b.accountId), isEnglish ? 'en' : 'ar');
      });
    const totalAmount = detailLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    const detailsRef = entry.voucherId || entry.id.substring(0, 8);
    const isDraft = entry.status === 'DRAFT';

    return (
      <ResponsiveDialog
        open={Boolean(selectedJournalId)}
        onClose={() => setSelectedJournalId(null)}
        size="md"
        zIndexClassName="z-[100]"
        panelClassName="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="bg-indigo-600 p-6 flex justify-between items-start text-white">
            <div>
              <h3 className="text-xl font-black">{tr('تفاصيل القيد', 'Entry Details')}</h3>
              <p className="text-indigo-200 text-xs font-bold mt-1">Ref: {detailsRef}</p>
            </div>
            <button onClick={() => setSelectedJournalId(null)} className="bg-white/10 p-2 rounded-full"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-6">
            <div className="text-center">
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">{tr('المبلغ', 'Amount')}</p>
              <h2 className="text-3xl font-black text-indigo-600 dir-ltr">{totalAmount.toLocaleString()}</h2>
            </div>
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-4 overflow-x-auto">
              <div className="min-w-[400px]">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-200 pb-2">
                  <div>#</div>
                  <div>{tr('الحساب', 'Account')}</div>
                  <div className="text-center">{tr('مدين', 'Debit')}</div>
                  <div className="text-center">{tr('دائن', 'Credit')}</div>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto mt-2">
                  {postingLines.map((line, index) => (
                    <div key={line.key} className="rounded-xl border border-gray-100 bg-white p-2.5">
                      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 items-start text-xs font-bold text-gray-700">
                        <div className="text-gray-400">{index + 1}</div>
                        <div className={line.side === 'DEBIT' ? 'text-emerald-700' : 'text-rose-700'}>{getAccountName(line.accountId)}</div>
                        <div className="dir-ltr text-center text-emerald-700">{line.side === 'DEBIT' ? line.amount.toLocaleString() : '-'}</div>
                        <div className="dir-ltr text-center text-rose-700">{line.side === 'CREDIT' ? line.amount.toLocaleString() : '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 mt-4 border-t flex justify-between items-center">
                  <span className="text-xs text-gray-400">{tr('التاريخ', 'Date')}</span>
                  <span className="text-xs font-bold text-gray-700">{formatDate(entry.date)} • {tr('الأسطر', 'Lines')}: {postingLines.length}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-gray-50 border-t flex gap-3">
            {isDraft && (
              <button onClick={() => handlePost(entry.id)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg">
                {tr('ترحيل', 'Post')}
              </button>
            )}
            {!entry.isReversal && !entry.reversedById && onEditJournal && (
              <button onClick={() => handleEdit(entry.id)} className="flex-1 py-3 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-black">
                <span className="inline-flex items-center justify-center gap-2"><Pencil size={16} />{tr('تعديل', 'Edit')}</span>
              </button>
            )}
            {!isDraft && !entry.isReversal && !entry.reversedById && (
              <button onClick={() => handleReverse(entry.id)} className="flex-1 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl font-black">
                <span className="inline-flex items-center justify-center gap-2"><RotateCcw size={16} />{tr('عكس', 'Reverse')}</span>
              </button>
            )}
            <button onClick={() => handleDelete(entry.id)} className="p-3 bg-white border border-red-100 text-red-500 rounded-xl"><Trash2 size={20} /></button>
          </div>
        </div>
      </ResponsiveDialog>
    );
  };

  return (
    <div className="app-page journal-list-page animate-in fade-in duration-700 p-4 font-tajawal" dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-8 flex justify-between items-start px-2">
        <div>
          <h1 className="text-3xl font-black text-gray-800 tracking-tight">{tr('قيود اليومية', 'Journal Entries')}</h1>
          <p className="text-gray-400 text-[10px] font-black mt-1 uppercase">{tr('سجل الحركات المحاسبية اليدوية', 'Manual accounting entries log')}</p>
        </div>
        <div className="p-4 rounded-[1.8rem] bg-white shadow-xl border border-gray-50 text-indigo-600"><Scale size={28} /></div>
      </header>

      <div className="flex gap-3 mb-6">
        <button onClick={() => setShowFilters(!showFilters)} className={`p-4.5 rounded-[1.8rem] shadow-sm border transition-all ${showFilters ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-400 border-gray-100'}`}><Filter size={20} /></button>
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder={tr('بحث...', 'Search...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4.5 pr-12 bg-white rounded-[1.8rem] border border-gray-100 shadow-sm outline-none font-bold text-sm"
          />
          <Search className="w-5 h-5 text-gray-400 absolute top-1/2 -translate-y-1/2 right-4 pointer-events-none" />
        </div>
        <button onClick={onAddNew} className="bg-indigo-600 text-white p-4.5 rounded-[1.8rem] shadow-xl"><Plus size={20} /></button>
      </div>

      {showFilters && (
        <div className="list-card bg-white border border-gray-100 rounded-2xl p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EnglishDateInput
            value={startDate}
            onChange={setStartDate}
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 outline-none text-sm font-bold"
            aria-label={tr('من تاريخ', 'From date')}
          />
          <EnglishDateInput
            value={endDate}
            onChange={setEndDate}
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 outline-none text-sm font-bold"
            aria-label={tr('إلى تاريخ', 'To date')}
          />
        </div>
      )}

      <div className="space-y-5">
        {journalEntries.map((t) => (
          <div key={t.id} onClick={() => setSelectedJournalId(t.id)} className="list-card bg-white p-6 rounded-[2.5rem] border border-gray-50 shadow-sm transition-all cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${t.status === 'DRAFT' ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600'}`}><FileText size={22} /></div>
                <div>
                  <h4 className="font-black text-gray-800 text-base">{t.description || tr('قيد يدوي', 'Manual entry')}</h4>
                  <span className="text-[10px] font-black text-gray-400">{formatDate(t.date)}</span>
                </div>
              </div>
              <div className="text-left flex flex-col items-end gap-2">
                <div className="text-xl font-black">{t.amount.toLocaleString()}</div>
                {!t.isReversal && !t.reversedById && onEditJournal && (
                  <button
                    onClick={(e) => handleEdit(t.id, e)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-black border border-blue-100 hover:bg-blue-100 transition-all active:scale-95 inline-flex items-center gap-1"
                  >
                    <Pencil size={12} />
                    {tr('تعديل', 'Edit')}
                  </button>
                )}
                {t.status === 'DRAFT' && (
                  <button
                    onClick={(e) => handlePost(t.id, e)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black shadow-sm hover:bg-indigo-700 transition-all active:scale-95 inline-flex items-center gap-1"
                  >
                    <CheckCircle2 size={12} />
                    {tr('ترحيل', 'Post')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {renderDetailModal()}
    </div>
  );
};

export default JournalManager;
