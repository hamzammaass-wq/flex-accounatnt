import React, { useEffect, useMemo, useState } from 'react';
import { ScanBarcode, Save, Printer, Camera, Keyboard, TestTube2 } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import {
  BarcodeReaderSettings,
  DEFAULT_BARCODE_READER_SETTINGS,
  loadBarcodeReaderSettings,
  saveBarcodeReaderSettings
} from '../utils/barcodeSettings';
import { printProductBarcodeLabel } from '../utils/barcodeLabelPrint';
import { toEnglishDigits } from '../utils/forceEnglishDigits';

const BarcodeDevicesManager: React.FC = () => {
  const { companySettings, currentCompanyId, baseCurrency } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

  const [settings, setSettings] = useState<BarcodeReaderSettings>(() => loadBarcodeReaderSettings(currentCompanyId));

  useEffect(() => {
    setSettings(loadBarcodeReaderSettings(currentCompanyId));
  }, [currentCompanyId]);

  const update = <K extends keyof BarcodeReaderSettings>(key: K, value: BarcodeReaderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const save = () => {
    const next = saveBarcodeReaderSettings(currentCompanyId, settings);
    setSettings(next);
    alert(tr('تم حفظ إعدادات الباركود والطباعة بنجاح.', 'Barcode and label printer settings saved successfully.'));
  };

  const testPrint = () => {
    printProductBarcodeLabel({
      product: {
        id: 'test',
        name: tr('صنف تجريبي', 'Test Item'),
        barcode: '123456789012',
        itemCode: 'TEST-01',
        buyPrice: 0,
        sellPrice: 9.99,
        stock: 0
      },
      settings,
      companyId: currentCompanyId,
      currency: baseCurrency,
      isEnglish
    });
  };

  const scannerSummary = useMemo(() => {
    const bits = [
      settings.scannerMode === 'CAMERA' ? tr('كاميرا', 'Camera') : tr('قارئ لوحة مفاتيح', 'Keyboard Wedge'),
      settings.autoAddOnExactMatch ? tr('إضافة تلقائية عند التطابق', 'Auto-add exact match') : tr('إضافة يدوية بعد البحث', 'Manual add after search'),
      tr('اللاحقة', 'Suffix') + ': ' + (settings.scannerSuffix === 'TAB' ? 'Tab' : settings.scannerSuffix === 'NONE' ? tr('بدون', 'None') : 'Enter')
    ];
    return bits.join(' • ');
  }, [settings, isEnglish]);

  return (
    <div className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600"><ScanBarcode className="w-5 h-5" /></div>
          <div>
            <h3 className="font-black text-gray-800 text-sm">{tr('إعدادات قارئ الباركود', 'Barcode Reader Settings')}</h3>
            <p className="text-xs font-bold text-gray-400">{scannerSummary}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-sm font-black text-gray-800">{tr('وضع قارئ لوحة مفاتيح (USB/Bluetooth)', 'Keyboard Wedge Mode (USB/Bluetooth)')}</div>
              <div className="text-xs font-bold text-gray-400">{tr('الأكثر شيوعًا في نقاط البيع', 'Most common POS scanner mode')}</div>
            </div>
            <input type="radio" checked={settings.scannerMode === 'KEYBOARD_WEDGE'} onChange={() => update('scannerMode', 'KEYBOARD_WEDGE')} />
          </label>
          <label className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-sm font-black text-gray-800">{tr('وضع كاميرا (اختياري)', 'Camera Mode (Optional)')}</div>
              <div className="text-xs font-bold text-gray-400">{tr('استخدام كاميرا الجهاز داخل الفاتورة', 'Use device camera inside invoice screen')}</div>
            </div>
            <input type="radio" checked={settings.scannerMode === 'CAMERA'} onChange={() => update('scannerMode', 'CAMERA')} />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <label className="text-xs font-black text-gray-700 block mb-2">{tr('لاحقة القارئ', 'Scanner suffix')}</label>
            <select
              value={settings.scannerSuffix}
              onChange={(e) => update('scannerSuffix', e.target.value as BarcodeReaderSettings['scannerSuffix'])}
              className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold"
            >
              <option value="ENTER">Enter</option>
              <option value="TAB">Tab</option>
              <option value="NONE">{tr('بدون', 'None')}</option>
            </select>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
            <label className="flex items-center justify-between gap-2 text-sm font-black text-gray-700">
              <span>{tr('إضافة الصنف تلقائيًا عند تطابق الباركود', 'Auto-add item on exact barcode match')}</span>
              <input type="checkbox" checked={settings.autoAddOnExactMatch} onChange={(e) => update('autoAddOnExactMatch', e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm font-black text-gray-700">
              <span>{tr('إظهار زر الكاميرا داخل البيع/الشراء', 'Show camera button in sales/purchases')}</span>
              <input type="checkbox" checked={settings.allowCameraScannerInInvoices} onChange={(e) => update('allowCameraScannerInInvoices', e.target.checked)} />
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-50 text-orange-600"><Printer className="w-5 h-5" /></div>
          <div>
            <h3 className="font-black text-gray-800 text-sm">{tr('طابعة ملصقات الباركود', 'Barcode Label Printer')}</h3>
            <p className="text-xs font-bold text-gray-400">{tr('إعدادات طباعة ملصقات الأصناف من شاشة المخزون/الصنف', 'Print label settings for product barcode labels')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black text-gray-700 block mb-2">{tr('اسم الطابعة (اختياري)', 'Printer name (optional)')}</label>
            <input
              value={settings.labelPrinterName || ''}
              onChange={(e) => update('labelPrinterName', e.target.value)}
              placeholder={tr('مثال: Zebra / TSC / Xprinter', 'e.g. Zebra / TSC / Xprinter')}
              className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-black text-gray-700 block mb-2">{tr('العرض مم', 'Width mm')}</label>
              <input value={String(settings.labelWidthMm)} onChange={(e) => update('labelWidthMm', Number(toEnglishDigits(e.target.value)) as any)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-center dir-ltr" />
            </div>
            <div>
              <label className="text-xs font-black text-gray-700 block mb-2">{tr('الارتفاع مم', 'Height mm')}</label>
              <input value={String(settings.labelHeightMm)} onChange={(e) => update('labelHeightMm', Number(toEnglishDigits(e.target.value)) as any)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-center dir-ltr" />
            </div>
            <div>
              <label className="text-xs font-black text-gray-700 block mb-2">{tr('عدد النسخ', 'Copies')}</label>
              <input value={String(settings.labelCopiesDefault)} onChange={(e) => update('labelCopiesDefault', Number(toEnglishDigits(e.target.value)) as any)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-center dir-ltr" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-2 text-sm font-black text-gray-700">
            <span>{tr('إظهار اسم الصنف', 'Show item name')}</span>
            <input type="checkbox" checked={settings.labelShowItemName} onChange={(e) => update('labelShowItemName', e.target.checked)} />
          </label>
          <label className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-2 text-sm font-black text-gray-700">
            <span>{tr('إظهار السعر', 'Show price')}</span>
            <input type="checkbox" checked={settings.labelShowPrice} onChange={(e) => update('labelShowPrice', e.target.checked)} />
          </label>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <label className="text-xs font-black text-gray-700 block mb-2">{tr('حجم خط الباركود', 'Barcode font size')}</label>
            <input value={String(settings.barcodeFontSize)} onChange={(e) => update('barcodeFontSize', Number(toEnglishDigits(e.target.value)) as any)} className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm font-bold text-center dir-ltr" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={testPrint} className="px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 font-black text-xs inline-flex items-center gap-2">
            <TestTube2 className="w-4 h-4" />
            {tr('طباعة تجريبية', 'Test Print')}
          </button>
          <button type="button" onClick={save} className="px-4 py-3 rounded-xl bg-blue-600 text-white font-black text-xs shadow-lg shadow-blue-100 inline-flex items-center gap-2">
            <Save className="w-4 h-4" />
            {tr('حفظ الإعدادات', 'Save Settings')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeDevicesManager;

