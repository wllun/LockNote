# LockNote Roadmap

_Snapshot: 2026-09-19. Current app version: 1.1.0._

This file describes the product direction and major delivery phases. For detailed implementation status and technical caveats, see [PROJECT_STATE.md](PROJECT_STATE.md). For the current architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Product direction

- LockNote remains offline-first: local storage is authoritative while editing, and core note features work without an account.
- Cloud features are opt-in. Private data uploads when a user runs Sync Notes or enables Plus/Pro Automatic Sync; shared notes use the collaboration backend.
- Account login, local portable backup, manual multi-device sync, and 25 MB of cloud storage remain Free. LockNote Plus targets export, collaboration, automatic sync, and 75 MB of cloud storage. LockNote Pro targets 750 MB of combined note-and-image storage plus image attachments, note backgrounds, and nested folders.
- Monthly Plus/Pro checkout is implemented through RevenueCat. USD targets are Plus $1.99/month or $19.99/year and Pro $3.99/month or $39.99/year; annual checkout is not implemented. Localized store prices remain authoritative. Client gates, server quotas and downgrade/recovery are implemented; store keys/products, webhook deployment and production testing remain setup work.
- Expiry never deletes notes. Home/top-level notes remain editable; subfolder notes are read-only without Pro and retained backgrounds are hidden. Automatic sync pauses; sharing recipients lose access when the owner lacks Plus/Pro. Owners retain permitted local/recovery access.
- Password protection is an access gate, not encryption. Local and synchronized note content is not end-to-end encrypted.

## Current priority — production readiness

- [ ] Deploy/verify migrations through `202609180001_shared_note_subscription_visibility.sql`, `share-note` and `revenuecat-webhook`; configure server secrets and backfill canonical paid subscribers before a live rollout.
- [ ] Verify registration, email confirmation, session persistence, account-password recovery, LockNote-password recovery, and sign-out end-to-end on Android, iOS, and web.
- [ ] Verify manual private sync on at least two physical devices, including edits, moves, root notes, archives, and soft-delete tombstones.
- [ ] Verify opt-in automatic sync on two devices, offline/reconnect, editor deferral, opt-out/account changes, expiry/quota recovery and Android/iOS OS-scheduled tasks in new native builds. See [Background Sync](BACKGROUND_SYNC.md).
- [ ] Verify collaboration with two real accounts, including Can edit/View only invitations, one-editor leases and expiry, offline Shared-tab hiding, permission changes while an editor is open, member removal, realtime refresh, and revision conflicts.
- [ ] Configure production authentication email branding:
  - Connect Supabase Auth to a verified Custom SMTP sender. Provider costs/limits are a dated planning snapshot in [Mobile Low-Budget Plan](decisions/MOBILE_LOW_BUDGET.md); recheck them before launch.
  - Use a dedicated sender subdomain such as `auth.example.com` and `LockNote <no-reply@auth.example.com>`. The domain identifies the email sender; it does not require LockNote to have a website.
  - Configure SPF and DKIM, then add DMARC for production.
  - Brand the signup-confirmation, account-password recovery, LockNote-password recovery, and email-change templates while preserving variables such as `{{ .ConfirmationURL }}`.
- [ ] Test the Android and iOS forced-update policies with older store builds before relying on them for a public rollout.
- [X] Define the planned Free, LockNote Plus, and LockNote Pro boundaries and non-destructive expiry policy in [Subscription Plans](decisions/SUBSCRIPTION_PLANS.md).
- [X] Implement the client payment lifecycle: identified checkout, verified RevenueCat entitlement status, restore purchases, subscription management, foreground refresh, and localized pricing.
- [ ] Configure and validate RevenueCat plus Apple/Google/web products by following [Subscription Payment Setup](decisions/SUBSCRIPTION_SETUP.md).
- [X] Implement server-owned entitlements, serialized quota enforcement, upload reservations, owner-funded sharing and non-destructive downgrade/recovery.
- [ ] Verify these implemented restrictions against the deployed sandbox, including older clients; they are not globally disabled in current code.

## Phase 1 — Offline core (free) — shipped

- [X] SQLite storage on Android/iOS and AsyncStorage storage on web.
- [X] Root notes and folders, including rename, move, pin, archive, Trash, soft deletion, restoration, and 30-day cleanup.
- [X] Shared LockNote password for locked notes and individual passwords for locked folders.
- [X] Home search across folders and notes.
- [X] System, light, and dark themes.
- [X] Per-device semantic note colors.
- [X] Independent Folder List/Strip and Note List/Grid controls.
- [X] Context actions through long press on native and three-dot menus on web.
- [X] Portable JSON backup export and validated Merge/Replace restore.
- [X] Account registration, login, and recovery access remain Free.

## Phase 2 — Accounts, cloud sync, and collaboration — implemented; live verification pending

### Implemented

- [X] Supabase email/password registration and sign-in with persisted sessions.
- [X] Email-confirmation and password-recovery deep links on native and web.
- [X] Manual two-way private folder/note sync with row-level security, last-write-wins timestamps, root-note preservation, and deletion tombstones.
- [X] Multi-device data transfer through an explicit Sync Notes action after signing in.
- [X] Collaboration Release 1: share individual notes by registered email with per-recipient Can edit/View only access, manage collaborators, display Shared-with-me notes, refresh through Realtime, reject viewer writes, and reject stale-revision saves.
- [X] Android/iOS forced-update baseline driven by platform-specific public read-only Supabase policies; web remains exempt.

