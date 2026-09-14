import { Contact, Product } from '../types';
import { resolveProductPricing } from './productPricing';

type InvoicePricingOptions = {
  contact?: Contact | null;
  salesMode?: boolean;
};

export const resolveInvoiceProductUnitPrice = (
  product: Product,
  options: InvoicePricingOptions = {}
): number => {
  const pricing = resolveProductPricing(product);
  // Purchase and purchase-return lines must always start from inventory cost.
  // Customer price tiers are sales-only preferences and must never override buyPrice.
  if (!options.salesMode) return pricing.cost;

  const preferredTier = options.contact?.preferredPriceTier;
  if (preferredTier === 'WHOLESALE') return pricing.wholesalePrice;
  if (preferredTier === 'RETAIL') return pricing.retailPrice;

  return pricing.retailPrice;
};
