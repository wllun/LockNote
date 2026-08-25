import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupDocument,
  parseBackupText,
  serializeBackupDocument,
  validateBackupDocument,
} from '../src/utils/backup-data.mjs';
import { createBackupService } from '../src/services/backupService.mjs';

const HASH = 'a'.repeat(64);
const CREATED = '2026-08-01T10:00:00.000Z';
const UPDATED = '2026-08-02T10:00:00.000Z';

const folder = (overrides = {}) => ({
  id: 'folder-1',
  name: 'Work',
  password: HASH,
  is_pinned: 1,
  created_at: CREATED,
  updated_at: UPDATED,
  ...overrides,
});

const note = (overrides = {}) => ({
  id: 'note-1',
  folder_id: null,
  title: 'Root note',
  content: 'Hello',
  note_type: 'note',
  password: HASH,
  is_pinned: 0,
  created_at: CREATED,
  updated_at: UPDATED,
  share_origin: 'private',
  cloud_id: 'cloud-value-that-must-not-export',
  ...overrides,
});

const makeDocument = (overrides = {}) => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exported_at: UPDATED,
  app: { name: 'LockNote', version: '1.0.0' },
  folders: { records: [folder()], tombstones: [] },
  notes: { records: [note({ folder_id: 'folder-1' })], tombstones: [] },
  ...overrides,
});

test('creates a portable backup without collaboration metadata or incoming notes', () => {
  const document = createBackupDocument(
    { records: [folder()], tombstones: [{ id: 'old-folder', updated_at: UPDATED }] },
    {
      records: [
        note({ color: 'blue' }),
        note({ id: 'incoming', share_origin: 'incoming', cloud_id: 'shared-cloud-id' }),
      ],
      tombstones: [{ id: 'old-note', updated_at: UPDATED }],
    },
    { exportedAt: UPDATED, appVersion: '1.0.0' }
  );

  assert.equal(document.notes.records.length, 1);
  assert.equal(document.notes.records[0].folder_id, null);
  assert.equal(document.notes.records[0].password, HASH);
  assert.equal('cloud_id' in document.notes.records[0], false);
  assert.equal('color' in document.notes.records[0], false);
  assert.deepEqual(document.notes.tombstones, [{ id: 'old-note', updated_at: UPDATED }]);
});

test('disables device-local reminder schedules in exported and imported data', () => {
  const reminderContent = JSON.stringify({
    version: 1,
    body: 'Pay bill',
    reminder: {
      enabled: true,
      scheduledAt: UPDATED,
      repeat: 'monthly',
      notificationIds: ['device-notification-id'],
    },
  });
  const document = createBackupDocument(
    { records: [], tombstones: [] },
    { records: [note({ note_type: 'reminder', content: reminderContent })], tombstones: [] },
    { exportedAt: UPDATED }
  );
  const parsed = parseBackupText(serializeBackupDocument(document));
  const restored = JSON.parse(parsed.backup.notes.records[0].content);

  assert.equal(restored.body, 'Pay bill');
  assert.equal(restored.reminder.enabled, false);
  assert.deepEqual(restored.reminder.notificationIds, []);
});

test('validates a backup and resets restored notes to private collaboration state', () => {
  const result = validateBackupDocument(makeDocument());
  const restored = result.backup.notes.records[0];

  assert.equal(result.summary.folderCount, 1);
  assert.equal(result.summary.noteCount, 1);
  assert.equal(restored.share_origin, 'private');
  assert.equal(restored.cloud_id, null);
  assert.equal(restored.folder_id, 'folder-1');
});

test('rejects unsupported versions, plaintext passwords, duplicates, and orphan notes', () => {
  assert.throws(
    () => validateBackupDocument(makeDocument({ version: 99 })),
    /schema version 99 is not supported/
  );
  assert.throws(
    () => validateBackupDocument(makeDocument({
      folders: { records: [folder({ password: 'secret' })], tombstones: [] },
    })),
    /never a plaintext password/
  );
  assert.throws(
    () => validateBackupDocument(makeDocument({
      folders: { records: [folder(), folder()], tombstones: [] },
    })),
    /duplicate id folder-1/
  );
  assert.throws(
    () => validateBackupDocument(makeDocument({
      folders: { records: [], tombstones: [] },
    })),
    /refers to a folder that is not in this backup/
  );
});

test('rejects malformed JSON and unknown file formats before repository writes', () => {
  assert.throws(() => parseBackupText('{not json'), /not valid JSON/);
  assert.throws(
    () => parseBackupText(JSON.stringify({ ...makeDocument(), format: 'another-app' })),
    /file format is not recognized/
  );
});

test('backup service exports snapshots and a versioned JSON file', async () => {
  let saved;
  const service = createBackupService({
    folderRepo: { getSyncSnapshot: async () => ({ records: [folder()], tombstones: [] }) },
    noteRepo: { getSyncSnapshot: async () => ({ records: [note()], tombstones: [] }) },
    fileAdapter: {
      saveBackupFile: async (text, filename) => { saved = { text, filename }; },
    },
    appVersion: '1.2.3',
    now: () => new Date(UPDATED),
  });

  const result = await service.exportBackup();
  const document = JSON.parse(saved.text);
  assert.equal(result.folderCount, 1);
  assert.equal(result.noteCount, 1);
  assert.match(saved.filename, /^locknote-backup-.*\.json$/);
  assert.equal(document.version, BACKUP_VERSION);
  assert.equal(document.app.version, '1.2.3');
});

test('backup service previews a selected file and treats picker cancellation as a no-op', async () => {
  const validText = JSON.stringify(makeDocument());
  const selectedService = createBackupService({
    folderRepo: {},
    noteRepo: {},
    fileAdapter: {
      pickBackupFile: async () => ({ name: 'backup.json', size: validText.length, text: validText }),
    },
  });
  const canceledService = createBackupService({
    folderRepo: {},
    noteRepo: {},
    fileAdapter: { pickBackupFile: async () => null },
  });

  const selected = await selectedService.pickBackup();
  assert.equal(selected.filename, 'backup.json');
  assert.equal(selected.summary.noteCount, 1);
  assert.equal(await canceledService.pickBackup(), null);
});

test('backup service restores folders before notes in merge and replace modes', async () => {
  const calls = [];
  const folderRepo = {
    applySyncSnapshot: async () => calls.push('merge-folders'),
    replaceBackupSnapshot: async () => calls.push('replace-folders'),
  };
  const noteRepo = {
    applySyncSnapshot: async () => calls.push('merge-notes'),
    replaceBackupSnapshot: async () => calls.push('replace-notes'),
  };
  const service = createBackupService({ folderRepo, noteRepo, fileAdapter: {} });
  const document = makeDocument();

  await service.restoreBackup(document, 'merge');
  await service.restoreBackup(document, 'replace');
  assert.deepEqual(calls, [
    'merge-folders',
    'merge-notes',
    'replace-folders',
    'replace-notes',
  ]);
});
