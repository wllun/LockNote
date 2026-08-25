import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTrashRemaining,
  isTrashExpired,
  trashDaysRemaining,
  TRASH_RETENTION_DAYS,
  TRASH_RETENTION_MS,
} from '../src/utils/trash.mjs';

const now = Date.UTC(2026, 7, 25, 12, 0, 0);

test('expires trash exactly 30 days after deletion', () => {
  const deletedAt = new Date(now - TRASH_RETENTION_MS).toISOString();
  assert.equal(TRASH_RETENTION_DAYS, 30);
  assert.equal(isTrashExpired(deletedAt, now - 1), false);
  assert.equal(isTrashExpired(deletedAt, now), true);
});

test('shows rounded-up days remaining and a final deleting-soon state', () => {
  assert.equal(
    trashDaysRemaining(new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(), now),
    1
  );
  assert.equal(
    formatTrashRemaining(new Date(now - TRASH_RETENTION_MS).toISOString(), now),
    'Deleting soon'
  );
});

test('does not auto-delete rows with malformed legacy timestamps', () => {
  assert.equal(isTrashExpired('not-a-date', now), false);
  assert.equal(trashDaysRemaining('not-a-date', now), TRASH_RETENTION_DAYS);
});
