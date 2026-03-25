import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();

const db = getFirestore();

const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION || 'us-central1';
const GOOGLE_PLAY_PACKAGE_NAME = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim();
const APPLE_ALLOW_UNVERIFIED_NOTIFICATIONS = String(process.env.APPLE_ALLOW_UNVERIFIED_NOTIFICATIONS || '').trim().toLowerCase() === 'true';

const COLLECTIONS = {
  workspaceSubscriptions: 'workspace_subscriptions',
  companySubscriptions: 'company_subscriptions',
  billingEvents: 'billing_events',
  billingCheckoutRequests: 'billing_checkout_requests',
  accountDeletionRequests: 'account_deletion_requests'
};

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

const clampCompanyCount = (value) => Math.max(1, Math.min(50, Math.floor(Number(value) || 1)));
const normalizeBillingCycle = () => 'YEARLY';
const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const unixSecondsToIso = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
};
const nowIso = () => new Date().toISOString();

const pricingForCycle = () => ({
  basePriceUsd: 20,
  extraCompanyPriceUsd: 5,
  interval: 'year'
});

const mapGoogleStatus = (status) => {
  switch (String(status || '').trim()) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'ACTIVE';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'SUSPENDED';
    case 'SUBSCRIPTION_STATE_EXPIRED':
    case 'SUBSCRIPTION_STATE_CANCELED':
      return 'EXPIRED';
    default:
      return 'ACTIVE';
  }
};

const mapAppleStatus = (notificationType) => {
  switch (String(notificationType || '').trim()) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
      return 'ACTIVE';
    case 'DID_FAIL_TO_RENEW':
    case 'GRACE_PERIOD_EXPIRED':
      return 'SUSPENDED';
    case 'EXPIRED':
    case 'REVOKE':
      return 'EXPIRED';
    default:
      return 'ACTIVE';
  }
};

const sanitizeRedirectUrl = (value, fallback) => {
  const candidate = String(value || '').trim();
  return isHttpUrl(candidate) ? candidate : fallback;
};

const safeJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeText = (value, maxLength = 160) => {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const normalizeMultilineText = (value, maxLength = 2000) => {
  const normalized = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const normalizeEmail = (value) => normalizeText(value, 190).toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
};

const getClientIp = (req) => {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return String(req.ip || '').trim();
};

const applyPublicApiCors = (res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
};

const extractGooglePushEnvelope = (body) => {
  if (!body || typeof body !== 'object') {
    return { payload: {}, messageId: '' };
  }

  if (body.subscriptionNotification || body.testNotification) {
    return {
      payload: body,
      messageId: String(body.messageId || body.eventId || '').trim()
    };
  }

  const pushMessage = body.message && typeof body.message === 'object' ? body.message : null;
  if (!pushMessage) {
    return { payload: {}, messageId: '' };
  }

  const payload = pushMessage.json
    || safeJson(Buffer.from(String(pushMessage.data || ''), 'base64').toString('utf8'))
    || {};

  return {
    payload,
    messageId: String(pushMessage.messageId || body.messageId || '').trim()
  };
};

const decodeJwtPayload = (token) => {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const parseOfferFromProductId = (productId) => {
  const raw = String(productId || '').trim().toLowerCase();
  const match = raw.match(/\.(monthly|yearly)\.(\d+)c$/);
  if (!match) {
    return {
      billingCycle: 'YEARLY',
      desiredCompanyCount: 1
    };
  }
  return {
    billingCycle: 'YEARLY',
    desiredCompanyCount: clampCompanyCount(match[2])
  };
};

let googleApisPromise = null;

const writeBillingEventOnce = async ({ provider, eventId, type, summary, raw }) => {
  const docId = `${provider}_${String(eventId || Date.now())}`;
  const ref = db.collection(COLLECTIONS.billingEvents).doc(docId);
  const existing = await ref.get();
  if (existing.exists) {
    return { ref, isNew: false };
  }
  await ref.set({
    provider,
    eventId: String(eventId || '').trim() || undefined,
    type: String(type || '').trim() || 'UNKNOWN',
    status: 'RECEIVED',
    receivedAt: nowIso(),
    summary: summary || {},
    raw: raw || null
  }, { merge: true });
  return { ref, isNew: true };
};

const findWorkspaceSubscription = async ({ providerSubscriptionId, providerCustomerId, userId }) => {
  if (userId) {
    const direct = await db.collection(COLLECTIONS.workspaceSubscriptions).doc(userId).get();
    if (direct.exists) return direct;
  }

  if (providerSubscriptionId) {
    const bySubscription = await db.collection(COLLECTIONS.workspaceSubscriptions)
      .where('providerSubscriptionId', '==', providerSubscriptionId)
      .limit(1)
      .get();
    if (!bySubscription.empty) return bySubscription.docs[0];
  }

  if (providerCustomerId) {
    const byCustomer = await db.collection(COLLECTIONS.workspaceSubscriptions)
      .where('providerCustomerId', '==', providerCustomerId)
      .limit(1)
      .get();
    if (!byCustomer.empty) return byCustomer.docs[0];
  }

  return null;
};

const applyWorkspaceSubscriptionState = async ({
  userId,
  userEmail,
  status,
  provider,
  billingCycle,
  desiredCompanyCount,
  startedAt,
  renewalDate,
  expiresAt,
  providerCustomerId,
  providerSubscriptionId,
  providerProductId,
  lastCheckoutSessionId
}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('Workspace subscription update requires a userId.');
  }

  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const normalizedCompanyCount = clampCompanyCount(desiredCompanyCount);
  const pricing = pricingForCycle(normalizedCycle);
  const workspaceRef = db.collection(COLLECTIONS.workspaceSubscriptions).doc(normalizedUserId);
  const existingSnapshot = await workspaceRef.get();
  const existing = existingSnapshot.exists ? existingSnapshot.data() || {} : {};
  const nextPayload = {
    userId: normalizedUserId,
    userEmail: String(userEmail || existing.userEmail || '').trim() || undefined,
    status: status || existing.status || 'ACTIVE',
    plan: 'BASIC',
    billingCycle: normalizedCycle,
    provider,
    includedCompanies: 1,
    extraCompanyCount: Math.max(0, normalizedCompanyCount - 1),
    maxCompanies: normalizedCompanyCount,
    currency: 'USD',
    basePriceUsd: pricing.basePriceUsd,
    extraCompanyPriceUsd: pricing.extraCompanyPriceUsd,
    startedAt: startedAt || existing.startedAt || nowIso(),
    renewalDate: renewalDate || existing.renewalDate || expiresAt || undefined,
    expiresAt: expiresAt || existing.expiresAt || undefined,
    providerCustomerId: String(providerCustomerId || existing.providerCustomerId || '').trim() || undefined,
    providerSubscriptionId: String(providerSubscriptionId || existing.providerSubscriptionId || '').trim() || undefined,
    providerProductId: String(providerProductId || existing.providerProductId || '').trim() || undefined,
    lastCheckoutSessionId: String(lastCheckoutSessionId || existing.lastCheckoutSessionId || '').trim() || undefined,
    updatedAt: nowIso()
  };

  await workspaceRef.set(nextPayload, { merge: true });

  const companySnapshots = await db.collection(COLLECTIONS.companySubscriptions)
    .where('ownerUserId', '==', normalizedUserId)
    .get();

  if (!companySnapshots.empty) {
    const batch = db.batch();
    companySnapshots.docs.forEach((companyDoc) => {
      batch.set(companyDoc.ref, {
        ownerUserId: normalizedUserId,
        ownerEmail: nextPayload.userEmail || undefined,
        status: nextPayload.status,
        plan: 'BASIC',
        startsAt: nextPayload.startedAt,
        endsAt: nextPayload.expiresAt,
        source: 'CLOUD_SYNC',
        updatedAt: nextPayload.updatedAt,
        updatedByUserId: 'system_billing',
        updatedByEmail: `${provider.toLowerCase()}-webhook@system.local`,
        notes: `Auto-synced from ${provider} billing`
      }, { merge: true });
    });
    await batch.commit();
  }

  return nextPayload;
};

const getAndroidPublisherClient = async () => {
  if (!googleApisPromise) {
    googleApisPromise = import('googleapis');
  }
  const { google } = await googleApisPromise;
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
  });
  return google.androidpublisher({ version: 'v3', auth });
};

