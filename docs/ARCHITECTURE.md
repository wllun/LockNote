# Architecture

LockNote is a single-user, local-first Expo / React Native app. Note/folder data has no backend and never leaves the device — UI talks to a thin repository layer that abstracts over two platform-specific storage backends. Account auth is the one piece that talks to the network (see [Auth](#auth) below); it does not touch note/folder data.

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

Metro resolves `folderRepo.js` on native and `folderRepo.web.js` on web automatically via the `.web.js` extension. Screens import `'../db/folderRepo'` — unaware of which backend they get. The two implementations expose the **same method signatures and return shapes**, so any change to one must be mirrored in the other.

## Startup flow

1. `index.js` → `registerRootComponent(App)`
2. `App.js` calls `initDB()`:
   - **native** — opens `locknote.db`, sets WAL + foreign keys, creates `folders`/`notes` tables and indexes if absent
   - **web** — no-op (AsyncStorage is schemaless)
3. Once ready, renders `AppNavigator`; a spinner shows until then.

## Navigation

`AppNavigator` = bottom tab navigator with three tabs:

- **Home** (native stack): `HomeScreen` → `FolderScreen` → the note-type editor (`NoteEditorScreen`, `ChecklistEditorScreen`, `ExpenseRecordEditorScreen`, or `ReminderEditorScreen`)
- **Settings** (native stack): `SettingsScreen`
- **Profile** (native stack): `ProfileTabScreen` → `AuthScreen` (logged out) or `ProfileScreen` (logged in), switched via `useAuth()`

Screens reload their data on the navigation `focus` event (listener registered in `useEffect`, cleaned up on unmount) rather than holding shared state — so returning from the editor reflects edits without a store.

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

`note_type` defaults to `note` for existing/plaintext notes. Expense notes use
`expense`; their editable table rows (`date`, `remark`, and `amount`) are stored
as versioned JSON in `content` and edited by `ExpenseRecordEditorScreen`. Version
4 also stores named monthly-summary categories and one shared summary note in the
same payload. Version 5 adds an independent monthly-commitment checklist with a
bill name, optional due day, amount, and paid state. Categories contain multiple
case-insensitive remark keywords and use a calculated amount derived from matching
daily-expense rows; saving a normalized category name again updates it
instead of creating a duplicate. The note's `title` remains in the normal title
column. Expense grand totals add daily-expense rows and checked monthly
commitments; unchecked commitments are excluded.

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
cleared on unmount and before delete. Normal note bodies are limited to 100,000
characters; checklist items are limited to 500 characters and 500 items; see
[Note Character Limits](NOTE_LIMITS.md).

All four editors also keep a bounded, in-memory undo history for the current
editing session. Consecutive typing is grouped into short bursts, while add,
delete, checkbox, monthly-commitment, and reorder operations create individual
undo steps. Restoring a snapshot goes back through the same debounced auto-save
path; the history is cleared when the note is loaded and is not persisted after
leaving the editor.

## Auth

Supabase is used for account auth only (Phase 2 of [ROADMAP.md](ROADMAP.md)) — it is not a data store, and note/folder content never leaves the device.

- `src/services/supabaseClient.js` — the client, configured with AsyncStorage as the session storage adapter so a login survives app restarts. Reads `supabaseUrl`/`supabaseAnonKey` from `Constants.expoConfig.extra` (populated from `.env` via `app.config.js`), not `process.env` directly. Missing or invalid configuration no longer crashes startup; auth actions show a support-oriented configuration message.
- `src/services/authService.mjs` and `src/utils/auth.mjs` — testable Supabase request wrappers, callback parsing, field validation, email normalization, and user-friendly error mapping for network, credentials, rate-limit, expired-link, and configuration failures. Emails are trimmed and lowercased before requests; registration and reset passwords require at least 8 characters.
- `src/context/AuthContext.js` — `AuthProvider` (wraps the app in `App.js`) subscribes to `supabase.auth.onAuthStateChange`, handles password-recovery and email-confirmation deep links (implicit tokens or PKCE codes), and exposes the session and recovery state via `useAuth()`.
- `AuthScreen` handles sign-up, sign-in, forgotten-password email requests, and choosing a new password. Invalid email, short-password, and confirmation errors appear beneath their relevant fields before Supabase is called. Supabase must allow `locknote://reset-password` and `locknote://auth-confirm` in **Authentication → URL Configuration → Redirect URLs** (plus the corresponding deployed web URLs). On sign-up, if Supabase's "confirm email" setting is on, no session comes back immediately — the screen shows a "check your email" message and flips to sign-in mode; if it's off, a session comes back right away and `onAuthStateChange` flips the Profile tab over on its own.
- `tests/auth.test.mjs` exercises error mapping, callback parsing, redirects, request payloads, and configuration/error propagation. It runs as part of `npm test`.
- `react-native-url-polyfill/auto` is imported first in `index.js` — required because Hermes' native `URL` implementation is incomplete and `@supabase/supabase-js` depends on it.

## Notable state

- **New Architecture** is enabled (`newArchEnabled: true`), with `react-native-reanimated` 4 and `react-native-screens`.
