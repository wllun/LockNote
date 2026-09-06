import { noteRepo } from '../db/noteRepo';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import {
  SHARE_ORIGIN_INCOMING,
  SHARE_ROLE_EDITOR,
  SHARE_ROLE_VIEWER,
  isReadOnlyCollaborativeNote,
  normalizeShareRole,
  remoteNoteToLocal,
} from '../utils/collaboration-note.mjs';

const requireCloud = async () => {
  if (!isSupabaseConfigured) {
    throw new Error('Account services are not configured on this build.');
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Sign in before sharing a note.');
  return data.session;
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
};

const remoteWithLocalFallback = (remote, local) => ({
  ...remote,
  is_owner: remote?.is_owner ?? local?.share_origin === 'owned',
  role: remote?.role || local?.share_role,
  collaborator_count: remote?.collaborator_count ?? local?.collaborator_count,
});

const createReadOnlyError = () => {
  const error = new Error('This note is view only. Ask the owner for edit access.');
  error.code = 'READ_ONLY';
  return error;
};

const isReadOnlyError = (error) => error?.code === '42501'
  || error?.code === 'READ_ONLY'
  || /view only|edit access/i.test(error?.message || '');

const cacheRemote = async (remote) => {
  if (!remote) return null;
  const existing = await noteRepo.getByCloudId(remote.id);
  if (existing?.sync_status === 'pending') {
    const remoteContext = remoteWithLocalFallback(remote, existing);
    if (remoteContext.role === SHARE_ROLE_VIEWER && existing.share_origin === SHARE_ORIGIN_INCOMING) {
      return await noteRepo.update(existing.id, remoteNoteToLocal(remoteContext));
    }
    if (Number(remote.revision) !== Number(existing.server_revision || 0)) {
      return await noteRepo.update(existing.id, { sync_status: 'conflict' });
    }
    try {
      const saved = unwrap(await supabase.rpc('save_shared_note', {
        p_note_id: existing.cloud_id,
        p_expected_revision: existing.server_revision || 0,
        p_title: existing.title,
        p_content: existing.content,
      }));
      return await noteRepo.update(
        existing.id,
        remoteNoteToLocal(remoteWithLocalFallback({ ...remote, ...saved }, existing))
      );
    } catch {
      return existing;
    }
  }
  return await noteRepo.upsertSharedCache(remoteNoteToLocal(remote));
};

const saveQueues = new Map();

// SharedScreen stays mounted while an editor is pushed on top of it. Supabase
// returns the existing channel when the same topic is requested again, so
// subscribing/removing that channel independently from both components makes
// their lifecycles interfere with each other. Keep one realtime channel and
// fan its events out to the active consumers instead.
const realtimeListeners = new Set();
let realtimeChannel = null;
let realtimeChannelRemoval = null;

const notifyRealtimeListeners = (payload) => {
  for (const listener of [...realtimeListeners]) {
    try {
      Promise.resolve(listener(payload)).catch((error) => {
        console.warn('Shared-note refresh listener failed:', error);
      });
    } catch (error) {
      console.warn('Shared-note refresh listener failed:', error);
    }
  }
};

const ensureRealtimeChannel = () => {
  if (!isSupabaseConfigured || realtimeChannel || realtimeChannelRemoval) return;
  try {
    realtimeChannel = supabase
      .channel('locknote-shared-notes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_notes' },
        notifyRealtimeListeners
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'note_members' },
        notifyRealtimeListeners
      )
      .subscribe();
  } catch (error) {
    realtimeChannel = null;
    console.warn('Failed to start shared-note subscription:', error);
  }
};

const enqueueSave = (noteId, operation) => {
  const previous = saveQueues.get(noteId) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  saveQueues.set(noteId, next);
  next.finally(() => {
    if (saveQueues.get(noteId) === next) saveQueues.delete(noteId);
  }).catch(() => {});
  return next;
};

