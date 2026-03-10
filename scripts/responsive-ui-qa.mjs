import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT_DIR = path.resolve(process.cwd(), 'qa-output');

const SCENARIOS = [
  { id: 'mobile-browser', viewport: { width: 360, height: 800 }, standalone: false },
  { id: 'mobile-standalone', viewport: { width: 360, height: 800 }, standalone: true },
  { id: 'tablet-browser', viewport: { width: 834, height: 1194 }, standalone: false },
  { id: 'tablet-standalone', viewport: { width: 834, height: 1194 }, standalone: true }
];

const demoUser = {
  id: 'usr_admin',
  name: 'System Admin',
  email: 'admin@smart.local',
  role: 'ADMIN',
  status: 'ACTIVE'
};

const demoCompany = {
  id: 'cmp_default',
  name: 'QA Company',
  createdAt: new Date().toISOString(),
  trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
};

const slugify = (value, fallback) => {
  const normalized = (value || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
};

const collectMetrics = async (page) =>
  page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const maxScrollWidth = Math.max(html.scrollWidth, body.scrollWidth);
    const clientWidth = Math.min(html.clientWidth, body.clientWidth);
    const hasHorizontalOverflow = maxScrollWidth > clientWidth + 1;

    const nav = document.querySelector('nav.app-bottom-nav');
    const navRect = nav?.getBoundingClientRect();

    const visibleFixedElements = Array.from(document.querySelectorAll('*')).filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;

    return {
      title: document.title,
      deviceClass: html.dataset.deviceClass || null,
      launchMode: html.dataset.launchMode || null,
      hasHorizontalOverflow,
      maxScrollWidth,
      clientWidth,
      mainScrollPaddingBottom: window.getComputedStyle(
        document.querySelector('.app-main-scroll') || document.body
      ).paddingBottom,
      appPagePaddingBottom: window.getComputedStyle(
        document.querySelector('.app-page') || document.body
      ).paddingBottom,
      bottomNav: navRect
        ? {
            top: Math.round(navRect.top),
            bottom: Math.round(navRect.bottom),
            height: Math.round(navRect.height)
          }
        : null,
      visibleFixedElements
    };
  });

const tryQuickActionOverlay = async (page, scenarioId) => {
  await page.locator('nav.app-bottom-nav button').first().click();
  await page.waitForTimeout(700);

  const quickButtons = page.locator('div.grid.grid-cols-5 button');
  const count = await quickButtons.count();
  if (count === 0) {
    return { attempted: false, reason: 'No quick-action buttons found' };
  }

  await quickButtons.first().click();
  await page.waitForTimeout(1000);

  const overlayState = await page.evaluate(() => {
    const fixedPanels = Array.from(document.querySelectorAll('*')).filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed') return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.6;
    });

    const backButtonExists = Array.from(document.querySelectorAll('button')).some((btn) => {
      const text = (btn.textContent || '').trim();
      return text.includes('رجوع') || text.toLowerCase().includes('back');
    });

    return {
      fixedPanelCount: fixedPanels.length,
      backButtonExists
    };
  });

  const overlayShot = `${scenarioId}-overlay-quick-action.png`;
  await page.screenshot({ path: path.join(OUTPUT_DIR, overlayShot), fullPage: true });

  const maybeBackButton = page.locator('button').filter({ hasText: /رجوع|Back/i }).first();
  if (await maybeBackButton.count()) {
    await maybeBackButton.click();
    await page.waitForTimeout(700);
  } else {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  return {
    attempted: true,
    quickButtonsCount: count,
    screenshot: overlayShot,
    ...overlayState
  };
};

const runScenario = async (scenario) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: scenario.viewport,
    locale: 'ar-EG'
  });

  await context.addInitScript((standalone) => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('display-mode: standalone')) {
        return {
          matches: standalone,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false
        };
      }
      return originalMatchMedia(query);
    };

    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => standalone
    });
  }, scenario.standalone);

  await context.addInitScript(({ user, company }) => {
    localStorage.setItem('al_mohaseb_user', JSON.stringify(user));
    localStorage.setItem('al_mohaseb_companies', JSON.stringify([company]));
    localStorage.setItem('al_mohaseb_current_company', company.id);
  }, { user: demoUser, company: demoCompany });

  const page = await context.newPage();
  const errors = [];
  const warnings = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console-error: ${msg.text()}`);
    if (msg.type() === 'warning') warnings.push(`console-warning: ${msg.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const navButtons = page.locator('nav.app-bottom-nav button');
  const navCount = await navButtons.count();
  if (navCount === 0) {
    const html = await page.content();
    await browser.close();
    return {
      scenario: scenario.id,
      viewport: scenario.viewport,
      standaloneMocked: scenario.standalone,
      navCount: 0,
      errors: [...errors, 'No bottom nav buttons found'],
      warnings,
      tabs: [],
      quickActionOverlay: { attempted: false, reason: 'No bottom nav' },
      htmlSnippet: html.slice(0, 1500)
    };
  }

  const tabs = [];
  for (let i = 0; i < navCount; i += 1) {
    const button = navButtons.nth(i);
    const labelRaw = (await button.innerText()).trim().replace(/\s+/g, ' ');
    const label = labelRaw || `tab-${i + 1}`;

    await button.click();
    await page.waitForTimeout(900);

    const metrics = await collectMetrics(page);
    const shotName = `${scenario.id}-${String(i + 1).padStart(2, '0')}-${slugify(label, `tab-${i + 1}`)}.png`;
    await page.screenshot({ path: path.join(OUTPUT_DIR, shotName), fullPage: true });

    tabs.push({
      index: i + 1,
      label,
      screenshot: shotName,
      metrics
    });
  }

  const quickActionOverlay = await tryQuickActionOverlay(page, scenario.id);

  await browser.close();

  return {
    scenario: scenario.id,
    viewport: scenario.viewport,
    standaloneMocked: scenario.standalone,
    navCount,
    errors,
    warnings,
    tabs,
    quickActionOverlay
  };
};

const main = async () => {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const report = [];
  for (const scenario of SCENARIOS) {
    // eslint-disable-next-line no-console
    console.log(`Running: ${scenario.id}`);
    const result = await runScenario(scenario);
    report.push(result);
  }

  const reportPath = path.join(OUTPUT_DIR, 'responsive-qa-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  // eslint-disable-next-line no-console
  console.log(`QA report written to: ${reportPath}`);
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
