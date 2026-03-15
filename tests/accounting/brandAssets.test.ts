import { describe, expect, it } from 'vitest';

import { DEFAULT_BRAND_LOGO_URL, DEFAULT_BRAND_MARK_URL, normalizeBrandLogoUrl } from '../../utils/brandAssets';

describe('brand assets normalization', () => {
  it('maps legacy brand paths to the current bundled assets', () => {
    expect(normalizeBrandLogoUrl('/brand/aiflex-erp-logo.png', DEFAULT_BRAND_LOGO_URL)).toBe(DEFAULT_BRAND_LOGO_URL);
    expect(normalizeBrandLogoUrl('/brand/aiflex-erp-logo.svg', DEFAULT_BRAND_LOGO_URL)).toBe(DEFAULT_BRAND_LOGO_URL);
    expect(normalizeBrandLogoUrl('/brand/aiflex-erp-mark.svg')).toBe(DEFAULT_BRAND_MARK_URL);
  });

  it('falls back to the default brand mark when logo is missing', () => {
    expect(normalizeBrandLogoUrl(undefined)).toBe(DEFAULT_BRAND_MARK_URL);
    expect(normalizeBrandLogoUrl('   ')).toBe(DEFAULT_BRAND_MARK_URL);
  });

  it('preserves custom uploaded logos', () => {
    const customLogo = 'data:image/png;base64,abc123';
    expect(normalizeBrandLogoUrl(customLogo)).toBe(customLogo);
  });
});
