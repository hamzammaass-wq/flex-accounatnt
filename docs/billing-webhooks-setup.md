# Billing Webhooks Setup

## What is included

- `functions/appleSubscriptionNotifications`
- `functions/googlePlaySubscriptionNotifications`

## PalPay

- `PalPay` in this repo is currently wired as a frontend redirect checkout via `VITE_PALPAY_CHECKOUT_URL`.
- No `Firebase Functions` webhook handler is included for `PalPay` yet.

## Firestore collections

- `workspace_subscriptions`
- `company_subscriptions`
- `billing_checkout_requests`
- `billing_events`

## Required environment

Create `functions/.env` from `functions/.env.example` and fill:

- `FUNCTIONS_REGION`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `APPLE_BUNDLE_ID`
- `APPLE_APP_ID`

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
