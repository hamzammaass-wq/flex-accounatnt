import { Account, Contact, Currency, FixedAssetGroup, ItemGroup, Product, UnitOfMeasure, Warehouse } from '../types';

const accountNameEn: Record<string, string> = {
  acc_assets: 'Assets',
  acc_current_assets: 'Current Assets',
  acc_cash_root: 'Cash in Hand',
  acc_cash: 'Main Cashbox',
  acc_bank_root: 'Cash at Banks (Current Accounts)',
  acc_bank_local: 'Local Bank - ILS Current',
  acc_bank_usd: 'USD Investment Bank',
  acc_receivable_group: 'Accounts Receivable (Customers)',
  acc_receivable: 'Trade Receivables',
  acc_notes_receivable: 'Notes Receivable (Incoming Checks)',
  acc_cheques_hand: 'Checks on Hand',
  acc_cheques_under_collection: 'Checks Under Collection',
  acc_inventory_group: 'Inventory',
  acc_inventory: 'Merchandise Inventory',
  acc_fixed_assets_root: 'Fixed Assets',
  acc_furniture: 'Furniture and Fixtures',
  acc_equipment: 'Electronic Equipment',
  acc_buildings: 'Buildings and Facilities',
  acc_machinery: 'Machinery and Equipment',
  acc_vehicles: 'Vehicles and Transportation',
  acc_accumulated_depreciation: 'Accumulated Depreciation',
  acc_liabilities: 'Liabilities',
  acc_current_liabilities: 'Current Liabilities',
  acc_long_term_liabilities: 'Long-term Liabilities',
  acc_payable: 'Trade Payables',
  acc_notes_payable: 'Notes Payable (Issued Checks)',
  acc_accrued_salaries: 'Employees Payable',
  acc_vat_payable: 'VAT Payable',
  acc_equity_root: 'Equity',
  acc_capital: 'Paid-in Capital',
  acc_retained_earnings: 'Retained Earnings',
  acc_revenue_root: 'Revenue',
  acc_sales: 'Sales Revenue',
  acc_sales_returns: 'Sales Returns',
  acc_gain_asset_disposal: 'Gain on Asset Disposal',
  acc_service_income: 'Service Revenue',
  acc_expense_root: 'Expenses',
  acc_cogs: 'Cost of Goods Sold',
  acc_purchases: 'Purchases',
  acc_purchase_returns: 'Purchase Returns',
  acc_admin_exp: 'General and Administrative Expenses',
  acc_exp_salaries: 'Direct Salaries and Wages',
  acc_exp_rent: 'Office and Branch Rent',
  acc_exp_utilities: 'Utilities (Electricity and Water)',
  acc_exp_marketing: 'Marketing and Advertising Expenses',
  acc_exp_maintenance: 'Maintenance Expenses',
  acc_bank_fees: 'Bank Fees and Charges',
  acc_depreciation_exp: 'Depreciation Expense',
  acc_exchange_diff: 'Currency Exchange Differences',
  acc_loss_asset_disposal: 'Loss on Asset Disposal',
  acc_direct_labor: 'Direct Labor (Manufacturing)',
  acc_manufacturing_overhead: 'Manufacturing Overhead'
};

const accountNameEnByCode: Record<string, string> = {
  '1': 'Assets',
  '11': 'Current Assets',
  '111': 'Cash in Hand',
  '11101': 'Main Cashbox',
  '112': 'Cash at Banks (Current Accounts)',
  '11201': 'Local Bank - ILS Current',
  '11202': 'USD Investment Bank',
  '113': 'Accounts Receivable (Customers)',
  '11301': 'Trade Receivables',
  '114': 'Notes Receivable (Incoming Checks)',
  '11401': 'Checks on Hand',
  '11402': 'Checks Under Collection',
  '115': 'Inventory',
  '11501': 'Merchandise Inventory',
  '12': 'Fixed Assets',
  '121': 'Furniture and Fixtures',
  '122': 'Electronic Equipment',
  '123': 'Buildings and Facilities',
  '124': 'Machinery and Equipment',
  '125': 'Vehicles and Transportation',
  '129': 'Accumulated Depreciation',
  '2': 'Liabilities',
  '21': 'Current Liabilities',
  '22': 'Long-term Liabilities',
  '211': 'Trade Payables',
  '212': 'Notes Payable (Issued Checks)',
  '213': 'Employees Payable',
  '221': 'VAT Payable',
  '3': 'Equity',
  '31': 'Paid-in Capital',
  '32': 'Retained Earnings',
  '4': 'Revenue',
  '41': 'Sales Revenue',
  '42': 'Service Revenue',
  '43': 'Sales Returns',
  '45': 'Gain on Asset Disposal',
  '5': 'Expenses',
  '51': 'Cost of Goods Sold',
  '511': 'Purchases',
  '512': 'Purchase Returns',
  '52': 'General and Administrative Expenses',
  '521': 'Direct Salaries and Wages',
  '522': 'Office and Branch Rent',
  '523': 'Utilities (Electricity and Water)',
  '524': 'Marketing and Advertising Expenses',
  '525': 'Maintenance Expenses',
  '53': 'Bank Fees and Charges',
  '54': 'Depreciation Expense',
  '55': 'Currency Exchange Differences',
  '56': 'Loss on Asset Disposal',
  '513': 'Direct Labor (Manufacturing)',
  '514': 'Manufacturing Overhead'
};

