import { parseReminderNote, serializeReminderNote } from './reminder-note.mjs';

export const BACKUP_FORMAT = 'locknote-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

const MAX_RECORDS_PER_COLLECTION = 100000;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 10000;
const MAX_TITLE_LENGTH = 100000;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const NOTE_TYPES = new Set(['note', 'checklist', 'expense', 'reminder']);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

const fail = (message) => {
  throw new Error(`Invalid LockNote backup: ${message}`);
};

const ensureObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is missing.`);
  return value;
};

const ensureArray = (value, label) => {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  if (value.length > MAX_RECORDS_PER_COLLECTION) fail(`${label} has too many items.`);
  return value;
};

const ensureString = (value, label, maxLength, { allowEmpty = true } = {}) => {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  if (!allowEmpty && !value) fail(`${label} cannot be empty.`);
  if (value.length > maxLength) fail(`${label} is too long.`);
  return value;
};

const ensureId = (value, label) => ensureString(value, label, MAX_ID_LENGTH, { allowEmpty: false });

const ensureTimestamp = (value, label) => {
  ensureString(value, label, 64, { allowEmpty: false });
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`${label} is not a valid timestamp.`);
  return date.toISOString();
};

const ensurePasswordHash = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail(`${label} must be a SHA-256 hash, never a plaintext password.`);
  }
  return value.toLowerCase();
};

const ensurePinned = (value, label) => {
  if (value !== 0 && value !== 1 && value !== false && value !== true) {
    fail(`${label} must be true or false.`);
  }
  return value ? 1 : 0;
};

const portableReminderContent = (content) => {
  const parsed = parseReminderNote(content);
  return serializeReminderNote({
    body: parsed.body,
    reminder: {
      ...parsed.reminder,
      enabled: false,
      notificationIds: [],
    },
  });
};

const portableFolder = (folder) => ({
  id: folder.id,
  name: folder.name,
  password: folder.password || null,
  is_pinned: folder.is_pinned ? 1 : 0,
  created_at: folder.created_at,
  updated_at: folder.updated_at,
});

const portableNote = (note) => ({
  id: note.id,
  folder_id: note.folder_id ?? null,
  title: note.title || '',
  content: note.note_type === 'reminder' ? portableReminderContent(note.content) : note.content || '',
  note_type: note.note_type || 'note',
  password: note.password || null,
  is_pinned: note.is_pinned ? 1 : 0,
  created_at: note.created_at,
  updated_at: note.updated_at,
});

const portableTombstone = (item) => ({ id: item.id, updated_at: item.updated_at });

export const createBackupDocument = (
  folderSnapshot,
  noteSnapshot,
  { exportedAt = new Date().toISOString(), appVersion = 'unknown' } = {}
) => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exported_at: exportedAt,
  app: { name: 'LockNote', version: String(appVersion || 'unknown') },
  folders: {
    records: (folderSnapshot?.records || []).map(portableFolder),
    tombstones: (folderSnapshot?.tombstones || []).map(portableTombstone),
  },
  notes: {
    records: (noteSnapshot?.records || [])
      .filter((note) => note.share_origin !== 'incoming')
      .map(portableNote),
    tombstones: (noteSnapshot?.tombstones || []).map(portableTombstone),
  },
});

export const serializeBackupDocument = (backup) => `${JSON.stringify(backup, null, 2)}\n`;

const utf8ByteLength = (text) => {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
};

const normalizeTombstones = (items, label, activeIds) => {
  const seen = new Set();
  return ensureArray(items, label).map((item, index) => {
    ensureObject(item, `${label}[${index}]`);
    const id = ensureId(item.id, `${label}[${index}].id`);
    if (seen.has(id)) fail(`${label} contains duplicate id ${id}.`);
    if (activeIds.has(id)) fail(`${label} contains an active and deleted copy of ${id}.`);
    seen.add(id);
    return { id, updated_at: ensureTimestamp(item.updated_at, `${label}[${index}].updated_at`) };
  });
};

const normalizeFolders = (section) => {
  ensureObject(section, 'folders');
  const seen = new Set();
  const records = ensureArray(section.records, 'folders.records').map((folder, index) => {
    ensureObject(folder, `folders.records[${index}]`);
    const id = ensureId(folder.id, `folders.records[${index}].id`);
    if (seen.has(id)) fail(`folders.records contains duplicate id ${id}.`);
    seen.add(id);
    return {
      id,
      name: ensureString(folder.name, `folders.records[${index}].name`, MAX_NAME_LENGTH),
      password: ensurePasswordHash(folder.password, `folders.records[${index}].password`),
      is_pinned: ensurePinned(folder.is_pinned, `folders.records[${index}].is_pinned`),
      created_at: ensureTimestamp(folder.created_at, `folders.records[${index}].created_at`),
      updated_at: ensureTimestamp(folder.updated_at, `folders.records[${index}].updated_at`),
    };
  });
  return {
    records,
    tombstones: normalizeTombstones(section.tombstones, 'folders.tombstones', seen),
    activeIds: seen,
  };
};

const normalizeNotes = (section, folderIds) => {
  ensureObject(section, 'notes');
  const seen = new Set();
  const records = ensureArray(section.records, 'notes.records').map((note, index) => {
    ensureObject(note, `notes.records[${index}]`);
    const id = ensureId(note.id, `notes.records[${index}].id`);
    if (seen.has(id)) fail(`notes.records contains duplicate id ${id}.`);
    seen.add(id);

    const folderId = note.folder_id === null
      ? null
      : ensureId(note.folder_id, `notes.records[${index}].folder_id`);
    if (folderId !== null && !folderIds.has(folderId)) {
      fail(`note ${id} refers to a folder that is not in this backup.`);
    }

    const noteType = ensureString(note.note_type, `notes.records[${index}].note_type`, 32, {
      allowEmpty: false,
    });
    if (!NOTE_TYPES.has(noteType)) fail(`note ${id} has an unsupported note type.`);
    const rawContent = ensureString(note.content, `notes.records[${index}].content`, MAX_CONTENT_LENGTH);

    return {
      id,
      folder_id: folderId,
      title: ensureString(note.title, `notes.records[${index}].title`, MAX_TITLE_LENGTH),
      content: noteType === 'reminder' ? portableReminderContent(rawContent) : rawContent,
      note_type: noteType,
      password: ensurePasswordHash(note.password, `notes.records[${index}].password`),
      is_pinned: ensurePinned(note.is_pinned, `notes.records[${index}].is_pinned`),
      created_at: ensureTimestamp(note.created_at, `notes.records[${index}].created_at`),
      updated_at: ensureTimestamp(note.updated_at, `notes.records[${index}].updated_at`),
      cloud_id: null,
      cloud_owner_id: null,
      share_origin: 'private',
      share_role: null,
      collaborator_count: 0,
      server_revision: 0,
      last_edited_by_id: null,
      last_edited_by_email: null,
      last_edited_at: null,
      sync_status: null,
      last_synced_at: null,
    };
  });
  return {
    records,
    tombstones: normalizeTombstones(section.tombstones, 'notes.tombstones', seen),
  };
};

export const validateBackupDocument = (value) => {
  const backup = ensureObject(value, 'backup');
  if (backup.format !== BACKUP_FORMAT) fail('the file format is not recognized.');
  if (backup.version !== BACKUP_VERSION) {
    fail(`schema version ${String(backup.version)} is not supported by this app.`);
  }

  const exportedAt = ensureTimestamp(backup.exported_at, 'exported_at');
  const folders = normalizeFolders(backup.folders);
  const notes = normalizeNotes(backup.notes, folders.activeIds);
  const normalized = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    app: {
      name: typeof backup.app?.name === 'string' ? backup.app.name : 'LockNote',
      version: typeof backup.app?.version === 'string' ? backup.app.version : 'unknown',
    },
    folders: { records: folders.records, tombstones: folders.tombstones },
    notes,
  };

  return {
    backup: normalized,
    summary: {
      folderCount: folders.records.length,
      noteCount: notes.records.length,
      deletedCount: folders.tombstones.length + notes.tombstones.length,
      exportedAt,
    },
  };
};

export const parseBackupText = (text) => {
  if (typeof text !== 'string') fail('the selected file could not be read as text.');
  if (utf8ByteLength(text) > MAX_BACKUP_BYTES) {
    fail('the selected file is larger than 25 MB.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('the selected file is not valid JSON.');
  }
  return validateBackupDocument(parsed);
};

export const createBackupFilename = (date = new Date()) =>
  `locknote-backup-${date.toISOString().replace(/[:.]/g, '-')}.json`;
