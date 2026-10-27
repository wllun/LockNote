import test from 'node:test';
import assert from 'node:assert/strict';
import { createFolderSortPreferenceService, FOLDER_SORT_STORAGE_KEY, folderSortScope, getFolderMoveBounds, moveFolderInOrder, normalizeFolderSortPreferences, sortFolders } from '../src/utils/folder-sort.mjs';

const folder = (id, extra = {}) => ({ id, name: id, parent_id: null, is_pinned: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...extra });
const ids = (items) => items.map((item) => item.id);
const storage = () => {
  const values = new Map(); let fail = false;
  return { values, set fail(value) { fail = value; }, async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { if (fail) throw new Error('Storage unavailable'); values.set(key, value); } };
};

test('default folder sort preserves pinned-first newest-first presentation without mutating rows', () => {
  const items = [folder('old'), folder('new', { created_at: '2026-10-25T00:00:00Z' }), folder('pin', { is_pinned: 1 })];
  const before = structuredClone(items);
  assert.deepEqual(ids(sortFolders(items)), ['pin', 'new', 'old']);
  assert.deepEqual(items, before);
  assert.deepEqual(normalizeFolderSortPreferences(null), { version: 1, sortBy: 'created', direction: 'desc', pinnedFirst: true, orders: {} });
});

test('name sorting is case-insensitive and numeric with ascending/descending and independent pin policy', () => {
  const items = [folder('z', { name: 'Recipes 10', is_pinned: 1 }), folder('a', { name: 'recipes 2' }), folder('b', { name: 'APPLE' })];
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'name', direction: 'asc', pinnedFirst: false })), ['b', 'a', 'z']);
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'name', direction: 'desc', pinnedFirst: false })), ['z', 'a', 'b']);
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'name', direction: 'asc' })), ['z', 'b', 'a']);
});

test('created, updated and note-count sorting reverse correctly and safely handle missing metadata', () => {
  const items = [folder('a', { updated_at: '2026-10-24T00:00:00Z' }), folder('b', { created_at: '2026-10-25T00:00:00Z' }), folder('c', { created_at: 'invalid', updated_at: null })];
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'created', direction: 'asc' })), ['c', 'a', 'b']);
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'updated', direction: 'desc' })), ['a', 'b', 'c']);
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'count', direction: 'asc' }, { a: 8, b: 3 })), ['c', 'b', 'a']);
  assert.deepEqual(ids(sortFolders(items, { sortBy: 'count', direction: 'desc' }, { a: 8, b: 3 })), ['a', 'b', 'c']);
});

test('custom order is scoped to each parent and appends new folders without resurrecting missing IDs', () => {
  const preferences = { sortBy: 'custom', orders: { home: ['gone', 'b', 'a'], 'folder:parent': ['child2', 'child1'] } };
  const root = [folder('a'), folder('b'), folder('new')];
  const child = [folder('child1', { parent_id: 'parent' }), folder('child2', { parent_id: 'parent' })];
  assert.deepEqual(ids(sortFolders(root, preferences)), ['b', 'a', 'new']);
  assert.deepEqual(ids(sortFolders(child, preferences)), ['child2', 'child1']);
  assert.deepEqual(ids(sortFolders([...child, ...root], preferences)), ['b', 'a', 'new', 'child2', 'child1']);
  assert.notEqual(folderSortScope(null), folderSortScope('home'));
});

test('custom pin groups cannot cross while pinned-first is on and can freely move when it is off', () => {
  const items = [folder('pin1', { is_pinned: 1 }), folder('pin2', { is_pinned: 1 }), folder('a'), folder('b')];
  assert.deepEqual(getFolderMoveBounds(items, 1, true), { min: 0, max: 1 });
  assert.deepEqual(ids(moveFolderInOrder(items, 'b', 0, true)), ['pin1', 'pin2', 'b', 'a']);
  assert.deepEqual(ids(moveFolderInOrder(items, 'pin1', 20, true)), ['pin2', 'pin1', 'a', 'b']);
  assert.deepEqual(ids(moveFolderInOrder(items, 'b', 0, false)), ['b', 'pin1', 'pin2', 'a']);
  assert.equal(moveFolderInOrder(items, 'missing', 0), items);
  assert.equal(moveFolderInOrder(items, 'b', NaN), items);
});

test('malformed preference falls back, while duplicate/invalid order IDs are discarded', async () => {
  const store = storage(); store.values.set(FOLDER_SORT_STORAGE_KEY, '{broken');
  assert.equal((await createFolderSortPreferenceService(store).read()).sortBy, 'created');
  assert.deepEqual(normalizeFolderSortPreferences({ sortBy: 'invalid', orders: { home: ['a', 'a', null, 9, ''], unrelated: ['private'] } }).orders, { home: ['a'] });
});

test('saved preferences survive reopening and concurrent parent saves keep both orders', async () => {
  const store = storage(), service = createFolderSortPreferenceService(store), published = [];
  const unsubscribe = service.subscribe((value) => published.push(value));
  await Promise.all([
    service.save({ sortBy: 'custom' }, { parentId: null, ids: ['b', 'a'] }),
    service.save({ sortBy: 'custom' }, { parentId: 'parent', ids: ['child2', 'child1'] }),
  ]);
  const reopened = await createFolderSortPreferenceService(store).read();
  assert.deepEqual(reopened.orders, { home: ['b', 'a'], 'folder:parent': ['child2', 'child1'] });
  assert.equal(published.length, 2);
  unsubscribe(); await service.save({ sortBy: 'name', direction: 'asc' });
  assert.equal(published.length, 2);
  assert.equal((await service.read()).orders.home[0], 'b', 'automatic sorting does not erase a previous custom order');
  assert.deepEqual([...store.values.keys()], [FOLDER_SORT_STORAGE_KEY], 'no note, folder, auth or network storage keys are written');
});

test('storage failure is reported without publishing or losing the previous saved preference; retry works', async () => {
  const store = storage(), service = createFolderSortPreferenceService(store); let changed = 0;
  await service.save({ sortBy: 'name', direction: 'asc' });
  service.subscribe(() => { changed += 1; }); store.fail = true;
  await assert.rejects(service.save({ sortBy: 'custom' }, { parentId: null, ids: ['b', 'a'] }), /Storage unavailable/);
  assert.equal((await service.read()).sortBy, 'name'); assert.equal(changed, 0);
  store.fail = false; await service.save({ sortBy: 'custom' }, { parentId: null, ids: ['b', 'a'] });
  assert.equal(changed, 1); assert.equal((await service.read()).sortBy, 'custom');
});
