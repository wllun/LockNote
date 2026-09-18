# LockNote Setup TODO

_Created: 2026-09-19. Check off tasks after configuration and verification._

## 1. Add RevenueCat server environment variables

These are **Supabase Edge Function secrets**, not variables for the mobile/web app's `.env` file.

Required secrets:

1. `REVENUECAT_SECRET_API_KEY`: your server-only RevenueCat API key (v1 API key with subscriber read access).
2. `REVENUECAT_WEBHOOK_AUTHORIZATION`: a long random secret, such as `Bearer <random-secret>`.

Sandbox configuration also belongs in **Supabase Edge Functions → Secrets**:

- `REVENUECAT_ALLOW_SANDBOX`: set the value to `true` only in a separate development/test Supabase project to process sandbox and Test Store subscriptions. In production, leave it unset or set it to `false`. This variable is not required for production and must not be enabled there.

The correct first name is `REVENUECAT_SECRET_API_KEY`; `EVENUECAT_SECRET_API_KEY` is a typo and will not be read by the webhook.

### How to add them

1. Open the [Supabase Dashboard](https://supabase.com/dashboard).
2. Select the LockNote project.
3. Open **Edge Functions → Secrets**.
4. Add each secret using the exact name above and its real value, then save.
5. In RevenueCat's webhook configuration, set the Authorization header to the exact full value saved as `REVENUECAT_WEBHOOK_AUTHORIZATION`, including the `Bearer ` prefix if used.

- [ ] Obtain the RevenueCat secret API key.
- [ ] Generate a long random webhook authorization secret.
- [ ] Save `REVENUECAT_SECRET_API_KEY` in Supabase Edge Function secrets.
- [ ] Save `REVENUECAT_WEBHOOK_AUTHORIZATION` in Supabase Edge Function secrets.
- [ ] In the separate test project, add the Edge Function secret `REVENUECAT_ALLOW_SANDBOX` with value `true` before testing sandbox/Test Store subscriptions.
- [ ] Before production release, verify `REVENUECAT_ALLOW_SANDBOX` is unset or `false` in the production project's Edge Function secrets.
- [ ] Configure the same Authorization value in the RevenueCat webhook integration.
- [ ] Verify a legitimate webhook updates the expected user's server subscription and an incorrect Authorization value is rejected.

### Security

- Never put these values in the app's `.env`, Expo public variables, app config, Git, screenshots, or chat messages.
- Do not replace the secret API key with a RevenueCat public SDK key.
- The Supabase secret and RevenueCat Authorization header must match exactly; do not add another `Bearer ` prefix to an existing one.

For deployment order, subscriber backfill, and sandbox testing, see [Subscription Payment Setup](docs/decisions/SUBSCRIPTION_SETUP.md#5-deploy-proposal-2-backend-enforcement).

## 2. Configure app and build environment variables

The existing code already reads these variables through `app.config.js`; no additional code change is needed just to supply keys for the implemented monthly subscription flow. Environment configuration alone does not finish store, RevenueCat, or backend setup.

The app and Edge Functions run separately. App public SDK keys belong in the local `.env` or Expo build environment; RevenueCat server secrets belong in Supabase Edge Function secrets.

| Usage | App configuration |
| --- | --- |
| Authentication, manual sync, sharing, and cloud services | `SUPABASE_URL` and `SUPABASE_ANON_KEY` |
| Local Android development/development client or standalone APK | `REVENUECAT_ANDROID_API_KEY` |
| iOS development or production build | `REVENUECAT_IOS_API_KEY` |
| Web subscriptions, when web billing is configured | `REVENUECAT_WEB_API_KEY` |
| Simulated subscriptions in Expo Go | `REVENUECAT_TEST_API_KEY` |
| EAS cloud builds | Configure the public variables in the Expo environment selected for that build |

- [ ] Create the project-root `.env` from `.env.example` if it does not already exist, then replace placeholders with real public values.
- [ ] Set `SUPABASE_URL` and the Supabase public `SUPABASE_ANON_KEY`.
- [ ] Set each RevenueCat public SDK key for the platforms being tested or released; unused platforms do not require keys.
- [ ] For EAS builds, configure the same public values in the correct Expo build environment. Do not rely on an uncommitted local `.env` being supplied to the cloud build.
- [ ] Keep `.env` out of Git and commit only `.env.example` with placeholders.
- [ ] Restart the development server after environment changes; rebuild installed standalone apps to include changed configuration.

The built app contains these public values and does not download a `.env` file at runtime. Missing RevenueCat SDK keys do not crash the app, but purchasing reports that subscriptions are not configured for that build.

Never add `SUPABASE_SERVICE_ROLE_KEY`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTHORIZATION`, database passwords, or SMTP passwords to the app environment. Supabase provides its URL, anon key, and service-role key to hosted Edge Functions automatically.

## 3. Finish subscription setup and verification

- [ ] Create Apple/Google subscription products for the implemented monthly plans on the platforms being released.
- [ ] In RevenueCat, configure the Current offering, `plus`/`pro` entitlements, and `plus_monthly`/`pro_monthly` packages with matching products.
- [ ] Confirm all required database migrations are applied to the intended Supabase project.
- [ ] Deploy `share-note` and `revenuecat-webhook`; the webhook uses `--no-verify-jwt` and validates its own RevenueCat Authorization secret.
- [ ] Configure the RevenueCat webhook URL and matching Authorization header, including lifecycle and transfer events.
- [ ] If existing paid subscribers exist, backfill their canonical subscriptions before enabling the updated paid service.
- [ ] Test purchases, Plus-to-Pro upgrades, restore, cancellation, expiry, identity changes, and server activation using the separate sandbox environment.
- [ ] Verify a successful purchase updates the matching Supabase UUID's `user_subscriptions` record and the expected sharing/image/quota gates.
- [ ] Before offering annual subscriptions, implement yearly checkout, annual products/packages, and matching period labels. Yearly checkout is not currently implemented.

Real native payments require an appropriate native development/store build and configured store testing, not just an Expo Go session. Local builds read local configuration; EAS builds need the selected Expo environment. Database migrations alone do not activate paid subscriptions.

## 4. Parked: verify Free account and manual sync

- [ ] Sign in using a latest-code app build configured with the test project's Supabase public values.
- [ ] Create a top-level folder and a plain note, then run Profile → Sync Notes.
- [ ] Verify the matching account UUID owns the rows in `private_folders` and `private_notes`.
- [ ] On a second device or web session, sign in with the same account and run Sync Notes; verify both records appear.
- [ ] Edit and delete test notes across both devices, synchronizing each device explicitly; verify changes transfer and deleted notes do not return.
- [ ] Verify another account cannot read these private records.

RevenueCat setup is not needed for Free manual sync within its quota. Existing device-local notes can repopulate truncated cloud tables when synchronized; this is expected. Automatic/background sync remains unimplemented.

## 5. Parked: sandbox-only dummy subscription seeder

Use a development-only seeder to test subscription gates without real payment. Do not implement or run it against the production project, and do not include dummy paid plans in release migrations or automatic production seeding.

- [ ] Create dedicated test accounts through Supabase Auth and confirm their matching `public.profiles` rows exist.
- [ ] Record their actual Auth UUIDs; `user_subscriptions.user_id` references `profiles.id`, so invented UUIDs are not valid test users.
- [ ] Create a standalone, explicitly invoked development SQL seeder with a test-project guard and a test-user UUID allowlist.
- [ ] Seed separate Free, active Plus, active Pro, and expired-paid fixtures. Active Plus/Pro need future `expires_at` values; missing or expired subscription rows resolve to Free.
- [ ] Use the existing `apply_verified_subscription` function from a trusted administrative SQL session rather than allowing the app to write subscription rows or adding a client premium toggle.
- [ ] Refresh the signed-in app's server subscription state and verify sharing, image uploads, nested folders, quotas, and expiry/downgrade recovery.
- [ ] Provide a cleanup/reset command limited to the seeded test-user UUIDs, not a blanket truncate of `user_subscriptions`.

### Manual sandbox example for the future seeder

In the **separate test project's Supabase SQL Editor**, replace the placeholder with an existing test user's Auth UUID. This example simulates seven days of Pro server access; it does not record or verify a purchase.

```sql
SELECT public.apply_verified_subscription(
  'REPLACE_WITH_EXISTING_TEST_USER_UUID'::uuid,
  'pro',
  now() + interval '7 days',
  now()
);
```

Use `plus` instead of `pro` for an active Plus fixture. To reset that same test user to Free:

```sql
SELECT public.apply_verified_subscription(
  'REPLACE_WITH_EXISTING_TEST_USER_UUID'::uuid,
  'free',
  NULL,
  now()
);
```

### How to run the manual seed

No Docker, extra local tools, or PowerShell command is needed for these SQL examples. The automated seeder is still a TODO; there is no `npm run seed` or standalone seeder file yet.

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select the **separate development/test project**, not production. Confirm the project name and reference before running SQL.
2. Ensure that test project has the migrations through `202609180001_shared_note_subscription_visibility.sql` applied. It needs `user_subscriptions` and `apply_verified_subscription`.
3. Create/sign up a dedicated test account in that project. Under **Authentication → Users**, copy its user UUID.
4. Open **SQL Editor → New query** using the administrative `postgres` role, and confirm that account has a profile. Replace the placeholder and click **Run**:

   ```sql
   SELECT id, email
   FROM public.profiles
   WHERE id = 'REPLACE_WITH_EXISTING_TEST_USER_UUID'::uuid;
   ```

   Continue only if exactly the intended test user's row exists. If no row exists, check the project/account and the profile-trigger migrations; do not invent a UUID or manually seed Auth internals.

5. Paste the Pro example above into a new query, replace its UUID with the same test UUID, and click **Run**. For Plus, change only `'pro'` to `'plus'`. To test expired Pro, change the expiry expression to `now() - interval '1 minute'`.
6. Verify the stored and effective plan in another query:

   ```sql
   SELECT user_id, plan, expires_at, checked_at,
          public.subscription_plan(user_id) AS effective_plan
   FROM public.user_subscriptions
   WHERE user_id = 'REPLACE_WITH_EXISTING_TEST_USER_UUID'::uuid;
   ```

   Active fixtures should report `plus` or `pro`; an expired fixture should report `free` as its effective plan.

7. Use an app build configured with **that same test project's** `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then sign in as the seeded account. Reopen the Premium screen or background/foreground the app while online to refresh its server plan. If you changed app environment values, restart the development server or rebuild the standalone app first.
8. Test the intended plan's features. Purchase/restore buttons may still be unavailable without configured store keys and offerings; the seed only supplies server access.
9. When finished, run the Free reset example above for that same UUID, verify `effective_plan = 'free'`, and refresh the app again. An independently active RevenueCat store entitlement can still keep the app paid; use isolated accounts without real paid entitlements for these fixtures.

If SQL reports `permission denied`, do not grant app users write access or expose the service-role key. Run the seed only through the administrative SQL Editor in the test project. A missing function/table means the test database needs its migrations, not that the app needs a client-side plan toggle.

The current premium access service can read an unexpired server plan after refresh, including when no store SDK key is configured. Seeding does not configure purchase buttons, offerings, store receipts, Restore purchases, renewals, or webhook verification. Test those separately with RevenueCat. Store entitlements can also affect the displayed plan, and a subsequent canonical webhook can overwrite dummy server state.

`REVENUECAT_ALLOW_SANDBOX` only controls whether the webhook accepts sandbox subscriptions; it does not seed records or grant a plan by itself. Production paid plans must continue to come from canonical RevenueCat verification.

## 6. Backend readiness checklist

Database migrations and dummy subscription seeds do not complete backend setup. Leave each item unchecked until its configuration and live verification are complete.

1. [ ] **Database:** verify RLS, manual sync, sharing permissions, edit leases, quotas, and subscription-expiry enforcement against the deployed database.
2. [ ] **Storage:** confirm the `note-attachments` bucket is private and image upload/download policies work, including viewer restrictions, revoked access, and owner-plan expiry.
3. [ ] **Edge Functions:** deploy `share-note` and `revenuecat-webhook`; configure their server secrets. Set `REVENUECAT_ALLOW_SANDBOX=true` only in a separate test project; leave it unset or `false` in production.
4. [ ] **RevenueCat:** configure store products, `plus`/`pro` entitlements, the Current offering and matching packages, and the webhook integration with the exact configured Authorization value.
5. [ ] **Authentication:** configure allowed native/web redirect URLs, authentication email limits, and production SMTP with LockNote-branded templates.
6. [ ] **Force update:** configure Android/iOS policy rows and validate their replacement URLs/build numbers. Keep `force_update_enabled = false` until update-capable installed builds and their replacement builds are available to users.

Use separate test accounts/projects for destructive, quota, and subscription tests. A successful migration or seed is not evidence that RLS, Storage, purchases, or webhook delivery work in production.
