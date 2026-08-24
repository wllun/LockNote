# Supabase backend setup

Account sync and Release 1 note collaboration use the same Supabase project as authentication.

1. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the app environment.
2. Link the Supabase CLI to the project and run `supabase db push`.
3. Confirm `private_folders`, `private_notes`, and the `sync_private_data` RPC exist after the migration.
4. Deploy the authenticated email lookup function with `supabase functions deploy share-note`.
5. Confirm Realtime is enabled for `shared_notes` and `note_members` (the collaboration migration adds both tables to the publication).

Private account sync is owner-scoped by RLS and uses only the authenticated
client session. LockNote does not end-to-end encrypt note content before upload.

The service-role key is read only inside the Edge Function. Never add it to the Expo environment or app bundle.
