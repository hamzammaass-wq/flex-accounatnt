import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccountingProvider, useAccounting } from './contexts/AccountingContext';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import AIAssistant from './components/AIAssistant';
import Directory from './components/Directory';
import ProductList from './components/ProductList';
import FinancialReports from './components/FinancialReports';
import DefinitionsMenu from './components/DefinitionsMenu';
import SalesInvoiceList from './components/SalesInvoiceList';
import PurchaseInvoiceList from './components/PurchaseInvoiceList';
import PurchasesExpenses from './components/PurchasesExpenses';
import CheckPortfolio from './components/CheckPortfolio';
import TreasuryManager from './components/TreasuryManager';
import VoucherManager from './components/VoucherManager';
import JournalManager from './components/JournalManager';
import ImportManager from './components/ImportManager';
import HRManager from './components/HRManager';
import SettlementManager from './components/SettlementManager';
import EquityPartnersManager from './components/EquityPartnersManager';
import FixedAssetsManager from './components/FixedAssetsManager';
import ManufacturingManager from './components/ManufacturingManager';
import BankReconciliationManager from './components/BankReconciliationManager';
import AdjustmentNoticesManager from './components/AdjustmentNoticesManager';
import NotificationCenterManager from './components/NotificationCenterManager';
import { WarehouseManager } from './components/WarehouseManager';
import type { TransactionTabType } from './components/TransactionForm';
import type { SettingsMode } from './components/DefinitionsMenu';
import AuthScreen from './components/AuthScreen';
import ResponsiveShell from './components/layout/ResponsiveShell';
import ResponsiveOverlay from './components/layout/ResponsiveOverlay';
import useResponsiveMode from './hooks/useResponsiveMode';
import useMobileInteractions from './hooks/useMobileInteractions';
import { LayoutDashboard, Package, Users, Settings, Wallet, Briefcase, Factory, Building2, ChevronDown, Plus, ArrowLeft } from 'lucide-react';
import { getDocumentLanguageTag, isRtlLanguage, translate } from './utils/i18n';
import { applyAppTheme } from './utils/appTheme';
import InitialSetupWizard from './components/InitialSetupWizard';

// Fix: Added 'fixed-assets' to TabView to resolve type mismatch in Dashboard and App components
export type TabView =
  | 'dashboard' | 'list' | 'ai' | 'directory' | 'products'
  | 'reports' | 'definitions' | 'sales' | 'purchases' | 'purchases-expenses'
  | 'checks' | 'treasury' | 'receipts-list' | 'payments-list' | 'journal-list'
  | 'import-list' | 'hr' | 'settlements' | 'fixed-assets' | 'equity-partners' | 'warehouses' | 'manufacturing' | 'bank-reconciliation'
  | 'notices' | 'alerts';

// Fix: Added 'voice-ai' to OverlayView to match updated features
export type OverlayView =
  | 'add-sales' | 'add-purchase' | 'add-expense' | 'add-expense-form' | 'add-voucher-receipt' | 'add-voucher-payment' | 'add-manual-purchase' | 'add-journal' | 'add-import' | 'add-purchase-return' | 'add-sales-return' | 'add-quotation' | 'edit-transaction' | 'voice-ai' | null;

type EditTransactionConfig = {
  mode: TransactionTabType;
  voucherType?: 'RECEIPT' | 'PAYMENT';
  invoiceId?: string;
  voucherId?: string;
  linkedInvoiceId?: string;
};

const GUEST_USER_ID = 'guest_user';
const GUEST_TRIAL_START_KEY = 'al_mohaseb_guest_trial_started_at';
const GUEST_TRIAL_DAYS = 14;
const INITIAL_SETUP_PENDING_KEY = 'al_mohaseb_initial_setup_pending';

const TransactionForm = lazy(() => import('./components/TransactionForm'));
const LiveVoiceAssistant = lazy(() => import('./components/LiveVoiceAssistant'));

