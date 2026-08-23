# Collaboration backend setup

Release 1 note collaboration requires the same Supabase project used for account authentication.

1. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the app environment.
2. Link the Supabase CLI to the project and run `supabase db push`.
3. Deploy the authenticated email lookup function with `supabase functions deploy share-note`.
4. Confirm Realtime is enabled for `shared_notes` and `note_members` (the migration adds both tables to the publication).

The service-role key is read only inside the Edge Function. Never add it to the Expo environment or app bundle.
