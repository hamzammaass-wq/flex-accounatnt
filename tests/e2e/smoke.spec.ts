import { expect, test } from 'playwright/test';
import { ensureAuthenticated, installDialogCollector, installRuntimeErrorGuards, navigateToTab, openTrialBalance } from './appTestHelpers';

test('smoke: app boots and key views render', async ({ page }) => {
  installDialogCollector(page);
  const runtimeGuards = installRuntimeErrorGuards(page);

  await ensureAuthenticated(page);
  await openTrialBalance(page);
  await navigateToTab(page, 'dashboard');
  await expect(page.getByTestId('app-main-tab-dashboard')).toBeVisible();

  runtimeGuards.assertClean();
});