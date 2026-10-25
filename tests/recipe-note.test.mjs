import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { createRecipeStep, parseRecipeNote, serializeRecipeNote, isRecipeContentEmpty, getRecipePreview, getRecipeExportText, RECIPE_CONTENT_MAX_CHARACTERS } from '../src/utils/recipe-note.mjs';
import { createBackupDocument, serializeBackupDocument, parseBackupText } from '../src/utils/backup-data.mjs';
import { noteRecordForCloud, cloudNoteForLocal } from '../src/utils/private-sync.mjs';
import { createNoteDeleteDetail } from '../src/utils/note-type-presentation.mjs';
import { buildNoteExportHtml, getExportFileName } from '../src/utils/note-export.mjs';
import { createEditorUndoHistory } from '../src/utils/editor-undo.mjs';
import { getEditorExitDisposition } from '../src/utils/editor-exit-disposition.mjs';
import { getAttachmentSelectionLimit, isAttachmentSourceTooLarge, MAX_ATTACHMENT_SOURCE_BYTES } from '../src/utils/note-attachment.mjs';
import { getNoteFeatureVisibility } from '../src/utils/premium-visibility.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const recipe = { ingredients: '2 eggs\n100 ml milk', steps: [{ id: 'mix', text: 'Mix gently.' }, { id: 'cook', text: 'Cook for 3 minutes.' }] };

test('recipe serialization preserves ingredients, multiline instructions and stable step IDs', () => {
  const value = { ...recipe, steps: [...recipe.steps, createRecipeStep('Serve\nwhile warm.')] };
  assert.deepEqual(parseRecipeNote(serializeRecipeNote(value)), { version: 1, ...value });
  assert.equal(getRecipePreview(serializeRecipeNote(value)), '2 ingredients · 3 steps');
  const normalized = parseRecipeNote(JSON.stringify({ ingredients: 'salt', steps: [{ id: 'same', text: 'One' }, { id: 'same', text: 'Two' }, null] }));
  assert.equal(new Set(normalized.steps.map((step) => step.id)).size, 2);
  assert.equal(parseRecipeNote('Legacy recipe').ingredients, 'Legacy recipe');
});

test('only genuinely empty recipes qualify for empty-draft cleanup', () => {
  for (const content of ['', serializeRecipeNote(), serializeRecipeNote({ ingredients: '  ', steps: [createRecipeStep(' ')] })]) {
    assert.equal(isRecipeContentEmpty(content), true);
  }
  assert.equal(isRecipeContentEmpty(serializeRecipeNote({ ingredients: 'salt' })), false);
  assert.equal(isRecipeContentEmpty(serializeRecipeNote({ steps: [createRecipeStep('Boil water')] })), false);
});

test('backup and private sync round trips retain recipe type and content', () => {
  const note = { id: 'recipe1', folder_id: null, title: 'Omelette', content: serializeRecipeNote(recipe), note_type: 'recipe',
    created_at: '2026-10-25T01:00:00.000Z', updated_at: '2026-10-25T02:00:00.000Z' };
  const document = createBackupDocument({ records: [], tombstones: [] }, { records: [note], tombstones: [] });
  const restored = parseBackupText(serializeBackupDocument(document)).backup.notes.records[0];
  const synced = cloudNoteForLocal(noteRecordForCloud(note));
  for (const copy of [restored, synced]) {
    assert.equal(copy.note_type, 'recipe');
    assert.equal(copy.content, note.content);
    assert.equal(copy.folder_id, null);
  }
});

test('recipe export contains readable numbered steps, escaped text and a photo', () => {
  const content = getRecipeExportText(serializeRecipeNote({ ...recipe, ingredients: '<salt> & pepper' }));
  const html = buildNoteExportHtml({ type: 'recipe', content, attachments: [{ id: 'photo', data_uri: 'data:image/jpeg;base64,AAA', anchor_offset: 0 }] });
  assert.match(html, /Untitled recipe/);
  assert.match(html, /&lt;salt&gt; &amp; pepper/);
  assert.match(html, /1\. Mix gently\./);
  assert.match(html, /2\. Cook for 3 minutes\./);
  assert.match(html, /data:image\/jpeg;base64,AAA/);
  assert.match(getExportFileName('', 'pdf', 'recipe'), /Recipe/i);
  assert.equal(createNoteDeleteDetail('recipe', 'Soup').iconName, 'restaurant-outline');
});