const accountNameEnByArabic: Record<string, string> = {
  'الأصول': 'Assets',
  'الأصول المتداولة': 'Current Assets',
  'نقدية بالصناديق (الخزائن)': 'Cash in Hand',
  'الصندوق الرئيسي': 'Main Cashbox',
  'نقدية بالبنوك (حسابات جارية)': 'Cash at Banks (Current Accounts)',
  'البنك المحلي - جاري شيكل': 'Local Bank - ILS Current',
  'بنك الدولار الاستثماري': 'USD Investment Bank',
  'الذمم المدينة (العملاء)': 'Accounts Receivable (Customers)',
  'ذمم العملاء التجارية': 'Trade Receivables',
  'أوراق القبض (شيكات واردة)': 'Notes Receivable (Incoming Checks)',
  'شيكات برسم التحصيل': 'Checks on Hand',
  'المخزون': 'Inventory',
  'مخزون البضائع': 'Merchandise Inventory',
  'الأصول الثابتة': 'Fixed Assets',
  'أثاث ومفروشات': 'Furniture and Fixtures',
  'أجهزة ومعدات إلكترونية': 'Electronic Equipment',
  'مباني ومنشآت': 'Buildings and Facilities',
  'آلات ومعدات': 'Machinery and Equipment',
  'سيارات ووسائل نقل': 'Vehicles and Transportation',
  'مجمع إهلاك الأصول': 'Accumulated Depreciation',
  'الخصوم (الالتزامات)': 'Liabilities',
  'الالتزامات المتداولة': 'Current Liabilities',
  'ذمم الموردين التجارية': 'Trade Payables',
  'أوراق الدفع (شيكات صادرة)': 'Notes Payable (Issued Checks)',
  'ذمم موظفين': 'Employees Payable',
  'ضريبة القيمة المضافة': 'VAT Payable',
  'حقوق الملكية': 'Equity',
  'رأس المال المدفوع': 'Paid-in Capital',
  'الأرباح المبقاة': 'Retained Earnings',
  'الإيرادات': 'Revenue',
  'إيرادات المبيعات': 'Sales Revenue',
  'مرتجع المبيعات': 'Sales Returns',
  'إيرادات الخدمات': 'Service Revenue',
  'المصروفات': 'Expenses',
  'تكلفة البضاعة المباعة': 'Cost of Goods Sold',
  'المشتريات': 'Purchases',
  'مردودات المشتريات': 'Purchase Returns',
  'مصاريف إدارية وعمومية': 'General and Administrative Expenses',
  'الرواتب والأجور المباشرة': 'Direct Salaries and Wages',
  'إيجار المكاتب والفروع': 'Office and Branch Rent',
  'خدمات (كهرباء ومياه)': 'Utilities (Electricity and Water)',
  'مصاريف تسويق وإعلان': 'Marketing and Advertising Expenses',
  'مصاريف صيانة': 'Maintenance Expenses',
  'مصاريف وعمولات بنكية': 'Bank Fees and Charges',
  'مصروف الإهلاك': 'Depreciation Expense',
  'فروقات أسعار العملات': 'Currency Exchange Differences',
  'أجور عمالة مباشرة (صناعية)': 'Direct Labor (Manufacturing)',
  'ت. صناعية غير مباشرة (محملة)': 'Manufacturing Overhead'
};

