import { Directory, File, Paths } from 'expo-file-system';
import { getDB } from './sqlite';
import {
  createAttachmentId,
  normalizeAttachment,
  sortAttachments,
} from '../utils/note-attachment.mjs';

const attachmentsDirectory = new Directory(Paths.document, 'note-attachments');
const safeSegment = (value) => String(value).replace(/[^a-z0-9_-]/gi, '_');
const now = () => new Date().toISOString();

const deleteManagedFile = (uri) => {
  try {
    if (!uri?.startsWith(attachmentsDirectory.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // File cleanup must not hide a successful metadata mutation.
  }
};

const getRow = async (id) => {
  const row = await getDB().getFirstAsync('SELECT * FROM note_attachments WHERE id = ?', [id]);
  return row ? normalizeAttachment(row) : null;
};

export const attachmentRepo = {
  async listAll() {
    const rows = await getDB().getAllAsync(
      'SELECT * FROM note_attachments ORDER BY note_id, display_order, created_at, id'
    );
    return rows.map(normalizeAttachment);
  },

  async clearAll() {
    const existing = await this.listAll();
    for (const noteId of [...new Set(existing.map((item) => item.note_id))]) {
      await this.removeAll(noteId);
    }
    return existing.length;
  },

  async listByNoteId(noteId) {
    const rows = await getDB().getAllAsync(
      'SELECT * FROM note_attachments WHERE note_id = ? ORDER BY display_order, created_at, id',
      [noteId]
    );
    return sortAttachments(rows);
  },

  async getById(id) {
    return await getRow(id);
  },

  async add(noteId, asset) {
    if (!noteId || !asset?.uri) throw new Error('No optimized image was provided.');
    const source = new File(asset.uri);
    if (!source.exists) throw new Error('The optimized image is no longer available.');

    const id = asset.id || createAttachmentId();
    const timestamp = asset.created_at || now();
    const noteDirectory = new Directory(attachmentsDirectory, safeSegment(noteId));
    noteDirectory.create({ idempotent: true, intermediates: true });
    const destination = new File(noteDirectory, `${safeSegment(id)}.jpg`);
    source.copy(destination);
    const existing = await this.listByNoteId(noteId);
    const displayOrder = asset.display_order ?? existing.length;

    try {
      await getDB().runAsync(
        `INSERT INTO note_attachments (
          id, note_id, local_uri, mime_type, width, height, byte_size,
          display_order, anchor_offset, display_width_ratio, cloud_path, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          noteId,
          destination.uri,
          asset.mime_type || 'image/jpeg',
          Math.max(1, Math.floor(Number(asset.width) || 1)),
          Math.max(1, Math.floor(Number(asset.height) || 1)),
          Math.max(0, Math.floor(Number(asset.byte_size ?? destination.size) || 0)),
          Math.max(0, Math.floor(Number(displayOrder) || 0)),
          Math.max(0, Math.floor(Number(asset.anchor_offset) || 0)),
          Math.max(0.35, Math.min(1, Number(asset.display_width_ratio) || 1)),
          asset.cloud_path || null,
          asset.sync_status || null,
          timestamp,
          asset.updated_at || timestamp,
        ]
      );
    } catch (error) {
      deleteManagedFile(destination.uri);
      throw error;
    }
    return await getRow(id);
  },

  async update(id, updates = {}) {
    const allowed = ['display_order', 'anchor_offset', 'display_width_ratio', 'cloud_path', 'sync_status', 'updated_at'];
    const fields = [];
    const values = [];
    for (const field of allowed) {
      if (updates[field] === undefined) continue;
      fields.push(`${field} = ?`);
      values.push(field === 'display_width_ratio'
        ? Math.max(0.35, Math.min(1, Number(updates[field]) || 1))
        : updates[field]);
    }
    if (!fields.length) return await getRow(id);
    if (updates.updated_at === undefined) {
      fields.push('updated_at = ?');
      values.push(now());
    }
    values.push(id);
    await getDB().runAsync(`UPDATE note_attachments SET ${fields.join(', ')} WHERE id = ?`, values);
    return await getRow(id);
  },

  async reorder(noteId, orderedIds = []) {
    const current = await this.listByNoteId(noteId);
    const valid = new Set(current.map((item) => item.id));
    const ids = orderedIds.filter((id, index) => valid.has(id) && orderedIds.indexOf(id) === index);
    for (const item of current) if (!ids.includes(item.id)) ids.push(item.id);
    const timestamp = now();
    await getDB().withExclusiveTransactionAsync(async (transaction) => {
      for (let index = 0; index < ids.length; index += 1) {
        await transaction.runAsync(
          'UPDATE note_attachments SET display_order = ?, updated_at = ? WHERE id = ? AND note_id = ?',
          [index, timestamp, ids[index], noteId]
        );
      }
    });
    return await this.listByNoteId(noteId);
  },

  async remove(id) {
    const existing = await getRow(id);
    if (!existing) return null;
    await getDB().runAsync('DELETE FROM note_attachments WHERE id = ?', [id]);
    deleteManagedFile(existing.local_uri);
    await this.reorder(existing.note_id, (await this.listByNoteId(existing.note_id)).map((item) => item.id));
    return existing;
  },

  async removeAll(noteId) {
    const existing = await this.listByNoteId(noteId);
    await getDB().runAsync('DELETE FROM note_attachments WHERE note_id = ?', [noteId]);
    for (const item of existing) deleteManagedFile(item.local_uri);
    try {
      const directory = new Directory(attachmentsDirectory, safeSegment(noteId));
      if (directory.exists) directory.delete();
    } catch {
      // Individual file cleanup above is sufficient.
    }
    return existing.length;
  },
};
