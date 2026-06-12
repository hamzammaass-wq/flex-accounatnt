import { expect, test } from 'playwright/test';
import { ensureAuthenticated, navigateToTab } from './appTestHelpers';

test('diagnose vertical scrolling with many transactions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await ensureAuthenticated(page);

  // Navigate to transactions list or journal to add multiple entries
  // But wait, the guest account already has transactions!
  // Let's verify by selecting "All" or a wider date range in the report
  
  // Navigate to reports
  await navigateToTab(page, 'reports');
  await expect(page.getByTestId('financial-reports-root')).toBeVisible();

  // Open Journals category
  await page.getByTestId('reports-category-journals').click();
  await expect(page.getByTestId('reports-open-account_ledger')).toBeVisible();
  await page.getByTestId('reports-open-account_ledger').click();
  await expect(page.getByTestId('financial-reports-active-ACCOUNT_LEDGER')).toBeVisible();

  // Change the Date inputs to cover a wider range so all transactions are displayed
  const fromDateInput = page.locator('label').filter({ hasText: /From date|من تاريخ/i }).first().locator('..').locator('input[type="text"]');
  await expect(fromDateInput).toBeVisible();
  await fromDateInput.click();
  await fromDateInput.fill('');
  await fromDateInput.type('01012020'); // 2020 to display all entries
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2000);

  // Measure the scroll metrics of .app-main-scroll
  const scrollContainer = page.locator('.app-main-scroll');
  const metrics = await scrollContainer.evaluate((el) => {
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      overflowY: window.getComputedStyle(el).overflowY,
      height: window.getComputedStyle(el).height,
    };
  });

  console.log('--- TALL SCROLL METRICS ---', metrics);

  // Let's also check the scrollbar and overflow on parents of reports-active
  const reportDiv = page.locator('[data-testid^="financial-reports-active-"]');
  const reportMetrics = await reportDiv.evaluate((el) => {
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      overflow: window.getComputedStyle(el).overflow,
      display: window.getComputedStyle(el).display,
    };
  });
  console.log('--- REPORT ACTIVE ELEMENT METRICS ---', reportMetrics);

  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
});
