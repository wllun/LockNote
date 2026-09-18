import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import * as sharing from '../src/utils/shared-note-access.mjs';
import * as collaboration from '../src/utils/collaboration-note.mjs';
import { getNetworkAvailability } from '../src/utils/network-availability.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const moduleSource = (path, name) => read(path).replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace(`export const ${name}`, `const ${name}`);
const future = '2099-01-01T00:00:00.000Z';

test('sharing access requires a valid unexpired Plus/Pro owner subscription', () => {
  const now = Date.parse('2026-09-18T00:00:00Z');
  for (const plan of ['free', 'plus', 'pro', null, 'unknown']) {
    for (const expires_at of [future, '2026-09-18T00:00:00Z', '2020-01-01', null, 'invalid']) {
      assert.equal(sharing.hasActiveSharingSubscription({ plan, expires_at }, now),
        ['plus', 'pro'].includes(plan) && expires_at === future);
    }
  }
  assert.equal(sharing.isSharedNoteVisible({ sharing_owner_plan: 'plus', sharing_expires_at: future }, now), true);
  assert.equal(sharing.isSharedNoteVisible({ sharing_owner_plan: 'free', sharing_expires_at: future }, now), false);
});

const serviceHarness = () => {
  const notes = new Map([
    ['incoming', { id: 'incoming', cloud_id: 'cloud', share_origin: 'incoming', share_role: 'editor', title: 'Original', content: 'Body' }],
    ['owned', { id: 'owned', cloud_id: 'owned-cloud', share_origin: 'owned', title: 'Owned', content: 'Private copy' }],
  ]);
  const rpcCalls = [], updates = [], deletions = [];
  let access = { plan: 'pro', expires_at: future, can_view: true };
  let list = [];
  const noteRepo = {
    getById: async (id) => notes.get(id),
    getByCloudId: async (id) => [...notes.values()].find((note) => note.cloud_id === id),
    getSharedWithMe: async () => [...notes.values()].filter((note) => note.share_origin === 'incoming'),
    update: async (id, values) => { updates.push({ id, values }); const next = { ...notes.get(id), ...values }; notes.set(id, next); return next; },
    softDelete: async (id) => { deletions.push(id); },
    upsertSharedCache: async (values) => {
      const existing = [...notes.values()].find((note) => note.cloud_id === values.cloud_id);
      const next = { id: existing?.id ?? 'new-cache', ...existing, ...values };
      notes.set(next.id, next); return next;
    },
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'recipient' } } } }) },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'get_note_subscription_access') return { data: access };
      if (name === 'list_shared_notes') return { data: list };
      if (name === 'acquire_shared_note_edit_lease') return { data: [{ acquired: true }] };
      if (name === 'release_shared_note_edit_lease') return { data: true };
      if (name === 'get_shared_note' || name === 'save_shared_note') return { data: [{ id: 'cloud', title: 'Remote', content: 'Remote body', revision: 1, role: 'editor' }] };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const service = vm.runInNewContext(`${moduleSource('src/services/collaborationService.js', 'collaborationService')}\ncollaborationService;`, {
    ...sharing, ...collaboration, noteRepo, supabase, isSupabaseConfigured: true,
    noteEditingAccessService: { requireNote: async () => {} },
    premiumAccessService: { getPlan: () => 'free' }, console,
  });
  return { service, notes, updates, deletions, rpcCalls,
    setAccess: (next) => { access = next; }, setList: (next) => { list = next; } };
};

test('suspension prevents incoming viewer/editor reads, leases, saves and conflict resolution before local mutation', async () => {
  for (const share_role of ['editor', 'viewer']) {
    for (const note_type of ['note', 'checklist', 'expense', 'reminder']) {
      const app = serviceHarness();
      app.notes.get('incoming').share_role = share_role;
      app.notes.get('incoming').note_type = note_type;
      app.setAccess({ plan: 'free', expires_at: '2020-01-01', can_view: false });
      const view = await app.service.getSharedViewAccess('incoming');
      assert.equal(view.canView, false);
      assert.equal(view.status, 'subscription');
      for (const action of [() => app.service.refreshNote('incoming'), () => app.service.acquireEditLease('incoming'),
        () => app.service.save('incoming', { content: 'Forbidden' }), () => app.service.resolveConflict('incoming', 'remote')]) {
        await assert.rejects(action(), { code: 'SHARING_INACTIVE' });
      }
      assert.equal(app.updates.length, 0);
      assert.equal(app.rpcCalls.some(({ name }) => name === 'get_shared_note' || name === 'save_shared_note'), false);
    }
  }
});

