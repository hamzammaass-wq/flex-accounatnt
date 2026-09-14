import { describe, expect, it } from 'vitest';
import { Contact, Product } from '../../types';
import { resolveInvoiceProductUnitPrice } from '../../utils/invoicePricing';

const product: Product = {
  id: 'p1',
  name: 'Item 1',
  buyPrice: 100,
  sellPrice: 150,
  wholesalePrice: 130,
  retailPrice: 150,
  stock: 10
};

describe('resolveInvoiceProductUnitPrice', () => {
  it('uses retail price by default in sales mode', () => {
    expect(resolveInvoiceProductUnitPrice(product, { salesMode: true })).toBe(150);
  });

  it('uses cost price by default outside sales mode', () => {
    expect(resolveInvoiceProductUnitPrice(product, { salesMode: false })).toBe(100);
  });

  it('respects customer preferred wholesale price', () => {
    const contact: Contact = {
      id: 'c1',
      name: 'Customer 1',
      type: 'CUSTOMER',
      preferredPriceTier: 'WHOLESALE'
    };
    expect(resolveInvoiceProductUnitPrice(product, { contact, salesMode: true })).toBe(130);
  });

  it('ignores supplier sales tiers and uses cost price', () => {
    const contact: Contact = {
      id: 's1',
      name: 'Supplier 1',
      type: 'SUPPLIER',
      preferredPriceTier: 'RETAIL'
    };
    expect(resolveInvoiceProductUnitPrice(product, { contact, salesMode: false })).toBe(100);
  });
});
