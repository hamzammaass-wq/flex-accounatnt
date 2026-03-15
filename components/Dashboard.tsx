import React, { useMemo, useState } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import {
  ScrollText,
  Package,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  ShoppingBag,
  LogOut,
  BarChart3,
  FileCheck,
  Wallet,
  Landmark,
  Search,
  X,
  Scale,
  Ship,
  Briefcase,
  LayoutGrid,
  Receipt,
  Sparkles,
  Warehouse,
  AlertTriangle,
  Clock4,
  BadgePercent,
  BellRing,
  Coins,
  Building2,
} from 'lucide-react';
import { TabView } from '../App';
import { TransactionTabType } from './TransactionForm';
import { SettingsMode } from './DefinitionsMenu';
import { DEFAULT_BRAND_LOGO_URL } from '../utils/brandAssets';
import { getDateLocale, getNumberLocale, translate } from '../utils/i18n';
import { buildOperationalAlerts } from '../utils/operationalAlerts';

interface DashboardProps {
  onNavigate: (tab: TabView, formTab?: TransactionTabType, voucherType?: 'RECEIPT' | 'PAYMENT', definitionsMode?: SettingsMode) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { summary, baseCurrency, logout, checks, companySettings, products, invoices, invoiceSettlements } = useAccounting();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchTerm] = useState('');
  const appLanguage = companySettings.language ?? 'AR';
  const tr = (ar: string, en: string) => (appLanguage === 'AR' ? ar : en);
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(appLanguage, key, params);

  const today = new Date();
  const weekdayStr = new Intl.DateTimeFormat(getDateLocale(appLanguage), {
    weekday: 'long',
    numberingSystem: 'latn'
  }).format(today);
  const fullDateStr = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn'
  }).format(today);
  const companyDisplayName = (companySettings.name || '').trim() || tr('الشركة', 'Company');

  const normalizedHeaderLogoUrl = String(companySettings.logoUrl || '').trim();
  const headerUsesProgramLogo = !normalizedHeaderLogoUrl || /\/brand\/aiflex-erp-(?:logo|mark)\.(?:png|svg)$/i.test(normalizedHeaderLogoUrl);
  const headerLogoSrc = headerUsesProgramLogo ? DEFAULT_BRAND_LOGO_URL : normalizedHeaderLogoUrl;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(getNumberLocale(appLanguage), { minimumFractionDigits: 0 }).format(amount);
  };

  const pendingChecksCount = checks.filter(c => c.status === 'PENDING').length;
  const expiryAlertEnabled = companySettings.expiryAlertEnabled ?? true;
  const globalExpiryAlertDays = Number.isFinite(Number(companySettings.expiryAlertDays))
    ? Math.max(0, Math.floor(Number(companySettings.expiryAlertDays)))
    : 30;
  const globalLowStockAlertQtyDefault = Number.isFinite(Number(companySettings.lowStockAlertQtyDefault))
    ? Math.max(0, Math.floor(Number(companySettings.lowStockAlertQtyDefault)))
    : 5;

  const operationalAlerts = useMemo(
    () => buildOperationalAlerts({
      checks,
      products,
      invoices,
      invoiceSettlements,
      bankDiffCount: 0,
      expiryAlertDays: expiryAlertEnabled ? globalExpiryAlertDays : -1,
      lowStockAlertQtyDefault: globalLowStockAlertQtyDefault
    }),
    [checks, products, invoices, invoiceSettlements, expiryAlertEnabled, globalExpiryAlertDays, globalLowStockAlertQtyDefault]
  );

  const alertCards = [
    {
      key: 'checks',
      label: tr('شيكات مستحقة', 'Checks Due'),
      value: operationalAlerts.dueChecks,
      icon: Clock4,
      color: 'text-amber-600',
      bg: 'bg-amber-50'
    },
    {
      key: 'expiry',
      label: tr('أصناف منتهية/قريبة', 'Expiry Items'),
      value: operationalAlerts.expiryItems,
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-rose-50'
    },
    {
      key: 'low-stock',
      label: tr('نواقص المخزون', 'Low Stock'),
      value: operationalAlerts.lowStockItems,
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
  ];
  const visibleAlertsTotal = alertCards.reduce((sum, card) => sum + Math.max(0, Number(card.value) || 0), 0);

  const coreActions = [
    { label: t('dashboard.action.receipt'), icon: <ArrowDownLeft className="w-6 h-6" />, color: 'text-emerald-600', bg: 'bg-emerald-50', action: () => onNavigate('receipts-list') },
    { label: t('dashboard.action.payment'), icon: <ArrowUpRight className="w-6 h-6" />, color: 'text-rose-600', bg: 'bg-rose-50', action: () => onNavigate('payments-list') },
    { label: t('dashboard.action.salesInvoice'), icon: <ScrollText className="w-6 h-6" />, color: 'text-blue-600', bg: 'bg-blue-50', action: () => onNavigate('sales') },
    { label: t('dashboard.action.purchaseInvoice'), icon: <ShoppingBag className="w-6 h-6" />, color: 'text-purple-600', bg: 'bg-purple-50', action: () => onNavigate('purchases') },
    { label: t('dashboard.action.expenses'), icon: <Receipt className="w-6 h-6" />, color: 'text-orange-600', bg: 'bg-orange-50', action: () => onNavigate('purchases-expenses', 'EXPENSES') }
  ];

  const modules = [
    { label: t('dashboard.module.warehouses'), icon: Warehouse, color: 'text-indigo-600', bg: 'bg-indigo-100', action: () => onNavigate('warehouses') },
    { label: t('dashboard.module.inventory'), icon: Package, color: 'text-orange-600', bg: 'bg-orange-100', action: () => onNavigate('products') },
    { label: t('dashboard.module.treasury'), icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-100', action: () => onNavigate('treasury') },
    { label: appLanguage === 'AR' ? 'مطابقة البنك' : 'Bank Reconciliation', icon: Landmark, color: 'text-teal-600', bg: 'bg-teal-100', action: () => onNavigate('bank-reconciliation') },
    { label: t('dashboard.module.assets'), icon: Briefcase, color: 'text-indigo-600', bg: 'bg-indigo-100', action: () => onNavigate('fixed-assets') },
    { label: appLanguage === 'AR' ? 'حقوق الملكية والشركاء' : 'Equity & Partners', icon: Coins, color: 'text-fuchsia-600', bg: 'bg-fuchsia-100', action: () => onNavigate('equity-partners') },
    { label: t('dashboard.module.customers'), icon: Users, color: 'text-blue-600', bg: 'bg-blue-100', action: () => onNavigate('directory') },
    { label: t('dashboard.module.checks'), icon: FileCheck, color: 'text-purple-600', bg: 'bg-purple-100', action: () => onNavigate('checks') },
    { label: appLanguage === 'AR' ? 'التنبيهات' : 'Alerts', icon: BellRing, color: 'text-rose-600', bg: 'bg-rose-100', action: () => onNavigate('alerts') },
    { label: appLanguage === 'AR' ? 'الإشعارات المحاسبية' : 'Adjustment Notices', icon: BadgePercent, color: 'text-emerald-600', bg: 'bg-emerald-100', action: () => onNavigate('notices') },
    { label: t('dashboard.module.imports'), icon: Ship, color: 'text-cyan-600', bg: 'bg-cyan-100', action: () => onNavigate('import-list') },
    { label: t('dashboard.module.journal'), icon: Scale, color: 'text-slate-600', bg: 'bg-slate-200', action: () => onNavigate('journal-list') },
    { label: t('dashboard.module.reports'), icon: BarChart3, color: 'text-violet-600', bg: 'bg-violet-100', action: () => onNavigate('reports') },
    { label: t('dashboard.module.settlements'), icon: Scale, color: 'text-pink-600', bg: 'bg-pink-100', action: () => onNavigate('settlements') },
    { label: t('dashboard.module.settings'), icon: LayoutGrid, color: 'text-gray-600', bg: 'bg-gray-200', action: () => onNavigate('definitions') }
  ];

  return (
    <div className="bg-gray-50 min-h-dvh app-page dashboard-page text-slate-800 font-tajawal" dir={appLanguage === 'AR' ? 'rtl' : 'ltr'}>
      <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100 sticky top-0 z-40">
        <header className="flex justify-between items-center min-h-[3rem]">
          {isSearchOpen ? (
            <div className="flex-1 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={t('dashboard.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full py-3 pr-10 pl-4 bg-gray-50 rounded-2xl border-none shadow-inner text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  autoFocus
                />
                <Search className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 right-3.5" />
              </div>
              <button
                onClick={() => { setIsSearchOpen(false); setSearchTerm(''); }}
                className="p-3 text-gray-400 hover:text-rose-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="relative">
                  {headerLogoSrc ? (
                    <img
                      src={headerLogoSrc}
                      alt={tr('شعار الشركة', 'Company logo')}
                      className={headerUsesProgramLogo
                        ? 'h-11 w-24 sm:w-28 rounded-2xl object-contain bg-white px-2 py-1.5 border border-white shadow-md'
                        : 'w-11 h-11 rounded-full object-contain bg-white p-1.5 border-2 border-white shadow-md'}
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full border-2 border-white shadow-md bg-slate-100 text-slate-600 flex items-center justify-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div>
                  <h1 className="text-sm font-black text-slate-800 leading-tight">
                    {companyDisplayName}
                  </h1>
                  <p className="text-slate-400 text-[10px] font-bold mt-0.5">{weekdayStr} • {fullDateStr}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onNavigate('ai')} className="p-2.5 rounded-xl text-purple-600 bg-purple-50 hover:bg-purple-100 transition-all relative">
                  <Sparkles className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white animate-ping"></span>
                </button>
                <button onClick={() => setIsSearchOpen(true)} className="p-2.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                  <Search className="w-5 h-5" />
                </button>
                <button onClick={logout} className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </header>
      </div>

      <div className="p-4 sm:p-5">
        <div className="dashboard-primary-card bg-slate-900 rounded-[2rem] sm:rounded-[2.8rem] p-5 sm:p-7 shadow-2xl text-white mb-6 sm:mb-8 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-blue-600/20 blur-[60px] rounded-full"></div>
          <div className="absolute left-0 bottom-0 w-24 h-24 bg-emerald-600/20 blur-[50px] rounded-full"></div>

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4 sm:mb-6">
              <div className="flex-1 min-w-0">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('dashboard.unifiedBalance')}</p>
                <h2 className="text-2xl sm:text-3xl font-black dir-ltr tracking-tighter truncate">
                  {formatCurrency(summary.netBalance)} <span className="text-xs text-slate-500 font-bold">{baseCurrency}</span>
                </h2>
              </div>
              <div className="bg-white/10 p-2.5 sm:p-3 rounded-2xl backdrop-blur-md border border-white/5 shrink-0 ms-2">
                <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-4 sm:pt-5 border-t border-white/5">
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                <p className="text-slate-500 text-[9px] font-black uppercase mb-1">{t('dashboard.income')}</p>
                <div className="flex items-center gap-1.5">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-black text-sm dir-ltr text-emerald-400 truncate">{formatCurrency(summary.totalIncome)}</span>
                </div>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                <p className="text-slate-500 text-[9px] font-black uppercase mb-1">{t('dashboard.expense')}</p>
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="font-black text-sm dir-ltr text-rose-400 truncate">{formatCurrency(summary.totalExpense)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 sm:mb-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 sm:mb-4 px-1">{t('dashboard.quickActions')}</h3>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {coreActions.map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="flex flex-col items-center gap-1.5 sm:gap-2 transition-all active:scale-90 group min-h-[56px]"
              >
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-sm border border-white transition-all group-hover:shadow-lg ${item.bg} ${item.color}`}>
                  {item.icon}
                </div>
                <span className="text-[9px] sm:text-[10px] font-black text-slate-600 text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-3 sm:mb-4 px-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{tr('تنبيهات تشغيلية', 'Operational Alerts')}</h3>
            <span className="text-[10px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-600">
              {tr('الإجمالي', 'Total')}: {visibleAlertsTotal}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {alertCards.map(card => (
              <div key={card.key} className="dashboard-block-card bg-white p-3 sm:p-4 rounded-2xl sm:rounded-[1.6rem] shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div className={`p-1.5 sm:p-2 rounded-xl ${card.bg}`}>
                    <card.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${card.color}`} />
                  </div>
                  <span className={`text-base sm:text-lg font-black dir-ltr ${card.value > 0 ? card.color : 'text-gray-400'}`}>{card.value}</span>
                </div>
                <p className="text-[9px] sm:text-[10px] font-black text-gray-500 mt-2 sm:mt-3 leading-tight">{card.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-3 sm:mb-4 px-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('dashboard.modulesCenter')}</h3>
            {pendingChecksCount > 0 && (
              <div className="bg-rose-100 text-rose-600 text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse">
                {t('dashboard.pendingChecks', { count: pendingChecksCount })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
            {modules.map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="dashboard-block-card bg-white p-3 sm:p-4 rounded-2xl sm:rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center gap-2 sm:gap-3 transition-all hover:shadow-md hover:border-blue-100 active:scale-95 text-center min-h-[88px] sm:min-h-[auto]"
              >
                <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl ${item.bg} ${item.color}`}>
                  {React.createElement(item.icon as React.ElementType, { size: 20 })}
                </div>
                <span className="text-[10px] sm:text-[11px] font-black text-slate-700 leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

