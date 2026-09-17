-- Proposal 2. Subscription state is written only by trusted server functions.
create table public.user_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('free', 'plus', 'pro')),
  expires_at timestamptz,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from public, anon, authenticated;
grant select on public.user_subscriptions to authenticated;
grant all on public.user_subscriptions to service_role;
create policy subscription_read_self on public.user_subscriptions
  for select to authenticated using (user_id = auth.uid());

create function public.subscription_plan(p_owner uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select plan from public.user_subscriptions
    where user_id = p_owner and expires_at > now()), 'free');
$$;
create function public.subscription_limit(p_owner uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case public.subscription_plan(p_owner)
    when 'pro' then 786432000::bigint when 'plus' then 78643200::bigint
    else 26214400::bigint end;
$$;

-- Reserve a full image slot BEFORE Storage accepts a file. The policy below
-- prevents bypassing this reservation with a direct Storage upload. Retain the
-- funding owner after registration so shared editors' files count for the owner.
create table public.attachment_upload_reservations (
  storage_path text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  shared_note_id uuid references public.shared_notes(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.attachment_upload_reservations enable row level security;
revoke all on public.attachment_upload_reservations from public, anon, authenticated;
grant all on public.attachment_upload_reservations to service_role;

create function public.cloud_usage_bytes(p_owner uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(octet_length((to_jsonb(f) - 'server_updated_at')::text))
      from public.private_folders f where f.owner_id = p_owner), 0)
    + coalesce((select sum(octet_length((case when n.is_deleted
        then to_jsonb(n) - 'content' - 'title' else to_jsonb(n) end - 'server_updated_at')::text))
      from public.private_notes n where n.owner_id = p_owner), 0)
    + coalesce((select sum(octet_length((to_jsonb(n) - 'edit_lock_user_id' - 'edit_lock_expires_at')::text))
      from public.shared_notes n where n.owner_id = p_owner and n.deleted_at is null), 0)
    + coalesce((select sum(octet_length(to_jsonb(a)::text))
      from public.note_attachments a where a.owner_id = p_owner), 0)
    + coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 1048576))
      from storage.objects o
      left join public.attachment_upload_reservations r on r.storage_path = o.name
      left join public.note_attachments a on a.storage_path = o.name
      where o.bucket_id = 'note-attachments'
        and coalesce(a.owner_id, r.owner_id, case when split_part(o.name, '/', 1)
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(o.name, '/', 1)::uuid end) = p_owner), 0)
    + coalesce((select count(*) * 1048576::bigint
      from public.attachment_upload_reservations r
      where r.owner_id = p_owner and r.expires_at > now()
        and not exists (select 1 from storage.objects o where o.bucket_id = 'note-attachments' and o.name = r.storage_path)), 0);
$$;

create function public.get_subscription_access(p_include_usage boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan', public.subscription_plan(auth.uid()),
    'expires_at', (select expires_at from public.user_subscriptions where user_id = auth.uid()),
    'quota_bytes', public.subscription_limit(auth.uid()),
    'used_bytes', case when p_include_usage then public.cloud_usage_bytes(auth.uid()) else null end);
$$;
create function public.get_note_subscription_access(p_note_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan', public.subscription_plan(n.owner_id))
    from public.shared_notes n where n.id = p_note_id and n.deleted_at is null
      and public.can_access_shared_note(n.id);
$$;
create function public.can_add_note_images(p_shared_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.subscription_plan(n.owner_id) = 'pro'
      and public.can_write_note_attachments(n.id)
    from public.shared_notes n where n.id = p_shared_note_id and n.deleted_at is null), false);
$$;

-- Lock all cloud mutations for a funding account, including concurrent syncs
-- and uploads. Triggers cover RPCs AND direct table writes from older clients.
create function public.guard_premium_cloud_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if tg_table_name = 'note_members' then
    select owner_id into v_owner from public.shared_notes where id = new.note_id;
  else
    v_owner := new.owner_id;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_owner::text));
  perform set_config('locknote.quota_checked_' || replace(v_owner::text, '-', ''), '', true);
  if tg_table_name = 'note_members' then
    if public.subscription_plan(v_owner) = 'free' then
      raise exception 'Sharing requires an active Plus or Pro plan for the note owner';
    end if;
  elsif tg_table_name = 'shared_notes' then
    if (tg_op = 'INSERT' or new.title is distinct from old.title or new.content is distinct from old.content)
        and public.subscription_plan(v_owner) = 'free' then
      raise exception 'Collaboration is paused until the note owner subscribes to Plus or Pro';
    end if;
  elsif tg_table_name = 'private_folders' then
    if new.parent_id is not null and not new.is_deleted
        and ((tg_op = 'INSERT' and not exists (
          select 1 from public.private_folders f where f.owner_id = v_owner
            and f.local_id = new.local_id and f.parent_id = new.parent_id
        )) or (tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id))
        and public.subscription_plan(v_owner) <> 'pro' then
      raise exception 'Creating nested folders requires LockNote Pro';
    end if;
  elsif tg_table_name = 'note_attachments' then
    if public.subscription_plan(v_owner) <> 'pro' then
      raise exception 'Cloud image writes require an active Pro plan for the note owner';
    end if;
    if tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path then
      if not exists (select 1 from storage.objects o
          where o.bucket_id = 'note-attachments' and o.name = new.storage_path
            and (o.metadata->>'size')::bigint = new.byte_size) then
        raise exception 'Upload the image before registering its exact byte size';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Check growth against the final transaction snapshot, not halfway through a
