import {
  CompanySubscriptionPlan,
  CompanySubscriptionStatus,
  SubscriptionBillingCycle,
  SubscriptionCheckoutProvider,
  SubscriptionCheckoutResult,
  SubscriptionProvider,
  SubscriptionProviderAvailability,
  WorkspaceSubscriptionAccount,
  WorkspaceSubscriptionQuote
} from '../types';

const INCLUDED_COMPANIES = 1;
const MAX_COMPANIES_CAP = 50;
const DEFAULT_PLAN: CompanySubscriptionPlan = 'BASIC';
const DEFAULT_CYCLE: SubscriptionBillingCycle = 'YEARLY';

const PRICING: Record<SubscriptionBillingCycle, { basePriceUsd: number; extraCompanyPriceUsd: number }> = {
  YEARLY: { basePriceUsd: 100, extraCompanyPriceUsd: 20 }
};

const PALPAY_CHECKOUT_URL = String(import.meta.env.VITE_PALPAY_CHECKOUT_URL || '').trim();
const APPLE_PRODUCT_PREFIX = String(import.meta.env.VITE_APPLE_SUBSCRIPTION_PRODUCT_PREFIX || '').trim();
const GOOGLE_PRODUCT_PREFIX = String(import.meta.env.VITE_GOOGLE_SUBSCRIPTION_PRODUCT_PREFIX || '').trim();
const PADDLE_CLIENT_TOKEN = String(import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '').trim();
const PADDLE_BASE_PRICE_ID = String(import.meta.env.VITE_PADDLE_BASE_PRICE_ID || '').trim();
const PADDLE_EXTRA_PRICE_ID = String(import.meta.env.VITE_PADDLE_EXTRA_PRICE_ID || '').trim();

const isValidStatus = (value: unknown): value is CompanySubscriptionStatus => (
  value === 'TRIAL' || value === 'ACTIVE' || value === 'EXPIRED' || value === 'SUSPENDED'
);

const isValidPlan = (value: unknown): value is CompanySubscriptionPlan => (
  value === 'NONE' || value === 'TRIAL' || value === 'BASIC' || value === 'PRO' || value === 'ENTERPRISE'
);

const isValidCycle = (value: unknown): value is SubscriptionBillingCycle => (
  value === 'YEARLY'
);

const isValidProvider = (value: unknown): value is SubscriptionProvider => (
  value === 'NONE'
  || value === 'TRIAL'
  || value === 'MANUAL'
  || value === 'PALPAY'
  || value === 'APPLE'
  || value === 'GOOGLE'
  || value === 'PADDLE'
);

const normalizeOptionalIsoDate = (value: unknown): string | undefined => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
};

const clampCompanyCount = (value: unknown, fallback = INCLUDED_COMPANIES): number => (
  Math.max(INCLUDED_COMPANIES, Math.min(MAX_COMPANIES_CAP, Math.floor(Number(value) || fallback)))
);

const clampExtraCompanyCount = (value: unknown): number => (
  Math.max(0, Math.min(MAX_COMPANIES_CAP - INCLUDED_COMPANIES, Math.floor(Number(value) || 0)))
);

const clampDiscountPercent = (value: unknown): number => (
  Math.max(0, Math.min(100, Math.floor(Number(value) || 0)))
);

const buildStoreProductId = (
  provider: Extract<SubscriptionCheckoutProvider, 'APPLE' | 'GOOGLE'>,
  cycle: SubscriptionBillingCycle,
  desiredCompanyCount: number
): string | undefined => {
  const prefix = provider === 'APPLE' ? APPLE_PRODUCT_PREFIX : GOOGLE_PRODUCT_PREFIX;
  if (!prefix) return undefined;
  return `${prefix}.basic.${cycle.toLowerCase()}.${desiredCompanyCount}c`;
};

