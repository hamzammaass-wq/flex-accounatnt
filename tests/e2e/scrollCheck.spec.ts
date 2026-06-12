import { expect, test } from 'playwright/test';
import { ensureAuthenticated, navigateToTab } from './appTestHelpers';

test('diagnose vertical scrolling on account ledger page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await ensureAuthenticated(page);
  
  // Navigate to reports
  await navigateToTab(page, 'reports');
  await expect(page.getByTestId('financial-reports-root')).toBeVisible();

  // Open Journals category
  await page.getByTestId('reports-category-journals').click();
  await expect(page.getByTestId('reports-open-account_ledger')).toBeVisible();
  await page.getByTestId('reports-open-account_ledger').click();
  await expect(page.getByTestId('financial-reports-active-ACCOUNT_LEDGER')).toBeVisible();

  // Wait for the ledger table to load
  await page.waitForTimeout(2000);

  // Measure the scrolling container .app-main-scroll
  const scrollContainer = page.locator('.app-main-scroll');
  await expect(scrollContainer).toBeVisible();

  const metrics = await scrollContainer.evaluate((el) => {
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      computedStyleOverflowY: window.getComputedStyle(el).overflowY,
      computedStyleHeight: window.getComputedStyle(el).height,
    };
  });

  console.log('--- SCROLL CONTAINER METRICS (INITIAL) ---', metrics);

  // Try to scroll to the bottom
  await scrollContainer.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(1000);

  const metricsAfterScroll = await scrollContainer.evaluate((el) => {
    return {
      scrollTop: el.scrollTop,
      isAtBottom: Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 5,
    };
  });

  console.log('--- SCROLL CONTAINER METRICS (AFTER SCROLL) ---', metricsAfterScroll);

  // Let's also check the height of financial-reports-root and its parents
  const hierarchyMetrics = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="financial-reports-root"]');
    const scroll = document.querySelector('.app-main-scroll');
    return {
      reportsRootHeight: root ? root.getBoundingClientRect().height : null,
      reportsRootPaddingBottom: root ? window.getComputedStyle(root).paddingBottom : null,
      scrollContainerHeight: scroll ? scroll.getBoundingClientRect().height : null,
    };
  });
  console.log('--- HIERARCHY METRICS ---', hierarchyMetrics);

  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
});