export const collaborationService = {
  async refreshSharedWithMe() {
    await requireCloud();
    const { data, error } = await supabase.rpc('list_shared_notes');
    if (error) throw error;
    const cachedBeforeRefresh = await noteRepo.getSharedWithMe();
    const activeCloudIds = new Set((data || []).map((remote) => remote.id));
    for (const cached of cachedBeforeRefresh) {
      if (!activeCloudIds.has(cached.cloud_id)) await noteRepo.softDelete(cached.id);
    }
    const cached = [];
    for (const remote of data || []) cached.push(await cacheRemote(remote));
    return cached;
  },

  async ensureCloudNote(noteId) {
    const session = await requireCloud();
    const note = await noteRepo.getById(noteId);
    if (!note) throw new Error('This note no longer exists.');
    if (note.cloud_id) return note;
    const remote = unwrap(await supabase.rpc('create_shared_note', {
      p_local_note_id: note.id,
      p_note_type: note.note_type,
      p_title: note.title,
      p_content: note.content,
    }));
    return await noteRepo.update(noteId, {
      ...remoteNoteToLocal({ ...remote, is_owner: true, role: 'owner' }),
      share_origin: 'owned',
      cloud_owner_id: session.user.id,
    });
  },

  async save(noteId, updates) {
    return await enqueueSave(noteId, async () => {
      const beforeSave = await noteRepo.getById(noteId);
      if (isReadOnlyCollaborativeNote(beforeSave)) throw createReadOnlyError();
      let local = await noteRepo.update(noteId, updates);
      if (!local?.cloud_id || !isSupabaseConfigured) return local;
      try {
        const remote = unwrap(await supabase.rpc('save_shared_note', {
          p_note_id: local.cloud_id,
          p_expected_revision: local.server_revision || 0,
          p_title: local.title,
          p_content: local.content,
        }));
        local = await noteRepo.update(noteId, remoteNoteToLocal({
          ...remote,
          is_owner: local.share_origin === 'owned',
          role: local.share_role,
          collaborator_count: local.collaborator_count,
        }));
      } catch (error) {
        if (isReadOnlyError(error)) {
          try {
            const remote = unwrap(await supabase.rpc('get_shared_note', { p_note_id: local.cloud_id }));
            await noteRepo.update(noteId, remoteNoteToLocal(remoteWithLocalFallback(remote, local)));
          } catch {
            await noteRepo.update(noteId, {
              title: beforeSave.title,
              content: beforeSave.content,
              share_role: SHARE_ROLE_VIEWER,
              sync_status: 'synced',
            });
          }
          error.localSaved = false;
        } else {
          await noteRepo.update(noteId, { sync_status: error?.code === '40001' ? 'conflict' : 'pending' });
          error.localSaved = true;
        }
        throw error;
      }
      return local;
    });
  },

  async shareByEmail(noteId, email, role = SHARE_ROLE_EDITOR) {
    const normalizedRole = normalizeShareRole(role, SHARE_ORIGIN_INCOMING);
    const note = await this.ensureCloudNote(noteId);
    const { data, error } = await supabase.functions.invoke('share-note', {
      body: {
        noteId: note.cloud_id,
        email: email.trim().toLowerCase(),
        role: normalizedRole,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await noteRepo.update(noteId, {
      collaborator_count: data.collaboratorCount,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
    });
    return data;
  },

  async getMembers(noteId) {
    const note = await this.ensureCloudNote(noteId);
    const { data, error } = await supabase.rpc('list_note_members', { p_note_id: note.cloud_id });
    if (error) throw error;
    return data || [];
  },

  async updateMemberRole(noteId, userId, role) {
    const note = await noteRepo.getById(noteId);
    if (!note?.cloud_id) throw new Error('Share this note before changing access.');
    const normalizedRole = normalizeShareRole(role, SHARE_ORIGIN_INCOMING);
    const { data, error } = await supabase.rpc('update_note_member_role', {
      p_note_id: note.cloud_id,
      p_user_id: userId,
      p_role: normalizedRole,
    });
    if (error) throw error;
    return unwrap({ data, error: null });
  },

  async refreshNote(noteId) {
    const local = await noteRepo.getById(noteId);
    if (!local?.cloud_id) return { note: local, changed: false };
    await requireCloud();
    const remote = unwrap(await supabase.rpc('get_shared_note', { p_note_id: local.cloud_id }));
    const remoteContext = remoteWithLocalFallback(remote, local);
    if (remoteContext.role === SHARE_ROLE_VIEWER && local.share_origin === SHARE_ORIGIN_INCOMING) {
      const note = await noteRepo.update(noteId, remoteNoteToLocal(remoteContext));
      const changed = local.share_role !== SHARE_ROLE_VIEWER
        || Number(remote.revision) !== Number(local.server_revision || 0);
      return { note, changed };
    }
    if (local.sync_status === 'pending') {
      if (Number(remote.revision) !== Number(local.server_revision || 0)) {
        const note = await noteRepo.update(noteId, { sync_status: 'conflict' });
        return { note, changed: false };
      }
      try {
        const saved = unwrap(await supabase.rpc('save_shared_note', {
          p_note_id: local.cloud_id,
          p_expected_revision: local.server_revision || 0,
          p_title: local.title,
          p_content: local.content,
        }));
        const note = await noteRepo.update(
          noteId,
          remoteNoteToLocal(remoteWithLocalFallback({ ...remoteContext, ...saved }, local))
        );
        return { note, changed: false };
      } catch { return { note: local, changed: false }; }
    }
    if (local.sync_status === 'conflict') return { note: local, changed: false };
    const roleChanged = Boolean(remote?.role) && remoteContext.role !== local.share_role;
    if (!remote || (Number(remote.revision) <= Number(local.server_revision || 0) && !roleChanged)) {
      return { note: local, changed: false };
    }
    const note = await noteRepo.update(noteId, remoteNoteToLocal(remoteContext));
    return { note, changed: true };
  },

  async resolveConflict(noteId, strategy) {
    const local = await noteRepo.getById(noteId);
    if (strategy === 'local' && isReadOnlyCollaborativeNote(local)) throw createReadOnlyError();
    await requireCloud();
    const remote = unwrap(await supabase.rpc('get_shared_note', { p_note_id: local.cloud_id }));
    const resolved = strategy === 'local'
      ? unwrap(await supabase.rpc('save_shared_note', {
          p_note_id: local.cloud_id,
          p_expected_revision: remote.revision,
          p_title: local.title,
          p_content: local.content,
        }))
      : remote;
    return await noteRepo.update(
      noteId,
      remoteNoteToLocal(remoteWithLocalFallback({ ...remote, ...resolved }, local))
    );
  },

  async removeMember(noteId, userId) {
    const note = await noteRepo.getById(noteId);
    const result = unwrap(await supabase.rpc('remove_note_member', {
      p_note_id: note.cloud_id,
      p_user_id: userId,
    }));
    await noteRepo.update(noteId, { collaborator_count: Number(result?.collaborator_count) || 0 });
    return result;
  },

  async leave(noteId) {
    const note = await noteRepo.getById(noteId);
    if (!note?.cloud_id) return;
    const { error } = await supabase.rpc('leave_shared_note', { p_note_id: note.cloud_id });
    if (error) throw error;
    await noteRepo.softDelete(noteId);
  },

  async delete(noteId) {
    const note = await noteRepo.getById(noteId);
    if (note?.share_origin === 'incoming') return await this.leave(noteId);
    if (note?.cloud_id) {
      const { error } = await supabase.rpc('delete_shared_note', { p_note_id: note.cloud_id });
      if (error) throw error;
    }
    await noteRepo.softDelete(noteId);
  },

  subscribe(onChange) {
    if (!isSupabaseConfigured || typeof onChange !== 'function') return () => {};
    realtimeListeners.add(onChange);
    ensureRealtimeChannel();
    return () => {
      realtimeListeners.delete(onChange);
      if (realtimeListeners.size || !realtimeChannel) return;
      const channel = realtimeChannel;
      realtimeChannel = null;
      realtimeChannelRemoval = supabase.removeChannel(channel)
        .catch((error) => {
          console.warn('Failed to close shared-note subscription:', error);
        })
        .finally(() => {
          realtimeChannelRemoval = null;
          if (realtimeListeners.size) ensureRealtimeChannel();
        });
    };
  },
};
