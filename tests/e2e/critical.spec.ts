import { expect, test } from 'playwright/test';
import {
  chooseSearchableValue,
  ensureAuthenticated,
  installDialogCollector,
  installRuntimeErrorGuards,
  navigateToTab,
  openPurchaseInvoiceForm,
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
