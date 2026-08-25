export const SHARE_ORIGIN_PRIVATE = 'private';
export const SHARE_ORIGIN_OWNED = 'owned';
export const SHARE_ORIGIN_INCOMING = 'incoming';

export const COLLABORATION_DEFAULTS = Object.freeze({
  cloud_id: null,
  cloud_owner_id: null,
  share_origin: SHARE_ORIGIN_PRIVATE,
  share_role: null,
  collaborator_count: 0,
  server_revision: 0,
  last_edited_by_id: null,
  last_edited_by_email: null,
  last_edited_at: null,
  sync_status: null,
  last_synced_at: null,
});

export const normalizeCollaborationNote = (note) => ({
  ...COLLABORATION_DEFAULTS,
  ...note,
  note_type: note?.note_type || 'note',
  is_archived: note?.is_archived ? 1 : 0,
  share_origin: note?.share_origin || SHARE_ORIGIN_PRIVATE,
  collaborator_count: Number(note?.collaborator_count) || 0,
  server_revision: Number(note?.server_revision) || 0,
});

export const isIncomingSharedNote = (note) =>
  normalizeCollaborationNote(note).share_origin === SHARE_ORIGIN_INCOMING;

export const isCollaborativeNote = (note) => Boolean(note?.cloud_id);

export const formatCollaborativeEdit = (note, currentUserEmail = '') => {
  if (!note?.cloud_id || !note?.last_edited_at) return '';
  const editor = note.last_edited_by_email?.toLowerCase() === currentUserEmail?.toLowerCase()
    ? 'you'
    : note.last_edited_by_email || 'a collaborator';
  const date = new Date(note.last_edited_at);
  if (Number.isNaN(date.getTime())) return `Last edited by ${editor}`;
  return `Last edited by ${editor} · ${date.toLocaleString()}`;
};

export const remoteNoteToLocal = (remote) => ({
  cloud_id: remote.id,
  cloud_owner_id: remote.owner_id,
  title: remote.title || '',
  content: remote.content || '',
  note_type: remote.note_type || 'note',
  share_origin: remote.is_owner ? SHARE_ORIGIN_OWNED : SHARE_ORIGIN_INCOMING,
  share_role: remote.role || (remote.is_owner ? 'owner' : 'editor'),
  collaborator_count: Number(remote.collaborator_count) || 0,
  server_revision: Number(remote.revision) || 0,
  last_edited_by_id: remote.updated_by || null,
  last_edited_by_email: remote.updated_by_email || null,
  last_edited_at: remote.updated_at || null,
  sync_status: 'synced',
  last_synced_at: new Date().toISOString(),
});
