# LockNote

A local-first note-taking app with folder organization, password protection, optional account sync, and note sharing. Built with Expo / React Native.

## Features

- Folders and notes, with notes nested in folders or at the root
- Optional locks: one shared LockNote password for all locked notes, plus individual folder passwords (SHA-256 gated — see [Security](#security))
- Auto-save while editing (debounced)
- Full-text search across notes (native)
- Soft delete (items are flagged, not immediately purged)
- Manual two-way account sync across iOS, Android, and web
- Portable JSON backup export and validated merge/replace restore
- Runs on iOS, Android, and web

## Requirements

- Node.js 18+
- Expo CLI (`npx expo`)

## Run

```bash
npm install
npm start        # then press i / a / w for iOS, Android, web
```

No account or backend configuration is needed for offline use. Account sync,
authentication, and collaboration require a configured Supabase project and the
migrations in `supabase/migrations`.

## Storage

Local storage is the primary data source:

- **iOS / Android** — SQLite (`expo-sqlite`), database file `locknote.db`
- **Web** — AsyncStorage (localStorage), via `*.web.js` repo variants

Signed-in users can run **Profile → Sync Notes** to merge folders and notes with
their owner-scoped Supabase snapshot. Sync is manual; normal editing remains
offline-first.

Every user can use **Settings → Export Backup** without an account, then import
that versioned JSON file on iOS, Android, or web. Import previews the contents
and requires choosing Merge or Replace. Replace affects private data only and
keeps Shared-with-me notes. Reminder registrations remain device-local and are
disabled on restore.

## Security

Password protection is **access gating, not encryption**. Locked notes use one shared LockNote password; folders keep individual passwords. Only SHA-256 hashes are stored and checked before access. The LockNote password is separate from the Supabase account password, although a user may choose the same text. Settings can change it with the old password or send a one-time reset link to the safely linked account email. Note contents are stored in plaintext in the local database, account sync, and portable JSON backup files; LockNote does not end-to-end encrypt them. Anyone with direct access to local storage, authorized account data, or a backup file can read notes regardless of a lock. Do not treat this as secure storage for sensitive data.

## Project layout

```
App.js                    # Entry: initializes DB, renders navigator
src/
├── db/
│   ├── sqlite.js          # SQLite init + schema (native)
│   ├── folderRepo.js      # Folder CRUD (native, SQLite)
│   ├── folderRepo.web.js  # Folder CRUD (web, AsyncStorage)
│   ├── noteRepo.js        # Note CRUD + search (native, SQLite)
│   └── noteRepo.web.js    # Note CRUD + search (web, AsyncStorage)
├── navigation/
│   └── AppNavigator.js    # Bottom tabs (Home stack + Settings)
├── screens/               # Home, Folder, NoteEditor, Settings
├── components/            # FolderItem, NoteItem, PasswordModal
└── utils/
    └── crypto.js          # SHA-256 password hashing
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together, [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for current status and the todo list, and [docs/ROADMAP.md](docs/ROADMAP.md) for the phased product plan.
