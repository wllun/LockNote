-- Account-owned folder/note sync. Content is private through RLS, but it is not
-- end-to-end encrypted by LockNote before it reaches Supabase.
create table if not exists public.private_folders (
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 128),
  name text not null default '',
  password_hash text,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, local_id)
);

create table if not exists public.private_notes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 128),
  folder_id text,
  title text not null default '',
  content text not null default '',
  note_type text not null default 'note'
    check (note_type in ('note', 'checklist', 'expense', 'reminder')),
  password_hash text,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,
  collaboration jsonb not null default '{}'::jsonb,
  client_created_at timestamptz not null,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, local_id),
  foreign key (owner_id, folder_id)
    references public.private_folders(owner_id, local_id)
    deferrable initially deferred
);

create index if not exists idx_private_notes_owner_folder
  on public.private_notes(owner_id, folder_id);

alter table public.private_folders enable row level security;
alter table public.private_notes enable row level security;

revoke all on table public.private_folders, public.private_notes from anon, authenticated;
grant select, insert, update on table public.private_folders, public.private_notes to authenticated;

drop policy if exists private_folders_select_own on public.private_folders;
create policy private_folders_select_own on public.private_folders
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists private_folders_insert_own on public.private_folders;
create policy private_folders_insert_own on public.private_folders
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists private_folders_update_own on public.private_folders;
create policy private_folders_update_own on public.private_folders
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists private_notes_select_own on public.private_notes;
create policy private_notes_select_own on public.private_notes
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists private_notes_insert_own on public.private_notes;
create policy private_notes_insert_own on public.private_notes
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists private_notes_update_own on public.private_notes;
create policy private_notes_update_own on public.private_notes
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

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
    owner_id, local_id, name, password_hash, is_pinned, is_deleted,
    client_created_at, client_updated_at, server_updated_at
  )
  select
    v_owner_id, item.id, coalesce(item.name, ''), item.password,
    coalesce(item.is_pinned, false), coalesce(item.is_deleted, false),
    coalesce(item.created_at, item.updated_at), item.updated_at, now()
  from jsonb_to_recordset(coalesce(p_folders, '[]'::jsonb)) as item(
    id text, name text, password text, is_pinned boolean, is_deleted boolean,
    created_at timestamptz, updated_at timestamptz
  )
  where item.id is not null and item.updated_at is not null
  on conflict (owner_id, local_id) do update set
    name = case when excluded.is_deleted then current.name else excluded.name end,
    password_hash = case when excluded.is_deleted then current.password_hash else excluded.password_hash end,
    is_pinned = case when excluded.is_deleted then current.is_pinned else excluded.is_pinned end,
    is_deleted = excluded.is_deleted,
    client_created_at = least(current.client_created_at, excluded.client_created_at),
    client_updated_at = excluded.client_updated_at,
    server_updated_at = now()
  where excluded.client_updated_at >= current.client_updated_at;

  insert into public.private_notes as current (
    owner_id, local_id, folder_id, title, content, note_type, password_hash,
    is_pinned, is_deleted, collaboration, client_created_at,
    client_updated_at, server_updated_at
  )
  select
    v_owner_id, item.id, item.folder_id, coalesce(item.title, ''),
    coalesce(item.content, ''), coalesce(item.note_type, 'note'), item.password,
    coalesce(item.is_pinned, false), coalesce(item.is_deleted, false),
    coalesce(item.collaboration, '{}'::jsonb),
    coalesce(item.created_at, item.updated_at), item.updated_at, now()
  from jsonb_to_recordset(coalesce(p_notes, '[]'::jsonb)) as item(
    id text, folder_id text, title text, content text, note_type text,
    password text, is_pinned boolean, is_deleted boolean, collaboration jsonb,
    created_at timestamptz, updated_at timestamptz
  )
  where item.id is not null and item.updated_at is not null
  on conflict (owner_id, local_id) do update set
    folder_id = case when excluded.is_deleted then current.folder_id else excluded.folder_id end,
    title = case when excluded.is_deleted then current.title else excluded.title end,
    content = case when excluded.is_deleted then current.content else excluded.content end,
    note_type = case when excluded.is_deleted then current.note_type else excluded.note_type end,
    password_hash = case when excluded.is_deleted then current.password_hash else excluded.password_hash end,
    is_pinned = case when excluded.is_deleted then current.is_pinned else excluded.is_pinned end,
    is_deleted = excluded.is_deleted,
    collaboration = case when excluded.is_deleted then current.collaboration else excluded.collaboration end,
    client_created_at = least(current.client_created_at, excluded.client_created_at),
    client_updated_at = excluded.client_updated_at,
    server_updated_at = now()
  where excluded.client_updated_at >= current.client_updated_at;

  -- Folder deletion is destructive in the local app, so mirror it for every
  -- cloud note still attached to that folder.
  update public.private_notes as note
  set is_deleted = true,
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
