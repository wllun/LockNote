# Recipe Notes

Implemented in source: 2026-10-25. Hosted migration deployment and installed-device
acceptance are separate, pending steps.

## Behavior

- Home or Folder → Add → Recipe Note creates a `recipe` note in that location.
- Title, ingredients (one ingredient and its amount per line), and numbered
  preparation steps work offline without an account. Text editing is Free.
- New drafts start editable. Existing recipes open in preview; Edit/Done controls
  editing, and preview text supports selection/copy.
- Preparation steps support add, remove, move up and move down. Session Undo/Redo
  restores ingredient/step edits and ordering.
- One optional local photo is available on every plan, including offline without
  an account. Cloud photo uploads remain Pro. Sources at most 5 MB are
  optimized locally to JPEG below 1 MB before being stored. Change photo below
  the image (also available in the menu) replaces it directly, including from
  preview. Selection/optimization completes before an atomic local swap; cancel
  or a failed save keeps the original. Old cloud cleanup follows a successful
  local replacement, with existing deferred cleanup when offline.
- The inline photo uses a fixed 220-point-high frame with contain scaling: its
  original proportions are preserved without stretching or cropping, including
  tall portraits. Tapping opens a safe-area-aware full-screen view. Close or
  Android Back returns to the recipe. Read-only users can view the image too.
- Existing retained photos stay readable and removable after downgrade, subject
  to the note's edit permissions. Photo additions follow the owner's verified Pro
  plan for incoming shared editors; viewers cannot edit.
- Autosave uses the existing 800 ms debounce. Exit waits for pending save/photo
  work; untouched new empty drafts are removed, while photo-only and existing
  notes remain. Empty preparation rows alone do not make a meaningful draft.
- List/grid cards show a Recipe badge and ingredient/step counts. Folder, search,
  Archive, Trash, lock, pin and note-color behavior follow the existing workflow.
- Exports include the photo and readable ingredient/numbered-step text rather than
  raw JSON. A Free local recipe photo does not grant paid export access; Plus/Pro
  or another existing recovery exception is still required.

## Storage and cloud

`src/utils/recipe-note.mjs` defines version-1 JSON stored in the existing `content`
field: `{version: 1, ingredients: string, steps: [{id, text}]}`. The title remains
in the note title column. Photos use `note_attachments` and managed native files
or web IndexedDB. No new local schema or rewrite of existing notes is needed.

Limits are documented in [Note Character Limits](NOTE_LIMITS.md). Backup and
private-sync validators preserve `recipe` as a distinct type. Existing portable
JSON backups contain recipe text but **exclude binary photos**, just like other
note attachments. Copying the project folder does not back up device app data.

Cloud support requires applying
`supabase/migrations/202610250001_recipe_notes.sql` after prior migrations. It
extends private/shared type constraints and shared-photo authorization while
retaining owner subscriptions, roles, deletion filters and quotas. No new service
or public bucket is introduced. Image transfers use existing signed-in/open-note
and manual-sync paths; automatic record sync does not transfer photo binaries.
Avoid editing recipes using older app versions that do not recognize this type.

## Acceptance still required

- [ ] On Android/iOS/web create a recipe at Home and inside a folder, exit
  immediately after editing, reopen, restart and verify all entered data.
- [ ] Add/remove/reorder steps, Undo/Redo, and confirm resulting numbering.
- [ ] Verify keyboard visibility on a small phone, long ingredient/step text,
  largest system font, light/dark modes and bottom safe area.
- [ ] Pick/cancel/replace a photo; reject a source over 5 MB; verify aspect ratio,
  stored size below 1 MB, offline persistence and export rendering.
- [ ] Verify Free recipe text/local photo, Pro cloud photo uploads, retained-photo downgrade
  access and subfolder read-only/move-out behavior.
- [ ] Apply the migration in a test project and verify recipe sync across devices,
  shared viewer/editor permissions, owner expiry and shared photo access.
- [ ] Verify archive, restore, Trash recovery, password-gated deletion, export and
  JSON text-only backup/restore using disposable fixtures.

Automated recipe tests cover serialization, emptiness, backup/sync preservation,
safe export, editor save/reopen/Undo/Redo, oversized-edit rejection, picker limits
and form interactions. Automated tests do not certify installed-device or live
Supabase behavior.
