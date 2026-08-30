import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorUndoHistory } from '../src/utils/editor-undo.mjs';

test('groups consecutive typing changes into one undo step', () => {
  const history = createEditorUndoHistory({ groupWindowMs: 800 });

  history.record({ text: '' }, { groupKey: 'content', now: 1000 });
  history.record({ text: 'H' }, { groupKey: 'content', now: 1400 });
  history.record({ text: 'He' }, { groupKey: 'content', now: 1800 });

  assert.equal(history.size(), 1);
  assert.deepEqual(history.undo(), { text: '' });
});

test('creates separate undo steps after a pause or a different action', () => {
  const history = createEditorUndoHistory({ groupWindowMs: 800 });

  history.record({ text: '' }, { groupKey: 'content', now: 1000 });
  history.record({ text: 'Hello' }, { groupKey: 'content', now: 2000 });
  history.record({ text: 'Hello', checked: false }, { now: 2100 });

  assert.deepEqual(history.undo(), { text: 'Hello', checked: false });
  assert.deepEqual(history.undo(), { text: 'Hello' });
  assert.deepEqual(history.undo(), { text: '' });
});

test('caps history and returns snapshots without shared references', () => {
  const history = createEditorUndoHistory({ limit: 2 });
  const snapshot = { items: [{ text: 'One' }] };

  history.record(snapshot, { now: 1 });
  snapshot.items[0].text = 'Changed outside history';
  history.record({ items: [{ text: 'Two' }] }, { now: 2 });
  history.record({ items: [{ text: 'Three' }] }, { now: 3 });

  assert.equal(history.size(), 2);
  assert.deepEqual(history.undo(), { items: [{ text: 'Three' }] });
  assert.deepEqual(history.undo(), { items: [{ text: 'Two' }] });
  assert.equal(history.undo(), null);
});

test('moves current snapshots between undo and redo history', () => {
  const history = createEditorUndoHistory();

  history.record({ text: '' });
  history.record({ text: 'Hello' });

  assert.deepEqual(history.undo({ text: 'Hello world' }), { text: 'Hello' });
  assert.deepEqual(history.undo({ text: 'Hello' }), { text: '' });
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), true);
  assert.equal(history.redoSize(), 2);

  assert.deepEqual(history.redo({ text: '' }), { text: 'Hello' });
  assert.deepEqual(history.redo({ text: 'Hello' }), { text: 'Hello world' });
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);
});

test('clears redo history when a new change is recorded after undo', () => {
  const history = createEditorUndoHistory();

  history.record({ text: '' });
  assert.deepEqual(history.undo({ text: 'A' }), { text: '' });
  assert.equal(history.canRedo(), true);

  history.record({ text: '' });
  assert.equal(history.canRedo(), false);
  assert.equal(history.redo({ text: 'B' }), null);
});
