-- Sharing is owner-funded, including reads. Retain notes/memberships so renewal
-- restores sharing; expiry must not delete the owner's data or recipients.
begin;

create or replace function public.can_access_shared_note(p_note_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shared_notes n
    where n.id = p_note_id and n.deleted_at is null
      and (n.owner_id = auth.uid() or (
        public.subscription_plan(n.owner_id) in ('plus', 'pro')
        and exists (select 1 from public.note_members m
          where m.note_id = n.id and m.user_id = auth.uid())
      ))
  );
$$;

-- This content-free RPC also explains suspension to an existing recipient.
-- Do not require paid access here: only the owner or a retained member may read
-- this limited metadata; strangers still receive no result.
create or replace function public.get_note_subscription_access(p_note_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'plan', public.subscription_plan(n.owner_id),
    'expires_at', s.expires_at,
    'can_view', public.can_access_shared_note(n.id)
  )
  from public.shared_notes n
  left join public.user_subscriptions s on s.user_id = n.owner_id
  where n.id = p_note_id and n.deleted_at is null
    and (n.owner_id = auth.uid() or exists (
      select 1 from public.note_members m
      where m.note_id = n.id and m.user_id = auth.uid()
    ));
$$;

-- SECURITY DEFINER list RPCs must apply the same policy as table RLS. Include
-- expiry metadata so a mounted list can hide a note at the known deadline.
drop function public.list_shared_notes();
create function public.list_shared_notes()
returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz, owner_email text,
  collaborator_count bigint, role text, is_owner boolean,
  owner_plan text, owner_subscription_expires_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, editor.email, n.updated_at, owner_profile.email,
    (select count(*) from public.note_members all_members where all_members.note_id = n.id),
    m.role, false, public.subscription_plan(n.owner_id), s.expires_at
  from public.note_members m
  join public.shared_notes n on n.id = m.note_id and n.deleted_at is null
  join public.profiles owner_profile on owner_profile.id = n.owner_id
  join public.profiles editor on editor.id = n.updated_by
  left join public.user_subscriptions s on s.user_id = n.owner_id
  where m.user_id = auth.uid() and public.can_access_shared_note(n.id)
  order by n.updated_at desc;
$$;

-- Existing attachment metadata/download RLS uses can_access_shared_note.
-- Also block recipient removal/reordering RPCs after suspension.
create or replace function public.can_write_note_attachments(p_shared_note_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and p_shared_note_id is not null and exists (
    select 1 from public.shared_notes n
    where n.id = p_shared_note_id and n.deleted_at is null and n.note_type = 'note'
      and public.can_access_shared_note(n.id)
      and (n.owner_id = auth.uid() or exists (
        select 1 from public.note_members m
        where m.note_id = n.id and m.user_id = auth.uid() and m.role = 'editor'
      ))
  );
$$;

-- A lease acquired before subscription expiry must not allow even an unchanged
-- save to return note content after expiry. Keep revision/lease checks intact.
alter function public.save_shared_note(uuid, bigint, text, text)
  rename to save_shared_note_subscription_unchecked;
revoke all on function public.save_shared_note_subscription_unchecked(uuid,bigint,text,text)
  from public, anon, authenticated;
create function public.save_shared_note(
  p_note_id uuid, p_expected_revision bigint, p_title text, p_content text
)
returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.shared_notes n
      where n.id = p_note_id and n.deleted_at is null
        and public.can_access_shared_note(n.id)
        and public.subscription_plan(n.owner_id) in ('plus', 'pro')) then
    raise exception using message = 'Sharing is unavailable. The owner needs an active Plus or Pro subscription.',
      errcode = '42501';
  end if;
  return query select * from public.save_shared_note_subscription_unchecked(
    p_note_id, p_expected_revision, p_title, p_content
  );
end;
$$;

revoke all on function public.can_access_shared_note(uuid),
  public.get_note_subscription_access(uuid), public.list_shared_notes(),
  public.can_write_note_attachments(uuid), public.save_shared_note(uuid,bigint,text,text)
  from public, anon;
grant execute on function public.can_access_shared_note(uuid),
  public.get_note_subscription_access(uuid), public.list_shared_notes(),
  public.can_write_note_attachments(uuid), public.save_shared_note(uuid,bigint,text,text)
  to authenticated;

commit;
