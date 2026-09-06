-- Add per-collaborator edit and view-only permissions.
-- Existing collaborators remain editors for backwards compatibility.

alter table public.note_members
  drop constraint if exists note_members_role_check;

alter table public.note_members
  add constraint note_members_role_check
  check (role in ('editor', 'viewer'));

create or replace function public.save_shared_note(
  p_note_id uuid, p_expected_revision bigint, p_title text, p_content text
) returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz
) language plpgsql security definer set search_path = public
as $$ begin
  if not exists (
    select 1
    from public.shared_notes n
    where n.id = p_note_id
      and n.deleted_at is null
      and (
        n.owner_id = auth.uid()
        or exists (
          select 1
          from public.note_members m
          where m.note_id = n.id
            and m.user_id = auth.uid()
            and m.role = 'editor'
        )
      )
  ) then
    raise exception using
      message = 'This note is view only. Ask the owner for edit access.',
      errcode = '42501';
  end if;

  update public.shared_notes n
  set title = p_title,
      content = p_content,
      revision = n.revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where n.id = p_note_id
    and n.deleted_at is null
    and n.revision = p_expected_revision;

  if not found then
    raise exception using
      message = 'This note changed on another device. Reopen it before saving again.',
      errcode = '40001';
  end if;

  return query
  select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, p.email, n.updated_at
  from public.shared_notes n
  join public.profiles p on p.id = n.updated_by
  where n.id = p_note_id;
end $$;

drop function if exists public.get_shared_note(uuid);

create function public.get_shared_note(p_note_id uuid)
returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz,
  collaborator_count bigint, role text, is_owner boolean
) language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.can_access_shared_note(p_note_id) then
    raise exception 'You no longer have access to this note';
  end if;

  return query
  select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, editor.email, n.updated_at,
    (select count(*) from public.note_members all_members where all_members.note_id = n.id),
    case when n.owner_id = auth.uid() then 'owner'::text else current_member.role end,
    n.owner_id = auth.uid()
  from public.shared_notes n
  join public.profiles editor on editor.id = n.updated_by
  left join public.note_members current_member
    on current_member.note_id = n.id and current_member.user_id = auth.uid()
  where n.id = p_note_id and n.deleted_at is null;
end $$;

create or replace function public.update_note_member_role(
  p_note_id uuid, p_user_id uuid, p_role text
) returns table(role text)
language plpgsql security definer set search_path = public
as $$ begin
  if p_role not in ('editor', 'viewer') then
    raise exception 'Choose either editor or viewer access';
  end if;

  if not exists (
    select 1 from public.shared_notes
    where id = p_note_id and owner_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'Only the owner can change collaborator access';
  end if;

  update public.note_members m
  set role = p_role
  where m.note_id = p_note_id and m.user_id = p_user_id;

  if not found then
    raise exception 'This collaborator no longer has access';
  end if;

  return query
  select m.role
  from public.note_members m
  where m.note_id = p_note_id and m.user_id = p_user_id;
end $$;

revoke all on function public.save_shared_note(uuid,bigint,text,text) from public, anon;
revoke all on function public.get_shared_note(uuid) from public, anon;
revoke all on function public.update_note_member_role(uuid,uuid,text) from public, anon;

grant execute on function public.save_shared_note(uuid,bigint,text,text) to authenticated;
grant execute on function public.get_shared_note(uuid) to authenticated;
grant execute on function public.update_note_member_role(uuid,uuid,text) to authenticated;
