import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import crypto from 'crypto';

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
  basePriceUsd: 100,
  extraCompanyPriceUsd: 20,
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

export const appleSubscriptionNotifications = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
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

export const googlePlaySubscriptionNotifications = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
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

const PADDLE_WEBHOOK_SECRET = String(process.env.PADDLE_WEBHOOK_SECRET || '').trim();

const mapPaddleStatus = (status) => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'paused':
      return 'SUSPENDED';
    case 'canceled':
      return 'EXPIRED';
    default:
      return 'ACTIVE';
  }
};

const verifyPaddleSignature = (req) => {
  if (!PADDLE_WEBHOOK_SECRET) {
    logger.warn('PADDLE_WEBHOOK_SECRET is not configured. Webhook signature check is bypassed.');
    return true;
  }

  const signatureHeader = req.headers['paddle-signature'] || '';
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(';');
  let ts = '';
  let h1 = '';
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 'ts') ts = val;
    if (key === 'h1') h1 = val;
  }

  if (!ts || !h1) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const tsDiff = Math.abs(nowSeconds - Number(ts));
  if (tsDiff > 300) {
    logger.warn('Paddle webhook signature expired', { ts, nowSeconds });
    return false;
  }

  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
  const payload = `${ts}:${rawBody}`;

  const computedH1 = crypto
    .createHmac('sha256', PADDLE_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computedH1, 'hex'), Buffer.from(h1, 'hex'));
  } catch {
    return false;
  }
};

export const paddleSubscriptionNotifications = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // 1. Verify webhook signature
  if (!verifyPaddleSignature(req)) {
    logger.error('Invalid Paddle webhook signature');
    res.status(401).send('Unauthorized: Invalid Signature');
    return;
  }

  const payload = req.body || {};
  const eventId = String(payload.event_id || '').trim();
  const eventType = String(payload.event_type || 'UNKNOWN').trim();
  const data = payload.data || {};
  const customData = data.custom_data || {};
  const userId = String(customData.userId || '').trim();

  // 2. Log event receipt
  const eventRecord = await writeBillingEventOnce({
    provider: 'PADDLE',
    eventId: eventId || String(Date.now()),
    type: eventType,
    summary: {
      subscriptionId: data.id || undefined,
      userId: userId || undefined
    },
    raw: payload
  });

  if (!eventRecord.isNew) {
    res.json({ received: true, duplicate: true });
    return;
  }

  // 3. Check if this is a subscription-related event we want to handle
  const subscriptionEvents = [
    'subscription.created',
    'subscription.updated',
    'subscription.activated',
    'subscription.canceled'
  ];

  if (!subscriptionEvents.includes(eventType)) {
    await eventRecord.ref.set({
      status: 'IGNORED_EVENT_TYPE',
      processedAt: nowIso()
    }, { merge: true });
    res.json({ received: true, ignored: true });
    return;
  }

  if (!userId) {
    logger.warn('Paddle subscription event missing custom_data.userId', { eventId, eventType });
    await eventRecord.ref.set({
      status: 'PENDING_ACCOUNT_LINK',
      processedAt: nowIso()
    }, { merge: true });
    res.json({ received: true, pendingAccountLink: true });
    return;
  }

  try {
    const desiredCompanyCount = Number(customData.desiredCompanyCount) || 1;
    const userEmail = String(customData.userEmail || '').trim() || undefined;

    // Synchronize workspace subscription
    await applyWorkspaceSubscriptionState({
      userId,
      userEmail,
      status: mapPaddleStatus(data.status),
      provider: 'PADDLE',
      billingCycle: 'YEARLY',
      desiredCompanyCount,
      startedAt: data.current_billing_period?.starts_at || null,
      renewalDate: data.current_billing_period?.ends_at || null,
      expiresAt: data.current_billing_period?.ends_at || null,
      providerCustomerId: data.customer_id || null,
      providerSubscriptionId: data.id || null,
      providerProductId: data.items?.[0]?.price_id || null
    });

    await eventRecord.ref.set({
      status: 'PROCESSED',
      processedAt: nowIso()
    }, { merge: true });

    res.json({ received: true, processed: true });
  } catch (error) {
    logger.error('Paddle webhook handling failed', error);
    await eventRecord.ref.set({
      status: 'ERROR',
      processedAt: nowIso(),
      errorMessage: String(error?.message || error || 'Processing failed')
    }, { merge: true });
    res.status(500).json({ received: false, error: 'Processing failed' });
  }
});


