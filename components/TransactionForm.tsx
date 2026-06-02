import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useAccounting } from '../contexts/AccountingContext';
import { TransactionType, Product, InvoiceItem, ContactType, CheckStatus, Contact, Invoice, InvoiceTaxMode, Account, FixedAsset, Check as CheckTypeData, Transaction, InvoiceSettlement, StockTransfer } from '../types';
import ProductCard from './ProductCard';
import ContactEditorDialog from './ContactEditorDialog';
import EnglishDateInput from './EnglishDateInput';
import QuickAddProductModal from './QuickAddProductModal';
import ResponsiveDialog from './layout/ResponsiveDialog';
import ResponsiveOverlay from './layout/ResponsiveOverlay';
import { getDisplayAccountName, getDisplayContactName, getDisplayProductName, getDisplayWarehouseName } from '../utils/displayNames';
import {
    Wallet, ArrowLeft, ArrowRight, Check, X, ChevronDown,
    Plus, Trash2, Package, CreditCard, PlusCircle, ArrowRightLeft, Percent,
    UserPlus, Search, Truck, User, LayoutGrid, Scale,
    ScrollText, ShoppingBag, FilePlus, Ship, Archive, Coins, Receipt,
    ArrowDownLeft, ArrowUpRight, CheckCircle, AlertCircle, Info, Calculator, Layers, Building2, PackagePlus, MoreVertical,
    Banknote, PlusSquare, AlertTriangle, CheckCircle2, ListChecks, Fingerprint, MapPin, Hash, TextQuote,
    Repeat, Tag, StickyNote, AlertOctagon, FileCheck, RefreshCw, Equal, Contact2, ScanBarcode, Forward, RotateCcw, Link as LinkIcon, Ruler, Upload,
    Save, FileText, FileSpreadsheet, Share2, MessageSquareText, MessageCircle
} from 'lucide-react';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { getInvoiceAllocatedAmount, getInvoiceRemainingBase } from '../utils/invoiceSettlement';
import { loadBarcodeReaderSettings } from '../utils/barcodeSettings';
import { Html5Qrcode } from 'html5-qrcode';
import { appendDeviceHubLog } from '../utils/deviceHub';
import { buildNextItemCode, normalizeItemCode } from '../utils/itemCode';
import { resolveInvoiceProductUnitPrice } from '../utils/invoicePricing';
import { buildLastInvoicePriceMap } from '../utils/invoiceLastPrice';
import { getInvoiceTaxVisibility } from '../utils/companySettings';
import { isServiceProduct } from '../utils/productKind';
import {
    calculateInvoiceTaxSummary,
    getDefaultInvoiceTaxMode,
    getInvoiceTaxModeDescription,
    getInvoiceTaxModeLabel,
    isInvoiceTaxApplied,
    resolveInvoiceTaxMode
} from '../utils/invoiceTax';
import { downloadWorkbookFile, sanitizeDownloadName } from '../utils/documentExport';

export type TransactionTabType = 'SALES' | 'SALES_RETURN' | 'QUOTATION' | 'PURCHASES' | 'PURCHASE_RETURN' | 'EXPENSES' | 'VOUCHERS' | 'JOURNAL' | 'IMPORT_EXPENSES' | 'MANUAL_PURCHASE';

export interface InvoiceFormDraftState {
    contactId?: string;
    linkedInvoiceId?: string;
    warehouseId?: string;
    items?: Omit<InvoiceItem, 'id'>[];
    autoFocusContact?: boolean;
    paymentType?: 'CASH' | 'CREDIT';
    paymentAccountId?: string;
    expenseAccountId?: string;
    discount?: string;
    notes?: string;
    invoiceNumber?: string;
    dueDate?: string;
    taxMode?: InvoiceTaxMode;
    taxRateOverride?: string;
}

interface TransactionFormProps {
    initialMode: TransactionTabType;
    initialVoucherType?: 'RECEIPT' | 'PAYMENT';
    initialCategory?: string;
    initialLinkedInvoiceId?: string;
    initialInvoiceId?: string;
    initialVoucherId?: string;
    initialDraft?: InvoiceFormDraftState;
    onBack: () => void;
}

const inputClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-base font-bold text-slate-700 outline-none transition-all duration-300 shadow-sm focus:bg-white focus:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-blue-400/30 placeholder:text-gray-300";
const selectClass = "w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-base font-bold text-slate-700 outline-none appearance-none transition-all duration-300 shadow-sm focus:bg-white focus:shadow-[0_8px_20px_rgba(0,0,0,0.06)] focus:border-blue-400/30";
const tableInputClass = "w-full p-3 text-center text-base sm:text-xs font-black bg-white border border-gray-100 rounded-2xl outline-none transition-all focus:shadow-md focus:border-blue-200 dir-ltr";
const getSearchableInputPaddingClass = (isEnglish: boolean) => isEnglish ? '!pl-11 !pr-16' : '!pr-11 !pl-16';
const getSearchableActionButtonPositionClass = (isEnglish: boolean) => isEnglish ? 'right-3 pl-3 border-l border-slate-200/80' : 'left-3 pr-3 border-r border-slate-200/80';
const getSearchableIconPositionClass = (isEnglish: boolean) => isEnglish ? 'left-4' : 'right-4';

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
    const focusable: HTMLElement[] = Array.from(
        scope.querySelectorAll<HTMLElement>("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")
    );
    const visibleFocusable = focusable.filter((node: HTMLElement) => node.tabIndex !== -1 && node.offsetParent !== null);

    const currentIndex = visibleFocusable.indexOf(target);
    if (currentIndex < 0) return;
    for (let i = currentIndex + 1; i < visibleFocusable.length; i += 1) {
        const next = visibleFocusable[i];
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

interface MobileSubmitDockProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
    buttonClassName?: string;
    summary?: React.ReactNode;
    panelClassName?: string;
}

