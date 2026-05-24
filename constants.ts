import { CategoryOption } from './types';

export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { id: 'purchase_invoice', name: 'فاتورة مشتريات', icon: '🛒' },
  { id: 'import_expenses', name: 'مصاريف استيراد', icon: '🚢' },
  { id: 'sales_return', name: 'مرتجع مبيعات', icon: '↩️' },
  { id: 'rent', name: 'إيجار', icon: '🏠' },
  { id: 'groceries', name: 'تموين', icon: '🥫' },
  { id: 'utilities', name: 'فواتير', icon: '💡' },
  { id: 'transport', name: 'نقل', icon: '🚗' },
  { id: 'salaries', name: 'رواتب', icon: '👥' },
  { id: 'marketing', name: 'تسويق', icon: '📢' },
  { id: 'maintenance', name: 'صيانة', icon: '🔧' },
  { id: 'other', name: 'أخرى', icon: '🧾' }
];

export const INCOME_CATEGORIES: CategoryOption[] = [
  { id: 'sales_invoice', name: 'فاتورة مبيعات', icon: '🧾' },
  { id: 'purchase_return', name: 'مرتجع مشتريات', icon: '🔄' },
  { id: 'services', name: 'خدمات', icon: '🛠️' },
  { id: 'investments', name: 'استثمارات', icon: '📈' },
  { id: 'freelance', name: 'عمل حر', icon: '💻' },
  { id: 'other_income', name: 'أخرى', icon: '💵' }
];

export const PRODUCT_CATEGORIES = [
  { id: 'electronics', name: 'إلكترونيات', icon: '📱' },
  { id: 'food', name: 'مواد غذائية', icon: '🍽️' },
  { id: 'clothing', name: 'ملابس', icon: '👕' },
  { id: 'household', name: 'أدوات منزلية', icon: '🏠' },
  { id: 'stationery', name: 'قرطاسية', icon: '✏️' },
  { id: 'other', name: 'أخرى', icon: '🧾' }
];
