import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { syncErrorMessage } from '../src/utils/private-sync.mjs';
import { createAutomaticSyncController, AUTO_SYNC_INTERVAL_MS } from '../src/services/automaticSyncController.mjs';
import { createAutomaticSyncService, autoSyncPreferenceKey, autoSyncStatusKey } from '../src/services/automaticSyncService.mjs';
import { createPrivateSyncService } from '../src/services/privateSyncService.mjs';
import { holdSyncEditor, hasOpenSyncEditor, subscribeSyncEditorActivity } from '../src/services/syncActivity.mjs';

const flush = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const ready = { userId: 'owner', ready: true, enabled: true, eligible: true, online: true, active: true };
const fakeClock = () => {
  const timers = new Map();
  let id = 0;
  return {
    setTimer: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearTimer: (key) => timers.delete(key),
    timers,
    fire: async () => {
      const [key, item] = timers.entries().next().value;
      timers.delete(key);
      item.fn();
      await flush();
    },
  };
};

test('automatic sync is opt-in and requires readiness, paid plan, connection and foreground', async () => {
  for (const patch of [{ enabled: false }, { eligible: false }, { userId: null }, { ready: false }, { online: false }, { online: null }, { active: false }]) {
    const clock = fakeClock();
    let calls = 0;
    const controller = createAutomaticSyncController({ ...clock, sync: async () => { calls += 1; } });
    controller.configure({ ...ready, ...patch });
    await controller.run();
    assert.equal(calls, 0);
    assert.equal(clock.timers.size, 0);
    controller.dispose();
  }
});

test('launch/resume/reconnect triggers coalesce and periodic sync never overlaps', async () => {
  const clock = fakeClock();
  const pending = deferred();
  let calls = 0;
  const controller = createAutomaticSyncController({ ...clock, sync: async () => { calls += 1; return pending.promise; } });
  controller.configure(ready);
  controller.request(); controller.request();
  assert.equal(clock.timers.size, 1);
  await clock.fire();
  await controller.run(); controller.request();
  assert.equal(calls, 1);
  pending.resolve({ syncedAt: '2026-09-19T00:00:00Z' });
  await flush();
  assert.equal(clock.timers.size, 1);
  assert.equal([...clock.timers.values()][0].delay, AUTO_SYNC_INTERVAL_MS);
  controller.configure({ ...ready, online: false });
  assert.equal(clock.timers.size, 0);
  controller.configure(ready);
  assert.equal([...clock.timers.values()][0].delay, 1500);
  controller.dispose();
});

test('automatic sync waits for editor cleanup and editor holds release idempotently', async () => {
  const clock = fakeClock();
  let calls = 0;
  const controller = createAutomaticSyncController({ ...clock, isEditorOpen: hasOpenSyncEditor, sync: async () => { calls += 1; return {}; } });
  const unsubscribe = subscribeSyncEditorActivity(() => controller.request());
  const release = holdSyncEditor();
  controller.configure(ready);
  await controller.run();
  assert.equal(calls, 0);
  assert.equal(controller.getState().status, 'waiting-editor');
  release(); release();
  assert.equal(hasOpenSyncEditor(), false);
  await clock.fire();
  assert.equal(calls, 1);
  unsubscribe(); controller.dispose();
});

test('automatic failures retain local work and use bounded exponential retries', async () => {
  const clock = fakeClock();
  const controller = createAutomaticSyncController({ ...clock, now: () => 1000, sync: async () => { throw new Error('Failed to fetch'); } });
  controller.configure(ready);
  for (const expected of [15000, 30000, 60000, 120000, 240000, 300000, 300000]) {
    await clock.fire();
    assert.equal(controller.getState().status, 'retrying');
    assert.equal(controller.getState().retryAt, 1000 + expected);
    assert.equal([...clock.timers.values()][0].delay, expected);
  }
  controller.configure({ ...ready, online: false });
  assert.equal(clock.timers.size, 0);
  controller.dispose();
});

