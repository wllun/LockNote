import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNoteDeleteDetail,
  getNoteTypePresentation,
} from '../src/utils/note-type-presentation.mjs';

test('note type presentations use the matching labels and icons', () => {
  assert.deepEqual(getNoteTypePresentation('note'), {
    label: 'Note',
    iconName: 'document-text-outline',
  });
  assert.deepEqual(getNoteTypePresentation('checklist'), {
    label: 'Checklist',
    iconName: 'checkbox-outline',
  });
  assert.deepEqual(getNoteTypePresentation('expense'), {
    label: 'Expense',
    iconName: 'receipt-outline',
  });
  assert.deepEqual(getNoteTypePresentation('reminder'), {
    label: 'Reminder',
    iconName: 'alarm-outline',
  });
});

test('unknown note types fall back to the plain note presentation', () => {
  assert.deepEqual(getNoteTypePresentation('unknown'), getNoteTypePresentation('note'));
});

test('delete details trim titles and preserve the selected note type', () => {
  assert.deepEqual(createNoteDeleteDetail('expense', '  August expenses  '), {
    label: 'Expense',
    value: 'August expenses',
    iconName: 'receipt-outline',
  });
  assert.equal(createNoteDeleteDetail('checklist', '   ').value, 'Untitled note');
});