Object.assign(accountNameEnByArabic, {
  'الأصول': 'Assets',
  'الأصول المتداولة': 'Current Assets',
  'نقدية بالصناديق (الخزائن)': 'Cash in Hand',
  'الصندوق الرئيسي': 'Main Cashbox',
  'نقدية بالبنوك (حسابات جارية)': 'Cash at Banks (Current Accounts)',
  'البنك المحلي - جاري شيكل': 'Local Bank - ILS Current',
  'بنك الدولار الاستثماري': 'USD Investment Bank',
  'الذمم المدينة (العملاء)': 'Accounts Receivable (Customers)',
  'ذمم العملاء التجارية': 'Trade Receivables',
  'أوراق القبض (شيكات واردة)': 'Notes Receivable (Incoming Checks)',
  'شيكات برسم التحصيل': 'Checks on Hand',
  'المخزون': 'Inventory',
  'مخزون البضائع': 'Merchandise Inventory',
  'الأصول الثابتة': 'Fixed Assets',
  'الأثاث والمفروشات': 'Furniture and Fixtures',
  'أجهزة ومعدات إلكترونية': 'Electronic Equipment',
  'مباني ومنشآت': 'Buildings and Facilities',
  'آلات ومعدات': 'Machinery and Equipment',
  'سيارات ووسائل نقل': 'Vehicles and Transportation',
  'مجمع إهلاك الأصول': 'Accumulated Depreciation',
  'الخصوم (الالتزامات)': 'Liabilities',
  'الالتزامات المتداولة': 'Current Liabilities',
  'ذمم الموردين التجارية': 'Trade Payables',
  'أوراق الدفع (شيكات صادرة)': 'Notes Payable (Issued Checks)',
  'ذمم موظفين': 'Employees Payable',
  'ضريبة القيمة المضافة': 'VAT Payable',
  'حقوق الملكية': 'Equity',
  'رأس المال المدفوع': 'Paid-in Capital',
  'الأرباح المبقاة': 'Retained Earnings',
  'الأرباح غير الموزعة': 'Retained Earnings',
  'الإيرادات': 'Revenue',
  'إيرادات المبيعات': 'Sales Revenue',
  'مرتجع المبيعات': 'Sales Returns',
  'إيرادات الخدمات': 'Service Revenue',
  'المصروفات': 'Expenses',
  'تكلفة البضاعة المباعة': 'Cost of Goods Sold',
  'المشتريات': 'Purchases',
  'مردودات المشتريات': 'Purchase Returns',
  'مصاريف إدارية وعمومية': 'General and Administrative Expenses',
  'الرواتب والأجور المباشرة': 'Direct Salaries and Wages',
  'إيجار المكاتب والفروع': 'Office and Branch Rent',
  'خدمات (كهرباء ومياه)': 'Utilities (Electricity and Water)',
  'مصاريف تسويق وإعلان': 'Marketing and Advertising Expenses',
  'مصاريف صيانة': 'Maintenance Expenses',
  'مصاريف وعمولات بنكية': 'Bank Fees and Charges',
  'مصروف الإهلاك': 'Depreciation Expense',
  'فروقات أسعار العملات': 'Currency Exchange Differences',
  'أجور عمالة مباشرة (صناعية)': 'Direct Labor (Manufacturing)',
  'ت. صناعية غير مباشرة (محملة)': 'Manufacturing Overhead',
  'حسابات الشركاء': 'Partners Accounts',
  'رأس مال الشركاء': 'Partners Capital',
  'جاري الشركاء': 'Partners Current',
  'مسحوبات الشركاء': 'Partners Drawings',
  'توزيع الأرباح': 'Profit Distribution'
});

const currencyNameEnByCode: Record<string, string> = {
  ILS: 'Israeli Shekel',
  SAR: 'Saudi Riyal',
  USD: 'US Dollar',
  EUR: 'Euro'
};

const contactNameEn: Record<string, string> = {
  cash_customer: 'Cash Customer',
  cash_supplier: 'Cash Customer',
  c1: 'Modern Supply Company',
  c2: 'Success Trading Establishment'
};

const contactNameEnByArabic: Record<string, string> = {
  'عميل نقدي': 'Cash Customer',
  'مورد نقدي': 'Cash Customer',
  'شركة التوريدات الحديثة': 'Modern Supply Company',
  'مؤسسة النجاح التجارية': 'Success Trading Establishment'
};

