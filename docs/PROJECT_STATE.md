# Project State — TODO

_Snapshot: 2026-07-30. Check off items as they land._

## Done

- [X] Create/open/delete folders (soft delete)
- [X] Create/open/delete notes, at root or inside a folder (soft delete)
- [X] Auto-saving note editor (debounced 800ms)
- [X] Password lock/unlock on folders and notes (SHA-256 gate)
- [X] Local persistence — SQLite on iOS/Android, AsyncStorage on web
- [X] Bottom-tab navigation (Home, Settings) with pull-to-refresh
- [X] Home folder cards show a soft-delete-aware note count badge

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
- [X] Add stronger email and password validation — normalized lowercase emails, format checks, 8-character minimum for new passwords, confirmation matching, and field-level messages.
- [X] Add user-friendly network and Supabase configuration error handling.
- [X] Add automated authentication tests (17 cases covering validation, errors, callbacks, redirects, and Supabase request wrappers).
- [ ] Verify registration, email confirmation, login persistence, password reset, and sign-out end-to-end on Android, iOS, and web. Android and iOS simulator binaries compile successfully on EAS; web production export and local HTTP runtime pass. Interactive cloud-device verification is blocked until EAS Simulator is enabled for the Expo account.
- [X] Email confirmation returns to `locknote://auth-confirm` on native and the corresponding app URL on web.
- [ ] Sync Notes is a stub (`Alert` only) — no premium gating, no actual note/folder sync to Supabase yet.
- Note content itself still never leaves the device — only auth (email/password) talks to the network.

### Possible features
- [X] Dark mode — palette centralized in `src/theme.js` (`useTheme()` + `makeStyles(colors)`). Theme mode (`system` / `light` / `dark`) is set in Settings, persisted in AsyncStorage (`@locknote_theme`), shared via `ThemeProvider` context; `system` follows the OS via `useColorScheme`. `userInterfaceStyle` is `automatic`.
- [X] Password recovery/reset — an app-wide recovery PIN (Settings → Security), persisted in AsyncStorage via `src/utils/recovery.js`, hashed with the same SHA-256 helper as item passwords. `PasswordModal` gets a "Forgot password?" link that verifies the PIN and clears the item's password. Note: this resets the gate, it does not recover the original password (impossible from a hash) — consistent with the "gating, not encryption" model.
- [ ] Data export / cross-platform portability (native SQLite and web AsyncStorage are separate, no sync)
- [X] Pinning — `is_pinned` column added to both SQLite tables (migrated via guarded `ALTER TABLE`) and to the web AsyncStorage records. Pinned folders/notes sort first everywhere (lists + search). List actions open by long-press on native or three dots on web; editor actions use a three-dots menu.
- [X] Contextual list actions — notes can be pinned, moved between Home/folders, or soft-deleted; folders can be renamed, pinned, or soft-deleted together with their contained notes.

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

- [X] Export PDF & image - note and expense editors provide a preview and export through native sharing; web prints/saves PDF and downloads PNG locally. Expense exports include saved monthly categories, categorized total, and the shared summary note.

### Phase 5 — Structure (not premium)

- [ ] Folder in folder (nesting)
- [ ] App icon & name change

### Phase 6 — Add menu and note types

When the user presses the Add button, let them choose one of these note types:

- [X] Add selection popup on both the Home and Folder Add buttons (unsupported types are clearly marked as coming soon)
- [ ] Note — plaintext
- [X] Checklist — ordered checkbox items with inline editing, progress, local autosave, list/search previews, pin/password/delete support, and PDF/image export
- [X] Expense Record — titled multi-row table with direct date/remark/amount entry, row add/delete/reorder controls, total, local persistence, list summaries, password/pin support, and 800 ms autosave
- [X] Expense Record monthly summaries — named categories support multiple case-insensitive remark keywords or manual amounts, same-name updates, and one shared auto-saved summary note
- [X] Expense Record monthly commitments checklist — Option C paid-status section with progress, remaining amount, add/edit/reset, drag reorder, recycle-bin delete, version 5 persistence, and exports. See [MONTHLY_EXPENSE_CHECKLIST.md](MONTHLY_EXPENSE_CHECKLIST.md)
- [X] Expense Record reusable monthly commitments — save a local bill template and apply it to an empty expense note with fresh IDs and every bill unpaid
- [ ] Expense Record currency selection — currently uses RM; consider storing a currency code per expense note and applying it consistently to table headers, totals, and Home/Folder summaries
- [ ] Reminder — plaintext with notification settings

### Additional / backlog (unphased)

- [X] Pin — already shipped free in Phase 1 scope; decide which tier it belongs to
- [ ] Coloring note
- [ ] Custom note background images — allow users to select, change, or remove a background image per note while preserving text readability and local-only storage
- [ ] View (list/grid?)
- [ ] Sort
- [ ] Trash (currently soft-delete with no trash UI)
- [ ] Archive

## Caveats (not bugs — document, don't "fix" silently)

- **Not secure storage.** Passwords gate access via hash comparison; note content is plaintext in the local DB. Not safe for genuinely sensitive data — see [README.md](../README.md#security).
- **Migration history.** App was originally built for Supabase (cloud + auth), migrated to local-only, and has now re-adopted Supabase — but only for account auth (Phase 2 of ROADMAP.md), not as a data store. Notes/folders remain local-only (SQLite/AsyncStorage); nothing about them syncs yet.
