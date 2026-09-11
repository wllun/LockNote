import { softDeleteNoteWithCleanup } from '../utils/reminder-cleanup';

export const inspectFolderTree = async (folderRepo, noteRepo, folderId) => {
  const folderIds = await folderRepo.getDescendantIds(folderId, true);
  const noteGroups = await Promise.all(
    folderIds.map((id) => noteRepo.getActiveByFolderId(id))
  );
  return {
    folderIds,
    notes: noteGroups.flat(),
    folderCount: folderIds.length,
    noteCount: noteGroups.reduce((total, group) => total + group.length, 0),
  };
};

export const deleteFolderTree = async (folderRepo, noteRepo, folderId) => {
  const contents = await inspectFolderTree(folderRepo, noteRepo, folderId);
  for (const note of contents.notes) {
    await softDeleteNoteWithCleanup(noteRepo, note);
  }
  for (const id of contents.folderIds) {
    await noteRepo.detachFromFolder(id);
  }
  for (const id of [...contents.folderIds].reverse()) {
    await folderRepo.softDelete(id);
  }
  return contents;
};
