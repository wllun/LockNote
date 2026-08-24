# Project State — TODO

_Snapshot: 2026-08-24. Check off items as they land._

## Done

- [X] Create/open/delete folders (soft delete)
- [X] Create/open/delete notes, at root or inside a folder (soft delete)
- [X] Auto-saving note editor (debounced 800ms)
- [X] Password lock/unlock on folders and notes (SHA-256 gate)
- [X] Require the item password before deleting a locked note or locked folder from lists or editors.
- [X] Local persistence — SQLite on iOS/Android, AsyncStorage on web
- [X] Bottom-tab navigation (Home, Settings) with pull-to-refresh
- [X] Home folder cards show a soft-delete-aware note count badge
- [X] Folder names can be renamed from Home actions or by tapping the editable title inside an open folder.
- [X] Expense-note cards show the grand total of daily entries plus checked monthly commitments on Home, search results, and inside folders.
- [X] Note, checklist, expense, and reminder editors provide session-based undo for grouped text edits and individual editing actions, with restored state auto-saved normally.

## To do

### Incomplete / stubbed
- [X] Wire up search UI — Home has a search bar that queries `folderRepo.search()` + `noteRepo.search()` (added `folderRepo.search()` to both repos); results replace the default lists, password gating preserved
- [ ] Implement **Settings → Backup Data** as a versioned, portable file export for folders, notes, password hashes, pin state, note types, root-note relationships, and soft-delete metadata. It is currently labeled "Coming soon" with no handler.
- [ ] Implement backup import/restore — select a LockNote backup file, validate its format and schema version before writing, preview folder/note counts, require confirmation, and merge by ID/timestamp without breaking `folder_id = null`, soft deletes, password hashes, or native/web repository parity. Do not silently replace existing data.
- [X] Decide on `hardDelete()` — now called by the editor's empty-note cleanup on exit; no user-facing "permanently delete" flow (not needed)
- [X] Clean up empty notes on editor exit (editor hard-deletes the row on unmount if title, content, and password are all empty; also flushes a pending auto-save on exit)

### Supabase (now active — not vestigial)
- [X] Revived for account auth (Phase 2 of ROADMAP.md). `src/services/supabaseClient.js` creates the client (AsyncStorage-backed session persistence); `src/context/AuthContext.js` exposes `useAuth()` app-wide.
- [X] Profile tab — `AuthScreen` (email/password sign up + sign in, one screen with a mode toggle) shown when logged out; `ProfileScreen` (email, member-since date, two-way Sync Notes action, Sign Out) shown when logged in.
- [X] Account password recovery — sign-in sends a Supabase reset email; `locknote://reset-password` opens an in-app new-password form.
- [X] Require matching password confirmation during registration and password reset.
- [X] Add stronger email and password validation — normalized lowercase emails, format checks, 8-character minimum for new passwords, confirmation matching, and field-level messages.
- [X] Add user-friendly network and Supabase configuration error handling.
- [X] Add automated authentication tests (17 cases covering validation, errors, callbacks, redirects, and Supabase request wrappers).
- [ ] Verify registration, email confirmation, login persistence, password reset, and sign-out end-to-end on Android, iOS, and web. Android and iOS simulator binaries compile successfully on EAS; web production export and local HTTP runtime pass. Interactive cloud-device verification is blocked until EAS Simulator is enabled for the Expo account.
- [X] Email confirmation returns to `locknote://auth-confirm` on native and the corresponding app URL on web.
- [X] Sync Notes — manual two-way folder/note sync through the authenticated `sync_private_data` RPC, with RLS, last-write-wins timestamps, soft-delete tombstones, native/web repository parity, and per-account last-sync status. The migration still requires deployment and live multi-device verification; premium gating is not implemented.
- [ ] Automatic/background sync — serialize with manual sync and the editors' pending 800 ms saves; trigger a foreground sync after session restoration, app launch/resume, and connectivity recovery, then add best-effort OS background execution where supported. Queue retries while offline, avoid duplicate concurrent runs, surface the last successful sync/error, and never let a stale cloud snapshot overwrite a newer local edit.
- [X] Collaboration Release 1 — explicit per-note sharing by registered account email, Shared tab/local cache, owner share indicators, collaborator management, realtime refresh, last-editor footer, RLS, and revision-protected saves. Backend migration/function deployment and live two-account verification still require configured Supabase credentials.
- Private note content stays local unless the signed-in owner explicitly runs Sync Notes. LockNote does not end-to-end encrypt content before upload.

