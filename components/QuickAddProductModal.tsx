import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, Plus, Scale, ScanBarcode, Upload, X } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ensureCameraPermission } from '../utils/cameraPermission';
import { createPortal, flushSync } from 'react-dom';
import { useAccounting } from '../contexts/AccountingContext';
import { Product, ProductKind } from '../types';
import ResponsiveDialog from './layout/ResponsiveDialog';
import EnglishDateInput from './EnglishDateInput';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { buildNextItemCode, normalizeItemCode, resolveProductItemCodeMode } from '../utils/itemCode';
import { PricingMode, resolveProductPricing } from '../utils/productPricing';
import { getDisplayItemGroupName, getDisplayUnitName } from '../utils/displayNames';
import { normalizeProductInventoryFields } from '../utils/productKind';
import { compressImageFile } from '../utils/imageCompression';

const inputClass = 'w-full p-3 bg-gray-50 border border-gray-100 rounded-[1.2rem] text-sm font-bold text-slate-700 outline-none transition-all duration-300 shadow-sm focus:bg-white focus:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-blue-400/30 placeholder:text-gray-300';



type QuickAddProductModalProps = {
  onClose: () => void;
  onSave: (product: Product) => void;
  mode?: 'INVOICE' | 'DIRECTORY';
  product?: Product | null;
  initialName?: string;
};

