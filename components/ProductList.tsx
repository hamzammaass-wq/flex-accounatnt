
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { 
  Package, Trash2, Plus, Search, Tag, AlertCircle, 
  LayoutGrid, X, Check, Edit2, ArrowUpDown, SlidersHorizontal,
  FolderPlus, Settings, PenSquare, Scale, AlertTriangle, ScanBarcode, Camera, Printer, BellRing, CornerDownLeft
} from 'lucide-react';
import { ItemGroup, Product } from '../types';
import ProductCard from './ProductCard';
import QuickAddProductModal from './QuickAddProductModal';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { ensureCameraPermission } from '../utils/cameraPermission';
import { createPortal, flushSync } from 'react-dom';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import EnglishDateInput from './EnglishDateInput';
import { loadBarcodeReaderSettings } from '../utils/barcodeSettings';
import { printProductBarcodeLabel } from '../utils/barcodeLabelPrint';
import { PricingMode, resolveProductPricing } from '../utils/productPricing';
import { getDisplayItemGroupName, getDisplayProductName, getDisplayUnitName } from '../utils/displayNames';
import { buildNextItemCode, normalizeItemCode, resolveProductItemCodeMode } from '../utils/itemCode';
import InventoryPricingManager from './InventoryPricingManager';
import { openDrilldown } from '../utils/drilldown';
import { getProductKind, isServiceProduct } from '../utils/productKind';