test('account changes, opt-out and disposal invalidate an in-flight automatic run', async () => {
  for (const change of [{ ...ready, userId: 'another' }, { ...ready, enabled: false }, null]) {
    const clock = fakeClock();
    const pending = deferred();
    let guard;
    const controller = createAutomaticSyncController({ ...clock, sync: async (userId, isCurrent) => { guard = isCurrent; return pending.promise; } });
    controller.configure(ready);
    await clock.fire();
    if (change) controller.configure(change); else controller.dispose();
    assert.equal(guard(), false);
    pending.resolve({ syncedAt: 'stale' });
    await flush();
    assert.notEqual(controller.getState().lastSyncAt, 'stale');
    controller.dispose();
  }
});

test('quota recovery does not claim upload success or retry aggressively', async () => {
  const clock = fakeClock();
  const controller = createAutomaticSyncController({ ...clock, sync: async () => ({ recoveryOnly: true, syncedAt: 'now' }) });
  controller.configure(ready);
  await clock.fire();
  assert.equal(controller.getState().status, 'recovery-only');
  assert.equal([...clock.timers.values()][0].delay, 300000);
  controller.dispose();
});

const runnerFixture = (changes = {}) => {
  const values = new Map();
  const state = { userId: 'owner', editor: false, plan: 'plus', expiresAt: '2026-09-20T00:00:00Z', syncCalls: 0, ...changes };
  const storage = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: state.userId ? { user: { id: state.userId } } : null } }) },
    rpc: async () => ({ data: { plan: state.plan, expires_at: state.expiresAt } }),
  };
  const service = createAutomaticSyncService({ supabase, storage, isEditorOpen: () => state.editor,
    now: () => Date.parse('2026-09-19T00:00:00Z'),
    syncService: { syncAll: async (options) => { await options.guard(); state.syncCalls += 1; return { syncedAt: '2026-09-19T00:00:01Z' }; } },
  });
  return { service, values, state, storage, supabase };
};

test('headless runner defaults off and reads only the current account preference', async () => {
  const { service, values, state } = runnerFixture();
  assert.equal(await service.readEnabled('owner'), false);
  await assert.rejects(service.run('owner'), { code: 'SYNC_DEFERRED' });
  await service.setEnabled('owner', true);
  assert.equal(values.get(autoSyncPreferenceKey('owner')), 'true');
  state.userId = 'other';
  await assert.rejects(service.run('owner'), { code: 'SYNC_DEFERRED' });
  assert.equal(state.syncCalls, 0);
  assert.equal(await service.readEnabled('other'), false);
});

test('headless runner freshly verifies paid server access including expiry and malformed dates', async () => {
  for (const [plan, expiresAt, permitted] of [
    ['plus', '2026-09-20', true], ['pro', '2026-09-20', true], ['free', '2026-09-20', false],
    ['plus', '2026-09-18', false], ['pro', '2026-09-19', false], ['pro', 'invalid', false], ['plus', null, false],
  ]) {
    const { service, state } = runnerFixture({ plan, expiresAt });
    await service.setEnabled('owner', true);
    if (permitted) await service.run('owner');
    else await assert.rejects(service.run('owner'), { code: 'PREMIUM_REQUIRED' });
    assert.equal(state.syncCalls, permitted ? 1 : 0);
  }
});

test('headless runner stops on editor activity or opt-out during server authorization', async () => {
  for (const action of ['editor', 'opt-out', 'sign-out']) {
    const fixture = runnerFixture();
    await fixture.service.setEnabled('owner', true);
    fixture.supabase.rpc = async () => {
      if (action === 'editor') fixture.state.editor = true;
      if (action === 'opt-out') await fixture.service.setEnabled('owner', false);
      if (action === 'sign-out') fixture.state.userId = null;
      return { data: { plan: 'plus', expires_at: fixture.state.expiresAt } };
    };
    await assert.rejects(fixture.service.run('owner'), { code: 'SYNC_DEFERRED' });
    assert.equal(fixture.state.syncCalls, 0);
  }
});

