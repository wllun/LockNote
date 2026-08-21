import assert from 'node:assert/strict';
import test from 'node:test';

import {
  constrainNormalNoteContent,
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

test('constrains typed and pasted note content to the maximum length', () => {
  const belowLimit = constrainNormalNoteContent('LockNote');
  assert.deepEqual(belowLimit, {
    value: 'LockNote',
    limitReached: false,
    wasTruncated: false,
  });

  const exactLimit = constrainNormalNoteContent(
    'x'.repeat(NORMAL_NOTE_CONTENT_MAX_CHARACTERS)
  );
  assert.equal(exactLimit.limitReached, true);
  assert.equal(exactLimit.wasTruncated, false);

  const oversizedPaste = constrainNormalNoteContent(
    'x'.repeat(NORMAL_NOTE_CONTENT_MAX_CHARACTERS + 250)
  );
  assert.equal(oversizedPaste.value.length, NORMAL_NOTE_CONTENT_MAX_CHARACTERS);
  assert.equal(oversizedPaste.limitReached, true);
  assert.equal(oversizedPaste.wasTruncated, true);
});

test('defines visible text limits for expense note fields', () => {
  assert.equal(EXPENSE_REMARK_MAX_CHARACTERS, 200);
  assert.equal(EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS, 120);
  assert.equal(EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS, 10_000);
});
