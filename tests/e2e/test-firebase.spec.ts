import { test } from '@playwright/test';

test('debug-firebase: open live site and check for errors', async ({ page }) => {
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.message}`);
    console.error(err.stack);
  });

  console.log('Navigating to live site...');
  await page.goto('https://smart-account-cc181.web.app/', { timeout: 30000, waitUntil: 'load' });
  console.log('Page loaded. Waiting 10 seconds...');
  await page.waitForTimeout(10000);
  console.log('Finished testing.');
});
