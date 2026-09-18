# Subscription Payment Setup

LockNote uses RevenueCat to connect the Premium screen to Apple App Store,
Google Play, and optional web billing. The app identifies a RevenueCat customer
with the signed-in Supabase user UUID. This keeps a purchase attached to the
same LockNote account without sending the account email as the customer ID.

The client purchase lifecycle is implemented. Real or sandbox payments still
require the store products, RevenueCat project, and public SDK keys described
below. Proposal 2 feature restrictions are now implemented; server-side quotas
and owner-funded collaboration require deploying the premium migration and
RevenueCat webhook before releasing the updated app.

## Required RevenueCat Identifiers

Create these identifiers exactly. They are case-sensitive.

| Type | LockNote Plus | LockNote Pro |
| --- | --- | --- |
| Entitlement | `plus` | `pro` |
| Custom package | `plus_monthly` | `pro_monthly` |
| Suggested product ID | `locknote_plus_monthly` | `locknote_pro_monthly` |

Create one offering, make it the Current/Default offering, and add both custom
packages. Attach the Plus product to the `plus` entitlement and the Pro product
to the `pro` entitlement. If a product is not attached to its entitlement, the
store can accept payment without the Premium screen recognizing the plan.

## 1. Create the RevenueCat Project

1. Create a project in RevenueCat.
2. Add an Apple app with bundle ID `com.locknote.app`.
3. Add a Google Play app with package name `com.locknote.app`.
4. Optional: add a RevenueCat Billing web app if subscriptions will be sold on
   the LockNote web build. Web billing is separate from the mobile stores.
5. Copy each app's **public SDK key**. Never copy a RevenueCat secret API key
   into the Expo app.

For early UI testing, create two RevenueCat Test Store subscription products
and use the Test Store public key. Test Store payments are simulated and do not
charge a card.

## 2. Create the Store Products

For production payments, create monthly auto-renewable subscriptions in App
Store Connect and Google Play Console using the suggested product IDs above.
Set the US/USD monthly price points to $1.99 for Plus and $3.99 for Pro,
then review each store's regional prices. The Premium screen displays the
localized price returned by the store; the USD values in source code are only a
fallback before store products load. Changing source code does not change the
amount charged by the store.

The agreed yearly prices are $19.99 for Plus and $39.99 for Pro. Yearly
checkout is not implemented yet: annual store products/base plans, RevenueCat
packages, and a billing-period selector with matching price/period labels must
be added before offering yearly subscriptions. Do not attach an annual product
to the existing monthly packages; the current screen labels them per month.

On Apple, put Plus and Pro in the same subscription group and rank Pro above
Plus so Apple can handle upgrades and downgrades correctly.

On Google Play, activate a monthly base plan for each subscription. Complete
RevenueCat's Google Play service-account and real-time developer notification
setup before production testing.

LockNote passes the active Plus product to Google Play when a user upgrades to
Pro and requests `WITH_TIME_PRORATION`. Pro becomes active immediately while
Google Play credits the unused Plus time according to its billing calculation.
The store purchase sheet remains the source of truth for the exact charge,
credit, tax, and next renewal date. Pro-to-Plus changes continue through the
store subscription-management screen.

Import or create the products in RevenueCat, attach them to the entitlements,
and connect them to the two packages in the Current offering.

## 3. Configure Public SDK Keys

Copy `.env.example` to `.env` and fill in the public values:

```dotenv
REVENUECAT_IOS_API_KEY=appl_...
REVENUECAT_ANDROID_API_KEY=goog_...
REVENUECAT_WEB_API_KEY=rcb_...
REVENUECAT_TEST_API_KEY=test_...
```

Only configure `REVENUECAT_WEB_API_KEY` when RevenueCat Billing and its payment
provider are ready. `REVENUECAT_TEST_API_KEY` is optional and lets the SDK show
simulated Test Store purchases in Expo Go.

For EAS Build, add the platform keys as EAS environment variables for the build
environment instead of committing `.env`. These are public SDK keys, but keeping
configuration outside Git prevents mixing test and production projects.

## 4. Build and Test

Real Apple and Google purchases require a new native development build after
installing `react-native-purchases`; hot reload cannot add the native SDK to an
existing build.

```powershell
eas build --platform android --profile development
eas build --platform ios --profile development
npx expo start --dev-client
```

Use Google Play license testers and Apple sandbox/TestFlight accounts for store
testing. Test at minimum:

