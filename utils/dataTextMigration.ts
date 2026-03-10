const ARABIC_CHARS = /[\u0600-\u06FF]/g;
const LATIN_CHARS = /[A-Za-z]/g;
const LATIN_MOJIBAKE_MARKERS = /[ÃÂØÙ]/g;
const ARABIC_MOJIBAKE_MARKERS = /[\u0637\u0638\u0639\u063A]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

const countMatches = (value: string, regex: RegExp): number => (value.match(regex) || []).length;
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
const windows1256Decoder = new TextDecoder('windows-1256', { fatal: false });

const windows1256EncodeMap = (() => {
  const map = new Map<string, number>();
  for (let byte = 0; byte < 256; byte += 1) {
    const decodedChar = windows1256Decoder.decode(Uint8Array.of(byte));
    if (decodedChar === '\uFFFD' || map.has(decodedChar)) continue;
    map.set(decodedChar, byte);
  }
  return map;
})();

const latin1ToUtf8 = (value: string): string => {
  const bytes = new Uint8Array(Array.from(value).map(char => char.charCodeAt(0) & 0xFF));
  return utf8Decoder.decode(bytes);
};

const windows1256ToUtf8 = (value: string): string | null => {
  const bytes: number[] = [];
  for (const char of value) {
    const mappedByte = windows1256EncodeMap.get(char);
    if (mappedByte === undefined) {
      return null;
    }
    bytes.push(mappedByte);
  }
  return utf8Decoder.decode(Uint8Array.from(bytes));
};

const textScore = (value: string) => {
  const arabic = countMatches(value, ARABIC_CHARS);
  const latin = countMatches(value, LATIN_CHARS);
  const latinMarkers = countMatches(value, LATIN_MOJIBAKE_MARKERS);
  const arabicMarkers = countMatches(value, ARABIC_MOJIBAKE_MARKERS);
  const replacement = countMatches(value, /\uFFFD/g);
  const score = (arabic * 2) + latin - (latinMarkers * 2) - Math.max(0, arabicMarkers - 1) - (replacement * 4);
  return { arabic, latin, latinMarkers, arabicMarkers, replacement, score };
};

const isMostlyPrintable = (value: string): boolean => !CONTROL_CHARS.test(value);

export const fixPotentialMojibakeText = (value: string): string => {
  if (!value || value.length < 3) return value;

  const candidates = [value, latin1ToUtf8(value), windows1256ToUtf8(value)]
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter(candidate => isMostlyPrintable(candidate));

  const originalMetrics = textScore(value);
  let bestValue = value;
  let bestMetrics = originalMetrics;

  candidates.forEach(candidate => {
    const metrics = textScore(candidate);
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

export const deepFixPotentialMojibake = <T>(input: T): T => {
  if (typeof input === 'string') {
    return fixPotentialMojibakeText(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map(item => deepFixPotentialMojibake(item)) as T;
  }
  if (!input || typeof input !== 'object') {
    return input;
  }

  const result: Record<string, unknown> = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    const fixedKey = fixPotentialMojibakeText(key);
    result[fixedKey] = deepFixPotentialMojibake(value);
  });
  return result as T;
};

export const migrateLocalStorageTextData = (keyPrefix = 'al_mohaseb_'): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const { localStorage } = window;
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean) as string[];

  keys.forEach(key => {
    if (!key.startsWith(keyPrefix)) return;

    const fixedKey = fixPotentialMojibakeText(key);
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return;

    let fixedRawValue = rawValue;
    try {
      const parsed = JSON.parse(rawValue);
      const fixed = deepFixPotentialMojibake(parsed);
      fixedRawValue = JSON.stringify(fixed);
    } catch {
      fixedRawValue = fixPotentialMojibakeText(rawValue);
    }

    if (fixedKey !== key) {
      localStorage.removeItem(key);
      localStorage.setItem(fixedKey, fixedRawValue);
      return;
    }

    if (fixedRawValue !== rawValue) {
      localStorage.setItem(key, fixedRawValue);
    }
  });
};