Object.assign(contactNameEnByArabic, {
  'عميل نقدي': 'Cash Customer',
  'مورد نقدي': 'Cash Customer',
  'شركة التوريدات الحديثة': 'Modern Supply Company',
  'مؤسسة النجاح التجارية': 'Success Trading Establishment'
});

const productNameEn: Record<string, string> = {
  p1: 'Laptop Computer i7',
  p2: 'LED Monitor 27"',
  p3: 'Color Laser Printer',
  p4: 'Ergonomic Office Chair'
};

const productNameEnByArabic: Record<string, string> = {
  'جهاز كمبيوتر محمول i7': 'Laptop Computer i7',
  'شاشة LED 27 بوصة': 'LED Monitor 27"',
  'طابعة ليزر ملونة': 'Color Laser Printer',
  'كرسي مكتب مريح': 'Ergonomic Office Chair'
};

Object.assign(productNameEnByArabic, {
  'جهاز كمبيوتر محمول i7': 'Laptop Computer i7',
  'شاشة LED 27 بوصة': 'LED Monitor 27"',
  'طابعة ليزر ملونة': 'Color Laser Printer',
  'كرسي مكتب مريح': 'Ergonomic Office Chair'
});

const itemGroupNameEn: Record<string, string> = {
  ig_electronics: 'Electronics',
  ig_furniture: 'Office Furniture',
  ig_other: 'Other'
};

const itemGroupNameEnByArabic: Record<string, string> = {
  'إلكترونيات': 'Electronics',
  'أثاث مكتبي': 'Office Furniture',
  'أخرى': 'Other'
};

Object.assign(itemGroupNameEnByArabic, {
  'إلكترونيات': 'Electronics',
  'أثاث مكتبي': 'Office Furniture',
  'أخرى': 'Other'
});

const unitNameEn: Record<string, string> = {
  u_pc: 'Piece',
  u_box: 'Box',
  u_ctn: 'Carton',
  u_kg: 'Kilogram',
  u_m: 'Meter',
  u_cup: 'Cup'
};

const unitNameEnByArabic: Record<string, string> = {
  'قطعة': 'Piece',
  'علبة': 'Box',
  'كرتون': 'Carton',
  'كيلو': 'Kilogram',
  'متر': 'Meter',
  'كوب': 'Cup'
};

Object.assign(unitNameEnByArabic, {
  'قطعة': 'Piece',
  'علبة': 'Box',
  'كرتون': 'Carton',
  'كيلو': 'Kilogram',
  'متر': 'Meter',
  'كوب': 'Cup'
});

const warehouseNameEn: Record<string, string> = {
  wh_main: 'Main Warehouse',
  wh_branch: 'Main Branch Warehouse'
};

const warehouseNameEnByArabic: Record<string, string> = {
  'المستودع الرئيسي': 'Main Warehouse'
};

Object.assign(warehouseNameEnByArabic, {
  'المستودع الرئيسي': 'Main Warehouse'
});

const warehouseLocationEn: Record<string, string> = {
  wh_main: 'Head Office',
  wh_branch: 'North branch'
};

const warehouseLocationEnByArabic: Record<string, string> = {
  'المقر الرئيسي': 'Head Office'
};

Object.assign(warehouseLocationEnByArabic, {
  'المقر الرئيسي': 'Head Office'
});

const assetGroupNameEn: Record<string, string> = {
  ag_buildings: 'Buildings and Facilities',
  ag_machinery: 'Machinery and Equipment',
  ag_furniture: 'Furniture and Office',
  ag_vehicles: 'Vehicles and Transportation',
  ag_computers: 'Computers and Software'
};

const assetGroupNameEnByArabic: Record<string, string> = {
  'مباني ومنشآت': 'Buildings and Facilities',
  'آلات ومعدات': 'Machinery and Equipment',
  'أثاث ومكتبية': 'Office Furniture and Fixtures',
  'سيارات ووسائل نقل': 'Vehicles and Transportation',
  'أجهزة حاسب وبرامج': 'Computers and Software'
};

Object.assign(assetGroupNameEnByArabic, {
  'مباني ومنشآت': 'Buildings and Facilities',
  'آلات ومعدات': 'Machinery and Equipment',
  'أثاث ومكتبية': 'Office Furniture and Fixtures',
  'سيارات ووسائل نقل': 'Vehicles and Transportation',
  'أجهزة حاسب وبرامج': 'Computers and Software'
});

