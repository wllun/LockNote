# Subscription Payment Setup

LockNote uses RevenueCat to connect the Premium screen to Apple App Store,
Google Play, and optional web billing. The app identifies a RevenueCat customer
with the signed-in Supabase user UUID. This keeps a purchase attached to the
same LockNote account without sending the account email as the customer ID.

The client purchase lifecycle is implemented. Real or sandbox payments still
require the store products, RevenueCat project, and public SDK keys described
below. Premium feature restrictions and cloud quotas are intentionally not
enforced yet.

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
Set the actual Malaysian prices in the stores. The Premium screen displays the
localized price returned by the store; the RM values in source code are only a
fallback before store products load.

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
- RevenueCat `CustomerInfo` is the source of truth for the displayed plan.
- The Premium screen listens for subscription updates and refreshes when the app
  returns to the foreground.
- Restore purchases uses the native store on iOS/Android. On web it refreshes
  the identified RevenueCat customer because native restore is not available.
- Manage subscription opens the provider URL returned by RevenueCat.
- The app does not store a local `isPremium` flag and does not trust a client
  toggle as proof of payment.
- Sync, collaboration, quotas, and other features remain ungated for now.

Before server-side premium feature control is added, configure RevenueCat
webhooks and a server-owned entitlement table. The Supabase backend must verify
webhook signatures/events and must not trust an entitlement value sent by the
app client.
