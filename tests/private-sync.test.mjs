import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateSyncService } from '../src/services/privateSyncService.mjs';
import {
  buildSyncPayload,
  cloudNoteForLocal,
  noteRecordForCloud,
  parseSyncResponse,
  syncErrorMessage,
} from '../src/utils/private-sync.mjs';
import { parseReminderNote, serializeReminderNote } from '../src/utils/reminder-note.mjs';

const timestamp = '2026-08-24T10:00:00.000Z';

const localNote = (overrides = {}) => ({
  id: 'note-1',
  folder_id: null,
  title: 'Root note',
  content: 'Local content',
  note_type: 'note',
  password: 'sha256-hash',
  is_pinned: 1,
  is_deleted: 0,
  share_origin: 'private',
  created_at: timestamp,
  updated_at: timestamp,
  ...overrides,
});

test('builds active records and deletion tombstones without incoming shared notes', () => {
  const payload = buildSyncPayload(
    {
      records: [{
        id: 'folder-1', name: 'Work', password: null, is_pinned: 0,
        created_at: timestamp, updated_at: timestamp,
      }],
      tombstones: [{ id: 'folder-old', updated_at: timestamp }],
    },
    {
      records: [
        localNote(),
        localNote({ id: 'incoming-1', share_origin: 'incoming' }),
      ],
      tombstones: [{ id: 'note-old', updated_at: timestamp }],
    },
  );

  assert.deepEqual(payload.folders.map((item) => item.id), ['folder-1', 'folder-old']);
  assert.equal(payload.folders[1].is_deleted, true);
  assert.deepEqual(payload.notes.map((item) => item.id), ['note-1', 'note-old']);
  assert.equal(payload.notes[0].folder_id, null);
  assert.equal(payload.notes[0].password, 'sha256-hash');
});

test('deduplicates a stale active row and tombstone with deletion winning a tie', () => {
  const payload = buildSyncPayload(
    { records: [], tombstones: [] },
    {
      records: [localNote()],
      tombstones: [{ id: 'note-1', updated_at: timestamp }],
    },
  );
  assert.equal(payload.notes.length, 1);
  assert.equal(payload.notes[0].is_deleted, true);
});

test('keeps reminder notification registrations device-local', () => {
  const content = serializeReminderNote({
    body: 'Pay rent',
    reminder: {
      enabled: true,
      scheduledAt: '2026-09-01T01:00:00.000Z',
      repeat: 'monthly',
      notificationIds: ['native-id'],
    },
  });
  const cloud = noteRecordForCloud(localNote({ note_type: 'reminder', content }));
  const cloudReminder = parseReminderNote(cloud.content).reminder;
  assert.equal(cloudReminder.enabled, false);
  assert.deepEqual(cloudReminder.notificationIds, []);

  const restored = cloudNoteForLocal(cloud, localNote({ note_type: 'reminder', content }));
  const restoredReminder = parseReminderNote(restored.content).reminder;
  assert.equal(restoredReminder.enabled, true);
  assert.deepEqual(restoredReminder.notificationIds, ['native-id']);
});

test('rejects malformed server snapshots before local data is changed', () => {
  assert.throws(() => parseSyncResponse({ folders: [] }), /invalid response/i);
});

test('sync service pushes snapshots, then applies folders before notes', async () => {
  const events = [];
  const storageValues = new Map();
  let rpcPayload;
  const remoteNote = {
    ...noteRecordForCloud(localNote()),
    is_deleted: false,
  };
  const service = createPrivateSyncService({
    isConfigured: true,
    now: () => '2026-08-24T11:00:00.000Z',
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-1' } } },
          error: null,
        }),
      },
      rpc: async (name, payload) => {
        assert.equal(name, 'sync_private_data');
        rpcPayload = payload;
        return {
          data: {
            folders: [{
              id: 'folder-1', name: 'Work', password: null, is_pinned: false,
              is_deleted: false, created_at: timestamp, updated_at: timestamp,
            }],
            notes: [remoteNote],
          },
          error: null,
        };
      },
    },
    folderRepo: {
      getSyncSnapshot: async () => ({ records: [], tombstones: [] }),
      applySyncSnapshot: async (records, tombstones) => {
        events.push(['folders', records.length, tombstones.length]);
      },
    },
    noteRepo: {
      getSyncSnapshot: async () => ({ records: [localNote()], tombstones: [] }),
      getById: async () => localNote(),
      applySyncSnapshot: async (records, tombstones) => {
        events.push(['notes', records.length, tombstones.length]);
      },
    },
    storage: {
      getItem: async (key) => storageValues.get(key) || null,
      setItem: async (key, value) => { storageValues.set(key, value); },
    },
  });

  const result = await service.syncAll();
  assert.equal(rpcPayload.p_notes[0].id, 'note-1');
  assert.deepEqual(events, [['folders', 1, 0], ['notes', 1, 0]]);
  assert.deepEqual(result, {
    syncedAt: '2026-08-24T11:00:00.000Z',
    folders: 1,
    notes: 1,
    deleted: 0,
  });
  assert.equal(await service.getLastSyncAt('user-1'), result.syncedAt);
});

test('sync service requires configuration and a signed-in session', async () => {
  const service = createPrivateSyncService({
    isConfigured: false,
    supabase: {},
    folderRepo: {},
    noteRepo: {},
    storage: {},
  });
  await assert.rejects(service.syncAll(), /not configured/i);
});

test('sync failures use actionable copy without claiming encryption', () => {
  assert.match(
    syncErrorMessage({ code: 'PGRST202', message: 'sync_private_data was not found' }),
    /migration/i,
  );
  assert.match(syncErrorMessage(new Error('Failed to fetch')), /local notes are unchanged/i);
});
