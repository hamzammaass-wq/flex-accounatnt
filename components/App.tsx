// Legacy shell: kept for reference only. The live app entry uses root `App.tsx`.
import React, { useState } from 'react';
import { AccountingProvider, useAccounting } from '../contexts/AccountingContext';
import Dashboard from './Dashboard';
import TransactionForm, { TransactionTabType } from './TransactionForm';
import TransactionList from './TransactionList';
import AIAssistant from './AIAssistant';
import Directory from './Directory';
import ProductList from './ProductList';
import FinancialReports from './FinancialReports';
import DefinitionsMenu, { SettingsMode } from './DefinitionsMenu';
import SalesInvoiceList from './SalesInvoiceList';
import PurchaseInvoiceList from './PurchaseInvoiceList';
import PurchasesExpenses from './PurchasesExpenses';
import CheckPortfolio from './CheckPortfolio';
import TreasuryManager from './TreasuryManager';
import VoucherManager from './VoucherManager';
import JournalManager from './JournalManager';
import ImportManager from './ImportManager';
import HRManager from './HRManager';
import SettlementManager from './SettlementManager';
import AuthScreen from './AuthScreen';
import FixedAssetsManager from './FixedAssetsManager';
import LiveVoiceAssistant from './LiveVoiceAssistant';
import { LayoutDashboard, Package, Users, Settings, Wallet, Briefcase, Mic, Sparkles } from 'lucide-react';

export type TabView =
    | 'dashboard' | 'list' | 'ai' | 'directory' | 'products'
    | 'reports' | 'definitions' | 'sales' | 'purchases' | 'purchases-expenses'
    | 'checks' | 'treasury' | 'receipts-list' | 'payments-list' | 'journal-list'
    | 'import-list' | 'hr' | 'settlements' | 'fixed-assets';

export type OverlayView =
    | 'add-sales' | 'add-sales-return' | 'add-quotation' | 'add-purchase' | 'add-purchase-return' | 'add-expense' | 'add-voucher-receipt' | 'add-voucher-payment' | 'add-manual-purchase' | 'add-journal' | 'add-import' | 'voice-ai' | null;

