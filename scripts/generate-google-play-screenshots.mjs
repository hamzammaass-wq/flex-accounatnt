import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { preview } from 'vite';

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, 'dist');
const outputDir = path.resolve(rootDir, 'store-assets', 'google-play');
const rawDir = path.join(outputDir, 'raw');
const finalDir = path.join(outputDir, 'final');
const host = '127.0.0.1';

const appViewport = { width: 430, height: 930 };
const storeViewport = { width: 1080, height: 1920 };

const demoProducts = [
  { name: 'سماعات بلوتوث Flex', buyPrice: '75', stock: '24', sellPrice: '120' },
  { name: 'طابعة حرارية للمبيعات', buyPrice: '290', stock: '8', sellPrice: '420' },
  { name: 'قارئ باركود لاسلكي', buyPrice: '110', stock: '15', sellPrice: '180' },
];

const shots = [
  {
    id: 'dashboard',
    title: 'إدارة مالية كاملة من الجوال',
    subtitle: 'لوحة تحكم تجمع المبيعات والمصاريف والمخزون في مكان واحد',
    accent: '#2563eb',
    tags: ['لوحة تحكم', 'مؤشرات', 'ERP'],
  },
  {
    id: 'sales-invoice',
    title: 'فواتير مبيعات سريعة وواضحة',
    subtitle: 'أضف الأصناف والخصم والضريبة واعتمد الفاتورة بسهولة',
    accent: '#4f46e5',
    tags: ['فواتير', 'ضريبة', 'خصم'],
  },
  {
    id: 'inventory',
    title: 'مخزون وأصناف وباركود',
    subtitle: 'تابع الكميات والأسعار والوحدات وتنبيهات النقص',
    accent: '#0891b2',
    tags: ['أصناف', 'أسعار', 'مستودعات'],
  },
  {
    id: 'treasury',
    title: 'النقدية والبنوك تحت السيطرة',
    subtitle: 'إدارة الصناديق والحسابات الجارية والأرصدة اليومية',
    accent: '#059669',
    tags: ['صناديق', 'بنوك', 'أرصدة'],
  },
  {
    id: 'reports',
    title: 'تقارير محاسبية جاهزة',
    subtitle: 'ميزان مراجعة، قائمة دخل، كشوف حساب، وتحليلات أعمال',
    accent: '#7c3aed',
    tags: ['تقارير', 'تحليل', 'تصدير'],
  },
  {
    id: 'usage-guide',
    title: 'دليل استخدام داخل التطبيق',
    subtitle: 'خطوات منظمة تساعدك على إعداد النظام والبدء بسرعة',
    accent: '#ea580c',
    tags: ['تعليمات', 'إعداد', 'مساعدة'],
  },
];

const fileUrl = (targetPath) => {
  const normalized = path.resolve(targetPath).replace(/\\/g, '/');
  return `file:///${encodeURI(normalized)}`;
};

const imageDataUrl = async (targetPath) => {
  const ext = path.extname(targetPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  const data = await fs.readFile(targetPath);
  return `data:${mime};base64,${data.toString('base64')}`;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeText = (value) => escapeHtml(value).replace(/\n/g, '<br />');

const ensureBuildExists = async () => {
  try {
    await fs.access(distDir);
  } catch {
    throw new Error('Missing dist directory. Run npm run build before generating screenshots.');
  }
};

const waitForAny = async (page, selectors, timeout = 60000) => {
  await page.waitForFunction(
    (items) => items.some((selector) => document.querySelector(selector)),
    selectors,
    { timeout }
  );
};

const mockStandaloneMode = async (context) => {
  await context.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query.includes('display-mode: standalone')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        };
      }
      return originalMatchMedia(query);
    };

    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => true,
    });

    window.localStorage.removeItem('al_mohaseb_current_company');
    window.localStorage.setItem('al_mohaseb_guest_trial_started_at', new Date().toISOString());
  });
};

