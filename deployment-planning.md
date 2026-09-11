# LockNote Deployment Plan

_Prepared: 11 September 2026. Store policies, service quotas, and prices can change; recheck every linked source before submission._

## Recommendation

Release LockNote in stages:

1. Android internal test.
2. Android closed beta with real testers.
3. Public Android release after every production gate is complete.
4. TestFlight and iOS release after the Android version is stable.

LockNote is suitable for beta testing now because its core note experience is local-first. It should not sell Plus or Pro cloud features as production-ready until authentication, synchronization, sharing, account deletion, email delivery, entitlements, and quotas are verified end to end.

## Product scope for the first beta

The first beta should validate the features that already provide user value:

- local notes and folders;
- checklist, expense, and reminder note types;
- local password gates, with clear wording that they are not encryption;
- archive and trash;
- PDF/image export;
- portable backup export and restore;
- account registration and login;
- manual Sync Notes and explicit note sharing, labelled as beta if enabled.

Do not charge testers for Plus or Pro during the first closed beta.

## Current production blockers

| Area | Current state | Required before public paid release |
| --- | --- | --- |
| Authentication | Implemented, but live registration, confirmation, recovery, persistence, and sign-out remain unverified across platforms | Verify every flow on physical Android and iOS devices and on web if web remains supported |
| Supabase backend | Migrations and RPC-based sync exist in the repository | Deploy every required migration and Edge Function to the production project; verify with two separate accounts |
| Synchronization | Manual two-way sync exists | Finish lifecycle/connectivity-triggered sync or clearly advertise synchronization as manual |
| Collaboration | Roles, Realtime updates, revisions, and editing leases are implemented | Verify owner, view-only, editor, revocation, conflict, lease-expiry, offline, and reconnect cases with two devices |
| Authentication email | Production SMTP and LockNote branding are not configured | Connect custom SMTP, verify SPF/DKIM, preserve template callback variables, and test every email template |
| Account deletion | No complete account-deletion flow was found | Add an easy-to-find in-app deletion path; Google Play also requires a web deletion-request URL |
| Purchases | RevenueCat client UI is implemented | Configure store products and RevenueCat entitlements, then verify purchase, restore, upgrade, cancellation, expiration, and refund behaviour |
| Premium enforcement | Feature gating, quota enforcement, and server-owned entitlement persistence are unfinished | Enforce Plus/Pro access and quotas on the server, not only in the app UI |
| Security positioning | Local and synchronized note content is not end-to-end encrypted | State this accurately in the app, privacy policy, store listing, and support documentation |
| Operations | Free services are suitable for development | Choose production Supabase/SMTP plans, monitoring, backups, support contact, and an incident process |

