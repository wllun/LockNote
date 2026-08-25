# Architecture

LockNote is a local-first Expo / React Native app. SQLite/AsyncStorage remains the primary store and all editing works offline. A signed-in user can manually sync private folders and notes to their own Supabase account, and can separately share an individual note with another LockNote account.

## Layers

```
Screens / Components         (React Native UI)
        │
        ▼
Repositories                 folderRepo, noteRepo   ← identical API, platform-swapped impl
        │
   ┌────┴─────┐
   ▼          ▼
SQLite      AsyncStorage
(native)    (web, *.web.js)
```

`syncService` takes active local snapshots plus deletion tombstones, sends them
to the authenticated `sync_private_data` Supabase function, and applies the
canonical response back through matching native/web repository methods.

Metro resolves `folderRepo.js` on native and `folderRepo.web.js` on web automatically via the `.web.js` extension. Screens import `'../db/folderRepo'` — unaware of which backend they get. The two implementations expose the **same method signatures and return shapes**, so any change to one must be mirrored in the other.

## Startup flow

1. `index.js` → `registerRootComponent(App)`
2. `App.js` calls `initDB()`:
   - **native** — opens `locknote.db`, sets WAL + foreign keys, creates `folders`/`notes` tables and indexes if absent
   - **web** — no-op (AsyncStorage is schemaless)
3. Once ready, renders `AppNavigator`; a spinner shows until then.

## Navigation

`AppNavigator` = bottom tab navigator with four tabs:

- **Home** (native stack): `HomeScreen` → `FolderScreen` → the note-type editor (`NoteEditorScreen`, `ChecklistEditorScreen`, `ExpenseRecordEditorScreen`, or `ReminderEditorScreen`)
- **Settings** (native stack): `SettingsScreen`
- **Shared** (native stack): `SharedScreen` → a shared note-type editor
- **Profile** (native stack): `ProfileTabScreen` → `AuthScreen` (logged out) or `ProfileScreen` (logged in), switched via `useAuth()`

Screens reload their data on the navigation `focus` event (listener registered in `useEffect`, cleaned up on unmount) rather than holding shared state — so returning from the editor reflects edits without a store.

Home has independent view preferences for its two content sections: folders can
use a vertical list or horizontal icon strip, while notes can use a list or
two-column grid. Search results use the matching section preference, and notes
inside an opened folder follow the Notes preference. The choices are persisted
in AsyncStorage under `@locknote_folder_view_mode` and
`@locknote_note_view_mode`. The former combined `@locknote_home_view_mode`
preference remains a migration fallback; its grid value maps to folder strip and
note grid. List is the fallback when no valid preference has been saved.

App-wide messages and confirmations are presented by `AppDialogHost`, mounted
beside the navigator in `App.js`. Screens and components call the `AppAlert`
adapter with the same title/message/button shape as React Native's `Alert`, so
validation messages and destructive confirmations share one themed, accessible
dialog on native and web. Destructive flows can also provide item details without
changing their existing repository or password-gating behavior.

List items expose contextual actions through long-press on native and a visible
three-dots button on web. Note actions are pin, move, and soft-delete; folder
actions are rename, pin, and soft-delete. Moving a note updates `folder_id`, with `null`
representing Home. Deleting a folder soft-deletes its contained notes first so
normal reads do not leave inaccessible active notes behind. Deleting a locked
note uses one combined destructive confirmation that shows the note details,
verifies its password, and deletes immediately after successful confirmation.
Locked folders still require their password before the normal destructive
confirmation is shown; unlocked-item deletion is unchanged.

## Data model

Two tables / collections. Timestamps are ISO strings; IDs are generated client-side (`Date.now()` base36 + random suffix).

**folders**: `id, name, password, is_deleted, created_at, updated_at`

**notes**: `id, folder_id (nullable → root note), title, content, note_type, password, is_deleted, created_at, updated_at`

**sync_tombstones** (native) / per-repository tombstone keys (web): deleted
folder/note IDs and deletion timestamps. Normal reads still filter deleted rows;
the sync path uploads tombstones so an older copy on another device cannot
resurrect a deleted item.

