# Supabase backend setup

Account sync, Release 1 note collaboration, force-update policy, nested folders,
and inline note-image sync use the same Supabase project as authentication.

## Connect and deploy

Run these commands from the LockNote project folder:

```powershell
npx supabase login
npx supabase link --project-ref nhsomigoubtuajiloenc
npx supabase db push
npx supabase functions deploy share-note
```

If Supabase is already logged in and this project is already linked, only run
the final two commands.

1. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the app environment.
2. Link the Supabase CLI to the project and run `supabase db push`.
3. Confirm `private_folders`, `private_notes`, and the `sync_private_data` RPC exist after the migration.
4. Deploy the authenticated email lookup function with `supabase functions deploy share-note`.
5. Confirm Realtime is enabled for `shared_notes` and `note_members` (the collaboration migration adds both tables to the publication).
6. Confirm `app_update_config` exists and keep `force_update_enabled = false`
   until an update-capable build and its replacement are both publicly available.
7. Confirm the private `note-attachments` Storage bucket, the
   `note_attachments` table, and the attachment RPCs exist. New deployments run
   `202609120001_note_image_attachments.sql`,
   `202609120002_inline_note_attachments.sql`, and
   `202609120003_attachment_display_layout.sql` in order. Existing projects run
   only the attachment migrations they have not applied yet.

Private account sync is owner-scoped by RLS and uses only the authenticated
client session. LockNote does not end-to-end encrypt note content before upload.

The service-role key is read only inside the Edge Function. Never add it to the Expo environment or app bundle.

The `202609060001_shared_note_permissions.sql` migration adds `editor` and
`viewer` member roles. Existing collaborators remain editors. Run the database
migration and redeploy `share-note` together so new invitations can safely send
the selected permission.

Inline images remain local-first. Supabase stores only optimized JPEGs below
1 MB and their access-controlled metadata; each plain note accepts up to 20
images. The attachment migrations save the character offset and proportional
display width used to preserve drag order and aspect-ratio resizing on every
device.

See [../FORCE_UPDATE.md](../FORCE_UPDATE.md) for the Android/iOS release and
emergency rollback procedure.