test('Free recipients can view shares funded by Plus/Pro; revoked access fails closed', async () => {
  const app = serviceHarness();
  for (const plan of ['plus', 'pro']) {
    app.setAccess({ plan, expires_at: future, can_view: true });
    const view = await app.service.getSharedViewAccess('incoming');
    assert.equal(view.canView, true);
    assert.equal(view.expiresAt, future);
  }
  app.setAccess(null);
  assert.equal((await app.service.getSharedViewAccess('incoming')).status, 'revoked');
  app.setAccess({ plan: 'plus', expires_at: future, can_view: false });
  assert.equal((await app.service.getSharedViewAccess('incoming')).canView, false);
});

test('downgrade retains the owner local note and allows local pending edits without publishing', async () => {
  const app = serviceHarness();
  app.setAccess({ plan: 'free', expires_at: null, can_view: true });
  const saved = await app.service.save('owned', { content: 'Keep editing locally' });
  assert.equal(saved.content, 'Keep editing locally');
  assert.equal(saved.sync_status, 'pending');
  assert.equal(app.rpcCalls.some(({ name }) => name === 'save_shared_note'), false);
  assert.equal(app.deletions.length, 0);
});

test('shared list excludes inactive/malformed shares but preserves cache IDs for renewal', async () => {
  const app = serviceHarness();
  app.service.stageDraft('incoming', { title: 'Pending', content: 'Unsaved' });
  const remote = { id: 'cloud', owner_id: 'owner', title: 'Remote', content: 'Remote body', revision: 1,
    role: 'editor', owner_plan: 'pro', owner_subscription_expires_at: future };
  app.setList([{ ...remote, owner_plan: 'free' }, { ...remote, id: 'expired', owner_subscription_expires_at: '2020-01-01' }]);
  assert.equal((await app.service.refreshSharedWithMe()).length, 0);
  assert.equal(app.notes.has('incoming'), true);
  assert.equal(app.deletions.length, 0);
  assert.equal(await app.service.flushStagedDraft('incoming'), false, 'hidden draft must not auto-publish later');
  app.setList([remote]);
  const restored = await app.service.refreshSharedWithMe();
  assert.equal(restored[0].id, 'incoming');
  assert.equal(restored[0].content, 'Remote body');
  assert.equal(sharing.isSharedNoteVisible(restored[0]), true);
});

