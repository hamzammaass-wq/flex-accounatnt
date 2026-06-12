import { test, expect } from 'playwright/test';
import { ensureAuthenticated } from './appTestHelpers';

test('debug log React state and localStorage', async ({ page }) => {
  page.on('console', msg => {
    console.log(`PAGE LOG: [${msg.type()}]`, msg.text());
  });

  await ensureAuthenticated(page);
  
  const state = await page.evaluate(() => {
    return {
      localStorageKeys: Object.keys(localStorage),
      companyKeyContent: localStorage.getItem('al_mohaseb_workspace_cmp_default') ? 'EXISTS' : 'MISSING',
      legacyCompanyKeyContent: localStorage.getItem('smart_account_workspace_snapshot_cmp_default') ? 'EXISTS' : 'MISSING',
      currentCompanyId: localStorage.getItem('al_mohaseb_current_company_id'),
      currentUser: localStorage.getItem('al_mohaseb_current_user')
    };
  });
  
  console.log('DEBUG STATE IN TEST:', state);
});
