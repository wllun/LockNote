import { noteRepo } from '../db/noteRepo';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { remoteNoteToLocal } from '../utils/collaboration-note.mjs';

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

const cacheRemote = async (remote) => {
  if (!remote) return null;
  const existing = await noteRepo.getByCloudId(remote.id);
  if (existing?.sync_status === 'pending') {
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
      return await noteRepo.update(existing.id, remoteNoteToLocal({
        ...saved,
        is_owner: existing.share_origin === 'owned',
        role: existing.share_role,
        collaborator_count: remote.collaborator_count,
      }));
    } catch {
      return existing;
    }
  }
  return await noteRepo.upsertSharedCache(remoteNoteToLocal(remote));
};

const saveQueues = new Map();

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
        await noteRepo.update(noteId, { sync_status: error?.code === '40001' ? 'conflict' : 'pending' });
        error.localSaved = true;
        throw error;
      }
      return local;
    });
  },

  async shareByEmail(noteId, email) {
    const note = await this.ensureCloudNote(noteId);
    const { data, error } = await supabase.functions.invoke('share-note', {
      body: { noteId: note.cloud_id, email: email.trim().toLowerCase() },
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

  async refreshNote(noteId) {
    const local = await noteRepo.getById(noteId);
    if (!local?.cloud_id) return { note: local, changed: false };
    await requireCloud();
    const remote = unwrap(await supabase.rpc('get_shared_note', { p_note_id: local.cloud_id }));
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
        const note = await noteRepo.update(noteId, remoteNoteToLocal({
          ...saved,
          is_owner: local.share_origin === 'owned',
          role: local.share_role,
          collaborator_count: remote.collaborator_count,
        }));
        return { note, changed: false };
      } catch { return { note: local, changed: false }; }
    }
    if (local.sync_status === 'conflict') return { note: local, changed: false };
    if (!remote || Number(remote.revision) <= Number(local.server_revision || 0)) {
      return { note: local, changed: false };
    }
    const note = await noteRepo.update(noteId, remoteNoteToLocal({
      ...remote,
      is_owner: local.share_origin === 'owned',
      role: local.share_role,
      collaborator_count: remote.collaborator_count ?? local.collaborator_count,
    }));
    return { note, changed: true };
  },

  async resolveConflict(noteId, strategy) {
    const local = await noteRepo.getById(noteId);
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
    return await noteRepo.update(noteId, remoteNoteToLocal({
      ...resolved,
      is_owner: local.share_origin === 'owned',
      role: local.share_role,
      collaborator_count: remote.collaborator_count,
    }));
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
    if (!isSupabaseConfigured) return () => {};
    const channel = supabase
      .channel('locknote-shared-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_notes' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'note_members' }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
