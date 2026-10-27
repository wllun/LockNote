import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createInitialSyncService, initialSyncKey } from '../src/services/initialSyncService.mjs';
import { createPrivateSyncService } from '../src/services/privateSyncService.mjs';
import { createAttachmentDownloadService } from '../src/services/attachmentDownloadService.mjs';
import { assertSyncActive, awaitSyncRequest } from '../src/utils/sync-cancellation.mjs';
import { downloadCompleteImage } from '../src/utils/downloaded-image.mjs';
import { createAutomaticSyncService, autoSyncPreferenceKey } from '../src/services/automaticSyncService.mjs';

const stamp = '2026-10-27T00:00:00.000Z';
const note = (id, extra = {}) => ({ id, folder_id: null, title: id, content: `${id}: whole note\nSecond line\nLast line`, note_type: 'note', is_deleted: false, created_at: stamp, updated_at: stamp, ...extra });
const image = (id) => ({ id, storage_path: `owner/note/${id}.jpg`, mime_type: 'image/jpeg', width: 100, height: 80, byte_size: 6, display_order: 0, anchor_offset: 0, display_width_ratio: 1, created_at: stamp, updated_at: stamp });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const syncSource = readFileSync(new URL('../src/services/syncService.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export const syncService', 'const syncService');

const fixture = () => {
  const state = { user: 'owner', failImage: null, gate: null, calls: [], downloads: [], cleanup: [], progress: [], listeners: [], applied: [], deleted: [] };
  const values = new Map(), localNotes = new Map([['guest', note('guest')]]), localImages = new Map();
  const remote = { folders: [], notes: ['n1', 'n2', 'n3', 'n4'].map((id) => note(id)) };
  const storage = { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: state.user }, access_token: `${state.user}-token` } } }),
      onAuthStateChange: (listener) => { state.listeners.push(listener); },
    },
    rpc: (name, args) => {
      state.calls.push(name);
      assert.notEqual(name, 'sync_private_data', 'initial recovery must not upload guest notes');
      const response = name === 'recover_private_data' ? { data: structuredClone(remote) }
        : { data: ['n1', 'n2'].includes(args.p_local_note_id) ? [image(args.p_local_note_id === 'n1' ? 'img1' : 'img2')] : [] };
      const result = Promise.resolve(response);
      result.setHeader = (_key, value) => { assert.equal(value, 'Bearer owner-token'); return result; };
      result.abortSignal = () => result;
      return result;
    },
    storage: { from: () => ({ createSignedUrl: async (path) => ({ data: { signedUrl: path } }) }) },
  };
  const folderRepo = { getSyncSnapshot: async () => ({ records: [], tombstones: [] }), getById: async () => null, applySyncSnapshot: async () => state.applied.push('folders') };
  const noteRepo = {
    getSyncSnapshot: async () => ({ records: [...localNotes.values()], tombstones: state.deleted }),
    getById: async (id) => localNotes.get(id) ?? null,
    applySyncSnapshot: async (records) => {
      state.applied.push('notes');
      for (const value of records) if (!localNotes.has(value.id) || value.updated_at >= localNotes.get(value.id).updated_at) localNotes.set(value.id, structuredClone(value));
    },
  };
  const attachmentRepo = {
    listByNoteId: async (id) => [...localImages.values()].filter((item) => item.note_id === id),
    getById: async (id) => localImages.get(id), listAll: async () => [...localImages.values()],
    add: async (noteId, asset) => { await asset.beforeCommit(); const { beforeCommit, ...fields } = asset; localImages.set(asset.id, { ...fields, note_id: noteId }); },
  };
  const downloads = createAttachmentDownloadService({ supabase, noteRepo, attachmentRepo,
    prepareDownloadedAttachment: async (_url, id, options) => {
      state.downloads.push(id);
      if (state.failImage === id) throw new Error('Failed to fetch');
      if (state.gate) await awaitSyncRequest(state.gate.promise, options.signal);
      return { uri: `local:${id}`, cleanup: () => state.cleanup.push(id) };
    },
  });
  const syncService = vm.runInNewContext(`${syncSource}\nsyncService;`, {
    AsyncStorage: storage, supabase, isSupabaseConfigured: true, folderRepo, noteRepo, attachmentRepo,
    createPrivateSyncService, assertSyncActive, awaitSyncRequest,
    attachmentCloudService: { downloadNote: downloads.downloadNote }, emitSyncEvent: () => {},
  });
  const createInitial = () => createInitialSyncService({ storage, syncService });
  return { state, values, storage, localNotes, localImages, remote, service: createInitial(), createInitial, syncService,
    switchUser: (id) => { state.user = id; state.listeners.forEach((listener) => listener('SIGNED_IN', { user: { id } })); } };
};

