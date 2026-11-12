-- Google Drive as the primary photo store.
-- Run this only if you already applied 0001 before these columns existed.

alter table public.question_attachments
  add column if not exists remote_provider text,
  add column if not exists remote_file_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'question_attachments_remote_provider_check'
  ) then
    alter table public.question_attachments
      add constraint question_attachments_remote_provider_check
      check (remote_provider in ('drive', 'supabase'));
  end if;
end $$;

create index if not exists attachments_drive_file_idx
  on public.question_attachments (remote_file_id)
  where remote_file_id is not null;