export const submitAccountDeletionRequest = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
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

export const firestoreWriteProxy = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
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
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: 'Unauthorized: Missing token' });
      return;
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const { operations } = req.body || {};
    if (!Array.isArray(operations)) {
      res.status(400).json({ ok: false, error: 'Operations must be an array' });
      return;
    }

    const batch = db.batch();

    for (const op of operations) {
      const { type, path, data } = op;
      if (!path || typeof path !== 'string') {
        res.status(400).json({ ok: false, error: 'Each operation must have a path' });
        return;
      }

      // Security check: path must be under users/{uid}/ or workspace_subscriptions/{uid}
      const isUserPath = path.startsWith(`users/${uid}/`);
      const isWorkspaceSubPath = path === `workspace_subscriptions/${uid}`;
      if (!isUserPath && !isWorkspaceSubPath) {
        res.status(403).json({ ok: false, error: `Forbidden: Path '${path}' is outside user scope.` });
        return;
      }

      const docRef = db.doc(path);

      if (type === 'set') {
        batch.set(docRef, data || {}, { merge: true });
      } else if (type === 'delete') {
        batch.delete(docRef);
      } else {
        res.status(400).json({ ok: false, error: `Invalid operation type: ${type}` });
        return;
      }
    }

    await batch.commit();
    res.json({ ok: true });
  } catch (error) {
    logger.error('firestoreWriteProxy failed', error);
    res.status(500).json({ ok: false, error: error.message || 'Internal Error' });
  }
});

// Import compiled Relational Backend Express app
import { app as relationalBackendApp } from './backend-dist/index.js';

