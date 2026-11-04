import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import * as expense from '../src/utils/expense-record.mjs';
import * as limits from '../src/utils/note-limits.mjs';
import { createEditorUndoHistory } from '../src/utils/editor-undo.mjs';
import { getEditorExitDisposition } from '../src/utils/editor-exit-disposition.mjs';

const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [...(node.children || []), node.props?.ListHeaderComponent]) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
};
const label = (tree, text) => find(tree, (node) => node.props?.accessibilityLabel === text);
const type = (tree, name) => find(tree, (node) => node.type === name);
const bill = (id, isPaid = false) => expense.createMonthlyCommitment({ id, remark: id, day: '2', amount: '25.00', isPaid });

// Render the actual editor and drive its controls, using local storage/timer doubles.
const harness = async (commitments, savedBills = [bill('correct')], readOnly = false) => {
  const hooks = [], effects = [], staged = [], confirmations = [], timers = new Map();
  const history = createEditorUndoHistory();
  let cursor = 0, initial = true, exit, timerId = 0;
  let template = expense.createMonthlyCommitmentTemplate(savedBills).commitments;
  const daily = [expense.createExpenseRow({ id: 'daily', date: '3', remark: 'Lunch', amount: '5.00' })];
  const categories = [{ id: 'food', name: 'Food', keywords: ['Lunch'] }];
  const note = { id: 'expense', title: 'November', content: expense.serializeExpenseNote(daily, categories, 'Keep summary', commitments, 'MYR') };
  const useRef = (value) => { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: value }; return hooks[index]; };
  const globals = {
    ...expense, ...limits, getEditorExitDisposition,
    React: { memo: (value) => value, Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    useState: (value) => { const index = cursor++; if (!(index in hooks)) hooks[index] = value; return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
    useRef, useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (fn) => { if (initial) effects.push(fn); },
    useTheme: () => ({}), useSafeAreaInsets: () => ({ top: 24, bottom: 24 }), useWindowDimensions: () => ({ width: 375 }),
    useSharedValue: (value) => { const ref = useRef(null); if (!ref.current) ref.current = { value }; return ref.current; },
    useAnimatedStyle: (fn) => fn(), useDragAutoScroll: () => ({}), useNoteFeatureVisibility: () => ({}),
    useAwaitedEditorExit: (options) => { exit = options.cleanup; },
    useEditorUndo: () => ({ canUndo: history.canUndo(), canRedo: history.canRedo(), remember: (value) => history.record(value), takeUndo: (value) => history.undo(value), takeRedo: (value) => history.redo(value), clearUndo: () => history.clear() }),
    noteRepo: { getById: async () => note }, noteColorPreference: { load: async () => 'default' }, noteBackgroundPreference: { load: async () => null },
    noteEditingAccessService: { isReadOnly: async () => readOnly }, isReadOnlyCollaborativeNote: () => false,
    collaborationService: { stageDraft: (_, draft) => staged.push(draft), save: async (_, draft) => Object.assign(note, draft), discardStagedDraft() {} },
    monthlyCommitmentTemplate: { load: async () => template, save: async (bills) => { template = expense.createMonthlyCommitmentTemplate(bills).commitments; return template; } },
    getNoteColorTheme: () => ({ surface: '#fff' }), DEFAULT_NOTE_COLOR: 'default', createNoteDeleteDetail: () => ({}),
    Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, StyleSheet: { create: (value) => value }, radius: {}, shadow: {},
    Animated: { View: 'AnimatedView' }, requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id),
    confirmDestructiveAction: (options) => confirmations.push(options),
    Alert: { alert: (title) => { throw new Error(`Unexpected alert: ${title}`); } },
  };
  for (const name of ['View', 'Text', 'TextInput', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'TouchableOpacity', 'Ionicons', 'MaterialIcons', 'FlatList', 'GestureDetector', 'EditorHistoryButtons', 'NoteExportModal', 'NoteShareModal', 'CollaborationFooter', 'SharedNoteViewGate', 'NoteColorModal', 'NoteBackgroundModal', 'NoteBackgroundLayer', 'ManageNoteLockModal', 'PasswordModal', 'ExpenseSummaryModal', 'ExpenseCurrencyModal', 'DestructiveConfirmationModal', 'KeyboardAwareModalContent']) globals[name] = name;
  const source = readFileSync(new URL('../src/screens/ExpenseRecordEditorScreen.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default ExpenseRecordEditorScreen;', '');
  const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  const Screen = vm.runInNewContext(`${code}\nExpenseRecordEditorScreen;`, globals);
  const render = () => { cursor = 0; const tree = Screen({ route: { params: { noteId: note.id } }, navigation: { addListener: () => () => {} } }); initial = false; return tree; };
  render(); effects.forEach((fn) => fn());
  await new Promise((resolve) => setImmediate(resolve));
  return {
    render, note, staged, confirmations,
    template: () => template,
    draft: () => expense.parseExpenseNote(staged.at(-1)?.content ?? note.content),
    flush: async () => { for (const [id, fn] of timers) { timers.delete(id); await fn(); } },
    exit: () => exit(),
  };
};

test('wrong pasted bills can be replaced after confirmation, with unpaid fresh copies and preserved daily data', async () => {
  const app = await harness([bill('wrong', true)]);
  const before = app.draft();
  const replace = () => label(app.render(), 'Replace monthly bills with 1 saved monthly bills, all unpaid').props.onPress();
  replace();
  assert.equal(app.staged.length, 0, 'opening or cancelling confirmation must not save');
  assert.equal(app.confirmations.pop().confirmLabel, 'Replace');
  replace();
  app.confirmations.pop().onConfirm();
  const after = app.draft();
  assert.equal(after.monthlyCommitments.length, 1);
  assert.equal(after.monthlyCommitments[0].remark, 'correct');
  assert.equal(after.monthlyCommitments[0].isPaid, false);
  assert.notEqual(after.monthlyCommitments[0].id, 'correct');
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.categories, before.categories);
  assert.equal(after.summaryNote, before.summaryNote);
  assert.equal(after.currency, 'MYR');
  assert.equal(expense.calculateExpenseGrandTotal(after.rows, after.monthlyCommitments), 5);
  assert.equal(app.template()[0].remark, 'correct');
  type(app.render(), 'EditorHistoryButtons').props.onUndo();
  assert.deepEqual(app.draft().monthlyCommitments, before.monthlyCommitments);
  type(app.render(), 'EditorHistoryButtons').props.onRedo();
  assert.deepEqual(app.draft().monthlyCommitments, after.monthlyCommitments);
  await app.flush();
  assert.deepEqual(expense.parseExpenseNote(app.note.content), after);
});

