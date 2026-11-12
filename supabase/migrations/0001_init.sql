-- SSC Revision Vault — initial schema
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- Every table is owner-scoped with Row Level Security, so a second account can
-- never read or write another account's rows.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------- subjects
create table if not exists public.subjects (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#3157D5',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subjects_user_idx on public.subjects (user_id, position);

-- ---------------------------------------------------------------- chapters
create table if not exists public.chapters (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text not null references public.subjects (id) on delete cascade,
  parent_id text references public.chapters (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chapters_user_subject_idx on public.chapters (user_id, subject_id, position);
create index if not exists chapters_parent_idx on public.chapters (parent_id);

-- ------------------------------------------------------------------ topics
create table if not exists public.topics (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter_id text not null references public.chapters (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topics_chapter_idx on public.topics (chapter_id);

-- --------------------------------------------------------------- questions
create table if not exists public.questions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_text text not null default '',
  question_image_path text,
  subject_id text not null references public.subjects (id) on delete cascade,
  primary_chapter_id text references public.chapters (id) on delete set null,
  topic_id text references public.topics (id) on delete set null,
  source_type text not null default 'mock'
    check (source_type in ('mock', 'pyq', 'book', 'practice', 'other')),
  source_name text,
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  personal_remark text,
  solution_text text,
  is_bookmarked boolean not null default false,
  is_difficult boolean not null default false,
  question_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questions_user_chapter_idx on public.questions (user_id, primary_chapter_id);
create index if not exists questions_user_created_idx on public.questions (user_id, created_at desc);
create index if not exists questions_user_flags_idx on public.questions (user_id, is_bookmarked, is_difficult);
create index if not exists questions_updated_idx on public.questions (user_id, updated_at);

-- ------------------------------------------- optional extra chapter links
create table if not exists public.question_chapters (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  chapter_id text not null references public.chapters (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, chapter_id)
);

create index if not exists question_chapters_chapter_idx on public.question_chapters (chapter_id);

-- ------------------------------------------------------------- attachments
create table if not exists public.question_attachments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text references public.questions (id) on delete cascade,
  note_id text,
  kind text not null check (kind in ('question_image', 'solution', 'note_photo')),
  storage_path text,
  remote_provider text check (remote_provider in ('drive', 'supabase')),
  remote_file_id text,
  display_order integer not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attachment_owner check (question_id is not null or note_id is not null)
);

create index if not exists attachments_question_idx on public.question_attachments (question_id, kind, display_order);
create index if not exists attachments_note_idx on public.question_attachments (note_id);

-- ------------------------------------------------------------ chapter_notes
create table if not exists public.chapter_notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter_id text not null unique references public.chapters (id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- formulas
create table if not exists public.formulas (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text not null references public.subjects (id) on delete cascade,
  chapter_id text references public.chapters (id) on delete set null,
  title text not null,
  expression text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists formulas_user_idx on public.formulas (user_id, subject_id);

-- --------------------------------------------------------- revision_history
create table if not exists public.revision_history (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  chapter_id text references public.chapters (id) on delete set null,
  revised_at timestamptz not null default now(),
  status text not null default 'revised'
    check (status in ('revised', 'shaky', 'incorrect')),
  feedback text
);

create index if not exists revisions_question_idx on public.revision_history (question_id, revised_at desc);
create index if not exists revisions_chapter_idx on public.revision_history (chapter_id, revised_at desc);
create index if not exists revisions_user_idx on public.revision_history (user_id, revised_at desc);

-- -------------------------------------------------------------------- tags
create table if not exists public.tags (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.question_tags (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  tag_id text not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, tag_id)
);

create index if not exists question_tags_tag_idx on public.question_tags (tag_id);

-- attachment.note_id references notes created after this table: add the FK now
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachments_note_fk'
  ) then
    alter table public.question_attachments
      add constraint attachments_note_fk
      foreign key (note_id) references public.chapter_notes (id) on delete cascade;
  end if;
end $$;

-- -------------------------------------------------------------------- RLS
do $$
declare
  t text;
begin
  foreach t in array array[
    'subjects', 'chapters', 'topics', 'questions', 'question_chapters',
    'question_attachments', 'chapter_notes', 'formulas', 'revision_history',
    'tags', 'question_tags'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_owner_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t || '_owner_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', t || '_owner_delete', t);
  end loop;
end $$;

-- ------------------------------------------------------------ new-user hook
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  -- Files are stored as <user-id>/<question-or-note-id>/<attachment-id>.jpg
  drop policy if exists "attachments owner read" on storage.objects;
  create policy "attachments owner read" on storage.objects
    for select using (
      bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "attachments owner insert" on storage.objects;
  create policy "attachments owner insert" on storage.objects
    for insert with check (
      bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "attachments owner update" on storage.objects;
  create policy "attachments owner update" on storage.objects
    for update using (
      bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "attachments owner delete" on storage.objects;
  create policy "attachments owner delete" on storage.objects
    for delete using (
      bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    );
end $$;
