import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import * as policy from '../src/utils/subfolder-edit-access.mjs';
import * as collaboration from '../src/utils/collaboration-note.mjs';
import * as expenses from '../src/utils/expense-record.mjs';
import { getEditorExitDisposition } from '../src/utils/editor-exit-disposition.mjs';

const loadModule = (path, name, globals) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(`export const ${name}`, `const ${name}`);
  return vm.runInNewContext(`${source}\n${name};`, globals);
};

const setup = (initialPlan = 'free') => {
  let plan = initialPlan;
  const folders = [
    { id: 'parent', parent_id: null, name: 'Parent', is_deleted: 0 },
    { id: 'child', parent_id: 'parent', name: 'Child', is_deleted: 0 },
    { id: 'deleted-child', parent_id: 'parent', is_deleted: 1 },
  ];
  const folderRepo = { getById: async (id) => folders.find((folder) => folder.id === id && !folder.is_deleted) || null };
  const premiumAccessService = {
    getPlan: () => plan,
    require: async () => {
      if (plan !== 'pro') throw Object.assign(new Error('Pro required'), { code: 'PREMIUM_REQUIRED' });
    },
  };
  const noteEditingAccessService = loadModule('../src/services/noteEditingAccessService.js', 'noteEditingAccessService', {
    ...policy, folderRepo, premiumAccessService,
  });
  const storage = new Map();
  storage.set('@locknote_notes', JSON.stringify([
    { id: 'nested', folder_id: 'child', title: 'Original', content: 'Body', note_type: 'note', share_origin: 'private', is_deleted: 0 },
    { id: 'root', folder_id: null, title: 'Root', content: 'Root body', note_type: 'note', share_origin: 'private', is_deleted: 0 },
  ]));
  const noteRepo = loadModule('../src/db/noteRepo.web.js', 'noteRepo', {
    ...collaboration,
    noteEditingAccessService,
    hashPassword: async () => 'hash',
    AsyncStorage: {
      getItem: async (key) => storage.get(key) ?? null,
      multiSet: async (entries) => entries.forEach(([key, value]) => storage.set(key, value)),
    },
  });
  const collaborationService = loadModule('../src/services/collaborationService.js', 'collaborationService', {
    ...collaboration,
    noteRepo, noteEditingAccessService, premiumAccessService,
    isSupabaseConfigured: false,
  });
  return { folders, folderRepo, storage, noteRepo, noteEditingAccessService, collaborationService, setPlan: (next) => { plan = next; } };
};

test('all four note types are read-only in subfolders on Free and Plus, but not Pro', () => {
  for (const note_type of ['note', 'checklist', 'expense', 'reminder']) {
    const note = { folder_id: 'child', note_type };
    const folder = { id: 'child', parent_id: 'parent' };
    assert.equal(policy.isSubfolderReadOnly(note, folder, 'free'), true);
    assert.equal(policy.isSubfolderReadOnly(note, folder, 'plus'), true);
    assert.equal(policy.isSubfolderReadOnly(note, folder, 'pro'), false);
  }
});

test('root notes, top-level folders and incoming owner-funded shares are unaffected', async () => {
  const { noteEditingAccessService: service } = setup();
  for (const note of [
    { folder_id: null }, { folder_id: 'parent' },
    { folder_id: 'child', share_origin: 'incoming' },
    { folder_id: 'deleted-child' },
  ]) {
    assert.equal(await service.isReadOnly(note), false);
    await service.requireNote(note);
  }
});

test('collaboration access cannot override subfolder read-only or viewer permissions', () => {
  assert.equal(policy.combineNoteEditAccess({ collaborative: true, canEdit: true }, true).canEdit, false);
  assert.equal(policy.combineNoteEditAccess({ collaborative: true, canEdit: false }, false).canEdit, false);
  const privateAccess = policy.combineNoteEditAccess({ collaborative: false, canEdit: true }, false);
  assert.equal(privateAccess.canEdit, true);
  assert.equal(privateAccess.editAccess, true);
});

