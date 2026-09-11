import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOLDER_VIEW_MODES,
  normalizeFolderViewMode,
  normalizeNoteViewMode,
  NOTE_VIEW_MODES,
  publishViewModePreferences,
  resolveViewModePreferences,
  subscribeToViewModePreferences,
} from '../src/utils/note-view-mode.mjs';

test('accepts the supported note list and grid view modes', () => {
  assert.deepEqual(NOTE_VIEW_MODES, ['list', 'grid']);
  assert.equal(normalizeNoteViewMode('list'), 'list');
  assert.equal(normalizeNoteViewMode('grid'), 'grid');
});

test('falls back to list view for missing or invalid preferences', () => {
  assert.equal(normalizeNoteViewMode(null), 'list');
  assert.equal(normalizeNoteViewMode('tiles'), 'list');
});

test('accepts separate folder list and strip modes', () => {
  assert.deepEqual(FOLDER_VIEW_MODES, ['list', 'strip']);
  assert.equal(normalizeFolderViewMode('strip'), 'strip');
  assert.equal(normalizeFolderViewMode('grid'), 'list');
});

test('migrates the previous combined grid preference into strip and grid', () => {
  assert.deepEqual(resolveViewModePreferences({ legacyMode: 'grid' }), {
    folderViewMode: 'strip',
    noteViewMode: 'grid',
  });
});

test('keeps independently saved preferences ahead of the legacy value', () => {
  assert.deepEqual(resolveViewModePreferences({
    folderMode: 'list',
    noteMode: 'grid',
    legacyMode: 'list',
  }), {
    folderViewMode: 'list',
    noteViewMode: 'grid',
  });
});

test('broadcasts view changes to every mounted screen and stops after unsubscribe', () => {
  const firstScreenChanges = [];
  const secondScreenChanges = [];
  const unsubscribeFirst = subscribeToViewModePreferences((change) => firstScreenChanges.push(change));
  const unsubscribeSecond = subscribeToViewModePreferences((change) => secondScreenChanges.push(change));

  publishViewModePreferences({ noteViewMode: 'grid' });
  unsubscribeFirst();
  publishViewModePreferences({ folderViewMode: 'strip' });
  unsubscribeSecond();

  assert.deepEqual(firstScreenChanges, [{ noteViewMode: 'grid' }]);
  assert.deepEqual(secondScreenChanges, [
    { noteViewMode: 'grid' },
    { folderViewMode: 'strip' },
  ]);
});

test('ignores unsupported view changes', () => {
  const changes = [];
  const unsubscribe = subscribeToViewModePreferences((change) => changes.push(change));

  publishViewModePreferences({ folderViewMode: 'grid', noteViewMode: 'strip' });
  unsubscribe();

  assert.deepEqual(changes, []);
});
