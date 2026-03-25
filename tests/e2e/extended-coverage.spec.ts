import { Buffer } from 'node:buffer';
import { expect, test } from 'playwright/test';
import {
  ensureAuthenticated,
  installDialogCollector,
  installRuntimeErrorGuards,
  navigateToDefinitionsMode,
  navigateToTab,
} from './appTestHelpers';

const sampleImportPayload = JSON.stringify(
  {
    contacts: [
      {
        name: 'Customer E2E',
        type: 'CUSTOMER',
        phone: '0599000001',
        address: 'Ramallah',
      },
      {
        name: 'Supplier E2E',
        type: 'SUPPLIER',
        phone: '0599000002',
        address: 'Nablus',
      },
    ],
  },
  null,
  2
);

const uniqueSuffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

test('extended: smart import dry run completes for external file analysis', async ({ page }) => {
  test.setTimeout(120_000);
  installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await navigateToDefinitionsMode(page, 'DATA_IMPORT');
  await expect(page.getByTestId('data-import-root')).toBeVisible({ timeout: 45_000 });

  await page.getByTestId('data-import-analyze-input').setInputFiles({
    name: 'contacts-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(sampleImportPayload, 'utf8'),
  });

  await expect(page.getByTestId('data-import-detected-datasets')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('data-import-full-dry-run')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('data-import-full-dry-run').click();

  await expect(page.getByTestId('data-import-summary')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('data-import-summary')).toContainText(/Rows|الصفوف/i);

  runtimeGuards.assertClean();
});

test('extended: warehouse manager core sections render without navigation regressions', async ({ page }) => {
  installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await navigateToTab(page, 'warehouses');
  await expect(page.getByTestId('warehouse-manager-root')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('warehouse-section-list')).toBeVisible();

  await page.getByTestId('warehouse-tab-inventory').click();
  await expect(page.getByTestId('warehouse-section-inventory')).toBeVisible();

  await page.getByTestId('warehouse-tab-adjust').click();
  await expect(page.getByTestId('warehouse-section-adjust')).toBeVisible();

  await page.getByTestId('warehouse-tab-transfer').click();
  await expect(page.getByTestId('warehouse-section-transfer')).toBeVisible();

  await page.getByTestId('warehouse-tab-history').click();
  await expect(page.getByTestId('warehouse-section-history')).toBeVisible();

  await page.getByTestId('warehouse-tab-barcode_offline').click();
  await expect(page.getByTestId('warehouse-section-barcode-offline')).toBeVisible();

  runtimeGuards.assertClean();
});

test('extended: HR reports menu opens attendance and payroll statement reports', async ({ page }) => {
  installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await navigateToTab(page, 'hr');
  await expect(page.getByTestId('hr-manager-root')).toBeVisible({ timeout: 45_000 });

  await page.getByTestId('hr-tab-reports').click();
  await expect(page.getByTestId('hr-report-card-attendance_summary')).toBeVisible();
  await expect(page.getByTestId('hr-report-card-payroll_statements')).toBeVisible();

  await page.getByTestId('hr-report-card-attendance_summary').click();
  await expect(page.getByTestId('hr-report-attendance-summary')).toBeVisible();

  await page.getByTestId('hr-tab-reports').click();
  await expect(page.getByTestId('hr-report-card-payroll_statements')).toBeVisible();
  await page.getByTestId('hr-report-card-payroll_statements').click();
  await expect(page.getByTestId('hr-report-payroll-statements')).toBeVisible();

  runtimeGuards.assertClean();
});

test('extended: product creation and stock transfer complete through warehouse flow', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);
  const suffix = uniqueSuffix();
  const productName = `E2E Product ${suffix}`;
  const warehouseName = `E2E Branch ${suffix}`;

  await ensureAuthenticated(page);

  await navigateToTab(page, 'products');
  await expect(page.getByTestId('product-list-root')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('products-add-toggle').click();
  await expect(page.getByTestId('products-form')).toBeVisible();
  await page.getByTestId('products-form-name').fill(productName);
  await page.getByTestId('products-form-buy-price').fill('10');
  await page.getByTestId('products-form-sell-price').fill('20');
  await page.getByTestId('products-form-stock').fill('7');
  await page.getByTestId('products-form-save').click();
  await expect(page.getByTestId('products-form')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(productName, { exact: false })).toBeVisible({ timeout: 20_000 });

  await navigateToTab(page, 'warehouses');
  await expect(page.getByTestId('warehouse-manager-root')).toBeVisible({ timeout: 45_000 });
  const initialWarehouseCount = await page.getByTestId('warehouse-card').count();

  await page.getByTestId('warehouse-add-toggle').click();
  await expect(page.getByTestId('warehouse-form')).toBeVisible();
  await page.getByTestId('warehouse-form-name').fill(warehouseName);
  await page.getByTestId('warehouse-form-location').fill('E2E Location');
  await page.getByTestId('warehouse-form-manager').fill('E2E Keeper');
  await page.getByTestId('warehouse-form-save').click();
  await expect(page.getByTestId('warehouse-card')).toHaveCount(initialWarehouseCount + 1, { timeout: 20_000 });
  await expect(page.getByText(warehouseName, { exact: false })).toBeVisible();

  await page.getByTestId('warehouse-tab-transfer').click();
  await expect(page.getByTestId('warehouse-section-transfer')).toBeVisible();
  await page.getByTestId('warehouse-transfer-from').selectOption({ index: 1 });
  await page.getByTestId('warehouse-transfer-to').selectOption({ label: warehouseName });
  await page.getByTestId('warehouse-transfer-product').selectOption({ label: `${productName} (7)` });
  await page.getByTestId('warehouse-transfer-qty').fill('2');
  await page.getByTestId('warehouse-transfer-add-item').click();
  await expect(page.getByTestId('warehouse-transfer-items')).toContainText(productName);
  await page.getByTestId('warehouse-transfer-notes').fill(`transfer ${suffix}`);
  await page.getByTestId('warehouse-tab-history').click();
  const initialHistoryCount = await page.getByTestId('warehouse-history-entry').count();
  await page.getByTestId('warehouse-tab-transfer').click();
  await expect(page.getByTestId('warehouse-section-transfer')).toBeVisible();
  await page.getByTestId('warehouse-transfer-submit').click();

  await page.getByTestId('warehouse-tab-history').click();
  await expect(page.getByTestId('warehouse-history-entry')).toHaveCount(initialHistoryCount + 1, { timeout: 20_000 });
  expect(dialogMessages.filter((message) => /required|يرجى|cannot|stock/i.test(message))).toEqual([]);

  runtimeGuards.assertClean();
});

