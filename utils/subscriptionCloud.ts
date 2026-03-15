import { CloudCompanySubscription, CloudSubscriptionCode, CompanyProfile, CompanySubscriptionPlan, CompanySubscriptionStatus, SubscriptionDeviceBinding, User } from '../types';

const SUBSCRIPTION_DEVICE_ID_KEY = 'al_mohaseb_subscription_device_id';
const RAW_SUBSCRIPTION_ADMIN_EMAILS = String(import.meta.env.VITE_SUBSCRIPTION_ADMIN_EMAILS || '').trim();
const SUBSCRIPTION_ADMIN_EMAILS = new Set(
  RAW_SUBSCRIPTION_ADMIN_EMAILS
    .split(/[,\n;]/)
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);

const clampGraceDays = (value: unknown): number =>
  Math.max(0, Math.min(30, Math.floor(Number(value) || 0)));

const normalizeOptionalIsoDate = (value: unknown): string | undefined => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
};

const normalizeSubscriptionStatus = (value: unknown): CompanySubscriptionStatus => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'ACTIVE' || normalized === 'EXPIRED' || normalized === 'SUSPENDED' ? normalized : 'TRIAL';
};

const normalizeSubscriptionPlan = (value: unknown, fallback: CompanySubscriptionPlan = 'TRIAL'): CompanySubscriptionPlan => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'NONE' || normalized === 'BASIC' || normalized === 'PRO' || normalized === 'ENTERPRISE' || normalized === 'TRIAL'
    ? normalized
    : fallback;
};

const normalizeDeviceBinding = (value: unknown): SubscriptionDeviceBinding | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const deviceId = String(candidate.deviceId || '').trim();
  if (!deviceId) return null;
  return {
    deviceId,
    label: String(candidate.label || 'Unknown device').trim() || 'Unknown device',
    platform: String(candidate.platform || '').trim() || undefined,
    userAgent: String(candidate.userAgent || '').trim() || undefined,
    firstSeenAt: normalizeOptionalIsoDate(candidate.firstSeenAt) || new Date().toISOString(),
    lastSeenAt: normalizeOptionalIsoDate(candidate.lastSeenAt) || new Date().toISOString(),
    lastUserId: String(candidate.lastUserId || '').trim() || undefined,
    lastUserEmail: String(candidate.lastUserEmail || '').trim() || undefined
  };
};

export const getOrCreateSubscriptionDeviceId = (): string => {
  if (typeof window === 'undefined') {
    return 'device-server-render';
  }

  const existing = String(localStorage.getItem(SUBSCRIPTION_DEVICE_ID_KEY) || '').trim();
  if (existing) return existing;

  const nextId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `device_${Math.random().toString(36).slice(2, 12)}`;

  localStorage.setItem(SUBSCRIPTION_DEVICE_ID_KEY, nextId);
  return nextId;
};

export const getCurrentSubscriptionDeviceBinding = (
  deviceId: string,
  currentUser?: Pick<User, 'id' | 'email'> | null
): SubscriptionDeviceBinding => {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const platform = String((nav as Navigator & { userAgentData?: { platform?: string } })?.userAgentData?.platform || nav?.platform || '').trim();
  const label = platform
    ? `${platform} - ${deviceId.slice(0, 8)}`
    : `Browser - ${deviceId.slice(0, 8)}`;
  return {
    deviceId,
    label,
    platform: platform || undefined,
    userAgent: String(nav?.userAgent || '').trim() || undefined,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastUserId: currentUser?.id,
    lastUserEmail: currentUser?.email
  };
};

export const isSubscriptionAdminEmail = (email?: string | null): boolean =>
  Boolean(email && SUBSCRIPTION_ADMIN_EMAILS.has(String(email).trim().toLowerCase()));

