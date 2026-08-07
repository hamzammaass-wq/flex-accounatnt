import { toEnglishDigits } from './forceEnglishDigits';

export type BarcodeScannerMode = 'KEYBOARD_WEDGE' | 'CAMERA';
export type BarcodeScannerSuffix = 'ENTER' | 'TAB' | 'NONE';

export interface BarcodeReaderSettings {
  scannerMode: BarcodeScannerMode;
  scannerSuffix: BarcodeScannerSuffix;
  autoAddOnExactMatch: boolean;
  allowCameraScannerInInvoices: boolean;
  labelPrinterName?: string;
  labelWidthMm: number;
  labelHeightMm: number;
  labelCopiesDefault: number;
  labelShowPrice: boolean;
  labelShowItemName: boolean;
  barcodeFontSize: number;
}

export const DEFAULT_BARCODE_READER_SETTINGS: BarcodeReaderSettings = {
  scannerMode: 'KEYBOARD_WEDGE',
  scannerSuffix: 'ENTER',
  autoAddOnExactMatch: true,
  allowCameraScannerInInvoices: false,
  labelPrinterName: '',
  labelWidthMm: 58,
  labelHeightMm: 35,
  labelCopiesDefault: 1,
  labelShowPrice: true,
  labelShowItemName: true,
  barcodeFontSize: 13
};

const STORAGE_KEY = (companyId?: string | null) => `al_mohaseb_barcode_settings_${companyId || 'default'}`;

const asBool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const asNum = (value: unknown, fallback: number) => {
  const normalized = toEnglishDigits(String(value ?? '')).replace(/[^\d.\-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
};

const normalize = (input: Partial<BarcodeReaderSettings> | null | undefined): BarcodeReaderSettings => ({
  scannerMode: input?.scannerMode === 'CAMERA' ? 'CAMERA' : 'KEYBOARD_WEDGE',
  scannerSuffix: input?.scannerSuffix === 'TAB' ? 'TAB' : input?.scannerSuffix === 'NONE' ? 'NONE' : 'ENTER',
  autoAddOnExactMatch: asBool(input?.autoAddOnExactMatch, DEFAULT_BARCODE_READER_SETTINGS.autoAddOnExactMatch),
  allowCameraScannerInInvoices: asBool(input?.allowCameraScannerInInvoices, DEFAULT_BARCODE_READER_SETTINGS.allowCameraScannerInInvoices),
  labelPrinterName: String(input?.labelPrinterName || '').trim(),
  labelWidthMm: Math.max(25, Math.min(120, asNum(input?.labelWidthMm, DEFAULT_BARCODE_READER_SETTINGS.labelWidthMm))),
  labelHeightMm: Math.max(15, Math.min(120, asNum(input?.labelHeightMm, DEFAULT_BARCODE_READER_SETTINGS.labelHeightMm))),
  labelCopiesDefault: Math.max(1, Math.min(50, Math.round(asNum(input?.labelCopiesDefault, DEFAULT_BARCODE_READER_SETTINGS.labelCopiesDefault)))),
  labelShowPrice: asBool(input?.labelShowPrice, DEFAULT_BARCODE_READER_SETTINGS.labelShowPrice),
  labelShowItemName: asBool(input?.labelShowItemName, DEFAULT_BARCODE_READER_SETTINGS.labelShowItemName),
  barcodeFontSize: Math.max(10, Math.min(24, Math.round(asNum(input?.barcodeFontSize, DEFAULT_BARCODE_READER_SETTINGS.barcodeFontSize))))
});

export const loadBarcodeReaderSettings = (companyId?: string | null): BarcodeReaderSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(companyId));
    if (!raw) return { ...DEFAULT_BARCODE_READER_SETTINGS };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_BARCODE_READER_SETTINGS };
  }
};

export const saveBarcodeReaderSettings = (companyId: string | null | undefined, settings: Partial<BarcodeReaderSettings>) => {
  const next = normalize(settings);
  localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('barcodeSettingsChanged'));
  return next;
};

export const patchBarcodeReaderSettings = (
  companyId: string | null | undefined,
  patch: Partial<BarcodeReaderSettings>
) => {
  const current = loadBarcodeReaderSettings(companyId);
  const next = normalize({ ...current, ...patch });
  localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('barcodeSettingsChanged'));
  return next;
};