test('expiry preserves folders and content; renewal restores access', async () => {
  const app = setup('pro');
  const before = await app.noteRepo.getById('nested');
  await app.noteEditingAccessService.requireNote(before);
  app.setPlan('free');
  assert.equal(await app.noteEditingAccessService.isReadOnly(before), true);
  await assert.rejects(app.noteEditingAccessService.requireNote(before), { code: 'SUBFOLDER_READ_ONLY' });
  assert.deepEqual(await app.noteRepo.getById('nested'), before);
  assert.equal((await app.folderRepo.getById('child')).parent_id, 'parent');
  app.setPlan('pro');
  await app.noteEditingAccessService.requireNote(before);
});

test('creating new notes in subfolders is blocked for every note type without Pro', async () => {
  const app = setup();
  for (const type of ['note', 'checklist', 'expense', 'reminder']) {
    await assert.rejects(app.noteRepo.create('child', '', '', null, type), { code: 'SUBFOLDER_READ_ONLY' });
  }
  assert.equal((await app.noteRepo.getByFolderId('child')).length, 1);
  await app.noteRepo.create(null);
  await app.noteRepo.create('parent');
  app.setPlan('pro');
  assert.equal((await app.noteRepo.create('child')).folder_id, 'child');
});

test('moving out preserves content and restores editing; moving into subfolders needs Pro', async () => {
  for (const destination of [null, 'parent']) {
    const app = setup();
    await app.noteRepo.move('nested', destination);
    await app.collaborationService.save('nested', { title: 'Editable again', content: 'Changed' });
    const note = await app.noteRepo.getById('nested');
    assert.equal(note.folder_id, destination);
    assert.equal(note.content, 'Changed');
    await assert.rejects(app.noteRepo.move('nested', 'child'), { code: 'SUBFOLDER_READ_ONLY' });
    assert.equal((await app.noteRepo.getById('nested')).folder_id, destination);
  }
});

test('content saves and keeping a conflicting draft cannot bypass the restriction', async () => {
  const app = setup('plus');
  await assert.rejects(app.collaborationService.save('nested', { title: 'Changed', content: 'Changed' }), { code: 'SUBFOLDER_READ_ONLY' });
  await assert.rejects(app.collaborationService.resolveConflict('nested', 'local'), { code: 'SUBFOLDER_READ_ONLY' });
  assert.equal((await app.noteRepo.getById('nested')).content, 'Body');
  await app.collaborationService.save('root', { title: 'Changed', content: 'Changed' });
  assert.equal((await app.noteRepo.getById('root')).content, 'Changed');
});

test('a Pro draft already pending at expiry finishes saving, but further edits are blocked', async () => {
  const app = setup('pro');
  const draft = { title: 'Typed before expiry', content: 'Keep this draft' };
  app.collaborationService.stageDraft('nested', draft);
  app.setPlan('free');
  await app.collaborationService.flushStagedDraft('nested');
  assert.equal((await app.noteRepo.getById('nested')).content, draft.content);
  const next = { title: draft.title, content: 'Typed after expiry' };
  app.collaborationService.stageDraft('nested', next);
  await assert.rejects(app.collaborationService.save('nested', next), { code: 'SUBFOLDER_READ_ONLY' });
  assert.equal((await app.noteRepo.getById('nested')).content, draft.content);
});

test('move-out can flush an authorized pre-expiry draft without losing it', async () => {
  const app = setup('pro');
  const draft = { title: 'Pending', content: 'Unsaved text' };
  app.collaborationService.stageDraft('nested', draft);
  app.setPlan('free');
  await app.collaborationService.flushStagedDraft('nested');
  await app.noteRepo.move('nested', null);
  assert.equal((await app.noteRepo.getById('nested')).content, draft.content);
  await app.collaborationService.save('nested', { title: 'Pending', content: 'Edit at Home' });
});

test('native creation and move paths enforce the same gates before mutations', async () => {
  const app = setup();
  let writes = 0;
  const note = { id: 'nested', folder_id: 'child', content: 'Body', is_deleted: 0 };
  const db = {
    getFirstAsync: async () => ({ ...note }),
    runAsync: async (sql, values) => { writes += 1; if (sql.includes('SET folder_id')) note.folder_id = values[0]; },
  };
  const native = loadModule('../src/db/noteRepo.js', 'noteRepo', {
    getDB: () => db,
    noteEditingAccessService: app.noteEditingAccessService,
    require: () => ({ hashPassword: async () => 'hash' }),
  });
  await assert.rejects(native.create('child'), { code: 'SUBFOLDER_READ_ONLY' });
  assert.equal(writes, 0);
  await native.move('nested', null);
  assert.equal(note.folder_id, null);
  assert.equal(note.content, 'Body');
  await assert.rejects(native.move('nested', 'child'), { code: 'SUBFOLDER_READ_ONLY' });
  assert.equal(writes, 1);
});