test('clear all can be cancelled, undone and followed by applying a newly copied list, including on exit before debounce', async () => {
  const source = await harness([bill('new-source', true)], []);
  label(source.render(), 'Save monthly bills for the next expense record').props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  const app = await harness([bill('wrong', true), bill('wrong2')], source.template());
  const original = app.draft();
  label(app.render(), 'Clear all monthly bills').props.onPress();
  assert.equal(app.staged.length, 0);
  assert.equal(app.confirmations.pop().confirmLabel, 'Clear all');
  label(app.render(), 'Clear all monthly bills').props.onPress();
  app.confirmations.pop().onConfirm();
  assert.equal(app.draft().monthlyCommitments.length, 0);
  assert.equal(label(app.render(), 'Clear all monthly bills'), null);
  type(app.render(), 'EditorHistoryButtons').props.onUndo();
  assert.deepEqual(app.draft().monthlyCommitments, original.monthlyCommitments);
  type(app.render(), 'EditorHistoryButtons').props.onRedo();
  label(app.render(), 'Apply 1 saved monthly bills, all unpaid').props.onPress();
  assert.equal(app.confirmations.length, 0, 'empty notes apply immediately');
  assert.equal(app.draft().monthlyCommitments[0].remark, 'new-source');
  assert.equal(app.draft().monthlyCommitments[0].isPaid, false);
  await app.exit();
  assert.equal(expense.parseExpenseNote(app.note.content).monthlyCommitments[0].remark, 'new-source');
  assert.equal(source.draft().monthlyCommitments[0].isPaid, true, 'copying leaves source paid state intact');
});

test('clear without any saved list persists an empty set and preserves other sections', async () => {
  const app = await harness([bill('old')], []);
  const before = app.draft();
  label(app.render(), 'Clear all monthly bills').props.onPress();
  app.confirmations.pop().onConfirm();
  await app.flush();
  const saved = expense.parseExpenseNote(app.note.content);
  assert.equal(saved.monthlyCommitments.length, 0);
  assert.deepEqual(saved.rows, before.rows);
  assert.deepEqual(saved.categories, before.categories);
  assert.equal(saved.summaryNote, before.summaryNote);
});

test('read-only notes hide bulk actions and pending confirmations respect a subsequent access loss', async () => {
  const viewer = await harness([bill('old')], [bill('new')], true);
  assert.equal(label(viewer.render(), 'Clear all monthly bills'), null);
  assert.equal(label(viewer.render(), 'Replace monthly bills with 1 saved monthly bills, all unpaid'), null);
  for (const action of ['Clear all monthly bills', 'Replace monthly bills with 1 saved monthly bills, all unpaid']) {
    const app = await harness([bill('old')]);
    label(app.render(), action).props.onPress();
    type(app.render(), 'SharedNoteViewGate').props.onUnavailable({ editAccess: true, canView: false, canEdit: false });
    app.confirmations.pop().onConfirm();
    assert.equal(app.staged.length, 0);
    assert.equal(app.draft().monthlyCommitments[0].remark, 'old');
  }
});
