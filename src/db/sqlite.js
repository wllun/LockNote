import { Platform } from 'react-native';

let db = null;

export const getDB = () => {
  if (Platform.OS === 'web') {
    throw new Error('SQLite is not available on web. Use AsyncStorage repos instead.');
  }
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
};

export const initDB = async () => {
  if (Platform.OS === 'web') {
    return { type: 'web' };
  }

  const SQLite = require('expo-sqlite');
  db = await SQLite.openDatabaseAsync('locknote.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      password TEXT,
      is_deleted INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      cloud_id TEXT,
      cloud_owner_id TEXT,
      share_origin TEXT NOT NULL DEFAULT 'private',
      share_role TEXT,
      collaborator_count INTEGER NOT NULL DEFAULT 0,
      server_revision INTEGER NOT NULL DEFAULT 0,
      last_edited_by_id TEXT,
      last_edited_by_email TEXT,
      last_edited_at TEXT,
      sync_status TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      folder_id TEXT,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      note_type TEXT NOT NULL DEFAULT 'note',
      password TEXT,
      is_deleted INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
    CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_folders_is_deleted ON folders(is_deleted);
  `);

  // Migrate is_pinned onto DBs created before this column existed.
  // ponytail: pragma-guarded ALTER TABLE — no migration framework for a two-table app.
  for (const table of ['folders', 'notes']) {
    const cols = await db.getAllAsync(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === 'is_pinned')) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN is_pinned INTEGER DEFAULT 0`);
    }
  }

  // Existing databases predate multiple note types.
  const noteColumns = await db.getAllAsync('PRAGMA table_info(notes)');
  if (!noteColumns.some((column) => column.name === 'note_type')) {
    await db.execAsync(`ALTER TABLE notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'note'`);
  }

  const collaborationColumns = [
    ['cloud_id', 'TEXT'],
    ['cloud_owner_id', 'TEXT'],
    ['share_origin', "TEXT NOT NULL DEFAULT 'private'"],
    ['share_role', 'TEXT'],
    ['collaborator_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['server_revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_edited_by_id', 'TEXT'],
    ['last_edited_by_email', 'TEXT'],
    ['last_edited_at', 'TEXT'],
    ['sync_status', 'TEXT'],
    ['last_synced_at', 'TEXT'],
  ];
  const migratedColumns = await db.getAllAsync('PRAGMA table_info(notes)');
  for (const [name, definition] of collaborationColumns) {
    if (!migratedColumns.some((column) => column.name === name)) {
      await db.execAsync(`ALTER TABLE notes ADD COLUMN ${name} ${definition}`);
    }
  }
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_cloud_id ON notes(cloud_id) WHERE cloud_id IS NOT NULL');

  return db;
};
