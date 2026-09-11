# Supabase Setup for LockNote

Follow this checklist to enable account registration and login in LockNote.

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
```

Never place the Supabase service-role or secret key in LockNote. A mobile app bundle can be inspected by its users.

## 3. Enable email registration

Open **Authentication → Providers → Email** and configure:

- Enable **Email provider**.
- Enable **Allow new users to sign up**.
- Choose whether to enable **Confirm Email**.

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
```

LockNote already uses these URLs for email confirmation and password recovery. If a web version is deployed later, add its production and development callback URLs separately.

See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Check confirmation-email delivery

When **Confirm Email** is enabled:

1. Register an account in LockNote.
2. Check the email inbox and spam folder.
3. Open the confirmation link on a device where a development or standalone LockNote build is installed.
4. Return to LockNote and sign in.

Supabase's default email service is intended for testing and has a low sending limit. Configure custom SMTP before production use.

See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

## 6. Verify the registered user

Open **Authentication → Users** in Supabase.

After registration:

- The user's email address should appear in the user list.
- The **Confirmed at** field should contain a date and time after successful email confirmation.
- If **Confirmed at** is empty, the user cannot sign in while **Confirm Email** is enabled.

## 7. Restart and test LockNote

After changing `.env`, restart Metro so the updated configuration is loaded:

```powershell
npx expo start --dev-client -c
```

Use a valid email address and a password containing at least eight characters. The password-confirmation value must match.

## What is not required for basic authentication

The collaboration database migration and Edge Function are not required for registration or login. They are required only when enabling shared-note collaboration.

## Supabase Free plan limitations

The following limits were checked on **11 September 2026**. Review the [Supabase pricing page](https://supabase.com/pricing) before launch because quotas and pricing can change.

| Resource | Free limit | LockNote impact |
| --- | ---: | --- |
| Active projects | 2 | Enough for development and production, but leaves little room for a separate staging project. |
| Database size | 500 MB per project | Suitable for development and a small beta, but not a large note-sync service. |
| Monthly active users | 50,000 | More than enough for LockNote's initial authentication needs. |
| File storage | 1 GB | Will become important when image attachments are implemented. |
| Egress | 5 GB per month | Syncing notes and downloading attachments consumes this allowance. |
| Edge Function invocations | 500,000 per month | Sharing-by-email and other server functions consume these calls. |
| Realtime messages | 2 million per month | Shared-note collaboration consumes these messages. |
| Realtime peak connections | 200 | Approximately 200 clients can be connected concurrently. |
| Realtime message size | 256 KB | A large complete-note snapshot may exceed this limit. |
| Log retention | 1 day | Production errors older than one day are difficult to investigate. |

See the [Supabase billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase) for the current detailed quotas.

### Project pausing

Free projects may be paused after one week of insufficient activity. An actively used app may generate enough activity to avoid pausing, but the Free plan should not be treated as a production uptime guarantee.

If the project is paused, authentication, sync, sharing, Realtime, and Edge Functions will be unavailable until it is resumed. LockNote's local SQLite/AsyncStorage notes should remain usable.

### Authentication email restrictions

Supabase's built-in email provider is intended only for development and currently has a limit of approximately **two authentication emails per hour for the entire project**. Delivery is best-effort, has no uptime guarantee, and may be restricted to project-team email addresses.

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

The following estimates were checked on **11 September 2026** and use an indicative conversion of **USD 1 = RM4.07**. Actual card rates, taxes, exchange rates, and vendor pricing can differ.

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
- **Before accepting paid Plus or Pro subscribers:** upgrade to a paid Supabase plan for better reliability, backups, capacity, and support.
- Keep SQLite/AsyncStorage as LockNote's local source of truth so ordinary notes remain available when Supabase is offline.
- Do not promise a 100 MB cloud quota per user while using a 500 MB Free database. Reduce or leave the quota unenforced during testing, then reassess it before launch.
