# Project State — TODO

_Snapshot: 2026-08-28. Check off items as they land._

## Done

- [X] Create/open/delete folders (soft delete)
- [X] Create/open/delete notes, at root or inside a folder (soft delete)
- [X] Auto-saving note editor (debounced 800ms)
- [X] Password lock/unlock on folders and notes (SHA-256 gate). Locked notes share one LockNote password; folders retain their own individual passwords.
- [X] Require the shared LockNote password before deleting a locked note, or the individual folder password before deleting a locked folder, from lists or editors.
- [X] Local persistence — SQLite on iOS/Android, AsyncStorage on web
- [X] Bottom-tab navigation (Home, Settings) with pull-to-refresh
- [X] Home folder cards show a soft-delete-aware note count badge
- [X] Folder names can be renamed from Home actions or by tapping the editable title inside an open folder.
- [X] Expense-note cards show the grand total of daily entries plus checked monthly commitments on Home, search results, and inside folders.
- [X] Note, checklist, expense, and reminder editors provide session-based undo and redo for grouped text edits and individual editing actions, with restored state auto-saved normally and new edits clearing the redo stack.

## To do

### Incomplete / stubbed
- [X] Wire up search UI — Home has a search bar that queries `folderRepo.search()` + `noteRepo.search()` (added `folderRepo.search()` to both repos); results replace the default lists, password gating preserved
- [X] Settings backup export — creates a versioned, portable JSON file containing private/owned folders and notes, password hashes, pinned/archive state, note types, root-note relationships, and deletion tombstones. Incoming shared-note caches and account/collaboration identifiers are excluded.
- [X] Backup import/restore — selects and validates a LockNote JSON backup (including schema version, references, timestamps, password-hash shape, duplicates, and a 25 MB limit), previews its counts, and requires an explicit Merge or Replace choice. Merge uses ID/timestamp conflict handling; Replace resets private data while preserving Shared-with-me notes. Both paths preserve `folder_id = null`, soft deletes, and native/web repository parity.
- [X] Decide on `hardDelete()` — used by empty-draft cleanup and the Trash permanent-delete/30-day retention flows.
- [X] Clean up empty notes on editor exit — navigation now awaits the hard-delete before returning to Home/Folder, preventing its focus reload from racing and briefly retaining an untouched note. The same guarded exit flushes pending auto-saves for non-empty notes, with unmount cleanup as a fallback.

### Supabase (now active — not vestigial)
- [X] Revived for account auth (Phase 2 of ROADMAP.md). `src/services/supabaseClient.js` creates the client (AsyncStorage-backed session persistence); `src/context/AuthContext.js` exposes `useAuth()` app-wide.
- [X] Profile tab — `AuthScreen` (email/password sign up + sign in, one screen with a mode toggle) shown when logged out; `ProfileScreen` (email, member-since date, two-way Sync Notes action, Sign Out) shown when logged in.
- [X] Account password recovery — sign-in sends a Supabase reset email; `locknote://reset-password` opens an in-app new-password form.
- [X] Require matching password confirmation during registration and password reset.
- [X] Add stronger email and password validation — normalized lowercase emails, format checks, 8-character minimum for new passwords, confirmation matching, and field-level messages.
- [X] Add user-friendly network and Supabase configuration error handling.
- [X] Add automated authentication tests covering validation, errors, account and LockNote-password callbacks, redirects, and Supabase request wrappers.
- [X] Android forced-update baseline — release builds compare their native build
  code with a public read-only Supabase policy at startup/foreground, cache valid
  policy for up to 72 hours, and show a password-independent blocking update
  screen only when the remote kill switch and minimum build both require it.
