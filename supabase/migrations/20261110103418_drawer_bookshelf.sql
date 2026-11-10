-- 이력서랍 milestone 2: the web bookshelf.
-- Projects are books on user-named shelves (shelf_id null = the "newly shelved" shelf),
-- daily logs carry up to 5 skill tags, and two security-invoker functions serve the
-- bookshelf and page-level search under the caller's RLS.

-- A CHECK constraint cannot hold a subquery, so tag rules live in an immutable function.
create function private.valid_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(tags) <= 5
    and not exists (
      select 1 from unnest(tags) as t(tag)
      where tag is null or char_length(tag) not between 1 and 30
    );
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.valid_tags(text[]) to authenticated, service_role;

create table public.shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint shelves_id_user_unique unique (id, user_id)
);

create index shelves_user_position_idx on public.shelves (user_id, position);

alter table public.projects add column shelf_id uuid;
-- Deleting a shelf puts its books back on the "newly shelved" shelf.
alter table public.projects add constraint projects_shelf_fk foreign key (shelf_id, user_id)
  references public.shelves (id, user_id) on delete set null (shelf_id);
create index projects_shelf_idx on public.projects (shelf_id, user_id);

alter table public.daily_logs add column tags text[] not null default '{}';
alter table public.daily_logs add constraint daily_logs_tags_check check (private.valid_tags(tags));
create index daily_logs_tags_idx on public.daily_logs using gin (tags);

alter table public.pending_logs add column tags text[] not null default '{}';
alter table public.pending_logs add constraint pending_logs_tags_check check (private.valid_tags(tags));

revoke all on public.shelves from anon, authenticated;
grant select, insert, update, delete on public.shelves to authenticated;
grant all on public.shelves to service_role;
alter table public.shelves enable row level security;

create policy "Owners manage their shelves" on public.shelves
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The card's tags travel with it into the daily log, also when the text was rewritten.
create or replace function public.drawer_save_pending_log(
  p_user_id uuid,
  p_pending_id uuid,
  p_content text,
  p_edited boolean,
  p_log_date date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pending public.pending_logs;
  v_log_id uuid;
begin
  delete from public.pending_logs
  where id = p_pending_id and user_id = p_user_id and expires_at > now()
  returning * into v_pending;

  if v_pending.id is null then
    return null;
  end if;

  insert into public.daily_logs (user_id, project_id, log_date, content, source, edited, tags)
  values (p_user_id, v_pending.project_id, p_log_date, p_content, 'telegram', p_edited, v_pending.tags)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- One row per book of the caller: shelf, period, size and the 3 most used tags.
create function public.drawer_bookshelf()
returns table (
  book_id uuid,
  title text,
  shelf_id uuid,
  first_log date,
  last_log date,
  log_count bigint,
  top_tags text[],
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.title,
    p.shelf_id,
    min(d.log_date),
    max(d.log_date),
    count(d.id),
    coalesce((
      select array_agg(t.tag order by t.uses desc, t.latest desc, t.tag)
      from (
        select tag, count(*) as uses, max(d2.log_date) as latest
        from public.daily_logs d2, unnest(d2.tags) as tag
        where d2.project_id = p.id and d2.user_id = p.user_id
        group by tag
        order by count(*) desc, max(d2.log_date) desc, tag
        limit 3
      ) t
    ), '{}'),
    p.created_at
  from public.projects p
  left join public.daily_logs d on d.project_id = p.id and d.user_id = p.user_id
  where p.user_id = (select auth.uid())
  group by p.id;
$$;

-- Page-level search. Plain case-insensitive containment: Postgres ships no Korean
-- full-text parser, and a user has hundreds of logs, not millions.
create function public.drawer_search_logs(
  p_query text default null,
  p_tag text default null,
  p_from date default null,
  p_to date default null
)
returns table (
  log_id uuid,
  book_id uuid,
  book_title text,
  shelf_name text,
  log_date date,
  content text,
  tags text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, p.id, p.title, s.name, d.log_date, d.content, d.tags
  from public.daily_logs d
  join public.projects p on p.id = d.project_id and p.user_id = d.user_id
  left join public.shelves s on s.id = p.shelf_id and s.user_id = p.user_id
  where d.user_id = (select auth.uid())
    and (
      p_query is null
      or position(lower(p_query) in lower(d.content)) > 0
      or position(lower(p_query) in lower(p.title)) > 0
      or exists (select 1 from unnest(d.tags) as t(tag) where lower(tag) = lower(p_query))
    )
    and (p_tag is null or exists (select 1 from unnest(d.tags) as t(tag) where lower(tag) = lower(p_tag)))
    and (p_from is null or d.log_date >= p_from)
    and (p_to is null or d.log_date <= p_to)
  order by d.log_date desc, d.created_at desc
  limit 200;
$$;

revoke execute on function public.drawer_bookshelf() from public, anon;
revoke execute on function public.drawer_search_logs(text, text, date, date) from public, anon;
grant execute on function public.drawer_bookshelf() to authenticated, service_role;
grant execute on function public.drawer_search_logs(text, text, date, date) to authenticated, service_role;
