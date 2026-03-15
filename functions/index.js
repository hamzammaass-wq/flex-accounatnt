import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();

const db = getFirestore();

const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION || 'us-central1';
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://smart-account-cc181.web.app').trim();
const GOOGLE_PLAY_PACKAGE_NAME = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim();
const APPLE_ALLOW_UNVERIFIED_NOTIFICATIONS = String(process.env.APPLE_ALLOW_UNVERIFIED_NOTIFICATIONS || '').trim().toLowerCase() === 'true';

const COLLECTIONS = {
  workspaceSubscriptions: 'workspace_subscriptions',
  companySubscriptions: 'company_subscriptions',
  billingEvents: 'billing_events',
  billingCheckoutRequests: 'billing_checkout_requests'
};

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

const clampCompanyCount = (value) => Math.max(1, Math.min(50, Math.floor(Number(value) || 1)));
const normalizeBillingCycle = (value) => String(value || '').trim().toUpperCase() === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const unixSecondsToIso = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
};
const nowIso = () => new Date().toISOString();

const pricingForCycle = (billingCycle) => (
  billingCycle === 'YEARLY'
    ? {
      basePriceUsd: 100,
      extraCompanyPriceUsd: 20,
      interval: 'year'
    }
    : {
      basePriceUsd: 10,
      extraCompanyPriceUsd: 3,
      interval: 'month'
    }
);

const mapStripeStatus = (status) => {
  switch (String(status || '').trim()) {
    case 'trialing':
      return 'TRIAL';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
    case 'paused':
      return 'SUSPENDED';
    case 'canceled':
    case 'incomplete_expired':
      return 'EXPIRED';
    default:
      return 'ACTIVE';
  }
};

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
      billingCycle: 'MONTHLY',
      desiredCompanyCount: 1
    };
  }
  return {
    billingCycle: match[1] === 'yearly' ? 'YEARLY' : 'MONTHLY',
    desiredCompanyCount: clampCompanyCount(match[2])
  };
};

let stripeClientPromise = null;
let googleApisPromise = null;

const getStripeClient = async () => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    throw new HttpsError('failed-precondition', 'Stripe secret key is not configured.');
  }
  if (!stripeClientPromise) {
    stripeClientPromise = import('stripe').then(({ default: Stripe }) => new Stripe(secretKey));
  }
  return stripeClientPromise;
};

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

const storeCheckoutSession = async ({ sessionId, userId, userEmail, billingCycle, desiredCompanyCount, url }) => {
  await db.collection(COLLECTIONS.billingCheckoutRequests).doc(sessionId).set({
    sessionId,
    userId,
    userEmail,
    billingCycle,
    desiredCompanyCount,
    status: 'CREATED',
    url,
    createdAt: nowIso()
  }, { merge: true });
};

const resolveUserIdFromStripeObject = async (stripeObject) => {
  const metadata = stripeObject?.metadata || {};
  const directUserId = String(metadata.userId || metadata.uid || '').trim();
  if (directUserId) {
    return {
      userId: directUserId,
      userEmail: String(metadata.userEmail || '').trim() || undefined
    };
  }

  const workspaceDoc = await findWorkspaceSubscription({
    providerSubscriptionId: String(stripeObject?.id || stripeObject?.subscription || '').trim(),
    providerCustomerId: String(stripeObject?.customer || '').trim()
  });
  if (workspaceDoc?.exists) {
    const data = workspaceDoc.data() || {};
    return {
      userId: String(data.userId || workspaceDoc.id).trim(),
      userEmail: String(data.userEmail || '').trim() || undefined
    };
  }

  return {
    userId: '',
    userEmail: undefined
  };
};

const syncStripeSubscription = async (subscription, overrides = {}) => {
  const { userId, userEmail } = await resolveUserIdFromStripeObject(subscription);
  if (!userId) {
    throw new Error('Could not resolve the Stripe subscription owner.');
  }

  const metadata = subscription.metadata || {};
  const billingCycle = normalizeBillingCycle(
    metadata.billingCycle
    || (subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'YEARLY' : 'MONTHLY')
  );
  const desiredCompanyCount = clampCompanyCount(metadata.desiredCompanyCount);
  const productId = subscription.items?.data?.[0]?.price?.id || undefined;

  return applyWorkspaceSubscriptionState({
    userId,
    userEmail,
    status: overrides.status || mapStripeStatus(subscription.status),
    provider: 'STRIPE',
    billingCycle,
    desiredCompanyCount,
    startedAt: unixSecondsToIso(subscription.current_period_start || subscription.created),
    renewalDate: unixSecondsToIso(subscription.current_period_end),
    expiresAt: unixSecondsToIso(subscription.current_period_end || subscription.cancel_at || subscription.canceled_at),
    providerCustomerId: String(subscription.customer || '').trim() || undefined,
    providerSubscriptionId: String(subscription.id || '').trim() || undefined,
    providerProductId: productId,
    lastCheckoutSessionId: overrides.lastCheckoutSessionId
  });
};

