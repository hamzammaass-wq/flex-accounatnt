import React, { useEffect, useMemo, useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import DocumentActions from './DocumentActions';
import { Product } from '../types';
import { getDisplayContactName, getDisplayItemGroupName, getDisplayProductName } from '../utils/displayNames';
import { downloadTextFile } from '../utils/documentExport';
import { resolveProductPricing } from '../utils/productPricing';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import {
  ArrowDownWideNarrow,
  Calculator,
  CheckCircle2,
  Filter,
  Layers,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Tags,
  Truck
} from 'lucide-react';

type PricingScope = 'ALL' | 'GROUP' | 'INVOICE' | 'SELECTED';
type CostSourceMode = 'PURCHASE_ONLY' | 'LANDED_WITH_IMPORT';
type PricingPrintMode = 'WHOLESALE' | 'RETAIL';

type RowOverride = {
  cost?: string;
  wholesale?: string;
  retail?: string;
};

const round2 = (value: number): number => {
  const safe = Number.isFinite(value) ? value : 0;
  return Number(safe.toFixed(2));
};

const parseNumberInput = (value: string, fallback = 0): number => {
  const normalized = toEnglishDigits(String(value || '').trim()).replace(/[^\d.-]/g, '');
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPlain = (value: number, isEnglish: boolean) =>
  new Intl.NumberFormat(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);

const formatSigned = (value: number, isEnglish: boolean) => {
  const safe = round2(value);
  return `${safe > 0 ? '+' : safe < 0 ? '-' : ''}${formatPlain(Math.abs(safe), isEnglish)}`;
};

const sameText = (value: string, query: string) => value.toLowerCase().includes(query.toLowerCase());
const escapeHtml = (value: string) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const escapeCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

const InventoryPricingManager: React.FC = () => {
  const {
    products,
    invoices,
    importExpenseDistributions,
    itemGroups,
    contacts,
    baseCurrency,
    companySettings,
    setProducts
  } = useAccounting();

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayProductName = (product?: { id: string; name: string } | null) =>
    getDisplayProductName(product || undefined, isEnglish);
  const displayGroupName = (group?: { id: string; name: string } | null) =>
    getDisplayItemGroupName(group || undefined, isEnglish);
  const displayContactName = (contact?: { id: string; name: string } | null) =>
    getDisplayContactName(contact || undefined, isEnglish);

  const [scope, setScope] = useState<PricingScope>('ALL');
  const [costSource, setCostSource] = useState<CostSourceMode>('LANDED_WITH_IMPORT');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [previewSearch, setPreviewSearch] = useState('');
  const [selectionSearch, setSelectionSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [applyCostUpdate, setApplyCostUpdate] = useState(true);
  const [applyWholesale, setApplyWholesale] = useState(true);
  const [applyRetail, setApplyRetail] = useState(true);
  const [wholesalePercent, setWholesalePercent] = useState('100');
  const [retailPercent, setRetailPercent] = useState('125');
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'ALL' | 'CHANGED' | 'OVERRIDDEN'>('ALL');
  const [printMode, setPrintMode] = useState<PricingPrintMode>('WHOLESALE');

  const purchaseInvoices = useMemo(
    () =>
      [...invoices]
        .filter((invoice) => invoice.category === 'purchase_invoice' && invoice.items.some((item) => item.productId))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [invoices]
  );

  useEffect(() => {
    if (!selectedGroupId && itemGroups[0]?.id) {
      setSelectedGroupId(itemGroups[0].id);
    }
  }, [itemGroups, selectedGroupId]);

  useEffect(() => {
    if (!selectedInvoiceId && purchaseInvoices[0]?.id) {
      setSelectedInvoiceId(purchaseInvoices[0].id);
    }
  }, [purchaseInvoices, selectedInvoiceId]);

  const selectedInvoice = useMemo(
    () => purchaseInvoices.find((invoice) => invoice.id === selectedInvoiceId) || null,
    [purchaseInvoices, selectedInvoiceId]
  );

  const latestPurchaseCostByProduct = useMemo(() => {
    const map = new Map<string, number>();
    purchaseInvoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        if (!item.productId || map.has(item.productId)) return;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) return;
        const unitCostBase = round2(((Number(item.total) || 0) / qty) * (Number(invoice.exchangeRate) || 1));
        if (unitCostBase > 0) map.set(item.productId, unitCostBase);
      });
    });
    products.forEach((product) => {
      if (!map.has(product.id) && Number(product.buyPrice) > 0) {
        map.set(product.id, round2(Number(product.buyPrice) || 0));
      }
    });
    return map;
  }, [products, purchaseInvoices]);

  const latestLandedCostByProduct = useMemo(() => {
    const map = new Map<string, number>();
    [...importExpenseDistributions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((distribution) => {
        distribution.lines.forEach((line) => {
          if (!line.productId || map.has(line.productId)) return;
          const qty = Number(line.quantity) || 0;
          const fallbackCost = qty > 0 ? Number(line.landedLineAmountBase || 0) / qty : 0;
          const landedCost = round2(Number(line.unitCostAfterBase) || fallbackCost);
          if (landedCost > 0) map.set(line.productId, landedCost);
        });
      });
    products.forEach((product) => {
      if (!map.has(product.id) && Number(product.buyPrice) > 0) {
        map.set(product.id, round2(Number(product.buyPrice) || 0));
      }
    });
    return map;
  }, [importExpenseDistributions, products]);

  const invoicePurchaseCostByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedInvoice) return map;

    const aggregates = new Map<string, { qty: number; amount: number }>();
    selectedInvoice.items.forEach((item) => {
      if (!item.productId) return;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) return;
      const totalBase = (Number(item.total) || 0) * (Number(selectedInvoice.exchangeRate) || 1);
      const prev = aggregates.get(item.productId) || { qty: 0, amount: 0 };
      aggregates.set(item.productId, {
        qty: prev.qty + qty,
        amount: prev.amount + totalBase
      });
    });

    aggregates.forEach((entry, productId) => {
      if (entry.qty > 0) map.set(productId, round2(entry.amount / entry.qty));
    });

    return map;
  }, [selectedInvoice]);

  const invoiceLandedCostByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedInvoice) return map;

    [...importExpenseDistributions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((distribution) => {
        distribution.lines.forEach((line) => {
          if (!line.productId || line.purchaseInvoiceId !== selectedInvoice.id || map.has(line.productId)) return;
          const qty = Number(line.quantity) || 0;
          const fallbackCost = qty > 0 ? Number(line.landedLineAmountBase || 0) / qty : 0;
          const landedCost = round2(Number(line.unitCostAfterBase) || fallbackCost);
          if (landedCost > 0) map.set(line.productId, landedCost);
        });
      });

    return map;
  }, [importExpenseDistributions, selectedInvoice]);

  const selectedProductIdsSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);

  const manualSelectionPool = useMemo(() => {
    const normalizedQuery = selectionSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (!normalizedQuery) return true;
      return [
        product.name,
        displayProductName(product),
        product.itemCode || '',
        product.barcode || ''
      ].some((value) => sameText(value, normalizedQuery));
    });
  }, [displayProductName, products, selectionSearch]);

  const candidateProducts = useMemo(() => {
    let list: Product[] = [];

    switch (scope) {
      case 'GROUP':
        list = products.filter((product) => !selectedGroupId || product.category === selectedGroupId);
        break;
      case 'INVOICE': {
        const ids = new Set(
          (selectedInvoice?.items || [])
            .map((item) => item.productId)
            .filter((value): value is string => Boolean(value))
        );
        list = products.filter((product) => ids.has(product.id));
        break;
      }
      case 'SELECTED':
        list = products.filter((product) => selectedProductIdsSet.has(product.id));
        break;
      case 'ALL':
      default:
        list = products;
        break;
    }

    const normalizedQuery = previewSearch.trim().toLowerCase();
    if (normalizedQuery) {
      list = list.filter((product) =>
        [
          product.name,
          displayProductName(product),
          product.itemCode || '',
          product.barcode || ''
        ].some((value) => sameText(value, normalizedQuery))
      );
    }

    return [...list].sort((a, b) =>
      displayProductName(a).localeCompare(displayProductName(b), isEnglish ? 'en' : 'ar')
    );
  }, [
    displayProductName,
    isEnglish,
    previewSearch,
    products,
    scope,
    selectedGroupId,
    selectedInvoice,
    selectedProductIdsSet
  ]);

  const wholesaleRatio = Math.max(0, parseNumberInput(wholesalePercent, 100));
  const retailRatio = Math.max(0, parseNumberInput(retailPercent, 125));

  const previewRows = useMemo(() => {
    return candidateProducts.map((product) => {
      const currentPricing = resolveProductPricing(product);
      const purchaseOnlyCost = scope === 'INVOICE'
        ? (invoicePurchaseCostByProduct.get(product.id) ?? latestPurchaseCostByProduct.get(product.id) ?? currentPricing.cost)
        : (latestPurchaseCostByProduct.get(product.id) ?? currentPricing.cost);
      const landedCost = scope === 'INVOICE'
        ? (invoiceLandedCostByProduct.get(product.id)
          ?? invoicePurchaseCostByProduct.get(product.id)
          ?? latestLandedCostByProduct.get(product.id)
          ?? purchaseOnlyCost)
        : (latestLandedCostByProduct.get(product.id) ?? purchaseOnlyCost);
      const referenceCost = round2(costSource === 'LANDED_WITH_IMPORT' ? landedCost : purchaseOnlyCost);
      const override = overrides[product.id] || {};
      const overrideCost = override.cost !== undefined && override.cost !== ''
        ? Math.max(0, parseNumberInput(override.cost, referenceCost))
        : null;
      const effectiveBasisCost = round2(overrideCost ?? (referenceCost > 0 ? referenceCost : currentPricing.cost));
      const nextCost = round2(applyCostUpdate ? effectiveBasisCost : currentPricing.cost);
      const computedWholesale = round2(applyWholesale ? (effectiveBasisCost * wholesaleRatio) / 100 : currentPricing.wholesalePrice);
      const computedRetail = round2(applyRetail ? (effectiveBasisCost * retailRatio) / 100 : currentPricing.retailPrice);
      const nextWholesale = round2(
        override.wholesale !== undefined && override.wholesale !== ''
          ? Math.max(0, parseNumberInput(override.wholesale, computedWholesale))
          : computedWholesale
      );
      const nextRetail = round2(
        override.retail !== undefined && override.retail !== ''
          ? Math.max(0, parseNumberInput(override.retail, computedRetail))
          : computedRetail
      );
      const changed =
        Math.abs(currentPricing.cost - nextCost) > 0.009 ||
        Math.abs(currentPricing.wholesalePrice - nextWholesale) > 0.009 ||
        Math.abs(currentPricing.retailPrice - nextRetail) > 0.009;
      const hasOverride = Object.values(override).some((value) => value !== undefined && value !== '');

      return {
        product,
        currentPricing,
        purchaseOnlyCost: round2(purchaseOnlyCost),
        landedCost: round2(landedCost),
        referenceCost,
        nextCost,
        nextWholesale,
        nextRetail,
        changed,
        hasOverride,
        costDelta: round2(nextCost - currentPricing.cost),
        wholesaleDelta: round2(nextWholesale - currentPricing.wholesalePrice),
        retailDelta: round2(nextRetail - currentPricing.retailPrice)
      };
    });
  }, [
    applyCostUpdate,
    applyRetail,
    applyWholesale,
    candidateProducts,
    costSource,
    invoiceLandedCostByProduct,
    invoicePurchaseCostByProduct,
    latestLandedCostByProduct,
    latestPurchaseCostByProduct,
    overrides,
    retailRatio,
    scope,
    wholesaleRatio
  ]);

  const changedRowsCount = previewRows.filter((row) => row.changed).length;
  const manualOverrideCount = previewRows.filter((row) => row.hasOverride).length;
  const averageReferenceCost = previewRows.length > 0
    ? round2(previewRows.reduce((sum, row) => sum + row.referenceCost, 0) / previewRows.length)
    : 0;
  const selectedGroup = itemGroups.find((group) => group.id === selectedGroupId) || null;
  const selectedInvoiceSupplier = selectedInvoice?.customerId
    ? contacts.find((contact) => contact.id === selectedInvoice.customerId) || null
    : null;
  const selectedScopeLabel = scope === 'INVOICE'
    ? `${tr('فاتورة', 'Invoice')}: ${selectedInvoice?.invoiceNumber || '-'}`
    : scope === 'GROUP'
      ? `${tr('مجموعة', 'Group')}: ${displayGroupName(selectedGroup) || tr('غير محددة', 'Not selected')}`
      : scope === 'SELECTED'
        ? `${tr('اختيار يدوي', 'Manual selection')}: ${formatPlain(selectedProductIds.length, isEnglish)}`
        : tr('كل الأصناف', 'All items');
  const activeCostSourceLabel = costSource === 'LANDED_WITH_IMPORT'
    ? tr('شراء + استيراد', 'Purchase + import')
    : tr('الشراء فقط', 'Purchase only');
  const printablePriceLabel = printMode === 'WHOLESALE'
    ? tr('سعر الجملة', 'Wholesale price')
    : tr('سعر المفرق', 'Retail price');
  const previewRowsToRender = useMemo(() => {
    const filtered = previewRows.filter((row) => {
      if (previewMode === 'CHANGED') return row.changed;
      if (previewMode === 'OVERRIDDEN') return row.hasOverride;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (a.hasOverride !== b.hasOverride) return a.hasOverride ? -1 : 1;
      if (a.changed !== b.changed) return a.changed ? -1 : 1;
      return displayProductName(a.product).localeCompare(displayProductName(b.product), isEnglish ? 'en' : 'ar');
    });
  }, [displayProductName, isEnglish, previewMode, previewRows]);

  const pricingPresets = [
    {
      id: 'SAFE',
      label: tr('محافظ', 'Safe'),
      wholesale: '100',
      retail: '125',
      helper: tr('جملة = التكلفة', 'Wholesale = cost')
    },
    {
      id: 'BALANCED',
      label: tr('متوازن', 'Balanced'),
      wholesale: '110',
      retail: '150',
      helper: tr('الأكثر استخدامًا', 'Common setup')
    },
    {
      id: 'AGGRESSIVE',
      label: tr('ربحية أعلى', 'Higher margin'),
      wholesale: '125',
      retail: '175',
      helper: tr('لهوامش أعلى', 'Higher margins')
    }
  ] as const;

  const handleOverrideChange = (productId: string, key: keyof RowOverride, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [key]: value
      }
    }));
    setStatusMessage('');
  };

  const clearRowOverride = (productId: string) => {
    setOverrides((prev) => {
      if (!prev[productId]) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const clearAllOverrides = () => {
    setOverrides({});
    setStatusMessage('');
  };

  const handleSelectAllVisible = () => {
    setSelectedProductIds((prev) => {
      const merged = new Set(prev);
      manualSelectionPool.forEach((product) => merged.add(product.id));
      return Array.from(merged);
    });
  };

  const handleClearSelection = () => {
    setSelectedProductIds([]);
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleApply = () => {
    if (previewRows.length === 0) {
      setStatusMessage(tr('لا توجد أصناف ضمن النطاق المحدد.', 'No products match the selected scope.'));
      return;
    }

    const rowsToApply = previewRows.filter((row) => row.changed);
    if (rowsToApply.length === 0) {
      setStatusMessage(tr('لا توجد تغييرات سعرية جاهزة للتطبيق حاليًا.', 'There are no pricing changes ready to apply.'));
      return;
    }

    const previewMap = new Map(rowsToApply.map((row) => [row.product.id, row]));
    const nextProducts = products.map((product) => {
      const row = previewMap.get(product.id);
      if (!row) return product;

      const nextWholesaleMarkup = row.nextCost > 0
        ? round2(Math.max(0, ((row.nextWholesale / row.nextCost) - 1) * 100))
        : 0;
      const nextRetailMarkup = row.nextCost > 0
        ? round2(Math.max(0, ((row.nextRetail / row.nextCost) - 1) * 100))
        : 0;

      return {
        ...product,
        buyPrice: applyCostUpdate ? row.nextCost : product.buyPrice,
        wholesalePrice: applyWholesale ? row.nextWholesale : product.wholesalePrice,
        sellPrice: applyRetail ? row.nextRetail : product.sellPrice,
        retailPrice: applyRetail ? row.nextRetail : product.retailPrice,
        wholesalePricingMode: applyWholesale ? 'FIXED' : product.wholesalePricingMode,
        retailPricingMode: applyRetail ? 'FIXED' : product.retailPricingMode,
        wholesaleMarkupPercent: applyWholesale ? nextWholesaleMarkup : product.wholesaleMarkupPercent,
        retailMarkupPercent: applyRetail ? nextRetailMarkup : product.retailMarkupPercent
      };
    });

    setProducts(nextProducts);
    setOverrides({});
    setPreviewMode('ALL');
    setStatusMessage(
      tr(
        `تم تحديث ${formatPlain(rowsToApply.length, isEnglish)} صنف من شاشة أسعار الأصناف.`,
        `Updated ${formatPlain(rowsToApply.length, isEnglish)} items from item pricing screen.`
      )
    );
  };

  const pricingReportTitle = tr('قائمة أسعار الأصناف', 'Item Price List');
  const pricingReportShareText = [
    pricingReportTitle,
    `${tr('نطاق التطبيق', 'Scope')}: ${selectedScopeLabel}`,
    `${tr('نوع السعر', 'Price type')}: ${printablePriceLabel}`,
    `${tr('مصدر التكلفة', 'Cost source')}: ${activeCostSourceLabel}`,
    `${tr('عدد الأصناف', 'Items count')}: ${formatPlain(previewRowsToRender.length, isEnglish)}`
  ].join('\n');

  const buildPricingReportHtml = (autoPrint = false) => {
    const rowsHtml = previewRowsToRender
      .map((row, index) => {
        const group = itemGroups.find((item) => item.id === row.product.category) || null;
        const selectedPrice = printMode === 'WHOLESALE' ? row.nextWholesale : row.nextRetail;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(displayProductName(row.product))}</td>
            <td>${escapeHtml(row.product.itemCode || row.product.barcode || '-')}</td>
            <td>${escapeHtml(displayGroupName(group) || tr('غير مصنف', 'Uncategorized'))}</td>
            <td class="num">${escapeHtml(formatPlain(selectedPrice, isEnglish))}</td>
          </tr>
        `;
      })
      .join('');

    return `<!doctype html>
<html lang="${isEnglish ? 'en' : 'ar'}" dir="${isEnglish ? 'ltr' : 'rtl'}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(pricingReportTitle)}</title>
    <style>
      body { font-family: ${isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', Arial, sans-serif"}; margin: 24px; color: #0f172a; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      .meta { margin: 0 0 14px; color: #475569; font-size: 12px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
      .chip { border: 1px solid #e2e8f0; border-radius: 999px; padding: 6px 10px; font-size: 11px; font-weight: 700; background: #f8fafc; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; text-align: ${isEnglish ? 'left' : 'right'}; }
      th { background: #f8fafc; font-weight: 800; }
      .num { direction: ltr; text-align: right; font-weight: 800; }
      @media print { body { margin: 12px; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(pricingReportTitle)}</h1>
    <p class="meta">${escapeHtml(tr('تم التوليد من شاشة أسعار الأصناف', 'Generated from item pricing screen'))}</p>
    <div class="chips">
      <span class="chip">${escapeHtml(`${tr('نطاق التطبيق', 'Scope')}: ${selectedScopeLabel}`)}</span>
      <span class="chip">${escapeHtml(`${tr('نوع السعر', 'Price type')}: ${printablePriceLabel}`)}</span>
      <span class="chip">${escapeHtml(`${tr('مصدر التكلفة', 'Cost source')}: ${activeCostSourceLabel}`)}</span>
      <span class="chip">${escapeHtml(`${tr('عدد الأصناف', 'Items count')}: ${formatPlain(previewRowsToRender.length, isEnglish)}`)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${escapeHtml(tr('الصنف', 'Item'))}</th>
          <th>${escapeHtml(tr('الرمز', 'Code'))}</th>
          <th>${escapeHtml(tr('المجموعة', 'Group'))}</th>
          <th>${escapeHtml(printablePriceLabel)}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5" style="text-align:center;color:#64748b;">${escapeHtml(tr('لا توجد أصناف للطباعة حاليًا', 'No items to print right now'))}</td></tr>`}
      </tbody>
    </table>
    ${autoPrint ? '<script>window.onload = () => window.print();</script>' : ''}
  </body>
</html>`;
  };

  const handlePrintPricing = () => {
    if (previewRowsToRender.length === 0) {
      setStatusMessage(tr('لا توجد أصناف معروضة للطباعة حاليًا.', 'There are no visible items to print right now.'));
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(tr('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPricingReportHtml(true));
    printWindow.document.close();
  };

  const handleSavePricingSnapshot = () => {
    if (previewRowsToRender.length === 0) {
      setStatusMessage(tr('لا توجد أصناف معروضة للتنزيل حاليًا.', 'There are no visible items to download right now.'));
      return;
    }

    downloadTextFile(
      buildPricingReportHtml(false),
      `${pricingReportTitle}-${printablePriceLabel}-${previewRowsToRender.length}.html`,
      'text/html;charset=utf-8'
    );
  };

  const handleExportPricingExcel = () => {
    if (previewRowsToRender.length === 0) {
      setStatusMessage(tr('لا توجد أصناف معروضة للتصدير حاليًا.', 'There are no visible items to export right now.'));
      return;
    }

    const csvRows = [
      [tr('#', '#'), tr('الصنف', 'Item'), tr('الرمز', 'Code'), tr('المجموعة', 'Group'), printablePriceLabel],
      ...previewRowsToRender.map((row, index) => {
        const group = itemGroups.find((item) => item.id === row.product.category) || null;
        const selectedPrice = printMode === 'WHOLESALE' ? row.nextWholesale : row.nextRetail;
        return [
          String(index + 1),
          displayProductName(row.product),
          row.product.itemCode || row.product.barcode || '-',
          displayGroupName(group) || tr('غير مصنف', 'Uncategorized'),
          formatPlain(selectedPrice, isEnglish)
        ];
      })
    ];

    const csv = `\uFEFF${csvRows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}`;
    downloadTextFile(
      csv,
      `${pricingReportTitle}-${printablePriceLabel}-${previewRowsToRender.length}.csv`,
      'text/csv;charset=utf-8'
    );
  };

  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 p-5 text-white shadow-xl shadow-slate-200">
        <div className="absolute inset-y-0 left-0 w-40 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_68%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black tracking-[0.24em] text-blue-100">
              <Tags size={12} />
              {tr('أسعار الأصناف', 'Item Pricing')}
            </div>
            <h2 className="mt-3 text-2xl font-black leading-tight">{tr('إدارة تسعير الأصناف من التكلفة', 'Manage item pricing from cost')}</h2>
            <p className="mt-2 text-sm font-bold text-blue-100/90 leading-6">
              {tr(
                'اختر نطاق التطبيق، حدّد مصدر التكلفة من الشراء أو من الشراء مع مصاريف الاستيراد، ثم احتسب أسعار الجملة والمفرق كنسبة مباشرة من التكلفة وطبّقها جماعيًا.',
                'Choose the scope, select cost basis from purchase only or purchase plus import expenses, then compute wholesale and retail as a direct percentage of cost and apply in bulk.'
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <div className="text-[10px] font-black text-blue-100">{tr('الأصناف ضمن النطاق', 'Scoped Items')}</div>
              <div className="mt-1 text-2xl font-black dir-ltr">{formatPlain(previewRows.length, isEnglish)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
              <div className="text-[10px] font-black text-emerald-100">{tr('أصناف ستتغير', 'Items Changing')}</div>
              <div className="mt-1 text-2xl font-black dir-ltr text-emerald-100">{formatPlain(changedRowsCount, isEnglish)}</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 mt-4 flex flex-col gap-3 rounded-[1.7rem] border border-white/10 bg-white/10 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-blue-100/80">
              <ArrowDownWideNarrow size={12} />
              {tr('نوع سعر الطباعة', 'Print price type')}
            </div>
            <div className="inline-flex w-fit rounded-2xl border border-white/10 bg-slate-950/30 p-1">
              {[
                { id: 'WHOLESALE' as const, label: tr('سعر الجملة', 'Wholesale price') },
                { id: 'RETAIL' as const, label: tr('سعر المفرق', 'Retail price') }
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPrintMode(option.id)}
                  className={`rounded-2xl px-4 py-2 text-[11px] font-black transition-all ${
                    printMode === option.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-blue-100/85 hover:bg-white/10'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <DocumentActions
            title={pricingReportTitle}
            shareText={pricingReportShareText}
            isEnglish={isEnglish}
            tr={tr}
            onPrint={handlePrintPricing}
            onSave={handleSavePricingSnapshot}
            onExcel={handleExportPricingExcel}
            saveTitle={tr('تنزيل قائمة الأسعار', 'Download price list')}
            variant="dark"
            showSaveButton={false}
            menuPlacement="top"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <h3 className="text-sm font-black text-slate-800">{tr('نطاق التطبيق', 'Apply Scope')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {[
              { id: 'ALL' as const, icon: Package, label: tr('كل الأصناف', 'All Items') },
              { id: 'GROUP' as const, icon: Layers, label: tr('مجموعة أصناف', 'Item Group') },
              { id: 'INVOICE' as const, icon: Receipt, label: tr('فاتورة شراء', 'Purchase Invoice') },
              { id: 'SELECTED' as const, icon: CheckCircle2, label: tr('اختيار يدوي', 'Manual Selection') }
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setScope(option.id);
                  setStatusMessage('');
                }}
                className={`rounded-2xl border px-3 py-3 text-center transition-all ${
                  scope === option.id
                    ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-100'
                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                <option.icon size={16} className="mx-auto mb-1.5" />
                <div className="text-[11px] font-black">{option.label}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {scope === 'GROUP' && (
              <label className="block">
                <span className="mb-2 block text-[11px] font-black text-slate-500">{tr('المجموعة المستهدفة', 'Target Group')}</span>
                <select
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none"
                >
                  {itemGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {displayGroupName(group)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {scope === 'INVOICE' && (
              <label className="block md:col-span-2">
                <span className="mb-2 block text-[11px] font-black text-slate-500">{tr('فاتورة الشراء', 'Purchase Invoice')}</span>
                <select
                  value={selectedInvoiceId}
                  onChange={(event) => setSelectedInvoiceId(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none"
                >
                  {purchaseInvoices.length === 0 && (
                    <option value="">{tr('لا توجد فواتير شراء', 'No purchase invoices')}</option>
                  )}
                  {purchaseInvoices.map((invoice) => {
                    const supplier = invoice.customerId
                      ? contacts.find((contact) => contact.id === invoice.customerId) || null
                      : null;
                    return (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} - {invoice.date} - {displayContactName(supplier)}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            <label className={`block ${scope === 'ALL' || scope === 'SELECTED' ? 'md:col-span-2' : ''}`}>
              <span className="mb-2 block text-[11px] font-black text-slate-500">{tr('بحث داخل الأصناف المعروضة', 'Search in preview')}</span>
              <div className="relative">
                <input
                  value={previewSearch}
                  onChange={(event) => setPreviewSearch(event.target.value)}
                  placeholder={tr('ابحث باسم الصنف أو الكود أو الباركود...', 'Search by name, code, or barcode...')}
                  className="h-12 w-full rounded-2xl border border-slate-100 bg-slate-50 pr-11 pl-4 text-sm font-bold text-slate-700 outline-none"
                />
                <Search size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
            </label>
          </div>

          {(scope === 'GROUP' || scope === 'INVOICE') && (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black text-slate-500">
              {scope === 'GROUP'
                ? tr(
                    `سيتم تطبيق التسعير على مجموعة: ${displayGroupName(selectedGroup) || tr('غير محددة', 'Not selected')}.`,
                    `Pricing will be applied to group: ${displayGroupName(selectedGroup) || tr('غير محددة', 'Not selected')}.`
                  )
                : tr(
                    `سيتم تطبيق التسعير على فاتورة الشراء ${selectedInvoice?.invoiceNumber || '-'}${selectedInvoiceSupplier ? ` - ${displayContactName(selectedInvoiceSupplier)}` : ''}.`,
                    `Pricing will be applied to purchase invoice ${selectedInvoice?.invoiceNumber || '-'}${selectedInvoiceSupplier ? ` - ${displayContactName(selectedInvoiceSupplier)}` : ''}.`
                  )}
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Truck size={16} className="text-slate-400" />
            <h3 className="text-sm font-black text-slate-800">{tr('مصدر التكلفة', 'Cost Source')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'PURCHASE_ONLY' as const, label: tr('من الشراء فقط', 'Purchase only') },
              { id: 'LANDED_WITH_IMPORT' as const, label: tr('الشراء + الاستيراد', 'Purchase + import') }
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setCostSource(option.id);
                  setStatusMessage('');
                }}
                className={`rounded-2xl border px-3 py-3 text-[11px] font-black transition-all ${
                  costSource === option.id
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-emerald-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-[11px] font-bold text-slate-500 leading-5">
            {costSource === 'PURCHASE_ONLY'
              ? tr(
                  'يعتمد الحساب على آخر تكلفة شراء معروفة لكل صنف أو على تكلفة صنف الفاتورة المختارة.',
                  'Pricing uses the latest known purchase cost for each product or the selected purchase invoice cost.'
                )
              : tr(
                  'يعتمد الحساب على آخر تكلفة بعد توزيع مصاريف الاستيراد إن وجدت، مع الرجوع لتكلفة الشراء عند عدم وجود توزيع.',
                  'Pricing uses the latest landed cost after import expense distribution when available, otherwise falls back to purchase cost.'
                )}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Percent size={16} className="text-slate-400" />
            <h3 className="text-sm font-black text-slate-800">{tr('احتساب الأسعار من التكلفة', 'Compute prices from cost')}</h3>
          </div>
          <button
            type="button"
            onClick={clearAllOverrides}
            disabled={manualOverrideCount === 0}
            className={`inline-flex items-center gap-2 self-start rounded-2xl border px-4 py-2 text-[11px] font-black transition-all ${
              manualOverrideCount > 0
                ? 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-slate-100'
                : 'cursor-not-allowed border-slate-100 bg-slate-50/80 text-slate-300'
            }`}
          >
            <RotateCcw size={14} />
            {tr('إلغاء التعديلات اليدوية', 'Reset manual edits')}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setApplyCostUpdate((prev) => !prev)}
            className={`rounded-2xl border p-2.5 text-center transition-all ${
              applyCostUpdate
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-100 bg-slate-50 text-slate-500'
            }`}
          >
            <div className="truncate text-[9px] font-black uppercase tracking-[0.18em]">{tr('التكلفة', 'Cost')}</div>
            <div className="mt-1 text-[11px] font-black leading-4">{tr('تحديث تكلفة الصنف', 'Update item cost')}</div>
          </button>

          <button
            type="button"
            onClick={() => setApplyWholesale((prev) => !prev)}
            className={`rounded-2xl border p-2.5 text-center transition-all ${
              applyWholesale
                ? 'border-violet-300 bg-violet-50 text-violet-700'
                : 'border-slate-100 bg-slate-50 text-slate-500'
            }`}
          >
            <div className="truncate text-[9px] font-black uppercase tracking-[0.18em]">{tr('الجملة', 'Wholesale')}</div>
            <div className="mt-1 text-[11px] font-black leading-4">{tr('تحديث سعر الجملة', 'Update wholesale price')}</div>
          </button>

          <button
            type="button"
            onClick={() => setApplyRetail((prev) => !prev)}
            className={`rounded-2xl border p-2.5 text-center transition-all ${
              applyRetail
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-slate-100 bg-slate-50 text-slate-500'
            }`}
          >
            <div className="truncate text-[9px] font-black uppercase tracking-[0.18em]">{tr('المفرق', 'Retail')}</div>
            <div className="mt-1 text-[11px] font-black leading-4">{tr('تحديث سعر المفرق', 'Update retail price')}</div>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="mb-1 block truncate text-[10px] font-black text-slate-500">{tr('نسبة سعر الجملة من التكلفة', 'Wholesale % of cost')}</span>
            <div className="relative">
              <input
                value={wholesalePercent}
                onChange={(event) => {
                  setWholesalePercent(event.target.value);
                  setStatusMessage('');
                }}
                className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-10 pr-3 text-sm font-black text-slate-700 outline-none dir-ltr"
                inputMode="decimal"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">%</span>
            </div>
            <p className="mt-1 truncate text-[9px] font-bold text-slate-400">
              {tr('مثال: 100% تعني أن سعر الجملة يساوي التكلفة.', 'Example: 100% means wholesale equals cost.')}
            </p>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block truncate text-[10px] font-black text-slate-500">{tr('نسبة سعر المفرق من التكلفة', 'Retail % of cost')}</span>
            <div className="relative">
              <input
                value={retailPercent}
                onChange={(event) => {
                  setRetailPercent(event.target.value);
                  setStatusMessage('');
                }}
                className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-10 pr-3 text-sm font-black text-slate-700 outline-none dir-ltr"
                inputMode="decimal"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">%</span>
            </div>
            <p className="mt-1 truncate text-[9px] font-bold text-slate-400">
              {tr('يمكنك ضبط النسبة ثم تعديل أي صنف يدويًا قبل التطبيق.', 'Set the ratio, then fine-tune any item manually before applying.')}
            </p>
          </label>
        </div>

        <div className="mt-4 rounded-[1.7rem] border border-slate-100 bg-slate-50/80 p-3">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-[12px] font-black text-slate-700">{tr('نسب جاهزة سريعة', 'Quick pricing presets')}</h4>
              <p className="text-[10px] font-bold text-slate-400">
                {tr('تضبط نسب الجملة والمفرق فورًا ثم يمكنك تعديل أي صنف يدويًا.', 'Instantly sets wholesale and retail ratios, then you can fine-tune any row.')}
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black text-slate-500">
              {tr('تسريع الإعداد', 'Setup booster')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {pricingPresets.map((preset) => {
              const isActive = wholesalePercent === preset.wholesale && retailPercent === preset.retail;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setWholesalePercent(preset.wholesale);
                    setRetailPercent(preset.retail);
                    setStatusMessage('');
                  }}
                  className={`min-w-0 rounded-2xl border px-2.5 py-2.5 text-start transition-all ${
                    isActive
                      ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <div className="flex flex-col items-start gap-1.5">
                    <div className={`rounded-full px-2 py-1 text-[9px] font-black dir-ltr ${isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {preset.wholesale}% / {preset.retail}%
                    </div>
                    <div className="truncate text-[11px] font-black">{preset.label}</div>
                  </div>
                  <div className={`mt-1 truncate text-[9px] font-bold ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {preset.helper}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {scope === 'SELECTED' && (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-slate-400" />
              <h3 className="text-sm font-black text-slate-800">{tr('اختيار الأصناف يدويًا', 'Manual product selection')}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-[11px] font-black text-blue-700"
              >
                {tr('تحديد نتائج البحث', 'Select search results')}
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-black text-slate-500"
              >
                {tr('إلغاء كل التحديد', 'Clear selection')}
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <input
              value={selectionSearch}
              onChange={(event) => setSelectionSearch(event.target.value)}
              placeholder={tr('ابحث لتحديد أصناف معينة...', 'Search to select specific items...')}
              className="h-12 w-full rounded-2xl border border-slate-100 bg-slate-50 pr-11 pl-4 text-sm font-bold text-slate-700 outline-none"
            />
            <Search size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {manualSelectionPool.map((product) => {
              const checked = selectedProductIdsSet.has(product.id);
              const group = itemGroups.find((item) => item.id === product.category) || null;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleProductSelection(product.id)}
                  className={`rounded-2xl border p-3 text-start transition-all ${
                    checked
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800">{displayProductName(product)}</div>
                      <div className="mt-1 truncate text-[10px] font-black text-slate-400">
                        {displayGroupName(group) || tr('غير مصنف', 'Uncategorized')}
                      </div>
                    </div>
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black ${checked ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 text-transparent'}`}>
                      ✓
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-[1.6rem] border border-blue-100 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400">{tr('المتوسط المرجعي للتكلفة', 'Average reference cost')}</div>
          <div className="mt-2 text-xl font-black text-blue-700 dir-ltr">{formatPlain(averageReferenceCost, isEnglish)}</div>
          <div className="mt-1 text-[10px] font-bold text-slate-400">{baseCurrency}</div>
        </div>
        <div className="rounded-[1.6rem] border border-violet-100 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400">{tr('نسبة الجملة', 'Wholesale ratio')}</div>
          <div className="mt-2 text-xl font-black text-violet-700 dir-ltr">{formatPlain(wholesaleRatio, isEnglish)}%</div>
          <div className="mt-1 text-[10px] font-bold text-slate-400">{tr('من التكلفة', 'of cost')}</div>
        </div>
        <div className="rounded-[1.6rem] border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400">{tr('نسبة المفرق', 'Retail ratio')}</div>
          <div className="mt-2 text-xl font-black text-emerald-700 dir-ltr">{formatPlain(retailRatio, isEnglish)}%</div>
          <div className="mt-1 text-[10px] font-bold text-slate-400">{tr('من التكلفة', 'of cost')}</div>
        </div>
        <div className="rounded-[1.6rem] border border-amber-100 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400">{tr('عدد المحدد للتطبيق', 'Scope size')}</div>
          <div className="mt-2 text-xl font-black text-amber-700 dir-ltr">{formatPlain(previewRows.length, isEnglish)}</div>
          <div className="mt-1 text-[10px] font-bold text-slate-400">
            {scope === 'INVOICE' ? tr('أصناف الفاتورة', 'Invoice items') : scope === 'GROUP' ? tr('أصناف المجموعة', 'Group items') : scope === 'SELECTED' ? tr('الأصناف المختارة', 'Selected items') : tr('كل الأصناف', 'All items')}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-slate-400" />
              <div>
                <h3 className="text-sm font-black text-slate-800">{tr('معاينة التسعير قبل التطبيق', 'Pricing preview before apply')}</h3>
                <p className="text-[10px] font-bold text-slate-400">
                  {tr('يمكنك تعديل أي صف يدويًا قبل حفظ الأسعار على الأصناف.', 'You can manually edit any row before saving prices to products.')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black text-slate-600">
                {selectedScopeLabel}
              </span>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">
                {tr('مصدر التكلفة', 'Cost source')}: {activeCostSourceLabel}
              </span>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700">
                {tr('متغير', 'Changed')}: {formatPlain(changedRowsCount, isEnglish)}
              </span>
              <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[10px] font-black text-violet-700">
                {tr('يدوي', 'Manual')}: {formatPlain(manualOverrideCount, isEnglish)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'ALL' as const, label: tr('الكل', 'All'), count: previewRows.length },
                { id: 'CHANGED' as const, label: tr('المتغير فقط', 'Changed only'), count: changedRowsCount },
                { id: 'OVERRIDDEN' as const, label: tr('المعدل يدويًا', 'Manual only'), count: manualOverrideCount }
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPreviewMode(option.id)}
                  className={`rounded-2xl border px-4 py-2 text-[11px] font-black transition-all ${
                    previewMode === option.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {option.label} ({formatPlain(option.count, isEnglish)})
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleApply}
            disabled={changedRowsCount === 0}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition-all ${
              changedRowsCount > 0
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            <Save size={16} />
            {tr(
              `تطبيق ${formatPlain(changedRowsCount, isEnglish)} صنف`,
              `Apply ${formatPlain(changedRowsCount, isEnglish)} items`
            )}
          </button>
        </div>

        {statusMessage && (
          <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[11px] font-black text-emerald-700">
            {statusMessage}
          </div>
        )}

        <div className="space-y-3">
          {previewRowsToRender.map((row) => {
            const group = itemGroups.find((item) => item.id === row.product.category) || null;
            const rowSourceLabel = costSource === 'LANDED_WITH_IMPORT' && row.landedCost > 0 && Math.abs(row.landedCost - row.purchaseOnlyCost) > 0.009
              ? tr('شراء + استيراد', 'Purchase + import')
              : tr('شراء', 'Purchase');

            return (
              <div
                key={row.product.id}
                className={`rounded-[1.7rem] border p-4 transition-all ${
                  row.changed ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50/40'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-black text-slate-800">{displayProductName(row.product)}</h4>
                      <span className="rounded-full border border-slate-100 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
                        {displayGroupName(group) || tr('غير مصنف', 'Uncategorized')}
                      </span>
                      <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-black text-blue-600">
                        {rowSourceLabel}
                      </span>
                    </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold text-slate-400">
                      {row.product.itemCode && <span className="dir-ltr">{row.product.itemCode}</span>}
                      {row.product.barcode && <span className="dir-ltr">{row.product.barcode}</span>}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.hasOverride && (
                        <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                          {tr('تعديل يدوي', 'Manual override')}
                        </span>
                      )}
                      {!row.changed && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
                          {tr('بدون تغيير', 'No change')}
                        </span>
                      )}
                      {Math.abs(row.costDelta) > 0.009 && (
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
                          {tr('التكلفة', 'Cost')}: {formatSigned(row.costDelta, isEnglish)}
                        </span>
                      )}
                      {Math.abs(row.wholesaleDelta) > 0.009 && (
                        <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                          {tr('الجملة', 'Wholesale')}: {formatSigned(row.wholesaleDelta, isEnglish)}
                        </span>
                      )}
                      {Math.abs(row.retailDelta) > 0.009 && (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                          {tr('المفرق', 'Retail')}: {formatSigned(row.retailDelta, isEnglish)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => clearRowOverride(row.product.id)}
                    className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-100 bg-white px-3 py-2 text-[11px] font-black text-slate-500"
                  >
                    <RefreshCw size={14} />
                    {tr('إرجاع الافتراضي', 'Use default')}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-2.5">
                    <div className="truncate text-[9px] font-black text-slate-400">{tr('التكلفة الحالية', 'Current cost')}</div>
                    <div className="mt-1 flex items-center gap-1 dir-ltr">
                      <span className="truncate text-base font-black text-slate-800">{formatPlain(row.currentPricing.cost, isEnglish)}</span>
                      <span className="shrink-0 text-[9px] font-bold text-slate-400">{baseCurrency}</span>
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-violet-100 bg-white p-2.5">
                    <div className="truncate text-[9px] font-black text-violet-500">{tr('الجملة الحالية', 'Current wholesale')}</div>
                    <div className="mt-1 flex items-center gap-1 dir-ltr">
                      <span className="truncate text-base font-black text-violet-700">{formatPlain(row.currentPricing.wholesalePrice, isEnglish)}</span>
                      <span className="shrink-0 text-[9px] font-bold text-slate-400">{baseCurrency}</span>
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-emerald-100 bg-white p-2.5">
                    <div className="truncate text-[9px] font-black text-emerald-500">{tr('المفرق الحالي', 'Current retail')}</div>
                    <div className="mt-1 flex items-center gap-1 dir-ltr">
                      <span className="truncate text-base font-black text-emerald-700">{formatPlain(row.currentPricing.retailPrice, isEnglish)}</span>
                      <span className="shrink-0 text-[9px] font-bold text-slate-400">{baseCurrency}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-black text-slate-500">{tr('التكلفة الجديدة', 'New cost')}</span>
                    <input
                      value={overrides[row.product.id]?.cost ?? (applyCostUpdate ? String(row.nextCost) : '')}
                      onChange={(event) => handleOverrideChange(row.product.id, 'cost', event.target.value)}
                      placeholder={applyCostUpdate ? String(row.nextCost) : String(row.referenceCost)}
                      className="h-10 w-full rounded-2xl border border-slate-100 bg-white px-3 text-xs font-black text-slate-700 outline-none dir-ltr"
                      inputMode="decimal"
                    />
                    <p className="mt-1 truncate text-[9px] font-bold text-slate-400">
                      {tr('المرجع', 'Reference')}: {formatPlain(row.referenceCost, isEnglish)} {baseCurrency}
                    </p>
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-black text-slate-500">{tr('سعر الجملة الجديد', 'New wholesale price')}</span>
                    <input
                      value={overrides[row.product.id]?.wholesale ?? (applyWholesale ? String(row.nextWholesale) : '')}
                      onChange={(event) => handleOverrideChange(row.product.id, 'wholesale', event.target.value)}
                      placeholder={String(row.nextWholesale)}
                      className="h-10 w-full rounded-2xl border border-violet-100 bg-white px-3 text-xs font-black text-violet-700 outline-none dir-ltr"
                      inputMode="decimal"
                    />
                    <p className="mt-1 truncate text-[9px] font-bold text-slate-400">
                      {tr('النسبة المحسوبة', 'Computed ratio')}: {formatPlain(wholesaleRatio, isEnglish)}%
                    </p>
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-black text-slate-500">{tr('سعر المفرق الجديد', 'New retail price')}</span>
                    <input
                      value={overrides[row.product.id]?.retail ?? (applyRetail ? String(row.nextRetail) : '')}
                      onChange={(event) => handleOverrideChange(row.product.id, 'retail', event.target.value)}
                      placeholder={String(row.nextRetail)}
                      className="h-10 w-full rounded-2xl border border-emerald-100 bg-white px-3 text-xs font-black text-emerald-700 outline-none dir-ltr"
                      inputMode="decimal"
                    />
                    <p className="mt-1 truncate text-[9px] font-bold text-slate-400">
                      {tr('النسبة المحسوبة', 'Computed ratio')}: {formatPlain(retailRatio, isEnglish)}%
                    </p>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {previewRowsToRender.length === 0 && (
          <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-slate-200" />
            <h4 className="text-sm font-black text-slate-500">
              {previewRows.length === 0
                ? tr('لا توجد أصناف ضمن النطاق الحالي', 'No products in the current scope')
                : tr('لا توجد صفوف تطابق فلتر المعاينة الحالي', 'No rows match the current preview filter')}
            </h4>
            <p className="mt-2 text-[11px] font-bold text-slate-400">
              {previewRows.length === 0
                ? tr('بدّل النطاق أو ابحث عن أصناف أخرى أو حدّد أصنافًا يدويًا.', 'Change the scope, search for other products, or select items manually.')
                : tr('بدّل فلتر المعاينة إلى الكل أو أضف تعديلات يدوية لإظهار صفوف هنا.', 'Switch the preview filter back to all or add manual edits to show rows here.')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default InventoryPricingManager;
