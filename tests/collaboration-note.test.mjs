import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCollaborativeEdit,
  normalizeCollaborationNote,
  remoteNoteToLocal,
} from '../src/utils/collaboration-note.mjs';

test('adds stable collaboration defaults to legacy local notes', () => {
  const note = normalizeCollaborationNote({ id: 'local-1', title: 'Legacy' });
  assert.equal(note.share_origin, 'private');
  assert.equal(note.collaborator_count, 0);
  assert.equal(note.server_revision, 0);
  assert.equal(note.cloud_id, null);
});

test('maps a shared cloud note into the incoming local cache shape', () => {
  const mapped = remoteNoteToLocal({
    id: 'cloud-1', owner_id: 'owner-1', title: 'Trip', content: 'Plan',
    note_type: 'checklist', revision: 4, role: 'editor', updated_by: 'user-2',
    updated_by_email: 'friend@example.com', updated_at: '2026-08-23T10:00:00.000Z',
  });
  assert.equal(mapped.cloud_id, 'cloud-1');
  assert.equal(mapped.share_origin, 'incoming');
  assert.equal(mapped.server_revision, 4);
  assert.equal(mapped.sync_status, 'synced');
});

test('formats the current account as you in last-edit copy', () => {
  const text = formatCollaborativeEdit({
    cloud_id: 'cloud-1', last_edited_by_email: 'ME@example.com',
    last_edited_at: '2026-08-23T10:00:00.000Z',
  }, 'me@example.com');
  assert.match(text, /^Last edited by you · /);
});
