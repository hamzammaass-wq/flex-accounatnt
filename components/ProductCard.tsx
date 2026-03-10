import React, { useMemo } from 'react';
import { useAccounting } from '../contexts/AccountingContext';
import { Product, TransactionType } from '../types';
import { X, Package, ShoppingBag, ScrollText, Calendar, History, ScanBarcode, Hash, Printer } from 'lucide-react';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayProductName, getDisplayUnitName } from '../utils/displayNames';
import { loadBarcodeReaderSettings } from '../utils/barcodeSettings';
import { printProductBarcodeLabel } from '../utils/barcodeLabelPrint';
import { resolveProductPricing } from '../utils/productPricing';

interface ProductCardProps {
    productId: string;
    onClose: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ productId, onClose }) => {
    const { products, invoices, transactions, units, companySettings, currentCompanyId, baseCurrency } = useAccounting();
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);

    const displayProductName = (value?: { id: string; name: string } | null) =>
        getDisplayProductName(value || undefined, isEnglish);
    const displayUnitName = (value?: { id: string; name: string } | null) =>
        getDisplayUnitName(value || undefined, isEnglish);

    const product = products.find(p => p.id === productId);
    const unit = units.find(u => u.id === product?.unitId);
    const globalLowStockThreshold = Number.isFinite(Number(companySettings.lowStockAlertQtyDefault))
        ? Math.max(0, Number(companySettings.lowStockAlertQtyDefault))
        : 5;
    const lowStockThreshold = product && Number.isFinite(Number(product.lowStockAlertQty))
        ? Math.max(0, Number(product.lowStockAlertQty))
        : globalLowStockThreshold;
    const isLowStock = !!product && product.stock <= lowStockThreshold;
    const barcodePrintSettings = useMemo(() => loadBarcodeReaderSettings(currentCompanyId), [currentCompanyId]);

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(isEnglish ? 'en-GB' : 'ar-EG-u-nu-latn');
    };

    const productHistory = useMemo(() => {
        if (!product) return [];

        const history: Array<{
            date: string;
            description: string;
            type: TransactionType;
            quantity: number;
            price: number;
            total: number;
            id: string;
            category: 'SALES' | 'PURCHASE' | 'IMPORT';
        }> = [];

        invoices.forEach(inv => {
            const item = inv.items.find(i => i.productId === productId);
            if (!item) return;

            history.push({
                date: inv.date,
                description: inv.type === TransactionType.INCOME
                    ? `${tr('بيع', 'Sale')} - ${tr('فاتورة', 'Invoice')} #${inv.invoiceNumber}`
                    : `${tr('شراء', 'Purchase')} - ${tr('فاتورة', 'Invoice')} #${inv.invoiceNumber}`,
                type: inv.type,
                quantity: item.quantity,
                price: item.unitPrice,
                total: item.total,
                id: inv.id,
                category: inv.type === TransactionType.INCOME ? 'SALES' : 'PURCHASE'
            });
        });

        transactions.forEach(t => {
            if (t.category === 'import_expenses' && t.description.includes(product.name)) {
                history.push({
                    date: t.date,
                    description: t.description,
                    type: TransactionType.EXPENSE,
                    quantity: 0,
                    price: t.amount,
                    total: t.amount,
                    id: t.id,
                    category: 'IMPORT'
                });
            }
        });

        return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [productId, invoices, transactions, product, isEnglish]);

    if (!product) return null;

    const pricing = resolveProductPricing(product);
    const unitLabel = unit ? `${displayUnitName(unit)} (${unit.code})` : '';
    const handlePrintLabel = () => {
        printProductBarcodeLabel({ product, settings: barcodePrintSettings, companyId: currentCompanyId, currency: baseCurrency, isEnglish });
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            variant="fullscreen"
            zIndexClassName="z-[300]"
            backdropClassName="bg-slate-900/95 backdrop-blur-md"
            panelClassName="bg-white w-full h-full shadow-2xl flex flex-col overflow-hidden"
            closeOnBackdrop={false}
            showHandle={false}
        >
            <div className="font-tajawal h-full flex flex-col" dir={isEnglish ? 'ltr' : 'rtl'}>
                <div className="bg-slate-900 px-4 pt-5 pb-4 text-white relative shrink-0">
                    <div className="absolute left-3 top-3 flex items-center gap-1 z-20">
                        <button onClick={handlePrintLabel} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-all" title={tr('طباعة باركود', 'Print barcode')}>
                            <Printer size={16} />
                        </button>
                        <button onClick={onClose} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={18} /></button>
                    </div>
                    <div className="relative z-10">
                        {product.imageUrl && (
                            <div className="mb-3 h-28 rounded-2xl overflow-hidden border border-white/10">
                                <img src={product.imageUrl} alt={displayProductName(product)} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shrink-0"><Package size={20} /></div>
                            <h2 className="text-base font-black truncate">{displayProductName(product)}</h2>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {product.itemCode && (
                                <div className="flex items-center gap-1.5 text-white/70 text-[9px] font-black bg-white/10 w-fit px-2.5 py-1 rounded-lg border border-white/10">
                                    <Hash size={12} />
                                    <span className="tracking-widest font-mono">{product.itemCode}</span>
                                </div>
                            )}
                            {product.barcode && (
                                <div className="flex items-center gap-1.5 text-white/70 text-[9px] font-black bg-white/10 w-fit px-2.5 py-1 rounded-lg border border-white/10">
                                    <ScanBarcode size={12} />
                                    <span className="tracking-widest font-mono">{product.barcode}</span>
                                </div>
                            )}
                            {product.expiryPeriodDays && (
                                <div className="flex items-center gap-1.5 text-white/70 text-[9px] font-black bg-white/10 w-fit px-2.5 py-1 rounded-lg border border-white/10">
                                    <Calendar size={12} />
                                    <span>{product.expiryPeriodDays}{tr(' يوم صلاحية', 'd shelf life')}</span>
                                </div>
                            )}
                            {product.expiryDate && (
                                <div className="flex items-center gap-1.5 text-white/70 text-[9px] font-black bg-white/10 w-fit px-2.5 py-1 rounded-lg border border-white/10">
                                    <Calendar size={12} />
                                    <span className="tracking-widest font-mono">{formatDate(product.expiryDate)}</span>
                                </div>
                            )}
                            {product.expiryAlertLeadDays && (
                                <div className="flex items-center gap-1.5 text-rose-100 text-[9px] font-black bg-rose-500/15 w-fit px-2.5 py-1 rounded-lg border border-rose-300/20">
                                    <Calendar size={12} />
                                    <span>{tr('تنبيه قبل', 'Alert before')} {product.expiryAlertLeadDays}{tr(' يوم', 'd')}</span>
                                </div>
                            )}
                            {lowStockThreshold !== null && (
                                <div className={`flex items-center gap-1.5 text-[9px] font-black w-fit px-2.5 py-1 rounded-lg border ${isLowStock ? 'text-amber-100 bg-amber-500/20 border-amber-300/30' : 'text-white/70 bg-white/10 border-white/10'}`}>
                                    <Package size={12} />
                                    <span>{tr('حد نقص', 'Low stock')} {lowStockThreshold}</span>
                                </div>
                            )}
                            {Number.isFinite(Number(product.reorderQty)) && Number(product.reorderQty) > 0 && (
                                <div className={`flex items-center gap-1.5 text-[9px] font-black w-fit px-2.5 py-1 rounded-lg border ${isLowStock ? 'text-sky-100 bg-sky-500/20 border-sky-300/30' : 'text-white/70 bg-white/10 border-white/10'}`}>
                                    <ShoppingBag size={12} />
                                    <span>{tr('إعادة طلب', 'Reorder')} {Number(product.reorderQty)}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-2">
                            <div className="flex-1 bg-white/10 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[9px] font-black text-blue-300 uppercase block mb-0.5">{tr('الرصيد', 'Stock')}</span>
                                <span className={`text-lg font-black ${isLowStock ? 'text-amber-300' : ''}`}>
                                    {product.stock} <span className="text-[10px] text-white/50">{unitLabel}</span>
                                </span>
                            </div>
                            <div className="flex-1 bg-white/10 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[9px] font-black text-emerald-300 uppercase block mb-0.5">{tr('القيمة', 'Value')}</span>
                                <span className="text-lg font-black">{(product.stock * pricing.cost).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <h3 className="text-xs font-black text-gray-800 mb-3">{tr('قائمة أسعار الصنف', 'Item Price List')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-black">
                            <div className="bg-blue-50 text-blue-700 rounded-xl p-3 flex justify-between">
                                <span>{tr('التكلفة الصافية', 'Net Cost')}</span>
                                <span className="dir-ltr">{pricing.cost.toLocaleString()} {baseCurrency}</span>
                            </div>
                            <div className="bg-violet-50 text-violet-700 rounded-xl p-3">
                                <div className="flex justify-between mb-1">
                                    <span>{tr('سعر الجملة', 'Wholesale')}</span>
                                    <span className="dir-ltr">{pricing.wholesalePrice.toLocaleString()}</span>
                                </div>
                                <div className="text-[10px] font-bold text-violet-500">
                                    {pricing.wholesalePricingMode === 'MARKUP'
                                        ? tr(`نسبة +${pricing.wholesaleMarkupPercent}%`, `Markup +${pricing.wholesaleMarkupPercent}%`)
                                        : tr('سعر ثابت', 'Fixed price')}
                                </div>
                            </div>
                            <div className="bg-emerald-50 text-emerald-700 rounded-xl p-3">
                                <div className="flex justify-between mb-1">
                                    <span>{tr('سعر المفرق', 'Retail')}</span>
                                    <span className="dir-ltr">{pricing.retailPrice.toLocaleString()}</span>
                                </div>
                                <div className="text-[10px] font-bold text-emerald-500">
                                    {pricing.retailPricingMode === 'MARKUP'
                                        ? tr(`نسبة +${pricing.retailMarkupPercent}%`, `Markup +${pricing.retailMarkupPercent}%`)
                                        : tr('سعر ثابت', 'Fixed price')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                            <History size={14} className="text-gray-400" />
                            <h3 className="text-xs font-black text-gray-800">{tr('سجل حركة الصنف', 'Item Movement Log')}</h3>
                        </div>
                        <div className="space-y-2">
                            {productHistory.length === 0 && (
                                <div className="text-center py-10 text-slate-300">
                                    <History size={28} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-xs font-bold text-slate-400">{tr('لا توجد حركات مسجلة لهذا الصنف', 'No recorded movements for this item')}</p>
                                </div>
                            )}

                            {productHistory.map((item, idx) => (
                                <div key={`${item.id}-${idx}`} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`p-2 rounded-xl shrink-0 ${item.category === 'SALES' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                            {item.category === 'SALES' ? <ScrollText size={14} /> : <ShoppingBag size={14} />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black text-gray-800 truncate">{item.description}</p>
                                            <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Calendar size={9} /> {formatDate(item.date)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-left shrink-0">
                                        <span className={`block font-black text-xs ${item.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {item.total.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </ResponsiveDialog>
    );
};

export default ProductCard;