const createElement = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) });
const find = (node, type) => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of node.children || []) { const result = find(child, type); if (result) return result; }
  return null;
};

const editorHarness = async ({ content = '', isNewDraft = false, photo = null, plan = 'pro', pickImage = false, pickerFails = false } = {}) => {
  const note = { id: 'recipe1', title: '', content, note_type: 'recipe', folder_id: null };
  const hooks = [], effects = [], timers = new Map(), history = createEditorUndoHistory();
  let cursor = 0, firstRender = true, cleanup, timerId = 0, deleted = false, staged;
  const alerts = [];
  const photos = photo ? [photo] : [];
  const removedCloudPhotos = [];
  let premiumChecks = 0;
  const globals = {
    React: { createElement },
    useState: (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }]; },
    useRef: (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (fn) => { if (firstRender) effects.push(fn); },
    useTheme: () => ({}), useSafeAreaInsets: () => ({ top: 24, bottom: 16 }),
    useNoteFeatureVisibility: (_, options) => ({ ...getNoteFeatureVisibility({ plan, note, attachmentCount: photos.length, readOnly: options.readOnly }), setOwnerPlan: () => {} }),
    useEditorUndo: () => ({ canUndo: history.canUndo(), canRedo: history.canRedo(), remember: (value, groupKey) => history.record(value, { groupKey }), takeUndo: (value) => history.undo(value), takeRedo: (value) => history.redo(value), clearUndo: () => history.clear() }),
    useAwaitedEditorExit: (value) => { cleanup = value; },
    noteRepo: { getById: async () => note, update: async (_, values) => Object.assign(note, values), hardDelete: async () => { deleted = true; } },
    noteColorPreference: { load: async () => 'default', remove: async () => {} },
    noteBackgroundPreference: { load: async () => null, removeQuietly: async () => {} },
    noteEditingAccessService: { isReadOnly: async () => false },
    attachmentRepo: { listByNoteId: async () => [...photos], removeAll: async () => {}, update: async () => {} },
    attachmentCloudService: { syncNote: async () => [...photos], reorder: async () => {}, remove: async (_, item) => removedCloudPhotos.push(item.id) },
    premiumAccessService: { require: async () => { premiumChecks++; if (plan !== 'pro') throw new Error('Pro required'); } },
    pickNoteAttachments: async (_, __, ___, options) => {
      if (!pickImage) return { canceled: true };
      if (pickerFails) throw new Error('Image storage failed');
      if (options?.replaceAttachmentId) photos.splice(photos.findIndex((item) => item.id === options.replaceAttachmentId), 1);
      photos.push({ id: 'recipe-photo', local_uri: 'file:///recipe.jpg', width: 800, height: 600, anchor_offset: 0 });
      return { canceled: false, attachments: [...photos] };
    },
    collaborationService: { stageDraft: (_, value) => { staged = value; }, save: async (_, value) => Object.assign(note, value), flushStagedDraft: async () => false },
    isReadOnlyCollaborativeNote: () => false,
    getNoteColorTheme: () => ({ surface: '#fff' }), DEFAULT_NOTE_COLOR: 'default',
    constrainNormalNoteContent: (text) => ({ value: text.slice(0, 50000), limitReached: text.length > 50000 }),
    NORMAL_NOTE_CONTENT_MAX_CHARACTERS: 50000, MAX_NOTE_ATTACHMENTS: 20,
    RECIPE_CONTENT_MAX_CHARACTERS, serializeRecipeNote, isRecipeContentEmpty, getRecipeExportText, getEditorExitDisposition, createNoteDeleteDetail,
    Alert: { alert: (...args) => alerts.push(args) }, Keyboard: { dismiss: () => {} },
    Platform: { OS: 'android' }, StyleSheet: { create: (value) => value, absoluteFill: {} }, radius: {}, shadow: { card: {} },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id),
  };
  for (const type of ['View', 'Text', 'TextInput', 'TouchableOpacity', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'Ionicons', 'RecipeNoteContent', 'NoteAttachmentGallery', 'NoteBackgroundLayer', 'EditorHistoryButtons', 'CollaborationFooter', 'SharedNoteViewGate', 'NoteExportModal', 'NoteColorModal', 'NoteBackgroundModal', 'NoteShareModal', 'PasswordModal', 'ManageNoteLockModal']) globals[type] = type;
  const source = read('src/screens/NoteEditorScreen.js').replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default NoteEditorScreen;', '');
  const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  const Component = vm.runInNewContext(`${code}\nNoteEditorScreen;`, globals);
  const render = () => { cursor = 0; const tree = Component({ route: { name: 'RecipeEditor', params: { noteId: note.id, isNewDraft } }, navigation: { goBack: () => {} } }); firstRender = false; return tree; };
  render(); effects.forEach((fn) => fn());
  await new Promise((resolve) => setImmediate(resolve));
  return { render, note, alerts, photos, removedCloudPhotos, get premiumChecks() { return premiumChecks; }, get staged() { return staged; }, get deleted() { return deleted; }, exit: async () => cleanup.cleanup() };
};