const ScreenFallback: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className={`w-full ${compact ? 'py-6' : 'py-12'} flex items-center justify-center`}>
    <div className="min-w-[160px] rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm text-center">
      <div className="mx-auto mb-2 h-2 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
      </div>
      <div className="text-xs font-black text-slate-600">Loading screen...</div>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    companySettings,
    companies,
    currentCompany,
    currentCompanyId,
    trialDaysLeft,
    companyAccessStatus,
    companyAccessDaysLeft,
    companyAccessEndsAt,
    workspaceMaxCompanies,
    workspaceRemainingCompanySlots,
    workspaceCompanyLimitReached,
    switchCompany,
    createCompany
  } = useAccounting();
  const [activeTab, setActiveTab] = useState<TabView>('dashboard');
  const [tabHistory, setTabHistory] = useState<TabView[]>([]);
  const [overlay, setOverlay] = useState<OverlayView>(null);
  const [editTransactionConfig, setEditTransactionConfig] = useState<EditTransactionConfig | null>(null);
  const [initialDefinitionsMode, setInitialDefinitionsMode] = useState<SettingsMode>('MENU');
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [showInitialSetupWizard, setShowInitialSetupWizard] = useState(false);
  const companyMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [companyMenuStyle, setCompanyMenuStyle] = useState<React.CSSProperties | null>(null);
  const darkModeEnabled = Boolean(companySettings.darkModeEnabled);
  const appLanguage = companySettings.language ?? 'AR';
  const rtl = isRtlLanguage(appLanguage);
  const t = (key: Parameters<typeof translate>[1]) => translate(appLanguage, key);
  const { isMobile, isTablet, overlayVariant, shellVariant } = useResponsiveMode();
  const companyAccessSummary = useMemo(() => {
    const endsAtLabel = companyAccessEndsAt
      ? new Date(companyAccessEndsAt).toLocaleDateString('en-GB')
      : '-';

    switch (companyAccessStatus) {
      case 'ACTIVE':
        return {
          statusLabel: appLanguage === 'AR' ? 'مفعل' : 'Active',
          shortLine: appLanguage === 'AR'
            ? `الاشتراك مفعل، المتبقي ${companyAccessDaysLeft} يوم`
            : `Subscription active, ${companyAccessDaysLeft} day(s) left`,
          longLine: appLanguage === 'AR'
            ? `الوصول مفعل حتى ${endsAtLabel}.`
            : `Access is active until ${endsAtLabel}.`,
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-800'
        };
      case 'SUSPENDED':
        return {
          statusLabel: appLanguage === 'AR' ? 'موقوف' : 'Suspended',
          shortLine: appLanguage === 'AR'
            ? 'الوصول موقوف حاليًا'
            : 'Access is currently suspended',
          longLine: appLanguage === 'AR'
            ? 'تم تقييد التعديل والترحيل والطباعة. يمكنك إدارة الاشتراك أو أخذ نسخة احتياطية.'
            : 'Editing, posting, and printing are restricted. You can manage the subscription or run a backup.',
          tone: 'border-rose-200 bg-rose-50 text-rose-800'
        };
      case 'EXPIRED':
        return {
          statusLabel: appLanguage === 'AR' ? 'منتهي' : 'Expired',
          shortLine: appLanguage === 'AR'
            ? 'الاشتراك منتهي'
            : 'Subscription expired',
          longLine: appLanguage === 'AR'
            ? 'يسمح الآن بعرض البيانات والنسخ الاحتياطي وإدارة الاشتراك فقط.'
            : 'Only data viewing, backup, and subscription management are available now.',
          tone: 'border-amber-200 bg-amber-50 text-amber-800'
        };
      default:
        return {
          statusLabel: appLanguage === 'AR' ? 'تجريبي' : 'Trial',
          shortLine: appLanguage === 'AR'
            ? `الفترة التجريبية: ${trialDaysLeft} يوم متبقٍ`
            : `Trial period: ${trialDaysLeft} day(s) left`,
          longLine: appLanguage === 'AR'
            ? `التجربة فعالة حتى ${endsAtLabel}.`
            : `Trial access remains until ${endsAtLabel}.`,
          tone: 'border-sky-200 bg-sky-50 text-sky-800'
        };
    }
  }, [appLanguage, companyAccessDaysLeft, companyAccessEndsAt, companyAccessStatus, trialDaysLeft]);
  const isCompanyAccessRestricted = companyAccessStatus === 'EXPIRED' || companyAccessStatus === 'SUSPENDED';
  const resolveCompanyAccessEndLabel = (company: typeof currentCompany) => {
    if (!company) return '-';
    const targetDate = company.subscriptionStatus === 'TRIAL' ? company.trialEndsAt : company.subscriptionEndsAt;
    if (!targetDate) return '-';
    const parsed = new Date(targetDate);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-GB') : '-';
  };
  const getCompanyStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return appLanguage === 'AR' ? 'مفعل' : 'Active';
      case 'EXPIRED': return appLanguage === 'AR' ? 'منتهي' : 'Expired';
      case 'SUSPENDED': return appLanguage === 'AR' ? 'موقوف' : 'Suspended';
      default: return appLanguage === 'AR' ? 'تجريبي' : 'Trial';
    }
  };
  const guestTrialInfo = useMemo(() => {
    if (!currentUser || currentUser.id !== GUEST_USER_ID) {
      return { expired: false, remainingDays: GUEST_TRIAL_DAYS };
    }

    let trialStartIso = currentUser.guestTrialStartedAt;
    try {
      if (!trialStartIso && typeof window !== 'undefined') {
        trialStartIso = localStorage.getItem(GUEST_TRIAL_START_KEY) || undefined;
      }
    } catch {
      // Ignore storage read failures and fallback to current time.
    }

    const fallbackStart = new Date();
    const parsedStart = trialStartIso ? new Date(trialStartIso) : fallbackStart;
    const validStart = Number.isFinite(parsedStart.getTime()) ? parsedStart : fallbackStart;
    const fallbackEnd = new Date(validStart.getTime() + GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const parsedEnd = currentUser.guestTrialEndsAt ? new Date(currentUser.guestTrialEndsAt) : fallbackEnd;
    const validEnd = Number.isFinite(parsedEnd.getTime()) ? parsedEnd : fallbackEnd;
    const remainingMs = validEnd.getTime() - Date.now();
    return {
      expired: remainingMs <= 0,
      remainingDays: Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
    };
  }, [currentUser]);

  useEffect(() => {
    const htmlLang = getDocumentLanguageTag(appLanguage);
    document.documentElement.lang = htmlLang;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [appLanguage, rtl]);

  useEffect(() => {
    applyAppTheme(darkModeEnabled);
  }, [darkModeEnabled]);

  useEffect(() => {
    if (!currentUser || currentUser.id !== GUEST_USER_ID) return;

    const trialStartIso = currentUser.guestTrialStartedAt || new Date().toISOString();
    const trialStart = new Date(trialStartIso);
    const validStart = Number.isFinite(trialStart.getTime()) ? trialStart : new Date();
    const trialEndIso = currentUser.guestTrialEndsAt
      || new Date(validStart.getTime() + GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    try {
      localStorage.setItem(GUEST_TRIAL_START_KEY, validStart.toISOString());
    } catch {
      // Ignore storage write failures so login flow remains functional.
    }

    if (currentUser.guestTrialStartedAt && currentUser.guestTrialEndsAt) return;
    setCurrentUser(prev => (
      prev && prev.id === GUEST_USER_ID
        ? {
          ...prev,
          guestTrialStartedAt: validStart.toISOString(),
          guestTrialEndsAt: trialEndIso
        }
        : prev
    ));
  }, [currentUser, setCurrentUser]);

  useEffect(() => {
    if (!showCompanyMenu) {
      setCompanyMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const btn = companyMenuButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const safeMargin = 8;
      const width = Math.min(360, Math.floor(viewportW * 0.84));
      const defaultLeft = isMobile
        ? (rect.left + rect.width / 2) - (width / 2)
        : (rtl ? rect.left : rect.right - width);
      const left = Math.max(safeMargin, Math.min(defaultLeft, viewportW - width - safeMargin));

      const estimatedHeight = 320;
      const canOpenBelow = rect.bottom + estimatedHeight + safeMargin <= viewportH;
      const top = canOpenBelow
        ? Math.max(safeMargin, rect.bottom + 8)
        : Math.max(safeMargin, rect.top - estimatedHeight - 8);

      setCompanyMenuStyle({
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 200
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [showCompanyMenu, isMobile, rtl]);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [importDistributionInvoiceId, setImportDistributionInvoiceId] = useState<string | null>(null);

  const handleBackNavigation = () => {
    setShowCompanyMenu(false);
    setTabHistory(history => {
      if (history.length === 0) {
        if (activeTab !== 'dashboard') setActiveTab('dashboard');
        return history;
      }
      const previousTab = history[history.length - 1];
      setActiveTab(previousTab);
      return history.slice(0, -1);
    });
  };

  const canGoBack = activeTab !== 'dashboard';
  const showHeaderBackButton = canGoBack;
  const { swipeHandlers } = useMobileInteractions({
    isMobile,
    rtl,
    canGoBack: currentUser ? canGoBack : false,
    onBack: handleBackNavigation
  });

  if (!currentUser || guestTrialInfo.expired) {
    return <AuthScreen guestTrialExpired={guestTrialInfo.expired} guestTrialDaysLeft={guestTrialInfo.remainingDays} />;
  }

  if (showInitialSetupWizard) {
    return (
      <InitialSetupWizard
        onComplete={() => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(INITIAL_SETUP_PENDING_KEY);
          }
          setShowInitialSetupWizard(false);
        }}
      />
    );
  }

  const handleNavigate = (tab: TabView, definitionsMode?: SettingsMode) => {
    if (definitionsMode) {
      setInitialDefinitionsMode(definitionsMode);
    }
    setActiveTab(prev => {
      if (prev === tab) return prev;
      if (tab === 'dashboard') {
        setTabHistory([]);
        return tab;
      }
      setTabHistory(history => [...history, prev].slice(-40));
      return tab;
    });
    setShowCompanyMenu(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const url = new URL(window.location.href);
    const shouldOpenSubscription = url.searchParams.get('openSubscription') === '1';
    const billingState = url.searchParams.get('billing');
    if (!shouldOpenSubscription && !billingState) return;

    handleNavigate('definitions', 'SUBSCRIPTION');

    if (billingState) {
      window.setTimeout(() => {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }, 0);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.id === GUEST_USER_ID) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(INITIAL_SETUP_PENDING_KEY) === '1') {
      setShowInitialSetupWizard(true);
    }
  }, [currentUser]);

  const openOverlay = (view: OverlayView) => setOverlay(view);
  const openEditTransaction = (config: EditTransactionConfig) => {
    setEditTransactionConfig(config);
    setOverlay('edit-transaction');
  };
  const closeOverlay = () => {
    setOverlay(null);
    setSelectedInvoiceId('');
    setEditTransactionConfig(null);
  };

  const handleSwitchCompany = (companyId: string) => {
    const result = switchCompany(companyId);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setShowCompanyMenu(false);
  };

  const handleCreateCompany = async () => {
    const result = await createCompany({ name: newCompanyName.trim() });
    if (!result.ok) {
      if (result.code === 'SUBSCRIPTION_LIMIT') {
        setShowCompanyMenu(false);
        handleNavigate('definitions', 'SUBSCRIPTION');
      }
      alert(result.message);
      return;
    }
    setNewCompanyName('');
    setShowCompanyMenu(false);
  };

  const companyMenuPanel = showCompanyMenu && companyMenuStyle
    ? createPortal(
      <>
        <button
          type="button"
          aria-label={appLanguage === 'AR' ? 'إغلاق قائمة الشركات' : 'Close company menu'}
          onClick={() => setShowCompanyMenu(false)}
          className="fixed inset-0 z-[190] bg-transparent"
        />
        <div
          style={companyMenuStyle}
          className="rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl space-y-3"
        >
          <div className="text-[10px] font-black text-gray-500">
            {companyAccessSummary.shortLine}
          </div>
          <div className={`rounded-xl border px-3 py-3 ${workspaceCompanyLimitReached ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="text-[10px] font-black text-slate-500">
              {appLanguage === 'AR' ? 'سعات الشركات في الاشتراك' : 'Company slots in subscription'}
            </div>
            <div className="mt-1 text-xs font-black text-slate-800">
              {companies.length}/{workspaceMaxCompanies} {appLanguage === 'AR' ? 'شركة' : 'company slot(s)'}
            </div>
            <div className="mt-1 text-[10px] font-bold text-slate-500">
              {workspaceRemainingCompanySlots > 0
                ? (appLanguage === 'AR'
                  ? `المتبقي ${workspaceRemainingCompanySlots} شركة جديدة.`
                  : `${workspaceRemainingCompanySlots} new company slot(s) remaining.`)
                : (appLanguage === 'AR'
                  ? 'لا توجد سعات إضافية متبقية. يلزمك ترقية الاشتراك.'
                  : 'No additional company slots left. Upgrade the subscription first.')}
            </div>
            {workspaceCompanyLimitReached && (
              <button
                type="button"
                onClick={() => {
                  setShowCompanyMenu(false);
                  handleNavigate('definitions', 'SUBSCRIPTION');
                }}
                className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-black text-white"
              >
                {appLanguage === 'AR' ? 'ترقية / إضافة شركات' : 'Upgrade / add company slots'}
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-auto space-y-1.5">
            {companies.map(company => (
              <button
                key={company.id}
                type="button"
                onClick={() => handleSwitchCompany(company.id)}
                className={`w-full p-3 min-h-[44px] rounded-xl border text-right flex items-center justify-between gap-2 ${company.id === currentCompanyId
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-gray-200 text-slate-700'
                  }`}
              >
                <span className="text-xs font-black truncate">{company.name}</span>
                <span className="text-[10px] font-bold text-gray-400 shrink-0">
                  {appLanguage === 'AR' ? 'الحالة' : 'Status'}: {getCompanyStatusLabel(company.subscriptionStatus)} | {resolveCompanyAccessEndLabel(company)}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <input
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder={appLanguage === 'AR' ? 'اسم شركة جديدة' : 'New company name'}
              className="w-full p-3 min-h-[44px] rounded-xl bg-gray-50 border border-gray-200 outline-none text-base sm:text-sm font-bold"
            />
            <button
              type="button"
              onClick={handleCreateCompany}
              className="w-full p-3 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-black flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {appLanguage === 'AR' ? 'إضافة شركة' : 'Add Company'}
            </button>
          </div>
        </div>
      </>,
      document.body
    )
    : null;

  const renderMainContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onNavigate={(tab, formTab, vType, defMode) => {
        if (tab === 'sales') handleNavigate('sales');
        else if (tab === 'purchases') handleNavigate('purchases');
        else if (tab === 'purchases-expenses') handleNavigate('purchases-expenses');
        else if (formTab === 'SALES') openOverlay('add-sales');
        else if (formTab === 'PURCHASES') openOverlay('add-purchase');
        else if (formTab === 'MANUAL_PURCHASE') handleNavigate('purchases-expenses');
        else if (formTab === 'EXPENSES') openOverlay('add-expense');
        else if (formTab === 'IMPORT_EXPENSES') openOverlay('add-import');
        else if (formTab === 'JOURNAL') handleNavigate('journal-list');
        else if (formTab === 'VOUCHERS') {
          if (vType === 'RECEIPT') openOverlay('add-voucher-receipt');
          else openOverlay('add-voucher-payment');
        }
        // Fix: Added support for navigating to fixed-assets from dashboard actions
        else if (tab === 'fixed-assets') handleNavigate('fixed-assets');
        else handleNavigate(tab, defMode);
      }} />;

      case 'list': return <TransactionList onNavigate={(tab, fTab, vType) => {
        if (fTab === 'JOURNAL') handleNavigate('journal-list');
        else if (fTab === 'VOUCHERS') handleNavigate(vType === 'RECEIPT' ? 'receipts-list' : 'payments-list');
        else handleNavigate(tab);
      }} />;
      case 'journal-list': return <JournalManager
        onAddNew={() => openOverlay('add-journal')}
        onEditJournal={(journalId) => openEditTransaction({ mode: 'JOURNAL', voucherId: journalId })}
      />;
      case 'import-list': return (
        <ImportManager
          onAddNew={() => openOverlay('add-import')}
          initialInvoiceId={importDistributionInvoiceId || undefined}
          autoStartWizard={Boolean(importDistributionInvoiceId)}
          onLaunchConsumed={() => setImportDistributionInvoiceId(null)}
        />
      );
      case 'sales': return <SalesInvoiceList
        onNavigate={(tab, fTab) => {
          if (fTab === 'SALES_RETURN') openOverlay('add-sales-return');
          else if (fTab === 'QUOTATION') openOverlay('add-quotation');
          else openOverlay('add-sales');
        }}
        onEditInvoice={(invoiceId, mode) => openEditTransaction({ mode, invoiceId })}
        onCreateReturn={(id) => {
          setSelectedInvoiceId(id);
          openOverlay('add-sales-return');
        }}
      />;
      case 'purchases': return <PurchaseInvoiceList
        onNavigate={(tab, fTab) => {
          if (fTab === 'PURCHASE_RETURN') openOverlay('add-purchase-return');
          else if (fTab === 'PURCHASES') openOverlay('add-purchase');
          else openOverlay('add-expense');
        }}
        onEditInvoice={(invoiceId, mode) => openEditTransaction({ mode, invoiceId })}
        onAddImportExpense={(id) => {
          setImportDistributionInvoiceId(id);
          handleNavigate('import-list');
        }}
      />;
      case 'purchases-expenses': return <PurchasesExpenses onNavigate={(tab, formTab) => {
        if (formTab === 'MANUAL_PURCHASE') openOverlay('add-manual-purchase');
        else if (formTab === 'PURCHASES') openOverlay('add-purchase');
        else if (formTab === 'EXPENSES') openOverlay('add-expense');
      }} onEditInvoice={(invoiceId, mode) => openEditTransaction({ mode, invoiceId })} />;
      case 'receipts-list': return <VoucherManager type="RECEIPT" onAddNew={() => openOverlay('add-voucher-receipt')} onEditVoucher={(voucherId, voucherType) => openEditTransaction({ mode: 'VOUCHERS', voucherId, voucherType })} />;
      case 'payments-list': return <VoucherManager type="PAYMENT" onAddNew={() => openOverlay('add-voucher-payment')} onEditVoucher={(voucherId, voucherType) => openEditTransaction({ mode: 'VOUCHERS', voucherId, voucherType })} />;
      case 'checks': return <CheckPortfolio />;
      case 'treasury': return <TreasuryManager />;
      case 'bank-reconciliation': return <BankReconciliationManager onBack={() => handleNavigate('dashboard')} />;
      case 'notices': return <AdjustmentNoticesManager />;
      case 'alerts': return <NotificationCenterManager />;
      case 'hr': return <HRManager />;
      // Fix: Added route for FixedAssetsManager
      case 'fixed-assets': return <FixedAssetsManager />;
      case 'equity-partners': return <EquityPartnersManager />;
      case 'warehouses': return <WarehouseManager onBack={() => handleNavigate('dashboard')} />;
      case 'manufacturing': return <ManufacturingManager />;
      case 'settlements': return <SettlementManager onBack={() => handleNavigate('dashboard')} />;
      case 'ai': return <AIAssistant onOpenVoiceAssistant={() => openOverlay('voice-ai')} />;
      case 'directory': return <Directory />;
      case 'products': return <ProductList />;
      case 'reports': return <FinancialReports />;
      case 'definitions': return <DefinitionsMenu initialMode={initialDefinitionsMode} />;
      default: return <Dashboard onNavigate={() => { }} />;
    }
  };

  const renderOverlay = () => {
    if (!overlay) return null;
    if (overlay === 'voice-ai') {
      return <LiveVoiceAssistant onClose={closeOverlay} />;
    }

    const transactionOverlays: OverlayView[] = [
      'add-sales',
      'add-purchase',
      'add-expense',
      'add-expense-form',
      'add-voucher-receipt',
      'add-voucher-payment',
      'add-manual-purchase',
      'add-journal',
      'add-import',
      'add-purchase-return',
      'add-sales-return',
      'add-quotation',
      'edit-transaction'
    ];
    const isTransactionOverlay = transactionOverlays.includes(overlay);
    const isVoucherOverlay =
      overlay === 'add-voucher-receipt'
      || overlay === 'add-voucher-payment'
      || (overlay === 'edit-transaction' && editTransactionConfig?.mode === 'VOUCHERS');
    const resolvedOverlayVariant = isMobile && isTransactionOverlay ? 'fullscreen' : overlayVariant;

    let content = null;
    switch (overlay) {
      case 'add-sales': content = <TransactionForm initialMode="SALES" onBack={closeOverlay} />; break;
      case 'add-purchase': content = <TransactionForm initialMode="PURCHASES" onBack={closeOverlay} />; break;
      case 'add-manual-purchase': content = <TransactionForm initialMode="MANUAL_PURCHASE" onBack={closeOverlay} />; break;
      case 'add-expense': content = <TransactionForm initialMode="EXPENSES" onBack={closeOverlay} />; break;
      case 'add-expense-form': content = <TransactionForm initialMode="EXPENSES" onBack={closeOverlay} />; break;
      case 'add-import': content = <TransactionForm initialMode="IMPORT_EXPENSES" initialCategory="import_expenses" initialVoucherType="PAYMENT" initialLinkedInvoiceId={selectedInvoiceId} onBack={closeOverlay} />; break;
      case 'add-voucher-receipt': content = <TransactionForm initialMode="VOUCHERS" initialVoucherType="RECEIPT" onBack={closeOverlay} />; break;
      case 'add-voucher-payment': content = <TransactionForm initialMode="VOUCHERS" initialVoucherType="PAYMENT" onBack={closeOverlay} />; break;
      case 'add-journal': content = <TransactionForm initialMode="JOURNAL" onBack={closeOverlay} />; break;
      case 'add-purchase-return': content = <TransactionForm initialMode="PURCHASE_RETURN" onBack={closeOverlay} />; break;
      case 'add-sales-return': content = <TransactionForm initialMode="SALES_RETURN" initialLinkedInvoiceId={selectedInvoiceId} onBack={closeOverlay} />; break;
      case 'add-quotation': content = <TransactionForm initialMode="QUOTATION" onBack={closeOverlay} />; break;
      case 'edit-transaction':
        content = editTransactionConfig ? (
          <TransactionForm
            initialMode={editTransactionConfig.mode}
            initialVoucherType={editTransactionConfig.voucherType}
            initialLinkedInvoiceId={editTransactionConfig.linkedInvoiceId}
            initialInvoiceId={editTransactionConfig.invoiceId}
            initialVoucherId={editTransactionConfig.voucherId}
            onBack={closeOverlay}
          />
        ) : null;
        break;
    }

    const panelClassName = resolvedOverlayVariant === 'fullscreen'
      ? isVoucherOverlay && isMobile
        ? 'w-full !max-w-none !rounded-none'
        : 'w-full rounded-none pb-10'
      : resolvedOverlayVariant === 'dialog'
        ? 'w-full rounded-[2.5rem] pb-10'
        : 'w-full rounded-t-[3rem] pb-10';

    return (
      <ResponsiveOverlay
        isOpen={Boolean(overlay)}
        variant={resolvedOverlayVariant}
        zIndexClassName="z-[100]"
        panelClassName={panelClassName}
        showHandle={resolvedOverlayVariant === 'bottom-sheet'}
        keyboardAware
      >
        {content}
      </ResponsiveOverlay>
    );
  };

  return (
    <ResponsiveShell rtl={rtl} shellVariant={shellVariant}>
      <div className="w-full h-full min-h-0 bg-gray-50 overflow-hidden relative">
        <div
          className={`app-main-scroll scroll-smooth transition-all duration-500 ${overlay ? 'scale-[0.985] brightness-90 blur-[1px]' : 'scale-100'}`}
          {...swipeHandlers}
        >
          {!overlay && (
            <div
              className="relative z-[70] px-2 pt-[calc(var(--app-safe-top)+0.35rem)] pb-2 flex"
            >
              <div
                className={`relative w-full max-w-[min(100%,var(--app-content-max-width-tablet-browser))] flex items-center gap-2 ${isMobile ? 'justify-between' : (rtl ? 'justify-start' : 'justify-end')
                  }`}
              >
                {showHeaderBackButton && (
                  <button
                    type="button"
                    onClick={handleBackNavigation}
                    disabled={!canGoBack}
                    className={`app-back-btn min-w-[44px] sm:min-w-[74px] px-2.5 sm:px-3 py-2 rounded-xl border shadow-md inline-flex items-center justify-center gap-1.5 transition shrink-0 ${canGoBack
                      ? 'bg-white/95 backdrop-blur border-gray-200 text-slate-700'
                      : 'bg-white/90 border-gray-200 text-slate-500 cursor-not-allowed'
                      }`}
                    aria-label={appLanguage === 'AR' ? 'رجوع' : 'Back'}
                    title={appLanguage === 'AR' ? 'رجوع' : 'Back'}
                  >
                    <ArrowLeft className={`w-4 h-4 ${rtl ? 'rotate-180' : ''}`} />
                    <span className="hidden sm:inline text-[11px] font-black">{appLanguage === 'AR' ? 'رجوع' : 'Back'}</span>
                  </button>
                )}
                <button
                  ref={companyMenuButtonRef}
                  type="button"
                  onClick={() => setShowCompanyMenu(prev => !prev)}
                  className={`min-w-0 px-3 py-2 rounded-xl bg-white/95 backdrop-blur border border-gray-200 shadow-md flex items-center gap-2 ${showHeaderBackButton ? 'flex-1 max-w-[78vw] sm:max-w-[72vw]' : 'w-full'
                    }`}
                >
                  <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-black text-slate-700 truncate">{currentCompany?.name || companySettings.name}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCompanyMenu ? 'rotate-180' : ''}`} />
                </button>

              </div>
            </div>
          )}

          {!overlay && showCompanyMenu && <div className="h-[320px]" />}

          {!overlay && isCompanyAccessRestricted && (
            <div className={`mb-3 rounded-2xl border px-4 py-4 shadow-sm ${companyAccessSummary.tone}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-black">{appLanguage === 'AR' ? 'الوصول مقيد' : 'Access restricted'}</div>
                  <div className="text-xs font-bold mt-1">{companyAccessSummary.longLine}</div>
                </div>
                <div className="px-3 py-1 rounded-full bg-white/80 text-[11px] font-black">
                  {companyAccessSummary.statusLabel}
                </div>
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleNavigate('definitions', 'SUBSCRIPTION')}
                  className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
                >
                  {appLanguage === 'AR' ? 'إدارة الاشتراك' : 'Manage subscription'}
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('definitions', 'BACKUP')}
                  className="px-3 py-2 rounded-xl bg-white/90 border border-current text-xs font-black"
                >
                  {appLanguage === 'AR' ? 'نسخة احتياطية' : 'Backup'}
                </button>
              </div>
            </div>
          )}

          {renderMainContent()}
        </div>
        {companyMenuPanel}
        {<Suspense fallback={<ScreenFallback compact />}>{renderOverlay()}</Suspense>}

        <nav className={`app-bottom-nav bg-slate-900 border-t border-slate-800 px-2 flex items-center shadow-[0_-4px_10px_rgba(0,0,0,0.2)] text-gray-400 ${isMobile ? 'gap-1 justify-between' : 'justify-between'
          }`}>
          <NavButton
            active={activeTab === 'dashboard'}
            onClick={() => handleNavigate('dashboard')}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label={t('nav.dashboard')}
            tablet={isTablet}
            mobile={isMobile}
          />
          <NavButton
            active={activeTab === 'treasury'}
            onClick={() => handleNavigate('treasury')}
            icon={<Wallet className="w-5 h-5" />}
            label={t('nav.treasury')}
            tablet={isTablet}
            mobile={isMobile}
          />
          <NavButton
            active={activeTab === 'hr'}
            onClick={() => handleNavigate('hr')}
            icon={<Briefcase className="w-5 h-5" />}
            label={t('nav.hr')}
            tablet={isTablet}
            mobile={isMobile}
          />
          <NavButton
            active={activeTab === 'products'}
            onClick={() => handleNavigate('products')}
            icon={<Package className="w-5 h-5" />}
            label={t('nav.products')}
            tablet={isTablet}
            mobile={isMobile}
          />
          <NavButton
            active={activeTab === 'manufacturing'}
            onClick={() => handleNavigate('manufacturing')}
            icon={<Factory className="w-5 h-5" />}
            label={t('nav.manufacturing')}
            tablet={isTablet}
            mobile={isMobile}
          />
          <NavButton
            active={activeTab === 'directory'}
            onClick={() => handleNavigate('directory')}
            icon={<Users className="w-5 h-5" />}
            label={t('nav.directory')}
            tablet={isTablet}
            mobile={isMobile}
          />
          <NavButton
            active={activeTab === 'definitions'}
            onClick={() => handleNavigate('definitions')}
            icon={<Settings className="w-5 h-5" />}
            label={t('nav.system')}
            tablet={isTablet}
            mobile={isMobile}
          />
        </nav>
      </div>
    </ResponsiveShell>
  );
};

const App: React.FC = () => {
  return (
    <AccountingProvider>
      <AppContent />
    </AccountingProvider>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tablet?: boolean;
  mobile?: boolean;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label, tablet = false, mobile = false }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center min-h-[44px] transition-all duration-200 px-1 py-1.5 rounded-lg ${mobile ? 'flex-1 min-w-0' : 'flex-1'
      } ${tablet ? 'gap-1.5 py-1' : 'gap-1'
      } ${active ? 'bg-slate-800 text-blue-400 scale-[1.03]' : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'}`}
  >
    {icon}
    <span className={`font-bold ${tablet ? 'text-[10px]' : mobile ? 'text-[10px]' : 'text-[9px]'}`}>{label}</span>
  </button>
);

export default App;

