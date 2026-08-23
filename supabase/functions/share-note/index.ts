import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentication required.');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) throw new Error('Authentication required.');
    const { noteId, email } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!noteId || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Enter a valid account email.');

    const admin = createClient(url, service);
    const { data: note } = await admin.from('shared_notes').select('id, owner_id').eq('id', noteId).is('deleted_at', null).single();
    if (!note || note.owner_id !== user.id) throw new Error('Only the note owner can invite collaborators.');
    const { data: target } = await admin.from('profiles').select('id, email').eq('email', normalizedEmail).single();
    if (!target) throw new Error('No LockNote account uses this email yet.');
    if (target.id === user.id) throw new Error('This note already belongs to you.');
    const { error: insertError } = await admin.from('note_members').upsert({
      note_id: noteId, user_id: target.id, role: 'editor', invited_by: user.id,
    }, { onConflict: 'note_id,user_id' });
    if (insertError) throw insertError;
    const { count } = await admin.from('note_members').select('*', { count: 'exact', head: true }).eq('note_id', noteId);
    return Response.json({ member: { userId: target.id, email: target.email, role: 'editor' }, collaboratorCount: count || 0 }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not share this note.' }, { status: 400, headers: cors });
  }
});
