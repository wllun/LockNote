import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPassword } from '../utils/crypto';
import {
  flattenFolderHierarchy,
  getFolderDescendantIds,
  getFolderDepthLimitMessage,
  getFolderMoveError,
  getFolderPath,
  getVisibleFolders,
  getVisibleSubtreeFolderIds,
  MAX_FOLDER_DEPTH,
  sortFolderSiblings,
} from '../utils/folder-hierarchy.mjs';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

const FOLDERS_KEY = '@locknote_folders';
const TOMBSTONES_KEY = '@locknote_folder_sync_tombstones';

const getStorage = async () => {
  const data = await AsyncStorage.getItem(FOLDERS_KEY);
  return data ? JSON.parse(data) : [];
};

const getTombstones = async () => {
  const data = await AsyncStorage.getItem(TOMBSTONES_KEY);
  return data ? JSON.parse(data) : [];
};

let mutationQueue = Promise.resolve();

const mutateStorage = (mutation) => {
  const operation = mutationQueue.then(async () => {
    const [folders, tombstones] = await Promise.all([getStorage(), getTombstones()]);
    const result = await mutation(folders, tombstones);
    await AsyncStorage.multiSet([
      [FOLDERS_KEY, JSON.stringify(folders)],
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

export const folderRepo = {
  async getAll() {
    const folders = await getStorage();
    return flattenFolderHierarchy(folders);
  },

  async getRootFolders() {
    return (await this.getAll()).filter((folder) => folder.parent_id == null);
  },

  async getChildren(parentId) {
    if (!parentId) return [];
    return (await getStorage())
      .filter((folder) => !folder.is_deleted && !folder.is_archived && folder.parent_id === parentId)
      .sort(sortFolderSiblings);
  },

  async getAncestors(id) {
    return getFolderPath((await getStorage()).filter((folder) => !folder.is_deleted), id);
  },

  async getDescendantIds(id, includeArchived = true) {
    const stored = (await getStorage()).filter((folder) => !folder.is_deleted);
    const folders = includeArchived ? stored : getVisibleFolders(stored);
    return getFolderDescendantIds(folders, id);
  },

  async getById(id) {
    const folders = await getStorage();
    return folders.find((f) => f.id === id && !f.is_deleted) || null;
  },

  // Cleanup reads legacy soft-deleted folders so they can be discarded.
  async getDeleted() {
    const folders = await getStorage();
    return folders
      .filter((folder) => !!folder.is_deleted)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  async getArchived() {
    const folders = await getStorage();
    return folders
      .filter((folder) => !folder.is_deleted && !!folder.is_archived)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  async create(name, password = null, parentId = null) {
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;
    const stored = (await getStorage()).filter((folder) => !folder.is_deleted);
    if (parentId !== null) {
      const parent = stored.find((folder) => folder.id === parentId);
      if (!parent || parent.is_archived) throw new Error('The parent folder is unavailable.');
      if (getFolderPath(stored, parentId).length >= MAX_FOLDER_DEPTH) {
        throw new Error(getFolderDepthLimitMessage());
      }
    }

    const newFolder = {
      id,
      parent_id: parentId,
      name,
      password: passwordHash,
      is_deleted: 0,
      is_pinned: 0,
      is_archived: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };

    return await mutateStorage((folders) => {
      folders.push(newFolder);
      return newFolder;
    });
  },

  async update(id, updates) {
    const passwordHash = updates.password !== undefined
      ? updates.password ? await hashPassword(updates.password) : null
      : undefined;
    return await mutateStorage((folders) => {
      const index = folders.findIndex((f) => f.id === id);
      if (index === -1) return null;

      if (updates.name !== undefined) folders[index].name = updates.name;
      if (updates.password !== undefined) folders[index].password = passwordHash;
      if (updates.is_pinned !== undefined) folders[index].is_pinned = updates.is_pinned ? 1 : 0;
      if (updates.is_archived !== undefined) folders[index].is_archived = updates.is_archived ? 1 : 0;
      folders[index].updated_at = now();
      return folders[index];
    });
  },

  async move(id, parentId = null) {
    return await mutateStorage((folders) => {
      const active = folders.filter((folder) => !folder.is_deleted);
      const error = getFolderMoveError(active, id, parentId);
      if (error) throw new Error(error);
      const folder = folders.find((item) => item.id === id);
      folder.parent_id = parentId;
      folder.updated_at = now();
      return folder;
    });
  },

  async softDelete(id) {
    await mutateStorage((folders, tombstones) => {
      const index = folders.findIndex((f) => f.id === id);
      if (index === -1) return;
      const timestamp = now();
      folders[index].is_deleted = 1;
      folders[index].is_archived = 0;
      folders[index].updated_at = timestamp;
      upsertTombstone(tombstones, id, timestamp);
    });
  },

  async archive(id) {
    return await mutateStorage((folders) => {
      const folder = folders.find((item) => item.id === id && !item.is_deleted);
      if (!folder) return null;
      folder.is_archived = 1;
      folder.updated_at = now();
      return folder;
    });
  },

  async unarchive(id) {
    return await mutateStorage((folders) => {
      const folder = folders.find((item) => item.id === id && !item.is_deleted);
      if (!folder) return null;
      folder.is_archived = 0;
      folder.updated_at = now();
      return folder;
    });
  },

  async hardDelete(id) {
    await mutateStorage((folders, tombstones) => {
      for (const folder of folders) {
        if (folder.parent_id === id) folder.parent_id = null;
      }
      const index = folders.findIndex((f) => f.id === id);
      if (index !== -1) folders.splice(index, 1);
      upsertTombstone(tombstones, id, now());
    });
  },

  async getNoteCount(folderId) {
    const { noteRepo } = require('./noteRepo.web');
    const stored = (await getStorage()).filter((folder) => !folder.is_deleted);
    const folderIds = getVisibleSubtreeFolderIds(stored, folderId);
    const notes = await Promise.all(folderIds.map((id) => noteRepo.getByFolderId(id)));
    return notes.reduce((count, items) => count + items.length, 0);
  },

  async search(query) {
    const q = query.toLowerCase();
    return (await this.getAll()).filter((folder) => folder.name.toLowerCase().includes(q));
  },

  async getSyncSnapshot() {
    await mutationQueue;
    const [folders, tombstones] = await Promise.all([getStorage(), getTombstones()]);
    return {
      records: folders
        .filter((folder) => !folder.is_deleted)
        .map((folder) => ({
          id: folder.id,
          parent_id: folder.parent_id ?? null,
          name: folder.name,
          password: folder.password || null,
          is_pinned: folder.is_pinned || 0,
          is_archived: folder.is_archived || 0,
          created_at: folder.created_at,
          updated_at: folder.updated_at,
        })),
      tombstones,
    };
  },

  async applySyncSnapshot(records = [], tombstones = []) {
    await mutateStorage((folders, localTombstones) => {
      for (const remote of records) {
        const index = folders.findIndex((folder) => folder.id === remote.id);
        if (index === -1) {
          folders.push({
            ...remote,
            parent_id: remote.parent_id ?? null,
            is_deleted: 0,
            is_pinned: remote.is_pinned ? 1 : 0,
            is_archived: remote.is_archived ? 1 : 0,
          });
        } else if (new Date(remote.updated_at) >= new Date(folders[index].updated_at)) {
          folders[index] = {
            ...folders[index],
            ...remote,
            parent_id: remote.parent_id ?? null,
            is_deleted: 0,
            is_pinned: remote.is_pinned ? 1 : 0,
            is_archived: remote.is_archived ? 1 : 0,
          };
        }
        const tombstoneIndex = localTombstones.findIndex((item) =>
          item.id === remote.id && new Date(item.updated_at) <= new Date(remote.updated_at)
        );
        if (tombstoneIndex !== -1) localTombstones.splice(tombstoneIndex, 1);
      }

      for (const tombstone of tombstones) {
        upsertTombstone(localTombstones, tombstone.id, tombstone.updated_at);
        const folder = folders.find((item) => item.id === tombstone.id);
        if (folder && new Date(folder.updated_at) <= new Date(tombstone.updated_at)) {
          folder.is_deleted = 1;
          folder.is_archived = 0;
          folder.updated_at = tombstone.updated_at;
        }
      }
    });
  },

  async replaceBackupSnapshot(records = [], tombstones = []) {
    await mutateStorage((folders, localTombstones) => {
      folders.splice(0, folders.length, ...records.map((folder) => ({
        ...folder,
        parent_id: folder.parent_id ?? null,
        is_deleted: 0,
        is_pinned: folder.is_pinned ? 1 : 0,
        is_archived: folder.is_archived ? 1 : 0,
      })));
      localTombstones.splice(0, localTombstones.length, ...tombstones);
    });
  },
};