const settleApp = async (page) => {
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.fonts?.ready?.catch?.(() => undefined);
  }).catch(() => undefined);
  await page.waitForTimeout(500);
};

const loginAsGuest = async (page, url) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await waitForAny(page, ['[data-testid="auth-guest-login"]', '[data-testid="app-main-tab-dashboard"]']);

  const guestButton = page.locator('[data-testid="auth-guest-login"]');
  if (await guestButton.count()) {
    await guestButton.first().click();
  }

  await waitForAny(page, ['[data-testid="app-main-tab-dashboard"]', '[data-testid="app-main-tab-definitions"]']);
  await settleApp(page);
};

const navigateTo = async (page, tab, definitionsMode) => {
  await page.evaluate(({ tab: nextTab, definitionsMode: nextDefinitionsMode }) => {
    window.dispatchEvent(new CustomEvent('smart-account:app-navigation', {
      detail: { tab: nextTab, definitionsMode: nextDefinitionsMode },
    }));
  }, { tab, definitionsMode });

  await page.waitForSelector(`[data-testid="app-main-tab-${tab}"]`, { timeout: 30000 });
  await settleApp(page);
};

const scrollMainToTop = async (page) => {
  await page.evaluate(() => {
    const scroller = document.querySelector('.app-main-scroll');
    if (scroller) scroller.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(250);
};

const addProduct = async (page, product) => {
  await page.locator('[data-testid="products-add-toggle"]').click();
  await page.waitForSelector('[data-testid="products-form"]', { timeout: 30000 });
  await page.locator('[data-testid="products-form-name"]').fill(product.name);
  await page.locator('[data-testid="products-form-buy-price"]').fill(product.buyPrice);
  await page.locator('[data-testid="products-form-stock"]').fill(product.stock);
  await page.locator('[data-testid="products-form-sell-price"]').fill(product.sellPrice);
  await page.locator('[data-testid="products-form-save"]').click();
  await page.waitForSelector('[data-testid="products-form"]', { state: 'hidden', timeout: 30000 });
  await settleApp(page);
};

const prepareInventory = async (page) => {
  await navigateTo(page, 'products');
  await page.waitForSelector('[data-testid="product-list-root"]', { timeout: 30000 });

  for (const product of demoProducts) {
    await addProduct(page, product);
  }

  await scrollMainToTop(page);
};

const openSalesInvoiceDraft = async (page) => {
  await navigateTo(page, 'sales');
  await page.locator('[data-testid="sales-add-action"]').click();
  await page.waitForSelector('[data-testid="invoice-form-root"]', { timeout: 30000 });

  const searchInput = page.locator('[data-testid="invoice-item-search"]');
  await searchInput.fill('سماعات');
  await searchInput.focus();
  await page.waitForSelector('.invoice-search-card .absolute button', { timeout: 30000 });
  await page.locator('.invoice-search-card .absolute button').first().click();
  await page.waitForSelector('.invoice-item-row', { timeout: 30000 });

  const visibleDiscount = page.locator('.invoice-discount-input:visible').first();
  if (await visibleDiscount.count()) {
    await visibleDiscount.fill('٥');
  }

  await page.locator('.invoice-items-card').scrollIntoViewIfNeeded();
  await settleApp(page);
};

const postCurrentInvoice = async (page) => {
  const mobileSubmit = page.locator('.transaction-mobile-dock > div > button:visible').first();
  const submit = (await mobileSubmit.count())
    ? mobileSubmit
    : page.locator('[data-testid="invoice-submit-action"]:visible').first();
  if (!(await submit.count())) return false;
  await submit.click({ force: true });
  await page.waitForSelector('[data-testid="overlay-add-sales"]', { state: 'hidden', timeout: 10000 }).catch(async () => {
    const backButton = page.locator('.invoice-mobile-toolbar button:visible').first();
    if (await backButton.count()) {
      await backButton.click().catch(() => undefined);
      await page.waitForSelector('[data-testid="overlay-add-sales"]', { state: 'hidden', timeout: 5000 }).catch(() => undefined);
    }
  });
  await page.waitForTimeout(800);
  return true;
};

const captureRaw = async (page, shotId) => {
  const targetPath = path.join(rawDir, `${shotId}.png`);
  await page.screenshot({ path: targetPath, fullPage: false });
  return targetPath;
};

const renderTemplateHtml = ({ shot, rawDataUrl, logoDataUrl }) => {
  const tags = shot.tags.map((tag) => `<span>${safeText(tag)}</span>`).join('');
  const title = safeText(shot.title);
  const subtitle = safeText(shot.subtitle);
  const accent = escapeHtml(shot.accent);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1080, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 1080px;
      height: 1920px;
      margin: 0;
      overflow: hidden;
      background: #f8fafc;
      font-family: "Tajawal", "Cairo", "Segoe UI", Tahoma, Arial, sans-serif;
    }
    .artboard {
      position: relative;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      color: #0f172a;
      background:
        linear-gradient(180deg, #ffffff 0%, #f7fafc 42%, #eef6ff 100%);
    }
    .accent-band {
      position: absolute;
      inset-inline: 0;
      top: 0;
      height: 18px;
      background: linear-gradient(90deg, #0f172a, ${accent}, #10b981);
    }
    .brand {
      position: absolute;
      top: 56px;
      right: 72px;
      left: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .brand-name {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .brand-logo {
      width: 76px;
      height: 76px;
      border-radius: 22px;
      object-fit: cover;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.16);
    }
    .brand-text {
      min-width: 0;
    }
    .brand-title {
      margin: 0;
      font-size: 29px;
      line-height: 1.1;
      font-weight: 900;
      color: #111827;
      white-space: nowrap;
    }
    .brand-subtitle {
      margin: 7px 0 0;
      font-size: 17px;
      font-weight: 800;
      color: #64748b;
      direction: ltr;
      text-align: right;
    }
    .badge-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-start;
      max-width: 360px;
    }
    .badge-row span {
      display: inline-flex;
      align-items: center;
      min-height: 42px;
      padding: 0 18px;
      border-radius: 999px;
      background: #ffffff;
      border: 1px solid rgba(148, 163, 184, 0.22);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
      color: #334155;
      font-size: 18px;
      font-weight: 900;
      white-space: nowrap;
    }
    .hero-copy {
      position: absolute;
      top: 152px;
      right: 72px;
      left: 72px;
      text-align: right;
    }
    .hero-copy h1 {
      margin: 0;
      max-width: 900px;
      font-size: 62px;
      line-height: 1.16;
      font-weight: 900;
      letter-spacing: 0;
      color: #0f172a;
    }
    .hero-copy p {
      margin: 22px 0 0;
      max-width: 860px;
      font-size: 29px;
      line-height: 1.6;
      font-weight: 800;
      color: #475569;
    }
    .phone {
      position: absolute;
      left: 205px;
      top: 462px;
      width: 670px;
      height: 1407px;
      border-radius: 70px;
      padding: 18px;
      background: #111827;
      box-shadow:
        0 36px 90px rgba(15, 23, 42, 0.25),
        0 16px 34px rgba(15, 23, 42, 0.16),
        inset 0 0 0 2px rgba(255,255,255,0.08);
    }
    .phone::before {
      content: "";
      position: absolute;
      top: 28px;
      left: 50%;
      width: 96px;
      height: 8px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: #273244;
      z-index: 3;
    }
    .screen {
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 54px;
      background: #f8fafc;
    }
    .screen img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      object-position: top center;
    }
    .bottom-strip {
      position: absolute;
      right: 0;
      left: 0;
      bottom: 0;
      height: 22px;
      background: linear-gradient(90deg, #10b981, ${accent}, #0f172a);
    }
  </style>
</head>
<body>
  <div class="artboard">
    <div class="accent-band"></div>
    <header class="brand">
      <div class="brand-name">
        <img class="brand-logo" src="${logoDataUrl}" alt="" />
        <div class="brand-text">
          <p class="brand-title">المحاسب فليكس ERP</p>
          <p class="brand-subtitle">Flex Accountant ERP</p>
        </div>
      </div>
      <div class="badge-row">${tags}</div>
    </header>
    <section class="hero-copy">
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </section>
    <div class="phone">
      <div class="screen">
        <img src="${rawDataUrl}" alt="" />
      </div>
    </div>
    <div class="bottom-strip"></div>
  </div>
</body>
</html>`;
};

const renderStoreShot = async (browser, shot, rawPath, logoDataUrl) => {
  const page = await browser.newPage({ viewport: storeViewport, deviceScaleFactor: 1 });
  const rawDataUrl = await imageDataUrl(rawPath);
  const html = renderTemplateHtml({ shot, rawDataUrl, logoDataUrl });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const targetPath = path.join(finalDir, `${shots.findIndex((item) => item.id === shot.id) + 1}`.padStart(2, '0') + `-${shot.id}.png`);
  await page.screenshot({ path: targetPath, fullPage: false });
  await page.close();
  return targetPath;
};

const main = async () => {
  await ensureBuildExists();
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(finalDir, { recursive: true });

  const server = await preview({
    root: rootDir,
    preview: {
      host,
      port: 0,
      strictPort: false,
    },
  });

  const resolvedUrl = server.resolvedUrls?.local?.[0];
  if (!resolvedUrl) {
    throw new Error('Could not resolve Vite preview URL.');
  }

  const url = String(resolvedUrl).replace(/\/$/, '');
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: appViewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ar-EG',
  });
  await mockStandaloneMode(context);

  const page = await context.newPage();
  page.on('dialog', async (dialog) => {
    await dialog.dismiss().catch(() => undefined);
  });

  const rawPaths = new Map();

  try {
    await loginAsGuest(page, url);
    await prepareInventory(page);

    await openSalesInvoiceDraft(page);
    rawPaths.set('sales-invoice', await captureRaw(page, 'sales-invoice'));
    await postCurrentInvoice(page);

    await navigateTo(page, 'dashboard');
    await scrollMainToTop(page);
    rawPaths.set('dashboard', await captureRaw(page, 'dashboard'));

    await navigateTo(page, 'products');
    await scrollMainToTop(page);
    rawPaths.set('inventory', await captureRaw(page, 'inventory'));

    await navigateTo(page, 'treasury');
    await scrollMainToTop(page);
    rawPaths.set('treasury', await captureRaw(page, 'treasury'));

    await navigateTo(page, 'reports');
    await scrollMainToTop(page);
    rawPaths.set('reports', await captureRaw(page, 'reports'));

    await navigateTo(page, 'definitions', 'USAGE_GUIDE');
    await scrollMainToTop(page);
    rawPaths.set('usage-guide', await captureRaw(page, 'usage-guide'));
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }

  const logoPath = path.resolve(rootDir, 'branding', 'google-play-icon.png');
  const logoDataUrl = await imageDataUrl(logoPath);
  const finalPaths = [];

  for (const shot of shots) {
    const rawPath = rawPaths.get(shot.id);
    if (!rawPath) {
      throw new Error(`Missing raw screenshot for ${shot.id}`);
    }
    finalPaths.push(await renderStoreShot(browser, shot, rawPath, logoDataUrl));
  }

  await browser.close();
  await server.httpServer?.close?.();

  const manifest = {
    generatedAt: new Date().toISOString(),
    size: storeViewport,
    format: 'PNG',
    final: finalPaths.map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/')),
    raw: Array.from(rawPaths.values()).map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/')),
  };
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Generated ${finalPaths.length} Google Play screenshots:`);
  for (const filePath of finalPaths) {
    console.log(`- ${path.relative(rootDir, filePath)}`);
  }
};

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