`note_type` defaults to `note` for existing/plaintext notes. Expense notes use
`expense`; their editable table rows (`date`, `remark`, and `amount`) are stored
as versioned JSON in `content` and edited by `ExpenseRecordEditorScreen`. Version
4 also stores named monthly-summary categories and one shared summary note in the
same payload. Version 5 adds an independent monthly-commitment checklist with a
bill name, optional due day, amount, and paid state. Version 6 stores a supported
currency code per expense note. The searchable selector contains the complete
current ISO 4217 Currency & Funds list (SIX List One, published 2026-01-01);
missing or unsupported codes safely default to USD (`$`). The selected symbol is
presentation metadata and does not convert stored amounts. Categories contain multiple
case-insensitive remark keywords and use a calculated amount derived from matching
daily-expense rows; saving a normalized category name again updates it
instead of creating a duplicate. The note's `title` remains in the normal title
column. Expense grand totals add daily-expense rows and checked monthly
commitments; unchecked commitments are excluded.

The device-level default expense currency is stored in AsyncStorage under
`@locknote_expense_currency` and is read when a new, still-empty expense note is
opened. Settings can change that default for future notes or explicitly rewrite
the currency metadata of every active private/owned expense note. The bulk action
uses normal note save paths (including collaboration saves for owned shared notes),
excludes Shared-with-me caches, and never performs exchange-rate conversion.

Reminder notes use `reminder` and store a plaintext body plus notification
settings as versioned JSON in `content`. `ReminderEditorScreen` supports one-time,
daily, weekly, and monthly schedules through `expo-notifications`. Notification
identifiers are saved with the note so turning a reminder off, deleting its note,
or deleting its containing folder cancels the pending notification. Locked
reminders schedule privacy-safe text, but their locally stored content remains
plaintext like every other locked note. Web preserves and exports reminder
settings but cannot schedule a device notification.

Checklist notes use `checklist` and store ordered `{id, text, completed}` items
as versioned JSON in `content`. `ChecklistEditorScreen` supports inline editing,
checkbox toggles, drag-handle reordering, item deletion, progress, PDF/image
export to Gallery/Documents with optional sharing, and the same local pin/password
gate used by other notes. Reordered items
are persisted through the existing debounced auto-save. Checklist item text
remains searchable because repository search already checks the serialized
`content` field.

Users can explicitly save the current commitment list for reuse in another
expense note. This app-level template is stored locally in AsyncStorage under
`@locknote_monthly_commitment_template`, excludes paid state and note-specific
IDs, and creates fresh unpaid commitments when applied.

On native, `notes.folder_id` has `ON DELETE CASCADE` and there are indexes on `folder_id` and both `is_deleted` columns.

### Conventions

- **Soft delete** — `softDelete()` sets `is_deleted = 1`; every read filters `is_deleted = 0`. `hardDelete()` exists but is not wired to any UI.
- **Root notes** — `folder_id IS NULL` means the note lives on the Home screen, not in a folder.
- **Ordering** — folders by `created_at DESC`, notes by `updated_at DESC`.

## Password protection

`utils/crypto.js` hashes with SHA-256 (`expo-crypto`). On create/update, a plaintext password is hashed and stored in the `password` column (null = unlocked). To open a locked item, `PasswordModal` hashes the entered password and compares to the stored hash.

The same hash verification gates every user-facing delete path for a locked
note or folder, including list actions and note-editor actions. The recovery PIN
can reset an access gate, but it is not offered as a substitute in the delete
password prompt.

This is **gating, not encryption** — note `content` is stored in cleartext. See the security note in [README.md](../README.md).

## Editor auto-save

`NoteEditorScreen`, `ChecklistEditorScreen`, `ExpenseRecordEditorScreen`, and
`ReminderEditorScreen`
create the note row first (empty), then navigate into it by `noteId`. Field
changes trigger a debounced (800ms) `noteRepo.update`. The debounce timer is
cleared on unmount and before delete. When an editor route is removed, the shared
exit guard waits for an untouched local draft to be hard-deleted—or for a pending
save to finish—before Home/Folder regains focus and reloads its list. This applies
to normal, checklist, expense, and reminder notes; unmount cleanup remains a
fallback for non-navigation teardown. Normal note bodies are limited to 100,000
characters; checklist items are limited to 500 characters and 500 items; see
[Note Character Limits](NOTE_LIMITS.md).

All four editors also keep a bounded, in-memory undo history for the current
editing session. Consecutive typing is grouped into short bursts, while add,
delete, checkbox, monthly-commitment, and reorder operations create individual
undo steps. Restoring a snapshot goes back through the same debounced auto-save
path; the history is cleared when the note is loaded and is not persisted after
leaving the editor.

## Auth

Supabase provides account auth, private account sync, and the backend for notes a user explicitly shares. Local storage remains authoritative while editing offline.

