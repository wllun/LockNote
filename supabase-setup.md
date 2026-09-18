# Supabase Setup for LockNote

_Setup and official vendor pricing references reviewed: 19 September 2026. MYR conversions below are illustrative assumptions, not live FX quotations._

Follow this checklist for accounts, manual/opt-in automatic record sync, sharing, images and subscriptions. Local storage remains authoritative; content is not end-to-end encrypted. See [TODO.md](TODO.md) for parked configuration and [the documentation index](docs/README.md).

Start with environment variables and authentication. Complete backend and RevenueCat configuration before testing paid cloud features. This document records setup instructions; it does not confirm that the hosted project has been deployed or verified.

## 1. Verify that the project is active

Open the project in the [Supabase dashboard](https://supabase.com/dashboard).

If the project is paused, click **Resume project**. Registration and login cannot work while the project is unavailable.

See [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## 2. Copy the project credentials

In Supabase, open **Project Settings → API/API Keys** and copy:

- Project URL → `SUPABASE_URL`
- Publishable key or legacy `anon` key → `SUPABASE_ANON_KEY`

Add them to the project's local `.env` file:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key

# Public SDK keys required only for subscription purchases on each platform:
REVENUECAT_ANDROID_API_KEY=goog_your-public-android-sdk-key
REVENUECAT_IOS_API_KEY=appl_your-public-ios-sdk-key

# Optional: configure only when the corresponding billing service is ready.
REVENUECAT_WEB_API_KEY=rcb_your-public-web-sdk-key
REVENUECAT_TEST_API_KEY=test_your-public-test-store-key
```

Use the exact variable names above. `app.config.js` reads these non-prefixed names and exposes the public values through Expo config `extra`; do not rename them to `EXPO_PUBLIC_...` without changing the code. Remove unused RevenueCat entries instead of leaving placeholder values configured.

Never place a Supabase service-role key, database password, RevenueCat secret API key, or webhook authorization secret in the app's `.env`, Expo config, EAS client configuration, Git, or screenshots. A mobile app bundle can be inspected by its users. Store backend secrets only in the server's secret configuration.

See [.env.example](.env.example).

## 3. Enable email registration

Open **Authentication → Providers → Email** and configure:

- Enable **Email provider**.
- Enable **Allow new users to sign up**.
- Choose whether to enable **Confirm Email**.
- Set the hosted account-password minimum to at least eight characters to match the app's validation.

For quick development testing, **Confirm Email** can be temporarily disabled. Registration should then create a session immediately.

For production, keep **Confirm Email** enabled. A newly registered user must open the confirmation email before signing in.

See [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).

## 4. Configure LockNote redirect URLs

Open **Authentication → URL Configuration**.

For a native-only deployment, set the Site URL to:

```text
locknote://auth-confirm
```

Add these exact entries under **Redirect URLs**:

```text
locknote://auth-confirm
locknote://reset-password
locknote://reset-lock-password
```

These are separate flows: email confirmation, Supabase account-password recovery, and local LockNote-password recovery. The account password and LockNote password are independent. If a web version is deployed later, add its production and development callback URLs separately.

See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Check confirmation-email delivery

When **Confirm Email** is enabled:

1. Register an account in LockNote.
2. Check the email inbox and spam folder.
3. Open the confirmation link on a device where a development or standalone LockNote build is installed.
4. Return to LockNote and sign in.

Configure **Custom SMTP**, such as Resend, before allowing external testers or public users to register. Supabase's default email service currently delivers only to project-team addresses and is limited to approximately two authentication emails per hour project-wide. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

For the custom sender:

- Verify a sending domain and install the SMTP provider's SPF/DKIM DNS records; plan DMARC for production.
- Configure the SMTP host, port, username, password, sender address, and sender name in Supabase, not in the app.
- Brand confirmation and recovery email subjects/content as LockNote while preserving `{{ .ConfirmationURL }}` and other required template variables.
- Match the app's **120-second** minimum resend interval in hosted Auth settings. The repository's local configuration uses 30 authentication emails/hour; choose the hosted limit within your SMTP provider's allowance.
- Test registration confirmation, account-password recovery, and LockNote-password recovery separately.

`supabase/config.toml` configures the local Supabase stack. Database migration deployment does not automatically apply its hosted Auth/SMTP settings; configure those in the dashboard.

See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

## 6. Verify the registered user

Open **Authentication → Users** in Supabase.

After registration:

- The user's email address should appear in the user list.
- The **Confirmed at** field should contain a date and time after successful email confirmation.
- If **Confirmed at** is empty, the user cannot sign in while **Confirm Email** is enabled.

## 7. Deploy the Supabase backend

Run from the LockNote project root, using the reference from the intended Supabase project URL:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
npx.cmd supabase functions deploy share-note
```

Confirm the project reference before deployment. Dry-run only previews; `db push` applies pending migrations in order, currently through `202609180001_shared_note_subscription_visibility.sql`, including recipient suspension after owner expiry. Do not disable RLS or recreate tables with broad permissions. On macOS/Linux omit `.cmd`.

**Live-service caution:** the premium migration immediately enables server restrictions, including for older clients. On an existing paid service, coordinate the migration, webhook deployment, and subscriber backfill in a rollout window before resuming service. Applying the migration alone does not create paid subscription records.

After deployment, verify:

- `private_folders`, `private_notes`, and the `sync_private_data` RPC exist.
- Realtime is enabled for `shared_notes` and `note_members`.
- The `note_attachments` metadata table, attachment RPCs, and **private** `note-attachments` Storage bucket exist.
- RLS and appropriate role grants remain enabled.
- `app_update_config` exists and `force_update_enabled` remains **false** until a tested replacement build is publicly downloadable.

See [Supabase backend README](supabase/README.md), [force-update procedure](FORCE_UPDATE.md), and [Supabase migration deployment](https://supabase.com/docs/guides/local-development/cli-workflows).

## 8. Configure RevenueCat and premium enforcement

Create the platform apps with Android package/iOS bundle ID `com.locknote.app`. Create monthly products in Google Play/App Store Connect, import them into RevenueCat, and configure these case-sensitive identifiers:

| Type | Plus | Pro |
| --- | --- | --- |
| Entitlement | `plus` | `pro` |
| Custom package | `plus_monthly` | `pro_monthly` |
| Suggested product ID | `locknote_plus_monthly` | `locknote_pro_monthly` |

Attach the products to their matching entitlements and both packages to the **Current/Default offering**. Use only public platform SDK keys in the app. The signed-in Supabase user UUID is the RevenueCat customer identity.

### Server secrets and webhook

In **Supabase Dashboard → Edge Functions → Secrets**, configure:

| Secret | Purpose |
| --- | --- |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat v1 secret API key with subscriber-read access |
| `REVENUECAT_WEBHOOK_AUTHORIZATION` | Long random full Authorization header value, such as `Bearer <random-secret>` |
| `REVENUECAT_ALLOW_SANDBOX` | Set to `true` only in a separate development/sandbox project; leave unset/false in production |

Do not place these secrets in the app's `.env` or EAS client environment.

Deploy the webhook and the current sharing function:

```powershell
npx.cmd supabase functions deploy revenuecat-webhook --no-verify-jwt
npx.cmd supabase functions deploy share-note
```

The webhook's Supabase JWT check is intentionally disabled; its code verifies the RevenueCat Authorization secret instead. Do not disable JWT verification for `share-note`.

In **RevenueCat → Integrations → Webhooks**, configure:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook
```

Set Authorization to exactly the same full value stored in `REVENUECAT_WEBHOOK_AUTHORIZATION`. Subscribe to all lifecycle and transfer events and confirm webhook availability for your RevenueCat plan.

For existing subscribers, resend their RevenueCat events to backfill canonical `user_subscriptions` records during the rollout window. Verify each paid user UUID has the correct plan before resuming service.

Proposal 2 enforces combined note/image quotas of **25 MB Free, 75 MB Plus, and 750 MB Pro**. Plus/Pro fund owner sharing; Pro funds new images/cloud uploads. Test downgrade, expiry, quota exhaustion, and read-only/download recovery without deleting existing content.

Follow [Subscription Payment Setup](docs/decisions/SUBSCRIPTION_SETUP.md) for store configuration, deployment order, backfill, and payment verification. Real mobile purchases require a native development/store build; Test Store purchases are simulated.

## 9. Configure EAS build environments

Local `.env` values do not automatically configure remote build workers. In **Expo project → Environment variables**, add the same public Supabase values and required platform RevenueCat SDK keys to the intended `development`, `preview`, and `production` environments.

Use **plaintext** or **sensitive** visibility for these client configuration values. They are public values embedded in the app, not server secrets.

The current build profiles select environments automatically: development-client builds use `development`, internal standalone builds use `preview`, and store builds use `production`. Explicit `environment` fields in `eas.json` can make that mapping clearer. Ensure each selected environment points to the intended Supabase and RevenueCat projects.

See [EAS environment management](https://docs.expo.dev/eas/environment-variables/manage/) and [EAS build environment selection](https://docs.expo.dev/eas/environment-variables/usage/).

## 10. Restart and verify LockNote

After changing `.env`, restart Metro so the updated configuration is loaded:

```powershell
npx.cmd expo start --dev-client -c
```

Use a valid email address and a password containing at least eight characters. The password-confirmation value must match.

Rebuild and reinstall standalone APK/store builds after changing embedded client configuration. Restarting Metro only updates development-server configuration; it does not change an already installed standalone bundle.

Verify in this order:

1. Register, receive the confirmation email, confirm, and sign in.
2. Restart the app and verify the session persists.
3. Test account-password recovery and LockNote-password recovery independently.
4. Create/edit locally while offline, then manually sync between two devices.
5. Test sharing with a verified Plus/Pro owner and a Free invitee, including View only/Can edit and lease expiry.
6. Test Pro inline-image upload/download and access restrictions.
7. Test sandbox purchases, restore, renewals, cancellation, refunds, and expiry through the webhook.
8. Verify quota limits and download-only recovery retain existing data.
9. Confirm ordinary local editing still works when Supabase is unavailable.

10. On rebuilt native candidates, verify paid Profile Automatic Sync opt-in, editor/final-save deferral, retries, original-account guards and OS tasks using [Background Sync](docs/BACKGROUND_SYNC.md). It reuses existing RPCs; no additional migration is needed. Automatic runs exclude binary images/preferences.

## What is not required for basic authentication

The custom application migrations and Edge Functions are not required merely to register or sign in using Supabase Auth. They are required for LockNote's additional sync, collaboration, attachment, update-policy, and premium services. Do not treat a successful login as proof that those services are deployed.

## Supabase Free plan limitations

This snapshot was reviewed against [Supabase pricing](https://supabase.com/pricing) on **19 September 2026**. Recheck before launch; project-wide allowances are not per LockNote subscriber.

| Resource | Free limit | LockNote impact |
| --- | ---: | --- |
| Active projects | 2 | Enough for development and production, but leaves little room for a separate staging project. |
| Database size | 500 MB per project | Suitable for development and a small beta, but not a large note-sync service. |
| Monthly active users | 50,000 | More than enough for LockNote's initial authentication needs. |
| File storage | 1 GB | Shared across all users; multiple Pro subscribers can exhaust it despite separate combined account quotas. |
| Egress | 5 GB plus separate 5 GB cached egress per month | Sync/image traffic consumes distinct project allowances. |
| Edge Function invocations | 500,000 per month | Sharing-by-email and other server functions consume these calls. |
| Realtime messages | 2 million per month | Shared-note collaboration consumes these messages. |
| Realtime peak connections | 200 | Approximately 200 clients can be connected concurrently. |
| Realtime Broadcast message size | 256 KB | Broadcast payloads must remain below this limit; Postgres Changes has separate payload limits. |
| Log retention | 1 day | Production errors older than one day are difficult to investigate. |

See the [Supabase billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase) for the current detailed quotas.

### Project pausing

Free projects may be paused after one week of insufficient activity. An actively used app may generate enough activity to avoid pausing, but the Free plan should not be treated as a production uptime guarantee.

If the project is paused, authentication, sync, sharing, Realtime, and Edge Functions will be unavailable until it is resumed. LockNote's local SQLite/AsyncStorage notes should remain usable.

### Authentication email restrictions

Supabase's built-in email provider is intended only for development and currently has a limit of approximately **two authentication emails per hour for the entire project**. Delivery is best-effort, has no uptime guarantee, and is restricted to project-team email addresses unless custom SMTP is configured.

This affects:

- registration confirmation emails;
- account-password reset emails;
- LockNote-password recovery emails.

Configure a custom SMTP provider before allowing public registration. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

### Backups and support

The Free plan does not include automatic database backups, point-in-time recovery, email support, or an uptime service-level agreement. Keep separate backups of production migrations and important server data.

### Exceeding the limits

The Free plan does not automatically charge for overages. Continued quota usage can instead cause service restrictions. A database that exceeds its allowance can enter read-only mode. See [Supabase database-size limits](https://supabase.com/docs/guides/platform/database-size).

### Estimated operating cost

Vendor USD prices were reviewed on **19 September 2026**. MYR estimates use illustrative **USD 1 = RM4.07**, not a verified current exchange rate. Card rates, taxes, usage and selected resources can change totals.

| Scenario | Supabase | Authentication email | Approximate total |
| --- | ---: | ---: | ---: |
| Development/private beta | Free, USD 0 | Resend Free, USD 0 | **RM0/month**, excluding a domain |
| Small production release | Pro, USD 25/month | Resend Free, USD 0 | **Approximately RM105–120/month** after allowing for exchange-rate variation and possible fees |
| Higher email volume | Pro, USD 25/month | Resend Pro, USD 20/month | **Approximately RM185–200/month** after allowing for exchange-rate variation and possible fees |
| Additional Supabase Micro project in a paid organization | USD 10/month | — | **Approximately RM41/month extra** |

Supabase Pro currently starts at **USD 25/month**. It includes USD 10 of compute credit, which covers one default Micro project. Additional Micro projects start at approximately USD 10/month. See [Supabase pricing](https://supabase.com/pricing).

Resend Free currently includes **3,000 transactional emails per month** with a **100-email daily limit**. Resend Pro starts at **USD 20/month** for 50,000 emails and removes the Free plan's daily limit. See [Resend pricing](https://resend.com/pricing).

A verified sending domain is also needed for professional authentication email. Domain pricing depends on the registrar and extension; budget roughly **RM50–100 per year** unless LockNote already owns a suitable domain.

These estimates cover Supabase and authentication email only. They do not include app-store registration, store commissions, EAS paid plans, legal work, marketing, customer support, or taxes.

### LockNote recommendation

- **Development and a small private beta:** the Free plan is suitable.
- **Before public registration:** configure custom SMTP.
- **Before accepting paid subscribers:** assess aggregate capacity, restore-tested cloud backups, monitoring and availability. A paid plan can improve operations but is not a code requirement; a low-budget launch still needs an adequate recovery plan.
- Keep SQLite/AsyncStorage as LockNote's local source of truth so ordinary notes remain available when Supabase is offline.
- Proposal 2 enforces 25/75/750 MB combined note/image quotas per account. These per-account limits do not increase Supabase's project-wide database or Storage allowances; upgrade capacity and monitor total usage before promising those quotas at production scale.