const normalizeLabel = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeCode = (value: string): string => {
  const normalized = normalizeLabel(String(value || ''));
  if (!normalized) return '';
  const exactDigits = normalized.match(/^(\d{1,12})$/);
  if (exactDigits) return exactDigits[1];
  const leadingDigits = normalized.match(/^(\d{1,12})/);
  if (leadingDigits) return leadingDigits[1];
  return normalized;
};

const stripKnownSuffix = (value: string): string =>
  normalizeLabel(
    value
      .replace(/\s*\((Main|Branch|رئيسي|فرعي)\)\s*$/i, '')
      .replace(/\s*[-–—]\s*(Main|Branch)\s*$/i, '')
  );

const splitLeadingCode = (value: string): { code?: string; name: string } => {
  const match = value.match(/^(\d{1,12})\s*[-–—:/]\s*(.+)$/);
  if (!match) return { name: value };
  return { code: match[1], name: normalizeLabel(match[2]) };
};

const splitLeadingOrdinal = (value: string): { prefix?: string; name: string } => {
  const match = value.match(/^(\d{1,6})\s+(.+)$/);
  if (!match) return { name: value };
  return { prefix: `${match[1]} `, name: normalizeLabel(match[2]) };
};

const splitCurrencySuffix = (value: string): { name: string; suffix: string } => {
  const match = value.match(/^(.*?)(\s*\(([A-Za-z]{3})\))$/);
  if (!match) return { name: value, suffix: '' };
  return { name: normalizeLabel(match[1]), suffix: ` (${match[3].toUpperCase()})` };
};

const ARABIC_CHAR_RE = /[\u0600-\u06FF]/;
const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670]/g;
const ARABIC_TATWEEL_RE = /\u0640/g;

const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  '\u0627': 'a',
  '\u0623': 'a',
  '\u0625': 'i',
  '\u0622': 'a',
  '\u0628': 'b',
  '\u062A': 't',
  '\u062B': 'th',
  '\u062C': 'j',
  '\u062D': 'h',
  '\u062E': 'kh',
  '\u062F': 'd',
  '\u0630': 'dh',
  '\u0631': 'r',
  '\u0632': 'z',
  '\u0633': 's',
  '\u0634': 'sh',
  '\u0635': 's',
  '\u0636': 'd',
  '\u0637': 't',
  '\u0638': 'z',
  '\u0639': 'a',
  '\u063A': 'gh',
  '\u0641': 'f',
  '\u0642': 'q',
  '\u0643': 'k',
  '\u0644': 'l',
  '\u0645': 'm',
  '\u0646': 'n',
  '\u0647': 'h',
  '\u0648': 'w',
  '\u064A': 'y',
  '\u0649': 'a',
  '\u0629': 'h',
  '\u0624': 'w',
  '\u0626': 'y',
  '\u0621': '',
  '\u0671': 'a',
  '\u067E': 'p',
  '\u0686': 'ch',
  '\u06A4': 'v',
  '\u06AF': 'g'
};

const toTitleCaseLatin = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());

const transliterateArabicText = (value: string): string => {
  const normalized = normalizeLabel(value || '')
    .replace(ARABIC_DIACRITICS_RE, '')
    .replace(ARABIC_TATWEEL_RE, '');
  if (!normalized) return '';

  let result = '';
  for (const char of normalized) {
    result += ARABIC_TO_LATIN_MAP[char] ?? char;
  }

  return normalizeLabel(
    result
      .replace(/[\u0600-\u06FF]/g, '')
      .replace(/\s*-\s*/g, ' - ')
  );
};

const normalizePartnerSuffix = (value: string): string => {
  const cleaned = normalizeLabel(
    String(value || '')
      .replace(/^[-:]+/, '')
      .replace(/^\u0627\u0644\u0634\u0631\u064A\u0643\b\s*/u, '')
      .replace(/^\u0627\u0644\u0634\u0631\u0643\u0627\u0621\b\s*/u, '')
  );
  if (!cleaned) return '';
  if (!ARABIC_CHAR_RE.test(cleaned)) return cleaned;
  return toTitleCaseLatin(transliterateArabicText(cleaned));
};

