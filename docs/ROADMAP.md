# LockNote Roadmap

_Snapshot: 2026-09-12. Current app version: 1.1.0._

This file describes the product direction and major delivery phases. For detailed implementation status and technical caveats, see [PROJECT_STATE.md](PROJECT_STATE.md). For the current architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Product direction

- LockNote remains offline-first: local storage is authoritative while editing, and core note features work without an account.
- Cloud features are opt-in. Private data is uploaded only when a signed-in user runs Sync Notes; shared notes use the collaboration backend.
- Account login, local portable backup, and recovery downloads remain Free. LockNote Plus targets active cloud sync and collaboration with 100 MB of cloud note storage. Inline image attachments are implemented; LockNote Pro gating and its 2 GB cloud attachment quota remain pending.
- LockNote Plus and LockNote Pro checkout is implemented through RevenueCat, with actual localized prices supplied by the configured stores. Store products, public SDK keys, and production payment testing still require external setup. Feature gating, quota enforcement, and server-side downgrade handling are not implemented.
- Subscription expiry must not delete notes. Local editing continues while cloud writes pause and existing cloud data remains read-only and downloadable.
- Password protection is an access gate, not encryption. Local and synchronized note content is not end-to-end encrypted.

## Current priority — production readiness

- [ ] Deploy and verify all required Supabase migrations and the `share-note` Edge Function against the production project.
- [ ] Verify registration, email confirmation, session persistence, account-password recovery, LockNote-password recovery, and sign-out end-to-end on Android, iOS, and web.
- [ ] Verify manual private sync on at least two physical devices, including edits, moves, root notes, archives, and soft-delete tombstones.
- [ ] Verify collaboration with two real accounts, including Can edit/View only invitations, one-editor leases and expiry, offline Shared-tab hiding, permission changes while an editor is open, member removal, realtime refresh, and revision conflicts.
- [ ] Configure production authentication email branding:
  - Connect Supabase Auth to Resend through Custom SMTP. As checked on 2026-08-31, Resend Free allows 3,000 transactional emails per month and 100 per day; confirm current limits before launch.
  - Use a dedicated sender subdomain such as `auth.example.com` and `LockNote <no-reply@auth.example.com>`. The domain identifies the email sender; it does not require LockNote to have a website.
  - Configure SPF and DKIM, then add DMARC for production.
  - Brand the signup-confirmation, account-password recovery, LockNote-password recovery, and email-change templates while preserving variables such as `{{ .ConfirmationURL }}`.
- [ ] Test the Android and iOS forced-update policies with older store builds before relying on them for a public rollout.
- [X] Define the planned Free, LockNote Plus, and LockNote Pro boundaries and non-destructive expiry policy in [Subscription Plans](decisions/SUBSCRIPTION_PLANS.md).
- [X] Implement the client payment lifecycle: identified checkout, verified RevenueCat entitlement status, restore purchases, subscription management, foreground refresh, and localized pricing.
- [ ] Configure and validate RevenueCat plus Apple/Google/web products by following [Subscription Payment Setup](decisions/SUBSCRIPTION_SETUP.md).
- [ ] Implement server-owned entitlement persistence, quota enforcement, and downgrade/recovery behavior before gating cloud features.
- [X] Keep premium feature restrictions disabled while payment setup and entitlement behavior are validated.

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

## Phase 2 — Accounts, cloud sync, and collaboration — implemented; LockNote Plus target

### Implemented

- [X] Supabase email/password registration and sign-in with persisted sessions.
- [X] Email-confirmation and password-recovery deep links on native and web.
- [X] Manual two-way private folder/note sync with row-level security, last-write-wins timestamps, root-note preservation, and deletion tombstones.
- [X] Multi-device data transfer through an explicit Sync Notes action after signing in.
- [X] Collaboration Release 1: share individual notes by registered email with per-recipient Can edit/View only access, manage collaborators, display Shared-with-me notes, refresh through Realtime, reject viewer writes, and reject stale-revision saves.
- [X] Android/iOS forced-update baseline driven by platform-specific public read-only Supabase policies; web remains exempt.

### Remaining

- [ ] Complete the production verification tasks listed above.
- [ ] Add safe automatic/foreground sync after session restoration, app resume, and connectivity recovery.
- [ ] Add queued offline retries and serialize automatic sync with manual sync and pending editor saves.
- [ ] Add best-effort OS background sync only after foreground synchronization is reliable.
- [ ] Show clear last-success and retry/error state for automatic synchronization.
- [ ] Implement and validate LockNote Plus entitlement, the 100 MB note quota, read-only expiry recovery, and owner-funded collaboration.

## Phase 3 — Attachments — implemented, Pro gating pending

- [X] Add up to 20 images to plain notes at the current text cursor, with text continuing below each image.
- [X] Accept source images up to 5 MB and resize/compress saved JPEGs to strictly below 1 MB.
- [X] Implement native/web local storage, cursor-anchor persistence, one-second long-press drag/drop, proportional display resizing, inline Undo/Redo and export rendering, cloud upload/download reconciliation, shared-note role checks, and local deletion cleanup.
- [X] Enforce the 20-image and 2 GB owner-funded cloud limits in the Supabase migration; local JSON backup remains separate and excludes binary media.
- [X] Queue offline cloud-image deletions and retry them on the next signed-in attachment sync.
- [X] Add a follow-up migration that upgrades already-deployed gallery metadata to inline character-offset anchors.
- [X] Add a follow-up migration for synchronized proportional image display widths.
- [ ] Implement and validate LockNote Pro entitlement gating.

## Phase 4 — Export and portability — shipped

- [X] Export normal, checklist, expense, and reminder notes as PDF or image on native and web.
- [X] Save exported images to the native media library and PDFs to a user-selected document folder.
- [X] Include expense rows, totals, monthly commitments, categories, categorized totals, and the summary note in expense exports.
- [X] Export and restore a backend-independent, versioned JSON backup with validation and preview.

## Phase 5 — Structure and identity — planned

- [ ] Add nested folders. Define recursive queries, move rules, deletion behavior, backup validation, and sync schema changes first.
- [ ] Finalize the app icon and related adaptive icon, splash, favicon, and store assets.
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

- [ ] Custom note background images with local-only storage and enforced text readability.
- [ ] Sorting options for folders and notes.

## Explicitly unresolved product decisions

- Final store prices, trial policy, and production store metadata.
- Exact server schema and enforcement path for entitlements, quota usage, billing grace periods, and read-only recovery.
- Restore-purchases behavior and the account-deletion flow.