test('durable automatic status retains last success when a network attempt fails', async () => {
  const fixture = runnerFixture();
  await fixture.service.setEnabled('owner', true);
  await fixture.service.run('owner');
  fixture.supabase.rpc = async () => ({ error: new Error('Failed to fetch') });
  await assert.rejects(fixture.service.run('owner'), /Failed to fetch/);
  const status = JSON.parse(fixture.values.get(autoSyncStatusKey('owner')));
  assert.equal(status.lastSyncAt, '2026-09-19T00:00:01Z');
  assert.equal(status.error, 'Failed to fetch');
});

test('automatic deadline bounds authorization and waiting behind a manual sync; late queued work stays cancelled', async () => {
  for (const stage of ['authorization', 'queue']) {
    const fixture = runnerFixture();
    await fixture.service.setEnabled('owner', true);
    const pending = deferred();
    let timeout;
    let boundOptions;
    if (stage === 'authorization') fixture.supabase.rpc = () => pending.promise;
    const service = createAutomaticSyncService({ supabase: fixture.supabase, storage: fixture.storage,
      isEditorOpen: () => false, now: () => Date.parse('2026-09-19'),
      setTimer: (fn, delay) => { assert.equal(delay, 30000); timeout = fn; return 1; }, clearTimer: () => {},
      syncService: { syncAll: (options) => { boundOptions = options; return pending.promise; } },
    });
    const operation = service.run('owner');
    await flush();
    timeout();
    await assert.rejects(operation, { code: 'SYNC_TIMEOUT' });
    if (stage === 'queue') {
      assert.equal(boundOptions.signal.aborted, true);
      await assert.rejects(boundOptions.guard(), { code: 'SYNC_TIMEOUT' });
    }
    pending.resolve({ data: { plan: 'plus', expires_at: '2099-01-01' } });
    await flush();
  }
});

const privateFixture = () => {
  const state = { userId: 'owner', applies: [], rpcCalls: [], guardStage: null, gate: null };
  const session = () => ({ data: { session: { user: { id: state.userId }, access_token: `${state.userId}-token` } } });
  const service = createPrivateSyncService({ isConfigured: true,
    supabase: { auth: { getSession: async () => session(), onAuthStateChange: (callback) => { state.authChanged = callback; } }, rpc: (name) => {
      state.rpcCalls.push(name);
      const result = state.gate ? state.gate.promise : Promise.resolve({ data: { folders: [], notes: [] } });
      result.setHeader = (key, value) => { state.header = [key, value]; return result; };
      return result;
    } },
    folderRepo: { getSyncSnapshot: async () => ({ records: [], tombstones: [] }), applySyncSnapshot: async () => state.applies.push('folders') },
    noteRepo: { getSyncSnapshot: async () => ({ records: [], tombstones: [] }), applySyncSnapshot: async () => state.applies.push('notes') },
    storage: { setItem: async () => {}, getItem: async () => null },
  });
  return { service, state };
};

test('sync RPC pins Authorization to snapshot account and stale responses never apply', async () => {
  const { service, state } = privateFixture();
  state.gate = deferred();
  const operation = service.syncAll({ expectedUserId: 'owner' });
  await flush();
  assert.deepEqual(state.header, ['Authorization', 'Bearer owner-token']);
  state.userId = 'other';
  state.gate.resolve({ data: { folders: [], notes: [] } });
  await assert.rejects(operation, { code: 'SYNC_ACCOUNT_CHANGED' });
  assert.deepEqual(state.applies, []);
});

test('automatic apply guard prevents a cloud response overwriting an open editor draft', async () => {
  const { service, state } = privateFixture();
  await assert.rejects(service.syncAll({ guard: (stage) => {
    if (stage === 'apply-folders') throw Object.assign(new Error('editor open'), { code: 'SYNC_DEFERRED' });
  } }), { code: 'SYNC_DEFERRED' });
  assert.deepEqual(state.applies, []);
});

