export const FOLDER_SORT_STORAGE_KEY = '@locknote_folder_sort_v1';
export const FOLDER_SORT_OPTIONS = Object.freeze([
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Date created' },
  { value: 'updated', label: 'Last updated' },
  { value: 'count', label: 'Number of notes' },
  { value: 'custom', label: 'Custom order' },
]);

export const folderSortScope = (parentId) => parentId == null ? 'home' : `folder:${parentId}`;
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 160;
const uniqueIds = (ids) => Array.isArray(ids) ? [...new Set(ids.filter(validId))] : [];

export const normalizeFolderSortPreferences = (input) => {
  const value = input && typeof input === 'object' ? input : {};
  const orders = Object.fromEntries(Object.entries(value.orders || {}).filter(([key, ids]) =>
    (key === 'home' || key.startsWith('folder:')) && Array.isArray(ids)
  ).map(([key, ids]) => [key, uniqueIds(ids)]));
  return {
    version: 1,
    sortBy: FOLDER_SORT_OPTIONS.some((option) => option.value === value.sortBy) ? value.sortBy : 'created',
    direction: value.direction === 'asc' ? 'asc' : 'desc',
    pinnedFirst: value.pinnedFirst !== false,
    orders,
  };
};

const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const countOf = (counts, id) => Number.isFinite(Number(counts[id])) ? Math.max(0, Number(counts[id])) : 0;
const compareNames = (left, right) => String(left.name || '').localeCompare(String(right.name || ''), undefined, { numeric: true, sensitivity: 'base' });
const compareIds = (left, right) => String(left.id).localeCompare(String(right.id));
const newestFirst = (left, right) => timestamp(right.created_at) - timestamp(left.created_at) || compareNames(left, right) || compareIds(left, right);

// Presentation only: never write folder rows or change a folder's parent.
export const sortFolders = (folders = [], input, counts = {}) => {
  const preferences = normalizeFolderSortPreferences(input);
  const ranks = new Map(Object.entries(preferences.orders).map(([scope, ids]) => [scope, new Map(ids.map((id, index) => [id, index]))]));
  return [...folders].sort((left, right) => {
    if (preferences.pinnedFirst) {
      const pinned = Number(Boolean(right.is_pinned)) - Number(Boolean(left.is_pinned));
      if (pinned) return pinned;
    }
    if (preferences.sortBy === 'custom') {
      // Search may contain more than one parent. Keep sibling groups together.
      const leftScope = folderSortScope(left.parent_id), rightScope = folderSortScope(right.parent_id);
      if (leftScope !== rightScope) return leftScope === 'home' ? -1 : rightScope === 'home' ? 1 : leftScope.localeCompare(rightScope);
      const order = ranks.get(leftScope);
      const leftRank = order?.get(left.id) ?? Infinity, rightRank = order?.get(right.id) ?? Infinity;
      if (leftRank !== rightRank) return leftRank < rightRank ? -1 : 1;
      return newestFirst(left, right);
    }
    const result = preferences.sortBy === 'name' ? compareNames(left, right)
      : preferences.sortBy === 'updated' ? timestamp(left.updated_at) - timestamp(right.updated_at)
        : preferences.sortBy === 'count' ? countOf(counts, left.id) - countOf(counts, right.id)
          : timestamp(left.created_at) - timestamp(right.created_at);
    return (preferences.direction === 'asc' ? result : -result) || compareNames(left, right) || compareIds(left, right);
  });
};

export const getFolderMoveBounds = (folders, index, pinnedFirst) => {
  if (!pinnedFirst) return { min: 0, max: folders.length - 1 };
  const pinnedCount = folders.filter((folder) => folder.is_pinned).length;
  return folders[index]?.is_pinned ? { min: 0, max: pinnedCount - 1 } : { min: pinnedCount, max: folders.length - 1 };
};

export const moveFolderInOrder = (folders, id, targetIndex, pinnedFirst = true) => {
  const index = folders.findIndex((folder) => folder.id === id);
  if (index < 0 || !Number.isFinite(targetIndex)) return folders;
  const bounds = getFolderMoveBounds(folders, index, pinnedFirst);
  const target = Math.max(bounds.min, Math.min(bounds.max, Math.round(targetIndex)));
  if (index === target) return folders;
  const next = [...folders];
  next.splice(target, 0, next.splice(index, 1)[0]);
  return next;
};

export const createFolderSortPreferenceService = (storage) => {
  const listeners = new Set();
  let queue = Promise.resolve();
  const read = async () => {
    const raw = await storage.getItem(FOLDER_SORT_STORAGE_KEY);
    let value;
    try { value = JSON.parse(raw); } catch { /* Invalid local preference uses existing newest-first order. */ }
    return normalizeFolderSortPreferences(value);
  };
  return {
    read,
    save: (settings, customOrder) => {
      const operation = queue.then(async () => {
        const previous = await read();
        const next = normalizeFolderSortPreferences({ ...previous, ...settings, orders: previous.orders });
        if (customOrder) next.orders[folderSortScope(customOrder.parentId)] = uniqueIds(customOrder.ids);
        await storage.setItem(FOLDER_SORT_STORAGE_KEY, JSON.stringify(next));
        for (const listener of listeners) {
          try { listener(next); } catch { /* One unmounted screen must not block the others. */ }
        }
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
};