const fallbackTranslateArabicAccountName = (value: string, normalizedCode: string): string | undefined => {
  const normalized = normalizeLabel(value || '');
  if (!normalized) return undefined;

  const prefixed = splitLeadingCode(normalized);
  const core = normalizeLabel(prefixed.name || normalized);

  if (normalizedCode === '33') return 'Partners Accounts';
  if (normalizedCode === '34') return 'Profit Distribution';
  if (normalizedCode === '35') return 'Equity Settlements';

  if (normalizedCode.startsWith('331')) {
    const match = core.match(/^(?:\u0631\u0623\u0633\s*\u0645\u0627\u0644(?:\s+\u0627\u0644\u0634\u0631\u064A\u0643|\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621)?)(?:\s*[-:]\s*)?(.*)$/u);
    if (match) {
      const suffix = normalizePartnerSuffix(match[1] || '');
      return suffix ? `${suffix} Capital` : 'Partners Capital';
    }
    if (ARABIC_CHAR_RE.test(core)) return 'Partners Capital';
    return undefined;
  }

  if (normalizedCode.startsWith('332')) {
    const match = core.match(/^(?:\u062C\u0627\u0631\u064A(?:\s+\u0627\u0644\u0634\u0631\u064A\u0643|\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621)?)(?:\s*[-:]\s*)?(.*)$/u);
    if (match) {
      const suffix = normalizePartnerSuffix(match[1] || '');
      return suffix ? `${suffix} Current` : 'Partners Current';
    }
    if (ARABIC_CHAR_RE.test(core)) return 'Partners Current';
    return undefined;
  }

  if (normalizedCode.startsWith('333')) {
    const match = core.match(/^(?:\u0645\u0633\u062D\u0648\u0628\u0627\u062A(?:\s+\u0627\u0644\u0634\u0631\u064A\u0643|\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621)?)(?:\s*[-:]\s*)?(.*)$/u);
    if (match) {
      const suffix = normalizePartnerSuffix(match[1] || '');
      return suffix ? `${suffix} Drawings` : 'Partners Drawings';
    }
    if (ARABIC_CHAR_RE.test(core)) return 'Partners Drawings';
    return undefined;
  }

  const directArabicDictionary: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /^\u062D\u0642\u0648\u0642\s+\u0627\u0644\u0645\u0644\u0643\u064A\u0629$/u, value: 'Equity' },
    { pattern: /^\u062D\u0633\u0627\u0628\u0627\u062A\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621$/u, value: 'Partners Accounts' },
    { pattern: /^\u0631\u0623\u0633\s*\u0645\u0627\u0644\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621$/u, value: 'Partners Capital' },
    { pattern: /^\u062C\u0627\u0631\u064A\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621$/u, value: 'Partners Current' },
    { pattern: /^\u0645\u0633\u062D\u0648\u0628\u0627\u062A\s+\u0627\u0644\u0634\u0631\u0643\u0627\u0621$/u, value: 'Partners Drawings' },
    { pattern: /^\u062A\u0648\u0632\u064A\u0639\s+\u0627\u0644\u0623\u0631\u0628\u0627\u062D$/u, value: 'Profit Distribution' },
    { pattern: /^\u0631\u0623\u0633\s+\u0627\u0644\u0645\u0627\u0644\s+\u0627\u0644\u0645\u062F\u0641\u0648\u0639$/u, value: 'Paid-in Capital' },
    { pattern: /^\u0627\u0644\u0623\u0631\u0628\u0627\u062D\s+\u063A\u064A\u0631\s+\u0627\u0644\u0645\u0648\u0632\u0639\u0629$/u, value: 'Retained Earnings' },
    { pattern: /^\u0627\u0644\u0623\u0631\u0628\u0627\u062D\s+\u0627\u0644\u0645\u0628\u0642\u0627\u0629$/u, value: 'Retained Earnings' },
    { pattern: /^\u0627\u0644\u0628\u0646\u0643\s+\u0627\u0644\u0645\u062D\u0644\u064A\s*-\s*\u062C\u0627\u0631\u064A\s+\u0634\u064A\u0643\u0644$/u, value: 'Local Bank - ILS Current' },
    { pattern: /^\u0628\u0646\u0643\s+\u0627\u0644\u062F\u0648\u0644\u0627\u0631\s+\u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631\u064A$/u, value: 'USD Investment Bank' }
  ];
  for (const entry of directArabicDictionary) {
    if (entry.pattern.test(core)) return entry.value;
  }

  if (!ARABIC_CHAR_RE.test(core)) return undefined;

  const replaced = normalizeLabel(
    core
      .replace(/\u062D\u0642\u0648\u0642\s+\u0627\u0644\u0645\u0644\u0643\u064A\u0629/gu, 'Equity')
      .replace(/\u062D\u0633\u0627\u0628\u0627\u062A/gu, 'Accounts')
      .replace(/\u0627\u0644\u0634\u0631\u0643\u0627\u0621/gu, 'Partners')
      .replace(/\u0627\u0644\u0634\u0631\u064A\u0643/gu, 'Partner')
      .replace(/\u0631\u0623\u0633\s+\u0627\u0644\u0645\u0627\u0644\s+\u0627\u0644\u0645\u062F\u0641\u0648\u0639/gu, 'Paid-in Capital')
      .replace(/\u0631\u0623\u0633\s*\u0645\u0627\u0644/gu, 'Capital')
      .replace(/\u062C\u0627\u0631\u064A/gu, 'Current')
      .replace(/\u0645\u0633\u062D\u0648\u0628\u0627\u062A/gu, 'Drawings')
      .replace(/\u062A\u0648\u0632\u064A\u0639\s+\u0627\u0644\u0623\u0631\u0628\u0627\u062D/gu, 'Profit Distribution')
      .replace(/\u0627\u0644\u0623\u0631\u0628\u0627\u062D\s+\u0627\u0644\u0645\u0628\u0642\u0627\u0629/gu, 'Retained Earnings')
      .replace(/\u0627\u0644\u0623\u0631\u0628\u0627\u062D\s+\u063A\u064A\u0631\s+\u0627\u0644\u0645\u0648\u0632\u0639\u0629/gu, 'Retained Earnings')
      .replace(/\u0627\u0644\u0628\u0646\u0643\s+\u0627\u0644\u0645\u062D\u0644\u064A\s*-\s*\u062C\u0627\u0631\u064A\s+\u0634\u064A\u0643\u0644/gu, 'Local Bank - ILS Current')
      .replace(/\u0628\u0646\u0643\s+\u0627\u0644\u062F\u0648\u0644\u0627\u0631\s+\u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631\u064A/gu, 'USD Investment Bank')
  );

  if (!ARABIC_CHAR_RE.test(replaced)) {
    return replaced;
  }

  const transliterated = toTitleCaseLatin(transliterateArabicText(replaced));
  return transliterated || undefined;
};

