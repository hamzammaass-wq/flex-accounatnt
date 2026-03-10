const DEFAULT_LOCALE = 'en-US-u-nu-latn';
const DATE_LOCALE = 'en-GB-u-nu-latn';
const INPUT_LANG = 'en';
const DATE_INPUT_LANG = 'en-GB';
const DATE_INPUT_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time']);

const ARABIC_INDIC_DIGIT_MAP: Record<string, string> = {
  '\u0660': '0',
  '\u0661': '1',
  '\u0662': '2',
  '\u0663': '3',
  '\u0664': '4',
  '\u0665': '5',
  '\u0666': '6',
  '\u0667': '7',
  '\u0668': '8',
  '\u0669': '9'
};

const PERSIAN_DIGIT_MAP: Record<string, string> = {
  '\u06F0': '0',
  '\u06F1': '1',
  '\u06F2': '2',
  '\u06F3': '3',
  '\u06F4': '4',
  '\u06F5': '5',
  '\u06F6': '6',
  '\u06F7': '7',
  '\u06F8': '8',
  '\u06F9': '9'
};

const ARABIC_OR_PERSIAN_DIGITS_RE = /[\u0660-\u0669\u06F0-\u06F9]/g;
const HAS_ARABIC_OR_PERSIAN_DIGITS_RE = /[\u0660-\u0669\u06F0-\u06F9]/;

const forceLatinDigitsInLocale = (locale: string): string => {
  const normalized = String(locale || '').trim();
  if (!normalized) return DEFAULT_LOCALE;

  if (/-u-/i.test(normalized)) {
    if (/-nu-[a-z0-9]+/i.test(normalized)) {
      return normalized.replace(/-nu-[a-z0-9]+/i, '-nu-latn');
    }
    return `${normalized}-nu-latn`;
  }

  return `${normalized}-u-nu-latn`;
};

const normalizeLocales = (locales?: string | string[]): string | string[] => {
  if (Array.isArray(locales)) {
    if (locales.length === 0) return DEFAULT_LOCALE;
    return locales.map((locale) => forceLatinDigitsInLocale(String(locale)));
  }

  if (typeof locales === 'string') {
    return forceLatinDigitsInLocale(locales);
  }

  return DEFAULT_LOCALE;
};

export const toEnglishDigits = (value: string): string =>
  String(value).replace(ARABIC_OR_PERSIAN_DIGITS_RE, (digit) => ARABIC_INDIC_DIGIT_MAP[digit] ?? PERSIAN_DIGIT_MAP[digit] ?? digit);

const normalizeNumericInput = (value: string, isNumberInput: boolean): string => {
  let normalized = toEnglishDigits(value)
    .replace(/\u066B/g, '.') // Arabic decimal separator
    .replace(/\u066C/g, ',') // Arabic thousands separator
    .replace(/\u060C/g, ','); // Arabic comma

  if (isNumberInput) {
    normalized = normalized.replace(/,/g, '');
  }

  return normalized;
};

const normalizeDateInput = (value: string): string => {
  const normalized = toEnglishDigits(String(value || '')).trim();
  if (!normalized) return normalized;

  const ymd = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const dmy = normalized.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return normalized;
};

const hasArabicDigits = (value: string): boolean => HAS_ARABIC_OR_PERSIAN_DIGITS_RE.test(value);

const normalizeStringDigits = (value: string): string => {
  if (!value || !hasArabicDigits(value)) return value;
  return toEnglishDigits(value);
};

const normalizeTextNodeDigits = (node: Text): void => {
  const parent = node.parentElement;
  if (!parent) return;
  const tagName = parent.tagName;
  if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'TEXTAREA' || tagName === 'INPUT') return;

  const raw = node.nodeValue || '';
  if (!hasArabicDigits(raw)) return;
  node.nodeValue = toEnglishDigits(raw);
};

const normalizeElementDigitAttributes = (element: Element): void => {
  const attrs = ['placeholder', 'title', 'aria-label', 'value'];
  for (const attr of attrs) {
    const raw = element.getAttribute(attr);
    if (!raw) continue;
    const normalized = normalizeStringDigits(raw);
    if (normalized !== raw) {
      element.setAttribute(attr, normalized);
    }
  }
};