const ProductList: React.FC = () => {
  const { 
    products, addProduct, updateProduct, deleteProduct, 
    itemGroups, addItemGroup, updateItemGroup, deleteItemGroup, baseCurrency, units, addUnit, companySettings, currentCompanyId, updateCompanySettings
  } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  console.log("DEBUG_PRODUCTS_LIST:", JSON.stringify(products));
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayProductName = (product?: { id: string; name: string } | null) =>
    getDisplayProductName(product || undefined, isEnglish);
  const displayGroupName = (group?: { id: string; name: string } | null) =>
    getDisplayItemGroupName(group || undefined, isEnglish);
  const displayUnitName = (unit?: { id: string; name: string } | null) =>
    getDisplayUnitName(unit || undefined, isEnglish);
  
  const [showForm, setShowForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false); 
  const [activeScreen, setActiveScreen] = useState<'ITEMS' | 'PRICING'>('ITEMS');
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'LATEST' | 'NAME_ASC' | 'STOCK_LOW' | 'VALUE_HIGH'>('LATEST');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'WITH_BARCODE' | 'WITH_IMAGE'>('ALL');
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  const [lowStockThreshold, setLowStockThreshold] = useState(() => {
    const raw = Number(companySettings?.lowStockAlertQtyDefault);
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 5;
  });
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);

  // Form State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [wholesalePricingMode, setWholesalePricingMode] = useState<PricingMode>('FIXED');
  const [retailPricingMode, setRetailPricingMode] = useState<PricingMode>('FIXED');
  const [wholesaleMarkupPercent, setWholesaleMarkupPercent] = useState('');
  const [retailMarkupPercent, setRetailMarkupPercent] = useState('');
  const [stock, setStock] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryPeriodDays, setExpiryPeriodDays] = useState('');
  const [expiryAlertLeadDays, setExpiryAlertLeadDays] = useState('');
  const [lowStockAlertQty, setLowStockAlertQty] = useState('');
  const [barcode, setBarcode] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCodeMode, setItemCodeMode] = useState<'AUTO' | 'MANUAL'>('AUTO');

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const productOpenTimerRef = useRef<number | null>(null);

  // Group Form State
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('📦');
  const [groupParentId, setGroupParentId] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Unit Form State
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCode, setNewUnitCode] = useState('');

  // Inline Edit State (Quick Price)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');

  useEffect(() => () => {
    if (productOpenTimerRef.current !== null) {
      window.clearTimeout(productOpenTimerRef.current);
    }
  }, []);

  const icons = ['📦', '📱', '🍞', '👕', '🏠', '✏️', '💊', '🔧', '💻', '🚗'];

  const resetGroupForm = () => {
    setGroupName('');
    setGroupIcon(icons[0] || '📦');
    setGroupParentId('');
    setEditingGroupId(null);
  };

  const openGroupManager = () => {
    resetGroupForm();
    setShowGroupForm(true);
  };

  const closeGroupManager = () => {
    resetGroupForm();
    setShowGroupForm(false);
  };

  // Scanner Management
  const startScanner = async () => {
    if (!(await ensureCameraPermission(tr))) return;

    flushSync(() => {
        setShowScanner(true);
    });

    try {
        const html5QrCode = new Html5Qrcode("reader", {
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
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
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
        console.error("Error starting scanner:", err);
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
            console.error("Error stopping scanner:", e);
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

  useEffect(() => {
    const raw = Number(companySettings?.lowStockAlertQtyDefault);
    if (Number.isFinite(raw)) {
      setLowStockThreshold(Math.max(0, Math.floor(raw)));
    }
  }, [companySettings?.lowStockAlertQtyDefault]);

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

  const resetForm = () => {
      setName('');
      setGroupId('');
      setUnitId('');
      setSellPrice('');
      setWholesalePrice('');
      setBuyPrice('');
      setWholesalePricingMode('FIXED');
      setRetailPricingMode('FIXED');
      setWholesaleMarkupPercent('');
      setRetailMarkupPercent('');
      setStock('');
      setExpiryDate('');
      setExpiryPeriodDays('');
      setExpiryAlertLeadDays('');
      setLowStockAlertQty('');
      setBarcode('');
      setItemCode('');
      setItemCodeMode('AUTO');
      setEditingProduct(null);
  };

  const handleOpenAdd = () => {
      resetForm();
      setShowForm(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, product: Product) => {
      e.stopPropagation();
      setEditingProduct(product);
      setName(product.name);
      setGroupId(product.category || '');
      setUnitId(product.unitId || '');
      const pricing = resolveProductPricing(product);
      setSellPrice(String(product.retailPrice ?? product.sellPrice ?? pricing.retailPrice));
      setWholesalePrice(String(product.wholesalePrice ?? pricing.wholesalePrice));
      setBuyPrice(product.buyPrice.toString());
      setWholesalePricingMode(product.wholesalePricingMode === 'MARKUP' ? 'MARKUP' : 'FIXED');
      setRetailPricingMode(product.retailPricingMode === 'MARKUP' ? 'MARKUP' : 'FIXED');
      setWholesaleMarkupPercent(product.wholesaleMarkupPercent !== undefined ? String(product.wholesaleMarkupPercent) : '');
      setRetailMarkupPercent(product.retailMarkupPercent !== undefined ? String(product.retailMarkupPercent) : '');
      setStock(product.stock.toString());
      setExpiryDate(product.expiryDate || '');
      setExpiryPeriodDays(product.expiryPeriodDays !== undefined ? String(product.expiryPeriodDays) : '');
      setExpiryAlertLeadDays(product.expiryAlertLeadDays !== undefined ? String(product.expiryAlertLeadDays) : '');
      setLowStockAlertQty(product.lowStockAlertQty !== undefined ? String(product.lowStockAlertQty) : '');
      setBarcode(product.barcode || '');
      setItemCode(product.itemCode || '');
      setItemCodeMode(resolveProductItemCodeMode(product));
      setShowForm(true);
  };

  const autoItemCodePreview = useMemo(
    () => buildNextItemCode(products, editingProduct?.id),
    [products, editingProduct?.id]
  );
  const persistedAutoItemCode = useMemo(
    () => normalizeItemCode(editingProduct?.itemCode || ''),
    [editingProduct?.itemCode]
  );
  const effectiveAutoItemCode = persistedAutoItemCode || autoItemCodePreview;

  const handleProductSubmit = (e: React.FormEvent) => {
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

    const isItemCodeTaken = !!resolvedItemCode && products.some((product) =>
      product.id !== editingProduct?.id
      && normalizeItemCode(product.itemCode || '') === resolvedItemCode
    );

    if (isItemCodeTaken) {
      alert(tr(`رقم الصنف ${resolvedItemCode} مستخدم مسبقًا. اختر رقمًا آخر.`, `Item code ${resolvedItemCode} is already used. Choose another code.`));
      return;
    }

    const normalizedCost = parseLocalizedPositiveDecimal(buyPrice);
    const normalizedRetailInput = parseLocalizedPositiveDecimal(sellPrice);
    const normalizedWholesaleInput = parseLocalizedPositiveDecimal(wholesalePrice);
    const resolvedWholesaleFixedInput = normalizedWholesaleInput > 0 ? normalizedWholesaleInput : normalizedRetailInput;
    const normalizedWholesaleMarkup = parseLocalizedPositiveDecimal(wholesaleMarkupPercent);
    const normalizedRetailMarkup = parseLocalizedPositiveDecimal(retailMarkupPercent);

    const pricingBase: Product = {
      id: editingProduct?.id || 'tmp_product_pricing',
      name: name.trim(),
      buyPrice: normalizedCost,
      sellPrice: normalizedRetailInput,
      wholesalePrice: resolvedWholesaleFixedInput,
      retailPrice: normalizedRetailInput,
      wholesalePricingMode,
      retailPricingMode,
      wholesaleMarkupPercent: normalizedWholesaleMarkup,
      retailMarkupPercent: normalizedRetailMarkup,
      stock: parseInt(stock) || 0
    };
    const pricing = resolveProductPricing(pricingBase, normalizedCost);

    const productData = {
      name,
      itemCode: resolvedItemCode,
      itemCodeMode: resolvedItemCodeMode,
      category: groupId || undefined,
      unitId: unitId || undefined,
      sellPrice: pricing.retailPrice,
      buyPrice: pricing.cost,
      wholesalePrice: pricing.wholesalePrice,
      retailPrice: pricing.retailPrice,
      wholesalePricingMode,
      retailPricingMode,
      wholesaleMarkupPercent: normalizedWholesaleMarkup,
      retailMarkupPercent: normalizedRetailMarkup,
      stock: parseInt(stock) || 0,
      expiryDate: normalizedExpiryDate,
      expiryPeriodDays: normalizedExpiryPeriodDays,
      expiryAlertLeadDays: normalizedExpiryAlertLeadDays,
      lowStockAlertQty: normalizedLowStockAlertQty,
      reorderQty: undefined,
      barcode
    };

    if (editingProduct) {
        const result = updateProduct(editingProduct.id, productData);
        if (!result.ok) return;
    } else {
        const result = addProduct(productData);
        if (!result.ok) return;
    }

    resetForm();
    setShowForm(false);
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = groupName.trim();
    if (!trimmedName) return;

    const groupData = {
      name: trimmedName,
      icon: groupIcon,
      parentId: groupParentId || undefined
    };

    if (editingGroupId) {
      updateItemGroup(editingGroupId, groupData);
    } else {
      addItemGroup(groupData);
    }

    resetGroupForm();
  };

  const handleUnitSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUnitName || !newUnitCode) return;
      addUnit({ name: newUnitName, code: newUnitCode });
      setNewUnitName('');
      setNewUnitCode('');
      setShowUnitForm(false);
  }

  const confirmDelete = () => {
      if (deleteProductId) {
          deleteProduct(deleteProductId);
          setDeleteProductId(null);
      }
  };

  const lowStockCount = useMemo(() => products.filter(p => {
    if (isServiceProduct(p)) return false;
    const threshold = Number.isFinite(Number(p.lowStockAlertQty)) ? Math.max(0, Number(p.lowStockAlertQty)) : lowStockThreshold;
    return p.stock <= threshold;
  }).length, [products, lowStockThreshold]);

  const visibleItemGroups = useMemo(
    () => itemGroups.filter((group) => {
      const normalizedName = (group.name || '').trim().toLowerCase();
      return normalizedName !== 'اطلب الآن' && normalizedName !== 'order now';
    }),
    [itemGroups]
  );

  const itemGroupProductCounts = useMemo(() => products.reduce<Record<string, number>>((counts, product) => {
    if (product.category) {
      counts[product.category] = (counts[product.category] || 0) + 1;
    }
    return counts;
  }, {}), [products]);

  const itemGroupChildCounts = useMemo(() => itemGroups.reduce<Record<string, number>>((counts, group) => {
    if (group.parentId) {
      counts[group.parentId] = (counts[group.parentId] || 0) + 1;
    }
    return counts;
  }, {}), [itemGroups]);

  const availableParentGroups = useMemo(
    () => visibleItemGroups.filter((group) => !group.parentId && group.id !== editingGroupId),
    [editingGroupId, visibleItemGroups]
  );

  const sortedItemGroups = useMemo(() => {
    const visibleIds = new Set(visibleItemGroups.map((group) => group.id));
    const groupsByParent = visibleItemGroups.reduce<Record<string, ItemGroup[]>>((groups, group) => {
      const parentKey = group.parentId && visibleIds.has(group.parentId) ? group.parentId : 'ROOT';
      groups[parentKey] = [...(groups[parentKey] || []), group];
      return groups;
    }, {});

    const sortGroups = (groups: ItemGroup[] = []) =>
      [...groups].sort((a, b) => displayGroupName(a).localeCompare(displayGroupName(b), isEnglish ? 'en' : 'ar'));

    const result: Array<{ group: ItemGroup; depth: number }> = [];
    const appendGroup = (group: ItemGroup, depth: number) => {
      result.push({ group, depth });
      sortGroups(groupsByParent[group.id]).forEach((child) => appendGroup(child, depth + 1));
    };

    sortGroups(groupsByParent.ROOT).forEach((group) => appendGroup(group, 0));
    return result;
  }, [isEnglish, visibleItemGroups]);

  const handleEditItemGroup = (group: ItemGroup) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupIcon(group.icon || icons[0] || '📦');
    setGroupParentId(group.parentId || '');
  };

  const handleDeleteItemGroup = (group: ItemGroup) => {
    const childCount = itemGroupChildCounts[group.id] || 0;
    if (childCount > 0) {
      alert(tr('لا يمكن حذف مجموعة تحتوي على مجموعات فرعية. احذف المجموعات الفرعية أولاً.', 'A group with subgroups cannot be deleted. Delete the subgroups first.'));
      return;
    }

    const productCount = itemGroupProductCounts[group.id] || 0;
    if (productCount > 0) {
      alert(tr('لا يمكن حذف مجموعة مستخدمة في أصناف. انقل الأصناف إلى مجموعة أخرى أولاً.', 'A group used by items cannot be deleted. Move the items to another group first.'));
      return;
    }

    if (!window.confirm(tr('هل تريد حذف مجموعة الأصناف؟', 'Delete this item group?'))) return;

    deleteItemGroup(group.id);
    if (groupFilter === group.id) setGroupFilter('ALL');
    if (groupId === group.id) setGroupId('');
    if (editingGroupId === group.id) resetGroupForm();
  };

  useEffect(() => {
    if (groupFilter === 'ALL' || groupFilter === 'LOW_STOCK') return;
    if (!visibleItemGroups.some((group) => group.id === groupFilter)) {
      setGroupFilter('ALL');
    }
  }, [groupFilter, visibleItemGroups]);

  const filteredProducts = useMemo(() => products.filter(p => {
    const serviceItem = isServiceProduct(p);
    const displayName = displayProductName(p);
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.barcode?.includes(searchTerm) ||
                         p.itemCode?.toLowerCase().includes(searchTerm.toLowerCase());

    const threshold = Number.isFinite(Number(p.lowStockAlertQty)) ? Math.max(0, Number(p.lowStockAlertQty)) : lowStockThreshold;
    const normalizedStock = Math.max(0, Number(p.stock) || 0);
    const matchesStockFilter = (() => {
      switch (stockFilter) {
        case 'IN_STOCK':
          return !serviceItem && normalizedStock > 0;
        case 'OUT_OF_STOCK':
          return !serviceItem && normalizedStock <= 0;
        case 'WITH_BARCODE':
          return !!p.barcode?.trim();
        case 'WITH_IMAGE':
          return !!p.imageUrl?.trim();
        case 'ALL':
        default:
          return true;
      }
    })();

    if (groupFilter === 'LOW_STOCK') {
        return !serviceItem && matchesSearch && matchesStockFilter && p.stock <= threshold;
    }
    const matchesGroup = groupFilter === 'ALL' || p.category === groupFilter;
    return matchesSearch && matchesGroup && matchesStockFilter;
  }), [products, searchTerm, groupFilter, lowStockThreshold, stockFilter, isEnglish]);

  const totalProductsCount = products.length;
  const totalUnitsInStock = useMemo(
    () => products.reduce((sum, product) => sum + (isServiceProduct(product) ? 0 : Math.max(0, Number(product.stock) || 0)), 0),
    [products]
  );
  const totalInventoryValue = useMemo(
    () => products.reduce((sum, product) => {
      if (isServiceProduct(product)) return sum;
      const pricing = resolveProductPricing(product);
      return sum + (Math.max(0, Number(product.stock) || 0) * pricing.cost);
    }, 0),
    [products]
  );
  const filteredUnitsInStock = useMemo(
    () => filteredProducts.reduce((sum, product) => sum + (isServiceProduct(product) ? 0 : Math.max(0, Number(product.stock) || 0)), 0),
    [filteredProducts]
  );
  const filteredInventoryValue = useMemo(
    () => filteredProducts.reduce((sum, product) => {
      if (isServiceProduct(product)) return sum;
      const pricing = resolveProductPricing(product);
      return sum + (Math.max(0, Number(product.stock) || 0) * pricing.cost);
    }, 0),
    [filteredProducts]
  );

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    switch (sortBy) {
      case 'NAME_ASC':
        list.sort((a, b) => displayProductName(a).localeCompare(displayProductName(b), isEnglish ? 'en' : 'ar'));
        break;
      case 'STOCK_LOW':
        list.sort((a, b) => {
          const aStock = isServiceProduct(a) ? Number.POSITIVE_INFINITY : (Number(a.stock) || 0);
          const bStock = isServiceProduct(b) ? Number.POSITIVE_INFINITY : (Number(b.stock) || 0);
          return aStock - bStock;
        });
        break;
      case 'VALUE_HIGH':
        list.sort((a, b) => {
          const aValue = isServiceProduct(a) ? 0 : ((Number(a.stock) || 0) * resolveProductPricing(a).cost);
          const bValue = isServiceProduct(b) ? 0 : ((Number(b.stock) || 0) * resolveProductPricing(b).cost);
          return bValue - aValue;
        });
        break;
      case 'LATEST':
      default:
        // Keep most recently created/updated first based on state order.
        break;
    }
    return list;
  }, [filteredProducts, sortBy, isEnglish]);

  const getGroupDetails = (id?: string) => {
      return itemGroups.find(g => g.id === id) || { id: 'uncategorized', name: tr('غير مصنف', 'Uncategorized'), icon: '📦' };
  };

  const getUnitDetails = (id?: string) => {
      return units.find(u => u.id === id);
  };

  const startEditing = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    setEditingId(product.id);
    const pricing = resolveProductPricing(product);
    setEditPrice(String(product.retailPrice ?? product.sellPrice ?? pricing.retailPrice));
  };

  const handleSavePrice = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newPrice = parseFloat(editPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
        updateProduct(id, { sellPrice: newPrice, retailPrice: newPrice, retailPricingMode: 'FIXED' });
    }
    setEditingId(null);
  };

  const barcodePrintSettings = useMemo(
    () => loadBarcodeReaderSettings(currentCompanyId),
    [currentCompanyId]
  );

  const queueProductPreview = (productId: string) => {
    if (productOpenTimerRef.current !== null) {
      window.clearTimeout(productOpenTimerRef.current);
    }
    productOpenTimerRef.current = window.setTimeout(() => {
      setViewProductId(productId);
      productOpenTimerRef.current = null;
    }, 220);
  };

  const openProductMovement = (productId: string) => {
    if (productOpenTimerRef.current !== null) {
      window.clearTimeout(productOpenTimerRef.current);
      productOpenTimerRef.current = null;
    }
    openDrilldown({ kind: 'PRODUCT_MOVEMENT', productId });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };
  const metricDividerClass = isEnglish ? 'border-l border-gray-100' : 'border-r border-gray-100';
  const hasActiveFilters = !!searchTerm || groupFilter !== 'ALL' || stockFilter !== 'ALL' || sortBy !== 'LATEST';
  const allowNegativeStock = companySettings.allowNegativeStock ?? false;

  const draftPricingPreview = useMemo(() => {
    const draftRetailInput = parseLocalizedPositiveDecimal(sellPrice);
    const draftWholesaleInput = parseLocalizedPositiveDecimal(wholesalePrice);
    const draft: Product = {
      id: editingProduct?.id || 'draft_product',
      name: name || 'draft',
      buyPrice: parseLocalizedPositiveDecimal(buyPrice),
      sellPrice: draftRetailInput,
      wholesalePrice: draftWholesaleInput > 0 ? draftWholesaleInput : draftRetailInput,
      retailPrice: draftRetailInput,
      wholesalePricingMode,
      retailPricingMode,
      wholesaleMarkupPercent: parseLocalizedPositiveDecimal(wholesaleMarkupPercent),
      retailMarkupPercent: parseLocalizedPositiveDecimal(retailMarkupPercent),
      stock: parseInt(stock) || 0
    };
    return resolveProductPricing(draft, draft.buyPrice);
  }, [
    editingProduct?.id,
    name,
    buyPrice,
    sellPrice,
    wholesalePrice,
    wholesalePricingMode,
    retailPricingMode,
    wholesaleMarkupPercent,
    retailMarkupPercent,
    stock
  ]);

  const handlePrintBarcodeLabel = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    printProductBarcodeLabel({
      product,
      settings: barcodePrintSettings,
      companyId: currentCompanyId,
      currency: baseCurrency,
      isEnglish
    });
  };

  const handleSetNegativeStock = (nextValue: boolean) => {
    if (allowNegativeStock === nextValue) return;
    const result = updateCompanySettings({
      ...companySettings,
      allowNegativeStock: nextValue
    });
    if (!result.ok) {
      alert(result.message);
    }
  };
  const handleToggleNegativeStock = () => handleSetNegativeStock(!allowNegativeStock);

  return (
    <div data-testid="product-list-root" className={`app-page w-full max-w-[1680px] mx-auto overflow-x-hidden px-3 sm:px-4 lg:px-6 safe-pb-nav font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <div className="min-w-0">
           <h1 className="text-3xl font-black text-slate-800 tracking-tight leading-tight break-words">{tr('المستودع', 'Inventory')}</h1>
           <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">{tr('إدارة الأصناف والمخزون', 'Items and Stock Management')}</p>
        </div>
        {activeScreen === 'ITEMS' ? (
          <div className="flex items-center gap-2 shrink-0 self-start">
              <button 
                  onClick={() => setShowThresholdConfig(!showThresholdConfig)}
                  className={`p-3 rounded-2xl border transition-all ${showThresholdConfig || lowStockCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 shadow-sm'}`}
              >
                  {lowStockCount > 0 ? <BellRing className="w-5 h-5 animate-pulse" /> : <Settings className="w-5 h-5" />}
              </button>
              <button 
                  onClick={openGroupManager}
                  data-testid="item-groups-open"
                  className="bg-white text-indigo-600 p-3 rounded-2xl border border-indigo-100 hover:bg-indigo-50 transition-all shadow-sm"
              >
                  <FolderPlus className="w-5 h-5" />
              </button>
              <button 
                  onClick={handleOpenAdd}
                  data-testid="products-add-toggle"
                  className="bg-blue-600 text-white p-3 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-90"
              >
                  <Plus className="w-6 h-6" />
              </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] font-black text-blue-700">
            <Tag className="w-4 h-4" />
            {tr('شاشة تسعير مستقلة', 'Dedicated pricing screen')}
          </div>
        )}
      </header>

      <div className="mb-6 flex w-full rounded-[1.8rem] border border-slate-100 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveScreen('ITEMS')}
          className={`flex-1 rounded-[1.2rem] px-4 py-3 text-sm font-black transition-all ${activeScreen === 'ITEMS' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          {tr('الأصناف', 'Items')}
        </button>
        <button
          type="button"
          onClick={() => setActiveScreen('PRICING')}
          className={`flex-1 rounded-[1.2rem] px-4 py-3 text-sm font-black transition-all ${activeScreen === 'PRICING' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          {tr('أسعار الأصناف', 'Item Pricing')}
        </button>
      </div>

      {activeScreen === 'ITEMS' ? (
        <>
      <div className="mb-4 rounded-[2rem] border border-slate-200/80 bg-white p-2 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.55)]">
          <div className="rounded-[1.5rem] bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),_transparent_55%),linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(248,250,252,1)_100%)] px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-slate-900">{tr('السماح بالمخزون السالب', 'Allow negative stock')}</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black transition-colors ${
                      allowNegativeStock
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}
                  >
                    {allowNegativeStock ? tr('مفعل', 'Enabled') : tr('موقوف', 'Disabled')}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                  {tr(
                    'عند إيقافه، يُمنع البيع أو المناقلة إذا كانت الكمية غير كافية.',
                    'When disabled, sales and transfers are blocked if stock is not sufficient.'
                  )}
                </p>
                <div
                  className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black transition-colors ${
                    allowNegativeStock
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      allowNegativeStock ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  {allowNegativeStock
                    ? tr('مفعل: يمكن أن تهبط الكمية تحت الصفر عند الحاجة.', 'Enabled: stock can go below zero when needed.')
                    : tr('موقوف: يمنع النزول تحت الصفر.', 'Disabled: going below zero is blocked.')}
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleNegativeStock}
                role="switch"
                aria-checked={allowNegativeStock}
                aria-label={tr('السماح بالمخزون السالب', 'Allow negative stock')}
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden="true"
                  className={`relative block h-10 w-[4.5rem] rounded-full border transition-all duration-300 ${
                    allowNegativeStock
                      ? 'border-emerald-500 bg-emerald-500 shadow-[0_12px_24px_-16px_rgba(16,185,129,0.95)]'
                      : 'border-slate-400 bg-white'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow-[0_8px_20px_-12px_rgba(15,23,42,0.85)] transition-all duration-300 ${
                      allowNegativeStock
                        ? (isEnglish ? 'left-[2.1rem]' : 'right-[2.1rem]')
                        : (isEnglish ? 'left-1' : 'right-1')
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>
      </div>

      {/* Threshold Config */}
      {showThresholdConfig && (
          <div className="bg-white p-5 rounded-[2rem] border border-amber-100 shadow-sm mb-6 animate-in slide-in-from-top-4">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-slate-800 text-sm">{tr('تنبيهات انخفاض المخزون', 'Low Stock Alerts')}</h3>
                  <button onClick={() => setShowThresholdConfig(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="flex items-center gap-4">
                  <span className="text-xs font-black text-slate-500 uppercase">{tr('الحد الأدنى', 'Minimum')}: {lowStockThreshold}</span>
                  <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={lowStockThreshold} 
                      onChange={(e) => setLowStockThreshold(parseInt(e.target.value))}
                      className="flex-1 h-2 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
              </div>
          </div>
      )}

      {/* Inventory Snapshot */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-sm min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-4">{tr('إجمالي الأصناف', 'Total Items')}</p>
              <p className="text-lg sm:text-xl font-black text-slate-800 dir-ltr truncate">{formatCurrency(totalProductsCount)}</p>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 mt-1 leading-4">{tr('نتائج الفلتر', 'Filtered Results')}: {formatCurrency(sortedProducts.length)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-100 p-3 sm:p-4 shadow-sm min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1 leading-4">{tr('وحدات بالمخزون', 'Units In Stock')}</p>
              <p className="text-lg sm:text-xl font-black text-emerald-700 dir-ltr truncate">{formatCurrency(totalUnitsInStock)}</p>
              <p className="text-[8px] sm:text-[9px] font-bold text-emerald-500/80 mt-1 leading-4">{tr('حسب الفلتر', 'Filtered')}: {formatCurrency(filteredUnitsInStock)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-violet-100 p-3 sm:p-4 shadow-sm min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black text-violet-600 uppercase tracking-widest mb-1 leading-4">{tr('قيمة المخزون', 'Inventory Value')}</p>
              <p className="text-lg sm:text-xl font-black text-violet-700 dir-ltr truncate">{formatCurrency(totalInventoryValue)}</p>
              <p className="text-[8px] sm:text-[9px] font-bold text-violet-500/80 mt-1 leading-4">{baseCurrency} - {tr('الفلتر', 'Filter')}: {formatCurrency(filteredInventoryValue)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 p-3 sm:p-4 shadow-sm min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1 leading-4">{tr('تنبيهات النقص', 'Shortage Alerts')}</p>
              <p className="text-lg sm:text-xl font-black text-amber-700 dir-ltr truncate">{formatCurrency(lowStockCount)}</p>
              <p className="text-[8px] sm:text-[9px] font-bold text-amber-500/80 mt-1 leading-4">{tr('حسب حد النقص', 'Based on low stock threshold')}</p>
          </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar lg:flex-wrap lg:overflow-visible lg:pb-0">
          <button 
            onClick={() => setGroupFilter('ALL')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap border transition-all ${groupFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-800 shadow-lg' : 'bg-white text-slate-400 border-slate-100'}`}
          >
            <LayoutGrid size={14} />
            {tr('الكل', 'All')}
          </button>
          
          <button 
            onClick={() => setGroupFilter('LOW_STOCK')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap border transition-all ${groupFilter === 'LOW_STOCK' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-100' : 'bg-white text-slate-400 border-slate-100'}`}
          >
            <AlertCircle size={14} />
            {tr('النواقص', 'Low Stock')}
            {lowStockCount > 0 && <span className={`mr-1 px-2 py-0.5 rounded-lg text-[8px] ${groupFilter === 'LOW_STOCK' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>{lowStockCount}</span>}
          </button>

          {visibleItemGroups.map(group => (
            <button 
                key={group.id}
                onClick={() => setGroupFilter(group.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap border transition-all ${groupFilter === group.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-slate-400 border-slate-100'}`}
            >
                <span>{group.icon}</span>
                {displayGroupName(group)}
            </button>
          ))}
      </div>

      {/* Search + Sort */}
      <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm p-3 mb-6">
          <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
              <div className="relative flex-1 min-w-0">
                  <input
                      type="text"
                      placeholder={tr('بحث باسم الصنف أو رقم/باركود الصنف...', 'Search by item name or item code/barcode...')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full p-4 pr-12 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all text-slate-700"
                  />
                  <Search className="w-5 h-5 text-slate-300 absolute top-1/2 -translate-y-1/2 right-4 pointer-events-none" />
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <div className="relative">
                      <SlidersHorizontal className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                          value={stockFilter}
                          onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
                          className="h-12 pr-9 pl-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-black text-slate-600 outline-none appearance-none"
                      >
                          <option value="ALL">{tr('التصفية: الكل', 'Filter: All')}</option>
                          <option value="IN_STOCK">{tr('التصفية: متوفر', 'Filter: In Stock')}</option>
                          <option value="OUT_OF_STOCK">{tr('التصفية: نافد', 'Filter: Out Of Stock')}</option>
                          <option value="WITH_BARCODE">{tr('التصفية: له باركود', 'Filter: Has Barcode')}</option>
                          <option value="WITH_IMAGE">{tr('التصفية: له صورة', 'Filter: Has Image')}</option>
                      </select>
                  </div>

                  <div className="relative">
                      <ArrowUpDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                          className="h-12 pr-9 pl-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-black text-slate-600 outline-none appearance-none"
                      >
                          <option value="LATEST">{tr('الترتيب: الأحدث', 'Sort: Latest')}</option>
                          <option value="NAME_ASC">{tr('الترتيب: الاسم', 'Sort: Name')}</option>
                          <option value="STOCK_LOW">{tr('الترتيب: الأقل مخزونًا', 'Sort: Lowest Stock')}</option>
                          <option value="VALUE_HIGH">{tr('الترتيب: الأعلى قيمة', 'Sort: Highest Value')}</option>
                      </select>
                  </div>

                  {hasActiveFilters && (
                      <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            setGroupFilter('ALL');
                            setStockFilter('ALL');
                            setSortBy('LATEST');
                          }}
                          className="h-12 px-4 rounded-xl bg-rose-50 text-rose-600 font-black text-[11px] border border-rose-100 hover:bg-rose-100 transition-all"
                      >
                          {tr('إلغاء التصفية', 'Reset')}
                      </button>
                  )}

                  <div className="h-12 px-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black flex items-center whitespace-nowrap">
                      {tr('نتائج', 'Results')}: {formatCurrency(sortedProducts.length)}
                  </div>
              </div>
          </div>
      </div>

      {/* Product Grid */}
      <div className="space-y-3 lg:space-y-4">
        {sortedProducts.map(product => {
            const group = getGroupDetails(product.category);
            const unit = getUnitDetails(product.unitId);
            const pricing = resolveProductPricing(product);
            const productKind = getProductKind(product);
            const serviceItem = productKind === 'SERVICE';
            const productLowStockThreshold = Number.isFinite(Number(product.lowStockAlertQty)) ? Math.max(0, Number(product.lowStockAlertQty)) : lowStockThreshold;
            const isLowStock = !serviceItem && product.stock <= productLowStockThreshold;
            const isEditing = editingId === product.id;

            return (
            <div 
                key={product.id} 
                onClick={() => queueProductPreview(product.id)}
                onDoubleClick={() => openProductMovement(product.id)}
                className={`bg-white p-5 rounded-[2.5rem] border shadow-sm group hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer animate-in slide-in-from-bottom-2 ${isLowStock ? 'border-red-100 bg-red-50/5' : serviceItem ? 'border-amber-100 bg-amber-50/10' : 'border-gray-50'}`}
            >
                <div className="flex justify-between items-start gap-3 mb-4 min-w-0">
                    <div className="flex gap-4 min-w-0 flex-1">
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-2xl border border-gray-100 shadow-inner group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                            {group.icon}
                        </div>
                        <div className="min-w-0">
                            <h4
                              className="font-black text-slate-800 text-base mb-1 leading-snug truncate whitespace-nowrap"
                              title={displayProductName(product)}
                            >
                              {displayProductName(product)}
                            </h4>
                            <div className="flex flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                                <span className="shrink-0 text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                    {displayGroupName(group)}
                                </span>
                                <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[8px] font-black ${serviceItem ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {serviceItem ? tr('خدمة', 'Service') : tr('مخزني', 'Stock')}
                                </span>
                                {!serviceItem && product.lowStockAlertQty !== undefined && <span className="shrink-0 text-[8px] font-mono text-orange-500">{tr('حد نقص', 'Low Threshold')} {product.lowStockAlertQty}</span>}
                                {!serviceItem && product.expiryPeriodDays !== undefined && product.expiryPeriodDays > 0 && <span className="shrink-0 text-[8px] font-mono text-violet-600">{tr('صلاحية', 'Shelf Life')} {product.expiryPeriodDays} {tr('يوم', 'day')}</span>}
                                {!serviceItem && product.expiryAlertLeadDays !== undefined && product.expiryAlertLeadDays >= 0 && <span className="shrink-0 text-[8px] font-mono text-rose-500">{tr('تنبيه قبل', 'Alert before')} {product.expiryAlertLeadDays} {tr('يوم', 'day')}</span>}
                                {!serviceItem && product.expiryDate && <span className="shrink-0 text-[8px] font-mono text-emerald-600">{tr('انتهاء', 'Expiry')} {product.expiryDate}</span>}
                                {product.itemCode && <span className="shrink-0 text-[8px] font-mono text-indigo-400">{product.itemCode}</span>}
                                {product.barcode && <span className="shrink-0 text-[8px] font-mono text-slate-300">{product.barcode}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                            onClick={(e) => handlePrintBarcodeLabel(e, product)}
                            className="p-2.5 text-gray-300 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                            title={tr('طباعة باركود', 'Print barcode')}
                        >
                            <Printer size={18} />
                        </button>
                        <button 
                            onClick={(e) => handleOpenEdit(e, product)} 
                            className="p-2.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        >
                            <PenSquare size={18} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteProductId(product.id); }} className="p-2.5 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:gap-3 text-center bg-gray-50/50 rounded-[1.5rem] p-2.5 sm:p-3 border border-gray-50 group-hover:bg-white group-hover:border-gray-100 transition-all">
                    <div className={`${metricDividerClass} flex flex-col items-center justify-center min-w-0 px-0.5 sm:px-1`}>
                        <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] sm:tracking-widest block mb-1 leading-tight">{tr('سعر المفرق', 'Retail Price')}</span>
                        {isEditing ? (
                            <div className="flex items-center justify-center gap-1 px-1">
                                <input 
                                    type="number" 
                                  inputMode="decimal"
                                    value={editPrice} 
                                    onChange={(e) => setEditPrice(e.target.value)}
                                    className="w-full text-center font-black text-xs bg-white border border-blue-200 rounded-lg p-1 outline-none dir-ltr"
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSavePrice(e as any, product.id);
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                />
                                <button onClick={(e) => handleSavePrice(e, product.id)} className="text-emerald-500"><Check size={14} /></button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-1 group/price min-w-0" onClick={(e) => startEditing(e, product)}>
                                <div className="w-full text-center font-black text-slate-700 text-[11px] sm:text-sm dir-ltr leading-tight truncate">{formatCurrency(pricing.retailPrice)}</div>
                                <Edit2 size={10} className="text-gray-300 group-hover/price:text-blue-500" />
                            </div>
                        )}
                        {pricing.retailPricingMode === 'MARKUP' && (
                          <div className="text-[7px] sm:text-[8px] font-black text-emerald-600 mt-1 leading-tight">+{pricing.retailMarkupPercent}%</div>
                        )}
                    </div>

                    <div className={`${metricDividerClass} flex flex-col items-center justify-center min-w-0 px-0.5 sm:px-1`}>
                        <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] sm:tracking-widest block mb-1 leading-tight">{tr('سعر الجملة', 'Wholesale Price')}</span>
                        <div className="w-full text-center font-black text-violet-700 text-[11px] sm:text-sm dir-ltr leading-tight truncate">{formatCurrency(pricing.wholesalePrice)}</div>
                        {pricing.wholesalePricingMode === 'MARKUP' && (
                          <div className="text-[7px] sm:text-[8px] font-black text-violet-600 mt-1 leading-tight">+{pricing.wholesaleMarkupPercent}%</div>
                        )}
                    </div>

                    <div className={`${metricDividerClass} flex flex-col items-center justify-center min-w-0 px-0.5 sm:px-1`}>
                        <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] sm:tracking-widest block mb-1 leading-tight">{tr('التكلفة الصافية', 'Net Cost')}</span>
                        <div className="w-full text-center font-black text-blue-700 text-[11px] sm:text-sm dir-ltr leading-tight truncate">{formatCurrency(pricing.cost)}</div>
                    </div>

                    <div className="flex flex-col items-center justify-center min-w-0 px-0.5 sm:px-1">
                        <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] sm:tracking-widest block mb-1 leading-tight">
                          {serviceItem ? tr('النوع', 'Type') : tr('المخزون', 'Stock')}
                        </span>
                        {serviceItem ? (
                          <>
                            <div className="w-full text-center font-black text-[11px] sm:text-sm text-amber-700 leading-tight">{tr('خدمة', 'Service')}</div>
                            <div className="w-full text-center text-[7px] sm:text-[8px] font-black text-gray-400 mt-1 leading-tight truncate">
                              {unit ? `${tr('الوحدة', 'Unit')}: ${unit.code}` : tr('بدون مخزون', 'No stock tracking')}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`w-full text-center font-black text-[11px] sm:text-sm dir-ltr flex items-center justify-center gap-1 leading-tight ${isLowStock ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {product.stock}
                                <span className="text-[8px] sm:text-[9px] text-gray-400 font-bold truncate">{unit?.code}</span>
                            </div>
                            <div className="w-full text-center text-[7px] sm:text-[8px] font-black text-gray-400 mt-1 dir-ltr leading-tight truncate">
                              {formatCurrency(product.stock * pricing.cost)}
                            </div>
                          </>
                        )}
                    </div>
                </div>
            </div>
        )})}

        {sortedProducts.length === 0 && (
            <div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-gray-200">
                <Package className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                <h3 className="text-gray-400 font-black text-lg">{tr('لا توجد أصناف مطابقة', 'No matching items')}</h3>
                <div className="mt-6 flex items-center justify-center gap-2">
                    <button onClick={handleOpenAdd} className="px-8 py-3 bg-blue-50 text-blue-600 rounded-2xl font-black text-xs hover:bg-blue-100 transition-all">{tr('إضافة صنف جديد', 'Add New Item')}</button>
                    {(groupFilter !== 'ALL' || searchTerm || stockFilter !== 'ALL' || sortBy !== 'LATEST') && (
                        <button
                            type="button"
                            onClick={() => {
                              setGroupFilter('ALL');
                              setSearchTerm('');
                              setStockFilter('ALL');
                              setSortBy('LATEST');
                            }}
                            className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all"
                        >
                            {tr('إلغاء الفلاتر', 'Reset filters')}
                        </button>
                    )}
                </div>
            </div>
        )}
      </div>
      </>
      ) : (
        <InventoryPricingManager />
      )}

      {/* Scanner Overlay */}
      {showScanner && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[350] bg-black flex flex-col">
              <div className="relative flex-1 bg-black">
                  <div id="reader" className="w-full h-full"></div>
                  <div className="absolute top-0 left-0 w-full h-full border-[50px] border-black/50 pointer-events-none flex items-center justify-center">
                      <div className="w-64 h-64 border-4 border-blue-500/50 rounded-3xl animate-pulse"></div>
                  </div>
              </div>
              <div className="bg-black p-6 flex justify-between items-center text-white">
                  <p className="text-sm font-bold">{tr('وجه الكاميرا نحو الباركود...', 'Point the camera at the barcode...')}</p>
                  <button onClick={stopAndCloseScanner} className="bg-white/20 p-3 rounded-full hover:bg-white/30 transition-all"><X size={24} /></button>
              </div>
          </div>,
          document.body
      )}

      {showForm && (
        <QuickAddProductModal
          mode="DIRECTORY"
          product={editingProduct}
          onClose={() => {
            resetForm();
            setShowForm(false);
          }}
          onSave={() => {
            resetForm();
            setShowForm(false);
          }}
        />
      )}

      {/* Add/Edit Product Modal */}
      {false && showForm && editingProduct && (
        <div className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-6 animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl p-4 sm:p-8 animate-in zoom-in-95 max-h-[calc(100dvh-1rem)] sm:max-h-[95vh] overflow-y-auto relative">
                <button onClick={() => setShowForm(false)} className="absolute left-4 sm:left-6 top-4 sm:top-6 text-gray-400 hover:text-rose-500 bg-gray-50 rounded-full p-2 transition-all hover:bg-rose-50"><X size={24} /></button>
                
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center mb-4 text-blue-600 shadow-sm border border-blue-100">
                        <Tag size={32} />
                    </div>
                    <h3 className="font-black text-slate-800 text-xl tracking-tight">
                        {editingProduct ? tr('تعديل بيانات الصنف', 'Edit Item') : tr('تعريف صنف جديد', 'Create New Item')}
                    </h3>
                    <p className="text-gray-400 text-[10px] font-bold mt-1 uppercase tracking-widest">{tr('أدخل تفاصيل المنتج بدقة لضمان صحة المخزون', 'Enter product details accurately to keep inventory correct')}</p>
                </div>

                <form onSubmit={handleProductSubmit} className="space-y-5">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">{tr('اسم الصنف التجاري', 'Item Name')}</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-sm focus:bg-white focus:border-blue-200 focus:ring-4 focus:ring-blue-50 transition-all text-slate-800" placeholder={tr('مثال: آيفون 15 برو ماكس', 'Example: iPhone 15 Pro Max')} required />
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/20 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block px-1">{tr('رقم الصنف', 'Item Code')}</label>
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
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tr('يبقى تلقائيًا حتى تدخل ترميزًا يدويًا', 'It stays automatic until you enter a manual code')}</span>
                                <span className="font-mono text-sm font-black text-indigo-700 dir-ltr">{effectiveAutoItemCode}</span>
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={itemCode}
                                onChange={(e) => setItemCode(normalizeItemCode(e.target.value))}
                                className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-black text-sm text-center dir-ltr text-indigo-700 focus:ring-4 focus:ring-indigo-50 transition-all"
                                placeholder="ITM-125"
                            />
                        )}
                        {itemCodeMode === 'MANUAL' && (
                            <p className="text-[10px] font-bold text-slate-400 px-1">
                                {tr('إذا تركته فارغًا سيبقى التوليد التلقائي لهذا الصنف.', 'Leave it blank to keep automatic generation for this item.')}
                            </p>
                        )}
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1 mb-2">{tr('كود الباركود (إن وجد)', 'Barcode (optional)')}</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-sm text-center dir-ltr focus:bg-white focus:border-blue-200 focus:ring-4 focus:ring-blue-50 text-slate-700" placeholder="0000000000000" />
                                <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                            </div>
                            <button 
                                type="button" 
                                onClick={startScanner}
                                className="w-14 bg-slate-800 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
                                title={tr('مسح الباركود بالكاميرا', 'Scan barcode with camera')}
                            >
                                <Camera size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">{tr('مجموعة الأصناف', 'Item Group')}</label>
                            <div className="flex h-14">
                                <select value={groupId} onChange={e => setGroupId(e.target.value)} className="flex-1 px-3 bg-gray-50 rounded-r-2xl rounded-l-md border border-gray-100 outline-none text-xs font-bold appearance-none focus:bg-white focus:border-indigo-200 transition-all text-slate-700">
                                    <option value="">{tr('اختر مجموعة', 'Select group')}</option>
                                    {sortedItemGroups.map(({ group, depth }) => (
                                      <option key={group.id} value={group.id}>
                                        {depth > 0 ? '  - ' : ''}{group.icon} {displayGroupName(group)}
                                      </option>
                                    ))}
                                </select>
                                <button type="button" onClick={openGroupManager} data-testid="item-groups-open-inline" className="w-12 bg-indigo-50 text-indigo-600 rounded-l-2xl rounded-r-md border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center justify-center">
                                    <Plus size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">{tr('وحدة القياس', 'Unit')}</label>
                            <div className="flex h-14">
                                <select value={unitId} onChange={e => setUnitId(e.target.value)} className="flex-1 px-3 bg-gray-50 rounded-r-2xl rounded-l-md border border-gray-100 outline-none text-xs font-bold appearance-none focus:bg-white focus:border-orange-200 transition-all text-slate-700">
                                    <option value="">{tr('اختر الوحدة', 'Select unit')}</option>
                                    {units.map(u => <option key={u.id} value={u.id}>{displayUnitName(u)} ({u.code})</option>)}
                                </select>
                                <button type="button" onClick={() => setShowUnitForm(true)} className="w-12 bg-orange-50 text-orange-600 rounded-l-2xl rounded-r-md border border-orange-100 hover:bg-orange-100 transition-all flex items-center justify-center">
                                    <Plus size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2 px-1">{tr('تكلفة الشراء / التكلفة الصافية', 'Purchase Cost / Net Cost')}</label>
                        <input type="text" inputMode="decimal" lang="en" value={buyPrice} onChange={e => setBuyPrice(toEnglishDigits(e.target.value))} className="w-full p-4 bg-rose-50/50 rounded-2xl border border-rose-100 outline-none font-black text-lg text-center dir-ltr text-rose-700 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all" placeholder="0.00" />
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h4 className="text-xs font-black text-emerald-700">{tr('قائمة الأسعار (جملة / مفرق)', 'Price List (Wholesale / Retail)')}</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-1">{tr('يمكن تحديد كل سعر كقيمة ثابتة أو كنسبة هامش من التكلفة.', 'Each price can be fixed or based on cost markup percentage.')}</p>
                            </div>
                            <Scale size={16} className="text-emerald-500 shrink-0" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-white border border-violet-100 rounded-2xl p-3 space-y-3">
                                <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest block">{tr('سعر الجملة', 'Wholesale Price')}</label>
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
                                        onChange={e => setWholesalePrice(toEnglishDigits(e.target.value))}
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
                                            onChange={e => setWholesaleMarkupPercent(toEnglishDigits(e.target.value))}
                                            className="w-full p-3 pl-8 bg-violet-50/50 rounded-xl border border-violet-100 outline-none font-black text-center dir-ltr text-violet-700"
                                            placeholder="20"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500 font-black">%</span>
                                    </div>
                                )}
                                <div className="text-[11px] font-black text-violet-700 dir-ltr">= {formatCurrency(draftPricingPreview.wholesalePrice)} {baseCurrency}</div>
                            </div>

                            <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-3">
                                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">{tr('سعر المفرق', 'Retail Price')}</label>
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
                                        onChange={e => setSellPrice(toEnglishDigits(e.target.value))}
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
                                            onChange={e => setRetailMarkupPercent(toEnglishDigits(e.target.value))}
                                            className="w-full p-3 pl-8 bg-emerald-50/50 rounded-xl border border-emerald-100 outline-none font-black text-center dir-ltr text-emerald-700"
                                            placeholder="30"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-black">%</span>
                                    </div>
                                )}
                                <div className="text-[11px] font-black text-emerald-700 dir-ltr">= {formatCurrency(draftPricingPreview.retailPrice)} {baseCurrency}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2 px-1">{tr('الكمية الافتتاحية', 'Opening Quantity')}</label>
                        <input type="text" inputMode="numeric" lang="en" value={stock} onChange={e => setStock(toEnglishDigits(e.target.value))} className="w-full p-4 bg-blue-50/30 rounded-2xl border border-blue-100 outline-none font-black text-lg text-center dir-ltr text-blue-800 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all" placeholder="0" />
                    </div>

                    <div className="rounded-2xl border border-violet-100 bg-violet-50/20 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h4 className="text-xs font-black text-violet-700">{tr('الصلاحية والتنبيه قبل الانتهاء', 'Expiry and Pre-Expiry Alert')}</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-1">{tr('يمكنك تحديد تاريخ انتهاء مباشر، أو تحديد فترة صلاحية بالأيام ليتم احتساب الانتهاء تلقائيًا من تاريخ شراء الفاتورة.', 'Set a direct expiry date or a shelf-life period in days to auto-calculate expiry from purchase date.')}</p>
                            </div>
                            <BellRing size={16} className="text-violet-400 shrink-0" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest block mb-2 px-1">{tr('تاريخ الانتهاء (اختياري)', 'Expiry Date (optional)')}</label>
                                <EnglishDateInput
                                    value={expiryDate}
                                    onChange={setExpiryDate}
                                    className="w-full p-4 bg-white rounded-2xl border border-violet-100 outline-none font-black text-center dir-ltr text-violet-700 focus:ring-4 focus:ring-violet-50 transition-all"
                                    wrapperClassName="w-full"
                                />
                                <p className="text-[9px] font-bold text-slate-400 mt-1 px-1">{tr('يفيد للمخزون الحالي أو إذا كنت تريد إدخال تاريخ انتهاء يدويًا مباشرة.', 'Useful for current stock or when you want to enter expiry manually.')}</p>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 px-1">{tr('فترة الصلاحية (أيام) من تاريخ الشراء', 'Shelf-Life (days) from purchase date')}</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={expiryPeriodDays}
                                    onChange={e => setExpiryPeriodDays(toEnglishDigits(e.target.value))}
                                    className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-black text-lg text-center dir-ltr text-indigo-700 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all"
                                    placeholder={tr('اختياري - مثال: 180', 'Optional - example: 180')}
                                />
                                <p className="text-[9px] font-bold text-slate-400 mt-1 px-1">{tr('عند شراء الصنف، يحتسب النظام تاريخ الانتهاء تلقائيًا من تاريخ الفاتورة + عدد الأيام.', 'On purchase, the system auto-calculates expiry date = invoice date + days.')}</p>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block mb-2 px-1">{tr('التنبيه قبل الانتهاء (أيام)', 'Alert Before Expiry (days)')}</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={expiryAlertLeadDays}
                                onChange={e => setExpiryAlertLeadDays(toEnglishDigits(e.target.value))}
                                className="w-full p-4 bg-white rounded-2xl border border-rose-100 outline-none font-black text-lg text-center dir-ltr text-rose-700 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all"
                                placeholder={tr('اختياري - مثال: 30', 'Optional - example: 30')}
                            />
                            <p className="text-[9px] font-bold text-slate-400 mt-1 px-1">{tr('إذا تُرك فارغًا، سيستخدم النظام حد التنبيه العام للصلاحية من إعدادات الشركة.', 'If empty, the system uses the global expiry alert threshold from company settings.')}</p>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-2 px-1">{tr('حد تنبيه نفاد المخزون (كمية)', 'Low Stock Alert Threshold (qty)')}</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={lowStockAlertQty}
                            onChange={e => setLowStockAlertQty(toEnglishDigits(e.target.value))}
                            className="w-full p-4 bg-amber-50/40 rounded-2xl border border-amber-100 outline-none font-black text-lg text-center dir-ltr text-amber-700 focus:bg-white focus:ring-4 focus:ring-amber-50 transition-all"
                            placeholder={tr('اختياري - مثال: 5', 'Optional - example: 5')}
                        />
                        <p className="text-[9px] font-bold text-slate-400 mt-1 px-1">{tr('إذا تُرك فارغًا سيتم استخدام الحد العام من الإعدادات.', 'If empty, the global threshold from settings is used.')}</p>
                    </div>

                    <button type="submit" className="w-full bg-slate-900 text-white font-black py-4.5 rounded-[1.8rem] shadow-2xl shadow-slate-300 hover:bg-slate-800 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2">
                        <Check size={20} />
                        {editingProduct ? tr('حفظ التعديلات النهائية', 'Save Final Changes') : tr('إتمام تعريف الصنف', 'Create Item')}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Item Group Manager Modal */}
      {showGroupForm && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-6 animate-in fade-in" data-testid="item-groups-manager">
          <div className="bg-white w-full max-w-4xl rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 max-h-[calc(100dvh-1rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">{tr('إدارة الأصناف', 'Inventory setup')}</p>
                <h3 className="font-black text-slate-900 text-xl leading-tight">{tr('إدارة مجموعات الأصناف', 'Item Group Management')}</h3>
              </div>
              <button type="button" onClick={closeGroupManager} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full shrink-0" aria-label={tr('إغلاق', 'Close')}>
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4">
              <form onSubmit={handleGroupSubmit} className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-black text-slate-800">
                    {editingGroupId ? tr('تعديل المجموعة', 'Edit group') : tr('إضافة مجموعة', 'Add group')}
                  </h4>
                  {editingGroupId && (
                    <button type="button" onClick={resetGroupForm} className="text-[11px] font-black text-slate-500 hover:text-slate-800">
                      {tr('إلغاء التعديل', 'Cancel edit')}
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">{tr('اسم المجموعة', 'Group name')}</label>
                  <input
                    type="text"
                    data-testid="item-group-name-input"
                    placeholder={tr('مثال: مشروبات', 'Example: Beverages')}
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-bold text-sm focus:border-indigo-300 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">{tr('المجموعة الرئيسية', 'Parent group')}</label>
                  <select
                    value={groupParentId}
                    onChange={e => setGroupParentId(e.target.value)}
                    className="w-full p-4 bg-white rounded-2xl border border-indigo-100 outline-none font-bold text-sm text-slate-700 focus:border-indigo-300 transition-all"
                  >
                    <option value="">{tr('مجموعة رئيسية', 'Main group')}</option>
                    {availableParentGroups.map(group => (
                      <option key={group.id} value={group.id}>{group.icon} {displayGroupName(group)}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">{tr('الأيقونة', 'Icon')}</label>
                  <div className="grid grid-cols-5 gap-2">
                    {icons.map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setGroupIcon(icon)}
                        className={`h-12 w-full flex items-center justify-center rounded-xl border-2 transition-all ${groupIcon === icon ? 'border-indigo-600 bg-white text-xl shadow-md' : 'border-white bg-white/70 hover:border-indigo-200'}`}
                        aria-label={tr('اختيار أيقونة', 'Choose icon')}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="item-group-save-action"
                  disabled={!groupName.trim()}
                  className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                >
                  {editingGroupId ? <Check size={18} /> : <Plus size={18} />}
                  {editingGroupId ? tr('حفظ التعديل', 'Save changes') : tr('إضافة المجموعة', 'Add group')}
                </button>
              </form>

              <div className="rounded-3xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm min-w-0">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-800">{tr('المجموعات الحالية', 'Current groups')}</h4>
                    <p className="text-[11px] font-bold text-slate-400 mt-1">{tr('يمكن التعديل والحذف من نفس الشاشة', 'Edit and delete from this screen')}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600 shrink-0">
                    {sortedItemGroups.length}
                  </span>
                </div>

                {sortedItemGroups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                    <FolderPlus className="w-8 h-8 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm font-black text-slate-700">{tr('لا توجد مجموعات أصناف', 'No item groups yet')}</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-1">{tr('ابدأ بإضافة أول مجموعة من النموذج.', 'Add the first group using the form.')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                    {sortedItemGroups.map(({ group, depth }) => {
                      const productCount = itemGroupProductCounts[group.id] || 0;
                      const childCount = itemGroupChildCounts[group.id] || 0;
                      const itemLabel = productCount === 1 ? tr('صنف', 'item') : tr('أصناف', 'items');
                      const canDelete = productCount === 0 && childCount === 0;

                      return (
                        <div
                          key={group.id}
                          className={`flex items-center gap-3 rounded-2xl border p-3 transition-all ${editingGroupId === group.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50/70 hover:bg-white'}`}
                          style={{ marginInlineStart: depth ? `${Math.min(depth * 18, 36)}px` : undefined }}
                        >
                          <div className="h-11 w-11 shrink-0 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-xl shadow-sm">
                            {group.icon || icons[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {depth > 0 && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />}
                              <p className="font-black text-slate-800 text-sm truncate">{displayGroupName(group)}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-black text-slate-400">
                              <span>{productCount} {itemLabel}</span>
                              {childCount > 0 && <span>{childCount} {tr('فرعية', 'subgroups')}</span>}
                              {group.parentId && <span>{tr('مجموعة فرعية', 'Subgroup')}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditItemGroup(group)}
                              className="h-9 w-9 rounded-xl bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50 flex items-center justify-center"
                              aria-label={tr('تعديل المجموعة', 'Edit group')}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItemGroup(group)}
                              disabled={!canDelete}
                              title={!canDelete ? tr('لا يمكن حذف مجموعة مستخدمة أو تحتوي مجموعات فرعية', 'Used groups or groups with subgroups cannot be deleted') : undefined}
                              className="h-9 w-9 rounded-xl bg-white text-red-500 border border-red-100 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white flex items-center justify-center"
                              aria-label={tr('حذف المجموعة', 'Delete group')}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Unit Modal */}
      {showUnitForm && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-6 animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-t-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl animate-in zoom-in-95 max-h-[calc(100dvh-1rem)] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-slate-800 text-lg">{tr('وحدة قياس جديدة', 'New Unit')}</h3>
                    <button onClick={() => setShowUnitForm(false)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full"><X size={20} /></button>
                </div>
                <form onSubmit={handleUnitSubmit} className="space-y-5">
                    <input type="text" placeholder={tr('اسم الوحدة (مثال: كرتون)', 'Unit name (example: Carton)')} value={newUnitName} onChange={e => setNewUnitName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-sm" required />
                    <input type="text" placeholder={tr('الرمز (مثال: CTN)', 'Code (example: CTN)')} value={newUnitCode} onChange={e => setNewUnitCode(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 outline-none font-bold text-sm text-center uppercase dir-ltr" required />
                    <button type="submit" className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-100 active:scale-95 transition-all">{tr('حفظ الوحدة', 'Save Unit')}</button>
                </form>
            </div>
        </div>
      )}

      {viewProductId && <ProductCard productId={viewProductId} onClose={() => setViewProductId(null)} />}

      {deleteProductId && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6 animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-t-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl animate-in zoom-in-95 text-center max-h-[calc(100dvh-1rem)] overflow-y-auto">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500 shadow-sm">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="font-black text-gray-800 text-lg mb-2">{tr('حذف الصنف نهائياً؟', 'Delete item permanently?')}</h3>
                <p className="text-gray-500 text-xs font-bold mb-8 leading-relaxed">
                    {tr('هل أنت متأكد من حذف هذا الصنف من المخزون؟ سيتم فقدان بيانات المخزون المرتبطة به.', 'Are you sure you want to delete this item? Linked stock data will be lost.')}
                </p>
                <div className="flex gap-3">
                    <button onClick={() => setDeleteProductId(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs hover:bg-gray-200 transition-all active:scale-95">
                        {tr('إلغاء', 'Cancel')}
                    </button>
                    <button onClick={confirmDelete} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95">
                        {tr('نعم، حذف', 'Yes, Delete')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