- `src/services/supabaseClient.js` — the client, configured with AsyncStorage as the session storage adapter so a login survives app restarts. Reads `supabaseUrl`/`supabaseAnonKey` from `Constants.expoConfig.extra` (populated from `.env` via `app.config.js`), not `process.env` directly. Missing or invalid configuration no longer crashes startup; auth actions show a support-oriented configuration message.
- `src/services/authService.mjs` and `src/utils/auth.mjs` — testable Supabase request wrappers, callback parsing, field validation, email normalization, and user-friendly error mapping for network, credentials, rate-limit, expired-link, and configuration failures. Emails are trimmed and lowercased before requests; registration and reset passwords require at least 8 characters.
- `src/context/AuthContext.js` — `AuthProvider` (wraps the app in `App.js`) subscribes to `supabase.auth.onAuthStateChange`, handles password-recovery and email-confirmation deep links (implicit tokens or PKCE codes), and exposes the session and recovery state via `useAuth()`.
- `AuthScreen` handles sign-up, sign-in, forgotten-password email requests, and choosing a new password. Invalid email, short-password, and confirmation errors appear beneath their relevant fields before Supabase is called. Supabase must allow `locknote://reset-password` and `locknote://auth-confirm` in **Authentication → URL Configuration → Redirect URLs** (plus the corresponding deployed web URLs). On sign-up, if Supabase's "confirm email" setting is on, no session comes back immediately — the screen shows a "check your email" message and flips to sign-in mode; if it's off, a session comes back right away and `onAuthStateChange` flips the Profile tab over on its own.
- `tests/auth.test.mjs` exercises error mapping, callback parsing, redirects, request payloads, and configuration/error propagation. It runs as part of `npm test`.
- `react-native-url-polyfill/auto` is imported first in `index.js` — required because Hermes' native `URL` implementation is incomplete and `@supabase/supabase-js` depends on it.

## Private account sync

Profile → Sync Notes performs an explicit two-way sync of folders and private or
owned notes. The server stores typed rows in `private_folders` and
`private_notes`; row-level security restricts every row to its authenticated
owner. The `sync_private_data` RPC merges snapshots atomically with
last-write-wins ordering by each client's ISO `updated_at`, then returns the
account's canonical snapshot. Sync applies folders before notes to preserve
foreign keys and keeps `folder_id = null` for Home notes.

Incoming collaboration notes are excluded because their source of truth is the
shared-note service. Soft-delete and historical tombstones propagate removals.
Reminder bodies sync, but device notification registrations and enabled state
remain local to the device that scheduled them. The last successful sync time is
stored per account in AsyncStorage.

LockNote does not end-to-end encrypt note content before upload. Password fields
remain SHA-256 access-gate hashes; they are never uploaded as plaintext.

## Portable backup and restore

Settings → Export Backup builds a schema-versioned `locknote-backup` JSON file
from the repositories' active private/owned records and sync tombstones. The
file includes folders, notes, note types, pin state, ISO timestamps, nullable
`folder_id` relationships, and existing SHA-256 access-gate hashes. It does not
include incoming shared-note caches or account/collaboration identifiers.

Settings → Import Backup reads a selected JSON file into memory, enforces a 25
MB limit, validates its format, version, field types, timestamps, unique IDs,
password-hash shape, and folder references, then shows folder/note/deletion
counts before writing. Merge reuses the repositories' last-write-wins snapshot
methods. Replace uses matching `replaceBackupSnapshot()` methods on native and
web, clears current private data and tombstones, and keeps Shared-with-me notes.
Folders are always restored before notes so foreign keys remain valid; a null
`folder_id` stays a Home/root note.

Reminder bodies and schedule settings are portable, but notification IDs are
device-local. Export and import clear those IDs and disable the reminder so a
restore cannot create a schedule the destination device did not register.
Imported owned collaborative notes become private local notes to avoid retaining
stale account or cloud identifiers.

Backup JSON contains plaintext note content and is not encrypted.

## Shared-note collaboration

Release 1 shares individual notes by registered account email. Once sharing begins, the local row stores a cloud ID, ownership/origin, collaborator count, server revision, sync state, and last-editor metadata. Incoming notes are excluded from Home, folder, private-account sync, and search reads and appear only in the Shared tab.

Supabase stores `profiles`, `shared_notes`, and `note_members`. Row-level security limits reads to the owner and current members. Email lookup is performed by the authenticated `share-note` Edge Function so the client cannot enumerate account emails and never receives a service-role key. Content saves use an expected server revision; stale saves fail instead of silently replacing newer content. Realtime table events refresh the local cache and an open editor. Release 1 synchronizes complete saved note snapshots and does not provide character-level CRDT cursor merging.

## Notable state

- **New Architecture** is enabled (`newArchEnabled: true`), with `react-native-reanimated` 4 and `react-native-screens`.
