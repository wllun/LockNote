import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
