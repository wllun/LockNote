export const SUBFOLDER_READ_ONLY_MESSAGE = 'Editing in subfolders requires Pro. Move this note to Home or a top-level folder to continue editing.';

export const isSubfolderReadOnly = (note, folder, plan) =>
  note?.share_origin !== 'incoming'
  && Boolean(note?.folder_id)
  && folder?.id === note.folder_id
  && !folder.is_deleted
  && folder.parent_id != null
  && plan !== 'pro';

export const subfolderReadOnlyError = () => {
  const error = new Error(SUBFOLDER_READ_ONLY_MESSAGE);
  error.code = 'SUBFOLDER_READ_ONLY';
  return error;
};

export const combineNoteEditAccess = (access, subfolderReadOnly) => ({
  ...access,
  editAccess: true,
  subfolderReadOnly,
  canEdit: access?.canEdit === true && !subfolderReadOnly,
});