const buildCheckoutUrl = (baseUrl: string, quote: WorkspaceSubscriptionQuote): string => {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://example.invalid';
    const url = /^https?:\/\//i.test(baseUrl) ? new URL(baseUrl) : new URL(baseUrl, origin);
    url.searchParams.set('plan', quote.plan);
    url.searchParams.set('billingCycle', quote.billingCycle);
    url.searchParams.set('companyCount', String(quote.desiredCompanyCount));
    url.searchParams.set('maxCompanies', String(quote.maxCompanies));
    url.searchParams.set('extraCompanies', String(quote.extraCompanyCount));
    url.searchParams.set('currency', quote.currency);
    url.searchParams.set('totalPriceUsd', String(quote.totalPriceUsd));
    if (quote.discountPercent > 0) {
      url.searchParams.set('discountPercent', String(quote.discountPercent));
      url.searchParams.set('discountAmountUsd', String(quote.discountAmountUsd));
    }
    if (quote.offerCode) {
      url.searchParams.set('offerCode', quote.offerCode);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
};

export const getSubscriptionProviderAvailability = (): SubscriptionProviderAvailability => ({
  palpayReady: Boolean(PALPAY_CHECKOUT_URL),
  appleReady: Boolean(APPLE_PRODUCT_PREFIX),
  googleReady: Boolean(GOOGLE_PRODUCT_PREFIX),
  paddleReady: Boolean(PADDLE_CLIENT_TOKEN)
});

export const buildDefaultWorkspaceSubscription = (input?: {
  userId?: string;
  userEmail?: string;
  plan?: CompanySubscriptionPlan;
  status?: CompanySubscriptionStatus;
  billingCycle?: SubscriptionBillingCycle;
  provider?: SubscriptionProvider;
  extraCompanyCount?: number;
  maxCompanies?: number;
  startedAt?: string;
  renewalDate?: string;
  expiresAt?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerProductId?: string;
  lastCheckoutSessionId?: string;
}): WorkspaceSubscriptionAccount => {
  const billingCycle = isValidCycle(input?.billingCycle) ? input.billingCycle : DEFAULT_CYCLE;
  const pricing = PRICING[billingCycle];
  const status = isValidStatus(input?.status) ? input.status : 'TRIAL';
  const plan = isValidPlan(input?.plan)
    ? input.plan
    : (status === 'TRIAL' ? 'TRIAL' : DEFAULT_PLAN);
  const provider = isValidProvider(input?.provider)
    ? input.provider
    : (status === 'TRIAL' ? 'TRIAL' : 'MANUAL');
  const explicitMaxCompanies = clampCompanyCount(input?.maxCompanies);
  const extraCompanyCount = Math.max(
    clampExtraCompanyCount(input?.extraCompanyCount),
    explicitMaxCompanies - INCLUDED_COMPANIES
  );
  const maxCompanies = clampCompanyCount(INCLUDED_COMPANIES + extraCompanyCount, explicitMaxCompanies);
  const startedAt = normalizeOptionalIsoDate(input?.startedAt) || new Date().toISOString();

  return {
    userId: String(input?.userId || '').trim(),
    userEmail: String(input?.userEmail || '').trim() || undefined,
    status,
    plan,
    billingCycle,
    provider,
    includedCompanies: INCLUDED_COMPANIES,
    extraCompanyCount,
    maxCompanies,
    currency: 'USD',
    basePriceUsd: pricing.basePriceUsd,
    extraCompanyPriceUsd: pricing.extraCompanyPriceUsd,
    startedAt,
    renewalDate: normalizeOptionalIsoDate(input?.renewalDate),
    expiresAt: normalizeOptionalIsoDate(input?.expiresAt),
    providerCustomerId: String(input?.providerCustomerId || '').trim() || undefined,
    providerSubscriptionId: String(input?.providerSubscriptionId || '').trim() || undefined,
    providerProductId: String(input?.providerProductId || '').trim() || undefined,
    lastCheckoutSessionId: String(input?.lastCheckoutSessionId || '').trim() || undefined,
    discountPercent: 0,
    offerCode: undefined,
    offerNote: undefined,
    lifetimeAccess: false,
    unlimitedCompanies: false,
    updatedAt: new Date().toISOString()
  };
};

export const normalizeWorkspaceSubscription = (
  value: unknown,
  fallback?: Partial<WorkspaceSubscriptionAccount>
): WorkspaceSubscriptionAccount => {
  const candidate = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const billingCycle = isValidCycle(candidate.billingCycle) ? candidate.billingCycle : fallback?.billingCycle || DEFAULT_CYCLE;
  const pricing = PRICING[billingCycle];
  const status = isValidStatus(candidate.status) ? candidate.status : fallback?.status || 'TRIAL';
  const plan = isValidPlan(candidate.plan)
    ? candidate.plan
    : fallback?.plan || (status === 'TRIAL' ? 'TRIAL' : DEFAULT_PLAN);
  const provider = isValidProvider(candidate.provider)
    ? candidate.provider
    : fallback?.provider || (status === 'TRIAL' ? 'TRIAL' : 'MANUAL');
  const includedCompanies = clampCompanyCount(candidate.includedCompanies, fallback?.includedCompanies || INCLUDED_COMPANIES);
  const maxCompanies = clampCompanyCount(candidate.maxCompanies, fallback?.maxCompanies || includedCompanies);
  const extraCompanyCount = Math.max(
    clampExtraCompanyCount(candidate.extraCompanyCount),
    maxCompanies - includedCompanies
  );
  const unlimitedCompanies = candidate.unlimitedCompanies === true
    ? true
    : candidate.unlimitedCompanies === false
      ? false
      : fallback?.unlimitedCompanies === true
        ? true
        : candidate.lifetimeAccess === true && fallback?.unlimitedCompanies == null;

  return {
    userId: String(candidate.userId || fallback?.userId || '').trim(),
    userEmail: String(candidate.userEmail || fallback?.userEmail || '').trim() || undefined,
    status,
    plan,
    billingCycle,
    provider,
    includedCompanies,
    extraCompanyCount,
    maxCompanies: Math.max(includedCompanies, maxCompanies),
    currency: 'USD',
    basePriceUsd: Math.max(0, Number(candidate.basePriceUsd) || fallback?.basePriceUsd || pricing.basePriceUsd),
    extraCompanyPriceUsd: Math.max(0, Number(candidate.extraCompanyPriceUsd) || fallback?.extraCompanyPriceUsd || pricing.extraCompanyPriceUsd),
    startedAt: normalizeOptionalIsoDate(candidate.startedAt) || fallback?.startedAt || new Date().toISOString(),
    renewalDate: normalizeOptionalIsoDate(candidate.renewalDate) || fallback?.renewalDate,
    expiresAt: normalizeOptionalIsoDate(candidate.expiresAt) || fallback?.expiresAt,
    providerCustomerId: String(candidate.providerCustomerId || fallback?.providerCustomerId || '').trim() || undefined,
    providerSubscriptionId: String(candidate.providerSubscriptionId || fallback?.providerSubscriptionId || '').trim() || undefined,
    providerProductId: String(candidate.providerProductId || fallback?.providerProductId || '').trim() || undefined,
    lastCheckoutSessionId: String(candidate.lastCheckoutSessionId || fallback?.lastCheckoutSessionId || '').trim() || undefined,
    discountPercent: clampDiscountPercent(candidate.discountPercent ?? fallback?.discountPercent),
    offerCode: String(candidate.offerCode || fallback?.offerCode || '').trim() || undefined,
    offerNote: String(candidate.offerNote || fallback?.offerNote || '').trim() || undefined,
    lifetimeAccess: candidate.lifetimeAccess === true || fallback?.lifetimeAccess === true,
    unlimitedCompanies,
    updatedAt: normalizeOptionalIsoDate(candidate.updatedAt) || new Date().toISOString()
  };
};

export const getWorkspaceEffectiveMaxCompanies = (
  subscription: WorkspaceSubscriptionAccount,
  currentCompanyCount: number
): number => {
  if (subscription.unlimitedCompanies === true) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    INCLUDED_COMPANIES,
    Math.max(0, Math.floor(Number(currentCompanyCount) || 0)),
    clampCompanyCount(subscription.maxCompanies, subscription.includedCompanies + subscription.extraCompanyCount)
  );
};

