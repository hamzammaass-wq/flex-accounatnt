import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, 'dist');
const host = '127.0.0.1';
const preferredPort = 0;
const requireBrowser = process.argv.includes('--require-browser') || process.env.E2E_REQUIRE_BROWSER === '1';
const toSafeInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browserFlowMaxAttempts = toSafeInt(process.env.E2E_CRITICAL_BROWSER_ATTEMPTS, 2);
const selectorStepRetries = toSafeInt(process.env.E2E_CRITICAL_STEP_RETRIES, 2);
const criticalRetryDelayMs = toSafeInt(process.env.E2E_CRITICAL_RETRY_DELAY_MS, 300);
const artifactsRoot = process.env.E2E_ARTIFACTS_DIR
  ? path.resolve(rootDir, process.env.E2E_ARTIFACTS_DIR, 'critical')
  : null;

const ensureArtifactsDir = async () => {
  if (!artifactsRoot) return null;
  await fs.mkdir(artifactsRoot, { recursive: true });
  return artifactsRoot;
};

const writeArtifact = async (fileName, content) => {
  const dir = await ensureArtifactsDir();
  if (!dir) return;
  await fs.writeFile(path.join(dir, fileName), content, 'utf8');
};

const writeArtifactJson = async (fileName, payload) => {
  await writeArtifact(fileName, JSON.stringify(payload, null, 2));
};

const captureFailureArtifacts = async (page, attempt, details) => {
  const safeAttempt = `attempt-${attempt}`;
  await writeArtifactJson(`${safeAttempt}.json`, {
    capturedAt: new Date().toISOString(),
    ...details,
  });

  if (!page) return;

  try {
    const html = await page.content();
    await writeArtifact(`${safeAttempt}.html`, html);
  } catch {
    // Ignore snapshot capture failures.
  }

  try {
    const dir = await ensureArtifactsDir();
    if (dir) {
      await page.screenshot({ path: path.join(dir, `${safeAttempt}.png`), fullPage: true });
    }
  } catch {
    // Ignore screenshot capture failures.
  }
};

const criticalSourceAnchors = [
  {
    file: 'components/AuthScreen.tsx',
    tokens: ['data-testid="auth-guest-login"'],
  },
  {
    file: 'App.tsx',
    tokens: [
      'data-testid={`app-main-tab-${activeTab}`}',
      'data-testid={`overlay-${overlay}`}',
      'APP_NAVIGATION_EVENT_NAME',
    ],
  },
  {
    file: 'components/SalesInvoiceList.tsx',
    tokens: ['data-testid="sales-add-action"'],
  },
  {
    file: 'components/FinancialReports.tsx',
    tokens: [
      'data-testid="financial-reports-root"',
      'data-testid={`financial-reports-active-${activeReport}`}',
      'data-testid={`reports-category-${cat.id.toLowerCase()}`}',
      'data-testid={`reports-open-${report.id.toLowerCase()}`}',
    ],
  },
];

const ensureBuildExists = async () => {
  try {
    await fs.access(distDir);
  } catch {
    throw new Error('Missing dist directory. Run npm run build before e2e:critical.');
  }
};

const runNonBrowserFallbackValidation = async (url) => {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    await writeArtifactJson('fallback.json', {
      capturedAt: new Date().toISOString(),
      mode: 'fallback',
      error: `Critical fallback failed: preview responded with status ${response.status}.`,
      status: response.status,
      url,
    });
    throw new Error(`Critical fallback failed: preview responded with status ${response.status}.`);
  }

  const html = await response.text();
  if (!/id=["']root["']/.test(html)) {
    await writeArtifact('fallback.html', html);
    await writeArtifactJson('fallback.json', {
      capturedAt: new Date().toISOString(),
      mode: 'fallback',
      error: 'Critical fallback failed: #root container is missing from preview HTML.',
      status: response.status,
      url,
    });
    throw new Error('Critical fallback failed: #root container is missing from preview HTML.');
  }

  const missing = [];

  for (const anchor of criticalSourceAnchors) {
    const targetPath = path.resolve(rootDir, anchor.file);
    const source = await fs.readFile(targetPath, 'utf8');
    for (const token of anchor.tokens) {
      if (!source.includes(token)) {
        missing.push(`${anchor.file} -> ${token}`);
      }
    }
  }

  if (missing.length > 0) {
    await writeArtifactJson('fallback.json', {
      capturedAt: new Date().toISOString(),
      mode: 'fallback',
      error: 'Critical fallback failed: missing source anchors.',
      missing,
      url,
    });
    throw new Error(`Critical fallback failed: missing source anchors:\n${missing.join('\n')}`);
  }

  console.log('Critical fallback validation passed (HTTP + source anchors).');
};

