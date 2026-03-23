import React, { useState, useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { BillOfMaterial, ProductionOrder, BOMComponent, Product } from '../types';
import EnglishDateInput from './EnglishDateInput';
import {
    Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, Package, Factory,
    ClipboardList, CheckCircle, XCircle, AlertTriangle, Play, Calculator,
    Calendar, ArrowRight, Save, RotateCcw, Info, ArrowLeft, Fuel
} from 'lucide-react';

type ViewMode = 'BOM_LIST' | 'BOM_FORM' | 'ORDER_LIST' | 'ORDER_FORM';

const ManufacturingManager: React.FC = () => {
    const {
        boms, addBOM, updateBOM, deleteBOM,
        productionOrders, addProductionOrder, updateProductionOrder, deleteProductionOrder, executeProduction,
        products, units, companySettings
    } = useAccounting();

    const [viewMode, setViewMode] = useState<ViewMode>('BOM_LIST');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const statusLabel = (status: ProductionOrder['status']) => {
        if (!isEnglish) {
            return status === 'COMPLETED' ? 'مكتمل' : status === 'IN_PROGRESS' ? 'قيد التنفيذ' : 'مخطط';
        }
        return status === 'COMPLETED' ? 'Completed' : status === 'IN_PROGRESS' ? 'In Progress' : 'Planned';
    };

    // --- BOM FORM STATE ---
    const [bomForm, setBomForm] = useState<Partial<BillOfMaterial>>({
        name: '',
        outputQuantity: 1,
        components: [],
        laborCost: 0,
        overheadCost: 0,
        status: 'ACTIVE'
    });

    // --- ORDER FORM STATE ---
    const [orderForm, setOrderForm] = useState<Partial<ProductionOrder>>({
        orderNumber: '',
        plannedQuantity: 1,
        status: 'PLANNED',
        startDate: new Date().toISOString().split('T')[0]
    });

    // --- HELPERS ---
    const resetForms = () => {
        setBomForm({ name: '', outputQuantity: 1, components: [], laborCost: 0, overheadCost: 0, status: 'ACTIVE' });
        setOrderForm({ orderNumber: '', plannedQuantity: 1, status: 'PLANNED', startDate: new Date().toISOString().split('T')[0] });
        setEditingId(null);
    };

    const getProductName = (id: string) => products.find(p => p.id === id)?.name || tr('غير معروف', 'Unknown');
    const getProductPrice = (id: string) => products.find(p => p.id === id)?.buyPrice || 0;
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(amount).replace('SAR', '').trim();

    // --- LIVE COST CALCULATION ---
    const bomCost = useMemo(() => {
        const materialCost = (bomForm.components || []).reduce((sum, comp) => {
            return sum + (getProductPrice(comp.productId) * comp.quantity);
        }, 0);

        const labor = Number(bomForm.laborCost) || 0;
        const overhead = Number(bomForm.overheadCost) || 0;
        const total = materialCost + labor + overhead;
        const outputQty = Number(bomForm.outputQuantity) || 1;

        return {
            material: materialCost,
            labor,
            overhead,
            total,
            unit: total / outputQty
        };
    }, [bomForm, products]);

    // --- HANDLERS ---
    const handleSaveBOM = () => {
        if (!bomForm.name || !bomForm.productId) return alert(tr('الرجاء تعبئة اسم النموذج والمنتج النهائي', 'Please enter the BOM name and final product'));
        if (!bomForm.components || bomForm.components.length === 0) return alert(tr('الرجاء إضافة مكونات للنموذج', 'Please add components to the BOM'));

        const bomData = { ...bomForm } as BillOfMaterial;

        if (editingId) {
            updateBOM(editingId, bomData);
        } else {
            addBOM(bomData as Omit<BillOfMaterial, 'id'>);
        }
        resetForms();
        setViewMode('BOM_LIST');
    };

    const handleSaveOrder = () => {
        if (!orderForm.bomId || !orderForm.plannedQuantity) return alert(tr('الرجاء اختيار نموذج التصنيع والكمية', 'Please select a BOM and planned quantity'));

        // Keep BOM/Product immutable while editing an existing order.
        const existingOrder = editingId ? productionOrders.find(o => o.id === editingId) : null;
        const effectiveBomId = existingOrder?.bomId || orderForm.bomId;
        const selectedBOM = boms.find(b => b.id === effectiveBomId);
        if (!selectedBOM) return;

        const orderData: any = {
            ...orderForm,
            productId: existingOrder?.productId || selectedBOM.productId,
            orderNumber: orderForm.orderNumber || `PO-${Math.floor(Math.random() * 100000)}`,
            completedQuantity: existingOrder?.completedQuantity || 0,
            status: existingOrder?.status || orderForm.status || 'PLANNED',
            // Ensure these properties exist from the edit context or init
            bomId: effectiveBomId,
            plannedQuantity: Number(orderForm.plannedQuantity)
        };

        if (editingId) {
            updateProductionOrder(editingId, orderData);
        } else {
            addProductionOrder(orderData as Omit<ProductionOrder, 'id'>);
        }
        resetForms();
        setViewMode('ORDER_LIST');
    };

    const handleAddComponent = () => {
        const newComponent: BOMComponent = { id: Math.random().toString(36).substr(2, 9), productId: '', quantity: 1, unitCost: 0 };
        setBomForm(prev => ({ ...prev, components: [...(prev.components || []), newComponent] }));
    };

    const handleUpdateComponent = (id: string, field: keyof BOMComponent, value: any) => {
        setBomForm(prev => ({
            ...prev,
            components: prev.components?.map(c => c.id === id ? { ...c, [field]: value } : c)
        }));
    };

    const handleRemoveComponent = (id: string) => {
        setBomForm(prev => ({ ...prev, components: prev.components?.filter(c => c.id !== id) }));
    };

    // --- RENDERERS ---

    const renderSidebar = () => (
        <div className="w-full md:w-72 bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 h-fit md:sticky md:top-4">
            <div className="mb-8 px-2 pt-2">
                <div className="flex items-center gap-3 text-blue-800 mb-2">
                    <div className="p-3 bg-blue-100 rounded-2xl"><Factory size={24} /></div>
                    <h2 className="font-black text-xl">{tr('إدارة التصنيع', 'Manufacturing')}</h2>
                </div>
                <p className="text-xs text-gray-400 font-bold pr-16 leading-relaxed">{tr('نظام تخطيط ومراقبة الإنتاج وحساب التكاليف', 'Production planning, tracking, and costing')}</p>
            </div>

            <nav className="space-y-3">
                <button
                    onClick={() => { setViewMode('BOM_LIST'); resetForms(); }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all font-bold group ${viewMode.includes('BOM') ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                    <div className="flex items-center gap-3">
                        <ClipboardList size={20} className={viewMode.includes('BOM') ? 'text-white' : 'text-gray-400'} />
                        <span>{tr('نماذج التصنيع', 'BOMs')}</span>
                    </div>
                    {boms.length > 0 && <span className={`text-xs py-1 px-2 rounded-lg ${viewMode.includes('BOM') ? 'bg-white/20 text-white' : 'bg-white text-gray-400'}`}>{boms.length}</span>}
                </button>
                <button
                    onClick={() => { setViewMode('ORDER_LIST'); resetForms(); }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all font-bold group ${viewMode.includes('ORDER') ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                    <div className="flex items-center gap-3">
                        <Package size={20} className={viewMode.includes('ORDER') ? 'text-white' : 'text-gray-400'} />
                        <span>{tr('أوامر الإنتاج', 'Production Orders')}</span>
                    </div>
                    {productionOrders.filter(o => o.status !== 'COMPLETED').length > 0 && <span className={`text-xs py-1 px-2 rounded-lg ${viewMode.includes('ORDER') ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>{productionOrders.filter(o => o.status !== 'COMPLETED').length}</span>}
                </button>
            </nav>

            <div className="mt-8 bg-amber-50 rounded-3xl p-5 border border-amber-100">
                <div className="flex items-center gap-2 text-amber-600 mb-3">
                    <Info size={16} />
                    <span className="text-xs font-black">{tr('معلومة سريعة', 'Quick Note')}</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed font-bold opacity-80">
                    {tr(
                        'عند تنفيذ أمر الإنتاج، يقوم النظام تلقائياً بخصم المواد الخام وإضافة المنتج النهائي للمخزون وإنشاء القيود المالية.',
                        'When a production order is executed, raw materials are consumed, finished goods are added to stock, and accounting entries are generated.'
                    )}
                </p>
            </div>
        </div>
    );

    const renderBomsList = () => (
        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                <div className="mr-2">
                    <h2 className="text-2xl font-black text-gray-800">{tr('نماذج التصنيع', 'BOM Templates')}</h2>
                    <p className="text-gray-400 text-sm mt-1 font-bold">{tr('قائمة وصفات المنتجات والمكونات', 'List of product recipes and components')}</p>
                </div>
                <button onClick={() => setViewMode('BOM_FORM')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-transform active:scale-95">
                    <Plus size={20} /> {tr('نموذج جديد', 'New BOM')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {boms.map(bom => (
                    <div key={bom.id} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-400 to-purple-400"></div>
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-gray-50 text-gray-600 rounded-2xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                <ClipboardList size={24} />
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                <button onClick={() => { setBomForm(bom); setEditingId(bom.id); setViewMode('BOM_FORM'); }} className="p-2.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors"><Edit2 size={16} /></button>
                                <button onClick={() => deleteBOM(bom.id)} className="p-2.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors"><Trash2 size={16} /></button>
                            </div>
                        </div>

                        <h3 className="font-black text-lg text-gray-800 mb-2 truncate">{bom.name}</h3>
                        <p className="text-xs font-bold text-gray-400 mb-6 flex items-center gap-2">
                            {tr('المنتج النهائي:', 'Final Product:')} <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{getProductName(bom.productId)}</span>
                        </p>

                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-gray-50 p-2 rounded-2xl">
                                <span className="block text-gray-400 text-[9px] font-black uppercase mb-1">{tr('المكونات', 'Components')}</span>
                                <span className="text-gray-700 font-black text-lg">{bom.components.length}</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded-2xl">
                                <span className="block text-gray-400 text-[9px] font-black uppercase mb-1">{tr('الكمية', 'Qty')}</span>
                                <span className="text-gray-700 font-black text-lg">{bom.outputQuantity}</span>
                            </div>
                            <div className="bg-emerald-50 p-2 rounded-2xl">
                                <span className="block text-emerald-600/60 text-[9px] font-black uppercase mb-1">{tr('التكلفة', 'Cost')}</span>
                                <span className="text-emerald-600 font-black text-lg dir-ltr">{((bom.components.reduce((sum, c) => sum + (getProductPrice(c.productId) * c.quantity), 0) + (bom.laborCost || 0) + (bom.overheadCost || 0)) / bom.outputQuantity).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                ))}

                {boms.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200">
                        <div className="inline-flex p-6 bg-white rounded-full shadow-sm mb-4"><ClipboardList size={48} className="text-gray-300" /></div>
                        <h3 className="text-xl font-bold text-gray-400 mb-2">{tr('لا توجد نماذج تصنيع', 'No BOM templates yet')}</h3>
                        <p className="text-gray-400 text-sm mb-6">{tr('قم بإنشاء أول نموذج تصنيع للبدء', 'Create your first BOM to get started')}</p>
                        <button onClick={() => setViewMode('BOM_FORM')} className="text-blue-600 font-bold hover:bg-blue-50 px-6 py-2 rounded-xl transition-colors">{tr('إضافة نموذج جديد', 'Add New BOM')}</button>
                    </div>
                )}
            </div>
        </div>
    );

    const renderBomForm = () => (
        <div className="animate-in slide-in-from-right-8 duration-500 max-w-6xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => setViewMode('BOM_LIST')} className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all shadow-sm"><ArrowRight size={20} /></button>
                <div>
                    <h2 className="text-3xl font-black text-gray-800">{editingId ? tr('تعديل نموذج تصنيع', 'Edit BOM') : tr('نموذج تصنيع جديد', 'New BOM')}</h2>
                    <p className="text-gray-400 text-sm mt-1 font-bold">{tr('تعريف مكونات ومصاريف المنتج بدقة', 'Define components and costs accurately')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="xl:col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-3 text-lg"><Info size={24} className="text-blue-500" /> {tr('البيانات الأساسية', 'Basic Information')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('اسم النموذج', 'BOM Name')}</label>
                                <input
                                    type="text"
                                    value={bomForm.name}
                                    onChange={e => setBomForm({ ...bomForm, name: e.target.value })}
                                    className="w-full p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-blue-500 font-bold text-gray-700 transition-all outline-none"
                                    placeholder={tr('مثال: وصفة الكيك الفاخر', 'Example: Premium cake recipe')}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('المنتج النهائي', 'Final Product')}</label>
                                <div className="relative">
                                    <select
                                        value={bomForm.productId}
                                        onChange={e => setBomForm({ ...bomForm, productId: e.target.value })}
                                        className="w-full p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-blue-500 font-bold text-gray-700 transition-all outline-none appearance-none"
                                    >
                                        <option value="">{tr('-- اختر المنتج --', '-- Select product --')}</option>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('الكمية الناتجة', 'Output Quantity')}</label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min="1"
                                    value={bomForm.outputQuantity}
                                    onChange={e => setBomForm({ ...bomForm, outputQuantity: Number(e.target.value) })}
                                    className="w-full p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-blue-500 font-bold text-gray-700 transition-all outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Components */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-800 flex items-center gap-3 text-lg"><Package size={24} className="text-blue-500" /> {tr('المكونات والمواد الخام', 'Components & Raw Materials')}</h3>
                            <button onClick={handleAddComponent} className="text-xs bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-black hover:bg-blue-100 transition-colors flex items-center gap-2"><Plus size={14} /> {tr('إضافة مكون', 'Add Component')}</button>
                        </div>

                        <div className="space-y-3">
                            {bomForm.components?.map((comp, idx) => (
                                <div key={comp.id} className="flex flex-col md:flex-row gap-3 items-center bg-gray-50/50 p-3 rounded-3xl border border-gray-50 group hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-xs font-black text-gray-400 shadow-sm border border-gray-100">{idx + 1}</div>
                                    <div className="flex-1 w-full relative">
                                        <select
                                            value={comp.productId}
                                            onChange={e => handleUpdateComponent(comp.id, 'productId', e.target.value)}
                                            className="w-full p-3 rounded-2xl border-2 border-transparent bg-white focus:border-blue-500 outline-none text-sm font-bold appearance-none"
                                        >
                                            <option value="">{tr('اختر المادة الخام...', 'Select raw material...')}</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({tr('تكلفة', 'Cost')}: {p.buyPrice})</option>)}
                                        </select>
                                        <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                    </div>
                                    <div className="flex items-center gap-2 w-full md:w-auto">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            placeholder={tr('الكمية', 'Quantity')}
                                            value={comp.quantity}
                                            onChange={e => handleUpdateComponent(comp.id, 'quantity', Number(e.target.value))}
                                            className="w-full md:w-24 p-3 rounded-2xl border-2 border-transparent bg-white focus:border-blue-500 outline-none text-sm font-bold text-center"
                                        />
                                        <div className="bg-white px-4 py-3 rounded-2xl text-xs font-black text-gray-500 border border-gray-100 min-w-[80px] text-center dir-ltr">
                                            {(getProductPrice(comp.productId) * comp.quantity).toFixed(2)}
                                        </div>
                                        <button onClick={() => handleRemoveComponent(comp.id)} className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                            {(!bomForm.components || bomForm.components.length === 0) && (
                                <div className="text-center py-12 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">
                                    <Fuel size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>{tr('قم بإضافة المواد الأولية المطلوبة لإنتاج هذا الصنف', 'Add required raw materials for this product')}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Additional Costs */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Calculator size={20} /></div>
                            <h3 className="font-bold text-gray-800 text-lg">{tr('تكاليف إضافية', 'Additional Costs')}</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('أجور عمالة مباشرة', 'Direct Labor')}</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={bomForm.laborCost}
                                        onChange={e => setBomForm({ ...bomForm, laborCost: Number(e.target.value) })}
                                        className="w-full p-4 pl-12 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-500 font-bold text-gray-700 transition-all outline-none"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">{tr('ريال', 'SAR')}</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('ت. صناعية غير مباشرة', 'Manufacturing Overhead')}</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={bomForm.overheadCost}
                                        onChange={e => setBomForm({ ...bomForm, overheadCost: Number(e.target.value) })}
                                        className="w-full p-4 pl-12 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-500 font-bold text-gray-700 transition-all outline-none"
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">{tr('ريال', 'SAR')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Section (Sticky) */}
                <div className="xl:col-span-1">
                    <div className="bg-gray-900 text-white p-8 rounded-[3rem] shadow-2xl sticky top-6 overflow-hidden relative">
                        {/* Background Pattern */}
                        <div className="absolute top-0 right-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

                        <h3 className="text-xl font-black mb-8 flex items-center gap-3 relative z-10"><Calculator size={24} className="text-blue-400" /> {tr('ملخص التكاليف', 'Cost Summary')}</h3>

                        <div className="space-y-4 mb-8 relative z-10">
                            <div className="flex justify-between items-center text-sm p-3 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-gray-300 font-bold">{tr('المواد الخام', 'Raw Materials')}</span>
                                <span className="font-black dir-ltr text-lg">{formatCurrency(bomCost.material)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm p-3 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-gray-300 font-bold">{tr('أجور عمالة', 'Labor')}</span>
                                <span className="font-black dir-ltr text-lg">{formatCurrency(bomCost.labor)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm p-3 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-gray-300 font-bold">{tr('غير مباشرة', 'Overhead')}</span>
                                <span className="font-black dir-ltr text-lg">{formatCurrency(bomCost.overhead)}</span>
                            </div>

                            <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent my-4"></div>

                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 font-bold">{tr('الإجمالي', 'Total')}</span>
                                <span className="dir-ltr text-2xl font-black text-blue-400">{formatCurrency(bomCost.total)}</span>
                            </div>
                        </div>

                        <div className="bg-blue-600 p-6 rounded-[2rem] mb-8 relative z-10 text-center shadow-lg shadow-blue-900/50">
                            <p className="text-xs text-blue-200 mb-1 font-bold uppercase tracking-widest">{tr('تكلفة الوحدة الواحدة', 'Unit Cost')}</p>
                            <h2 className="text-4xl font-black dir-ltr text-white">{formatCurrency(bomCost.unit)}</h2>
                        </div>

                        <button onClick={handleSaveBOM} className="w-full py-4 bg-white hover:bg-blue-50 text-blue-900 rounded-2xl font-black shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 relative z-10">
                            <Save size={20} /> {tr('حفظ النموذج', 'Save BOM')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderOrderList = () => (
        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                <div className="mr-2">
                    <h2 className="text-2xl font-black text-gray-800">{tr('أوامر الإنتاج', 'Production Orders')}</h2>
                    <p className="text-gray-400 text-sm mt-1 font-bold">{tr('تتبع عمليات التصنيع وحالة التشغيل', 'Track manufacturing operations and status')}</p>
                </div>
                <button onClick={() => setViewMode('ORDER_FORM')} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-purple-200 flex items-center gap-2 transition-transform active:scale-95">
                    <Plus size={20} /> {tr('أمر إنتاج جديد', 'New Production Order')}
                </button>
            </div>

            <div className="space-y-4">
                {productionOrders.map(order => (
                    <div key={order.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 hover:shadow-md transition-all group">
                        <div className="flex items-center gap-6 w-full md:w-auto">
                            <div className={`p-5 rounded-[1.5rem] shadow-sm ${order.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                {order.status === 'COMPLETED' ? <CheckCircle size={28} /> : <RotateCcw size={28} className={order.status === 'IN_PROGRESS' ? 'animate-spin-slow' : ''} />}
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="font-black text-gray-800 text-xl">#{order.orderNumber}</h4>
                                    <span className={`text-[10px] px-3 py-1 rounded-full font-black ${order.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                                        order.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {statusLabel(order.status)}
                                    </span>
                                </div>
                                <p className="text-sm font-bold text-gray-500">
                                    {getProductName(order.productId)} <span className="text-gray-300 px-2">|</span> <span className="text-gray-800">{order.plannedQuantity} {tr('وحدة', 'Unit')}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                            {order.status !== 'COMPLETED' && (
                                <button
                                    onClick={() => {
                                        if (confirm(tr(
                                            'سيتم خصم المواد الخام وإضافة المنتج النهائي للمخزون، وتوليد القيود المالية.\\n\\nهل أنت متأكد من التنفيذ؟',
                                            'Raw materials will be consumed, finished goods will be added to stock, and accounting entries will be generated.\n\nAre you sure you want to execute this order?'
                                        ))) {
                                            executeProduction(order.id);
                                        }
                                    }}
                                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 flex items-center gap-2 transition-transform active:scale-95"
                                >
                                    <Play size={18} /> {tr('تنفيذ الإنتاج', 'Execute Production')}
                                </button>
                            )}

                            <div className="flex gap-2">
                                {order.status !== 'COMPLETED' && (
                                    <button onClick={() => { setOrderForm(order); setEditingId(order.id); setViewMode('ORDER_FORM'); }} className="p-3 bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-2xl transition-colors"><Edit2 size={20} /></button>
                                )}
                                <button onClick={() => deleteProductionOrder(order.id)} className="p-3 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-2xl transition-colors"><Trash2 size={20} /></button>
                            </div>
                        </div>
                    </div>
                ))}

                {productionOrders.length === 0 && (
                    <div className="py-20 text-center bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200">
                        <div className="inline-flex p-6 bg-white rounded-full shadow-sm mb-4"><Package size={48} className="text-gray-300" /></div>
                        <h3 className="text-xl font-bold text-gray-400 mb-2">{tr('لا توجد أوامر إنتاج', 'No production orders')}</h3>
                        <p className="text-sm text-gray-400 mb-6">{tr('قم بإنشاء أمر إنتاج جديد للبدء في التصنيع', 'Create a new production order to get started')}</p>
                        <button onClick={() => setViewMode('ORDER_FORM')} className="text-purple-600 font-bold hover:bg-purple-50 px-6 py-2 rounded-xl transition-colors">{tr('إنشاء أمر جديد', 'Create New Order')}</button>
                    </div>
                )}
            </div>
        </div>
    );

    const renderOrderForm = () => {
        const editingOrder = editingId ? productionOrders.find(o => o.id === editingId) : null;
        const selectedBom = boms.find(b => b.id === (editingOrder?.bomId || orderForm.bomId));

        return (
            <div className="animate-in slide-in-from-right-8 duration-500 max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={() => setViewMode('ORDER_LIST')} className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-gray-700 transition-colors shadow-sm"><ArrowRight size={20} /></button>
                    <div>
                        <h2 className="text-3xl font-black text-gray-800">{editingId ? tr('تعديل أمر إنتاج', 'Edit Production Order') : tr('أمر إنتاج جديد', 'New Production Order')}</h2>
                        <p className="text-gray-400 text-sm mt-1 font-bold">{tr('جدولة عملية تصنيع جديدة', 'Schedule a new manufacturing process')}</p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('رقم الأمر', 'Order Number')}</label>
                            <input
                                type="text"
                                placeholder={tr('تلقائي (PO-xxxxx)', 'Auto (PO-xxxxx)')}
                                value={orderForm.orderNumber}
                                onChange={e => setOrderForm({ ...orderForm, orderNumber: e.target.value })}
                                className="w-full p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-500 font-bold text-gray-700 transition-all outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('تاريخ البدء', 'Start Date')}</label>
                            <EnglishDateInput
                                value={orderForm.startDate}
                                onChange={value => setOrderForm({ ...orderForm, startDate: value })}
                                className="w-full p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-500 font-bold text-gray-700 transition-all outline-none"
                                aria-label={tr('تاريخ البدء', 'Start date')}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('نموذج التصنيع (المنتج)', 'Manufacturing Template (Product)')}</label>
                            <div className="relative">
                                <select
                                    value={orderForm.bomId}
                                    onChange={e => setOrderForm({ ...orderForm, bomId: e.target.value })}
                                    disabled={Boolean(editingId)}
                                    className={`w-full p-4 rounded-2xl border-2 border-transparent font-bold text-gray-700 transition-all outline-none appearance-none ${editingId
                                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                        : 'bg-gray-50 focus:bg-white focus:border-purple-500'
                                        }`}
                                >
                                    <option value="">{tr('-- اختر النموذج --', '-- Select template --')}</option>
                                    {boms.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name} - {getProductName(b.productId)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                            </div>
                            {editingId && (
                                <p className="mt-2 text-[11px] font-bold text-amber-600">
                                    {tr('لا يمكن تعديل المواد الخام أو الصنف بعد إنشاء أمر الإنتاج.', 'Raw materials and product cannot be changed after creating the order.')}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-black text-gray-500 mb-2 mr-1">{tr('الكمية المخططة', 'Planned Quantity')}</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                min="1"
                                value={orderForm.plannedQuantity}
                                onChange={e => setOrderForm({ ...orderForm, plannedQuantity: Number(e.target.value) })}
                                className="w-full p-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-500 font-bold text-gray-700 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {selectedBom && (
                        <div className="bg-purple-50 p-6 rounded-[2rem] border border-purple-100 animate-in fade-in">
                            <h4 className="font-bold text-purple-800 mb-4 flex items-center gap-2 text-lg"><Calculator size={22} /> {tr('تقديرات الأمر', 'Order Estimates')}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white/50 p-4 rounded-2xl">
                                    <span className="block text-purple-600/70 text-xs font-black mb-1">{tr('المواد الخام المطلوبة', 'Required Raw Materials')}</span>
                                    <span className="font-black text-purple-900 text-xl">{selectedBom.components.length} <span className="text-sm opacity-50">{tr('أصناف', 'Items')}</span></span>
                                </div>
                                <div className="bg-white/50 p-4 rounded-2xl">
                                    <span className="block text-purple-600/70 text-xs font-black mb-1">{tr('التكلفة التقديرية', 'Estimated Cost')}</span>
                                    <span className="font-black text-purple-900 text-xl dir-ltr">
                                        {formatCurrency(((selectedBom.components.reduce((sum, c) => sum + (getProductPrice(c.productId) * c.quantity), 0) +
                                            (selectedBom.laborCost || 0) + (selectedBom.overheadCost || 0)) / selectedBom.outputQuantity) * (orderForm.plannedQuantity || 0))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-8 border-t border-gray-50 flex gap-4">
                        <button onClick={() => setViewMode('ORDER_LIST')} className="flex-1 py-4 rounded-2xl text-gray-500 font-bold hover:bg-gray-50 transition-colors">{tr('إلغاء', 'Cancel')}</button>
                        <button onClick={handleSaveOrder} className="flex-[2] py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black shadow-lg shadow-purple-200 transition-all active:scale-95 text-lg">
                            {tr('حفظ الأمر', 'Save Order')}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            className={`p-4 md:p-8 max-w-[1800px] mx-auto flex flex-col md:flex-row gap-6 md:gap-8 items-stretch md:items-start safe-area-bottom app-page overflow-x-hidden ${isEnglish ? 'text-left' : ''}`}
            dir={isEnglish ? 'ltr' : 'rtl'}
        >
            {renderSidebar()}
            <div className="flex-1 w-full min-w-0">
                {viewMode === 'BOM_LIST' && renderBomsList()}
                {viewMode === 'BOM_FORM' && renderBomForm()}
                {viewMode === 'ORDER_LIST' && renderOrderList()}
                {viewMode === 'ORDER_FORM' && renderOrderForm()}
            </div>
        </div>
    );
};

export default ManufacturingManager;

