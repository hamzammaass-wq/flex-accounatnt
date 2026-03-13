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
const MAX_DECODE_DEPTH = 4;

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

const decodeOnce = (value) => {
  const candidates = [];

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

const decodeCandidates = (value) => {
  const visited = new Set([value]);
  const queue = [{ text: value, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= MAX_DECODE_DEPTH) continue;

    decodeOnce(current.text).forEach((candidate) => {
      if (visited.has(candidate)) return;
      visited.add(candidate);
      queue.push({ text: candidate, depth: current.depth + 1 });
    });
  }

  return Array.from(visited);
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

  const improvedEnough = bestValue !== value && bestMetrics.score >= originalMetrics.score + 1;
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

const skipQuotedSequence = (source, startIndex, quote) => {
  let index = startIndex + 1;

  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }

  return source.length;
};

const fixTemplateLiterals = (source) => {
  let replacements = 0;
  let result = '';
  let index = 0;

  while (index < source.length) {
    if (source[index] !== '`') {
      result += source[index];
      index += 1;
      continue;
    }

    let template = '`';
    let chunk = '';
    index += 1;

    while (index < source.length) {
      const char = source[index];

      if (char === '\\') {
        chunk += source.slice(index, index + 2);
        index += 2;
        continue;
      }

      if (char === '`') {
        const fixedChunk = fixPotentialMojibakeText(chunk);
        if (fixedChunk !== chunk) replacements += 1;
        template += fixedChunk;
        template += '`';
        index += 1;
        break;
      }

      if (char === '$' && source[index + 1] === '{') {
        const fixedChunk = fixPotentialMojibakeText(chunk);
        if (fixedChunk !== chunk) replacements += 1;
        template += fixedChunk;
        template += '${';
        chunk = '';
        index += 2;

        let braceDepth = 1;
        while (index < source.length && braceDepth > 0) {
          const exprChar = source[index];

          if (exprChar === "'" || exprChar === '"' || exprChar === '`') {
            const endIndex = skipQuotedSequence(source, index, exprChar);
            template += source.slice(index, endIndex);
            index = endIndex;
            continue;
          }

          template += exprChar;
          index += 1;

          if (exprChar === '{') braceDepth += 1;
          if (exprChar === '}') braceDepth -= 1;
        }

        continue;
      }

      chunk += char;
      index += 1;
    }

    result += template;
  }

  return { text: result, replacements };
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
    const templates = fixTemplateLiterals(literals.text);
    const jsxText = fixJsxTextNodes(templates.text);

    const next = jsxText.text;
    const replacements = literals.replacements + templates.replacements + jsxText.replacements;

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
