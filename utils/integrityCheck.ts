import { Account, Check, Currency, ImportExpenseDistribution, Invoice, Product, Transaction } from '../types';

export type IntegritySeverity = 'ERROR' | 'WARNING' | 'INFO';
export type IntegrityArea =
  | 'ACCOUNTS'
  | 'TRANSACTIONS'
  | 'INVOICES'
  | 'INVENTORY'
  | 'CHECKS'
  | 'IMPORT_DISTRIBUTIONS';

export interface IntegrityIssue {
  id: string;
  severity: IntegritySeverity;
  area: IntegrityArea;
  code: string;
  messageAr: string;
  messageEn: string;
  entityId?: string;
  entityLabel?: string;
  fixable?: boolean;
}

export interface IntegrityReport {
  generatedAt: string;
  issues: IntegrityIssue[];
  counts: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
    fixable: number;
  };
  metrics: {
    inventoryLedgerValueApprox: number;
    inventoryStockValueApprox: number;
    inventoryValueDiffApprox: number;
    inventoryQtyDiffProducts: number;
  };
}

export interface IntegrityCheckInput {
  accounts: Account[];
  transactions: Transaction[];
  invoices: Invoice[];
  products: Product[];
  checks: Check[];
  currencies: Currency[];
  baseCurrency: string;
  importExpenseDistributions: ImportExpenseDistribution[];
}

export interface IntegritySafeFixResult {
  transactions: Transaction[];
  invoices: Invoice[];
  products: Product[];
  importExpenseDistributions: ImportExpenseDistribution[];
  checkCurrencyPatches: Array<{ id: string; currency: string }>;
  counts: {
    transactionCurrencyFixed: number;
    transactionRateFixed: number;
    invoiceCurrencyFixed: number;
    invoiceRateFixed: number;
    productStockFromWarehouseFixed: number;
    importDistributionCurrencyFixed: number;
    importDistributionRateFixed: number;
    importDistributionHeaderFixed: number;
    importDistributionLineLandedFixed: number;
    importDistributionTotalFixed: number;
    checkCurrencyFixed: number;
    totalChanges: number;
  };
}

const EPS = 0.01;

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nearlyEqual = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;