- [ ] Verify registration, email confirmation, login persistence, password reset, and sign-out end-to-end on Android, iOS, and web. Android and iOS simulator binaries compile successfully on EAS; web production export and local HTTP runtime pass. Interactive cloud-device verification is blocked until EAS Simulator is enabled for the Expo account.
- [X] Email confirmation returns to `locknote://auth-confirm` on native and the corresponding app URL on web.
- [X] Sync Notes — manual two-way folder/note sync through the authenticated `sync_private_data` RPC, with RLS, last-write-wins timestamps, soft-delete tombstones, native/web repository parity, and per-account last-sync status. The migration still requires deployment and live multi-device verification; premium gating is not implemented.
- [ ] Automatic/background sync — serialize with manual sync and the editors' pending 800 ms saves; trigger a foreground sync after session restoration, app launch/resume, and connectivity recovery, then add best-effort OS background execution where supported. Queue retries while offline, avoid duplicate concurrent runs, surface the last successful sync/error, and never let a stale cloud snapshot overwrite a newer local edit.
- [X] Collaboration Release 1 — explicit per-note sharing by registered account email, Shared tab/local cache, owner share indicators, collaborator management, realtime refresh, last-editor footer, RLS, and revision-protected saves. Backend migration/function deployment and live two-account verification still require configured Supabase credentials.
- Private note content stays local unless the signed-in owner explicitly runs Sync Notes. LockNote does not end-to-end encrypt content before upload.

### Possible features
- [X] Dark mode — palette centralized in `src/theme.js` (`useTheme()` + `makeStyles(colors)`). Theme mode (`system` / `light` / `dark`) is set in Settings, persisted in AsyncStorage (`@locknote_theme`), shared via `ThemeProvider` context; `system` follows the OS via `useColorScheme`. `userInterfaceStyle` is `automatic`.
- [X] Shared LockNote password and email recovery — every locked note uses one local LockNote password, separate from the Supabase account password even if the user chooses the same text. Settings supports Old/New/Confirm password changes. Forgot Password sends a one-time Supabase email link to the account identity safely bound when the LockNote password is set or changed; the callback can replace the hash on all locked notes. The former app-wide Recovery PIN is removed because someone holding an unlocked device could set it themselves. Legacy per-note passwords remain usable and migrate after successful verification.
- [X] Cross-platform data portability — manual Sync Notes merges native SQLite and web AsyncStorage data through Supabase, while Settings can export/import a backend-independent LockNote JSON backup.
- [X] Pinning — `is_pinned` column added to both SQLite tables (migrated via guarded `ALTER TABLE`) and to the web AsyncStorage records. Pinned folders/notes sort first everywhere (lists + search). List actions open by long-press on native or three dots on web; editor actions use a three-dots menu.
- [X] Contextual list actions — notes can be locked/unlocked, pinned, moved between Home/folders, or soft-deleted; folders can be renamed, pinned, or soft-deleted together with their contained notes. Note action dialogs use the concise `Lock` / `Unlock` labels and verify the shared LockNote password before unlocking.
- [X] Archive — folder/note actions hide items from Home and search without deleting them. Settings → Archive has separate Folders and Notes sections and can open, restore, or move either type to Trash. Restoring a folder reveals its visible notes while individually archived notes remain archived. Folder containers are still permanently removed when moved to Trash, with all child notes retained in Trash as root notes. Archive state is preserved in backups and private sync.
- [X] PDF/image export — normal, checklist, expense, and reminder notes export normalized content on native and web. Native saves PNG files directly to the device gallery and writes PDFs to a folder selected through the system document picker, with sharing retained as a secondary action. Web downloads PNG images and opens an isolated note document for printing or saving as PDF.

## Roadmap

### Phase 1 — Offline (free) — shipped

- [X] Offline local storage
- [X] Folders
- [X] Notes
- [X] Set password (one shared password for note locks; individual folder passwords)
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
- [X] Portable backup export and import/restore for folders, private/owned notes, password hashes, pinned state, note types, root-note relationships, and deletion tombstones, with a versioned format, validation, preview, and explicit merge/replace confirmation. Reminder notification registrations are intentionally device-local; imported reminders are disabled.

