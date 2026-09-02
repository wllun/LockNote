# LockNote forced mobile updates

LockNote 1.1.0 is the update-capable baseline. Android and iOS each check their
own public `app_update_config` row when the app starts and when it returns to the
foreground. Web is intentionally excluded because a deployed web app already
serves its current bundle. Enforcement is disabled by default.

An installed 1.0.0 build does not contain this check and cannot be remotely
blocked. Existing users must install this baseline once before later releases
can be enforced.

## 1. Deploy the configuration table

From the project root, link the intended Supabase project and deploy migrations:

```powershell
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
```

The migration gives `anon` and `authenticated` read-only access. It does not
give either role permission to insert, update, or delete the configuration.
Manage the row through the Supabase SQL editor, dashboard, or another trusted
administrator environment. Never put the service-role key in the app.

## 2. Configure each platform

The migration creates the Android row. Before shipping iOS, add its row with the
real App Store listing URL and numeric iOS build number. Do not use a placeholder
App Store ID in production.

```sql
insert into public.app_update_config (
  platform,
  latest_version_code,
  minimum_version_code,
  force_update_enabled,
  update_url,
  message
) values (
  'ios',
  2,
  1,
  false,
  'https://apps.apple.com/app/idYOUR_APP_STORE_ID',
  'A newer version of LockNote is required to continue.'
)
on conflict (platform) do update
set update_url = excluded.update_url,
    updated_at = now();
```

The app accepts HTTPS links for both platforms and additionally accepts
`market://` links on Android. iOS policies reject Android market links.

## 3. Release the baseline without forcing it

Build 1.1.0 and first release it through store testing. The app config starts at
Android `versionCode: 2` and iOS `buildNumber: "2"`; the EAS production profile
also uses `autoIncrement`, so confirm the actual build number shown by EAS and
the relevant store console.

```powershell
npx.cmd eas-cli@latest build -p android --profile production
```

Keep this configuration while distributing the baseline:

```sql
update public.app_update_config
set latest_version_code = 2,
    minimum_version_code = 1,
    force_update_enabled = false,
    updated_at = now()
where platform = 'android';
```

Replace `2` with the actual baseline build code if EAS incremented it.

Use the same disabled policy for iOS, replacing the platform and actual build
number as needed.

## 4. Release a newer build

Increase `expo.version` and the relevant `expo.android.versionCode` or
`expo.ios.buildNumber` in `app.config.js`, test the new release, and make it fully
available before enabling enforcement. Never set the minimum to a build that
users cannot download yet.

For example, after build 3 is available:

```sql
update public.app_update_config
set latest_version_code = 3,
    minimum_version_code = 3,
    force_update_enabled = true,
    update_url = 'https://play.google.com/store/apps/details?id=com.locknote.app',
    message = 'Update LockNote to continue using the app.',
    updated_at = now()
where platform = 'android';
```

Update-capable builds below code 3 will then show the non-dismissible update
screen. Returning from the store causes another check, and the app opens after
the installed build satisfies the minimum. Apply the equivalent update to the
`ios` row only after the App Store release is available.

## Sideloaded APK users

Google Play can only update a package signed compatibly with the installed app.
For users receiving APKs directly, set `update_url` to a trusted HTTPS download
page or APK URL. The new APK must use the same Android signing certificate:

```sql
update public.app_update_config
set update_url = 'https://downloads.example.com/locknote/latest'
where platform = 'android';
```

Do not use an HTTP URL. The app accepts only HTTPS and Android `market://` links.

## Emergency rollback

Disable the gate immediately without releasing another APK:

```sql
update public.app_update_config
set force_update_enabled = false,
    updated_at = now()
where platform in ('android', 'ios');
```

Devices cache the last valid policy for offline launches. A cached force policy
expires after 72 hours and then fails open, preventing a permanent lockout caused
only by a Supabase or network outage.

## Release checklist

- Verify the new build preserves all local notes after an update install.
- Test Play-installed, App Store-installed, and sideloaded Android upgrade paths separately.
- Test with the update configuration enabled, disabled, missing, and malformed.
- Test offline with fresh and expired cached policies.
- Confirm the download is public before raising `minimum_version_code`.
- Roll out through internal and closed testing before production.
