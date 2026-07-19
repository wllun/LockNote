# Working in LockNote

LockNote is an offline Expo / React Native notes app. All data is stored locally; there is no backend.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before making structural changes and [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for the current status and planned work.

## Before writing code

- This project uses Expo SDK 54, React Native 0.81, and the New Architecture.
- Expo APIs have changed. Read the exact versioned documentation at <https://docs.expo.dev/versions/v54.0.0/> before writing code, rather than assuming older Expo patterns still apply.

## Hard rules

- **Keep native and web repositories in sync.** `folderRepo.js` and `noteRepo.js` use SQLite, while their `.web.js` counterparts use AsyncStorage. Both implementations must expose identical method signatures and return the same object shapes. When one changes, update the other.
- **Filter soft-deleted rows from reads.** Every new query must include `is_deleted = 0` on native or `!x.is_deleted` on web. UI deletion paths must call `softDelete()`, not `hardDelete()`.
- **Preserve root-note semantics.** `folder_id IS NULL` means that a note lives at the root level. Preserve this behavior when changing note queries or move operations.
- **Never store or compare plaintext passwords.** Passwords are SHA-256 hashes produced by `src/utils/crypto.js`. Note content is not encrypted, so never describe password protection as encryption or secure storage.

## Project conventions

- Screens reload their data on the navigation `focus` event. There is no global store; follow the existing pattern unless a requested architectural change requires otherwise.
- Repositories generate IDs and timestamps. IDs use the existing base-36 format and timestamps are ISO strings; do not rely on database defaults.
- The note editor uses an 800 ms debounced auto-save. Clear pending timers on unmount and before destructive actions.

## Avoid

- Do not add Supabase or other network code without explicit direction. The Supabase dependency and environment variables are vestigial; see [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).
- Do not introduce a state library, navigation redesign, or new storage abstraction for hypothetical future needs. Match the existing architecture and the scope of the requested change.
