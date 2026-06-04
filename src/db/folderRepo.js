import { getDB } from './sqlite';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

const now = () => new Date().toISOString();

export const folderRepo = {
  async getAll() {
    const db = getDB();
    return await db.getAllAsync(
      `SELECT * FROM folders WHERE is_deleted = 0 ORDER BY created_at DESC`
    );
  },

  async getById(id) {
    const db = getDB();
    return await db.getFirstAsync(
      `SELECT * FROM folders WHERE id = ? AND is_deleted = 0`,
      [id]
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
    await db.runAsync(
      `UPDATE folders SET is_deleted = 1, updated_at = ? WHERE id = ?`,
      [now(), id]
    );
  },

  async hardDelete(id) {
    const db = getDB();
    await db.runAsync(`DELETE FROM folders WHERE id = ?`, [id]);
  },

  async getNoteCount(folderId) {
    const db = getDB();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM notes WHERE folder_id = ? AND is_deleted = 0`,
      [folderId]
    );
    return result?.count || 0;
  },
};