const hookHarness = () => {
  const states = [], refs = [], effects = [], timers = new Map();
  let stateIndex = 0, refIndex = 0, effectIndex = 0, pending = [], timerId = 0;
  let now = Date.parse('2026-09-18T00:00:00Z');
  let response = { canView: true, status: 'active', expiresAt: new Date(now + 60_000).toISOString() };
  const auth = { session: { user: { id: 'recipient' } } };
  const network = { isConnected: true, isInternetReachable: true };
  const denied = [], discarded = [];
  let foreground, realtime;
  class Clock extends Date { static now() { return now; } }
  const globals = {
    Date: Clock, Promise, getNetworkAvailability,
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef: (initial) => { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useEffect: (effect, dependencies) => {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        previous?.cleanup?.();
        const entry = { dependencies }; effects[index] = entry;
        pending.push(() => { entry.cleanup = effect(); });
      }
    },
    useAuth: () => auth, useNetInfo: () => network,
    AppState: { currentState: 'active', addEventListener: (_, callback) => { foreground = callback; return { remove() { foreground = null; } }; } },
    collaborationService: {
      getSharedViewAccess: async () => await response,
      discardStagedDraft: (id) => discarded.push(id),
      subscribe: (listener) => { realtime = listener; return () => { realtime = null; }; },
    },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const hook = vm.runInNewContext(`${moduleSource('src/hooks/use-shared-note-view-access.js', 'useSharedNoteViewAccess')}\nuseSharedNoteViewAccess;`, globals);
  return {
    auth, network, denied, discarded, timers,
    render: (id = 'incoming', enabled = true) => {
      stateIndex = 0; refIndex = 0; effectIndex = 0;
      const result = hook(id, enabled, (value) => denied.push(value));
      const callbacks = pending; pending = []; callbacks.forEach((callback) => callback());
      return result;
    },
    setResponse: (value) => { response = value; },
    now: () => now,
    advance: (ms) => {
      now += ms;
      for (const [id, entry] of [...timers]) if (entry.at <= now && timers.has(id)) { timers.delete(id); entry.callback(); }
    },
    foreground: (state) => foreground?.(state), realtime: () => realtime?.(),
    flush: () => new Promise((resolve) => setImmediate(resolve)),
    unmount: () => effects.forEach((entry) => entry?.cleanup?.()),
  };
};

test('open shared-note gate checks before display, expires at deadline even with a hung recheck, and restores on renewal', async () => {
  const app = hookHarness();
  assert.equal(app.render().canView, false);
  await app.flush();
  assert.equal(app.render().canView, true);
  app.setResponse(new Promise(() => {}));
  app.advance(59_999);
  assert.equal(app.render().canView, true);
  app.advance(1);
  assert.equal(app.render().canView, false);
  assert.equal(app.denied.at(-1).status, 'subscription');
  app.advance(10_000);
  await app.flush();
  app.setResponse({ canView: true, status: 'active', expiresAt: future });
  app.advance(30_000);
  await app.flush();
  assert.equal(app.render().canView, true);
  app.unmount();
  assert.equal(app.timers.size, 0);
});

test('view gate hides offline, on sign-out/account change and resume until verified; stale responses cannot authorize another note', async () => {
  const app = hookHarness();
  let resolve;
  app.setResponse(new Promise((done) => { resolve = done; }));
  app.render('old');
  app.auth.session = { user: { id: 'another-recipient' } };
  app.setResponse({ canView: false, status: 'revoked' });
  assert.equal(app.render('new').canView, false);
  resolve({ canView: true, status: 'active', expiresAt: future });
  await app.flush();
  assert.equal(app.render('new').canView, false);
  app.setResponse({ canView: true, status: 'active', expiresAt: future });
  app.realtime(); await app.flush();
  assert.equal(app.render('new').canView, true);
  app.network.isConnected = false;
  assert.equal(app.render('new').canView, false);
  app.network.isConnected = true;
  app.render('new'); await app.flush();
  app.foreground('background');
  assert.equal(app.render('new').canView, false);
  app.foreground('active');
  assert.equal(app.render('new').canView, false);
  await app.flush();
  assert.equal(app.render('new').canView, true);
  app.auth.session = null;
  assert.equal(app.render('new').canView, false);
  app.unmount();
});

test('blocked/loading gate never renders cached title/body/images/dialogs and Back remains usable', () => {
  let access = { canView: false, status: 'checking' }, back = 0;
  const child = { privateContent: 'SECRET CONTENT' };
  const source = read('src/components/shared-note-view-gate.js')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default SharedNoteViewGate;', '');
  const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  const render = vm.runInNewContext(`${code}\nSharedNoteViewGate;`, {
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', Text: 'Text', Pressable: 'Pressable',
    useTheme: () => ({}), radius: { md: 12 }, useSafeAreaInsets: () => ({ top: 20, bottom: 20 }),
    useSharedNoteViewAccess: () => access, SHARING_INACTIVE_MESSAGE: sharing.SHARING_INACTIVE_MESSAGE,
  });
  const props = { noteId: 'incoming', enabled: true, navigation: { goBack: () => { back++; } }, children: child };
  for (const status of ['checking', 'subscription', 'revoked', 'offline', 'signed-out', 'unavailable']) {
    access = { canView: false, status };
    const tree = render(props);
    assert.doesNotMatch(JSON.stringify(tree), /SECRET CONTENT/);
    tree.children.find((entry) => entry?.type === 'Pressable').props.onPress();
  }
  assert.equal(back, 6);
  access = { canView: true };
  assert.equal(render(props), child);
  for (const screen of ['NoteEditorScreen', 'ChecklistEditorScreen', 'ExpenseRecordEditorScreen', 'ReminderEditorScreen']) {
    const editor = read(`src/screens/${screen}.js`);
    assert.match(editor, /<SharedNoteViewGate noteId=\{noteId\} enabled=\{shared\}/);
    assert.match(editor, /if \(access.canView === false\) \{[\s\S]*?clearTimeout\(saveTimeout.current\)[\s\S]*?discardStagedDraft\(noteId\)/);
  }
});

test('migration covers security-definer lists, table/storage RLS helpers, retained memberships and pre-expiry leases', () => {
  const sql = read('supabase/migrations/202609180001_shared_note_subscription_visibility.sql');
  assert.match(sql, /n.owner_id = auth.uid\(\) or \([\s\S]*?subscription_plan\(n.owner_id\) in \('plus', 'pro'\)/);
  assert.match(sql, /where m.user_id = auth.uid\(\) and public.can_access_shared_note\(n.id\)/);
  assert.match(sql, /can_write_note_attachments[\s\S]*?and public.can_access_shared_note\(n.id\)/);
  assert.match(sql, /save_shared_note_subscription_unchecked[\s\S]*?from public, anon, authenticated/);
  assert.match(sql, /create function public.save_shared_note[\s\S]*?and public.can_access_shared_note\(n.id\)[\s\S]*?subscription_plan\(n.owner_id\) in \('plus', 'pro'\)/);
  assert.doesNotMatch(sql, /delete from|truncate|drop table/i);
  for (const path of ['supabase/migrations/202608230001_collaboration_release_1.sql', 'supabase/migrations/202609120001_note_image_attachments.sql']) {
    assert.match(read(path), /using[\s\S]*?can_access_shared_note/);
  }
});
