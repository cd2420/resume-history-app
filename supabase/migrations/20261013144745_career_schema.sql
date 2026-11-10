-- Career data restored by the AI interview.
-- Every row is owned by a user and guarded by RLS so the schema works
-- unchanged when the service opens to more users.

create table public.careers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_name text not null check (char_length(company_name) between 1 and 200),
  company_desc text check (char_length(company_desc) <= 500),
  role text check (char_length(role) <= 200),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  constraint careers_period_check check (end_date is null or start_date is null or end_date >= start_date),
  constraint careers_id_user_unique unique (id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  career_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  summary text check (char_length(summary) <= 2000),
  my_role text check (char_length(my_role) <= 500),
  tech_stack text[] not null default '{}',
  team_size integer check (team_size > 0),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  constraint projects_period_check check (end_date is null or start_date is null or end_date >= start_date),
  constraint projects_id_user_unique unique (id, user_id),
  -- Composite key keeps a project inside its owner's career.
  constraint projects_career_fk foreign key (career_id, user_id)
    references public.careers (id, user_id) on delete cascade
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null,
  action text not null check (char_length(action) between 1 and 2000),
  decision text check (char_length(decision) <= 2000),
  impact text check (char_length(impact) <= 2000),
  created_at timestamptz not null default now(),
  constraint achievements_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index careers_user_id_idx on public.careers (user_id);
create index projects_user_id_idx on public.projects (user_id);
create index projects_career_id_idx on public.projects (career_id, user_id);
create index achievements_user_id_idx on public.achievements (user_id);
create index achievements_project_id_idx on public.achievements (project_id, user_id);

alter table public.careers enable row level security;
alter table public.projects enable row level security;
alter table public.achievements enable row level security;

create policy "Owners manage their careers" on public.careers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners manage their projects" on public.projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners manage their achievements" on public.achievements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