Apple requires apps that support account creation to let users initiate account deletion in the app. Google Play requires both an in-app deletion path and a web resource where a user can request deletion. See [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/) and [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

## Phase 0 — Production preparation

- [ ] Decide whether the first public release is free-only or includes subscriptions.
- [ ] Confirm the production Android package and iOS bundle identifier.
- [ ] Create separate development and production environment-variable sets.
- [ ] Complete the Supabase steps in [supabase-setup.md](supabase-setup.md).
- [ ] Deploy and record the production Supabase migration version.
- [ ] Deploy required Edge Functions without exposing a service-role key in the app.
- [ ] Configure production SMTP and branded authentication templates.
- [ ] Implement account deletion and associated cloud-data cleanup.
- [ ] Publish a privacy policy, terms of use, support page, and account-deletion webpage.
- [ ] Complete Google Play Data Safety and Apple privacy declarations accurately.
- [ ] Configure RevenueCat, Google Play, and App Store products if subscriptions are included.
- [ ] Prepare store name, descriptions, screenshots, icon, feature graphic, category, age rating, and support contact.
- [ ] Define a support and incident-response process.

## Phase 1 — Android internal test

Purpose: catch installation, configuration, native API, and crash issues before recruiting a larger group.

- [ ] Create an Android production-format App Bundle using the production build profile.
- [ ] Upload it to Google Play Internal testing.
- [ ] Test installation and upgrade over an older LockNote build.
- [ ] Test on at least one older, one mid-range, and one recent Android device.
- [ ] Verify navigation-bar safe areas, keyboard layouts, notifications, exports, Gallery/Documents permissions, and deep links.
- [ ] Confirm that ordinary local notes remain available when the device is offline or Supabase is unavailable.
- [ ] Confirm that production builds contain the correct public Supabase and RevenueCat keys.

Suggested build command:

```powershell
npx eas-cli@latest build -p android --profile production
```

## Phase 2 — Android closed beta

Purpose: validate usefulness, reliability, onboarding, and willingness to pay.

- [ ] Recruit 12–20 testers who genuinely use notes, checklists, reminders, or expense records.
- [ ] Give testers a short scenario checklist instead of asking them only to “try the app.”
- [ ] Run the test for at least 14 continuous days.
- [ ] Collect feedback through one documented channel.
- [ ] Track crashes, failed authentication emails, failed syncs, duplicate/conflicting notes, notification failures, export failures, and data-loss reports.
- [ ] Ask which feature caused testers to return: notes, expenses, reminders, offline privacy, sync, or collaboration.
- [ ] Ask whether RM4.90/month for Plus and RM9.99/month for Pro feel justified.
- [ ] Fix release-blocking failures and issue another closed-test build before production.

For personal Google Play developer accounts created after 13 November 2023, production access currently requires at least 12 testers continuously opted into a closed test for 14 days. See [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).

## Phase 3 — Android production release

Release only when every item in the Production go/no-go checklist is complete.

- [ ] Submit the production App Bundle to Google Play.
- [ ] Begin with a small staged rollout instead of 100% availability.
- [ ] Monitor authentication, SMTP, Supabase database/egress, Realtime, Edge Functions, RevenueCat, crashes, and support reports.
- [ ] Pause the rollout if authentication, payment, upgrade, synchronization, or data-loss problems appear.
- [ ] Increase the rollout only after the previous group is stable.

Suggested submission command after Play Console service-account configuration:

```powershell
npx eas-cli@latest submit -p android --profile production
```

## Phase 4 — TestFlight and iOS

- [ ] Enrol in the Apple Developer Program.
- [ ] Build and submit to TestFlight.
- [ ] Verify deep links, notification permissions, safe areas, document/image export, subscriptions, restore purchases, and account deletion on physical iPhones.
- [ ] Provide App Review with a working review account or a fully functional account-free mode.
- [ ] Submit to App Review only after the TestFlight build passes the same production gates as Android.

Suggested commands:

```powershell
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --profile production
```

## Required test matrix

### Local data

- [ ] Create, edit, reorder, archive, trash, restore, and permanently delete every note type.
- [ ] Verify autosave after typing, pasting, backgrounding, force-closing, and navigating back.
- [ ] Verify undo/redo and character/item limits.
- [ ] Export PDF and image, then open the saved files outside LockNote.
- [ ] Export a backup, uninstall or clear test data, import it, and compare the restored result.

### Accounts and email

- [ ] Register and confirm a new account.
- [ ] Attempt login before confirmation and verify the message.
- [ ] Verify account-password recovery.
- [ ] Verify LockNote-password recovery separately.
- [ ] Verify session persistence after force-close and reboot.
- [ ] Sign out and confirm that private local notes remain local.
- [ ] Delete the account and verify deletion of associated cloud data.

### Sync and collaboration

- [ ] Sync Device A, sign in on Device B, sync, and compare all supported fields.
- [ ] Edit the same note on both devices and verify the documented conflict rule.
- [ ] Sync soft deletions, archive state, root notes, folders, locks, and each note type.
- [ ] Share a note as View only and Can edit.
- [ ] Revoke sharing and verify access disappears.
- [ ] Verify editing lease acquisition, renewal, release, expiry, crash recovery, and offline recovery.

### Purchases

- [ ] Purchase Plus and Pro using store sandbox accounts.
- [ ] Restore purchases after reinstalling or changing device.
- [ ] Upgrade Plus to Pro.
- [ ] Verify cancellation, expiration, billing retry, refund, and offline cached entitlement behaviour.
- [ ] Confirm that server operations reject users without the required entitlement.

## Production go/no-go checklist

Do not start a public paid rollout until all answers are **Yes**:

- [ ] Can a new user register, confirm, sign in, recover both password types, sign out, and delete the account?
- [ ] Have Supabase migrations and Edge Functions been deployed and tested with two real accounts?
- [ ] Can notes survive force-close, offline use, backup/restore, sync conflicts, and app upgrades without data loss?
- [ ] Are Plus/Pro entitlements and quotas enforced by the server?
- [ ] Do subscriptions purchase, restore, upgrade, expire, cancel, and refund correctly?
- [ ] Are privacy, security, sync, and password claims accurate and non-misleading?
- [ ] Are privacy policy, terms, support, account-deletion page, and store disclosures published?
- [ ] Are crash monitoring, usage monitoring, backups, support ownership, and rollback procedures ready?

If any answer is No, continue the closed beta rather than charging public users.

## Cost plan

These estimates use **USD 1 = approximately RM4.07** and exclude taxes, card conversion, commissions, marketing, legal work, and support labour.

### One-time and annual store costs

| Item | Price | Approximate MYR |
| --- | ---: | ---: |
| Google Play full-distribution registration | USD 25 one time | RM102 |
| Apple Developer Program | USD 99 per year | RM403/year |
| Sending/support domain | Vendor-dependent estimate | RM50–100/year |

See [Google Play distribution](https://support.google.com/android-developer-console/answer/16640817?hl=en) and [Apple Developer Program membership](https://developer.apple.com/programs/whats-included/).

### Monthly service costs

| Stage | Expected monthly cost | Notes |
| --- | ---: | --- |
| Development and private beta | RM0 | Supabase Free, Resend Free, and EAS Free, excluding the domain and store registration |
| Small public production | RM105–120 | Supabase Pro plus Resend Free and normal exchange/card variation |
| Higher authentication-email volume | RM185–200 | Supabase Pro plus Resend Pro |
| Optional EAS Starter | About USD 19 / RM77 extra | Useful after the Free build quota or when faster builds are needed |
| Additional Supabase Micro project | About USD 10 / RM41 extra | Applies to another active project in a paid organization |

EAS Free currently includes up to 15 Android and 15 iOS builds per month in a low-priority queue. EAS Starter currently begins at USD 19/month. See [Expo EAS pricing](https://expo.dev/pricing).

Supabase Pro currently begins at USD 25/month and Resend Pro begins at USD 20/month. See [Supabase pricing](https://supabase.com/pricing) and [Resend pricing](https://resend.com/pricing).

At RM4.90 per Plus subscription, budget approximately **25–30 active paying subscribers** to cover an initial RM105–120 monthly backend cost after allowing for store commission and exchange-rate variation. This is a cost break-even estimate, not a profit forecast.

## Post-launch operations

- Review Supabase usage and billing alerts weekly during the initial rollout.
- Review authentication email delivery and bounce reports.
- Review crashes and support messages after every release.
- Test backup restore and account deletion periodically.
- Recheck store policies and service pricing before every major release.
- Maintain a release log containing build numbers, migration versions, Edge Function versions, known issues, and rollback actions.
