export const LEGACY_HOME_VIEW_MODE_STORAGE_KEY = '@locknote_home_view_mode';
export const FOLDER_VIEW_MODE_STORAGE_KEY = '@locknote_folder_view_mode';
export const NOTE_VIEW_MODE_STORAGE_KEY = '@locknote_note_view_mode';

export const NOTE_VIEW_MODES = Object.freeze(['list', 'grid']);
export const FOLDER_VIEW_MODES = Object.freeze(['list', 'strip']);

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