test('first login restores all four complete cloud notes and images without uploading/replacing guest data', async () => {
  const app = fixture();
  assert.equal(await app.service.read('owner'), null);
  const result = await app.service.run('owner', { onProgress: (progress) => app.state.progress.push(progress) });
  assert.equal(result.notes, 4);
  assert.equal(app.localNotes.size, 5);
  assert.equal(app.localNotes.get('n4').content, note('n4').content);
  assert.equal(app.localNotes.get('guest').content, note('guest').content);
  assert.equal(app.localImages.size, 2);
  assert.equal((await app.createInitial().read('owner')).status, 'complete');
  assert.equal(app.state.calls.filter((name) => name === 'recover_private_data').length, 1);
  assert.ok(app.state.progress.some((value) => value.phase === 'images' && value.completed === value.total));
});

test('network interruption stays pending; restart/retry keeps whole notes and does not download completed images twice', async () => {
  const app = fixture(); app.state.failImage = 'img2';
  await assert.rejects(app.service.run('owner'), /fetch/);
  const checkpoint = await app.createInitial().read('owner');
  assert.equal(checkpoint.status, 'pending');
  assert.equal(checkpoint.lastNoteId, 'n1');
  assert.equal(app.localImages.size, 1);
  assert.equal(app.localNotes.get('n2').content, note('n2').content);
  app.state.failImage = null;
  await app.createInitial().run('owner');
  assert.deepEqual(app.state.downloads, ['img1', 'img2', 'img2']);
  assert.equal(app.localImages.size, 2);
  assert.equal(app.localNotes.size, 5, 'retry upserts stable IDs, not duplicates');
  assert.equal((await app.service.read('owner')).status, 'complete');
});

test('cancel during image download settles promptly and discards a late response; later retry completes safely', async () => {
  const app = fixture(), controller = new AbortController(); app.state.gate = deferred();
  const pending = app.service.run('owner', { signal: controller.signal });
  await flush();
  assert.deepEqual(app.state.downloads, ['img1']);
  controller.abort();
  await assert.rejects(pending, { code: 'SYNC_CANCELLED' });
  app.state.gate.resolve(); await flush();
  assert.equal(app.localImages.size, 0);
  assert.equal((await app.service.read('owner')).status, 'pending');
  app.state.gate = null; await app.service.run('owner');
  assert.equal(app.localImages.size, 2);
});

test('switch-away-and-back during a download cannot apply an old account image or mark initial sync complete', async () => {
  const app = fixture(); app.state.gate = deferred();
  const pending = app.service.run('owner'); await flush();
  app.switchUser('other'); app.switchUser('owner'); app.state.gate.resolve();
  await assert.rejects(pending, { code: 'SYNC_ACCOUNT_CHANGED' });
  assert.equal(app.localImages.size, 0);
  assert.equal((await app.service.read('owner')).status, 'pending');
  assert.equal(app.values.has(initialSyncKey('other')), false);
  assert.deepEqual(app.state.cleanup, ['img1']);
});

test('malformed server notes are rejected before any folder/note writes, and newer local edits/deletions survive recovery', async () => {
  const app = fixture(); delete app.remote.notes[0].content;
  await assert.rejects(app.service.run('owner'), /invalid response/);
  assert.deepEqual(app.state.applied, []);
  assert.equal(app.localNotes.size, 1);
  app.remote.notes[0] = note('n1');
  app.localNotes.set('n1', note('n1', { content: 'newer local draft', updated_at: '2026-10-28T00:00:00.000Z' }));
  app.state.deleted.push({ id: 'n4', updated_at: '2026-10-28T00:00:00.000Z' });
  await app.service.run('owner');
  assert.equal(app.localNotes.get('n1').content, 'newer local draft');
  assert.equal(app.localNotes.has('n4'), false, 'a hard-deleted local row is not resurrected by an older cloud snapshot');
});