const fallbackTranslateArabicLabel = (
  value: string,
  directDictionary: Array<{ pattern: RegExp; value: string }> = []
): string | undefined => {
  const normalized = normalizeLabel(value || '');
  if (!normalized) return undefined;
  for (const entry of directDictionary) {
    if (entry.pattern.test(normalized)) return entry.value;
  }
  if (!ARABIC_CHAR_RE.test(normalized)) return undefined;
  const transliterated = toTitleCaseLatin(transliterateArabicText(normalized));
  return transliterated || undefined;
};

export const getDisplayAccountName = (
  account: (Pick<Account, 'id' | 'name'> & Partial<Pick<Account, 'code'>>) | undefined,
  isEnglish: boolean
): string => {
  if (!account) return '';
  if (!isEnglish) return account.name;

  const rawName = normalizeLabel(account.name || '');
  const { name: noCurrencyName, suffix } = splitCurrencySuffix(rawName);
  const canonicalName = stripKnownSuffix(noCurrencyName);
  const prefixed = splitLeadingCode(canonicalName);
  const normalizedCore = normalizeLabel(prefixed.name);
  const normalizedCode = normalizeCode(String(account.code || prefixed.code || ''));

  let translated =
    accountNameEn[account.id] ||
    (normalizedCode ? accountNameEnByCode[normalizedCode] : undefined) ||
    accountNameEnByArabic[normalizedCore] ||
    accountNameEnByArabic[canonicalName] ||
    accountNameEnByArabic[noCurrencyName] ||
    accountNameEnByArabic[rawName];

  if (!translated) {
    translated =
      fallbackTranslateArabicAccountName(canonicalName, normalizedCode) ||
      fallbackTranslateArabicAccountName(noCurrencyName, normalizedCode) ||
      fallbackTranslateArabicAccountName(rawName, normalizedCode);
  }

  if (!translated) return account.name;

  const preserveCodePrefix = !!prefixed.code && !account.code;
  const rendered = preserveCodePrefix ? `${prefixed.code} - ${translated}` : translated;
  return `${rendered}${suffix}`;
};

