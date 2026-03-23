export type RuntimeErrorKind = 'window-error' | 'unhandled-rejection' | 'react-boundary' | 'bootstrap';

export type RuntimeErrorEntry = {
  id: string;
  at: string;
  kind: RuntimeErrorKind;
  message: string;
  stack?: string;
  source?: string;
  userAgent?: string;
};

export const RUNTIME_ERROR_LOG_KEY = 'al_mohaseb_runtime_error_log';
export const MAX_RUNTIME_ERROR_LOG_ENTRIES = 60;

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const parseEntries = (raw: string | null): RuntimeErrorEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.message === 'string');
  } catch {
    return [];
  }
};

export const appendRuntimeErrorEntry = (
  entries: RuntimeErrorEntry[],
  next: RuntimeErrorEntry,
  maxEntries = MAX_RUNTIME_ERROR_LOG_ENTRIES
): RuntimeErrorEntry[] => {
  const merged = [...entries, next];
  if (merged.length <= maxEntries) return merged;
  return merged.slice(merged.length - maxEntries);
};

export const getRuntimeErrorLog = (): RuntimeErrorEntry[] => {
  const storage = getStorage();
  if (!storage) return [];
  return parseEntries(storage.getItem(RUNTIME_ERROR_LOG_KEY));
};

export const clearRuntimeErrorLog = (): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(RUNTIME_ERROR_LOG_KEY);
  } catch {
    // Ignore quota/storage errors.
  }
};

export const recordRuntimeError = (input: {
  kind: RuntimeErrorKind;
  message: string;
  stack?: string;
  source?: string;
}): void => {
  const storage = getStorage();
  if (!storage) return;

  const entry: RuntimeErrorEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind: input.kind,
    message: String(input.message || 'Unknown error'),
    stack: input.stack,
    source: input.source,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };

  try {
    const current = parseEntries(storage.getItem(RUNTIME_ERROR_LOG_KEY));
    const next = appendRuntimeErrorEntry(current, entry);
    storage.setItem(RUNTIME_ERROR_LOG_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota/storage errors.
  }
};
