#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const ARABIC_CHARS = /[\u0600-\u06FF]/g;
const LATIN_CHARS = /[A-Za-z]/g;
const LATIN_MOJIBAKE_MARKERS = /[ÃÂØÙ]/g;
const ARABIC_MOJIBAKE_MARKERS = /[\u0637\u0638\u0639\u063A]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
const windows1256Decoder = new TextDecoder('windows-1256', { fatal: false });

const usage = `
Usage:
  node scripts/migrate-data-and-regenerate-i18n.mjs [--regen-i18n-only] [--input <file.json>] [--output <file.json>]

Examples:
  node scripts/migrate-data-and-regenerate-i18n.mjs
  node scripts/migrate-data-and-regenerate-i18n.mjs --regen-i18n-only
  node scripts/migrate-data-and-regenerate-i18n.mjs --input ./backup.json --output ./backup.migrated.json
`;

const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage.trim());
  process.exit(0);
}

const inputArg = getArg('--input');
const outputArg = getArg('--output');
const regenI18nOnly = process.argv.includes('--regen-i18n-only');
const i18nFilePath = path.join(projectRoot, 'utils', 'i18n.ts');
const translationsDir = path.join(projectRoot, 'utils', 'translations');

const countMatches = (value, regex) => (value.match(regex) || []).length;

const windows1256EncodeMap = (() => {
  const map = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    const decodedChar = windows1256Decoder.decode(Uint8Array.of(byte));
    if (decodedChar === '\uFFFD' || map.has(decodedChar)) continue;
    map.set(decodedChar, byte);
  }
  return map;
})();

const latin1ToUtf8 = (value) => {
  const bytes = new Uint8Array(Array.from(value).map(char => char.charCodeAt(0) & 0xFF));
  return utf8Decoder.decode(bytes);
};

const windows1256ToUtf8 = (value) => {
  const bytes = [];
  for (const char of value) {
    const mappedByte = windows1256EncodeMap.get(char);
    if (mappedByte === undefined) return null;
    bytes.push(mappedByte);
  }
  return utf8Decoder.decode(Uint8Array.from(bytes));
};

const scoreText = (value) => {
  const arabic = countMatches(value, ARABIC_CHARS);
  const latin = countMatches(value, LATIN_CHARS);
  const latinMarkers = countMatches(value, LATIN_MOJIBAKE_MARKERS);
  const arabicMarkers = countMatches(value, ARABIC_MOJIBAKE_MARKERS);
  const replacement = countMatches(value, /\uFFFD/g);
  const score = (arabic * 2) + latin - (latinMarkers * 2) - Math.max(0, arabicMarkers - 1) - (replacement * 4);
  return { arabic, latin, latinMarkers, arabicMarkers, replacement, score };
};

const isMostlyPrintable = (value) => !CONTROL_CHARS.test(value);

const fixPotentialMojibakeText = (value) => {
  if (typeof value !== 'string' || value.length < 3) return value;

  const candidates = [value, latin1ToUtf8(value), windows1256ToUtf8(value)]
    .filter(Boolean)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter(candidate => isMostlyPrintable(candidate));

  const originalMetrics = scoreText(value);
  let bestValue = value;
  let bestMetrics = originalMetrics;

  candidates.forEach(candidate => {
    const metrics = scoreText(candidate);
    if (metrics.score > bestMetrics.score) {
      bestValue = candidate;
      bestMetrics = metrics;
    }
  });

  const clearlyBetter =
    bestValue !== value &&
    bestMetrics.score >= (originalMetrics.score + 2) &&
    (
      bestMetrics.arabic > originalMetrics.arabic ||
      bestMetrics.latin > originalMetrics.latin ||
      bestMetrics.latinMarkers < originalMetrics.latinMarkers ||
      bestMetrics.arabicMarkers < originalMetrics.arabicMarkers
    );

  return clearlyBetter ? bestValue : value;
};

const deepFixPotentialMojibake = (input) => {
  if (typeof input === 'string') return fixPotentialMojibakeText(input);
  if (Array.isArray(input)) return input.map(item => deepFixPotentialMojibake(item));
  if (!input || typeof input !== 'object') return input;

  const result = {};
  Object.entries(input).forEach(([key, value]) => {
    const fixedKey = fixPotentialMojibakeText(key);
    result[fixedKey] = deepFixPotentialMojibake(value);
  });
  return result;
};

const normalizeLineEndings = (content) => {
  const withoutBom = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  return withoutBom.replace(/\r\n/g, '\n');
};

