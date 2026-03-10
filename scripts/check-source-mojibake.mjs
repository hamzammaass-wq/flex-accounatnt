#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = [
  'components',
  'contexts',
  'hooks',
  'utils',
  'App.tsx',
  'constants.ts',
  'types.ts',
  'index.tsx'
].map(entry => path.join(root, entry));

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const arabicMojibakePattern = /(ط§ظ|ظ„ط|طھظ|ظ…ط|ط±ظ|ظٹط|ط¨ظ|ظ†ط|ظپط|ط³ظ)/g;
const latinMojibakePattern = /(Ã.|Ø.|Ù.|â.)/g;
const ignoreRelativePaths = new Set([
  path.join('utils', 'dataTextMigration.ts')
]);

const walk = (entry) => {
  if (!fs.existsSync(entry)) return [];
  const stat = fs.statSync(entry);
  if (stat.isFile()) return [entry];
  const result = [];
  fs.readdirSync(entry, { withFileTypes: true }).forEach(item => {
    const full = path.join(entry, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === 'dist' || item.name.startsWith('.')) return;
      result.push(...walk(full));
      return;
    }
    if (sourceExtensions.has(path.extname(item.name))) {
      result.push(full);
    }
  });
  return result;
};

const files = Array.from(new Set(targets.flatMap(walk)));
const findings = [];

files.forEach(filePath => {
  const relativePath = path.relative(root, filePath);
  if (ignoreRelativePaths.has(relativePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    arabicMojibakePattern.lastIndex = 0;
    latinMojibakePattern.lastIndex = 0;
    const arabicHits = line.match(arabicMojibakePattern) || [];
    const latinHits = line.match(latinMojibakePattern) || [];
    const hasLatinCorruption = latinHits.length > 0;
    const hasArabicCorruption = arabicHits.length >= 2;
    if (!hasLatinCorruption && !hasArabicCorruption) return;
    findings.push({
      file: relativePath,
      line: idx + 1,
      preview: line.trim().slice(0, 140)
    });
  });
});

if (findings.length === 0) {
  console.log('[text:check] OK - no suspicious mojibake markers found.');
  process.exit(0);
}

console.error(`[text:check] Found ${findings.length} suspicious source lines:`);
findings.slice(0, 120).forEach(hit => {
  console.error(` - ${hit.file}:${hit.line} :: ${hit.preview}`);
});

if (findings.length > 120) {
  console.error(` ... and ${findings.length - 120} more lines.`);
}

process.exit(1);