test('extended: employee payroll accrual and payment reach payroll report', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);
  const suffix = uniqueSuffix();
  const employeeName = `E2E Payroll ${suffix}`;
  const employeeCode = `E2E-${suffix}`;

  await ensureAuthenticated(page);
  await navigateToTab(page, 'hr');
  await expect(page.getByTestId('hr-manager-root')).toBeVisible({ timeout: 45_000 });

  await page.getByTestId('hr-tab-employees').click();
  await page.getByTestId('hr-add-employee').click();
  await expect(page.getByTestId('hr-employee-form')).toBeVisible();
  await page.getByTestId('hr-employee-name').fill(employeeName);
  await page.getByTestId('hr-employee-code').fill(employeeCode);
  await page.getByTestId('hr-employee-position').fill('E2E Accountant');
  await page.getByTestId('hr-employee-basic-pay').fill('2500');
  await page.getByTestId('hr-employee-save').click();
  await expect(page.getByTestId('hr-employee-form')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(employeeName, { exact: false })).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('hr-tab-payroll').click();
  await expect(page.getByTestId('hr-payroll-root')).toBeVisible();
  await page.getByTestId('hr-payroll-scope').selectOption({ label: `${employeeCode} - ${employeeName}` });
  await page.getByTestId('hr-payroll-payment-account').selectOption('acc_cash');
  await page.getByTestId('hr-payroll-expense-account').selectOption('acc_exp_salaries');

  await page.getByTestId('hr-payroll-accrual-all').click();
  await expect.poll(
    () => dialogMessages.some((message) => /posted accrual|ترحيل استحقاق|تم بنجاح ترحيل/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();
  await expect(page.getByTestId('hr-payroll-accrual-all')).toContainText('(0)', { timeout: 20_000 });

  await page.getByTestId('hr-payroll-payment-all').click();
  await expect.poll(
    () => dialogMessages.some((message) => /paid salaries|صرف رواتب|تم بنجاح صرف رواتب/i.test(message)),
    { timeout: 20_000 }
  ).toBeTruthy();

  await page.getByTestId('hr-tab-reports').click();
  await page.getByTestId('hr-report-card-payroll_statements').click();
  await expect(page.getByTestId('hr-report-payroll-statements')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('hr-report-payroll-statements')).toContainText(employeeName);

  runtimeGuards.assertClean();
});
