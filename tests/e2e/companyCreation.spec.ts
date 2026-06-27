import { expect, test } from 'playwright/test';
import { ensureAuthenticated, installDialogCollector, installRuntimeErrorGuards, navigateToDefinitionsMode } from './appTestHelpers';

test('create company from switcher and check', async ({ page }) => {
  const dialogMessages = installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);

  // Navigate to tab definitions, then setMode('COMPANIES')
  await navigateToDefinitionsMode(page, 'COMPANIES');

  // Verify companies form is visible
  await expect(page.getByText(/Company limit in account|حد الشركات في الحساب/i)).toBeVisible({ timeout: 20_000 });

  // Type new company name
  const testCompanyName = `E2E Test Company ${Date.now()}`;
  const input = page.locator('input[placeholder="Company name"], input[placeholder="اسم الشركة"]');
  await expect(input).toBeVisible();
  await input.fill(testCompanyName);

  // Click Add
  const addButton = page.getByRole('button', { name: /Add|إضافة/i });
  await addButton.click();

  // It alerts "تم إنشاء الشركة بنجاح" or "Company created successfully."
  await expect.poll(
    () => dialogMessages.some(msg => 
      msg.includes('تم إنشاء الشركة بنجاح') || 
      msg.includes('Company created successfully')
    ), 
    { timeout: 20_000 }
  ).toBe(true);

  // Verify the new company is listed (resolved to first element to avoid strict mode violations as the company name appears in header as well)
  await expect(page.getByText(testCompanyName).first()).toBeVisible({ timeout: 20_000 });

  runtimeGuards.assertClean();
});
