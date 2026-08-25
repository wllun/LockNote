import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { cancelNoteReminder } from '../utils/reminder-cleanup';
import { noteColorPreference } from '../utils/note-color-preference';
import { isTrashExpired } from '../utils/trash.mjs';

const isVisibleTrashNote = (note) => note?.share_origin !== 'incoming';

const permanentlyDeleteNote = async (note) => {
  await cancelNoteReminder(note);
  await noteRepo.hardDelete(note.id);
  await noteColorPreference.remove(note.id);
};

const discardDeletedFolders = async () => {
  const folders = await folderRepo.getDeleted();
  for (const folder of folders) {
    await noteRepo.detachFromFolder(folder.id);
    await folderRepo.hardDelete(folder.id);
  }
  return folders.length;
};

export const trashService = {
  async list() {
    await discardDeletedFolders();
    const notes = await noteRepo.getDeleted();
    return notes.filter(isVisibleTrashNote);
  },

  async restoreNote(note) {
    if (!note || !isVisibleTrashNote(note)) return null;
    const parent = note.folder_id
      ? await folderRepo.getById(note.folder_id)
      : null;
    return await noteRepo.restore(note.id, parent?.id ?? null);
  },

  async permanentlyDeleteNote(note) {
    if (!note) return;
    await permanentlyDeleteNote(note);
  },

  async empty() {
    const notes = await this.list();
    const deletableNotes = notes.filter((note) => !note.password);

    for (const note of deletableNotes) await permanentlyDeleteNote(note);

    const remaining = await this.list();
    return {
      noteCount: deletableNotes.length,
      remainingCount: remaining.length,
    };
  },

  async purgeExpired(referenceTime = Date.now()) {
    const folderCount = await discardDeletedFolders();
    const notes = await noteRepo.getDeleted();
    let noteCount = 0;

    for (const note of notes) {
      if (!isTrashExpired(note.updated_at, referenceTime)) continue;
      await permanentlyDeleteNote(note);
      noteCount += 1;
    }

    return { folderCount, noteCount };
  },
};
