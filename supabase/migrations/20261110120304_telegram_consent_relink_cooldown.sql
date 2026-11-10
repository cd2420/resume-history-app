-- 이력서랍: Telegram gets its own consent, shown at the connect button, and a Telegram account
-- that left an account (unlink or account deletion) cannot join a different account until
-- KST midnight. The daily AI limit counts per user_id, so without this, deleting the account
-- and signing up again with the same Telegram account would reset the limit.

-- 1. Consent kind 'telegram'.
alter table public.consent_terms drop constraint consent_terms_kind_check;
alter table public.consent_terms add constraint consent_terms_kind_check
  check (kind in ('privacy', 'overseas_transfer', 'telegram'));
alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('privacy', 'overseas_transfer', 'telegram'));

-- Sign-up privacy terms no longer cover the Telegram user ID; the Telegram terms do.
-- A new version makes every user consent again on their next visit.
insert into public.consent_terms (kind, version, title, items) values
(
  'privacy',
  '2026-11-14',
  '[필수] 개인정보 수집·이용',
  array[
    '항목: 이메일, 프로젝트 이름, 저장한 일일 기록(기밀을 가린 글 또는 직접 고친 글)',
    '목적: 경력 기록 보관과 조회',
    '보관: 탈퇴하거나 직접 삭제할 때까지',
    '텔레그램으로 보낸 답변 원문은 이력서랍 저장소에 저장하지 않아요.'
  ]
),
(
  'telegram',
  '2026-11-14',
  '[필수] 텔레그램 연결을 위한 개인정보 수집·이용',
  array[
    '항목: 텔레그램 사용자 ID, 채팅 ID',
    '목적: 봇으로 회고 질문과 알림 보내기, 받은 답을 내 계정에 기록하기, 하루 이용 한도를 넘기는 부정 이용 막기',
    '보관: 연결을 해제하거나 탈퇴하면 바로 지워요. 단, 부정 이용을 막으려고 텔레그램 사용자 ID만 그날 자정(한국 시간)까지 따로 보관한 뒤 지워요.',
    '동의하지 않으면 텔레그램을 연결할 수 없어요.'
  ]
);

-- 2. Telegram accounts that left an account today. Not reachable through the API (private schema).
create table private.telegram_unlinks (
  telegram_user_id bigint primary key,
  user_id uuid not null,
  kst_date date not null
);

-- authenticated has usage on schema private (for valid_tags), so lock the table itself.
revoke all on private.telegram_unlinks from public, anon, authenticated;
grant select on private.telegram_unlinks to service_role;
alter table private.telegram_unlinks enable row level security;
create policy "Service role reads unlinks" on private.telegram_unlinks
  for select to service_role using (true);

create function private.drawer_remember_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fires on unlink, on account deletion (cascade), and when an account switches Telegram accounts.
  if tg_op = 'UPDATE' and old.telegram_user_id = new.telegram_user_id then
    return null;
  end if;
  insert into private.telegram_unlinks (telegram_user_id, user_id, kst_date)
  values (old.telegram_user_id, old.user_id, (now() at time zone 'Asia/Seoul')::date)
  on conflict (telegram_user_id) do update
    set user_id = excluded.user_id, kst_date = excluded.kst_date;
  return null;
end;
$$;

revoke execute on function private.drawer_remember_unlink() from public, anon, authenticated;

create trigger telegram_links_remember_unlink
  after delete or update of telegram_user_id on public.telegram_links
  for each row execute function private.drawer_remember_unlink();

-- 3. Linking refuses a Telegram account that left a different account today.
create or replace function public.drawer_link_telegram(
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

  if exists (
    select 1 from private.telegram_unlinks
    where telegram_user_id = p_telegram_user_id
      and user_id <> v_user_id
      and kst_date >= (now() at time zone 'Asia/Seoul')::date
  ) then
    return 'telegram_cooldown';
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

revoke execute on function public.drawer_link_telegram(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.drawer_link_telegram(text, bigint, bigint) to service_role;

-- 4. Delete yesterday's rows at 00:01 KST (15:01 UTC), as the Telegram terms promise.
select cron.schedule(
  'drawer-telegram-unlinks-cleanup',
  '1 15 * * *',
  $$ delete from private.telegram_unlinks where kst_date < (now() at time zone 'Asia/Seoul')::date; $$
);
