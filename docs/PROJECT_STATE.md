# Project State — TODO

_Snapshot: 2026-09-19. Check off items as they land._

This records repository implementation, not confirmation that remote migrations,
SMTP, store products or physical-device tests are complete. Configuration and
parked Git cleanup live in [TODO.md](../TODO.md); use the [documentation index](README.md)
and [test plan](testing/TEST_PLAN.md) for operational acceptance.

## Done

- [X] Complete sharing suspension without subscription — when the owner has no active Plus/Pro plan, recipients cannot view/edit/export/download shared notes or images. Shared lists omit suspended notes, and all four editors hide cached content until authorization resolves and at known expiry, including slow requests, offline/sign-out and account changes. Local pending save timers/staged recipient drafts are cancelled on denial. Server RLS, list/get/save RPCs and attachment access enforce suspension; owner local notes and management/recovery access remain intact. Memberships and hidden caches are retained for renewal; Pro-to-Plus sharing stays active. Apply `202609180001_shared_note_subscription_visibility.sql` before releasing; live backend/two-device verification remains required.

- [X] Background downgrade policy — custom backgrounds are hidden without active Pro in all four editors, note cards and background settings previews, with normal theme/note-colour surfaces restored. Device-local images and preferences are retained (no downgrade deletion) and reappear when Pro is restored. Remove background stays available on Free/Plus. Stored draft metadata, backup/sync exclusions and native/web storage remain unchanged.

- [X] Plan-aware premium control visibility — all four editor menus and category transaction export hide unavailable paid actions. Free hides normal PDF/image Export and Share; Plus adds those, while Pro adds Insert images, background selection/change and subfolder creation. Home/Folder background actions follow the same rules. Existing backgrounds retain Remove background; existing shares retain Manage access (remove/leave, no new invitations or role changes on Free). Empty subfolder sections disappear without Pro, but existing child folders stay visible for read-only recovery/move-out; note creation in subfolders is hidden without Pro. Existing premium content retains its export recovery exception, and incoming shared-note image insertion follows the owner's verified Pro plan and editor/lease permissions. No data is deleted and action/server gates remain in place.

- [X] Subscription pricing updated to USD — Plus $1.99/month or $19.99/year; Pro $3.99/month or $39.99/year; Free $0. App labels use $ instead of US$, including live store USD price strings; other currency labels and checkout amounts are unchanged. Monthly fallback labels and pricing/setup documents match. Live localized store prices remain authoritative; store price configuration and yearly checkout/packages remain pending.

- [X] Pro subfolder editing policy — existing folders and notes stay visible after expiry/downgrade, but plain, checklist, expense and reminder notes inside subfolders become read-only without Pro. Editors explain the restriction and offer Move note; moving to Home/top-level folders or moving the whole subfolder to Home restores editing. Nothing moves automatically. Creating notes/moving notes into subfolders requires Pro; pending Pro auto-saves may finish, exports/import/sync recovery remain available, and bulk currency changes skip read-only records. Renewing Pro restores editing; incoming shared-note access remains owner-funded.

- [X] Premium Proposal 2 enforcement — Plus/Pro export and owner sharing; Pro image additions/cloud uploads, background changes and one-layer nested-folder organization. Existing premium content remains readable and locally exportable after downgrade; owners can keep editing local shared drafts outside subfolders while remote collaboration pauses. Free invitees are funded by the owner's plan. Server-owned subscriptions, authenticated canonical RevenueCat webhook, 25/75/750 MB combined quotas, serialized upload reservations, usage display and no-upload recovery are implemented. Deployment, secret configuration, existing-subscriber backfill and live payment/device verification remain pending; opt-in automatic/background folder/note sync is now implemented.

- [X] Create/open/move/delete nested folders. Folders support one subfolder layer (Home → folder → subfolder) with cycle-safe subtree moves, breadcrumbs, descendant note counts, and recursive deletion. Subfolder screens omit the Folders section entirely.
- [X] Create/open/delete notes, at root or inside a folder (soft delete)
- [X] Auto-saving note editor (debounced 800ms)
- [X] Password lock/unlock on folders and notes (SHA-256 gate). Locked notes share one LockNote password; folders retain their own individual passwords.
- [X] Require the shared LockNote password before deleting a locked note, or the individual folder password before deleting a locked folder, from lists or editors.
- [X] Local persistence — SQLite on iOS/Android, AsyncStorage on web
- [X] Five bottom tabs (Home, Shared, Premium, Settings, Profile); data lists retain focus reloads and applicable pull-to-refresh.
- [X] Home folder cards show a soft-delete-aware note count badge
- [X] Folder names can be renamed from Home actions or by tapping the editable title inside an open folder.
- [X] Expense-note cards show the grand total of daily entries plus checked monthly commitments on Home, search results, and inside folders.
- [X] Note, checklist, expense, and reminder editors provide session-based undo and redo for grouped text edits and individual editing actions, with restored state auto-saved normally and new edits clearing the redo stack.
- [X] Existing plain-note bodies and reminder descriptions open in preview mode so scrolling does not place a cursor or open the keyboard. Double-tapping the content activates editing and focuses the selected text area; screen-reader activation remains supported. Newly created plain-note drafts instead open with an editable body, so a single tap can place the cursor without forcing the keyboard on creation.

