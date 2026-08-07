import React, { useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { X } from 'lucide-react';
import ResponsiveDialog from './layout/ResponsiveDialog';

const inputClass = "w-full min-h-[44px] bg-slate-50 border border-slate-200 text-gray-900 text-sm font-bold rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 block p-3 transition-all";

const QuickAddFixedAssetModal: React.FC<{ onClose: () => void; onSave: (id: string) => void; initialCost?: number }> = ({ onClose, onSave, initialCost = 0 }) => {
    const { addFixedAsset, companySettings } = useAccounting();
    const [name, setName] = useState('');
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        
        const newAsset = {
            name: name.trim(),
            description: '',
            status: 'ACTIVE' as const,
            cost: initialCost,
            salvageValue: 0,
            lifeInYears: 5,
            purchaseDate: new Date().toISOString().split('T')[0]
        };
        
        const id = addFixedAsset(newAsset);
        if (id) {
            onSave(id);
        }
        onClose();
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            size="md"
            zIndexClassName="z-[300]"
            backdropClassName="bg-black/70 backdrop-blur-md"
            panelClassName="bg-white rounded-[2.5rem] p-8 shadow-2xl"
        >
            <form onSubmit={handleSubmit} className="animate-in zoom-in-95" dir={isEnglish ? 'ltr' : 'rtl'}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-800 text-lg">
                        {tr('إضافة أصل ثابت جديد', 'Add New Fixed Asset')}
                    </h3>
                    <button type="button" onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={tr('اسم الأصل الثابت', 'Fixed Asset Name')} className={inputClass} />
                    <button type="submit" className="w-full min-h-[44px] py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-200 mt-2">{tr('حفظ الأصل', 'Save Asset')}</button>
                </div>
            </form>
        </ResponsiveDialog>
    );
};

export default QuickAddFixedAssetModal;
