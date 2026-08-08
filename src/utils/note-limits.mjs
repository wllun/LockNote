export const NORMAL_NOTE_CONTENT_MAX_CHARACTERS = 100_000;
export const EXPENSE_REMARK_MAX_CHARACTERS = 200;
export const EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS = 120;
export const EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS = 10_000;

export const getNormalNoteCharacterCount = (content = '') => content.length;
