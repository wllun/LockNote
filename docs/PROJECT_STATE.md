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
- [ ] Wire up search UI — `noteRepo.search()` exists in both repos but no search bar surfaces it
- [ ] Implement or remove **Settings → Backup Data** (currently labeled "Coming soon", no handler)
- [ ] Decide on `hardDelete()` — implemented in both repos but never called; wire to a "permanently delete" flow or drop it
- [ ] Clean up empty notes on editor exit (editor creates a row on entry; backing out without typing leaves an empty "Untitled" note)

### Supabase cleanup (migrated to local-only)
- [ ] Remove `@supabase/supabase-js` from `package.json` if cloud is truly abandoned
- [ ] Remove `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `.env` and the `expo.extra` injection in `app.config.js`

### Possible features
- [ ] Dark mode (`userInterfaceStyle` is `light`; colors are hardcoded in styles)
- [ ] Password recovery/reset (forgetting a password currently locks an item permanently)
- [ ] Data export / cross-platform portability (native SQLite and web AsyncStorage are separate, no sync)
- [ ] Pinning — `is_pinned` was in the old Supabase schema; not in the current SQLite schema or UI

## Caveats (not bugs — document, don't "fix" silently)

- **Not secure storage.** Passwords gate access via hash comparison; note content is plaintext in the local DB. Not safe for genuinely sensitive data — see [README.md](../README.md#security).
- **Migration history.** App was built for Supabase (cloud + auth), then migrated to local-only. The Supabase leftovers above are the only remaining traces.
