export const CHECKLIST_NOTE_TYPE = 'checklist';
export const CHECKLIST_NOTE_VERSION = 1;
export const CHECKLIST_ITEM_MAX_CHARACTERS = 500;
export const CHECKLIST_MAX_ITEMS = 500;

const createChecklistItemId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

export const sanitizeChecklistItemText = (value) =>
  String(value ?? '').slice(0, CHECKLIST_ITEM_MAX_CHARACTERS);

export const createChecklistItem = (values = {}) => ({
  id: values.id || createChecklistItemId(),
  text: sanitizeChecklistItemText(values.text),
  completed: values.completed === true,
});

export const moveChecklistItemToIndex = (items, itemId, targetIndex) => {
  if (!Array.isArray(items)) return items;

  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return items;

  const boundedIndex = Math.max(
    0,
    Math.min(items.length - 1, Number.isFinite(targetIndex) ? targetIndex : currentIndex)
  );
  if (boundedIndex === currentIndex) return items;

  const reorderedItems = [...items];
  const [movedItem] = reorderedItems.splice(currentIndex, 1);
  reorderedItems.splice(boundedIndex, 0, movedItem);
  return reorderedItems;
};

export const moveChecklistItem = (items, itemId, direction) => {
  if (!Array.isArray(items)) return items;

  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return items;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  return moveChecklistItemToIndex(items, itemId, targetIndex);
};

const normalizeChecklistItems = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .slice(0, CHECKLIST_MAX_ITEMS)
    .map(createChecklistItem);

export const parseChecklistNote = (content) => {
  if (!content) return { sourceVersion: CHECKLIST_NOTE_VERSION, items: [] };

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { sourceVersion: CHECKLIST_NOTE_VERSION, items: [] };
    }

    return {
      sourceVersion: Number(parsed.version) || CHECKLIST_NOTE_VERSION,
      items: normalizeChecklistItems(parsed.items),
    };
  } catch {
    return { sourceVersion: CHECKLIST_NOTE_VERSION, items: [] };
  }
};

export const serializeChecklistNote = (items) =>
  JSON.stringify({
    version: CHECKLIST_NOTE_VERSION,
    items: normalizeChecklistItems(items),
  });

export const getVisibleChecklistItems = (items) =>
  normalizeChecklistItems(items).filter((item) => item.text.trim());

export const calculateChecklistProgress = (items) => {
  const visibleItems = getVisibleChecklistItems(items);
  const completed = visibleItems.filter((item) => item.completed).length;
  const total = visibleItems.length;

  return {
    total,
    completed,
    remaining: total - completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
};

export const getChecklistPreview = (items) => {
  const visibleItems = getVisibleChecklistItems(items);
  if (!visibleItems.length) return 'No checklist items';

  const { completed, total } = calculateChecklistProgress(visibleItems);
  const nextItem = visibleItems.find((item) => !item.completed)?.text.trim();
  const progress = `${completed} of ${total} completed`;
  return nextItem ? `${progress} · Next: ${nextItem}` : `${progress} · All done`;
};

export const getChecklistProgressPreview = (items) => {
  const { completed, total } = calculateChecklistProgress(items);
  return total ? `${completed} of ${total} completed` : 'No checklist items';
};

export const isChecklistNoteEmpty = (title, items) =>
  !String(title ?? '').trim() && !getVisibleChecklistItems(items).length;