const AppContent: React.FC = () => {
    const { currentUser } = useAccounting();
    const [activeTab, setActiveTab] = useState<TabView>('dashboard');
    const [overlay, setOverlay] = useState<OverlayView>(null);
    const [initialDefinitionsMode, setInitialDefinitionsMode] = useState<SettingsMode>('MENU');

    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

    if (!currentUser) {
        return <AuthScreen />;
    }

    const handleNavigate = (tab: TabView, definitionsMode?: SettingsMode) => {
        if (definitionsMode) {
            setInitialDefinitionsMode(definitionsMode);
        }
        setActiveTab(tab);
    };

    const openOverlay = (view: OverlayView) => setOverlay(view);
    const closeOverlay = () => {
        setOverlay(null);
        setSelectedInvoiceId('');
    };

    const renderMainContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard onNavigate={(tab, formTab, vType, defMode) => {
                if (formTab === 'SALES') openOverlay('add-sales');
                else if (formTab === 'PURCHASES' && tab !== 'purchases') openOverlay('add-purchase');
                else if (formTab === 'MANUAL_PURCHASE') handleNavigate('purchases-expenses');
                else if (formTab === 'EXPENSES') openOverlay('add-expense');
                else if (formTab === 'IMPORT_EXPENSES') openOverlay('add-import');
                else if (formTab === 'JOURNAL') handleNavigate('journal-list');
                else if (formTab === 'VOUCHERS') {
                    if (vType === 'RECEIPT') openOverlay('add-voucher-receipt');
                    else openOverlay('add-voucher-payment');
                }
                else if (tab === 'fixed-assets') handleNavigate('fixed-assets');
                else handleNavigate(tab, defMode);
            }} />;

            case 'list': return <TransactionList onNavigate={(tab, fTab, vType) => {
                if (fTab === 'JOURNAL') handleNavigate('journal-list');
                else if (fTab === 'VOUCHERS') handleNavigate(vType === 'RECEIPT' ? 'receipts-list' : 'payments-list');
                else handleNavigate(tab);
            }} />;
            case 'journal-list': return <JournalManager onAddNew={() => openOverlay('add-journal')} />;
            case 'import-list': return <ImportManager onAddNew={() => openOverlay('add-import')} />;
            case 'sales': return <SalesInvoiceList
                onNavigate={(tab, fTab) => {
                    if (fTab === 'SALES_RETURN') openOverlay('add-sales-return');
                    else if (fTab === 'QUOTATION') openOverlay('add-quotation');
                    else openOverlay('add-sales');
                }}
                onCreateReturn={(id) => { setSelectedInvoiceId(id); openOverlay('add-sales-return'); }}
            />;
            case 'purchases': return <PurchaseInvoiceList
                onNavigate={(tab, fTab) => {
                    if (fTab === 'PURCHASE_RETURN') openOverlay('add-purchase-return');
                    else openOverlay('add-purchase');
                }}
                onAddImportExpense={(id) => { setSelectedInvoiceId(id); openOverlay('add-import'); }}
            />;
            case 'purchases-expenses': return <PurchasesExpenses onNavigate={(tab, formTab) => {
                if (formTab === 'MANUAL_PURCHASE') openOverlay('add-manual-purchase');
                else if (formTab === 'PURCHASES') openOverlay('add-purchase');
                else if (formTab === 'EXPENSES') openOverlay('add-expense');
            }} />;
            case 'receipts-list': return <VoucherManager type="RECEIPT" onAddNew={() => openOverlay('add-voucher-receipt')} />;
            case 'payments-list': return <VoucherManager type="PAYMENT" onAddNew={() => openOverlay('add-voucher-payment')} />;
            case 'checks': return <CheckPortfolio />;
            case 'treasury': return <TreasuryManager />;
            case 'hr': return <HRManager />;
            case 'fixed-assets': return <FixedAssetsManager />;
            case 'settlements': return <SettlementManager onBack={() => handleNavigate('dashboard')} />;
            case 'ai': return <AIAssistant />;
            case 'directory': return <Directory />;
            case 'products': return <ProductList />;
            case 'reports': return <FinancialReports />;
            case 'definitions': return <DefinitionsMenu initialMode={initialDefinitionsMode} />;
            default: return <Dashboard onNavigate={() => { }} />;
        }
    };

    const renderOverlay = () => {
        if (!overlay) return null;

        if (overlay === 'voice-ai') return <LiveVoiceAssistant onClose={closeOverlay} />;

        let content = null;
        switch (overlay) {
            case 'add-sales': content = <TransactionForm initialMode="SALES" onBack={closeOverlay} />; break;
            case 'add-sales-return': content = <TransactionForm initialMode="SALES_RETURN" initialLinkedInvoiceId={selectedInvoiceId} onBack={closeOverlay} />; break;
            case 'add-quotation': content = <TransactionForm initialMode="QUOTATION" onBack={closeOverlay} />; break;
            case 'add-purchase': content = <TransactionForm initialMode="PURCHASES" onBack={closeOverlay} />; break;
            case 'add-purchase-return': content = <TransactionForm initialMode="PURCHASE_RETURN" onBack={closeOverlay} />; break;
            case 'add-manual-purchase': content = <TransactionForm initialMode="MANUAL_PURCHASE" onBack={closeOverlay} />; break;
            case 'add-expense': content = <TransactionForm initialMode="EXPENSES" onBack={closeOverlay} />; break;
            case 'add-import': content = <TransactionForm initialMode="IMPORT_EXPENSES" initialCategory="import_expenses" initialVoucherType="PAYMENT" initialLinkedInvoiceId={selectedInvoiceId} onBack={closeOverlay} />; break;
            case 'add-voucher-receipt': content = <TransactionForm initialMode="VOUCHERS" initialVoucherType="RECEIPT" onBack={closeOverlay} />; break;
            case 'add-voucher-payment': content = <TransactionForm initialMode="VOUCHERS" initialVoucherType="PAYMENT" onBack={closeOverlay} />; break;
            case 'add-journal': content = <TransactionForm initialMode="JOURNAL" onBack={closeOverlay} />; break;
        }

        return (
            <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 flex flex-col justify-end">
                <div className="bg-gray-50 w-full h-[92vh] rounded-t-[3rem] shadow-2xl overflow-y-auto animate-in slide-in-from-bottom-full duration-500 pb-10">
                    <div className="sticky top-0 z-[110] bg-gray-50/80 backdrop-blur px-6 py-4 flex justify-center">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                    </div>
                    {content}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 text-right font-tajawal text-gray-800">
            <main className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl overflow-hidden relative">
                <div className={`h-full overflow-y-auto pb-24 scroll-smooth transition-all duration-500 ${overlay ? 'scale-95 brightness-75 blur-[2px]' : 'scale-100'}`}>
                    {renderMainContent()}
                </div>

                {/* Gemini Voice Trigger FAB */}
                <button
                    onClick={() => openOverlay('voice-ai')}
                    className="absolute bottom-28 left-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center animate-bounce z-40 hover:bg-indigo-700 active:scale-90 transition-all"
                >
                    <Mic size={24} />
                </button>

                {renderOverlay()}

                <nav className="absolute bottom-0 left-0 w-full bg-slate-900 border-t border-slate-800 px-2 py-3 flex justify-between items-center z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] text-gray-400">
                    <NavButton
                        active={activeTab === 'dashboard'}
                        onClick={() => handleNavigate('dashboard')}
                        icon={<LayoutDashboard className="w-5 h-5" />}
                        label="الرئيسية"
                    />
                    <NavButton
                        active={activeTab === 'fixed-assets'}
                        onClick={() => handleNavigate('fixed-assets')}
                        icon={<Briefcase className="w-5 h-5" />}
                        label="الأصول"
                    />
                    <NavButton
                        active={activeTab === 'products'}
                        onClick={() => handleNavigate('products')}
                        icon={<Package className="w-5 h-5" />}
                        label="المخزون"
                    />
                    <NavButton
                        active={activeTab === 'ai'}
                        onClick={() => handleNavigate('ai')}
                        icon={<Sparkles className="w-5 h-5" />}
                        label="الذكاء"
                    />
                    <NavButton
                        active={activeTab === 'definitions'}
                        onClick={() => handleNavigate('definitions')}
                        icon={<Settings className="w-5 h-5" />}
                        label="النظام"
                    />
                </nav>
            </main>
        </div>
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
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center gap-1 transition-all duration-200 px-1 flex-1 ${active ? 'text-blue-500 scale-110' : 'text-gray-400 hover:text-gray-200'}`}
    >
        {icon}
        <span className="text-[9px] font-bold">{label}</span>
    </button>
);

export default App;
