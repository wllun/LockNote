-- Allow only one account to edit a shared note at a time. A short renewable
-- lease prevents abandoned editor sessions from blocking the note forever.

alter table public.shared_notes
  add column if not exists edit_lock_user_id uuid
    references public.profiles(id) on delete set null;

alter table public.shared_notes
  add column if not exists edit_lock_expires_at timestamptz;

create or replace function public.acquire_shared_note_edit_lease(
  p_note_id uuid,
  p_lease_seconds integer default 90
) returns table (
  acquired boolean,
  lock_user_id uuid,
  lock_user_email text,
  lease_expires_at timestamptz
) language plpgsql security definer set search_path = public
as $$
declare
  v_lock_user_id uuid;
  v_lease_expires_at timestamptz;
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 90), 300));
begin
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
  set edit_lock_user_id = auth.uid(),
      edit_lock_expires_at = now() + make_interval(secs => v_lease_seconds)
  where n.id = p_note_id
    and n.deleted_at is null
    and (
      n.edit_lock_user_id is null
      or n.edit_lock_expires_at is null
      or n.edit_lock_expires_at <= now()
      or n.edit_lock_user_id = auth.uid()
    )
  returning n.edit_lock_user_id, n.edit_lock_expires_at
  into v_lock_user_id, v_lease_expires_at;

  if found then
    return query
    select true,
      v_lock_user_id,
      (select p.email from public.profiles p where p.id = v_lock_user_id),
      v_lease_expires_at;
    return;
  end if;

  return query
  select false, n.edit_lock_user_id, p.email, n.edit_lock_expires_at
  from public.shared_notes n
  left join public.profiles p on p.id = n.edit_lock_user_id
  where n.id = p_note_id and n.deleted_at is null;
end $$;

create or replace function public.release_shared_note_edit_lease(p_note_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_released boolean;
begin
  update public.shared_notes n
  set edit_lock_user_id = null,
      edit_lock_expires_at = null
  where n.id = p_note_id
    and n.edit_lock_user_id = auth.uid();
  v_released := found;
  return v_released;
end $$;

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

  if not exists (
    select 1
    from public.shared_notes n
    where n.id = p_note_id
      and n.edit_lock_user_id = auth.uid()
      and n.edit_lock_expires_at > now()
  ) then
    raise exception using
      message = 'Another collaborator is editing this note.',
      errcode = '55P03';
  end if;

  update public.shared_notes n
  set title = p_title,
      content = p_content,
      revision = n.revision + 1,
      updated_by = auth.uid(),
      updated_at = now(),
      edit_lock_expires_at = now() + interval '90 seconds'
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

revoke all on function public.acquire_shared_note_edit_lease(uuid,integer) from public, anon;
revoke all on function public.release_shared_note_edit_lease(uuid) from public, anon;
revoke all on function public.save_shared_note(uuid,bigint,text,text) from public, anon;

grant execute on function public.acquire_shared_note_edit_lease(uuid,integer) to authenticated;
grant execute on function public.release_shared_note_edit_lease(uuid) to authenticated;
grant execute on function public.save_shared_note(uuid,bigint,text,text) to authenticated;