const looksLikeIsoDate = (value?: string) => {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const runIntegrityCheck = (input: IntegrityCheckInput): IntegrityReport => {
  const {
    accounts,
    transactions,
    invoices,
    products,
    checks,
    currencies,
    baseCurrency,
    importExpenseDistributions
  } = input;

  const issues: IntegrityIssue[] = [];
  let seq = 0;
  const add = (issue: Omit<IntegrityIssue, 'id'>) => {
    issues.push({ ...issue, id: `integrity_${seq++}` });
  };

  const currencyCodes = new Set([baseCurrency, ...currencies.map(c => c.code)]);
  const accountsById = new Map(accounts.map(a => [a.id, a]));
  const invoicesById = new Map(invoices.map(i => [i.id, i]));
  const productsById = new Map(products.map(p => [p.id, p]));

  // Accounts
  const seenCodes = new Map<string, string>();
  for (const acc of accounts) {
    if (!acc.id || !acc.code || !acc.name) {
      add({
        severity: 'ERROR',
        area: 'ACCOUNTS',
        code: 'ACCOUNT_REQUIRED_FIELDS',
        messageAr: 'حساب يحتوي على بيانات أساسية ناقصة (معرف/رمز/اسم).',
        messageEn: 'Account has missing required fields (id/code/name).',
        entityId: acc.id,
        entityLabel: acc.name || acc.code
      });
    }
    if (acc.parentId && !accountsById.has(acc.parentId)) {
      add({
        severity: 'ERROR',
        area: 'ACCOUNTS',
        code: 'ACCOUNT_MISSING_PARENT',
        messageAr: 'حساب مرتبط بأب مفقود في شجرة الحسابات.',
        messageEn: 'Account references a missing parent in chart of accounts.',
        entityId: acc.id,
        entityLabel: acc.name
      });
    }
    if (acc.parentId === acc.id) {
      add({
        severity: 'ERROR',
        area: 'ACCOUNTS',
        code: 'ACCOUNT_SELF_PARENT',
        messageAr: 'الحساب مرتبط بنفسه كحساب أب.',
        messageEn: 'Account references itself as parent.',
        entityId: acc.id,
        entityLabel: acc.name
      });
    }
    if (!currencyCodes.has(acc.currency)) {
      add({
        severity: 'WARNING',
        area: 'ACCOUNTS',
        code: 'ACCOUNT_INVALID_CURRENCY',
        messageAr: 'عملة الحساب غير موجودة ضمن العملات المعرفة.',
        messageEn: 'Account currency is not defined in currencies list.',
        entityId: acc.id,
        entityLabel: `${acc.name} (${acc.currency})`
      });
    }
    const codeKey = acc.code.trim();
    if (seenCodes.has(codeKey) && seenCodes.get(codeKey) !== acc.id) {
      add({
        severity: 'ERROR',
        area: 'ACCOUNTS',
        code: 'ACCOUNT_DUPLICATE_CODE',
        messageAr: 'يوجد تكرار في رمز الحساب.',
        messageEn: 'Duplicate account code detected.',
        entityId: acc.id,
        entityLabel: `${acc.name} [${acc.code}]`
      });
    } else {
      seenCodes.set(codeKey, acc.id);
    }
  }

  // Transactions
  for (const tx of transactions) {
    if (!tx.debitAccountId || !accountsById.has(tx.debitAccountId)) {
      add({
        severity: 'ERROR',
        area: 'TRANSACTIONS',
        code: 'TX_MISSING_DEBIT_ACCOUNT',
        messageAr: 'قيد مرتبط بحساب مدين مفقود أو غير صالح.',
        messageEn: 'Transaction references missing/invalid debit account.',
        entityId: tx.id,
        entityLabel: tx.description
      });
    }
    if (!tx.creditAccountId || !accountsById.has(tx.creditAccountId)) {
      add({
        severity: 'ERROR',
        area: 'TRANSACTIONS',
        code: 'TX_MISSING_CREDIT_ACCOUNT',
        messageAr: 'قيد مرتبط بحساب دائن مفقود أو غير صالح.',
        messageEn: 'Transaction references missing/invalid credit account.',
        entityId: tx.id,
        entityLabel: tx.description
      });
    }
    if (tx.debitAccountId && tx.creditAccountId && tx.debitAccountId === tx.creditAccountId) {
      add({
        severity: 'WARNING',
        area: 'TRANSACTIONS',
        code: 'TX_SAME_DEBIT_CREDIT',
        messageAr: 'القيد يستخدم نفس الحساب مدينًا ودائنًا.',
        messageEn: 'Transaction uses the same account for debit and credit.',
        entityId: tx.id,
        entityLabel: tx.description
      });
    }
    if (!currencyCodes.has(tx.currency)) {
      add({
        severity: 'WARNING',
        area: 'TRANSACTIONS',
        code: 'TX_INVALID_CURRENCY',
        messageAr: 'عملة القيد غير صالحة/غير معرفة.',
        messageEn: 'Transaction currency is invalid or undefined.',
        entityId: tx.id,
        entityLabel: `${tx.description} (${tx.currency})`,
        fixable: true
      });
    }
    if (!isFiniteNum(tx.exchangeRate) || tx.exchangeRate <= 0) {
      add({
        severity: 'WARNING',
        area: 'TRANSACTIONS',
        code: 'TX_INVALID_EXCHANGE_RATE',
        messageAr: 'سعر صرف القيد غير صالح.',
        messageEn: 'Transaction exchange rate is invalid.',
        entityId: tx.id,
        entityLabel: tx.description,
        fixable: true
      });
    }
    if (!looksLikeIsoDate(tx.date)) {
      add({
        severity: 'ERROR',
        area: 'TRANSACTIONS',
        code: 'TX_INVALID_DATE',
        messageAr: 'تاريخ القيد غير صالح.',
        messageEn: 'Transaction date is invalid.',
        entityId: tx.id,
        entityLabel: tx.description
      });
    }
  }

  // Invoices
  for (const inv of invoices) {
    if (!looksLikeIsoDate(inv.date)) {
      add({
        severity: 'ERROR',
        area: 'INVOICES',
        code: 'INV_INVALID_DATE',
        messageAr: 'تاريخ الفاتورة غير صالح.',
        messageEn: 'Invoice date is invalid.',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber
      });
    }
    if (inv.dueDate && !looksLikeIsoDate(inv.dueDate)) {
      add({
        severity: 'WARNING',
        area: 'INVOICES',
        code: 'INV_INVALID_DUE_DATE',
        messageAr: 'تاريخ استحقاق الفاتورة غير صالح.',
        messageEn: 'Invoice due date is invalid.',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber
      });
    }
    if (!currencyCodes.has(inv.currency)) {
      add({
        severity: 'WARNING',
        area: 'INVOICES',
        code: 'INV_INVALID_CURRENCY',
        messageAr: 'عملة الفاتورة غير صالحة/غير معرفة.',
        messageEn: 'Invoice currency is invalid or undefined.',
        entityId: inv.id,
        entityLabel: `${inv.invoiceNumber} (${inv.currency})`,
        fixable: true
      });
    }
    if (!isFiniteNum(inv.exchangeRate) || inv.exchangeRate <= 0) {
      add({
        severity: 'WARNING',
        area: 'INVOICES',
        code: 'INV_INVALID_EXCHANGE_RATE',
        messageAr: 'سعر صرف الفاتورة غير صالح.',
        messageEn: 'Invoice exchange rate is invalid.',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber,
        fixable: true
      });
    }
    if (inv.paymentType === 'CASH' && inv.paymentAccountId && !accountsById.has(inv.paymentAccountId)) {
      add({
        severity: 'ERROR',
        area: 'INVOICES',
        code: 'INV_PAYMENT_ACCOUNT_MISSING',
        messageAr: 'فاتورة نقدية مرتبطة بحساب دفع مفقود.',
        messageEn: 'Cash invoice references a missing payment account.',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber
      });
    }
    const expenseInvoice = inv.category === 'general_expense' || inv.category === 'import_expenses';
    let recomputedSubTotal = 0;
    for (const item of inv.items) {
      recomputedSubTotal += Number(item.total || 0);
      if (item.productId && !productsById.has(item.productId)) {
        add({
          severity: 'WARNING',
          area: 'INVOICES',
          code: 'INV_ITEM_MISSING_PRODUCT',
          messageAr: 'بند فاتورة يشير إلى صنف مفقود.',
          messageEn: 'Invoice item references a missing product.',
          entityId: inv.id,
          entityLabel: inv.invoiceNumber
        });
      }
      if (expenseInvoice) {
        if (!item.accountId) {
          add({
            severity: 'ERROR',
            area: 'INVOICES',
            code: 'INV_EXPENSE_ITEM_ACCOUNT_REQUIRED',
            messageAr: 'فاتورة مصروف تحتوي بندًا بدون حساب مصروف.',
            messageEn: 'Expense invoice item is missing an expense account.',
            entityId: inv.id,
            entityLabel: inv.invoiceNumber
          });
        } else if (!accountsById.has(item.accountId)) {
          add({
            severity: 'ERROR',
            area: 'INVOICES',
            code: 'INV_EXPENSE_ITEM_ACCOUNT_MISSING',
            messageAr: 'بند مصروف مرتبط بحساب مفقود.',
            messageEn: 'Expense item references a missing account.',
            entityId: inv.id,
            entityLabel: inv.invoiceNumber
          });
        }
      }
      const computedLine = round2((item.quantity || 0) * (item.unitPrice || 0));
      if (!nearlyEqual(computedLine, Number(item.total || 0), 0.05)) {
        add({
          severity: 'WARNING',
          area: 'INVOICES',
          code: 'INV_LINE_TOTAL_MISMATCH',
          messageAr: 'إجمالي بند الفاتورة لا يطابق الكمية × السعر.',
          messageEn: 'Invoice line total does not match quantity × unit price.',
          entityId: inv.id,
          entityLabel: inv.invoiceNumber
        });
      }
    }
    if (!nearlyEqual(round2(recomputedSubTotal), round2(inv.subTotal), 0.05)) {
      add({
        severity: 'WARNING',
        area: 'INVOICES',
        code: 'INV_SUBTOTAL_MISMATCH',
        messageAr: 'المجموع الفرعي للفـاتورة لا يطابق مجموع البنود.',
        messageEn: 'Invoice subtotal does not match sum of items.',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber
      });
    }
    const recomputedTotal = round2((inv.subTotal || 0) - (inv.discountAmount || 0) + (inv.taxAmount || 0));
    if (!nearlyEqual(recomputedTotal, round2(inv.totalAmount || 0), 0.05)) {
      add({
        severity: 'WARNING',
        area: 'INVOICES',
        code: 'INV_TOTAL_MISMATCH',
        messageAr: 'إجمالي الفاتورة لا يطابق (فرعي - خصم + ضريبة).',
        messageEn: 'Invoice total does not match subtotal - discount + tax.',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber
      });
    }
  }

  // Checks
  for (const check of checks) {
    if (!currencyCodes.has(check.currency)) {
      add({
        severity: 'WARNING',
        area: 'CHECKS',
        code: 'CHECK_INVALID_CURRENCY',
        messageAr: 'عملة الشيك غير صالحة/غير معرفة.',
        messageEn: 'Check currency is invalid or undefined.',
        entityId: check.id,
        entityLabel: check.checkNumber,
        fixable: true
      });
    }
    if (check.bankAccountId && !accountsById.has(check.bankAccountId)) {
      add({
        severity: 'ERROR',
        area: 'CHECKS',
        code: 'CHECK_BANK_ACCOUNT_MISSING',
        messageAr: 'الشيك مرتبط بحساب بنك داخلي مفقود.',
        messageEn: 'Check references a missing internal bank account.',
        entityId: check.id,
        entityLabel: check.checkNumber
      });
    }
    if (check.depositedBankId && !accountsById.has(check.depositedBankId)) {
      add({
        severity: 'ERROR',
        area: 'CHECKS',
        code: 'CHECK_DEPOSIT_BANK_ACCOUNT_MISSING',
        messageAr: 'الشيك مرتبط بحساب إيداع بنكي مفقود.',
        messageEn: 'Check references a missing deposit bank account.',
        entityId: check.id,
        entityLabel: check.checkNumber
      });
    }
  }

  // Inventory document-vs-product quantity (based on posted invoice movements only)
  const expectedQtyByProduct = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.postingStatus !== 'POSTED' || inv.status === 'QUOTATION' || inv.status === 'CANCELLED') continue;
    let sign = 0;
    if (inv.category === 'purchase_invoice') sign = 1;
    else if (inv.category === 'sales_invoice') sign = -1;
    else if (inv.category === 'purchase_return') sign = -1;
    else if (inv.category === 'sales_return') sign = 1;
    if (!sign) continue;
    for (const item of inv.items) {
      if (!item.productId || !productsById.has(item.productId)) continue;
      expectedQtyByProduct.set(item.productId, (expectedQtyByProduct.get(item.productId) || 0) + (sign * (Number(item.quantity) || 0)));
    }
  }
  let inventoryQtyDiffProducts = 0;
  for (const p of products) {
    const expected = round2(expectedQtyByProduct.get(p.id) || 0);
    const actual = round2(Number(p.stock) || 0);
    if (!nearlyEqual(expected, actual, 0.001)) {
      inventoryQtyDiffProducts++;
      add({
        severity: 'WARNING',
        area: 'INVENTORY',
        code: 'PRODUCT_STOCK_DOC_MISMATCH',
        messageAr: `فرق مخزني مستندي للصنف (المتوقع من الفواتير ${expected}، الفعلي ${actual}).`,
        messageEn: `Document stock mismatch for product (expected from invoices ${expected}, actual ${actual}).`,
        entityId: p.id,
        entityLabel: p.name
      });
    }

    const warehouseStock = (p as Product & { warehouseStock?: { warehouseId: string; quantity: number }[] }).warehouseStock;
    if (Array.isArray(warehouseStock) && warehouseStock.length > 0) {
      const whSum = round2(warehouseStock.reduce((s, row) => s + (Number(row.quantity) || 0), 0));
      if (!nearlyEqual(whSum, actual, 0.001)) {
        add({
          severity: 'WARNING',
          area: 'INVENTORY',
          code: 'PRODUCT_STOCK_WAREHOUSE_SUM_MISMATCH',
          messageAr: `إجمالي مخزون المستودعات (${whSum}) لا يطابق مخزون الصنف (${actual}).`,
          messageEn: `Warehouse stock sum (${whSum}) does not match product stock (${actual}).`,
          entityId: p.id,
          entityLabel: p.name,
          fixable: true
        });
      }
    }
  }

  // Inventory ledger vs stock value (approx)
  const postedTransactions = transactions.filter(tx => tx.status !== 'DRAFT');
  const inventoryLedgerValueApprox = round2(postedTransactions.reduce((sum, tx) => {
    let delta = 0;
    if (tx.debitAccountId === 'acc_inventory') delta += Number(tx.amount) || 0;
    if (tx.creditAccountId === 'acc_inventory') delta -= Number(tx.amount) || 0;
    return sum + delta;
  }, 0));
  const inventoryStockValueApprox = round2(products.reduce((sum, p) => sum + ((Number(p.stock) || 0) * (Number(p.buyPrice) || 0)), 0));
  const inventoryValueDiffApprox = round2(inventoryLedgerValueApprox - inventoryStockValueApprox);
  if (!nearlyEqual(inventoryLedgerValueApprox, inventoryStockValueApprox, 0.5)) {
    add({
      severity: 'WARNING',
      area: 'INVENTORY',
      code: 'INVENTORY_LEDGER_VALUE_DIFF_APPROX',
      messageAr: 'يوجد فرق تقريبي بين قيمة المخزون الدفترية (الحساب) وقيمة المخزون من الأصناف.',
      messageEn: 'Approximate difference detected between inventory ledger value and product stock value.'
    });
  }

  // Import expense distributions
  for (const d of importExpenseDistributions) {
    if (!currencyCodes.has(d.currency)) {
      add({
        severity: 'WARNING',
        area: 'IMPORT_DISTRIBUTIONS',
        code: 'IMP_DIST_INVALID_CURRENCY',
        messageAr: 'عملة توزيع مصاريف الاستيراد غير صالحة.',
        messageEn: 'Import expense distribution currency is invalid.',
        entityId: d.id,
        entityLabel: d.description || d.id,
        fixable: true
      });
    }
    if (!isFiniteNum(d.exchangeRate) || d.exchangeRate <= 0) {
      add({
        severity: 'WARNING',
        area: 'IMPORT_DISTRIBUTIONS',
        code: 'IMP_DIST_INVALID_EXCHANGE_RATE',
        messageAr: 'سعر صرف توزيع مصاريف الاستيراد غير صالح.',
        messageEn: 'Import expense distribution exchange rate is invalid.',
        entityId: d.id,
        entityLabel: d.description || d.id,
        fixable: true
      });
    }

    const allocatedSum = round2((d.lines || []).reduce((s, line) => s + (Number(line.allocatedAmountBase) || 0), 0));
    if (!nearlyEqual(allocatedSum, round2(d.totalAmountBase || 0), 0.05)) {
      add({
        severity: 'ERROR',
        area: 'IMPORT_DISTRIBUTIONS',
        code: 'IMP_DIST_TOTAL_NOT_BALANCED',
        messageAr: 'إجمالي التوزيع لا يطابق مجموع المبالغ المحملة على السطور.',
        messageEn: 'Distribution total does not match allocated line totals.',
        entityId: d.id,
        entityLabel: d.description || d.id,
        fixable: true
      });
    }

    const lineInvoiceIds = Array.from(new Set((d.lines || []).map(line => line.purchaseInvoiceId).filter(Boolean)));
    const headerIds = Array.from(new Set((d.purchaseInvoiceIds || []).filter(Boolean)));
    const idsMatch = headerIds.length === lineInvoiceIds.length && headerIds.every(id => lineInvoiceIds.includes(id));
    if (!idsMatch) {
      add({
        severity: 'WARNING',
        area: 'IMPORT_DISTRIBUTIONS',
        code: 'IMP_DIST_HEADER_IDS_MISMATCH',
        messageAr: 'قائمة فواتير الشراء في رأس التوزيع لا تطابق السطور.',
        messageEn: 'Distribution header purchase invoice ids do not match lines.',
        entityId: d.id,
        entityLabel: d.description || d.id,
        fixable: true
      });
    }

    for (const line of d.lines || []) {
      const expectedLanded = round2((Number(line.directLineAmountBase) || 0) + (Number(line.allocatedAmountBase) || 0));
      if (!nearlyEqual(expectedLanded, round2(line.landedLineAmountBase || 0), 0.05)) {
        add({
          severity: 'WARNING',
          area: 'IMPORT_DISTRIBUTIONS',
          code: 'IMP_DIST_LINE_LANDED_MISMATCH',
          messageAr: 'تكلفة السطر المحملة لا تساوي المباشر + التحميل.',
          messageEn: 'Landed line value does not equal direct + allocated.',
          entityId: d.id,
          entityLabel: line.description,
          fixable: true
        });
      }
      const inv = invoicesById.get(line.purchaseInvoiceId);
      if (!inv) {
        add({
          severity: 'ERROR',
          area: 'IMPORT_DISTRIBUTIONS',
          code: 'IMP_DIST_LINE_MISSING_PURCHASE_INVOICE',
          messageAr: 'سطر توزيع مرتبط بفاتورة شراء مفقودة.',
          messageEn: 'Distribution line references a missing purchase invoice.',
          entityId: d.id,
          entityLabel: line.purchaseInvoiceNumber
        });
        continue;
      }
      if (!inv.items.find(item => item.id === line.invoiceItemId)) {
        add({
          severity: 'ERROR',
          area: 'IMPORT_DISTRIBUTIONS',
          code: 'IMP_DIST_LINE_MISSING_INVOICE_ITEM',
          messageAr: 'سطر توزيع مرتبط ببند فاتورة شراء مفقود.',
          messageEn: 'Distribution line references a missing invoice item.',
          entityId: d.id,
          entityLabel: line.purchaseInvoiceNumber
        });
      }
      if (line.productId && !productsById.has(line.productId)) {
        add({
          severity: 'WARNING',
          area: 'IMPORT_DISTRIBUTIONS',
          code: 'IMP_DIST_LINE_MISSING_PRODUCT',
          messageAr: 'سطر توزيع مرتبط بصنف مفقود.',
          messageEn: 'Distribution line references a missing product.',
          entityId: d.id,
          entityLabel: line.description
        });
      }
    }
  }

  const counts = issues.reduce(
    (acc, issue) => {
      acc.total += 1;
      if (issue.severity === 'ERROR') acc.errors += 1;
      else if (issue.severity === 'WARNING') acc.warnings += 1;
      else acc.infos += 1;
      if (issue.fixable) acc.fixable += 1;
      return acc;
    },
    { total: 0, errors: 0, warnings: 0, infos: 0, fixable: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    issues,
    counts,
    metrics: {
      inventoryLedgerValueApprox,
      inventoryStockValueApprox,
      inventoryValueDiffApprox,
      inventoryQtyDiffProducts
    }
  };
};

