# Project State — TODO

_Snapshot: 2026-07-09. Check off items as they land._

## Done

- [X] Create/open/delete folders (soft delete)
- [X] Create/open/delete notes, at root or inside a folder (soft delete)
- [X] Auto-saving note editor (debounced 800ms)
- [X] Password lock/unlock on folders and notes (SHA-256 gate)
- [X] Local persistence — SQLite on iOS/Android, AsyncStorage on web
- [X] Bottom-tab navigation (Home, Settings) with pull-to-refresh

## To do

### Incomplete / stubbed
- [X] Wire up search UI — Home has a search bar that queries `folderRepo.search()` + `noteRepo.search()` (added `folderRepo.search()` to both repos); results replace the default lists, password gating preserved
- [ ] Implement or remove **Settings → Backup Data** (currently labeled "Coming soon", no handler)
- [X] Decide on `hardDelete()` — now called by the editor's empty-note cleanup on exit; no user-facing "permanently delete" flow (not needed)
- [X] Clean up empty notes on editor exit (editor hard-deletes the row on unmount if title, content, and password are all empty; also flushes a pending auto-save on exit)

### Supabase (now active — not vestigial)
- [X] Revived for account auth (Phase 2 of ROADMAP.md). `src/services/supabaseClient.js` creates the client (AsyncStorage-backed session persistence); `src/context/AuthContext.js` exposes `useAuth()` app-wide.
- [X] Profile tab — `AuthScreen` (email/password sign up + sign in, one screen with a mode toggle) shown when logged out; `ProfileScreen` (email, member-since date, Sync Notes stub, Sign Out) shown when logged in.
- [X] Account password recovery — sign-in sends a Supabase reset email; `locknote://reset-password` opens an in-app new-password form.
- [X] Require matching password confirmation during registration and password reset.
- [ ] Add stronger email and password validation.
- [X] Add user-friendly network and Supabase configuration error handling.
- [X] Add automated authentication tests (11 cases covering errors, callbacks, redirects, and Supabase request wrappers).
- [ ] Verify registration, email confirmation, login persistence, password reset, and sign-out end-to-end on Android, iOS, and web. Android and iOS simulator binaries compile successfully on EAS; web production export and local HTTP runtime pass. Interactive cloud-device verification is blocked until EAS Simulator is enabled for the Expo account.
- [X] Email confirmation returns to `locknote://auth-confirm` on native and the corresponding app URL on web.
- [ ] Sync Notes is a stub (`Alert` only) — no premium gating, no actual note/folder sync to Supabase yet.
- Note content itself still never leaves the device — only auth (email/password) talks to the network.

### Possible features
- [X] Dark mode — palette centralized in `src/theme.js` (`useTheme()` + `makeStyles(colors)`). Theme mode (`system` / `light` / `dark`) is set in Settings, persisted in AsyncStorage (`@locknote_theme`), shared via `ThemeProvider` context; `system` follows the OS via `useColorScheme`. `userInterfaceStyle` is `automatic`.
- [X] Password recovery/reset — an app-wide recovery PIN (Settings → Security), persisted in AsyncStorage via `src/utils/recovery.js`, hashed with the same SHA-256 helper as item passwords. `PasswordModal` gets a "Forgot password?" link that verifies the PIN and clears the item's password. Note: this resets the gate, it does not recover the original password (impossible from a hash) — consistent with the "gating, not encryption" model.
- [ ] Data export / cross-platform portability (native SQLite and web AsyncStorage are separate, no sync)
- [X] Pinning — `is_pinned` column added to both SQLite tables (migrated via guarded `ALTER TABLE`) and to the web AsyncStorage records. Pinned folders/notes sort first everywhere (lists + search). Toggle via long-press in lists, or a header button in the note editor.

## Roadmap

### Phase 1 — Offline (free) — shipped

- [X] Offline local storage
- [X] Folders
- [X] Notes
- [X] Set password (folder/note lock)
- [X] Theme mode (light/dark, plus system)

### Phase 2 — Cloud — premium, RM4.90/month

- [X] Login — Profile tab with real Supabase Auth (email/password sign up + sign in, session persisted via AsyncStorage). No premium gating yet — anyone can create an account.
- [ ] Sync DB — Profile screen has a "Sync Notes" entry point, currently stubbed ("Coming soon"). Actual push/pull of notes/folders to Supabase not built.
- [ ] Multi-device login — depends on Sync DB above; logging in on a second device doesn't yet pull your notes.
- [X] Searchable — already shipped free in Phase 1 (Home search bar); decide whether to keep it free or gate it behind Phase 2

### Phase 3 — Attachments — premium pro, RM9.99/month

- [ ] Image attachment

### Phase 4 — Export

- [ ] Export PDF & image

### Phase 5 — Structure (not premium)

- [ ] Folder in folder (nesting)
- [ ] App icon & name change

### Phase 6 — Add menu and note types

When the user presses the Add button, let them choose one of these note types:

- [ ] Note — plaintext
- [ ] Checklist — checkbox listing
- [ ] Expense Record — date, remark, amount
- [ ] Reminder — plaintext with notification settings

### Additional / backlog (unphased)

- [X] Pin — already shipped free in Phase 1 scope; decide which tier it belongs to
- [ ] Coloring note
- [ ] View (list/grid?)
- [ ] Sort
- [ ] Trash (currently soft-delete with no trash UI)
- [ ] Archive

## Caveats (not bugs — document, don't "fix" silently)

- **Not secure storage.** Passwords gate access via hash comparison; note content is plaintext in the local DB. Not safe for genuinely sensitive data — see [README.md](../README.md#security).
- **Migration history.** App was originally built for Supabase (cloud + auth), migrated to local-only, and has now re-adopted Supabase — but only for account auth (Phase 2 of ROADMAP.md), not as a data store. Notes/folders remain local-only (SQLite/AsyncStorage); nothing about them syncs yet.
