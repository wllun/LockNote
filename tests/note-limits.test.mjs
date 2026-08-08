import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS,
  EXPENSE_REMARK_MAX_CHARACTERS,
  EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS,
  getNormalNoteCharacterCount,
  NORMAL_NOTE_CONTENT_MAX_CHARACTERS,
} from '../src/utils/note-limits.mjs';

test('limits normal note content to 100,000 characters', () => {
  assert.equal(NORMAL_NOTE_CONTENT_MAX_CHARACTERS, 100_000);
});

test('counts the characters displayed by the normal note editor', () => {
  assert.equal(getNormalNoteCharacterCount(), 0);
  assert.equal(getNormalNoteCharacterCount('LockNote'), 8);
});

test('defines visible text limits for expense note fields', () => {
  assert.equal(EXPENSE_REMARK_MAX_CHARACTERS, 200);
  assert.equal(EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS, 120);
  assert.equal(EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS, 10_000);
});
