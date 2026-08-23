-- LockNote collaboration Release 1. Apply with `supabase db push`.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  local_note_id text not null,
  note_type text not null check (note_type in ('note', 'checklist', 'expense', 'reminder')),
  title text not null default '',
  content text not null default '',
  revision bigint not null default 0,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(owner_id, local_note_id)
);

create table if not exists public.note_members (
  note_id uuid not null references public.shared_notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role = 'editor'),
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(note_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id, email) values (new.id, lower(new.email))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles(id, email)
select id, lower(email) from auth.users where email is not null
on conflict (id) do update set email = excluded.email, updated_at = now();

create or replace function public.can_access_shared_note(p_note_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.shared_notes n
  where n.id = p_note_id and n.deleted_at is null and
    (n.owner_id = auth.uid() or exists (
      select 1 from public.note_members m where m.note_id = n.id and m.user_id = auth.uid()
    ))
) $$;

alter table public.profiles enable row level security;
alter table public.shared_notes enable row level security;
alter table public.note_members enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists shared_notes_read_members on public.shared_notes;
create policy shared_notes_read_members on public.shared_notes for select to authenticated using (public.can_access_shared_note(id));
drop policy if exists note_members_read_members on public.note_members;
create policy note_members_read_members on public.note_members for select to authenticated using (public.can_access_shared_note(note_id));

revoke all on public.profiles, public.shared_notes, public.note_members from anon;
grant select on public.profiles, public.shared_notes, public.note_members to authenticated;

create or replace function public.create_shared_note(
  p_local_note_id text, p_note_type text, p_title text, p_content text
) returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz, collaborator_count bigint
) language plpgsql security definer set search_path = public
as $$ begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.shared_notes(owner_id, local_note_id, note_type, title, content, updated_by)
  values (auth.uid(), p_local_note_id, p_note_type, p_title, p_content, auth.uid())
  on conflict (owner_id, local_note_id) do update set
    title = excluded.title, content = excluded.content, note_type = excluded.note_type,
    revision = shared_notes.revision + 1, updated_by = auth.uid(), updated_at = now();
  return query select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, p.email, n.updated_at,
    (select count(*) from public.note_members m where m.note_id = n.id)
  from public.shared_notes n join public.profiles p on p.id = n.updated_by
  where n.owner_id = auth.uid() and n.local_note_id = p_local_note_id and n.deleted_at is null;
end $$;

create or replace function public.save_shared_note(
  p_note_id uuid, p_expected_revision bigint, p_title text, p_content text
) returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz
) language plpgsql security definer set search_path = public
as $$ begin
  if not public.can_access_shared_note(p_note_id) then raise exception 'You no longer have access to this note'; end if;
  update public.shared_notes n set title = p_title, content = p_content,
    revision = n.revision + 1, updated_by = auth.uid(), updated_at = now()
  where n.id = p_note_id and n.deleted_at is null and n.revision = p_expected_revision;
  if not found then raise exception using message = 'This note changed on another device. Reopen it before saving again.', errcode = '40001'; end if;
  return query select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, p.email, n.updated_at
  from public.shared_notes n join public.profiles p on p.id = n.updated_by where n.id = p_note_id;
end $$;

create or replace function public.list_shared_notes()
returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz, owner_email text,
  collaborator_count bigint, role text, is_owner boolean
) language sql stable security definer set search_path = public
as $$ select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
  n.updated_by, editor.email, n.updated_at, owner_profile.email,
  (select count(*) from public.note_members all_members where all_members.note_id = n.id),
  m.role, false
from public.note_members m
join public.shared_notes n on n.id = m.note_id and n.deleted_at is null
join public.profiles owner_profile on owner_profile.id = n.owner_id
join public.profiles editor on editor.id = n.updated_by
where m.user_id = auth.uid()
order by n.updated_at desc $$;

create or replace function public.get_shared_note(p_note_id uuid)
returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz, collaborator_count bigint
) language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.can_access_shared_note(p_note_id) then raise exception 'You no longer have access to this note'; end if;
  return query select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, p.email, n.updated_at,
    (select count(*) from public.note_members m where m.note_id = n.id)
  from public.shared_notes n join public.profiles p on p.id = n.updated_by
  where n.id = p_note_id and n.deleted_at is null;
end $$;

create or replace function public.list_note_members(p_note_id uuid)
returns table(user_id uuid, email text, role text, is_owner boolean)
language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.can_access_shared_note(p_note_id) then raise exception 'You do not have access to this note'; end if;
  return query
    select n.owner_id, p.email, 'owner'::text, true from public.shared_notes n join public.profiles p on p.id = n.owner_id where n.id = p_note_id
    union all
    select m.user_id, p.email, m.role, false from public.note_members m join public.profiles p on p.id = m.user_id where m.note_id = p_note_id
    order by is_owner desc, email;
end $$;

create or replace function public.remove_note_member(p_note_id uuid, p_user_id uuid)
returns table(collaborator_count bigint) language plpgsql security definer set search_path = public
as $$ begin
  if not exists(select 1 from public.shared_notes where id = p_note_id and owner_id = auth.uid()) then
    raise exception 'Only the owner can remove collaborators';
  end if;
  delete from public.note_members where note_id = p_note_id and user_id = p_user_id;
  return query select count(*) from public.note_members where note_id = p_note_id;
end $$;

create or replace function public.leave_shared_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public
as $$ begin delete from public.note_members where note_id = p_note_id and user_id = auth.uid(); end $$;

create or replace function public.delete_shared_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public
as $$ begin
  update public.shared_notes set deleted_at = now(), updated_at = now(), revision = revision + 1, updated_by = auth.uid()
  where id = p_note_id and owner_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Only the owner can delete this shared note'; end if;
end $$;

revoke all on function public.create_shared_note(text,text,text,text) from public, anon;
revoke all on function public.save_shared_note(uuid,bigint,text,text) from public, anon;
revoke all on function public.list_shared_notes() from public, anon;
revoke all on function public.get_shared_note(uuid) from public, anon;
revoke all on function public.list_note_members(uuid) from public, anon;
revoke all on function public.remove_note_member(uuid,uuid) from public, anon;
revoke all on function public.leave_shared_note(uuid) from public, anon;
revoke all on function public.delete_shared_note(uuid) from public, anon;
grant execute on function public.create_shared_note(text,text,text,text) to authenticated;
grant execute on function public.save_shared_note(uuid,bigint,text,text) to authenticated;
grant execute on function public.list_shared_notes() to authenticated;
grant execute on function public.get_shared_note(uuid) to authenticated;
grant execute on function public.list_note_members(uuid) to authenticated;
grant execute on function public.remove_note_member(uuid,uuid) to authenticated;
grant execute on function public.leave_shared_note(uuid) to authenticated;
grant execute on function public.delete_shared_note(uuid) to authenticated;

alter publication supabase_realtime add table public.shared_notes;
alter publication supabase_realtime add table public.note_members;
