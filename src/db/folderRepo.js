import { getDB } from './sqlite';
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

const getStoredFolders = async () => {
  const db = getDB();
  return await db.getAllAsync(`SELECT * FROM folders WHERE is_deleted = 0`);
};

export const folderRepo = {
  async getAll() {
    return flattenFolderHierarchy(await getStoredFolders());
  },

  async getRootFolders() {
    return (await this.getAll()).filter((folder) => folder.parent_id == null);
  },

  async getChildren(parentId) {
    if (!parentId) return [];
    return (await getStoredFolders())
      .filter((folder) => !folder.is_archived && folder.parent_id === parentId)
      .sort(sortFolderSiblings);
  },

  async getAncestors(id) {
    return getFolderPath(await getStoredFolders(), id);
  },

  async getDescendantIds(id, includeArchived = true) {
    const folders = includeArchived
      ? await getStoredFolders()
      : getVisibleFolders(await getStoredFolders());
    return getFolderDescendantIds(folders, id);
  },

  async getById(id) {
    const db = getDB();
    return await db.getFirstAsync(
      `SELECT * FROM folders WHERE id = ? AND is_deleted = 0`,
      [id]
    );
  },

  // Cleanup reads legacy soft-deleted folders so they can be discarded.
  async getDeleted() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM folders WHERE is_deleted = 1 ORDER BY updated_at DESC`
    );
  },

  async getArchived() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM folders WHERE is_deleted = 0 AND is_archived = 1 ORDER BY updated_at DESC`
    );
  },

  async create(name, password = null, parentId = null) {
    const db = getDB();
    const { hashPassword } = require('../utils/crypto');
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    if (parentId !== null) {
      const folders = await getStoredFolders();
      const parent = folders.find((folder) => folder.id === parentId);
      if (!parent || parent.is_archived) throw new Error('The parent folder is unavailable.');
      if (getFolderPath(folders, parentId).length >= MAX_FOLDER_DEPTH) {
        throw new Error(getFolderDepthLimitMessage());
      }
    }

    await db.runAsync(
      `INSERT INTO folders (id, parent_id, name, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, parentId, name, passwordHash, timestamp, timestamp]
    );

    return await this.getById(id);
  },

  async update(id, updates) {
    const db = getDB();
    const { hashPassword } = require('../utils/crypto');
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.password !== undefined) {
      const passwordHash = updates.password ? await hashPassword(updates.password) : null;
      fields.push('password = ?');
      values.push(passwordHash);
    }
    if (updates.is_pinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(updates.is_pinned ? 1 : 0);
    }
    if (updates.is_archived !== undefined) {
      fields.push('is_archived = ?');
      values.push(updates.is_archived ? 1 : 0);
    }

    if (fields.length === 0) return await this.getById(id);

    fields.push('updated_at = ?');
    values.push(now());
    values.push(id);

    await db.runAsync(
      `UPDATE folders SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return await this.getById(id);
  },

  async move(id, parentId = null) {
    const db = getDB();
    const folders = await getStoredFolders();
    const error = getFolderMoveError(folders, id, parentId);
    if (error) throw new Error(error);
    await db.runAsync(
      `UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ? AND is_deleted = 0`,
      [parentId, now(), id]
    );
    return await this.getById(id);
  },

  async softDelete(id) {
    const db = getDB();
    const timestamp = now();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
         VALUES ('folder', ?, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
        [id, timestamp]
      );
      await txn.runAsync(
        `UPDATE folders SET is_deleted = 1, is_archived = 0, updated_at = ? WHERE id = ?`,
        [timestamp, id]
      );
    });
  },

  async archive(id) {
    const db = getDB();
    await db.runAsync(
      `UPDATE folders SET is_archived = 1, updated_at = ? WHERE id = ? AND is_deleted = 0`,
      [now(), id]
    );
    return await this.getById(id);
  },

  async unarchive(id) {
    const db = getDB();
    await db.runAsync(
      `UPDATE folders SET is_archived = 0, updated_at = ? WHERE id = ? AND is_deleted = 0`,
      [now(), id]
    );
    return await this.getById(id);
  },

  async hardDelete(id) {
    const db = getDB();
    const timestamp = now();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
         VALUES ('folder', ?, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
        [id, timestamp]
      );
      await txn.runAsync(`UPDATE folders SET parent_id = NULL WHERE parent_id = ?`, [id]);
      await txn.runAsync(`DELETE FROM folders WHERE id = ?`, [id]);
    });
  },

  async getNoteCount(folderId) {
    const db = getDB();
    const folderIds = getVisibleSubtreeFolderIds(await getStoredFolders(), folderId);
    if (!folderIds.length) return 0;
    const placeholders = folderIds.map(() => '?').join(', ');
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM notes WHERE folder_id IN (${placeholders}) AND is_deleted = 0 AND is_archived = 0`,
      folderIds
    );
    return result?.count || 0;
  },

  async search(query) {
    const normalized = String(query || '').toLocaleLowerCase();
    return (await this.getAll()).filter((folder) =>
      String(folder.name || '').toLocaleLowerCase().includes(normalized)
    );
  },

  async getSyncSnapshot() {
    const db = getDB();
    const [records, tombstones] = await Promise.all([
      db.getAllAsync(
        `SELECT id, parent_id, name, password, is_pinned, is_archived, created_at, updated_at
         FROM folders WHERE is_deleted = 0`
      ),
      db.getAllAsync(
        `SELECT entity_id AS id, deleted_at AS updated_at
         FROM sync_tombstones WHERE entity_type = 'folder'`
      ),
    ]);
    return { records, tombstones };
  },

  async applySyncSnapshot(records = [], tombstones = []) {
    const db = getDB();
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const folder of records) {
        await txn.runAsync(
          `INSERT INTO folders (
             id, parent_id, name, password, is_deleted, is_pinned, is_archived, created_at, updated_at
           ) VALUES (?, NULL, ?, ?, 0, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             parent_id = NULL,
             name = excluded.name,
             password = excluded.password,
             is_deleted = 0,
             is_pinned = excluded.is_pinned,
             is_archived = excluded.is_archived,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= folders.updated_at`,
          [
            folder.id,
            folder.name,
            folder.password || null,
            folder.is_pinned ? 1 : 0,
            folder.is_archived ? 1 : 0,
            folder.created_at,
            folder.updated_at,
          ]
        );
        await txn.runAsync(
          `DELETE FROM sync_tombstones
           WHERE entity_type = 'folder' AND entity_id = ? AND deleted_at <= ?`,
          [folder.id, folder.updated_at]
        );
      }
      for (const folder of records) {
        await txn.runAsync(
          `UPDATE folders SET parent_id = ?
           WHERE id = ? AND is_deleted = 0 AND updated_at <= ?`,
          [folder.parent_id ?? null, folder.id, folder.updated_at]
        );
      }
      for (const tombstone of tombstones) {
        await txn.runAsync(
          `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
           VALUES ('folder', ?, ?)
           ON CONFLICT(entity_type, entity_id) DO UPDATE SET
             deleted_at = CASE
               WHEN excluded.deleted_at >= sync_tombstones.deleted_at
               THEN excluded.deleted_at ELSE sync_tombstones.deleted_at END`,
          [tombstone.id, tombstone.updated_at]
        );
        await txn.runAsync(
          `UPDATE folders SET is_deleted = 1, is_archived = 0, updated_at = ?
           WHERE id = ? AND updated_at <= ?`,
          [tombstone.updated_at, tombstone.id, tombstone.updated_at]
        );
      }
    });
  },

  async replaceBackupSnapshot(records = [], tombstones = []) {
    const db = getDB();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(`DELETE FROM sync_tombstones WHERE entity_type = 'folder'`);
      await txn.runAsync(`DELETE FROM folders`);

      for (const folder of records) {
        await txn.runAsync(
          `INSERT INTO folders (
             id, parent_id, name, password, is_deleted, is_pinned, is_archived, created_at, updated_at
           ) VALUES (?, NULL, ?, ?, 0, ?, ?, ?, ?)`,
          [
            folder.id,
            folder.name,
            folder.password || null,
            folder.is_pinned ? 1 : 0,
            folder.is_archived ? 1 : 0,
            folder.created_at,
            folder.updated_at,
          ]
        );
      }
      for (const folder of records) {
        await txn.runAsync(
          `UPDATE folders SET parent_id = ? WHERE id = ?`,
          [folder.parent_id ?? null, folder.id]
        );
      }
      for (const tombstone of tombstones) {
        await txn.runAsync(
          `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
           VALUES ('folder', ?, ?)`,
          [tombstone.id, tombstone.updated_at]
        );
      }
    });
  },
};
