import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createFullBackupService } from '../src/services/fullBackupService.mjs';
import { backupTextEntry, createTarHeader, encodeBackupText, writeBackupTar } from '../src/utils/backup-tar.mjs';
import { parseBackupText } from '../src/utils/backup-data.mjs';

// Independent TAR reader verifies entry boundaries, lengths and header checksums.
const readTar = (buffer) => {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = header.subarray(0, 100).toString('ascii').split('\0')[0];
    const size = parseInt(header.subarray(124, 136).toString('ascii').split('\0')[0], 8);
    const checksum = parseInt(header.subarray(148, 156).toString('ascii').trim().split('\0')[0], 8);
    assert.equal(header.reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0), checksum);
    entries.set(name, buffer.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
};

test('streamed TAR is readable by the OS tar tool and preserves Unicode, zero bytes and boundary padding', async () => {
  const chunks = [];
  await writeBackupTar([
    backupTextEntry('backup.json', 'Recipe 中文 🥚\n'),
    { name: 'attachments/000001.jpg', size: 513, chunks: () => [new Uint8Array(256), new Uint8Array(257).fill(255)] },
    backupTextEntry('empty.txt', ''),
  ], (chunk) => chunks.push(Buffer.from(chunk)), new Date('2026-10-26T00:00:00Z'));
  const archive = Buffer.concat(chunks);
  const entries = readTar(archive);
  assert.equal(entries.get('backup.json').toString('utf8'), 'Recipe 中文 🥚\n');
  assert.equal(entries.get('attachments/000001.jpg').length, 513);
  assert.equal(entries.get('attachments/000001.jpg')[256], 255);
  assert.equal(entries.get('empty.txt').length, 0);
  assert.equal(archive.length % 512, 0);
  assert.deepEqual(Buffer.from(encodeBackupText('中文 🥚')), Buffer.from('中文 🥚'));
  const directory = mkdtempSync(join(tmpdir(), 'locknote-tar-test-'));
  const path = join(directory, 'fixture.tar');
  try {
    writeFileSync(path, archive);
    const result = spawnSync('tar', ['-tf', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /backup.json/);
    assert.match(result.stdout, /attachments\/000001.jpg/);
  } finally { unlinkSync(path); rmdirSync(directory); }
});

test('TAR refuses path traversal and fails instead of finishing an incomplete or growing file', async () => {
  assert.throws(() => createTarHeader('../secret', 10), /Invalid/);
  assert.throws(() => createTarHeader('/absolute', 10), /Invalid/);
  for (const actual of [1, 3]) {
    await assert.rejects(writeBackupTar([{ name: 'image.jpg', size: 2, chunks: () => [new Uint8Array(actual)] }], () => {}), /changed|completely read/);
  }
});

const setup = ({ missingImage = false, writeFailure = false } = {}) => {
  let archive, held = false;
  const stamp = '2026-10-26T00:00:00.000Z';
  const note = (id, extra = {}) => ({ id, folder_id: null, title: id, content: 'Important 中文 notes', note_type: 'note', password: 'a'.repeat(64), is_pinned: 1, is_archived: 0, created_at: stamp, updated_at: stamp, ...extra });
  const snapshots = { records: [note('mine'), note('shared', { share_origin: 'incoming', cloud_id: 'not-exportable' })], tombstones: [{ id: 'trash', updated_at: stamp }] };
  const folders = { records: [], tombstones: [{ id: 'deleted-folder', updated_at: stamp }] };
  const preferences = {
    '@locknote_theme': 'dark', '@locknote_note_colors': JSON.stringify({ mine: 'blue', shared: 'red' }),
    '@locknote_shared_note_password_v1': JSON.stringify({ passwordHash: 'a'.repeat(64), recoveryUserId: 'private-account', recoveryEmail: 'private@example.com' }),
    'sb-project-auth-token': 'SECRET_SESSION', '@locknote_automatic_sync:account': 'true',
  };
  const backgroundIds = [], keysRead = [];
  const attachments = [
    { id: 'photo', note_id: 'mine', local_uri: 'file:///photo', width: 600, height: 400, anchor_offset: 12, display_width_ratio: 0.5, cloud_path: 'private/cloud/path' },
    { id: 'trash-photo', note_id: 'trash', local_uri: 'file:///trash-photo' },
    { id: 'shared-photo', note_id: 'shared', local_uri: 'file:///shared-photo' },
    { id: 'orphan', note_id: 'unknown', local_uri: 'file:///orphan' },
  ];
  const service = createFullBackupService({
    folderRepo: { getSyncSnapshot: async () => { assert.equal(held, true); return folders; } },
    noteRepo: { getSyncSnapshot: async () => snapshots, getDeleted: async () => { throw new Error('Trash must not be read'); } },
    attachmentRepo: { listAll: async () => attachments },
    backgrounds: { exportAsset: async (id) => { backgroundIds.push(id); return id === 'mine' ? { uri: 'file:///background.png', name: 'background.png' } : null; } },
    storage: { getItem: async (key) => { keysRead.push(key); return preferences[key] ?? null; } },
    runExclusive: async (operation) => { held = true; try { return await operation(); } finally { held = false; } },
    archiveAdapter: {
      readAsset: async (asset) => {
        if (missingImage && asset.uri === 'file:///photo') throw new Error('Missing image');
        const bytes = new Uint8Array([0, 1, 255]);
        return { size: bytes.length, mimeType: asset.name?.endsWith('png') ? 'image/png' : 'image/jpeg', chunks: () => [bytes] };
      },
      saveArchive: async (entries, filename, date) => {
        assert.equal(held, true);
        if (writeFailure) throw new Error('Storage full');
        const chunks = [];
        await writeBackupTar(entries, (chunk) => chunks.push(Buffer.from(chunk)), date);
        archive = readTar(Buffer.concat(chunks));
        return { destination: 'download' };
      },
    },
    now: () => new Date(stamp), appVersion: '1.1.0',
  });
  return { service, backgroundIds, keysRead, snapshots, folders, attachments, preferences, note, stamp, get archive() { return archive; }, get held() { return held; } };
};

test('full archive contains active owned notes, locks, images, backgrounds and safe preferences without Trash', async () => {
  const app = setup();
  const result = await app.service.exportFullBackup();
  assert.equal(result.noteCount, 1);
  assert.equal(result.mediaCount, 2);
  assert.equal(result.missingFileCount, 0);
  assert.match(result.filename, /^locknote-full-backup-.*\.tar$/);
  const document = parseBackupText(app.archive.get('backup.json').toString('utf8')).backup;
  assert.equal(document.notes.records[0].is_archived, 0);
  assert.equal(document.notes.records[0].password, 'a'.repeat(64));
  assert.equal(document.notes.records[0].content, 'Important 中文 notes');
  assert.equal(app.archive.has('trash.json'), false);
  assert.deepEqual(document.notes.tombstones, []);
  assert.deepEqual(document.folders.tombstones, []);
  const manifest = JSON.parse(app.archive.get('manifest.json').toString());
  assert.equal(manifest.complete, true);
  assert.equal(manifest.scope, 'active-personal-data');
  assert.equal(manifest.trash_file, undefined);
  assert.equal(manifest.media[0].anchor_offset, 12);
  assert.equal(manifest.media[0].display_width_ratio, 0.5);
  assert.ok(manifest.media.every((entry) => app.archive.has(entry.path)));
  assert.deepEqual(app.backgroundIds, ['mine']);
  const allText = [...app.archive.values()].map((bytes) => bytes.toString('utf8')).join('\n');
  for (const secret of ['SECRET_SESSION', 'private-account', 'private@example.com', 'not-exportable', 'private/cloud/path', 'shared-photo', 'shared-trash']) assert.ok(!allText.includes(secret));
  assert.ok(!app.keysRead.includes('sb-project-auth-token'));
  const settings = JSON.parse(app.archive.get('preferences.json').toString());
  assert.deepEqual(JSON.parse(settings['@locknote_note_colors']), { mine: 'blue' });
  assert.equal(app.held, false);
});

test('archive excludes archived/deleted folder subtrees, notes, media and note-specific preferences', async () => {
  const app = setup();
  const folder = (id, extra = {}) => ({ id, name: id, parent_id: null, password: null, is_pinned: 0, is_archived: 0, created_at: app.stamp, updated_at: app.stamp, ...extra });
  app.folders.records.push(
    folder('active'), folder('active-child', { parent_id: 'active' }),
    folder('archived', { is_archived: 1 }), folder('archived-child', { parent_id: 'archived' }),
    folder('deleted', { is_deleted: 1 }), folder('deleted-child', { parent_id: 'deleted' }),
    folder('orphan-folder', { parent_id: 'missing' }),
  );
  const excluded = [
    app.note('archived-root-note', { is_archived: 1 }),
    app.note('archived-folder-note', { folder_id: 'archived' }),
    app.note('archived-child-note', { folder_id: 'archived-child' }),
    app.note('deleted-root-note', { is_deleted: 1 }),
    app.note('deleted-folder-note', { folder_id: 'deleted-child' }),
    app.note('orphan-note', { folder_id: 'missing' }),
    app.note('archived-active-folder-note', { folder_id: 'active', is_archived: 1 }),
  ];
  app.snapshots.records.push(app.note('active-child-note', { folder_id: 'active-child' }), ...excluded);
  for (const note of excluded) app.attachments.push({ id: `${note.id}-photo`, note_id: note.id, local_uri: `file:///${note.id}` });
  app.preferences['@locknote_note_colors'] = JSON.stringify(Object.fromEntries(['mine', 'active-child-note', ...excluded.map((note) => note.id)].map((id) => [id, 'blue'])));
  const result = await app.service.exportFullBackup();
  const document = parseBackupText(app.archive.get('backup.json').toString()).backup;
  assert.equal(result.folderCount, 2);
  assert.equal(result.noteCount, 2);
  assert.equal(result.mediaCount, 2);
  assert.equal(result.missingFileCount, 0);
  assert.deepEqual(document.folders.records.map((folder) => folder.id), ['active', 'active-child']);
  assert.deepEqual(document.notes.records.map((note) => note.id), ['mine', 'active-child-note']);
  assert.equal(document.notes.records[0].folder_id, null);
  assert.equal(document.notes.records[1].folder_id, 'active-child');
  assert.deepEqual(app.backgroundIds, ['mine', 'active-child-note']);
  const preferences = JSON.parse(app.archive.get('preferences.json').toString());
  assert.deepEqual(JSON.parse(preferences['@locknote_note_colors']), { mine: 'blue', 'active-child-note': 'blue' });
  const manifest = JSON.parse(app.archive.get('manifest.json').toString());
  assert.ok(manifest.media.every((entry) => entry.note_id === 'mine'));
  // Export is read-only: excluded source records and files remain untouched.
  assert.ok(app.snapshots.records.includes(excluded[0]));
  assert.ok(app.attachments.some((item) => item.note_id === excluded[0].id));
});

test('missing images produce an explicit incomplete manifest without losing the notes backup', async () => {
  const app = setup({ missingImage: true });
  const result = await app.service.exportFullBackup();
  assert.equal(result.missingFileCount, 1);
  const manifest = JSON.parse(app.archive.get('manifest.json').toString());
  assert.equal(manifest.complete, false);
  assert.equal(manifest.missing[0].id, 'photo');
  assert.ok(app.archive.has('backup.json'));
});

test('export failure propagates and releases the exclusive snapshot without modifying source data', async () => {
  const app = setup({ writeFailure: true });
  await assert.rejects(app.service.exportFullBackup(), /Storage full/);
  assert.equal(app.held, false);
  assert.equal(app.archive, undefined);
});