const withRetries = async (label, action, retries = selectorStepRetries) => {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < retries) {
        console.warn(`[e2e:critical] step retry ${attempt}/${retries - 1} for ${label}: ${message}`);
        await sleep(criticalRetryDelayMs);
      }
    }
  }
  throw new Error(`[e2e:critical] step failed after retries (${label}): ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

const waitForSelectorWithRetry = (page, selector, timeout = 20000) =>
  withRetries(`waitForSelector ${selector}`, () => page.waitForSelector(selector, { timeout }));

const clickWithRetry = (page, selector, timeout = 20000) =>
  withRetries(`click ${selector}`, async () => {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector, { timeout });
  });

const runBrowserCriticalFlow = async (page, url) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  await waitForSelectorWithRetry(page, '[data-testid="auth-guest-login"], [data-testid="app-main-tab-dashboard"]', 30000);

  const guestButton = page.locator('[data-testid="auth-guest-login"]');
  if (await guestButton.count()) {
    await guestButton.first().click();
  }

  await waitForSelectorWithRetry(
    page,
    '[data-testid="app-main-tab-dashboard"], [data-testid="app-main-tab-definitions"]',
    45000
  );

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('smart-account:app-navigation', { detail: { tab: 'sales' } }));
  });

  await waitForSelectorWithRetry(page, '[data-testid="app-main-tab-sales"]', 20000);
  await clickWithRetry(page, '[data-testid="sales-add-action"]', 20000);
  await waitForSelectorWithRetry(page, '[data-testid="overlay-add-sales"]', 20000);
  await withRetries('close sales overlay', async () => {
    const backButton = page.getByRole('button', { name: /Back|رجوع/i }).first();
    await backButton.click({ timeout: 20000 });
    await page.waitForSelector('[data-testid="overlay-add-sales"]', { state: 'hidden', timeout: 20000 });
  });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('smart-account:app-navigation', { detail: { tab: 'reports' } }));
  });
  await waitForSelectorWithRetry(page, '[data-testid="app-main-tab-reports"]', 20000);
  await waitForSelectorWithRetry(page, '[data-testid="financial-reports-root"]', 20000);
  await clickWithRetry(page, '[data-testid="reports-category-financial"]', 20000);
  await waitForSelectorWithRetry(page, '[data-testid="reports-open-trial_balance"]', 20000);
  await clickWithRetry(page, '[data-testid="reports-open-trial_balance"]', 20000);
  await waitForSelectorWithRetry(page, '[data-testid="financial-reports-active-TRIAL_BALANCE"]', 20000);
};

const run = async () => {
  await ensureBuildExists();
  console.log(`[e2e:critical] browser requirement: ${requireBrowser ? 'strict' : 'fallback-allowed'}`);

  const server = await preview({
    root: rootDir,
    preview: {
      host,
      port: preferredPort,
      strictPort: false,
    },
  });

  const resolvedUrl = server.resolvedUrls?.local?.[0];
  if (!resolvedUrl) {
    throw new Error('Critical E2E could not resolve preview URL.');
  }
  const url = String(resolvedUrl).replace(/\/$/, '');

  try {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requireBrowser) {
        await writeArtifactJson('browser-launch.json', {
          capturedAt: new Date().toISOString(),
          mode: 'browser-launch',
          error: message,
          strictMode: true,
        });
        throw new Error(`Playwright launch failed in strict mode: ${message}`);
      }
      console.warn(`[e2e:critical] Playwright launch failed, using non-browser fallback validation: ${message}`);
      await runNonBrowserFallbackValidation(url);
      return;
    }

    let lastError;
    for (let attempt = 1; attempt <= browserFlowMaxAttempts; attempt += 1) {
      const page = await browser.newPage();
      const pageErrors = [];
      const severeConsoleErrors = [];

      page.on('pageerror', (error) => {
        pageErrors.push(String(error?.message || error));
      });

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/favicon|Failed to load resource: net::ERR_/i.test(text)) return;
        severeConsoleErrors.push(text);
      });

      try {
        await runBrowserCriticalFlow(page, url);

        if (pageErrors.length > 0) {
          throw new Error(`Critical flow failed with page errors:\n${pageErrors.join('\n')}`);
        }

        if (severeConsoleErrors.length > 0) {
          throw new Error(`Critical flow failed with console errors:\n${severeConsoleErrors.join('\n')}`);
        }

        console.log(`Critical E2E flows passed (attempt ${attempt}/${browserFlowMaxAttempts}).`);
        lastError = undefined;
        break;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await captureFailureArtifacts(page, attempt, {
          mode: 'browser',
          error: errorMessage,
          pageErrors,
          severeConsoleErrors,
          currentUrl: page.url(),
        });
        console.warn(`[e2e:critical] browser attempt ${attempt} failed: ${errorMessage}`);
        if (attempt < browserFlowMaxAttempts) {
          await sleep(criticalRetryDelayMs);
        }
        lastError = error;
      } finally {
        await page.close();
      }
    }

    await browser.close();

    if (lastError) {
      throw lastError;
    }
  } finally {
    await server.close();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
