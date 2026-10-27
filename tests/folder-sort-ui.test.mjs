import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import * as sorting from '../src/utils/folder-sort.mjs';

const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) { const result = find(child, predicate); if (result) return result; }
  return null;
};
const withText = (node, value) => !!find(node, (item) => item.type === 'Text' && item.children.includes(value));
const press = (tree, text) => find(tree, (node) => node.type === 'Pressable' && withText(node, text));
const labelled = (tree, text) => find(tree, (node) => node.props?.accessibilityLabel === text);
const source = readFileSync(new URL('../src/components/folder-sort-modal.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export const /g, 'const ').replace('export default FolderSortModal;', '');
const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;

const harness = () => {
  let cursor = 0, closeCount = 0, writeCount = 0, fail = false;
  const hooks = [], values = new Map();
  const useState = (initial) => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], (next) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; };
  const useRef = (initial) => { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; };
  const service = sorting.createFolderSortPreferenceService({ getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { writeCount += 1; if (fail) throw new Error('Storage full'); values.set(key, value); } });
  const globals = {
    ...sorting, useState, useRef, useMemo: (fn) => fn(), useCallback: (fn) => fn,
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    StyleSheet: { create: (value) => value, absoluteFill: {} }, Platform: { OS: 'android' },
    useTheme: () => ({}), useThemeMode: () => ({ scheme: 'light' }), radius: {}, useSafeAreaInsets: () => ({ top: 24, bottom: 24 }),
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: 1 }), useReducedMotion: () => true, ReduceMotion: { System: 'system' },
    folderSortPreference: service,
  };
  for (const name of ['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'Switch', 'Text', 'View', 'GestureHandlerRootView', 'Ionicons', 'MaterialIcons']) globals[name] = name;
  const components = vm.runInNewContext(`${code}\n({ FolderSortModal, FolderReorderList });`, globals);
  const folders = ['a', 'b', 'c'].map((id) => ({ id, name: id, parent_id: null, created_at: '2026-10-27T00:00:00Z' }));
  return {
    service, folders, values, components, get writes() { return writeCount; }, get closes() { return closeCount; }, set fail(value) { fail = value; },
    render: () => { cursor = 0; return components.FolderSortModal({ folders, counts: {}, preferences: sorting.normalizeFolderSortPreferences(), onClose: () => { closeCount += 1; } }); },
  };
};

test('real sort sheet defers writes until Apply and preserves its draft on save failure', async () => {
  const app = harness();
  press(app.render(), 'Name').props.onPress();
  press(app.render(), 'Ascending').props.onPress();
  assert.equal(app.writes, 0);
  app.fail = true;
  await press(app.render(), 'Apply').props.onPress();
  assert.equal(app.closes, 0);
  assert.ok(withText(app.render(), 'Could not save the folder order. Please try again.'));
  app.fail = false;
  await press(app.render(), 'Apply').props.onPress();
  assert.equal(app.closes, 1);
  assert.equal((await app.service.read()).sortBy, 'name');
  assert.equal((await app.service.read()).direction, 'asc');
});

test('Custom order opens the real reorder screen, Done saves the order, and repeated Done writes only once', async () => {
  const app = harness();
  press(app.render(), 'Custom order').props.onPress();
  let tree = app.render();
  assert.ok(withText(tree, 'Reorder folders'));
  const list = find(tree, (node) => node.type === app.components.FolderReorderList);
  list.props.onChange((current) => sorting.moveFolderInOrder(current, 'c', 0, false));
  assert.equal(app.writes, 0);
  const done = labelled(app.render(), 'Save custom folder order');
  await Promise.all([done.props.onPress(), done.props.onPress()]);
  assert.equal(app.writes, 1);
  assert.equal(app.closes, 1);
  const saved = await app.service.read();
  assert.equal(saved.sortBy, 'custom');
  assert.deepEqual(saved.orders.home, ['c', 'a', 'b']);
});

test('Cancel/back from reorder returns to the sort sheet; dismissing it never writes preferences', () => {
  const app = harness();
  press(app.render(), 'Custom order').props.onPress();
  press(app.render(), 'Cancel').props.onPress();
  assert.ok(withText(app.render(), 'Sort folders'));
  assert.equal(app.writes, 0);
  app.render().props.onRequestClose();
  assert.equal(app.closes, 1); assert.equal(app.writes, 0);
});

test('real sheet respects reduced motion and safe-area spacing and prevents saving while dragging', () => {
  const app = harness();
  assert.equal(app.render().props.animationType, 'none');
  const root = find(app.render(), (node) => node.type === 'GestureHandlerRootView');
  assert.ok(root.props.style.at(-1).paddingBottom > 24);
  press(app.render(), 'Custom order').props.onPress();
  find(app.render(), (node) => node.type === app.components.FolderReorderList).props.onDraggingChange(true);
  assert.equal(labelled(app.render(), 'Save custom folder order').props.disabled, true);
});
