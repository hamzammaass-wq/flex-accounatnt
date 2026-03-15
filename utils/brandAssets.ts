export const DEFAULT_BRAND_LOGO_URL = '/brand/aiflex-erp-logo.svg';
export const DEFAULT_BRAND_MARK_URL = '/brand/aiflex-erp-mark.png';

const LEGACY_BRAND_ASSET_MAP: Record<string, string> = {
  '/brand/aiflex-erp-logo.png': DEFAULT_BRAND_LOGO_URL,
  '/brand/aiflex-erp-logo.svg': DEFAULT_BRAND_LOGO_URL,
  '/brand/aiflex-erp-mark.png': DEFAULT_BRAND_MARK_URL,
  '/brand/aiflex-erp-mark.svg': DEFAULT_BRAND_MARK_URL,
  '/icons/icon-192.svg': '/icons/icon-192.png',
  '/icons/icon-512.svg': '/icons/icon-512.png'
};

export const normalizeBrandLogoUrl = (
  value: string | null | undefined,
  fallback = DEFAULT_BRAND_MARK_URL
): string => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return LEGACY_BRAND_ASSET_MAP[normalized] || normalized;
};
