#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const SOURCE_TARGETS = [
  'components',
  'contexts',
  'hooks',
  'utils',
  'App.tsx',
  'constants.ts',
  'types.ts',
  'index.tsx'
].map((entry) => path.join(projectRoot, entry));

const VALID_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const ARABIC_CHARS = /[\u0600-\u06FF]/g;
const LATIN_CHARS = /[A-Za-z]/g;
const SUSPICIOUS_ARABIC_MARKERS = /[طظ]/g;
const SUSPICIOUS_LATIN_MARKERS = /[ÃØÙÂâï]/g;

const countMatches = (value, regex) => (value.match(regex) || []).length;
const isMostlyPrintable = (value) => !CONTROL_CHARS.test(value);

const buildEncodeMap = (label) => {
  const decoder = new TextDecoder(label, { fatal: false });
  const map = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    const decoded = decoder.decode(Uint8Array.of(byte));
    if (decoded === '\uFFFD' || map.has(decoded)) continue;
    map.set(decoded, byte);
  }
  return map;
};

const windows1256EncodeMap = buildEncodeMap('windows-1256');
const windows1252EncodeMap = buildEncodeMap('windows-1252');

const encodeUsingMap = (value, map) => {
  const bytes = [];
  for (const char of value) {
    const b = map.get(char);
    if (b === undefined) return null;
    bytes.push(b);
  }
  return Uint8Array.from(bytes);
};

const decodeUtf8 = (bytes) => {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return null;
  }
};

const latin1Bytes = (value) => {
  const bytes = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0xff) return null;
    bytes.push(code);
  }
  return Uint8Array.from(bytes);
};

const scoreText = (value) => {
  const arabic = countMatches(value, ARABIC_CHARS);
  const latin = countMatches(value, LATIN_CHARS);
  const suspiciousArabic = countMatches(value, SUSPICIOUS_ARABIC_MARKERS);
  const suspiciousLatin = countMatches(value, SUSPICIOUS_LATIN_MARKERS);
  const suspiciousPairs = countMatches(value, /(?:ط.|ظ.|Ã.|Ø.|Ù.|â.)/g);
  const replacement = countMatches(value, /\uFFFD/g);
  const controlPenalty = CONTROL_CHARS.test(value) ? 8 : 0;

  const score =
    (arabic * 1.5) +
    latin -
    (suspiciousPairs * 3) -
    (suspiciousArabic * 1.4) -
    (suspiciousLatin * 2.5) -
    (replacement * 6) -
    controlPenalty;

  return {
    score,
    arabic,
    latin,
    suspiciousArabic,
    suspiciousLatin,
    suspiciousPairs,
    replacement
  };
};

const looksLikeMojibake = (value) => {
  if (!value || value.length < 3) return false;

  if (/[ÃØÙÂâï]/.test(value)) return true;

  const arabic = countMatches(value, ARABIC_CHARS);
  if (arabic < 3) return false;

  const suspiciousPairs = countMatches(value, /(?:ط.|ظ.)/g);
  const suspiciousChars = countMatches(value, /[طظ]/g);

  return suspiciousPairs >= 2 && (suspiciousChars / arabic) > 0.35;
};

const decodeCandidates = (value) => {
  const candidates = [value];

  const latin1 = latin1Bytes(value);
  if (latin1) {
    const decoded = decodeUtf8(latin1);
    if (decoded) candidates.push(decoded);
  }

  const from1256 = encodeUsingMap(value, windows1256EncodeMap);
  if (from1256) {
    const decoded = decodeUtf8(from1256);
    if (decoded) candidates.push(decoded);
  }

  const from1252 = encodeUsingMap(value, windows1252EncodeMap);
  if (from1252) {
    const decoded = decodeUtf8(from1252);
    if (decoded) candidates.push(decoded);
  }

  return candidates.filter((candidate, index, all) => all.indexOf(candidate) === index && isMostlyPrintable(candidate));
};

const fixPotentialMojibakeText = (value) => {
  if (!looksLikeMojibake(value)) return value;

  const originalMetrics = scoreText(value);
  let bestValue = value;
  let bestMetrics = originalMetrics;

  for (const candidate of decodeCandidates(value)) {
    const metrics = scoreText(candidate);

    if (metrics.score > bestMetrics.score) {
      bestValue = candidate;
      bestMetrics = metrics;
    }
  }

  const improvedEnough = bestValue !== value && bestMetrics.score >= originalMetrics.score + 2;
  if (!improvedEnough) return value;

  const markersReduced =
    bestMetrics.suspiciousPairs < originalMetrics.suspiciousPairs ||
    bestMetrics.suspiciousArabic < originalMetrics.suspiciousArabic ||
    bestMetrics.suspiciousLatin < originalMetrics.suspiciousLatin;

  return markersReduced ? bestValue : value;
};

const escapeForQuote = (value, quote) => {
  const escapedBackslash = value.replace(/\\/g, '\\\\');
  const escapedQuote = quote === "'" ? escapedBackslash.replace(/'/g, "\\'") : escapedBackslash.replace(/"/g, '\\"');

  return escapedQuote
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
};

const fixStringLiterals = (source) => {
  let replacements = 0;

  const next = source.replace(/(['"])(?:\\.|(?!\1)[^\\\r\n])*\1/g, (literal) => {
    const quote = literal[0];
    const raw = literal.slice(1, -1);
    const fixed = fixPotentialMojibakeText(raw);
    if (fixed === raw) return literal;

    replacements += 1;
    return `${quote}${escapeForQuote(fixed, quote)}${quote}`;
  });

  return { text: next, replacements };
};

const fixJsxTextNodes = (source) => {
  let replacements = 0;

  const next = source.replace(/>([^<>{}]+)</g, (match, text) => {
    if (!looksLikeMojibake(text)) return match;

    const leading = text.match(/^\s*/)?.[0] || '';
    const trailing = text.match(/\s*$/)?.[0] || '';
    const core = text.slice(leading.length, text.length - trailing.length);
    if (!core) return match;

    const fixedCore = fixPotentialMojibakeText(core);
    if (fixedCore === core) return match;

    replacements += 1;
    return `>${leading}${fixedCore}${trailing}<`;
  });

  return { text: next, replacements };
};

const walkFiles = (targetPath, collector) => {
  const stats = fs.statSync(targetPath);

  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      walkFiles(path.join(targetPath, entry), collector);
    }
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  if (VALID_EXTENSIONS.has(ext)) collector.push(targetPath);
};

const run = () => {
  const files = [];

  for (const target of SOURCE_TARGETS) {
    if (fs.existsSync(target)) walkFiles(target, files);
  }

  let changedFiles = 0;
  let totalReplacements = 0;
  const details = [];

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    const literals = fixStringLiterals(original);
    const jsxText = fixJsxTextNodes(literals.text);

    const next = jsxText.text;
    const replacements = literals.replacements + jsxText.replacements;

    if (next === original) continue;

    fs.writeFileSync(filePath, next, 'utf8');
    changedFiles += 1;
    totalReplacements += replacements;
    details.push({ file: path.relative(projectRoot, filePath), replacements });
  }

  details
    .sort((a, b) => b.replacements - a.replacements)
    .slice(0, 30)
    .forEach((item) => {
      console.log(`[fixed] ${item.file} (${item.replacements})`);
    });

  console.log(`Done. changed files: ${changedFiles}, replacements: ${totalReplacements}`);
};

run();
