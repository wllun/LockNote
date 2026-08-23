import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from '../utils/crypto';
import { COLLABORATION_DEFAULTS, normalizeCollaborationNote } from '../utils/collaboration-note.mjs';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

const NOTES_KEY = '@locknote_notes';

const getStorage = async () => {
  const data = await AsyncStorage.getItem(NOTES_KEY);
  return data ? JSON.parse(data) : [];
};

const saveStorage = async (notes) => {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
};

// Keep read-modify-write operations in order. Without this queue, an editor's
// final auto-save can race a move and write an older folder_id back to storage.
let mutationQueue = Promise.resolve();

const mutateStorage = (mutation) => {
  const operation = mutationQueue.then(async () => {
    const notes = await getStorage();
    const result = await mutation(notes);
    await saveStorage(notes);
    return result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
};

const normalizeNote = normalizeCollaborationNote;

export const noteRepo = {
  async getRootNotes() {
    const notes = await getStorage();
    return notes
      .filter((n) => n.folder_id === null && !n.is_deleted && n.share_origin !== 'incoming')
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getByFolderId(folderId) {
    const notes = await getStorage();
    return notes
      .filter((n) => n.folder_id === folderId && !n.is_deleted && n.share_origin !== 'incoming')
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeNote);
  },

  async getById(id) {
    const notes = await getStorage();
    const note = notes.find((n) => n.id === id && !n.is_deleted);
    return note ? normalizeNote(note) : null;
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
    await mutateStorage((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index !== -1) {
        notes[index].is_deleted = 1;
        notes[index].updated_at = now();
      }
    });
  },

  async hardDelete(id) {
    await mutateStorage((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index !== -1) notes.splice(index, 1);
    });
  },

  async search(query) {
    const notes = await getStorage();
    return notes
      .filter(
        (n) =>
          !n.is_deleted &&
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
      .filter((note) => !note.is_deleted && note.share_origin === 'incoming')
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
};