### Possible features
- [X] Dark mode — palette centralized in `src/theme.js` (`useTheme()` + `makeStyles(colors)`). Theme mode (`system` / `light` / `dark`) is set in Settings, persisted in AsyncStorage (`@locknote_theme`), shared via `ThemeProvider` context; `system` follows the OS via `useColorScheme`. `userInterfaceStyle` is `automatic`.
- [X] Password recovery/reset — an app-wide recovery PIN (Settings → Security), persisted in AsyncStorage via `src/utils/recovery.js`, hashed with the same SHA-256 helper as item passwords. `PasswordModal` gets a "Forgot password?" link that verifies the PIN and clears the item's password. Note: this resets the gate, it does not recover the original password (impossible from a hash) — consistent with the "gating, not encryption" model.
- [X] Cross-platform account portability — manual Sync Notes merges native SQLite and web AsyncStorage data through Supabase. File-based backup/export remains separate work.
- [X] Pinning — `is_pinned` column added to both SQLite tables (migrated via guarded `ALTER TABLE`) and to the web AsyncStorage records. Pinned folders/notes sort first everywhere (lists + search). List actions open by long-press on native or three dots on web; editor actions use a three-dots menu.
- [X] Contextual list actions — notes can be pinned, moved between Home/folders, or soft-deleted; folders can be renamed, pinned, or soft-deleted together with their contained notes.
- [X] PDF/image export — normal, checklist, expense, and reminder notes export normalized content on native and web. Native saves PNG files directly to the device gallery and writes PDFs to a folder selected through the system document picker, with sharing retained as a secondary action. Web downloads PNG images and opens an isolated note document for printing or saving as PDF.

## Roadmap

### Phase 1 — Offline (free) — shipped

- [X] Offline local storage
- [X] Folders
- [X] Notes
- [X] Set password (folder/note lock)
- [X] Theme mode (light/dark, plus system)

### Phase 2 — Cloud — premium, RM4.90/month

- [X] Login — Profile tab with real Supabase Auth (email/password sign up + sign in, session persisted via AsyncStorage). No premium gating yet — anyone can create an account.
- [X] Sync DB — Profile screen pushes and pulls private/owned notes and folders through an account-scoped Supabase RPC. Deletions and root-note semantics are preserved.
- [X] Multi-device login — after signing in, running Sync Notes merges that device with the account snapshot. Automatic background sync is not implemented.
- [ ] Automatic/background sync — add lifecycle/network-triggered foreground sync first, followed by best-effort platform background execution with safe retry and conflict handling.
- [X] Searchable — already shipped free in Phase 1 (Home search bar); decide whether to keep it free or gate it behind Phase 2

### Phase 3 — Attachments — premium pro, RM9.99/month

- [ ] Image attachment

### Phase 4 — Export

- [X] Export PDF & image - note and expense editors provide a preview, native Gallery/Documents saving, and optional sharing; web prints/saves PDF and downloads PNG locally. Expense exports include saved monthly categories, categorized total, and the shared summary note.
- [ ] Portable backup export and import/restore for the complete LockNote data model, with a versioned format, validation, preview, and explicit merge/replace confirmation.

### Phase 5 — Structure (not premium)

- [ ] Folder in folder (nesting)
- [ ] App icon & name change

### Phase 6 — Add menu and note types

When the user presses the Add button, let them choose one of these note types:

- [X] Add selection popup on both the Home and Folder Add buttons (unsupported types are clearly marked as coming soon)
- [ ] Note — plaintext
- [X] Checklist — ordered checkbox items with drag-handle reordering, inline editing, progress, local autosave, list/search previews, pin/password/delete support, and PDF/image export
- [X] Expense Record — titled multi-row table with direct date/remark/amount entry, row add/delete/reorder controls, total, local persistence, list summaries, password/pin support, and 800 ms autosave
- [X] Expense Record monthly summaries — named categories support multiple case-insensitive remark keywords with automatically updated totals, same-name updates, and one shared auto-saved summary note
- [X] Expense Record monthly commitments checklist — Option C paid-status section with progress, remaining amount, add/edit/reset, drag reorder, recycle-bin delete, version 5 persistence, and exports. See [MONTHLY_EXPENSE_CHECKLIST.md](MONTHLY_EXPENSE_CHECKLIST.md)
- [X] Expense Record reusable monthly commitments — save a local bill template and apply it to an empty expense note with fresh IDs and every bill unpaid
- [ ] Expense Record currency selection — currently uses RM; consider storing a currency code per expense note and applying it consistently to table headers, totals, and Home/Folder summaries
- [X] Reminder — plaintext note body with one-time/daily/weekly/monthly local notification settings, list previews, Undo, pin/password/delete handling, and PDF/image export

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
- **Sync security.** Local storage remains the offline source used by screens. Manual account sync stores note/folder data in owner-scoped Supabase tables protected by RLS, but LockNote does not end-to-end encrypt note content before upload.
