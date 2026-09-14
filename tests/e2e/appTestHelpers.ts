import { expect, Page } from 'playwright/test';

const parseNumberText = (rawValue: string | null | undefined): number => {
  const normalized = String(rawValue || '')
    .replace(/[^0-9.,-]+/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const readNumericValue = async (page: Page, testId: string) => {
  const locator = page.getByTestId(testId);
  const element = locator.first();
  await expect(element).toBeVisible({ timeout: 20_000 });
  // Form controls expose their displayed value through `.value`, while their
  // textContent is always empty. Support both controls and ordinary text nodes.
  const value = await element.evaluate((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      return node.value;
    }
    return node.textContent || '';
  });
  return parseNumberText(value);
};

export const installDialogCollector = (page: Page): string[] => {
  const messages: string[] = [];

  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });

  return messages;
};

export const installRuntimeErrorGuards = (page: Page) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/favicon|Failed to load resource: net::ERR_|Firestore NOT initialized|Firebase.*Debug info/i.test(text)) return;
    consoleErrors.push(text);
  });

  return {
    assertClean: () => {
      expect(pageErrors, `Unexpected page errors: ${pageErrors.join('\n')}`).toEqual([]);
      expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    },
  };
};

export const ensureAuthenticated = async (page: Page) => {
  await page.goto('/');

  // Inject E2E mock data and disable Firebase into localStorage to replace wiped default mock data
  await page.evaluate(() => {
    localStorage.setItem('disableFirebase', 'true');
    const mockSnapshot = {
      schemaVersion: 1,
      companyId: 'cmp_default',
      updatedAt: new Date().toISOString(),
      baseCurrency: 'ILS',
      products: [
        { id: 'p1', name: 'Laptop i7', itemCode: 'ITM-001', itemCodeMode: 'AUTO', buyPrice: 2500, sellPrice: 3200, stock: 15, category: 'ig_electronics', barcode: '628100000001', warehouseStock: [{ warehouseId: 'wh_main', quantity: 15 }] },
        { id: 'p4', name: 'Office Chair', itemCode: 'ITM-004', itemCodeMode: 'AUTO', buyPrice: 300, sellPrice: 450, stock: 12, category: 'ig_furniture', barcode: '628100000004', warehouseStock: [{ warehouseId: 'wh_main', quantity: 12 }] }
      ],
      contacts: [
        { id: 'c1', name: 'شركة التوريدات الحديثة', type: 'SUPPLIER', phone: '0501234567', preferredPriceTier: 'WHOLESALE' },
        { id: 'c2', name: 'مؤسسة النجاح التجارية', type: 'CUSTOMER', phone: '0559876543', preferredPriceTier: 'RETAIL' }
      ]
    };
    localStorage.setItem('al_mohaseb_workspace_cmp_default', JSON.stringify(mockSnapshot));
    localStorage.setItem('smart_account_workspace_snapshot_cmp_default', JSON.stringify(mockSnapshot));
  });

  // Reload the page to ensure the Firebase initialization re-runs and reads the new flag
  await page.reload();

  const guestLogin = page.getByTestId('auth-guest-login');
  const readyState = page.locator(
    '[data-testid="auth-guest-login"], [data-testid="app-main-tab-dashboard"], [data-testid="app-main-tab-definitions"]'
  );
  await expect(readyState).toBeVisible({ timeout: 45_000 });

  if (await guestLogin.isVisible().catch(() => false)) {
    await guestLogin.first().click();
  }
  await expect(
    page.locator('[data-testid="app-main-tab-dashboard"], [data-testid="app-main-tab-definitions"]')
  ).toBeVisible({ timeout: 45_000 });
};

export const navigateToTab = async (page: Page, tab: string) => {
  await page.evaluate((nextTab) => {
    window.dispatchEvent(new CustomEvent('smart-account:app-navigation', { detail: { tab: nextTab } }));
  }, tab);
  await expect(page.getByTestId(`app-main-tab-${tab}`)).toBeVisible({ timeout: 20_000 });
};

