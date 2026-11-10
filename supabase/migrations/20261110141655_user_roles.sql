-- 이력서랍: account tiers. 'user' gets the free-tier AI caps; 'admin' has none.
-- The role is decided only by the operator (SQL editor / service role). The app reads it on the
-- server from this column and never from a request, cookie or JWT claim.
--
-- Make someone an admin (SQL editor, runs as postgres):
--   update public.profiles set role = 'admin' where user_id = '<auth.users id>';

alter table public.profiles
  add column role text not null default 'user' check (role in ('user', 'admin'));

-- 1. Signed-in users could update every profiles column through the API (table-level UPDATE).
--    Narrow it to the two columns the app writes for them, so role is not writable at all.
revoke update on public.profiles from authenticated;
grant update (notify_hour, current_project_id) on public.profiles to authenticated;

-- 2. Defense in depth: even if a later grant re-opens the column, an end-user session (JWT role
--    'authenticated' or 'anon') cannot set or change a role. The service role and postgres can.
create function private.profiles_guard_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.role <> 'user' then
      raise exception 'profiles.role is managed by the operator' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'profiles.role is managed by the operator' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.profiles_guard_role() from public, anon, authenticated;

create trigger profiles_guard_role
  before insert or update of role on public.profiles
  for each row execute function private.profiles_guard_role();

-- 3. Admins may regenerate a STAR more than five times; the free-tier cap lives in the app.
alter table public.star_summaries drop constraint star_summaries_generation_count_check;
alter table public.star_summaries add constraint star_summaries_generation_count_check check (generation_count >= 1);

-- drawer_open_session needs no change: the app passes p_daily_limit = null for admins, and
-- "count >= null" is null, so the daily check never fires for them.