## To do

### Incomplete / stubbed
- [X] Wire up search UI — Home has a search bar that queries `folderRepo.search()` + `noteRepo.search()` (added `folderRepo.search()` to both repos); results replace the default lists, password gating preserved
- [X] Backup export service — creates versioned JSON for private/owned records, hash gates, pin/archive/type/root relationships and tombstones. Incoming caches, account IDs and binary media are excluded. The Settings Export Backup action is currently hidden; Import Backup remains visible.
- [ ] Decide whether to restore the Settings Export Backup action; do not advertise it as visible until that change is approved and implemented.
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
- [X] Add a device-persistent 120-second email cooldown per normalized address for signup confirmation, account-password reset, and LockNote-password reset. Local Supabase is configured for the same 120-second minimum and 30 authentication emails per hour project-wide; the hosted project still requires matching Dashboard configuration.
- [X] Android/iOS forced-update baseline — native builds compare their platform
  build number with a public read-only Supabase policy at startup/foreground,
  cache valid policies separately per platform for up to 72 hours, and show a
  password-independent blocking update screen only when the remote kill switch
  and minimum build both require it. Web intentionally remains unblocked.
- [ ] Verify registration, confirmation, session persistence, both recovery flows and sign-out on actual release candidates. Earlier build/export checks are historical evidence, not current acceptance. Local Android/physical-device testing does not require EAS Simulator; verify iOS before releasing it and retain web regressions.
- [X] Email confirmation returns to `locknote://auth-confirm` on native and the corresponding app URL on web.
- [ ] Configure production authentication email branding before public release:
  - Supabase's default email service is acceptable during development, but its sender or content may expose Supabase branding.
  - Setup direction: connect the hosted project to a verified sender via Custom SMTP. See [Mobile Low-Budget Plan](decisions/MOBILE_LOW_BUDGET.md) for dated official pricing references; do not treat an old provider quota as permanent.
  - A domain is required for the email sender identity and deliverability, not to host the mobile app or a website. Use a dedicated sending subdomain such as `auth.example.com` and a sender such as `LockNote <no-reply@auth.example.com>`.
  - Add the SPF and DKIM DNS records supplied by the SMTP provider. Add DMARC when the sending domain is ready for production.
  - In Supabase Dashboard, customize the Confirm signup, account-password recovery, LockNote-password recovery, and email-change templates so their subjects and content say LockNote. Preserve Supabase template variables such as `{{ .ConfirmationURL }}` so existing deep-link callbacks continue to work.
  - Custom SMTP controls sender identity/delivery; Email Templates control subjects/content. Template editing and SMTP configuration are separate tasks; test both rather than assuming SMTP is what enables template editing.
- [X] Sync Notes — manual two-way folder/note sync through the authenticated `sync_private_data` RPC, with RLS, last-write-wins timestamps, soft-delete tombstones, native/web repository parity, and per-account last-sync status. Proposal 2 server quotas are implemented: 25 MB Free, 75 MB Plus, 750 MB Pro combined notes/images. Over-quota sync falls back to no-upload recovery and preserves newer local changes. Deployment and live multi-device verification remain pending.
- [X] Automatic/background folder/note sync — per-device/account Profile opt-in for Plus/Pro, launch/resume/reconnect/editor-close triggers and a 60-second idle foreground interval; durable offline snapshots, capped exponential retries, one manual/automatic/recovery queue, editor/final-save deferral, original-account Authorization and stale-response guards, fresh server plan/expiry checks and visible last-success/retry/paused status. SDK 54 native tasks use a best-effort 15-minute minimum; web/Expo Go/old APKs fall back to foreground synchronization. Binary images retain open-note/manual sync. Tests pass; new native builds and live two-device/OS-scheduled verification remain required. See [Background Sync](BACKGROUND_SYNC.md).
- [X] Collaboration Release 1 — explicit sharing by registered email, View only/Can edit roles, owner indicators, collaborator management, realtime refresh, last-editor footer, RLS, revision-protected saves and renewable 90-second leases. Shared-with-me notes remain hidden offline. Proposal 2 now requires Plus/Pro for the owner; invited collaborators only need Free. Expired owner plans pause remote saves/leases/invitations while owned local drafts remain editable and pending. Migrations, webhook setup and live two-account verification still require deployment/configured credentials.
- Private note content stays local unless the owner runs Sync Notes or explicitly enables Automatic Sync. LockNote does not end-to-end encrypt content before upload.

