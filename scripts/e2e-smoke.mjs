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
const smokeBrowserAttempts = toSafeInt(process.env.E2E_SMOKE_BROWSER_ATTEMPTS, 2);
const smokeStepRetries = toSafeInt(process.env.E2E_SMOKE_STEP_RETRIES, 2);
const smokeRetryDelayMs = toSafeInt(process.env.E2E_SMOKE_RETRY_DELAY_MS, 250);
const artifactsRoot = process.env.E2E_ARTIFACTS_DIR
  ? path.resolve(rootDir, process.env.E2E_ARTIFACTS_DIR, 'smoke')
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

const withRetries = async (label, action, retries = smokeStepRetries) => {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < retries) {
        console.warn(`[e2e:smoke] step retry ${attempt}/${retries - 1} for ${label}: ${message}`);
        await sleep(smokeRetryDelayMs);
      }
    }
  }
  throw new Error(`[e2e:smoke] step failed after retries (${label}): ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

const runBrowserSmokeFlow = async (page, url) => {
  await withRetries('page.goto', () => page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }));
  await withRetries('waitForSelector #root > *', () => page.waitForSelector('#root > *', { timeout: 20000 }));

  const rootTextLength = await page.$eval('#root', (node) => (node?.textContent || '').trim().length);
  if (rootTextLength < 5) {
    throw new Error('Smoke check failed: app root rendered too little content.');
  }
};

const ensureBuildExists = async () => {
  try {
    await fs.access(distDir);
  } catch {
    throw new Error('Missing dist directory. Run npm run build before e2e:smoke.');
  }
};

const run = async () => {
  await ensureBuildExists();
  console.log(`[e2e:smoke] browser requirement: ${requireBrowser ? 'strict' : 'fallback-allowed'}`);

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
    throw new Error('Smoke E2E could not resolve preview URL.');
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
      console.warn(`[e2e:smoke] Playwright launch failed, using HTTP fallback: ${message}`);

      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        await writeArtifactJson('http-fallback.json', {
          capturedAt: new Date().toISOString(),
          mode: 'http-fallback',
          error: `HTTP smoke fallback failed: status ${response.status}`,
          status: response.status,
          url,
          browserLaunchError: message,
        });
        throw new Error(`HTTP smoke fallback failed: status ${response.status}`);
      }

      const html = await response.text();
      if (!/id=["']root["']/.test(html)) {
        await writeArtifact('http-fallback.html', html);
        await writeArtifactJson('http-fallback.json', {
          capturedAt: new Date().toISOString(),
          mode: 'http-fallback',
          error: 'HTTP smoke fallback failed: #root container is missing.',
          status: response.status,
          url,
        });
        throw new Error('HTTP smoke fallback failed: #root container is missing.');
      }

      console.log('Smoke E2E passed (HTTP fallback).');
      return;
    }

    let lastError;
    for (let attempt = 1; attempt <= smokeBrowserAttempts; attempt += 1) {
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
        await runBrowserSmokeFlow(page, url);

        if (pageErrors.length > 0) {
          throw new Error(`Smoke check failed with page errors:\n${pageErrors.join('\n')}`);
        }

        if (severeConsoleErrors.length > 0) {
          throw new Error(`Smoke check failed with console errors:\n${severeConsoleErrors.join('\n')}`);
        }

        console.log(`Smoke E2E passed (attempt ${attempt}/${smokeBrowserAttempts}).`);
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
        console.warn(`[e2e:smoke] browser attempt ${attempt} failed: ${errorMessage}`);
        if (attempt < smokeBrowserAttempts) {
          await sleep(smokeRetryDelayMs);
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