test('local recipe photo is available on every plan without granting free paid exports or plain-note images', () => {
  for (const plan of ['free', 'plus', 'pro']) {
    const visibility = getNoteFeatureVisibility({ plan, note: { note_type: 'recipe' }, attachmentCount: 1 });
    assert.equal(visibility.canInsertImages, true);
    assert.equal(visibility.canExport, plan !== 'free');
    assert.equal(getNoteFeatureVisibility({ plan, note: { note_type: 'recipe' }, readOnly: true }).canInsertImages, false);
    assert.equal(getNoteFeatureVisibility({ plan, note: { note_type: 'note' } }).canInsertImages, plan === 'pro');
  }
  for (const ownerPlan of ['free', 'plus', 'pro']) {
    for (const share_role of ['viewer', 'editor']) {
      const visibility = getNoteFeatureVisibility({ plan: 'free', ownerPlan, note: { note_type: 'recipe', share_origin: 'incoming', share_role } });
      assert.equal(visibility.canInsertImages, ownerPlan === 'pro' && share_role === 'editor');
    }
  }
});

test('actual Free recipe editor inserts and retains a photo without a premium check', async () => {
  const app = await editorHarness({ isNewDraft: true, plan: 'free', pickImage: true });
  const form = find(app.render(), 'RecipeNoteContent');
  assert.equal(form.props.canAddPhoto, true);
  await form.props.onAddPhoto();
  assert.equal(app.photos.length, 1);
  assert.equal(app.premiumChecks, 0);
  assert.equal(app.alerts.length, 0);
  assert.equal(find(app.render(), 'RecipeNoteContent').props.attachments[0].id, 'recipe-photo');
  assert.equal(find(app.render(), 'NoteExportModal').props.visible, false);
  await app.exit();
  assert.equal(app.deleted, false);
});

test('recipe Change photo replaces a full slot and cleans the previous cloud photo only on success', async () => {
  const original = { id: 'old', local_uri: 'file:///old.jpg', cloud_path: 'owner/old.jpg', width: 600, height: 400, anchor_offset: 0 };
  for (const [pickImage, pickerFails] of [[false, false], [true, true], [true, false]]) {
    const app = await editorHarness({ photo: original, plan: 'free', pickImage, pickerFails });
    await find(app.render(), 'RecipeNoteContent').props.onChangePhoto();
    const success = pickImage && !pickerFails;
    assert.equal(app.photos.length, 1);
    assert.equal(app.photos[0].id, success ? 'recipe-photo' : 'old');
    assert.deepEqual(app.removedCloudPhotos, success ? ['old'] : []);
    assert.equal(app.premiumChecks, 0);
    if (pickerFails) assert.equal(app.alerts[0][0], 'Photo not changed');
  }
});

test('actual recipe editor saves on exit, reopens and supports undo/redo without storing display text', async () => {
  const app = await editorHarness({ isNewDraft: true });
  find(app.render(), 'RecipeNoteContent').props.onChange(recipe, 'ingredients');
  assert.equal(app.staged.content, serializeRecipeNote(recipe));
  find(app.render(), 'EditorHistoryButtons').props.onUndo();
  assert.equal(find(app.render(), 'RecipeNoteContent').props.content, '');
  find(app.render(), 'EditorHistoryButtons').props.onRedo();
  await app.exit();
  assert.equal(app.note.content, serializeRecipeNote(recipe));
  assert.equal(app.deleted, false);
  const reopened = await editorHarness({ content: app.note.content });
  const view = find(reopened.render(), 'RecipeNoteContent');
  assert.equal(view.props.editing, false);
  assert.equal(view.props.content, app.note.content);
  assert.match(find(reopened.render(), 'NoteExportModal').props.content, /Ingredients\n2 eggs/);
});

