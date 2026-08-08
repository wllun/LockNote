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

export const isChecklistNoteEmpty = (title, items) =>
  !String(title ?? '').trim() && !getVisibleChecklistItems(items).length;

