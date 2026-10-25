-- Recipe content uses the existing note row; photos use the existing private
-- attachment bucket and Pro/quota enforcement. No new tables or public access.
begin;

alter table public.private_notes drop constraint if exists private_notes_note_type_check;
alter table public.private_notes add constraint private_notes_note_type_check
  check (note_type in ('note', 'checklist', 'expense', 'reminder', 'recipe'));

alter table public.shared_notes drop constraint if exists shared_notes_note_type_check;
alter table public.shared_notes add constraint shared_notes_note_type_check
  check (note_type in ('note', 'checklist', 'expense', 'reminder', 'recipe'));

-- Preserve subscription suspension and editor/owner authorization from the
-- preceding migration; only extend the eligible attachment-bearing note types.
create or replace function public.can_write_note_attachments(p_shared_note_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and p_shared_note_id is not null and exists (
    select 1 from public.shared_notes n
    where n.id = p_shared_note_id and n.deleted_at is null
      and n.note_type in ('note', 'recipe')
      and public.can_access_shared_note(n.id)
      and (n.owner_id = auth.uid() or exists (
        select 1 from public.note_members m
        where m.note_id = n.id and m.user_id = auth.uid() and m.role = 'editor'
      ))
  );
$$;

commit;
