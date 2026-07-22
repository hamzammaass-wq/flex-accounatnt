import React, { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayAccountName } from '../utils/displayNames';

interface QuickAddAccountModalProps {
  onClose: () => void;
  onSave: (accountId: string) => void;
  initialName?: string;
}

const QuickAddAccountModal: React.FC<QuickAddAccountModalProps> = ({ onClose, onSave, initialName = '' }) => {
  const { accounts, addAccount, companySettings } = useAccounting();
  const [name, setName] = useState(initialName);
  const [parentId, setParentId] = useState('');

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

  const groupAccounts = accounts.filter(a => a.isGroup);

  const getAccName = (account: any) =>
    getDisplayAccountName(account, isEnglish);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parentAccount = groupAccounts.find(a => a.id === parentId);
    
    // Auto-generate code
    let nextCode = '';
    if (parentAccount) {
      const children = accounts.filter(a => a.parentId === parentId);
      if (children.length > 0) {
        const childCodes = children.map(c => parseInt(c.code.split('-').pop() || '0', 10)).filter(n => !isNaN(n));
        const maxCode = childCodes.length > 0 ? Math.max(...childCodes) : 0;
        nextCode = `${parentAccount.code}-${(maxCode + 1).toString().padStart(3, '0')}`;
      } else {
        nextCode = `${parentAccount.code}-001`;
      }
    } else {
      nextCode = Math.random().toString().slice(2, 8);
    }

    const type = parentAccount ? parentAccount.type : 'ASSET'; // default fallback
    const id = Math.random().toString(36).slice(2, 11);
    
    const result = addAccount({
      id,
      name: name.trim(),
      code: nextCode,
      type,
      isGroup: false,
      parentId: parentAccount ? parentId : undefined,
    });

    if (!result.ok) {
      alert(result.message);
      return;
    }
    
    onSave(id);
    onClose();
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="sm"
      zIndexClassName="z-[300]"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelClassName="bg-white rounded-[2.5rem] p-8 shadow-2xl"
    >
      <div className="flex justify-between items-center mb-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <h3 className="font-black text-gray-800 text-lg">{tr('إضافة حساب جديد', 'Add New Account')}</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('اسم الحساب', 'Account Name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none focus:ring-4 ring-blue-50 transition-all"
            placeholder={tr('الاسم...', 'Name...')}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('الحساب الرئيسي (المجموعة)', 'Parent Account (Group)')}</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none focus:ring-4 ring-blue-50 transition-all appearance-none"
            required
          >
            <option value="">{tr('اختر الحساب الرئيسي...', 'Select Parent Account...')}</option>
            {groupAccounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.code} - {getAccName(account)}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-[1.8rem] font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 mt-4">
          <CheckCircle2 size={18} />
          {tr('حفظ الحساب واختياره', 'Save and Select')}
        </button>
      </form>
    </ResponsiveDialog>
  );
};

export default QuickAddAccountModal;
