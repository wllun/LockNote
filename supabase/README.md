# Supabase backend setup

Updated: 2026-09-19. Instructions are not confirmation of remote deployment. See [full setup](../supabase-setup.md), [setup TODO](../TODO.md), [database ERD](../docs/diagrams/DATABASE_ERD.drawio), and [device/backend tests](../docs/testing/TEST_PLAN.md).

Account sync, Release 1 note collaboration, force-update policy, nested folders,
and inline note-image sync use the same Supabase project as authentication.

## Connect and deploy

Run these commands from the LockNote project folder:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
npx.cmd supabase functions deploy share-note
npx.cmd supabase functions deploy revenuecat-webhook --no-verify-jwt
```

Confirm the intended project reference first. Dry-run previews, but does not deploy or verify RLS. On macOS/Linux omit `.cmd`. Current migrations run through `202609180001_shared_note_subscription_visibility.sql`; this final migration suspends recipient access after owner expiry while preserving caches/memberships. Confirm server subscription/upload-reservation tables, quota/recovery RPCs and canonical webhook secrets/backfill before releasing a live paid service; server gates affect older clients too.

If Supabase is already logged in and this project is already linked, only run
the deployment commands after linking.

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

## Proposal 2 subscriptions

Automatic/background record sync is implemented as Plus/Pro per-device/account
opt-in and reuses these RPCs; it adds no migration or Edge Function. Rebuild native
binaries and follow [Background Sync](../docs/BACKGROUND_SYNC.md). Automatic runs
exclude image binaries/preferences; manual/open-note image reconciliation remains
separate. Verify actual remote state in a sandbox, not with production customer data.

Apply `202609170001_premium_plan_2.sql` for server-only subscription records,
25/75/750 MB combined quotas, owner-funded collaboration and image-upload
reservations. Configure the webhook's server secrets and RevenueCat integration
before releasing the app, and backfill existing subscribers before enforcement.
See [Subscription Payment Setup](../docs/decisions/SUBSCRIPTION_SETUP.md#5-deploy-proposal-2-backend-enforcement)
for exact identifiers, deployment order and downgrade verification. Deploying
the migration alone does not create paid subscriptions.
