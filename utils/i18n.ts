import { CompanySettings } from '../types';

export type AppLanguage = CompanySettings['language'];
type LocaleLanguage = 'ar' | 'en';

const ENGLISH_LANGUAGE_VALUES = new Set([
  'EN',
  'ENGLISH',
  'OTHER'
]);

const messages = {
  "ar": {
    "nav.dashboard": "الرئيسية",
    "nav.treasury": "النقدية",
    "nav.hr": "الموظفين",
    "nav.products": "المخزون",
    "nav.manufacturing": "التصنيع",
    "nav.directory": "العملاء",
    "nav.ai": "المساعد",
    "nav.system": "النظام",
    "settings.title": "الإعدادات",
    "settings.systemManagement": "إدارة النظام",
    "settings.companyData": "بيانات المؤسسة",
    "settings.companyDesc": "الإعدادات الأساسية",
    "settings.treasury": "الخزائن والبنوك",
    "settings.treasuryDesc": "إدارة النقدية",
    "settings.accounts": "دليل الحسابات",
    "settings.accountsDesc": "شجرة الحسابات",
    "settings.itemGroups": "مجموعات الأصناف",
    "settings.itemGroupsDesc": "تصنيف المخزون",
    "settings.units": "وحدات القياس",
    "settings.unitsDesc": "القطع، الكرتون، الكيلو",
    "settings.currency": "العملات",
    "settings.currencyDesc": "أسعار الصرف",
    "settings.assets": "الأصول الثابتة",
    "settings.assetsDesc": "إدارة الأصول",
    "settings.backup": "النسخ الاحتياطي",
    "settings.backupDesc": "تصدير البيانات",
    "settings.language": "اللغة",
    "settings.languageDesc": "العربية / English",
    "settings.taxes": "إعدادات الضرائب",
    "settings.users": "المستخدمين",
    "settings.sync": "المزامنة",
    "settings.companyName": "اسم المؤسسة",
    "settings.taxNumber": "الرقم الضريبي",
    "settings.save": "حفظ",
    "settings.languageField": "Language / اللغة",
    "settings.languageSaved": "تم حفظ اللغة بنجاح",
    "settings.companySaved": "تم حفظ بيانات الشركة بنجاح",
    "settings.optionArabic": "العربية",
    "settings.optionEnglish": "English",
    "settings.optionOther": "لغة أخرى",
    "settings.saveLanguage": "حفظ اللغة",
    "dashboard.search": "بحث سريع عن عملية...",
    "dashboard.hello": "مرحبًا، {{name}}",
    "dashboard.unifiedBalance": "الرصيد الموحد",
    "dashboard.income": "المقبوضات",
    "dashboard.expense": "المصروفات",
    "dashboard.quickActions": "سندات وفواتير سريعة",
    "dashboard.modulesCenter": "مركز النظام والوحدات",
    "dashboard.pendingChecks": "{{count}} شيكات معلقة",
    "dashboard.action.receipt": "سند قبض",
    "dashboard.action.payment": "سند صرف",
    "dashboard.action.salesInvoice": "فاتورة بيع",
    "dashboard.action.purchaseInvoice": "فاتورة شراء",
    "dashboard.action.expenses": "المصاريف",
    "dashboard.module.warehouses": "المستودعات",
    "dashboard.module.inventory": "المخزون",
    "dashboard.module.treasury": "النقدية",
    "dashboard.module.assets": "الأصول",
    "dashboard.module.customers": "العملاء",
    "dashboard.module.checks": "الشيكات",
    "dashboard.module.imports": "الاستيراد",
    "dashboard.module.journal": "القيود",
    "dashboard.module.reports": "التقارير",
    "dashboard.module.settlements": "التسويات",
    "dashboard.module.settings": "الإعدادات",
    "auth.appName": "AIFLEX ERP",
    "auth.tagline": "نظام ERP المتكامل لإدارة أعمالك بذكاء",
    "auth.feature.cash": "إدارة نقدية",
    "auth.feature.reports": "تقارير ذكية",
    "auth.loginTitle": "تسجيل الدخول",
    "auth.loginSubtitle": "ابدأ رحلتك المالية الآمنة معنا اليوم",
    "auth.or": "أو",
    "auth.guestLogin": "الدخول كضيف (نسخة تجريبية)",
    "auth.secure": "بياناتك محمية بتشفير 256-بت"
  },
  "en": {
    "nav.dashboard": "Home",
    "nav.treasury": "Treasury",
    "nav.hr": "HR",
    "nav.products": "Inventory",
    "nav.manufacturing": "Manufacturing",
    "nav.directory": "Directory",
    "nav.ai": "Assistant",
    "nav.system": "System",
    "settings.title": "Settings",
    "settings.systemManagement": "System Management",
    "settings.companyData": "Company Data",
    "settings.companyDesc": "Basic settings",
    "settings.treasury": "Treasury & Banks",
    "settings.treasuryDesc": "Cash management",
    "settings.accounts": "Chart of Accounts",
    "settings.accountsDesc": "Account tree",
    "settings.itemGroups": "Item Groups",
    "settings.itemGroupsDesc": "Inventory classification",
    "settings.units": "Units",
    "settings.unitsDesc": "Piece, carton, kilo",
    "settings.currency": "Currencies",
    "settings.currencyDesc": "Exchange rates",
    "settings.assets": "Fixed Assets",
    "settings.assetsDesc": "Asset management",
    "settings.backup": "Backup",
    "settings.backupDesc": "Export data",
    "settings.language": "Language",
    "settings.languageDesc": "Arabic / English",
    "settings.taxes": "Tax settings",
    "settings.users": "Users",
    "settings.sync": "Sync",
    "settings.companyName": "Company name",
    "settings.taxNumber": "Tax number",
    "settings.save": "Save",
    "settings.languageField": "Language",
    "settings.languageSaved": "Language updated successfully.",
    "settings.companySaved": "Company data saved successfully.",
    "settings.optionArabic": "Arabic",
    "settings.optionEnglish": "English",
    "settings.optionOther": "Other language",
    "settings.saveLanguage": "Save language",
    "dashboard.search": "Quick search...",
    "dashboard.hello": "Hello, {{name}}",
    "dashboard.unifiedBalance": "Unified Balance",
    "dashboard.income": "Income",
    "dashboard.expense": "Expenses",
    "dashboard.quickActions": "Quick Vouchers & Invoices",
    "dashboard.modulesCenter": "System & Modules Center",
    "dashboard.pendingChecks": "{{count}} pending checks",
    "dashboard.action.receipt": "Receipt Voucher",
    "dashboard.action.payment": "Payment Voucher",
    "dashboard.action.salesInvoice": "Sales Invoice",
    "dashboard.action.purchaseInvoice": "Purchase Invoice",
    "dashboard.action.expenses": "Expenses",
    "dashboard.module.warehouses": "Warehouses",
    "dashboard.module.inventory": "Inventory",
    "dashboard.module.treasury": "Treasury",
    "dashboard.module.assets": "Assets",
    "dashboard.module.customers": "Customers",
    "dashboard.module.checks": "Checks",
    "dashboard.module.imports": "Imports",
    "dashboard.module.journal": "Journal",
    "dashboard.module.reports": "Reports",
    "dashboard.module.settlements": "Settlements",
    "dashboard.module.settings": "Settings",
    "auth.appName": "AIFLEX ERP",
    "auth.tagline": "Integrated ERP system to run your business smarter",
    "auth.feature.cash": "Cash Management",
    "auth.feature.reports": "Smart Reports",
    "auth.loginTitle": "Sign In",
    "auth.loginSubtitle": "Start your secure financial journey today",
    "auth.or": "OR",
    "auth.guestLogin": "Continue as Guest (Demo)",
    "auth.secure": "Your data is protected with 256-bit encryption"
  }
} as const;