-- multi-row sync. Shrinks, tombstones and lease renewals remain possible.
create function public.guard_cloud_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old_bytes bigint := 0; v_new_bytes bigint;
  v_check_key text := 'locknote.quota_checked_' || replace(new.owner_id::text, '-', '');
begin
  if tg_op = 'UPDATE' then
    v_old_bytes := octet_length((to_jsonb(old) - 'server_updated_at' - 'edit_lock_user_id' - 'edit_lock_expires_at')::text);
  end if;
  v_new_bytes := octet_length((to_jsonb(new) - 'server_updated_at' - 'edit_lock_user_id' - 'edit_lock_expires_at')::text);
  if v_new_bytes > v_old_bytes and coalesce(current_setting(v_check_key, true), '') <> 'checked' then
    if public.cloud_usage_bytes(new.owner_id) > public.subscription_limit(new.owner_id) then
      raise exception 'CLOUD_QUOTA_EXCEEDED: Your cloud storage is full. Local notes are safe. Upgrade your plan or recover cloud notes without uploading.';
    end if;
    -- Deferred events see the same final snapshot. Scan an owner's data once
    -- per transaction, not once per note in a large manual sync.
    perform set_config(v_check_key, 'checked', true);
  end if;
  return null;
end;
$$;
create trigger private_folders_premium before insert or update on public.private_folders
  for each row execute function public.guard_premium_cloud_write();
create trigger private_notes_premium before insert or update on public.private_notes
  for each row execute function public.guard_premium_cloud_write();
create trigger shared_notes_premium before insert or update on public.shared_notes
  for each row execute function public.guard_premium_cloud_write();
create trigger note_members_premium before insert or update on public.note_members
  for each row execute function public.guard_premium_cloud_write();
create trigger note_attachments_premium before insert or update on public.note_attachments
  for each row execute function public.guard_premium_cloud_write();
create constraint trigger private_folders_quota after insert or update on public.private_folders
  deferrable initially deferred for each row execute function public.guard_cloud_quota();
create constraint trigger private_notes_quota after insert or update on public.private_notes
  deferrable initially deferred for each row execute function public.guard_cloud_quota();
create constraint trigger shared_notes_quota after insert or update on public.shared_notes
  deferrable initially deferred for each row execute function public.guard_cloud_quota();
create constraint trigger note_attachments_quota after insert or update on public.note_attachments
  deferrable initially deferred for each row execute function public.guard_cloud_quota();

create function public.reserve_attachment_upload(p_id text, p_local_note_id text, p_shared_note_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_path text;
begin
  if auth.uid() is null or p_id is null or p_id !~ '^[a-zA-Z0-9_-]+$'
      or (p_local_note_id is null) = (p_shared_note_id is null) then raise exception 'Invalid image target'; end if;
  if p_shared_note_id is not null then
    if not public.can_write_note_attachments(p_shared_note_id) then raise exception 'This note is view only'; end if;
    select owner_id into v_owner from public.shared_notes where id = p_shared_note_id;
  elsif p_local_note_id !~ '^[a-zA-Z0-9_-]+$' then raise exception 'Invalid image target';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_owner::text));
  if public.subscription_plan(v_owner) <> 'pro' then raise exception 'Cloud image uploads require LockNote Pro'; end if;
  v_path := auth.uid()::text || '/' || coalesce(p_shared_note_id::text, p_local_note_id) || '/' || p_id || '.jpg';
  insert into public.attachment_upload_reservations(storage_path, owner_id, uploader_id, shared_note_id, expires_at)
    values (v_path, v_owner, auth.uid(), p_shared_note_id, now() + interval '15 minutes')
    on conflict (storage_path) do update set expires_at = excluded.expires_at
      where attachment_upload_reservations.owner_id = v_owner and attachment_upload_reservations.uploader_id = auth.uid();
  if public.cloud_usage_bytes(v_owner) > public.subscription_limit(v_owner) then
    raise exception 'CLOUD_QUOTA_EXCEEDED: Your cloud storage is full. Local images are safe.';
  end if;
  return v_path;
end;
$$;
create function public.can_upload_reserved_attachment(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attachment_upload_reservations r
    where r.storage_path = p_path and r.uploader_id = auth.uid() and r.expires_at > now()
      and public.subscription_plan(r.owner_id) = 'pro'
      and (r.shared_note_id is null or public.can_write_note_attachments(r.shared_note_id)));
