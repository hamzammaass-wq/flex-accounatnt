import React, { useEffect, useMemo, useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Warehouse as WarehouseIcon, Plus, MapPin, Truck, ArrowRight, CheckCircle2, X, Package, ArrowRightLeft, History, Trash2, Edit2, AlertCircle, LayoutGrid, Calendar, ChevronDown, ChevronRight, ClipboardList, Sliders, Box, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDisplayProductName, getDisplayUnitName, getDisplayWarehouseLocation, getDisplayWarehouseName } from '../utils/displayNames';
import BarcodeStockTakeManager from './BarcodeStockTakeManager';
import { isStockProduct } from '../utils/productKind';
import { openDrilldown } from '../utils/drilldown';

const inputClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-slate-700 outline-none transition-all focus:bg-white focus:shadow-md focus:border-indigo-400/30 focus:ring-4 focus:ring-indigo-50";
const labelClass = "text-xs font-black text-slate-400 mb-2 block mr-2";

export const WarehouseManager: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { warehouses, addWarehouse, updateWarehouse, deleteWarehouse, stockTransfers, addStockTransfer, updateStockTransfer, deleteStockTransfer, postStockTransfer, products, units, adjustWarehouseStock, companySettings } = useAccounting();
    const [activeTab, setActiveTab] = useState<'LIST' | 'TRANSFER' | 'HISTORY' | 'INVENTORY' | 'ADJUST' | 'BARCODE_OFFLINE'>('LIST');
    const [searchQuery, setSearchQuery] = useState('');
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayWarehouseName = (warehouse?: { id: string; name: string } | null) => getDisplayWarehouseName(warehouse || undefined, isEnglish);
    const displayWarehouseLocation = (warehouse?: { id: string; location?: string } | null) => getDisplayWarehouseLocation(warehouse || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) => getDisplayProductName(product || undefined, isEnglish);
    const displayUnitName = (unitId?: string) => {
        const unit = units.find(u => u.id === unitId);
        return getDisplayUnitName(unit, isEnglish) || unitId || '-';
    };
    const getWarehouseProductQuantity = (productId: string, warehouseId: string) => (
        stockProducts.find(item => item.id === productId)?.warehouseStock?.find(stock => stock.warehouseId === warehouseId)?.quantity ?? 0
    );
    const buildVarianceNote = (currentQuantity: number, newQuantity: number) => {
        const delta = Number((newQuantity - currentQuantity).toFixed(4));
        return tr(
            `من ${currentQuantity} إلى ${newQuantity} (فرق ${delta > 0 ? '+' : ''}${delta})`,
            `From ${currentQuantity} to ${newQuantity} (difference ${delta > 0 ? '+' : ''}${delta})`
        );
    };
    const openProductMovement = (productId?: string) => {
        if (!productId) return;
        openDrilldown({ kind: 'PRODUCT_MOVEMENT', productId });
    };
    const stockProducts = useMemo(() => products.filter(product => isStockProduct(product)), [products]);

    // Warehouse CRUD State
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', location: '', manager: '' });
    const [showForm, setShowForm] = useState(false);

    // Transfer State
    const [transferData, setTransferData] = useState({
        fromId: '',
        toId: '',
        notes: '',
        items: [] as { productId: string; quantity: number }[]
    });
    const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [transferQty, setTransferQty] = useState('');

    // Inventory View State
    const [viewWarehouseId, setViewWarehouseId] = useState(warehouses[0]?.id || '');
    const [inlineAdjustProductId, setInlineAdjustProductId] = useState<string | null>(null);
    const [inlineAdjustQuantity, setInlineAdjustQuantity] = useState('');

    // Adjustment State
    const [adjustData, setAdjustData] = useState({
        warehouseId: '',
        productId: '',
        newQuantity: '',
        reason: 'VARIANCE' as 'VARIANCE' | 'DAMAGED'
    });

    const handleSubmitWarehouse = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;

        if (isEditing) {
            updateWarehouse(isEditing, formData);
        } else {
            addWarehouse(formData);
        }
        setFormData({ name: '', location: '', manager: '' });
        setIsEditing(null);
        setShowForm(false);
    };

    const handleAddTransferItem = () => {
        if (!selectedProduct || !transferQty) return;
        setTransferData(prev => ({
            ...prev,
            items: [...prev.items, { productId: selectedProduct, quantity: parseFloat(transferQty) }]
        }));
        setSelectedProduct('');
        setTransferQty('');
    };

    const resetTransferForm = () => {
        setTransferData({ fromId: '', toId: '', notes: '', items: [] });
        setEditingTransferId(null);
        setSelectedProduct('');
        setTransferQty('');
    };

    const handleSubmitTransfer = () => {
        if (!transferData.fromId || !transferData.toId || transferData.items.length === 0) return alert(tr('يرجى تعبئة جميع البيانات', 'Please fill all required fields'));
        if (transferData.fromId === transferData.toId) return alert(tr('لا يمكن التحويل لنفس المستودع', 'Source and destination warehouse cannot be the same'));
        if (!(companySettings.allowNegativeStock ?? false)) {
            const insufficientItem = transferData.items.find((item) => {
                const product = stockProducts.find(entry => entry.id === item.productId);
                if (!product) return false;
                const sourceQty = product.warehouseStock?.find(stock => stock.warehouseId === transferData.fromId)?.quantity ?? product.stock ?? 0;
                return sourceQty < item.quantity;
            });
            if (insufficientItem) {
                const product = stockProducts.find(entry => entry.id === insufficientItem.productId);
                return alert(tr(
                    `مخزون الصنف ${displayProductName(product || null)} غير كافٍ في المستودع المصدر. فعّل السماح بالمخزون السالب إذا كنت تريد المتابعة.`,
                    `Source warehouse stock for ${displayProductName(product || null)} is not sufficient. Enable negative stock if you want to continue.`
                ));
            }
        }

        const existingTransfer = editingTransferId
            ? stockTransfers.find(transfer => transfer.id === editingTransferId) || null
            : null;
        const payload = {
            transferNumber: existingTransfer?.transferNumber || `TRF-${Date.now().toString().slice(-6)}`,
            date: existingTransfer?.date || new Date().toISOString().split('T')[0],
            fromWarehouseId: transferData.fromId,
            toWarehouseId: transferData.toId,
            items: transferData.items,
            notes: transferData.notes,
            status: 'POSTED' as const
        };

        if (editingTransferId) {
            updateStockTransfer(editingTransferId, payload);
            alert(tr('تم تحديث المناقلة وترحيلها مباشرة', 'Transfer updated and posted directly'));
        } else {
            addStockTransfer(payload);
            alert(tr('تم حفظ المناقلة وترحيلها مباشرة', 'Transfer saved and posted directly'));
        }

        resetTransferForm();
        setActiveTab('HISTORY');
    };

    const handleEditTransfer = (transferId: string) => {
        const transfer = stockTransfers.find(item => item.id === transferId);
        if (!transfer) return;

        setEditingTransferId(transfer.id);
        setTransferData({
            fromId: transfer.fromWarehouseId,
            toId: transfer.toWarehouseId,
            notes: transfer.notes || '',
            items: transfer.items.map(item => ({ ...item }))
        });
        setSelectedProduct('');
        setTransferQty('');
        setActiveTab('TRANSFER');
    };

    const handleDeleteTransfer = (transferId: string) => {
        const transfer = stockTransfers.find(item => item.id === transferId);
        if (!transfer) return;
        if (!window.confirm(tr('سيتم حذف المناقلة وعكس أثرها على المستودعين. متابعة؟', 'This transfer will be deleted and its stock effect will be reversed. Continue?'))) return;

        deleteStockTransfer(transferId);
        if (editingTransferId === transferId) {
            resetTransferForm();
        }
    };

    const handleSubmitAdjustment = () => {
        if (!adjustData.warehouseId || !adjustData.productId || adjustData.newQuantity === '') return alert(tr('يرجى تعبئة البيانات', 'Please fill all required fields'));
        const currentQuantity = getWarehouseProductQuantity(adjustData.productId, adjustData.warehouseId);
        const requestedQuantity = parseFloat(adjustData.newQuantity);
        if (!Number.isFinite(requestedQuantity) || requestedQuantity < 0) {
            return alert(tr('يرجى إدخال كمية صحيحة أكبر من أو تساوي صفر', 'Enter a valid quantity greater than or equal to zero.'));
        }
        if (adjustData.reason === 'DAMAGED' && requestedQuantity > currentQuantity) {
            return alert(tr('إتلاف البضاعة يقبل فقط تخفيض الكمية الحالية.', 'Damaged goods flow can only reduce the current quantity.'));
        }

        const result = adjustWarehouseStock(
            adjustData.productId,
            adjustData.warehouseId,
            requestedQuantity,
            {
                reason: adjustData.reason,
                source: 'MANUAL',
                note: buildVarianceNote(currentQuantity, requestedQuantity)
            }
        );
        if (!result.ok) return alert(result.message);

        alert(adjustData.reason === 'DAMAGED'
            ? tr('تم ترحيل إتلاف البضاعة بنجاح', 'Damaged goods entry was posted successfully')
            : tr('تم تعديل الجرد وترحيل فرق الصنف إلى حساب فروقات المخزون', 'Inventory count was updated and the item difference was posted to the inventory variance account.'));
        setAdjustData({ warehouseId: '', productId: '', newQuantity: '', reason: 'VARIANCE' });
    };

    const handleStartInlineAdjustment = (productId: string, quantity: number) => {
        setInlineAdjustProductId(productId);
        setInlineAdjustQuantity(String(quantity));
    };

    const handleCancelInlineAdjustment = () => {
        setInlineAdjustProductId(null);
        setInlineAdjustQuantity('');
    };

    const handleSaveInlineAdjustment = (productId: string) => {
        if (!viewWarehouseId) return;
        if (inlineAdjustQuantity === '') return alert(tr('يرجى إدخال الكمية الصحيحة', 'Please enter the correct quantity'));
        const currentQuantity = getWarehouseProductQuantity(productId, viewWarehouseId);
        const requestedQuantity = Math.max(0, Number(inlineAdjustQuantity) || 0);

        const result = adjustWarehouseStock(
            productId,
            viewWarehouseId,
            requestedQuantity,
            {
                reason: 'VARIANCE',
                source: 'INLINE',
                note: buildVarianceNote(currentQuantity, requestedQuantity)
            }
        );
        if (!result.ok) return alert(result.message);

        handleCancelInlineAdjustment();
    };

    // Filter Logic
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredWarehouses = warehouses.filter(w => {
        if (!normalizedSearch) return true;
        return [w.name, displayWarehouseName(w), w.location || '', displayWarehouseLocation(w) || '']
            .some(value => value.toLowerCase().includes(normalizedSearch));
    });
    const filteredProducts = stockProducts.filter(p => {
        if (!normalizedSearch) return true;
        return [p.name, displayProductName(p), p.barcode || '']
            .some(value => value.toLowerCase().includes(normalizedSearch));
    });

    useEffect(() => {
        if (!inlineAdjustProductId) return;
        const product = stockProducts.find(item => item.id === inlineAdjustProductId);
        const quantity = product?.warehouseStock?.find(stock => stock.warehouseId === viewWarehouseId)?.quantity ?? 0;
        setInlineAdjustQuantity(String(quantity));
    }, [viewWarehouseId, inlineAdjustProductId, stockProducts]);

    // Calculate generic stats
    const totalWarehouses = warehouses.length;
    const directPostedTransfers = stockTransfers.filter(t => t.status === 'POSTED').length;

    return (
        <div className="app-page w-full min-h-dvh bg-slate-50/50 overflow-x-hidden" dir={isEnglish ? 'ltr' : 'rtl'}>
            {/* Header Area */}
            <div className="bg-white px-3 py-3 shadow-sm border-b border-gray-100 sticky top-0 z-30">
                {/* Title Row */}
                <div className="flex items-center gap-2 mb-3">
                    <button onClick={onBack} className="app-back-btn p-1.5 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-indigo-600 shrink-0">
                        <ArrowRight size={18} />
                    </button>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-1.5 rounded-lg shadow-md shadow-indigo-200 shrink-0">
                            <WarehouseIcon size={16} />
                        </span>
                        <h1 className="text-base font-black text-slate-800 truncate">{tr('إدارة المستودعات', 'Warehouse Management')}</h1>
                    </div>
                </div>

                {/* Tabs Row */}
                <div className="flex bg-slate-100 p-1 rounded-xl w-full">
                    {[
                        { id: 'LIST', label: tr('المستودعات', 'Warehouses'), icon: LayoutGrid },
                        { id: 'INVENTORY', label: tr('الجرد', 'Inventory'), icon: ClipboardList },
                        { id: 'BARCODE_OFFLINE', label: tr('باركود Offline', 'Barcode Offline'), icon: Box },
                        { id: 'TRANSFER', label: tr('نقل', 'Transfer'), icon: ArrowRightLeft },
                        { id: 'ADJUST', label: tr('تعديل', 'Adjust'), icon: Sliders },
                        { id: 'HISTORY', label: tr('السجل', 'History'), icon: History },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            title={tab.label}
                            className={`relative flex-1 py-2 rounded-lg text-[9px] font-black transition-all flex flex-col items-center gap-0.5 z-10 ${activeTab === tab.id
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-white shadow-sm rounded-lg -z-10"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                                />
                            )}
                            <tab.icon size={14} />
                            <span className="leading-none">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="p-3">
                <div className="space-y-4">

                    {/* Stats Dashboard */}
                    {activeTab === 'LIST' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><WarehouseIcon size={60} /></div>
                                <div className="relative z-10">
                                    <p className="text-indigo-100 font-bold mb-1 text-[10px]">{tr('إجمالي المستودعات', 'Total Warehouses')}</p>
                                    <h2 className="text-2xl font-black">{totalWarehouses}</h2>
                                    <p className="mt-2 text-[9px] bg-white/20 w-fit px-2 py-0.5 rounded-full">{warehouses.filter(w => w.isMain).length} {tr('رئيسي', 'Main')}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 text-amber-500"><Truck size={60} /></div>
                                <div className="relative z-10">
                                    <p className="text-slate-400 font-bold mb-1 text-[10px]">{tr('المناقلات المرحّلة', 'Posted Transfers')}</p>
                                    <h2 className="text-2xl font-black text-amber-500">{directPostedTransfers}</h2>
                                    <p className="mt-2 text-[9px] text-slate-400">{tr('تُرحّل مباشرة ويمكن تعديلها أو حذفها', 'Posted directly and can still be edited or deleted')}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {/* --- WAREHOUSES LIST --- */}
                        {activeTab === 'LIST' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                <button onClick={() => { setShowForm(!showForm); setIsEditing(null); setFormData({ name: '', location: '', manager: '' }); }} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2 w-full">
                                    {showForm ? <X size={14} /> : <Plus size={14} />}
                                    {showForm ? tr('إلغاء', 'Cancel') : tr('إضافة مستودع جديد', 'Add New Warehouse')}
                                </button>

                                {showForm && (
                                    <motion.form
                                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                        onSubmit={handleSubmitWarehouse} className="bg-white p-4 rounded-2xl shadow-lg border border-indigo-100"
                                    >
                                        <div className="space-y-3">
                                            <div>
                                                <label className={labelClass}>{tr('اسم المستودع', 'Warehouse Name')}</label>
                                                <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder={tr('مثال: المستودع الرئيسي', 'Example: Main Warehouse')} className={inputClass} autoFocus />
                                            </div>
                                            <div>
                                                <label className={labelClass}>{tr('الموقع / العنوان', 'Location / Address')}</label>
                                                <input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder={tr('مثال: الرياض - حي الملز', 'Example: Riyadh - Al Malaz')} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>{tr('أمين المستودع', 'Warehouse Keeper')}</label>
                                                <input value={formData.manager} onChange={e => setFormData({ ...formData, manager: e.target.value })} placeholder={tr('المسؤول عن العهدة', 'Person in charge')} className={inputClass} />
                                            </div>
                                        </div>
                                        <div className="pt-3">
                                            <button type="submit" className="w-full px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
                                                {isEditing ? tr('حفظ التعديلات', 'Save Changes') : tr('إنشاء المستودع', 'Create Warehouse')}
                                            </button>
                                        </div>
                                    </motion.form>
                                )}

                                <div className="space-y-3">
                                    {filteredWarehouses.map((wh, idx) => (
                                        <motion.div
                                            key={wh.id}
                                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                                            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden"
                                        >
                                            <div className={`absolute top-0 left-0 w-full h-1 ${wh.isMain ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>

                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${wh.isMain ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'}`}>
                                                        <WarehouseIcon size={18} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-black text-slate-800 truncate">{displayWarehouseName(wh)}</h3>
                                                        <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                                                            <MapPin size={10} className="shrink-0" />
                                                            {displayWarehouseLocation(wh) || tr('لا يوجد عنوان', 'No location')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <button onClick={() => { setIsEditing(wh.id); setFormData({ name: wh.name, location: wh.location || '', manager: wh.manager || '' }); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg border border-gray-100"><Edit2 size={14} /></button>
                                                    {!wh.isMain && <button onClick={() => deleteWarehouse(wh.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg border border-gray-100"><Trash2 size={14} /></button>}
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-gray-50 flex justify-between items-center text-[10px] gap-2">
                                                {wh.isMain ? (
                                                    <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">{tr('رئيسي', 'Main')}</span>
                                                ) : (
                                                    <span className="bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full font-bold">{tr('فرعي', 'Branch')}</span>
                                                )}
                                                <div className="flex gap-1">
                                                    <button onClick={() => { setViewWarehouseId(wh.id); setActiveTab('INVENTORY'); }} className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold">{tr('الجرد', 'Inventory')}</button>
                                                    <button onClick={() => { setTransferData(prev => ({ ...prev, fromId: wh.id })); setActiveTab('TRANSFER'); }} className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg font-bold">{tr('نقل', 'Transfer')}</button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* --- INVENTORY LIST --- */}
                        {activeTab === 'INVENTORY' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                className="space-y-6"
                            >
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                            <ClipboardList size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800">{tr('جرد المخزون', 'Inventory Snapshot')}</h3>
                                            <p className="text-slate-400 font-bold text-[10px]">{tr('عرض كميات الأصناف في كل مستودع', 'View item quantities in each warehouse')}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-4">
                                        <div>
                                            <label className={labelClass}>{tr('بحث عن صنف', 'Search Item')}</label>
                                            <div className="relative">
                                                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                                <input
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    placeholder={tr('اسم الصنف...', 'Item name...')}
                                                    className={inputClass + " pr-9 py-2.5"}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelClass}>{tr('اختر المستودع', 'Select Warehouse')}</label>
                                            <select
                                                value={viewWarehouseId}
                                                onChange={e => setViewWarehouseId(e.target.value)}
                                                className={inputClass + " py-2.5"}
                                            >
                                                {warehouses.map(w => <option key={w.id} value={w.id}>{displayWarehouseName(w)}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Product Cards */}
                                    <div className="space-y-2">
                                        {filteredProducts.map((product, idx) => {
                                            const stockEntry = product.warehouseStock?.find(s => s.warehouseId === viewWarehouseId);
                                            const qty = stockEntry ? stockEntry.quantity : 0;
                                            const isInlineEditing = inlineAdjustProductId === product.id;
                                            const inlineNextQuantity = isInlineEditing ? Math.max(0, Number(inlineAdjustQuantity) || 0) : qty;
                                            const inlineDelta = Number((inlineNextQuantity - qty).toFixed(4));

                                            return (
                                                <div key={product.id} className="bg-slate-50 p-3 rounded-xl border border-gray-100 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                                                            <div className="min-w-0">
                                                                <div
                                                                    className="font-bold text-xs text-slate-700 truncate cursor-pointer"
                                                                    onDoubleClick={() => openProductMovement(product.id)}
                                                                    title={tr('اضغط مرتين لفتح حركة الصنف', 'Double-click to open item movement')}
                                                                >
                                                                    {displayProductName(product)}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-bold">{displayUnitName(product.unitId)}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${qty > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                                {qty}
                                                            </span>
                                                            {qty > 0 ? (
                                                                <CheckCircle2 size={12} className="text-emerald-400" />
                                                            ) : (
                                                                <AlertCircle size={12} className="text-rose-400" />
                                                            )}
                                                            {!isInlineEditing && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartInlineAdjustment(product.id, qty)}
                                                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-100 bg-white text-indigo-600 transition hover:bg-indigo-50"
                                                                    title={tr('تعديل الجرد مباشرة', 'Edit stock directly')}
                                                                >
                                                                    <Edit2 size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {isInlineEditing && (
                                                        <div className="rounded-xl border border-indigo-100 bg-white p-3">
                                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                                <div className="text-[10px] font-black text-indigo-600">
                                                                    {tr('تعديل الجرد مباشرة', 'Edit inventory directly')}
                                                                </div>
                                                                <div className="text-[10px] font-bold text-slate-400">
                                                                    {tr('الرصيد الحالي', 'Current balance')}: {qty}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    value={inlineAdjustQuantity}
                                                                    onChange={e => setInlineAdjustQuantity(e.target.value)}
                                                                    className="w-full rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-center text-sm font-black text-indigo-700 outline-none focus:border-indigo-300 focus:bg-white"
                                                                    placeholder={tr('أدخل الكمية الجديدة', 'Enter the new quantity')}
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSaveInlineAdjustment(product.id)}
                                                                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600"
                                                                    title={tr('حفظ', 'Save')}
                                                                >
                                                                    <CheckCircle2 size={16} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCancelInlineAdjustment}
                                                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                                                                    title={tr('إلغاء', 'Cancel')}
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </div>
                                                            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500">
                                                                {tr('الفرق المتوقع', 'Expected difference')}: {inlineDelta > 0 ? '+' : ''}{inlineDelta}
                                                                <span className="mx-1 text-slate-300">|</span>
                                                                {tr('سيُرحل على حساب فروقات المخزون', 'It will be posted to the inventory variance account')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {products.length === 0 && <p className="text-center py-6 text-slate-400 text-xs">{tr('لا توجد أصناف معرفة في النظام', 'No items are defined in the system')}</p>}
                                    {products.length > 0 && filteredProducts.length === 0 && <div className="text-center py-6 text-slate-400 text-xs">{tr('لا توجد نتائج مطابقة للبحث', 'No matching results found')}</div>}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'BARCODE_OFFLINE' && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                            >
                                <BarcodeStockTakeManager />
                            </motion.div>
                        )}

                        {/* --- STOCK ADJUSTMENT --- */}
                        {activeTab === 'ADJUST' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            >
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                                            <Sliders size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800">{tr('تعديل المخزون اليدوي', 'Manual Stock Adjustment')}</h3>
                                            <p className="text-slate-400 font-bold text-[10px]">{tr('تحديث الكميات الفعلية للمطابقة', 'Update actual quantities for reconciliation')}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-3">
                                            <div>
                                                <label className={labelClass}>{tr('المستودع', 'Warehouse')}</label>
                                                <select
                                                    value={adjustData.warehouseId}
                                                    onChange={e => setAdjustData({ ...adjustData, warehouseId: e.target.value })}
                                                    className={inputClass}
                                                >
                                                    <option value="">{tr('-- اختر المستودع --', '-- Select Warehouse --')}</option>
                                                    {warehouses.map(w => <option key={w.id} value={w.id}>{displayWarehouseName(w)}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>{tr('الصنف', 'Item')}</label>
                                                <select
                                                    value={adjustData.productId}
                                                    onChange={e => setAdjustData({ ...adjustData, productId: e.target.value })}
                                                    className={inputClass}
                                                >
                                                    <option value="">{tr('-- اختر الصنف --', '-- Select Item --')}</option>
                                                    {stockProducts.map(p => <option key={p.id} value={p.id}>{displayProductName(p)}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>{tr('سبب الحركة', 'Adjustment Reason')}</label>
                                                <select
                                                    value={adjustData.reason}
                                                    onChange={e => setAdjustData({ ...adjustData, reason: e.target.value as 'VARIANCE' | 'DAMAGED' })}
                                                    className={inputClass}
                                                >
                                                    <option value="VARIANCE">{tr('فروقات مخزون', 'Inventory variance')}</option>
                                                    <option value="DAMAGED">{tr('إتلاف بضاعة', 'Damaged goods')}</option>
                                                </select>
                                            </div>
                                        </div>

                                        {adjustData.productId && adjustData.warehouseId && (
                                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-400 mb-1">{tr('الرصيد الحالي', 'Current Balance')}</p>
                                                    <div className="text-2xl font-black text-slate-700">
                                                        {(() => {
                                                            const p = stockProducts.find(x => x.id === adjustData.productId);
                                                            return p?.warehouseStock?.find(s => s.warehouseId === adjustData.warehouseId)?.quantity || 0;
                                                        })()}
                                                        <span className="text-xs text-slate-400 font-bold mr-1">
                                                            {displayUnitName(stockProducts.find(x => x.id === adjustData.productId)?.unitId)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className={labelClass + " text-indigo-500"}>{tr('الرصيد الفعلي (الجديد)', 'Actual Balance (New)')}</label>
                                                    <input
                                                        type="number"
                                                        value={adjustData.newQuantity}
                                                        onChange={e => setAdjustData({ ...adjustData, newQuantity: e.target.value })}
                                                        placeholder={tr('أدخل الكمية الصحيحة', 'Enter the correct quantity')}
                                                        className={inputClass + " border-indigo-200 focus:bg-indigo-50 text-indigo-600"}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="rounded-xl bg-white px-3 py-2 text-[10px] font-black text-slate-500 border border-slate-100">
                                                    {tr('الفرق المتوقع', 'Expected difference')}: {(() => {
                                                        const currentQty = getWarehouseProductQuantity(adjustData.productId, adjustData.warehouseId);
                                                        const nextQty = Number(adjustData.newQuantity || 0);
                                                        const delta = Number((nextQty - currentQty).toFixed(4));
                                                        return `${delta > 0 ? '+' : ''}${delta}`;
                                                    })()}
                                                    <span className="mx-1 text-slate-300">|</span>
                                                    {adjustData.reason === 'DAMAGED'
                                                        ? tr('سيُرحل على حساب البضاعة التالفة', 'It will be posted to the damaged goods account')
                                                        : tr('سيُرحل على حساب فروقات المخزون', 'It will be posted to the inventory variance account')}
                                                </div>
                                                <p className="text-[10px] font-black text-slate-400">
                                                    {adjustData.reason === 'DAMAGED'
                                                        ? tr('عند اختيار إتلاف بضاعة سيتم تحميل النقص على حساب البضاعة التالفة، ولا يمكن زيادة الكمية بهذا السبب.', 'When damaged goods is selected, any decrease will post to the damaged goods account and the quantity cannot be increased with this reason.')
                                                        : tr('التعديل اليدوي سيُحمّل فرق الزيادة أو النقص على حساب فروقات المخزون.', 'Manual adjustment will post the increase or decrease difference to the inventory variance account.')}
                                                </p>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleSubmitAdjustment}
                                            disabled={!adjustData.productId || !adjustData.warehouseId || adjustData.newQuantity === ''}
                                            className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-200"
                                        >
                                            {tr('حفظ التعديل', 'Save Adjustment')}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}


                        {/* --- STOCK TRANSFER --- */}
                        {activeTab === 'TRANSFER' && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                className="space-y-4"
                            >
                                <div>
                                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                                                <ArrowRightLeft size={16} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-800">{editingTransferId ? tr('تعديل مناقلة مخزنية', 'Edit Stock Transfer') : tr('مناقلة مخزنية جديدة', 'New Stock Transfer')}</h3>
                                                <p className="text-[10px] text-slate-400 font-bold">{tr('يتم الترحيل مباشرة مع بقاء التعديل والحذف من السجل', 'Direct posting with edit/delete still available from history')}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-3 mb-4">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <label className="text-[10px] font-black text-rose-500 mb-2 block flex items-center gap-1"><div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div> {tr('من مستودع (المصدر)', 'From Warehouse (Source)')}</label>
                                                <select value={transferData.fromId} onChange={e => setTransferData({ ...transferData, fromId: e.target.value })} className={inputClass + " bg-white"}>
                                                    <option value="">{tr('-- اختر المصدر --', '-- Select Source --')}</option>
                                                    {warehouses.map(w => <option key={w.id} value={w.id}>{displayWarehouseName(w)}</option>)}
                                                </select>
                                            </div>

                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <label className="text-[10px] font-black text-emerald-500 mb-2 block flex items-center gap-1"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> {tr('إلى مستودع (الوجهة)', 'To Warehouse (Destination)')}</label>
                                                <select value={transferData.toId} onChange={e => setTransferData({ ...transferData, toId: e.target.value })} className={inputClass + " bg-white"}>
                                                    <option value="">{tr('-- اختر الوجهة --', '-- Select Destination --')}</option>
                                                    {warehouses.map(w => <option key={w.id} value={w.id}>{displayWarehouseName(w)}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="bg-indigo-50/50 p-3 rounded-xl mb-4 border border-indigo-100/50">
                                            <h4 className="font-black text-xs text-indigo-900 mb-3 flex items-center gap-1.5"><Package size={14} className="text-indigo-500" /> {tr('الأصناف المحولة', 'Transferred Items')}</h4>

                                            <div className="space-y-2 mb-3">
                                                <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} className={inputClass + " text-xs"}>
                                                    <option value="">{tr('-- اختر الصنف --', '-- Select Item --')}</option>
                                                    {stockProducts.map(p => <option key={p.id} value={p.id}>{displayProductName(p)} ({p.stock})</option>)}
                                                </select>
                                                <div className="flex gap-2">
                                                    <input type="number" value={transferQty} onChange={e => setTransferQty(e.target.value)} placeholder={tr('الكمية', 'Quantity')} className={inputClass + " text-center font-black flex-1"} />
                                                    <button onClick={handleAddTransferItem} className="bg-indigo-600 text-white rounded-xl px-4 shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center shrink-0">
                                                        <Plus size={18} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-2 bg-white p-2.5 rounded-xl min-h-[80px] border border-slate-100">
                                                <AnimatePresence>
                                                    {transferData.items.length === 0 ? (
                                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-20 text-slate-300">
                                                            <Package size={24} className="mb-1 opacity-50" />
                                                            <p className="text-[10px] font-bold">{tr('لم يتم إضافة أصناف بعد', 'No items added yet')}</p>
                                                        </motion.div>
                                                    ) : (
                                                        transferData.items.map((item, idx) => {
                                                            const p = stockProducts.find(x => x.id === item.productId);
                                                            return (
                                                                <motion.div
                                                                    key={idx}
                                                                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                                                    className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-slate-500 text-[10px] font-bold border border-slate-100">{idx + 1}</div>
                                                                        <span
                                                                            className="font-bold text-slate-700 text-xs cursor-pointer"
                                                                            onDoubleClick={() => openProductMovement(item.productId)}
                                                                            title={tr('اضغط مرتين لفتح حركة الصنف', 'Double-click to open item movement')}
                                                                        >
                                                                            {displayProductName(p || null)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-black text-indigo-600 bg-white px-2.5 py-1 rounded-lg text-xs border border-indigo-100">{item.quantity}</span>
                                                                        <button onClick={() => setTransferData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))} className="text-rose-300 hover:text-rose-500 p-1"><X size={14} /></button>
                                                                    </div>
                                                                </motion.div>
                                                            )
                                                        })
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="mb-3">
                                            <label className={labelClass}>{tr('ملاحظات', 'Notes')}</label>
                                            <textarea value={transferData.notes} onChange={e => setTransferData({ ...transferData, notes: e.target.value })} placeholder={tr('ملاحظات...', 'Notes...')} className={inputClass + " min-h-[60px] resize-none"} />
                                        </div>

                                        <div className="space-y-2">
                                            <button onClick={handleSubmitTransfer} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-200 transition-all active:scale-[0.99] flex items-center justify-center gap-2">
                                                <CheckCircle2 size={16} />
                                                {editingTransferId ? tr('حفظ التعديل وترحيل المناقلة', 'Save Edit and Post Transfer') : tr('ترحيل المناقلة مباشرة', 'Post Transfer Directly')}
                                            </button>
                                            {editingTransferId && (
                                                <button
                                                    type="button"
                                                    onClick={resetTransferForm}
                                                    className="w-full py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-black text-sm transition-all hover:bg-slate-50"
                                                >
                                                    {tr('إلغاء التعديل', 'Cancel Edit')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Tips & Recent */}
                                <div className="bg-indigo-900 text-white p-4 rounded-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-10"><AlertCircle size={60} /></div>
                                    <div className="relative z-10">
                                        <h4 className="text-sm font-black mb-3">{tr('تعليمات', 'Instructions')}</h4>
                                        <ul className="space-y-2 text-indigo-200 text-[10px] font-medium leading-relaxed">
                                            <li className="flex gap-1.5"><div className="w-1 h-1 bg-indigo-400 rounded-full mt-1.5 shrink-0"></div> {tr('تأكد من اختيار المستودع الصحيح.', 'Make sure you choose the correct warehouse.')}</li>
                                            <li className="flex gap-1.5"><div className="w-1 h-1 bg-indigo-400 rounded-full mt-1.5 shrink-0"></div> {tr('عند الحفظ، تُرحّل المناقلة مباشرة وتُحدّث الكميات فورًا.', 'When saved, the transfer is posted immediately and stock updates right away.')}</li>
                                            <li className="flex gap-1.5"><div className="w-1 h-1 bg-indigo-400 rounded-full mt-1.5 shrink-0"></div> {tr('يمكنك تعديل أو حذف المناقلة لاحقًا من السجل، وسيتم عكس أثرها تلقائيًا.', 'You can edit or delete the transfer later from history, and its stock effect will be reversed automatically.')}</li>
                                        </ul>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* --- HISTORY --- */}
                        {activeTab === 'HISTORY' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                                {stockTransfers.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <History size={28} />
                                        </div>
                                        <h3 className="font-black text-slate-800 text-sm mb-1">{tr('سجل الحركات فارغ', 'Transfer History Is Empty')}</h3>
                                        <p className="text-slate-400 text-xs">{tr('لم يتم إجراء أي مناقلات بعد', 'No transfers have been made yet')}</p>
                                    </div>
                                ) : stockTransfers.map((trf, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                        key={trf.id}
                                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100"
                                    >
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600">
                                                <CheckCircle2 size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <h4 className="font-black text-slate-800 text-sm">{trf.transferNumber}</h4>
                                                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-emerald-100 text-emerald-700">
                                                        {tr('مرحلة', 'Posted')}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
                                                    <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(trf.date).toLocaleDateString(isEnglish ? 'en-GB' : 'ar-EG-u-nu-latn')}</span>
                                                    <span className="flex items-center gap-1"><Package size={10} /> {trf.items.reduce((acc, item) => acc + item.quantity, 0)} {tr('قطعة', 'pcs')}</span>
                                                </div>
                                                <div className="mt-2 text-[10px] font-bold bg-slate-50 p-2 rounded-lg text-slate-500 flex items-center gap-1">
                                                    <span className="text-slate-400">{tr('من', 'From')}</span> {displayWarehouseName(warehouses.find(w => w.id === trf.fromWarehouseId) || null)}
                                                    <ArrowRight size={10} className="text-slate-300 mx-0.5" />
                                                    <span className="text-slate-400">{tr('إلى', 'To')}</span> {displayWarehouseName(warehouses.find(w => w.id === trf.toWarehouseId) || null)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => handleEditTransfer(trf.id)}
                                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs font-black text-indigo-700"
                                            >
                                                <Edit2 size={13} />
                                                {tr('تعديل', 'Edit')}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTransfer(trf.id)}
                                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs font-black text-rose-700"
                                            >
                                                <Trash2 size={13} />
                                                {tr('حذف', 'Delete')}
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </div>
        </div>
    );
};

export default WarehouseManager; 
