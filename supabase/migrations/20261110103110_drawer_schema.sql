-- 이력서랍 milestone 1: Telegram daily logs.
-- Web reads and edits go through RLS (auth.uid() = user_id). The Telegram webhook and
-- the hourly notifier use the secret key (service_role), which bypasses RLS, so the
-- functions they call take the owner explicitly and are executable by service_role only.
-- Raw chat text is never stored: daily_logs and pending_logs hold generalized text or
-- text the user rewrote themselves.

create schema if not exists private;

-- Bot-created projects have no company yet; the user can attach one on the web.
-- The composite FK (career_id, user_id) is MATCH SIMPLE, so a null career_id skips it.
alter table public.projects alter column career_id drop not null;

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  notify_hour smallint check (notify_hour between 0 and 23),
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  current_project_id uuid,
  created_at timestamptz not null default now(),
  constraint profiles_current_project_fk foreign key (current_project_id, user_id)
    references public.projects (id, user_id) on delete set null (current_project_id)
);

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('privacy', 'overseas_transfer')),
  version text not null check (char_length(version) between 1 and 50),
  agreed_at timestamptz not null default now()
);

-- Only the SHA-256 hash of a deep-link token is stored.
create table public.telegram_link_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  linked_at timestamptz not null default now(),
  blocked_at timestamptz
);

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null,
  log_date date not null,
  content text not null check (char_length(content) between 1 and 1000),
  source text not null check (source in ('telegram', 'web')),
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_logs_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create table public.pending_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  generalized text not null check (char_length(generalized) between 1 and 1000),
  change_categories text[] not null default '{}',
  state text not null default 'confirm' check (state in ('confirm', 'edit')),
  chat_id bigint not null,
  card_message_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint pending_logs_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kst_date date not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'blocked')),
  sent_at timestamptz not null default now(),
  constraint notifications_once_per_day unique (user_id, kst_date)
);

create table public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

create index consents_user_id_idx on public.consents (user_id);
create index telegram_link_tokens_user_id_idx on public.telegram_link_tokens (user_id);
create index daily_logs_user_date_idx on public.daily_logs (user_id, log_date);
create index daily_logs_project_idx on public.daily_logs (project_id, user_id);
create index pending_logs_user_idx on public.pending_logs (user_id, state);
create index pending_logs_project_idx on public.pending_logs (project_id, user_id);
create index profiles_current_project_idx on public.profiles (current_project_id, user_id);
create index profiles_notify_hour_idx on public.profiles (notify_hour) where notify_hour is not null;
create index telegram_updates_received_at_idx on public.telegram_updates (received_at);

-- Keep updated_at honest for web edits.
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger daily_logs_touch_updated_at
  before update on public.daily_logs
  for each row execute function private.touch_updated_at();

-- Every account gets a profile row; the web only updates it.
create function private.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function private.create_profile_for_user();

insert into public.profiles (user_id)
select id from auth.users
on conflict do nothing;

-- Privileges: anon gets nothing; authenticated only what RLS policies allow.
revoke all on public.profiles, public.consents, public.telegram_link_tokens,
  public.telegram_links, public.daily_logs, public.pending_logs,
  public.notifications, public.telegram_updates from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert on public.consents to authenticated;
grant insert on public.telegram_link_tokens to authenticated;
grant select, delete on public.telegram_links to authenticated;
grant select, insert, update, delete on public.daily_logs to authenticated;
grant select on public.notifications to authenticated;

grant all on public.profiles, public.consents, public.telegram_link_tokens,
  public.telegram_links, public.daily_logs, public.pending_logs,
  public.notifications, public.telegram_updates to service_role;

alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.telegram_links enable row level security;
alter table public.daily_logs enable row level security;
alter table public.pending_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.telegram_updates enable row level security;

create policy "Owners read their profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners update their profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners read their consents" on public.consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners record their consents" on public.consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- A user can only mint short-lived tokens for their own account.
create policy "Owners create their link tokens" on public.telegram_link_tokens
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and used_at is null
    and expires_at <= now() + interval '10 minutes'
  );

create policy "Owners read their telegram link" on public.telegram_links
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners remove their telegram link" on public.telegram_links
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners manage their daily logs" on public.daily_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners read their notifications" on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- pending_logs and telegram_updates have no authenticated policies: service_role only.

-- ---------------------------------------------------------------------------
-- service_role functions (Telegram webhook and hourly notifier)
-- ---------------------------------------------------------------------------

-- Links the Telegram account in one transaction: the token is single-use, unexpired,
-- and a Telegram account can belong to only one user.
create function public.drawer_link_telegram(
  p_token_hash text,
  p_telegram_user_id bigint,
  p_chat_id bigint
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.telegram_link_tokens
  where token_hash = p_token_hash
    and used_at is null
    and expires_at > now()
  for update;

  if v_user_id is null then
    return 'invalid';
  end if;

  if exists (
    select 1 from public.telegram_links
    where telegram_user_id = p_telegram_user_id and user_id <> v_user_id
  ) then
    return 'telegram_taken';
  end if;

  insert into public.telegram_links (user_id, telegram_user_id, chat_id)
  values (v_user_id, p_telegram_user_id, p_chat_id)
  on conflict (user_id) do update
    set telegram_user_id = excluded.telegram_user_id,
        chat_id = excluded.chat_id,
        linked_at = now(),
        blocked_at = null;

  update public.telegram_link_tokens set used_at = now() where token_hash = p_token_hash;
  return 'linked';
end;
$$;

-- Saves a confirmed card as a daily log and removes the card in one transaction, so
-- pressing [저장] twice can never produce two logs.
create function public.drawer_save_pending_log(
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

  insert into public.daily_logs (user_id, project_id, log_date, content, source, edited)
  values (p_user_id, v_pending.project_id, p_log_date, p_content, 'telegram', p_edited)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- Users whose chosen hour is now, who are linked and reachable, have not logged today
-- and have not been asked today.
create function public.drawer_due_notifications(p_hour smallint, p_kst_date date)
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
    );
$$;

revoke execute on function public.drawer_link_telegram(text, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.drawer_save_pending_log(uuid, uuid, text, boolean, date) from public, anon, authenticated;
revoke execute on function public.drawer_due_notifications(smallint, date) from public, anon, authenticated;
grant execute on function public.drawer_link_telegram(text, bigint, bigint) to service_role;
grant execute on function public.drawer_save_pending_log(uuid, uuid, text, boolean, date) to service_role;
grant execute on function public.drawer_due_notifications(smallint, date) to service_role;

revoke all on schema private from public, anon, authenticated;
