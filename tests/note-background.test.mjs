import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_BACKGROUND_MAX_BYTES,
  applyNoteBackgroundPreferences,
  getNoteBackgroundOverlayColor,
  getPickedImageExtension,
  isLocalNoteBackgroundUri,
  isPickedImageTooLarge,
  normalizeNoteBackgroundPreferences,
} from '../src/utils/note-background.mjs';

test('accepts only device-local note background URIs', () => {
  assert.equal(isLocalNoteBackgroundUri('file:///notes/background.jpg'), true);
  assert.equal(isLocalNoteBackgroundUri('blob:https://local.test/123'), true);
  assert.equal(isLocalNoteBackgroundUri('data:image/png;base64,abc'), true);
  assert.equal(isLocalNoteBackgroundUri('https://example.com/background.jpg'), false);
});

test('filters malformed and remote background preferences', () => {
  assert.deepEqual(normalizeNoteBackgroundPreferences({
    first: 'file:///notes/first.jpg',
    second: 'https://example.com/second.jpg',
    third: null,
  }), { first: 'file:///notes/first.jpg' });
});

test('decorates rendered notes without changing stored note objects', () => {
  const notes = [{ id: 'first', title: 'One' }, { id: 'second', title: 'Two' }];
  const decorated = applyNoteBackgroundPreferences(notes, {
    first: 'file:///notes/first.webp',
  });
  assert.equal(decorated[0].background_image_uri, 'file:///notes/first.webp');
  assert.equal(decorated[1].background_image_uri, null);
  assert.equal('background_image_uri' in notes[0], false);
});

test('creates a clamped theme-colored readability overlay', () => {
  assert.equal(getNoteBackgroundOverlayColor('#1C2233'), 'rgba(28,34,51,0.82)');
  assert.equal(getNoteBackgroundOverlayColor('#ffffff', 2), 'rgba(255,255,255,1)');
  assert.equal(getNoteBackgroundOverlayColor('transparent'), 'transparent');
});

test('uses supported extensions and enforces the 10 MB image limit', () => {
  assert.equal(getPickedImageExtension({ fileName: 'photo.WEBP' }), 'webp');
  assert.equal(getPickedImageExtension({ mimeType: 'image/png' }), 'png');
  assert.equal(getPickedImageExtension({ fileName: 'photo.unknown' }), 'jpg');
  assert.equal(isPickedImageTooLarge({ fileSize: NOTE_BACKGROUND_MAX_BYTES }), false);
  assert.equal(isPickedImageTooLarge({ fileSize: NOTE_BACKGROUND_MAX_BYTES + 1 }), true);
});
