-- 이력서랍: recording sessions.
-- The bot only processes answers inside a session, opened by the hourly prompt or by the
-- user ([지금 기록하기] / /record), closed on save/cancel or at KST midnight. Each of the
-- three answers is generalized right away and stored here; raw text is never stored.

create table public.record_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  chat_id bigint not null,
  kst_date date not null,
  source text not null check (source in ('notify', 'user')),
  status text not null default 'open' check (status in ('open', 'carded', 'cancelled')),
  step smallint not null default 1 check (step between 1 and 3),
  task text check (char_length(task) <= 1000),
  role text check (char_length(role) <= 1000),
  result text check (char_length(result) <= 1000),
  change_categories text[] not null default '{}',
  tags text[] not null default '{}',
  ai_calls smallint not null default 0 check (ai_calls >= 0),
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint record_sessions_tags_check check (private.valid_tags(tags)),
  constraint record_sessions_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

-- At most one open session per user.
create unique index record_sessions_one_open_idx on public.record_sessions (user_id) where status = 'open';
create index record_sessions_user_date_idx on public.record_sessions (user_id, kst_date);
create index record_sessions_project_idx on public.record_sessions (project_id, user_id);

revoke all on public.record_sessions from anon, authenticated;
grant all on public.record_sessions to service_role;
alter table public.record_sessions enable row level security;
-- No authenticated policies: the webhook (service_role) is the only reader and writer.

-- Opens a session in one transaction: closes the user's expired open session, reuses a
-- still-open one, and enforces the daily session limit.
create function public.drawer_open_session(
  p_user_id uuid,
  p_project_id uuid,
  p_chat_id bigint,
  p_kst_date date,
  p_source text,
  p_expires_at timestamptz,
  p_daily_limit integer
)
returns table (outcome text, session_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.record_sessions
  set status = 'cancelled'
  where user_id = p_user_id and status = 'open' and expires_at <= now();

  select id into v_id
  from public.record_sessions
  where user_id = p_user_id and status = 'open'
  for update;
  if v_id is not null then
    return query select 'exists'::text, v_id;
    return;
  end if;

  if (select count(*) from public.record_sessions where user_id = p_user_id and kst_date = p_kst_date) >= p_daily_limit then
    return query select 'limit'::text, null::uuid;
    return;
  end if;

  insert into public.record_sessions (user_id, project_id, chat_id, kst_date, source, expires_at)
  values (p_user_id, p_project_id, p_chat_id, p_kst_date, p_source, p_expires_at)
  returning id into v_id;
  return query select 'opened'::text, v_id;
end;
$$;

revoke execute on function public.drawer_open_session(uuid, uuid, bigint, date, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.drawer_open_session(uuid, uuid, bigint, date, text, timestamptz, integer)
  to service_role;

-- The hourly prompt also skips users who are in the middle of a session today.
create or replace function public.drawer_due_notifications(p_hour smallint, p_kst_date date)
returns table (user_id uuid, chat_id bigint)
language sql
stable
set search_path = ''
as $$
  select p.user_id, l.chat_id
  from public.profiles p
  join public.telegram_links l on l.user_id = p.user_id and l.blocked_at is null
  where p.notify_hour = p_hour
    and not exists (
      select 1 from public.daily_logs d
      where d.user_id = p.user_id and d.log_date = p_kst_date
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.user_id and n.kst_date = p_kst_date
    )
    and not exists (
      select 1 from public.record_sessions s
      where s.user_id = p.user_id and s.kst_date = p_kst_date and s.status = 'open'
    );
$$;

-- Housekeeping: sessions only hold generalized text, but are not needed after a week.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'drawer-cleanup',
      '17 * * * *',
      $job$
      delete from public.telegram_updates where received_at < now() - interval '7 days';
      delete from public.pending_logs where expires_at < now();
      delete from public.telegram_link_tokens where expires_at < now() - interval '1 day';
      delete from public.record_sessions where opened_at < now() - interval '7 days';
      $job$
    );
  end if;
end
$$;