### Automatic-sync implementation and remaining verification

- [ ] Complete the production verification tasks listed above.
- [X] Opt-in Plus/Pro automatic folder/note sync after session restoration, app resume, reconnect and editor closure, with a 60-second idle interval.
- [X] Durable offline retries and one manual/automatic/recovery queue; defer during open editors and their final saves and reject stale-account responses.
- [X] Best-effort OS background tasks with a 15-minute minimum; new native builds and live OS/device testing remain required. Web/Expo Go use foreground sync only.
- [X] Profile last-success and automatic retry/error/editor/offline/plan/quota states.
- [X] Implement 25/75/750 MiB quotas (displayed as MB), read-only over-quota recovery and owner-funded collaboration.
- [ ] Complete live quota, subscription expiry and two-account suspension/renewal verification.

## Phase 3 — Attachments — implemented with Pro gates; live verification pending

- [X] Add up to 20 images to plain notes at the current text cursor, with text continuing below each image.
- [X] Accept source images up to 5 MB and resize/compress saved JPEGs to strictly below 1 MB.
- [X] Implement native/web local storage, cursor-anchor persistence, one-second long-press drag/drop, proportional display resizing, inline Undo/Redo and export rendering, cloud upload/download reconciliation, shared-note role checks, and local deletion cleanup.
- [X] Enforce 20 images per plain note and the plan-aware 750 MB combined Pro quota; the premium migration supersedes the earlier 2 GB technical cap. Local JSON backups exclude binary media.
- [X] Queue offline cloud-image deletions and retry them on the next signed-in attachment sync.
- [X] Add a follow-up migration that upgrades already-deployed gallery metadata to inline character-offset anchors.
- [X] Add a follow-up migration for synchronized proportional image display widths.
- [X] Implement Pro image/background/nesting gates and downgrade preservation.
- [ ] Verify actual image upload/download, reservations, expiry and Viewer/Editor access on deployed Storage.

## Phase 4 — Export and portability — implemented

- [X] Export normal, checklist, expense, and reminder notes as PDF or image on native and web.
- [X] Save exported images to the native media library and PDFs to a user-selected document folder.
- [X] Include expense rows, totals, monthly commitments, categories, categorized totals, and the summary note in expense exports.
- [X] Implement versioned JSON export/restore with validation and preview. Import is visible; the Settings Export Backup action is currently hidden and needs a separate visibility/product decision.

## Phase 5 — Structure and identity — implemented; store approval pending

- [X] One subfolder layer with native/web queries, cycle-safe subtree moves/deletion, backup v2 and private sync; Pro creation/edit gates retain recovery/move-out after expiry.
- [X] Configure current LockNote icon, adaptive foreground, splash and favicon assets in `app.config.js`.
- [ ] Approve final store artwork/listing assets on physical devices before release.
- [ ] Confirm whether the LockNote product name and package identifiers remain final before store release.

## Phase 6 — Add menu and note types — shipped

- [X] Note-type selection from the Home and Folder Add buttons.
- [X] Plain note with a 50,000-character limit.
- [X] Checklist with ordered items, completion progress, drag reordering, and item limits.
- [X] Expense Record with ordered rows, totals, complete ISO 4217 currency selection, monthly categories, a shared summary note, reusable commitments, and monthly paid-status tracking.
- [X] Reminder note with a 5,000-character description limit, one-time/daily/weekly/monthly local notifications, and notification-tap navigation into the correct password-gated editor.
- [X] Session undo/redo and debounced auto-save across all four editors.
- [X] PDF/image export for every note type.

See [NOTE_LIMITS.md](decisions/NOTE_LIMITS.md) for text and image limits and [MONTHLY_EXPENSE_CHECKLIST.md](decisions/MONTHLY_EXPENSE_CHECKLIST.md) for the expense commitment design.

## Additional backlog

- [X] Device-local note backgrounds with readability overlays, Pro gating and retained-but-hidden downgrade behavior.
- [ ] Optional cloud storage for custom backgrounds (not implemented).
- [ ] Sorting options for folders and notes.
- [ ] Annual subscription checkout/products/period labels.
- [ ] Explicit account deletion with required cloud cleanup/public request information.
- [ ] Reviewed repository cleanup; see [TODO.md](../TODO.md#7-parked-clean-up-files-included-in-git-commits).

## Explicitly unresolved product decisions

- Final store prices, trial policy, and production store metadata.
- Final annual checkout and trial configuration; monthly restore/account identity behavior is implemented but needs live testing.
- Account-deletion implementation and operational backup/monitoring ownership.

## Documentation references

Use the [documentation index](README.md), [setup TODO](../TODO.md), [test plan](testing/TEST_PLAN.md), [database ERD](diagrams/DATABASE_ERD.drawio), and [application overview](diagrams/APPLICATION_OVERVIEW.drawio). Checked implementation boxes are not evidence of production deployment or manual test passes.
