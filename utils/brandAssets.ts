export const DEFAULT_BRAND_LOGO_URL = '/brand/aiflex-erp-logo.png';
export const BRAND_MARK_URLS = {
  xs: '/icons/favicon-32.png',
  sm: '/icons/icon-48.png',
  md: '/icons/icon-72.png',
  lg: '/icons/icon-128.png',
  xl: '/icons/icon-192.png',
  xxl: '/icons/icon-256.png',
  app: '/icons/icon-512.png',
  master: '/brand/aiflex-erp-mark.png'
} as const;
export const DEFAULT_BRAND_MARK_URL = BRAND_MARK_URLS.xl;

export const getBrandMarkUrl = (
  size: keyof typeof BRAND_MARK_URLS = 'xl'
): string => BRAND_MARK_URLS[size];

export const getBrandMarkSrcSet = (): string => ([
  `${BRAND_MARK_URLS.xs} 32w`,
  `${BRAND_MARK_URLS.sm} 48w`,
  `${BRAND_MARK_URLS.md} 72w`,
  `${BRAND_MARK_URLS.lg} 128w`,
  `${BRAND_MARK_URLS.xl} 192w`,
  `${BRAND_MARK_URLS.xxl} 256w`,
  `${BRAND_MARK_URLS.app} 512w`
].join(', '));

const LEGACY_BRAND_ASSET_MAP: Record<string, string> = {
  '/brand/aiflex-erp-logo.png': DEFAULT_BRAND_LOGO_URL,
  '/brand/aiflex-erp-logo.svg': DEFAULT_BRAND_LOGO_URL,
  '/brand/aiflex-erp-mark.png': DEFAULT_BRAND_MARK_URL,
  '/brand/aiflex-erp-mark.svg': DEFAULT_BRAND_MARK_URL,
  '/icons/favicon-32.png': BRAND_MARK_URLS.xs,
  '/icons/icon-48.png': BRAND_MARK_URLS.sm,
  '/icons/icon-72.png': BRAND_MARK_URLS.md,
  '/icons/icon-128.png': BRAND_MARK_URLS.lg,
  '/icons/icon-192.png': BRAND_MARK_URLS.xl,
  '/icons/icon-256.png': BRAND_MARK_URLS.xxl,
  '/icons/icon-512.png': BRAND_MARK_URLS.app,
  '/icons/icon-192.svg': '/icons/icon-192.png',
  '/icons/icon-512.svg': '/icons/icon-512.png'
};

export const normalizeBrandLogoUrl = (
  value: string | null | undefined,
  fallback: string = DEFAULT_BRAND_MARK_URL
): string => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return LEGACY_BRAND_ASSET_MAP[normalized] || normalized;
};
