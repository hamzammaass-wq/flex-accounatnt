import React, { useEffect, useMemo, useState } from 'react';
import { Download, Save, ScanBarcode, Trash2, Upload } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { getDisplayProductName, getDisplayWarehouseName } from '../utils/displayNames';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { isStockProduct } from '../utils/productKind';

type CountMap = Record<string, number>;
type UnknownBarcodeMap = Record<string, number>;

const STORAGE_KEY_PREFIX = 'al_mohaseb_barcode_stock_take_v1';

const normalizeBarcode = (value: string) =>
  toEnglishDigits(String(value || '')).trim().toLowerCase();

const parseCsvText = (text: string): Array<Record<string, string>> => {
  const normalized = text.replace(/^\uFEFF/, '').trim();
  if (!normalized) return [];
  const lines = normalized.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    return row;
  });
};

const BarcodeStockTakeManager: React.FC = () => {
  const { products, warehouses, adjustWarehouseStock, companySettings, currentCompanyId } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayProductName = (product?: { id: string; name: string } | null) =>
    getDisplayProductName(product || undefined, isEnglish);
  const displayWarehouseName = (warehouse?: { id: string; name: string } | null) =>
    getDisplayWarehouseName(warehouse || undefined, isEnglish);
  const stockProducts = useMemo(() => products.filter(product => isStockProduct(product)), [products]);

  const [warehouseId, setWarehouseId] = useState<string>('');
  const [offlineMode, setOfflineMode] = useState(true);
  const [scanValue, setScanValue] = useState('');
  const [counts, setCounts] = useState<CountMap>({});
  const [unknownBarcodes, setUnknownBarcodes] = useState<UnknownBarcodeMap>({});
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehouseId, warehouses]);

  const storageKey = `${STORAGE_KEY_PREFIX}_${currentCompanyId || 'default'}_${warehouseId || 'none'}`;

  useEffect(() => {
    if (!offlineMode || !warehouseId || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setCounts({});
        setUnknownBarcodes({});
        return;
      }
      const parsed = JSON.parse(raw);
      setCounts(parsed?.counts && typeof parsed.counts === 'object' ? parsed.counts as CountMap : {});
      setUnknownBarcodes(parsed?.unknownBarcodes && typeof parsed.unknownBarcodes === 'object'
        ? parsed.unknownBarcodes as UnknownBarcodeMap
        : {});
    } catch {
      setCounts({});
      setUnknownBarcodes({});
    }
  }, [storageKey, offlineMode, warehouseId]);

  useEffect(() => {
    if (!offlineMode || !warehouseId || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify({ counts, unknownBarcodes, savedAt: new Date().toISOString() }));
  }, [counts, unknownBarcodes, storageKey, offlineMode, warehouseId]);

  const productLookup = useMemo(() => {
    const byScan = new Map<string, string>();
    stockProducts.forEach(product => {
      if (product.barcode) byScan.set(normalizeBarcode(product.barcode), product.id);
      if (product.itemCode) byScan.set(normalizeBarcode(product.itemCode), product.id);
    });
    return byScan;
  }, [stockProducts]);

  const countedRows = useMemo(() => {
    return Object.entries(counts)
      .map(([productId, qty]) => {
        const countedQty = Number(qty) || 0;
        const product = stockProducts.find(item => item.id === productId);
        const currentQty = Number(product?.warehouseStock?.find(line => line.warehouseId === warehouseId)?.quantity ?? product?.stock ?? 0);
        return {
          productId,
          qty: countedQty,
          product,
          currentQty,
          delta: countedQty - currentQty
        };
      })
      .sort((a, b) => Number(b.qty) - Number(a.qty));
  }, [counts, stockProducts, warehouseId]);

  const totalCounted = countedRows.reduce((sum, row) => sum + row.qty, 0);

  const incrementScan = (rawValue: string, amount = 1) => {
    const normalized = normalizeBarcode(rawValue);
    if (!normalized) return;
    const productId = productLookup.get(normalized);
    if (!productId) {
      setUnknownBarcodes(prev => ({ ...prev, [normalized]: (prev[normalized] || 0) + amount }));
      setStatusMsg(tr(`باركود غير معروف: ${normalized}`, `Unknown barcode: ${normalized}`));
      return;
    }
    setCounts(prev => ({ ...prev, [productId]: (prev[productId] || 0) + amount }));
    const product = stockProducts.find(item => item.id === productId);
    setStatusMsg(tr(`تم عد ${displayProductName(product || null)}`, `Counted ${displayProductName(product || null)}`));
  };

  const onScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    incrementScan(scanValue, 1);
    setScanValue('');
  };

  const importResultsFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length === 0) {
        setStatusMsg(tr('الملف لا يحتوي صفوف صالحة للاستيراد', 'File has no valid import rows'));
        return;
      }

      let appliedRows = 0;
      rows.forEach(row => {
        const barcode = normalizeBarcode(row.barcode || row.Barcode || row.code || row.itemCode || '');
        const qtyRaw = toEnglishDigits(String(row.count || row.qty || row.quantity || row.Count || '0')).trim();
        const qty = Number(qtyRaw);
        if (!barcode || !Number.isFinite(qty) || qty <= 0) return;
        incrementScan(barcode, qty);
        appliedRows += 1;
      });

      setStatusMsg(tr(`تم استيراد ${appliedRows} صف من نتائج الجرد`, `Imported ${appliedRows} stocktake rows`));
    } catch {
      setStatusMsg(tr('فشل قراءة ملف نتائج الجرد', 'Failed to read stocktake results file'));
    }
  };

  const exportSessionCsv = () => {
    const header = ['productId', 'productName', 'barcode', 'countedQty', 'currentQty', 'delta'];
    const rows = countedRows.map(row => [
      row.productId,
      row.product ? displayProductName(row.product) : '',
      row.product?.barcode || row.product?.itemCode || '',
      row.qty,
      row.currentQty,
      row.delta
    ]);
    const csvEsc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [header, ...rows].map(cols => cols.map(csvEsc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `stocktake-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const applyCountResults = () => {
    if (!warehouseId) {
      alert(tr('اختر المستودع أولاً', 'Select warehouse first.'));
      return;
    }
    if (countedRows.length === 0) {
      alert(tr('لا توجد نتائج جرد للتطبيق', 'No stocktake results to apply.'));
      return;
    }
    for (const row of countedRows) {
      const result = adjustWarehouseStock(row.productId, warehouseId, row.qty, {
        reason: 'VARIANCE',
        source: 'BARCODE'
      });
      if (!result.ok) {
        const productLabel = row.product ? displayProductName(row.product) : row.productId;
        alert(tr(
          `تعذر تطبيق الجرد على الصنف ${productLabel}: ${result.message}`,
          `Could not apply stocktake to ${productLabel}: ${result.message}`
        ));
        return;
      }
    }
    setStatusMsg(tr(`تم تطبيق ${countedRows.length} صنف على المخزون`, `Applied ${countedRows.length} products to inventory`));
  };

  const clearSession = () => {
    if (!window.confirm(tr('مسح جلسة الجرد الحالية؟', 'Clear current stocktake session?'))) return;
    setCounts({});
    setUnknownBarcodes({});
    setStatusMsg('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
  };

  return (
    <div className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-gray-800">{tr('الجرد بالباركود (Offline)', 'Barcode Stocktake (Offline)')}</h3>
            <p className="text-[11px] font-bold text-gray-500">
              {tr('عدّ الأصناف بدون اتصال، ثم استورد/طبّق النتائج لاحقًا.', 'Count items offline, then import/apply results later.')}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-black text-gray-700">
            <input type="checkbox" checked={offlineMode} onChange={e => setOfflineMode(e.target.checked)} />
            <span>{tr('وضع Offline', 'Offline Mode')}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 block mb-1">{tr('المستودع', 'Warehouse')}</label>
            <select
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold"
            >
              <option value="">{tr('-- اختر المستودع --', '-- Select warehouse --')}</option>
              {warehouses.map(warehouse => (
                <option key={warehouse.id} value={warehouse.id}>
                  {displayWarehouseName(warehouse)}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={onScanSubmit} className="md:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <input
              value={scanValue}
              onChange={e => setScanValue(e.target.value)}
              placeholder={tr('امسح/اكتب باركود ثم Enter', 'Scan/type barcode then Enter')}
              className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold dir-ltr"
            />
            <button
              type="submit"
              className="px-4 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black inline-flex items-center justify-center gap-1.5"
            >
              <ScanBarcode size={14} />
              {tr('تسجيل', 'Count')}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-black text-gray-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
            {tr('أصناف معدودة', 'Counted Products')}: {countedRows.length} - {tr('إجمالي الوحدات', 'Total Units')}: {totalCounted}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-black text-blue-700 inline-flex items-center gap-1.5 cursor-pointer">
              <Upload size={12} />
              {tr('استيراد نتائج CSV', 'Import Results CSV')}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={async e => {
                  await importResultsFile(e.target.files?.[0] || null);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={exportSessionCsv}
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-[11px] font-black text-indigo-700 inline-flex items-center gap-1.5"
            >
              <Download size={12} />
              {tr('تصدير CSV', 'Export CSV')}
            </button>
            <button
              type="button"
              onClick={applyCountResults}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-black inline-flex items-center gap-1.5"
            >
              <Save size={12} />
              {tr('تطبيق النتائج', 'Apply Results')}
            </button>
            <button
              type="button"
              onClick={clearSession}
              className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-[11px] font-black text-rose-700 inline-flex items-center gap-1.5"
            >
              <Trash2 size={12} />
              {tr('مسح الجلسة', 'Clear Session')}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700">
            {statusMsg}
          </div>
        )}
      </div>

      {Object.keys(unknownBarcodes).length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm">
          <h4 className="text-xs font-black text-rose-700 mb-2">{tr('باركودات غير معروفة', 'Unknown Barcodes')}</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(unknownBarcodes).map(([barcode, qty]) => (
              <span key={barcode} className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-black text-rose-700 dir-ltr">
                {barcode} x{qty}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <h4 className="text-xs font-black text-gray-700 mb-2">{tr('تفاصيل الجرد الحالي', 'Current Stocktake Details')}</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-[760px] w-full text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="p-3 text-right">{tr('الصنف', 'Item')}</th>
                <th className="p-3 text-center">{tr('الباركود', 'Barcode')}</th>
                <th className="p-3 text-center">{tr('الحالي', 'Current')}</th>
                <th className="p-3 text-center">{tr('المعدود', 'Counted')}</th>
                <th className="p-3 text-center">{tr('الفرق', 'Delta')}</th>
              </tr>
            </thead>
            <tbody>
              {countedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 font-bold">
                    {tr('لا توجد نتائج جرد بعد', 'No stocktake rows yet')}
                  </td>
                </tr>
              ) : (
                countedRows.map(row => (
                  <tr key={row.productId} className="border-t border-gray-100">
                    <td className="p-3 font-black text-gray-700">{row.product ? displayProductName(row.product) : row.productId}</td>
                    <td className="p-3 text-center font-mono text-[11px] text-gray-500">{row.product?.barcode || row.product?.itemCode || '-'}</td>
                    <td className="p-3 text-center dir-ltr font-black text-gray-600">{row.currentQty}</td>
                    <td className="p-3 text-center dir-ltr font-black text-indigo-700">{row.qty}</td>
                    <td className={`p-3 text-center dir-ltr font-black ${row.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {row.delta >= 0 ? '+' : ''}{row.delta}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BarcodeStockTakeManager;
