import { expect, test } from 'playwright/test';
import { ensureAuthenticated, navigateToTab } from './appTestHelpers';

test('verify trial balance report date input focus remains after click', async ({ page }) => {
  await ensureAuthenticated(page);
  
  // Navigate to reports
  await navigateToTab(page, 'reports');
  await expect(page.getByTestId('financial-reports-root')).toBeVisible();
  
  // Open Financial category
  await page.getByTestId('reports-category-financial').click();
  await expect(page.getByTestId('reports-open-trial_balance')).toBeVisible();
  await page.getByTestId('reports-open-trial_balance').click();
  await expect(page.getByTestId('financial-reports-active-TRIAL_BALANCE')).toBeVisible();

  // Find the date input
  const fromDateInput = page.locator('label').filter({ hasText: /From date|من تاريخ/i }).first().locator('..').locator('input[type="text"]');
  await expect(fromDateInput).toBeVisible();

  // Click on the input
  await fromDateInput.click();
  await page.waitForTimeout(500);

  // Check if it is still focused
  const isFocused = await fromDateInput.evaluate((el) => document.activeElement === el);
  console.log('--- TRIAL BALANCE: IS FOCUSED AFTER CLICK ---', isFocused);
  expect(isFocused).toBe(true);

  // Try typing
  await fromDateInput.fill('');
  await fromDateInput.type('01012026');
  await page.waitForTimeout(500);
  const finalValue = await fromDateInput.inputValue();
  console.log('--- TRIAL BALANCE: VALUE AFTER TYPING ---', finalValue);
  expect(finalValue).toBe('01/01/2026');
});

test('verify customer statement report date input focus remains after click', async ({ page }) => {
  await ensureAuthenticated(page);
  
  // Navigate to reports
  await navigateToTab(page, 'reports');
  await expect(page.getByTestId('financial-reports-root')).toBeVisible();
  
  // Open Sales category
  await page.getByTestId('reports-category-sales').click();
  await expect(page.getByTestId('reports-open-customer_statement')).toBeVisible();
  await page.getByTestId('reports-open-customer_statement').click();
  await expect(page.getByTestId('financial-reports-active-CUSTOMER_STATEMENT')).toBeVisible();

  // Test the header date inputs (always present)
  const headerFromDateInput = page.locator('label').filter({ hasText: /From date|من تاريخ/i }).first().locator('..').locator('input[type="text"]');
  await expect(headerFromDateInput).toBeVisible();

  await headerFromDateInput.click();
  await page.waitForTimeout(500);
  const isFocused = await headerFromDateInput.evaluate((el) => document.activeElement === el);
  console.log('--- CUSTOMER STATEMENT HEADER: IS FOCUSED AFTER CLICK ---', isFocused);
  expect(isFocused).toBe(true);

  // Check if there is a customer statement body and test its inputs if visible
  const bodyFromDateInput = page.locator('label').filter({ hasText: /From date|من تاريخ/i }).nth(1).locator('..').locator('input[type="text"]');
  if (await bodyFromDateInput.isVisible()) {
    await bodyFromDateInput.click();
    await page.waitForTimeout(500);
    const isBodyFocused = await bodyFromDateInput.evaluate((el) => document.activeElement === el);
    console.log('--- CUSTOMER STATEMENT BODY: IS FOCUSED AFTER CLICK ---', isBodyFocused);
    expect(isBodyFocused).toBe(true);
  } else {
    console.log('--- CUSTOMER STATEMENT BODY DATE INPUT NOT VISIBLE (NO CUSTOMER SELECTED) ---');
  }
});
