# Roadmap

Product plan across phases. For what's implemented right now in detail, see [PROJECT_STATE.md](PROJECT_STATE.md).

## Phase 1 — Offline (free) — shipped

- [X] Offline local storage
- [X] Folders
- [X] Notes
- [X] Set password (folder/note lock)
- [X] Theme mode (light/dark, plus system)

## Phase 2 — Cloud — premium, RM4.90/month

- [X] Login — Profile tab with real Supabase Auth (email/password sign up + sign in, session persisted via AsyncStorage). No premium gating yet — anyone can create an account.
- [ ] Sync DB — Profile screen has a "Sync Notes" entry point, currently stubbed ("Coming soon"). Actual push/pull of notes/folders to Supabase not built.
- [ ] Multi-device login — depends on Sync DB above; logging in on a second device doesn't yet pull your notes.
- [X] Searchable — already shipped free in Phase 1 (Home search bar); decide whether to keep it free or gate it behind Phase 2

## Phase 3 — Attachments — premium pro, RM9.99/month

- [ ] Image attachment

## Phase 4 — Export

- [ ] Export PDF & image

## Phase 5 — Structure (not premium)

- [ ] Folder in folder (nesting)
- [ ] App icon & name change

## Additional / backlog (unphased)

- [X] Pin — already shipped free in Phase 1 scope; decide which tier it belongs to
- [ ] Coloring note
- [ ] View (list/grid?)
- [ ] Sort
- [ ] Trash (currently soft-delete with no trash UI — see PROJECT_STATE)
- [ ] Archive
- [ ] Reminder task
- [ ] Checklist (with checkbox)
