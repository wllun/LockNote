import { getDB } from './sqlite';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

export const noteRepo = {
  async getRootNotes() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE folder_id IS NULL AND is_deleted = 0 AND share_origin != 'incoming' ORDER BY is_pinned DESC, updated_at DESC`
    );
  },

  async getByFolderId(folderId) {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE folder_id = ? AND is_deleted = 0 AND share_origin != 'incoming' ORDER BY is_pinned DESC, updated_at DESC`,
      [folderId]
    );
  },

  async getById(id) {
    const db = getDB();
    return await db.getFirstAsync(
      `SELECT * FROM notes WHERE id = ? AND is_deleted = 0`,
      [id]
    );
  },

  async create(folderId = null, title = '', content = '', password = null, noteType = 'note') {
    const db = getDB();
    const { hashPassword } = require('../utils/crypto');
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    await db.runAsync(
      `INSERT INTO notes (id, folder_id, title, content, note_type, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, folderId, title, content, noteType, passwordHash, timestamp, timestamp]
    );

    return await this.getById(id);
  },

  async update(id, updates) {
    const db = getDB();
    const { hashPassword } = require('../utils/crypto');
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.folder_id !== undefined) {
      fields.push('folder_id = ?');
      values.push(updates.folder_id);
    }
    if (updates.note_type !== undefined) {
      fields.push('note_type = ?');
      values.push(updates.note_type);
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
    for (const field of [
      'cloud_id', 'cloud_owner_id', 'share_origin', 'share_role',
      'collaborator_count', 'server_revision', 'last_edited_by_id',
      'last_edited_by_email', 'last_edited_at', 'sync_status', 'last_synced_at',
    ]) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (fields.length === 0) return await this.getById(id);

    fields.push('updated_at = ?');
    values.push(now());
    values.push(id);

    await db.runAsync(
      `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return await this.getById(id);
  },

  async move(id, folderId = null) {
    const db = getDB();
    await db.runAsync(
      `UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ? AND is_deleted = 0`,
      [folderId, now(), id]
    );
    return await this.getById(id);
  },

  async softDelete(id) {
    const db = getDB();
    const timestamp = now();
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
         SELECT 'note', id, ? FROM notes
         WHERE id = ? AND share_origin != 'incoming'
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
        [timestamp, id]
      );
      await txn.runAsync(
        `UPDATE notes SET is_deleted = 1, updated_at = ? WHERE id = ?`,
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
         SELECT 'note', id, ? FROM notes
         WHERE id = ? AND share_origin != 'incoming'
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
        [timestamp, id]
      );
      await txn.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
    });
  },

  async search(query) {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE is_deleted = 0 AND share_origin != 'incoming' AND (title LIKE ? OR content LIKE ?) ORDER BY is_pinned DESC, updated_at DESC`,
      [`%${query}%`, `%${query}%`]
    );
  },

  async getSharedWithMe() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE is_deleted = 0 AND share_origin = 'incoming' ORDER BY last_edited_at DESC, updated_at DESC`
    );
  },

  async getByCloudId(cloudId) {
    const db = getDB();
    return await db.getFirstAsync(
      `SELECT * FROM notes WHERE cloud_id = ? AND is_deleted = 0`,
      [cloudId]
    );
  },

  async upsertSharedCache(remote) {
    const existing = await this.getByCloudId(remote.cloud_id);
    if (existing) return await this.update(existing.id, remote);
    const created = await this.create(null, remote.title, remote.content, null, remote.note_type);
    return await this.update(created.id, remote);
  },

  async getSyncSnapshot() {
    const db = getDB();
    const [records, tombstones] = await Promise.all([
      db.getAllAsync(
        `SELECT * FROM notes
         WHERE is_deleted = 0 AND share_origin != 'incoming'`
      ),
      db.getAllAsync(
        `SELECT entity_id AS id, deleted_at AS updated_at
         FROM sync_tombstones WHERE entity_type = 'note'`
      ),
    ]);
    return { records, tombstones };
  },

  async applySyncSnapshot(records = [], tombstones = []) {
    const db = getDB();
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const note of records) {
        await txn.runAsync(
          `INSERT INTO notes (
             id, folder_id, title, content, note_type, password, is_deleted,
             is_pinned, created_at, updated_at, cloud_id, cloud_owner_id,
             share_origin, share_role, collaborator_count, server_revision,
             last_edited_by_id, last_edited_by_email, last_edited_at,
             sync_status, last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             folder_id = excluded.folder_id,
             title = excluded.title,
             content = excluded.content,
             note_type = excluded.note_type,
             password = excluded.password,
             is_deleted = 0,
             is_pinned = excluded.is_pinned,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             cloud_id = excluded.cloud_id,
             cloud_owner_id = excluded.cloud_owner_id,
             share_origin = excluded.share_origin,
             share_role = excluded.share_role,
             collaborator_count = excluded.collaborator_count,
             server_revision = excluded.server_revision,
             last_edited_by_id = excluded.last_edited_by_id,
             last_edited_by_email = excluded.last_edited_by_email,
             last_edited_at = excluded.last_edited_at,
             sync_status = excluded.sync_status,
             last_synced_at = excluded.last_synced_at
           WHERE excluded.updated_at >= notes.updated_at`,
          [
            note.id,
            note.folder_id ?? null,
            note.title || '',
            note.content || '',
            note.note_type || 'note',
            note.password || null,
            note.is_pinned ? 1 : 0,
            note.created_at,
            note.updated_at,
            note.cloud_id || null,
            note.cloud_owner_id || null,
            note.share_origin || 'private',
            note.share_role || null,
            Number(note.collaborator_count) || 0,
            Number(note.server_revision) || 0,
            note.last_edited_by_id || null,
            note.last_edited_by_email || null,
            note.last_edited_at || null,
            note.sync_status || null,
            note.last_synced_at || null,
          ]
        );
        await txn.runAsync(
          `DELETE FROM sync_tombstones
           WHERE entity_type = 'note' AND entity_id = ? AND deleted_at <= ?`,
          [note.id, note.updated_at]
        );
      }
      for (const tombstone of tombstones) {
        await txn.runAsync(
          `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
           VALUES ('note', ?, ?)
           ON CONFLICT(entity_type, entity_id) DO UPDATE SET
             deleted_at = CASE
               WHEN excluded.deleted_at >= sync_tombstones.deleted_at
               THEN excluded.deleted_at ELSE sync_tombstones.deleted_at END`,
          [tombstone.id, tombstone.updated_at]
        );
        await txn.runAsync(
          `UPDATE notes SET is_deleted = 1, updated_at = ?
           WHERE id = ? AND share_origin != 'incoming' AND updated_at <= ?`,
          [tombstone.updated_at, tombstone.id, tombstone.updated_at]
        );
      }
    });
  },
};
