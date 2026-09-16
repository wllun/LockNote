# Subscription Plans

This document defines the LockNote subscription boundaries. The Premium module
can load offerings, complete purchases, restore purchases, open subscription
management, and display the active RevenueCat entitlement. Store and RevenueCat
dashboard configuration is still required before accepting payments. Premium
feature restrictions, storage quotas, and server-side expiry enforcement are
not implemented yet.

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
| Inline image attachments | No | No | Yes (implemented; gating pending) |
| Custom note backgrounds | No | No | Yes (implemented; gating pending) |
| Nested folders | No | No | Yes (implemented; gating pending) |
| Image attachment storage | None | None | Included in the 750 MB Pro quota |

LockNote Plus or Pro is required for the owner to create or actively synchronize
a shared note. An invited person only needs a free LockNote account and follows
the View only or Can edit permission assigned by the owner.

## Cancellation and Expiry

Cancelling renewal does not end access immediately. The user keeps the paid plan
until the end of the already-paid billing period. If a renewal payment fails,
the future billing implementation should honor the applicable store grace and
billing-retry state before downgrading the account.

After the paid period expires:

- The account returns to Free.
- All local notes remain available and editable.
- New cloud writes above the 25 MB Free quota, automatic sync, and
  owner-funded collaboration pause.
- Existing cloud note data remains read-only and available for download or
  one-way recovery.
- Existing shared notes remain readable, but remote edits and new invitations
  pause when the owner's plan is no longer active.
- Existing attachments remain viewable and downloadable; new attachment uploads
  require LockNote Pro.
- Resubscribing restores the relevant cloud features. Sync must reconcile newer
  local edits safely instead of overwriting them with an older cloud snapshot.

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

The app still allows manual sync, sharing, and inline image attachments without premium entitlement checks.
Server-owned entitlement records, quota tracking, feature gating, downgrade
enforcement, and read-only recovery remain future work. See
[Subscription Payment Setup](SUBSCRIPTION_SETUP.md) for the external dashboard,
product, key, and testing steps.
