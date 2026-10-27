import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_ATTACHMENT_SOURCE_BYTES,
  MAX_ATTACHMENT_STORED_BYTES,
  getAttachmentSelectionLimit,
  getInlineTextBlockById,
  getResizeDimensions,
  isAttachmentOptimized,
  isAttachmentSourceTooLarge,
  buildInlineNoteBlocks,
  groupInlineNoteBlocks,
  moveAttachment,
  moveInlineAttachment,
  normalizeAttachment,
  normalizeAttachmentDisplayWidthRatio,
  placeInlineAttachment,
  replaceInlineTextBlock,
} from '../src/utils/note-attachment.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('plain-note editing keeps a stable greedy line-break strategy', () => {
  const gallery = read('src/components/note-attachment-gallery.js');
  assert.equal(
    (gallery.match(/textBreakStrategy="simple"/g) || []).length,
    2,
    'editing and preview text must wrap with the same stable strategy'
  );
});

test('plain-note editing does not replay controlled text during IME composition', () => {
  const gallery = read('src/components/note-attachment-gallery.js');
  const editor = read('src/screens/NoteEditorScreen.js');

  assert.match(gallery, /const initialText = useRef\(block\.text\)\.current/);
  assert.match(gallery, /defaultValue=\{initialText\}/);
  assert.doesNotMatch(gallery, /value=\{block\.text\}/);
  assert.match(gallery, /key=\{`\$\{block\.id\}:\$\{textInputRevision\}`\}/);
  assert.match(editor, /textInputRevision=\{textInputRevision\}/);
  assert.equal(
    (editor.match(/setTextInputRevision\(\(current\) => current \+ 1\)/g) || []).length,
    2,
    'loaded and history-restored content must remount the uncontrolled input'
  );
});

test('rapid native events resolve the current text block before applying another edit', () => {
  let content = '第一行';
  const attachments = [];
  const blockId = getInlineTextBlockById(content, attachments, 'text:start:end').id;

  for (const nativeValue of ['第一行\n', '第一行\n', '第一行\n第']) {
    const currentBlock = getInlineTextBlockById(content, attachments, blockId);
    content = replaceInlineTextBlock(content, attachments, currentBlock, nativeValue).content;
  }

  assert.equal(content, '第一行\n第');
});

test('plain-note cursor placement uses the one-shot TextInput selection command', () => {
  const gallery = read('src/components/note-attachment-gallery.js');

  assert.match(gallery, /input\.setSelection\(cursorOffset, cursorOffset\)/);
  assert.doesNotMatch(gallery, /setNativeProps\?\.\(\{ selection:/);
});

test('limits plain notes to twenty attachments', () => {
  assert.equal(getAttachmentSelectionLimit(0), 20);
  assert.equal(getAttachmentSelectionLimit(18), 2);
  assert.equal(getAttachmentSelectionLimit(20), 0);
  assert.equal(getAttachmentSelectionLimit(99), 0);
});

test('normalizes image display width without changing its source dimensions', () => {
  assert.equal(normalizeAttachmentDisplayWidthRatio(undefined), 1);
  assert.equal(normalizeAttachmentDisplayWidthRatio(0.1), 0.35);
  assert.equal(normalizeAttachmentDisplayWidthRatio(4), 1);
  assert.deepEqual(
    { width: normalizeAttachment({ width: 1200, height: 800, display_width_ratio: 0.6 }).width,
      height: normalizeAttachment({ width: 1200, height: 800, display_width_ratio: 0.6 }).height,
      ratio: normalizeAttachment({ width: 1200, height: 800, display_width_ratio: 0.6 }).display_width_ratio },
    { width: 1200, height: 800, ratio: 0.6 }
  );
});

test('builds text and image blocks at saved cursor offsets', () => {
  const blocks = buildInlineNoteBlocks('I want to go Genting because it is cold.', [
    { id: 'photo', note_id: 'n', display_order: 0, anchor_offset: 20 },
  ]);
  assert.deepEqual(blocks.map((block) => block.type), ['text', 'image', 'text']);
  assert.equal(blocks[0].text, 'I want to go Genting');
  assert.equal(blocks[2].text, ' because it is cold.');
});

test('groups adjacent inline images into a wrapping row', () => {
  const grouped = groupInlineNoteBlocks(buildInlineNoteBlocks('BeforeAfter', [
    { id: 'one', display_order: 0, anchor_offset: 6 },
    { id: 'two', display_order: 1, anchor_offset: 6 },
  ]));
  assert.deepEqual(grouped.map((block) => block.type), ['text', 'image-row', 'text']);
  assert.deepEqual(grouped[1].blocks.map((block) => block.attachment.id), ['one', 'two']);
});

test('places a dragged image at a paragraph anchor', () => {
  const moved = placeInlineAttachment('First\nSecond\nThird', [
    { id: 'a', display_order: 0, anchor_offset: 0 },
    { id: 'b', display_order: 1, anchor_offset: 6 },
  ], 'a', { anchorOffset: 13 });
  assert.equal(moved.find((item) => item.id === 'a').anchor_offset, 13);
  assert.deepEqual(moved.map((item) => item.id), ['b', 'a']);
});

test('places a dragged image before another image at the same anchor', () => {
  const moved = placeInlineAttachment('Text', [
    { id: 'a', display_order: 0, anchor_offset: 0 },
    { id: 'b', display_order: 1, anchor_offset: 4 },
  ], 'b', { targetAttachmentId: 'a', placement: 'before' });
  assert.deepEqual(moved.map((item) => item.id), ['b', 'a']);
  assert.equal(moved[0].anchor_offset, 0);
});

test('moves following image anchors as text before them changes', () => {
  const attachment = { id: 'photo', note_id: 'n', display_order: 0, anchor_offset: 5 };
  const [beforeImage] = buildInlineNoteBlocks('Hello world', [attachment]);
  const result = replaceInlineTextBlock('Hello world', [attachment], beforeImage, 'Hello there');
  assert.equal(result.content, 'Hello there world');
  assert.equal(result.attachments[0].anchor_offset, 11);
});

test('moves an inline image between paragraph positions', () => {
  const attachment = { id: 'photo', note_id: 'n', display_order: 0, anchor_offset: 6 };
  const moved = moveInlineAttachment('First\nSecond', [attachment], 'photo', 'down');
  assert.equal(moved[0].anchor_offset, 12);
});

test('accepts sources up to 5 MB and requires optimized files below 1 MB', () => {
  assert.equal(isAttachmentSourceTooLarge(MAX_ATTACHMENT_SOURCE_BYTES), false);
  assert.equal(isAttachmentSourceTooLarge(MAX_ATTACHMENT_SOURCE_BYTES + 1), true);
  assert.equal(isAttachmentOptimized(MAX_ATTACHMENT_STORED_BYTES - 1), true);
  assert.equal(isAttachmentOptimized(MAX_ATTACHMENT_STORED_BYTES), false);
});

test('resizes using the longest edge without changing aspect ratio', () => {
  assert.deepEqual(getResizeDimensions(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(getResizeDimensions(800, 600, 2000), { width: 800, height: 600 });
});

test('moves attachment order one position at a time', () => {
  const items = [
    { id: 'a', note_id: 'n', display_order: 0 },
    { id: 'b', note_id: 'n', display_order: 1 },
    { id: 'c', note_id: 'n', display_order: 2 },
  ];
  assert.deepEqual(moveAttachment(items, 'b', 'right').map((item) => item.id), ['a', 'c', 'b']);
  assert.deepEqual(moveAttachment(items, 'a', 'left').map((item) => item.id), ['a', 'b', 'c']);
});
