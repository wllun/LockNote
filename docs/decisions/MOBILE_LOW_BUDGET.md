# Mobile-only low-budget deployment plan

Updated: 18 September 2026.

Scope: LockNote mobile distribution, starting with Android. No public web app deployment is planned. Start with free service tiers and upgrade only when usage or operational requirements justify the cost.

The previously discussed RM200–500 monthly budget is an optional allowance, not a minimum or mandatory bill.

## Services and publication costs

Vendor prices are in USD unless explicitly marked RM. Free tiers have limits; they do not guarantee unlimited or permanently free operation.

| Item | Low-budget choice | Initial cost |
| --- | --- | --- |
| Accounts, sync, sharing and cloud images | Supabase Free; monitor storage and usage | RM0/month within limits — [pricing](https://supabase.com/pricing) |
| App builds and updates | Expo Free; stay within build and update allowances | RM0/month within limits — [plans](https://docs.expo.dev/billing/plans/) |
| Premium subscription management | RevenueCat Free below US$2,500 monthly tracked revenue | RM0/month initially; then 1% of tracked revenue — [pricing](https://www.revenuecat.com/pricing) |
| Verification and password-reset emails | Configure custom SMTP using an email provider with a free tier | RM0/month within provider limits — [example: Resend](https://resend.com/pricing) |
| Email sending domain | Use an existing domain or buy one if needed | Estimated RM50–150/year; registrar, domain extension and renewal prices vary |
| Web app hosting | Skip; release mobile only | RM0 |
| Privacy policy and support page | Use free static-page hosting | RM0 within hosting limits |
| Backups and error monitoring | Manual cloud-data backups and free monitoring initially | RM0 service fee within limits; requires maintenance time |
| Google Play publication | Register a developer account | US$25 one-time registration — [Google](https://support.google.com/googleplay/android-developer/answer/6112435) |
| Apple App Store publication | Add only when releasing on iPhone | US$99/year — [Apple](https://developer.apple.com/programs/enroll/) |

## Recommended starting budget

Launch Android first:

- Upfront store registration: US$25.
- Recurring service subscriptions: potentially RM0/month while within free limits.
- Annual domain cost: approximately RM50–150 if a new email domain is needed. This is a planning allowance, not a vendor quotation.
- Add iPhone later: US$99/year for Apple Developer Program membership.

This excludes development-tool subscriptions, hired maintenance, testing devices, taxes, currency-conversion fees, advertising and store commissions on premium purchases. Free services do not eliminate the time needed to maintain the app.

## Important limitations

- Supabase Free currently includes a 500 MB database, 1 GB file storage, 5 GB outgoing data plus a separate 5 GB cached outgoing allowance, and 50,000 monthly active authentication users. These are project-level allowances shared across users, not allowances per LockNote user. Cloud images can reach storage limits well before the authentication user limit. See [Supabase pricing](https://supabase.com/pricing).
- Supabase Free lacks automatic database backups and projects can pause after one week of inactivity. Maintain separate cloud-data backups and monitor availability. The app's JSON export is not a complete backup of accounts, collaboration data or cloud image files.
- Supabase's built-in authentication email sender is restricted and unsuitable for public production use. Configure custom SMTP before public release; the selected provider can still have a free tier. See [Supabase email requirements](https://supabase.com/docs/guides/auth/auth-smtp).
- A verified sending domain may be required by the email provider even though no web app is deployed.
- Mobile-only distribution still needs a publicly accessible privacy policy and suitable support information. Free static hosting can serve these pages without deploying LockNote's web app.
- RevenueCat's tracked-revenue charge is separate from store commissions. Expo paid plans are not required simply to keep an already installed app running.
- Local-only notes and backgrounds do not consume Supabase file storage; synced note data and cloud images do.

## When to reconsider paid services

- Supabase: storage, bandwidth, database, realtime or other limits approach capacity; automatic backups or stronger operational availability are needed. Pro currently starts at US$25/month, with additional usage or resources potentially costing extra.
- Expo: free build/update allowances become insufficient or faster build processing is needed. Starter currently costs US$19/month, with applicable additional usage charges.
- Email: free sending limits or delivery requirements become insufficient.
- RevenueCat: monthly tracked revenue reaches its paid threshold.
- Monitoring and backups: support needs or recovery requirements exceed what the free/manual approach can provide.

Prices and quotas can change. Recheck the linked official sources before launch or upgrading. This document is a budget plan, not confirmation that the services have been configured or the app is production-ready.
