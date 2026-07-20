# LockNote

A local, offline note-taking app with folder organization and per-item password protection. Built with Expo / React Native.

## Features

- Folders and notes, with notes nested in folders or at the root
- Optional password lock on any folder or note (SHA-256 gated — see [Security](#security))
- Auto-save while editing (debounced)
- Full-text search across notes (native)
- Soft delete (items are flagged, not immediately purged)
- Runs on iOS, Android, and web

## Requirements

- Node.js 18+
- Expo CLI (`npx expo`)

## Run

```bash
npm install
npm start        # then press i / a / w for iOS, Android, web
```

No account, backend, or configuration needed — all data is stored locally on the device.

## Storage

Data lives entirely on-device. There is no server or sync:

- **iOS / Android** — SQLite (`expo-sqlite`), database file `locknote.db`
- **Web** — AsyncStorage (localStorage), via `*.web.js` repo variants

## Security

Password protection is **access gating, not encryption**. A folder/note password is stored as a SHA-256 hash and checked before opening the item. Note contents are stored in plaintext in the local database. Anyone with direct access to the device's storage can read notes regardless of a lock. Do not treat this as secure storage for sensitive data.

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