test('an account switch during the async apply guard, including switch-away-and-back, discards the response', async () => {
  for (const switchBack of [false, true]) {
    const { service, state } = privateFixture();
    await assert.rejects(service.syncAll({ guard: async (stage) => {
      if (stage !== 'apply-folders') return;
      state.userId = 'other';
      state.authChanged('SIGNED_IN', { user: { id: 'other' } });
      if (switchBack) {
        state.userId = 'owner';
        state.authChanged('SIGNED_IN', { user: { id: 'owner' } });
      }
      await Promise.resolve();
    } }), { code: 'SYNC_ACCOUNT_CHANGED' });
    assert.deepEqual(state.applies, []);
  }
});

test('automatic runner rechecks editor activity after async storage/session checks', async () => {
  const fixture = runnerFixture();
  await fixture.service.setEnabled('owner', true);
  const getSession = fixture.supabase.auth.getSession;
  fixture.supabase.auth.getSession = async () => {
    const result = await getSession();
    fixture.state.editor = true;
    return result;
  };
  await assert.rejects(fixture.service.run('owner'), { code: 'SYNC_DEFERRED' });
  assert.equal(fixture.state.syncCalls, 0);
});

test('cancelled automatic responses cannot apply local snapshots', async () => {
  const { service, state } = privateFixture();
  const controller = new AbortController();
  state.gate = deferred();
  const operation = service.syncAll({ signal: controller.signal });
  await flush();
  controller.abort();
  state.gate.resolve({ data: { folders: [], notes: [] } });
  await assert.rejects(operation, /timed out or was cancelled/);
  assert.deepEqual(state.applies, []);
});

test('sync queued under an old account cannot upload under a new account', async () => {
  const { service, state } = privateFixture();
  state.gate = deferred();
  const first = service.syncAll();
  await flush();
  const queued = service.syncAll();
  await flush();
  state.userId = 'other';
  state.gate.resolve({ data: { folders: [], notes: [] } });
  await assert.rejects(first, { code: 'SYNC_ACCOUNT_CHANGED' });
  await assert.rejects(queued, { code: 'SYNC_ACCOUNT_CHANGED' });
  assert.equal(state.rpcCalls.length, 1);
});

test('actual manual/automatic/recovery service keeps attachment work inside one queue', async () => {
  let source = await fs.readFile(new URL('../src/services/syncService.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace('export const syncService', 'const syncService');
  const attachmentGate = deferred();
  const events = [];
  const fakePrivate = {
    getLastSyncAt: async () => null,
    syncAll: async (options) => { events.push(options.automatic ? 'automatic' : 'manual'); return { syncedAt: 'now' }; },
    recoverAll: async () => { events.push('recovery'); return {}; },
  };
  const service = vm.runInNewContext(`${source}\nsyncService;`, {
    AsyncStorage: {}, folderRepo: {}, noteRepo: {}, isSupabaseConfigured: true,
    createPrivateSyncService: () => fakePrivate,
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) } },
    emitSyncEvent: () => {},
    attachmentRepo: { listAll: async () => [{ note_id: 'n' }] },
    attachmentCloudService: { syncNote: async () => { events.push('attachment-start'); await attachmentGate.promise; events.push('attachment-end'); } },
  });
  const manual = service.syncAll();
  await flush();
  const automatic = service.syncAll({ automatic: true });
  const recovery = service.recoverAll();
  await flush();
  assert.deepEqual(events, ['manual', 'attachment-start']);
  attachmentGate.resolve();
  await Promise.all([manual, automatic, recovery]);
  assert.deepEqual(events, ['manual', 'attachment-start', 'attachment-end', 'automatic', 'recovery']);
});

test('native task is defined at entry-point scope and web excludes native task modules', async () => {
  const [entry, native, web, config, exit] = await Promise.all([
    '../index.js', '../src/services/backgroundSyncTask.js', '../src/services/backgroundSyncTask.web.js',
    '../app.config.js', '../src/utils/use-awaited-editor-exit.js',
  ].map((path) => fs.readFile(new URL(path, import.meta.url), 'utf8')));
  assert.match(entry, /import '\.\/src\/services\/backgroundSyncTask'/);
  assert.match(native, /TaskManager\.defineTask/);
  assert.match(native, /minimumInterval: 15/);
  assert.match(native, /requireOptionalNativeModule/);
  assert.doesNotMatch(web, /import .*expo-(background-task|task-manager)/);
  assert.match(config, /'expo-background-task'/);
  assert.match(exit, /holdSyncEditor\(\)/);
  assert.match(exit, /\.finally\(releaseSync\)/);
});

