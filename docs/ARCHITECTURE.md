# Architecture

LockNote is a single-user, offline Expo / React Native app. No backend, no auth, no network. UI talks to a thin repository layer that abstracts over two platform-specific storage backends.

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

`AppNavigator` = bottom tab navigator with two tabs:

- **Home** (native stack): `HomeScreen` → `FolderScreen` → `NoteEditorScreen`
- **Settings** (native stack): `SettingsScreen`

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

## Notable state

- **Supabase is vestigial.** `@supabase/supabase-js` is still a dependency and `app.config.js` still injects `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `.env` into `expo.extra`, but no code imports or uses Supabase. The app was migrated to local storage. See [PROJECT_STATE.md](PROJECT_STATE.md).
- **New Architecture** is enabled (`newArchEnabled: true`), with `react-native-reanimated` 4 and `react-native-screens`.
