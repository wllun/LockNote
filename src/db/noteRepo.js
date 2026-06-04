import { getDB } from './sqlite';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

export const noteRepo = {
  async getRootNotes() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE folder_id IS NULL AND is_deleted = 0 ORDER BY updated_at DESC`
    );
  },

  async getByFolderId(folderId) {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE folder_id = ? AND is_deleted = 0 ORDER BY updated_at DESC`,
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

  async create(folderId = null, title = '', content = '', password = null) {
    const db = getDB();
    const { hashPassword } = require('../utils/crypto');
    const id = generateId();
    const timestamp = now();
    const passwordHash = password ? await hashPassword(password) : null;

    await db.runAsync(
      `INSERT INTO notes (id, folder_id, title, content, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, folderId, title, content, passwordHash, timestamp, timestamp]
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
    if (updates.password !== undefined) {
      const passwordHash = updates.password ? await hashPassword(updates.password) : null;
      fields.push('password = ?');
      values.push(passwordHash);
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

  async softDelete(id) {
    const db = getDB();
    await db.runAsync(
      `UPDATE notes SET is_deleted = 1, updated_at = ? WHERE id = ?`,
      [now(), id]
    );
  },

  async hardDelete(id) {
    const db = getDB();
    await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
  },

  async search(query) {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM notes WHERE is_deleted = 0 AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC`,
      [`%${query}%`, `%${query}%`]
    );
  },
};
