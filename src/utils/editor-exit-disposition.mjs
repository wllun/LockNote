export const getEditorExitDisposition = ({
  loadCompleted,
  isNewDraft,
  isEmpty,
  isDeleted,
  hasPendingSave,
}) => {
  if (!loadCompleted || isDeleted) return 'none';
  if (isNewDraft && isEmpty) return 'delete';
  if (hasPendingSave) return 'save';
  return 'none';
};
