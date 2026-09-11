export const LEGACY_HOME_VIEW_MODE_STORAGE_KEY = '@locknote_home_view_mode';
export const FOLDER_VIEW_MODE_STORAGE_KEY = '@locknote_folder_view_mode';
export const NOTE_VIEW_MODE_STORAGE_KEY = '@locknote_note_view_mode';

export const NOTE_VIEW_MODES = Object.freeze(['list', 'grid']);
export const FOLDER_VIEW_MODES = Object.freeze(['list', 'strip']);

const viewModePreferenceListeners = new Set();

export const normalizeNoteViewMode = (mode) =>
  NOTE_VIEW_MODES.includes(mode) ? mode : 'list';

export const normalizeFolderViewMode = (mode) =>
  FOLDER_VIEW_MODES.includes(mode) ? mode : 'list';

export const resolveViewModePreferences = ({
  folderMode,
  noteMode,
  legacyMode,
} = {}) => ({
  folderViewMode: FOLDER_VIEW_MODES.includes(folderMode)
    ? folderMode
    : legacyMode === 'grid'
      ? 'strip'
      : 'list',
  noteViewMode: NOTE_VIEW_MODES.includes(noteMode)
    ? noteMode
    : normalizeNoteViewMode(legacyMode),
});

export const publishViewModePreferences = ({ folderViewMode, noteViewMode } = {}) => {
  const change = {};
  if (FOLDER_VIEW_MODES.includes(folderViewMode)) change.folderViewMode = folderViewMode;
  if (NOTE_VIEW_MODES.includes(noteViewMode)) change.noteViewMode = noteViewMode;
  if (Object.keys(change).length === 0) return;

  [...viewModePreferenceListeners].forEach((listener) => {
    try {
      listener(change);
    } catch {
      // A screen listener must not prevent other mounted screens from updating.
    }
  });
};

export const subscribeToViewModePreferences = (listener) => {
  if (typeof listener !== 'function') return () => {};
  viewModePreferenceListeners.add(listener);
  return () => viewModePreferenceListeners.delete(listener);
};
