import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Starting Playwright Test ---');

  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[Browser Page Error]: ${err.message}`);
    if (err.stack) console.error(err.stack);
  });

  page.on('requestfailed', req => {
    console.warn(`[Browser Request Failed]: ${req.url()} - ${req.failure()?.errorText}`);
  });

  try {
    console.log('Navigating to http://localhost:3000/ ...');
    await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 15000 });
    console.log('Page loaded. Clicking guest login...');
    await page.click('button[data-testid="auth-guest-login"]');
    console.log('Clicked guest login. Waiting 30 seconds to observe any loops or crashes...');
    await page.waitForTimeout(30000);
    await page.screenshot({ path: 'C:/Users/yusuf/.gemini/antigravity/brain/a7c6d075-7010-4ab8-b339-84dfb874268b/scratch/guest_screenshot.png' });
    console.log('Screenshot saved to scratch/guest_screenshot.png');
  } catch (error) {
    console.error('Error during navigation/wait:', error);
  } finally {
    await browser.close();
    console.log('--- Test Finished ---');
  }
}

run();
