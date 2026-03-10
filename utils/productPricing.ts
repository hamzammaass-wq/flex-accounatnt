import { Product } from '../types';

export type PricingMode = 'FIXED' | 'MARKUP';

export interface ProductPricingSnapshot {
  cost: number;
  wholesalePrice: number;
  retailPrice: number;
  wholesalePricingMode: PricingMode;
  retailPricingMode: PricingMode;
  wholesaleMarkupPercent: number;
  retailMarkupPercent: number;
}

const round2 = (value: number): number => {
  const safe = Number.isFinite(value) ? value : 0;
  return Number(safe.toFixed(2));
};

const toPositiveNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const normalizeMode = (value: unknown): PricingMode => {
  return value === 'MARKUP' ? 'MARKUP' : 'FIXED';
};

const resolveFixedPrice = (product: Product, kind: 'WHOLESALE' | 'RETAIL'): number => {
  if (kind === 'WHOLESALE') {
    if (Number.isFinite(Number(product.wholesalePrice))) return Number(product.wholesalePrice);
    if (Number.isFinite(Number(product.sellPrice))) return Number(product.sellPrice);
    return 0;
  }
  if (Number.isFinite(Number(product.retailPrice))) return Number(product.retailPrice);
  if (Number.isFinite(Number(product.sellPrice))) return Number(product.sellPrice);
  return 0;
};

const calculatePrice = (cost: number, mode: PricingMode, markupPercent: number, fixedPrice: number): number => {
  if (mode === 'MARKUP') {
    return round2(cost * (1 + (markupPercent / 100)));
  }
  return round2(fixedPrice);
};

export const resolveProductPricing = (product: Product, costOverride?: number): ProductPricingSnapshot => {
  const cost = round2(toPositiveNumber(costOverride ?? product.buyPrice));

  const wholesalePricingMode = normalizeMode(product.wholesalePricingMode);
  const retailPricingMode = normalizeMode(product.retailPricingMode);

  const wholesaleMarkupPercent = round2(toPositiveNumber(product.wholesaleMarkupPercent));
  const retailMarkupPercent = round2(toPositiveNumber(product.retailMarkupPercent));

  const wholesaleFixedPrice = toPositiveNumber(resolveFixedPrice(product, 'WHOLESALE'));
  const retailFixedPrice = toPositiveNumber(resolveFixedPrice(product, 'RETAIL'));

  const wholesalePrice = calculatePrice(cost, wholesalePricingMode, wholesaleMarkupPercent, wholesaleFixedPrice);
  const retailPrice = calculatePrice(cost, retailPricingMode, retailMarkupPercent, retailFixedPrice);

  return {
    cost,
    wholesalePrice,
    retailPrice,
    wholesalePricingMode,
    retailPricingMode,
    wholesaleMarkupPercent,
    retailMarkupPercent
  };
};

export const buildProductPricingPatch = (product: Product, costOverride?: number): Partial<Product> => {
  const pricing = resolveProductPricing(product, costOverride);
  return {
    buyPrice: pricing.cost,
    sellPrice: pricing.retailPrice,
    wholesalePrice: pricing.wholesalePrice,
    retailPrice: pricing.retailPrice,
    wholesalePricingMode: pricing.wholesalePricingMode,
    retailPricingMode: pricing.retailPricingMode,
    wholesaleMarkupPercent: pricing.wholesaleMarkupPercent,
    retailMarkupPercent: pricing.retailMarkupPercent
  };
};

