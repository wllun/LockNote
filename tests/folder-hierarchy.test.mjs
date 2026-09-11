import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFolderMoveDestinations,
  flattenFolderHierarchy,
  getFolderDescendantIds,
  getFolderHierarchyIssue,
  getFolderMoveError,
  getFolderPath,
  getVisibleSubtreeFolderIds,
  MAX_FOLDER_DEPTH,
} from '../src/utils/folder-hierarchy.mjs';

const folder = (id, parentId = null, overrides = {}) => ({
  id,
  parent_id: parentId,
  name: id,
  is_deleted: 0,
  is_archived: 0,
  is_pinned: 0,
  created_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

test('flattens visible folders in tree order with paths and depths', () => {
  const folders = [folder('child', 'root'), folder('root'), folder('grandchild', 'child')];
  const result = flattenFolderHierarchy(folders);
  assert.deepEqual(result.map((item) => [item.id, item.depth, item.path]), [
    ['root', 0, 'root'],
    ['child', 1, 'root / child'],
    ['grandchild', 2, 'root / child / grandchild'],
  ]);
  assert.deepEqual(getFolderPath(folders, 'grandchild').map((item) => item.id), ['root', 'child', 'grandchild']);
});

test('hides every descendant of an archived folder', () => {
  const folders = [folder('root', null, { is_archived: 1 }), folder('child', 'root')];
  assert.deepEqual(flattenFolderHierarchy(folders), []);
});

test('counts visible descendants relative to an archived subtree root', () => {
  const folders = [
    folder('root', null, { is_archived: 1 }),
    folder('visible', 'root'),
    folder('archived', 'root', { is_archived: 1 }),
    folder('hidden', 'archived'),
  ];
  assert.deepEqual(getVisibleSubtreeFolderIds(folders, 'root'), ['root', 'visible']);
});

test('finds a complete folder subtree and prevents circular moves', () => {
  const folders = [folder('root'), folder('child', 'root'), folder('grandchild', 'child')];
  assert.deepEqual(getFolderDescendantIds(folders, 'root'), ['root', 'child', 'grandchild']);
  assert.match(getFolderMoveError(folders, 'root', 'grandchild'), /subfolders/);
  assert.match(getFolderMoveError(folders, 'root', 'root'), /itself/);
});

test('allows only one subfolder level when moving a folder subtree', () => {
  const folders = [
    folder('top'), folder('child', 'top'), folder('branch'), folder('leaf', 'branch'),
  ];
  assert.equal(MAX_FOLDER_DEPTH, 2);
  assert.match(getFolderMoveError(folders, 'branch', 'top'), /more than one subfolder level/);
  assert.equal(getFolderMoveError(folders, 'leaf', 'top'), null);
  assert.equal(getFolderMoveError(folders, 'branch', null), null);
  const destination = buildFolderMoveDestinations(folders, 'branch').find((item) => item.id === 'top');
  assert.ok(destination.disabledReason);
});

test('detects orphaned, circular, and over-depth folder data', () => {
  assert.match(getFolderHierarchyIssue([folder('child', 'missing')]), /does not exist/);
  assert.match(getFolderHierarchyIssue([folder('a', 'b'), folder('b', 'a')]), /circular/);
  const deep = Array.from({ length: 3 }, (_, index) => folder(String(index + 1), index ? String(index) : null));
  assert.match(getFolderHierarchyIssue(deep), /deeper/);
});
