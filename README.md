# LockNote

A local-first note-taking app with folders, password access gates, optional account sync, and owner-funded sharing. Built with Expo SDK 54 / React Native 0.81. Android is the first distribution target; iOS and web remain supported implementation/regression targets.

## Features

- Folders and notes, with notes nested in folders or at the root
- Optional locks: one shared LockNote password for all locked notes, plus individual folder passwords (SHA-256 gated — see [Security](#security))
- Auto-save while editing (debounced)
- Search across folders and note titles/content on native and web
- Soft delete (items are flagged, not immediately purged)
- Plain-note inline images inserted between text blocks, with wrapping multi-image rows, long-press drag/drop, and proportional resizing (up to 20 per note)
- Preview-first plain-note bodies and reminder descriptions; double-tap the content to edit
- Checklist, Expense Record, and reminder note types
- Archive, 30-day Trash recovery, PDF/image export, and Undo/Redo
- Free manual account sync and Plus/Pro opt-in automatic folder/note sync
- Per-email note sharing with View only or Can edit access
- Portable JSON backup export and validated merge/replace restore
- Runs on iOS, Android, and web

## Requirements

- Compatible Node.js LTS, at least 20.19.4 for the installed native tooling; Node 18 is unsupported. See the [SDK 54 compatibility table](https://docs.expo.dev/versions/v54.0.0/).
- npm and the project-local Expo CLI (`npx.cmd expo` in Windows PowerShell)
- Android SDK/platform-tools and JDK 17 for local Android builds; macOS/Xcode for local iOS builds

## Run

```powershell
npm.cmd ci
npx.cmd expo start --go       # SDK 54-compatible Expo Go for supported features
# After installing a native development build:
npx.cmd expo start --dev-client
# Web regression target:
npm.cmd run web
```

On macOS/Linux use `npm` and `npx`. See [physical-device commands](docs/COMMAND_RUN_APK.md), [AVD commands](docs/COMMAND_RUN_AVD.md), and the [short-directory build workflow](docs/1_MY_DEV_NOTE.md). Expo Go cannot certify native store billing or OS background sync.

No account or backend configuration is needed for offline use. Account sync,
authentication, and collaboration require a configured Supabase project and the
migrations in `supabase/migrations`.

## Storage

Local storage is the primary data source:

- **iOS / Android** — SQLite (`expo-sqlite`), database file `locknote.db`
- **Web** — AsyncStorage (localStorage), via `*.web.js` repo variants
- **Inline images** — SQLite metadata/managed files on native; IndexedDB metadata/Blobs on web

Signed-in users can run **Profile → Sync Notes** to merge folders and notes with
their owner-scoped Supabase snapshot. Manual sync remains Free within 25 MB.
Plus/Pro users can opt into **Profile → Automatic Sync** for notes/folders,
including safe foreground retries and best-effort native OS background tasks.
Normal editing remains offline-first; automatic sync waits for editors to close
and save. Binary images retain open-note/manual synchronization. See
[Background Sync](docs/BACKGROUND_SYNC.md) for native builds and verification.

The portable JSON backup service works without an account. Its **Export Backup**
Settings action is currently hidden; the implementation remains for developer
verification. **Settings → Import Backup** is visible on iOS, Android, and web. Import previews the contents
and requires choosing Merge or Replace. Replace affects private data only and
keeps Shared-with-me notes. Reminder registrations remain device-local and are
disabled on restore.

## Subscriptions — implemented gates, external setup pending

Account login, offline features, portable local backup, and manual sync within a
25 MB cloud quota remain Free. LockNote Plus adds PDF/image export,
collaboration, automatic sync, and a 75 MB cloud quota. LockNote Pro adds a
750 MB combined note-and-image quota, image attachments, note backgrounds, and
nested folders (one subfolder layer). Client gates, server-owned subscriptions,
quotas and expiry/recovery policies are implemented; deployment and live testing
remain required. Home/top-level notes remain editable after expiry; subfolder
notes become read-only without Pro, retained backgrounds are hidden, and incoming
sharing is suspended when the owner lacks Plus/Pro. Expiry never deletes notes.

The Premium tab has RevenueCat checkout, restore, management, localized pricing,
and active-plan status. Monthly checkout is implemented ($1.99 Plus / $3.99 Pro
USD targets); yearly checkout remains pending ($19.99 / $39.99 targets). Real
payments require the external configuration in
[Subscription Payment Setup](docs/decisions/SUBSCRIPTION_SETUP.md). See
[Subscription Plans](docs/decisions/SUBSCRIPTION_PLANS.md) for the product policy.

## Security

Password protection is **access gating, not encryption**. Locked notes use one shared LockNote password; folders keep individual passwords. Only SHA-256 hashes are stored and checked before access. The LockNote password is separate from the Supabase account password, although a user may choose the same text. Settings can change it with the old password or send a one-time reset link to the safely linked account email. Note contents are stored in plaintext in the local database, account sync, and portable JSON backup files; LockNote does not end-to-end encrypt them. Anyone with direct access to local storage, authorized account data, or a backup file can read notes regardless of a lock. Do not treat this as secure storage for sensitive data.

## Project layout

```
App.js                    # Providers, DB initialization, update gate, navigator
src/
├── db/
│   ├── sqlite.js          # SQLite init + schema (native)
│   ├── folderRepo.js      # Folder CRUD (native, SQLite)
│   ├── folderRepo.web.js  # Folder CRUD (web, AsyncStorage)
│   ├── noteRepo.js        # Note CRUD + search (native, SQLite)
│   ├── noteRepo.web.js    # Note CRUD + search (web, AsyncStorage)
│   ├── attachmentRepo.js  # Inline image metadata/files (native)
│   └── attachmentRepo.web.js # Inline images in IndexedDB (web)
├── navigation/
│   └── AppNavigator.js    # Home, Shared, Premium, Settings, Profile stacks
├── screens/               # Four editors, folders, account, premium, archive/trash
├── components/            # Cards, dialogs, access gates, media/export UI
├── context/               # Auth, subscription and automatic-sync coordination
├── services/              # Sync, collaboration, media, backup, auth and payments
└── utils/
    └── crypto.js          # SHA-256 password hashing
```

## Documentation and verification

Start with the [documentation index](docs/README.md). [Architecture](docs/ARCHITECTURE.md), [project state](docs/PROJECT_STATE.md), [roadmap](docs/ROADMAP.md), and [setup/cleanup TODO](TODO.md) have separate purposes. Implemented code does not imply deployed services or device acceptance.

Editable references: [database ERD](docs/diagrams/DATABASE_ERD.drawio) and [application overview](docs/diagrams/APPLICATION_OVERVIEW.drawio), derived from repository schemas rather than live database introspection.

Run `npm.cmd test` on Windows (`npm test` on macOS/Linux). Automated checks do not replace [installed-device/backend testing](docs/testing/TEST_PLAN.md). Keep private credentials, exports, caches and build outputs out of commits; see [cleanup TODO](TODO.md#7-parked-clean-up-files-included-in-git-commits).
