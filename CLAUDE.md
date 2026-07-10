@AGENTS.md

# Working in LockNote

LockNote is an offline Expo / React Native notes app. Local storage only — no backend. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before making structural changes and [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for current status.

## Before writing code

- Expo SDK 54, React Native 0.81, New Architecture on. APIs have changed — check the versioned docs (see AGENTS.md) rather than assuming older Expo patterns.

## Hard rules

- **Keep native and web repos in sync.** `folderRepo.js`/`noteRepo.js` (SQLite) and their `.web.js` twins (AsyncStorage) must expose identical method signatures and return the same object shapes. Change one → change both. A mismatch only breaks one platform and is easy to miss.
- **Reads filter soft-deleted rows.** Any new query must include `is_deleted = 0` (native) or `!x.is_deleted` (web). Don't hard-delete from UI paths — use `softDelete()`.
- **`folder_id IS NULL` = root note.** Preserve this when touching note queries or moves.
- **Passwords are SHA-256 hashes** via `utils/crypto.js`. Never store or compare plaintext. Note content is *not* encrypted — don't claim it is.

## Conventions

- Screens reload data on the navigation `focus` event; there's no global store. Follow that pattern instead of adding one.
- IDs and timestamps are generated in the repos (base36 id, ISO string). Don't rely on DB defaults for these.
- Editor uses debounced auto-save (800ms) — clear the timer on unmount.

## Don't

- Don't add Supabase / network code. The Supabase dependency and env vars are vestigial (see docs/PROJECT_STATE.md); either ignore or remove them, don't build on them, without asking.
- Don't introduce a state library, navigation redesign, or storage abstraction for hypothetical needs. Match what's here.
