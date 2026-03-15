# Billing Webhooks Setup

## What is included

- `functions/createStripeWorkspaceCheckout`
- `functions/stripeWebhook`
- `functions/appleSubscriptionNotifications`
- `functions/googlePlaySubscriptionNotifications`

## Firestore collections

- `workspace_subscriptions`
- `company_subscriptions`
- `billing_checkout_requests`
- `billing_events`

## Required environment

Create `functions/.env` from `functions/.env.example` and fill:

- `FUNCTIONS_REGION`
- `APP_BASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `APPLE_BUNDLE_ID`
- `APPLE_APP_ID`

## Stripe

1. Deploy functions.
2. Copy the public URL for `stripeWebhook`.
3. Add it in Stripe Webhooks.
4. Subscribe at minimum to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Put the webhook signing secret in `STRIPE_WEBHOOK_SECRET`.

## Apple

1. Add the URL of `appleSubscriptionNotifications` in App Store Server Notifications.
2. For safe auto-activation, send `appAccountToken` from the native purchase flow.
3. Keep `APPLE_ALLOW_UNVERIFIED_NOTIFICATIONS=false` in production until signature verification is added.

## Google Play

1. Deploy the `googlePlaySubscriptionNotifications` HTTPS function and copy its public URL.
2. In Google Cloud Pub/Sub, create a topic such as `google-play-subscription-notifications`.
3. Create a push subscription that forwards that topic to the function URL.
4. Connect the same Pub/Sub topic to Real-time developer notifications in Google Play Console.
5. Grant the deployed service account access to Android Publisher and Play Console subscription data.
6. Send `obfuscatedExternalAccountId` from the native billing flow so the backend can map the purchase to the Firebase user.

## Deploy

From repo root:

```bash
npm --prefix functions install
npx firebase-tools deploy --only functions,firestore,hosting
```
