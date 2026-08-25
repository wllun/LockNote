alter table public.private_folders
  add column if not exists is_archived boolean not null default false;

create index if not exists idx_private_folders_owner_archive
  on public.private_folders(owner_id, is_archived)
  where is_deleted = false;

create or replace function public.sync_private_data(p_folders jsonb, p_notes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.private_folders as current (
    owner_id, local_id, name, password_hash, is_pinned, is_archived, is_deleted,
    client_created_at, client_updated_at, server_updated_at
  )
  select
    v_owner_id, item.id, coalesce(item.name, ''), item.password,
    coalesce(item.is_pinned, false), coalesce(item.is_archived, false),
    coalesce(item.is_deleted, false),
    coalesce(item.created_at, item.updated_at), item.updated_at, now()
  from jsonb_to_recordset(coalesce(p_folders, '[]'::jsonb)) as item(
    id text, name text, password text, is_pinned boolean, is_archived boolean,
    is_deleted boolean, created_at timestamptz, updated_at timestamptz
  )
  where item.id is not null and item.updated_at is not null
  on conflict (owner_id, local_id) do update set
    name = case when excluded.is_deleted then current.name else excluded.name end,
    password_hash = case when excluded.is_deleted then current.password_hash else excluded.password_hash end,
    is_pinned = case when excluded.is_deleted then current.is_pinned else excluded.is_pinned end,
    is_archived = case when excluded.is_deleted then current.is_archived else excluded.is_archived end,
    is_deleted = excluded.is_deleted,
    client_created_at = least(current.client_created_at, excluded.client_created_at),
    client_updated_at = excluded.client_updated_at,
    server_updated_at = now()
  where excluded.client_updated_at >= current.client_updated_at;

  insert into public.private_notes as current (
    owner_id, local_id, folder_id, title, content, note_type, password_hash,
    is_pinned, is_archived, is_deleted, collaboration, client_created_at,
    client_updated_at, server_updated_at
  )
  select
    v_owner_id, item.id, item.folder_id, coalesce(item.title, ''),
    coalesce(item.content, ''), coalesce(item.note_type, 'note'), item.password,
    coalesce(item.is_pinned, false), coalesce(item.is_archived, false),
    coalesce(item.is_deleted, false), coalesce(item.collaboration, '{}'::jsonb),
    coalesce(item.created_at, item.updated_at), item.updated_at, now()
  from jsonb_to_recordset(coalesce(p_notes, '[]'::jsonb)) as item(
    id text, folder_id text, title text, content text, note_type text,
    password text, is_pinned boolean, is_archived boolean, is_deleted boolean,
    collaboration jsonb, created_at timestamptz, updated_at timestamptz
  )
  where item.id is not null and item.updated_at is not null
  on conflict (owner_id, local_id) do update set
    folder_id = case when excluded.is_deleted then current.folder_id else excluded.folder_id end,
    title = case when excluded.is_deleted then current.title else excluded.title end,
    content = case when excluded.is_deleted then current.content else excluded.content end,
    note_type = case when excluded.is_deleted then current.note_type else excluded.note_type end,
    password_hash = case when excluded.is_deleted then current.password_hash else excluded.password_hash end,
    is_pinned = case when excluded.is_deleted then current.is_pinned else excluded.is_pinned end,
    is_archived = case when excluded.is_deleted then current.is_archived else excluded.is_archived end,
    is_deleted = excluded.is_deleted,
    collaboration = case when excluded.is_deleted then current.collaboration else excluded.collaboration end,
    client_created_at = least(current.client_created_at, excluded.client_created_at),
    client_updated_at = excluded.client_updated_at,
    server_updated_at = now()
  where excluded.client_updated_at >= current.client_updated_at;

  update public.private_notes as note
  set is_deleted = true,
      is_archived = false,
      client_updated_at = greatest(note.client_updated_at, folder.client_updated_at),
      server_updated_at = now()
  from public.private_folders as folder
  where folder.owner_id = v_owner_id
    and folder.is_deleted = true
    and note.owner_id = folder.owner_id
    and note.folder_id = folder.local_id
    and note.is_deleted = false;

  select jsonb_build_object(
    'folders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', folder.local_id,
        'name', folder.name,
        'password', folder.password_hash,
        'is_pinned', folder.is_pinned,
        'is_archived', folder.is_archived,
        'is_deleted', folder.is_deleted,
        'created_at', folder.client_created_at,
        'updated_at', folder.client_updated_at
      ) order by folder.local_id)
      from public.private_folders as folder
      where folder.owner_id = v_owner_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', note.local_id,
        'folder_id', note.folder_id,
        'title', note.title,
        'content', note.content,
        'note_type', note.note_type,
        'password', note.password_hash,
        'is_pinned', note.is_pinned,
        'is_archived', note.is_archived,
        'is_deleted', note.is_deleted,
        'collaboration', note.collaboration,
        'created_at', note.client_created_at,
        'updated_at', note.client_updated_at
      ) order by note.local_id)
      from public.private_notes as note
      where note.owner_id = v_owner_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.sync_private_data(jsonb, jsonb) from public, anon;
grant execute on function public.sync_private_data(jsonb, jsonb) to authenticated;
