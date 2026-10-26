import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChecklistProgress,
  CHECKLIST_ITEM_MAX_CHARACTERS,
  CHECKLIST_MAX_ITEMS,
  createChecklistItem,
  getChecklistProgressPreview,
  getChecklistPreview,
  isChecklistNoteEmpty,
  moveChecklistItem,
  moveChecklistItemToIndex,
  getChecklistDisplayItems,
  moveDisplayedChecklistItem,
  moveDisplayedChecklistItemToIndex,
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

test('hide checked is a display filter and never removes blank or checked saved items', () => {
  const items = [createChecklistItem({ id: 'todo', text: 'Next' }), createChecklistItem({ id: 'done', text: 'Done', completed: true }), createChecklistItem({ id: 'blank' })];
  assert.equal(getChecklistDisplayItems(items), items);
  assert.deepEqual(getChecklistDisplayItems(items, true).map((item) => item.id), ['todo', 'blank']);
  assert.equal(parseChecklistNote(serializeChecklistNote(items)).items.length, 3);
  assert.equal(calculateChecklistProgress(items).completed, 1);
});

test('filtered drag and accessibility reorder preserve hidden checked slots and every item', () => {
  const items = ['a', 'done1', 'b', 'done2', 'c'].map((id) => createChecklistItem({ id, text: id, completed: id.startsWith('done') }));
  const moved = moveDisplayedChecklistItemToIndex(items, 'c', 0, true);
  assert.deepEqual(moved.map((item) => item.id), ['c', 'done1', 'a', 'done2', 'b']);
  assert.equal(moved[1], items[1]);
  assert.equal(moved[3], items[3]);
  assert.deepEqual(moveDisplayedChecklistItem(items, 'b', 'up', true).map((item) => item.id), ['b', 'done1', 'a', 'done2', 'c']);
  assert.equal(moveDisplayedChecklistItem(items, 'done1', 'down', true), items);
  assert.equal(moveDisplayedChecklistItem(items, 'a', 'up', true), items);
  assert.deepEqual(moveDisplayedChecklistItem(items, 'b', 'up', false).map((item) => item.id), ['a', 'b', 'done1', 'done2', 'c']);
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
  assert.equal(getChecklistProgressPreview(items), '1 of 2 completed');
  assert.equal(getChecklistProgressPreview([]), 'No checklist items');
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

test('limits new checklists to 100 items without truncating legacy checklist data', () => {
  assert.equal(CHECKLIST_MAX_ITEMS, 100);

  const legacyItems = Array.from({ length: CHECKLIST_MAX_ITEMS + 1 }, (_, index) => ({
    id: `legacy-${index}`,
    text: `Item ${index + 1}`,
    completed: index % 2 === 0,
  }));
  const parsed = parseChecklistNote(JSON.stringify({ version: 1, items: legacyItems }));

  assert.equal(parsed.items.length, CHECKLIST_MAX_ITEMS + 1);
  assert.equal(parseChecklistNote(serializeChecklistNote(parsed.items)).items.length, legacyItems.length);
});

