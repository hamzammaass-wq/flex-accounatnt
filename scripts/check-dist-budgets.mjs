import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const assetsDir = path.resolve(rootDir, 'dist', 'assets');

const MAX_JS_BYTES = 700 * 1024;
const MAX_CSS_BYTES = 120 * 1024;

const formatBytes = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
};

const main = async () => {
  let entries;
  try {
    entries = await fs.readdir(assetsDir, { withFileTypes: true });
  } catch {
    throw new Error('Missing dist/assets. Run build before size check.');
  }

  const offenders = [];
  const report = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (extension !== '.js' && extension !== '.css') continue;

    const filePath = path.join(assetsDir, entry.name);
    const { size } = await fs.stat(filePath);
    let budget = extension === '.js' ? MAX_JS_BYTES : MAX_CSS_BYTES;
    if (entry.name.startsWith('vendor-xlsx')) {
      budget = 1.3 * 1024 * 1024; // Allow up to 1.3 MB for xlsx bundle
    }

    report.push({ name: entry.name, size, budget, extension });

    if (size > budget) {
      offenders.push({ name: entry.name, size, budget, extension });
    }
  }

  report
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .forEach((item) => {
      const kind = item.extension === '.js' ? 'JS' : 'CSS';
      console.log(`[size] ${kind} ${item.name}: ${formatBytes(item.size)} (budget ${formatBytes(item.budget)})`);
    });

  if (offenders.length > 0) {
    console.error('\nBundle size budget exceeded:');
    offenders
      .sort((a, b) => b.size - a.size)
      .forEach((item) => {
        const overBy = item.size - item.budget;
        console.error(`- ${item.name}: ${formatBytes(item.size)} (over by ${formatBytes(overBy)})`);
      });
    process.exitCode = 1;
    return;
  }

  console.log('\nBundle size check passed.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
