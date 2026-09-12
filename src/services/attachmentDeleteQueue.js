import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@locknote_pending_attachment_deletes';

const readQueue = async () => {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '[]');
    return Array.isArray(value) ? value.filter((item) => item?.id && item?.cloud_path) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (items) => {
  if (items.length) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  else await AsyncStorage.removeItem(STORAGE_KEY);
};

export const attachmentDeleteQueue = {
  async add(note, attachment) {
    if (!attachment?.cloud_path) return;
    const items = await readQueue();
    const pending = {
      id: attachment.id,
      cloud_path: attachment.cloud_path,
      local_note_id: note?.cloud_id ? null : note?.id || attachment.note_id,
      shared_note_id: note?.cloud_id || null,
    };
    await writeQueue([...items.filter((item) => item.id !== pending.id), pending]);
  },

  async flush(remove) {
    const items = await readQueue();
    const remaining = [];
    for (const item of items) {
      try { await remove(item); } catch { remaining.push(item); }
    }
    await writeQueue(remaining);
    return { removed: items.length - remaining.length, pending: remaining.length };
  },
};
