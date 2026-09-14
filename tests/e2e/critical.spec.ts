import { expect, test } from 'playwright/test';
import {
  chooseSearchableValue,
  ensureAuthenticated,
  installDialogCollector,
  installRuntimeErrorGuards,
  navigateToTab,
  openFinancialReport,
  openPaymentVoucherForm,
  openPurchaseInvoiceForm,
  openPurchaseReturnForm,
  openReceiptVoucherForm,
  openSalesInvoiceForm,
  openTrialBalance,
  readNumericValue,
  readTrialBalanceRow,
  readTrialBalanceValue,
  selectJournalAccount,
} from './appTestHelpers';

const journalAmount = 123.45;
const journalDescription = 'Playwright critical journal';
const receiptAmount = 1200;
const salesItemCost = 2500;
const payrollAmount = 2500;

test('critical: complete accounting journey remains balanced through financial statements', async ({ page }) => {
  test.setTimeout(180_000);
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  const purchaseAmount = 300;
  const importCost = 60;
  const supplierPayment = 20;
  const purchaseReturn = 300;
  const customerReceipt = 100;
  const manualRevenue = 50;
  const expectedPostedTotal = purchaseAmount + importCost + supplierPayment + purchaseReturn + customerReceipt + manualRevenue;

  await ensureAuthenticated(page);
  await openTrialBalance(page);
  const baselineTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const baselineTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  await openPurchaseInvoiceForm(page);
  await page.getByTestId('invoice-payment-credit').click();
  await chooseSearchableValue(page, 'invoice-contact-input', '0501234567');
  await page.getByTestId('invoice-item-search').fill('ITM-004');
  await page.getByTestId('invoice-item-search').press('Enter');
  const purchaseTaxMode = page.getByTestId('invoice-tax-mode');
  if (await purchaseTaxMode.count()) {
    await purchaseTaxMode.selectOption('NONE');
  }
  await expect.poll(() => readNumericValue(page, 'invoice-final-total')).toBeCloseTo(purchaseAmount, 2);
  await page.getByTestId('invoice-submit-action').click();
  await expect(page.getByTestId('invoice-form-root')).toHaveCount(0, { timeout: 20_000 });

  await navigateToTab(page, 'import-list');
  await expect(page.getByTestId('import-manager-root')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('import-start-distribution').click();
  await page.getByTestId('import-expense-amount').fill(String(importCost));
  await page.getByTestId('import-expense-contact').selectOption('c1');
  await page.getByTestId('import-expense-description').fill('E2E landed cost');
  await page.getByTestId('import-next-invoices').click();
  const purchaseInvoiceChoice = page.locator('[data-testid^="import-invoice-"]').first();
  await expect(purchaseInvoiceChoice).toBeVisible();
  await purchaseInvoiceChoice.click();
  await page.getByTestId('import-next-method').click();
  await page.getByTestId('import-method-value').click();
  await expect.poll(() => readNumericValue(page, 'import-distributed-total')).toBeCloseTo(importCost, 2);
  await page.getByTestId('import-submit-distribution').click();
  await expect(page.getByTestId('import-start-distribution')).toBeVisible({ timeout: 20_000 });

  await openPaymentVoucherForm(page);
  await chooseSearchableValue(page, 'voucher-contact-input', '0501234567');
  await page.getByTestId('voucher-description-input').fill('E2E supplier payment');
  await page.getByTestId('voucher-add-cash-line').click();
  await page.getByTestId('voucher-cash-line-1-account').selectOption('acc_cash');
  await page.getByTestId('voucher-cash-line-1-amount').fill(String(supplierPayment));
  await page.getByTestId('voucher-submit-action').click();
  await expect(page.getByTestId('voucher-form-root')).toHaveCount(0, { timeout: 20_000 });

  await openReceiptVoucherForm(page);
  await chooseSearchableValue(page, 'voucher-contact-input', '0559876543');
  await page.getByTestId('voucher-description-input').fill('E2E customer receipt');
  await page.getByTestId('voucher-add-cash-line').click();
  await page.getByTestId('voucher-cash-line-1-account').selectOption('acc_cash');
  await page.getByTestId('voucher-cash-line-1-amount').fill(String(customerReceipt));
  await page.getByTestId('voucher-submit-action').click();
  await expect(page.getByTestId('voucher-form-root')).toHaveCount(0, { timeout: 20_000 });

  await openPurchaseReturnForm(page);
  await page.getByTestId('invoice-payment-credit').click();
  await chooseSearchableValue(page, 'invoice-contact-input', '0501234567');
  await page.getByTestId('invoice-item-search').fill('ITM-004');
  await page.getByTestId('invoice-item-search').press('Enter');
  const returnTaxMode = page.getByTestId('invoice-tax-mode');
  if (await returnTaxMode.count()) {
    await returnTaxMode.selectOption('NONE');
  }
  await page.getByTestId('invoice-item-1-price').fill(String(purchaseReturn));
  await page.getByTestId('invoice-item-1-price').blur();
  await expect.poll(() => readNumericValue(page, 'invoice-final-total')).toBeCloseTo(purchaseReturn, 2);
  await page.getByTestId('invoice-submit-action').click();
  await expect(page.getByTestId('invoice-form-root')).toHaveCount(0, { timeout: 20_000 });

  await navigateToTab(page, 'journal-list');
  await page.getByTestId('journal-add-action').click();
  await selectJournalAccount(page, 1, '11101');
  await page.getByTestId('journal-line-1-debit').fill(String(manualRevenue));
  await selectJournalAccount(page, 2, '41');
  await page.getByTestId('journal-line-2-credit').fill(String(manualRevenue));
  await page.getByTestId('journal-submit-action').click();
  await expect(page.getByTestId('overlay-add-journal')).toHaveCount(0, { timeout: 20_000 });

  await openTrialBalance(page);
  const inventory = await readTrialBalanceRow(page, 'acc_inventory');
  const payable = await readTrialBalanceRow(page, 'acc_payable_c1');
  const cash = await readTrialBalanceRow(page, 'acc_cash');
  const receivable = await readTrialBalanceRow(page, 'acc_receivable');
  const sales = await readTrialBalanceRow(page, 'acc_sales');
  expect(inventory.debit - inventory.credit).toBeCloseTo(60, 2);
  expect(payable.credit - payable.debit).toBeCloseTo(40, 2);
  expect(cash.debit - cash.credit).toBeCloseTo(130, 2);
  expect(receivable.debit - receivable.credit).toBeCloseTo(-100, 2);
  expect(sales.credit - sales.debit).toBeCloseTo(manualRevenue, 2);
  expect(await readTrialBalanceValue(page, 'trial-balance-total-debit')).toBeCloseTo(baselineTotalDebit + expectedPostedTotal, 2);
  expect(await readTrialBalanceValue(page, 'trial-balance-total-credit')).toBeCloseTo(baselineTotalCredit + expectedPostedTotal, 2);

  await openFinancialReport(page, 'income_statement');
  expect(await readNumericValue(page, 'income-statement-total-revenue')).toBeCloseTo(manualRevenue, 2);
  expect(await readNumericValue(page, 'income-statement-total-expense')).toBeCloseTo(0, 2);
  expect(await readNumericValue(page, 'income-statement-net-profit')).toBeCloseTo(manualRevenue, 2);

  await openFinancialReport(page, 'balance_sheet');
  expect(await readNumericValue(page, 'balance-sheet-total-assets')).toBeCloseTo(90, 2);
  expect(await readNumericValue(page, 'balance-sheet-total-liabilities')).toBeCloseTo(40, 2);
  expect(await readNumericValue(page, 'balance-sheet-total-equity')).toBeCloseTo(50, 2);
  expect(await readNumericValue(page, 'balance-sheet-total-liabilities-equity')).toBeCloseTo(90, 2);
  expect(await readNumericValue(page, 'balance-sheet-difference')).toBeCloseTo(0, 2);

  expect(dialogMessages.some((message) => /نجاح|success|posted|ترحيل/i.test(message))).toBeTruthy();
  runtimeGuards.assertClean();
});

test('critical: post journal and verify trial balance impact', async ({ page }) => {
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await openTrialBalance(page);

  const baselineCashDebit = await readTrialBalanceValue(page, 'trial-balance-row-acc_cash-debit');
  const baselineSalesCredit = await readTrialBalanceValue(page, 'trial-balance-row-acc_sales-credit');
  const baselineTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const baselineTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  await navigateToTab(page, 'journal-list');
  await expect(page.getByTestId('journal-list-root')).toBeVisible();
  await page.getByTestId('journal-add-action').click();
  await expect(page.getByTestId('overlay-add-journal')).toBeVisible();
  await expect(page.getByTestId('journal-form-root')).toBeVisible();

  await selectJournalAccount(page, 1, '11101');
  await page.getByTestId('journal-line-1-debit').fill(String(journalAmount));
  await page.getByTestId('journal-line-1-description').fill(journalDescription);

  await selectJournalAccount(page, 2, '41');
  await page.getByTestId('journal-line-2-credit').fill(String(journalAmount));
  await page.getByTestId('journal-line-2-description').fill(journalDescription);

  await page.getByTestId('journal-submit-action').click();

  await expect(page.getByTestId('overlay-add-journal')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(journalDescription, { exact: false })).toBeVisible({ timeout: 20_000 });
  expect(dialogMessages.some((message) => /posted|ترحيل|نجاح/i.test(message))).toBeTruthy();

  await openTrialBalance(page);

  const postCashDebit = await readTrialBalanceValue(page, 'trial-balance-row-acc_cash-debit');
  const postSalesCredit = await readTrialBalanceValue(page, 'trial-balance-row-acc_sales-credit');
  const postTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const postTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  expect(postCashDebit).toBeCloseTo(baselineCashDebit + journalAmount, 2);
  expect(postSalesCredit).toBeCloseTo(baselineSalesCredit + journalAmount, 2);
  expect(postTotalDebit).toBeCloseTo(baselineTotalDebit + journalAmount, 2);
  expect(postTotalCredit).toBeCloseTo(baselineTotalCredit + journalAmount, 2);

  runtimeGuards.assertClean();
});

test('critical: post credit sales invoice then receipt voucher and verify impacted accounts', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await openTrialBalance(page);

  const baselineReceivable = await readTrialBalanceRow(page, 'acc_receivable');
  const baselineSales = await readTrialBalanceRow(page, 'acc_sales');
  const baselineCash = await readTrialBalanceRow(page, 'acc_cash');
  const baselineCogs = await readTrialBalanceRow(page, 'acc_cogs');
  const baselineInventory = await readTrialBalanceRow(page, 'acc_inventory');
  const baselineTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const baselineTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  await openSalesInvoiceForm(page);
  await page.getByTestId('invoice-payment-credit').click();
  await chooseSearchableValue(page, 'invoice-contact-input', '0559876543');
  await page.getByTestId('invoice-item-search').fill('ITM-001');
  await page.getByTestId('invoice-item-search').press('Enter');
  await expect.poll(() => readNumericValue(page, 'invoice-final-total'), { timeout: 20_000 }).toBeGreaterThan(0);
  const taxMode = page.getByTestId('invoice-tax-mode');
  if (await taxMode.count()) {
    await taxMode.selectOption('NONE');
  }
  const salesInvoiceAmount = await readNumericValue(page, 'invoice-final-total');

  await page.getByTestId('invoice-submit-action').click();
  await expect(page.getByTestId('invoice-form-root')).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(
    () => dialogMessages.some((message) => /posted|ترحيل|invoice|success|نجاح/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();

  await openTrialBalance(page);

  const postInvoiceReceivable = await readTrialBalanceRow(page, 'acc_receivable');
  const postInvoiceSales = await readTrialBalanceRow(page, 'acc_sales');
  const postInvoiceCash = await readTrialBalanceRow(page, 'acc_cash');
  const postInvoiceCogs = await readTrialBalanceRow(page, 'acc_cogs');
  const postInvoiceInventory = await readTrialBalanceRow(page, 'acc_inventory');
  const postInvoiceTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const postInvoiceTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  expect(postInvoiceReceivable.debit).toBeCloseTo(baselineReceivable.debit + salesInvoiceAmount, 2);
  expect(postInvoiceSales.credit).toBeCloseTo(baselineSales.credit + salesInvoiceAmount, 2);
  expect(postInvoiceCash.debit).toBeCloseTo(baselineCash.debit, 2);
  expect(postInvoiceCogs.debit).toBeCloseTo(baselineCogs.debit + salesItemCost, 2);
  expect(postInvoiceInventory.credit).toBeCloseTo(baselineInventory.credit + salesItemCost, 2);
  expect(postInvoiceTotalDebit).toBeCloseTo(baselineTotalDebit + salesInvoiceAmount + salesItemCost, 2);
  expect(postInvoiceTotalCredit).toBeCloseTo(baselineTotalCredit + salesInvoiceAmount + salesItemCost, 2);

  await openReceiptVoucherForm(page);
  await chooseSearchableValue(page, 'voucher-contact-input', '0559876543');
  await page.getByTestId('voucher-description-input').fill('E2E receipt against receivable');
  await page.getByTestId('voucher-add-cash-line').click();
  await page.getByTestId('voucher-cash-line-1-account').selectOption('acc_cash');
  await page.getByTestId('voucher-cash-line-1-amount').fill(String(receiptAmount));
  await page.getByTestId('voucher-submit-action').click();
  await expect(page.getByTestId('voucher-form-root')).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(
    () => dialogMessages.some((message) => /voucher|سند|قبض|posted|نجاح/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();

  await openTrialBalance(page);

  const postReceiptReceivable = await readTrialBalanceRow(page, 'acc_receivable');
  const postReceiptCash = await readTrialBalanceRow(page, 'acc_cash');
  const postReceiptTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const postReceiptTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  expect(postReceiptReceivable.credit).toBeCloseTo(postInvoiceReceivable.credit + receiptAmount, 2);
  expect(postReceiptReceivable.debit).toBeCloseTo(postInvoiceReceivable.debit, 2);
  expect(postReceiptCash.debit).toBeCloseTo(postInvoiceCash.debit + receiptAmount, 2);
  expect(postReceiptTotalDebit).toBeCloseTo(postInvoiceTotalDebit + receiptAmount, 2);
  expect(postReceiptTotalCredit).toBeCloseTo(postInvoiceTotalCredit + receiptAmount, 2);

  runtimeGuards.assertClean();
});

test('critical: post credit purchase invoice and verify inventory and payables', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await openTrialBalance(page);

  const baselineInventory = await readTrialBalanceRow(page, 'acc_inventory');
  const baselinePayable = await readTrialBalanceRow(page, 'acc_payable_c1');
  const baselineTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const baselineTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  await openPurchaseInvoiceForm(page);
  await page.getByTestId('invoice-payment-credit').click();
  await chooseSearchableValue(page, 'invoice-contact-input', '0501234567');
  await page.getByTestId('invoice-item-search').fill('ITM-004');
  await page.getByTestId('invoice-item-search').press('Enter');
  await expect.poll(() => readNumericValue(page, 'invoice-final-total'), { timeout: 20_000 }).toBeGreaterThan(0);
  const taxMode = page.getByTestId('invoice-tax-mode');
  if (await taxMode.count()) {
    await taxMode.selectOption('NONE');
  }
  const purchaseInvoiceAmount = await readNumericValue(page, 'invoice-final-total');

  await page.getByTestId('invoice-submit-action').click();
  await expect(page.getByTestId('invoice-form-root')).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(
    () => dialogMessages.some((message) => /posted|ترحيل|invoice|purchase|نجاح/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();

  await openTrialBalance(page);

  const postInventory = await readTrialBalanceRow(page, 'acc_inventory');
  const postPayable = await readTrialBalanceRow(page, 'acc_payable_c1');
  const postTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const postTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  expect(postInventory.debit).toBeCloseTo(baselineInventory.debit + purchaseInvoiceAmount, 2);
  expect(postPayable.credit).toBeCloseTo(baselinePayable.credit + purchaseInvoiceAmount, 2);
  expect(postTotalDebit).toBeCloseTo(baselineTotalDebit + purchaseInvoiceAmount, 2);
  expect(postTotalCredit).toBeCloseTo(baselineTotalCredit + purchaseInvoiceAmount, 2);

  runtimeGuards.assertClean();
});

test('critical: payroll accrual and payment update salary expense, liabilities, and cash', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);
  const suffix = `${Date.now()}`.slice(-6);
  const employeeName = `TB Payroll ${suffix}`;
  const employeeCode = `TB-${suffix}`;

  await ensureAuthenticated(page);
  await openTrialBalance(page);

  const baselineSalaryExpense = await readTrialBalanceRow(page, 'acc_exp_salaries');
  const baselineAccruedSalaries = await readTrialBalanceRow(page, 'acc_accrued_salaries');
  const baselineCash = await readTrialBalanceRow(page, 'acc_cash');
  const baselineTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const baselineTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  await navigateToTab(page, 'hr');
  await expect(page.getByTestId('hr-manager-root')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('hr-tab-employees').click();
  await page.getByTestId('hr-add-employee').click();
  await expect(page.getByTestId('hr-employee-form')).toBeVisible();
  await page.getByTestId('hr-employee-name').fill(employeeName);
  await page.getByTestId('hr-employee-code').fill(employeeCode);
  await page.getByTestId('hr-employee-position').fill('Trial Balance QA');
  await page.getByTestId('hr-employee-basic-pay').fill(String(payrollAmount));
  await page.getByTestId('hr-employee-save').click();
  await expect(page.getByTestId('hr-employee-form')).toHaveCount(0, { timeout: 20_000 });

  await page.getByTestId('hr-tab-payroll').click();
  await expect(page.getByTestId('hr-payroll-root')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('hr-payroll-scope').selectOption({ label: `${employeeCode} - ${employeeName}` });
  await page.getByTestId('hr-payroll-payment-account').selectOption('acc_cash');
  await page.getByTestId('hr-payroll-expense-account').selectOption('acc_exp_salaries');

  await page.getByTestId('hr-payroll-accrual-all').click();
  await expect.poll(
    () => dialogMessages.some((message) => /posted accrual|ترحيل استحقاق|تم بنجاح ترحيل/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();

  await openTrialBalance(page);

  const postAccrualSalaryExpense = await readTrialBalanceRow(page, 'acc_exp_salaries');
  const postAccrualAccruedSalaries = await readTrialBalanceRow(page, 'acc_accrued_salaries');
  const postAccrualCash = await readTrialBalanceRow(page, 'acc_cash');
  const postAccrualTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const postAccrualTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  expect(postAccrualSalaryExpense.debit).toBeCloseTo(baselineSalaryExpense.debit + payrollAmount, 2);
  expect(postAccrualAccruedSalaries.credit).toBeCloseTo(baselineAccruedSalaries.credit + payrollAmount, 2);
  expect(postAccrualCash.credit).toBeCloseTo(baselineCash.credit, 2);
  expect(postAccrualTotalDebit).toBeCloseTo(baselineTotalDebit + payrollAmount, 2);
  expect(postAccrualTotalCredit).toBeCloseTo(baselineTotalCredit + payrollAmount, 2);

  await navigateToTab(page, 'hr');
  await expect(page.getByTestId('hr-manager-root')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('hr-tab-payroll').click();
  await expect(page.getByTestId('hr-payroll-root')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('hr-payroll-scope').selectOption({ label: `${employeeCode} - ${employeeName}` });
  await page.getByTestId('hr-payroll-payment-account').selectOption('acc_cash');
  await page.getByTestId('hr-payroll-expense-account').selectOption('acc_exp_salaries');

  await page.getByTestId('hr-payroll-payment-all').click();
  await expect.poll(
    () => dialogMessages.some((message) => /paid salaries|صرف رواتب|تم بنجاح صرف رواتب/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();

  await openTrialBalance(page);

  const postPaymentAccruedSalaries = await readTrialBalanceRow(page, 'acc_accrued_salaries');
  const postPaymentCash = await readTrialBalanceRow(page, 'acc_cash');
  const postPaymentTotalDebit = await readTrialBalanceValue(page, 'trial-balance-total-debit');
  const postPaymentTotalCredit = await readTrialBalanceValue(page, 'trial-balance-total-credit');

  expect(postPaymentAccruedSalaries.debit).toBeCloseTo(postAccrualAccruedSalaries.debit + payrollAmount, 2);
  expect(postPaymentAccruedSalaries.credit).toBeCloseTo(postAccrualAccruedSalaries.credit, 2);
  expect(postPaymentCash.credit).toBeCloseTo(postAccrualCash.credit + payrollAmount, 2);
  expect(postPaymentTotalDebit).toBeCloseTo(postAccrualTotalDebit + payrollAmount, 2);
  expect(postPaymentTotalCredit).toBeCloseTo(postAccrualTotalCredit + payrollAmount, 2);

  runtimeGuards.assertClean();
});
