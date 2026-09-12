import {
  createAttachmentId,
  normalizeAttachment,
  sortAttachments,
} from '../utils/note-attachment.mjs';

const DATABASE_NAME = 'locknote-local-media';
const STORE_NAME = 'note-attachments';
const DATABASE_VERSION = 2;
const activeUrls = new Map();
let databasePromise = null;
let mutationQueue = Promise.resolve();

const openDatabase = () => {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') throw new Error('Attachment storage is unavailable in this browser.');
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('note-backgrounds')) {
        database.createObjectStore('note-backgrounds', { keyPath: 'noteId' });
      }
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const attachments = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        attachments.createIndex('noteId', 'note_id', { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => reject(new Error('Close other LockNote tabs, then try adding the image again.'));
    request.onerror = () => reject(request.error || new Error('Attachment storage could not be opened.'));
  });
  return databasePromise;
};

const runTransaction = async (mode, operation) => {
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    try {
      result = operation(transaction.objectStore(STORE_NAME));
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error('Attachment storage was interrupted.'));
    transaction.onerror = () => reject(transaction.error || new Error('Attachment storage failed.'));
  });
};

const getAllRecords = async () => {
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Attachments could not be loaded.'));
  });
};

const mutate = (operation) => {
  const next = mutationQueue.then(operation);
  mutationQueue = next.catch(() => {});
  return next;
};

const revokeUrl = (id) => {
  const uri = activeUrls.get(id);
  if (uri) URL.revokeObjectURL(uri);
  activeUrls.delete(id);
};

const presentRecord = (record) => {
  if (!record) return null;
  let uri = activeUrls.get(record.id);
  if (!uri && record.blob) {
    uri = URL.createObjectURL(record.blob);
    activeUrls.set(record.id, uri);
  }
  return normalizeAttachment({ ...record, local_uri: uri || null });
};

const getRecord = async (id) => {
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Attachment could not be loaded.'));
  });
};

export const attachmentRepo = {
  async listAll() {
    return (await getAllRecords()).map(presentRecord);
  },

  async clearAll() {
    return await mutate(async () => {
      const records = await getAllRecords();
      await runTransaction('readwrite', (store) => store.clear());
      records.forEach((item) => revokeUrl(item.id));
      return records.length;
    });
  },

  async listByNoteId(noteId) {
    return sortAttachments((await getAllRecords())
      .filter((item) => item.note_id === noteId)
      .map(presentRecord));
  },

  async getById(id) {
    return presentRecord(await getRecord(id));
  },

  async add(noteId, asset) {
    if (!noteId || !asset?.uri) throw new Error('No optimized image was provided.');
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const id = asset.id || createAttachmentId();
    const timestamp = asset.created_at || new Date().toISOString();
    const existing = await this.listByNoteId(noteId);
    const record = {
      id,
      note_id: noteId,
      blob,
      mime_type: asset.mime_type || blob.type || 'image/jpeg',
      width: Math.max(1, Math.floor(Number(asset.width) || 1)),
      height: Math.max(1, Math.floor(Number(asset.height) || 1)),
      byte_size: Math.max(0, Math.floor(Number(asset.byte_size ?? blob.size) || 0)),
      display_order: Math.max(0, Math.floor(Number(asset.display_order ?? existing.length) || 0)),
      anchor_offset: Math.max(0, Math.floor(Number(asset.anchor_offset) || 0)),
      display_width_ratio: Math.max(0.35, Math.min(1, Number(asset.display_width_ratio) || 1)),
      cloud_path: asset.cloud_path || null,
      sync_status: asset.sync_status || null,
      created_at: timestamp,
      updated_at: asset.updated_at || timestamp,
    };
    await mutate(() => runTransaction('readwrite', (store) => store.put(record)));
    revokeUrl(id);
    return presentRecord(record);
  },

  async update(id, updates = {}) {
    return await mutate(async () => {
      const record = await getRecord(id);
      if (!record) return null;
      for (const field of ['display_order', 'anchor_offset', 'display_width_ratio', 'cloud_path', 'sync_status', 'updated_at']) {
        if (updates[field] !== undefined) record[field] = field === 'display_width_ratio'
          ? Math.max(0.35, Math.min(1, Number(updates[field]) || 1))
          : updates[field];
      }
      if (updates.updated_at === undefined) record.updated_at = new Date().toISOString();
      await runTransaction('readwrite', (store) => store.put(record));
      return presentRecord(record);
    });
  },

  async reorder(noteId, orderedIds = []) {
    return await mutate(async () => {
      const records = (await getAllRecords()).filter((item) => item.note_id === noteId);
      const valid = new Set(records.map((item) => item.id));
      const ids = orderedIds.filter((id, index) => valid.has(id) && orderedIds.indexOf(id) === index);
      for (const item of records) if (!ids.includes(item.id)) ids.push(item.id);
      const timestamp = new Date().toISOString();
      await runTransaction('readwrite', (store) => {
        ids.forEach((id, index) => {
          const record = records.find((item) => item.id === id);
          store.put({ ...record, display_order: index, updated_at: timestamp });
        });
      });
      return await this.listByNoteId(noteId);
    });
  },

  async remove(id) {
    return await mutate(async () => {
      const record = await getRecord(id);
      if (!record) return null;
      const remaining = (await getAllRecords())
        .filter((item) => item.note_id === record.note_id && item.id !== id)
        .sort((left, right) => left.display_order - right.display_order);
      const timestamp = new Date().toISOString();
      await runTransaction('readwrite', (store) => {
        store.delete(id);
        remaining.forEach((item, index) => {
          store.put({ ...item, display_order: index, updated_at: timestamp });
        });
      });
      revokeUrl(id);
      return presentRecord(record);
    });
  },

  async removeAll(noteId) {
    return await mutate(async () => {
      const records = (await getAllRecords()).filter((item) => item.note_id === noteId);
      await runTransaction('readwrite', (store) => {
        records.forEach((item) => store.delete(item.id));
      });
      records.forEach((item) => revokeUrl(item.id));
      return records.length;
    });
  },
};
