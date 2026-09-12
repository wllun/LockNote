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
      parent_id TEXT,
      name TEXT NOT NULL,
      password TEXT,
      is_deleted INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
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
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL
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
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_tombstones (
      entity_type TEXT NOT NULL CHECK (entity_type IN ('folder', 'note')),
      entity_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS note_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      byte_size INTEGER NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      anchor_offset INTEGER NOT NULL DEFAULT 0,
      display_width_ratio REAL NOT NULL DEFAULT 1,
      cloud_path TEXT,
      sync_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
    CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_folders_is_deleted ON folders(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id
      ON note_attachments(note_id, display_order);
  `);

  const attachmentColumns = await db.getAllAsync('PRAGMA table_info(note_attachments)');
  if (!attachmentColumns.some((column) => column.name === 'anchor_offset')) {
    await db.execAsync('ALTER TABLE note_attachments ADD COLUMN anchor_offset INTEGER NOT NULL DEFAULT 0');
  }
  if (!attachmentColumns.some((column) => column.name === 'display_width_ratio')) {
    await db.execAsync('ALTER TABLE note_attachments ADD COLUMN display_width_ratio REAL NOT NULL DEFAULT 1');
  }

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
  // Note color is a device preference in AsyncStorage, not note data.
  if (noteColumns.some((column) => column.name === 'color')) {
    await db.execAsync(`ALTER TABLE notes DROP COLUMN color`);
  }

  const folderColumns = await db.getAllAsync('PRAGMA table_info(folders)');
  if (!folderColumns.some((column) => column.name === 'parent_id')) {
    await db.execAsync(`ALTER TABLE folders ADD COLUMN parent_id TEXT`);
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)');
  if (!folderColumns.some((column) => column.name === 'is_archived')) {
    await db.execAsync(`ALTER TABLE folders ADD COLUMN is_archived INTEGER DEFAULT 0`);
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_folders_is_archived ON folders(is_archived)');
  if (!noteColumns.some((column) => column.name === 'is_archived')) {
    await db.execAsync(`ALTER TABLE notes ADD COLUMN is_archived INTEGER DEFAULT 0`);
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_notes_is_archived ON notes(is_archived)');

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

  // Preserve deletions made before account sync was introduced so an older
  // copy on another device cannot bring those rows back.
  await db.execAsync(`
    INSERT OR IGNORE INTO sync_tombstones (entity_type, entity_id, deleted_at)
    SELECT 'folder', id, updated_at FROM folders WHERE is_deleted = 1;
    INSERT OR IGNORE INTO sync_tombstones (entity_type, entity_id, deleted_at)
    SELECT 'note', id, updated_at FROM notes
    WHERE is_deleted = 1 AND share_origin != 'incoming';
  `);

  return db;
};
