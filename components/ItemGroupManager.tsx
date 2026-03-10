import React, { useMemo, useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { CornerDownLeft, Edit2, Layers, Plus, Trash2, X } from 'lucide-react';
import { ItemGroup } from '../types';
import { getDisplayItemGroupName } from '../utils/displayNames';

const ItemGroupManager: React.FC = () => {
  const { itemGroups, addItemGroup, updateItemGroup, deleteItemGroup, companySettings } = useAccounting();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [parentId, setParentId] = useState<string>('');

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayGroupName = (group?: { id: string; name: string } | null) => getDisplayItemGroupName(group || undefined, isEnglish);

  const icons = ['📦', '🪑', '🧾', '📱', '🏠', '✅', '💡', '🔧', '💻', '🗗'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const groupData = {
      name,
      icon,
      parentId: parentId || undefined
    };

    if (editingGroupId) {
      updateItemGroup(editingGroupId, groupData);
    } else {
      addItemGroup(groupData);
    }

    resetForm();
  };

  const resetForm = () => {
    setName('');
    setIcon('📦');
    setParentId('');
    setEditingGroupId(null);
    setShowAddForm(false);
  };

  const handleEdit = (group: ItemGroup) => {
    setEditingGroupId(group.id);
    setName(group.name);
    setIcon(group.icon);
    setParentId(group.parentId || '');
    setShowAddForm(true);
  };

  const sortedGroups = useMemo(() => {
    const mainGroups = itemGroups.filter(g => !g.parentId);
    const result: { group: ItemGroup; depth: number }[] = [];

    const addChildren = (parentGroupId: string, depth: number) => {
      const children = itemGroups.filter(g => g.parentId === parentGroupId);
      children.forEach(child => {
        result.push({ group: child, depth });
        addChildren(child.id, depth + 1);
      });
    };

    mainGroups.forEach(main => {
      result.push({ group: main, depth: 0 });
      addChildren(main.id, 1);
    });

    return result;
  }, [itemGroups]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 font-tajawal" dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-indigo-800 text-sm mb-4">
        {tr(
          'قم بإنشاء مجموعات ومجموعات فرعية لتصنيف منتجاتك بدقة. هذا يساعد في تنظيم المخزون وتحسين دقة التقارير.',
          'Create main and sub groups to classify your products accurately. This improves inventory structure and reporting accuracy.'
        )}
      </div>

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-500 font-bold hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          {tr('إضافة مجموعة أو مجموعة فرعية', 'Add Group or Subgroup')}
        </button>
      )}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[2.5rem] border border-gray-200 shadow-xl animate-in zoom-in-95 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-black text-slate-800 text-lg">
              {editingGroupId ? tr('تعديل مجموعة', 'Edit Group') : tr('مجموعة جديدة', 'New Group')}
            </h3>
            <button type="button" onClick={resetForm} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full"><X size={20} /></button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                {tr('اسم المجموعة', 'Group Name')}
              </label>
              <input
                type="text"
                placeholder={tr('مثال: قطع غيار المحركات', 'Example: Engine Spare Parts')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-gray-800 focus:ring-4 focus:ring-indigo-50 transition-all"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                {tr('تابعة لمجموعة (اختياري)', 'Parent Group (optional)')}
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-gray-800 focus:ring-4 focus:ring-indigo-50 transition-all appearance-none"
              >
                <option value="">{tr('-- مجموعة رئيسية (لا تتبع لأحد) --', '-- Main Group (no parent) --')}</option>
                {itemGroups.filter(g => !g.parentId && g.id !== editingGroupId).map(g => (
                  <option key={g.id} value={g.id}>{g.icon} {displayGroupName(g)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">
                {tr('الأيقونة المميزة', 'Visual Icon')}
              </label>
              <div className="flex flex-wrap gap-2">
                {icons.map(i => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={`w-11 h-11 flex items-center justify-center rounded-xl border-2 transition-all ${icon === i ? 'border-indigo-600 bg-indigo-50 text-xl scale-110 shadow-md shadow-indigo-100' : 'border-gray-50 bg-gray-50/50 hover:border-gray-200'}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 bg-gray-100 py-4 rounded-2xl font-black text-gray-500 text-xs">
                {tr('إلغاء', 'Cancel')}
              </button>
              <button type="submit" className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs shadow-lg shadow-indigo-100">
                {editingGroupId ? tr('حفظ التغييرات', 'Save Changes') : tr('حفظ المجموعة', 'Save Group')}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {sortedGroups.map(({ group, depth }) => (
          <div
            key={group.id}
            className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex items-center justify-between group hover:border-indigo-100 transition-all animate-in slide-in-from-right-2"
            style={{ marginRight: `${depth * 24}px` }}
          >
            <div className="flex items-center gap-4">
              {depth > 0 && <CornerDownLeft size={14} className="text-gray-300" />}
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white ${depth === 0 ? 'bg-indigo-50/50' : 'bg-gray-50'}`}>
                {group.icon}
              </div>
              <div>
                <div className={`font-black text-gray-800 ${depth === 0 ? 'text-base' : 'text-sm'}`}>{displayGroupName(group)}</div>
                {depth === 0 ? (
                  <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">{tr('مجموعة رئيسية', 'Main Group')}</div>
                ) : (
                  <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-0.5">{tr('مجموعة فرعية', 'Subgroup')}</div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(group)}
                className="p-3 text-gray-300 hover:text-indigo-500 transition-all active:scale-90"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => { if (confirm(tr('حذف المجموعة نهائياً؟', 'Delete this group permanently?'))) deleteItemGroup(group.id); }}
                className="p-3 text-gray-200 hover:text-red-500 transition-all active:scale-90"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}

        {itemGroups.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-gray-100">
            <Layers size={48} className="mx-auto text-gray-100 mb-4" />
            <p className="text-gray-400 font-bold">{tr('لا توجد مجموعات معرفة بعد', 'No groups defined yet')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemGroupManager;