export const applyIntegritySafeFixes = (input: IntegrityCheckInput): IntegritySafeFixResult => {
  const { transactions, invoices, products, checks, importExpenseDistributions, currencies, baseCurrency } = input;
  const currencyCodes = new Set([baseCurrency, ...currencies.map(c => c.code)]);

  const counts: IntegritySafeFixResult['counts'] = {
    transactionCurrencyFixed: 0,
    transactionRateFixed: 0,
    invoiceCurrencyFixed: 0,
    invoiceRateFixed: 0,
    productStockFromWarehouseFixed: 0,
    importDistributionCurrencyFixed: 0,
    importDistributionRateFixed: 0,
    importDistributionHeaderFixed: 0,
    importDistributionLineLandedFixed: 0,
    importDistributionTotalFixed: 0,
    checkCurrencyFixed: 0,
    totalChanges: 0
  };

  const normalizedTransactions = transactions.map(tx => {
    let next = tx;
    if (!currencyCodes.has(tx.currency)) {
      next = { ...next, currency: baseCurrency };
      counts.transactionCurrencyFixed += 1;
    }
    if (!isFiniteNum(tx.exchangeRate) || tx.exchangeRate <= 0) {
      next = next === tx ? { ...next } : next;
      next.exchangeRate = 1;
      counts.transactionRateFixed += 1;
    }
    return next;
  });

  const normalizedInvoices = invoices.map(inv => {
    let next = inv;
    if (!currencyCodes.has(inv.currency)) {
      next = { ...next, currency: baseCurrency };
      counts.invoiceCurrencyFixed += 1;
    }
    if (!isFiniteNum(inv.exchangeRate) || inv.exchangeRate <= 0) {
      next = next === inv ? { ...next } : next;
      next.exchangeRate = 1;
      counts.invoiceRateFixed += 1;
    }
    return next;
  });

  const normalizedProducts = products.map(p => {
    const warehouseStock = (p as Product & { warehouseStock?: { warehouseId: string; quantity: number }[] }).warehouseStock;
    if (!Array.isArray(warehouseStock) || warehouseStock.length === 0) return p;
    const whSum = round2(warehouseStock.reduce((s, row) => s + (Number(row.quantity) || 0), 0));
    const actual = round2(Number(p.stock) || 0);
    if (nearlyEqual(whSum, actual, 0.001)) return p;
    counts.productStockFromWarehouseFixed += 1;
    return { ...p, stock: whSum };
  });

  const normalizedImportDistributions = importExpenseDistributions.map(d => {
    let changed = false;
    let currency = d.currency;
    let exchangeRate = d.exchangeRate;
    if (!currencyCodes.has(currency)) {
      currency = baseCurrency;
      counts.importDistributionCurrencyFixed += 1;
      changed = true;
    }
    if (!isFiniteNum(exchangeRate) || exchangeRate <= 0) {
      exchangeRate = 1;
      counts.importDistributionRateFixed += 1;
      changed = true;
    }

    const lines = (d.lines || []).map(line => {
      const expectedLanded = round2((Number(line.directLineAmountBase) || 0) + (Number(line.allocatedAmountBase) || 0));
      if (nearlyEqual(expectedLanded, round2(line.landedLineAmountBase || 0), 0.05)) return line;
      counts.importDistributionLineLandedFixed += 1;
      changed = true;
      return { ...line, landedLineAmountBase: expectedLanded };
    });

    const lineInvoiceIds = Array.from(new Set(lines.map(line => line.purchaseInvoiceId).filter(Boolean)));
    const headerIds = Array.from(new Set((d.purchaseInvoiceIds || []).filter(Boolean)));
    let purchaseInvoiceIds = d.purchaseInvoiceIds;
    const idsMatch = headerIds.length === lineInvoiceIds.length && headerIds.every(id => lineInvoiceIds.includes(id));
    if (!idsMatch) {
      purchaseInvoiceIds = lineInvoiceIds;
      counts.importDistributionHeaderFixed += 1;
      changed = true;
    }

    const allocatedSum = round2(lines.reduce((s, line) => s + (Number(line.allocatedAmountBase) || 0), 0));
    let totalAmountBase = d.totalAmountBase;
    if (!nearlyEqual(allocatedSum, round2(d.totalAmountBase || 0), 0.05)) {
      totalAmountBase = allocatedSum;
      counts.importDistributionTotalFixed += 1;
      changed = true;
    }

    if (!changed) return d;
    return {
      ...d,
      currency,
      exchangeRate,
      lines,
      purchaseInvoiceIds,
      totalAmountBase
    };
  });

  const checkCurrencyPatches = checks
    .filter(c => !currencyCodes.has(c.currency))
    .map(c => ({ id: c.id, currency: baseCurrency }));
  counts.checkCurrencyFixed = checkCurrencyPatches.length;

  counts.totalChanges =
    counts.transactionCurrencyFixed +
    counts.transactionRateFixed +
    counts.invoiceCurrencyFixed +
    counts.invoiceRateFixed +
    counts.productStockFromWarehouseFixed +
    counts.importDistributionCurrencyFixed +
    counts.importDistributionRateFixed +
    counts.importDistributionHeaderFixed +
    counts.importDistributionLineLandedFixed +
    counts.importDistributionTotalFixed +
    counts.checkCurrencyFixed;

  return {
    transactions: normalizedTransactions,
    invoices: normalizedInvoices,
    products: normalizedProducts,
    importExpenseDistributions: normalizedImportDistributions,
    checkCurrencyPatches,
    counts
  };
};

