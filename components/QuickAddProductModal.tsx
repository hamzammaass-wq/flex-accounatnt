import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Scale, ScanBarcode, Upload, X } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { Product } from '../types';
import ResponsiveDialog from './layout/ResponsiveDialog';
import EnglishDateInput from './EnglishDateInput';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { buildNextItemCode, normalizeItemCode } from '../utils/itemCode';
import { PricingMode, resolveProductPricing } from '../utils/productPricing';
import { getDisplayItemGroupName, getDisplayUnitName } from '../utils/displayNames';

const inputClass = 'w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-base font-bold text-slate-700 outline-none transition-all duration-300 shadow-sm focus:bg-white focus:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-blue-400/30 placeholder:text-gray-300';

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unable to read file'));
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });

type QuickAddProductModalProps = {
  onClose: () => void;
  onSave: (product: Product) => void;
  mode?: 'INVOICE' | 'DIRECTORY';
  product?: Product | null;
};

const QuickAddProductModal: React.FC<QuickAddProductModalProps> = ({ onClose, onSave, mode = 'INVOICE', product = null }) => {
  const { addProduct, addItemGroup, addUnit, updateProduct, baseCurrency, companySettings, itemGroups, products, units } = useAccounting();
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCodeMode, setItemCodeMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [wholesalePricingMode, setWholesalePricingMode] = useState<PricingMode>('FIXED');
  const [retailPricingMode, setRetailPricingMode] = useState<PricingMode>('FIXED');
  const [wholesaleMarkupPercent, setWholesaleMarkupPercent] = useState('');
  const [retailMarkupPercent, setRetailMarkupPercent] = useState('');
  const [stock, setStock] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryPeriodDays, setExpiryPeriodDays] = useState('');
  const [expiryAlertLeadDays, setExpiryAlertLeadDays] = useState('');
  const [lowStockAlertQty, setLowStockAlertQty] = useState('');
  const [reorderQty, setReorderQty] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('📦');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCode, setNewUnitCode] = useState('');
  const isEditing = !!product;
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const barcodeEnabled = companySettings.barcodeEnabled ?? true;
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayGroupName = (group?: { id: string; name: string } | null) =>
    getDisplayItemGroupName(group || undefined, isEnglish);
  const displayUnitName = (unit?: { id: string; name: string } | null) =>
    getDisplayUnitName(unit || undefined, isEnglish);
  const autoItemCodePreview = useMemo(() => buildNextItemCode(products, product?.id), [products, product?.id]);
  const title = isEditing
    ? tr('تعديل بيانات الصنف', 'Edit Item')
    : mode === 'DIRECTORY'
      ? tr('تعريف صنف جديد', 'Create New Item')
      : tr('إضافة صنف جديد من الفاتورة', 'Add New Item From Invoice');
  const submitLabel = isEditing
    ? tr('حفظ التعديلات النهائية', 'Save Final Changes')
    : mode === 'DIRECTORY'
      ? tr('حفظ الصنف', 'Save Item')
      : tr('حفظ الصنف وإضافته إلى الفاتورة', 'Save Item And Add It To Invoice');
  const icons = ['📦', '🛒', '💊', '🍎', '🔧', '✨', '🧴', '🧁', '💻', '📚'];

  const parseLocalizedPositiveInt = (value: string): number => {
    const normalized = toEnglishDigits(String(value || '')).replace(/[^\d-]/g, '');
    return parseInt(normalized, 10);
  };

  const parseLocalizedPositiveDecimal = (value: string): number => {
    const normalized = toEnglishDigits(String(value || '').trim());
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  };

  useEffect(() => {
    if (!product) {
      setName('');
      setGroupId('');
      setUnitId('');
      setItemCode('');
      setItemCodeMode('AUTO');
      setBarcode('');
      setImageUrl('');
      setBuyPrice('');
      setSellPrice('');
      setWholesalePrice('');
      setWholesalePricingMode('FIXED');
      setRetailPricingMode('FIXED');
      setWholesaleMarkupPercent('');
      setRetailMarkupPercent('');
      setStock('');
      setExpiryDate('');
      setExpiryPeriodDays('');
      setExpiryAlertLeadDays('');
      setLowStockAlertQty('');
      setReorderQty('');
      return;
    }

    setName(product.name || '');
    setGroupId(product.category || '');
    setUnitId(product.unitId || '');
    setItemCode(product.itemCode || '');
    setItemCodeMode(product.itemCode ? 'MANUAL' : 'AUTO');
    setBarcode(product.barcode || '');
    setImageUrl(product.imageUrl || '');
    setBuyPrice(product.buyPrice !== undefined ? String(product.buyPrice) : '');
    setSellPrice(String(product.retailPrice ?? product.sellPrice ?? 0));
    setWholesalePrice(String(product.wholesalePrice ?? product.retailPrice ?? product.sellPrice ?? 0));
    setWholesalePricingMode(product.wholesalePricingMode === 'MARKUP' ? 'MARKUP' : 'FIXED');
    setRetailPricingMode(product.retailPricingMode === 'MARKUP' ? 'MARKUP' : 'FIXED');
    setWholesaleMarkupPercent(product.wholesaleMarkupPercent !== undefined ? String(product.wholesaleMarkupPercent) : '');
    setRetailMarkupPercent(product.retailMarkupPercent !== undefined ? String(product.retailMarkupPercent) : '');
    setStock(product.stock !== undefined ? String(product.stock) : '');
    setExpiryDate(product.expiryDate || '');
    setExpiryPeriodDays(product.expiryPeriodDays !== undefined ? String(product.expiryPeriodDays) : '');
    setExpiryAlertLeadDays(product.expiryAlertLeadDays !== undefined ? String(product.expiryAlertLeadDays) : '');
    setLowStockAlertQty(product.lowStockAlertQty !== undefined ? String(product.lowStockAlertQty) : '');
    setReorderQty(product.reorderQty !== undefined ? String(product.reorderQty) : '');
  }, [product]);

  const handlePickImage = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(tr('يرجى اختيار ملف صورة فقط.', 'Please select an image file only.'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert(tr('حجم الصورة كبير. الحد الأقصى 2MB.', 'Image is too large. Maximum allowed is 2MB.'));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageUrl(dataUrl);
    } catch {
      alert(tr('تعذر قراءة الصورة. حاول مرة أخرى.', 'Could not read image. Please try again.'));
    }
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    addItemGroup({ name: groupName.trim(), icon: groupIcon });
    setGroupName('');
    setShowGroupForm(false);
  };

  const handleUnitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim() || !newUnitCode.trim()) return;
    addUnit({ name: newUnitName.trim(), code: newUnitCode.trim().toUpperCase() });
    setNewUnitName('');
    setNewUnitCode('');
    setShowUnitForm(false);
  };

  const draftPricingPreview = useMemo(() => {
    const draftRetailInput = parseLocalizedPositiveDecimal(sellPrice);
    const draftWholesaleInput = parseLocalizedPositiveDecimal(wholesalePrice);
    const draft: Product = {
      id: 'draft_product',
      name: name || 'draft',
      buyPrice: parseLocalizedPositiveDecimal(buyPrice),
      sellPrice: draftRetailInput,
      wholesalePrice: draftWholesaleInput > 0 ? draftWholesaleInput : draftRetailInput,
      retailPrice: draftRetailInput,
      wholesalePricingMode,
      retailPricingMode,
      wholesaleMarkupPercent: parseLocalizedPositiveDecimal(wholesaleMarkupPercent),
      retailMarkupPercent: parseLocalizedPositiveDecimal(retailMarkupPercent),
      stock: parseLocalizedPositiveInt(stock) || 0
    };
    return resolveProductPricing(draft, draft.buyPrice);
  }, [
    buyPrice,
    name,
    retailMarkupPercent,
    retailPricingMode,
    sellPrice,
    stock,
    wholesaleMarkupPercent,
    wholesalePrice,
    wholesalePricingMode
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedLowStockAlertQty = parseLocalizedPositiveInt(lowStockAlertQty);
    const parsedReorderQty = parseLocalizedPositiveInt(reorderQty);
    const parsedExpiryPeriodDays = parseLocalizedPositiveInt(expiryPeriodDays);
    const parsedExpiryAlertLeadDays = parseLocalizedPositiveInt(expiryAlertLeadDays);
    const normalizedLowStockAlertQty = Number.isFinite(parsedLowStockAlertQty) && parsedLowStockAlertQty >= 0
      ? parsedLowStockAlertQty
      : undefined;
    const normalizedReorderQty = Number.isFinite(parsedReorderQty) && parsedReorderQty > 0
      ? parsedReorderQty
      : undefined;
    const normalizedExpiryPeriodDays = Number.isFinite(parsedExpiryPeriodDays) && parsedExpiryPeriodDays > 0
      ? parsedExpiryPeriodDays
      : undefined;
    const normalizedExpiryAlertLeadDays = Number.isFinite(parsedExpiryAlertLeadDays) && parsedExpiryAlertLeadDays >= 0
      ? parsedExpiryAlertLeadDays
      : undefined;
    const normalizedExpiryDate = expiryDate.trim() || undefined;
    const manualItemCode = normalizeItemCode(itemCode);
    const resolvedItemCode = itemCodeMode === 'AUTO'
      ? autoItemCodePreview
      : (manualItemCode || undefined);
    const isItemCodeTaken = !!resolvedItemCode && products.some((existingProduct) =>
      existingProduct.id !== product?.id
      && normalizeItemCode(existingProduct.itemCode || '') === resolvedItemCode
    );

    if (isItemCodeTaken) {
      alert(tr(`رقم الصنف ${resolvedItemCode} مستخدم مسبقًا. اختر رقمًا آخر.`, `Item code ${resolvedItemCode} is already used. Choose another code.`));
      return;
    }

    const id = product?.id || Math.random().toString(36).slice(2, 11);
    const normalizedCost = parseLocalizedPositiveDecimal(buyPrice);
    const normalizedRetailInput = parseLocalizedPositiveDecimal(sellPrice);
    const normalizedWholesaleInput = parseLocalizedPositiveDecimal(wholesalePrice);
    const resolvedWholesaleFixedInput = normalizedWholesaleInput > 0 ? normalizedWholesaleInput : normalizedRetailInput;
    const normalizedWholesaleMarkup = parseLocalizedPositiveDecimal(wholesaleMarkupPercent);
    const normalizedRetailMarkup = parseLocalizedPositiveDecimal(retailMarkupPercent);
    const pricingBase: Product = {
      id,
      name: name.trim(),
      buyPrice: normalizedCost,
      sellPrice: normalizedRetailInput,
      wholesalePrice: resolvedWholesaleFixedInput,
      retailPrice: normalizedRetailInput,
      wholesalePricingMode,
      retailPricingMode,
      wholesaleMarkupPercent: normalizedWholesaleMarkup,
      retailMarkupPercent: normalizedRetailMarkup,
      stock: parseLocalizedPositiveInt(stock) || 0
    };
    const pricing = resolveProductPricing(pricingBase, normalizedCost);

    const nextProduct: Product = {
      ...(product || {}),
      id,
      name: name.trim(),
      category: groupId || (itemGroups[0]?.id || 'ig_other'),
      unitId: unitId || undefined,
      itemCode: resolvedItemCode || undefined,
      expiryDate: normalizedExpiryDate,
      expiryPeriodDays: normalizedExpiryPeriodDays,
      expiryAlertLeadDays: normalizedExpiryAlertLeadDays,
      lowStockAlertQty: normalizedLowStockAlertQty,
      reorderQty: normalizedReorderQty,
      imageUrl: imageUrl || undefined,
      sellPrice: pricing.retailPrice,
      retailPrice: pricing.retailPrice,
      wholesalePrice: pricing.wholesalePrice,
      retailPricingMode,
      wholesalePricingMode,
      retailMarkupPercent: normalizedRetailMarkup,
      wholesaleMarkupPercent: normalizedWholesaleMarkup,
      buyPrice: pricing.cost,
      stock: parseLocalizedPositiveInt(stock) || 0,
      barcode: barcode || undefined
    };

    if (product) {
      const result = updateProduct(product.id, nextProduct);
      if (!result.ok) return;
    } else {
      const result = addProduct(nextProduct);
      if (!result.ok) return;
    }
    onSave(nextProduct);
    onClose();
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="xl"
      zIndexClassName="z-[300]"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelClassName="bg-white rounded-[2.5rem] p-4 sm:p-8 shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="animate-in zoom-in-95" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-black text-gray-800 text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 max-h-[78dvh] overflow-y-auto pr-1">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
              {tr('اسم الصنف', 'Item Name')}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('مثال: آيفون 15 برو ماكس', 'Example: iPhone 15 Pro Max')}
              className={inputClass}
            />
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block px-1">
                {tr('ترميز الصنف', 'Item Code')}
              </label>
              <div className="inline-flex items-center gap-1 rounded-xl border border-indigo-100 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setItemCodeMode('AUTO')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${itemCodeMode === 'AUTO' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50'}`}
                >
                  {tr('تلقائي', 'Auto')}
                </button>
                <button
                  type="button"
                  onClick={() => setItemCodeMode('MANUAL')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${itemCodeMode === 'MANUAL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50'}`}
                >
                  {tr('يدوي', 'Manual')}
                </button>
              </div>
            </div>

            {itemCodeMode === 'AUTO' ? (
              <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {tr('سيتم توليده تلقائيًا', 'It will be generated automatically')}
                </span>
                <span className="font-mono text-sm font-black text-indigo-700 dir-ltr">{autoItemCodePreview}</span>
              </div>
            ) : (
              <input
                type="text"
                value={itemCode}
                onChange={(e) => setItemCode(normalizeItemCode(e.target.value))}
                placeholder="ITM-125"
                className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-black text-sm text-center dir-ltr text-indigo-700 focus:ring-4 focus:ring-indigo-50 transition-all"
              />
            )}

            {itemCodeMode === 'MANUAL' && (
              <p className="text-[10px] font-bold text-slate-400 px-1">
                {tr('اتركه فارغًا إذا كنت لا تريد ترميزًا للصنف.', 'Leave it blank if you do not want an item code.')}
              </p>
            )}
          </div>

          {barcodeEnabled && (
            <div className="relative">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder={tr('الباركود (اختياري)', 'Barcode (optional)')}
                className={inputClass}
              />
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">
                {tr('مجموعة الصنف', 'Item Group')}
              </label>
              <div className="flex h-14">
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="flex-1 px-3 bg-gray-50 rounded-r-2xl rounded-l-md border border-gray-100 outline-none text-xs font-bold appearance-none focus:bg-white focus:border-indigo-200 transition-all text-slate-700"
                >
                  <option value="">{tr('اختر مجموعة', 'Select group')}</option>
                  {itemGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {displayGroupName(group)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowGroupForm(true)}
                  className="w-12 bg-indigo-50 text-indigo-600 rounded-l-2xl rounded-r-md border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center justify-center"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">
                {tr('وحدة القياس', 'Unit')}
              </label>
              <div className="flex h-14">
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="flex-1 px-3 bg-gray-50 rounded-r-2xl rounded-l-md border border-gray-100 outline-none text-xs font-bold appearance-none focus:bg-white focus:border-orange-200 transition-all text-slate-700"
                >
                  <option value="">{tr('اختر الوحدة', 'Select unit')}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {displayUnitName(unit)} ({unit.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowUnitForm(true)}
                  className="w-12 bg-orange-50 text-orange-600 rounded-l-2xl rounded-r-md border border-orange-100 hover:bg-orange-100 transition-all flex items-center justify-center"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-28 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt={tr('صورة الصنف', 'Item image')} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold text-gray-300">{tr('لا توجد صورة', 'No image')}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-black border border-indigo-100 bg-indigo-50 text-indigo-600 cursor-pointer hover:bg-indigo-100 transition-colors">
                <Upload size={12} />
                {imageUrl ? tr('تغيير الصورة', 'Replace image') : tr('إضافة صورة', 'Add image')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    await handlePickImage(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-black border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                >
                  {tr('حذف الصورة', 'Remove image')}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2 px-1">
              {tr('تكلفة الشراء / التكلفة الصافية', 'Purchase Cost / Net Cost')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              lang="en"
              value={buyPrice}
              onChange={(e) => setBuyPrice(toEnglishDigits(e.target.value))}
              className="w-full p-4 bg-rose-50/50 rounded-2xl border border-rose-100 outline-none font-black text-lg text-center dir-ltr text-rose-700 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all"
              placeholder="0.00"
            />
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black text-emerald-700">{tr('قائمة الأسعار', 'Price List')}</h4>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  {tr('يمكن تحديد كل سعر كقيمة ثابتة أو كنسبة هامش من التكلفة.', 'Each price can be fixed or based on cost markup percentage.')}
                </p>
              </div>
              <Scale size={16} className="text-emerald-500 shrink-0" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white border border-violet-100 rounded-2xl p-3 space-y-3">
                <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest block">
                  {tr('سعر الجملة', 'Wholesale Price')}
                </label>
                <div className="inline-flex items-center gap-1 rounded-xl border border-violet-100 bg-violet-50/30 p-1">
                  <button
                    type="button"
                    onClick={() => setWholesalePricingMode('FIXED')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${wholesalePricingMode === 'FIXED' ? 'bg-violet-600 text-white' : 'text-violet-700 hover:bg-violet-100'}`}
                  >
                    {tr('ثابت', 'Fixed')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWholesalePricingMode('MARKUP')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${wholesalePricingMode === 'MARKUP' ? 'bg-violet-600 text-white' : 'text-violet-700 hover:bg-violet-100'}`}
                  >
                    {tr('نسبة', 'Markup %')}
                  </button>
                </div>
                {wholesalePricingMode === 'FIXED' ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(toEnglishDigits(e.target.value))}
                    className="w-full p-3 bg-violet-50/50 rounded-xl border border-violet-100 outline-none font-black text-center dir-ltr text-violet-700"
                    placeholder="0.00"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      value={wholesaleMarkupPercent}
                      onChange={(e) => setWholesaleMarkupPercent(toEnglishDigits(e.target.value))}
                      className="w-full p-3 pl-8 bg-violet-50/50 rounded-xl border border-violet-100 outline-none font-black text-center dir-ltr text-violet-700"
                      placeholder="20"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500 font-black">%</span>
                  </div>
                )}
                <div className="text-[11px] font-black text-violet-700 dir-ltr">
                  = {draftPricingPreview.wholesalePrice.toLocaleString()} {baseCurrency}
                </div>
              </div>

              <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-3">
                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">
                  {tr('سعر المفرق', 'Retail Price')}
                </label>
                <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-100 bg-emerald-50/30 p-1">
                  <button
                    type="button"
                    onClick={() => setRetailPricingMode('FIXED')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${retailPricingMode === 'FIXED' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-100'}`}
                  >
                    {tr('ثابت', 'Fixed')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetailPricingMode('MARKUP')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${retailPricingMode === 'MARKUP' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-100'}`}
                  >
                    {tr('نسبة', 'Markup %')}
                  </button>
                </div>
                {retailPricingMode === 'FIXED' ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(toEnglishDigits(e.target.value))}
                    className="w-full p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 outline-none font-black text-center dir-ltr text-emerald-700"
                    placeholder="0.00"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      value={retailMarkupPercent}
                      onChange={(e) => setRetailMarkupPercent(toEnglishDigits(e.target.value))}
                      className="w-full p-3 pl-8 bg-emerald-50/50 rounded-xl border border-emerald-100 outline-none font-black text-center dir-ltr text-emerald-700"
                      placeholder="30"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-black">%</span>
                  </div>
                )}
                <div className="text-[11px] font-black text-emerald-700 dir-ltr">
                  = {draftPricingPreview.retailPrice.toLocaleString()} {baseCurrency}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2 px-1">
              {tr('الكمية الافتتاحية', 'Opening Quantity')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              lang="en"
              value={stock}
              onChange={(e) => setStock(toEnglishDigits(e.target.value))}
              className="w-full p-4 bg-blue-50/30 rounded-2xl border border-blue-100 outline-none font-black text-lg text-center dir-ltr text-blue-800 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all"
              placeholder="0"
            />
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50/20 p-4 space-y-4">
            <div>
              <h4 className="text-xs font-black text-violet-700">{tr('الصلاحية والتنبيهات', 'Expiry and Alerts')}</h4>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                {tr('يمكنك تحديد تاريخ انتهاء مباشر أو فترة صلاحية بالأيام والتنبيه قبل الانتهاء.', 'Set a direct expiry date or shelf-life period in days and pre-expiry alerts.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest block mb-2 px-1">
                  {tr('تاريخ الانتهاء', 'Expiry Date')}
                </label>
                <EnglishDateInput
                  value={expiryDate}
                  onChange={setExpiryDate}
                  className="w-full p-4 bg-white rounded-2xl border border-violet-100 outline-none font-black text-center dir-ltr text-violet-700 focus:ring-4 focus:ring-violet-50 transition-all"
                  wrapperClassName="w-full"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 px-1">
                  {tr('فترة الصلاحية (أيام)', 'Shelf-Life (days)')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiryPeriodDays}
                  onChange={(e) => setExpiryPeriodDays(toEnglishDigits(e.target.value))}
                  className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-black text-lg text-center dir-ltr text-indigo-700 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all"
                  placeholder={tr('اختياري - مثال: 180', 'Optional - example: 180')}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2 px-1">
                {tr('التنبيه قبل الانتهاء (أيام)', 'Alert Before Expiry (days)')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={expiryAlertLeadDays}
                onChange={(e) => setExpiryAlertLeadDays(toEnglishDigits(e.target.value))}
                className="w-full p-4 bg-white rounded-2xl border border-rose-100 outline-none font-black text-lg text-center dir-ltr text-rose-700 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all"
                placeholder={tr('اختياري - مثال: 30', 'Optional - example: 30')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-2 px-1">
                {tr('حد تنبيه نفاد المخزون', 'Low Stock Alert Threshold')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={lowStockAlertQty}
                onChange={(e) => setLowStockAlertQty(toEnglishDigits(e.target.value))}
                className="w-full p-4 bg-amber-50/40 rounded-2xl border border-amber-100 outline-none font-black text-lg text-center dir-ltr text-amber-700 focus:bg-white focus:ring-4 focus:ring-amber-50 transition-all"
                placeholder={tr('اختياري - مثال: 5', 'Optional - example: 5')}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-sky-600 uppercase tracking-widest block mb-2 px-1">
                {tr('كمية إعادة الطلب', 'Reorder Quantity')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={reorderQty}
                onChange={(e) => setReorderQty(toEnglishDigits(e.target.value))}
                className="w-full p-4 bg-sky-50/40 rounded-2xl border border-sky-100 outline-none font-black text-lg text-center dir-ltr text-sky-700 focus:bg-white focus:ring-4 focus:ring-sky-50 transition-all"
                placeholder={tr('اختياري - مثال: 20', 'Optional - example: 20')}
              />
            </div>
          </div>

          <button type="submit" className="w-full min-h-[44px] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 mt-2 flex items-center justify-center gap-2">
            <Check size={18} />
            {submitLabel}
          </button>
        </div>
      </form>

      {showGroupForm && (
        <ResponsiveDialog
          open
          onClose={() => setShowGroupForm(false)}
          size="sm"
          zIndexClassName="z-[320]"
          backdropClassName="bg-black/40 backdrop-blur-sm"
          panelClassName="bg-white rounded-[2rem] p-6 shadow-2xl"
        >
          <form onSubmit={handleGroupSubmit} className="space-y-5" dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg">{tr('مجموعة أصناف جديدة', 'New Item Group')}</h3>
              <button type="button" onClick={() => setShowGroupForm(false)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full">
                <X size={20} />
              </button>
            </div>
            <input
              type="text"
              placeholder={tr('اسم المجموعة', 'Group name')}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={inputClass}
              required
            />
            <div className="grid grid-cols-5 gap-3">
              {icons.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setGroupIcon(icon)}
                  className={`h-12 w-12 flex items-center justify-center rounded-xl border-2 transition-all ${groupIcon === icon ? 'border-indigo-600 bg-indigo-50 text-xl shadow-md' : 'border-gray-50 bg-gray-50/50 hover:border-gray-200'}`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-all">
              {tr('حفظ المجموعة', 'Save Group')}
            </button>
          </form>
        </ResponsiveDialog>
      )}

      {showUnitForm && (
        <ResponsiveDialog
          open
          onClose={() => setShowUnitForm(false)}
          size="sm"
          zIndexClassName="z-[320]"
          backdropClassName="bg-black/40 backdrop-blur-sm"
          panelClassName="bg-white rounded-[2rem] p-6 shadow-2xl"
        >
          <form onSubmit={handleUnitSubmit} className="space-y-5" dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-800 text-lg">{tr('وحدة قياس جديدة', 'New Unit')}</h3>
              <button type="button" onClick={() => setShowUnitForm(false)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full">
                <X size={20} />
              </button>
            </div>
            <input
              type="text"
              placeholder={tr('اسم الوحدة', 'Unit name')}
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="text"
              placeholder={tr('الرمز', 'Code')}
              value={newUnitCode}
              onChange={(e) => setNewUnitCode(e.target.value)}
              className={`${inputClass} text-center uppercase dir-ltr`}
              required
            />
            <button type="submit" className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-100 active:scale-95 transition-all">
              {tr('حفظ الوحدة', 'Save Unit')}
            </button>
          </form>
        </ResponsiveDialog>
      )}
    </ResponsiveDialog>
  );
};

export default QuickAddProductModal;
