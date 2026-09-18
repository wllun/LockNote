# Subscription Plans

This document defines the LockNote subscription boundaries. The Premium module
can load offerings, complete purchases, restore purchases, open subscription
management, and display the active RevenueCat entitlement. Store and RevenueCat
dashboard configuration is still required before accepting payments. Premium
feature restrictions, storage quotas, and server-side expiry enforcement are
implemented for Proposal 2. The new migration and authenticated RevenueCat
webhook still require deployment and configuration.

## Product Principles

- LockNote remains useful offline without an account or subscription.
- Users pay for ongoing cloud services and storage, not ownership of their notes.
- Ending a subscription never deletes local notes or automatically deletes the
  account's existing cloud note data.
- Account login, manual multi-device sync within a 25 MB cloud quota, local
  backup, and recovery access remain available on the Free plan.
- A portable backup is a local JSON file selected by the user. It does not consume
  LockNote server storage and remains free.

## Plan Comparison

| Feature | Free | LockNote Plus | LockNote Pro |
| --- | ---: | ---: | ---: |
| Proposed monthly price | RM 0 | RM 4.90 | RM 9.99 |
| Core offline notes and folders | Yes | Yes | Yes |
| Search, note colors, Archive, Trash and locks | Yes | Yes | Yes |
| PDF and image export | No | Yes | Yes |
| Local backup import and export | Yes | Yes | Yes |
| Account login | Yes | Yes | Yes |
| Download or restore existing cloud data | Yes | Yes | Yes |
| Manual cloud sync | Yes | Yes | Yes |
| Automatic background sync | No | Planned | Planned |
| Cloud storage quota | 25 MB | 75 MB | 750 MB |
| Approximate long-note capacity | 300 | 1,000 | 10,000 text notes; fewer with images |
| Multi-device use | Yes | Yes | Yes |
| Share notes and collaborate | No | Yes | Yes |
| Inline image attachments | No | No | Yes (up to 20 per plain note) |
| Custom note backgrounds | No | No | Yes (device-local only) |
| Nested folders | No | No | Yes (one subfolder layer) |
| Image attachment storage | None | None | Included in the 750 MB Pro quota |

LockNote Plus or Pro is required for the owner to create or actively synchronize
a shared note. An invited person only needs a free LockNote account and follows
the View only or Can edit permission assigned by the owner.

## Cancellation and Expiry

Cancelling renewal does not end access immediately. The user keeps the paid plan
until the end of the already-paid billing period. If a renewal payment fails,
the server honors RevenueCat's verified entitlement expiry and applicable
grace-period expiry before downgrading the account. Billing retry without an
active entitlement or unexpired grace period does not grant paid access.

After the paid period expires:

- The account returns to Free.
- All local notes remain available. Notes in existing subfolders are read-only
  without Pro; notes at Home or in top-level folders remain editable.
- New cloud writes above the 25 MB Free quota, automatic sync, and
  owner-funded collaboration pause.
- Existing cloud note data remains read-only and available for download or
  one-way recovery.
- Existing shared notes remain readable, but remote edits and new invitations
  pause when the owner's plan is no longer active.
- Existing attachments remain viewable and downloadable; new attachment uploads
  require LockNote Pro.
- Existing backgrounds, attachments and subfolders are never hidden or flattened.
  Removal, un-nesting, import and JSON backup remain available. Users may move a
  note to Home or a top-level folder (or move its whole subfolder to Home) to
  resume editing without Pro. No folders or notes move automatically on expiry.
  Creating notes or moving notes into a subfolder requires Pro. A Pro auto-save
  already staged before expiry may finish, but no further content edits are allowed
  inside the subfolder. All four editors show the read-only explanation and a
  Move note action. Bulk currency changes skip these read-only expense records.
  Notes containing existing images/backgrounds or residing in a subfolder can
  still export PDF/images on Free as a premium-content recovery exception.
- Resubscribing restores the relevant cloud features. Sync must reconcile newer
  local edits safely instead of overwriting them with an older cloud snapshot.
- Renewing Pro also restores editing inside existing subfolders. Plus does not
  include subfolder editing. Invited shared-note editors remain owner-funded;
  this restriction concerns the owner's local folder organization, not the
  invited person's independent subscription.

Subscription expiry alone must never call a note, folder, attachment, or account
deletion path. Normal user-requested deletion and account deletion remain
separate explicit actions.

## Storage Controls

- Enforce the 25 MB, 75 MB, and 750 MB cloud quotas on the server rather than
  trusting the client.
- Store note and folder records in the database; store attachment files in object
  storage rather than database rows.
- Reject new cloud writes when an account is over quota without blocking local
  editing or recovery downloads.
- Accept source images up to 5 MB, then resize/compress locally so every uploaded
  JPEG is strictly below 1 MB. Allow up to 20 cursor-positioned images per plain
  note, with the inline order preserved during sync and export.
- Exclude local portable backups from all cloud quota calculations.
- Count note and folder records toward every plan's quota. For Pro, count image
  attachment objects and metadata within the same 750 MB total.
- Treat the displayed note counts as conservative estimates, not guarantees;
  Pro capacity is lower when the user stores image attachments.
- Show current usage, the plan limit, and a clear over-quota recovery action in
  the Premium module before enforcement is enabled.

## Implementation Status

The Premium module uses RevenueCat offerings and `CustomerInfo` for its purchase
and restore lifecycle. A user must sign in before subscribing, and the Supabase
user UUID becomes the RevenueCat App User ID. The screen displays the localized
store price and changes from Free to the active Plus or Pro entitlement after a
verified purchase.

Action-level checks now gate export and owner sharing to Plus/Pro, and new images,
background changes and nested-folder organization to Pro. Native/web folder APIs
remain identical; sync and backup restoration bypass new-folder creation gates.
Free invitees follow the owner's active plan and assigned permissions.

`202609170001_premium_plan_2.sql` adds server-only `user_subscriptions`, plan-aware
cloud-write triggers, serialized owner quotas, upload reservations and read-only
recovery RPCs. Quotas use MiB (displayed as MB, 1 MB = 1,048,576 bytes), count UTF-8
JSON note/folder/shared-note/attachment metadata and actual Storage file bytes,
and count outstanding upload reservations. Deleted private-note bodies are not
billed, but their tombstone metadata remains counted. Private and shared cloud
copies are separate stored records and both count. A quota scan runs once per
owner per deferred transaction snapshot rather than once per uploaded row.
The Premium screen shows server usage/limit and a no-upload recovery action;
over-quota sync automatically falls back to recovery while preserving newer
local edits. An expired owner can edit locally without publishing; incoming
shared notes remain view-only until the owner subscribes again.

The webhook fetches canonical RevenueCat subscribers rather than trusting event
ordering or a client plan. Duplicate events converge safely; stale snapshots
cannot overwrite newer ones. Production ignores sandbox entitlements by default.
Automatic/background sync and optional background-image cloud storage remain
planned; no optional three-image Free/Plus trial has been enabled. See
[Subscription Payment Setup](SUBSCRIPTION_SETUP.md) for the external dashboard,
product, key, and testing steps.
