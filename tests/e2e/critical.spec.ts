import { expect, test } from 'playwright/test';
import {
  ensureAuthenticated,
  installDialogCollector,
  installRuntimeErrorGuards,
  navigateToTab,
  openTrialBalance,
  readTrialBalanceValue,
  selectJournalAccount,
} from './appTestHelpers';

const journalAmount = 123.45;
const journalDescription = 'Playwright critical journal';

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