export const appleSubscriptionNotifications = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const signedPayload = String(req.body?.signedPayload || '').trim();
  const decodedNotification = decodeJwtPayload(signedPayload);
  const notificationType = String(decodedNotification?.notificationType || 'UNKNOWN').trim();
  const notificationUUID = String(decodedNotification?.notificationUUID || Date.now()).trim();
  const data = decodedNotification?.data || {};
  const transactionInfo = decodeJwtPayload(data.signedTransactionInfo);
  const productId = String(transactionInfo?.productId || '').trim();
  const { billingCycle, desiredCompanyCount } = parseOfferFromProductId(productId);
  const userId = String(transactionInfo?.appAccountToken || '').trim();

  const eventRecord = await writeBillingEventOnce({
    provider: 'APPLE',
    eventId: notificationUUID,
    type: notificationType,
    summary: {
      productId: productId || undefined,
      userId: userId || undefined
    }
  });

  if (eventRecord.isNew && APPLE_ALLOW_UNVERIFIED_NOTIFICATIONS && userId) {
    await applyWorkspaceSubscriptionState({
      userId,
      userEmail: undefined,
      status: mapAppleStatus(notificationType),
      provider: 'APPLE',
      billingCycle,
      desiredCompanyCount,
      startedAt: transactionInfo?.purchaseDate ? new Date(Number(transactionInfo.purchaseDate)).toISOString() : undefined,
      renewalDate: transactionInfo?.expiresDate ? new Date(Number(transactionInfo.expiresDate)).toISOString() : undefined,
      expiresAt: transactionInfo?.expiresDate ? new Date(Number(transactionInfo.expiresDate)).toISOString() : undefined,
      providerProductId: productId || undefined,
      providerSubscriptionId: String(transactionInfo?.originalTransactionId || '').trim() || undefined
    });
    await eventRecord.ref.set({
      status: 'PROCESSED_UNVERIFIED',
      processedAt: nowIso()
    }, { merge: true });
  } else if (eventRecord.isNew) {
    await eventRecord.ref.set({
      status: userId ? 'PENDING_SIGNATURE_VERIFICATION' : 'PENDING_ACCOUNT_LINK',
      processedAt: nowIso()
    }, { merge: true });
  }

  res.json({ received: true });
});

