import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { normalizeCollaborationNote } from '../src/utils/collaboration-note.mjs';

const methodFrom = (file, repo, globals) => {
  const source = readFileSync(new URL(`../src/db/${file}`, import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module' });
  const declaration = ast.program.body.find((node) => node.type === 'ExportNamedDeclaration' && node.declaration?.declarations?.[0]?.id?.name === repo);
  const method = declaration.declaration.declarations[0].init.properties.find((node) => node.key.name === 'applySyncSnapshot');
  return vm.runInNewContext(`(async function(records = [], tombstones = [], options = {}) ${source.slice(method.body.start, method.body.end)})`, globals);
};
const records = ['one', 'two'].map((id) => ({ id, title: id, name: id, content: `${id} whole content`, updated_at: '2026-10-27T00:00:00Z', created_at: '2026-10-27T00:00:00Z' }));

test('actual native folder/note snapshot transactions roll back cancellation during apply instead of committing half a batch', async () => {
  for (const [file, repo] of [['folderRepo.js', 'folderRepo'], ['noteRepo.js', 'noteRepo']]) {
    let cancelled = false, committed = false, rolledBack = false, writes = 0;
    const apply = methodFrom(file, repo, { getDB: () => ({ withExclusiveTransactionAsync: async (callback) => {
      try {
        await callback({ runAsync: async () => { writes += 1; cancelled = true; } });
        committed = true;
      } catch (error) { rolledBack = true; throw error; }
    } }) });
    await assert.rejects(apply(records, [], { assertCurrent: () => { if (cancelled) throw new Error('Cancelled during apply'); } }), /Cancelled during apply/);
    assert.ok(writes > 0, 'exercise cancellation after the first SQL write');
    assert.equal(committed, false); assert.equal(rolledBack, true);
  }
});

test('actual web folder/note snapshot guards reject a stale batch before committing storage', async () => {
  for (const [file, repo] of [['folderRepo.web.js', 'folderRepo'], ['noteRepo.web.js', 'noteRepo']]) {
    const saved = [{ id: 'guest', title: 'Keep me', content: 'whole local content' }];
    let committed = false, guards = 0;
    const apply = methodFrom(file, repo, {
      normalizeNote: normalizeCollaborationNote,
      mutateStorage: async (callback) => { const draft = structuredClone(saved); await callback(draft, []); committed = true; },
    });
    await assert.rejects(apply(records, [], { assertCurrent: () => { if (++guards > 1) throw new Error('Stale account'); } }), /Stale account/);
    assert.equal(committed, false); assert.equal(saved.length, 1); assert.equal(saved[0].content, 'whole local content');
  }
});