test('actual recipe editor preserves photo-only/existing notes and removes only empty new drafts', async () => {
  for (const [options, expected] of [
    [{ isNewDraft: true, content: serializeRecipeNote({ steps: [createRecipeStep()] }) }, true],
    [{ isNewDraft: false }, false],
    [{ isNewDraft: true, photo: { id: 'photo', anchor_offset: 0 } }, false],
  ]) {
    const app = await editorHarness(options);
    await app.exit();
    assert.equal(app.deleted, expected);
  }
});

test('oversized recipe edits are rejected without truncating valid JSON or replacing the saved draft', async () => {
  const app = await editorHarness({ content: serializeRecipeNote(recipe) });
  find(app.render(), 'RecipeNoteContent').props.onChange({ ingredients: 'x'.repeat(50001), steps: [] });
  assert.equal(app.note.content, serializeRecipeNote(recipe));
  assert.equal(find(app.render(), 'RecipeNoteContent').props.content, app.note.content);
  assert.equal(app.alerts[0][0], 'Recipe limit reached');
});

test('recipe photo picker enforces one image, validates before saving and handles cancellation', async () => {
  const source = read('src/utils/note-attachment-picker.js').split('export const pickNoteAttachments = ')[1];
  const saved = [], selections = [];
  let response;
  const pick = vm.runInNewContext(`(${source.replace(/;\s*$/, '')})`, {
    ImagePicker: { launchImageLibraryAsync: async (options) => { selections.push(options); return response; } },
    Platform: { OS: 'android' }, getAttachmentSelectionLimit, isAttachmentSourceTooLarge, MAX_ATTACHMENT_SOURCE_BYTES,
    getSourceSize: async (asset) => asset.fileSize,
    optimizeNoteAttachment: async (asset) => ({ ...asset, byte_size: 500000, width: 800, height: 600 }),
    attachmentRepo: { add: async (_, asset) => { saved.push(asset); return asset; } },
  });
  response = { canceled: true };
  assert.equal((await pick('recipe1', 0, 0, { maxAttachments: 1 })).canceled, true);
  assert.equal(saved.length, 0);
  assert.equal(selections[0].allowsMultipleSelection, false);
  assert.equal(selections[0].selectionLimit, 1);
  response = { assets: [{ uri: 'photo', fileSize: 500 }, { uri: 'photo2', fileSize: 500 }] };
  await assert.rejects(pick('recipe1', 0, 0, { maxAttachments: 1 }), { code: 'ATTACHMENT_LIMIT_REACHED' });
  response = { assets: [{ uri: 'photo', fileSize: MAX_ATTACHMENT_SOURCE_BYTES + 1 }] };
  await assert.rejects(pick('recipe1', 0, 0, { maxAttachments: 1 }), { code: 'ATTACHMENT_SOURCE_TOO_LARGE' });
  assert.equal(saved.length, 0);
  response = { assets: [{ uri: 'photo', fileSize: MAX_ATTACHMENT_SOURCE_BYTES }] };
  await pick('recipe1', 0, 0, { maxAttachments: 1 });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].anchor_offset, 0);
  assert.equal(saved[0].display_width_ratio, 1);
  await assert.rejects(pick('recipe1', 1, 0, { maxAttachments: 1 }), { code: 'ATTACHMENT_LIMIT_REACHED' });
});

test('replacement picker keeps the current photo on cancel, validation or optimization failure', async () => {
  const source = read('src/utils/note-attachment-picker.js').split('export const pickNoteAttachments = ')[1];
  let response, optimizationFails = false, swaps = 0;
  const original = { id: 'old' };
  let current = original;
  const pick = vm.runInNewContext(`(${source.replace(/;\s*$/, '')})`, {
    ImagePicker: { launchImageLibraryAsync: async () => response }, Platform: { OS: 'android' },
    getAttachmentSelectionLimit, isAttachmentSourceTooLarge, MAX_ATTACHMENT_SOURCE_BYTES,
    getSourceSize: async (asset) => asset.fileSize,
    optimizeNoteAttachment: async (asset) => { if (optimizationFails) throw new Error('Optimization failed'); return asset; },
    attachmentRepo: { replace: async (noteId, id, asset) => { assert.equal(noteId, 'recipe1'); assert.equal(id, 'old'); swaps++; current = { id: 'new', ...asset }; return current; } },
  });
  const options = { maxAttachments: 1, replaceAttachmentId: 'old' };
  response = { canceled: true };
  await pick('recipe1', 1, 0, options);
  assert.equal(current, original);
  response = { assets: [{ uri: 'new', fileSize: MAX_ATTACHMENT_SOURCE_BYTES + 1 }] };
  await assert.rejects(pick('recipe1', 1, 0, options), { code: 'ATTACHMENT_SOURCE_TOO_LARGE' });
  assert.equal(current, original);
  response = { assets: [{ uri: 'new', fileSize: 500 }] };
  optimizationFails = true;
  await assert.rejects(pick('recipe1', 1, 0, options), /Optimization failed/);
  assert.equal(current, original);
  assert.equal(swaps, 0);
  optimizationFails = false;
  await pick('recipe1', 1, 0, options);
  assert.equal(current.id, 'new');
  assert.equal(swaps, 1);
});