$$;
drop policy "Upload attachment objects" on storage.objects;
create policy "Upload attachment objects" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-attachments' and public.can_upload_reserved_attachment(name));

-- Deny edit leases on expired owner plans while leaving shared reads intact.
-- Use the named constraint: RETURNS TABLE's owner_id output otherwise makes
-- the older RPC's ON CONFLICT (owner_id, local_note_id) ambiguous in PostgreSQL.
create or replace function public.create_shared_note(
  p_local_note_id text, p_note_type text, p_title text, p_content text
) returns table (
  id uuid, owner_id uuid, note_type text, title text, content text, revision bigint,
  updated_by uuid, updated_by_email text, updated_at timestamptz, collaborator_count bigint
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.shared_notes(owner_id, local_note_id, note_type, title, content, updated_by)
    values (auth.uid(), p_local_note_id, p_note_type, p_title, p_content, auth.uid())
    on conflict on constraint shared_notes_owner_id_local_note_id_key do update set
      title = excluded.title, content = excluded.content, note_type = excluded.note_type,
      revision = shared_notes.revision + 1, updated_by = auth.uid(), updated_at = now();
  return query select n.id, n.owner_id, n.note_type, n.title, n.content, n.revision,
    n.updated_by, p.email, n.updated_at,
    (select count(*) from public.note_members m where m.note_id = n.id)
    from public.shared_notes n join public.profiles p on p.id = n.updated_by
    where n.owner_id = auth.uid() and n.local_note_id = p_local_note_id and n.deleted_at is null;
end;
$$;
alter function public.acquire_shared_note_edit_lease(uuid, integer) rename to acquire_shared_note_edit_lease_unchecked;
revoke all on function public.acquire_shared_note_edit_lease_unchecked(uuid,integer) from public, anon, authenticated;
create function public.acquire_shared_note_edit_lease(p_note_id uuid, p_lease_seconds integer default 90)
returns table (acquired boolean, lock_user_id uuid, lock_user_email text, lease_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shared_notes n where n.id = p_note_id
      and public.can_access_shared_note(n.id) and public.subscription_plan(n.owner_id) <> 'free') then
    raise exception 'Collaboration is paused until the note owner subscribes to Plus or Pro';
  end if;
  return query select * from public.acquire_shared_note_edit_lease_unchecked(p_note_id, p_lease_seconds);
end;
$$;

-- An empty-payload call is a read-only snapshot even for over-quota accounts.
create function public.recover_private_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'folders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.local_id, 'parent_id', f.parent_id, 'name', f.name, 'password', f.password_hash,
      'is_pinned', f.is_pinned, 'is_archived', f.is_archived, 'is_deleted', f.is_deleted,
      'created_at', f.client_created_at, 'updated_at', f.client_updated_at))
      from public.private_folders f where f.owner_id = auth.uid()), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.local_id, 'folder_id', n.folder_id, 'title', n.title, 'content', n.content,
      'note_type', n.note_type, 'password', n.password_hash, 'is_pinned', n.is_pinned,
      'is_archived', n.is_archived, 'is_deleted', n.is_deleted, 'collaboration', n.collaboration,
      'created_at', n.client_created_at, 'updated_at', n.client_updated_at))
      from public.private_notes n where n.owner_id = auth.uid()), '[]'::jsonb));
$$;

-- Canonical RevenueCat snapshots, not plans or event timestamps sent by the app.
-- A slow older webhook cannot replace a more recently fetched snapshot.
create function public.apply_verified_subscription(p_user_id uuid, p_plan text, p_expires_at timestamptz, p_checked_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  insert into public.user_subscriptions(user_id, plan, expires_at, checked_at)
    values (p_user_id, p_plan, p_expires_at, p_checked_at)
    on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at,
      checked_at = excluded.checked_at, updated_at = now()
      where user_subscriptions.checked_at <= excluded.checked_at;
end;
$$;
revoke all on function public.apply_verified_subscription(uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_subscription(uuid,text,timestamptz,timestamptz) to service_role;

revoke all on function public.subscription_plan(uuid), public.subscription_limit(uuid), public.cloud_usage_bytes(uuid),
  public.guard_premium_cloud_write(), public.guard_cloud_quota(), public.get_subscription_access(boolean),
  public.get_note_subscription_access(uuid), public.can_add_note_images(uuid),
  public.reserve_attachment_upload(text,text,uuid), public.can_upload_reserved_attachment(text),
  public.acquire_shared_note_edit_lease(uuid,integer), public.recover_private_data() from public, anon;
grant execute on function public.get_subscription_access(boolean), public.get_note_subscription_access(uuid),
  public.can_add_note_images(uuid), public.reserve_attachment_upload(text,text,uuid),
  public.can_upload_reserved_attachment(text), public.acquire_shared_note_edit_lease(uuid,integer),
  public.recover_private_data() to authenticated;