// Export Relational Backend API as a Firebase Cloud Function
export const api = onRequest({ cors: true, timeoutSeconds: 60, invoker: 'public' }, relationalBackendApp);
export const recoverData = onRequest({ cors: true }, async (req, res) => {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('No userId provided');
  
  try {
    const oldPath = db.doc(`users/${userId}/companies/cmp_default`);
    const newPath = db.doc(`users/${userId}/companies/cmp_${userId}`);
    
    const collections = ['accounts', 'transactions', 'invoices', 'receipts', 'checks', 'items', 'item_groups', 'safes', 'banks', 'employees', 'payrolls', 'settings'];
    let logs = [];
    
    for (const collName of collections) {
      const oldColl = await oldPath.collection(collName).get();
      if (oldColl.empty) continue;
      
      const batch = db.batch();
      oldColl.docs.forEach(doc => {
        batch.set(newPath.collection(collName).doc(doc.id), doc.data());
      });
      await batch.commit();
      logs.push(`Migrated ${oldColl.size} docs from ${collName}`);
    }
    
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export const inspectUser = onRequest({ cors: true }, async (req, res) => {
  try {
    const userId = req.query.userId || req.body.userId;
    const doc = await db.doc(`users/${userId}`).get();
    
    // Get all subcollections of users/userId/companies
    const companiesRef = db.collection(`users/${userId}/companies`);
    const companiesSnaps = await companiesRef.get();
    let companySubDocs = companiesSnaps.docs.map(d => d.id);
    
    res.json({ user: doc.data(), subDocs: companySubDocs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export const inspectGhost = onRequest({ cors: true }, async (req, res) => {
  try {
    const userId = req.query.userId || req.body.userId;
    const cmpRef = db.doc(`users/${userId}/companies/cmp_default`);
    const receipts = await cmpRef.collection('receipts').get();
    const invoices = await cmpRef.collection('invoices').get();
    const accounts = await cmpRef.collection('accounts').get();
    
    res.json({ 
      receipts: receipts.size,
      invoices: invoices.size,
      accounts: accounts.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export const fixFirestoreUsers = onRequest({ cors: true }, async (req, res) => {
  try {
    const uids = ['IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3'];
    let logs = [];
    for (const uid of uids) {
      const docRef = db.doc('users/' + uid);
      const snap = await docRef.get();
      if (!snap.exists) continue;
      
      let data = snap.data();
      if (data.companies && Array.isArray(data.companies)) {
        let updated = false;
        data.companies = data.companies.map(c => {
          if (c.id === 'cmp_' + uid) {
            c.id = 'cmp_default';
            updated = true;
          }
          return c;
        });
        if (updated) {
          await docRef.update({ companies: data.companies });
          logs.push('Fixed user ' + uid);
        }
      }
    }
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export const inspectAllFirestoreSubcollections = onRequest({ cors: true }, async (req, res) => {
  try {
    const uids = ['IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'u9ufZgGvXFO3JfBHwgIdaPUCqcI3'];
    const possibleCompanies = ['cmp_default', 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3'];
    const collections = ['accounts', 'transactions', 'invoices', 'receipts'];
    let results = [];

    for (const uid of uids) {
      for (const compId of possibleCompanies) {
        let compResult = { userId: uid, companyId: compId, collections: {} };
        let hasData = false;

        for (const coll of collections) {
          const snap = await db.collection(`users/${uid}/companies/${compId}/${coll}`).get();
          compResult.collections[coll] = snap.size;
          if (snap.size > 0) hasData = true;
        }

        if (hasData) {
          results.push(compResult);
        }
      }
    }
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export const segregateFirestoreUsers = onRequest({ cors: true }, async (req, res) => {
  try {
    const logs = [];
    
    // User 1: u9ufZgGvXFO3JfBHwgIdaPUCqcI3
    const u1Ref = db.doc('users/u9ufZgGvXFO3JfBHwgIdaPUCqcI3');
    const u1Snap = await u1Ref.get();
    if (u1Snap.exists) {
      let data = u1Snap.data();
      if (data.companies && Array.isArray(data.companies)) {
        data.companies = data.companies.map(c => {
          if (c.id === 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3') {
            c.id = 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3';
          }
          return c;
        });
        await u1Ref.update({ companies: data.companies });
        logs.push('Redirected user u9ufZgGvXFO3JfBHwgIdaPUCqcI3 in Firestore to cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3');
      }
    }

    // User 2: IcWiXkjYgWRyxlMlEvVmR4CdeHB3
    const u2Ref = db.doc('users/IcWiXkjYgWRyxlMlEvVmR4CdeHB3');
    const u2Snap = await u2Ref.get();
    if (u2Snap.exists) {
      let data = u2Snap.data();
      if (data.companies && Array.isArray(data.companies)) {
        data.companies = data.companies.map(c => {
          if (c.id === 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3' || c.id === 'cmp_default') {
            c.id = 'cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3';
          }
          return c;
        });
        await u2Ref.update({ companies: data.companies });
        logs.push('Redirected user IcWiXkjYgWRyxlMlEvVmR4CdeHB3 in Firestore to cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3');
      }
    }

    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export const inspectSubscriptions = onRequest({ cors: true }, async (req, res) => {
  try {
    const ids = ['cmp_IcWiXkjYgWRyxlMlEvVmR4CdeHB3', 'cmp_u9ufZgGvXFO3JfBHwgIdaPUCqcI3'];
    let results = {};
    for (const id of ids) {
      const snap = await db.collection('company_subscriptions').doc(id).get();
      results[id] = snap.exists ? snap.data() : null;
    }
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



