import type { Product, ProductKind } from '../types';

export const getProductKind = (product?: Pick<Product, 'kind'> | null): ProductKind =>
  product?.kind === 'SERVICE' ? 'SERVICE' : 'STOCK';

export const isServiceProduct = (product?: Pick<Product, 'kind'> | null): boolean =>
  getProductKind(product) === 'SERVICE';

export const isStockProduct = (product?: Pick<Product, 'kind'> | null): boolean =>
  getProductKind(product) === 'STOCK';

export const normalizeProductInventoryFields = <T extends Partial<Product>>(product: T): T => {
  if (getProductKind(product) !== 'SERVICE') return product;
  return {
    ...product,
    stock: 0,
    warehouseStock: [],
    expiryDate: undefined,
    expiryPeriodDays: undefined,
    expiryAlertLeadDays: undefined,
    lowStockAlertQty: undefined,
    reorderQty: undefined,
    fifoLayers: []
  };
};
