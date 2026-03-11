import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, Product, InvoiceItem, ContactType, CheckStatus, Contact, Invoice, Account, FixedAsset, Check as CheckTypeData, Transaction, InvoiceSettlement } from '../types';
import ProductCard from './ProductCard';
import ContactEditorDialog from './ContactEditorDialog';
import EnglishDateInput from './EnglishDateInput';
import QuickAddProductModal from './QuickAddProductModal';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayAccountName, getDisplayContactName, getDisplayProductName, getDisplayWarehouseName } from '../utils/displayNames';
import {
    Wallet, ArrowLeft, Check, X, ChevronDown,
    Plus, Trash2, Package, CreditCard, PlusCircle, ArrowRightLeft, Percent,
    UserPlus, Search, Truck, User, LayoutGrid, Scale,
    ScrollText, ShoppingBag, FilePlus, Ship, Archive, Coins, Receipt,
    ArrowDownLeft, ArrowUpRight, CheckCircle, AlertCircle, Info, Calculator, Layers, Building2, PackagePlus, MoreVertical,
    Banknote, PlusSquare, AlertTriangle, CheckCircle2, ListChecks, Fingerprint, MapPin, Hash, TextQuote,
    Repeat, Tag, StickyNote, AlertOctagon, FileCheck, RefreshCw, Equal, Contact2, ScanBarcode, Forward, RotateCcw, Link as LinkIcon, Ruler, Upload
} from 'lucide-react';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { getInvoiceAllocatedAmount, getInvoiceRemainingBase } from '../utils/invoiceSettlement';
import { loadBarcodeReaderSettings } from '../utils/barcodeSettings';
import { Html5Qrcode } from 'html5-qrcode';
import { appendDeviceHubLog } from '../utils/deviceHub';
import { buildNextItemCode, normalizeItemCode } from '../utils/itemCode';

export type TransactionTabType = 'SALES' | 'SALES_RETURN' | 'QUOTATION' | 'PURCHASES' | 'PURCHASE_RETURN' | 'EXPENSES' | 'VOUCHERS' | 'JOURNAL' | 'IMPORT_EXPENSES' | 'MANUAL_PURCHASE';

interface TransactionFormProps {
    initialMode: TransactionTabType;
    initialVoucherType?: 'RECEIPT' | 'PAYMENT';
    initialCategory?: string;
    initialLinkedInvoiceId?: string;
    initialInvoiceId?: string;
    initialVoucherId?: string;
    onBack: () => void;
}

const inputClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-base font-bold text-slate-700 outline-none transition-all duration-300 shadow-sm focus:bg-white focus:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-blue-400/30 placeholder:text-gray-300";
const selectClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-base font-bold text-slate-700 outline-none appearance-none transition-all duration-300 shadow-sm focus:bg-white focus:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-blue-400/30";
const tableInputClass = "w-full p-3 text-center text-base sm:text-xs font-black bg-white border border-gray-100 rounded-2xl outline-none transition-all focus:shadow-md focus:border-blue-200 dir-ltr";

const focusNextFieldOnEnter = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.getAttribute('data-enter-skip') === 'true') return;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLInputElement && ['button', 'submit', 'checkbox', 'radio'].includes(target.type)) return;

    event.preventDefault();
    const scope = event.currentTarget;
    const focusable = Array.from(
        scope.querySelectorAll<HTMLElement>("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")
    ).filter((node) => node.tabIndex !== -1 && node.offsetParent !== null);

    const currentIndex = focusable.indexOf(target);
    if (currentIndex < 0) return;
    for (let i = currentIndex + 1; i < focusable.length; i += 1) {
        const next = focusable[i];
        if (next.getAttribute('data-enter-skip') === 'true') continue;
        next.focus();
        if (next instanceof HTMLInputElement && !['checkbox', 'radio'].includes(next.type)) {
            next.select();
        }
        break;
    }
};

const getTodayDateString = (): string => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Unable to read file'));
        };
        reader.onerror = () => reject(reader.error || new Error('File read failed'));
        reader.readAsDataURL(file);
    });

interface SearchableContactSelectProps {
    contacts: Contact[];
    selectedId: string;
    selectedLabel: string;
    onSelect: (id: string) => void;
    displayContactName: (contact?: { id: string; name: string } | null) => string;
    placeholder: string;
    emptyLabel: string;
    isEnglish: boolean;
    className?: string;
    inputClassName?: string;
}

