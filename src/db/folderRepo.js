import { getDB } from './sqlite';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

export const folderRepo = {
  async getAll() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM folders WHERE is_deleted = 0 ORDER BY is_pinned DESC, created_at DESC`
    );
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

  async create(name, password = null) {
    const db = getDB();
    const { hashPassword } = require('../utils/crypto');
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    await db.runAsync(
      `INSERT INTO folders (id, name, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, passwordHash, timestamp, timestamp]
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
        `UPDATE folders SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        [timestamp, id]
      );
    });
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
      await txn.runAsync(`DELETE FROM folders WHERE id = ?`, [id]);
    });
  },

  async getNoteCount(folderId) {
    const db = getDB();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM notes WHERE folder_id = ? AND is_deleted = 0`,
      [folderId]
    );
    return result?.count || 0;
  },

  async search(query) {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM folders WHERE is_deleted = 0 AND name LIKE ? ORDER BY is_pinned DESC, created_at DESC`,
      [`%${query}%`]
    );
  },

  async getSyncSnapshot() {
    const db = getDB();
    const [records, tombstones] = await Promise.all([
      db.getAllAsync(
        `SELECT id, name, password, is_pinned, created_at, updated_at
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
             id, name, password, is_deleted, is_pinned, created_at, updated_at
           ) VALUES (?, ?, ?, 0, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             password = excluded.password,
             is_deleted = 0,
             is_pinned = excluded.is_pinned,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= folders.updated_at`,
          [
            folder.id,
            folder.name,
            folder.password || null,
            folder.is_pinned ? 1 : 0,
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
          `UPDATE folders SET is_deleted = 1, updated_at = ?
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
             id, name, password, is_deleted, is_pinned, created_at, updated_at
           ) VALUES (?, ?, ?, 0, ?, ?, ?)`,
          [
            folder.id,
            folder.name,
            folder.password || null,
            folder.is_pinned ? 1 : 0,
            folder.created_at,
            folder.updated_at,
          ]
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
