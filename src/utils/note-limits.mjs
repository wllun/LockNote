export const NORMAL_NOTE_CONTENT_MAX_CHARACTERS = 100_000;
export const EXPENSE_REMARK_MAX_CHARACTERS = 200;
export const EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS = 120;
export const EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS = 10_000;

export const getNormalNoteCharacterCount = (content = '') => content.length;

export const constrainNormalNoteContent = (content = '') => {
  const value = String(content ?? '');
  return {
    value: value.slice(0, NORMAL_NOTE_CONTENT_MAX_CHARACTERS),
    limitReached: value.length >= NORMAL_NOTE_CONTENT_MAX_CHARACTERS,
    wasTruncated: value.length > NORMAL_NOTE_CONTENT_MAX_CHARACTERS,
  };
};
