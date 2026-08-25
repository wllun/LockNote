import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTE_COLOR,
  applyNoteColorPreferences,
  getNoteColorTheme,
  normalizeNoteColor,
  normalizeNoteColorPreferences,
  NOTE_COLOR_OPTIONS,
} from '../src/utils/note-color.mjs';

test('accepts every supported semantic note color', () => {
  for (const option of NOTE_COLOR_OPTIONS) {
    assert.equal(normalizeNoteColor(option.id), option.id);
  }
});

test('falls back safely for old or malformed note colors', () => {
  assert.equal(normalizeNoteColor(undefined), DEFAULT_NOTE_COLOR);
  assert.equal(normalizeNoteColor(null), DEFAULT_NOTE_COLOR);
  assert.equal(normalizeNoteColor('#ff0000'), DEFAULT_NOTE_COLOR);
});

test('resolves a saved color through the active theme palette', () => {
  const colors = {
    card: '#fff',
    border: '#ddd',
    noteColors: {
      default: { surface: '#fff', accent: '#ddd' },
      blue: { surface: '#eef', accent: '#00f' },
    },
  };
  assert.deepEqual(getNoteColorTheme('blue', colors), colors.noteColors.blue);
  assert.deepEqual(getNoteColorTheme('invalid', colors), colors.noteColors.default);
});

test('keeps only valid non-default per-device preferences', () => {
  assert.deepEqual(
    normalizeNoteColorPreferences({ first: 'blue', second: 'default', bad: '#fff' }),
    { first: 'blue' },
  );
});

test('merges local preferences into rendered notes without changing note data', () => {
  const notes = [{ id: 'first', title: 'One' }, { id: 'second', title: 'Two' }];
  const rendered = applyNoteColorPreferences(notes, { first: 'rose' });
  assert.equal(rendered[0].color, 'rose');
  assert.equal(rendered[1].color, 'default');
  assert.equal('color' in notes[0], false);
});
