import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { awaitSyncRequest } from '../src/utils/sync-cancellation.mjs';

const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const compile = (file, name) => transformSync(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export const /g, 'const ').replace(`export default ${name};`, ''), { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code + `\n${name};`;
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) };
const find = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of tree.children || []) { const result = find(child, predicate); if (result) return result; }
  return null;
};

test('actual initial-sync screen keeps Cancel accessible, supports resumed/error/empty/success states and safe areas', () => {
  const globals = { React, useMemo: (fn) => fn(), useTheme: () => ({ background: '#151923', card: '#1C2233' }), useThemeMode: () => ({ scheme: 'dark' }),
    useSafeAreaInsets: () => ({ top: 24, bottom: 34 }), StyleSheet: { create: (styles) => styles }, radius: {} };
  for (const name of ['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'Text', 'View', 'Ionicons']) globals[name] = name;
  const Screen = vm.runInNewContext(compile('../src/components/initial-sync-screen.js', 'InitialSyncScreen'), globals);
  let cancelled = 0, resumed = 0, continued = 0;
  const render = (patch = {}) => Screen({ sync: { visible: true, busy: true, status: 'syncing', progress: { phase: 'images', completed: 1, total: 4 }, start: () => { resumed += 1; }, ...patch }, onCancel: () => { cancelled += 1; }, onContinue: () => { continued += 1; } });
  const busy = render();
  assert.equal(busy.props.animationType, 'none');
  find(busy, (node) => node.props.accessibilityLabel === 'Cancel initial sync').props.onPress();
  assert.equal(cancelled, 1);
  const scroll = find(busy, (node) => node.type === 'ScrollView');
  assert.ok(scroll.props.contentContainerStyle.at(-1).paddingBottom > 34);
  const error = render({ busy: false, status: 'error', error: 'Bad network' });
  assert.ok(find(error, (node) => node.props.accessibilityRole === 'alert'));
  find(error, (node) => node.type === 'Pressable' && find(node, (text) => text.children?.includes('Resume sync'))).props.onPress();
  assert.equal(resumed, 1);
  const empty = render({ busy: false, status: 'complete', result: { notes: 0 } });
  assert.ok(find(empty, (node) => node.children?.includes('No cloud notes yet. Your local notes were kept.')));
  find(empty, (node) => node.type === 'Pressable' && find(node, (text) => text.children?.includes('Open notes'))).props.onPress();
  assert.equal(continued, 1);
});

const providerFixture = ({ checkpoint = null, readGate = null } = {}) => {
  let cursor = 0;
  const slots = [], effects = [], timers = new Map(), runs = [];
  const auth = { session: { user: { id: 'owner' } }, loading: false, recoveringPassword: false, recoveringLockPassword: false };
  const useState = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; };
  const useRef = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; };
  const useCallback = (fn, dependencies) => {
    const i = cursor++, previous = slots[i];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) slots[i] = { dependencies, fn };
    return slots[i].fn;
  };
  const useEffect = (fn, dependencies) => {
    const i = cursor++, previous = slots[i];
    if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return;
    effects.push(() => { previous?.cleanup?.(); slots[i] = { dependencies, cleanup: fn() }; });
  };
  const globals = { React, createContext: () => ({ Provider: 'Provider' }), useState, useRef, useEffect, useCallback,
    useAuth: () => auth, setTimeout: (fn) => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id), AbortController,
    initialSyncService: {
      read: async () => { if (readGate) await readGate.promise; return checkpoint; },
      run: (userId, options) => {
        const gate = deferred(); runs.push({ userId, options, gate });
        return awaitSyncRequest(gate.promise, options.signal);
      },
    },
  };
  const Provider = vm.runInNewContext(compile('../src/context/InitialSyncContext.js', 'InitialSyncProvider'), globals);
  const render = () => { cursor = 0; const tree = Provider({ children: null }); while (effects.length) effects.shift()(); return tree.props.value; };
  return { auth, runs, timers, render, dispose: () => { for (const slot of slots) slot?.cleanup?.(); } };
};

test('real provider automatically starts first sign-in, cancels promptly, resumes, and only then reports completion', async () => {
  const app = providerFixture(); app.render(); await flush();
  assert.equal(app.runs.length, 1);
  assert.equal(app.render().busy, true);
  await app.render().cancel();
  assert.equal(app.render().pending, true); assert.equal(app.render().visible, false);
  app.runs[0].gate.resolve({ notes: 99 }); await flush();
  assert.equal(app.render().status, 'paused', 'late completion cannot overwrite cancellation');
  const retry = app.render().start();
  assert.equal(app.runs.length, 2);
  app.runs[1].gate.resolve({ notes: 4 }); await retry;
  assert.equal(app.render().pending, false); assert.equal(app.render().status, 'complete');
  app.dispose();
});

test('real provider offers Resume for persisted interruptions, skips completed accounts, and ignores stale account reads', async () => {
  for (const status of ['pending', 'complete']) {
    const app = providerFixture({ checkpoint: { version: 1, status } }); app.render(); await flush();
    assert.equal(app.runs.length, 0);
    assert.equal(app.render().pending, status === 'pending');
    assert.equal(app.render().visible, status === 'pending'); app.dispose();
  }
  const gate = deferred(), app = providerFixture({ readGate: gate }); app.render();
  app.auth.session = null; app.render(); gate.resolve(); await flush();
  assert.equal(app.runs.length, 0); assert.equal(app.render().visible, false); app.dispose();
});

test('real provider timeout keeps Resume available and account changes invalidate a running restore', async () => {
  const app = providerFixture(); app.render(); await flush();
  [...app.timers.values()][0](); await flush();
  assert.equal(app.render().status, 'error'); assert.equal(app.render().pending, true);
  assert.match(app.render().error, /connection took too long/);
  app.render().start();
  const old = app.runs.at(-1);
  app.auth.session = { user: { id: 'other' } }; app.render(); await flush();
  old.gate.resolve({ notes: 99 }); await flush();
  assert.equal(app.render().userId, 'other'); assert.notEqual(app.render().result?.notes, 99);
  app.dispose();
});
