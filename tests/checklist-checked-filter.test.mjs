import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import * as checklist from '../src/utils/checklist-note.mjs';
import { createEditorUndoHistory } from '../src/utils/editor-undo.mjs';
import { getEditorExitDisposition } from '../src/utils/editor-exit-disposition.mjs';

const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = [...(node.children || []), ...['ListHeaderComponent', 'ListFooterComponent', 'ListEmptyComponent'].map((key) => node.props?.[key])];
  for (const child of children) { const result = find(child, predicate); if (result) return result; }
  return null;
};
const type = (tree, name) => find(tree, (node) => node.type === name);
const label = (tree, name) => find(tree, (node) => node.props?.accessibilityLabel === name);

const harness = async (items, readOnly = false) => {
  const hooks = [], effects = [], staged = [], history = createEditorUndoHistory();
  let cursor = 0, initial = true, exit;
  const note = { id: 'checklist', title: 'Shopping', content: checklist.serializeChecklistNote(items) };
  const useRef = (value) => { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: value }; return hooks[index]; };
  const globals = {
    ...checklist, getEditorExitDisposition,
    React: { memo: (value) => value, createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    useState: (value) => { const index = cursor++; if (!(index in hooks)) hooks[index] = value; return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
    useRef, useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (fn) => { if (initial) effects.push(fn); },
    useTheme: () => ({}), useSafeAreaInsets: () => ({ top: 24, bottom: 24 }), useWindowDimensions: () => ({ width: 375 }),
    useSharedValue: (value) => { const ref = useRef(null); if (!ref.current) ref.current = { value }; return ref.current; },
    useAnimatedStyle: (fn) => fn(),
    useDragAutoScroll: () => ({ getEffectiveTranslation: (value) => value, startAutoScroll() {}, stopAutoScroll() {} }),
    useNoteFeatureVisibility: () => ({ canExport: true }),
    useAwaitedEditorExit: (options) => { exit = options.cleanup; },
    useEditorUndo: () => ({ canUndo: history.canUndo(), canRedo: history.canRedo(), remember: (value, groupKey) => history.record(value, { groupKey }), takeUndo: (value) => history.undo(value), takeRedo: (value) => history.redo(value), clearUndo: () => history.clear() }),
    noteRepo: { getById: async () => note }, noteColorPreference: { load: async () => 'default' }, noteBackgroundPreference: { load: async () => null },
    noteEditingAccessService: { isReadOnly: async () => readOnly }, isReadOnlyCollaborativeNote: () => false,
    collaborationService: { stageDraft: (_, draft) => staged.push(draft), save: async (_, draft) => Object.assign(note, draft) },
    getNoteColorTheme: () => ({ surface: '#fff' }), DEFAULT_NOTE_COLOR: 'default', createNoteDeleteDetail: () => ({}),
    Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, StyleSheet: { create: (value) => value }, radius: {}, shadow: {},
    Animated: { View: 'AnimatedView' }, requestAnimationFrame: (fn) => fn(), setTimeout: () => 1, clearTimeout() {},
    Alert: { alert: (...args) => { throw new Error(`Unexpected alert: ${args[0]}`); } },
  };
  for (const name of ['View', 'Text', 'TextInput', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'TouchableOpacity', 'Ionicons', 'MaterialIcons', 'FlatList', 'GestureDetector', 'EditorHistoryButtons', 'NoteExportModal', 'NoteShareModal', 'CollaborationFooter', 'SharedNoteViewGate', 'NoteColorModal', 'NoteBackgroundModal', 'NoteBackgroundLayer', 'ManageNoteLockModal', 'PasswordModal']) globals[name] = name;
  const source = readFileSync(new URL('../src/screens/ChecklistEditorScreen.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default ChecklistEditorScreen;', '');
  const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  const Screen = vm.runInNewContext(`${code}\nChecklistEditorScreen;`, globals);
  const render = () => { cursor = 0; const tree = Screen({ route: { params: { noteId: note.id } }, navigation: {} }); initial = false; return tree; };
  render(); effects.forEach((fn) => fn());
  await new Promise((resolve) => setImmediate(resolve));
  return { render, staged, note, exit: () => exit() };
};

test('actual checklist toggles visibility without saving; completion, undo, export and final save keep all items', async () => {
  const items = ['a', 'done', 'b'].map((id) => checklist.createChecklistItem({ id, text: id, completed: id === 'done' }));
  const app = await harness(items);
  label(app.render(), 'Hide checked items').props.onPress();
  assert.deepEqual(Array.from(type(app.render(), 'FlatList').props.data, (item) => item.id), ['a', 'b']);
  assert.equal(app.staged.length, 0, 'a display preference must not write note content');
  const list = type(app.render(), 'FlatList');
  list.props.renderItem({ item: list.props.data[0], index: 0 }).props.onToggle('a');
  assert.deepEqual(Array.from(type(app.render(), 'FlatList').props.data, (item) => item.id), ['b']);
  assert.equal(type(app.render(), 'NoteExportModal').props.checklistItems.length, 3);
  type(app.render(), 'EditorHistoryButtons').props.onUndo();
  assert.deepEqual(Array.from(type(app.render(), 'FlatList').props.data, (item) => item.id), ['a', 'b']);
  label(app.render(), 'Show checked items').props.onPress();
  assert.equal(type(app.render(), 'FlatList').props.data.length, 3);
  await app.exit();
  assert.equal(checklist.parseChecklistNote(app.note.content).items.length, 3);
});

test('filtered drag uses visible row positions while preserving hidden rows and accessibility moves', async () => {
  const items = ['a', 'done1', 'b', 'done2', 'c'].map((id) => checklist.createChecklistItem({ id, text: id, completed: id.startsWith('done') }));
  const app = await harness(items);
  label(app.render(), 'Hide checked items').props.onPress();
  let list = type(app.render(), 'FlatList');
  list.props.renderItem({ item: list.props.data[1], index: 1 }).props.onMove('b', 'up');
  list = type(app.render(), 'FlatList');
  assert.deepEqual(Array.from(list.props.data, (item) => item.id), ['b', 'a', 'c']);
  const row = list.props.renderItem({ item: list.props.data[2], index: 2 });
  assert.equal(row.props.itemCount, 3);
  row.props.onDragStart('c');
  row.props.onDragEnd('c', -200, 0, 0);
  assert.deepEqual(Array.from(type(app.render(), 'FlatList').props.data, (item) => item.id), ['c', 'b', 'a']);
  await app.exit();
  assert.deepEqual(checklist.parseChecklistNote(app.note.content).items.map((item) => item.id), ['c', 'done1', 'b', 'done2', 'a']);
});

test('read-only users can hide/show checked rows and see an all-checked empty state without edits', async () => {
  const items = [checklist.createChecklistItem({ id: 'done', text: 'Done', completed: true })];
  const app = await harness(items, true);
  label(app.render(), 'Hide checked items').props.onPress();
  const list = type(app.render(), 'FlatList');
  assert.equal(list.props.data.length, 0);
  assert.ok(find(list.props.ListEmptyComponent, (node) => node.children?.includes('All items checked')));
  label(app.render(), 'Show checked items').props.onPress();
  assert.equal(type(app.render(), 'FlatList').props.data.length, 1);
  assert.equal(app.staged.length, 0);
});
