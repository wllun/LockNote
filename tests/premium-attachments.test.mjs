import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const setup = ({ plan = 'free', local = [], remote = [], note = { id: 'note' } } = {}) => {
  const calls = [];
  const attachmentRepo = {
    listByNoteId: async () => local.map((item) => ({ ...item })),
    update: async (id, update) => { const item = local.find((entry) => entry.id === id); Object.assign(item, update); return { ...item }; },
    remove: async (id) => { local = local.filter((item) => item.id !== id); },
    add: async (_note, asset) => { local.push({ ...asset, local_uri: asset.uri }); },
    reorder: async (_note, ids) => { for (const [index, id] of ids.entries()) { const item = local.find((entry) => entry.id === id); if (item) item.display_order = index; } },
  };
  const bucket = {
    upload: async () => { calls.push('upload'); return {}; },
    remove: async () => ({}),
    createSignedUrl: async () => ({ data: { signedUrl: 'https://test.invalid/image' } }),
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) },
    storage: { from: () => bucket },
    rpc: async (name, params) => {
      calls.push(name);
      if (name.includes('subscription_access')) return { data: { plan } };
      if (name === 'reserve_attachment_upload') return { data: `owner/note/${params.p_id}.jpg` };
      if (name === 'list_note_attachments') return { data: remote };
      if (name === 'reorder_note_attachments') {
        for (const layout of params.p_layout) Object.assign(remote.find((item) => item.id === layout.id) ?? {}, layout);
      }
      if (name === 'register_note_attachment') remote.push({ id: params.p_id, display_order: params.p_display_order, anchor_offset: params.p_anchor_offset, display_width_ratio: params.p_display_width_ratio });
      return {};
    },
  };
  const source = readFileSync(new URL('../src/services/attachmentCloudService.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export const attachmentCloudService', 'const attachmentCloudService');
  const service = vm.runInNewContext(`${source}\nattachmentCloudService;`, {
    attachmentRepo, noteRepo: { getById: async () => note }, isSupabaseConfigured: true, supabase,
    MAX_NOTE_ATTACHMENTS: 20, attachmentDeleteQueue: { flush: async () => {} },
    readAttachmentUploadBody: async () => new Uint8Array(10),
    prepareDownloadedAttachment: async () => ({ uri: 'local-image', cleanup() {} }),
  });
  return { service, calls };
};
const image = (changes = {}) => ({ id: 'image', local_uri: 'local-image', cloud_path: 'owner/note/image.jpg', sync_status: 'synced', anchor_offset: 99, display_order: 0, display_width_ratio: 1, ...changes });

test('downgrade retains owned images and local layout without cloud writes', async () => {
  const { service, calls } = setup({ local: [image()], remote: [] });
  const result = await service.syncNote('note');
  assert.equal(result[0].anchor_offset, 99);
  assert.equal(result.length, 1);
  assert.ok(!calls.includes('upload'));
  assert.ok(!calls.includes('reorder_note_attachments'));
});
test('downgrade can download existing cloud images', async () => {
  const { service } = setup({ remote: [{ ...image(), storage_path: 'owner/note/image.jpg' }] });
  assert.equal((await service.syncNote('note')).length, 1);
});
test('resubscription publishes pending layout before reading remote layout', { timeout: 1000 }, async () => {
  const { service, calls } = setup({ plan: 'pro', local: [image({ sync_status: 'pending' })], remote: [image({ anchor_offset: 1 })] });
  const result = await service.syncNote('note');
  assert.equal(result[0].anchor_offset, 99);
  assert.equal(result[0].sync_status, 'synced');
  assert.ok(calls.indexOf('reorder_note_attachments') < calls.indexOf('list_note_attachments'));
});
test('Pro upload reserves quota before uploading and registering a file', async () => {
  const { service, calls } = setup({ plan: 'pro', local: [image({ cloud_path: null })] });
  await service.syncNote('note');
  assert.ok(calls.indexOf('reserve_attachment_upload') < calls.indexOf('upload'));
  assert.ok(calls.indexOf('upload') < calls.indexOf('register_note_attachment'));
});
test('view-only invitee never uploads even when owner is Pro', async () => {
  const note = { id: 'note', cloud_id: 'shared', share_origin: 'incoming', share_role: 'viewer' };
  const { service, calls } = setup({ plan: 'pro', local: [image({ cloud_path: null, sync_status: 'pending' })], note });
  await service.syncNote(note);
  assert.ok(!calls.includes('reserve_attachment_upload'));
});
