-- 이력서랍 milestone 3: STAR summaries.
-- When the user ends a project, its (already generalized) logs become one STAR summary:
-- the book's summary page. `generated` keeps what the AI produced, with the evidence log ids
-- and the gaps it could not fill, so "saved without edits" can be measured later.

alter table public.projects add column ended_at timestamptz;

create table public.star_summaries (
  project_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- { situation|task|action|result: { text, evidence: uuid[], gaps: text[] } } as generated.
  generated jsonb not null,
  situation text not null check (char_length(situation) <= 2000),
  task text not null check (char_length(task) <= 2000),
  action text not null check (char_length(action) <= 2000),
  result text not null check (char_length(result) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'saved')),
  -- true when the saved text differs from the generated text (the M3 acceptance metric).
  edited boolean not null default false,
  generation_count smallint not null default 1 check (generation_count between 1 and 5),
  generated_at timestamptz not null default now(),
  saved_at timestamptz,
  constraint star_summaries_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index star_summaries_user_idx on public.star_summaries (user_id);

revoke all on public.star_summaries from anon, authenticated;
grant select, insert, update, delete on public.star_summaries to authenticated;
grant all on public.star_summaries to service_role;
alter table public.star_summaries enable row level security;

create policy "Owners manage their STAR summaries" on public.star_summaries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