const normalizeTextDigitsInRoot = (root: Node): void => {
  if (root.nodeType === Node.TEXT_NODE) {
    normalizeTextNodeDigits(root as Text);
    return;
  }

  if (!(root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment)) return;

  if (root instanceof HTMLElement) {
    normalizeElementDigitAttributes(root);
  } else if (root instanceof Document || root instanceof DocumentFragment) {
    if ('querySelectorAll' in root) {
      root.querySelectorAll('*').forEach((el) => normalizeElementDigitAttributes(el));
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode: Node | null = walker.nextNode();
  while (currentNode) {
    normalizeTextNodeDigits(currentNode as Text);
    currentNode = walker.nextNode();
  }
};

const isDateLikeInput = (field: HTMLInputElement | HTMLTextAreaElement): boolean =>
  field instanceof HTMLInputElement && DATE_INPUT_TYPES.has((field.type || '').toLowerCase());

const isNumericField = (field: HTMLInputElement | HTMLTextAreaElement): boolean => {
  if (isDateLikeInput(field)) return true;

  if (field instanceof HTMLInputElement) {
    const type = (field.type || '').toLowerCase();
    if (type === 'number' || type === 'tel') return true;

    const mode = (field.inputMode || '').toLowerCase();
    if (mode === 'numeric' || mode === 'decimal') return true;
  }

  const className = field.className || '';
  return typeof className === 'string' && className.includes('dir-ltr');
};

const enforceNumericFieldAttributes = (field: HTMLInputElement | HTMLTextAreaElement): void => {
  if (!isNumericField(field)) return;

  field.setAttribute('lang', isDateLikeInput(field) ? DATE_INPUT_LANG : INPUT_LANG);
  field.setAttribute('dir', 'ltr');
  field.style.fontVariantNumeric = 'tabular-nums';
  field.style.unicodeBidi = 'plaintext';
  // Helps Chromium native controls (number/date) render Latin digits under Arabic UI locale.
  field.style.setProperty('-webkit-locale', isDateLikeInput(field) ? DATE_INPUT_LANG : INPUT_LANG);

  if (field instanceof HTMLInputElement) {
    const type = (field.type || '').toLowerCase();
    if (type === 'number' && !field.inputMode) {
      field.inputMode = 'decimal';
    }
  }

  if (isDateLikeInput(field) && !field.hasAttribute('inputmode')) {
    field.setAttribute('inputmode', 'numeric');
  }
};

const normalizeFieldValue = (field: HTMLInputElement | HTMLTextAreaElement): void => {
  if (!isNumericField(field)) return;

  const rawValue = field.value || '';
  const isNumberInput = field instanceof HTMLInputElement && field.type.toLowerCase() === 'number';
  const normalized = isDateLikeInput(field)
    ? normalizeDateInput(rawValue)
    : normalizeNumericInput(rawValue, isNumberInput);

  if (normalized === rawValue) return;

  const start = typeof field.selectionStart === 'number' ? field.selectionStart : null;
  const end = typeof field.selectionEnd === 'number' ? field.selectionEnd : null;
  const delta = normalized.length - rawValue.length;
  field.value = normalized;

  if (start !== null && end !== null) {
    const nextStart = Math.max(0, start + delta);
    const nextEnd = Math.max(0, end + delta);
    try {
      field.setSelectionRange(nextStart, nextEnd);
    } catch {
      // Some native inputs (date/number on some browsers) do not allow setSelectionRange.
    }
  }
};

const enforceNumericFieldsInRoot = (root: ParentNode): void => {
  const fields = root.querySelectorAll('input, textarea');
  fields.forEach((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      enforceNumericFieldAttributes(node);
      normalizeFieldValue(node);
      normalizeElementDigitAttributes(node);
    }
  });
};

let isApplied = false;

const patchValueSetter = <T extends HTMLInputElement | HTMLTextAreaElement>(
  proto: { prototype: T },
  kind: 'input' | 'textarea'
): void => {
  const descriptor = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
  if (!descriptor?.get || !descriptor?.set) return;
  if ((descriptor.set as any).__latinDigitsPatched) return;

  const originalGet = descriptor.get;
  const originalSet = descriptor.set;
  const patchedSetter = function (this: T, nextValue: string) {
    const raw = String(nextValue ?? '');
    let normalized = raw;

    if (kind === 'input' && this instanceof HTMLInputElement && isDateLikeInput(this)) {
      normalized = normalizeDateInput(raw);
    } else if (hasArabicDigits(raw)) {
      const isNumberInput =
        kind === 'input' && this instanceof HTMLInputElement && (this.type || '').toLowerCase() === 'number';
      normalized = isNumericField(this) ? normalizeNumericInput(raw, isNumberInput) : toEnglishDigits(raw);
    }

    return originalSet.call(this, normalized);
  };
  (patchedSetter as any).__latinDigitsPatched = true;

  Object.defineProperty(proto.prototype, 'value', {
    configurable: true,
    enumerable: descriptor.enumerable ?? true,
    get: originalGet,
    set: patchedSetter
  });
};

export const forceEnglishDigits = (): void => {
  if (isApplied) return;
  isApplied = true;

  document.documentElement.setAttribute('data-enforce-latin-digits', 'true');

  patchValueSetter(HTMLInputElement as any, 'input');
  patchValueSetter(HTMLTextAreaElement as any, 'textarea');

  const originalNumberToLocaleString = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (
    locales?: string | string[],
    options?: Intl.NumberFormatOptions
  ): string {
    return originalNumberToLocaleString.call(this, normalizeLocales(locales), {
      ...options,
      numberingSystem: 'latn'
    });
  };

  const originalDateToLocaleString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ): string {
    return originalDateToLocaleString.call(this, normalizeLocales(locales), {
      ...options,
      numberingSystem: 'latn'
    });
  };

  const originalDateToLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ): string {
    return originalDateToLocaleDateString.call(this, normalizeLocales(locales), {
      ...options,
      numberingSystem: 'latn'
    });
  };

  const originalDateToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ): string {
    return originalDateToLocaleTimeString.call(this, normalizeLocales(locales), {
      ...options,
      numberingSystem: 'latn'
    });
  };

  const OriginalNumberFormat = Intl.NumberFormat;
  const PatchedNumberFormat = function (
    this: Intl.NumberFormat,
    locales?: string | string[],
    options?: Intl.NumberFormatOptions
  ) {
    const normalizedOptions = { ...(options || {}), numberingSystem: 'latn' };
    if (new.target) {
      return Reflect.construct(OriginalNumberFormat as any, [normalizeLocales(locales), normalizedOptions], new.target);
    }
    return (OriginalNumberFormat as any)(normalizeLocales(locales), normalizedOptions);
  } as unknown as typeof Intl.NumberFormat;
  (PatchedNumberFormat as any).prototype = OriginalNumberFormat.prototype;
  (PatchedNumberFormat as any).supportedLocalesOf = (locales: string | string[], options?: Intl.NumberFormatOptions) =>
    OriginalNumberFormat.supportedLocalesOf(normalizeLocales(locales) as any, options as any);
  (Intl as any).NumberFormat = PatchedNumberFormat;

  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const PatchedDateTimeFormat = function (
    this: Intl.DateTimeFormat,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions
  ) {
    const normalizedOptions = { ...(options || {}), numberingSystem: 'latn' };
    if (new.target) {
      return Reflect.construct(OriginalDateTimeFormat as any, [normalizeLocales(locales), normalizedOptions], new.target);
    }
    return (OriginalDateTimeFormat as any)(normalizeLocales(locales), normalizedOptions);
  } as unknown as typeof Intl.DateTimeFormat;
  (PatchedDateTimeFormat as any).prototype = OriginalDateTimeFormat.prototype;
  (PatchedDateTimeFormat as any).supportedLocalesOf = (locales: string | string[], options?: Intl.DateTimeFormatOptions) =>
    OriginalDateTimeFormat.supportedLocalesOf(normalizeLocales(locales) as any, options as any);
  (Intl as any).DateTimeFormat = PatchedDateTimeFormat;

  const normalizeFromEvent = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    enforceNumericFieldAttributes(target);
    normalizeFieldValue(target);
    normalizeElementDigitAttributes(target);
  };

  document.addEventListener('input', normalizeFromEvent, true);
  document.addEventListener('change', normalizeFromEvent, true);
  document.addEventListener('focusin', normalizeFromEvent, true);
  document.addEventListener(
    'paste',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      queueMicrotask(() => {
        enforceNumericFieldAttributes(target);
        normalizeFieldValue(target);
        normalizeElementDigitAttributes(target);
      });
    },
    true
  );

  document.documentElement.style.fontVariantNumeric = 'tabular-nums';
  document.documentElement.style.setProperty('-webkit-text-size-adjust', '100%');
  document.documentElement.style.setProperty('-webkit-locale', INPUT_LANG);

  enforceNumericFieldsInRoot(document);
  normalizeTextDigitsInRoot(document.body);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target.nodeType === Node.TEXT_NODE) {
        normalizeTextDigitsInRoot(record.target);
        continue;
      }

      if (record.type === 'attributes' && record.target instanceof Element) {
        normalizeElementDigitAttributes(record.target);
        if (record.target instanceof HTMLInputElement || record.target instanceof HTMLTextAreaElement) {
          enforceNumericFieldAttributes(record.target);
          normalizeFieldValue(record.target);
        }
      }

      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          normalizeTextDigitsInRoot(node);
          return;
        }
        if (!(node instanceof HTMLElement)) return;
        normalizeElementDigitAttributes(node);
        if (node.matches('input, textarea')) {
          const field = node as HTMLInputElement | HTMLTextAreaElement;
          enforceNumericFieldAttributes(field);
          normalizeFieldValue(field);
          return;
        }
        enforceNumericFieldsInRoot(node);
        normalizeTextDigitsInRoot(node);
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'value']
  });
};

export { DATE_LOCALE };
