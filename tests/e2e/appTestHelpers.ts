import { expect, Page } from 'playwright/test';

const parseNumberText = (rawValue: string | null | undefined): number => {
  const normalized = String(rawValue || '')
    .replace(/[^0-9.,-]+/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
    if (/favicon|Failed to load resource: net::ERR_/i.test(text)) return;
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
  const guestLogin = page.getByTestId('auth-guest-login');
  if (await guestLogin.count()) {
    await guestLogin.first().click();
  }
  await expect(page.getByTestId('app-main-tab-dashboard')).toBeVisible({ timeout: 45_000 });
};

export const navigateToTab = async (page: Page, tab: string) => {
  await page.evaluate((nextTab) => {
    window.dispatchEvent(new CustomEvent('smart-account:app-navigation', { detail: { tab: nextTab } }));
  }, tab);
  await expect(page.getByTestId(`app-main-tab-${tab}`)).toBeVisible({ timeout: 20_000 });
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

export const readTrialBalanceValue = async (page: Page, testId: string) => {
  const locator = page.getByTestId(testId);
  if (await locator.count()) {
    return parseNumberText(await locator.first().textContent());
  }
  return 0;
};

export const selectJournalAccount = async (page: Page, lineNumber: number, query: string) => {
  const input = page.getByTestId(`journal-line-${lineNumber}-account`);
  await input.click();
  await input.fill(query);
  await input.press('Enter');
};