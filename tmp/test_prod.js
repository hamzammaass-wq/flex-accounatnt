import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Starting Production Diagnostics ---');

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
    console.log('Navigating to https://flexa-erp.com/ ...');
    await page.goto('https://flexa-erp.com/', { waitUntil: 'load', timeout: 30000 });
    console.log('Page loaded. Waiting 10 seconds to detect any loops/crashes...');
    await page.waitForTimeout(10000);
    
    await page.screenshot({ path: 'C:/Users/yusuf/.gemini/antigravity/brain/420121dc-2aa4-4ed1-8ab8-6446fcd39d63/scratch/prod_screenshot.png' });
    console.log('Screenshot saved to scratch/prod_screenshot.png');
  } catch (error) {
    console.error('Error during navigation/wait:', error);
  } finally {
    await browser.close();
    console.log('--- Diagnostics Finished ---');
  }
}

run();