test('Settings currency update reports skipped read-only records instead of changing them', async () => {
  const app = setup();
  const content = expenses.serializeExpenseNote([], [], '', [], 'USD');
  await app.noteRepo.update('nested', { note_type: 'expense', content });
  await app.noteRepo.update('root', { note_type: 'expense', content });
  const service = loadModule('../src/services/expenseCurrencyService.js', 'expenseCurrencyService', {
    ...expenses, noteRepo: app.noteRepo, collaborationService: app.collaborationService,
  });
  const result = await service.applyToExistingNotes('MYR');
  assert.equal(result.updatedCount, 1);
  assert.equal(result.skippedReadOnlyCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(expenses.parseExpenseNote((await app.noteRepo.getById('nested')).content).currency, 'USD');
  assert.equal(expenses.parseExpenseNote((await app.noteRepo.getById('root')).content).currency, 'MYR');
});

const findNode = (node, matches) => {
  if (!node || typeof node !== 'object') return null;
  if (matches(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findNode(child, matches);
      if (found) return found;
    }
  }
  return null;
};

test('all four actual editor exit handlers flush a pre-expiry draft after becoming read-only', async () => {
  for (const screen of ['Note', 'Checklist', 'ExpenseRecord', 'Reminder']) {
    const app = setup('pro');
    const draft = { title: 'Before-expiry title', content: 'Before-expiry content' };
    app.collaborationService.stageDraft('nested', draft);
    app.setPlan('free');
    const source = readFileSync(new URL(`../src/screens/${screen}EditorScreen.js`, import.meta.url), 'utf8');
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const declaration = findNode(ast, (node) => node.type === 'VariableDeclarator' && node.id?.name === 'finalizeExit');
    const callback = declaration.init.arguments[0];
    const saveTimeout = { current: 1 };
    const finalizeExit = vm.runInNewContext(`(${source.slice(callback.start, callback.end)})`, {
      collaborationService: app.collaborationService,
      noteId: 'nested',
      isNewDraft: false,
      loadCompletedRef: { current: true },
      latest: { current: { ...draft, readOnly: true, color: 'default', attachments: [], items: [] } },
      saveTimeout,
      clearTimeout: () => {},
      getEditorExitDisposition,
      DEFAULT_NOTE_COLOR: 'default',
      isEmptyDraft: () => false,
      isChecklistNoteEmpty: () => false,
      isReminderNoteEmpty: () => false,
    });
    await finalizeExit();
    assert.equal((await app.noteRepo.getById('nested')).content, draft.content, screen);
    assert.equal(saveTimeout.current, null, screen);
  }
});

test('subscription expiry is scheduled at the paid end, with cleanup and a bounded fallback', () => {
  const source = readFileSync(new URL('../src/context/SubscriptionContext.js', import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const effect = findNode(ast, (node) => node.type === 'CallExpression' && node.callee?.name === 'useEffect'
    && node.arguments[0]?.body?.body?.some((statement) => statement.declarations?.some((item) => item.id?.name === 'checkExpiry')));
  const callback = effect.arguments[0];
  let now = new Date('2026-09-18T10:00:00Z').getTime();
  const paidEnd = now + 100;
  const timers = [];
  const plans = [];
  class ClockDate extends Date { static now() { return now; } }
  const cleanup = vm.runInNewContext(`(${source.slice(callback.start, callback.end)})()`, {
    Date: ClockDate,
    premiumAccessService: { getPlan: () => now < paidEnd ? 'pro' : 'free' },
    setActivePlanId: (plan) => plans.push(plan),
    customerInfo: { entitlements: { active: { pro: { expirationDate: new Date(paidEnd).toISOString() } } } },
    cloudAccess: null,
    setTimeout: (fn, delay) => { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { timer.cleared = true; },
  });
  assert.equal(timers[0].delay, 101);
  assert.equal(plans[0], 'pro');
  now += timers[0].delay;
  timers[0].fn();
  assert.equal(plans[1], 'free');
  assert.equal(timers[1].delay, 30000);
  cleanup();
  assert.equal(timers[1].cleared, true);
});
