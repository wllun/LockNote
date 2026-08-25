import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyNoteColorPreferences,
  DEFAULT_NOTE_COLOR,
  normalizeNoteColor,
  normalizeNoteColorPreferences,
} from './note-color.mjs';

const NOTE_COLORS_KEY = '@locknote_note_colors';

const readColors = async () => {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(NOTE_COLORS_KEY)) || '{}');
    return normalizeNoteColorPreferences(stored);
  } catch {
    return {};
  }
};

let mutationQueue = Promise.resolve();

const mutateColors = (mutation) => {
  const operation = mutationQueue.then(async () => {
    const colors = await readColors();
    const result = mutation(colors);
    await AsyncStorage.setItem(NOTE_COLORS_KEY, JSON.stringify(colors));
    return result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
};

export const noteColorPreference = {
  async load(noteId) {
    if (!noteId) return DEFAULT_NOTE_COLOR;
    const colors = await readColors();
    return normalizeNoteColor(colors[noteId]);
  },

  async save(noteId, color) {
    const normalized = normalizeNoteColor(color);
    if (!noteId) return normalized;
    return await mutateColors((colors) => {
      if (normalized === DEFAULT_NOTE_COLOR) delete colors[noteId];
      else colors[noteId] = normalized;
      return normalized;
    });
  },

  async applyToNotes(notes = []) {
    const colors = await readColors();
    return applyNoteColorPreferences(notes, colors);
  },

  async remove(noteId) {
    if (!noteId) return;
    try {
      await mutateColors((colors) => {
        delete colors[noteId];
      });
    } catch {
      // Preference cleanup must never make a successful note deletion look failed.
    }
  },
};
