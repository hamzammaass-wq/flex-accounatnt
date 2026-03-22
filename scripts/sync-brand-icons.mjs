import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const fromRoot = (...parts) => path.resolve(rootDir, ...parts);

const sourceFiles = {
  logoPng: fromRoot('branding', 'masters', 'aiflex-erp-logo.png'),
  iconPng: fromRoot('branding', 'masters', 'aiflex-erp-app-icon.png'),
  iosIconPng: fromRoot('branding', 'masters', 'aiflex-erp-ios-icon.png')
};

const copyTargets = [
  [sourceFiles.logoPng, fromRoot('public', 'brand', 'aiflex-erp-logo.png')],
];

const svgTargets = [
  {
    sourcePath: sourceFiles.logoPng,
    targetPath: fromRoot('public', 'brand', 'aiflex-erp-logo.svg')
  },
  {
    sourcePath: sourceFiles.iconPng,
    targetPath: fromRoot('public', 'brand', 'aiflex-erp-mark.svg')
  },
  {
    sourcePath: sourceFiles.iconPng,
    targetPath: fromRoot('public', 'icons', 'icon-192.svg')
  },
  {
    sourcePath: sourceFiles.iconPng,
    targetPath: fromRoot('public', 'icons', 'icon-512.svg')
  }
];

const renderTarget = (relativePath, size, sourcePath = sourceFiles.iconPng) => ({
  path: fromRoot(relativePath),
  size,
  sourcePath
});

const iconResizeTargets = [
  renderTarget('public/brand/aiflex-erp-mark.png', 1024),
  renderTarget('public/icons/favicon-32.png', 32),
  renderTarget('public/icons/apple-touch-icon.png', 180),
  renderTarget('public/icons/icon-48.png', 48),
  renderTarget('public/icons/icon-72.png', 72),
  renderTarget('public/icons/icon-96.png', 96),
  renderTarget('public/icons/icon-128.png', 128),
  renderTarget('public/icons/icon-192.png', 192),
  renderTarget('public/icons/icon-256.png', 256),
  renderTarget('public/icons/icon-512.png', 512),
  renderTarget('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, sourceFiles.iosIconPng),
  renderTarget('android/app/src/main/res/mipmap-ldpi/ic_launcher.png', 36),
  renderTarget('android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48),
  renderTarget('android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72),
  renderTarget('android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96),
  renderTarget('android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144),
  renderTarget('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192),
  renderTarget('android/app/src/main/res/mipmap-ldpi/ic_launcher_round.png', 36),
  renderTarget('android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 48),
  renderTarget('android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 72),
  renderTarget('android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 96),
  renderTarget('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 144),
  renderTarget('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 192),
  renderTarget('android/app/src/main/res/mipmap-ldpi/ic_launcher_background.png', 81),
  renderTarget('android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png', 108),
  renderTarget('android/app/src/main/res/mipmap-hdpi/ic_launcher_background.png', 162),
  renderTarget('android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.png', 216),
  renderTarget('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png', 324),
  renderTarget('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png', 432),
  renderTarget('android/app/src/main/res/mipmap-ldpi/ic_launcher_foreground.png', 81),
  renderTarget('android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108),
  renderTarget('android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162),
  renderTarget('android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216),
  renderTarget('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324),
  renderTarget('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432)
];

const ensureSourceFiles = async () => {
  for (const filePath of Object.values(sourceFiles)) {
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Missing branding master: ${path.relative(rootDir, filePath)}`);
    }
  }
};

const toEmbeddedSvg = (dataUrl) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" preserveAspectRatio="xMidYMid meet">
  <image href="${dataUrl}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="xMidYMid meet" />
</svg>
`;

const ensureParentDirectory = async (targetPath) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};

const copyBrandFiles = async () => {
  for (const [sourcePath, targetPath] of copyTargets) {
    await ensureParentDirectory(targetPath);
    await fs.copyFile(sourcePath, targetPath);
    console.log(`copied ${path.relative(rootDir, targetPath)}`);
  }
};

const writeSvgTargets = async () => {
  const dataUrlCache = new Map();

  for (const target of svgTargets) {
    if (!dataUrlCache.has(target.sourcePath)) {
      const sourceBuffer = await fs.readFile(target.sourcePath);
      dataUrlCache.set(target.sourcePath, `data:image/png;base64,${sourceBuffer.toString('base64')}`);
    }

    await ensureParentDirectory(target.targetPath);
    await fs.writeFile(target.targetPath, toEmbeddedSvg(dataUrlCache.get(target.sourcePath)));
    console.log(`generated ${path.relative(rootDir, target.targetPath)}`);
  }
};

const renderIconTargets = async () => {
  const iconDataUrlCache = new Map();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of iconResizeTargets) {
      if (!iconDataUrlCache.has(target.sourcePath)) {
        const iconBuffer = await fs.readFile(target.sourcePath);
        iconDataUrlCache.set(target.sourcePath, `data:image/png;base64,${iconBuffer.toString('base64')}`);
      }

      const page = await browser.newPage({
        viewport: { width: target.size, height: target.size },
        deviceScaleFactor: 1
      });

      await page.setContent(
        `<html><body style="margin:0;background:transparent;overflow:hidden"><img id="icon" src="${iconDataUrlCache.get(target.sourcePath)}" style="display:block;width:${target.size}px;height:${target.size}px" /></body></html>`
      );

      await page.waitForFunction(() => {
        const image = document.getElementById('icon');
        return Boolean(image && image.complete && image.naturalWidth > 0);
      }, null, { timeout: 10000 });

      await ensureParentDirectory(target.path);
      await page.locator('#icon').screenshot({ path: target.path, omitBackground: true });
      await page.close();
      console.log(`rendered ${path.relative(rootDir, target.path)}`);
    }
  } finally {
    await browser.close();
  }
};

const main = async () => {
  await ensureSourceFiles();
  await copyBrandFiles();
  await writeSvgTargets();
  await renderIconTargets();
  console.log('Branding assets are synced from branding/masters.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
