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
  const preferredTier = options.contact?.preferredPriceTier;

  if (preferredTier === 'WHOLESALE') return pricing.wholesalePrice;
  if (preferredTier === 'RETAIL') return pricing.retailPrice;

  return options.salesMode ? pricing.retailPrice : pricing.cost;
};
