export type ThermalDocumentType = 'INVOICE' | 'VOUCHER' | 'RECEIPT';

export interface ThermalTemplateOption {
  id: string;
  type: ThermalDocumentType;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  style: 'STANDARD' | 'COMPACT';
}

export interface ThermalTemplatePreferences {
  INVOICE: string;
  VOUCHER: string;
  RECEIPT: string;
}

export interface ThermalTemplateCustomization {
  headerText: string;
  footerText: string;
  paperWidthMm: 58 | 80;
  compactMaxItems: number;
  showPrintedAt: boolean;
}

export type ThermalTemplateCustomizationMap = {
  [key in ThermalDocumentType]: ThermalTemplateCustomization;
};

const STORAGE_KEY_PREFIX = 'al_mohaseb_thermal_template_prefs_v1';
const CUSTOM_STORAGE_KEY_PREFIX = 'al_mohaseb_thermal_template_custom_v1';

const TEMPLATE_OPTIONS: ThermalTemplateOption[] = [
  {
    id: 'invoice-standard',
    type: 'INVOICE',
    nameAr: 'فاتورة قياسية',
    nameEn: 'Invoice Standard',
    descriptionAr: 'تفاصيل كاملة مع ملخص الضريبة والخصم',
    descriptionEn: 'Full details with tax and discount summary',
    style: 'STANDARD'
  },
  {
    id: 'invoice-compact',
    type: 'INVOICE',
    nameAr: 'فاتورة مختصرة',
    nameEn: 'Invoice Compact',
    descriptionAr: 'أسطر أقل مناسبة للطباعة السريعة',
    descriptionEn: 'Fewer lines for quick printing',
    style: 'COMPACT'
  },
  {
    id: 'voucher-standard',
    type: 'VOUCHER',
    nameAr: 'سند قياسي',
    nameEn: 'Voucher Standard',
    descriptionAr: 'يعرض جميع بنود السند',
    descriptionEn: 'Shows all voucher lines',
    style: 'STANDARD'
  },
  {
    id: 'voucher-compact',
    type: 'VOUCHER',
    nameAr: 'سند مختصر',
    nameEn: 'Voucher Compact',
    descriptionAr: 'ملخص سريع للبنود والمجموع',
    descriptionEn: 'Quick summary for lines and total',
    style: 'COMPACT'
  },
  {
    id: 'receipt-standard',
    type: 'RECEIPT',
    nameAr: 'إيصال قياسي',
    nameEn: 'Receipt Standard',
    descriptionAr: 'إيصال مفصل للقبض',
    descriptionEn: 'Detailed receipt for incoming payment',
    style: 'STANDARD'
  },
  {
    id: 'receipt-compact',
    type: 'RECEIPT',
    nameAr: 'إيصال مختصر',
    nameEn: 'Receipt Compact',
    descriptionAr: 'إيصال مختصر وسريع',
    descriptionEn: 'Compact quick receipt',
    style: 'COMPACT'
  }
];

const DEFAULT_PREFERENCES: ThermalTemplatePreferences = {
  INVOICE: 'invoice-standard',
  VOUCHER: 'voucher-standard',
  RECEIPT: 'receipt-standard'
};

const DEFAULT_CUSTOMIZATION: ThermalTemplateCustomization = {
  headerText: '',
  footerText: '',
  paperWidthMm: 80,
  compactMaxItems: 8,
  showPrintedAt: true
};

const storageKey = (companyId?: string | null) => `${STORAGE_KEY_PREFIX}_${companyId || 'default'}`;
const customStorageKey = (companyId?: string | null) => `${CUSTOM_STORAGE_KEY_PREFIX}_${companyId || 'default'}`;

const isValidTemplateForType = (templateId: string, type: ThermalDocumentType) =>
  TEMPLATE_OPTIONS.some(option => option.type === type && option.id === templateId);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const sanitizeText = (value: unknown) => String(value ?? '').trim();

