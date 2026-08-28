import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from '../utils/crypto';
import { COLLABORATION_DEFAULTS, normalizeCollaborationNote } from '../utils/collaboration-note.mjs';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

const NOTES_KEY = '@locknote_notes';
const TOMBSTONES_KEY = '@locknote_note_sync_tombstones';
const FOLDERS_KEY = '@locknote_folders';

const getStorage = async () => {
  const data = await AsyncStorage.getItem(NOTES_KEY);
  return data ? JSON.parse(data) : [];
};

const getTombstones = async () => {
  const data = await AsyncStorage.getItem(TOMBSTONES_KEY);
  return data ? JSON.parse(data) : [];
};

// Keep read-modify-write operations in order. Without this queue, an editor's
// final auto-save can race a move and write an older folder_id back to storage.
let mutationQueue = Promise.resolve();

const mutateStorage = (mutation) => {
  const operation = mutationQueue.then(async () => {
    const [notes, tombstones] = await Promise.all([getStorage(), getTombstones()]);
    const result = await mutation(notes, tombstones);
    await AsyncStorage.multiSet([
      [NOTES_KEY, JSON.stringify(notes)],
      [TOMBSTONES_KEY, JSON.stringify(tombstones)],
    ]);
    return result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
};

const upsertTombstone = (tombstones, id, updatedAt) => {
  const existing = tombstones.find((item) => item.id === id);
  if (!existing) tombstones.push({ id, updated_at: updatedAt });
  else if (new Date(updatedAt) >= new Date(existing.updated_at)) existing.updated_at = updatedAt;
};

const normalizeNote = normalizeCollaborationNote;

export const noteRepo = {
  async getRootNotes() {
    const notes = await getStorage();
    return notes
      .filter((n) => n.folder_id === null && !n.is_deleted && !n.is_archived && n.share_origin !== 'incoming')
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getByFolderId(folderId) {
    const notes = await getStorage();
    return notes
      .filter((n) => n.folder_id === folderId && !n.is_deleted && !n.is_archived && n.share_origin !== 'incoming')
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getById(id) {
    const notes = await getStorage();
    const note = notes.find((n) => n.id === id && !n.is_deleted);
    return note ? normalizeNote(note) : null;
  },

  // Trash is the only UI allowed to read soft-deleted note records.
  async getDeleted() {
    const notes = await getStorage();
    return notes
      .filter((note) => !!note.is_deleted)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getActiveByFolderId(folderId) {
    const notes = await getStorage();
    return notes
      .filter((note) =>
        note.folder_id === folderId && !note.is_deleted && note.share_origin !== 'incoming'
      )
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getArchived() {
    const notes = await getStorage();
    return notes
      .filter((note) => !note.is_deleted && !!note.is_archived && note.share_origin !== 'incoming')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async create(folderId = null, title = '', content = '', password = null, noteType = 'note') {
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    const newNote = {
      id,
      folder_id: folderId,
      title,
      content,
      note_type: noteType,
      password: passwordHash,
      is_deleted: 0,
      is_pinned: 0,
      is_archived: 0,
      created_at: timestamp,
      updated_at: timestamp,
      ...COLLABORATION_DEFAULTS,
    };

    return await mutateStorage((notes) => {
      notes.push(newNote);
      return normalizeNote(newNote);
    });
  },

  async update(id, updates) {
    const passwordHash = updates.password !== undefined
      ? updates.password
        ? await hashPassword(updates.password)
        : null
      : undefined;

    return await mutateStorage((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) return null;

      if (updates.title !== undefined) notes[index].title = updates.title;
      if (updates.content !== undefined) notes[index].content = updates.content;
      if (updates.folder_id !== undefined) notes[index].folder_id = updates.folder_id;
      if (updates.note_type !== undefined) notes[index].note_type = updates.note_type;
      if (updates.password !== undefined) notes[index].password = passwordHash;
      if (updates.is_pinned !== undefined) {
        notes[index].is_pinned = updates.is_pinned ? 1 : 0;
      }
      if (updates.is_archived !== undefined) {
        notes[index].is_archived = updates.is_archived ? 1 : 0;
      }
      for (const field of [
        'cloud_id', 'cloud_owner_id', 'share_origin', 'share_role',
        'collaborator_count', 'server_revision', 'last_edited_by_id',
        'last_edited_by_email', 'last_edited_at', 'sync_status', 'last_synced_at',
      ]) {
        if (updates[field] !== undefined) notes[index][field] = updates[field];
      }
      notes[index].updated_at = now();
      return normalizeNote(notes[index]);
    });
  },

  async replaceLockedPasswordHash(newPasswordHash, currentPasswordHash = null) {
    return await mutateStorage((notes) => {
      const timestamp = now();
      let updatedCount = 0;
      for (const note of notes) {
        if (
          note.is_deleted ||
          note.share_origin === 'incoming' ||
          !note.password ||
          (currentPasswordHash && note.password !== currentPasswordHash)
        ) {
          continue;
        }
        note.password = newPasswordHash;
        note.updated_at = timestamp;
        updatedCount += 1;
      }
      return updatedCount;
    });
  },

  async move(id, folderId = null) {
    return await mutateStorage((notes) => {
      const note = notes.find((item) => item.id === id && !item.is_deleted);
      if (!note) return null;
      note.folder_id = folderId;
      note.updated_at = now();
      return normalizeNote(note);
    });
  },

  async softDelete(id) {
    await mutateStorage((notes, tombstones) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index !== -1) {
        const timestamp = now();
        notes[index].is_deleted = 1;
        notes[index].is_archived = 0;
        notes[index].updated_at = timestamp;
        if (notes[index].share_origin !== 'incoming') {
          upsertTombstone(tombstones, id, timestamp);
        }
      }
    });
  },

  async archive(id) {
    return await mutateStorage((notes) => {
      const note = notes.find((item) =>
        item.id === id && !item.is_deleted && item.share_origin !== 'incoming'
      );
      if (!note) return null;
      note.is_archived = 1;
      note.updated_at = now();
      return normalizeNote(note);
    });
  },

  async unarchive(id) {
    return await mutateStorage((notes) => {
      const note = notes.find((item) =>
        item.id === id && !item.is_deleted && item.share_origin !== 'incoming'
      );
      if (!note) return null;
      note.is_archived = 0;
      note.updated_at = now();
      return normalizeNote(note);
    });
  },

  async restore(id, folderId = null) {
    return await mutateStorage((notes, tombstones) => {
      const note = notes.find((item) => item.id === id && item.is_deleted);
      if (!note || note.share_origin === 'incoming') return null;

      Object.assign(note, COLLABORATION_DEFAULTS, {
        folder_id: folderId,
        is_deleted: 0,
        is_archived: 0,
        updated_at: now(),
      });
      const tombstoneIndex = tombstones.findIndex((item) => item.id === id);
      if (tombstoneIndex !== -1) tombstones.splice(tombstoneIndex, 1);
      return normalizeNote(note);
    });
  },

  async detachFromFolder(folderId) {
    await mutateStorage((notes) => {
      const timestamp = now();
      for (const note of notes) {
        if (note.folder_id !== folderId) continue;
        note.folder_id = null;
        if (!note.is_deleted) note.updated_at = timestamp;
      }
    });
  },

  async hardDelete(id) {
    await mutateStorage((notes, tombstones) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index !== -1) {
        if (notes[index].share_origin !== 'incoming') upsertTombstone(tombstones, id, now());
        notes.splice(index, 1);
      }
    });
  },

  async search(query) {
    const [notes, folderData] = await Promise.all([
      getStorage(),
      AsyncStorage.getItem(FOLDERS_KEY),
    ]);
    const folders = folderData ? JSON.parse(folderData) : [];
    const archivedFolderIds = new Set(
      folders
        .filter((folder) => !folder.is_deleted && !!folder.is_archived)
        .map((folder) => folder.id)
    );
    return notes
      .filter(
        (n) =>
          !n.is_deleted &&
          !n.is_archived &&
          !archivedFolderIds.has(n.folder_id) &&
          n.share_origin !== 'incoming' &&
          (n.title.toLowerCase().includes(query.toLowerCase()) ||
            n.content.toLowerCase().includes(query.toLowerCase()))
      )
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getSharedWithMe() {
    const notes = await getStorage();
    return notes
      .filter((note) => !note.is_deleted && !note.is_archived && note.share_origin === 'incoming')
      .sort((a, b) => new Date(b.last_edited_at || b.updated_at) - new Date(a.last_edited_at || a.updated_at))
      .map(normalizeNote);
  },

  async getByCloudId(cloudId) {
    const notes = await getStorage();
    const note = notes.find((item) => item.cloud_id === cloudId && !item.is_deleted);
    return note ? normalizeNote(note) : null;
  },

  async upsertSharedCache(remote) {
    const existing = await this.getByCloudId(remote.cloud_id);
    if (existing) return await this.update(existing.id, remote);
    const created = await this.create(null, remote.title, remote.content, null, remote.note_type);
    return await this.update(created.id, remote);
  },

  async getSyncSnapshot() {
    await mutationQueue;
    const [notes, tombstones] = await Promise.all([getStorage(), getTombstones()]);
    return {
      records: notes
        .filter((note) => !note.is_deleted && note.share_origin !== 'incoming')
        .map(normalizeNote),
      tombstones,
    };
  },

  async applySyncSnapshot(records = [], tombstones = []) {
    await mutateStorage((notes, localTombstones) => {
      for (const remote of records) {
        const normalized = normalizeNote({
          ...remote,
          is_deleted: 0,
          is_pinned: remote.is_pinned ? 1 : 0,
          is_archived: remote.is_archived ? 1 : 0,
        });
        const index = notes.findIndex((note) => note.id === remote.id);
        if (index === -1) {
          notes.push(normalized);
        } else if (
          notes[index].share_origin !== 'incoming' &&
          new Date(remote.updated_at) >= new Date(notes[index].updated_at)
        ) {
          notes[index] = { ...notes[index], ...normalized };
        }
        const tombstoneIndex = localTombstones.findIndex((item) =>
          item.id === remote.id && new Date(item.updated_at) <= new Date(remote.updated_at)
        );
        if (tombstoneIndex !== -1) localTombstones.splice(tombstoneIndex, 1);
      }

      for (const tombstone of tombstones) {
        upsertTombstone(localTombstones, tombstone.id, tombstone.updated_at);
        const note = notes.find((item) =>
          item.id === tombstone.id && item.share_origin !== 'incoming'
        );
        if (note && new Date(note.updated_at) <= new Date(tombstone.updated_at)) {
          note.is_deleted = 1;
          note.is_archived = 0;
          note.updated_at = tombstone.updated_at;
        }
      }
    });
  },

  async replaceBackupSnapshot(records = [], tombstones = []) {
    await mutateStorage((notes, localTombstones) => {
      const incomingNotes = notes.filter((note) => note.share_origin === 'incoming');
      const incomingIds = new Set(incomingNotes.map((note) => note.id));
      const restoredNotes = records
        .filter((note) => !incomingIds.has(note.id))
        .map((note) => normalizeNote({
          ...note,
          is_deleted: 0,
          is_pinned: note.is_pinned ? 1 : 0,
          is_archived: note.is_archived ? 1 : 0,
          ...COLLABORATION_DEFAULTS,
        }));
      notes.splice(0, notes.length, ...incomingNotes, ...restoredNotes);
      localTombstones.splice(0, localTombstones.length, ...tombstones);
    });
  },
};
