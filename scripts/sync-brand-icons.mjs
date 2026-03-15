import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const fromRoot = (...parts) => path.resolve(rootDir, ...parts);

const sourceFiles = {
  logoSvg: fromRoot('branding', 'masters', 'aiflex-erp-logo.svg'),
  logoPng: fromRoot('branding', 'masters', 'aiflex-erp-logo.png'),
  iconSvg: fromRoot('branding', 'masters', 'aiflex-erp-app-icon.svg'),
  iconPng: fromRoot('branding', 'masters', 'aiflex-erp-app-icon.png')
};

const copyTargets = [
  [sourceFiles.logoSvg, fromRoot('public', 'brand', 'aiflex-erp-logo.svg')],
  [sourceFiles.logoPng, fromRoot('public', 'brand', 'aiflex-erp-logo.png')],
  [sourceFiles.iconSvg, fromRoot('public', 'brand', 'aiflex-erp-mark.svg')],
  [sourceFiles.iconSvg, fromRoot('public', 'icons', 'icon-192.svg')],
  [sourceFiles.iconSvg, fromRoot('public', 'icons', 'icon-512.svg')]
];

const iconResizeTargets = [
  ['public/brand/aiflex-erp-mark.png', 1024],
  ['public/icons/favicon-32.png', 32],
  ['public/icons/apple-touch-icon.png', 180],
  ['public/icons/icon-48.png', 48],
  ['public/icons/icon-72.png', 72],
  ['public/icons/icon-96.png', 96],
  ['public/icons/icon-128.png', 128],
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-256.png', 256],
  ['public/icons/icon-512.png', 512],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
  ['android/app/src/main/res/mipmap-ldpi/ic_launcher.png', 36],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192],
  ['android/app/src/main/res/mipmap-ldpi/ic_launcher_round.png', 36],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 48],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 72],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 96],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 144],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 192],
  ['android/app/src/main/res/mipmap-ldpi/ic_launcher_background.png', 81],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png', 108],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_background.png', 162],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.png', 216],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png', 324],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png', 432],
  ['android/app/src/main/res/mipmap-ldpi/ic_launcher_foreground.png', 81],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432]
].map(([relativePath, size]) => ({ path: fromRoot(relativePath), size }));

const ensureSourceFiles = async () => {
  for (const filePath of Object.values(sourceFiles)) {
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Missing branding master: ${path.relative(rootDir, filePath)}`);
    }
  }
};

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

const renderIconTargets = async () => {
  const iconBuffer = await fs.readFile(sourceFiles.iconPng);
  const iconDataUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`;
  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of iconResizeTargets) {
      const page = await browser.newPage({
        viewport: { width: target.size, height: target.size },
        deviceScaleFactor: 1
      });

      await page.setContent(
        `<html><body style="margin:0;background:transparent;overflow:hidden"><img id="icon" src="${iconDataUrl}" style="display:block;width:${target.size}px;height:${target.size}px" /></body></html>`
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
  await renderIconTargets();
  console.log('Branding assets are synced from branding/masters.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