const sanitizeCustomization = (
  value: Partial<ThermalTemplateCustomization> | null | undefined
): ThermalTemplateCustomization => {
  const paperCandidate = Number(value?.paperWidthMm);
  const compactCandidate = Number(value?.compactMaxItems);
  return {
    headerText: sanitizeText(value?.headerText),
    footerText: sanitizeText(value?.footerText),
    paperWidthMm: paperCandidate === 58 ? 58 : 80,
    compactMaxItems: Number.isFinite(compactCandidate) ? clamp(Math.floor(compactCandidate), 3, 20) : DEFAULT_CUSTOMIZATION.compactMaxItems,
    showPrintedAt: value?.showPrintedAt !== false
  };
};

const sanitizeCustomizationMap = (
  value: Partial<Record<ThermalDocumentType, Partial<ThermalTemplateCustomization>>> | null | undefined
): ThermalTemplateCustomizationMap => ({
  INVOICE: sanitizeCustomization({ ...DEFAULT_CUSTOMIZATION, ...(value?.INVOICE || {}) }),
  VOUCHER: sanitizeCustomization({ ...DEFAULT_CUSTOMIZATION, ...(value?.VOUCHER || {}) }),
  RECEIPT: sanitizeCustomization({ ...DEFAULT_CUSTOMIZATION, ...(value?.RECEIPT || {}) })
});

const sanitizePreferences = (value: Partial<ThermalTemplatePreferences> | null | undefined): ThermalTemplatePreferences => ({
  INVOICE: isValidTemplateForType(String(value?.INVOICE || ''), 'INVOICE')
    ? String(value!.INVOICE)
    : DEFAULT_PREFERENCES.INVOICE,
  VOUCHER: isValidTemplateForType(String(value?.VOUCHER || ''), 'VOUCHER')
    ? String(value!.VOUCHER)
    : DEFAULT_PREFERENCES.VOUCHER,
  RECEIPT: isValidTemplateForType(String(value?.RECEIPT || ''), 'RECEIPT')
    ? String(value!.RECEIPT)
    : DEFAULT_PREFERENCES.RECEIPT
});

export const getThermalTemplateOptions = (type: ThermalDocumentType): ThermalTemplateOption[] =>
  TEMPLATE_OPTIONS.filter(option => option.type === type);

export const loadThermalTemplatePreferences = (companyId?: string | null): ThermalTemplatePreferences => {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ThermalTemplatePreferences>;
    return sanitizePreferences(parsed);
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

export const saveThermalTemplatePreferences = (
  companyId: string | null | undefined,
  value: Partial<ThermalTemplatePreferences>
): ThermalTemplatePreferences => {
  const next = sanitizePreferences({ ...loadThermalTemplatePreferences(companyId), ...value });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey(companyId), JSON.stringify(next));
  }
  return next;
};

export const loadThermalTemplateCustomizations = (companyId?: string | null): ThermalTemplateCustomizationMap => {
  if (typeof window === 'undefined') return sanitizeCustomizationMap(null);
  try {
    const raw = window.localStorage.getItem(customStorageKey(companyId));
    if (!raw) return sanitizeCustomizationMap(null);
    const parsed = JSON.parse(raw) as Partial<Record<ThermalDocumentType, Partial<ThermalTemplateCustomization>>>;
    return sanitizeCustomizationMap(parsed);
  } catch {
    return sanitizeCustomizationMap(null);
  }
};

export const saveThermalTemplateCustomization = (
  companyId: string | null | undefined,
  type: ThermalDocumentType,
  patch: Partial<ThermalTemplateCustomization>
): ThermalTemplateCustomizationMap => {
  const current = loadThermalTemplateCustomizations(companyId);
  const next = sanitizeCustomizationMap({
    ...current,
    [type]: {
      ...current[type],
      ...patch
    }
  });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(customStorageKey(companyId), JSON.stringify(next));
  }
  return next;
};

export const getThermalTemplateCustomization = (
  companyId: string | null | undefined,
  type: ThermalDocumentType
): ThermalTemplateCustomization => loadThermalTemplateCustomizations(companyId)[type];