test('already synced installations skip initial gate; pending checkpoint overrides last-sync time and is per account', async () => {
  const app = fixture();
  app.values.set('@locknote_private_sync_last:owner', stamp);
  assert.equal((await app.service.read('owner')).status, 'complete');
  app.values.set(initialSyncKey('owner'), JSON.stringify({ version: 1, status: 'pending' }));
  assert.equal((await app.service.read('owner')).status, 'pending');
  assert.equal(await app.service.read('other'), null);
});

test('open editors and local checkpoint write failures stop restoration before any cloud request', async () => {
  const app = fixture();
  const editorBlocked = createInitialSyncService({ storage: {}, syncService: app.syncService, isEditorOpen: () => true });
  await assert.rejects(editorBlocked.run('owner'), { code: 'SYNC_EDITOR_OPEN' });
  const diskBlocked = createInitialSyncService({ storage: { getItem: async () => null, setItem: async () => { throw new Error('Disk full'); } }, syncService: app.syncService });
  await assert.rejects(diskBlocked.run('owner'), /Disk full/);
  assert.equal(app.state.calls.length, 0);
});

test('download validation never accepts short, empty, non-JPEG or failed HTTP bodies as a complete image', async () => {
  const originalFetch = globalThis.fetch;
  const valid = new Uint8Array([255, 216, 1, 2, 255, 217]);
  try {
    for (const bytes of [new Uint8Array(), valid.subarray(0, 4), new Uint8Array(6)]) {
      globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
      await assert.rejects(downloadCompleteImage('test', { expectedBytes: 6 }), /incomplete/);
    }
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(downloadCompleteImage('test'), /could not be downloaded/);
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => valid.buffer });
    assert.deepEqual(await downloadCompleteImage('test', { expectedBytes: 6 }), valid);
    const gate = deferred(), controller = new AbortController();
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: () => gate.promise });
    const request = downloadCompleteImage('test', { signal: controller.signal }); await flush(); controller.abort();
    await assert.rejects(request, { code: 'SYNC_CANCELLED' }); gate.resolve(valid.buffer);
  } finally { globalThis.fetch = originalFetch; }
});

test('same-account auth refresh does not interrupt restoration', async () => {
  const app = fixture(); app.state.gate = deferred();
  const pending = app.service.run('owner'); await flush();
  app.switchUser('owner'); app.state.gate.resolve(); await pending;
  assert.equal((await app.service.read('owner')).status, 'complete');
});

test('failed completion marker remains resumable and retries without downloading existing images again', async () => {
  const app = fixture(), save = app.storage.setItem;
  app.storage.setItem = async (key, value) => {
    if (key === initialSyncKey('owner') && JSON.parse(value).status === 'complete') throw new Error('Storage full');
    return save(key, value);
  };
  await assert.rejects(app.service.run('owner'), /Storage full/);
  assert.equal((await app.service.read('owner')).status, 'pending');
  app.storage.setItem = save; await app.service.run('owner');
  assert.deepEqual(app.state.downloads, ['img1', 'img2']);
});

test('headless automatic sync cannot upload while initial recovery is pending', async () => {
  const values = new Map([[autoSyncPreferenceKey('owner'), 'true'], [initialSyncKey('owner'), JSON.stringify({ status: 'pending' })]]);
  let calls = 0;
  const service = createAutomaticSyncService({
    storage: { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) },
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) }, rpc: async () => { calls += 1; return { data: { plan: 'plus', expires_at: '2099-01-01' } }; } },
    syncService: { syncAll: async () => { calls += 1; return { syncedAt: stamp }; } }, isEditorOpen: () => false,
  });
  await assert.rejects(service.run('owner'), { code: 'SYNC_DEFERRED' }); assert.equal(calls, 0);
  values.set(initialSyncKey('owner'), JSON.stringify({ status: 'complete' })); await service.run('owner'); assert.equal(calls, 2);
});