### Possible features
- [X] Premium purchase module — RevenueCat Current offering, localized prices, account-linked Plus/Pro checkout, restore, provider management and offline legal pages. Proposal 2 feature gates, usage display, no-upload recovery, server-owned entitlements, canonical webhook and quota/expiry enforcement are implemented. Native payments require a development/store build; Expo Go supports Test Store. Store products/public SDK keys, backend deployment/webhook secrets, subscriber backfill, public legal pages and final legal/operator details remain setup work. See [Subscription Plans](decisions/SUBSCRIPTION_PLANS.md) and [Subscription Payment Setup](decisions/SUBSCRIPTION_SETUP.md).
- [X] Plus-to-Pro store upgrade — paid Plus users can start the Pro purchase directly. Android supplies the active Plus product with `WITH_TIME_PRORATION`; Apple relies on the shared subscription group and Pro's higher service level. The store calculates and confirms the exact credit and charge. Pro-to-Plus changes remain in store subscription management.
- [X] Dark mode — palette centralized in `src/theme.js` (`useTheme()` + `makeStyles(colors)`). Theme mode (`system` / `light` / `dark`) is set in Settings, persisted in AsyncStorage (`@locknote_theme`), shared via `ThemeProvider` context; `system` follows the OS via `useColorScheme`. `userInterfaceStyle` is `automatic`.
- [X] Shared LockNote password and email recovery — every locked note uses one local LockNote password, separate from the Supabase account password even if the user chooses the same text. Settings supports Old/New/Confirm password changes. Forgot Password sends a one-time Supabase email link to the account identity safely bound when the LockNote password is set or changed; the callback can replace the hash on all locked notes. The former app-wide Recovery PIN is removed because someone holding an unlocked device could set it themselves. Legacy per-note passwords remain usable and migrate after successful verification.
- [X] Cross-platform portability — manual sync merges native/web records via Supabase; portable JSON export/import services are backend-independent. Import is visible in Settings; Export Backup is currently hidden.
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

### Phase 2 — LockNote Plus — $1.99/month; $19.99/year target (annual checkout pending)

- [X] Login — Profile tab with real Supabase Auth (email/password sign up + sign in, session persisted via AsyncStorage). Account login remains Free.
- [X] Sync DB — Profile pushes/pulls private/owned notes and folders through account-scoped Supabase RPCs. Deletions and root-note semantics are preserved. Proposal 2 server enforcement implements 25 MB Free, 75 MB Plus and 750 MB Pro combined notes/images, with read-only recovery above the limit.
- [X] Multi-device login — manual Sync Notes remains Free; verified Plus/Pro accounts can opt into automatic folder/note synchronization on each device.
- [X] Automatic/background sync — foreground triggers, offline retries and best-effort native scheduling implemented; live device verification remains pending. See [Background Sync](BACKGROUND_SYNC.md).
- [X] Searchable — remains a Free offline feature.

### Phase 3 — LockNote Pro — $3.99/month; $39.99/year target (annual checkout pending)

- [X] Plain-note inline images — up to 20 per note, source ≤5 MB optimized <1 MB, native/web local storage, text anchors, wrapping rows, drag/resizing, Undo/Redo, export and optional reconciliation. Pro gates additions/cloud writes; retained owner images stay recoverable. Deploy migrations through `202609180001_shared_note_subscription_visibility.sql` and configure verified subscriptions before cloud writes; automatic record sync does not transfer binaries.
- [ ] Optional cloud sync for local custom note backgrounds.

### Phase 4 — Export

- [X] Export PDF & image - note and expense editors provide a preview, native Gallery/Documents saving, and optional sharing; web prints/saves PDF and downloads PNG locally. Expense exports include saved monthly categories, categorized total, and the shared summary note. A saved category's View transactions dialog can export its matching rows separately, with the device's current month/year automatically shown in the preview, PDF/image, and filename (the rows themselves store day only).
- [X] Portable backup export and import/restore for folders, private/owned notes, password hashes, pinned state, note types, root-note relationships, and deletion tombstones, with a versioned format, validation, preview, and explicit merge/replace confirmation. Reminder notification registrations are intentionally device-local; imported reminders are disabled.

### Phase 5 — Structure (nested-folder organization is Pro under Proposal 2)