const processStripeEvent = async (event, stripe) => {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const subscriptionId = String(session.subscription || '').trim();
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncStripeSubscription(subscription, {
        lastCheckoutSessionId: String(session.id || '').trim() || undefined
      });
      await db.collection(COLLECTIONS.billingCheckoutRequests).doc(String(session.id)).set({
        status: 'COMPLETED',
        completedAt: nowIso(),
        providerSubscriptionId: subscriptionId
      }, { merge: true });
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.resumed': {
      await syncStripeSubscription(event.data.object);
      return;
    }
    case 'customer.subscription.deleted': {
      await syncStripeSubscription(event.data.object, { status: 'EXPIRED' });
      return;
    }
    case 'invoice.paid': {
      const invoice = event.data.object;
      const subscriptionId = String(invoice.subscription || '').trim();
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncStripeSubscription(subscription);
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = String(invoice.subscription || '').trim();
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncStripeSubscription(subscription, { status: 'SUSPENDED' });
      return;
    }
    default:
      return;
  }
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

export const createStripeWorkspaceCheckout = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must sign in before creating a checkout session.');
  }

  const billingCycle = normalizeBillingCycle(request.data?.billingCycle);
  const desiredCompanyCount = clampCompanyCount(request.data?.desiredCompanyCount);
  const userId = request.auth.uid;
  const userEmail = String(request.auth.token?.email || '').trim() || undefined;
  const successUrl = sanitizeRedirectUrl(
    request.data?.successUrl,
    `${APP_BASE_URL}/?openSubscription=1&billing=success`
  );
  const cancelUrl = sanitizeRedirectUrl(
    request.data?.cancelUrl,
    `${APP_BASE_URL}/?openSubscription=1&billing=cancelled`
  );

  const pricing = pricingForCycle(billingCycle);
  const extraCompanyCount = Math.max(0, desiredCompanyCount - 1);
  const stripe = await getStripeClient();

  const metadata = {
    userId,
    userEmail: userEmail || '',
    billingCycle,
    desiredCompanyCount: String(desiredCompanyCount)
  };

  const lineItems = [
    {
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'AIFLEX ERP - Base subscription',
          description: 'Includes 1 company'
        },
        unit_amount: pricing.basePriceUsd * 100,
        recurring: {
          interval: pricing.interval
        }
      }
    }
  ];

  if (extraCompanyCount > 0) {
    lineItems.push({
      quantity: extraCompanyCount,
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'AIFLEX ERP - Extra company slot',
          description: 'Recurring extra company slot'
        },
        unit_amount: pricing.extraCompanyPriceUsd * 100,
        recurring: {
          interval: pricing.interval
        }
      }
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    allow_promotion_codes: true,
    client_reference_id: userId,
    customer_email: userEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: lineItems,
    metadata,
    subscription_data: {
      metadata
    }
  });

  await storeCheckoutSession({
    sessionId: String(session.id),
    userId,
    userEmail,
    billingCycle,
    desiredCompanyCount,
    url: session.url || undefined
  });

  return {
    sessionId: session.id,
    url: session.url
  };
});

export const stripeWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const signatureHeader = req.headers['stripe-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!signature || !webhookSecret) {
    res.status(500).send('Stripe webhook is not configured.');
    return;
  }

  try {
    const stripe = await getStripeClient();
    const event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
    const eventRecord = await writeBillingEventOnce({
      provider: 'STRIPE',
      eventId: event.id,
      type: event.type,
      summary: {
        objectId: String(event.data?.object?.id || '').trim() || undefined
      }
    });

    if (!eventRecord.isNew) {
      res.json({ received: true, duplicate: true });
      return;
    }

    await processStripeEvent(event, stripe);
    await eventRecord.ref.set({
      status: 'PROCESSED',
      processedAt: nowIso()
    }, { merge: true });
    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook failed', error);
    res.status(400).send(String(error?.message || error || 'Webhook error'));
  }
});

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
