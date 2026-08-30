import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inferDialogVariant,
  normalizeActiveDialogButtons,
  normalizeDialogButtons,
} from '../src/utils/app-dialog.mjs';

test('normalizes an empty message dialog to one OK action', () => {
  assert.deepEqual(normalizeDialogButtons(), [{ text: 'OK', style: 'default' }]);
});

test('does not create a transient OK action when there is no active dialog', () => {
  assert.deepEqual(normalizeActiveDialogButtons(null), []);
  assert.deepEqual(normalizeActiveDialogButtons(undefined), []);
  assert.deepEqual(normalizeActiveDialogButtons({}), [{ text: 'OK', style: 'default' }]);
});

test('uses the destructive presentation when a destructive action is present', () => {
  assert.equal(
    inferDialogVariant('Delete note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]),
    'danger'
  );
});

test('uses suitable message variants and respects an explicit variant', () => {
  assert.equal(inferDialogVariant('Error'), 'error');
  assert.equal(inferDialogVariant('Reset paid status?'), 'warning');
  assert.equal(inferDialogVariant('Saved in note'), 'info');
  assert.equal(inferDialogVariant('Error', [], 'info'), 'info');
});
