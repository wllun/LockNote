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

- **Home** (native stack): `HomeScreen` → `FolderScreen` → `NoteEditorScreen`
- **Settings** (native stack): `SettingsScreen`
- **Profile** (native stack): `ProfileTabScreen` → `AuthScreen` (logged out) or `ProfileScreen` (logged in), switched via `useAuth()`

Screens reload their data on the navigation `focus` event (listener registered in `useEffect`, cleaned up on unmount) rather than holding shared state — so returning from the editor reflects edits without a store.

## Data model

Two tables / collections. Timestamps are ISO strings; IDs are generated client-side (`Date.now()` base36 + random suffix).

**folders**: `id, name, password, is_deleted, created_at, updated_at`

**notes**: `id, folder_id (nullable → root note), title, content, password, is_deleted, created_at, updated_at`

On native, `notes.folder_id` has `ON DELETE CASCADE` and there are indexes on `folder_id` and both `is_deleted` columns.

### Conventions

- **Soft delete** — `softDelete()` sets `is_deleted = 1`; every read filters `is_deleted = 0`. `hardDelete()` exists but is not wired to any UI.
- **Root notes** — `folder_id IS NULL` means the note lives on the Home screen, not in a folder.
- **Ordering** — folders by `created_at DESC`, notes by `updated_at DESC`.

## Password protection

`utils/crypto.js` hashes with SHA-256 (`expo-crypto`). On create/update, a plaintext password is hashed and stored in the `password` column (null = unlocked). To open a locked item, `PasswordModal` hashes the entered password and compares to the stored hash.

This is **gating, not encryption** — note `content` is stored in cleartext. See the security note in [README.md](../README.md).

## Editor auto-save

`NoteEditorScreen` creates the note row first (empty), then navigates into it by `noteId`. Title/content changes trigger a debounced (800ms) `noteRepo.update`. The debounce timer is cleared on unmount and before delete.

## Auth

Supabase is used for account auth only (Phase 2 of [ROADMAP.md](ROADMAP.md)) — it is not a data store, and note/folder content never leaves the device.

- `src/services/supabaseClient.js` — the client, configured with AsyncStorage as the session storage adapter so a login survives app restarts. Reads `supabaseUrl`/`supabaseAnonKey` from `Constants.expoConfig.extra` (populated from `.env` via `app.config.js`), not `process.env` directly. Missing or invalid configuration no longer crashes startup; auth actions show a support-oriented configuration message.
- `src/services/authService.mjs` and `src/utils/auth.mjs` — testable Supabase request wrappers, callback parsing, and user-friendly error mapping for network, credentials, rate-limit, expired-link, and configuration failures.
- `src/context/AuthContext.js` — `AuthProvider` (wraps the app in `App.js`) subscribes to `supabase.auth.onAuthStateChange`, handles password-recovery and email-confirmation deep links (implicit tokens or PKCE codes), and exposes the session and recovery state via `useAuth()`.
- `AuthScreen` handles sign-up, sign-in, forgotten-password email requests, and choosing a new password. Supabase must allow `locknote://reset-password` and `locknote://auth-confirm` in **Authentication → URL Configuration → Redirect URLs** (plus the corresponding deployed web URLs). On sign-up, if Supabase's "confirm email" setting is on, no session comes back immediately — the screen shows a "check your email" message and flips to sign-in mode; if it's off, a session comes back right away and `onAuthStateChange` flips the Profile tab over on its own.
- `tests/auth.test.mjs` exercises error mapping, callback parsing, redirects, request payloads, and configuration/error propagation. It runs as part of `npm test`.
- `react-native-url-polyfill/auto` is imported first in `index.js` — required because Hermes' native `URL` implementation is incomplete and `@supabase/supabase-js` depends on it.

## Notable state

- **New Architecture** is enabled (`newArchEnabled: true`), with `react-native-reanimated` 4 and `react-native-screens`.