export const getDisplayCurrencyName = (
  currency: Pick<Currency, 'code' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!currency) return '';
  if (!isEnglish) return currency.name;
  const code = normalizeLabel(currency.code || '').toUpperCase();
  return currencyNameEnByCode[code] || currency.name;
};

export const getDisplayContactName = (
  contact: Pick<Contact, 'id' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!contact) return '';
  if (!isEnglish) return contact.name;
  const normalizedName = normalizeLabel(contact.name || '');
  return (
    contactNameEn[contact.id] ||
    contactNameEnByArabic[normalizedName] ||
    fallbackTranslateArabicLabel(normalizedName, [
      { pattern: /^\u0639\u0645\u064A\u0644\s+\u0646\u0642\u062F\u064A$/u, value: 'Cash Customer' },
      { pattern: /^\u0645\u0648\u0631\u062F\s+\u0646\u0642\u062F\u064A$/u, value: 'Cash Customer' }
    ]) ||
    contact.name
  );
};

export const getDisplayProductName = (
  product: Pick<Product, 'id' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!product) return '';
  if (!isEnglish) return product.name;

  const rawName = normalizeLabel(product.name || '');
  const direct = productNameEn[product.id] || productNameEnByArabic[rawName];
  if (direct) return direct;

  const prefixed = splitLeadingCode(rawName);
  if (prefixed.code) {
    const translatedCore = productNameEnByArabic[prefixed.name];
    if (translatedCore) return `${prefixed.code} - ${translatedCore}`;
  }

  const ordinal = splitLeadingOrdinal(rawName);
  if (ordinal.prefix) {
    const translatedCore = productNameEnByArabic[ordinal.name];
    if (translatedCore) return `${ordinal.prefix}${translatedCore}`;
  }

  return (
    fallbackTranslateArabicLabel(rawName) ||
    product.name
  );
};

export const getDisplayItemGroupName = (
  group: Pick<ItemGroup, 'id' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!group) return '';
  if (!isEnglish) return group.name;
  const normalizedName = normalizeLabel(group.name || '');
  return itemGroupNameEn[group.id] || itemGroupNameEnByArabic[normalizedName] || fallbackTranslateArabicLabel(normalizedName) || group.name;
};

export const getDisplayUnitName = (
  unit: Pick<UnitOfMeasure, 'id' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!unit) return '';
  if (!isEnglish) return unit.name;
  const normalizedName = normalizeLabel(unit.name || '');
  return unitNameEn[unit.id] || unitNameEnByArabic[normalizedName] || fallbackTranslateArabicLabel(normalizedName) || unit.name;
};

export const getDisplayWarehouseName = (
  warehouse: Pick<Warehouse, 'id' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!warehouse) return '';
  if (!isEnglish) return warehouse.name;
  const normalizedName = stripKnownSuffix(normalizeLabel(warehouse.name || ''));
  return warehouseNameEn[warehouse.id] || warehouseNameEnByArabic[normalizedName] || fallbackTranslateArabicLabel(normalizedName) || warehouse.name;
};

export const getDisplayWarehouseLocation = (
  warehouse: Pick<Warehouse, 'id' | 'location'> | undefined,
  isEnglish: boolean
): string | undefined => {
  if (!warehouse?.location) return warehouse?.location;
  if (!isEnglish) return warehouse.location;
  const normalizedLocation = normalizeLabel(warehouse.location || '');
  return warehouseLocationEn[warehouse.id] || warehouseLocationEnByArabic[normalizedLocation] || fallbackTranslateArabicLabel(normalizedLocation) || warehouse.location;
};

export const getDisplayAssetGroupName = (
  group: Pick<FixedAssetGroup, 'id' | 'name'> | undefined,
  isEnglish: boolean
): string => {
  if (!group) return '';
  if (!isEnglish) return group.name;
  const normalizedName = normalizeLabel(group.name || '');
  return assetGroupNameEn[group.id] || assetGroupNameEnByArabic[normalizedName] || fallbackTranslateArabicLabel(normalizedName) || group.name;
};
