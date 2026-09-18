# Automatic and background sync

Implemented on 19 September 2026 for private/owned folders and note data.
Local storage remains authoritative while editing. Scheduling reuses the existing
last-write-wins RPC, root relationships and tombstones; it needs no new migration
or Edge Function. Existing subscription/sync migrations must already be deployed.

## Enable it

1. Sign in and ensure Supabase reports an active Plus or Pro subscription. See
   [Subscription Setup](decisions/SUBSCRIPTION_SETUP.md) for verification/backfill.
2. Turn on **Profile → Automatic Sync** separately on each device/account.

The device-local, per-account setting defaults to Off. Enabling it allows private
note/folder uploads automatically; cloud note content is not end-to-end encrypted.
Opt-out stops future runs, not an upload already accepted by the server.
Manual **Sync Notes** remains Free within the account quota. Automatic sync pauses
on paid expiry without deleting data/preferences and resumes after verified renewal.

## When it runs

- After session/preference restoration, app resume and reconnect, with a
  1.5-second debounce to combine duplicate triggers.
- Every 60 seconds while the app/page is active, online and no editor is open.
- After the last editor closes and its final save/empty-draft cleanup finishes.
  All four note types participate. Switching tabs with an editor still mounted
  intentionally leaves automatic sync paused.
- Android/iOS can execute a persisted task when the OS permits. The minimum
  interval is 15 minutes, not an exact schedule. Battery/network restrictions
  and force-stopping can delay/prevent execution; iOS needs a physical device.

Background execution is best-effort, not an always-running service. Web, Expo Go
and older APKs lacking the new native modules support foreground automatic sync
only. Closing a browser page stops its automatic synchronization.

Automatic runs sync folder/note records, including reminder descriptions. Binary
image transfer continues through opening a note or manual Sync Notes. Custom
backgrounds, note colors and reminder notification registrations stay device-local.

## Safety and status

- Manual, automatic and explicit recovery runs share one queue, including manual
  image transfer. Automatic RPCs have a 30-second deadline.
- Snapshot requests pin Authorization to their original account. Account,
  enabled preference, paid expiry and editor state are checked before uploads
  and applying responses; stale account responses are discarded.
- Timestamp merges preserve newer persisted local edits. Incoming shared caches
  stay excluded and continue using collaboration services.
- Local snapshots/tombstones form the durable offline queue. Foreground failures
  retry after 15, 30, 60, 120, 240 seconds, capped at 5 minutes. Offline/hidden
  pages stop network attempts; reconnect/resume restarts work.
- Over-quota/no-upload recovery is labelled separately and rechecked after
  5 minutes instead of claiming local uploads succeeded.
- Profile displays last success, syncing, offline, editor wait, plan pause,
  quota recovery or retry/error status. Visible Home/Folder/Archive/Trash lists
  reload on success; editor draft state is never refreshed by automatic sync.

## Build and verify

SDK 54-compatible `expo-background-task` and `expo-task-manager` are installed.
The task is defined at entry-point scope. The background-task config plugin
adds generated iOS background-processing configuration. Build a new native
binary for OS background execution; JavaScript updates cannot add native modules.

With an Android SDK/JDK and a connected device:

```powershell
npx.cmd expo run:android --variant release --device
```

Use [physical-device commands](COMMAND_RUN_APK.md) for the short build-directory
workflow. Preserve local data before resolving a signing mismatch by uninstalling.

On two physical devices using the same verified paid account, enable auto sync:

1. Edit/create a note, close the editor and confirm the other device's Home
   updates on the next interval/resume. Repeat for folders, moves, root notes,
   archives, Pro subfolders, reminders and soft deletes.
2. Edit offline, close the editor and reconnect; confirm changes merge.
3. Keep the receiving editor open; verify it pauses without replacing its draft.
   Verify competing edits follow existing last-write-wins rules after closure.
4. Verify manual/recovery serialization, quota recovery, expiry/renewal, opt-out,
   sign-out and account switching.
5. Background the app with editors closed and inspect OS-scheduled execution.
   Development builds can use `BackgroundTask.triggerTaskWorkerForTestingAsync()`;
   this test API is not available in release builds.

```powershell
npm.cmd test
```

Live backend, payment and OS-scheduled device verification remains required.
See [Expo SDK 54 BackgroundTask](https://docs.expo.dev/versions/v54.0.0/sdk/background-task/)
for platform constraints and developer test tools.