- [X] Folder in folder (one subfolder layer) — nullable `parent_id` is supported by native SQLite, web AsyncStorage, backup schema v2, and private sync. Version-1 backups import folders at Home; the Supabase nesting migration still requires deployment.
- [X] App icon & name change

### Phase 6 — Add menu and note types

When the user presses the Add button, let them choose one of these note types:

- [X] Add selection popup on Home/Folder with all four implemented types: plain, checklist, expense and reminder.
- [X] Note — plaintext
- [X] Checklist — ordered checkbox items with drag-handle reordering, inline editing, progress, local autosave, list/search previews, pin/password/delete support, PDF/image export, and a 100-active-item limit that preserves legacy oversized lists
- [X] Checklist and expense-row/bill drag auto-scroll measures the FlatList's actual scroll viewport, waits for valid bounds, and uses only the finger's top/bottom edge position (not row height). Narrower zones, a short edge hold, and capped progressive speed prevent unintended downward scrolling and allow reversing upward; moving to the middle or hovering over Trash stops auto-scroll.
- [X] Expense Record — titled multi-row table with direct date/remark/amount entry, row add/delete/reorder controls, total, local persistence, list summaries, password/pin support, and 800 ms autosave
- [X] Expense Record monthly summaries — named categories support multiple case-insensitive remark keywords with automatically updated totals, same-name updates, and one shared auto-saved summary note
- [X] Expense Record monthly commitments checklist — Option C paid-status section with progress, remaining amount, add/edit/reset, drag reorder, recycle-bin delete, version 6 persistence, and exports. See [MONTHLY_EXPENSE_CHECKLIST.md](decisions/MONTHLY_EXPENSE_CHECKLIST.md)
- [X] Expense Record reusable monthly commitments — save a local bill template and apply it to an empty Expense Record with fresh IDs and every bill unpaid
- [X] Expense Record currency selection — Settings provides a searchable selector containing all 178 current ISO 4217 Currency & Funds codes, stores the default for new Expense Records (USD/$ initially), and prompts whether a change should also update all existing private/owned Expense Records without converting amounts. Each record keeps its own currency code, which can also be changed from the amount-column header and is consistently applied to summaries, Home/Folder cards, and exports.
- [X] Reminder — plaintext note body with a 5,000-character limit, one-time/daily/weekly/monthly local notification settings, list previews, Undo, pin/password/delete handling, notification-tap navigation with password gating, and PDF/image export

### Additional / backlog (unphased)

- [X] Pin — Free offline feature for folders and notes.
- [X] Coloring note — notes can use Default, Rose, Orange, Yellow, Green, Blue, or Purple from list actions and every editor. Semantic colors adapt to light/dark mode and are saved only as a per-device AsyncStorage preference; they are excluded from note rows, backup, private sync, and collaboration.
- [X] Custom note background images — every note type can select, change, or remove one image (maximum 10 MB) from its editor or Home/Folder note actions. Native copies the image into app document storage; web stores it in IndexedDB. A theme-aware translucent overlay preserves readability, cards show the background, delete cleanup removes managed files, and the preference remains device-local outside note rows, backup, private sync, and collaboration.
- [X] View controls — Home independently persists Folder List/Strip and Note List/Grid choices. Search results follow their section setting, notes inside folders inherit the Notes choice, and the former combined preference migrates automatically. Mobile contextual actions use long-press, while web retains visible three-dot controls.
- [X] Trash — Settings lists deleted notes with Restore/password-gated Delete forever. Deleted folder containers do not appear in Trash; descendant notes become deleted Home notes. Local folder/note tombstones preserve removals during sync. Empty Trash removes unlocked notes; 30-day maintenance purges local note content.
- [X] Editable database/application diagrams in `docs/diagrams/`, with a regeneration script and structural validation. They describe local source/migrations, not a queried production database.
- [X] Archive — Settings module for folders and notes with open, restore, and Move to Trash actions; folder archiving preserves each child note's independent archive state.

## Caveats (not bugs — document, don't "fix" silently)

- **Not secure storage.** Passwords gate access via hash comparison; note content is plaintext in the local DB. Not safe for genuinely sensitive data — see [README.md](../README.md#security).
- **Account and LockNote passwords.** They are separate credentials and changing one never changes the other. A user may choose identical text, but LockNote stores and verifies its local gate independently. Email recovery requires the exact Supabase account identity linked when the LockNote password was set or changed.
- **Sync security.** Local storage remains the offline source used by screens. Manual account sync stores note/folder data in owner-scoped Supabase tables protected by RLS, but LockNote does not end-to-end encrypt note content before upload.
- **Backup security.** Portable JSON backups contain plaintext note content and SHA-256 access-gate hashes; they are not encrypted. Incoming shared-note caches, collaboration/account identifiers, and device notification IDs are not included.