const SearchableContactSelect: React.FC<SearchableContactSelectProps> = ({
    contacts,
    selectedId,
    selectedLabel,
    onSelect,
    displayContactName,
    placeholder,
    emptyLabel,
    isEnglish,
    className = '',
    inputClassName = ''
}) => {
    const [query, setQuery] = useState(selectedLabel);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setQuery(selectedLabel);
    }, [selectedId, selectedLabel]);

    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
                setQuery(selectedLabel);
            }
        };
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen, selectedLabel]);

    const filteredContacts = useMemo(() => {
        const effectiveQuery = isOpen && query === selectedLabel ? '' : query;
        const keyword = effectiveQuery.trim().toLowerCase();
        if (!keyword) return contacts;
        return contacts.filter((contact) => {
            const label = displayContactName(contact).toLowerCase();
            return (
                String(contact.name || '').toLowerCase().includes(keyword)
                || label.includes(keyword)
                || String(contact.phone || '').toLowerCase().includes(keyword)
            );
        });
    }, [contacts, query, displayContactName, isOpen, selectedLabel]);

    const handleSelect = (contactId: string) => {
        const nextContact = contacts.find(contact => contact.id === contactId);
        onSelect(contactId);
        setQuery(nextContact ? displayContactName(nextContact) : '');
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <Search className={`absolute ${isEnglish ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none z-10`} size={16} />
            <input
                value={query}
                onChange={(e) => {
                    const nextValue = e.target.value;
                    setQuery(nextValue);
                    setIsOpen(true);
                    if (!nextValue.trim()) onSelect('');
                }}
                onFocus={(event) => {
                    setIsOpen(true);
                    event.currentTarget.select();
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        setIsOpen(false);
                        setQuery(selectedLabel);
                        return;
                    }
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        const normalizedQuery = query.trim().toLowerCase();
                        const exactMatch = filteredContacts.find(contact => {
                            const label = displayContactName(contact).trim().toLowerCase();
                            return label === normalizedQuery || String(contact.phone || '').trim().toLowerCase() === normalizedQuery;
                        });
                        const targetContact = exactMatch || filteredContacts[0];
                        if (targetContact) {
                            handleSelect(targetContact.id);
                        } else {
                            setIsOpen(false);
                            setQuery(selectedLabel);
                        }
                    }
                }}
                placeholder={placeholder}
                autoComplete="off"
                data-enter-skip="true"
                className={inputClassName}
            />
            <button
                type="button"
                onClick={() => {
                    setIsOpen(prev => !prev);
                    if (!isOpen) setQuery(selectedLabel);
                }}
                className={`absolute ${isEnglish ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400 hover:text-slate-700 z-10`}
                tabIndex={-1}
            >
                <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-[1.25rem] border border-gray-200 bg-white shadow-2xl">
                    {filteredContacts.length > 0 ? filteredContacts.map(contact => (
                        <button
                            key={contact.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelect(contact.id)}
                            className={`w-full px-4 py-3 text-start transition-colors hover:bg-blue-50 ${contact.id === selectedId ? 'bg-blue-50/80' : 'bg-white'}`}
                        >
                            <div className="truncate text-sm font-black text-slate-700">{displayContactName(contact)}</div>
                            {contact.phone && (
                                <div className="mt-0.5 text-[10px] font-bold text-slate-400 dir-ltr">{contact.phone}</div>
                            )}
                        </button>
                    )) : (
                        <div className="px-4 py-3 text-xs font-black text-slate-400">{emptyLabel}</div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Quick Add Contact Modal ---
const QuickAddContactModal: React.FC<{ type: ContactType; onClose: () => void; onSave: (id: string) => void }> = ({ type, onClose, onSave }) => {
    const { addContact, companySettings } = useAccounting();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        const id = Math.random().toString(36).substr(2, 9);
        const result = addContact({ id, name, type, phone });
        if (!result.ok) return;
        onSave(id);
        onClose();
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            size="md"
            zIndexClassName="z-[300]"
            backdropClassName="bg-black/70 backdrop-blur-md"
            panelClassName="bg-white rounded-[2.5rem] p-8 shadow-2xl"
        >
            <form onSubmit={handleSubmit} className="animate-in zoom-in-95" dir={isEnglish ? 'ltr' : 'rtl'}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-800 text-lg">
                        {tr('إضافة', 'Add')} {type === 'CUSTOMER' ? tr('عميل', 'Customer') : type === 'SUPPLIER' ? tr('مورد', 'Supplier') : type === 'PARTNER' ? tr('شريك', 'Partner') : tr('موظف', 'Employee')} {tr('جديد', 'New')}
                    </h3>
                    <button type="button" onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={tr('اسم الطرف', 'Contact Name')} className={inputClass} />
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={tr('رقم الجوال', 'Mobile Number')} className={inputClass} />
                    <button type="submit" className="w-full min-h-[44px] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 mt-2">{tr('حفظ الطرف الجديد', 'Save New Contact')}</button>
                </div>
            </form>
        </ResponsiveDialog>
    );
};

// --- Quick Add Product Modal ---
const QuickAddProductModalLegacy: React.FC<{ onClose: () => void; onSave: (product: Product) => void }> = ({ onClose, onSave }) => {
    const { addProduct, companySettings, products } = useAccounting();
    const [name, setName] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [expiryPeriodDays, setExpiryPeriodDays] = useState('');
    const [price, setPrice] = useState('');
    const [cost, setCost] = useState('');
    const [barcode, setBarcode] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const barcodeEnabled = companySettings.barcodeEnabled ?? true;
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const autoItemCodePreview = useMemo(() => buildNextItemCode(products), [products]);

    const handlePickImage = async (file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert(tr('يرجى اختيار ملف صورة فقط.', 'Please select an image file only.'));
            return;
        }
        const maxSizeBytes = 2 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            alert(tr('حجم الصورة كبير. الحد الأقصى 2MB.', 'Image is too large. Maximum allowed is 2MB.'));
            return;
        }
        try {
            const dataUrl = await readFileAsDataUrl(file);
            setImageUrl(dataUrl);
        } catch {
            alert(tr('تعذر قراءة الصورة. حاول مرة أخرى.', 'Could not read image. Please try again.'));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        const parsedExpiryPeriodDays = parseInt(expiryPeriodDays, 10);
        const normalizedExpiryPeriodDays = Number.isFinite(parsedExpiryPeriodDays) && parsedExpiryPeriodDays > 0
            ? parsedExpiryPeriodDays
            : undefined;
        const resolvedItemCode = normalizeItemCode(itemCode) || autoItemCodePreview;
        const isItemCodeTaken = products.some((product) =>
            normalizeItemCode(product.itemCode || '') === resolvedItemCode
        );
        if (resolvedItemCode && isItemCodeTaken) {
            alert(tr(`رمز الصنف ${resolvedItemCode} مستخدم مسبقًا.`, `Item code ${resolvedItemCode} is already in use.`));
            return;
        }
        const id = Math.random().toString(36).substr(2, 9);
        const normalizedPrice = parseFloat(price) || 0;
        const product: Product = {
            id,
            name: name.trim(),
            itemCode: resolvedItemCode || undefined,
            expiryPeriodDays: normalizedExpiryPeriodDays,
            imageUrl: imageUrl || undefined,
            sellPrice: normalizedPrice,
            retailPrice: normalizedPrice,
            wholesalePrice: normalizedPrice,
            retailPricingMode: 'FIXED',
            wholesalePricingMode: 'FIXED',
            retailMarkupPercent: 0,
            wholesaleMarkupPercent: 0,
            buyPrice: parseFloat(cost) || 0,
            stock: 0,
            barcode
        };
        const result = addProduct(product);
        if (!result.ok) return;
        onSave(product);
        onClose();
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            size="md"
            zIndexClassName="z-[300]"
            backdropClassName="bg-black/70 backdrop-blur-md"
            panelClassName="bg-white rounded-[2.5rem] p-8 shadow-2xl"
        >
            <form onSubmit={handleSubmit} className="animate-in zoom-in-95" dir={isEnglish ? 'ltr' : 'rtl'}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-gray-800 text-lg">{tr('إضافة صنف جديد', 'Add New Item')}</h3>
                    <button type="button" onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={tr('اسم المنتج', 'Product Name')} className={inputClass} />
                    <input value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder={tr('رمز الصنف (اختياري)', 'Item code (optional)')} className={inputClass + " dir-ltr"} />
                    <input
                        type="number" inputMode="decimal"
                        min={1}
                        value={expiryPeriodDays}
                        onChange={e => setExpiryPeriodDays(e.target.value)}
                        placeholder={tr('فترة الصلاحية بالأيام (اختياري)', 'Shelf life in days (optional)')}
                        className={inputClass + " text-center dir-ltr"}
                        aria-label={tr('فترة صلاحية الصنف بالأيام', 'Item shelf life in days')}
                    />
                    {barcodeEnabled && (
                        <div className="relative">
                            <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder={tr('الباركود (اختياري)', 'Barcode (optional)')} className={inputClass} />
                            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                        </div>
                    )}
                    <div className="space-y-2">
                        <div className="h-28 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                            {imageUrl ? (
                                <img src={imageUrl} alt={tr('صورة الصنف', 'Item image')} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-[10px] font-bold text-gray-300">{tr('لا توجد صورة', 'No image')}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-black border border-indigo-100 bg-indigo-50 text-indigo-600 cursor-pointer hover:bg-indigo-100 transition-colors">
                                <Upload size={12} />
                                {imageUrl ? tr('تغيير الصورة', 'Replace image') : tr('إضافة صورة', 'Add image')}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (event) => {
                                        const file = event.target.files?.[0];
                                        await handlePickImage(file);
                                        event.currentTarget.value = '';
                                    }}
                                />
                            </label>
                            {imageUrl && (
                                <button
                                    type="button"
                                    onClick={() => setImageUrl('')}
                                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-black border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                >
                                    {tr('حذف الصورة', 'Remove image')}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder={tr('سعر البيع', 'Selling Price')} className={inputClass} />
                        <input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder={tr('التكلفة', 'Cost')} className={inputClass} />
                    </div>
                    <button type="submit" className="w-full min-h-[44px] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 mt-2">{tr('حفظ الصنف', 'Save Item')}</button>
                </div>
            </form>
        </ResponsiveDialog>
    );
};

// --- INVOICE SCREEN ---
const InvoiceScreen: React.FC<{
    mode: 'SALES' | 'SALES_RETURN' | 'QUOTATION' | 'PURCHASES' | 'PURCHASE_RETURN' | 'MANUAL_PURCHASE' | 'EXPENSES' | 'IMPORT_EXPENSES';
    sharedState: any;
    onDateChange: (value: string) => void;
    onSuccess: () => void;
    onBack: () => void;
    linkedInvoiceId?: string;
    initialInvoiceId?: string;
}> = ({ mode, sharedState, onDateChange, onSuccess, onBack, linkedInvoiceId: initialLinkedId, initialInvoiceId }) => {
    const { createInvoice, deleteInvoice, contacts, products, companySettings, accounts, invoices, warehouses, updateProduct, currentCompanyId } = useAccounting();

    const isSales = mode === 'SALES';
    const isReturn = mode === 'SALES_RETURN';
    const isPurchaseReturn = mode === 'PURCHASE_RETURN';
    const isQuotation = mode === 'QUOTATION';
    const isExpenses = mode === 'EXPENSES';
    const isImportExpenses = mode === 'IMPORT_EXPENSES';
    const isExpenseStyle = isExpenses || isImportExpenses;
    const isPurchase = mode === 'PURCHASES' || mode === 'MANUAL_PURCHASE';
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const isSalesFlow = isSales || isReturn || isQuotation;
    const taxVisibleInInvoices = isExpenseStyle
        ? true
        : (companySettings.showTaxInInvoices ?? true)
        && (isSalesFlow ? !(companySettings.hideSalesTax ?? false) : !(companySettings.hidePurchaseTax ?? false));
    const autoAddItemPriceInInvoice = companySettings.autoAddItemPriceInInvoice ?? true;
    const invoiceExpiryDateEnabled = companySettings.invoiceExpiryDateEnabled ?? false;
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) => getDisplayProductName(product || undefined, isEnglish);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayWarehouseName = (warehouse?: { id: string; name: string } | null) => getDisplayWarehouseName(warehouse || undefined, isEnglish);

    // Theme Config based on mode
    const theme = useMemo(() => {
        if (isReturn || isPurchaseReturn) return { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', shadow: 'shadow-rose-100', btn: 'bg-rose-600' };
        if (isQuotation) return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', shadow: 'shadow-amber-100', btn: 'bg-amber-600' };
        if (isPurchase) return { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', shadow: 'shadow-purple-100', btn: 'bg-purple-600' };
        return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', shadow: 'shadow-blue-100', btn: 'bg-blue-600' };
    }, [mode]);

    const defaultContactId = (isSales || isReturn || isQuotation) ? 'cash_customer' : 'cash_supplier';
    const [contactId, setContactId] = useState(defaultContactId);
    const selectedContact = useMemo(
        () => contacts.find(c => c.id === contactId),
        [contacts, contactId]
    );
    const selectedContactLabel = selectedContact ? displayContactName(selectedContact) : '';
    const resolvePreferredWarehouseId = () => {
        const main = warehouses.find(w => w.isMain);
        return main ? main.id : (warehouses[0]?.id || '');
    };
    const hasWarehouses = warehouses.length > 0;
    // Default to main warehouse if available.
    const [warehouseId, setWarehouseId] = useState(resolvePreferredWarehouseId);

    const [items, setItems] = useState<Omit<InvoiceItem, 'id'>[]>([]);
    const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
    const [paymentAccountId, setPaymentAccountId] = useState('');

    const [expenseAccountId, setExpenseAccountId] = useState('');

    const [taxEnabled, setTaxEnabled] = useState(taxVisibleInInvoices);
    const [taxRateOverride, setTaxRateOverride] = useState(String(companySettings.defaultTaxRate ?? 0));
    const [separatePurchaseTaxFromAmount, setSeparatePurchaseTaxFromAmount] = useState(false);
    const [dueDate, setDueDate] = useState(sharedState.date);
    const [discount, setDiscount] = useState('');
    const [notes, setNotes] = useState('');
    const [search, setSearch] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const invoiceBarcodeScannerRef = useRef<Html5Qrcode | null>(null);

    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemQty, setNewItemQty] = useState('1');
    const [newItemPrice, setNewItemPrice] = useState('');

    const [showQuickContact, setShowQuickContact] = useState(false);
    const [showQuickProduct, setShowQuickProduct] = useState(false);

    // Manual Item State
    const [isManualItem, setIsManualItem] = useState(false);
    const [manualItemDesc, setManualItemDesc] = useState('');
    const [manualItemPrice, setManualItemPrice] = useState('');
    const [manualItemQty, setManualItemQty] = useState('1');

    // New: Link Original Invoice
    const [linkedInvoiceId, setLinkedInvoiceId] = useState(initialLinkedId || '');
    const barcodeSettings = useMemo(
        () => loadBarcodeReaderSettings(currentCompanyId),
        [currentCompanyId]
    );
    const editingInvoice = useMemo(
        () => initialInvoiceId ? invoices.find(inv => inv.id === initialInvoiceId) || null : null,
        [initialInvoiceId, invoices]
    );
    const editBlockedReason = useMemo(() => {
        if (!editingInvoice) return '';
        if (editingInvoice.isReversal || editingInvoice.reversedById) {
            return tr('لا يمكن تعديل فاتورة تم عكسها محاسبيًا.', 'Reversed invoices cannot be edited directly.');
        }
        return '';
    }, [editingInvoice, isEnglish]);

    // EFFECT: Handle auto-linking on mount if ID is provided
    useEffect(() => {
        if (initialLinkedId) {
            handleLinkInvoice(initialLinkedId);
        }
    }, [initialLinkedId]);

    useEffect(() => {
        if (!editingInvoice) return;

        const importPrefix = `${tr('مصاريف استيراد', 'Import expenses')}: `;
        const expensePrefix = `${tr('مصروفات', 'Expenses')}: `;
        let normalizedNotes = editingInvoice.notes || '';
        if (normalizedNotes.startsWith(importPrefix)) normalizedNotes = normalizedNotes.slice(importPrefix.length);
        if (normalizedNotes.startsWith(expensePrefix)) normalizedNotes = normalizedNotes.slice(expensePrefix.length);

        setContactId(editingInvoice.customerId || defaultContactId);
        setWarehouseId(editingInvoice.warehouseId || '');
        const sourceItems = Array.isArray(editingInvoice.items) ? editingInvoice.items : [];
        setItems(sourceItems.map(({ id, returned, ...item }) => ({ ...item })));
        setPaymentType(editingInvoice.paymentType);
        setPaymentAccountId(editingInvoice.paymentAccountId || '');
        setTaxEnabled(taxVisibleInInvoices && (Number(editingInvoice.taxAmount) || 0) > 0);
        setTaxRateOverride(String(editingInvoice.taxRate || companySettings.defaultTaxRate || 0));
        setSeparatePurchaseTaxFromAmount(false);
        setDueDate(editingInvoice.dueDate || editingInvoice.date);
        setDiscount(editingInvoice.discountAmount ? String(editingInvoice.discountAmount) : '');
        setNotes(normalizedNotes);
        setLinkedInvoiceId(editingInvoice.linkedInvoiceId || '');
    }, [
        editingInvoice,
        defaultContactId,
        taxVisibleInInvoices,
        companySettings.defaultTaxRate,
        isEnglish
    ]);

    useEffect(() => {
        if (!showBarcodeScanner) return;
        const timer = setTimeout(() => {
            const qr = new Html5Qrcode('invoice-barcode-reader');
            invoiceBarcodeScannerRef.current = qr;
            qr.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 260, height: 260 } },
                (decodedText) => {
                    const scanned = String(decodedText || '').trim();
                    if (!scanned) return;
                    setSearch(scanned);
                    const exact = products.find(p =>
                        String(p.barcode || '').trim() === scanned ||
                        String(p.itemCode || '').trim().toLowerCase() === scanned.toLowerCase()
                    );
                    if (exact) {
                        appendDeviceHubLog(currentCompanyId, {
                            deviceType: 'BARCODE_SCANNER',
                            action: 'SCAN',
                            status: 'SUCCESS',
                            message: `Camera barcode scan matched product: ${exact.id}`,
                            metadata: { source: 'camera', scanned }
                        });
                        addItem(exact);
                        setIsSearchFocused(false);
                    } else {
                        appendDeviceHubLog(currentCompanyId, {
                            deviceType: 'BARCODE_SCANNER',
                            action: 'SCAN',
                            status: 'ERROR',
                            message: 'Camera barcode scan did not match any product',
                            metadata: { source: 'camera', scanned }
                        });
                    }
                    setShowBarcodeScanner(false);
                    qr.stop().catch(() => undefined);
                },
                () => undefined
            ).catch(() => {
                appendDeviceHubLog(currentCompanyId, {
                    deviceType: 'BARCODE_SCANNER',
                    action: 'SCAN',
                    status: 'ERROR',
                    message: 'Failed to start camera barcode scanner',
                    metadata: { source: 'camera' }
                });
                alert(tr('تعذر تشغيل كاميرا الباركود.', 'Unable to start barcode camera scanner.'));
                setShowBarcodeScanner(false);
            });
        }, 80);

        return () => {
            clearTimeout(timer);
            const qr = invoiceBarcodeScannerRef.current;
            invoiceBarcodeScannerRef.current = null;
            if (qr) {
                qr.stop().catch(() => undefined).finally(() => qr.clear().catch(() => undefined));
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showBarcodeScanner, products]);

    useEffect(() => {
        setTaxRateOverride(String(companySettings.defaultTaxRate ?? 0));
        if (!taxVisibleInInvoices) {
            setTaxEnabled(false);
        }
    }, [companySettings.defaultTaxRate, taxVisibleInInvoices]);

    useEffect(() => {
        if (!isExpenseStyle) {
            setSeparatePurchaseTaxFromAmount(false);
        }
    }, [isExpenseStyle]);

    useEffect(() => {
        if (!invoiceExpiryDateEnabled) return;
        if (!dueDate) setDueDate(sharedState.date);
    }, [sharedState.date, dueDate, invoiceExpiryDateEnabled]);

    const filteredContacts = contacts.filter(c =>
        c.type === 'CUSTOMER' ||
        c.type === 'SUPPLIER' ||
        c.type === 'PARTNER' ||
        ((isSales || isReturn || isQuotation) && c.type === 'EMPLOYEE')
    );

    const financialAccounts = useMemo(() => accounts.filter(a => !a.isGroup && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root')), [accounts]);

    useEffect(() => {
        if (isExpenseStyle || isQuotation) return;
        if (!warehouseId || !warehouses.some(w => w.id === warehouseId)) {
            setWarehouseId(resolvePreferredWarehouseId());
        }
    }, [warehouses, warehouseId, isExpenseStyle, isQuotation]);

    useEffect(() => {
        if (isQuotation || paymentType !== 'CASH') return;
        const hasCurrent = paymentAccountId && financialAccounts.some(a => a.id === paymentAccountId);
        if (hasCurrent) return;
        const fallbackAccountId = financialAccounts.find(a => a.id === 'acc_cash')?.id || financialAccounts[0]?.id || '';
        if (fallbackAccountId && fallbackAccountId !== paymentAccountId) {
            setPaymentAccountId(fallbackAccountId);
        }
    }, [paymentType, isQuotation, paymentAccountId, financialAccounts]);

    const expenseAccounts = useMemo(() => accounts.filter(a => a.type === 'EXPENSE' && !a.isGroup), [accounts]);

    const searchResults = useMemo(() => {
        if (!isSearchFocused && !search.trim()) return [];
        let filtered = products;
        if (search.trim()) {
            filtered = products.filter(p => {
                const displayName = displayProductName(p);
                return (
                    p.name.toLowerCase().includes(search.toLowerCase()) ||
                    displayName.toLowerCase().includes(search.toLowerCase()) ||
                    p.itemCode?.toLowerCase().includes(search.toLowerCase()) ||
                    p.barcode?.includes(search)
                );
            });
        }
        return filtered.slice(0, 10);
    }, [search, products, isSearchFocused, isEnglish]);

    // Available Invoices to Link (for Returns)
    const availableInvoices = useMemo(() => {
        if (isReturn) {
            return invoices.filter(inv => inv.type === TransactionType.INCOME && inv.customerId === contactId && inv.postingStatus === 'POSTED');
        } else if (isPurchaseReturn) {
            return invoices.filter(inv => inv.type === TransactionType.EXPENSE && inv.category === 'purchase_invoice' && inv.customerId === contactId && inv.postingStatus === 'POSTED');
        }
        return [];
    }, [isReturn, isPurchaseReturn, invoices, contactId]);

    const handleLinkInvoice = (invId: string) => {
        setLinkedInvoiceId(invId);
        if (!invId) {
            setItems([]);
            return;
        }
        const inv = invoices.find(i => i.id === invId);
        if (inv) {
            // Set contact
            if (inv.customerId) setContactId(inv.customerId);
            if (inv.warehouseId) setWarehouseId(inv.warehouseId); // Also set warehouse from original invoice

            // Load items from invoice
            const loadedItems = (Array.isArray(inv.items) ? inv.items : []).map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity, // Default to full return? Maybe better to 0 or 1. Let's do full for ease, user reduces it.
                unitPrice: item.unitPrice,
                total: item.total,
                accountId: item.accountId
            }));
            setItems(loadedItems);
            setDiscount(''); // Reset discount as it might apply differently
            setNotes(`${tr('مرتجع عن الفاتورة رقم', 'Return against invoice #')} ${inv.invoiceNumber}`);
        }
    };

    const addItem = (product: Product) => {
        // For sales return/sales/quotation, use sellPrice. For purchase/purchase return use buyPrice.
        const basePrice = (isSales || isReturn || isQuotation) ? product.sellPrice : product.buyPrice;
        const price = autoAddItemPriceInInvoice ? basePrice : 0;
        const existing = items.find(i => i.productId === product.id);
        if (existing) {
            setItems(prev => prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice } : i));
        } else {
            setItems(prev => [...prev, { productId: product.id, description: product.name, quantity: 1, unitPrice: price, total: price }]);
        }
        setSearch('');
        setIsSearchFocused(false);
    };

    const addManualItem = () => {
        if (!manualItemDesc || !manualItemPrice) return;
        const qty = parseFloat(manualItemQty) || 1;
        const price = parseFloat(manualItemPrice) || 0;

        setItems(prev => [...prev, {
            description: manualItemDesc,
            quantity: qty,
            unitPrice: price,
            total: qty * price,
            productId: undefined
        }]);
        setManualItemDesc('');
        setManualItemQty('1');
        setManualItemPrice('');
    };

    const addExpenseItem = () => {
        if (!newItemDesc || !newItemPrice || !expenseAccountId) return alert(tr('يرجى تعبئة بيانات البند واختيار حساب المصروف', 'Please complete item data and select an expense account'));
        const qty = parseFloat(newItemQty) || 1;
        const price = parseFloat(newItemPrice) || 0;

        setItems(prev => [...prev, {
            description: newItemDesc,
            quantity: qty,
            unitPrice: price,
            total: qty * price,
            accountId: expenseAccountId
        }]);
        setNewItemDesc('');
        setNewItemQty('1');
        setNewItemPrice('');
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: number) => {
        const safeValue = Number.isFinite(value) ? value : 0;
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const updates = { [field]: safeValue } as any;

            // Dimension Calculation Logic (Length * Width)
            if (field === 'width' || field === 'length') {
                const w = field === 'width' ? safeValue : (item.width || 0);
                const l = field === 'length' ? safeValue : (item.length || 0);

                if (w > 0 && l > 0) {
                    const area = parseFloat((w * l).toFixed(2));
                    updates.quantity = area;
                    updates.total = area * item.unitPrice;
                }
            }

            // Standard Calculation
            if (field === 'quantity') {
                updates.total = safeValue * item.unitPrice;
            }
            if (field === 'unitPrice') {
                const qty = (typeof updates.quantity === 'number') ? updates.quantity : item.quantity;
                updates.total = qty * safeValue;
            }

            return { ...item, ...updates };
        }));
    };

    const toggleDimensions = (index: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            if (item.width !== undefined) {
                // Remove dimensions
                const { width, length, ...rest } = item;
                return rest;
            } else {
                // Add dimensions (Default 1x1)
                return { ...item, width: 1, length: 1, quantity: 1, total: item.unitPrice };
            }
        }));
    };

    const totals = useMemo(() => {
        const round2 = (value: number) => Number((Number(value) || 0).toFixed(2));
        const sub = items.reduce((s, i) => s + i.total, 0);
        const disc = round2(parseFloat(discount) || 0);
        const netAfterDiscount = round2(Math.max(0, sub - disc));
        const rate = (taxVisibleInInvoices && taxEnabled) ? (parseFloat(taxRateOverride) || 0) : 0;
        const shouldExtractPurchaseTax =
            isExpenseStyle &&
            taxVisibleInInvoices &&
            taxEnabled &&
            separatePurchaseTaxFromAmount &&
            rate > 0;

        if (shouldExtractPurchaseTax) {
            const tax = round2((netAfterDiscount * rate) / (100 + rate));
            const netBeforeTax = round2(netAfterDiscount - tax);
            return {
                sub: round2(sub),
                tax,
                disc,
                total: netAfterDiscount,
                rate: round2(rate),
                taxIncludedInAmount: true,
                netBeforeTax,
                subTotalForInvoice: round2(netBeforeTax + disc)
            };
        }

        const tax = round2((netAfterDiscount * rate) / 100);
        return {
            sub: round2(sub),
            tax,
            disc,
            total: round2(netAfterDiscount + tax),
            rate: round2(rate),
            taxIncludedInAmount: false,
            netBeforeTax: netAfterDiscount,
            subTotalForInvoice: round2(sub)
        };
    }, [items, discount, taxEnabled, taxRateOverride, taxVisibleInInvoices, isExpenseStyle, separatePurchaseTaxFromAmount]);

    const handleSubmit = async () => {
        if (!sharedState.date) return alert(tr('يرجى تحديد تاريخ العملية', 'Please select operation date'));
        if (!contactId && !isExpenseStyle) return alert(tr('يرجى اختيار العميل/المورد', 'Please select customer/supplier'));
        if (editBlockedReason) return alert(editBlockedReason);

        // Warehouse validation for stock-related transactions.
        if (!isExpenseStyle && !isQuotation && hasWarehouses && !warehouseId) return alert(tr('يرجى اختيار المستودع', 'Please select warehouse'));

        // Validation for payment: Required unless it's a Quotation.
        const fallbackCashAccountId = financialAccounts.find(a => a.id === 'acc_cash')?.id || financialAccounts[0]?.id || '';
        const effectivePaymentAccountId = paymentType === 'CASH'
            ? (paymentAccountId || fallbackCashAccountId)
            : paymentAccountId;
        if (!isQuotation && paymentType === 'CASH' && !effectivePaymentAccountId) {
            return alert(tr('يرجى تحديد الصندوق المالي المستلم/المصروف منه', 'Please select the cash/bank account'));
        }

        if (items.length === 0) return alert(tr('Please add at least one item', 'Please add at least one item'));
        if (!(companySettings.allowNegativeSalesQuantity ?? false) && (isSales || isQuotation) && items.some(i => i.quantity < 0)) {
            return alert(tr('Negative quantity is disabled for sales invoices in settings.', 'Negative quantity is disabled for sales invoices in settings.'));
        }
        let category = 'sales_invoice';
        if (isPurchase) {
            category = 'purchase_invoice';
        } else if (isImportExpenses) {
            category = 'import_expenses';
        } else if (isExpenses) {
            category = 'general_expense';
        } else if (isReturn) {
            category = 'sales_return';
        } else if (isPurchaseReturn) {
            category = 'purchase_return';
        }

        // Determine Final Status
        let invoiceStatus: any = paymentType === 'CASH' ? 'PAID' : 'PENDING';
        if (isQuotation) invoiceStatus = 'QUOTATION';

        if ((companySettings.updateSalesPriceOnInvoiceEntry ?? false) && isSales) {
            const latestPriceByProduct = new Map<string, number>();
            items.forEach((item) => {
                if (item.productId && Number.isFinite(item.unitPrice) && item.unitPrice > 0) {
                    latestPriceByProduct.set(item.productId, item.unitPrice);
                }
            });
            latestPriceByProduct.forEach((price, productId) => {
                updateProduct(productId, { sellPrice: price, retailPrice: price, retailPricingMode: 'FIXED' });
            });
        }

        const invoicePayload = {
            id: editingInvoice?.id,
            invoiceNumber: editingInvoice?.invoiceNumber || `${isQuotation ? 'QT' : (isReturn || isPurchaseReturn) ? 'RET' : 'INV'}-${Date.now().toString().slice(-6)}`,
            customerId: contactId || undefined,
            linkedInvoiceId: linkedInvoiceId || undefined,
            type: (isSales || isQuotation || isPurchaseReturn) ? TransactionType.INCOME : TransactionType.EXPENSE, // Purchase Return uses Income type flow in logic to reverse expense
            category: category,
            date: sharedState.date,
            dueDate: invoiceExpiryDateEnabled ? dueDate : undefined,
            items: items.map(i => ({ ...i, id: Math.random().toString() })),
            subTotal: totals.subTotalForInvoice,
            taxRate: totals.rate,
            taxAmount: totals.tax,
            discountAmount: totals.disc,
            totalAmount: totals.total,
            status: invoiceStatus,
            postingStatus: isQuotation ? 'DRAFT' : 'POSTED',
            paymentType: paymentType,
            paymentAccountId: effectivePaymentAccountId,
            currency: sharedState.currency,
            exchangeRate: sharedState.rate,
            notes: isImportExpenses
                ? `${tr('مصاريف استيراد', 'Import expenses')}: ${notes}`
                : (isExpenses ? `${tr('مصروفات', 'Expenses')}: ${notes}` : notes),
            warehouseId: (!isExpenseStyle && hasWarehouses) ? warehouseId : undefined
        };

        if (editingInvoice) {
            const preserveSettlements = editingInvoice.paymentType === 'CREDIT'
                && invoicePayload.paymentType === 'CREDIT'
                && editingInvoice.status !== 'QUOTATION'
                && invoicePayload.status !== 'QUOTATION'
                && editingInvoice.category !== 'sales_return'
                && editingInvoice.category !== 'purchase_return'
                && invoicePayload.category !== 'sales_return'
                && invoicePayload.category !== 'purchase_return';
            const deleteResult = deleteInvoice(editingInvoice.id, { preserveSettlements });
            if (!deleteResult.ok) return alert(deleteResult.message);
        }

        const result = await createInvoice(invoicePayload);
        if (!result.ok) return alert(result.message);
        alert(isQuotation
            ? tr('تم حفظ عرض السعر بنجاح', 'Quotation saved successfully')
            : editingInvoice
                ? tr('تم تحديث الفاتورة وترحيلها بنجاح', 'Invoice updated and posted successfully')
                : tr('تم الترحيل بنجاح', 'Posted successfully'));
        onSuccess();
    };

    const findExactBarcodeOrCodeProduct = (term: string) => {
        const scanned = toEnglishDigits(term || '').trim();
        if (!scanned) return null;
        return products.find(p => {
            const barcodeValue = toEnglishDigits(String(p.barcode || '').trim());
            const itemCodeValue = String(p.itemCode || '').trim().toLowerCase();
            return (barcodeValue && barcodeValue === scanned) || (itemCodeValue && itemCodeValue === scanned.toLowerCase());
        }) || null;
    };

    const handleInvoiceSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!(companySettings.barcodeEnabled ?? true)) return;
        const expectsEnter = barcodeSettings.scannerSuffix === 'ENTER';
        const expectsTab = barcodeSettings.scannerSuffix === 'TAB';
        const trigger =
            (expectsEnter && e.key === 'Enter') ||
            (expectsTab && e.key === 'Tab') ||
            (barcodeSettings.scannerSuffix === 'NONE' && e.key === 'Enter');
        if (!trigger) return;
        const exact = findExactBarcodeOrCodeProduct(search);
        if (!exact) {
            appendDeviceHubLog(currentCompanyId, {
                deviceType: 'BARCODE_SCANNER',
                action: 'SCAN',
                status: 'ERROR',
                message: 'Keyboard barcode scan did not match any product',
                metadata: { source: 'keyboard_wedge', scanned: toEnglishDigits(search || '').trim() }
            });
            return;
        }
        appendDeviceHubLog(currentCompanyId, {
            deviceType: 'BARCODE_SCANNER',
            action: 'SCAN',
            status: 'SUCCESS',
            message: `Keyboard barcode scan matched product: ${exact.id}`,
            metadata: { source: 'keyboard_wedge', scanned: toEnglishDigits(search || '').trim() }
        });
        if (barcodeSettings.autoAddOnExactMatch) {
            e.preventDefault();
            addItem(exact);
            return;
        }
        setIsSearchFocused(true);
    };

    const checkStock = (productId?: string, qty: number = 0) => {
        if (!productId) return true; // Checks for manual items always pass
        // Sales: check if we have enough stock to sell (in selected warehouse)
        if (isSales && !isQuotation) {
            const p = products.find(prod => prod.id === productId);
            if (!p) return true;
            if (warehouseId) {
                const whStock = p.warehouseStock?.find(w => w.warehouseId === warehouseId)?.quantity || 0;
                return whStock >= qty;
            }
            return p.stock >= qty; // Fallback to global stock if no warehouse selected (should not happen if enforced)
        }
        // Purchase Return: check if we have enough stock to return (in selected warehouse)
        if (isPurchaseReturn) {
            const p = products.find(prod => prod.id === productId);
            if (!p) return true;
            if (warehouseId) {
                const whStock = p.warehouseStock?.find(w => w.warehouseId === warehouseId)?.quantity || 0;
                return whStock >= qty;
            }
            return p.stock >= qty;
        }
        return true;
    };

    return (
        <div
            className="transaction-mobile-form app-page w-full max-w-full px-2 sm:px-3 space-y-3 pb-[calc(var(--app-safe-bottom)+0.8rem)] overflow-x-hidden"
            dir={isEnglish ? 'ltr' : 'rtl'}
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
        >
            {/* 1. Header Navigation Bar */}
            <div className="flex items-center justify-between bg-white px-3 py-2 border border-gray-200 rounded-xl shadow-sm">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm font-black text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors"
                >
                    <ArrowRight size={18} className={isEnglish ? "rotate-180" : ""} />
                    {tr('رجوع', 'Back')}
                </button>
                <div className="text-base font-black text-indigo-900">
                    {isSales ? tr('بيع', 'Sales') : isPurchaseReturn ? tr('مرتجع شراء', 'Purchase Return') : isReturn ? tr('مرتجع بيع', 'Sales Return') : isPurchase ? tr('شراء', 'Purchase') : isExpenseStyle ? tr('مصروف', 'Expense') : isQuotation ? tr('عرض سعر', 'Quotation') : tr('سند', 'Voucher')}
                </div>
                <div className="flex items-center gap-1">
                    <button className="p-2 text-gray-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 transition-colors">
                        <MoreVertical size={18} />
                    </button>
                </div>
            </div>

            {/* 2. Top Header Inputs (Fixed Height, compact) */}
            <div className="bg-white px-3 py-3 space-y-2 border border-gray-200 rounded-xl relative z-10 shadow-sm">

                {/* Type & Cash/Credit */}
                <div className="flex gap-2">
                    <div className="flex-1 flex gap-1 bg-gray-100 p-1 rounded-xl">
                        {!isQuotation && (
                            <>
                                <button type="button" onClick={() => setPaymentType('CASH')} className={`flex-1 py-1 text-[11px] font-black rounded-lg transition-all ${paymentType === 'CASH' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
                                    {tr('نقدي', 'Cash')}
                                </button>
                                <button type="button" onClick={() => setPaymentType('CREDIT')} className={`flex-1 py-1 text-[11px] font-black rounded-lg transition-all ${paymentType === 'CREDIT' ? 'bg-white shadow text-orange-600' : 'text-gray-500'}`}>
                                    {tr('آجل', 'Credit')}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Warehouse & Account (Row 2) */}
                <div className="flex gap-2">
                    {!isExpenseStyle && hasWarehouses && (
                        <div className="flex-1 relative">
                            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full text-[11px] font-black bg-gray-50 border border-gray-100 rounded-xl p-1.5 pl-2 pr-6 appearance-none focus:outline-none focus:border-indigo-300">
                                <option value="">{tr('المستودع', 'Warehouse')}</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{displayWarehouseName(w)}</option>)}
                            </select>
                            <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                        </div>
                    )}

                    {!isQuotation && paymentType === 'CASH' && (
                        <div className="flex-1 relative">
                            <select value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)} className="w-full text-[11px] font-black bg-blue-50/30 border border-blue-100 text-blue-700 rounded-xl p-1.5 pl-2 pr-6 appearance-none focus:outline-none focus:border-blue-300">
                                <option value="">{tr('الصندوق/البنك', 'Cash/Bank')}</option>
                                {financialAccounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                            </select>
                            <Wallet className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={12} />
                        </div>
                    )}
                </div>

                {/* Customer / Supplier & Date */}
                <div className="flex gap-2 items-center">
                    <div className="flex-1 relative flex items-center">
                        <SearchableContactSelect
                            contacts={filteredContacts}
                            selectedId={contactId}
                            selectedLabel={selectedContactLabel}
                            onSelect={(nextId) => {
                                setContactId(nextId);
                                setLinkedInvoiceId('');
                            }}
                            displayContactName={displayContactName}
                            placeholder={isExpenseStyle ? tr('مورد عام / بدون أو ابحث...', 'Generic supplier / search...') : tr('اختر الطرف أو ابحث...', 'Select or search contact...')}
                            emptyLabel={tr('لا يوجد طرف مطابق.', 'No matching contact found.')}
                            isEnglish={isEnglish}
                            className="w-full"
                            inputClassName={`w-full bg-gray-50 border border-gray-100 rounded-xl p-1.5 text-[11px] font-black text-gray-700 outline-none focus:ring-1 focus:ring-indigo-300 ${isEnglish ? 'pl-9 pr-9' : 'pr-9 pl-9'}`}
                        />
                        <button type="button" onClick={() => setShowQuickContact(true)} className="p-1.5 bg-gray-200 text-gray-600 rounded-xl active:bg-gray-300 transition-colors z-20 hover:text-indigo-600 flex items-center justify-center shrink-0 w-8">
                            <UserPlus size={14} />
                        </button>
                    </div>

                    <div className="w-28 shrink-0 relative">
                        <EnglishDateInput
                            value={sharedState.date}
                            onChange={onDateChange}
                            className="w-full text-center text-[11px] font-black bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center p-0 h-[28px] focus:outline-none focus:border-indigo-300"
                        />
                    </div>
                </div>
            </div>

            {/* 3. Inline Add Item Bar (Fixed) */}
            <div className="px-3 py-2 bg-white border border-gray-200 rounded-xl z-10 shadow-sm">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (search.trim() || manualItemDesc.trim()) setShowQuickProduct(true);
                    }}
                    className="flex gap-2 items-center relative"
                >
                    <button
                        type="button"
                        onClick={() => {
                            if ((companySettings.barcodeEnabled ?? true) && barcodeSettings.allowCameraScannerInInvoices) {
                                setShowBarcodeScanner(true);
                            } else {
                                setShowQuickProduct(true);
                            }
                        }}
                        className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm active:-translate-y-0.5 active:scale-95 transition-all outline-none"
                    >
                        {(companySettings.barcodeEnabled ?? true) && barcodeSettings.allowCameraScannerInInvoices ? <ScanBarcode size={16} /> : <Plus size={16} />}
                    </button>

                    <div className="flex-1 relative">
                        <input
                            value={isManualItem ? manualItemDesc : search}
                            onChange={e => isManualItem ? setManualItemDesc(e.target.value) : setSearch(e.target.value)}
                            onKeyDown={!isManualItem ? handleInvoiceSearchKeyDown : undefined}
                            onFocus={() => {
                                if (!isManualItem) setIsSearchFocused(true);
                            }}
                            placeholder={isManualItem ? tr('وصف البند اليدوي...', 'Manual item desc...') : tr('أدخل إسم الصنف أو الباركود', 'Enter item name or barcode')}
                            className="w-full p-2 text-xs font-black bg-white border border-gray-200 shadow-inner rounded-xl appearance-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all pl-10"
                        />
                        <button type="button" onClick={() => setIsManualItem(!isManualItem)} className={`absolute ${isEnglish ? 'left-2' : 'right-2'} top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${isManualItem ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:text-indigo-500'}`} title={tr('تبديل يدوي/مخزني', 'Toggle Manual/Stock')}>
                            {isManualItem ? <Layers size={14} /> : <Package size={14} />}
                        </button>
                    </div>

                    <button type="submit" className="p-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow active:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center min-w-[3rem]">
                        <Plus size={18} />
                    </button>

                    {/* Autocomplete Dropdown */}
                    {!isManualItem && isSearchFocused && search && (
                        <>
                            <div className="fixed inset-0 z-[190]" onClick={() => setIsSearchFocused(false)}></div>
                            <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in max-h-[30vh] overflow-y-auto">
                                {searchResults.length > 0 ? searchResults.map(p => (
                                    <button key={p.id} type="button" onClick={() => { addItem(p); setIsSearchFocused(false); setSearch(''); }} className="w-full p-3 flex items-center justify-between border-b border-gray-50 last:border-0 hover:bg-indigo-50 transition-colors text-start">
                                        <div className="flex items-center gap-2">
                                            <div className="text-start">
                                                <p className="text-[11px] font-black text-slate-800">{displayProductName(p)}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-[9px] font-bold ${p.stock <= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{p.stock} {tr('متوفر', 'avail')}</span>
                                                    {p.barcode && <span className="text-[9px] font-mono text-gray-400">{p.barcode}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-left font-black text-indigo-600 text-[11px] dir-ltr">
                                            {(isSales || isReturn || isQuotation ? p.sellPrice : p.buyPrice).toLocaleString()}
                                        </div>
                                    </button>
                                )) : (
                                    <div className="p-4 text-center text-gray-400 text-[10px] font-bold">{tr('لا يوجد تطابق', 'No match')}</div>
                                )}
                            </div>
                        </>
                    )}
                </form>
            </div>

            {/* 4. Items Sheet (Excel-like) */}
            <div className="w-full bg-white border border-gray-200 rounded-xl p-2 shadow-sm">
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[620px] table-fixed text-[11px]">
                        <thead className="bg-slate-100 text-slate-600">
                            <tr>
                                <th className="w-10 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">#</th>
                                <th className="w-[42%] border-b border-slate-200 px-1.5 py-1.5 text-start font-black">{tr('الصنف/الوصف', 'Item / Description')}</th>
                                <th className="w-16 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('الكمية', 'Qty')}</th>
                                <th className="w-20 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('السعر', 'Price')}</th>
                                <th className="w-20 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('الإجمالي', 'Total')}</th>
                                <th className="w-16 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('المخزون', 'Stock')}</th>
                                <th className="w-12 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('حذف', 'Delete')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-6 text-center text-[11px] font-bold text-slate-400">
                                        {tr('لا توجد بنود بعد. أضف البنود من الأعلى.', 'No lines yet. Add lines from above.')}
                                    </td>
                                </tr>
                            )}
                            {items.map((item, idx) => {
                                const linkedProduct = item.productId ? products.find(p => p.id === item.productId) : null;
                                const stockOk = checkStock(item.productId, Number(item.quantity) || 0);
                                return (
                                    <tr key={idx} className="odd:bg-white even:bg-slate-50/40">
                                        <td className="border-b border-slate-100 px-1.5 py-1 text-center font-black text-slate-500">{idx + 1}</td>
                                        <td className="border-b border-slate-100 px-1.5 py-1">
                                            <input
                                                value={item.description}
                                                onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))}
                                                className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-bold outline-none focus:border-indigo-300"
                                            />
                                            <div className="mt-0.5 text-[9px] font-bold text-slate-400 truncate">
                                                {linkedProduct ? `${linkedProduct.itemCode || linkedProduct.barcode || linkedProduct.id}` : tr('بند يدوي', 'Manual line')}
                                            </div>
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                value={item.quantity}
                                                onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value))}
                                                className="w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[11px] font-black dir-ltr outline-none focus:border-indigo-300"
                                            />
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                value={item.unitPrice}
                                                onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value))}
                                                className="w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[11px] font-black dir-ltr outline-none focus:border-indigo-300"
                                            />
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1 text-center">
                                            <span className="font-black text-[11px] text-slate-800 dir-ltr">{Number(item.total || 0).toLocaleString()}</span>
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1 text-center text-[10px] font-black">
                                            {item.productId
                                                ? <span className={stockOk ? 'text-emerald-600' : 'text-rose-600'}>{stockOk ? tr('متاح', 'OK') : tr('غير كافٍ', 'Low')}</span>
                                                : <span className="text-slate-400">{tr('—', '—')}</span>}
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1 text-center">
                                            <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100">
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* 5. Fixed Totals Footer */}
            <div className="bg-slate-900 rounded-xl text-white p-3 shadow-lg z-20 layout-footer">

                {/* Expandable Discount / Tax summary row */}
                <div className="flex justify-between items-center mb-2 px-1">
                    <div className="flex gap-4">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{tr('خصم إضافي', 'Extra Disc')}</span>
                            <div className="relative w-20">
                                <input type="number" inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" className="w-full bg-slate-800 text-white text-[11px] font-black rounded-lg py-1 px-1.5 border border-slate-700 focus:border-indigo-500 text-center" />
                            </div>
                        </div>
                        {taxVisibleInInvoices && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{tr('الضريبة', 'Tax')} {taxEnabled ? '+' + totals.tax.toLocaleString() : '0'}</span>
                                <button type="button" onClick={() => setTaxEnabled(!taxEnabled)} className={`text-[9px] py-1 px-2 rounded-lg font-black mt-0.5 transition-colors ${taxEnabled ? 'bg-indigo-600/30 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>
                                    {taxEnabled ? tr('مشمولة', 'Included') : tr('بدون', 'None')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Final Total row */}
                <div className="flex items-center justify-between mb-3 border-t border-slate-800 pt-2 px-1">
                    <span className="text-[11px] font-black text-blue-400">{tr('الصافي النهائي', 'Final Net')}</span>
                    <span className="text-xl font-black tracking-tighter dir-ltr">{totals.total.toLocaleString()}</span>
                </div>

                {/* Action Buttons */}
                <button
                    onClick={handleSubmit}
                    className={`w-full py-2.5 rounded-xl font-black text-[13px] shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center justify-center gap-2 active:scale-95 transition-transform ${isQuotation ? 'bg-amber-600' : (isReturn || isPurchaseReturn) ? 'bg-rose-600' : 'bg-indigo-600'} text-white`}
                >
                    <CheckCircle2 size={16} />
                    {isQuotation
                        ? tr('حفظ المعاملة', 'Save Transaction')
                        : editingInvoice
                            ? tr('تحديث وترحيل الفاتورة', 'Update & Post Invoice')
                            : tr('ترحيل واعتماد الفاتورة', 'Post & Approve')}
                </button>
            </div>

            {/* Overlays / Modals */}
            {showBarcodeScanner && (
                <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col">
                    <div className="relative flex-1">
                        <div id="invoice-barcode-reader" className="w-full h-full"></div>
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div className="w-72 h-44 border-2 border-indigo-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,.4)]"></div>
                        </div>
                    </div>
                    <div className="shrink-0 p-4 bg-black flex items-center justify-between gap-3 safe-area-bottom">
                        <span className="text-[11px] font-bold text-white">{tr('وجّه الكاميرا نحو الباركود', 'Point camera')}</span>
                        <button type="button" onClick={() => setShowBarcodeScanner(false)} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-black">
                            {tr('إلغاء', 'Cancel')}
                        </button>
                    </div>
                </div>
            )}

            {showQuickContact && (
                <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-end justify-center animate-in fade-in">
                    <div className="bg-white w-full h-[80dvh] rounded-t-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
                        <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <h3 className="text-sm font-black text-gray-800">{tr('إضافة جديد', 'Add New')}</h3>
                            <button onClick={() => setShowQuickContact(false)} className="bg-gray-200 hover:bg-gray-300 rounded-full p-1.5 transition-colors"><X size={14} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <ContactEditorDialog
                                mode="INVOICE"
                                initialType={(isSales || isReturn || isQuotation) ? 'CUSTOMER' : 'SUPPLIER'}
                                allowedTypes={['CUSTOMER', 'SUPPLIER']}
                                onClose={() => setShowQuickContact(false)}
                                onSave={(contact) => { setContactId(contact.id); setShowQuickContact(false); }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showQuickProduct && (
                <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
                    <div className="bg-white w-full max-w-[320px] rounded-[1.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center px-1 mb-1">
                            <h3 className="text-[13px] font-black text-slate-800">
                                {isManualItem ? tr('تفاصيل البند', 'Item Details') : tr('إضافة صنف', 'Add Item')}
                            </h3>
                            <button onClick={() => setShowQuickProduct(false)} className="text-gray-400 hover:text-slate-700 bg-gray-100 p-1.5 rounded-full"><X size={14} /></button>
                        </div>

                        {!isManualItem && (
                            <div className="relative">
                                <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('ابحث بالاسم', 'Search by name')}</label>
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={tr('عن ماذا تبحث؟', 'What are you looking for?')}
                                    className="w-full bg-gray-50 border border-gray-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-indigo-400 outline-none"
                                />
                            </div>
                        )}

                        {isManualItem && (
                            <div className="relative">
                                <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('البيان', 'Description')}</label>
                                <input
                                    value={manualItemDesc}
                                    onChange={e => setManualItemDesc(e.target.value)}
                                    placeholder={tr('وصف الخدمة', 'Service description')}
                                    className="w-full bg-amber-50/50 border border-amber-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-amber-400 outline-none"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('الكمية', 'Quantity')}</label>
                                <input
                                    type="number" inputMode="decimal"
                                    value={isManualItem ? manualItemQty : 1}
                                    onChange={e => isManualItem ? setManualItemQty(e.target.value) : {}}
                                    className="w-full text-center bg-gray-50 border border-gray-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-indigo-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('السعر', 'Price')}</label>
                                <input
                                    type="number" inputMode="decimal"
                                    value={isManualItem ? manualItemPrice : 0}
                                    onChange={e => isManualItem ? setManualItemPrice(e.target.value) : {}}
                                    className="w-full text-center bg-gray-50 border border-gray-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-indigo-400 outline-none dir-ltr"
                                    min="0"
                                />
                            </div>
                        </div>

                        <div className="pt-1">
                            <button
                                onClick={() => {
                                    if (isManualItem) {
                                        addManualItem();
                                        setShowQuickProduct(false);
                                    } else {
                                        // Normally handle product add
                                        setShowQuickProduct(false);
                                    }
                                }}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-black rounded-xl shadow-lg active:scale-95 transition-all"
                            >
                                {tr('إضافة والتالي', 'Add')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


// --- VOUCHER SCREEN ---
interface CashLine {
    id: string;
    accountId: string;
    amount: string;
}

interface CheckLine {
    id: string;
    bankName: string; // Used for incoming checks, or display name for outgoing
    bankAccountId?: string; // NEW: For outgoing checks, link to internal bank account
    accountNumber?: string; // NEW: Account Number field
    checkNumber: string;
    dueDate: string;
    amount: string;
    imageUrls?: string[];
    isEndorsed?: boolean; // NEW: Flag for endorsed checks
    originalCheckId?: string; // NEW: ID of the check being endorsed
}

interface VoucherInvoiceAllocationLine {
    invoiceId: string;
    amount: string;
}

const VoucherScreen: React.FC<{
    initialType?: 'RECEIPT' | 'PAYMENT';
    sharedState: any;
    updateCurrency: (code: string) => void;
    onSuccess: () => void;
    initialVoucherId?: string;
}> = ({ initialType = 'RECEIPT', sharedState, updateCurrency, onSuccess, initialVoucherId }) => {
    const {
        addTransaction, contacts, accounts, addCheck, checks, updateCheck, deleteVoucher, baseCurrency, companySettings,
        invoices, invoiceSettlements, transactions, upsertInvoiceSettlementsForVoucher
    } = useAccounting();
    const [voucherType, setVoucherType] = useState<'RECEIPT' | 'PAYMENT'>(initialType);
    const [contactId, setContactId] = useState('');
    const [description, setDescription] = useState('');
    const [showQuickContact, setShowQuickContact] = useState(false);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayBankName = (bankName: string, bankAccountId?: string) => {
        const linkedAccount = bankAccountId ? accounts.find(a => a.id === bankAccountId) : undefined;
        if (linkedAccount) return displayAccountName(linkedAccount);
        return getDisplayAccountName({ id: bankAccountId || '', name: bankName }, isEnglish);
    };

    // Multi-line Payments
    const [cashLines, setCashLines] = useState<CashLine[]>([]);
    const [checkLines, setCheckLines] = useState<CheckLine[]>([]);
    const [invoiceAllocations, setInvoiceAllocations] = useState<VoucherInvoiceAllocationLine[]>([]);

    // For Endorsement Selection
    const [showEndorseSelect, setShowEndorseSelect] = useState(false);
    const [amountNotice, setAmountNotice] = useState<string | null>(null);

    const filteredContacts = contacts.filter(c =>
        c.type === 'CUSTOMER' ||
        c.type === 'SUPPLIER' ||
        c.type === 'EMPLOYEE' ||
        c.type === 'PARTNER'
    );
    const selectedContact = useMemo(
        () => contacts.find(c => c.id === contactId),
        [contacts, contactId]
    );
    const selectedContactLabel = selectedContact ? displayContactName(selectedContact) : '';
    const editingVoucherParts = useMemo(() => {
        if (!initialVoucherId) return [] as Transaction[];
        return transactions
            .filter(tx => tx.voucherId === initialVoucherId || tx.id === initialVoucherId)
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [initialVoucherId, transactions]);
    const editBlockedReason = useMemo(() => {
        if (editingVoucherParts.length === 0) return '';
        if (editingVoucherParts.some(tx => tx.isReversal || tx.reversedById)) {
            return tr('لا يمكن تعديل سند تم عكسه محاسبيًا.', 'Reversed vouchers cannot be edited directly.');
        }
        return '';
    }, [editingVoucherParts, isEnglish]);
    const resolveVoucherTransactionCheck = (transaction: Transaction) => {
        if (transaction.checkId) {
            return checks.find(check => check.id === transaction.checkId) || null;
        }
        const hashIndex = String(transaction.description || '').indexOf('#');
        if (hashIndex < 0) return null;
        const tail = String(transaction.description || '').slice(hashIndex + 1);
        const checkNumber = tail.split(' ')[0]?.split('-')[0]?.trim();
        if (!checkNumber) return null;
        return checks.find(check =>
            String(check.checkNumber || '').trim() === checkNumber &&
            Math.abs((Number(check.amount) || 0) - (Number(transaction.amount) || 0)) <= 0.005 &&
            (
                check.contactId === transaction.contactId ||
                check.endorseeContactId === transaction.contactId
            )
        ) || null;
    };
    const extractVoucherDescription = (parts: Transaction[], contactName: string) => {
        const partnerNote = tr('الترحيل على جاري الشريك', 'Posted to partner current account');
        for (const part of parts) {
            const raw = String(part.description || '').trim();
            if (!raw) continue;
            const marker = contactName ? `${contactName} - ` : '';
            let extracted = raw;
            if (marker && raw.includes(marker)) {
                extracted = raw.slice(raw.indexOf(marker) + marker.length).trim();
            }
            if (extracted === partnerNote) return '';
            if (extracted.endsWith(` - ${partnerNote}`)) {
                extracted = extracted.slice(0, -(` - ${partnerNote}`.length)).trim();
            }
            if (extracted && extracted !== raw) return extracted;
        }
        return '';
    };
    const selectedCounterAccountId = useMemo(() => {
        if (!selectedContact) return voucherType === 'RECEIPT' ? 'acc_receivable' : 'acc_payable';
        if (selectedContact.type === 'EMPLOYEE') return 'acc_accrued_salaries';
        if (selectedContact.type === 'SUPPLIER') return 'acc_payable';
        if (selectedContact.type === 'PARTNER') {
            return selectedContact.currentAccountId || selectedContact.linkedAccountId || '';
        }
        if (selectedContact.type === 'CUSTOMER') return 'acc_receivable';
        return voucherType === 'RECEIPT' ? 'acc_receivable' : 'acc_payable';
    }, [selectedContact, voucherType]);
    const selectedCounterAccount = useMemo(
        () => accounts.find(a => a.id === selectedCounterAccountId),
        [accounts, selectedCounterAccountId]
    );
    const financialAccounts = useMemo(() => accounts.filter(a => !a.isGroup && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root')), [accounts]);
    const voucherInvoiceAllocationEnabled = companySettings.voucherInvoiceAllocationEnabled ?? true;

    // Internal Bank Accounts for Outgoing Checks
    const bankAccounts = useMemo(() => accounts.filter(a => !a.isGroup && a.parentId === 'acc_bank_root'), [accounts]);

    // Available Checks for Endorsement (Incoming & Pending)
    const availableChecks = useMemo(() => checks.filter(c => c.type === 'INCOMING' && c.status === 'PENDING'), [checks]);

    const parseAmountInput = (value: string): number => {
        const normalized = toEnglishDigits(String(value || '')).replace(/[^\d.\-]/g, '');
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    useEffect(() => {
        if (!amountNotice) return;
        const timer = window.setTimeout(() => setAmountNotice(null), 1600);
        return () => window.clearTimeout(timer);
    }, [amountNotice]);

    const notifyAmountAdded = (rawValue: string) => {
        if (!(companySettings.notifyAfterAmountAdded ?? true)) return;
        const amount = parseAmountInput(rawValue);
        if (!(amount > 0)) return;
        const formatted = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
        setAmountNotice(tr(`تمت إضافة مبلغ ${formatted}`, `Amount ${formatted} added`));
    };

    useEffect(() => {
        if (editingVoucherParts.length === 0) return;

        const first = editingVoucherParts[0];
        const nextVoucherType = first.type === TransactionType.INCOME ? 'RECEIPT' : 'PAYMENT';
        const nextContactId = first.contactId || '';
        const contactName = displayContactName(contacts.find(contact => contact.id === nextContactId) || null);
        const nextCashLines: CashLine[] = [];
        const nextCheckLines: CheckLine[] = [];

        editingVoucherParts.forEach((part, index) => {
            const linkedCheck = resolveVoucherTransactionCheck(part);
            if (linkedCheck) {
                const isEndorsed = linkedCheck.type === 'INCOMING' && linkedCheck.status === 'ENDORSED'
                    && (part.debitAccountId === 'acc_cheques_hand' || part.creditAccountId === 'acc_cheques_hand');
                nextCheckLines.push({
                    id: `edit-check-${index}`,
                    bankName: linkedCheck.bankName,
                    bankAccountId: linkedCheck.bankAccountId,
                    accountNumber: linkedCheck.accountNumber,
                    checkNumber: linkedCheck.checkNumber,
                    dueDate: linkedCheck.dueDate,
                    amount: String(linkedCheck.amount),
                    imageUrls: linkedCheck.imageUrls || (linkedCheck.imageUrl ? [linkedCheck.imageUrl] : []),
                    isEndorsed,
                    originalCheckId: isEndorsed ? linkedCheck.id : undefined
                });
                return;
            }

            const accountId = nextVoucherType === 'RECEIPT' ? (part.debitAccountId || '') : (part.creditAccountId || '');
            nextCashLines.push({
                id: `edit-cash-${index}`,
                accountId,
                amount: String(part.amount || '')
            });
        });

        setVoucherType(nextVoucherType);
        setContactId(nextContactId);
        setDescription(extractVoucherDescription(editingVoucherParts, contactName));
        setCashLines(nextCashLines);
        setCheckLines(nextCheckLines);
        setInvoiceAllocations(
            invoiceSettlements
                .filter(settlement => settlement.voucherId === initialVoucherId)
                .map(settlement => ({
                    invoiceId: settlement.invoiceId,
                    amount: String(settlement.amount)
                }))
        );
    }, [editingVoucherParts, initialVoucherId, invoiceSettlements, contacts, isEnglish]);

    const voucherRate = Math.max(0, Number(sharedState.rate) || 0) || 1;
    const voucherCurrency = sharedState.currency || baseCurrency;
    const postedSettlements = useMemo(
        () => invoiceSettlements.filter((s: InvoiceSettlement) =>
            s
            && s.invoiceId
            && (Number(s.amountBase) || 0) > 0
            && (!initialVoucherId || s.voucherId !== initialVoucherId)
        ),
        [invoiceSettlements, initialVoucherId]
    );

    const allocationCandidateInvoices = useMemo(() => {
        if (!contactId) return [] as Invoice[];
        const desiredType = voucherType === 'RECEIPT' ? TransactionType.INCOME : TransactionType.EXPENSE;
        return invoices
            .filter(inv => inv.customerId === contactId)
            .filter(inv => inv.paymentType === 'CREDIT')
            .filter(inv => inv.postingStatus !== 'DRAFT')
            .filter(inv => inv.status !== 'CANCELLED' && inv.status !== 'QUOTATION')
            .filter(inv => inv.type === desiredType)
            .filter(inv => inv.category !== 'sales_return' && inv.category !== 'purchase_return')
            .map(inv => {
                const remainingBase = getInvoiceRemainingBase(inv, postedSettlements);
                return { ...inv, __remainingBase: remainingBase } as Invoice & { __remainingBase: number };
            })
            .filter(inv => inv.__remainingBase > 0.005)
            .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
    }, [contactId, voucherType, invoices, postedSettlements]);

    useEffect(() => {
        if (!contactId) {
            setInvoiceAllocations([]);
            return;
        }
        setInvoiceAllocations(prev => {
            const currentMap = new Map(prev.map(item => [item.invoiceId, item.amount]));
            return allocationCandidateInvoices.map(inv => ({
                invoiceId: inv.id,
                amount: currentMap.get(inv.id) || ''
            }));
        });
    }, [contactId, voucherType, allocationCandidateInvoices]);

    const updateInvoiceAllocation = (invoiceId: string, amount: string) => {
        setInvoiceAllocations(prev => prev.map(line => line.invoiceId === invoiceId ? { ...line, amount } : line));
    };

    const allocationRows = useMemo(() => {
        const allocMap = new Map<string, number>(invoiceAllocations.map(line => [line.invoiceId, parseAmountInput(line.amount)]));
        return allocationCandidateInvoices.map(inv => {
            const allocatedCurrent = Math.max(0, allocMap.get(inv.id) || 0);
            const remainingInvoiceCurrency = inv.exchangeRate > 0
                ? inv.__remainingBase / inv.exchangeRate
                : inv.totalAmount;
            const maxAllocInVoucherCurrency = voucherRate > 0 ? inv.__remainingBase / voucherRate : inv.__remainingBase;
            return {
                invoice: inv,
                allocatedCurrent,
                remainingInvoiceCurrency: Math.max(0, remainingInvoiceCurrency),
                maxAllocInVoucherCurrency: Math.max(0, maxAllocInVoucherCurrency)
            };
        });
    }, [allocationCandidateInvoices, invoiceAllocations, voucherRate]);

    const totalAllocatedToInvoices = useMemo(
        () => Number(allocationRows.reduce((sum, row) => sum + Math.max(0, row.allocatedCurrent), 0).toFixed(2)),
        [allocationRows]
    );

    const addCashLine = () => {
        setCashLines([...cashLines, { id: Math.random().toString(), accountId: '', amount: '' }]);
    };

    const addCheckLine = () => {
        setCheckLines([...checkLines, { id: Math.random().toString(), bankName: '', accountNumber: '', checkNumber: '', dueDate: '', amount: '', imageUrls: [] }]);
    };

    const addEndorsedCheckLine = (check: CheckTypeData) => {
        const endorsedImages = Array.isArray(check.imageUrls)
            ? check.imageUrls.filter(Boolean).slice(0, 2)
            : (check.imageUrl ? [check.imageUrl] : []);

        setCheckLines([...checkLines, {
            id: Math.random().toString(),
            bankName: check.bankName,
            accountNumber: check.accountNumber,
            checkNumber: check.checkNumber,
            dueDate: check.dueDate,
            amount: check.amount.toString(),
            imageUrls: endorsedImages,
            isEndorsed: true,
            originalCheckId: check.id
        }]);
        setShowEndorseSelect(false);
    };

    const removeLine = (type: 'CASH' | 'CHECK', id: string) => {
        if (type === 'CASH') setCashLines(prev => prev.filter(l => l.id !== id));
        else setCheckLines(prev => prev.filter(l => l.id !== id));
    };

    const updateCashLine = (id: string, field: keyof CashLine, val: string) => {
        setCashLines(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
    };

    const updateCheckLine = (id: string, field: keyof CheckLine, val: string) => {
        setCheckLines(prev => prev.map(l => {
            if (l.id !== id) return l;
            const updates = { [field]: val } as any;

            // If selecting a bank account for outgoing check, also set the bankName for display/record
            if (field === 'bankAccountId') {
                const acc = bankAccounts.find(a => a.id === val);
                if (acc) updates.bankName = acc.name;
            }

            return { ...l, ...updates };
        }));
    };

    const handleSelectCheckImage = async (lineId: string, slotIndex: number, file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert(tr('يرجى اختيار ملف صورة فقط.', 'Please select an image file only.'));
            return;
        }

        // Keep size small because checks are stored in local app state/local storage.
        const maxSizeBytes = 2 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            alert(tr('حجم الصورة كبير. الحد الأقصى 2MB.', 'Image is too large. Maximum allowed is 2MB.'));
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            setCheckLines(prev => prev.map(l => {
                if (l.id !== lineId) return l;
                const nextImages = Array.isArray(l.imageUrls) ? [...l.imageUrls] : [];
                nextImages[slotIndex] = dataUrl;
                return { ...l, imageUrls: nextImages.slice(0, 2) };
            }));
        } catch {
            alert(tr('تعذر قراءة الصورة. حاول مرة أخرى.', 'Could not read image. Please try again.'));
        }
    };

    const clearCheckImage = (lineId: string, slotIndex: number) => {
        setCheckLines(prev => prev.map(l => {
            if (l.id !== lineId) return l;
            const nextImages = Array.isArray(l.imageUrls) ? [...l.imageUrls] : [];
            nextImages[slotIndex] = '';
            return { ...l, imageUrls: nextImages };
        }));
    };

    const totalAmount = useMemo(() => {
        const cashTotal = cashLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
        const checkTotal = checkLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
        return cashTotal + checkTotal;
    }, [cashLines, checkLines]);

    const handleSubmit = () => {
        if (!sharedState.date) return alert(tr('يرجى تحديد تاريخ السند', 'Please select voucher date'));
        if (totalAmount <= 0) return alert(tr('قيمة السند يجب أن تكون أكبر من صفر', 'Voucher total must be greater than zero'));
        if (editBlockedReason) return alert(editBlockedReason);

        const normalizedAllocations = voucherInvoiceAllocationEnabled ? allocationRows
            .map(row => ({
                row,
                amount: parseAmountInput(invoiceAllocations.find(x => x.invoiceId === row.invoice.id)?.amount || '')
            }))
            .filter(entry => entry.amount > 0) : [];

        const invalidAllocation = voucherInvoiceAllocationEnabled
            ? normalizedAllocations.find(entry => entry.amount - entry.row.maxAllocInVoucherCurrency > 0.005)
            : undefined;
        if (invalidAllocation) {
            return alert(tr('قيمة التخصيص أكبر من المتبقي في الفاتورة.', 'Allocation amount exceeds invoice remaining balance.'));
        }

        const allocationTotal = voucherInvoiceAllocationEnabled
            ? normalizedAllocations.reduce((sum, entry) => sum + entry.amount, 0)
            : 0;
        if (allocationTotal - totalAmount > 0.005) {
            return alert(tr('إجمالي التخصيص على الفواتير أكبر من قيمة السند.', 'Total allocation exceeds voucher total.'));
        }

        const voucherId = initialVoucherId || `VOU-${Date.now().toString().slice(-6)}`;
        const isReceipt = voucherType === 'RECEIPT';
        const fallbackContactId = isReceipt ? 'cash_customer' : 'cash_supplier';
        const resolvedContactId = contactId || (contacts.some(c => c.id === fallbackContactId) ? fallbackContactId : '');
        const contact = contacts.find(c => c.id === resolvedContactId);
        const contactName = displayContactName(contact) || tr('عام', 'General');
        const noteText = description.trim();
        const partnerFlowNote = contact?.type === 'PARTNER'
            ? tr('الترحيل على جاري الشريك', 'Posted to partner current account')
            : '';
        const lineExtraNote = [noteText, partnerFlowNote].filter(Boolean).join(' - ');

        let targetAccountId = isReceipt ? 'acc_receivable' : 'acc_payable';
        if (contact?.type === 'EMPLOYEE') {
            targetAccountId = 'acc_accrued_salaries'; // Use Employee Liability Account
        } else if (contact?.type === 'SUPPLIER') {
            targetAccountId = 'acc_payable';
        } else if (contact?.type === 'PARTNER') {
            targetAccountId = contact.currentAccountId || contact.linkedAccountId || 'acc_partner_current';
        } else if (contact?.type === 'CUSTOMER') {
            targetAccountId = 'acc_receivable';
        }
        if (contact?.type === 'PARTNER' && !(contact.currentAccountId || contact.linkedAccountId)) {
            return alert(tr('يرجى ربط الشريك بحسابه الجاري من شاشة الدليل أولاً.', 'Please link partner current account from Directory first.'));
        }

        if (initialVoucherId) {
            const deleteResult = deleteVoucher(initialVoucherId);
            if (!deleteResult.ok) return alert(deleteResult.message);
        }

        let createdEntries = 0;
        const creationErrors: string[] = [];

        // Process Cash Lines
        cashLines.forEach(line => {
            const val = parseFloat(line.amount);
            if (val > 0 && line.accountId) {
                const result = addTransaction({
                    voucherId,
                    amount: val,
                    description: `${isReceipt ? tr('قبض', 'Receipt') : tr('صرف', 'Payment')} ${tr('نقدي', 'Cash')} - ${contactName}${lineExtraNote ? ` - ${lineExtraNote}` : ''}`,
                    category: isReceipt ? 'voucher_receipt' : 'voucher_payment',
                    type: isReceipt ? TransactionType.INCOME : TransactionType.EXPENSE,
                    date: sharedState.date,
                    debitAccountId: isReceipt ? line.accountId : targetAccountId,
                    creditAccountId: isReceipt ? targetAccountId : line.accountId,
                    contactId: resolvedContactId || undefined,
                    currency: sharedState.currency,
                    exchangeRate: sharedState.rate,
                    status: 'POSTED'
                });
                if (result.ok) createdEntries += 1;
                else creationErrors.push(result.message);
            }
        });

        // Process Check Lines
        checkLines.forEach(line => {
            const val = parseFloat(line.amount);
            if (val > 0) {
                if (line.isEndorsed && line.originalCheckId) {
                    // --- Handling Endorsed Check (Payment Only) ---
                    // 1. Update original check status
                    updateCheck(line.originalCheckId, {
                        status: 'ENDORSED',
                        endorseeContactId: resolvedContactId || undefined,
                        endorseeName: contactName
                    });

                    // 2. Transaction: Debit Supplier, Credit Checks on Hand (Asset)
                    const result = addTransaction({
                        voucherId,
                        checkId: line.originalCheckId,
                        amount: val,
                        description: `${tr('تجيير شيك رقم', 'Endorsed check #')} ${line.checkNumber} - ${displayBankName(line.bankName, line.bankAccountId)} - ${tr('للمستفيد', 'to')} ${contactName}${lineExtraNote ? ` - ${lineExtraNote}` : ''}`,
                        category: 'voucher_payment',
                        type: TransactionType.EXPENSE,
                        date: sharedState.date,
                        debitAccountId: targetAccountId, // Supplier or Employee
                        creditAccountId: 'acc_cheques_hand', // Asset Account holding the check
                        contactId: resolvedContactId || undefined,
                        currency: sharedState.currency,
                        exchangeRate: sharedState.rate,
                        status: 'POSTED'
                    });
                    if (result.ok) createdEntries += 1;
                    else creationErrors.push(result.message);

                } else {
                    // --- Normal Check Issue/Receipt ---

                    // 1. Create Check Record
                    const checkId = Math.random().toString(36).substr(2, 9);
                    addCheck({
                        id: checkId,
                        checkNumber: line.checkNumber,
                        bankName: line.bankName,
                        accountNumber: line.accountNumber,
                        bankAccountId: !isReceipt ? line.bankAccountId : undefined,
                        amount: val,
                        currency: sharedState.currency,
                        dueDate: line.dueDate,
                        issueDate: sharedState.date,
                        type: isReceipt ? 'INCOMING' : 'OUTGOING',
                        status: 'PENDING',
                        contactId: resolvedContactId || undefined,
                        imageUrls: (line.imageUrls || []).filter(Boolean).slice(0, 2),
                        imageUrl: (line.imageUrls || []).find(Boolean),
                        description: description
                    });

                    // 2. Create Transaction
                    const result = addTransaction({
                        voucherId,
                        checkId: checkId,
                        amount: val,
                        description: `${tr('شيك', 'Check')} ${isReceipt ? tr('وارد', 'Incoming') : tr('صادر', 'Outgoing')} #${line.checkNumber} - ${contactName}${lineExtraNote ? ` - ${lineExtraNote}` : ''}`,
                        category: isReceipt ? 'voucher_receipt' : 'voucher_payment',
                        type: isReceipt ? TransactionType.INCOME : TransactionType.EXPENSE,
                        date: sharedState.date,
                        debitAccountId: isReceipt ? 'acc_cheques_hand' : targetAccountId,
                        creditAccountId: isReceipt ? targetAccountId : 'acc_notes_payable',
                        contactId: resolvedContactId || undefined,
                        currency: sharedState.currency,
                        exchangeRate: sharedState.rate,
                        status: 'POSTED'
                    });
                    if (result.ok) createdEntries += 1;
                    else creationErrors.push(result.message);
                }
            }
        });

        if (createdEntries === 0) {
            const invalidCashLines = cashLines.some(line => (parseFloat(line.amount) || 0) > 0 && !line.accountId);
            const message = creationErrors[0]
                || (invalidCashLines
                    ? tr('يرجى اختيار الصندوق/البنك لكل سطر نقدي يحتوي مبلغًا.', 'Please select a cash/bank account for every cash line with amount.')
                    : tr('لم يتم إنشاء أي بند في السند. تأكد من تعبئة الحسابات والمبالغ بشكل صحيح.', 'No voucher entries were created. Check accounts and amounts.'));
            return alert(message);
        }

        if (creationErrors.length > 0) {
            return alert(`${tr('تعذر ترحيل بعض بنود السند:', 'Some voucher lines could not be posted:')}\n${creationErrors.slice(0, 5).join('\n')}`);
        }

        if (voucherInvoiceAllocationEnabled && normalizedAllocations.length > 0) {
            const allocationResult = upsertInvoiceSettlementsForVoucher(
                voucherId,
                normalizedAllocations.map(({ row, amount }) => ({
                    invoiceId: row.invoice.id,
                    voucherId,
                    contactId: resolvedContactId || undefined,
                    date: sharedState.date,
                    amount: Number(amount.toFixed(2)),
                    amountBase: Number((amount * voucherRate).toFixed(6)),
                    currency: voucherCurrency,
                    exchangeRate: voucherRate,
                    sourceType: isReceipt ? 'VOUCHER_RECEIPT' : 'VOUCHER_PAYMENT',
                    note: description || undefined
                }))
            );
            if (!allocationResult.ok) {
                return alert(allocationResult.message);
            }
        }

        alert(tr('تم ترحيل السند بنجاح', 'Voucher posted successfully'));
        onSuccess();
    };

    const sheetInputClass = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none";
    const sheetHeaderClass = "px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500";
    const sheetIndexClass = "flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-black text-slate-500";

    return (
        <div
            className="transaction-mobile-form app-page w-full max-w-full px-2 sm:px-3 space-y-3 pb-[calc(var(--app-safe-bottom)+0.8rem)] overflow-x-hidden"
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
        >
            {amountNotice && (
                <div className="sticky top-2 z-20 mx-1 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                    {amountNotice}
                </div>
            )}
            <div className="transaction-entry-section bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                <div className="flex bg-gray-50 p-1 rounded-2xl mb-4">
                    <button onClick={() => setVoucherType('RECEIPT')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${voucherType === 'RECEIPT' ? 'bg-white shadow text-emerald-600' : 'text-gray-400'}`}>{tr('سند قبض (وارد)', 'Receipt Voucher (Incoming)')}</button>
                    <button onClick={() => setVoucherType('PAYMENT')} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${voucherType === 'PAYMENT' ? 'bg-white shadow text-rose-600' : 'text-gray-400'}`}>{tr('سند صرف (صادر)', 'Payment Voucher (Outgoing)')}</button>
                </div>

                <div className="space-y-4">
                    <div className="transaction-entry-split flex gap-2 min-w-0">
                        <div className="flex-1 min-w-0 space-y-2">
                            <SearchableContactSelect
                                contacts={filteredContacts}
                                selectedId={contactId}
                                selectedLabel={selectedContactLabel}
                                onSelect={setContactId}
                                displayContactName={displayContactName}
                                placeholder={tr('اختر الطرف أو ابحث بالاسم أو الجوال...', 'Select or search by name or phone...')}
                                emptyLabel={tr('لا يوجد طرف مطابق.', 'No matching contact found.')}
                                isEnglish={isEnglish}
                                inputClassName={inputClass + " !py-3"}
                            />
                        </div>
                        <button onClick={() => setShowQuickContact(true)} className="transaction-entry-plus p-4 bg-blue-50 text-blue-600 rounded-[1.5rem] shrink-0 self-end"><UserPlus size={20} /></button>
                    </div>
                    <input value={description} onChange={e => setDescription(e.target.value)} placeholder={tr('البيان / ملاحظات السند...', 'Voucher description / notes...')} className={inputClass} />
                    {selectedContact?.type === 'PARTNER' && (
                        <div className={`rounded-2xl border p-3 text-[11px] font-black ${selectedCounterAccountId ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span>{tr('حساب جاري الشريك', 'Partner current account')}</span>
                                <span className="dir-ltr">{selectedCounterAccount ? displayAccountName(selectedCounterAccount) : tr('غير مربوط', 'Not linked')}</span>
                            </div>
                            <div className="mt-1">
                                {voucherType === 'PAYMENT'
                                    ? tr('عند الصرف: يتم ترحيل المبلغ على جاري الشريك مباشرة.', 'On payment: amount is posted directly to partner current.')
                                    : tr('عند القبض: يتم إضافة المبلغ إلى جاري الشريك مباشرة.', 'On receipt: amount is added directly to partner current.')}
                            </div>
                            {!selectedCounterAccountId && (
                                <div className="mt-1">
                                    {tr('يرجى ربط الشريك بحسابه الجاري من الدليل أولاً.', 'Please link this partner to current account from Directory first.')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {voucherInvoiceAllocationEnabled && contactId && allocationRows.length > 0 && (
                <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="font-black text-sm text-slate-700">{tr('تخصيص السداد على الفواتير', 'Allocate payment to invoices')}</h3>
                            <p className="text-[10px] font-bold text-slate-400">
                                {tr('اختياري: يحدد الفواتير التي تم تسديدها بهذا السند لتحسين المتبقي والمتأخرات.', 'Optional: assign this voucher to open invoices to calculate outstanding/overdue correctly.')}
                            </p>
                        </div>
                        <div className="text-xs font-black text-blue-600 dir-ltr">
                            {tr('المخصص', 'Allocated')}: {totalAllocatedToInvoices.toLocaleString()} {voucherCurrency}
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[760px] text-[11px]">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="w-10 border-b border-slate-200 px-2 py-2 text-center font-black">#</th>
                                    <th className="border-b border-slate-200 px-2 py-2 text-start font-black">{tr('الفاتورة', 'Invoice')}</th>
                                    <th className="w-32 border-b border-slate-200 px-2 py-2 text-center font-black">{tr('الاستحقاق', 'Due')}</th>
                                    <th className="w-40 border-b border-slate-200 px-2 py-2 text-center font-black">{tr('المتبقي', 'Remaining')}</th>
                                    <th className="w-36 border-b border-slate-200 px-2 py-2 text-center font-black">{tr('المخصص', 'Allocated')}</th>
                                    <th className="w-32 border-b border-slate-200 px-2 py-2 text-center font-black">{tr('إجراءات', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocationRows.map((row, idx) => {
                                    const inv = row.invoice;
                                    const due = inv.dueDate || inv.date;
                                    const isOver = due < sharedState.date;
                                    const allocatedValue = invoiceAllocations.find(x => x.invoiceId === inv.id)?.amount || '';
                                    return (
                                        <tr key={inv.id} className="odd:bg-white even:bg-slate-50/40">
                                            <td className="border-b border-slate-100 px-2 py-1.5 text-center font-black text-slate-500">{idx + 1}</td>
                                            <td className="border-b border-slate-100 px-2 py-1.5">
                                                <div className="font-black text-slate-700 truncate">{inv.invoiceNumber}</div>
                                                <div className="text-[10px] font-bold text-slate-400 truncate">{displayContactName(contacts.find(c => c.id === inv.customerId))}</div>
                                            </td>
                                            <td className="border-b border-slate-100 px-2 py-1.5 text-center">
                                                <div className="font-black text-slate-700">{due}</div>
                                                <div className={`text-[10px] font-bold ${isOver ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                    {isOver ? tr('متأخرة', 'Overdue') : tr('مفتوحة', 'Open')}
                                                </div>
                                            </td>
                                            <td className="border-b border-slate-100 px-2 py-1.5 text-center">
                                                <div className="text-[10px] font-bold text-slate-400">
                                                    {tr('إجمالي', 'Total')}: <span className="dir-ltr">{(inv.totalAmount || 0).toLocaleString()} {inv.currency}</span>
                                                </div>
                                                <div className="font-black text-amber-600 dir-ltr">
                                                    {row.remainingInvoiceCurrency.toLocaleString(undefined, { maximumFractionDigits: 2 })} {inv.currency}
                                                </div>
                                            </td>
                                            <td className="border-b border-slate-100 px-2 py-1.5">
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={allocatedValue}
                                                    onChange={e => updateInvoiceAllocation(inv.id, e.target.value)}
                                                    onBlur={e => notifyAmountAdded(e.target.value)}
                                                    placeholder={tr('مبلغ مخصص', 'Allocated amount')}
                                                    className="w-full rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-center text-[11px] font-black dir-ltr outline-none focus:border-blue-300"
                                                />
                                            </td>
                                            <td className="border-b border-slate-100 px-2 py-1.5 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateInvoiceAllocation(inv.id, String(Number(row.maxAllocInVoucherCurrency.toFixed(2))))}
                                                        className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600 transition-colors hover:bg-blue-100"
                                                    >
                                                        {tr('تعبئة', 'Fill')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateInvoiceAllocation(inv.id, '')}
                                                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-black text-gray-500 transition-colors hover:bg-gray-100"
                                                    >
                                                        {tr('مسح', 'Clear')}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Cash Lines */}
            <div className="space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2 px-2">
                    <h3 className="font-black text-gray-600 text-sm">{tr('المدفوعات النقدية / التحويل', 'Cash / Transfer Lines')}</h3>
                    <button onClick={addCashLine} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100 transition-colors">{tr('+ إضافة', '+ Add')}</button>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="hidden lg:grid lg:grid-cols-[3rem_minmax(0,2fr)_minmax(0,1fr)_3rem] gap-2 border-b border-slate-200 bg-slate-50">
                        <div className={`${sheetHeaderClass} text-center`}>#</div>
                        <div className={sheetHeaderClass}>{tr('الحساب المالي', 'Cash / Bank')}</div>
                        <div className={`${sheetHeaderClass} text-center`}>{tr('المبلغ', 'Amount')}</div>
                        <div className={`${sheetHeaderClass} text-center`}>{tr('حذف', 'Delete')}</div>
                    </div>
                    <div className="divide-y divide-slate-200">
                        {cashLines.map((line, idx) => (
                            <div key={line.id} className="transaction-line-card voucher-line-grid grid grid-cols-1 gap-2 p-3 lg:grid-cols-[3rem_minmax(0,2fr)_minmax(0,1fr)_3rem] lg:items-center animate-in slide-in-from-right-2">
                                <div className={`${sheetIndexClass} hidden lg:flex`}>{idx + 1}</div>
                                <select value={line.accountId} onChange={e => updateCashLine(line.id, 'accountId', e.target.value)} className={sheetInputClass}>
                                    <option value="">{tr('الصندوق / البنك', 'Cash / Bank')}</option>
                                    {financialAccounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                </select>
                                <input type="number" inputMode="decimal" placeholder={tr('المبلغ', 'Amount')} value={line.amount} onChange={e => updateCashLine(line.id, 'amount', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className={`${sheetInputClass} text-center dir-ltr font-black`} />
                                <button onClick={() => removeLine('CASH', line.id)} className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-rose-500 transition hover:bg-rose-100"><Trash2 size={15} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {/* Check Lines */}
            <div className="space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2 px-2">
                    <h3 className="font-black text-gray-600 text-sm">{tr('الشيكات والأوراق المالية', 'Checks and Instruments')}</h3>
                    <div className="flex flex-wrap gap-2">
                        {voucherType === 'PAYMENT' && (
                            <button onClick={() => setShowEndorseSelect(true)} className="text-[10px] bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg font-bold hover:bg-purple-100 transition-colors flex items-center gap-1">
                                <ArrowRightLeft size={12} /> {tr('تجيير شيك', 'Endorse Check')}
                            </button>
                        )}
                        <button onClick={addCheckLine} className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition-colors">{tr('+ شيك جديد', '+ New Check')}</button>
                    </div>
                </div>

                {/* Check Endorsement Selector */}
                {showEndorseSelect && (
                    <div className="bg-white p-4 rounded-3xl border border-purple-100 shadow-lg animate-in fade-in">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-black text-purple-800">{tr('اختر شيك للتجيير (موجود بالصندوق)', 'Select check to endorse (in vault)')}</h4>
                            <button onClick={() => setShowEndorseSelect(false)} className="text-gray-400"><X size={16} /></button>
                        </div>
                        {availableChecks.length > 0 ? (
                            <div className="space-y-2">
                                {availableChecks.map(c => (
                                    <div key={c.id} onClick={() => addEndorsedCheckLine(c)} className="p-3 bg-purple-50/50 rounded-xl border border-purple-50 cursor-pointer hover:bg-purple-100 transition-colors flex justify-between items-center gap-2 min-w-0">
                                        <div className="min-w-0">
                                            <div className="font-bold text-xs text-gray-700 truncate">#{c.checkNumber} - {displayBankName(c.bankName, c.bankAccountId)}</div>
                                            <div className="text-[9px] text-gray-400">{tr('استحقاق', 'Due')}: {c.dueDate}</div>
                                        </div>
                                        <div className="font-black text-purple-600 dir-ltr shrink-0">{c.amount.toLocaleString()}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-4 text-[10px] text-gray-400 font-bold">{tr('لا توجد شيكات واردة متاحة للتجيير', 'No incoming checks available for endorsement')}</div>
                        )}
                    </div>
                )}

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="hidden xl:grid xl:grid-cols-[3rem_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_3rem] gap-2 border-b border-slate-200 bg-slate-50">
                        <div className={`${sheetHeaderClass} text-center`}>#</div>
                        <div className={sheetHeaderClass}>{tr('رقم الشيك', 'Check no.')}</div>
                        <div className={sheetHeaderClass}>{tr('البنك', 'Bank')}</div>
                        <div className={sheetHeaderClass}>{tr('رقم الحساب', 'Account #')}</div>
                        <div className={`${sheetHeaderClass} text-center`}>{tr('الاستحقاق', 'Due')}</div>
                        <div className={`${sheetHeaderClass} text-center`}>{tr('المبلغ', 'Amount')}</div>
                        <div className={`${sheetHeaderClass} text-center`}>{tr('حذف', 'Delete')}</div>
                    </div>
                    <div className="divide-y divide-slate-200">
                        {checkLines.map((line, idx) => (
                            <div key={line.id} className={`transaction-line-card p-3 space-y-3 animate-in slide-in-from-right-2 ${line.isEndorsed ? 'bg-purple-50/20' : 'bg-white'}`}>
                                {line.isEndorsed && (
                                    <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[10px] font-black text-purple-700">
                                        {tr('شيك مجيّر', 'Endorsed Check')}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-2 xl:grid-cols-[3rem_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_3rem] xl:items-center">
                                    <div className={`${sheetIndexClass} hidden xl:flex`}>{idx + 1}</div>
                                    <input placeholder={tr('رقم الشيك', 'Check Number')} value={line.checkNumber} onChange={e => updateCheckLine(line.id, 'checkNumber', e.target.value)} className={sheetInputClass} disabled={line.isEndorsed} />

                                    {voucherType === 'PAYMENT' && !line.isEndorsed ? (
                                        <select
                                            value={line.bankAccountId || ''}
                                            onChange={e => updateCheckLine(line.id, 'bankAccountId', e.target.value)}
                                            className={sheetInputClass}
                                        >
                                            <option value="">{tr('-- اختر البنك المسحوب عليه --', '-- Select Drawn Bank --')}</option>
                                            {bankAccounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{displayAccountName(acc)}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input placeholder={tr('اسم البنك أو رقم البنك', 'Bank name or code')} value={line.bankName} onChange={e => updateCheckLine(line.id, 'bankName', e.target.value)} className={sheetInputClass} disabled={line.isEndorsed} />
                                    )}

                                    <input placeholder={tr('رقم الحساب', 'Account Number')} value={line.accountNumber || ''} onChange={e => updateCheckLine(line.id, 'accountNumber', e.target.value)} className={sheetInputClass} disabled={line.isEndorsed} />
                                    <EnglishDateInput
                                        value={line.dueDate}
                                        onChange={value => updateCheckLine(line.id, 'dueDate', value)}
                                        wrapperClassName="w-full"
                                        className={`${sheetInputClass} dir-ltr text-center`}
                                        disabled={line.isEndorsed}
                                        aria-label={tr('تاريخ استحقاق الشيك', 'Check due date')}
                                    />
                                    <input type="number" inputMode="decimal" placeholder={tr('المبلغ', 'Amount')} value={line.amount} onChange={e => updateCheckLine(line.id, 'amount', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className={`${sheetInputClass} text-center dir-ltr font-black`} disabled={line.isEndorsed} />
                                    <button onClick={() => removeLine('CHECK', line.id)} className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-rose-500 transition hover:bg-rose-100"><Trash2 size={15} /></button>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-400 font-black">{tr('إرفاق صور الشيك (حتى صورتين)', 'Attach check images (up to 2)')}</div>
                                    <div className="voucher-line-grid grid grid-cols-1 lg:grid-cols-2 gap-2">
                                        {[0, 1].map((slotIndex) => {
                                            const imageValue = line.imageUrls?.[slotIndex] || '';
                                            return (
                                                <div key={`${line.id}-img-${slotIndex}`} className="bg-gray-50 border border-gray-100 rounded-2xl p-2 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-gray-500">
                                                            {tr(`صورة ${slotIndex + 1}`, `Image ${slotIndex + 1}`)}
                                                        </span>
                                                        {imageValue && (
                                                            <a
                                                                href={imageValue}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-[10px] font-black px-2 py-1 rounded-lg border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                            >
                                                                {tr('عرض', 'View')}
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div className="h-24 rounded-xl bg-white border border-gray-100 overflow-hidden flex items-center justify-center">
                                                        {imageValue ? (
                                                            <img
                                                                src={imageValue}
                                                                alt={tr(`صورة الشيك ${slotIndex + 1}`, `Check image ${slotIndex + 1}`)}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-gray-300">{tr('لا توجد صورة', 'No image')}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <label className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-colors ${line.isEndorsed ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 border-indigo-100 cursor-pointer hover:bg-indigo-100'}`}>
                                                            <Upload size={11} />
                                                            {imageValue ? tr('تغيير', 'Replace') : tr('إضافة', 'Add')}
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                disabled={line.isEndorsed}
                                                                onChange={async (event) => {
                                                                    const file = event.target.files?.[0];
                                                                    await handleSelectCheckImage(line.id, slotIndex, file);
                                                                    event.currentTarget.value = '';
                                                                }}
                                                            />
                                                        </label>
                                                        {imageValue && !line.isEndorsed && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearCheckImage(line.id, slotIndex)}
                                                                className="text-[10px] font-black px-2.5 py-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                                            >
                                                                {tr('حذف', 'Remove')}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {/* Sticky Total - FIXED: Use totalAmount instead of totals */}
            <div
                className="bg-slate-900/98 backdrop-blur p-3 rounded-xl text-white shadow-lg mx-auto z-30 border border-white/5"
            >
                <div className="flex justify-between items-center mb-4 text-xs font-bold">
                    <span className="text-gray-400 uppercase tracking-widest">{tr('إجمالي السند', 'Voucher Total')}</span>
                    <span className="text-2xl sm:text-3xl font-black text-white dir-ltr">{totalAmount.toLocaleString()}</span>
                </div>
                <button onClick={handleSubmit} className="w-full bg-blue-600 hover:bg-blue-500 min-h-[54px] sm:min-h-[58px] py-3 rounded-2xl font-black text-base shadow-lg active:scale-[0.99] transition-all">
                    {initialVoucherId ? tr('تحديث وترحيل السند', 'Update & Post Voucher') : tr('ترحيل السند', 'Post Voucher')}
                </button>
            </div>
            {showQuickContact && (
                <ContactEditorDialog
                    mode="INVOICE"
                    initialType={voucherType === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER'}
                    allowedTypes={['CUSTOMER', 'SUPPLIER']}
                    onClose={() => setShowQuickContact(false)}
                    onSave={(contact) => setContactId(contact.id)}
                />
            )}
        </div>
    );
};

// --- Journal Screen ---
interface JournalLine {
    id: string;
    accountId: string;
    debit: string;
    credit: string;
    description: string;
    splitPurchaseTax?: boolean;
    purchaseTaxRate?: string;
    contactId?: string;
    employeeId?: string;
    assetId?: string;
    checkId?: string;
    depositedBankId?: string;
    outgoingCheckId?: string;
    outgoingCheckAction?: 'NONE' | 'RETURN';
    linkedAccountId?: string;
}

type JournalRequirement = 'NONE' | 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'CHECK_COLLECTION' | 'OUTGOING_CHECK' | 'FIXED_ASSET';

const JournalScreen: React.FC<{
    sharedState: any;
    onSuccess: () => void;
}> = ({ sharedState, onSuccess }) => {
    const { accounts, addTransaction, contacts, employees, fixedAssets, checks, updateCheck, companySettings } = useAccounting();
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayCheckBankName = (bankName: string, bankAccountId?: string) => {
        const linkedAccount = bankAccountId ? accounts.find(a => a.id === bankAccountId) : undefined;
        if (linkedAccount) return displayAccountName(linkedAccount);
        return getDisplayAccountName({ id: bankAccountId || '', name: bankName }, isEnglish);
    };
    const [amountNotice, setAmountNotice] = useState<string | null>(null);
    const [lines, setLines] = useState<JournalLine[]>([
        { id: '1', accountId: '', debit: '', credit: '', description: '' },
        { id: '2', accountId: '', debit: '', credit: '', description: '' }
    ]);

    const customerContacts = useMemo(() => contacts.filter(c => c.type === 'CUSTOMER'), [contacts]);
    const supplierContacts = useMemo(() => contacts.filter(c => c.type === 'SUPPLIER'), [contacts]);
    const bankAccounts = useMemo(() => accounts.filter(a => !a.isGroup && a.parentId === 'acc_bank_root'), [accounts]);
    const availableIncomingChecks = useMemo(
        () => checks.filter(c => c.type === 'INCOMING' && c.status !== 'CLEARED' && c.status !== 'CANCELLED' && c.status !== 'ENDORSED'),
        [checks]
    );
    const availableOutgoingChecks = useMemo(
        () => checks.filter(c => c.type === 'OUTGOING' && c.status !== 'BOUNCED' && c.status !== 'CANCELLED'),
        [checks]
    );
    const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
    const linkedAccountOptions = useMemo(
        () => accounts.filter(a => !a.isGroup && (a.type === 'LIABILITY' || a.id === 'acc_receivable')),
        [accounts]
    );

    const isAccountOrDescendantOf = (accountId: string, rootId: string) => {
        let cursorId: string | undefined = accountId;
        while (cursorId) {
            if (cursorId === rootId) return true;
            const cursor = accountMap.get(cursorId);
            cursorId = cursor?.parentId;
        }
        return false;
    };

    const getSuggestedLinkedAccountId = (contactId?: string) => {
        if (!contactId) return 'acc_payable';
        const relatedContact = contacts.find(c => c.id === contactId);
        if (!relatedContact) return 'acc_payable';
        if (relatedContact.type === 'PARTNER' && (relatedContact.currentAccountId || relatedContact.linkedAccountId)) {
            return relatedContact.currentAccountId || relatedContact.linkedAccountId || 'acc_partner_current';
        }
        if (relatedContact.type === 'EMPLOYEE') return 'acc_accrued_salaries';
        if (relatedContact.type === 'CUSTOMER') return 'acc_receivable';
        return 'acc_payable';
    };

    const getLineRequirement = (accountId: string): JournalRequirement => {
        if (!accountId) return 'NONE';
        if (isAccountOrDescendantOf(accountId, 'acc_accrued_salaries')) return 'EMPLOYEE';
        if (isAccountOrDescendantOf(accountId, 'acc_receivable_group') || isAccountOrDescendantOf(accountId, 'acc_receivable')) return 'CUSTOMER';
        if (isAccountOrDescendantOf(accountId, 'acc_payable')) return 'SUPPLIER';
        if (isAccountOrDescendantOf(accountId, 'acc_cheques_hand')) return 'CHECK_COLLECTION';
        if (isAccountOrDescendantOf(accountId, 'acc_notes_payable')) return 'OUTGOING_CHECK';
        if (accountId === 'acc_depreciation_exp' || accountId === 'acc_accumulated_depreciation') return 'FIXED_ASSET';
        if (isAccountOrDescendantOf(accountId, 'acc_fixed_assets_root')) return 'FIXED_ASSET';
        return 'NONE';
    };

    const totals = useMemo(() => {
        const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
        return { totalDebit, totalCredit, diff: totalDebit - totalCredit };
    }, [lines]);

    useEffect(() => {
        if (!amountNotice) return;
        const timer = window.setTimeout(() => setAmountNotice(null), 1600);
        return () => window.clearTimeout(timer);
    }, [amountNotice]);

    const notifyAmountAdded = (rawValue: string) => {
        if (!(companySettings.notifyAfterAmountAdded ?? true)) return;
        const normalized = toEnglishDigits(String(rawValue || '')).replace(/[^\d.\-]/g, '');
        const parsed = parseFloat(normalized);
        if (!(Number.isFinite(parsed) && parsed > 0)) return;
        const formatted = parsed.toLocaleString('en-US', { maximumFractionDigits: 2 });
        setAmountNotice(tr(`تمت إضافة مبلغ ${formatted}`, `Amount ${formatted} added`));
    };

    const handleAddLine = () => {
        setLines([...lines, { id: Math.random().toString(), accountId: '', debit: '', credit: '', description: '' }]);
    };

    const handleUpdateLine = (id: string, field: keyof JournalLine, value: string) => {
        setLines(prev => prev.map(l => {
            if (l.id !== id) return l;
            const updated: JournalLine = { ...l, [field]: value };

            // Reset linked entities when account changes
            if (field === 'accountId') {
                updated.contactId = '';
                updated.employeeId = '';
                updated.assetId = '';
                updated.checkId = '';
                updated.depositedBankId = '';
                updated.outgoingCheckId = '';
                updated.outgoingCheckAction = 'NONE';
                updated.linkedAccountId = '';
            }

            if (field === 'outgoingCheckId') {
                if (!value) {
                    updated.outgoingCheckAction = 'NONE';
                    updated.linkedAccountId = '';
                } else {
                    const selectedCheck = availableOutgoingChecks.find(c => c.id === value);
                    if (selectedCheck?.contactId) {
                        updated.contactId = selectedCheck.contactId;
                        updated.employeeId = '';
                        if (!updated.linkedAccountId) {
                            updated.linkedAccountId = getSuggestedLinkedAccountId(selectedCheck.contactId);
                        }
                    }
                    if (!updated.outgoingCheckAction) {
                        updated.outgoingCheckAction = 'NONE';
                    }
                }
            }

            const hasDebit = (parseFloat(updated.debit) || 0) > 0;
            const hasCredit = (parseFloat(updated.credit) || 0) > 0;
            const taxSplitBlocked = !hasDebit || hasCredit || !updated.accountId || updated.accountId === 'acc_vat_input';
            if (taxSplitBlocked) {
                updated.splitPurchaseTax = false;
            } else if (updated.splitPurchaseTax && !updated.purchaseTaxRate) {
                updated.purchaseTaxRate = String(companySettings.defaultTaxRate ?? 0);
            }

            return updated;
        }));
    };

    const toggleLinePurchaseTax = (id: string) => {
        setLines(prev => prev.map(line => {
            if (line.id !== id) return line;
            const hasDebit = (parseFloat(line.debit) || 0) > 0;
            const hasCredit = (parseFloat(line.credit) || 0) > 0;
            const canEnable = hasDebit && !hasCredit && !!line.accountId && line.accountId !== 'acc_vat_input';
            if (!canEnable) return { ...line, splitPurchaseTax: false };
            const nextEnabled = !line.splitPurchaseTax;
            return {
                ...line,
                splitPurchaseTax: nextEnabled,
                purchaseTaxRate: nextEnabled
                    ? (line.purchaseTaxRate || String(companySettings.defaultTaxRate ?? 0))
                    : line.purchaseTaxRate
            };
        }));
    };

    const setLinePurchaseTaxRate = (id: string, value: string) => {
        setLines(prev => prev.map(line => line.id === id ? { ...line, purchaseTaxRate: value } : line));
    };

    const handleRemoveLine = (id: string) => {
        setLines(lines.filter(l => l.id !== id));
    };

    const applyPurchaseTaxSplitToLines = (sourceLines: JournalLine[]): { ok: true; lines: JournalLine[] } | { ok: false; message: string } => {
        const markedLines = sourceLines.filter(line => line.splitPurchaseTax === true);
        if (markedLines.length === 0) return { ok: true, lines: sourceLines };

        const normalized = sourceLines.map(line => ({ ...line }));
        const expanded: JournalLine[] = [];
        const round2 = (value: number) => Number((Number(value) || 0).toFixed(2));

        for (const targetLine of normalized) {
            if (!targetLine.splitPurchaseTax) {
                expanded.push(targetLine);
                continue;
            }

            const lineNo = Math.max(1, lines.findIndex(l => l.id === targetLine.id) + 1);
            const rate = Math.max(0, Number(targetLine.purchaseTaxRate || companySettings.defaultTaxRate) || 0);
            if (rate <= 0) {
                return {
                    ok: false,
                    message: tr(
                        `يرجى إدخال نسبة ضريبة صحيحة في السطر ${lineNo}.`,
                        `Please enter a valid tax rate in line ${lineNo}.`
                    )
                };
            }

            const gross = Math.max(0, Number(targetLine.debit) || 0);
            const hasCredit = (Number(targetLine.credit) || 0) > 0;
            if (gross <= 0 || hasCredit) {
                return {
                    ok: false,
                    message: tr(
                        `فصل الضريبة يعمل فقط على سطر مدين (السطر ${lineNo}).`,
                        `Tax split works only on a debit line (line ${lineNo}).`
                    )
                };
            }
            if (!targetLine.accountId || targetLine.accountId === 'acc_vat_input') {
                return {
                    ok: false,
                    message: tr(
                        `يرجى اختيار حساب مصروف/أصل صالح في السطر ${lineNo} قبل فصل الضريبة.`,
                        `Please select a valid expense/asset account in line ${lineNo} before tax split.`
                    )
                };
            }

            const tax = round2((gross * rate) / (100 + rate));
            const net = round2(gross - tax);
            if (tax <= 0 || net <= 0) {
                return {
                    ok: false,
                    message: tr(
                        `تعذر احتساب الضريبة في السطر ${lineNo}.`,
                        `Could not calculate tax in line ${lineNo}.`
                    )
                };
            }

            // Keep tax split adjacent to its source expense line to avoid affecting other lines.
            targetLine.debit = net.toString();
            expanded.push(targetLine);
            expanded.push({
                id: `tax_${targetLine.id}_${Date.now()}_${expanded.length}`,
                accountId: 'acc_vat_input',
                debit: tax.toString(),
                credit: '',
                description: tr(`ضريبة مدخلات مشتريات (سطر ${lineNo})`, `Purchase input VAT (line ${lineNo})`)
            });
        }

        return { ok: true, lines: expanded };
    };

    const handleSubmit = () => {
        if (!sharedState.date) return alert(tr('يرجى تحديد تاريخ القيد', 'Please select journal date'));
        if (Math.abs(totals.diff) > 0.01) return alert(tr('القيد غير متزن!', 'Entry is unbalanced!'));
        if (totals.totalDebit === 0) return alert(tr('قيمة القيد صفر!', 'Entry amount is zero!'));
        if (lines.some(l => !l.accountId && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))) return alert(tr('يجب تحديد الحساب لجميع الأطراف', 'Account is required for all entry lines'));

        const baseActiveLines = lines.filter(l => ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0));
        const purchaseTaxSplit = applyPurchaseTaxSplitToLines(baseActiveLines);
        if (purchaseTaxSplit.ok === false) return alert(purchaseTaxSplit.message);
        const activeLines = purchaseTaxSplit.lines;

        const effectiveTotalDebit = activeLines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
        const effectiveTotalCredit = activeLines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
        if (Math.abs(effectiveTotalDebit - effectiveTotalCredit) > 0.01) {
            return alert(tr('القيد غير متزن بعد فصل الضريبة.', 'Entry is unbalanced after tax split.'));
        }

        for (const line of activeLines) {
            const displayIndex = lines.findIndex(l => l.id === line.id) + 1;
            const requirement = getLineRequirement(line.accountId);

            if (requirement === 'EMPLOYEE' && !line.employeeId) return alert(`${tr('يرجى اختيار الموظف في السطر', 'Please select employee in line')} ${displayIndex}`);
            if ((requirement === 'CUSTOMER' || requirement === 'SUPPLIER') && !line.contactId) return alert(`${tr('يرجى اختيار الطرف المرتبط في السطر', 'Please select related contact in line')} ${displayIndex}`);
            if (requirement === 'FIXED_ASSET' && !line.assetId) return alert(`${tr('يرجى اختيار الأصل الثابت في السطر', 'Please select fixed asset in line')} ${displayIndex}`);
            if (requirement === 'CHECK_COLLECTION') {
                if (!line.checkId) return alert(`${tr('يرجى اختيار الشيك في السطر', 'Please select check in line')} ${displayIndex}`);
                if (!line.depositedBankId) return alert(`${tr('يرجى اختيار بنك التحصيل في السطر', 'Please select collection bank in line')} ${displayIndex}`);
            }
            if (requirement === 'OUTGOING_CHECK' && line.outgoingCheckAction === 'RETURN') {
                const selectedOutgoingCheck = line.outgoingCheckId ? availableOutgoingChecks.find(c => c.id === line.outgoingCheckId) : null;
                if (!selectedOutgoingCheck) return alert(`${tr('يرجى اختيار الشيك الصادر المراد إرجاعه في السطر', 'Please select outgoing check to return in line')} ${displayIndex}`);
                if (!line.linkedAccountId) return alert(`${tr('يرجى اختيار الحساب المرتبط لعملية إرجاع الشيك في السطر', 'Please select linked account for check return in line')} ${displayIndex}`);
                if ((parseFloat(line.debit) || 0) <= 0) return alert(`${tr('قيد إرجاع الشيك يجب أن يكون مدينًا على أوراق الدفع في السطر', 'Check return line must be debited to notes payable in line')} ${displayIndex}`);

                const hasLinkedCreditLine = activeLines.some(other =>
                    other.id !== line.id &&
                    other.accountId === line.linkedAccountId &&
                    (parseFloat(other.credit) || 0) > 0
                );
                if (!hasLinkedCreditLine) return alert(`${tr('الحساب المرتبط المختار في السطر', 'Selected linked account in line')} ${displayIndex} ${tr('غير موجود كطرف دائن في القيد', 'is not present as a credit line in the entry')}`);
            }
        }

        const voucherId = `JRN-${Date.now()}`;

        const enrichedLines = activeLines.map(line => {
            const dr = parseFloat(line.debit) || 0;
            const cr = parseFloat(line.credit) || 0;
            const selectedEmployee = line.employeeId ? employees.find(e => e.id === line.employeeId) : null;
            const selectedContact = line.contactId ? contacts.find(c => c.id === line.contactId) : null;
            const selectedAsset = line.assetId ? fixedAssets.find(a => a.id === line.assetId) : null;
            const selectedCheck = line.checkId ? availableIncomingChecks.find(c => c.id === line.checkId) : null;
            const selectedBank = line.depositedBankId ? bankAccounts.find(b => b.id === line.depositedBankId) : null;
            const selectedOutgoingCheck = line.outgoingCheckId ? checks.find(c => c.id === line.outgoingCheckId) : null;
            const selectedLinkedAccount = line.linkedAccountId ? accountMap.get(line.linkedAccountId) : null;
            const resolvedContactId = line.contactId || selectedOutgoingCheck?.contactId || undefined;

            const details: string[] = [];
            if (selectedContact) details.push(`${tr('Contact', 'Contact')}: ${displayContactName(selectedContact)}`);
            if (selectedEmployee) details.push(`${tr('Employee', 'Employee')}: ${selectedEmployee.name}`);
            if (selectedAsset) details.push(`${tr('Asset', 'Asset')}: ${selectedAsset.name}`);
            if (selectedCheck) details.push(`${tr('Check', 'Check')} #${selectedCheck.checkNumber}`);
            if (selectedBank) details.push(`${tr('Collection Bank', 'Collection Bank')}: ${displayAccountName(selectedBank)}`);
            if (selectedOutgoingCheck) details.push(`${tr('Outgoing Check', 'Outgoing Check')} #${selectedOutgoingCheck.checkNumber}`);
            if (line.outgoingCheckAction === 'RETURN') details.push(tr('Action: Check Return', 'Action: Check Return'));
            if (selectedLinkedAccount) details.push(`${tr('Linked Account', 'Linked Account')}: ${displayAccountName(selectedLinkedAccount)}`);

            return {
                ...line,
                dr,
                cr,
                resolvedContactId,
                fullDescription: [line.description || tr('Journal Entry', 'Journal Entry'), ...details].join(' - ')
            };
        });

        const debitLegs = enrichedLines
            .filter(line => line.dr > 0)
            .map(line => ({ ...line, remaining: line.dr }));
        const creditLegs = enrichedLines
            .filter(line => line.cr > 0)
            .map(line => ({ ...line, remaining: line.cr }));

        const postingPairs: Array<{
            amount: number;
            debitLine: typeof debitLegs[number];
            creditLine: typeof creditLegs[number];
        }> = [];

        let creditIndex = 0;
        const findExactCreditLegIndex = (targetAmount: number) => {
            const roundedTarget = Number(targetAmount.toFixed(2));
            for (let i = 0; i < creditLegs.length; i += 1) {
                const remaining = Number((creditLegs[i].remaining || 0).toFixed(2));
                if (remaining <= 0) continue;
                if (Math.abs(remaining - roundedTarget) <= 0.01) return i;
            }
            return -1;
        };

        for (const debitLine of debitLegs) {
            while (debitLine.remaining > 0.0001) {
                let selectedCreditIndex = findExactCreditLegIndex(debitLine.remaining);
                if (selectedCreditIndex === -1) {
                    while (creditIndex < creditLegs.length && creditLegs[creditIndex].remaining <= 0.0001) {
                        creditIndex += 1;
                    }
                    selectedCreditIndex = creditIndex;
                }

                if (selectedCreditIndex >= creditLegs.length) {
                    return alert(tr('Failed to compose balanced journal pairs', 'Failed to compose balanced journal pairs'));
                }
                const creditLine = creditLegs[selectedCreditIndex];
                const rawAmount = Math.min(debitLine.remaining, creditLine.remaining);
                const amount = Number(rawAmount.toFixed(2));
                if (amount <= 0) break;

                postingPairs.push({ amount, debitLine, creditLine });
                debitLine.remaining = Number((debitLine.remaining - amount).toFixed(6));
                creditLine.remaining = Number((creditLine.remaining - amount).toFixed(6));
            }
        }

        if (debitLegs.some(line => line.remaining > 0.01) || creditLegs.some(line => line.remaining > 0.01)) {
            return alert(tr('Entry remains unbalanced after processing', 'Entry remains unbalanced after processing'));
        }

        for (const pair of postingPairs) {
            const result = addTransaction({
                voucherId,
                amount: pair.amount,
                description: `${pair.debitLine.fullDescription} <> ${pair.creditLine.fullDescription}`,
                category: 'journal',
                type: TransactionType.TRANSFER,
                date: sharedState.date,
                debitAccountId: pair.debitLine.accountId,
                creditAccountId: pair.creditLine.accountId,
                contactId: pair.debitLine.resolvedContactId || pair.creditLine.resolvedContactId,
                employeeId: pair.debitLine.employeeId || pair.creditLine.employeeId || undefined,
                assetId: pair.debitLine.assetId || pair.creditLine.assetId || undefined,
                checkId: pair.debitLine.checkId || pair.debitLine.outgoingCheckId || pair.creditLine.checkId || pair.creditLine.outgoingCheckId || undefined,
                currency: sharedState.currency,
                exchangeRate: sharedState.rate,
                status: 'POSTED'
            });
            if (!result.ok) {
                return alert(result.message || tr('Failed to post journal entry', 'Failed to post journal entry'));
            }
        }

        enrichedLines.forEach(line => {
            if (line.accountId === 'acc_cheques_hand' && line.checkId && line.depositedBankId) {
                updateCheck(line.checkId, {
                    status: 'UNDER_COLLECTION',
                    depositedBankId: line.depositedBankId
                });
            }

            if (line.accountId === 'acc_notes_payable' && line.outgoingCheckId && line.outgoingCheckAction === 'RETURN') {
                updateCheck(line.outgoingCheckId, {
                    status: 'BOUNCED'
                });
            }
        });

        alert(tr('Journal entry posted successfully', 'Journal entry posted successfully'));
        onSuccess();
    };

    const isBalanced = Math.abs(totals.diff) <= 0.01;

    return (
        <div
            className="transaction-mobile-form w-full max-w-full space-y-4 pb-[calc(var(--app-safe-bottom)+4rem)] overflow-x-hidden"
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
        >
            {amountNotice && (
                <div className="sticky top-2 z-20 mx-1 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                    {amountNotice}
                </div>
            )}
            {/* Render Lines */}
            <div className="transaction-entry-section bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 px-2">
                    <h3 className="font-black text-gray-800">{tr('أطراف القيد', 'Entry Lines')}</h3>
                    <button onClick={handleAddLine} className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Plus size={18} /></button>
                </div>
                <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                    <p className="text-[10px] font-bold text-indigo-700/80">
                        {tr(
                            'فصل ضريبة الشراء أصبح لكل سطر: فعّل الخيار داخل السطر المدين المطلوب وحدد نسبة الضريبة لذلك السطر.',
                            'Purchase tax split is now per-line: enable it on the target debit line and set that line tax rate.'
                        )}
                    </p>
                </div>
                <div className="space-y-3">
                    {lines.map((line, idx) => (
                        <div key={line.id} className="transaction-line-card p-3 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-2">
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-w-0">
                                <select
                                    value={line.accountId}
                                    onChange={e => handleUpdateLine(line.id, 'accountId', e.target.value)}
                                    className="w-full min-w-0 bg-white p-2 rounded-xl text-xs font-bold outline-none"
                                >
                                    <option value="">{tr('اختر الحساب', 'Select Account')}</option>
                                    {accounts.filter(a => !a.isGroup).map(a => <option key={a.id} value={a.id}>{a.code} - {displayAccountName(a)}</option>)}
                                </select>
                                <button onClick={() => handleRemoveLine(line.id)} className="text-rose-400 p-2 rounded-xl"><Trash2 size={16} /></button>
                            </div>
                            <div className="journal-line-grid grid grid-cols-1 lg:grid-cols-4 gap-2 min-w-0">
                                <input placeholder={tr('مدين', 'Debit')} type="number" inputMode="decimal" value={line.debit} onChange={e => handleUpdateLine(line.id, 'debit', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className="w-full p-2 bg-white rounded-xl text-xs font-black text-center outline-none text-emerald-600 dir-ltr lg:col-span-1" disabled={!!line.credit} />
                                <input placeholder={tr('دائن', 'Credit')} type="number" inputMode="decimal" value={line.credit} onChange={e => handleUpdateLine(line.id, 'credit', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className="w-full p-2 bg-white rounded-xl text-xs font-black text-center outline-none text-rose-600 dir-ltr lg:col-span-1" disabled={!!line.debit} />
                                <input placeholder={tr('شرح مبسط', 'Description')} value={line.description} onChange={e => handleUpdateLine(line.id, 'description', e.target.value)} className="w-full p-2 bg-white rounded-xl text-xs font-bold outline-none lg:col-span-2" />
                            </div>

                            {(() => {
                                const hasDebit = (parseFloat(line.debit) || 0) > 0;
                                const hasCredit = (parseFloat(line.credit) || 0) > 0;
                                const canSplitTax = hasDebit && !hasCredit && !!line.accountId && line.accountId !== 'acc_vat_input';
                                if (!canSplitTax && !line.splitPurchaseTax) return null;
                                return (
                                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[10px] font-black text-indigo-700">
                                                {tr('فصل ضريبة الشراء لهذا السطر', 'Split purchase tax for this line')}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => toggleLinePurchaseTax(line.id)}
                                                disabled={!canSplitTax}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${!canSplitTax
                                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                    : line.splitPurchaseTax
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-white text-indigo-700 border border-indigo-200'
                                                    }`}
                                            >
                                                {line.splitPurchaseTax ? tr('مفعل', 'Enabled') : tr('معطل', 'Disabled')}
                                            </button>
                                        </div>
                                        {line.splitPurchaseTax && (
                                            <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-2 items-start">
                                                <div>
                                                    <label className="block text-[10px] font-black text-indigo-600 mb-1">{tr('نسبة الضريبة (%)', 'Tax rate (%)')}</label>
                                                    <input
                                                        type="number" inputMode="decimal"
                                                        min={0}
                                                        value={line.purchaseTaxRate || String(companySettings.defaultTaxRate ?? 0)}
                                                        onChange={e => setLinePurchaseTaxRate(line.id, e.target.value)}
                                                        className="w-full p-2 rounded-xl bg-white border border-indigo-100 text-xs font-black text-center dir-ltr outline-none"
                                                    />
                                                </div>
                                                <p className="text-[10px] font-bold text-indigo-700/80">
                                                    {tr(
                                                        'عند الترحيل: تُستخرج الضريبة من هذا السطر، ويُرحّل صافي المبلغ على حساب السطر، مع إنشاء سطر ضريبة مدخلات تلقائي.',
                                                        'On post: tax is extracted from this line, net amount stays on this account, and an input VAT line is auto-created.'
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {(() => {
                                const requirement = getLineRequirement(line.accountId);
                                if (requirement === 'NONE') return null;

                                if (requirement === 'EMPLOYEE') {
                                    return (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-2">
                                            <label className="block text-[10px] font-black text-amber-700 mb-1">{tr('الموظف المرتبط بالحساب', 'Employee linked to account')}</label>
                                            <select value={line.employeeId || ''} onChange={e => handleUpdateLine(line.id, 'employeeId', e.target.value)} className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none">
                                                <option value="">{tr('-- اختر الموظف --', '-- Select Employee --')}</option>
                                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.code} - {emp.name}</option>)}
                                            </select>
                                        </div>
                                    );
                                }

                                if (requirement === 'CUSTOMER') {
                                    return (
                                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2">
                                            <label className="block text-[10px] font-black text-emerald-700 mb-1">{tr('العميل المرتبط بالحساب', 'Customer linked to account')}</label>
                                            <select value={line.contactId || ''} onChange={e => handleUpdateLine(line.id, 'contactId', e.target.value)} className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none">
                                                <option value="">{tr('-- اختر العميل --', '-- Select Customer --')}</option>
                                                {customerContacts.map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                                            </select>
                                        </div>
                                    );
                                }

                                if (requirement === 'SUPPLIER') {
                                    return (
                                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-2">
                                            <label className="block text-[10px] font-black text-purple-700 mb-1">{tr('المورد المرتبط بالحساب', 'Supplier linked to account')}</label>
                                            <select value={line.contactId || ''} onChange={e => handleUpdateLine(line.id, 'contactId', e.target.value)} className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none">
                                                <option value="">{tr('-- اختر المورد --', '-- Select Supplier --')}</option>
                                                {supplierContacts.map(c => <option key={c.id} value={c.id}>{displayContactName(c)}</option>)}
                                            </select>
                                        </div>
                                    );
                                }

                                if (requirement === 'FIXED_ASSET') {
                                    return (
                                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2">
                                            <label className="block text-[10px] font-black text-indigo-700 mb-1">{tr('الأصل الثابت المرتبط', 'Linked fixed asset')}</label>
                                            <select value={line.assetId || ''} onChange={e => handleUpdateLine(line.id, 'assetId', e.target.value)} className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none">
                                                <option value="">{tr('-- اختر الأصل الثابت --', '-- Select Fixed Asset --')}</option>
                                                {fixedAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                                            </select>
                                        </div>
                                    );
                                }

                                if (requirement === 'CHECK_COLLECTION') {
                                    return (
                                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 space-y-2">
                                            <label className="block text-[10px] font-black text-blue-700">{tr('الشيك برسم التحصيل', 'Check under collection')}</label>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                <select value={line.checkId || ''} onChange={e => handleUpdateLine(line.id, 'checkId', e.target.value)} className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none">
                                                    <option value="">{tr('-- اختر الشيك --', '-- Select Check --')}</option>
                                                    {availableIncomingChecks.map(chk => (
                                                        <option key={chk.id} value={chk.id}>
                                                            #{chk.checkNumber} - {displayCheckBankName(chk.bankName, chk.bankAccountId)} - {chk.amount.toLocaleString()}
                                                        </option>
                                                    ))}
                                                </select>
                                                <select value={line.depositedBankId || ''} onChange={e => handleUpdateLine(line.id, 'depositedBankId', e.target.value)} className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none">
                                                    <option value="">{tr('-- اختر بنك التحصيل --', '-- Select Collection Bank --')}</option>
                                                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{displayAccountName(b)}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                }

                                if (requirement === 'OUTGOING_CHECK') {
                                    const selectedOutgoingCheck = line.outgoingCheckId ? availableOutgoingChecks.find(chk => chk.id === line.outgoingCheckId) : null;
                                    const checkOwner = selectedOutgoingCheck?.contactId ? contacts.find(c => c.id === selectedOutgoingCheck.contactId) : null;

                                    return (
                                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-2 space-y-2">
                                            <label className="block text-[10px] font-black text-rose-700">{tr('التحكم بالشيكات الصادرة', 'Outgoing check controls')}</label>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                <select
                                                    value={line.outgoingCheckId || ''}
                                                    onChange={e => handleUpdateLine(line.id, 'outgoingCheckId', e.target.value)}
                                                    className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none"
                                                >
                                                    <option value="">{tr('-- اختر الشيك الصادر --', '-- Select Outgoing Check --')}</option>
                                                    {availableOutgoingChecks.map(chk => (
                                                        <option key={chk.id} value={chk.id}>
                                                            #{chk.checkNumber} - {displayCheckBankName(chk.bankName, chk.bankAccountId)} - {chk.amount.toLocaleString()} ({chk.status})
                                                        </option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={line.outgoingCheckAction || 'NONE'}
                                                    onChange={e => handleUpdateLine(line.id, 'outgoingCheckAction', e.target.value)}
                                                    className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none"
                                                >
                                                    <option value="NONE">{tr('ربط فقط (بدون تغيير الحالة)', 'Link only (no status change)')}</option>
                                                    <option value="RETURN">{tr('إرجاع الشيك', 'Return Check')}</option>
                                                </select>
                                            </div>

                                            {line.outgoingCheckAction === 'RETURN' && (
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                    <select
                                                        value={line.linkedAccountId || ''}
                                                        onChange={e => handleUpdateLine(line.id, 'linkedAccountId', e.target.value)}
                                                        className="w-full bg-white p-2 rounded-xl text-xs font-bold outline-none"
                                                    >
                                                        <option value="">{tr('-- اختر الحساب المرتبط --', '-- Select Linked Account --')}</option>
                                                        {linkedAccountOptions.map(acc => (
                                                            <option key={acc.id} value={acc.id}>{acc.code} - {displayAccountName(acc)}</option>
                                                        ))}
                                                    </select>
                                                    <div className="bg-white rounded-xl p-2 text-[10px] text-gray-500 font-bold border border-rose-100">
                                                        {tr('اجعل هذا السطر مدينًا على أوراق الدفع، وأضف سطرًا دائنًا للحساب المرتبط.', 'Set this line as default')}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                }
                            })()}
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-slate-900/98 backdrop-blur p-4 sm:p-5 rounded-[1.8rem] sm:rounded-[2.2rem] text-white shadow-2xl sticky keyboard-aware-sticky mx-auto z-30 border border-white/5 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white/5 p-2">
                        <div className="text-[10px] font-black text-emerald-300">{tr('إجمالي مدين', 'Total Debit')}</div>
                        <div className="text-sm font-black dir-ltr text-emerald-200">{totals.totalDebit.toLocaleString()}</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2">
                        <div className="text-[10px] font-black text-rose-300">{tr('إجمالي دائن', 'Total Credit')}</div>
                        <div className="text-sm font-black dir-ltr text-rose-200">{totals.totalCredit.toLocaleString()}</div>
                    </div>
                    <div className={`rounded-xl p-2 ${isBalanced ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                        <div className={`text-[10px] font-black ${isBalanced ? 'text-emerald-200' : 'text-amber-200'}`}>{tr('الفرق', 'Difference')}</div>
                        <div className={`text-sm font-black dir-ltr ${isBalanced ? 'text-emerald-100' : 'text-amber-100'}`}>{totals.diff.toLocaleString()}</div>
                    </div>
                </div>
                <button
                    onClick={handleSubmit}
                    className={`w-full min-h-[54px] sm:min-h-[58px] py-3 rounded-2xl font-black text-base shadow-lg active:scale-[0.99] transition-all ${isBalanced && totals.totalDebit > 0
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-700 text-slate-300'
                        }`}
                >
                    {tr('ترحيل القيد', 'Post Journal Entry')}
                </button>
            </div>
        </div>
    );
};

const TransactionForm: React.FC<TransactionFormProps> = ({ initialMode, initialVoucherType, initialCategory, initialLinkedInvoiceId, initialInvoiceId, initialVoucherId, onBack }) => {
    const { companySettings, currencies, baseCurrency, invoices, transactions } = useAccounting();
    const [mode, setMode] = useState<TransactionTabType>(initialMode);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const allowEditEntryDate = companySettings.allowEditEntryDate ?? true;
    const journalDateLockEnabled = companySettings.journalDateLockEnabled === true;
    const journalDateLockFrom = companySettings.journalDateLockFrom || '';
    const journalDateLockTo = companySettings.journalDateLockTo || '';
    const currencyOptions = currencies.length > 0
        ? currencies
        : [{ code: baseCurrency, name: baseCurrency, symbol: baseCurrency, rate: 1 }];
    const editingInvoice = useMemo(
        () => initialInvoiceId ? invoices.find(invoice => invoice.id === initialInvoiceId) || null : null,
        [initialInvoiceId, invoices]
    );
    const editingVoucherLead = useMemo(
        () => initialVoucherId ? transactions.find(tx => tx.voucherId === initialVoucherId || tx.id === initialVoucherId) || null : null,
        [initialVoucherId, transactions]
    );
    const isEditing = Boolean(editingInvoice || editingVoucherLead);
    const getRateForCurrency = (code: string) => {
        if (code === baseCurrency) return 1;
        return currencies.find(c => c.code === code)?.rate || 1;
    };

    // Shared state for all screens
    const [sharedState, setSharedState] = useState(() => ({
        currency: baseCurrency,
        rate: getRateForCurrency(baseCurrency),
        date: getTodayDateString()
    }));

    useEffect(() => {
        if (!currencyOptions.some(c => c.code === sharedState.currency)) {
            setSharedState(prev => ({ ...prev, currency: baseCurrency, rate: getRateForCurrency(baseCurrency) }));
        }
    }, [currencyOptions, sharedState.currency, baseCurrency]);

    const handleCurrencyChange = (code: string) => {
        setSharedState(prev => ({ ...prev, currency: code, rate: getRateForCurrency(code) }));
    };

    useEffect(() => {
        if (editingInvoice) {
            setSharedState({
                currency: editingInvoice.currency || baseCurrency,
                rate: Number(editingInvoice.exchangeRate) || getRateForCurrency(editingInvoice.currency || baseCurrency),
                date: editingInvoice.date || getTodayDateString()
            });
            return;
        }
        if (editingVoucherLead) {
            const voucherCurrency = editingVoucherLead.currency || baseCurrency;
            setSharedState({
                currency: voucherCurrency,
                rate: Number(editingVoucherLead.exchangeRate) || getRateForCurrency(voucherCurrency),
                date: editingVoucherLead.date || getTodayDateString()
            });
        }
    }, [editingInvoice, editingVoucherLead, baseCurrency]);

    const screenTitle = useMemo(() => {
        const baseTitle = (() => {
        switch (mode) {
            case 'SALES': return tr('فاتورة مبيعات', 'Sales Invoice');
            case 'SALES_RETURN': return tr('مرتجع مبيعات', 'Sales Return');
            case 'QUOTATION': return tr('عرض سعر', 'Quotation');
            case 'PURCHASES': return tr('فاتورة مشتريات', 'Purchase Invoice');
            case 'PURCHASE_RETURN': return tr('مرتجع مشتريات', 'Purchase Return');
            case 'MANUAL_PURCHASE': return tr('مشتريات يدوية', 'Manual Purchase');
            case 'EXPENSES': return tr('سند مصروف', 'Expense Voucher');
            case 'VOUCHERS':
                return initialVoucherType === 'PAYMENT'
                    ? tr('سند صرف', 'Payment Voucher')
                    : tr('سند قبض', 'Receipt Voucher');
            case 'IMPORT_EXPENSES': return tr('مصاريف استيراد', 'Import Expenses');
            case 'JOURNAL': return tr('قيد يومية', 'Journal Entry');
            default: return tr('عملية جديدة', 'New Transaction');
        }
        })();
        return isEditing ? `${tr('تعديل', 'Edit')} ${baseTitle}` : baseTitle;
    }, [mode, initialVoucherType, isEnglish, isEditing]);

    const handleFlowSuccess = () => {
        setMode(initialMode);
        onBack();
    };

    const isEntryDateLocked = mode === 'JOURNAL' && !allowEditEntryDate;
    const devUiMarker = import.meta.env.DEV ? 'UI-2026-03-08' : '';

    return (
        <div
            className="app-page transaction-entry-page transaction-mobile-form w-full max-w-full px-3 sm:px-4 pt-[calc(var(--app-safe-top)+0.5rem)] pb-[calc(var(--app-safe-bottom)+0.5rem)] space-y-4 overflow-x-hidden"
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
        >
            <div className="sticky top-2 z-30 bg-gray-50/95 backdrop-blur rounded-2xl border border-gray-100 shadow-sm px-3 py-2">
                <div className="flex items-center justify-between gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-black text-xs hover:bg-gray-100 transition-colors shrink-0"
                    >
                        <ArrowLeft size={14} className={isEnglish ? '' : 'rotate-180'} />
                        {tr('رجوع', 'Back')}
                    </button>
                    <h2 className="text-sm font-black text-gray-800 text-center truncate px-1 flex-1 min-w-0">
                        {screenTitle}
                        {devUiMarker && <span className="ms-1 text-[10px] font-bold text-blue-500">{devUiMarker}</span>}
                    </h2>
                    <div className="w-[64px] sm:w-[78px] shrink-0" />
                </div>
                <div className="mt-2">
                    <div className="header-fields-grid grid grid-cols-1 lg:grid-cols-3 gap-2">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5">
                                {tr('تاريخ العملية', 'Operation Date')}
                            </label>
                            <EnglishDateInput
                                value={sharedState.date}
                                onChange={value => setSharedState(prev => ({ ...prev, date: value }))}
                                disabled={isEntryDateLocked}
                                className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-4 ring-blue-50"
                                aria-label={tr('تاريخ العملية', 'Operation date')}
                            />
                            {isEntryDateLocked && (
                                <div className="mt-1 px-1 text-[10px] font-bold text-amber-600">
                                    {tr('تعديل تاريخ القيد معطل من الإعدادات', 'Journal date editing is disabled in settings')}
                                </div>
                            )}
                            {mode === 'JOURNAL' && journalDateLockEnabled && (
                                <div className="mt-1 px-1 text-[10px] font-bold text-indigo-600">
                                    {tr('الفترة المسموحة', 'Allowed range')}: <span className="dir-ltr">{journalDateLockFrom || '...'} - {journalDateLockTo || '...'}</span>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5">
                                {tr('العملة', 'Currency')}
                            </label>
                            <div className="relative">
                                <select
                                    value={sharedState.currency}
                                    onChange={e => handleCurrencyChange(e.target.value)}
                                    className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-4 ring-blue-50 appearance-none"
                                >
                                    {currencyOptions.map(currency => (
                                        <option key={currency.code} value={currency.code}>
                                            {currency.code} - {currency.symbol}
                                        </option>
                                    ))}
                                </select>
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5">
                                {tr('سعر الصرف', 'Exchange Rate')} ({tr('مقابل', 'vs')} {baseCurrency})
                            </label>
                            <input
                                type="number" inputMode="decimal"
                                min="0.0001"
                                step="0.0001"
                                value={sharedState.rate}
                                onChange={e => {
                                    const parsed = parseFloat(e.target.value);
                                    setSharedState(prev => ({
                                        ...prev,
                                        rate: Number.isFinite(parsed) && parsed > 0 ? parsed : 1
                                    }));
                                }}
                                disabled={sharedState.currency === baseCurrency}
                                className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-4 ring-blue-50 disabled:bg-gray-50 disabled:text-gray-400 dir-ltr"
                                aria-label={tr('سعر الصرف', 'Exchange rate')}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {mode === 'JOURNAL' ? (
                <JournalScreen sharedState={sharedState} onSuccess={handleFlowSuccess} />
            ) : mode === 'VOUCHERS' ? (
                <VoucherScreen
                    initialType={initialVoucherType || 'RECEIPT'}
                    sharedState={sharedState}
                    updateCurrency={handleCurrencyChange}
                    onSuccess={handleFlowSuccess}
                    initialVoucherId={initialVoucherId}
                />
            ) : (
                <InvoiceScreen
                    mode={mode as any}
                    sharedState={sharedState}
                    onDateChange={value => setSharedState(prev => ({ ...prev, date: value }))}
                    onSuccess={handleFlowSuccess}
                    onBack={onBack}
                    linkedInvoiceId={initialLinkedInvoiceId}
                    initialInvoiceId={initialInvoiceId}
                />
            )}
        </div>
    );
};

export default TransactionForm;






