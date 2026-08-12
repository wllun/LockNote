import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChecklistProgress,
  CHECKLIST_ITEM_MAX_CHARACTERS,
  createChecklistItem,
  getChecklistPreview,
  isChecklistNoteEmpty,
  moveChecklistItem,
  moveChecklistItemToIndex,
  parseChecklistNote,
  sanitizeChecklistItemText,
  serializeChecklistNote,
} from '../src/utils/checklist-note.mjs';

test('moves checklist items while preserving their data', () => {
  const items = [
    createChecklistItem({ id: 'one', text: 'One', completed: true }),
    createChecklistItem({ id: 'two', text: 'Two' }),
    createChecklistItem({ id: 'three', text: 'Three' }),
  ];

  const moved = moveChecklistItemToIndex(items, 'one', 2);
  assert.deepEqual(moved.map((item) => item.id), ['two', 'three', 'one']);
  assert.deepEqual(moved[2], items[0]);
  assert.deepEqual(
    moveChecklistItem(moved, 'one', 'up').map((item) => item.id),
    ['two', 'one', 'three']
  );
  assert.equal(moveChecklistItem(items, 'one', 'up'), items);
  assert.equal(moveChecklistItemToIndex(items, 'missing', 1), items);
});

test('serializes and parses ordered checklist items', () => {
  const items = [
    createChecklistItem({ id: 'milk', text: 'Buy milk', completed: true }),
    createChecklistItem({ id: 'fuel', text: 'Fill petrol', completed: false }),
  ];

  assert.deepEqual(parseChecklistNote(serializeChecklistNote(items)), {
    sourceVersion: 1,
    items,
  });
});

test('treats missing and malformed checklist content as empty', () => {
  assert.deepEqual(parseChecklistNote(''), { sourceVersion: 1, items: [] });
  assert.deepEqual(parseChecklistNote('not json'), { sourceVersion: 1, items: [] });
  assert.deepEqual(parseChecklistNote('[]'), { sourceVersion: 1, items: [] });
});

test('calculates checklist progress from visible items', () => {
  const items = [
    createChecklistItem({ id: '1', text: 'Done', completed: true }),
    createChecklistItem({ id: '2', text: 'Next', completed: false }),
    createChecklistItem({ id: '3', text: '  ', completed: true }),
  ];

  assert.deepEqual(calculateChecklistProgress(items), {
    total: 2,
    completed: 1,
    remaining: 1,
    percent: 50,
  });
  assert.equal(getChecklistPreview(items), '1 of 2 completed · Next: Next');
});

test('detects empty checklist notes and limits item text', () => {
  const blank = createChecklistItem({ id: 'blank', text: '   ' });
  assert.equal(isChecklistNoteEmpty('', [blank]), true);
  assert.equal(isChecklistNoteEmpty('Shopping', []), false);
  assert.equal(isChecklistNoteEmpty('', [createChecklistItem({ text: 'Milk' })]), false);
  assert.equal(
    sanitizeChecklistItemText('x'.repeat(CHECKLIST_ITEM_MAX_CHARACTERS + 10)).length,
    CHECKLIST_ITEM_MAX_CHARACTERS
  );
});

