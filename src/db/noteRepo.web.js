import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from '../utils/crypto';

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

export const noteRepo = {
  async getRootNotes() {
    const notes = await getStorage();
    return notes
      .filter((n) => n.folder_id === null && !n.is_deleted)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  async getByFolderId(folderId) {
    const notes = await getStorage();
    return notes
      .filter((n) => n.folder_id === folderId && !n.is_deleted)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  async getById(id) {
    const notes = await getStorage();
    return notes.find((n) => n.id === id && !n.is_deleted) || null;
  },

  async create(folderId = null, title = '', content = '', password = null) {
    const notes = await getStorage();
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    const newNote = {
      id,
      folder_id: folderId,
      title,
      content,
      password: passwordHash,
      is_deleted: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };

    notes.push(newNote);
    await saveStorage(notes);
    return newNote;
  },

  async update(id, updates) {
    const notes = await getStorage();
    const index = notes.findIndex((n) => n.id === id);
    if (index === -1) return null;

    if (updates.title !== undefined) notes[index].title = updates.title;
    if (updates.content !== undefined) notes[index].content = updates.content;
    if (updates.folder_id !== undefined) notes[index].folder_id = updates.folder_id;
    if (updates.password !== undefined) {
      const passwordHash = updates.password ? await hashPassword(updates.password) : null;
      notes[index].password = passwordHash;
    }
    notes[index].updated_at = now();

    await saveStorage(notes);
    return notes[index];
  },

  async softDelete(id) {
    const notes = await getStorage();
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) {
      notes[index].is_deleted = 1;
      notes[index].updated_at = now();
      await saveStorage(notes);
    }
  },

  async hardDelete(id) {
    let notes = await getStorage();
    notes = notes.filter((n) => n.id !== id);
    await saveStorage(notes);
  },

  async search(query) {
    const notes = await getStorage();
    return notes
      .filter(
        (n) =>
          !n.is_deleted &&
          (n.title.toLowerCase().includes(query.toLowerCase()) ||
            n.content.toLowerCase().includes(query.toLowerCase()))
      )
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },
};