export const navigateToDefinitionsMode = async (page: Page, mode: string) => {
  await page.evaluate((nextMode) => {
    window.dispatchEvent(
      new CustomEvent('smart-account:app-navigation', {
        detail: { tab: 'definitions', definitionsMode: nextMode },
      })
    );
  }, mode);
  await expect(page.getByTestId('app-main-tab-definitions')).toBeVisible({ timeout: 20_000 });
};

export const openTrialBalance = async (page: Page) => {
  await navigateToTab(page, 'reports');
  await expect(page.getByTestId('financial-reports-root')).toBeVisible();
  await page.getByTestId('reports-category-financial').click();
  await expect(page.getByTestId('reports-open-trial_balance')).toBeVisible();
  await page.getByTestId('reports-open-trial_balance').click();
  await expect(page.getByTestId('financial-reports-active-TRIAL_BALANCE')).toBeVisible();
  await expect(page.getByTestId('trial-balance-table')).toBeVisible();
};

export const openFinancialReport = async (page: Page, reportId: 'income_statement' | 'balance_sheet') => {
  await navigateToTab(page, 'reports');
  await expect(page.getByTestId('financial-reports-root')).toBeVisible();
  await page.getByTestId('reports-category-financial').click();
  await page.getByTestId(`reports-open-${reportId}`).click();
  await expect(page.getByTestId(`financial-reports-active-${reportId.toUpperCase()}`)).toBeVisible();
};

export const readTrialBalanceValue = async (page: Page, testId: string) => {
  const locator = page.getByTestId(testId);
  if (await locator.count()) {
    return parseNumberText(await locator.first().textContent());
  }
  return 0;
};

export const readTrialBalanceRow = async (page: Page, accountId: string) => ({
  debit: await readTrialBalanceValue(page, `trial-balance-row-${accountId}-debit`),
  credit: await readTrialBalanceValue(page, `trial-balance-row-${accountId}-credit`),
  balance: await readTrialBalanceValue(page, `trial-balance-row-${accountId}-balance`),
});

export const chooseSearchableValue = async (page: Page, testId: string, query: string) => {
  const input = page.getByTestId(testId);
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.click();
  await input.fill(query);
  await input.press('Enter');
};

export const selectJournalAccount = async (page: Page, lineNumber: number, query: string) => {
  const input = page.getByTestId(`journal-line-${lineNumber}-account`);
  await input.click();
  await input.fill(query);
  await input.press('Enter');
};

export const openSalesInvoiceForm = async (page: Page) => {
  await navigateToTab(page, 'sales');
  await expect(page.getByTestId('app-main-tab-sales')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('sales-add-action').click();
  await expect(page.getByTestId('invoice-form-root')).toBeVisible({ timeout: 20_000 });
};

export const openPurchaseInvoiceForm = async (page: Page) => {
  await navigateToTab(page, 'purchases');
  await expect(page.getByTestId('purchase-list-root')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('purchase-add-action').click();
  await expect(page.getByTestId('invoice-form-root')).toBeVisible({ timeout: 20_000 });
};

export const openPurchaseReturnForm = async (page: Page) => {
  await navigateToTab(page, 'purchases');
  await expect(page.getByTestId('purchase-list-root')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('purchase-tab-returns').click();
  await page.getByTestId('purchase-add-action').click();
  await expect(page.getByTestId('invoice-form-root')).toBeVisible({ timeout: 20_000 });
};

export const openReceiptVoucherForm = async (page: Page) => {
  await navigateToTab(page, 'receipts-list');
  await expect(page.getByTestId('voucher-manager-receipt')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('voucher-add-action').click();
  await expect(page.getByTestId('voucher-form-root')).toBeVisible({ timeout: 20_000 });
};

export const openPaymentVoucherForm = async (page: Page) => {
  await navigateToTab(page, 'payments-list');
  await expect(page.getByTestId('voucher-manager-payment')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('voucher-add-action').click();
  await expect(page.getByTestId('voucher-form-root')).toBeVisible({ timeout: 20_000 });
};
