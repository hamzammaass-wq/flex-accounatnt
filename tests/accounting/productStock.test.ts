import { describe, expect, it } from 'vitest';
import { Product, Warehouse } from '../../types';

// The exact logic implemented in AccountingContext.tsx for testing
const roundToFour = (value: number): number => Number((Number(value) || 0).toFixed(4));

const alignProductWarehouseStock = (
  product: Product,
  warehouses: Warehouse[]
): Product => {
  if (product.kind === 'SERVICE') {
    return {
      ...product,
      stock: 0,
      warehouseStock: []
    };
  }

  const stockVal = Number(product.stock) || 0;
  const mainWh = warehouses.find(w => w.isMain) || warehouses[0] || { id: 'wh_main' };
  const mainWhId = mainWh.id;

  const currentWHStock = product.warehouseStock || [];

  if (currentWHStock.length === 0) {
    return {
      ...product,
      warehouseStock: [{ warehouseId: mainWhId, quantity: stockVal }]
    };
  }

  const currentSum = currentWHStock.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
  const diff = stockVal - currentSum;

  if (Math.abs(diff) < 0.0001) {
    return product;
  }

  const nextWHStock = [...currentWHStock];
  const mainIndex = nextWHStock.findIndex(entry => entry.warehouseId === mainWhId);
  if (mainIndex >= 0) {
    nextWHStock[mainIndex] = {
      ...nextWHStock[mainIndex],
      quantity: roundToFour((Number(nextWHStock[mainIndex].quantity) || 0) + diff)
    };
  } else {
    nextWHStock.push({
      warehouseId: mainWhId,
      quantity: roundToFour(diff)
    });
  }

  return {
    ...product,
    warehouseStock: nextWHStock
  };
};

describe('Product Warehouse Stock Alignment', () => {
  const warehouses: Warehouse[] = [
    { id: 'wh_main', name: 'المستودع الرئيسي', isMain: true }
  ];

  it('initializes warehouseStock if empty', () => {
    const product: Product = {
      id: 'p_1',
      name: 'Product 1',
      kind: 'STOCK',
      buyPrice: 10,
      sellPrice: 20,
      stock: 10,
      warehouseStock: []
    };

    const aligned = alignProductWarehouseStock(product, warehouses);
    expect(aligned.warehouseStock).toEqual([{ warehouseId: 'wh_main', quantity: 10 }]);
  });

  it('does nothing if warehouseStock is already aligned', () => {
    const product: Product = {
      id: 'p_1',
      name: 'Product 1',
      kind: 'STOCK',
      buyPrice: 10,
      sellPrice: 20,
      stock: 10,
      warehouseStock: [{ warehouseId: 'wh_main', quantity: 10 }]
    };

    const aligned = alignProductWarehouseStock(product, warehouses);
    expect(aligned).toBe(product);
  });

  it('adjusts main warehouse stock by difference when stock value changes', () => {
    const product: Product = {
      id: 'p_1',
      name: 'Product 1',
      kind: 'STOCK',
      buyPrice: 10,
      sellPrice: 20,
      stock: 15,
      warehouseStock: [{ warehouseId: 'wh_main', quantity: 10 }]
    };

    const aligned = alignProductWarehouseStock(product, warehouses);
    expect(aligned.warehouseStock).toEqual([{ warehouseId: 'wh_main', quantity: 15 }]);
  });

  it('handles multiple warehouses and adjusts the difference in main warehouse', () => {
    const warehouses2: Warehouse[] = [
      { id: 'wh_main', name: 'المستودع الرئيسي', isMain: true },
      { id: 'wh_secondary', name: 'المستودع الثانوي', isMain: false }
    ];

    const product: Product = {
      id: 'p_1',
      name: 'Product 1',
      kind: 'STOCK',
      buyPrice: 10,
      sellPrice: 20,
      stock: 20,
      warehouseStock: [
        { warehouseId: 'wh_secondary', quantity: 5 }
      ]
    };

    const aligned = alignProductWarehouseStock(product, warehouses2);
    expect(aligned.warehouseStock).toEqual([
      { warehouseId: 'wh_secondary', quantity: 5 },
      { warehouseId: 'wh_main', quantity: 15 }
    ]);
  });
});
