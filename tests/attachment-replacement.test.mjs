import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { normalizeAttachment } from '../src/utils/note-attachment.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const oldPhoto = () => ({ id: 'old', note_id: 'recipe', local_uri: 'file:///documents/note-attachments/recipe/old.jpg',
  mime_type: 'image/jpeg', width: 400, height: 300, byte_size: 100, cloud_path: 'owner/old.jpg', display_order: 0,
  anchor_offset: 0, display_width_ratio: 1, created_at: '2026-10-25T00:00:00Z' });
const newPhoto = { uri: 'file:///cache/new.jpg', width: 800, height: 600, byte_size: 250, mime_type: 'image/jpeg' };

const nativeHarness = (failure = '') => {
  const original = oldPhoto();
  const rows = new Map([['old', original]]);
  const files = new Map([[original.local_uri, 'old bytes'], [newPhoto.uri, 'new bytes']]);
  class Directory {
    constructor(base, name) { this.uri = `${typeof base === 'string' ? base : base.uri}${name}/`; }
    create() {}
  }
  class File {
    constructor(base, name) { this.uri = name ? `${base.uri}${name}` : base; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length || 0; }
    copy(destination) { files.set(destination.uri, files.get(this.uri)); if (failure === 'copy') throw new Error('Copy failed'); }
    delete() { files.delete(this.uri); }
  }
  const source = read('src/db/attachmentRepo.js').replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export const attachmentRepo', 'const attachmentRepo');
  const repo = vm.runInNewContext(`${source}\nattachmentRepo;`, {
    Directory, File, Paths: { document: 'file:///documents/' }, createAttachmentId: () => 'new', normalizeAttachment,
    getDB: () => ({
      getFirstAsync: async (_, [id]) => rows.get(id),
      runAsync: async (_, values) => {
        if (failure === 'database') throw new Error('Database write failed');
        const [id, local_uri, mime_type, width, height, byte_size, updated_at, previousId, noteId] = values;
        if (failure === 'missing' || rows.get(previousId)?.note_id !== noteId) return { changes: 0 };
        const updated = { ...rows.get(previousId), id, local_uri, mime_type, width, height, byte_size, updated_at, cloud_path: null, sync_status: 'pending' };
        rows.delete(previousId); rows.set(id, updated);
        return { changes: 1 };
      },
    }),
  });
  return { repo, rows, files, original };
};

test('native replacement keeps the original row and file on copy or SQLite failure', async () => {
  for (const failure of ['copy', 'database', 'missing']) {
    const app = nativeHarness(failure);
    await assert.rejects(app.repo.replace('recipe', 'old', newPhoto));
    assert.equal(app.rows.size, 1);
    assert.equal(app.rows.get('old'), app.original);
    assert.equal(app.files.get(app.original.local_uri), 'old bytes');
    assert.equal([...app.files.keys()].some((uri) => uri.endsWith('/new.jpg') && uri.includes('note-attachments')), false);
  }
});

test('native replacement uses a new image identity and deletes old bytes only after commit', async () => {
  const app = nativeHarness();
  const result = await app.repo.replace('recipe', 'old', newPhoto);
  assert.equal(result.id, 'new');
  assert.equal(result.cloud_path, null);
  assert.equal(result.width, 800);
  assert.equal(app.rows.size, 1);
  assert.equal(app.files.get(result.local_uri), 'new bytes');
  assert.equal(app.files.has(app.original.local_uri), false);
  const other = nativeHarness();
  await assert.rejects(other.repo.replace('other-note', 'old', newPhoto));
  assert.equal(other.files.has(other.original.local_uri), true);
});

// Execute the real web method with an IndexedDB-style atomic transaction boundary.
const webHarness = (fail = false) => {
  const original = { ...oldPhoto(), blob: 'old bytes' };
  let records = new Map([['old', original]]);
  const revoked = [];
  const source = read('src/db/attachmentRepo.web.js');
  const ast = parse(source, { sourceType: 'module' });
  const declaration = ast.program.body.find((node) => node.type === 'ExportNamedDeclaration' && node.declaration?.declarations?.[0]?.id?.name === 'attachmentRepo');
  const method = declaration.declaration.declarations[0].init.properties.find((node) => node.key.name === 'replace');
  const replace = vm.runInNewContext(`(async function(${method.params.map((node) => source.slice(node.start, node.end)).join(',')}) ${source.slice(method.body.start, method.body.end)})`, {
    fetch: async () => ({ ok: true, blob: async () => ({ type: 'image/jpeg', size: 250, bytes: 'new bytes' }) }),
    mutate: async (operation) => operation(), getRecord: async (id) => records.get(id), createAttachmentId: () => 'new',
    revokeUrl: (id) => revoked.push(id), presentRecord: (record) => record,
    runTransaction: async (_, operation) => {
      const next = new Map(records);
      operation({ delete: (id) => next.delete(id), put: (record) => { if (fail) throw new Error('Storage full'); next.set(record.id, record); } });
      records = next;
    },
  });
  return { replace, original, revoked, get records() { return records; } };
};

test('web replacement preserves the original Blob/URL on storage failure and swaps it on success', async () => {
  const failed = webHarness(true);
  await assert.rejects(failed.replace('recipe', 'old', newPhoto));
  assert.equal(failed.records.size, 1);
  assert.equal(failed.records.get('old'), failed.original);
  assert.deepEqual(failed.revoked, []);
  const success = webHarness();
  const result = await success.replace('recipe', 'old', newPhoto);
  assert.equal(result.id, 'new');
  assert.equal(result.cloud_path, null);
  assert.equal(result.blob.bytes, 'new bytes');
  assert.equal(success.records.size, 1);
  assert.deepEqual(success.revoked, ['old']);
});

test('real IndexedDB transaction helper aborts when put throws after delete', async () => {
  const source = read('src/db/attachmentRepo.web.js');
  const fn = source.slice(source.indexOf('const runTransaction = '), source.indexOf('const getAllRecords = '));
  let aborted = false;
  const run = vm.runInNewContext(`${fn}\nrunTransaction;`, {
    STORE_NAME: 'note-attachments',
    openDatabase: async () => ({ transaction: () => ({
      objectStore: () => ({ delete: () => {}, put: () => { throw new Error('DataCloneError'); } }),
      abort: () => { aborted = true; },
    }) }),
  });
  await assert.rejects(run('readwrite', (store) => { store.delete('old'); store.put({}); }), /DataCloneError/);
  assert.equal(aborted, true);
});