export const googlePlaySubscriptionNotifications = onRequest(async (req, res) => {
  const { payload: rawPayload, messageId } = extractGooglePushEnvelope(req.body);
  const subscriptionNotification = rawPayload.subscriptionNotification || {};
  const purchaseToken = String(subscriptionNotification.purchaseToken || '').trim();
  const eventId = String(messageId || `${purchaseToken}_${Date.now()}`).trim();
  const eventType = String(subscriptionNotification.notificationType || 'RTDN').trim();

  const eventRecord = await writeBillingEventOnce({
    provider: 'GOOGLE',
    eventId,
    type: eventType,
    summary: {
      purchaseToken: purchaseToken ? `${purchaseToken.slice(0, 8)}...` : undefined
    }
  });

  if (!eventRecord.isNew || !purchaseToken || !GOOGLE_PLAY_PACKAGE_NAME) {
    res.json({ received: true, skipped: true });
    return;
  }

  try {
    const publisher = await getAndroidPublisherClient();
    const response = await publisher.purchases.subscriptionsv2.get({
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      token: purchaseToken
    });

    const subscription = response.data || {};
    const lineItem = Array.isArray(subscription.lineItems) ? subscription.lineItems[0] : null;
    const productId = String(lineItem?.productId || '').trim();
    const parsedOffer = parseOfferFromProductId(productId);
    const userId = String(
      subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId
      || subscription.externalAccountIdentifiers?.obfuscatedExternalProfileId
      || ''
    ).trim();

    if (userId) {
      await applyWorkspaceSubscriptionState({
        userId,
        userEmail: undefined,
        status: mapGoogleStatus(subscription.subscriptionState),
        provider: 'GOOGLE',
        billingCycle: parsedOffer.billingCycle,
        desiredCompanyCount: parsedOffer.desiredCompanyCount,
        startedAt: lineItem?.expiryTime || undefined,
        renewalDate: lineItem?.expiryTime || undefined,
        expiresAt: lineItem?.expiryTime || undefined,
        providerProductId: productId || undefined,
        providerSubscriptionId: purchaseToken
      });
      await eventRecord.ref.set({
        status: 'PROCESSED',
        processedAt: nowIso()
      }, { merge: true });
      res.json({ received: true, processed: true });
      return;
    }

    await eventRecord.ref.set({
      status: 'PENDING_ACCOUNT_LINK',
      processedAt: nowIso(),
      summary: {
        productId: productId || undefined
      }
    }, { merge: true });
    res.json({ received: true, pendingAccountLink: true });
  } catch (error) {
    logger.error('Google Play RTDN handling failed', error);
    await eventRecord.ref.set({
      status: 'ERROR',
      processedAt: nowIso(),
      errorMessage: String(error?.message || error || 'RTDN processing failed')
    }, { merge: true });
    res.status(500).json({ received: false, error: 'RTDN processing failed' });
  }
});

export const submitAccountDeletionRequest = onRequest(async (req, res) => {
  applyPublicApiCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const honeypot = normalizeText(body.website, 120);
    if (honeypot) {
      res.json({ ok: true, accepted: true });
      return;
    }

    const fullName = normalizeText(body.fullName, 120);
    const email = normalizeEmail(body.email);
    const companyName = normalizeText(body.companyName, 160);
    const signInMethodRaw = normalizeText(body.signInMethod, 40).toUpperCase();
    const signInMethod = (
      signInMethodRaw === 'GOOGLE'
      || signInMethodRaw === 'EMAIL_PASSWORD'
      || signInMethodRaw === 'EMAIL'
      || signInMethodRaw === 'APPLE'
      || signInMethodRaw === 'MICROSOFT'
    ) ? signInMethodRaw : 'UNKNOWN';
    const phone = normalizeText(body.phone, 40);
    const note = normalizeMultilineText(body.note, 2000);
    const confirmDeletion = parseBoolean(body.confirmDeletion);

    if (!fullName) {
      res.status(400).json({ ok: false, error: 'FULL_NAME_REQUIRED' });
      return;
    }

    if (!email || !isValidEmail(email)) {
      res.status(400).json({ ok: false, error: 'VALID_EMAIL_REQUIRED' });
      return;
    }

    if (!confirmDeletion) {
      res.status(400).json({ ok: false, error: 'CONFIRMATION_REQUIRED' });
      return;
    }

    const createdAt = nowIso();
    const clientIp = getClientIp(req);
    const requestRef = await db.collection(COLLECTIONS.accountDeletionRequests).add({
      fullName,
      email,
      companyName: companyName || null,
      signInMethod,
      phone: phone || null,
      note: note || null,
      confirmDeletion: true,
      status: 'NEW',
      channel: 'PUBLIC_WEB_FORM',
      createdAt,
      updatedAt: createdAt,
      requestLocale: normalizeText(req.headers['accept-language'], 120) || null,
      userAgent: normalizeText(req.headers['user-agent'], 500) || null,
      referrer: normalizeText(req.headers.referer || req.headers.referrer, 500) || null,
      clientIp: clientIp || null
    });

    logger.info('Account deletion request submitted', {
      requestId: requestRef.id,
      email,
      signInMethod
    });

    res.status(200).json({
      ok: true,
      accepted: true,
      requestId: requestRef.id
    });
  } catch (error) {
    logger.error('submitAccountDeletionRequest failed', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR'
    });
  }
});
