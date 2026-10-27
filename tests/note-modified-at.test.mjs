import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as collaboration from '../src/utils/collaboration-note.mjs';

const ORIGINAL_UPDATED_AT = '2026-01-02T03:04:05.000Z';
const ORIGINAL_EDITED_AT = '2026-01-01T02:03:04.000Z';

const loadModule = (path, name, globals) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(`export const ${name}`, `const ${name}`);
  return vm.runInNewContext(`${source}\n${name};`, globals);
};

const note = (overrides = {}) => ({
  id: 'note-1',
  folder_id: null,
  title: 'Original title',
  content: 'Original content',
  note_type: 'note',
  password: null,
  is_deleted: 0,
  is_pinned: 0,
  is_archived: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: ORIGINAL_UPDATED_AT,
  last_edited_at: ORIGINAL_EDITED_AT,
  share_origin: 'private',
  ...overrides,
});

const setup = (records = [note()]) => {
  const storage = new Map([
    ['@locknote_notes', JSON.stringify(records)],
    ['@locknote_note_sync_tombstones', '[]'],
  ]);
  const noteRepo = loadModule('../src/db/noteRepo.web.js', 'noteRepo', {
    ...collaboration,
    getVisibleFolders: () => [],
    noteEditingAccessService: { requireFolder: async () => {} },
    hashPassword: async (value) => `hash:${value}`,
    AsyncStorage: {
      getItem: async (key) => storage.get(key) ?? null,
      multiSet: async (entries) => entries.forEach(([key, value]) => storage.set(key, value)),
    },
  });
  return { noteRepo, storage };
};

test('pinning and locking advance the sync clock without changing last edited', async () => {
  const { noteRepo } = setup();

  const pinned = await noteRepo.update(
    'note-1',
    { is_pinned: true },
    { preserveModifiedAt: true },
  );
  assert.equal(pinned.last_edited_at, ORIGINAL_EDITED_AT);
  assert.notEqual(pinned.updated_at, ORIGINAL_UPDATED_AT);

  const locked = await noteRepo.update(
    'note-1',
    { password: 'secret' },
    { preserveModifiedAt: true },
  );
  assert.equal(locked.password, 'hash:secret');
  assert.equal(locked.last_edited_at, ORIGINAL_EDITED_AT);

  const unlocked = await noteRepo.update(
    'note-1',
    { password: null },
    { preserveModifiedAt: true },
  );
  assert.equal(unlocked.password, null);
  assert.equal(unlocked.last_edited_at, ORIGINAL_EDITED_AT);
});

test('metadata updates backfill legacy notes before advancing the sync clock', async () => {
  const { noteRepo } = setup([note({ last_edited_at: null })]);
  const result = await noteRepo.update(
    'note-1',
    { collaborator_count: 2 },
    { preserveModifiedAt: true },
  );

  assert.equal(result.last_edited_at, ORIGINAL_UPDATED_AT);
  assert.notEqual(result.updated_at, ORIGINAL_UPDATED_AT);
});

test('content edits update last edited and later metadata changes preserve it', async () => {
  const { noteRepo } = setup();
  const edited = await noteRepo.update('note-1', { content: 'Changed content' });

  assert.equal(edited.last_edited_at, edited.updated_at);
  assert.notEqual(edited.last_edited_at, ORIGINAL_EDITED_AT);

  const shared = await noteRepo.update(
    'note-1',
    { share_origin: 'owned', collaborator_count: 1 },
    { preserveModifiedAt: true },
  );
  assert.equal(shared.last_edited_at, edited.last_edited_at);
});

test('global password hash replacement preserves the visible modified date', async () => {
  const { noteRepo } = setup([
    note({ password: 'old-hash' }),
    note({ id: 'legacy', password: 'old-hash', last_edited_at: null }),
  ]);

  assert.equal(await noteRepo.replaceLockedPasswordHash('new-hash', 'old-hash'), 2);
  assert.equal((await noteRepo.getById('note-1')).last_edited_at, ORIGINAL_EDITED_AT);
  assert.equal((await noteRepo.getById('legacy')).last_edited_at, ORIGINAL_UPDATED_AT);
});

test('note lists sort by content edit time instead of metadata sync time', async () => {
  const { noteRepo } = setup([
    note({ id: 'metadata-newer', updated_at: '2026-09-01T00:00:00.000Z', last_edited_at: '2026-01-01T00:00:00.000Z' }),
    note({ id: 'content-newer', updated_at: '2026-02-01T00:00:00.000Z', last_edited_at: '2026-01-15T00:00:00.000Z' }),
  ]);

  assert.equal(
    (await noteRepo.getRootNotes()).map((item) => item.id).join(','),
    'content-newer,metadata-newer',
  );
});

test('all note pin, lock and sharing entry points preserve last edited', () => {
  const screenNames = [
    'HomeScreen.js',
    'FolderScreen.js',
    'ArchiveScreen.js',
    'NoteEditorScreen.js',
    'ChecklistEditorScreen.js',
    'ExpenseRecordEditorScreen.js',
    'ReminderEditorScreen.js',
  ];
  const screenSource = screenNames
    .map((name) => readFileSync(new URL(`../src/screens/${name}`, import.meta.url), 'utf8'))
    .join('\n');
  const lockSource = readFileSync(new URL('../src/services/lockPasswordService.js', import.meta.url), 'utf8');
  const shareSource = readFileSync(new URL('../src/services/collaborationService.js', import.meta.url), 'utf8');

  assert.doesNotMatch(`${screenSource}\n${lockSource}\n${shareSource}`, /preserveUpdatedAt/);
  assert.equal((screenSource.match(/preserveModifiedAt: true/g) || []).length, 13);
  assert.match(lockSource, /noteRepo\.update\(noteId, \{ password \}, \{ preserveModifiedAt: true \}\)/);
  assert.equal((shareSource.match(/preserveModifiedAt: true/g) || []).length, 3);
});

test('color, background and export actions do not write note records', () => {
  for (const path of [
    '../src/utils/note-color-preference.js',
    '../src/utils/note-background-preference.js',
    '../src/components/NoteExportModal.js',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /noteRepo\.update\s*\(/, path);
  }
});