const QuickAddProductModal: React.FC<QuickAddProductModalProps> = ({ onClose, onSave, mode = 'INVOICE', product = null, initialName = '' }) => {
  const { addProduct, addItemGroup, addUnit, updateProduct, baseCurrency, companySettings, itemGroups, products, units } = useAccounting();
  const [name, setName] = useState('');
  const [productKind, setProductKind] = useState<ProductKind>('STOCK');
  const [groupId, setGroupId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCodeMode, setItemCodeMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [barcode, setBarcode] = useState('');
  const [showScanner, setShowScanner] = useState(false);
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
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('📦');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCode, setNewUnitCode] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isEditing = !!product;
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const barcodeEnabled = companySettings.barcodeEnabled ?? true;
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayGroupName = (group?: { id: string; name: string } | null) =>
    getDisplayItemGroupName(group || undefined, isEnglish);
  const displayUnitName = (unit?: { id: string; name: string } | null) =>
    getDisplayUnitName(unit || undefined, isEnglish);
  const autoItemCodePreview = useMemo(() => buildNextItemCode(products, product?.id), [products, product?.id]);
  const persistedAutoItemCode = useMemo(
    () => normalizeItemCode(product?.itemCode || ''),
    [product?.itemCode]
  );
  const effectiveAutoItemCode = persistedAutoItemCode || autoItemCodePreview;
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
      setName(initialName);
      setProductKind('STOCK');
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
      return;
    }

    setName(product.name || '');
    setProductKind(product.kind === 'SERVICE' ? 'SERVICE' : 'STOCK');
    setGroupId(product.category || '');
    setUnitId(product.unitId || '');
    setItemCode(product.itemCode || '');
    setItemCodeMode(resolveProductItemCodeMode(product));
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
  }, [product, initialName]);

  // Scanner Management
  const startScanner = async () => {
    if (!(await ensureCameraPermission(tr))) return;

    flushSync(() => {
      setShowScanner(true);
    });

    try {
      const html5QrCode = new Html5Qrcode('quick-add-product-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      const cameraConstraints = {
        facingMode: 'environment',
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 }
      };

      await html5QrCode.start(
        cameraConstraints,
        config,
        (decodedText) => {
          setBarcode(decodedText);
          stopAndCloseScanner();
        },
        () => {} // ignore scan errors
      );
    } catch (err) {
      console.error('Barcode scanner failed to start', err);
      alert(tr('تعذر الوصول للكاميرا. يرجى التأكد من منح الصلاحيات.', 'Unable to access camera. Please grant camera permission.'));
      setShowScanner(false);
    }
  };

  const stopAndCloseScanner = async () => {
    if (scannerRef.current) {
      const qr = scannerRef.current;
      scannerRef.current = null;
      try {
        if (qr.isScanning) {
          await qr.stop();
        }
        await qr.clear();
      } catch (e) {
        console.error('Error stopping scanner:', e);
      }
    }
    setShowScanner(false);
  };

  // Ensure scanner is stopped on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        const qr = scannerRef.current;
        if (qr.isScanning) {
          qr.stop().then(() => qr.clear()).catch(console.error);
        }
      }
    };
  }, []);

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
      const dataUrl = await compressImageFile(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.7,
        mimeType: 'image/jpeg'
      });
      setImageUrl(dataUrl);
    } catch {
      alert(tr('تعذر قراءة أو معالجة الصورة. حاول مرة أخرى.', 'Could not process image. Please try again.'));
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
      kind: productKind,
      buyPrice: parseLocalizedPositiveDecimal(buyPrice),
      sellPrice: draftRetailInput,
      wholesalePrice: draftWholesaleInput > 0 ? draftWholesaleInput : draftRetailInput,
      retailPrice: draftRetailInput,
      wholesalePricingMode,
      retailPricingMode,
      wholesaleMarkupPercent: parseLocalizedPositiveDecimal(wholesaleMarkupPercent),
      retailMarkupPercent: parseLocalizedPositiveDecimal(retailMarkupPercent),
      stock: productKind === 'SERVICE' ? 0 : (parseLocalizedPositiveInt(stock) || 0)
    };
    return resolveProductPricing(draft, draft.buyPrice);
  }, [
    buyPrice,
    name,
    productKind,
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
    const parsedExpiryPeriodDays = parseLocalizedPositiveInt(expiryPeriodDays);
    const parsedExpiryAlertLeadDays = parseLocalizedPositiveInt(expiryAlertLeadDays);
    const normalizedLowStockAlertQty = Number.isFinite(parsedLowStockAlertQty) && parsedLowStockAlertQty >= 0
      ? parsedLowStockAlertQty
      : undefined;
    const normalizedExpiryPeriodDays = Number.isFinite(parsedExpiryPeriodDays) && parsedExpiryPeriodDays > 0
      ? parsedExpiryPeriodDays
      : undefined;
    const normalizedExpiryAlertLeadDays = Number.isFinite(parsedExpiryAlertLeadDays) && parsedExpiryAlertLeadDays >= 0
      ? parsedExpiryAlertLeadDays
      : undefined;
    const normalizedExpiryDate = expiryDate.trim() || undefined;
    const manualItemCode = normalizeItemCode(itemCode);
    const hasManualItemCode = itemCodeMode === 'MANUAL' && !!manualItemCode;
    const resolvedItemCode = hasManualItemCode
      ? manualItemCode
      : effectiveAutoItemCode;
    const resolvedItemCodeMode = hasManualItemCode ? 'MANUAL' : 'AUTO';
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
      kind: productKind,
      category: groupId || (itemGroups[0]?.id || 'ig_other'),
      unitId: unitId || undefined,
      itemCode: resolvedItemCode || undefined,
      itemCodeMode: resolvedItemCodeMode,
      expiryDate: productKind === 'SERVICE' ? undefined : normalizedExpiryDate,
      expiryPeriodDays: productKind === 'SERVICE' ? undefined : normalizedExpiryPeriodDays,
      expiryAlertLeadDays: productKind === 'SERVICE' ? undefined : normalizedExpiryAlertLeadDays,
      lowStockAlertQty: productKind === 'SERVICE' ? undefined : normalizedLowStockAlertQty,
      reorderQty: undefined,
      imageUrl: imageUrl || undefined,
      sellPrice: pricing.retailPrice,
      retailPrice: pricing.retailPrice,
      wholesalePrice: pricing.wholesalePrice,
      retailPricingMode,
      wholesalePricingMode,
      retailMarkupPercent: normalizedRetailMarkup,
      wholesaleMarkupPercent: normalizedWholesaleMarkup,
      buyPrice: pricing.cost,
      stock: productKind === 'SERVICE' ? 0 : (parseLocalizedPositiveInt(stock) || 0),
      barcode: barcode || undefined
    };
    const normalizedProduct = normalizeProductInventoryFields(nextProduct);

    if (product) {
      const result = updateProduct(product.id, normalizedProduct);
      if (!result.ok) return;
    } else {
      const result = addProduct(normalizedProduct);
      if (!result.ok) return;
    }
    onSave(normalizedProduct);
    onClose();
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="xl"
      zIndexClassName="z-[300]"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelClassName="product-definition-dialog-panel bg-white rounded-[2rem] p-3 sm:p-4 shadow-2xl !overflow-hidden"
    >
      <form data-testid="products-form" onSubmit={handleSubmit} className="product-definition-form animate-in zoom-in-95 flex flex-col" dir={isEnglish ? 'ltr' : 'rtl'}>
        <div className="flex justify-between items-center gap-3 mb-2.5">
          <h3 className="font-black text-gray-800 text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-0.5">
          <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
            <div className="min-[430px]:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                {tr('\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641', 'Item Name')}
              </label>
              <input
                autoFocus
                data-testid="products-form-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr('\u0645\u062b\u0627\u0644: \u0622\u064a\u0641\u0648\u0646 15 \u0628\u0631\u0648 \u0645\u0627\u0643\u0633', 'Example: iPhone 15 Pro Max')}
                className={inputClass}
              />
            </div>

            <div className="min-[430px]:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/30 p-3">
              <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest block mb-2 px-1">
                {tr('نوع الصنف', 'Item Type')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProductKind('STOCK')}
                  className={`rounded-2xl border px-3 py-3 text-sm font-black transition-all ${productKind === 'STOCK' ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' : 'border-blue-100 bg-white text-blue-700 hover:bg-blue-50'}`}
                >
                  {tr('صنف مخزني', 'Stock Item')}
                </button>
                <button
                  type="button"
                  onClick={() => setProductKind('SERVICE')}
                  className={`rounded-2xl border px-3 py-3 text-sm font-black transition-all ${productKind === 'SERVICE' ? 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-100' : 'border-amber-100 bg-white text-amber-700 hover:bg-amber-50'}`}
                >
                  {tr('صنف خدمة', 'Service Item')}
                </button>
              </div>
              <p className="mt-2 px-1 text-[10px] font-bold text-slate-500">
                {productKind === 'SERVICE'
                  ? tr('صنف الخدمة لا يدخل في المخزون ولا تظهر له تنبيهات نقص أو صلاحية.', 'Service items do not affect inventory and will not show stock or expiry alerts.')
                  : tr('الصنف المخزني يتابع الكمية والصلاحية والتنبيهات كالمعتاد.', 'Stock items track quantity, expiry, and inventory alerts as usual.')}
              </p>
            </div>

            <div className={`rounded-2xl border border-indigo-100 bg-indigo-50/20 p-3 space-y-2.5 ${barcodeEnabled ? '' : 'min-[430px]:col-span-2'}`}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block px-1">
                  {tr('\u062a\u0631\u0645\u064a\u0632 \u0627\u0644\u0635\u0646\u0641', 'Item Code')}
                </label>
                <div className="inline-flex items-center gap-1 rounded-xl border border-indigo-100 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setItemCodeMode('AUTO')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${itemCodeMode === 'AUTO' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50'}`}
                  >
                    {tr('\u062a\u0644\u0642\u0627\u0626\u064a', 'Auto')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemCodeMode('MANUAL')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${itemCodeMode === 'MANUAL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50'}`}
                  >
                    {tr('\u064a\u062f\u0648\u064a', 'Manual')}
                  </button>
                </div>
              </div>

              {itemCodeMode === 'AUTO' ? (
                <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {tr('سيبقى تلقائيًا حتى تدخل ترميزًا يدويًا', 'Stays automatic until you enter a manual code')}
                  </span>
                  <span className="font-mono text-sm font-black text-indigo-700 dir-ltr">{effectiveAutoItemCode}</span>
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
                  {tr('إذا تركته فارغًا سيبقى التوليد التلقائي لهذا الصنف.', 'Leave it blank to keep automatic generation for this item.')}
                </p>
              )}
            </div>

            {barcodeEnabled && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                  {tr('\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062f', 'Barcode')}
                </label>
                <div className="relative">
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder={tr('\u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062f (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)', 'Barcode (optional)')}
                    className={`${inputClass} ${isEnglish ? 'pl-11 pr-12' : 'pr-11 pl-12'}`}
                  />
                  <ScanBarcode className={`absolute top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none ${isEnglish ? 'left-4' : 'right-4'}`} size={18} />
                  <button
                    type="button"
                    onClick={startScanner}
                    className={`absolute top-1/2 -translate-y-1/2 rounded-xl bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100 ${isEnglish ? 'right-3' : 'left-3'}`}
                    title={tr('مسح الباركود بالكاميرا', 'Scan barcode with camera')}
                  >
                    <Camera size={16} />
                  </button>
                </div>
              </div>
            )}

            <div className="min-[430px]:col-span-2 grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">
                  {tr('\u0645\u062c\u0645\u0648\u0639\u0629 \u0627\u0644\u0635\u0646\u0641', 'Item Group')}
                </label>
                <div className="flex h-12">
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="flex-1 px-3 bg-gray-50 rounded-r-2xl rounded-l-md border border-gray-100 outline-none text-xs font-bold appearance-none focus:bg-white focus:border-indigo-200 transition-all text-slate-700"
                  >
                    <option value="">{tr('\u0627\u062e\u062a\u0631 \u0645\u062c\u0645\u0648\u0639\u0629', 'Select group')}</option>
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
                  {tr('\u0648\u062d\u062f\u0629 \u0627\u0644\u0642\u064a\u0627\u0633', 'Unit')}
                </label>
                <div className="flex h-12">
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="flex-1 px-3 bg-gray-50 rounded-r-2xl rounded-l-md border border-gray-100 outline-none text-xs font-bold appearance-none focus:bg-white focus:border-orange-200 transition-all text-slate-700"
                  >
                    <option value="">{tr('\u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u062d\u062f\u0629', 'Select unit')}</option>
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

            <div>
              <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2 px-1">
                {tr('\u062a\u0643\u0644\u0641\u0629 \u0627\u0644\u0634\u0631\u0627\u0621 / \u0627\u0644\u062a\u0643\u0644\u0641\u0629 \u0627\u0644\u0635\u0627\u0641\u064a\u0629', 'Purchase Cost / Net Cost')}
              </label>
              <input
                type="text"
                inputMode="decimal"
                lang="en"
                data-testid="products-form-buy-price"
                value={buyPrice}
                onChange={(e) => setBuyPrice(toEnglishDigits(e.target.value))}
                className="w-full p-4 bg-rose-50/50 rounded-2xl border border-rose-100 outline-none font-black text-lg text-center dir-ltr text-rose-700 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2 px-1">
                {tr('\u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0627\u0641\u062a\u062a\u0627\u062d\u064a\u0629', 'Opening Quantity')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                lang="en"
                data-testid="products-form-stock"
                value={stock}
                onChange={(e) => setStock(toEnglishDigits(e.target.value))}
                disabled={productKind === 'SERVICE'}
                className={`w-full p-4 rounded-2xl border outline-none font-black text-lg text-center dir-ltr transition-all ${productKind === 'SERVICE' ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-50/30 border-blue-100 text-blue-800 focus:bg-white focus:ring-4 focus:ring-blue-50'}`}
                placeholder={productKind === 'SERVICE' ? tr('لا ينطبق على الخدمة', 'Not used for service') : '0'}
              />
            </div>

            <div className="min-[430px]:col-span-2 rounded-2xl border border-gray-100 bg-gray-50/80 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block px-1">
                    {tr('\u0635\u0648\u0631\u0629 \u0627\u0644\u0635\u0646\u0641', 'Item Image')}
                  </label>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 px-1">
                    {tr('\u062d\u0642\u0644 \u0627\u062e\u062a\u064a\u0627\u0631\u064a. \u064a\u0645\u0643\u0646\u0643 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0622\u0646 \u0623\u0648 \u0644\u0627\u062d\u0642\u064b\u0627.', 'Optional field. You can add the image now or later.')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-black border border-indigo-100 bg-indigo-50 text-indigo-600 cursor-pointer hover:bg-indigo-100 transition-colors">
                    <Upload size={12} />
                    {imageUrl ? tr('\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0635\u0648\u0631\u0629', 'Replace image') : tr('\u0625\u0636\u0627\u0641\u0629 \u0635\u0648\u0631\u0629', 'Add image')}
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
                      {tr('\u062d\u0630\u0641 \u0627\u0644\u0635\u0648\u0631\u0629', 'Remove image')}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white px-3 py-2 flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt={tr('\u0635\u0648\u0631\u0629 \u0627\u0644\u0635\u0646\u0641', 'Item image')} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-gray-300">{tr('\u0644\u0627 \u062a\u0648\u062c\u062f', 'Empty')}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-700">
                    {imageUrl ? tr('\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0635\u0648\u0631\u0629 \u0644\u0644\u0635\u0646\u0641', 'Image attached to the item') : tr('\u0644\u0627 \u062a\u0648\u062c\u062f \u0635\u0648\u0631\u0629 \u0645\u0631\u062a\u0628\u0637\u0629', 'No image attached yet')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    {tr('\u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u062e\u062a\u064a\u0627\u0631\u064a\u0629 \u0648\u0644\u0646 \u062a\u0645\u0646\u0639 \u062d\u0641\u0638 \u0627\u0644\u0635\u0646\u0641.', 'The image is optional and will not block saving the item.')}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-[430px]:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-emerald-700">{tr('\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u0633\u0639\u0627\u0631', 'Price List')}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    {tr('\u064a\u0645\u0643\u0646 \u062a\u062d\u062f\u064a\u062f \u0643\u0644 \u0633\u0639\u0631 \u0643\u0642\u064a\u0645\u0629 \u062b\u0627\u0628\u062a\u0629 \u0623\u0648 \u0643\u0646\u0633\u0628\u0629 \u0647\u0627\u0645\u0634 \u0645\u0646 \u0627\u0644\u062a\u0643\u0644\u0641\u0629.', 'Each price can be fixed or based on cost markup percentage.')}
                  </p>
                </div>
                <Scale size={16} className="text-emerald-500 shrink-0" />
              </div>

              <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
                <div className="bg-white border border-violet-100 rounded-2xl p-3 space-y-3">
                  <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest block">
                    {tr('\u0633\u0639\u0631 \u0627\u0644\u062c\u0645\u0644\u0629', 'Wholesale Price')}
                  </label>
                  <div className="inline-flex items-center gap-1 rounded-xl border border-violet-100 bg-violet-50/30 p-1">
                    <button
                      type="button"
                      onClick={() => setWholesalePricingMode('FIXED')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${wholesalePricingMode === 'FIXED' ? 'bg-violet-600 text-white' : 'text-violet-700 hover:bg-violet-100'}`}
                    >
                      {tr('\u062b\u0627\u0628\u062a', 'Fixed')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWholesalePricingMode('MARKUP')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${wholesalePricingMode === 'MARKUP' ? 'bg-violet-600 text-white' : 'text-violet-700 hover:bg-violet-100'}`}
                    >
                      {tr('\u0646\u0633\u0628\u0629', 'Markup %')}
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
                    {tr('\u0633\u0639\u0631 \u0627\u0644\u0645\u0641\u0631\u0642', 'Retail Price')}
                  </label>
                  <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-100 bg-emerald-50/30 p-1">
                    <button
                      type="button"
                      onClick={() => setRetailPricingMode('FIXED')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${retailPricingMode === 'FIXED' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-100'}`}
                    >
                      {tr('\u062b\u0627\u0628\u062a', 'Fixed')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRetailPricingMode('MARKUP')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${retailPricingMode === 'MARKUP' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-100'}`}
                    >
                      {tr('\u0646\u0633\u0628\u0629', 'Markup %')}
                    </button>
                  </div>
                  {retailPricingMode === 'FIXED' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      data-testid="products-form-sell-price"
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

            <details className={`min-[430px]:col-span-2 rounded-2xl border p-3 group ${productKind === 'SERVICE' ? 'border-slate-200 bg-slate-50/70 opacity-70' : 'border-violet-100 bg-violet-50/20'}`}>
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                <div>
                  <h4 className="text-xs font-black text-violet-700">{tr('\u062e\u064a\u0627\u0631\u0627\u062a \u0625\u0636\u0627\u0641\u064a\u0629', 'Additional Options')}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    {productKind === 'SERVICE'
                      ? tr('هذه الخيارات مخصصة للأصناف المخزنية فقط.', 'These options are only used for stock items.')
                      : tr('\u0627\u0641\u062a\u062d \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0625\u0630\u0627 \u0643\u0646\u062a \u062a\u0631\u064a\u062f \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0629 \u0648\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0646\u0641\u0627\u062f \u0627\u0644\u0645\u062e\u0632\u0648\u0646.', 'Open this section for expiry settings and stock alerts.')}
                  </p>
                </div>
                <ChevronDown size={18} className="text-violet-500 transition-transform duration-200 group-open:rotate-180" />
              </summary>

              <div className={`mt-4 grid grid-cols-1 min-[430px]:grid-cols-2 gap-2 ${productKind === 'SERVICE' ? 'pointer-events-none' : ''}`}>
                <div>
                  <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest block mb-2 px-1">
                    {tr('\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0646\u062a\u0647\u0627\u0621', 'Expiry Date')}
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
                    {tr('\u0641\u062a\u0631\u0629 \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0629 (\u0623\u064a\u0627\u0645)', 'Shelf-Life (days)')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={expiryPeriodDays}
                    onChange={(e) => setExpiryPeriodDays(toEnglishDigits(e.target.value))}
                    className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-black text-lg text-center dir-ltr text-indigo-700 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all"
                    placeholder={tr('\u0627\u062e\u062a\u064a\u0627\u0631\u064a - \u0645\u062b\u0627\u0644: 180', 'Optional - example: 180')}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2 px-1">
                    {tr('\u0627\u0644\u062a\u0646\u0628\u064a\u0647 \u0642\u0628\u0644 \u0627\u0644\u0627\u0646\u062a\u0647\u0627\u0621 (\u0623\u064a\u0627\u0645)', 'Alert Before Expiry (days)')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={expiryAlertLeadDays}
                    onChange={(e) => setExpiryAlertLeadDays(toEnglishDigits(e.target.value))}
                    className="w-full p-4 bg-white rounded-2xl border border-rose-100 outline-none font-black text-lg text-center dir-ltr text-rose-700 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all"
                    placeholder={tr('\u0627\u062e\u062a\u064a\u0627\u0631\u064a - \u0645\u062b\u0627\u0644: 30', 'Optional - example: 30')}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-2 px-1">
                    {tr('\u062d\u062f \u062a\u0646\u0628\u064a\u0647 \u0646\u0641\u0627\u062f \u0627\u0644\u0645\u062e\u0632\u0648\u0646', 'Low Stock Alert Threshold')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lowStockAlertQty}
                    onChange={(e) => setLowStockAlertQty(toEnglishDigits(e.target.value))}
                    className="w-full p-4 bg-white rounded-2xl border border-amber-100 outline-none font-black text-lg text-center dir-ltr text-amber-700 focus:bg-white focus:ring-4 focus:ring-amber-50 transition-all"
                    placeholder={tr('\u0627\u062e\u062a\u064a\u0627\u0631\u064a - \u0645\u062b\u0627\u0644: 5', 'Optional - example: 5')}
                  />
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="pt-3 mt-4 border-t border-gray-100 bg-white">
          <button data-testid="products-form-save" type="submit" className="w-full min-h-[44px] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 flex items-center justify-center gap-2">
            <Check size={18} />
            {submitLabel}
          </button>
        </div>
      </form>

      {showScanner && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[350] flex flex-col bg-black">
          <div className="relative flex-1 bg-black">
            <div id="quick-add-product-reader" className="h-full w-full"></div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-[50px] border-black/50">
              <div className="h-64 w-64 rounded-3xl border-4 border-blue-500/50 animate-pulse"></div>
            </div>
          </div>
          <div className="flex items-center justify-between bg-black p-6 text-white">
            <p className="text-sm font-bold">{tr('وجه الكاميرا نحو الباركود...', 'Point the camera at the barcode...')}</p>
            <button
              type="button"
              onClick={stopAndCloseScanner}
              className="rounded-full bg-white/20 p-3 transition-all hover:bg-white/30"
            >
              <X size={24} />
            </button>
          </div>
        </div>,
        document.body
      )}

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
