import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNoteMoveDestinations } from '../src/utils/note-move.mjs';

const folders = [
  { id: 'work', name: 'Work', password: null },
  { id: 'private', name: 'Private', password: 'hashed-password' },
];

test('uses null as the Home destination for root-note semantics', () => {
  const destinations = buildNoteMoveDestinations(folders, 'work');

  assert.deepEqual(destinations[0], {
    id: null,
    name: 'Home',
    isCurrent: false,
    isLocked: false,
  });
});

test('marks the current folder and locked destinations', () => {
  const destinations = buildNoteMoveDestinations(folders, 'work');

  assert.equal(destinations.find((item) => item.id === 'work').isCurrent, true);
  assert.equal(
    destinations.find((item) => item.id === 'private').isLocked,
    true
  );
});

test('marks Home as current for root notes', () => {
  const [home] = buildNoteMoveDestinations(folders, null);
  assert.equal(home.isCurrent, true);
});
