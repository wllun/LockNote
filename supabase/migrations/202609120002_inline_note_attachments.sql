-- Upgrade an existing image-attachment deployment from gallery ordering to
-- character-offset anchors. Fresh installs receive the same schema from the
-- preceding baseline migration.

alter table public.note_attachments
  add column if not exists anchor_offset integer not null default 0;

alter table public.note_attachments
  drop constraint if exists note_attachments_anchor_offset_check;
alter table public.note_attachments
  add constraint note_attachments_anchor_offset_check check (anchor_offset >= 0);

-- Remove the earlier overloads so only the current API remains callable.
drop function if exists public.register_note_attachment(
  text, text, uuid, text, text, integer, integer, integer, integer
);
drop function if exists public.reorder_note_attachments(text, uuid, text[]);
drop function if exists public.list_note_attachments(text, uuid);

create or replace function public.register_note_attachment(
  p_id text, p_local_note_id text, p_shared_note_id uuid, p_storage_path text,
  p_mime_type text, p_byte_size integer, p_width integer, p_height integer,
  p_display_order integer, p_anchor_offset integer
) returns void language plpgsql security definer set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing_owner uuid;
begin
  if auth.uid() is null or (p_shared_note_id is not null and not public.can_write_note_attachments(p_shared_note_id)) then
    raise exception 'You cannot add images to this note' using errcode = '42501';
  end if;
  if (p_shared_note_id is null) = (p_local_note_id is null) then
    raise exception 'Choose one note target';
  end if;
  if p_mime_type <> 'image/jpeg' or p_byte_size < 0 or p_byte_size >= 1048576
      or p_width <= 0 or p_height <= 0 or p_display_order not between 0 and 19
      or p_anchor_offset < 0 then
    raise exception 'Invalid attachment metadata';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid attachment path' using errcode = '42501';
  end if;

  if p_shared_note_id is not null then
    select owner_id into v_owner_id from public.shared_notes where id = p_shared_note_id;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_owner_id::text));
  select owner_id into v_existing_owner from public.note_attachments where id = p_id;

  if v_existing_owner is null and (
    select count(*) from public.note_attachments a
    where (p_shared_note_id is not null and a.shared_note_id = p_shared_note_id)
       or (p_shared_note_id is null and a.owner_id = v_owner_id and a.local_note_id = p_local_note_id)
  ) >= 20 then
    raise exception 'This note already has 20 images';
  end if;
  if coalesce((select sum(byte_size) from public.note_attachments where owner_id = v_owner_id), 0)
      - coalesce((select byte_size from public.note_attachments where id = p_id), 0)
      + p_byte_size > 2147483648::bigint then
    raise exception 'The 2 GB attachment storage limit has been reached';
  end if;

  insert into public.note_attachments (
    id, owner_id, local_note_id, shared_note_id, storage_path, mime_type,
    byte_size, width, height, display_order, anchor_offset, created_by, updated_at
  ) values (
    p_id, v_owner_id, p_local_note_id, p_shared_note_id, p_storage_path, p_mime_type,
    p_byte_size, p_width, p_height, p_display_order, p_anchor_offset, auth.uid(), now()
  ) on conflict (id) do update set
    local_note_id = excluded.local_note_id, shared_note_id = excluded.shared_note_id,
    storage_path = excluded.storage_path, byte_size = excluded.byte_size,
    width = excluded.width, height = excluded.height,
    display_order = excluded.display_order, anchor_offset = excluded.anchor_offset, updated_at = now()
  where note_attachments.owner_id = v_owner_id;
end;
$$;

create or replace function public.list_note_attachments(
  p_local_note_id text, p_shared_note_id uuid
) returns table (
  id text, storage_path text, mime_type text, byte_size integer,
  width integer, height integer, display_order integer, anchor_offset integer,
  created_at timestamptz, updated_at timestamptz
) language sql stable security definer set search_path = public
as $$
  select a.id, a.storage_path, a.mime_type, a.byte_size, a.width, a.height,
    a.display_order, a.anchor_offset, a.created_at, a.updated_at
  from public.note_attachments a
  where (
    p_shared_note_id is not null and a.shared_note_id = p_shared_note_id
      and public.can_access_shared_note(p_shared_note_id)
  ) or (
    p_shared_note_id is null and a.owner_id = auth.uid() and a.local_note_id = p_local_note_id
  )
  order by a.display_order, a.created_at, a.id;
$$;

create or replace function public.reorder_note_attachments(
  p_local_note_id text, p_shared_note_id uuid, p_layout jsonb
) returns void language plpgsql security definer set search_path = public
as $$ begin
  if coalesce(jsonb_array_length(p_layout), 0) > 20 or auth.uid() is null
      or (p_shared_note_id is not null and not public.can_write_note_attachments(p_shared_note_id)) then
    raise exception 'You cannot reorder images in this note' using errcode = '42501';
  end if;
  update public.note_attachments a set
    display_order = positions.display_order,
    anchor_offset = positions.anchor_offset,
    updated_at = now()
  from jsonb_to_recordset(coalesce(p_layout, '[]'::jsonb))
    as positions(id text, display_order integer, anchor_offset integer)
  where positions.display_order between 0 and 19 and positions.anchor_offset >= 0
    and a.id = positions.id and (
    (p_shared_note_id is not null and a.shared_note_id = p_shared_note_id)
    or (p_shared_note_id is null and a.owner_id = auth.uid() and a.local_note_id = p_local_note_id)
  );
end $$;

revoke all on function public.register_note_attachment(text,text,uuid,text,text,integer,integer,integer,integer,integer) from public, anon;
revoke all on function public.list_note_attachments(text,uuid) from public, anon;
revoke all on function public.reorder_note_attachments(text,uuid,jsonb) from public, anon;
grant execute on function public.register_note_attachment(text,text,uuid,text,text,integer,integer,integer,integer,integer) to authenticated;
grant execute on function public.list_note_attachments(text,uuid) to authenticated;
grant execute on function public.reorder_note_attachments(text,uuid,jsonb) to authenticated;
