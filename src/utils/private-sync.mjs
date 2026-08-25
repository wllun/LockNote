import {
  COLLABORATION_DEFAULTS,
  SHARE_ORIGIN_INCOMING,
  normalizeCollaborationNote,
} from './collaboration-note.mjs';
import { parseReminderNote, serializeReminderNote } from './reminder-note.mjs';

const SUPPORTED_NOTE_TYPES = new Set(['note', 'checklist', 'expense', 'reminder']);

const asBoolean = (value) => value === true || value === 1;

const reminderContentForCloud = (content) => {
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

const reminderContentForDevice = (cloudContent, localContent) => {
  if (!localContent) return cloudContent;
  const cloud = parseReminderNote(cloudContent);
  const local = parseReminderNote(localContent);
  return serializeReminderNote({ body: cloud.body, reminder: local.reminder });
};

export const folderRecordForCloud = (folder) => ({
  id: String(folder.id),
  name: String(folder.name ?? ''),
  password: folder.password || null,
  is_pinned: asBoolean(folder.is_pinned),
  is_archived: asBoolean(folder.is_archived),
  is_deleted: false,
  created_at: folder.created_at,
  updated_at: folder.updated_at,
});

export const noteRecordForCloud = (note) => {
  const normalized = normalizeCollaborationNote(note);
  const noteType = SUPPORTED_NOTE_TYPES.has(normalized.note_type)
    ? normalized.note_type
    : 'note';
  return {
    id: String(normalized.id),
    folder_id: normalized.folder_id ?? null,
    title: String(normalized.title ?? ''),
    content: noteType === 'reminder'
      ? reminderContentForCloud(normalized.content)
      : String(normalized.content ?? ''),
    note_type: noteType,
    password: normalized.password || null,
    is_pinned: asBoolean(normalized.is_pinned),
    is_archived: asBoolean(normalized.is_archived),
    is_deleted: false,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
    collaboration: {
      cloud_id: normalized.cloud_id,
      cloud_owner_id: normalized.cloud_owner_id,
      share_origin: normalized.share_origin,
      share_role: normalized.share_role,
      collaborator_count: normalized.collaborator_count,
      server_revision: normalized.server_revision,
      last_edited_by_id: normalized.last_edited_by_id,
      last_edited_by_email: normalized.last_edited_by_email,
      last_edited_at: normalized.last_edited_at,
    },
  };
};

const tombstoneForCloud = (tombstone) => ({
  id: String(tombstone.id),
  is_deleted: true,
  created_at: tombstone.updated_at,
  updated_at: tombstone.updated_at,
});

const latestSnapshotItems = (records, tombstones, mapRecord) => {
  const byId = new Map();
  for (const record of records || []) {
    const mapped = mapRecord(record);
    const current = byId.get(mapped.id);
    if (!current || new Date(mapped.updated_at) > new Date(current.updated_at)) {
      byId.set(mapped.id, mapped);
    }
  }
  for (const tombstone of tombstones || []) {
    const mapped = tombstoneForCloud(tombstone);
    const current = byId.get(mapped.id);
    // A deletion wins an exact timestamp tie.
    if (!current || new Date(mapped.updated_at) >= new Date(current.updated_at)) {
      byId.set(mapped.id, mapped);
    }
  }
  return [...byId.values()];
};

export const buildSyncPayload = (folderSnapshot, noteSnapshot) => ({
  folders: latestSnapshotItems(
    folderSnapshot?.records,
    folderSnapshot?.tombstones,
    folderRecordForCloud,
  ),
  notes: latestSnapshotItems(
    (noteSnapshot?.records || []).filter(
      (note) => note.share_origin !== SHARE_ORIGIN_INCOMING,
    ),
    noteSnapshot?.tombstones,
    noteRecordForCloud,
  ),
});

export const parseSyncResponse = (response) => {
  if (!response || !Array.isArray(response.folders) || !Array.isArray(response.notes)) {
    throw new Error('The sync server returned an invalid response.');
  }
  return response;
};

export const cloudFolderForLocal = (folder, existing = null) => ({
  id: folder.id,
  name: folder.name || '',
  password: folder.password || null,
  is_pinned: asBoolean(folder.is_pinned) ? 1 : 0,
  is_archived: folder.is_archived === undefined
    ? existing?.is_archived ? 1 : 0
    : asBoolean(folder.is_archived) ? 1 : 0,
  created_at: folder.created_at,
  updated_at: folder.updated_at,
});

export const cloudNoteForLocal = (note, existing = null) => {
  const collaboration = note.collaboration && typeof note.collaboration === 'object'
    ? note.collaboration
    : {};
  const noteType = SUPPORTED_NOTE_TYPES.has(note.note_type) ? note.note_type : 'note';
  const localContent = noteType === 'reminder'
    ? reminderContentForDevice(note.content || '', existing?.content)
    : String(note.content ?? '');
  return normalizeCollaborationNote({
    ...COLLABORATION_DEFAULTS,
    ...collaboration,
    id: note.id,
    folder_id: note.folder_id ?? null,
    title: note.title || '',
    content: localContent,
    note_type: noteType,
    password: note.password || null,
    is_pinned: asBoolean(note.is_pinned) ? 1 : 0,
    is_archived: note.is_archived === undefined
      ? existing?.is_archived ? 1 : 0
      : asBoolean(note.is_archived) ? 1 : 0,
    created_at: note.created_at,
    updated_at: note.updated_at,
    sync_status: collaboration.cloud_id ? 'synced' : null,
  });
};

export const syncErrorMessage = (error) => {
  if (error?.code === '42883' || /sync_private_data/i.test(error?.message || '')) {
    return 'Cloud sync is not set up for this build yet. Apply the latest Supabase migration and try again.';
  }
  if (/network|fetch|offline/i.test(error?.message || '')) {
    return 'Could not reach the sync service. Your local notes are unchanged; try again when you are online.';
  }
  return 'Could not sync notes. Your local notes are unchanged; try again.';
};