test('recipe form changes ingredients, adds/reorders/removes steps, and omits edit controls for viewers', () => {
  const source = read('src/components/recipe-note-content.js').replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default RecipeNoteContent;', '');
  const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  let viewedPhotoId = null;
  const globals = {
    useState: () => [viewedPhotoId, (value) => { viewedPhotoId = value; }],
    React: { createElement }, useMemo: (fn) => fn(), useTheme: () => ({}), useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
    parseRecipeNote, createRecipeStep, RECIPE_MAX_STEPS: 50, RECIPE_INGREDIENTS_MAX_CHARACTERS: 10000, RECIPE_STEP_MAX_CHARACTERS: 2000,
    StyleSheet: { create: (value) => value }, radius: {}, Keyboard: { dismiss: () => {} },
  };
  for (const type of ['ActivityIndicator', 'Image', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'Ionicons']) globals[type] = type;
  const Component = vm.runInNewContext(`${code}\nRecipeNoteContent;`, globals);
  let value = recipe;
  const props = { attachments: [], readOnly: false, editing: true, busy: false, canAddPhoto: true, onChange: (next) => { value = next; } };
  const render = () => Component({ ...props, content: serializeRecipeNote(value) });
  const findLabel = (node, label) => {
    if (node?.props?.accessibilityLabel === label) return node;
    for (const child of node?.children || []) { const found = findLabel(child, label); if (found) return found; }
    return null;
  };
  findLabel(render(), 'Ingredients').props.onChangeText('500 g chicken');
  assert.equal(value.ingredients, '500 g chicken');
  findLabel(render(), 'Move step 2 up').props.onPress();
  assert.equal(value.steps[0].id, 'cook');
  findLabel(render(), 'Remove step 1').props.onPress();
  assert.equal(value.steps.length, 1);
  findLabel(render(), 'Add preparation step').props.onPress();
  assert.equal(value.steps.length, 2);
  findLabel(render(), 'Step 2').props.onChangeText('Serve warm');
  assert.equal(value.steps[1].text, 'Serve warm');
  props.attachments = [{ id: 'photo', local_uri: 'file:///old.jpg', width: 600, height: 400 }];
  props.editing = false;
  let changeCalled = false;
  props.onChangePhoto = () => { changeCalled = true; };
  findLabel(render(), 'Change recipe photo').props.onPress();
  assert.equal(changeCalled, true, 'replacement is discoverable even in preview mode');
  props.readOnly = true;
  const viewer = render();
  assert.equal(find(viewer, 'TextInput'), null);
  assert.equal(findLabel(viewer, 'Add recipe photo'), null);
  assert.equal(findLabel(viewer, 'Add preparation step'), null);
  assert.equal(findLabel(viewer, 'Change recipe photo'), null);
  const image = findLabel(viewer, 'Recipe photo');
  assert.equal(image.props.resizeMode, 'contain');
  assert.equal(findLabel(viewer, 'View recipe photo').props.style({ pressed: false })[0].height, 220);
  findLabel(viewer, 'View recipe photo').props.onPress();
  assert.equal(find(render(), 'Modal').props.visible, true, 'viewers can open the full image');
  assert.equal(findLabel(render(), 'Full recipe photo').props.resizeMode, 'contain');
  findLabel(render(), 'Close recipe photo').props.onPress();
  assert.equal(find(render(), 'Modal').props.visible, false);
  findLabel(render(), 'View recipe photo').props.onPress();
  find(render(), 'Modal').props.onRequestClose();
  assert.equal(find(render(), 'Modal').props.visible, false, 'system Back closes the image');
  findLabel(render(), 'View recipe photo').props.onPress();
  props.attachments = [{ ...props.attachments[0], id: 'replacement' }];
  assert.equal(find(render(), 'Modal').props.visible, false, 'replacement never shows a stale viewer');
});