export const normalizeCloudCompanySubscription = (
  companyId: string,
  value: unknown,
  fallbackCompany?: CompanyProfile | null
): CloudCompanySubscription => {
  const candidate = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const status = normalizeSubscriptionStatus(candidate.status ?? fallbackCompany?.subscriptionStatus);
  const plan = normalizeSubscriptionPlan(candidate.plan, fallbackCompany?.subscriptionPlan || (status === 'TRIAL' ? 'TRIAL' : 'NONE'));
  const fallbackStartsAt = fallbackCompany?.subscriptionStartsAt || fallbackCompany?.createdAt || new Date().toISOString();
  const fallbackEndsAt = status === 'TRIAL' ? fallbackCompany?.trialEndsAt : fallbackCompany?.subscriptionEndsAt;

  return {
    companyId,
    companyName: String(candidate.companyName || fallbackCompany?.name || '').trim() || undefined,
    ownerUserId: String(candidate.ownerUserId || '').trim() || undefined,
    ownerEmail: String(candidate.ownerEmail || '').trim() || undefined,
    status,
    plan,
    startsAt: normalizeOptionalIsoDate(candidate.startsAt) || fallbackStartsAt,
    endsAt: normalizeOptionalIsoDate(candidate.endsAt) || fallbackEndsAt || undefined,
    graceDays: clampGraceDays(candidate.graceDays ?? fallbackCompany?.graceDays),
    activationCode: String(candidate.activationCode || fallbackCompany?.activationCode || '').trim() || undefined,
    maxDevices: Math.max(1, Math.min(20, Math.floor(Number(candidate.maxDevices) || 1))),
    source: String(candidate.source || '').trim().toUpperCase() === 'ACTIVATION_CODE'
      ? 'ACTIVATION_CODE'
      : String(candidate.source || '').trim().toUpperCase() === 'MANUAL'
        ? 'MANUAL'
        : String(candidate.source || '').trim().toUpperCase() === 'CLOUD_SYNC'
          ? 'CLOUD_SYNC'
          : 'TRIAL',
    updatedAt: normalizeOptionalIsoDate(candidate.updatedAt) || new Date().toISOString(),
    updatedByUserId: String(candidate.updatedByUserId || '').trim() || undefined,
    updatedByEmail: String(candidate.updatedByEmail || '').trim() || undefined,
    boundDevices: Array.isArray(candidate.boundDevices)
      ? candidate.boundDevices.map(normalizeDeviceBinding).filter((item): item is SubscriptionDeviceBinding => Boolean(item))
      : [],
    reservedCompanyId: String(candidate.reservedCompanyId || '').trim() || undefined,
    reservedCompanyName: String(candidate.reservedCompanyName || '').trim() || undefined,
    notes: String(candidate.notes || '').trim() || undefined
  };
};

export const normalizeCloudSubscriptionCode = (value: unknown): CloudSubscriptionCode | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const code = String(candidate.code || '').trim().toUpperCase();
  if (!code) return null;
  const rawStatus = String(candidate.status || '').trim().toUpperCase();
  const status = rawStatus === 'USED' || rawStatus === 'CANCELLED' || rawStatus === 'EXPIRED'
    ? rawStatus
    : 'AVAILABLE';
  const plan = normalizeSubscriptionPlan(candidate.plan, 'BASIC');

  return {
    code,
    status,
    plan,
    durationDays: Math.max(1, Math.min(3650, Math.floor(Number(candidate.durationDays) || 30))),
    maxDevices: Math.max(1, Math.min(20, Math.floor(Number(candidate.maxDevices) || 1))),
    createdAt: normalizeOptionalIsoDate(candidate.createdAt) || new Date().toISOString(),
    createdByUserId: String(candidate.createdByUserId || '').trim() || undefined,
    createdByEmail: String(candidate.createdByEmail || '').trim() || undefined,
    expiresAt: normalizeOptionalIsoDate(candidate.expiresAt),
    notes: String(candidate.notes || '').trim() || undefined,
    reservedCompanyId: String(candidate.reservedCompanyId || '').trim() || undefined,
    reservedCompanyName: String(candidate.reservedCompanyName || '').trim() || undefined,
    usedAt: normalizeOptionalIsoDate(candidate.usedAt),
    usedByCompanyId: String(candidate.usedByCompanyId || '').trim() || undefined,
    usedByCompanyName: String(candidate.usedByCompanyName || '').trim() || undefined,
    usedByDeviceId: String(candidate.usedByDeviceId || '').trim() || undefined,
    usedByUserId: String(candidate.usedByUserId || '').trim() || undefined,
    usedByEmail: String(candidate.usedByEmail || '').trim() || undefined
  };
};

export const buildCloudSubscriptionFromCompanyProfile = (
  company: CompanyProfile,
  options?: {
    source?: CloudCompanySubscription['source'];
    updatedByUserId?: string;
    updatedByEmail?: string;
    maxDevices?: number;
    boundDevices?: SubscriptionDeviceBinding[];
    notes?: string;
  }
): CloudCompanySubscription => ({
  companyId: company.id,
  companyName: company.name,
  ownerUserId: options?.updatedByUserId,
  ownerEmail: options?.updatedByEmail,
  status: company.subscriptionStatus,
  plan: company.subscriptionPlan,
  startsAt: company.subscriptionStartsAt || company.createdAt,
  endsAt: company.subscriptionStatus === 'TRIAL' ? company.trialEndsAt : company.subscriptionEndsAt,
  graceDays: clampGraceDays(company.graceDays),
  activationCode: company.activationCode,
  maxDevices: Math.max(1, Math.min(20, Math.floor(Number(options?.maxDevices) || 1))),
  source: options?.source || (company.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'MANUAL'),
  updatedAt: new Date().toISOString(),
  updatedByUserId: options?.updatedByUserId,
  updatedByEmail: options?.updatedByEmail,
  boundDevices: options?.boundDevices || [],
  reservedCompanyId: undefined,
  reservedCompanyName: undefined,
  notes: options?.notes
});
