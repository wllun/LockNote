# LockNote Roadmap

_Snapshot: 2026-08-31. Current app version: 1.1.0._

This file describes the product direction and major delivery phases. For detailed implementation status and technical caveats, see [PROJECT_STATE.md](PROJECT_STATE.md). For the current architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Product direction

- LockNote remains offline-first: local storage is authoritative while editing, and core note features work without an account.
- Cloud features are opt-in. Private data is uploaded only when a signed-in user runs Sync Notes; shared notes use the collaboration backend.
- The proposed RM4.90/month Cloud and RM9.99/month Pro prices are planning targets, not active subscriptions. Premium entitlement, billing, and final tier boundaries are not implemented.
- Password protection is an access gate, not encryption. Local and synchronized note content is not end-to-end encrypted.

## Current priority — production readiness

- [ ] Deploy and verify all required Supabase migrations and the `share-note` Edge Function against the production project.
- [ ] Verify registration, email confirmation, session persistence, account-password recovery, LockNote-password recovery, and sign-out end-to-end on Android, iOS, and web.
- [ ] Verify manual private sync on at least two physical devices, including edits, moves, root notes, archives, and soft-delete tombstones.
- [ ] Verify collaboration with two real accounts, including invitations, member removal, realtime refresh, revision conflicts, and owner/member permissions.
- [ ] Configure production authentication email branding:
  - Connect Supabase Auth to Resend through Custom SMTP. As checked on 2026-08-31, Resend Free allows 3,000 transactional emails per month and 100 per day; confirm current limits before launch.
  - Use a dedicated sender subdomain such as `auth.example.com` and `LockNote <no-reply@auth.example.com>`. The domain identifies the email sender; it does not require LockNote to have a website.
  - Configure SPF and DKIM, then add DMARC for production.
  - Brand the signup-confirmation, account-password recovery, LockNote-password recovery, and email-change templates while preserving variables such as `{{ .ConfirmationURL }}`.
- [ ] Test the Android and iOS forced-update policies with older store builds before relying on them for a public rollout.
- [ ] Decide the final free/Cloud/Pro feature boundaries and implement subscription entitlement before charging users.

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

## Phase 2 — Accounts, cloud sync, and collaboration — implemented; validation remains

### Implemented

- [X] Supabase email/password registration and sign-in with persisted sessions.
- [X] Email-confirmation and password-recovery deep links on native and web.
- [X] Manual two-way private folder/note sync with row-level security, last-write-wins timestamps, root-note preservation, and deletion tombstones.
- [X] Multi-device data transfer through an explicit Sync Notes action after signing in.
- [X] Collaboration Release 1: share individual notes by registered email, manage collaborators, display Shared-with-me notes, refresh through Realtime, and reject stale-revision saves.
- [X] Android/iOS forced-update baseline driven by platform-specific public read-only Supabase policies; web remains exempt.

### Remaining

- [ ] Complete the production verification tasks listed above.
- [ ] Add safe automatic/foreground sync after session restoration, app resume, and connectivity recovery.
- [ ] Add queued offline retries and serialize automatic sync with manual sync and pending editor saves.
- [ ] Add best-effort OS background sync only after foreground synchronization is reliable.
- [ ] Show clear last-success and retry/error state for automatic synchronization.
- [ ] Implement and validate premium entitlement if Cloud remains a paid tier at the proposed RM4.90/month price.

## Phase 3 — Attachments (pro) — planned

- [ ] Add image attachments to notes.
- [ ] Define local storage limits, backup behavior, cloud-sync behavior, deletion cleanup, and collaboration behavior before implementation.
- [ ] Decide whether attachments require the proposed RM9.99/month Pro tier and implement entitlement accordingly.

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
- [X] Plain note with a 100,000-character limit.
- [X] Checklist with ordered items, completion progress, drag reordering, and item limits.
- [X] Expense Record with ordered rows, totals, complete ISO 4217 currency selection, monthly categories, a shared summary note, reusable commitments, and monthly paid-status tracking.
- [X] Reminder note with one-time/daily/weekly/monthly local notifications and notification-tap navigation into the correct password-gated editor.
- [X] Session undo/redo and debounced auto-save across all four editors.
- [X] PDF/image export for every note type.

See [NOTE_LIMITS.md](NOTE_LIMITS.md) for text limits and [MONTHLY_EXPENSE_CHECKLIST.md](MONTHLY_EXPENSE_CHECKLIST.md) for the expense commitment design.

## Additional backlog

- [ ] Custom note background images with local-only storage and enforced text readability.
- [ ] Sorting options for folders and notes.

## Explicitly unresolved product decisions

- Whether Cloud sync and collaboration are both included in one paid tier.
- Whether search, pinning, archive, Trash, colors, view controls, exports, and backups remain free. They are currently implemented without premium gating.
- Whether attachment storage is local-only or synchronized through a paid storage service.
- Final subscription prices, billing provider, trial policy, restore-purchases behavior, and account-deletion flow.
