
import React, { useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Trash2, Plus, Scale, X, CheckCircle2, Box, Edit2 } from 'lucide-react';
import { UnitOfMeasure } from '../types';
import { getDisplayUnitName } from '../utils/displayNames';

const UnitManager: React.FC = () => {
  const { units, addUnit, updateUnit, deleteUnit, companySettings } = useAccounting();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayUnitName = (unit?: { id: string; name: string } | null) =>
      getDisplayUnitName(unit || undefined, isEnglish);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name || !code) return;

      if (editingUnitId) {
          updateUnit(editingUnitId, { name, code: code.toUpperCase() });
      } else {
          addUnit({ name, code: code.toUpperCase() });
      }
      
      resetForm();
  };

  const resetForm = () => {
      setName('');
      setCode('');
      setEditingUnitId(null);
      setShowAddForm(false);
  };

  const handleEdit = (unit: UnitOfMeasure) => {
      setEditingUnitId(unit.id);
      setName(unit.name);
      setCode(unit.code);
      setShowAddForm(true);
  };

  return (
    <div className={`space-y-6 animate-in fade-in slide-in-from-right-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12">
                <Scale size={140} />
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3 opacity-90">
                    <Box size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{tr('إدارة المخزون', 'Inventory Management')}</span>
                </div>
                <h3 className="text-xl font-bold mb-1">{tr('وحدات القياس', 'Units of Measure')}</h3>
                <p className="text-[11px] opacity-80 leading-relaxed max-w-xs">
                    {tr('عرف الوحدات التي تستخدمها في بيع وشراء المنتجات (مثل: قطعة، كرتون، كيلو، متر) لضمان دقة التقارير.', 'Define units used for sales and purchases (e.g. piece, carton, kilo, meter) to ensure reporting accuracy.')}
                </p>
            </div>
        </div>

        <button 
            onClick={() => setShowAddForm(true)}
            className={`w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 ${showAddForm ? 'hidden' : ''}`}
        >
            <Plus className="w-5 h-5" />
            {tr('إضافة وحدة جديدة', 'Add New Unit')}
        </button>

        {showAddForm && (
             <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-black text-gray-800 text-sm">{editingUnitId ? tr('تعديل بيانات الوحدة', 'Edit Unit Data') : tr('بيانات الوحدة الجديدة', 'New Unit Data')}</h4>
                    <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                     <div>
                         <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('اسم الوحدة', 'Unit Name')}</label>
                         <input type="text" placeholder={tr('مثال: كرتون، قطعة', 'Example: Carton, Piece')} value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none focus:ring-4 ring-indigo-50 transition-all" required />
                     </div>
                     <div>
                         <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('الرمز المختصر', 'Short Code')}</label>
                         <input type="text" placeholder={tr('مثال: CTN, PCS', 'Example: CTN, PCS')} value={code} onChange={(e) => setCode(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none text-center uppercase dir-ltr focus:ring-4 ring-indigo-50 transition-all" required />
                     </div>
                     <button type="submit" className="w-full bg-indigo-600 text-white py-3.5 rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                        <CheckCircle2 size={16} />
                        {editingUnitId ? tr('حفظ التعديلات', 'Save Changes') : tr('حفظ الوحدة', 'Save Unit')}
                    </button>
                </div>
             </form>
        )}

        <div className="space-y-3">
            {units.map(unit => (
                <div key={unit.id} className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex items-center justify-between group hover:border-indigo-100 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xs shadow-inner">
                            {unit.code}
                        </div>
                        <div>
                            <div className="font-black text-gray-800 text-sm">{displayUnitName(unit)}</div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => handleEdit(unit)}
                            className="p-2.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all active:scale-90"
                        >
                            <Edit2 size={18} />
                        </button>
                        <button 
                            onClick={() => { if(confirm(tr('حذف الوحدة نهائياً؟', 'Delete unit permanently?'))) deleteUnit(unit.id); }}
                            className="p-2.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            ))}
            {units.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-xs font-bold border-2 border-dashed border-gray-100 rounded-2xl">
                    {tr('لا توجد وحدات معرفة', 'No units defined')}
                </div>
            )}
        </div>
    </div>
  );
};

export default UnitManager;