- new Plus purchase;
- new Pro purchase;
- Plus-to-Pro upgrade with unused Plus time credited by the store;
- upgrade near the beginning and near the end of a billing period;
- user-cancelled checkout;
- pending or interrupted payment;
- app restart while subscribed;
- sign out, sign back in, then Restore purchases;
- cancellation while access remains active until expiry;
- plan expiry returning the UI to Free;
- subscription management opening the correct store/customer portal;
- the same Supabase account on another device.

Do not publish until a completed purchase activates the matching RevenueCat
entitlement and Restore purchases returns the same plan.

## Current App Behavior

- A user must sign in before subscribing or restoring.
- The store/provider checkout performs and confirms payment.
- RevenueCat `CustomerInfo` supplies the store plan; devices without a configured
  store SDK can display the server-verified subscription instead.
- The Premium screen listens for subscription updates and refreshes when the app
  returns to the foreground.
- Restore purchases uses the native store on iOS/Android. On web it refreshes
  the identified RevenueCat customer because native restore is not available.
- Manage subscription opens the provider URL returned by RevenueCat.
- The app does not store a local `isPremium` flag and does not trust a client
  toggle as proof of payment.
- Export and sharing require Plus/Pro; adding images, changing backgrounds, and
  nesting folders require Pro. Existing premium content is retained on Free.
- Manual sync remains Free within 25 MB. Plus gets 75 MB and Pro gets 750 MB
  combined notes/images. The backend enforces these limits, not the client.
- Web/devices without a configured store SDK can read their server-verified plan.

## 5. Deploy Proposal 2 Backend Enforcement

1. Apply all migrations through `202609180001_shared_note_subscription_visibility.sql` using
   `npx supabase db push`. This immediately enables server gates, including for
   older app versions. Plan the rollout before doing this on a live paid service.
2. In Supabase Dashboard → Edge Functions → Secrets, add
   `REVENUECAT_SECRET_API_KEY` (a secret RevenueCat v1 API key with subscriber
   read access) and `REVENUECAT_WEBHOOK_AUTHORIZATION` (a long random full header
   value, for example `Bearer <random-secret>`). Never put either in `.env`, Expo
   public variables, app config, Git, screenshots or the app bundle.
3. Deploy `npx supabase functions deploy revenuecat-webhook --no-verify-jwt`.
   Its Supabase JWT check is disabled intentionally: the function itself verifies
   the RevenueCat Authorization secret using a constant-time comparison.
   Redeploy `npx supabase functions deploy share-note` too; it now checks the
   owner's verified plan before account-email lookup/invitations.
4. In RevenueCat → Integrations → Webhooks, add
   `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook` and set
   Authorization to exactly the secret value. Subscribe to all lifecycle and
   transfer events. Confirm the integration is available for your RevenueCat plan.
5. In a separate development/sandbox project only, set
   `REVENUECAT_ALLOW_SANDBOX=true` to exercise sandbox and Test Store payments.
   Leave it unset/false in production. Do not use a client premium toggle.
6. During the rollout window, after applying the migration and before resuming
   a live paid service or releasing the app, backfill existing subscribers'
   canonical subscriptions by resending their RevenueCat webhook events to this
   function. Check each paid UUID has the correct `user_subscriptions` row. The
   table is read-self only; app users cannot set or change their plan.
7. Verify purchases, renewals, cancellation-before-expiry, billing grace, refunds,
   expiration, duplicate/late events and transfers. The function refetches current
   subscriber state on every event; non-200 responses request a retry. A brief
   delay between checkout and server entitlement activation is possible.
8. Verify a Free invited editor can edit a Plus owner's note, and can add images
   only for a Pro owner. After expiry verify recipients cannot read, download,
   export or edit shared notes/images (including an open editor and cached list).
   Owner local notes/images remain available, local edits stay pending, and
   recipient management remains available. Renewing Plus/Pro restores sharing;
   Pro-to-Plus must not stop it. Verify natural expiry without a Free webhook too.
9. Verify quota growth rejects atomically; shrinking/deleting and read-only
   recovery work without data deletion. Premium shows usage and recovery; Profile
   reports when sync downloaded only instead of claiming local uploads succeeded.

An isolated PostgreSQL fixture is available as
`node scripts/verify-premium-db.mjs locknote-premium-plan2-check`, after starting
a disposable container of that exact name. It intentionally cannot target an
arbitrary hosted database. Real RevenueCat/Storage/device verification remains
required before production release.

Automatic/background folder/note sync is now an explicit per-device/account
Plus/Pro opt-in. Fresh server entitlement access is required even in headless
tasks. Rebuild native binaries and follow [Background Sync](../BACKGROUND_SYNC.md)
for foreground/reconnect, editor deferral and OS-task verification. Images retain
open-note/manual synchronization; custom background cloud storage remains planned.
