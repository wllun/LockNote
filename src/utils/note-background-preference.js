import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import {
  applyNoteBackgroundPreferences,
  getPickedImageExtension,
  isLocalNoteBackgroundUri,
  isPickedImageTooLarge,
  normalizeNoteBackgroundPreferences,
} from './note-background.mjs';

const NOTE_BACKGROUNDS_KEY = '@locknote_note_backgrounds';
const backgroundsDirectory = new Directory(Paths.document, 'note-backgrounds');

const readBackgrounds = async () => {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(NOTE_BACKGROUNDS_KEY)) || '{}');
    return normalizeNoteBackgroundPreferences(stored);
  } catch {
    return {};
  }
};

let mutationQueue = Promise.resolve();

const mutateBackgrounds = (mutation) => {
  const operation = mutationQueue.then(async () => {
    const backgrounds = await readBackgrounds();
    const result = mutation(backgrounds);
    await AsyncStorage.setItem(NOTE_BACKGROUNDS_KEY, JSON.stringify(backgrounds));
    return result;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
};

const safeFile = (uri) => {
  try {
    return isLocalNoteBackgroundUri(uri) ? new File(uri) : null;
  } catch {
    return null;
  }
};

const deleteManagedFile = (uri) => {
  try {
    if (!uri?.startsWith(backgroundsDirectory.uri)) return;
    const file = safeFile(uri);
    if (file?.exists) file.delete();
  } catch {
    // Orphan cleanup must not hide the successful preference update.
  }
};

const safeNoteId = (noteId) => String(noteId).replace(/[^a-z0-9_-]/gi, '_');

export const noteBackgroundPreference = {
  async load(noteId) {
    if (!noteId) return null;
    const backgrounds = await readBackgrounds();
    const uri = backgrounds[noteId];
    if (!uri) return null;
    const file = safeFile(uri);
    if (file?.exists) return uri;
    await this.removeQuietly(noteId);
    return null;
  },

  async saveAsset(noteId, asset) {
    if (!noteId || !asset?.uri) throw new Error('No background image was selected.');
    const source = new File(asset.uri);
    if (!source.exists) throw new Error('The selected image is no longer available.');
    if (isPickedImageTooLarge(asset, source.size)) {
      const error = new Error('The selected image is larger than 10 MB.');
      error.code = 'IMAGE_TOO_LARGE';
      throw error;
    }

    backgroundsDirectory.create({ idempotent: true, intermediates: true });
    const extension = getPickedImageExtension(asset);
    const destination = new File(
      backgroundsDirectory,
      `${safeNoteId(noteId)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${extension}`
    );
    source.copy(destination);

    let previousUri = null;
    try {
      previousUri = await mutateBackgrounds((backgrounds) => {
        const previous = backgrounds[noteId] || null;
        backgrounds[noteId] = destination.uri;
        return previous;
      });
    } catch (error) {
      deleteManagedFile(destination.uri);
      throw error;
    }
    if (previousUri && previousUri !== destination.uri) deleteManagedFile(previousUri);
    return destination.uri;
  },

  async applyToNotes(notes = []) {
    const backgrounds = await readBackgrounds();
    const available = {};
    for (const note of notes) {
      const uri = backgrounds[note.id];
      if (uri && safeFile(uri)?.exists) available[note.id] = uri;
    }
    return applyNoteBackgroundPreferences(notes, available);
  },

  async remove(noteId) {
    if (!noteId) return;
    const uri = await mutateBackgrounds((backgrounds) => {
      const previous = backgrounds[noteId] || null;
      delete backgrounds[noteId];
      return previous;
    });
    deleteManagedFile(uri);
  },

  async removeQuietly(noteId) {
    try {
      await this.remove(noteId);
    } catch {
      // Presentation cleanup must never make a successful note deletion look failed.
    }
  },
};