const MobileSubmitDock: React.FC<MobileSubmitDockProps> = ({
    label,
    onClick,
    disabled = false,
    icon = <CheckCircle2 size={18} />,
    buttonClassName = 'bg-blue-600 text-white hover:bg-blue-500',
    summary,
    panelClassName
}) => {
    const dockPanelToneClassName = panelClassName || 'border-slate-200/80 bg-white/96 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)]';

    return (
        <div className="transaction-mobile-dock md:hidden">
            <div className={`rounded-[1.25rem] border p-2 backdrop-blur ${dockPanelToneClassName}`}>
                {summary ? <div className="mb-2">{summary}</div> : null}
                <button
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    className={`flex w-full min-h-[54px] items-center justify-center gap-2 rounded-[1rem] px-4 py-3 text-[15px] font-black transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
                >
                    {icon}
                    {label}
                </button>
            </div>
        </div>
    );
};

const readFileAsDataUrl = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Unable to read file'));
        };
        reader.onerror = () => reject(reader.error || new Error('File read failed'));
        reader.readAsDataURL(file);
    });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
    new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });

const loadImageFromObjectUrl = (objectUrl: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image load failed'));
        image.src = objectUrl;
    });

const compressImageForInlineStorage = async (
    file: File,
    options?: {
        maxDimension?: number;
        targetBytes?: number;
    }
): Promise<string> => {
    const mimeType = String(file.type || '').toLowerCase();
    if (!mimeType.startsWith('image/')) {
        throw new Error('Only image files are supported.');
    }
    if (mimeType === 'image/svg+xml' || typeof document === 'undefined') {
        return readFileAsDataUrl(file);
    }

    const maxDimension = Math.max(960, Math.floor(options?.maxDimension || 1600));
    const targetBytes = Math.max(180 * 1024, Math.floor(options?.targetBytes || 420 * 1024));
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = await loadImageFromObjectUrl(objectUrl);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
            return readFileAsDataUrl(file);
        }

        const longestSide = Math.max(sourceWidth, sourceHeight);
        const initialScale = longestSide > maxDimension ? maxDimension / longestSide : 1;
        let width = Math.max(1, Math.round(sourceWidth * initialScale));
        let height = Math.max(1, Math.round(sourceHeight * initialScale));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            return readFileAsDataUrl(file);
        }

        let bestBlob: Blob | null = null;
        const qualitySteps = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48];

        for (let sizeAttempt = 0; sizeAttempt < 4; sizeAttempt += 1) {
            canvas.width = width;
            canvas.height = height;
            context.clearRect(0, 0, width, height);
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);

            for (const quality of qualitySteps) {
                const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
                if (!blob) continue;
                bestBlob = blob;
                if (blob.size <= targetBytes) {
                    return readFileAsDataUrl(blob);
                }
            }

            if (Math.max(width, height) <= 900) {
                break;
            }
            width = Math.max(1, Math.round(width * 0.82));
            height = Math.max(1, Math.round(height * 0.82));
        }

        return readFileAsDataUrl(bestBlob || file);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

interface ExpenseLinePreset {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    accountId?: string;
    updatedAt: string;
}

interface StockShortageTransferOption {
    warehouseId: string;
    warehouseName: string;
    availableQty: number;
}

interface StockShortageIssue {
    itemIndex: number;
    product: Product;
    productName: string;
    requestedQty: number;
    availableQty: number;
    shortageQty: number;
    currentWarehouseId: string;
    currentWarehouseName: string;
    alternateWarehouses: StockShortageTransferOption[];
}

const EXPENSE_LINE_PRESETS_STORAGE_PREFIX = 'smart_account_expense_line_presets_v1';

const getExpenseLinePresetsStorageKey = (companyId?: string | null) =>
    `${EXPENSE_LINE_PRESETS_STORAGE_PREFIX}:${companyId || 'default'}`;

const sanitizeExpenseLinePreset = (value: any): ExpenseLinePreset | null => {
    const description = String(value?.description || '').trim();
    if (!description) return null;
    const quantity = Number(value?.quantity);
    const unitPrice = Number(value?.unitPrice);
    const updatedAtRaw = String(value?.updatedAt || '').trim();
    const updatedAt = Number.isNaN(new Date(updatedAtRaw).getTime())
        ? new Date().toISOString()
        : new Date(updatedAtRaw).toISOString();

    return {
        id: String(value?.id || `exp_line_${Math.random().toString(36).slice(2, 10)}`),
        description,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        accountId: String(value?.accountId || '').trim() || undefined,
        updatedAt
    };
};

interface SearchableContactSelectProps {
    contacts: Contact[];
    selectedId: string;
    selectedLabel: string;
    onSelect: (id: string) => void;
    onCreateNew?: (query: string) => void;
    onActionClick?: (query: string) => void;
    actionIcon?: React.ReactNode;
    actionLabel?: string;
    actionButtonClassName?: string;
    displayContactName: (contact?: { id: string; name: string } | null) => string;
    placeholder: string;
    emptyLabel: string;
    createNewLabel?: string;
    isEnglish: boolean;
    autoFocus?: boolean;
    className?: string;
    inputClassName?: string;
    inputTestId?: string;
}

const SearchableContactSelect: React.FC<SearchableContactSelectProps> = ({
    contacts,
    selectedId,
    selectedLabel,
    onSelect,
    onCreateNew,
    onActionClick,
    actionIcon,
    actionLabel,
    actionButtonClassName,
    displayContactName,
    placeholder,
    emptyLabel,
    createNewLabel,
    isEnglish,
    autoFocus = false,
    className = '',
    inputClassName = '',
    inputTestId
}) => {
    const [query, setQuery] = useState(selectedLabel);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const hasAutoFocusedRef = useRef(false);
    const inputPaddingClass = getSearchableInputPaddingClass(isEnglish);
    const actionButtonPositionClass = getSearchableActionButtonPositionClass(isEnglish);
    const searchIconPositionClass = getSearchableIconPositionClass(isEnglish);

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

    useEffect(() => {
        if (!autoFocus || hasAutoFocusedRef.current) return;
        hasAutoFocusedRef.current = true;
        const frameId = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
            setIsOpen(true);
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [autoFocus]);

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
        <div ref={containerRef} className={`searchable-contact-shell relative ${className}`}>
            <Search className={`absolute ${searchIconPositionClass} top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none z-10`} size={16} />
            <input
                ref={inputRef}
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
                            const rawQuery = query.trim();
                            if (onCreateNew && rawQuery) {
                                onCreateNew(rawQuery);
                                setIsOpen(false);
                            } else {
                                setIsOpen(false);
                                setQuery(selectedLabel);
                            }
                        }
                    }
                }}
                placeholder={placeholder}
                autoComplete="off"
                data-enter-skip="true"
                data-testid={inputTestId}
                className={`searchable-contact-trigger ${inputClassName} ${inputPaddingClass}`}
            />
            <button
                type="button"
                onClick={() => {
                    if (onActionClick) {
                        onActionClick(query.trim());
                        return;
                    }
                    setIsOpen(prev => !prev);
                    if (!isOpen) setQuery(selectedLabel);
                }}
                className={`searchable-contact-action absolute ${actionButtonPositionClass} top-1/2 -translate-y-1/2 z-10 flex h-8 items-center ${actionButtonClassName || 'text-gray-400 hover:text-slate-700'}`}
                tabIndex={onActionClick ? 0 : -1}
                title={actionLabel}
            >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/95 shadow-sm ring-1 ring-slate-200/70">
                    {actionIcon || <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                </span>
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
                        <div className="px-4 py-3">
                            <div className="text-xs font-black text-slate-400">{emptyLabel}</div>
                            {onCreateNew && query.trim() && (
                                <button
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                        onCreateNew(query.trim());
                                        setIsOpen(false);
                                    }}
                                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100"
                                >
                                    <UserPlus size={14} />
                                    {createNewLabel || (isEnglish ? 'Add New Contact' : 'إضافة طرف جديد')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface SearchableAccountSelectProps {
    accounts: Account[];
    selectedId: string;
    onSelect: (id: string) => void;
    displayAccountName: (account?: { id: string; name: string } | null) => string;
    placeholder: string;
    emptyLabel: string;
    isEnglish: boolean;
    className?: string;
    inputClassName?: string;
    inputTestId?: string;
}

const SearchableAccountSelect: React.FC<SearchableAccountSelectProps> = ({
    accounts,
    selectedId,
    onSelect,
    displayAccountName,
    placeholder,
    emptyLabel,
    isEnglish,
    className = '',
    inputClassName = '',
    inputTestId
}) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const inputPaddingClass = getSearchableInputPaddingClass(isEnglish);
    const actionButtonPositionClass = getSearchableActionButtonPositionClass(isEnglish);
    const searchIconPositionClass = getSearchableIconPositionClass(isEnglish);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);

    const selectedLabel = useMemo(() => {
        const selected = accounts.find(account => account.id === selectedId);
        return selected ? `${selected.code} - ${displayAccountName(selected)}` : '';
    }, [accounts, selectedId, displayAccountName]);

    useEffect(() => {
        setQuery(selectedLabel);
    }, [selectedLabel]);

    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
                setIsOpen(false);
                setQuery(selectedLabel);
            }
        };
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen, selectedLabel]);

    useEffect(() => {
        if (!isOpen) {
            setDropdownStyle(null);
            return;
        }

        const updateDropdownPosition = () => {
            const trigger = containerRef.current;
            if (!trigger) return;

            const rect = trigger.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const safeMargin = 8;
            const preferredMaxHeight = Math.min(320, Math.floor(viewportHeight * 0.42));
            const spaceBelow = viewportHeight - rect.bottom - safeMargin;
            const spaceAbove = rect.top - safeMargin;
            const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
            const availableHeight = Math.max(
                140,
                Math.min(preferredMaxHeight, (openUpward ? spaceAbove : spaceBelow) - 12)
            );
            const width = Math.min(rect.width, viewportWidth - (safeMargin * 2));
            const left = Math.max(safeMargin, Math.min(rect.left, viewportWidth - width - safeMargin));

            setDropdownStyle(openUpward
                ? {
                    position: 'fixed',
                    left,
                    width,
                    bottom: Math.max(safeMargin, viewportHeight - rect.top + 8),
                    maxHeight: availableHeight,
                    zIndex: 260
                }
                : {
                    position: 'fixed',
                    left,
                    width,
                    top: Math.min(viewportHeight - safeMargin, rect.bottom + 8),
                    maxHeight: availableHeight,
                    zIndex: 260
                });
        };

        updateDropdownPosition();
        window.addEventListener('resize', updateDropdownPosition);
        document.addEventListener('scroll', updateDropdownPosition, true);
        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            document.removeEventListener('scroll', updateDropdownPosition, true);
        };
    }, [isOpen]);

    const filteredAccounts = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return accounts.slice(0, 80);
        return accounts
            .filter(account => {
                const label = `${account.code} - ${displayAccountName(account)}`.toLowerCase();
                return (
                    String(account.code || '').toLowerCase().includes(keyword)
                    || String(account.name || '').toLowerCase().includes(keyword)
                    || label.includes(keyword)
                );
            })
            .slice(0, 80);
    }, [accounts, query, displayAccountName]);

    const handleSelect = (accountId: string) => {
        const target = accounts.find(account => account.id === accountId) || null;
        onSelect(accountId);
        setQuery(target ? `${target.code} - ${displayAccountName(target)}` : '');
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <Search className={`absolute ${searchIconPositionClass} top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none z-10`} size={14} />
            <input
                value={query}
                onChange={(event) => {
                    const nextValue = event.target.value;
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
                        const firstMatch = filteredAccounts[0];
                        if (firstMatch) {
                            handleSelect(firstMatch.id);
                        } else {
                            setIsOpen(false);
                            setQuery(selectedLabel);
                        }
                    }
                }}
                placeholder={placeholder}
                autoComplete="off"
                data-enter-skip="true"
                data-testid={inputTestId}
                className={`${inputClassName} ${inputPaddingClass}`}
            />
            <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                    setIsOpen(prev => !prev);
                    if (!isOpen) setQuery(selectedLabel);
                }}
                className={`absolute ${actionButtonPositionClass} top-1/2 -translate-y-1/2 z-10 flex h-8 items-center text-gray-400 hover:text-slate-700`}
                tabIndex={-1}
                title={isEnglish ? 'Toggle list' : 'فتح/إغلاق القائمة'}
            >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/95 shadow-sm ring-1 ring-slate-200/70">
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {isOpen && dropdownStyle && createPortal(
                <div
                    ref={dropdownRef}
                    style={dropdownStyle}
                    className="overflow-y-auto rounded-[1rem] border border-gray-200 bg-white shadow-2xl"
                >
                    {filteredAccounts.length > 0 ? filteredAccounts.map(account => (
                        <button
                            key={account.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelect(account.id)}
                            className={`w-full px-3 py-2 text-start transition-colors hover:bg-blue-50 ${account.id === selectedId ? 'bg-blue-50/80' : 'bg-white'}`}
                        >
                            <div className="truncate text-xs font-black text-slate-700">{account.code} - {displayAccountName(account)}</div>
                            <div className="mt-0.5 text-[10px] font-bold text-slate-400">{account.type}</div>
                        </button>
                    )) : (
                        <div className="px-3 py-3 text-xs font-black text-slate-400">{emptyLabel}</div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

interface QuickAccountLookupProps {
    accounts: Account[];
    displayAccountName: (account?: { id: string; name: string } | null) => string;
    tr: (ar: string, en: string) => string;
    baseCurrency: string;
    isEnglish: boolean;
    className?: string;
}

const QuickAccountLookup: React.FC<QuickAccountLookupProps> = ({
    accounts,
    displayAccountName,
    tr,
    baseCurrency,
    isEnglish,
    className = ''
}) => {
    const [selectedAccountId, setSelectedAccountId] = useState('');

    const postingAccounts = useMemo(
        () => accounts.filter(account => !account.isGroup),
        [accounts]
    );

    useEffect(() => {
        if (selectedAccountId && !postingAccounts.some(account => account.id === selectedAccountId)) {
            setSelectedAccountId('');
        }
    }, [postingAccounts, selectedAccountId]);

    const selectedAccount = useMemo(
        () => postingAccounts.find(account => account.id === selectedAccountId) || null,
        [postingAccounts, selectedAccountId]
    );
    const selectedAccountLabel = selectedAccount
        ? `${selectedAccount.code || ''}${selectedAccount.code ? ' - ' : ''}${displayAccountName(selectedAccount)}`
        : '';

    const accountTypeLabel = (type?: string) => {
        switch (type) {
            case 'ASSET': return tr('أصل', 'Asset');
            case 'LIABILITY': return tr('التزام', 'Liability');
            case 'EQUITY': return tr('حقوق ملكية', 'Equity');
            case 'REVENUE': return tr('إيراد', 'Revenue');
            case 'EXPENSE': return tr('مصروف', 'Expense');
            default: return type || '-';
        }
    };

    return (
        <div className={`rounded-2xl border border-slate-200 bg-slate-50/70 p-3 ${className}`}>
            <div className="flex items-center gap-2 mb-2">
                <Search size={14} className="text-slate-400" />
                <h4 className="text-xs font-black text-slate-700">
                    {tr('الحسابات (بحث سريع)', 'Accounts (Quick Lookup)')}
                </h4>
            </div>
            <SearchableAccountSelect
                accounts={postingAccounts}
                selectedId={selectedAccountId}
                onSelect={setSelectedAccountId}
                selectedLabel={selectedAccountLabel}
                displayAccountName={displayAccountName}
                placeholder={tr('ابحث باسم الحساب أو الرمز ثم اختره...', 'Search account name/code, then select it...')}
                emptyLabel={tr('لا يوجد حساب مطابق.', 'No matching account found.')}
                isEnglish={isEnglish}
                className="w-full"
                inputClassName={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-300 ${isEnglish ? 'text-left' : 'text-right'}`}
            />
            {selectedAccount && (
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2 text-[10px] font-black text-slate-700">
                    <div>
                        <div className="text-slate-400">{tr('الرمز', 'Code')}</div>
                        <div className="dir-ltr">{selectedAccount.code || '-'}</div>
                    </div>
                    <div>
                        <div className="text-slate-400">{tr('النوع', 'Type')}</div>
                        <div>{accountTypeLabel(selectedAccount.type)}</div>
                    </div>
                    <div className="col-span-2">
                        <div className="text-slate-400">{tr('اسم الحساب', 'Account Name')}</div>
                        <div className="truncate">{displayAccountName(selectedAccount)}</div>
                    </div>
                    <div className="col-span-2">
                        <div className="text-slate-400">{tr('الرصيد الحالي', 'Current Balance')}</div>
                        <div className="dir-ltr">{Number(selectedAccount.balance || 0).toLocaleString()} {baseCurrency}</div>
                    </div>
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
            const dataUrl = await compressImageForInlineStorage(file, { maxDimension: 800, targetBytes: 200 * 1024 });
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
        const manualItemCode = normalizeItemCode(itemCode);
        const resolvedItemCode = manualItemCode || autoItemCodePreview;
        const resolvedItemCodeMode = manualItemCode ? 'MANUAL' : 'AUTO';
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
            itemCodeMode: resolvedItemCodeMode,
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
    onCurrencyChange: (code: string) => void;
    onRateChange: (value: number) => void;
    onModeChange?: (
        nextMode: 'SALES' | 'SALES_RETURN' | 'QUOTATION' | 'PURCHASES' | 'PURCHASE_RETURN' | 'MANUAL_PURCHASE',
        draft?: InvoiceFormDraftState
    ) => void;
    onSuccess: () => void;
    onBack: () => void;
    linkedInvoiceId?: string;
    initialInvoiceId?: string;
    initialDraft?: InvoiceFormDraftState;
}> = ({ mode, sharedState, onDateChange, onCurrencyChange, onRateChange, onModeChange, onSuccess, onBack, linkedInvoiceId: initialLinkedId, initialInvoiceId, initialDraft }) => {
    const { createInvoice, deleteInvoice, contacts, products, companySettings, accounts, invoices, warehouses, updateProduct, addStockTransfer, currentCompanyId, currencies, baseCurrency, stockTransfers } = useAccounting();

    const isSales = mode === 'SALES';
    const isReturn = mode === 'SALES_RETURN';
    const isPurchaseReturn = mode === 'PURCHASE_RETURN';
    const isQuotation = mode === 'QUOTATION';
    const isExpenses = mode === 'EXPENSES';
    const isImportExpenses = mode === 'IMPORT_EXPENSES';
    const isExpenseStyle = isExpenses || isImportExpenses;
    const isExpenseVoucherManualOnly = isExpenses;
    const isPurchase = mode === 'PURCHASES' || mode === 'MANUAL_PURCHASE';
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const isSalesFlow = isSales || isReturn || isQuotation;
    const taxVisibleInInvoices = getInvoiceTaxVisibility(companySettings, isSalesFlow ? 'sales' : 'purchase');
    const autoAddItemPriceInInvoice = companySettings.autoAddItemPriceInInvoice ?? true;
    const invoiceExpiryDateEnabled = companySettings.invoiceExpiryDateEnabled ?? false;
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayContactName = (contact?: { id: string; name: string } | null) => getDisplayContactName(contact || undefined, isEnglish);
    const displayProductName = (product?: { id: string; name: string } | null) => getDisplayProductName(product || undefined, isEnglish);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const displayWarehouseName = (warehouse?: { id: string; name: string } | null) => getDisplayWarehouseName(warehouse || undefined, isEnglish);
    const currencyOptions = currencies.length > 0
        ? currencies
        : [{ code: baseCurrency, name: baseCurrency, symbol: baseCurrency, rate: 1 }];

    // Theme Config based on mode
    const theme = useMemo(() => {
        if (isReturn || isPurchaseReturn) return { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', shadow: 'shadow-rose-100', btn: 'bg-rose-600' };
        if (isQuotation) return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', shadow: 'shadow-amber-100', btn: 'bg-amber-600' };
        if (isPurchase) return { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', shadow: 'shadow-purple-100', btn: 'bg-purple-600' };
        return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', shadow: 'shadow-blue-100', btn: 'bg-blue-600' };
    }, [mode]);

    const invoiceNumberPrefix = useMemo(() => {
        if (isQuotation) return 'QT';
        if (isReturn) return 'SRTN';
        if (isPurchaseReturn) return 'PRTN';
        if (isImportExpenses) return 'IMP';
        if (isExpenses) return 'EXP';
        if (isPurchase) return 'PINV';
        return 'INV';
    }, [isQuotation, isReturn, isPurchaseReturn, isImportExpenses, isExpenses, isPurchase]);

    const getNextStockTransferNumber = (transfers: StockTransfer[]) => {
        const currentYear = new Date().getFullYear();
        const prefix = `TRF-${currentYear}-`;

        const transferNumbers = new Set<string>();
        transfers.forEach(t => {
            if (t.transferNumber && t.transferNumber.startsWith(prefix)) {
                transferNumbers.add(t.transferNumber);
            }
        });

        let maxNum = 0;
        transferNumbers.forEach(numStr => {
            const numPart = numStr.slice(prefix.length);
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
                maxNum = Math.max(maxNum, num);
            }
        });

        const nextNum = maxNum === 0 ? 1 : maxNum + 1;
        const paddedNum = String(nextNum).padStart(6, '0');
        return `${prefix}${paddedNum}`;
    };

    const getNextInvoiceNumber = useCallback((prefix: string) => {
        const currentYear = new Date().getFullYear();
        const yearPrefix = `${prefix}-${currentYear}-`;

        const invoiceNumbers = new Set<string>();
        invoices.forEach(inv => {
            if (inv.invoiceNumber && inv.invoiceNumber.startsWith(yearPrefix)) {
                invoiceNumbers.add(inv.invoiceNumber);
            }
        });

        let maxNum = 0;
        invoiceNumbers.forEach(numStr => {
            const numPart = numStr.slice(yearPrefix.length);
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
                maxNum = Math.max(maxNum, num);
            }
        });

        const nextNum = maxNum === 0 ? 1 : maxNum + 1;
        const paddedNum = String(nextNum).padStart(6, '0');
        return `${yearPrefix}${paddedNum}`;
    }, [invoices]);

    const generateInvoiceNumber = useCallback(() => {
        return getNextInvoiceNumber(invoiceNumberPrefix);
    }, [invoiceNumberPrefix, getNextInvoiceNumber]);

    const defaultContactId = 'cash_customer';
    const [contactId, setContactId] = useState(defaultContactId);
    const selectedContact = useMemo(
        () => contacts.find(c => c.id === contactId),
        [contacts, contactId]
    );
    const selectedContactLabel = selectedContact ? displayContactName(selectedContact) : '';
    const lastInvoicePriceByProduct = useMemo(
        () => buildLastInvoicePriceMap(invoices, {
            contactId,
            mode: (isPurchase || isPurchaseReturn) ? 'PURCHASE' : 'SALES',
            excludeInvoiceId: initialInvoiceId
        }),
        [invoices, contactId, isPurchase, isPurchaseReturn, initialInvoiceId]
    );
    const selectedContactPriceTierLabel = selectedContact?.preferredPriceTier === 'WHOLESALE'
        ? tr('\u062c\u0645\u0644\u0629', 'Wholesale')
        : selectedContact?.preferredPriceTier === 'RETAIL'
            ? tr('\u0645\u0641\u0631\u0642', 'Retail')
            : '';
    const resolvePreferredInvoicePrice = (product: Product) => (
        resolveInvoiceProductUnitPrice(product, {
            contact: selectedContact,
            salesMode: isSales || isReturn || isQuotation
        })
    );
    const resolveLastInvoicePrice = (productId?: string) => (
        productId ? lastInvoicePriceByProduct.get(productId) : undefined
    );
    const resolveInvoiceEntryPrice = (product: Product) => {
        const lastPrice = resolveLastInvoicePrice(product.id);
        return typeof lastPrice === 'number' && lastPrice > 0
            ? lastPrice
            : resolvePreferredInvoicePrice(product);
    };
    const mainWarehouse = useMemo(
        () => warehouses.find(w => w.isMain) || warehouses[0] || null,
        [warehouses]
    );
    const resolvePreferredWarehouseId = () => mainWarehouse?.id || '';
    const hasWarehouses = warehouses.length > 0;
    // Default to main warehouse if available.
    const [warehouseId, setWarehouseId] = useState(resolvePreferredWarehouseId);
    const [stockShortageIssue, setStockShortageIssue] = useState<StockShortageIssue | null>(null);
    const [nestedPurchaseOverlay, setNestedPurchaseOverlay] = useState<{ key: string; draft: InvoiceFormDraftState; } | null>(null);

    const [items, setItems] = useState<Omit<InvoiceItem, 'id'>[]>([]);
    const [editingItemNumericCell, setEditingItemNumericCell] = useState<{ index: number; field: 'quantity' | 'unitPrice' } | null>(null);
    const [editingItemNumericDraft, setEditingItemNumericDraft] = useState('');
    const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
    const [paymentAccountId, setPaymentAccountId] = useState('');

    const [expenseAccountId, setExpenseAccountId] = useState('');

    const defaultInvoiceTaxMode = useMemo(
        () => getDefaultInvoiceTaxMode(taxVisibleInInvoices, companySettings.defaultTaxRate ?? 0),
        [taxVisibleInInvoices, companySettings.defaultTaxRate]
    );
    const [taxMode, setTaxMode] = useState<InvoiceTaxMode>(defaultInvoiceTaxMode);
    const [taxRateOverride, setTaxRateOverride] = useState(String(companySettings.defaultTaxRate ?? 0));
    const [dueDate, setDueDate] = useState(sharedState.date);
    const [discount, setDiscount] = useState('');
    const [notes, setNotes] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [showInvoiceActions, setShowInvoiceActions] = useState(false);
    const [search, setSearch] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const invoiceBarcodeScannerRef = useRef<Html5Qrcode | null>(null);

    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemQty, setNewItemQty] = useState('1');
    const [newItemPrice, setNewItemPrice] = useState('');

    const [showQuickContact, setShowQuickContact] = useState(false);
    const [quickContactInitialName, setQuickContactInitialName] = useState('');
    const [showQuickProduct, setShowQuickProduct] = useState(false);
    const [quickProductInitialName, setQuickProductInitialName] = useState('');
    const [isExchangeRateEditorOpen, setIsExchangeRateEditorOpen] = useState(false);
    const exchangeRateEditorRef = useRef<HTMLDivElement | null>(null);

    // Manual Item State
    const [isManualItem, setIsManualItem] = useState(false);
    const [manualItemDesc, setManualItemDesc] = useState('');
    const [manualItemPrice, setManualItemPrice] = useState('');
    const [manualItemQty, setManualItemQty] = useState('1');

    // New: Link Original Invoice
    const [linkedInvoiceId, setLinkedInvoiceId] = useState(initialLinkedId || '');
    const hasAppliedInitialDraftRef = useRef(false);
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
    const invoiceScreenTitle = useMemo(() => {
        if (isSales) return tr('فاتورة بيع', 'Sales Invoice');
        if (mode === 'MANUAL_PURCHASE') return tr('مشتريات يدوية', 'Manual Purchase');
        if (isPurchaseReturn) return tr('مرتجع شراء', 'Purchase Return');
        if (isReturn) return tr('مرتجع بيع', 'Sales Return');
        if (isPurchase) return tr('فاتورة شراء', 'Purchase Invoice');
        if (isExpenseStyle) return tr('سند مصروف', 'Expense Voucher');
        if (isQuotation) return tr('عرض سعر', 'Quotation');
        return tr('سند', 'Voucher');
    }, [mode, isSales, isPurchaseReturn, isReturn, isPurchase, isExpenseStyle, isQuotation, isEnglish]);
    const showSalesModeTabs = !editingInvoice && (isSales || isReturn || isQuotation);
    const showPurchaseModeTabs = !editingInvoice && (mode === 'PURCHASES' || mode === 'PURCHASE_RETURN' || mode === 'MANUAL_PURCHASE');
    const exchangeRateLabel = Number(sharedState.rate || 1).toLocaleString('en-US', {
        minimumFractionDigits: sharedState.currency === baseCurrency ? 0 : 2,
        maximumFractionDigits: 4
    });

    // EFFECT: Handle auto-linking on mount if ID is provided
    useEffect(() => {
        if (initialLinkedId) {
            handleLinkInvoice(initialLinkedId);
        }
    }, [initialLinkedId]);

    useEffect(() => {
        if (!isExpenseVoucherManualOnly) return;
        setIsManualItem(true);
        setIsSearchFocused(false);
        setSearch('');
    }, [isExpenseVoucherManualOnly]);

    useEffect(() => {
        if (!isExchangeRateEditorOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!exchangeRateEditorRef.current?.contains(event.target as Node)) {
                setIsExchangeRateEditorOpen(false);
            }
        };
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isExchangeRateEditorOpen]);

    useEffect(() => {
        if (sharedState.currency === baseCurrency) {
            setIsExchangeRateEditorOpen(false);
        }
    }, [sharedState.currency, baseCurrency]);

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
        if (isExpenseVoucherManualOnly) {
            const firstMappedExpenseAccountId = sourceItems.find(item => item.accountId)?.accountId || '';
            setExpenseAccountId(firstMappedExpenseAccountId);
        }
        setPaymentType(editingInvoice.paymentType);
        setPaymentAccountId(editingInvoice.paymentAccountId || '');
        setTaxMode(taxVisibleInInvoices ? resolveInvoiceTaxMode(editingInvoice) : 'NONE');
        setTaxRateOverride(String(editingInvoice.taxRate || companySettings.defaultTaxRate || 0));
        setDueDate(editingInvoice.dueDate || editingInvoice.date);
        setDiscount(editingInvoice.discountAmount ? String(editingInvoice.discountAmount) : '');
        setNotes(normalizedNotes);
        setInvoiceNumber(editingInvoice.invoiceNumber || '');
        setLinkedInvoiceId(editingInvoice.linkedInvoiceId || '');
    }, [
        editingInvoice,
        defaultContactId,
        taxVisibleInInvoices,
        companySettings.defaultTaxRate,
        isEnglish,
        isExpenseVoucherManualOnly
    ]);

    useEffect(() => {
        if (editingInvoice || hasAppliedInitialDraftRef.current || !initialDraft) return;

        if (initialDraft.contactId !== undefined) {
            setContactId(initialDraft.contactId);
        }
        if (initialDraft.linkedInvoiceId !== undefined) {
            setLinkedInvoiceId(initialDraft.linkedInvoiceId);
        }
        if (initialDraft.warehouseId !== undefined) {
            setWarehouseId(initialDraft.warehouseId);
        }
        if (Array.isArray(initialDraft.items)) {
            setItems(initialDraft.items.map(item => ({ ...item })));
        }
        if (initialDraft.paymentType !== undefined) {
            setPaymentType(initialDraft.paymentType);
        }
        if (initialDraft.paymentAccountId !== undefined) {
            setPaymentAccountId(initialDraft.paymentAccountId);
        }
        if (initialDraft.expenseAccountId !== undefined) {
            setExpenseAccountId(initialDraft.expenseAccountId);
        }
        if (initialDraft.discount !== undefined) {
            setDiscount(initialDraft.discount);
        }
        if (initialDraft.notes !== undefined) {
            setNotes(initialDraft.notes);
        }
        if (initialDraft.dueDate !== undefined) {
            setDueDate(initialDraft.dueDate);
        }
        if (initialDraft.taxMode !== undefined) {
            setTaxMode(initialDraft.taxMode);
        }
        if (initialDraft.taxRateOverride !== undefined) {
            setTaxRateOverride(initialDraft.taxRateOverride);
        }
        if (initialDraft.invoiceNumber !== undefined) {
            setInvoiceNumber(initialDraft.invoiceNumber);
        }

        setSearch('');
        setIsSearchFocused(false);
        hasAppliedInitialDraftRef.current = true;
    }, [editingInvoice, initialDraft]);

    useEffect(() => {
        if (editingInvoice) return;
        setInvoiceNumber(prev => prev.trim() ? prev : generateInvoiceNumber());
    }, [editingInvoice, generateInvoiceNumber]);

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
        if (editingInvoice) return;
        setTaxRateOverride(String(companySettings.defaultTaxRate ?? 0));
        if (!taxVisibleInInvoices) {
            setTaxMode('NONE');
        }
    }, [companySettings.defaultTaxRate, editingInvoice, taxVisibleInInvoices]);

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
    const fallbackCashAccountId = financialAccounts.find(a => a.id === 'acc_cash')?.id || financialAccounts[0]?.id || '';
    const effectivePaymentAccountId = paymentType === 'CASH'
        ? (paymentAccountId || fallbackCashAccountId)
        : paymentAccountId;

    useEffect(() => {
        if (isExpenseStyle || isQuotation) return;
        const preferredWarehouseId = resolvePreferredWarehouseId();
        const warehouseExists = warehouseId && warehouses.some(w => w.id === warehouseId);
        if (!warehouseExists) {
            setWarehouseId(preferredWarehouseId);
        }
    }, [warehouses, warehouseId, isExpenseStyle, isQuotation, mainWarehouse]);

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
    const selectedExpenseAccount = useMemo(
        () => expenseAccounts.find(account => account.id === expenseAccountId) || null,
        [expenseAccounts, expenseAccountId]
    );
    const expenseLinePresetsStorageKey = useMemo(
        () => getExpenseLinePresetsStorageKey(currentCompanyId),
        [currentCompanyId]
    );
    const [savedExpenseLinePresets, setSavedExpenseLinePresets] = useState<ExpenseLinePreset[]>([]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(expenseLinePresetsStorageKey);
            if (!raw) {
                setSavedExpenseLinePresets([]);
                return;
            }
            const parsed = JSON.parse(raw);
            const next = Array.isArray(parsed)
                ? parsed
                    .map(sanitizeExpenseLinePreset)
                    .filter((preset): preset is ExpenseLinePreset => Boolean(preset))
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .slice(0, 30)
                : [];
            setSavedExpenseLinePresets(next);
        } catch {
            setSavedExpenseLinePresets([]);
        }
    }, [expenseLinePresetsStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(expenseLinePresetsStorageKey, JSON.stringify(savedExpenseLinePresets));
        } catch {
            // Ignore local persistence failures and keep invoice entry working.
        }
    }, [expenseLinePresetsStorageKey, savedExpenseLinePresets]);

    const saveExpenseLinePreset = (payload: {
        description: string;
        quantity: number;
        unitPrice: number;
        accountId?: string;
    }) => {
        if (!isExpenseVoucherManualOnly) return;

        const description = payload.description.trim();
        if (!description) return;

        const quantity = Number(payload.quantity);
        const unitPrice = Number(payload.unitPrice);
        const accountId = String(payload.accountId || '').trim() || undefined;
        const normalizedDescription = description.toLowerCase();
        const updatedAt = new Date().toISOString();

        setSavedExpenseLinePresets(prev => {
            const existing = prev.find(preset =>
                preset.description.trim().toLowerCase() === normalizedDescription
                && (preset.accountId || '') === (accountId || '')
            );
            const nextPreset: ExpenseLinePreset = {
                id: existing?.id || `exp_line_${Math.random().toString(36).slice(2, 10)}`,
                description,
                quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
                accountId,
                updatedAt
            };
            const rest = prev.filter(preset => preset.id !== nextPreset.id);
            return [nextPreset, ...rest]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 30);
        });
    };

    const removeExpenseLinePreset = (presetId: string) => {
        setSavedExpenseLinePresets(prev => prev.filter(preset => preset.id !== presetId));
    };

    const applyExpenseLinePreset = (preset: ExpenseLinePreset) => {
        setManualItemDesc(preset.description);
        setManualItemQty(String(preset.quantity || 1));
        setManualItemPrice(String(preset.unitPrice || 0));
        if (!expenseAccountId && preset.accountId && expenseAccounts.some(account => account.id === preset.accountId)) {
            setExpenseAccountId(preset.accountId);
        }
    };

    const filteredExpenseLinePresets = useMemo(() => {
        const keyword = manualItemDesc.trim().toLowerCase();
        return [...savedExpenseLinePresets]
            .filter(preset => !keyword || preset.description.toLowerCase().includes(keyword))
            .sort((a, b) => {
                const accountBoostA = a.accountId && a.accountId === expenseAccountId ? 1 : 0;
                const accountBoostB = b.accountId && b.accountId === expenseAccountId ? 1 : 0;
                if (accountBoostA !== accountBoostB) return accountBoostB - accountBoostA;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            })
            .slice(0, 6);
    }, [savedExpenseLinePresets, manualItemDesc, expenseAccountId]);

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
    }, [search, products, isSearchFocused, isEnglish, selectedContact?.preferredPriceTier, isSales, isReturn, isQuotation]);

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

    const buildUpdatedItems = (sourceItems: Omit<InvoiceItem, 'id'>[], index: number, field: keyof InvoiceItem, safeValue: number) => (
        sourceItems.map((item, i) => {
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
        })
    );

    const refreshStockShortageDialog = (
        sourceItems: Omit<InvoiceItem, 'id'>[],
        options: {
            openDialogOnShortage?: boolean;
            clearResolvedDialog?: boolean;
            warehouseIdOverride?: string;
        } = {}
    ) => {
        const { openDialogOnShortage = true, clearResolvedDialog = true, warehouseIdOverride } = options;
        const effectiveWarehouseId = warehouseIdOverride ?? warehouseId;
        const shouldCheckStock = isSales && !isQuotation && !(companySettings.allowNegativeStock ?? false) && Boolean(effectiveWarehouseId);

        if (!shouldCheckStock) {
            if (clearResolvedDialog) {
                setStockShortageIssue(null);
            }
            return null;
        }

        const shortageIssue = buildSalesStockShortageIssue(sourceItems, effectiveWarehouseId);
        if (shortageIssue && openDialogOnShortage) {
            setStockShortageIssue(shortageIssue);
        } else if (!shortageIssue && clearResolvedDialog) {
            setStockShortageIssue(null);
        }
        return shortageIssue;
    };

    const openNestedPurchaseOverlay = (draft: InvoiceFormDraftState) => {
        setNestedPurchaseOverlay({
            key: `purchase-overlay-${Date.now()}`,
            draft
        });
    };

    const closeNestedPurchaseOverlay = () => {
        setNestedPurchaseOverlay(null);
    };

    const addItem = (product: Product) => {
        const price = autoAddItemPriceInInvoice ? resolveInvoiceEntryPrice(product) : 0;
        const existing = items.find(i => i.productId === product.id);
        const nextItems = existing
            ? items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice } : i)
            : [...items, { productId: product.id, description: product.name, quantity: 1, unitPrice: price, total: price }];

        setItems(nextItems);
        refreshStockShortageDialog(nextItems);

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
            productId: undefined,
            accountId: isExpenseVoucherManualOnly ? expenseAccountId : undefined
        }]);
        if (isExpenseVoucherManualOnly) {
            saveExpenseLinePreset({
                description: manualItemDesc,
                quantity: qty,
                unitPrice: price,
                accountId: expenseAccountId || undefined
            });
        }
        setManualItemDesc('');
        setManualItemQty('1');
        setManualItemPrice('');
        setIsManualItem(false);
    };

    const handleInlineManualItemAdd = () => {
        if (!manualItemDesc.trim() || !manualItemPrice.trim()) return;
        addManualItem();
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
        saveExpenseLinePreset({
            description: newItemDesc,
            quantity: qty,
            unitPrice: price,
            accountId: expenseAccountId || undefined
        });
        setNewItemDesc('');
        setNewItemQty('1');
        setNewItemPrice('');
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: number) => {
        const safeValue = Number.isFinite(value) ? value : 0;
        setItems(buildUpdatedItems(items, index, field, safeValue));
    };
    const beginItemNumericCellEdit = (index: number, field: 'quantity' | 'unitPrice', value: number) => {
        setEditingItemNumericCell({ index, field });
        setEditingItemNumericDraft(String(Number.isFinite(value) ? value : 0));
    };
    const handleItemNumericCellChange = (index: number, field: 'quantity' | 'unitPrice', rawValue: string) => {
        const normalized = normalizeEditableNumberInput(rawValue);
        setEditingItemNumericDraft(normalized);
        const parsed = parseFloat(normalized);
        updateItem(index, field, Number.isFinite(parsed) ? parsed : 0);
    };
    const finishItemNumericCellEdit = (index: number, field: 'quantity' | 'unitPrice', rawValue?: string) => {
        const normalized = normalizeEditableNumberInput(rawValue ?? editingItemNumericDraft);
        const parsed = parseFloat(normalized);
        const safeValue = Number.isFinite(parsed) ? parsed : 0;
        const nextItems = buildUpdatedItems(items, index, field, safeValue);
        setItems(nextItems);
        if (field === 'quantity') {
            refreshStockShortageDialog(nextItems);
        }
        setEditingItemNumericCell(null);
        setEditingItemNumericDraft('');
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

    const effectiveTaxMode = taxVisibleInInvoices ? taxMode : 'NONE';
    const taxRateValue = effectiveTaxMode === 'NONE' ? 0 : Math.max(0, parseFloat(taxRateOverride) || 0);
    const taxModeDescription = getInvoiceTaxModeDescription(effectiveTaxMode, tr);
    const totals = useMemo(() => calculateInvoiceTaxSummary({
        itemsTotal: items.reduce((sum, item) => sum + item.total, 0),
        discountAmount: parseFloat(discount) || 0,
        taxRate: taxRateValue,
        taxMode: effectiveTaxMode
    }), [items, discount, taxRateValue, effectiveTaxMode]);

    const invoiceCategory = useMemo(() => {
        if (isPurchase) return 'purchase_invoice';
        if (isImportExpenses) return 'import_expenses';
        if (isExpenses) return 'general_expense';
        if (isReturn) return 'sales_return';
        if (isPurchaseReturn) return 'purchase_return';
        return 'sales_invoice';
    }, [isPurchase, isImportExpenses, isExpenses, isReturn, isPurchaseReturn]);
    const invoiceStatus = isQuotation ? 'QUOTATION' : (paymentType === 'CASH' ? 'PAID' : 'PENDING');
    const storedNotes = notes.trim()
        ? (isImportExpenses
            ? `${tr('مصاريف استيراد', 'Import expenses')}: ${notes.trim()}`
            : (isExpenses ? `${tr('مصروفات', 'Expenses')}: ${notes.trim()}` : notes.trim()))
        : '';
    const selectedWarehouse = warehouseId ? warehouses.find(warehouse => warehouse.id === warehouseId) || null : null;
    const selectedPaymentAccount = effectivePaymentAccountId ? financialAccounts.find(account => account.id === effectivePaymentAccountId) || null : null;
    const selectedCounterpartyLabel = selectedContactLabel
        || (isSalesFlow ? tr('عميل نقدي', 'Walk-in Customer') : tr('مورد عام', 'Generic Supplier'));

    const escapeHtml = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatAmount = (value: number) => Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    const normalizeEditableNumberInput = (value: string) => toEnglishDigits(String(value || ''))
        .replace(/\u066B/g, '.')
        .replace(/[\u066C\u060C,]/g, '')
        .replace(/[^\d.\-]/g, '');
    const isEditingItemNumericCell = (index: number, field: 'quantity' | 'unitPrice') =>
        editingItemNumericCell?.index === index && editingItemNumericCell?.field === field;
    const getItemNumericCellDisplayValue = (index: number, field: 'quantity' | 'unitPrice', value: number) =>
        isEditingItemNumericCell(index, field) ? editingItemNumericDraft : formatAmount(value);
    const getEffectiveInvoiceNumber = () => invoiceNumber.trim() || editingInvoice?.invoiceNumber || generateInvoiceNumber();
    const getWarehouseStockQuantity = (product?: Product | null, targetWarehouseId?: string) => {
        if (!product || isServiceProduct(product)) return 0;
        if (targetWarehouseId) {
            return product.warehouseStock?.find(entry => entry.warehouseId === targetWarehouseId)?.quantity ?? 0;
        }
        return product.stock ?? 0;
    };
    const getRequestedStockQuantity = (
        productId?: string,
        fallbackQty: number = 0,
        options?: {
            sourceItems?: Omit<InvoiceItem, 'id'>[];
            itemIndex?: number;
        }
    ) => {
        if (!productId) return fallbackQty;
        if (!(isSales && !isQuotation)) return fallbackQty;
        const sourceItems = options?.sourceItems || items;
        const scopedItems = typeof options?.itemIndex === 'number'
            ? sourceItems.slice(0, options.itemIndex + 1)
            : sourceItems;
        const totalRequestedQty = scopedItems.reduce((sum, entry) => {
            if (entry.productId !== productId) return sum;
            const quantity = Number(entry.quantity) || 0;
            return quantity > 0 ? sum + quantity : sum;
        }, 0);
        return totalRequestedQty > 0 ? totalRequestedQty : fallbackQty;
    };
    const buildSalesStockShortageIssue = (sourceItems: Omit<InvoiceItem, 'id'>[], warehouseIdOverride?: string) => {
        const effectiveWarehouseId = warehouseIdOverride ?? warehouseId;
        const effectiveWarehouse = effectiveWarehouseId
            ? warehouses.find(warehouse => warehouse.id === effectiveWarehouseId) || null
            : null;
        if (!effectiveWarehouseId) return null;
        for (let index = 0; index < sourceItems.length; index += 1) {
            const item = sourceItems[index];
            if (!item.productId) continue;
            const product = products.find(prod => prod.id === item.productId);
            if (!product || isServiceProduct(product)) continue;
            const lineQty = Number(item.quantity) || 0;
            if (lineQty <= 0) continue;
            const requestedQty = getRequestedStockQuantity(item.productId, lineQty, { sourceItems, itemIndex: index });
            const availableQty = getWarehouseStockQuantity(product, effectiveWarehouseId);
            if (availableQty >= requestedQty) continue;
            const alternateWarehouses = warehouses
                .filter(warehouse => warehouse.id !== effectiveWarehouseId)
                .map(warehouse => ({
                    warehouseId: warehouse.id,
                    warehouseName: displayWarehouseName(warehouse),
                    availableQty: getWarehouseStockQuantity(product, warehouse.id)
                }))
                .filter(option => option.availableQty > 0)
                .sort((a, b) => b.availableQty - a.availableQty);
            return {
                itemIndex: index,
                product,
                productName: displayProductName(product) || product.name || tr('هذا الصنف', 'this item'),
                requestedQty,
                availableQty,
                shortageQty: Math.max(requestedQty - availableQty, 0),
                currentWarehouseId: effectiveWarehouseId,
                currentWarehouseName: displayWarehouseName(effectiveWarehouse) || tr('المستودع الحالي', 'Current warehouse'),
                alternateWarehouses
            } satisfies StockShortageIssue;
        }
        return null;
    };
    const openPurchaseForStockShortage = (issue: StockShortageIssue) => {
        const purchaseQty = Math.max(1, Number(issue.shortageQty) || 1);
        const unitPrice = Number(issue.product.buyPrice) || 0;
        setWarehouseId(issue.currentWarehouseId);
        setStockShortageIssue(null);
        openNestedPurchaseOverlay({
            contactId: '',
            linkedInvoiceId: '',
            warehouseId: issue.currentWarehouseId,
            items: [{
                productId: issue.product.id,
                description: issue.productName,
                quantity: purchaseQty,
                unitPrice,
                total: purchaseQty * unitPrice
            }],
            autoFocusContact: true,
            paymentType: 'CREDIT',
            paymentAccountId: '',
            expenseAccountId: '',
            discount: '',
            notes: `${tr('طلب شراء بسبب نقص المخزون في', 'Purchase request due to low stock in')} ${issue.currentWarehouseName}`,
            invoiceNumber: ''
        });
    };
    const handleImmediateWarehouseTransfer = (sourceWarehouseId: string) => {
        if (!stockShortageIssue) return;
        const sourceOption = stockShortageIssue.alternateWarehouses.find(option => option.warehouseId === sourceWarehouseId);
        const transferQty = Math.min(stockShortageIssue.shortageQty, Number(sourceOption?.availableQty || 0));
        if (!sourceOption || transferQty <= 0) {
            alert(tr('الكمية غير متاحة في هذا المخزن الآن.', 'The quantity is not available in this warehouse right now.'));
            return;
        }

        addStockTransfer({
            transferNumber: getNextStockTransferNumber(stockTransfers),
            date: sharedState.date || getTodayDateString(),
            fromWarehouseId: sourceWarehouseId,
            toWarehouseId: stockShortageIssue.currentWarehouseId,
            items: [{
                productId: stockShortageIssue.product.id,
                quantity: transferQty,
                description: stockShortageIssue.product.name
            }],
            notes: `${tr('تحويل فوري من شاشة البيع للصنف', 'Immediate transfer from sales invoice for item')} ${stockShortageIssue.productName}`,
            status: 'POSTED'
        });

        const remainingShortage = Math.max(stockShortageIssue.shortageQty - transferQty, 0);
        const nextAlternateWarehouses = stockShortageIssue.alternateWarehouses
            .map(option => option.warehouseId === sourceWarehouseId
                ? { ...option, availableQty: Math.max(0, option.availableQty - transferQty) }
                : option)
            .filter(option => option.availableQty > 0);

        if (remainingShortage <= 0) {
            setStockShortageIssue(null);
            alert(tr(
                `تم تحويل ${formatAmount(transferQty)} من ${sourceOption.warehouseName} إلى ${stockShortageIssue.currentWarehouseName}. يمكنك متابعة الترحيل الآن.`,
                `Transferred ${formatAmount(transferQty)} from ${sourceOption.warehouseName} to ${stockShortageIssue.currentWarehouseName}. You can post now.`
            ));
            return;
        }

        setStockShortageIssue(prev => prev ? {
            ...prev,
            availableQty: prev.availableQty + transferQty,
            shortageQty: remainingShortage,
            alternateWarehouses: nextAlternateWarehouses
        } : prev);
        alert(tr(
            `تم تحويل ${formatAmount(transferQty)} من ${sourceOption.warehouseName}. ما زال هناك نقص بمقدار ${formatAmount(remainingShortage)}.`,
            `Transferred ${formatAmount(transferQty)} from ${sourceOption.warehouseName}. ${formatAmount(remainingShortage)} is still missing.`
        ));
    };

    const buildDraftInvoice = (): Invoice => ({
        id: editingInvoice?.id || `draft-${Date.now()}`,
        invoiceNumber: getEffectiveInvoiceNumber(),
        customerId: contactId || undefined,
        linkedInvoiceId: linkedInvoiceId || undefined,
        type: (isSales || isQuotation || isPurchaseReturn) ? TransactionType.INCOME : TransactionType.EXPENSE,
        category: invoiceCategory,
        date: sharedState.date,
        dueDate: invoiceExpiryDateEnabled ? dueDate : undefined,
        items: items.map((item, index) => ({
            id: editingInvoice?.items?.[index]?.id || `draft-item-${index + 1}`,
            ...item
        })),
        subTotal: totals.subTotalForInvoice,
        taxRate: totals.rate,
        taxAmount: totals.tax,
        taxMode: effectiveTaxMode,
        discountAmount: totals.disc,
        totalAmount: totals.total,
        status: invoiceStatus,
        postingStatus: editingInvoice?.postingStatus || 'DRAFT',
        paymentType,
        paymentAccountId: effectivePaymentAccountId || undefined,
        notes: storedNotes,
        currency: sharedState.currency,
        exchangeRate: sharedState.rate,
        warehouseId: (!isExpenseStyle && hasWarehouses) ? (warehouseId || undefined) : undefined
    });

    const buildModeSwitchDraft = (): InvoiceFormDraftState => {
        const trimmedInvoiceNumber = invoiceNumber.trim();
        const autoGeneratedNumberPattern = new RegExp(`^${invoiceNumberPrefix}-\\d{4}-\\d{6}$`);
        const preservedInvoiceNumber = trimmedInvoiceNumber && !autoGeneratedNumberPattern.test(trimmedInvoiceNumber)
            ? trimmedInvoiceNumber
            : undefined;

        return {
            contactId,
            linkedInvoiceId,
            warehouseId,
            items: items.map(item => ({ ...item })),
            paymentType,
            paymentAccountId,
            expenseAccountId,
            discount,
            notes,
            invoiceNumber: preservedInvoiceNumber,
            dueDate,
            taxMode,
            taxRateOverride
        };
    };

    const openExternalWindow = (url: string, blockedMessage: string) => {
        const popup = window.open(url, '_blank', 'noopener,noreferrer');
        if (popup) {
            return popup;
        }
        try {
            window.location.href = url;
            return window;
        } catch {
            alert(blockedMessage);
            return null;
        }
    };

    const normalizePhoneForDirectMessage = (value?: string) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (raw.startsWith('+')) {
            return raw.replace(/[^\d]/g, '');
        }
        const digitsOnly = raw.replace(/[^\d]/g, '');
        if (digitsOnly.startsWith('00')) {
            return digitsOnly.slice(2);
        }
        return /^\d{8,15}$/.test(digitsOnly) && !digitsOnly.startsWith('0') ? digitsOnly : '';
    };

    const buildWhatsAppLink = (message: string, phone?: string) => {
        const directPhone = normalizePhoneForDirectMessage(phone);
        return directPhone
            ? `https://wa.me/${directPhone}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;
    };

    const buildSmsLink = (message: string, phone?: string) => {
        const targetPhone = String(phone || '').trim().replace(/\s+/g, '');
        return `sms:${targetPhone}?&body=${encodeURIComponent(message)}`;
    };

    const exportWorkbookFile = (
        rows: Array<Array<string | number>>,
        options: {
            sheetName: string;
            fileName: string;
            columnWidths: number[];
            autoFilterRowIndex?: number;
        }
    ) => {
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = options.columnWidths.map(width => ({ wch: width }));
        if (typeof options.autoFilterRowIndex === 'number') {
            worksheet['!autofilter'] = {
                ref: XLSX.utils.encode_range({
                    s: { r: options.autoFilterRowIndex, c: 0 },
                    e: { r: options.autoFilterRowIndex, c: options.columnWidths.length - 1 }
                })
            };
        }

        const workbook = XLSX.utils.book_new();
        workbook.Workbook = { Views: [{ RTL: !isEnglish }] };
        XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName);
        downloadWorkbookFile(workbook, {
            fileName: sanitizeDownloadName(options.fileName)
        });
    };

    const buildInvoiceShareText = () => {
        const draft = buildDraftInvoice();
        const draftTaxMode = resolveInvoiceTaxMode(draft);
        const itemLines = draft.items.map((item, index) => {
            const product = item.productId ? products.find(productEntry => productEntry.id === item.productId) : undefined;
            const itemLabel = product ? displayProductName(product) : item.description;
            return `${index + 1}. ${itemLabel} x ${formatAmount(item.quantity)} = ${formatAmount(item.total)} ${draft.currency}`;
        });
        return [
            invoiceScreenTitle,
            `${tr('رقم الفاتورة', 'Invoice No.')}: ${draft.invoiceNumber}`,
            `${tr('التاريخ', 'Date')}: ${draft.date}`,
            `${isSalesFlow ? tr('العميل', 'Customer') : tr('المورد', 'Supplier')}: ${selectedCounterpartyLabel}`,
            selectedWarehouse ? `${tr('المخزن', 'Warehouse')}: ${displayWarehouseName(selectedWarehouse)}` : '',
            selectedPaymentAccount ? `${tr('الحساب', 'Account')}: ${displayAccountName(selectedPaymentAccount)}` : '',
            storedNotes ? `${tr('التفاصيل', 'Details')}: ${notes.trim()}` : '',
            '',
            ...itemLines,
            '',
            `${tr('الإجمالي قبل الضريبة', 'Subtotal')}: ${formatAmount(draft.subTotal)} ${draft.currency}`,
            draft.discountAmount > 0 ? `${tr('الخصم', 'Discount')}: ${formatAmount(draft.discountAmount)} ${draft.currency}` : '',
            taxVisibleInInvoices ? `${tr('طريقة الضريبة', 'Tax mode')}: ${getInvoiceTaxModeDescription(draftTaxMode, tr)}` : '',
            (taxVisibleInInvoices && draft.taxAmount > 0) ? `${tr('الضريبة', 'Tax')}: ${formatAmount(draft.taxAmount)} ${draft.currency}` : '',
            `${tr('الصافي', 'Net')}: ${formatAmount(draft.totalAmount)} ${draft.currency}`
        ].filter(Boolean).join('\n');
    };

    const buildInvoiceNotificationText = () => {
        const draft = buildDraftInvoice();
        return [
            tr(
                `نفيدكم بتسجيل ${invoiceScreenTitle} رقم ${draft.invoiceNumber} على حسابكم.`,
                `A ${invoiceScreenTitle} document ${draft.invoiceNumber} was posted to your account.`
            ),
            `${isSalesFlow ? tr('العميل', 'Customer') : tr('المورد', 'Supplier')}: ${selectedCounterpartyLabel}`,
            `${tr('التاريخ', 'Date')}: ${draft.date}`,
            `${tr('القيمة', 'Amount')}: ${formatAmount(draft.totalAmount)} ${draft.currency}`,
            paymentType === 'CREDIT'
                ? `${tr('نوع الدفع', 'Payment')}: ${tr('آجل', 'Credit')}`
                : `${tr('نوع الدفع', 'Payment')}: ${tr('نقدي', 'Cash')}`
        ].join('\n');
    };

    const handlePrintPreview = () => {
        const draft = buildDraftInvoice();
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert(tr('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
            return;
        }
        try {
            const printDir = isEnglish ? 'ltr' : 'rtl';
            const printLang = isEnglish ? 'en' : 'ar';
            const draftTaxMode = resolveInvoiceTaxMode(draft);
            const rowsHtml = draft.items.map((item, index) => {
                const product = item.productId ? products.find(productEntry => productEntry.id === item.productId) : undefined;
                const itemLabel = escapeHtml(product ? displayProductName(product) : item.description);
                const itemCode = escapeHtml(product?.itemCode || product?.barcode || '');
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td style="text-align:${isEnglish ? 'left' : 'right'};">${itemLabel}</td>
                        <td dir="ltr">${itemCode || '-'}</td>
                        <td dir="ltr">${formatAmount(item.quantity)}</td>
                        <td dir="ltr">${formatAmount(item.unitPrice)}</td>
                        <td dir="ltr">${formatAmount(item.total)}</td>
                    </tr>
                `;
            }).join('');
            const notesBlock = notes.trim()
                ? `<div class="notes"><strong>${escapeHtml(tr('التفاصيل', 'Details'))}:</strong> ${escapeHtml(notes.trim()).replace(/\n/g, '<br />')}</div>`
                : '';
            printWindow.document.open();
            printWindow.document.write(`
                <!DOCTYPE html>
                <html dir="${printDir}" lang="${printLang}">
                    <head>
                        <meta charset="utf-8" />
                        <title>${escapeHtml(invoiceScreenTitle)} - ${escapeHtml(draft.invoiceNumber)}</title>
                        <style>
                            body { font-family: ${isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', Arial, sans-serif"}; margin: 0; padding: 32px; color: #0f172a; background: #f8fafc; }
                            .sheet { max-width: 920px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 28px; box-shadow: 0 16px 50px rgba(15, 23, 42, 0.08); }
                            .header { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 2px solid #e2e8f0; }
                            .title { font-size: 28px; font-weight: 900; margin: 0 0 8px; color: #1d4ed8; }
                            .muted { margin: 0; color: #64748b; font-size: 13px; }
                            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; margin: 22px 0; }
                            .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; }
                            .meta-card strong { display: block; font-size: 12px; color: #64748b; margin-bottom: 6px; }
                            .meta-card span { font-size: 16px; font-weight: 800; }
                            .notes { margin: 18px 0 0; padding: 14px 16px; border-radius: 16px; background: #eff6ff; border: 1px solid #bfdbfe; }
                            table { width: 100%; border-collapse: collapse; margin-top: 24px; overflow: hidden; border-radius: 18px; }
                            th { background: #0f172a; color: #fff; font-size: 12px; padding: 12px 10px; }
                            td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: center; }
                            .totals { margin-top: 22px; display: flex; justify-content: flex-end; }
                            .totals-box { min-width: 280px; background: #0f172a; color: #fff; border-radius: 20px; padding: 18px 20px; }
                            .totals-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
                            .totals-row.total { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.18); font-size: 18px; font-weight: 900; }
                        </style>
                    </head>
                    <body>
                        <div class="sheet">
                            <div class="header">
                                <div>
                                    <h1 class="title">${escapeHtml(invoiceScreenTitle)}</h1>
                                    <p class="muted">${escapeHtml(companySettings.name || '')}</p>
                                </div>
                                <div style="text-align:${isEnglish ? 'left' : 'right'};">
                                    <p class="muted">${escapeHtml(tr('رقم الفاتورة', 'Invoice No.'))}: <strong>${escapeHtml(draft.invoiceNumber)}</strong></p>
                                    <p class="muted">${escapeHtml(tr('التاريخ', 'Date'))}: <strong>${escapeHtml(draft.date)}</strong></p>
                                    <p class="muted">${escapeHtml(tr('العملة', 'Currency'))}: <strong>${escapeHtml(draft.currency)}</strong></p>
                                </div>
                            </div>
                            <div class="meta">
                                <div class="meta-card">
                                    <strong>${escapeHtml(isSalesFlow ? tr('العميل', 'Customer') : tr('المورد', 'Supplier'))}</strong>
                                    <span>${escapeHtml(selectedCounterpartyLabel)}</span>
                                </div>
                                <div class="meta-card">
                                    <strong>${escapeHtml(tr('نوع الدفع', 'Payment'))}</strong>
                                    <span>${escapeHtml(paymentType === 'CASH' ? tr('نقدي', 'Cash') : tr('آجل', 'Credit'))}</span>
                                </div>
                                <div class="meta-card">
                                    <strong>${escapeHtml(tr('المخزن', 'Warehouse'))}</strong>
                                    <span>${escapeHtml(selectedWarehouse ? displayWarehouseName(selectedWarehouse) : '-')}</span>
                                </div>
                                <div class="meta-card">
                                    <strong>${escapeHtml(tr('الحساب', 'Account'))}</strong>
                                    <span>${escapeHtml(selectedPaymentAccount ? displayAccountName(selectedPaymentAccount) : '-')}</span>
                                </div>
                            </div>
                            ${notesBlock}
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>${escapeHtml(tr('الصنف / الوصف', 'Item / Description'))}</th>
                                        <th>${escapeHtml(tr('الرمز', 'Code'))}</th>
                                        <th>${escapeHtml(tr('الكمية', 'Qty'))}</th>
                                        <th>${escapeHtml(tr('السعر', 'Price'))}</th>
                                        <th>${escapeHtml(tr('الإجمالي', 'Total'))}</th>
                                    </tr>
                                </thead>
                                <tbody>${rowsHtml || `<tr><td colspan="6">${escapeHtml(tr('لا توجد بنود بعد', 'No line items yet'))}</td></tr>`}</tbody>
                            </table>
                            <div class="totals">
                                <div class="totals-box">
                                    <div class="totals-row"><span>${escapeHtml(tr('الإجمالي قبل الضريبة', 'Subtotal'))}</span><strong>${formatAmount(draft.subTotal)} ${escapeHtml(draft.currency)}</strong></div>
                                    <div class="totals-row"><span>${escapeHtml(tr('الخصم', 'Discount'))}</span><strong>${formatAmount(draft.discountAmount)} ${escapeHtml(draft.currency)}</strong></div>
                                    ${taxVisibleInInvoices ? `<div class="totals-row"><span>${escapeHtml(tr('طريقة الضريبة', 'Tax mode'))}</span><strong>${escapeHtml(getInvoiceTaxModeDescription(draftTaxMode, tr))}</strong></div>` : ''}
                                    ${(taxVisibleInInvoices && draft.taxAmount > 0) ? `<div class="totals-row"><span>${escapeHtml(tr('الضريبة', 'Tax'))}</span><strong>${formatAmount(draft.taxAmount)} ${escapeHtml(draft.currency)}</strong></div>` : ''}
                                    <div class="totals-row total"><span>${escapeHtml(tr('الصافي', 'Net'))}</span><strong>${formatAmount(draft.totalAmount)} ${escapeHtml(draft.currency)}</strong></div>
                                </div>
                            </div>
                        </div>
                        <script>window.onload = function () { window.print(); };</script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        } catch {
            if (!printWindow.closed) {
                printWindow.close();
            }
            alert(tr('تعذر تجهيز معاينة الفاتورة للطباعة الآن.', 'Could not prepare the invoice preview for printing right now.'));
        }
    };

    const handleDownloadExcel = () => {
        try {
            const draft = buildDraftInvoice();
            const draftTaxMode = resolveInvoiceTaxMode(draft);
            const itemHeader = [
                '#',
                tr('الصنف / الوصف', 'Item / Description'),
                tr('الرمز', 'Code'),
                tr('الكمية', 'Qty'),
                tr('السعر', 'Price'),
                tr('الإجمالي', 'Total')
            ];
            const rows: Array<Array<string | number>> = [
                [invoiceScreenTitle],
                [],
                [tr('رقم الفاتورة', 'Invoice No.'), draft.invoiceNumber, tr('التاريخ', 'Date'), draft.date],
                [isSalesFlow ? tr('العميل', 'Customer') : tr('المورد', 'Supplier'), selectedCounterpartyLabel, tr('نوع الدفع', 'Payment'), paymentType === 'CASH' ? tr('نقدي', 'Cash') : tr('آجل', 'Credit')],
                [tr('المخزن', 'Warehouse'), selectedWarehouse ? displayWarehouseName(selectedWarehouse) : '-', tr('الحساب', 'Account'), selectedPaymentAccount ? displayAccountName(selectedPaymentAccount) : '-'],
                [tr('العملة', 'Currency'), draft.currency, tr('سعر الصرف', 'Exchange Rate'), Number((draft.exchangeRate || 1).toFixed(6))]
            ];

            if (notes.trim()) {
                rows.push([tr('التفاصيل', 'Details'), notes.trim()]);
            }

            if (taxVisibleInInvoices) {
                rows.push([tr('طريقة الضريبة', 'Tax mode'), getInvoiceTaxModeDescription(draftTaxMode, tr)]);
            }

            rows.push([]);
            const headerRowIndex = rows.length;
            rows.push(itemHeader);

            if (draft.items.length > 0) {
                draft.items.forEach((item, index) => {
                    const product = item.productId ? products.find(productEntry => productEntry.id === item.productId) : undefined;
                    rows.push([
                        index + 1,
                        product ? displayProductName(product) : item.description,
                        product?.itemCode || product?.barcode || '',
                        Number((item.quantity || 0).toFixed(3)),
                        Number((item.unitPrice || 0).toFixed(2)),
                        Number((item.total || 0).toFixed(2))
                    ]);
                });
            } else {
                rows.push([1, tr('لا توجد بنود بعد', 'No line items yet'), '', 0, 0, 0]);
            }

            rows.push([]);
            rows.push([tr('الإجمالي قبل الضريبة', 'Subtotal'), Number((draft.subTotal || 0).toFixed(2)), '', '', tr('العملة', 'Currency'), draft.currency]);
            rows.push([tr('الخصم', 'Discount'), Number((draft.discountAmount || 0).toFixed(2))]);
            if (taxVisibleInInvoices) {
                rows.push([tr('الضريبة', 'Tax'), Number((draft.taxAmount || 0).toFixed(2))]);
            }
            rows.push([tr('الصافي', 'Net'), Number((draft.totalAmount || 0).toFixed(2))]);

            exportWorkbookFile(rows, {
                sheetName: isSalesFlow ? 'Invoice' : 'PurchaseInvoice',
                fileName: `${draft.invoiceNumber || 'invoice'}-${draft.date || 'draft'}.xlsx`,
                columnWidths: [6, 34, 18, 12, 14, 16],
                autoFilterRowIndex: headerRowIndex
            });
        } catch {
            alert(tr('تعذر تصدير الفاتورة إلى Excel.', 'Could not export the invoice to Excel.'));
        }
    };

    const handleShareInvoice = async () => {
        const text = buildInvoiceShareText();
        setShowInvoiceActions(false);
        if (navigator.share) {
            try {
                await navigator.share({ title: getEffectiveInvoiceNumber(), text });
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') return;
            }
        }
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert(tr('تم نسخ بيانات الفاتورة إلى الحافظة.', 'Invoice details copied to clipboard.'));
                return;
            } catch {
                // Fall through to prompt when clipboard is unavailable.
            }
        }
        window.prompt(tr('انسخ بيانات الفاتورة التالية', 'Copy the invoice details below'), text);
    };

    const handleShareWhatsApp = () => {
        setShowInvoiceActions(false);
        openExternalWindow(
            buildWhatsAppLink(buildInvoiceNotificationText(), selectedContact?.phone),
            tr('تعذر فتح واتساب. تأكد من السماح بالنوافذ المنبثقة.', 'Unable to open WhatsApp. Please allow pop-ups.')
        );
    };

    const handleShareSms = () => {
        setShowInvoiceActions(false);
        openExternalWindow(
            buildSmsLink(buildInvoiceNotificationText(), selectedContact?.phone),
            tr('تعذر فتح تطبيق الرسائل من المتصفح الحالي.', 'Unable to open the SMS app from the current browser.')
        );
    };

    const handleDeleteCurrentInvoice = () => {
        if (!editingInvoice) return;
        setShowInvoiceActions(false);
        if (!confirm(tr('هل أنت متأكد من حذف هذه الفاتورة نهائياً؟', 'Are you sure you want to permanently delete this invoice?'))) return;
        const result = deleteInvoice(editingInvoice.id);
        if (!result.ok) {
            alert(result.message);
            return;
        }
        alert(tr('تم حذف الفاتورة بنجاح.', 'Invoice deleted successfully.'));
        onSuccess();
    };

    const handleSubmit = async () => {
        if (!sharedState.date) return alert(tr('يرجى تحديد تاريخ العملية', 'Please select operation date'));
        if (!contactId && !isExpenseStyle) return alert(tr('يرجى اختيار العميل/المورد', 'Please select customer/supplier'));
        if (editBlockedReason) return alert(editBlockedReason);

        // Warehouse validation for stock-related transactions.
        if (!isExpenseStyle && !isQuotation && hasWarehouses && !warehouseId) return alert(tr('يرجى اختيار المستودع', 'Please select warehouse'));

        // Validation for payment: Required unless it's a Quotation.
        if (!isQuotation && paymentType === 'CASH' && !effectivePaymentAccountId) {
            return alert(tr('يرجى تحديد الصندوق المالي المستلم/المصروف منه', 'Please select the cash/bank account'));
        }

        if (items.length === 0) return alert(tr('Please add at least one item', 'Please add at least one item'));
        if (isExpenseVoucherManualOnly && !expenseAccountId) {
            return alert(tr('يرجى تحديد الطرف المدين من حسابات المصروف قبل الترحيل', 'Please select the debit side from expense accounts before posting'));
        }
        const preparedItems = items.map(item => {
            if (!isExpenseVoucherManualOnly) return item;
            return {
                ...item,
                accountId: expenseAccountId
            };
        });
        if (isExpenseVoucherManualOnly && preparedItems.some(item => !item.accountId)) {
            return alert(tr('كل بنود سند المصروف يجب أن تحتوي على حساب مصروف مدين', 'Every expense voucher line must have a debit expense account'));
        }
        if (!(companySettings.allowNegativeSalesQuantity ?? false) && (isSales || isQuotation) && items.some(i => i.quantity < 0)) {
            return alert(tr('Negative quantity is disabled for sales invoices in settings.', 'Negative quantity is disabled for sales invoices in settings.'));
        }
        if (!(companySettings.allowNegativeStock ?? false) && (isSales || isPurchaseReturn)) {
            if (isSales) {
                const shortageIssue = buildSalesStockShortageIssue(preparedItems);
                if (shortageIssue) {
                    setStockShortageIssue(shortageIssue);
                    return;
                }
            } else {
                const invalidStockItem = preparedItems.find((item, index) => !checkStock(item.productId, Number(item.quantity) || 0, { sourceItems: preparedItems, itemIndex: index }));
                if (invalidStockItem) {
                    const productName = displayProductName(products.find(product => product.id === invalidStockItem.productId) || null) || tr('هذا الصنف', 'this item');
                    return alert(tr(`المخزون غير كافٍ للصنف ${productName}. فعّل السماح بالمخزون السالب إذا كنت تريد المتابعة.`, `Stock is not sufficient for ${productName}. Enable negative stock if you want to continue.`));
                }
            }
        }
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
            invoiceNumber: getEffectiveInvoiceNumber(),
            customerId: contactId || undefined,
            linkedInvoiceId: linkedInvoiceId || undefined,
            type: (isSales || isQuotation || isPurchaseReturn) ? TransactionType.INCOME : TransactionType.EXPENSE, // Purchase Return uses Income type flow in logic to reverse expense
            category: invoiceCategory,
            date: sharedState.date,
            dueDate: invoiceExpiryDateEnabled ? dueDate : undefined,
            items: preparedItems.map(i => ({ ...i, id: Math.random().toString() })),
            subTotal: totals.subTotalForInvoice,
            taxRate: totals.rate,
            taxAmount: totals.tax,
            taxMode: effectiveTaxMode,
            discountAmount: totals.disc,
            totalAmount: totals.total,
            status: invoiceStatus,
            postingStatus: isQuotation ? 'DRAFT' : 'POSTED',
            paymentType: paymentType,
            paymentAccountId: effectivePaymentAccountId,
            currency: sharedState.currency,
            exchangeRate: sharedState.rate,
            notes: storedNotes,
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

    const checkStock = (
        productId?: string,
        qty: number = 0,
        options?: {
            sourceItems?: Omit<InvoiceItem, 'id'>[];
            itemIndex?: number;
        }
    ) => {
        if (!productId) return true; // Checks for manual items always pass
        if (companySettings.allowNegativeStock ?? false) return true;
        const product = products.find(prod => prod.id === productId);
        if (isServiceProduct(product)) return true;
        // Sales: check if we have enough stock to sell (in selected warehouse)
        if (isSales && !isQuotation) {
            const requestedQty = getRequestedStockQuantity(productId, qty, options);
            return getWarehouseStockQuantity(product, warehouseId) >= requestedQty;
        }
        // Purchase Return: check if we have enough stock to return (in selected warehouse)
        if (isPurchaseReturn) {
            return getWarehouseStockQuantity(product, warehouseId) >= qty;
        }
        return true;
    };

    const getAvailableStock = (productId?: string) => {
        if (!productId) return null;
        const product = products.find(prod => prod.id === productId);
        if (!product || isServiceProduct(product)) return null;
        return getWarehouseStockQuantity(product, warehouseId);
    };

    return (
        <div
            className="transaction-mobile-form transaction-screen-with-submit-dock invoice-mobile-page app-page w-full max-w-full px-2 sm:px-3 space-y-3 safe-pb-dock overflow-x-hidden"
            dir={isEnglish ? 'ltr' : 'rtl'}
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
            data-testid="invoice-form-root"
        >
            <div className="invoice-mobile-top-shell sticky top-2 z-30 space-y-3 rounded-2xl bg-gray-50/95 pb-1 backdrop-blur">
            {/* 1. Header Navigation Bar */}
            <div className="invoice-mobile-toolbar flex items-center justify-between bg-white px-3 py-2 border border-gray-200 rounded-xl shadow-sm">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm font-black text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors"
                >
                    <ArrowRight size={18} className={isEnglish ? "rotate-180" : ""} />
                    {tr('رجوع', 'Back')}
                </button>
                <div className="min-w-0 flex-1 px-2 text-center">
                    <div className="truncate text-base font-black text-indigo-900">{invoiceScreenTitle}</div>
                    <div className="truncate text-[10px] font-bold text-slate-400 dir-ltr">{getEffectiveInvoiceNumber()}</div>
                </div>
                <div className="relative flex items-center gap-1">
                    <button
                        type="button"
                        onClick={handlePrintPreview}
                        className="rounded-full bg-orange-50 p-2 text-orange-600 transition-colors hover:bg-orange-100"
                        title={tr('PDF / طباعة', 'PDF / Print')}
                    >
                        <FileText size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200"
                        title={tr('حفظ الفاتورة', 'Save Invoice')}
                    >
                        <Save size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowInvoiceActions(prev => !prev)}
                        className="rounded-full p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                        title={tr('إجراءات إضافية', 'More Actions')}
                    >
                        <MoreVertical size={18} />
                    </button>
                    {showInvoiceActions && (
                        <>
                            <button
                                type="button"
                                className="fixed inset-0 z-[440] cursor-default bg-transparent"
                                onClick={() => setShowInvoiceActions(false)}
                                aria-label={tr('إغلاق القائمة', 'Close menu')}
                            />
                            <div className={`absolute top-full z-[450] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl ${isEnglish ? 'right-0' : 'left-0'}`}>
                                {editingInvoice && (
                                    <button type="button" onClick={handleDeleteCurrentInvoice} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-rose-600 transition-colors hover:bg-rose-50">
                                        <Trash2 size={16} />
                                        {tr('حذف', 'Delete')}
                                    </button>
                                )}
                                <button type="button" onClick={() => { setShowInvoiceActions(false); handleDownloadExcel(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                    <FileSpreadsheet size={16} />
                                    {tr('إكسل', 'Excel')}
                                </button>
                                <button type="button" onClick={() => void handleShareInvoice()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                    <Share2 size={16} />
                                    {tr('مشاركة', 'Share')}
                                </button>
                                <button type="button" onClick={handleShareSms} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                    <MessageSquareText size={16} />
                                    {tr('إشعار رسالة', 'SMS')}
                                </button>
                                <button type="button" onClick={handleShareWhatsApp} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                    <MessageCircle size={16} />
                                    {tr('إشعار واتساب', 'WhatsApp')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showSalesModeTabs && onModeChange && (
                <div className="invoice-mode-tabs grid grid-cols-3 gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                    <button
                        type="button"
                        onClick={() => onModeChange('SALES', buildModeSwitchDraft())}
                        className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${isSales ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {tr('فاتورة بيع', 'Sales')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onModeChange('QUOTATION', buildModeSwitchDraft())}
                        className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${isQuotation ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {tr('عرض سعر', 'Quotation')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onModeChange('SALES_RETURN', buildModeSwitchDraft())}
                        className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${isReturn ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {tr('مرتجع', 'Return')}
                    </button>
                </div>
            )}

            {showPurchaseModeTabs && onModeChange && (
                <div className="invoice-mode-tabs grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                    <button
                        type="button"
                        onClick={() => onModeChange('PURCHASES', buildModeSwitchDraft())}
                        className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${(mode === 'PURCHASES' || mode === 'MANUAL_PURCHASE') ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {tr('فاتورة شراء', 'Purchase')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onModeChange('PURCHASE_RETURN', buildModeSwitchDraft())}
                        className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${mode === 'PURCHASE_RETURN' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {tr('مرتجع شراء', 'Return')}
                    </button>
                </div>
            )}

            <div className="invoice-meta-card bg-white px-3 py-3 border border-gray-200 rounded-xl shadow-sm">
                <div className="header-fields-grid header-fields-grid--compact-rate grid grid-cols-2 gap-2.5 items-start">
                    <div className="min-w-0">
                        <label className="block truncate text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider px-1 mb-1.5 leading-tight">
                            {tr('تاريخ العملية', 'Operation Date')}
                        </label>
                        <EnglishDateInput
                            value={sharedState.date}
                            onChange={onDateChange}
                            className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[11px] font-black text-slate-700 outline-none focus:ring-4 ring-blue-50"
                            aria-label={tr('تاريخ العملية', 'Operation date')}
                        />
                    </div>
                    <div className="min-w-0">
                        <label className="block truncate text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider px-1 mb-1.5 leading-tight">
                            {tr('العملة', 'Currency')}
                        </label>
                        <div ref={exchangeRateEditorRef} className="relative">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                    <select
                                        value={sharedState.currency}
                                        onChange={e => onCurrencyChange(e.target.value)}
                                        className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black text-slate-700 outline-none focus:ring-4 ring-blue-50 appearance-none"
                                    >
                                        {currencyOptions.map(currency => (
                                            <option key={currency.code} value={currency.code}>
                                                {currency.code} - {currency.symbol}
                                            </option>
                                        ))}
                                    </select>
                                    <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14} />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (sharedState.currency === baseCurrency) return;
                                        setIsExchangeRateEditorOpen(prev => !prev);
                                    }}
                                    disabled={sharedState.currency === baseCurrency}
                                    className={`relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition-all ${
                                        sharedState.currency === baseCurrency
                                            ? 'border-gray-200 bg-gray-50 text-gray-300'
                                            : isExchangeRateEditorOpen
                                                ? 'border-blue-200 bg-blue-50 text-blue-600 shadow-sm'
                                                : 'border-gray-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600'
                                    }`}
                                    aria-label={`${tr('سعر الصرف', 'Exchange rate')}: ${exchangeRateLabel} (${tr('مقابل', 'vs')} ${baseCurrency})`}
                                    aria-expanded={isExchangeRateEditorOpen}
                                    title={`${tr('سعر الصرف', 'Exchange rate')}: ${exchangeRateLabel}`}
                                >
                                    <ArrowRightLeft size={15} />
                                    {sharedState.currency !== baseCurrency && (
                                        <span className="absolute -top-1.5 -right-1.5 min-w-[1.4rem] rounded-full bg-slate-900 px-1.5 py-0.5 text-[8px] font-black leading-none text-white dir-ltr">
                                            {exchangeRateLabel}
                                        </span>
                                    )}
                                </button>
                            </div>
                            {isExchangeRateEditorOpen && sharedState.currency !== baseCurrency && (
                                <div className="absolute top-full left-0 right-0 z-20 mt-2 rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                                    <label className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <span>{tr('سعر الصرف', 'Exchange Rate')}</span>
                                        <span className="dir-ltr text-blue-600">{baseCurrency}</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min="0.0001"
                                            step="0.0001"
                                            value={sharedState.rate}
                                            onChange={e => {
                                                const parsed = parseFloat(e.target.value);
                                                onRateChange(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
                                            }}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === 'Escape') {
                                                    setIsExchangeRateEditorOpen(false);
                                                }
                                            }}
                                            autoFocus
                                            className="w-full py-2.5 pl-9 pr-3 bg-white border border-gray-200 rounded-xl text-[11px] font-black text-slate-700 outline-none focus:ring-4 ring-blue-50 dir-ltr"
                                            aria-label={tr('سعر الصرف', 'Exchange rate')}
                                        />
                                        <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={14} />
                                    </div>
                                    <p className="mt-2 px-1 text-[10px] font-bold text-slate-400">
                                        {tr('تعديل سريع لسعر تحويل العملة المختارة.', 'Quick edit for the selected currency conversion rate.')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            </div>

            {/* 2. Top Header Inputs (Fixed Height, compact) */}
            <div className="invoice-entry-card bg-white px-3 py-3 space-y-2.5 border border-gray-200 rounded-xl relative z-10 shadow-sm">

                {/* Type & Cash/Credit */}
                <div className="invoice-payment-toggle-row flex gap-2">
                    <div className="invoice-payment-toggle flex-1 flex gap-1 bg-gray-100 p-1 rounded-xl">
                        {!isQuotation && (
                            <>
                                <button type="button" onClick={() => setPaymentType('CASH')} className={`flex-1 py-1.5 text-[12px] font-black rounded-lg transition-all ${paymentType === 'CASH' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
                                    {tr('نقدي', 'Cash')}
                                </button>
                                <button type="button" onClick={() => setPaymentType('CREDIT')} data-testid="invoice-payment-credit" className={`flex-1 py-1.5 text-[12px] font-black rounded-lg transition-all ${paymentType === 'CREDIT' ? 'bg-white shadow text-orange-600' : 'text-gray-500'}`}>
                                    {tr('آجل', 'Credit')}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Warehouse & Account (Row 2) */}
                <div className="invoice-context-grid grid grid-cols-2 gap-2">
                    {!isExpenseStyle && hasWarehouses && (
                        <div className={`relative min-w-0 ${(!isQuotation && paymentType === 'CASH') ? '' : 'col-span-2'}`}>
                            <select
                                value={warehouseId}
                                onChange={e => {
                                    const nextWarehouseId = e.target.value;
                                    setWarehouseId(nextWarehouseId);
                                    if (items.length > 0) {
                                        refreshStockShortageDialog(items, { warehouseIdOverride: nextWarehouseId });
                                    }
                                }}
                                data-testid="invoice-warehouse-select"
                                className="w-full appearance-none rounded-xl border border-gray-100 bg-gray-50 py-2 px-3 pl-8 pr-8 text-[12px] font-black focus:border-indigo-300 focus:outline-none"
                            >
                                <option value="">{tr('المستودع', 'Warehouse')}</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{displayWarehouseName(w)}</option>)}
                            </select>
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={13} />
                        </div>
                    )}

                    {!isQuotation && paymentType === 'CASH' && (
                        <div className="relative min-w-0">
                            <select value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)} data-testid="invoice-payment-account" className="w-full text-[12px] font-black bg-blue-50/30 border border-blue-100 text-blue-700 rounded-xl py-2 px-3 pl-8 pr-8 appearance-none focus:outline-none focus:border-blue-300">
                                <option value="">{tr('الصندوق/البنك', 'Cash/Bank')}</option>
                                {financialAccounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                            </select>
                            <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={13} />
                        </div>
                    )}
                </div>

                {isExpenseVoucherManualOnly && (
                    <div className="space-y-1.5">
                        <SearchableAccountSelect
                            accounts={expenseAccounts}
                            selectedId={expenseAccountId}
                            onSelect={setExpenseAccountId}
                            displayAccountName={displayAccountName}
                            placeholder={tr('ابحث في المصاريف واختر حساب المصروف...', 'Search expenses and select the expense account...')}
                            emptyLabel={tr('لا يوجد حساب مصروف مطابق.', 'No matching expense account found.')}
                            isEnglish={isEnglish}
                            className="w-full"
                            inputClassName={`w-full bg-emerald-50/40 border border-emerald-100 text-emerald-700 rounded-xl py-2 px-3 text-[12px] font-black outline-none focus:ring-1 focus:ring-emerald-200 ${isEnglish ? 'pl-9 pr-9 text-left' : 'pr-9 pl-9 text-right'}`}
                        />
                        {selectedExpenseAccount && (
                            <div className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">
                                {tr('الطرف المدين', 'Debit side')}: {displayAccountName(selectedExpenseAccount)}
                            </div>
                        )}
                    </div>
                )}

                {/* Customer / Supplier */}
                <div className="invoice-contact-row flex gap-2 items-center">
                    <div className="flex-1 min-w-0 relative flex items-center">
                        <SearchableContactSelect
                            contacts={filteredContacts}
                            selectedId={contactId}
                            selectedLabel={selectedContactLabel}
                            onSelect={(nextId) => {
                                setContactId(nextId);
                                setLinkedInvoiceId('');
                            }}
                            onCreateNew={(nextName) => {
                                setQuickContactInitialName(nextName);
                                setShowQuickContact(true);
                            }}
                            displayContactName={displayContactName}
                            placeholder={isExpenseStyle ? tr('مورد عام / بدون أو ابحث...', 'Generic supplier / search...') : tr('اختر الطرف أو ابحث...', 'Select or search contact...')}
                            emptyLabel={tr('لا يوجد طرف مطابق.', 'No matching contact found.')}
                            createNewLabel={(isSales || isReturn || isQuotation)
                                ? tr('إضافة عميل جديد', 'Add New Customer')
                                : tr('إضافة مورد جديد', 'Add New Supplier')}
                            isEnglish={isEnglish}
                            autoFocus={Boolean(initialDraft?.autoFocusContact)}
                            className="w-full"
                            inputClassName={`w-full bg-gray-50 border border-gray-100 rounded-xl py-2 px-3 text-[12px] font-black text-gray-700 outline-none focus:ring-1 focus:ring-indigo-300 ${isEnglish ? 'pl-9 pr-9' : 'pr-9 pl-9'}`}
                            inputTestId="invoice-contact-input"
                        />
                        <button type="button" onClick={() => { setQuickContactInitialName(''); setShowQuickContact(true); }} className="invoice-contact-add-btn h-10 w-10 border border-slate-200 bg-white text-gray-600 rounded-xl active:bg-gray-100 transition-colors z-20 hover:text-indigo-600 flex items-center justify-center shrink-0">
                            <UserPlus size={14} />
                        </button>
                    </div>
                </div>
                {selectedContact
                    && (selectedContact.type === 'CUSTOMER' || selectedContact.type === 'SUPPLIER')
                    && selectedContact.preferredPriceTier && (
                    <div className="mt-1 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[10px] font-black text-indigo-700">
                        {tr('\u062a\u0633\u0639\u064a\u0631 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0637\u0631\u0641', 'Invoice pricing for this contact')}: {selectedContactPriceTierLabel}
                    </div>
                )}
                <div className="invoice-meta-inline-grid grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.25fr)_180px]">
                    <div className="relative min-w-0">
                        <TextQuote className={`absolute top-1/2 -translate-y-1/2 text-slate-300 ${isEnglish ? 'left-3' : 'right-3'}`} size={14} />
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder={tr('التفاصيل / الملاحظات', 'Details / notes')}
                            data-testid="invoice-notes-input"
                            className={`w-full rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-[12px] font-black text-slate-700 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 ${isEnglish ? 'pl-9 pr-3 text-left' : 'pr-9 pl-3 text-right'}`}
                        />
                    </div>
                    <div className="relative min-w-0">
                        <Hash className={`absolute top-1/2 -translate-y-1/2 text-slate-300 ${isEnglish ? 'left-3' : 'right-3'}`} size={14} />
                        <input
                            type="text"
                            value={invoiceNumber}
                            onChange={e => setInvoiceNumber(e.target.value.toUpperCase())}
                            placeholder={tr('رقم الفاتورة', 'Invoice number')}
                            data-testid="invoice-number-input"
                            className={`w-full rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-[12px] font-black text-slate-700 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dir-ltr ${isEnglish ? 'pl-9 pr-3 text-left' : 'pr-9 pl-3 text-left'}`}
                        />
                    </div>
                </div>
            </div>

            {/* 3. Inline Add Item Bar (Fixed) */}
            <div className="invoice-search-card px-3 py-2 bg-white border border-gray-200 rounded-xl z-10 shadow-sm">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (isExpenseVoucherManualOnly) {
                            handleInlineManualItemAdd();
                            return;
                        }
                        if (isManualItem) {
                            setIsManualItem(true);
                            setShowQuickProduct(true);
                            return;
                        }
                        const rawQuery = search.trim();
                        if (!rawQuery) return;
                        setQuickProductInitialName(rawQuery);
                        setShowQuickProduct(true);
                    }}
                    className={`invoice-search-form grid gap-2 items-center relative rounded-2xl border border-slate-200 bg-slate-50/70 p-2 ${isExpenseVoucherManualOnly
                        ? 'grid-cols-1'
                        : 'grid-cols-[minmax(0,1fr),auto]'
                        }`}
                >
                    <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />

                    <div className="flex-1 min-w-0 relative">
                        <input
                            value={(isExpenseVoucherManualOnly || isManualItem) ? manualItemDesc : search}
                            onChange={e => (isExpenseVoucherManualOnly || isManualItem) ? setManualItemDesc(e.target.value) : setSearch(e.target.value)}
                            onKeyDown={!(isExpenseVoucherManualOnly || isManualItem) ? handleInvoiceSearchKeyDown : undefined}
                            onFocus={() => {
                                if (!(isExpenseVoucherManualOnly || isManualItem)) setIsSearchFocused(true);
                            }}
                            placeholder={(isExpenseVoucherManualOnly || isManualItem)
                                ? tr('وصف البند اليدوي...', 'Manual item desc...')
                                : tr('أدخل إسم الصنف أو الباركود', 'Enter item name or barcode')}
                            data-testid="invoice-item-search"
                            className={`w-full h-10 text-sm font-black bg-white border border-transparent shadow-inner rounded-xl appearance-none focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all ${isEnglish ? 'px-3 text-left' : 'px-3 text-right'}`}
                        />
                    </div>

                    {!isExpenseVoucherManualOnly && (
                        <button
                            type="button"
                            onClick={() => {
                                setIsSearchFocused(false);
                                setIsManualItem(true);
                                setShowQuickProduct(true);
                            }}
                            className="invoice-manual-item-button flex w-[64px] shrink-0 flex-col items-center gap-1 text-center"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-sm active:-translate-y-0.5 active:scale-95 transition-all hover:bg-amber-100">
                                <Package size={16} />
                            </span>
                            <span className="text-[9px] font-black text-slate-500">{tr('إضافة بند يدوي', 'Manual line')}</span>
                        </button>
                    )}

                    {isExpenseVoucherManualOnly && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-[minmax(0,0.7fr),minmax(0,0.7fr),auto] gap-2">
                                <div className="min-w-0">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={manualItemQty}
                                        onChange={e => setManualItemQty(e.target.value)}
                                        placeholder={tr('الكمية', 'Qty')}
                                        className="h-10 w-full rounded-xl border border-transparent bg-white px-3 text-center text-sm font-black outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dir-ltr"
                                    />
                                </div>
                                <div className="min-w-0">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={manualItemPrice}
                                        onChange={e => setManualItemPrice(e.target.value)}
                                        placeholder={tr('السعر', 'Price')}
                                        className="h-10 w-full rounded-xl border border-transparent bg-white px-3 text-center text-sm font-black outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dir-ltr"
                                        min="0"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleInlineManualItemAdd}
                                    disabled={!manualItemDesc.trim() || !manualItemPrice.trim()}
                                    className={`h-10 rounded-xl px-4 text-[11px] font-black text-white transition-all ${
                                        !manualItemDesc.trim() || !manualItemPrice.trim()
                                            ? 'bg-slate-300 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                                    }`}
                                >
                                    {tr('إضافة', 'Add')}
                                </button>
                            </div>
                            {!expenseAccountId && (
                                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-700">
                                    {tr('يمكنك إضافة البنود الآن، ثم اختيار حساب المصروف من الحقل الأخضر قبل ترحيل السند.', 'You can add lines now, then choose the expense account from the green field before posting.')}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Autocomplete Dropdown */}
                    {!isExpenseVoucherManualOnly && !isManualItem && isSearchFocused && (
                        <>
                            <div className="fixed inset-0 z-[190]" onClick={() => setIsSearchFocused(false)}></div>
                            <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in max-h-[30vh] overflow-y-auto">
                                {searchResults.length > 0 ? searchResults.map(p => (
                                    <button key={p.id} type="button" onClick={() => { addItem(p); setIsSearchFocused(false); setSearch(''); }} className="w-full p-3 flex items-center justify-between border-b border-gray-50 last:border-0 hover:bg-indigo-50 transition-colors text-start">
                                        <div className="flex items-center gap-2">
                                            <div className="text-start">
                                                <p className="text-[11px] font-black text-slate-800">{displayProductName(p)}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {isServiceProduct(p) ? (
                                                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-black text-amber-700">{tr('خدمة', 'Service')}</span>
                                                    ) : (
                                                        <span className={`text-[9px] font-bold ${p.stock <= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{p.stock} {tr('متوفر', 'avail')}</span>
                                                    )}
                                                    {p.barcode && <span className="text-[9px] font-mono text-gray-400">{p.barcode}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-left">
                                            <div className="font-black text-indigo-600 text-[11px] dir-ltr">
                                                {resolveInvoiceEntryPrice(p).toLocaleString()}
                                            </div>
                                            {typeof resolveLastInvoicePrice(p.id) === 'number' && (
                                                <div className="mt-0.5 text-[9px] font-bold text-emerald-600">
                                                    {tr('آخر سعر', 'Last price')}: {resolveLastInvoicePrice(p.id)?.toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                )) : (
                                    <div className="p-4 text-center text-gray-400 text-[10px] font-bold">{tr('لا يوجد تطابق', 'No match')}</div>
                                )}
                                {searchResults.length === 0 && search.trim() && (
                                    <div className="px-4 pb-4">
                                        <button
                                            type="button"
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => {
                                                setQuickProductInitialName(search.trim());
                                                setShowQuickProduct(true);
                                                setIsSearchFocused(false);
                                            }}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-black text-indigo-700 transition-colors hover:bg-indigo-100"
                                        >
                                            <PackagePlus size={14} />
                                            {tr('إضافة صنف جديد', 'Add New Item')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </form>
            </div>

            {/* 4. Items Sheet (Excel-like) */}
            <div className="invoice-items-card w-full rounded-[1.15rem] border border-slate-200 bg-white p-2.5 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.55)]">
                <div className="invoice-items-shell overflow-x-auto rounded-lg border border-slate-200">
                    <table className="invoice-items-table w-full min-w-full table-fixed text-[10px] sm:text-[11px] md:min-w-[620px]">
                        <thead className="bg-slate-100/95 text-slate-700">
                            <tr>
                                <th className="w-[6%] border-b border-slate-200 px-1 py-1.5 text-center font-black">#</th>
                                <th className="w-[42%] border-b border-slate-200 px-1.5 py-1.5 text-start font-black">{tr('الصنف/الوصف', 'Item / Description')}</th>
                                <th className="w-16 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('الكمية', 'Qty')}</th>
                                <th className="w-20 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('السعر', 'Price')}</th>
                                <th className="w-20 border-b border-slate-200 px-1.5 py-1.5 text-center font-black">{tr('الإجمالي', 'Total')}</th>
                                <th aria-label={tr('المخزون', 'Stock')} className="w-16 border-b border-slate-200 px-1.5 py-1.5 text-center font-black"></th>
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
                                const serviceLine = isServiceProduct(linkedProduct);
                                const stockOk = checkStock(item.productId, Number(item.quantity) || 0, { itemIndex: idx });
                                const availableStock = getAvailableStock(item.productId);
                                const lastInvoicePrice = resolveLastInvoicePrice(item.productId);
                                return (
                                    <tr key={idx} className="odd:bg-white even:bg-slate-50/60">
                                        <td className="border-b border-slate-100 px-1.5 py-1 text-center font-black text-slate-500">{idx + 1}</td>
                                        <td className="border-b border-slate-100 px-1.5 py-1">
                                            <textarea
                                                value={item.description}
                                                onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))}
                                                rows={2}
                                                className="invoice-item-name-field w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10.5px] font-bold leading-4 outline-none focus:border-indigo-300"
                                            />
                                            <div className="invoice-item-meta mt-0.5 text-[9px] font-bold text-slate-400 break-all">
                                                {linkedProduct
                                                    ? `${linkedProduct.itemCode || linkedProduct.barcode || linkedProduct.id}${serviceLine ? ` • ${tr('خدمة', 'Service')}` : ''}`
                                                    : tr('بند يدوي', 'Manual line')}
                                            </div>
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                lang="en"
                                                value={getItemNumericCellDisplayValue(idx, 'quantity', item.quantity)}
                                                onFocus={() => beginItemNumericCellEdit(idx, 'quantity', item.quantity)}
                                                onChange={e => handleItemNumericCellChange(idx, 'quantity', e.target.value)}
                                                onBlur={e => finishItemNumericCellEdit(idx, 'quantity', e.currentTarget.value)}
                                                className="invoice-number-input w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[11px] font-black dir-ltr outline-none focus:border-indigo-300"
                                            />
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                lang="en"
                                                value={getItemNumericCellDisplayValue(idx, 'unitPrice', item.unitPrice)}
                                                onFocus={() => beginItemNumericCellEdit(idx, 'unitPrice', item.unitPrice)}
                                                onChange={e => handleItemNumericCellChange(idx, 'unitPrice', e.target.value)}
                                                onBlur={e => finishItemNumericCellEdit(idx, 'unitPrice', e.currentTarget.value)}
                                                className="invoice-number-input w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[11px] font-black dir-ltr outline-none focus:border-indigo-300"
                                            />
                                            {typeof lastInvoicePrice === 'number' && (
                                                <div className="mt-0.5 text-center text-[9px] font-bold text-indigo-500 dir-ltr">
                                                    {tr('آخر سعر', 'Last price')}: {formatAmount(lastInvoicePrice)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="border-b border-slate-100 px-1.5 py-1 text-center align-middle">
                                            <span className="invoice-line-total inline-flex min-w-[4.3rem] items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-2 py-2 text-[17px] sm:text-[18px] font-black text-slate-900 shadow-sm dir-ltr">
                                                {formatAmount(Number(item.total || 0))}
                                            </span>
                                        </td>
                                        <td
                                            className={`invoice-stock-cell border-b border-slate-100 px-1.5 py-1 text-center text-[10px] font-black ${serviceLine ? 'text-amber-600' : item.productId ? (stockOk ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}
                                            data-stock={serviceLine ? tr('خدمة', 'Service') : item.productId ? (availableStock?.toLocaleString() ?? '0') : '—'}
                                        >
                                            {serviceLine
                                                ? <span className="text-amber-600">{tr('خدمة', 'Service')}</span>
                                                : item.productId
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
            <div className="invoice-submit-panel layout-footer z-20 hidden rounded-[1.15rem] border border-slate-700/70 bg-[linear-gradient(135deg,#0f172a_0%,#172554_100%)] p-3 text-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.9)] md:block">
                <div className="transaction-submit-panel-details">
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
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                                        {tr('الضريبة', 'Tax')} {isInvoiceTaxApplied(effectiveTaxMode, totals.rate, totals.tax) ? `+${formatAmount(totals.tax)}` : '0'}
                                    </span>
                                    <div className="relative mt-0.5 w-[108px]">
                                        <select
                                            value={effectiveTaxMode}
                                            onChange={e => setTaxMode(e.target.value as InvoiceTaxMode)}
                                            data-testid="invoice-tax-mode"
                                            className={`w-full appearance-none rounded-lg border border-slate-700 bg-slate-800/95 py-1 text-[9px] font-black text-white outline-none transition-colors focus:border-indigo-400 ${isEnglish ? 'pl-2 pr-6 text-left' : 'pr-2 pl-6 text-right'}`}
                                        >
                                            {(['INCLUSIVE', 'EXCLUSIVE', 'NONE'] as InvoiceTaxMode[]).map((modeOption) => (
                                                <option key={modeOption} value={modeOption}>
                                                    {getInvoiceTaxModeLabel(modeOption, tr)}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${isEnglish ? 'right-2' : 'left-2'}`} size={11} />
                                    </div>
                                    <span className="mt-1 max-w-[108px] text-[8px] font-bold leading-tight text-slate-400">
                                        {taxModeDescription}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Final Total row */}
                    <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <span className="text-[12px] sm:text-[13px] font-black text-blue-300">{tr('الصافي النهائي', 'Final Net')}</span>
                        <span data-testid="invoice-final-total" className="min-w-0 text-[2.05rem] sm:text-[2.45rem] font-black leading-none tracking-tight dir-ltr text-white">{totals.total.toLocaleString()}</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <button
                    onClick={handleSubmit}
                    data-testid="invoice-submit-action"
                    className={`hidden w-full py-2.5 rounded-xl font-black text-[13px] shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:flex items-center justify-center gap-2 active:scale-95 transition-transform ${isQuotation ? 'bg-amber-600' : (isReturn || isPurchaseReturn) ? 'bg-rose-600' : 'bg-indigo-600'} text-white`}
                >
                    <CheckCircle2 size={16} />
                    {isQuotation
                        ? tr('حفظ المعاملة', 'Save Transaction')
                        : editingInvoice
                            ? tr('تحديث وترحيل الفاتورة', 'Update & Post Invoice')
                            : tr('ترحيل واعتماد الفاتورة', 'Post & Approve')}
                </button>
            </div>
            <MobileSubmitDock
                label={isQuotation
                    ? tr('حفظ المعاملة', 'Save Transaction')
                    : editingInvoice
                        ? tr('تحديث وترحيل الفاتورة', 'Update & Post Invoice')
                        : tr('ترحيل واعتماد الفاتورة', 'Post & Approve')}
                onClick={() => void handleSubmit()}
                summary={
                    <div className="transaction-submit-panel-details text-white">
                        <div className="mb-2 flex items-center justify-between px-1">
                            <div className="flex gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase tracking-widest leading-tight text-slate-400">{tr('خصم إضافي', 'Extra Disc')}</span>
                                    <div className="relative w-20">
                                        <input type="number" inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1 text-center text-[11px] font-black text-white focus:border-indigo-500" />
                                    </div>
                                </div>
                                {taxVisibleInInvoices && (
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold uppercase tracking-widest leading-tight text-slate-400">
                                            {tr('الضريبة', 'Tax')} {isInvoiceTaxApplied(effectiveTaxMode, totals.rate, totals.tax) ? `+${formatAmount(totals.tax)}` : '0'}
                                        </span>
                                        <div className="relative mt-0.5 w-[108px]">
                                            <select
                                                value={effectiveTaxMode}
                                                onChange={e => setTaxMode(e.target.value as InvoiceTaxMode)}
                                                className={`w-full appearance-none rounded-lg border border-slate-700 bg-slate-800/95 py-1 text-[9px] font-black text-white outline-none transition-colors focus:border-indigo-400 ${isEnglish ? 'pl-2 pr-6 text-left' : 'pr-2 pl-6 text-right'}`}
                                            >
                                                {(['INCLUSIVE', 'EXCLUSIVE', 'NONE'] as InvoiceTaxMode[]).map((modeOption) => (
                                                    <option key={modeOption} value={modeOption}>
                                                        {getInvoiceTaxModeLabel(modeOption, tr)}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${isEnglish ? 'right-2' : 'left-2'}`} size={11} />
                                        </div>
                                        <span className="mt-1 max-w-[108px] text-[8px] font-bold leading-tight text-slate-400">
                                            {taxModeDescription}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                            <span className="text-[12px] font-black text-blue-300 sm:text-[13px]">{tr('الصافي النهائي', 'Final Net')}</span>
                            <span className="min-w-0 text-[2.05rem] font-black leading-none tracking-tight text-white dir-ltr sm:text-[2.45rem]">{totals.total.toLocaleString()}</span>
                        </div>
                    </div>
                }
                panelClassName="border-slate-700/70 bg-[linear-gradient(135deg,#0f172a_0%,#172554_100%)] text-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.9)]"
                buttonClassName={`${isQuotation ? 'bg-amber-600 text-white hover:bg-amber-500' : (isReturn || isPurchaseReturn) ? 'bg-rose-600 text-white hover:bg-rose-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
            />

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

            {stockShortageIssue && (
                <ResponsiveDialog
                    open
                    onClose={() => setStockShortageIssue(null)}
                    size="md"
                    zIndexClassName="z-[320]"
                    backdropClassName="bg-black/65 backdrop-blur-md"
                    panelClassName="bg-white rounded-[2rem] p-5 shadow-2xl"
                >
                    <div dir={isEnglish ? 'ltr' : 'rtl'} className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                                    <AlertTriangle size={20} />
                                </div>
                                <h3 className="mt-3 text-base font-black text-slate-900">
                                    {tr('الصنف غير متوفر في هذا المخزن', 'This item is not available in this warehouse')}
                                </h3>
                                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                                    {tr('يمكنك تحويل الكمية من مخزن آخر فورًا أو فتح شراء لهذا الصنف مباشرة.', 'You can transfer the quantity from another warehouse now or open a purchase for this item.')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStockShortageIssue(null)}
                                className="rounded-full bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200"
                                aria-label={tr('إغلاق', 'Close')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3">
                            <div className="text-sm font-black text-slate-800">{stockShortageIssue.productName}</div>
                            <div className="mt-1 text-[10px] font-bold text-slate-500">
                                {tr('السطر', 'Line')} #{stockShortageIssue.itemIndex + 1}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="text-[10px] font-black text-slate-400">{tr('المخزن الحالي', 'Current warehouse')}</div>
                                <div className="mt-1 text-[12px] font-black text-slate-800">{stockShortageIssue.currentWarehouseName}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="text-[10px] font-black text-slate-400">{tr('المتوفر الآن', 'Available now')}</div>
                                <div className="mt-1 text-[12px] font-black text-slate-800 dir-ltr">{formatAmount(stockShortageIssue.availableQty)}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="text-[10px] font-black text-slate-400">{tr('الكمية المطلوبة', 'Requested quantity')}</div>
                                <div className="mt-1 text-[12px] font-black text-slate-800 dir-ltr">{formatAmount(stockShortageIssue.requestedQty)}</div>
                            </div>
                            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3">
                                <div className="text-[10px] font-black text-rose-500">{tr('الكمية الناقصة', 'Missing quantity')}</div>
                                <div className="mt-1 text-[12px] font-black text-rose-600 dir-ltr">{formatAmount(stockShortageIssue.shortageQty)}</div>
                            </div>
                        </div>

                        {stockShortageIssue.alternateWarehouses.length > 0 ? (
                            <div className="space-y-2">
                                <div className="text-[11px] font-black text-slate-700">{tr('مخازن يمكن التحويل منها الآن', 'Warehouses available for immediate transfer')}</div>
                                {stockShortageIssue.alternateWarehouses.map(option => (
                                    <div key={option.warehouseId} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[12px] font-black text-slate-800">{option.warehouseName}</div>
                                            <div className="mt-1 text-[10px] font-bold text-slate-500 dir-ltr">
                                                {tr('المتوفر', 'Available')}: {formatAmount(option.availableQty)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleImmediateWarehouseTransfer(option.warehouseId)}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-indigo-700"
                                        >
                                            <ArrowRightLeft size={13} />
                                            {tr('تحويل الآن', 'Transfer now')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-[11px] font-bold text-slate-500">
                                {tr('لا توجد كمية متاحة لهذا الصنف في المخازن الأخرى حاليًا، ويمكنك فتح شراء مباشر له.', 'This item is not available in other warehouses right now, and you can open a direct purchase for it.')}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => openPurchaseForStockShortage(stockShortageIssue)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[12px] font-black text-white transition-colors hover:bg-emerald-700"
                            >
                                <ShoppingBag size={15} />
                                {tr('فتح شراء الصنف', 'Open purchase')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStockShortageIssue(null)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-[12px] font-black text-slate-700 transition-colors hover:bg-slate-200"
                            >
                                <X size={15} />
                                {tr('إغلاق', 'Close')}
                            </button>
                        </div>

                        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[10px] font-bold leading-5 text-slate-500">
                            {tr('إذا أردت المتابعة بدون شراء أو تحويل، فعّل خيار بيع المخزون السالب من إعدادات الشركة.', 'If you want to continue without purchase or transfer, enable negative stock selling from company settings.')}
                        </div>
                    </div>
                </ResponsiveDialog>
            )}

            {nestedPurchaseOverlay && (
                <ResponsiveOverlay
                    isOpen
                    onClose={closeNestedPurchaseOverlay}
                    variant="fullscreen"
                    zIndexClassName="z-[340]"
                    panelClassName="w-full rounded-none pb-10"
                    keyboardAware
                >
                    <TransactionForm
                        key={nestedPurchaseOverlay.key}
                        initialMode="PURCHASES"
                        initialDraft={nestedPurchaseOverlay.draft}
                        onBack={closeNestedPurchaseOverlay}
                    />
                </ResponsiveOverlay>
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
                                initialName={quickContactInitialName}
                                initialType={(isSales || isReturn || isQuotation) ? 'CUSTOMER' : 'SUPPLIER'}
                                allowedTypes={['CUSTOMER', 'SUPPLIER']}
                                onClose={() => { setQuickContactInitialName(''); setShowQuickContact(false); }}
                                onSave={(contact) => {
                                    setContactId(contact.id);
                                    setQuickContactInitialName('');
                                    setShowQuickContact(false);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showQuickProduct && !isManualItem && !isExpenseVoucherManualOnly && (
                <QuickAddProductModal
                    mode="INVOICE"
                    initialName={quickProductInitialName || search.trim()}
                    onClose={() => { setQuickProductInitialName(''); setShowQuickProduct(false); }}
                    onSave={(product) => {
                        addItem(product);
                        setQuickProductInitialName('');
                        setSearch('');
                        setShowQuickProduct(false);
                    }}
                />
            )}

            {showQuickProduct && (isManualItem || isExpenseVoucherManualOnly) && (
                <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
                    <div className="bg-white w-full max-w-[320px] rounded-[1.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center px-1 mb-1">
                            <h3 className="text-[13px] font-black text-slate-800">
                                {tr('تفاصيل البند', 'Item Details')}
                            </h3>
                            <button onClick={() => { setShowQuickProduct(false); setIsManualItem(false); }} className="text-gray-400 hover:text-slate-700 bg-gray-100 p-1.5 rounded-full"><X size={14} /></button>
                        </div>
                        {isExpenseVoucherManualOnly && (
                            <div className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${selectedExpenseAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {selectedExpenseAccount
                                    ? `${tr('الحساب المدين', 'Debit account')}: ${displayAccountName(selectedExpenseAccount)}`
                                    : tr('يمكنك إضافة البند الآن، ثم اختيار الحساب المدين من أعلى الشاشة قبل ترحيل السند', 'You can add the line now, then choose the debit account from the top before posting')}
                            </div>
                        )}

                        {isExpenseVoucherManualOnly && savedExpenseLinePresets.length > 0 && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                                <div className="mb-2 px-1">
                                    <div className="text-[10px] font-black text-slate-700">{tr('بنود محفوظة', 'Saved lines')}</div>
                                    <div className="text-[9px] font-bold text-slate-400">
                                        {tr('اختر بندًا محفوظًا لتعبئة البيانات بسرعة.', 'Choose a saved line to fill the fields quickly.')}
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {filteredExpenseLinePresets.length > 0 ? filteredExpenseLinePresets.map(preset => {
                                        const presetAccount = preset.accountId
                                            ? expenseAccounts.find(account => account.id === preset.accountId) || null
                                            : null;
                                        return (
                                            <div key={preset.id} className="flex items-stretch gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => applyExpenseLinePreset(preset)}
                                                    className="flex-1 rounded-xl border border-white bg-white px-3 py-2 text-start shadow-sm transition-colors hover:bg-blue-50"
                                                >
                                                    <div className="truncate text-[11px] font-black text-slate-800">{preset.description}</div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                                        <span className="dir-ltr">{tr('الكمية', 'Qty')}: {formatAmount(preset.quantity)}</span>
                                                        <span className="dir-ltr">{tr('السعر', 'Price')}: {formatAmount(preset.unitPrice)}</span>
                                                        {presetAccount && (
                                                            <span className={`rounded-md px-1.5 py-0.5 ${preset.accountId === expenseAccountId ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {displayAccountName(presetAccount)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeExpenseLinePreset(preset.id)}
                                                    className="rounded-xl border border-rose-100 bg-rose-50 px-2 text-rose-600 transition-colors hover:bg-rose-100"
                                                    title={tr('حذف من المحفوظات', 'Remove saved line')}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        );
                                    }) : (
                                        <div className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-slate-400">
                                            {tr('لا يوجد بند محفوظ مطابق للنص الحالي.', 'No saved line matches the current text.')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="relative">
                            <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('البيان', 'Description')}</label>
                            <input
                                value={manualItemDesc}
                                onChange={e => setManualItemDesc(e.target.value)}
                                placeholder={tr('وصف الخدمة', 'Service description')}
                                className="w-full bg-amber-50/50 border border-amber-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-amber-400 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('الكمية', 'Quantity')}</label>
                                <input
                                    type="number" inputMode="decimal"
                                    value={manualItemQty}
                                    onChange={e => setManualItemQty(e.target.value)}
                                    className="w-full text-center bg-gray-50 border border-gray-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-indigo-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 mb-0.5 block px-1">{tr('السعر', 'Price')}</label>
                                <input
                                    type="number" inputMode="decimal"
                                    value={manualItemPrice}
                                    onChange={e => setManualItemPrice(e.target.value)}
                                    className="w-full text-center bg-gray-50 border border-gray-200 text-xs font-black rounded-xl py-2 px-3 focus:ring-1 focus:ring-indigo-400 outline-none dir-ltr"
                                    min="0"
                                />
                            </div>
                        </div>

                        <div className="pt-1">
                            <button
                                onClick={() => {
                                    if (!manualItemDesc.trim() || !manualItemPrice.trim()) return;
                                    addManualItem();
                                    setShowQuickProduct(false);
                                }}
                                className="w-full py-2.5 text-white text-[13px] font-black rounded-xl shadow-lg active:scale-95 transition-all bg-indigo-600 hover:bg-indigo-700"
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
    outerHeaderActionsContainer?: HTMLDivElement | null;
    onVoucherTypeChange?: (type: 'RECEIPT' | 'PAYMENT') => void;
}> = ({ initialType = 'RECEIPT', sharedState, updateCurrency, onSuccess, initialVoucherId, outerHeaderActionsContainer, onVoucherTypeChange }) => {
    const {
        addTransaction, contacts, accounts, addCheck, checks, updateCheck, deleteVoucher, baseCurrency, companySettings,
        invoices, invoiceSettlements, transactions, upsertInvoiceSettlementsForVoucher
    } = useAccounting();
    const [voucherType, setVoucherType] = useState<'RECEIPT' | 'PAYMENT'>(initialType);
    const [contactId, setContactId] = useState('');
    const [description, setDescription] = useState('');
    const [showQuickContact, setShowQuickContact] = useState(false);
    const [quickContactInitialName, setQuickContactInitialName] = useState('');
    const [showVoucherActions, setShowVoucherActions] = useState(false);
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
    const voucherReference = useMemo(() => {
        if (initialVoucherId) return initialVoucherId;

        const currentYear = new Date().getFullYear(); // e.g. 2026
        const prefix = `${voucherType === 'RECEIPT' ? 'REC' : 'PAY'}-${currentYear}-`;

        const voucherIds = new Set<string>();
        transactions.forEach(tx => {
            if (tx.voucherId && tx.voucherId.startsWith(prefix)) {
                voucherIds.add(tx.voucherId);
            }
        });

        let maxNum = 0;
        voucherIds.forEach(id => {
            const numPart = id.slice(prefix.length); // Get the sequential number part
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
                maxNum = Math.max(maxNum, num);
            }
        });

        const nextNum = maxNum === 0 ? 1 : maxNum + 1;
        const paddedNum = String(nextNum).padStart(6, '0');
        return `${prefix}${paddedNum}`;
    }, [initialVoucherId, transactions, voucherType]);
    const voucherTitle = useMemo(
        () => voucherType === 'RECEIPT'
            ? tr('سند قبض', 'Receipt Voucher')
            : tr('سند صرف', 'Payment Voucher'),
        [voucherType, isEnglish]
    );

    useEffect(() => {
        onVoucherTypeChange?.(voucherType);
    }, [onVoucherTypeChange, voucherType]);
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
        if (selectedContact.type === 'SUPPLIER') return selectedContact.currentAccountId || selectedContact.linkedAccountId || 'acc_payable';
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

        try {
            const dataUrl = await compressImageForInlineStorage(file, {
                maxDimension: 1600,
                targetBytes: 420 * 1024
            });
            setCheckLines(prev => prev.map(l => {
                if (l.id !== lineId) return l;
                const nextImages = Array.isArray(l.imageUrls) ? [...l.imageUrls] : [];
                nextImages[slotIndex] = dataUrl;
                return { ...l, imageUrls: nextImages.slice(0, 2) };
            }));
        } catch {
            alert(tr('تعذر تجهيز الصورة. حاول بصورة أخرى.', 'Could not process the image. Please try another one.'));
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

    const buildVoucherExportRows = () => {
        const cashRows = cashLines
            .filter(line => (parseFloat(line.amount) || 0) > 0 || line.accountId)
            .map((line) => {
                const amount = parseFloat(line.amount) || 0;
                const account = accounts.find(a => a.id === line.accountId) || null;
                return {
                    lineType: tr('نقدي/تحويل', 'Cash/Transfer'),
                    accountOrBank: account ? displayAccountName(account) : tr('غير محدد', 'Not set'),
                    reference: '',
                    dueDate: '',
                    amount
                };
            });

        const checkRowsExport = checkLines
            .filter(line => (parseFloat(line.amount) || 0) > 0 || line.checkNumber || line.bankName)
            .map((line) => ({
                lineType: tr('شيك', 'Check'),
                accountOrBank: displayBankName(line.bankName || '', line.bankAccountId),
                reference: line.checkNumber || '',
                dueDate: line.dueDate || '',
                amount: parseFloat(line.amount) || 0
            }));

        return [...cashRows, ...checkRowsExport];
    };

    const normalizePhoneForDirectMessage = (value?: string) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (raw.startsWith('+')) {
            return raw.replace(/[^\d]/g, '');
        }
        const digitsOnly = raw.replace(/[^\d]/g, '');
        if (digitsOnly.startsWith('00')) {
            return digitsOnly.slice(2);
        }
        return /^\d{8,15}$/.test(digitsOnly) && !digitsOnly.startsWith('0') ? digitsOnly : '';
    };

    const buildVoucherWhatsAppLink = (message: string, phone?: string) => {
        const directPhone = normalizePhoneForDirectMessage(phone);
        return directPhone
            ? `https://wa.me/${directPhone}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;
    };

    const buildVoucherSmsLink = (message: string, phone?: string) => {
        const targetPhone = String(phone || '').trim().replace(/\s+/g, '');
        return `sms:${targetPhone}?&body=${encodeURIComponent(message)}`;
    };

    const openVoucherExternalWindow = (url: string, blockedMessage: string) => {
        const popup = window.open(url, '_blank', 'noopener,noreferrer');
        if (popup) {
            return popup;
        }
        try {
            window.location.href = url;
            return window;
        } catch {
            alert(blockedMessage);
            return null;
        }
    };

    const escapeVoucherHtml = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const buildVoucherShareText = () => {
        const counterpartyLabel = selectedContactLabel
            || (voucherType === 'RECEIPT'
                ? tr('عميل نقدي', 'Walk-in Customer')
                : tr('مورد عام', 'Generic Supplier'));
        const rows = buildVoucherExportRows();
        const lineItems = rows.length > 0
            ? rows.map((row, index) => [
                `${index + 1}. ${row.lineType}`,
                row.accountOrBank,
                row.reference ? `${tr('المرجع', 'Reference')}: ${row.reference}` : '',
                row.dueDate ? `${tr('الاستحقاق', 'Due')}: ${row.dueDate}` : '',
                `${tr('المبلغ', 'Amount')}: ${row.amount.toLocaleString()} ${voucherCurrency}`
            ].filter(Boolean).join(' - '))
            : [tr('لا توجد بنود بعد.', 'No lines yet.')];

        return [
            voucherTitle,
            `${tr('المرجع', 'Reference')}: ${voucherReference}`,
            `${tr('التاريخ', 'Date')}: ${sharedState.date}`,
            `${tr('الطرف', 'Counterparty')}: ${counterpartyLabel}`,
            `${tr('العملة', 'Currency')}: ${voucherCurrency}`,
            `${tr('سعر الصرف', 'Exchange Rate')}: ${voucherRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`,
            description.trim() ? `${tr('البيان', 'Description')}: ${description.trim()}` : '',
            '',
            ...lineItems,
            '',
            `${tr('إجمالي السند', 'Voucher Total')}: ${totalAmount.toLocaleString()} ${voucherCurrency}`
        ].filter(Boolean).join('\n');
    };

    const buildVoucherNotificationText = () => [
        tr(
            `${voucherType === 'RECEIPT' ? 'تم تسجيل سند قبض' : 'تم تسجيل سند صرف'} على حسابكم.`,
            `${voucherType === 'RECEIPT' ? 'A receipt voucher' : 'A payment voucher'} was posted to your account.`
        ),
        `${tr('الطرف', 'Counterparty')}: ${selectedContactLabel || (voucherType === 'RECEIPT' ? tr('عميل نقدي', 'Walk-in Customer') : tr('مورد عام', 'Generic Supplier'))}`,
        `${tr('رقم السند', 'Voucher No.')}: ${voucherReference}`,
        `${tr('التاريخ', 'Date')}: ${sharedState.date}`,
        `${tr('القيمة', 'Amount')}: ${totalAmount.toLocaleString()} ${voucherCurrency}`
    ].join('\n');

    const handlePrintVoucher = () => {
        const counterpartyLabel = selectedContactLabel
            || (voucherType === 'RECEIPT'
                ? tr('عميل نقدي', 'Walk-in Customer')
                : tr('مورد عام', 'Generic Supplier'));
        const rows = buildVoucherExportRows();
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert(tr('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
            return;
        }
        try {
            const printDir = isEnglish ? 'ltr' : 'rtl';
            const printLang = isEnglish ? 'en' : 'ar';
            const printFont = isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', Arial, sans-serif";
            const rowsHtml = rows.length > 0
                ? rows.map((row, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeVoucherHtml(row.lineType)}</td>
                        <td>${escapeVoucherHtml(row.accountOrBank)}</td>
                        <td>${escapeVoucherHtml(row.reference || '-')}</td>
                        <td>${escapeVoucherHtml(row.dueDate || '-')}</td>
                        <td class="num">${escapeVoucherHtml(Number(row.amount || 0).toLocaleString())}</td>
                    </tr>
                `).join('')
                : `<tr><td colspan="6">${escapeVoucherHtml(tr('لا توجد بنود بعد.', 'No lines yet.'))}</td></tr>`;

            printWindow.document.open();
            printWindow.document.write(`
                <!doctype html>
                <html dir="${printDir}" lang="${printLang}">
                <head>
                    <meta charset="utf-8" />
                    <title>${escapeVoucherHtml(voucherTitle)} - ${escapeVoucherHtml(voucherReference)}</title>
                    <style>
                        body { font-family: ${printFont}; margin: 24px; color: #0f172a; }
                        .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
                        .title { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
                        .meta { font-size: 13px; color: #475569; line-height: 1.8; }
                        .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
                        .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; }
                        .lbl { font-size: 11px; color: #64748b; font-weight: 700; margin-bottom: 6px; }
                        .val { font-size: 16px; font-weight: 800; }
                        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                        th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; text-align: ${isEnglish ? 'left' : 'right'}; }
                        th { background: #f8fafc; }
                        .num { direction: ltr; text-align: center; font-weight: 800; }
                        .notes { margin-top: 18px; padding: 12px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 12px; }
                        @media print { body { margin: 12px; } }
                    </style>
                </head>
                <body>
                    <div class="head">
                        <div>
                            <div class="title">${escapeVoucherHtml(voucherTitle)}</div>
                            <div class="meta">${escapeVoucherHtml(tr('المرجع', 'Reference'))}: <strong>${escapeVoucherHtml(voucherReference)}</strong></div>
                            <div class="meta">${escapeVoucherHtml(tr('التاريخ', 'Date'))}: <strong>${escapeVoucherHtml(sharedState.date)}</strong></div>
                            <div class="meta">${escapeVoucherHtml(tr('الطرف', 'Counterparty'))}: <strong>${escapeVoucherHtml(counterpartyLabel)}</strong></div>
                        </div>
                        <div class="cards">
                            <div class="card">
                                <div class="lbl">${escapeVoucherHtml(tr('الإجمالي', 'Total'))}</div>
                                <div class="val">${escapeVoucherHtml(totalAmount.toLocaleString())} ${escapeVoucherHtml(voucherCurrency)}</div>
                            </div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${escapeVoucherHtml(tr('نوع البند', 'Line Type'))}</th>
                                <th>${escapeVoucherHtml(tr('الحساب/البنك', 'Account/Bank'))}</th>
                                <th>${escapeVoucherHtml(tr('المرجع', 'Reference'))}</th>
                                <th>${escapeVoucherHtml(tr('تاريخ الاستحقاق', 'Due Date'))}</th>
                                <th>${escapeVoucherHtml(tr('المبلغ', 'Amount'))}</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    ${description.trim() ? `<div class="notes"><strong>${escapeVoucherHtml(tr('البيان', 'Description'))}:</strong> ${escapeVoucherHtml(description.trim())}</div>` : ''}
                    <script>window.onload = function () { window.print(); };</script>
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch {
            if (!printWindow.closed) {
                printWindow.close();
            }
            alert(tr('تعذر تجهيز السند للطباعة الآن.', 'Could not prepare the voucher for printing right now.'));
        }
    };

    const handleDownloadVoucherExcel = () => {
        try {
            const rows = buildVoucherExportRows();
            const counterpartyLabel = selectedContactLabel
                || (voucherType === 'RECEIPT'
                    ? tr('عميل نقدي', 'Walk-in Customer')
                    : tr('مورد عام', 'Generic Supplier'));
            const itemHeader = [
                '#',
                tr('نوع البند', 'Line Type'),
                tr('الحساب/البنك', 'Account/Bank'),
                tr('المرجع', 'Reference'),
                tr('تاريخ الاستحقاق', 'Due Date'),
                tr('المبلغ', 'Amount')
            ];
            const workbookRows: Array<Array<string | number>> = [
                [voucherTitle],
                [],
                [tr('المرجع', 'Reference'), voucherReference, tr('التاريخ', 'Date'), sharedState.date],
                [tr('الطرف', 'Counterparty'), counterpartyLabel, tr('العملة', 'Currency'), voucherCurrency]
            ];

            if (description.trim()) {
                workbookRows.push([tr('البيان', 'Description'), description.trim()]);
            }

            workbookRows.push([]);
            const headerRowIndex = workbookRows.length;
            workbookRows.push(itemHeader);

            if (rows.length > 0) {
                rows.forEach((row, index) => {
                    workbookRows.push([
                        index + 1,
                        row.lineType,
                        row.accountOrBank,
                        row.reference || '',
                        row.dueDate || '',
                        Number((row.amount || 0).toFixed(2))
                    ]);
                });
            } else {
                workbookRows.push([1, tr('لا توجد بنود بعد.', 'No lines yet.'), '', '', '', Number((totalAmount || 0).toFixed(2))]);
            }

            workbookRows.push([]);
            workbookRows.push([tr('إجمالي السند', 'Voucher Total'), Number((totalAmount || 0).toFixed(2))]);

            const worksheet = XLSX.utils.aoa_to_sheet(workbookRows);
            const columnWidths = [6, 24, 32, 18, 16, 16];
            worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));
            worksheet['!autofilter'] = {
                ref: XLSX.utils.encode_range({
                    s: { r: headerRowIndex, c: 0 },
                    e: { r: headerRowIndex, c: columnWidths.length - 1 }
                })
            };

            const workbook = XLSX.utils.book_new();
            workbook.Workbook = { Views: [{ RTL: !isEnglish }] };
            XLSX.utils.book_append_sheet(workbook, worksheet, voucherType === 'RECEIPT' ? 'ReceiptVoucher' : 'PaymentVoucher');
            downloadWorkbookFile(workbook, {
                fileName: sanitizeDownloadName(`${voucherReference || 'voucher'}-${sharedState.date || 'draft'}.xlsx`)
            });
        } catch {
            alert(tr('تعذر تصدير السند إلى Excel.', 'Could not export the voucher to Excel.'));
        }
    };

    const handleShareVoucher = async () => {
        const text = buildVoucherShareText();
        setShowVoucherActions(false);
        if (navigator.share) {
            try {
                await navigator.share({
                    title: voucherTitle,
                    text
                });
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') return;
            }
        }
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert(tr('تم نسخ بيانات السند إلى الحافظة.', 'Voucher details copied to clipboard.'));
                return;
            } catch {
                // Fall back to prompt.
            }
        }
        window.prompt(tr('انسخ بيانات السند التالية', 'Copy voucher details below'), text);
    };

    const handleShareVoucherWhatsApp = () => {
        setShowVoucherActions(false);
        openVoucherExternalWindow(
            buildVoucherWhatsAppLink(buildVoucherNotificationText(), selectedContact?.phone),
            tr('تعذر فتح واتساب. تأكد من السماح بالنوافذ المنبثقة.', 'Unable to open WhatsApp. Please allow pop-ups.')
        );
    };

    const handleShareVoucherSms = () => {
        setShowVoucherActions(false);
        openVoucherExternalWindow(
            buildVoucherSmsLink(buildVoucherNotificationText(), selectedContact?.phone),
            tr('تعذر فتح تطبيق الرسائل من المتصفح الحالي.', 'Unable to open the SMS app from the current browser.')
        );
    };

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

        const voucherId = voucherReference;
        const isReceipt = voucherType === 'RECEIPT';
        const fallbackContactId = 'cash_customer';
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
            targetAccountId = contact.currentAccountId || contact.linkedAccountId || 'acc_payable';
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

    const totalAmountDisplay = Number(totalAmount || 0).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    const voucherPrimaryInputClass = "w-full min-w-0 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none transition placeholder:text-slate-300 shadow-[0_12px_30px_-28px_rgba(15,23,42,0.55)] focus:border-blue-200 focus:ring-2 focus:ring-blue-50";
    const sheetInputClass = `${voucherPrimaryInputClass} h-12 px-3 py-0 text-[13px]`;
    const sheetIndexClass = "inline-flex items-center justify-center rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-400 shadow-sm";
    const checkFieldWrapClass = "min-w-0 flex flex-col gap-1.5";
    const checkFieldLabelClass = "px-1 text-[11px] font-black leading-tight text-slate-400";
    const checkFieldControlClass = "min-w-0 w-full";
    const voucherSectionClass = "voucher-mobile-section rounded-[1.45rem] border border-slate-200/90 bg-white px-3 py-3 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.35)]";
    const voucherSectionTitleClass = "text-[0.95rem] font-black text-slate-700";
    const cashSectionActionClass = "inline-flex items-center justify-center rounded-[0.9rem] border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-700 transition hover:bg-emerald-100";
    const checkSectionActionClass = "inline-flex items-center justify-center rounded-[0.9rem] border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700 transition hover:bg-indigo-100";
    const endorseActionClass = "inline-flex items-center gap-1.5 justify-center rounded-[0.9rem] border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 transition hover:bg-violet-100";
    const voucherHeaderActions = (
        <div className="relative flex items-center gap-1 shrink-0">
            <button
                type="button"
                onClick={handlePrintVoucher}
                className="rounded-full bg-orange-50 p-2 text-orange-600 transition-colors hover:bg-orange-100"
                title={tr('PDF / طباعة', 'PDF / Print')}
            >
                <FileText size={16} />
            </button>
            <button
                type="button"
                onClick={() => void handleSubmit()}
                className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200"
                title={tr('حفظ السند', 'Save Voucher')}
            >
                <Save size={16} />
            </button>
            <button
                type="button"
                onClick={() => setShowVoucherActions(prev => !prev)}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                title={tr('إجراءات إضافية', 'More Actions')}
            >
                <MoreVertical size={18} />
            </button>
            {showVoucherActions && (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-[440] cursor-default bg-transparent"
                        onClick={() => setShowVoucherActions(false)}
                        aria-label={tr('إغلاق القائمة', 'Close menu')}
                    />
                    <div className={`absolute top-full z-[450] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl ${isEnglish ? 'left-0' : 'right-0'}`}>
                        <button type="button" onClick={() => { setShowVoucherActions(false); handleDownloadVoucherExcel(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                            <FileSpreadsheet size={16} />
                            {tr('إكسل', 'Excel')}
                        </button>
                        <button type="button" onClick={() => void handleShareVoucher()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                            <Share2 size={16} />
                            {tr('مشاركة', 'Share')}
                        </button>
                        <button type="button" onClick={handleShareVoucherSms} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                            <MessageSquareText size={16} />
                            {tr('إشعار رسالة', 'SMS')}
                        </button>
                        <button type="button" onClick={handleShareVoucherWhatsApp} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                            <MessageCircle size={16} />
                            {tr('إشعار واتساب', 'WhatsApp')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div
            className="transaction-mobile-form transaction-screen-with-submit-dock app-page w-full max-w-full px-2 sm:px-3 space-y-3 safe-pb-dock overflow-x-hidden"
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
            data-testid="voucher-form-root"
        >
            {outerHeaderActionsContainer && createPortal(voucherHeaderActions, outerHeaderActionsContainer)}
            {amountNotice && (
                <div className="sticky top-2 z-20 mx-1 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                    {amountNotice}
                </div>
            )}
            <div className="voucher-mobile-hero rounded-[1.55rem] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_20px_44px_-34px_rgba(15,23,42,0.42)]">
                <div className="mb-4 flex items-center justify-between gap-2 px-2">
                    <div className="text-[10px] font-black text-slate-400">
                        {tr('مرجع السند', 'Voucher Ref')}
                    </div>
                    <div className={`text-[11px] font-black text-slate-300 dir-ltr ${isEnglish ? 'text-right' : 'text-left'}`}>
                        {voucherReference}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-[1.2rem] bg-slate-100/90 p-1 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]">
                    <button
                        type="button"
                        onClick={() => setVoucherType('RECEIPT')}
                        className={`rounded-[1rem] px-3 py-3 text-xs font-black transition-all ${voucherType === 'RECEIPT'
                            ? 'border border-emerald-100 bg-white text-emerald-600 shadow-[0_14px_26px_-22px_rgba(16,185,129,0.8)]'
                            : 'text-slate-400'
                            }`}
                    >
                        {tr('قبض', 'Receipt')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setVoucherType('PAYMENT')}
                        className={`rounded-[1rem] px-3 py-3 text-xs font-black transition-all ${voucherType === 'PAYMENT'
                            ? 'border border-rose-100 bg-white text-rose-600 shadow-[0_14px_26px_-22px_rgba(244,63,94,0.8)]'
                            : 'text-slate-400'
                            }`}
                    >
                        {tr('صرف', 'Payment')}
                    </button>
                </div>

                <div className="mt-3 flex flex-col gap-2 min-[430px]:flex-row">
                    <div className="min-w-0 flex-1">
                        <SearchableContactSelect
                            contacts={filteredContacts}
                            selectedId={contactId}
                            selectedLabel={selectedContactLabel}
                            onSelect={setContactId}
                            onCreateNew={(nextName) => {
                                setQuickContactInitialName(nextName);
                                setShowQuickContact(true);
                            }}
                            displayContactName={displayContactName}
                            placeholder={tr('اختر الطرف أو ابحث بالاسم أو الجوال...', 'Select or search by name or phone...')}
                            emptyLabel={tr('لا يوجد طرف مطابق.', 'No matching contact found.')}
                            createNewLabel={tr('إضافة طرف جديد', 'Add New Contact')}
                            onActionClick={(nextName) => {
                                setQuickContactInitialName(nextName || '');
                                setShowQuickContact(true);
                            }}
                            actionIcon={<UserPlus size={16} />}
                            actionLabel={tr('إضافة طرف جديد', 'Add New Contact')}
                            actionButtonClassName="text-blue-500 hover:text-blue-600"
                            isEnglish={isEnglish}
                            inputClassName={`${voucherPrimaryInputClass} !py-3`}
                            inputTestId="voucher-contact-input"
                        />
                    </div>

                    <div className="relative min-w-0 flex-1">
                        <TextQuote
                            size={16}
                            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-300 ${isEnglish ? 'left-4' : 'right-4'}`}
                        />
                        <input
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={tr('البيان / ملاحظات السند...', 'Voucher description / notes...')}
                            data-testid="voucher-description-input"
                            className={`${voucherPrimaryInputClass} ${isEnglish ? 'pl-4 pr-11' : 'pr-4 pl-11'}`}
                        />
                    </div>
                </div>

                {selectedContact?.type === 'PARTNER' && (
                    <div className={`mt-3 rounded-[1.15rem] border p-3 text-[11px] font-black ${selectedCounterAccountId ? 'border-blue-100 bg-blue-50/80 text-blue-700' : 'border-rose-100 bg-rose-50/80 text-rose-700'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>{tr('حساب جاري الشريك', 'Partner current account')}</span>
                            <span className="dir-ltr">{selectedCounterAccount ? displayAccountName(selectedCounterAccount) : tr('غير مربوط', 'Not linked')}</span>
                        </div>
                        <div className="mt-1 leading-5">
                            {voucherType === 'PAYMENT'
                                ? tr('عند الصرف: يتم ترحيل المبلغ على جاري الشريك مباشرة.', 'On payment: amount is posted directly to partner current.')
                                : tr('عند القبض: يتم إضافة المبلغ إلى جاري الشريك مباشرة.', 'On receipt: amount is added directly to partner current.')}
                        </div>
                        {!selectedCounterAccountId && (
                            <div className="mt-1 leading-5">
                                {tr('يرجى ربط الشريك بحسابه الجاري من الدليل أولاً.', 'Please link this partner to current account from Directory first.')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {voucherInvoiceAllocationEnabled && contactId && allocationRows.length > 0 && (
                <div className="rounded-[1.45rem] border border-blue-100 bg-white px-3 py-3 shadow-[0_18px_38px_-32px_rgba(59,130,246,0.28)] space-y-3">
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
            <div className={voucherSectionClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className={voucherSectionTitleClass}>{tr('المدفوعات النقدية / التحويل', 'Cash / Transfer Lines')}</h3>
                    <button type="button" onClick={addCashLine} data-testid="voucher-add-cash-line" className={cashSectionActionClass}>
                        {tr('+ إضافة', '+ Add')}
                    </button>
                </div>

                {cashLines.length > 0 ? (
                    <div className="mt-3 space-y-2.5">
                        {cashLines.map((line, idx) => (
                            <div key={line.id} className="voucher-mobile-line-card cash-line-card rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-2.5 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.35)] animate-in slide-in-from-right-2">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className={sheetIndexClass}>{tr(`بند ${idx + 1}`, `Line ${idx + 1}`)}</span>
                                </div>

                                <div className="cash-line-grid grid gap-2 min-[430px]:grid-cols-[minmax(0,1.3fr)_minmax(0,0.85fr)]">
                                    <div className="min-w-0">
                                        <div className={checkFieldLabelClass}>{tr('الحساب المالي', 'Cash / Bank')}</div>
                                        <select
                                            value={line.accountId}
                                            onChange={e => updateCashLine(line.id, 'accountId', e.target.value)}
                                            data-testid={`voucher-cash-line-${idx + 1}-account`}
                                            className={`${sheetInputClass} ${isEnglish ? 'text-left' : 'text-right'}`}
                                        >
                                            <option value="">{tr('الصندوق / البنك', 'Cash / Bank')}</option>
                                            {financialAccounts.map(a => <option key={a.id} value={a.id}>{displayAccountName(a)}</option>)}
                                        </select>
                                    </div>

                                    <div className="min-w-0">
                                        <div className={`${checkFieldLabelClass} text-center`}>{tr('المبلغ', 'Amount')}</div>
                                        <div className="flex items-stretch gap-2">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                placeholder={tr('المبلغ', 'Amount')}
                                                value={line.amount}
                                                onChange={e => updateCashLine(line.id, 'amount', e.target.value)}
                                                onBlur={e => notifyAmountAdded(e.target.value)}
                                                data-testid={`voucher-cash-line-${idx + 1}-amount`}
                                                className={`${sheetInputClass} min-w-0 flex-1 text-center dir-ltr`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeLine('CASH', line.id)}
                                                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                                                aria-label={tr('حذف السطر', 'Delete line')}
                                                title={tr('حذف السطر', 'Delete line')}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mt-3 h-px bg-slate-200/80" />
                )}
            </div>
            {/* Check Lines */}
            <div className={voucherSectionClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className={voucherSectionTitleClass}>{tr('الشيكات والأوراق المالية', 'Checks and Instruments')}</h3>
                    <div className="flex flex-wrap gap-2">
                        {voucherType === 'PAYMENT' && (
                            <button type="button" onClick={() => setShowEndorseSelect(true)} className={endorseActionClass}>
                                <ArrowRightLeft size={12} /> {tr('تجيير شيك', 'Endorse Check')}
                            </button>
                        )}
                        <button type="button" onClick={addCheckLine} className={checkSectionActionClass}>
                            {tr('+ شيك جديد', '+ New Check')}
                        </button>
                    </div>
                </div>

                {showEndorseSelect && (
                    <div className="mt-3 rounded-[1.3rem] border border-violet-100 bg-violet-50/60 p-4 shadow-[0_18px_34px_-28px_rgba(139,92,246,0.42)] animate-in fade-in">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-black text-violet-800">{tr('اختر شيك للتجيير (موجود بالصندوق)', 'Select check to endorse (in vault)')}</h4>
                            <button type="button" onClick={() => setShowEndorseSelect(false)} className="text-violet-400 hover:text-violet-600"><X size={16} /></button>
                        </div>
                        {availableChecks.length > 0 ? (
                            <div className="space-y-2">
                                {availableChecks.map(c => (
                                    <div key={c.id} onClick={() => addEndorsedCheckLine(c)} className="flex min-w-0 items-center justify-between gap-2 rounded-[1.1rem] border border-violet-100 bg-white p-3 transition-colors hover:bg-violet-100/70">
                                        <div className="min-w-0">
                                            <div className="truncate text-xs font-bold text-slate-700">#{c.checkNumber} - {displayBankName(c.bankName, c.bankAccountId)}</div>
                                            <div className="text-[9px] text-slate-400">{tr('استحقاق', 'Due')}: {c.dueDate}</div>
                                        </div>
                                        <div className="shrink-0 font-black text-violet-600 dir-ltr">{c.amount.toLocaleString()}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-center text-[10px] font-bold text-slate-400">{tr('لا توجد شيكات واردة متاحة للتجيير', 'No incoming checks available for endorsement')}</div>
                        )}
                    </div>
                )}

                {checkLines.length > 0 ? (
                    <div className="mt-3 space-y-3">
                        {checkLines.map((line, idx) => (
                            <div key={line.id} className={`voucher-mobile-line-card check-line-card rounded-[1.35rem] border p-3 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.35)] animate-in slide-in-from-right-2 ${line.isEndorsed ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-slate-50/80'}`}>
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black ${line.isEndorsed ? 'bg-violet-100 text-violet-700' : 'bg-white text-slate-400 shadow-sm'}`}>
                                        {line.isEndorsed ? tr('شيك مجيّر', 'Endorsed Check') : tr(`شيك ${idx + 1}`, `Check ${idx + 1}`)}
                                    </span>
                                </div>

                                <div className="check-line-grid-primary grid gap-2 min-[430px]:grid-cols-3">
                                    <div className={checkFieldWrapClass}>
                                        <div className={checkFieldLabelClass}>{tr('رقم الشيك', 'Check Number')}</div>
                                        <div className={checkFieldControlClass}>
                                            <input placeholder={tr('رقم الشيك', 'Check Number')} value={line.checkNumber} onChange={e => updateCheckLine(line.id, 'checkNumber', e.target.value)} className={sheetInputClass} disabled={line.isEndorsed} />
                                        </div>
                                    </div>

                                    <div className={checkFieldWrapClass}>
                                        <div className={checkFieldLabelClass}>{tr('البنك', 'Bank')}</div>
                                        <div className={checkFieldControlClass}>
                                            {voucherType === 'PAYMENT' && !line.isEndorsed ? (
                                                <select value={line.bankAccountId || ''} onChange={e => updateCheckLine(line.id, 'bankAccountId', e.target.value)} className={`${sheetInputClass} ${isEnglish ? 'text-left' : 'text-right'}`}>
                                                    <option value="">{tr('اسم البنك أو رقم البنك', 'Bank name or code')}</option>
                                                    {bankAccounts.map(acc => (
                                                        <option key={acc.id} value={acc.id}>{displayAccountName(acc)}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input placeholder={tr('اسم البنك أو رقم البنك', 'Bank name or code')} value={line.bankName} onChange={e => updateCheckLine(line.id, 'bankName', e.target.value)} className={sheetInputClass} disabled={line.isEndorsed} />
                                            )}
                                        </div>
                                    </div>

                                    <div className={checkFieldWrapClass}>
                                        <div className={checkFieldLabelClass}>{tr('رقم الحساب', 'Account Number')}</div>
                                        <div className={checkFieldControlClass}>
                                            <input placeholder={tr('رقم الحساب', 'Account Number')} value={line.accountNumber || ''} onChange={e => updateCheckLine(line.id, 'accountNumber', e.target.value)} className={sheetInputClass} disabled={line.isEndorsed} />
                                        </div>
                                    </div>
                                </div>

                                <div className="check-line-grid-secondary mt-2 grid gap-2 min-[430px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem]">
                                    <div className={checkFieldWrapClass}>
                                        <div className={`${checkFieldLabelClass} text-center`}>{tr('الاستحقاق', 'Due')}</div>
                                        <div className={checkFieldControlClass}>
                                            <EnglishDateInput
                                                value={line.dueDate}
                                                onChange={value => updateCheckLine(line.id, 'dueDate', value)}
                                                wrapperClassName="w-full min-w-0"
                                                className={`${sheetInputClass} dir-ltr text-center`}
                                                disabled={line.isEndorsed}
                                                aria-label={tr('تاريخ استحقاق الشيك', 'Check due date')}
                                            />
                                        </div>
                                    </div>

                                    <div className={checkFieldWrapClass}>
                                        <div className={`${checkFieldLabelClass} text-center`}>{tr('المبلغ', 'Amount')}</div>
                                        <div className={checkFieldControlClass}>
                                            <input type="number" inputMode="decimal" placeholder={tr('المبلغ', 'Amount')} value={line.amount} onChange={e => updateCheckLine(line.id, 'amount', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className={`${sheetInputClass} text-center dir-ltr`} disabled={line.isEndorsed} />
                                        </div>
                                    </div>

                                    <div className={checkFieldWrapClass}>
                                        <div className={`${checkFieldLabelClass} text-center`}>{tr('حذف', 'Delete')}</div>
                                        <div className={checkFieldControlClass}>
                                            <button type="button" onClick={() => removeLine('CHECK', line.id)} aria-label={tr('حذف السطر', 'Delete line')} className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="text-[11px] font-black text-slate-500">{tr('إرفاق صور الشيك (حتى صورتين - تُضغط تلقائيًا)', 'Attach check images (up to 2 - auto-compressed)')}</div>
                                    <div className="check-image-grid grid gap-2 min-[430px]:grid-cols-2">
                                        {[0, 1].map((slotIndex) => {
                                            const imageValue = line.imageUrls?.[slotIndex] || '';
                                            return (
                                                <div key={`${line.id}-img-${slotIndex}`} className="rounded-[1rem] border border-slate-200 bg-white p-2 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.18)]">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-black text-slate-500">{tr(`صورة ${slotIndex + 1}`, `Image ${slotIndex + 1}`)}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {imageValue && (
                                                                <a href={imageValue} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600 transition-colors hover:bg-blue-100">
                                                                    {tr('عرض', 'View')}
                                                                </a>
                                                            )}
                                                            <label className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black transition-colors ${line.isEndorsed ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : 'cursor-pointer border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
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
                                                        </div>
                                                    </div>

                                                    {imageValue ? (
                                                        <a
                                                            href={imageValue}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="mt-2 flex h-10 items-center justify-center rounded-[0.9rem] border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50/70"
                                                        >
                                                            {tr('اضغط لعرض الصورة', 'Tap to view image')}
                                                        </a>
                                                    ) : (
                                                        <div className="mt-2 flex h-10 items-center justify-center rounded-[0.9rem] border border-slate-100 bg-slate-50/60 text-[10px] font-bold text-slate-300">
                                                            {tr('لا توجد صورة', 'No image')}
                                                        </div>
                                                    )}

                                                    {imageValue && !line.isEndorsed && (
                                                        <div className="mt-1.5 flex justify-end">
                                                            <button type="button" onClick={() => clearCheckImage(line.id, slotIndex)} className="rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-600 transition-colors hover:bg-rose-100">
                                                                {tr('حذف', 'Remove')}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mt-3 h-px bg-slate-200/80" />
                )}
            </div>
            <div className="invoice-submit-panel voucher-mobile-submit layout-footer z-20 hidden rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.42)] md:block">
                <div className="transaction-submit-panel-details">
                    <div className="mb-3 flex items-end justify-between gap-3 rounded-[1.15rem] border border-slate-100 bg-slate-50/70 px-3 py-3">
                        <div>
                            <div className="text-[11px] font-black text-slate-400">{tr('إجمالي السند', 'Voucher Total')}</div>
                            <div className="mt-1 text-[10px] font-bold text-slate-300 dir-ltr">{voucherCurrency}</div>
                        </div>
                        <span className="text-[2rem] font-black leading-none text-slate-800 dir-ltr">{totalAmountDisplay}</span>
                    </div>
                </div>
                <button type="button" onClick={handleSubmit} data-testid="voucher-submit-action" className="hidden w-full rounded-[1.2rem] bg-[#2f63f2] py-4 font-black text-white shadow-[0_18px_32px_-18px_rgba(47,99,242,0.88)] transition-all hover:bg-[#2557ea] active:scale-[0.99] md:block">
                    {initialVoucherId ? tr('تحديث وترحيل السند', 'Update & Post Voucher') : tr('ترحيل السند', 'Post Voucher')}
                </button>
            </div>
            <MobileSubmitDock
                label={initialVoucherId ? tr('تحديث وترحيل السند', 'Update & Post Voucher') : tr('ترحيل السند', 'Post Voucher')}
                onClick={() => void handleSubmit()}
                summary={
                    <div className="transaction-submit-panel-details">
                        <div className="flex items-end justify-between gap-3 rounded-[1.15rem] border border-slate-100 bg-slate-50/70 px-3 py-3">
                            <div>
                                <div className="text-[11px] font-black text-slate-400">{tr('إجمالي السند', 'Voucher Total')}</div>
                                <div className="mt-1 text-[10px] font-bold text-slate-300 dir-ltr">{voucherCurrency}</div>
                            </div>
                            <span className="text-[2rem] font-black leading-none text-slate-800 dir-ltr">{totalAmountDisplay}</span>
                        </div>
                    </div>
                }
                buttonClassName="bg-[#2f63f2] text-white hover:bg-[#2557ea]"
            />
            {showQuickContact && (
                <ContactEditorDialog
                    mode="INVOICE"
                    initialName={quickContactInitialName}
                    initialType={voucherType === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER'}
                    allowedTypes={['CUSTOMER', 'SUPPLIER']}
                    onClose={() => { setQuickContactInitialName(''); setShowQuickContact(false); }}
                    onSave={(contact) => {
                        setContactId(contact.id);
                        setQuickContactInitialName('');
                        setShowQuickContact(false);
                    }}
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
    initialJournalId?: string;
}> = ({ sharedState, onSuccess, initialJournalId }) => {
    const { accounts, addTransaction, contacts, employees, fixedAssets, checks, transactions, deleteTransaction, updateCheck, companySettings, baseCurrency } = useAccounting();
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
    const [showJournalActions, setShowJournalActions] = useState(false);
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
    const postingAccounts = useMemo(
        () => accounts.filter(account => !account.isGroup),
        [accounts]
    );
    const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
    const linkedAccountOptions = useMemo(
        () => accounts.filter(a => !a.isGroup && (a.type === 'LIABILITY' || a.id === 'acc_receivable')),
        [accounts]
    );
    const editingJournalTransactions = useMemo(() => {
        if (!initialJournalId) return [] as Transaction[];
        return transactions
            .filter(tx =>
                (tx.voucherId === initialJournalId || tx.id === initialJournalId)
                && tx.category === 'journal'
                && tx.type === TransactionType.TRANSFER
            )
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [initialJournalId, transactions]);
    const journalReference = useMemo(() => {
        if (initialJournalId) return initialJournalId;

        const currentYear = new Date().getFullYear(); // e.g. 2026
        const prefix = `JRN-${currentYear}-`; // e.g. "JRN-2026-"

        const voucherIds = new Set<string>();
        transactions.forEach(tx => {
            if (tx.voucherId && tx.voucherId.startsWith(prefix)) {
                voucherIds.add(tx.voucherId);
            }
        });

        let maxNum = 0;
        voucherIds.forEach(id => {
            const numPart = id.slice(prefix.length); // Get the sequential number part
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
                maxNum = Math.max(maxNum, num);
            }
        });

        const nextNum = maxNum === 0 ? 1 : maxNum + 1;
        const paddedNum = String(nextNum).padStart(6, '0');
        return `${prefix}${paddedNum}`;
    }, [initialJournalId, transactions]);
    const editingJournalBlocked = useMemo(
        () => editingJournalTransactions.some(tx => tx.isReversal || tx.reversedById),
        [editingJournalTransactions]
    );
    const initializedJournalEditRef = useRef<string | null>(null);
    const isEditingJournal = Boolean(initialJournalId);

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
        if (relatedContact.type === 'SUPPLIER') return relatedContact.currentAccountId || relatedContact.linkedAccountId || 'acc_payable';
        if (relatedContact.type === 'EMPLOYEE') return 'acc_accrued_salaries';
        if (relatedContact.type === 'CUSTOMER') return 'acc_receivable';
        return 'acc_payable';
    };

    const getLineRequirement = (accountId: string): JournalRequirement => {
        if (!accountId) return 'NONE';
        if (isAccountOrDescendantOf(accountId, 'acc_accrued_salaries')) return 'EMPLOYEE';
        if (isAccountOrDescendantOf(accountId, 'acc_receivable_group') || isAccountOrDescendantOf(accountId, 'acc_receivable')) return 'CUSTOMER';
        if (isAccountOrDescendantOf(accountId, 'acc_payable_group') || isAccountOrDescendantOf(accountId, 'acc_payable')) return 'SUPPLIER';
        if (isAccountOrDescendantOf(accountId, 'acc_cheques_hand')) return 'CHECK_COLLECTION';
        if (isAccountOrDescendantOf(accountId, 'acc_notes_payable')) return 'OUTGOING_CHECK';
        if (accountId === 'acc_depreciation_exp' || accountId === 'acc_accumulated_depreciation') return 'FIXED_ASSET';
        if (isAccountOrDescendantOf(accountId, 'acc_fixed_assets_root')) return 'FIXED_ASSET';
        return 'NONE';
    };

    const isPurchaseTaxExpenseAccount = (accountId?: string) => {
        if (!accountId || accountId === 'acc_vat_input') return false;
        return accountMap.get(accountId)?.type === 'EXPENSE';
    };

    const getLinePurchaseTaxState = (line: JournalLine) => {
        const hasDebit = (parseFloat(line.debit) || 0) > 0;
        const hasCredit = (parseFloat(line.credit) || 0) > 0;
        const isExpenseAccount = isPurchaseTaxExpenseAccount(line.accountId);
        return {
            hasDebit,
            hasCredit,
            isExpenseAccount,
            canSplitTax: isExpenseAccount && hasDebit && !hasCredit
        };
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

    useEffect(() => {
        if (!initialJournalId) {
            initializedJournalEditRef.current = null;
            return;
        }
        if (initializedJournalEditRef.current === initialJournalId) return;
        if (editingJournalTransactions.length === 0) return;

        const round2 = (value: number) => Number((Number(value) || 0).toFixed(2));
        const sideLines = new Map<string, JournalLine>();

        const getSideDescription = (rawDescription: string | undefined, side: 'DEBIT' | 'CREDIT') => {
            const [debitPart = '', creditPart = ''] = String(rawDescription || '').split('<>');
            const chosen = side === 'DEBIT' ? debitPart : creditPart;
            return chosen.trim();
        };

        const upsertSideLine = (side: 'DEBIT' | 'CREDIT', accountId: string | undefined, amount: number, tx: Transaction) => {
            if (!accountId || amount <= 0) return;
            const key = `${side}:${accountId}`;
            const existing = sideLines.get(key);
            const sideDescription = getSideDescription(tx.description, side);

            if (existing) {
                if (side === 'DEBIT') {
                    existing.debit = round2((parseFloat(existing.debit) || 0) + amount).toString();
                } else {
                    existing.credit = round2((parseFloat(existing.credit) || 0) + amount).toString();
                }
                if (!existing.description && sideDescription) existing.description = sideDescription;
                return;
            }

            const seeded: JournalLine = {
                id: `${side}-${accountId}-${sideLines.size + 1}`,
                accountId,
                debit: side === 'DEBIT' ? round2(amount).toString() : '',
                credit: side === 'CREDIT' ? round2(amount).toString() : '',
                description: sideDescription
            };
            const requirement = getLineRequirement(accountId);
            if ((requirement === 'CUSTOMER' || requirement === 'SUPPLIER') && tx.contactId) {
                seeded.contactId = tx.contactId;
            }
            if (requirement === 'EMPLOYEE' && tx.employeeId) seeded.employeeId = tx.employeeId;
            if (requirement === 'FIXED_ASSET' && tx.assetId) seeded.assetId = tx.assetId;
            if (requirement === 'CHECK_COLLECTION' && tx.checkId) seeded.checkId = tx.checkId;
            if (requirement === 'OUTGOING_CHECK' && tx.checkId) {
                seeded.outgoingCheckId = tx.checkId;
                seeded.outgoingCheckAction = 'NONE';
                if (tx.contactId && !seeded.linkedAccountId) {
                    seeded.contactId = tx.contactId;
                    seeded.linkedAccountId = getSuggestedLinkedAccountId(tx.contactId);
                }
            }
            sideLines.set(key, seeded);
        };

        editingJournalTransactions.forEach(tx => {
            const amount = Math.max(0, Number(tx.amount) || 0);
            if (amount <= 0) return;
            upsertSideLine('DEBIT', tx.debitAccountId, amount, tx);
            upsertSideLine('CREDIT', tx.creditAccountId, amount, tx);
        });

        const hydratedLines = Array.from(sideLines.values()).map((line, index) => ({
            ...line,
            id: String(index + 1)
        }));

        if (hydratedLines.length === 1) {
            hydratedLines.push({ id: '2', accountId: '', debit: '', credit: '', description: '' });
        }
        if (hydratedLines.length >= 2) {
            setLines(hydratedLines);
            initializedJournalEditRef.current = initialJournalId;
        }
    }, [initialJournalId, editingJournalTransactions, contacts]);

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

            const { canSplitTax } = getLinePurchaseTaxState(updated);
            const taxSplitBlocked = !canSplitTax;
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
            const { canSplitTax: canEnable } = getLinePurchaseTaxState(line);
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
            if (!isPurchaseTaxExpenseAccount(targetLine.accountId)) {
                return {
                    ok: false,
                    message: tr(
                        `يرجى اختيار حساب مصروف صالح في السطر ${lineNo} قبل فصل الضريبة.`,
                        `Please select a valid expense account in line ${lineNo} before tax split.`
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
        if (isEditingJournal && editingJournalTransactions.length === 0) {
            return alert(tr('تعذر العثور على القيد المطلوب تعديله.', 'Could not find the journal entry to edit.'));
        }
        if (isEditingJournal && editingJournalBlocked) {
            return alert(tr('لا يمكن تعديل قيد معكوس محاسبيًا.', 'Reversed journal entries cannot be edited.'));
        }
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

        const voucherId = isEditingJournal ? initialJournalId! : journalReference;

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

        if (isEditingJournal) {
            for (const existingLine of editingJournalTransactions) {
                const deleteResult = deleteTransaction(existingLine.id);
                if (!deleteResult.ok) {
                    return alert(deleteResult.message || tr('تعذر حذف القيد السابق قبل التحديث.', 'Failed to delete old entry lines before update.'));
                }
            }
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

        alert(tr(
            isEditingJournal ? 'تم تحديث القيد وترحيله بنجاح' : 'تم ترحيل القيد بنجاح',
            isEditingJournal ? 'Journal entry updated and posted successfully' : 'Journal entry posted successfully'
        ));
        onSuccess();
    };

    const exportableJournalLines = useMemo(
        () => lines.filter(line =>
            !!line.accountId
            || (parseFloat(line.debit) || 0) > 0
            || (parseFloat(line.credit) || 0) > 0
            || !!String(line.description || '').trim()
        ),
        [lines]
    );

    const buildJournalShareText = () => {
        const lineItems = exportableJournalLines.length > 0
            ? exportableJournalLines.map((line, index) => {
                const accountLabel = line.accountId
                    ? displayAccountName(accountMap.get(line.accountId) || null)
                    : tr('غير محدد', 'Not set');
                const debit = parseFloat(line.debit) || 0;
                const credit = parseFloat(line.credit) || 0;
                const direction = debit > 0 ? tr('مدين', 'Debit') : tr('دائن', 'Credit');
                const amount = debit > 0 ? debit : credit;
                return `${index + 1}. ${accountLabel} - ${direction} ${amount.toLocaleString()} ${sharedState.currency}`;
            })
            : [tr('لا توجد أسطر قيود بعد.', 'No journal lines yet.')];

        return [
            tr('قيد يومية', 'Journal Entry'),
            `${tr('التاريخ', 'Date')}: ${sharedState.date}`,
            `${tr('العملة', 'Currency')}: ${sharedState.currency}`,
            `${tr('سعر الصرف', 'Exchange Rate')}: ${sharedState.rate}`,
            '',
            ...lineItems,
            '',
            `${tr('إجمالي المدين', 'Total Debit')}: ${totals.totalDebit.toLocaleString()}`,
            `${tr('إجمالي الدائن', 'Total Credit')}: ${totals.totalCredit.toLocaleString()}`
        ].join('\n');
    };

    const handleDownloadJournalExcel = () => {
        const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const header = [
            tr('رقم السطر', 'Line No'),
            tr('الحساب', 'Account'),
            tr('مدين', 'Debit'),
            tr('دائن', 'Credit'),
            tr('البيان', 'Description'),
            tr('التاريخ', 'Date'),
            tr('العملة', 'Currency'),
            tr('سعر الصرف', 'Exchange Rate')
        ];
        const rows = exportableJournalLines.length > 0
            ? exportableJournalLines.map((line, index) => {
                const accountLabel = line.accountId
                    ? displayAccountName(accountMap.get(line.accountId) || null)
                    : '';
                return [
                    index + 1,
                    accountLabel,
                    parseFloat(line.debit) || 0,
                    parseFloat(line.credit) || 0,
                    line.description || '',
                    sharedState.date,
                    sharedState.currency,
                    sharedState.rate
                ];
            })
            : [[1, '', 0, 0, '', sharedState.date, sharedState.currency, sharedState.rate]];
        const csv = '\uFEFF' + [header, ...rows].map(cols => cols.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `journal-${sharedState.date || Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const handleShareJournal = async () => {
        const text = buildJournalShareText();
        setShowJournalActions(false);
        if (navigator.share) {
            try {
                await navigator.share({ title: tr('قيد يومية', 'Journal Entry'), text });
                return;
            } catch (error) {
                if ((error as DOMException)?.name === 'AbortError') return;
            }
        }
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert(tr('تم نسخ بيانات القيد إلى الحافظة.', 'Journal details copied to clipboard.'));
                return;
            } catch {
                // Fall through to prompt.
            }
        }
        window.prompt(tr('انسخ بيانات القيد التالية', 'Copy journal details below'), text);
    };

    const handleShareJournalWhatsApp = () => {
        setShowJournalActions(false);
        window.open(`https://wa.me/?text=${encodeURIComponent(buildJournalShareText())}`, '_blank');
    };

    const handleShareJournalSms = () => {
        setShowJournalActions(false);
        window.open(`sms:?&body=${encodeURIComponent(buildJournalShareText())}`, '_blank');
    };

    const isBalanced = Math.abs(totals.diff) <= 0.01;

    return (
        <div
            className="transaction-mobile-form transaction-screen-with-submit-dock w-full max-w-full space-y-2.5 safe-pb-dock-lg overflow-x-hidden"
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
            data-testid="journal-form-root"
        >
            {amountNotice && (
                <div className="sticky top-2 z-20 mx-1 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                    {amountNotice}
                </div>
            )}
            {/* Render Lines */}
            <div className="transaction-entry-section bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-2 px-1">
                    <h3 className="font-black text-gray-800">{tr('أطراف القيد', 'Entry Lines')}</h3>
                    <div className="relative flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setShowJournalActions(prev => !prev)}
                            className="w-9 h-9 bg-white border border-gray-200 text-gray-500 rounded-xl flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            title={tr('إجراءات إضافية', 'More Actions')}
                        >
                            <MoreVertical size={16} />
                        </button>
                        <button data-testid="journal-add-line-action" onClick={handleAddLine} className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Plus size={16} /></button>
                        {showJournalActions && (
                            <>
                                <button
                                    type="button"
                                    className="fixed inset-0 z-[180] cursor-default bg-transparent"
                                    onClick={() => setShowJournalActions(false)}
                                    aria-label={tr('إغلاق القائمة', 'Close menu')}
                                />
                                <div className={`absolute top-full z-[190] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl ${isEnglish ? 'right-0' : 'left-0'}`}>
                                    <button type="button" onClick={() => { setShowJournalActions(false); handleDownloadJournalExcel(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                        <FileSpreadsheet size={16} />
                                        {tr('إكسل', 'Excel')}
                                    </button>
                                    <button type="button" onClick={() => void handleShareJournal()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                        <Share2 size={16} />
                                        {tr('مشاركة', 'Share')}
                                    </button>
                                    <button type="button" onClick={handleShareJournalSms} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                        <MessageSquareText size={16} />
                                        {tr('إشعار رسالة', 'SMS')}
                                    </button>
                                    <button type="button" onClick={handleShareJournalWhatsApp} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50">
                                        <MessageCircle size={16} />
                                        {tr('إشعار واتساب', 'WhatsApp')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div className="space-y-3">
                    {lines.map((line, idx) => (
                        <div key={line.id} className="transaction-line-card p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-2" data-testid={`journal-line-${idx + 1}`}>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-w-0">
                                                                <SearchableAccountSelect
                                    accounts={postingAccounts}
                                    selectedId={line.accountId}
                                    onSelect={(nextId) => handleUpdateLine(line.id, 'accountId', nextId)}
                                    displayAccountName={displayAccountName}
                                    placeholder={tr('اختر الحساب أو ابحث...', 'Select or search account...')}
                                    emptyLabel={tr('لا يوجد حساب مطابق.', 'No matching account found.')}
                                    isEnglish={isEnglish}
                                    className="w-full min-w-0"
                                    inputTestId={`journal-line-${idx + 1}-account`}
                                    inputClassName="w-full min-w-0 h-10 px-3 bg-white rounded-xl text-xs font-bold outline-none border border-slate-200"
                                />
                                <button data-testid={`journal-line-${idx + 1}-remove`} onClick={() => handleRemoveLine(line.id)} className="text-rose-400 p-2 rounded-xl"><Trash2 size={16} /></button>
                            </div>
                            <div className="journal-line-grid journal-line-grid--compact grid gap-2 min-w-0">
                                <label className="min-w-0">
                                    <span className="mb-1 block px-1 text-[10px] font-black text-emerald-600">{tr('مدين', 'Debit')}</span>
                                    <input data-testid={`journal-line-${idx + 1}-debit`} placeholder={tr('مدين', 'Debit')} type="number" inputMode="decimal" value={line.debit} onChange={e => handleUpdateLine(line.id, 'debit', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className="w-full h-10 px-2 bg-white rounded-xl text-xs font-black text-center outline-none text-emerald-600 dir-ltr" disabled={!!line.credit} />
                                </label>
                                <label className="min-w-0">
                                    <span className="mb-1 block px-1 text-[10px] font-black text-rose-600">{tr('دائن', 'Credit')}</span>
                                    <input data-testid={`journal-line-${idx + 1}-credit`} placeholder={tr('دائن', 'Credit')} type="number" inputMode="decimal" value={line.credit} onChange={e => handleUpdateLine(line.id, 'credit', e.target.value)} onBlur={e => notifyAmountAdded(e.target.value)} className="w-full h-10 px-2 bg-white rounded-xl text-xs font-black text-center outline-none text-rose-600 dir-ltr" disabled={!!line.debit} />
                                </label>
                                <label className="min-w-0 journal-line-description-field">
                                    <span className="mb-1 block px-1 text-[10px] font-black text-slate-400">{tr('شرح مبسط', 'Description')}</span>
                                    <input data-testid={`journal-line-${idx + 1}-description`} placeholder={tr('شرح مبسط', 'Description')} value={line.description} onChange={e => handleUpdateLine(line.id, 'description', e.target.value)} className="w-full h-10 px-3 bg-white rounded-xl text-xs font-bold outline-none" />
                                </label>
                            </div>

                            {(() => {
                                const { isExpenseAccount, canSplitTax } = getLinePurchaseTaxState(line);
                                if (!isExpenseAccount && !line.splitPurchaseTax) return null;
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

            <div className="journal-submit-panel mx-auto hidden space-y-3 rounded-[1.8rem] border border-white/5 bg-slate-900/98 p-4 text-white shadow-2xl backdrop-blur md:sticky md:block sm:rounded-[2.2rem] sm:p-5 keyboard-aware-sticky z-30">
                <div className="transaction-submit-panel-details">
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
                </div>
                <button
                    data-testid="journal-submit-action"
                    onClick={handleSubmit}
                    className={`hidden w-full min-h-[54px] sm:min-h-[58px] py-3 rounded-2xl font-black text-base shadow-lg active:scale-[0.99] transition-all md:block ${isBalanced && totals.totalDebit > 0
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-700 text-slate-300'
                        }`}
                >
                    {tr(
                        isEditingJournal ? 'تحديث وترحيل القيد' : 'ترحيل القيد',
                        isEditingJournal ? 'Update & Post Journal Entry' : 'Post Journal Entry'
                    )}
                </button>
            </div>
            <MobileSubmitDock
                label={tr(
                    isEditingJournal ? 'تحديث وترحيل القيد' : 'ترحيل القيد',
                    isEditingJournal ? 'Update & Post Journal Entry' : 'Post Journal Entry'
                )}
                onClick={() => void handleSubmit()}
                disabled={!(isBalanced && totals.totalDebit > 0)}
                summary={
                    <div className="transaction-submit-panel-details">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-white/5 p-2">
                                <div className="text-[10px] font-black text-emerald-300">{tr('إجمالي مدين', 'Total Debit')}</div>
                                <div className="text-sm font-black text-emerald-200 dir-ltr">{totals.totalDebit.toLocaleString()}</div>
                            </div>
                            <div className="rounded-xl bg-white/5 p-2">
                                <div className="text-[10px] font-black text-rose-300">{tr('إجمالي دائن', 'Total Credit')}</div>
                                <div className="text-sm font-black text-rose-200 dir-ltr">{totals.totalCredit.toLocaleString()}</div>
                            </div>
                            <div className={`rounded-xl p-2 ${isBalanced ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                                <div className={`text-[10px] font-black ${isBalanced ? 'text-emerald-200' : 'text-amber-200'}`}>{tr('الفرق', 'Difference')}</div>
                                <div className={`text-sm font-black dir-ltr ${isBalanced ? 'text-emerald-100' : 'text-amber-100'}`}>{totals.diff.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                }
                panelClassName="border-white/5 bg-slate-900/98 text-white shadow-2xl"
                buttonClassName={isBalanced && totals.totalDebit > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-slate-700 text-slate-300'}
            />
        </div>
    );
};

const TransactionForm: React.FC<TransactionFormProps> = ({ initialMode, initialVoucherType, initialCategory, initialLinkedInvoiceId, initialInvoiceId, initialVoucherId, initialDraft, onBack }) => {
    const { companySettings, currencies, baseCurrency, invoices, transactions } = useAccounting();
    const [mode, setMode] = useState<TransactionTabType>(initialMode);
    const [activeInvoiceDraft, setActiveInvoiceDraft] = useState<InvoiceFormDraftState | undefined>(initialDraft);
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
    const [currentVoucherType, setCurrentVoucherType] = useState<'RECEIPT' | 'PAYMENT'>(initialVoucherType || 'RECEIPT');
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
    const [outerHeaderActionsContainer, setOuterHeaderActionsContainer] = useState<HTMLDivElement | null>(null);
    const [isOuterExchangeRateEditorOpen, setIsOuterExchangeRateEditorOpen] = useState(false);
    const outerExchangeRateEditorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!currencyOptions.some(c => c.code === sharedState.currency)) {
            setSharedState(prev => ({ ...prev, currency: baseCurrency, rate: getRateForCurrency(baseCurrency) }));
        }
    }, [currencyOptions, sharedState.currency, baseCurrency]);

    const handleCurrencyChange = (code: string) => {
        setSharedState(prev => ({ ...prev, currency: code, rate: getRateForCurrency(code) }));
    };

    const journalExchangeRateLabel = useMemo(
        () => Number(sharedState.rate || 1).toLocaleString('en-US', {
            minimumFractionDigits: sharedState.currency === baseCurrency ? 0 : 2,
            maximumFractionDigits: 6
        }),
        [sharedState.rate, sharedState.currency, baseCurrency]
    );

    useEffect(() => {
        if (!isOuterExchangeRateEditorOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!outerExchangeRateEditorRef.current?.contains(event.target as Node)) {
                setIsOuterExchangeRateEditorOpen(false);
            }
        };
        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOuterExchangeRateEditorOpen]);

    useEffect(() => {
        if (sharedState.currency === baseCurrency) {
            setIsOuterExchangeRateEditorOpen(false);
        }
    }, [sharedState.currency, baseCurrency]);

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

    useEffect(() => {
        if (editingVoucherLead) {
            setCurrentVoucherType(editingVoucherLead.type === TransactionType.EXPENSE ? 'PAYMENT' : 'RECEIPT');
            return;
        }
        setCurrentVoucherType(initialVoucherType || 'RECEIPT');
    }, [editingVoucherLead, initialVoucherType]);

    useEffect(() => {
        setActiveInvoiceDraft(initialDraft);
    }, [initialDraft]);

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
                return currentVoucherType === 'PAYMENT'
                    ? tr('سند صرف', 'Payment Voucher')
                    : tr('سند قبض', 'Receipt Voucher');
            case 'IMPORT_EXPENSES': return tr('مصاريف استيراد', 'Import Expenses');
            case 'JOURNAL': return tr('قيد يومية', 'Journal Entry');
            default: return tr('عملية جديدة', 'New Transaction');
        }
        })();
        return isEditing ? `${tr('تعديل', 'Edit')} ${baseTitle}` : baseTitle;
    }, [mode, currentVoucherType, isEnglish, isEditing]);

    const handleFlowSuccess = () => {
        setActiveInvoiceDraft(undefined);
        setMode(initialMode);
        onBack();
    };

    const isEntryDateLocked = mode === 'JOURNAL' && !allowEditEntryDate;
    const devUiMarker = import.meta.env.DEV ? 'UI-2026-03-08' : '';
    const usesOuterHeader = mode === 'JOURNAL' || mode === 'VOUCHERS';

    return (
        <div
            className="app-page transaction-entry-page transaction-mobile-form w-full max-w-full px-3 sm:px-4 safe-pt safe-pb space-y-4 overflow-x-hidden"
            onKeyDown={focusNextFieldOnEnter}
            data-entry-form="true"
        >
            {usesOuterHeader && (
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
                    {mode === 'VOUCHERS' ? (
                        <div
                            ref={setOuterHeaderActionsContainer}
                            className="min-w-[108px] sm:min-w-[120px] shrink-0 flex items-center justify-start"
                        />
                    ) : (
                        <div className="w-[64px] sm:w-[78px] shrink-0" />
                    )}
                </div>
                <div className="mt-2">
                    <div className="header-fields-grid header-fields-grid--journal-inline-rate grid grid-cols-2 gap-2 items-start">
                        <div className="min-w-0">
                            <label className="block truncate text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5 leading-tight">
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
                        <div className="min-w-0">
                            <label className="block truncate text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5 leading-tight">
                                {tr('العملة', 'Currency')}
                            </label>
                            <div ref={outerExchangeRateEditorRef} className="relative">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="relative min-w-0 flex-1">
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
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (sharedState.currency === baseCurrency) return;
                                            setIsOuterExchangeRateEditorOpen(prev => !prev);
                                        }}
                                        disabled={sharedState.currency === baseCurrency}
                                        className={`relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition-all ${
                                            sharedState.currency === baseCurrency
                                                ? 'border-gray-200 bg-gray-50 text-gray-300'
                                                : isOuterExchangeRateEditorOpen
                                                    ? 'border-blue-200 bg-blue-50 text-blue-600 shadow-sm'
                                                    : 'border-gray-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600'
                                        }`}
                                        aria-label={`${tr('سعر الصرف', 'Exchange rate')}: ${journalExchangeRateLabel} (${tr('مقابل', 'vs')} ${baseCurrency})`}
                                        aria-expanded={isOuterExchangeRateEditorOpen}
                                        title={`${tr('سعر الصرف', 'Exchange rate')}: ${journalExchangeRateLabel}`}
                                    >
                                        <ArrowRightLeft size={15} />
                                        {sharedState.currency !== baseCurrency && (
                                            <span className="absolute -top-1.5 -right-1.5 min-w-[1.4rem] rounded-full bg-slate-900 px-1.5 py-0.5 text-[8px] font-black leading-none text-white dir-ltr">
                                                {journalExchangeRateLabel}
                                            </span>
                                        )}
                                    </button>
                                </div>
                                {isOuterExchangeRateEditorOpen && sharedState.currency !== baseCurrency && (
                                    <div className="absolute top-full left-0 right-0 z-20 mt-2 rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                                        <label className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <span>{tr('سعر الصرف', 'Exchange Rate')}</span>
                                            <span className="dir-ltr text-blue-600">{baseCurrency}</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                inputMode="decimal"
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
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter' || event.key === 'Escape') {
                                                        setIsOuterExchangeRateEditorOpen(false);
                                                    }
                                                }}
                                                autoFocus
                                                className="w-full py-2.5 pl-9 pr-3 bg-white border border-gray-200 rounded-xl text-xs font-black text-slate-700 outline-none focus:ring-4 ring-blue-50 dir-ltr"
                                                aria-label={`${tr('سعر الصرف', 'Exchange rate')} (${tr('مقابل', 'vs')} ${baseCurrency})`}
                                            />
                                            <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={14} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            )}

            {mode === 'JOURNAL' ? (
                <JournalScreen
                    sharedState={sharedState}
                    onSuccess={handleFlowSuccess}
                    initialJournalId={initialVoucherId}
                />
            ) : mode === 'VOUCHERS' ? (
                <VoucherScreen
                    initialType={initialVoucherType || 'RECEIPT'}
                    sharedState={sharedState}
                    updateCurrency={handleCurrencyChange}
                    onSuccess={handleFlowSuccess}
                    initialVoucherId={initialVoucherId}
                    outerHeaderActionsContainer={outerHeaderActionsContainer}
                    onVoucherTypeChange={setCurrentVoucherType}
                />
            ) : (
                <InvoiceScreen
                    key={`${mode}:${initialInvoiceId || 'new'}`}
                    mode={mode as any}
                    sharedState={sharedState}
                    onDateChange={value => setSharedState(prev => ({ ...prev, date: value }))}
                    onCurrencyChange={handleCurrencyChange}
                    onRateChange={value => setSharedState(prev => ({ ...prev, rate: value }))}
                    onModeChange={(nextMode, draft) => {
                        setActiveInvoiceDraft(draft);
                        setMode(nextMode);
                    }}
                    onSuccess={handleFlowSuccess}
                    onBack={onBack}
                    linkedInvoiceId={initialLinkedInvoiceId}
                    initialInvoiceId={initialInvoiceId}
                    initialDraft={activeInvoiceDraft}
                />
            )}
        </div>
    );
};

export default TransactionForm;