export const getWorkspaceRemainingCompanySlots = (
  subscription: WorkspaceSubscriptionAccount,
  currentCompanyCount: number
): number => (
  subscription.unlimitedCompanies === true
    ? Number.POSITIVE_INFINITY
    : Math.max(0, getWorkspaceEffectiveMaxCompanies(subscription, currentCompanyCount) - Math.max(0, currentCompanyCount))
);

export const buildWorkspaceSubscriptionQuote = (input: {
  provider: SubscriptionCheckoutProvider;
  billingCycle: SubscriptionBillingCycle;
  desiredCompanyCount: number;
  discountPercent?: number;
  offerCode?: string;
}): WorkspaceSubscriptionQuote => {
  const desiredCompanyCount = clampCompanyCount(input.desiredCompanyCount);
  const extraCompanyCount = Math.max(0, desiredCompanyCount - INCLUDED_COMPANIES);
  const pricing = PRICING[input.billingCycle];
  const availability = getSubscriptionProviderAvailability();
  const subtotalPriceUsd = pricing.basePriceUsd + (extraCompanyCount * pricing.extraCompanyPriceUsd);
  const discountPercent = clampDiscountPercent(input.discountPercent);
  const discountAmountUsd = Number(((subtotalPriceUsd * discountPercent) / 100).toFixed(2));
  const quote: WorkspaceSubscriptionQuote = {
    plan: DEFAULT_PLAN,
    billingCycle: input.billingCycle,
    provider: input.provider,
    desiredCompanyCount,
    includedCompanies: INCLUDED_COMPANIES,
    extraCompanyCount,
    maxCompanies: desiredCompanyCount,
    currency: 'USD',
    basePriceUsd: pricing.basePriceUsd,
    extraCompanyPriceUsd: pricing.extraCompanyPriceUsd,
    subtotalPriceUsd,
    discountPercent,
    discountAmountUsd,
    totalPriceUsd: Number((subtotalPriceUsd - discountAmountUsd).toFixed(2)),
    providerReady: false
  };

  if (input.provider === 'PALPAY') {
    const checkoutUrl = PALPAY_CHECKOUT_URL ? buildCheckoutUrl(PALPAY_CHECKOUT_URL, quote) : undefined;
    return {
      ...quote,
      providerReady: availability.palpayReady,
      checkoutMode: checkoutUrl ? 'EXTERNAL_URL' : undefined,
      checkoutUrl,
      offerCode: String(input.offerCode || '').trim() || undefined
    };
  }

  if (input.provider === 'PADDLE') {
    return {
      ...quote,
      providerReady: availability.paddleReady,
      checkoutMode: PADDLE_BASE_PRICE_ID ? 'STORE_PRODUCT' : undefined,
      productId: PADDLE_BASE_PRICE_ID || undefined,
      offerCode: String(input.offerCode || '').trim() || undefined
    };
  }

  const productId = buildStoreProductId(input.provider, input.billingCycle, desiredCompanyCount);
  return {
    ...quote,
    providerReady: input.provider === 'APPLE' ? availability.appleReady : availability.googleReady,
    checkoutMode: productId ? 'STORE_PRODUCT' : undefined,
    productId,
    offerCode: String(input.offerCode || '').trim() || undefined
  };
};

export const prepareWorkspaceCheckout = (input: {
  provider: SubscriptionCheckoutProvider;
  billingCycle: SubscriptionBillingCycle;
  desiredCompanyCount: number;
  discountPercent?: number;
  offerCode?: string;
}): SubscriptionCheckoutResult => {
  const quote = buildWorkspaceSubscriptionQuote(input);
  if (!quote.providerReady || !quote.checkoutMode) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: `${input.provider} checkout is not configured yet. Add the provider credentials and product mapping first.`
    };
  }

  if (quote.checkoutMode === 'EXTERNAL_URL') {
    return {
      ok: true,
      provider: input.provider,
      mode: quote.checkoutMode,
      message: `Checkout is ready for ${quote.desiredCompanyCount} company slot(s).`,
      url: quote.checkoutUrl
    };
  }

  return {
    ok: true,
    provider: input.provider,
    mode: quote.checkoutMode,
    message: `Store product prepared for ${quote.desiredCompanyCount} company slot(s).`,
    productId: quote.productId
  };
};
