import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from '../utils/crypto';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

const FOLDERS_KEY = '@locknote_folders';

const getStorage = async () => {
  const data = await AsyncStorage.getItem(FOLDERS_KEY);
  return data ? JSON.parse(data) : [];
};

const saveStorage = async (folders) => {
  await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
};

export const folderRepo = {
  async getAll() {
    const folders = await getStorage();
    return folders
      .filter((f) => !f.is_deleted)
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.created_at) - new Date(a.created_at));
  },

  async getById(id) {
    const folders = await getStorage();
    return folders.find((f) => f.id === id && !f.is_deleted) || null;
  },

  async create(name, password = null) {
    const folders = await getStorage();
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    const newFolder = {
      id,
      name,
      password: passwordHash,
      is_deleted: 0,
      is_pinned: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };

    folders.push(newFolder);
    await saveStorage(folders);
    return newFolder;
  },

  async update(id, updates) {
    const folders = await getStorage();
    const index = folders.findIndex((f) => f.id === id);
    if (index === -1) return null;

    if (updates.name !== undefined) {
      folders[index].name = updates.name;
    }
    if (updates.password !== undefined) {
      const passwordHash = updates.password ? await hashPassword(updates.password) : null;
      folders[index].password = passwordHash;
    }
    if (updates.is_pinned !== undefined) {
      folders[index].is_pinned = updates.is_pinned ? 1 : 0;
    }
    folders[index].updated_at = now();

    await saveStorage(folders);
    return folders[index];
  },

  async softDelete(id) {
    const folders = await getStorage();
    const index = folders.findIndex((f) => f.id === id);
    if (index !== -1) {
      folders[index].is_deleted = 1;
      folders[index].updated_at = now();
      await saveStorage(folders);
    }
  },

  async hardDelete(id) {
    let folders = await getStorage();
    folders = folders.filter((f) => f.id !== id);
    await saveStorage(folders);
  },

  async getNoteCount(folderId) {
    const { noteRepo } = require('./noteRepo.web');
    const notes = await noteRepo.getByFolderId(folderId);
    return notes.length;
  },

  async search(query) {
    const folders = await getStorage();
    const q = query.toLowerCase();
    return folders
      .filter((f) => !f.is_deleted && f.name.toLowerCase().includes(q))
      .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || new Date(b.created_at) - new Date(a.created_at));
  },
};
