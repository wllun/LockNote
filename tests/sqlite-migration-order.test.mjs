import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqliteSource = fs.readFileSync(
  new URL('../src/db/sqlite.js', import.meta.url),
  'utf8'
);

test('adds the nested-folder column before creating its index', () => {
  const initialSchemaStart = sqliteSource.indexOf('await db.execAsync(`');
  const initialSchemaEnd = sqliteSource.indexOf('`);', initialSchemaStart);
  const initialSchema = sqliteSource.slice(initialSchemaStart, initialSchemaEnd);
  const addParentColumnAt = sqliteSource.indexOf('ALTER TABLE folders ADD COLUMN parent_id TEXT');
  const createParentIndexAt = sqliteSource.indexOf(
    'CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)',
    initialSchemaEnd
  );

  assert.doesNotMatch(initialSchema, /idx_folders_parent_id/);
  assert.ok(addParentColumnAt > initialSchemaEnd);
  assert.ok(createParentIndexAt > addParentColumnAt);
});
