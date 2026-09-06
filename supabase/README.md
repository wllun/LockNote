# Supabase backend setup

Account sync and Release 1 note collaboration use the same Supabase project as authentication.

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

Private account sync is owner-scoped by RLS and uses only the authenticated
client session. LockNote does not end-to-end encrypt note content before upload.

The service-role key is read only inside the Edge Function. Never add it to the Expo environment or app bundle.

The `202609060001_shared_note_permissions.sql` migration adds `editor` and
`viewer` member roles. Existing collaborators remain editors. Run the database
migration and redeploy `share-note` together so new invitations can safely send
the selected permission.

See [../FORCE_UPDATE.md](../FORCE_UPDATE.md) for the Android/iOS release and
emergency rollback procedure.