### Phase 5 — Structure (not premium)

- [ ] Folder in folder (nesting)
- [ ] App icon & name change

### Phase 6 — Add menu and note types

When the user presses the Add button, let them choose one of these note types:

- [X] Add selection popup on both the Home and Folder Add buttons (unsupported types are clearly marked as coming soon)
- [X] Note — plaintext
- [X] Checklist — ordered checkbox items with drag-handle reordering, inline editing, progress, local autosave, list/search previews, pin/password/delete support, and PDF/image export
- [X] Expense Record — titled multi-row table with direct date/remark/amount entry, row add/delete/reorder controls, total, local persistence, list summaries, password/pin support, and 800 ms autosave
- [X] Expense Record monthly summaries — named categories support multiple case-insensitive remark keywords with automatically updated totals, same-name updates, and one shared auto-saved summary note
- [X] Expense Record monthly commitments checklist — Option C paid-status section with progress, remaining amount, add/edit/reset, drag reorder, recycle-bin delete, version 6 persistence, and exports. See [MONTHLY_EXPENSE_CHECKLIST.md](MONTHLY_EXPENSE_CHECKLIST.md)
- [X] Expense Record reusable monthly commitments — save a local bill template and apply it to an empty expense note with fresh IDs and every bill unpaid
- [X] Expense Record currency selection — Settings provides a searchable selector containing all 178 current ISO 4217 Currency & Funds codes, stores the default for new notes (USD/$ initially), and prompts whether a change should also update all existing private/owned expense notes without converting amounts. Each note keeps its own currency code, which can also be changed from the amount-column header and is consistently applied to summaries, Home/Folder cards, and exports.
- [X] Reminder — plaintext note body with one-time/daily/weekly/monthly local notification settings, list previews, Undo, pin/password/delete handling, notification-tap navigation with password gating, and PDF/image export

### Additional / backlog (unphased)

- [X] Pin — already shipped free in Phase 1 scope; decide which tier it belongs to
- [X] Coloring note — notes can use Default, Rose, Orange, Yellow, Green, Blue, or Purple from list actions and every editor. Semantic colors adapt to light/dark mode and are saved only as a per-device AsyncStorage preference; they are excluded from note rows, backup, private sync, and collaboration.
- [ ] Custom note background images — allow users to select, change, or remove a background image per note while preserving text readability and local-only storage
- [X] View controls — Home independently persists Folder List/Strip and Note List/Grid choices. Search results follow their section setting, notes inside folders inherit the Notes choice, and the former combined preference migrates automatically. Mobile contextual actions use long-press, while web retains visible three-dot controls.
- [ ] Sort
- [X] Trash — Settings lists soft-deleted notes only, with Restore and password-gated Delete forever inside each row's three-dots menu. Folders are deleted permanently while their notes move to Trash as Home notes. Empty Trash safely removes unlocked notes, and local note content is purged after 30 days at startup or when Trash opens.
- [X] Archive — Settings module for folders and notes with open, restore, and Move to Trash actions; folder archiving preserves each child note's independent archive state.

## Caveats (not bugs — document, don't "fix" silently)

- **Not secure storage.** Passwords gate access via hash comparison; note content is plaintext in the local DB. Not safe for genuinely sensitive data — see [README.md](../README.md#security).
- **Account and LockNote passwords.** They are separate credentials and changing one never changes the other. A user may choose identical text, but LockNote stores and verifies its local gate independently. Email recovery requires the exact Supabase account identity linked when the LockNote password was set or changed.
- **Sync security.** Local storage remains the offline source used by screens. Manual account sync stores note/folder data in owner-scoped Supabase tables protected by RLS, but LockNote does not end-to-end encrypt note content before upload.
- **Backup security.** Portable JSON backups contain plaintext note content and SHA-256 access-gate hashes; they are not encrypted. Incoming shared-note caches, collaboration/account identifiers, and device notification IDs are not included.
