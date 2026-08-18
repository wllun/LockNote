import test from 'node:test';
import assert from 'node:assert/strict';

import { formatNoteUpdatedAt } from '../src/utils/note-timestamp.mjs';

test('formats the note update timestamp with both date and time', () => {
  const result = formatNoteUpdatedAt('2026-08-18T07:42:00.000Z', {
    locale: 'en-US',
    timeZone: 'UTC',
  });

  assert.equal(result, 'Updated Aug 18, 2026, 7:42 AM');
});

test('provides a safe label when the timestamp is missing or invalid', () => {
  assert.equal(formatNoteUpdatedAt(undefined), 'Updated date unavailable');
  assert.equal(formatNoteUpdatedAt('not-a-date'), 'Updated date unavailable');
});
