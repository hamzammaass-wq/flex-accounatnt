import type { ItemCodeMode, Product } from '../types';
import { toEnglishDigits } from './forceEnglishDigits';

export const ITEM_CODE_PREFIX = 'ITM-';

export const normalizeItemCode = (value: string): string =>
  toEnglishDigits(String(value || '').trim()).toUpperCase();

export const resolveProductItemCodeMode = (
  product?: Pick<Product, 'itemCode' | 'itemCodeMode'> | null
): ItemCodeMode =>
  product?.itemCodeMode === 'MANUAL' && !!normalizeItemCode(product.itemCode || '')
    ? 'MANUAL'
    : 'AUTO';

export const buildNextItemCode = (products: Product[], excludeId?: string): string => {
  let maxSequence = 0;

  products.forEach((product) => {
    if (excludeId && product.id === excludeId) return;

    const normalized = normalizeItemCode(product.itemCode || '');
    const matched = normalized.match(/(?:^ITM-)?(\d+)$/);
    if (!matched) return;

    const sequence = Number(matched[1]);
    if (Number.isFinite(sequence)) {
      maxSequence = Math.max(maxSequence, sequence);
    }
  });

  return `${ITEM_CODE_PREFIX}${String(maxSequence + 1).padStart(3, '0')}`;
};