const nativeTaskFixture = async (changes = {}) => {
  const state = { editor: false, userId: 'owner', enabled: true, online: true, registered: false, supported: true, ...changes };
  const events = [];
  let task;
  const BackgroundTask = {
    BackgroundTaskResult: { Success: 1, Failed: 2 }, BackgroundTaskStatus: { Available: 1 },
    getStatusAsync: async () => state.restricted ? 2 : 1,
    registerTaskAsync: async (name, options) => { state.registered = true; events.push(['register', options.minimumInterval]); },
    unregisterTaskAsync: async () => { state.registered = false; events.push('unregister'); },
  };
  const TaskManager = {
    defineTask: (name, callback) => { task = callback; },
    isAvailableAsync: async () => state.supported,
    isTaskRegisteredAsync: async () => state.registered,
  };
  const source = (await fs.readFile(new URL('../src/services/backgroundSyncTask.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replaceAll('export const ', 'const ');
  const configure = vm.runInNewContext(`${source}\nconfigureBackgroundSyncTask;`, {
    requireOptionalNativeModule: () => state.modules === false ? null : {},
    require: (name) => name === 'expo-background-task' ? BackgroundTask : TaskManager,
    Constants: { appOwnership: state.expoGo ? 'expo' : 'standalone' }, isSupabaseConfigured: true,
    supabase: { auth: { getSession: async () => ({ data: { session: state.userId ? { user: { id: state.userId } } : null } }) } },
    hasOpenSyncEditor: () => state.editor,
    automaticSyncService: { readEnabled: async () => state.enabled, run: async (userId) => {
      if (state.failure) throw state.failure;
      events.push(['run', userId]);
    } },
    NetInfo: { fetch: async () => ({ isConnected: state.online }) },
    getNetworkAvailability: (network) => network.isConnected,
    getDB: () => { if (!state.initialized) throw new Error('not initialized'); },
    initDB: async () => { state.initialized = true; events.push('init'); },
  });
  return { state, events, configure, task, BackgroundTask };
};

test('actual headless task initializes storage without React and respects session/opt-out/offline/editor guards', async () => {
  const fixture = await nativeTaskFixture();
  assert.equal(await fixture.task({}), 1);
  assert.deepEqual(fixture.events, ['init', ['run', 'owner']]);
  for (const patch of [{ editor: true }, { userId: null }, { enabled: false }, { online: false }]) {
    const blocked = await nativeTaskFixture(patch);
    assert.equal(await blocked.task({}), 1);
    assert.deepEqual(blocked.events, []);
  }
});

test('actual native task reports genuine failure but skips expected editor/plan/account pauses', async () => {
  for (const code of ['SYNC_DEFERRED', 'PREMIUM_REQUIRED', 'SYNC_ACCOUNT_CHANGED', 'NETWORK']) {
    const fixture = await nativeTaskFixture({ failure: Object.assign(new Error('failure'), { code }) });
    assert.equal(await fixture.task({}), code === 'NETWORK' ? 2 : 1);
  }
  const fixture = await nativeTaskFixture();
  assert.equal(await fixture.task({ error: new Error('OS task error') }), 2);
});

test('native registration is idempotent, serialized and removable; Expo Go/old binaries fail open', async () => {
  const fixture = await nativeTaskFixture();
  await Promise.all([fixture.configure(true), fixture.configure(true), fixture.configure(false)]);
  assert.deepEqual(fixture.events, [['register', 15], 'unregister']);
  assert.equal(fixture.state.registered, false);
  for (const patch of [{ expoGo: true }, { modules: false }, { supported: false }, { restricted: true }]) {
    const unavailable = await nativeTaskFixture(patch);
    const status = await unavailable.configure(true);
    assert.ok(['unavailable', 'restricted'].includes(status));
    assert.deepEqual(unavailable.events, []);
  }
});

const renderProfile = async (automatic = {}) => {
  const snapshot = { loaded: true, enabled: false, changing: false, busy: false, state: { status: 'off' }, ...automatic };
  const source = (await fs.readFile(new URL('../src/screens/ProfileScreen.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace('export default ProfileScreen;', '');
  const code = transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  const component = vm.runInNewContext(`${code}\nProfileScreen;`, {
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useEffect: () => {}, useMemo: (fn) => fn(), useState: (value) => [value, () => {}],
    useAuth: () => ({ session: { user: { id: 'owner', email: 'test@example.com' } } }),
    useAutomaticSync: () => snapshot, useTheme: () => ({}),
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 }, radius: {}, shadow: { card: {} },
    Ionicons: 'Icon', ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', View: 'View',
    Text: 'Text', TouchableOpacity: 'TouchableOpacity', Alert: { alert: () => {} }, syncErrorMessage,
    syncService: {}, subscribeSyncEvents: () => () => {}, supabase: {},
  });
  return component();
};
const flattenElements = (node) => !node || typeof node !== 'object' ? []
  : [node, ...(node.children ?? []).flatMap((child) => Array.isArray(child)
    ? child.flatMap(flattenElements) : flattenElements(child))];
const renderedText = (node) => typeof node === 'string' ? node
  : !node || typeof node !== 'object' ? '' : (node.children ?? []).map(renderedText).join(' ');

test('actual Profile renders accessible opt-in and explicit offline/editor/expiry/retry/recovery status', async () => {
  for (const [status, expected] of [
    ['offline', 'Offline'], ['waiting-editor', 'close the note editor'], ['paused-plan', 'requires active Plus or Pro'],
    ['retrying', 'retry scheduled'], ['recovery-only', 'uploads paused'], ['syncing', 'Syncing notes'],
  ]) {
    const tree = await renderProfile({ enabled: true, state: { status, error: new Error('Failed to fetch') } });
    const nodes = flattenElements(tree);
    const toggle = nodes.find((node) => node.props.accessibilityRole === 'switch');
    assert.equal(toggle.props.accessibilityLabel, 'Automatic sync');
    assert.equal(toggle.props.accessibilityState.checked, true);
    assert.match(renderedText(toggle), new RegExp(expected));
    assert.equal(tree.type, 'ScrollView', 'large text and small screens remain scrollable');
  }
  const off = await renderProfile();
  const toggle = flattenElements(off).find((node) => node.props.accessibilityRole === 'switch');
  assert.equal(toggle.props.accessibilityState.checked, false);
  const busy = await renderProfile({ busy: true });
  const manual = flattenElements(busy).find((node) => node.props.accessibilityLabel === 'Sync notes and folders');
  assert.equal(manual.props.disabled, true);
});

test('native startup/headless execution share complete database initialization and can retry failure', async () => {
  const source = (await fs.readFile(new URL('../src/db/sqlite.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replaceAll('export const ', 'const ');
  const gate = deferred();
  let opens = 0;
  let fail = false;
  const db = { execAsync: async () => {
    await gate.promise;
    if (fail) { fail = false; throw new Error('schema failure'); }
  }, getAllAsync: async () => [] };
  const createDB = () => vm.runInNewContext(`${source}\n({ initDB, getDB });`, {
    Platform: { OS: 'android' }, require: () => ({ openDatabaseAsync: async () => { opens += 1; return db; } }),
  });
  const native = createDB();
  const first = native.initDB();
  const headless = native.initDB();
  await flush();
  assert.equal(opens, 1);
  let settled = false;
  headless.then(() => { settled = true; });
  await flush();
  assert.equal(settled, false, 'open connection alone must not authorize task execution');
  gate.resolve();
  assert.equal(await first, db);
  assert.equal(await headless, db);
  assert.equal(await native.initDB(), db);
  assert.equal(opens, 1);
  const retry = createDB();
  fail = true;
  await assert.rejects(retry.initDB(), /schema failure/);
  assert.throws(retry.getDB, /not initialized/);
  assert.equal(await retry.initDB(), db);
  assert.equal(opens, 3);
});