type TranslationKey = keyof (typeof messages)['ar'];

const interpolate = (template: string, params?: Record<string, string | number>): string => {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ''));
};

export const normalizeAppLanguage = (language: AppLanguage | string | null | undefined): AppLanguage => {
  const normalized = String(language || '').trim().toUpperCase();
  if (normalized === 'AR' || normalized.startsWith('AR-')) return 'AR';
  if (ENGLISH_LANGUAGE_VALUES.has(normalized) || normalized === 'EN' || normalized.startsWith('EN-')) return 'EN';
  return normalized ? 'EN' : 'AR';
};

export const detectPreferredAppLanguage = (
  preferredLanguages?: readonly string[] | string | null
): AppLanguage => {
  const candidates = Array.isArray(preferredLanguages)
    ? preferredLanguages
    : preferredLanguages
      ? [preferredLanguages]
      : typeof navigator !== 'undefined'
        ? navigator.languages
        : [];

  for (const candidate of candidates) {
    const normalized = normalizeAppLanguage(candidate);
    if (normalized === 'AR') return 'AR';
    if (normalized === 'EN') return 'EN';
  }

  return 'EN';
};

export const getLocaleLanguage = (language: AppLanguage): LocaleLanguage => {
  return normalizeAppLanguage(language) === 'AR' ? 'ar' : 'en';
};

export const getDocumentLanguageTag = (language: AppLanguage): string => {
  return normalizeAppLanguage(language) === 'AR' ? 'ar-u-nu-latn' : 'en';
};

export const isRtlLanguage = (language: AppLanguage): boolean => {
  return normalizeAppLanguage(language) === 'AR';
};

export const translate = (
  language: AppLanguage,
  key: TranslationKey,
  params?: Record<string, string | number>
): string => {
  const locale = getLocaleLanguage(language);
  const template = messages[locale][key] ?? messages.ar[key];
  return interpolate(template, params);
};

export const getDateLocale = (language: AppLanguage): string => {
  return normalizeAppLanguage(language) === 'AR' ? 'ar-SA-u-nu-latn' : 'en-US';
};

export const getNumberLocale = (language: AppLanguage): string => {
  return normalizeAppLanguage(language) === 'AR' ? 'ar-SA-u-nu-latn' : 'en-US';
};