const extractMessagesObject = (i18nSource) => {
  const anchor = i18nSource.indexOf('const messages =');
  if (anchor < 0) {
    throw new Error('Could not locate "const messages =" in utils/i18n.ts');
  }

  const objectStart = i18nSource.indexOf('{', anchor);
  const asConstToken = '} as const;';
  const objectEndToken = i18nSource.indexOf(asConstToken, objectStart);
  if (objectStart < 0 || objectEndToken < 0) {
    throw new Error('Could not locate messages object boundaries in utils/i18n.ts');
  }

  const objectLiteral = i18nSource.slice(objectStart, objectEndToken + 1);
  const parsed = Function(`"use strict"; return (${objectLiteral});`)();
  if (!parsed || typeof parsed !== 'object' || !parsed.ar || !parsed.en) {
    throw new Error('Invalid messages object in utils/i18n.ts');
  }
  return parsed;
};

const buildI18nSource = (messages) => `import { CompanySettings } from '../types';

export type AppLanguage = CompanySettings['language'];
type LocaleLanguage = 'ar' | 'en';

const messages = ${JSON.stringify(messages, null, 2)} as const;

type TranslationKey = keyof (typeof messages)['ar'];

const interpolate = (template: string, params?: Record<string, string | number>): string => {
  if (!params) return template;
  return template.replace(/\\{\\{(\\w+)\\}\\}/g, (_, key: string) => String(params[key] ?? ''));
};

export const getLocaleLanguage = (language: AppLanguage): LocaleLanguage => {
  return language === 'AR' ? 'ar' : 'en';
};

export const getDocumentLanguageTag = (language: AppLanguage): string => {
  return language === 'AR' ? 'ar-u-nu-latn' : 'en';
};

export const isRtlLanguage = (language: AppLanguage): boolean => {
  return language === 'AR';
};

export const translate = (
  language: AppLanguage,
  key: TranslationKey,
  params?: Record<string, string | number>
): string => {
  const locale = getLocaleLanguage(language);
  const template = messages[locale][key] ?? messages.ar[key];
  return interpolate(template, params);
};

export const getDateLocale = (language: AppLanguage): string => {
  return language === 'AR' ? 'ar-SA-u-nu-latn' : 'en-US';
};

export const getNumberLocale = (language: AppLanguage): string => {
  return language === 'AR' ? 'ar-SA-u-nu-latn' : 'en-US';
};
`;

const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const regenerateI18n = () => {
  if (!fs.existsSync(i18nFilePath)) {
    throw new Error(`Translation source file not found: ${i18nFilePath}`);
  }

  const source = normalizeLineEndings(fs.readFileSync(i18nFilePath, 'utf8'));
  const originalMessages = extractMessagesObject(source);
  const fixedMessages = deepFixPotentialMojibake(originalMessages);

  ensureDirectory(translationsDir);
  fs.writeFileSync(path.join(translationsDir, 'ar.json'), `${JSON.stringify(fixedMessages.ar, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(translationsDir, 'en.json'), `${JSON.stringify(fixedMessages.en, null, 2)}\n`, 'utf8');

  const regeneratedI18n = buildI18nSource(fixedMessages);
  fs.writeFileSync(i18nFilePath, regeneratedI18n, 'utf8');

  return {
    keysAr: Object.keys(fixedMessages.ar || {}).length,
    keysEn: Object.keys(fixedMessages.en || {}).length
  };
};

const migrateJsonFile = (inputPath, outputPath) => {
  const absoluteInput = path.resolve(projectRoot, inputPath);
  if (!fs.existsSync(absoluteInput)) {
    throw new Error(`Input file not found: ${absoluteInput}`);
  }

  const raw = fs.readFileSync(absoluteInput, 'utf8');
  const parsed = JSON.parse(raw);
  const fixed = deepFixPotentialMojibake(parsed);

  const finalOutput = outputPath
    ? path.resolve(projectRoot, outputPath)
    : absoluteInput.replace(/\.json$/i, '.migrated.json');

  fs.writeFileSync(finalOutput, `${JSON.stringify(fixed, null, 2)}\n`, 'utf8');
  return { input: absoluteInput, output: finalOutput };
};

try {
  const regenResult = regenerateI18n();
  console.log(`[i18n] regenerated utils/i18n.ts + utils/translations/*.json (AR keys: ${regenResult.keysAr}, EN keys: ${regenResult.keysEn})`);

  if (!regenI18nOnly && inputArg) {
    const migrated = migrateJsonFile(inputArg, outputArg);
    console.log(`[data] migrated: ${path.relative(projectRoot, migrated.input)} -> ${path.relative(projectRoot, migrated.output)}`);
  } else if (!regenI18nOnly) {
    console.log('[data] no JSON input provided; skipped data migration');
  }

  console.log('Migration completed.');
} catch (error) {
  console.error('Migration failed:', error?.message || error);
  process.exit(1);
}
