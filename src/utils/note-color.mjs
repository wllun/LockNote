export const DEFAULT_NOTE_COLOR = 'default';

export const NOTE_COLOR_OPTIONS = Object.freeze([
  { id: DEFAULT_NOTE_COLOR, label: 'Default' },
  { id: 'rose', label: 'Rose' },
  { id: 'orange', label: 'Orange' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'purple', label: 'Purple' },
]);

const NOTE_COLOR_IDS = new Set(NOTE_COLOR_OPTIONS.map((option) => option.id));

export const normalizeNoteColor = (value) =>
  NOTE_COLOR_IDS.has(value) ? value : DEFAULT_NOTE_COLOR;

export const getNoteColorTheme = (value, colors) => {
  const id = normalizeNoteColor(value);
  return colors.noteColors?.[id] || {
    surface: colors.card,
    accent: colors.border,
  };
};

export const normalizeNoteColorPreferences = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const [noteId, color] of Object.entries(value)) {
    const nextColor = normalizeNoteColor(color);
    if (noteId && nextColor !== DEFAULT_NOTE_COLOR) normalized[noteId] = nextColor;
  }
  return normalized;
};

export const applyNoteColorPreferences = (notes = [], preferences = {}) =>
  notes.map((note) => ({
    ...note,
    color: normalizeNoteColor(preferences[note.id]),
  }));
