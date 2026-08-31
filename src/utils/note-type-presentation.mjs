const NOTE_TYPE_PRESENTATIONS = Object.freeze({
  note: Object.freeze({ label: 'Note', iconName: 'document-text-outline' }),
  checklist: Object.freeze({ label: 'Checklist', iconName: 'checkbox-outline' }),
  expense: Object.freeze({ label: 'Expense', iconName: 'receipt-outline' }),
  reminder: Object.freeze({ label: 'Reminder', iconName: 'alarm-outline' }),
});

export const getNoteTypePresentation = (noteType) =>
  NOTE_TYPE_PRESENTATIONS[noteType] || NOTE_TYPE_PRESENTATIONS.note;

export const createNoteDeleteDetail = (noteType, title) => {
  const presentation = getNoteTypePresentation(noteType);

  return {
    label: presentation.label,
    value: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled note',
    iconName: presentation.iconName,
  };
};
