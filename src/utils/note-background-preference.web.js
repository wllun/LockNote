import {
  applyNoteBackgroundPreferences,
  isPickedImageTooLarge,
} from './note-background.mjs';

const DATABASE_NAME = 'locknote-local-media';
const STORE_NAME = 'note-backgrounds';
const DATABASE_VERSION = 1;
const activeUrls = new Map();
let databasePromise = null;

const openDatabase = () => {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    throw new Error('Local image storage is unavailable in this browser.');
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'noteId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local image storage could not be opened.'));
  });
  return databasePromise;
};

const runRequest = async (mode, action) => {
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error || new Error('Local image storage failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error('Local image storage was interrupted.'));
    transaction.onerror = () => reject(transaction.error || new Error('Local image storage failed.'));
  });
};

const revokeUrl = (noteId) => {
  const cached = activeUrls.get(noteId);
  if (cached) URL.revokeObjectURL(cached.uri);
  activeUrls.delete(noteId);
};

const recordUri = (record) => {
  if (!record?.blob) return null;
  const cached = activeUrls.get(record.noteId);
  if (cached?.updatedAt === record.updatedAt) return cached.uri;
  revokeUrl(record.noteId);
  const uri = URL.createObjectURL(record.blob);
  activeUrls.set(record.noteId, { uri, updatedAt: record.updatedAt });
  return uri;
};

const getRecord = (noteId) => runRequest('readonly', (store) => store.get(noteId));

export const noteBackgroundPreference = {
  async load(noteId) {
    if (!noteId) return null;
    return recordUri(await getRecord(noteId));
  },

  async saveAsset(noteId, asset) {
    if (!noteId) throw new Error('No note was selected.');
    let blob = asset?.file || null;
    if (!blob && asset?.uri) blob = await (await fetch(asset.uri)).blob();
    if (!blob || !String(blob.type || asset?.mimeType || '').startsWith('image/')) {
      throw new Error('The selected file is not a supported image.');
    }
    if (isPickedImageTooLarge(asset, blob.size)) {
      const error = new Error('The selected image is larger than 10 MB.');
      error.code = 'IMAGE_TOO_LARGE';
      throw error;
    }
    const record = {
      noteId,
      blob,
      updatedAt: Date.now(),
    };
    await runRequest('readwrite', (store) => store.put(record));
    revokeUrl(noteId);
    return recordUri(record);
  },

  async applyToNotes(notes = []) {
    const decorated = await Promise.all(
      notes.map(async (note) => ({
        ...note,
        background_image_uri: await this.load(note.id),
      }))
    );
    return applyNoteBackgroundPreferences(
      decorated,
      Object.fromEntries(decorated.map((note) => [note.id, note.background_image_uri]))
    );
  },

  async remove(noteId) {
    if (!noteId) return;
    await runRequest('readwrite', (store) => store.delete(noteId));
    revokeUrl(noteId);
  },

  async removeQuietly(noteId) {
    try {
      await this.remove(noteId);
    } catch {
      // Presentation cleanup must never make a successful note deletion look failed.
    }
  },
};
