import test from 'node:test';
import assert from 'node:assert/strict';
import { getEditorExitDisposition } from '../src/utils/editor-exit-disposition.mjs';

test('never deletes a note before its editor finishes loading', () => {
  assert.equal(getEditorExitDisposition({
    loadCompleted: false,
    isNewDraft: true,
    isEmpty: true,
    isDeleted: false,
    hasPendingSave: false,
  }), 'none');
});

test('never automatically deletes an existing note', () => {
  assert.equal(getEditorExitDisposition({
    loadCompleted: true,
    isNewDraft: false,
    isEmpty: true,
    isDeleted: false,
    hasPendingSave: false,
  }), 'none');
});

test('deletes only a loaded, newly created empty draft', () => {
  assert.equal(getEditorExitDisposition({
    loadCompleted: true,
    isNewDraft: true,
    isEmpty: true,
    isDeleted: false,
    hasPendingSave: false,
  }), 'delete');
});

test('flushes pending changes for a loaded note', () => {
  assert.equal(getEditorExitDisposition({
    loadCompleted: true,
    isNewDraft: false,
    isEmpty: false,
    isDeleted: false,
    hasPendingSave: true,
  }), 'save');
});