export const getSelectedThermalTemplate = (
  companyId: string | null | undefined,
  type: ThermalDocumentType
): ThermalTemplateOption => {
  const prefs = loadThermalTemplatePreferences(companyId);
  const selectedId = prefs[type];
  return (
    TEMPLATE_OPTIONS.find(option => option.id === selectedId && option.type === type)
    || TEMPLATE_OPTIONS.find(option => option.type === type)
    || TEMPLATE_OPTIONS[0]
  );
};

export const buildThermalTemplatePreview = (args: {
  type: ThermalDocumentType;
  template: ThermalTemplateOption;
  customization: ThermalTemplateCustomization;
  isEnglish?: boolean;
  companyName?: string;
}) => {
  const { type, template, customization, isEnglish = false, companyName } = args;
  const t = (ar: string, en: string) => (isEnglish ? en : ar);
  const header = customization.headerText || companyName || t('اسم الشركة', 'Company Name');
  const compactLimit = clamp(customization.compactMaxItems, 3, 20);
  const sampleItems = [
    t('1. [ITM-001] صنف رئيسي x2 @ 50 = 100', '1. [ITM-001] Main Item x2 @ 50 = 100'),
    t('2. [ITM-002] صنف إضافي x1 @ 25 = 25', '2. [ITM-002] Extra Item x1 @ 25 = 25'),
    t('3. [ITM-003] منتج ثالث x1 @ 10 = 10', '3. [ITM-003] Third Product x1 @ 10 = 10')
  ];
  const sampleVoucherLines = [
    t('1. دفعة مقدمة | الصندوق | 200.00', '1. Advance payment | Cash | 200.00'),
    t('2. تسوية رصيد | الذمم | 150.00', '2. Balance settlement | A/R | 150.00'),
    t('3. رسوم خدمة | إيراد خدمة | 25.00', '3. Service charge | Service income | 25.00')
  ];

  const baseLines = [
    header,
    `${t('المستند', 'Document')}: ${type === 'INVOICE' ? t('فاتورة', 'Invoice') : type === 'VOUCHER' ? t('سند', 'Voucher') : t('إيصال قبض', 'Receipt')} (${template.style === 'COMPACT' ? t('مختصر', 'Compact') : t('قياسي', 'Standard')})`,
    `${t('التاريخ', 'Date')}: 2026-02-27`,
    `${t('العميل/الطرف', 'Customer/Party')}: ${t('عميل تجريبي', 'Demo Customer')}`,
    '----------------------------------------'
  ];

  const lines = [...baseLines];
  if (type === 'INVOICE') {
    const renderedItems = (template.style === 'COMPACT' ? sampleItems.slice(0, compactLimit) : sampleItems)
      .map(line => (template.style === 'COMPACT' ? line.replace(/ x.+ = /, ' = ') : line));
    lines.push(...renderedItems);
    if (template.style === 'COMPACT' && sampleItems.length > renderedItems.length) {
      lines.push(`... ${t('بنود إضافية', 'More items')}: ${sampleItems.length - renderedItems.length}`);
    }
    lines.push('----------------------------------------');
    lines.push(`${t('الإجمالي قبل الضريبة', 'Subtotal')}: 125.00`);
    lines.push(`${t('الضريبة', 'Tax')}: 10.00`);
    lines.push(`${t('الإجمالي', 'Total')}: 135.00`);
  } else {
    const renderedLines = template.style === 'COMPACT' ? sampleVoucherLines.slice(0, compactLimit) : sampleVoucherLines;
    lines.push(...renderedLines);
    if (template.style === 'COMPACT' && sampleVoucherLines.length > renderedLines.length) {
      lines.push(`... ${t('بنود إضافية', 'More lines')}: ${sampleVoucherLines.length - renderedLines.length}`);
    }
    lines.push('----------------------------------------');
    lines.push(`${t('الإجمالي', 'Total')}: 375.00`);
  }

  if (customization.footerText) {
    lines.push(customization.footerText);
  }
  if (customization.showPrintedAt) {
    lines.push(`${t('تاريخ الطباعة', 'Printed')}: 2026-02-27 18:30`);
  }

  return lines.filter(Boolean);
};
