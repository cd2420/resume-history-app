-- 이력서랍: consent terms live in the database.
-- The current terms of a kind are its latest published row. Publishing a new version
-- (insert a row) makes every user consent again on their next visit; no deploy needed.
-- consents now references the exact (kind, version) a user agreed to.

create table public.consent_terms (
  kind text not null check (kind in ('privacy', 'overseas_transfer')),
  version text not null check (char_length(version) between 1 and 50),
  title text not null check (char_length(title) between 1 and 100),
  items text[] not null check (cardinality(items) between 1 and 30),
  published_at timestamptz not null default now(),
  primary key (kind, version)
);

create index consent_terms_kind_published_idx on public.consent_terms (kind, published_at desc);

revoke all on public.consent_terms from anon, authenticated;
grant select on public.consent_terms to authenticated;
grant all on public.consent_terms to service_role;
alter table public.consent_terms enable row level security;

-- Published terms are readable by every signed-in user; only the dashboard/service_role writes.
create policy "Signed-in users read published terms" on public.consent_terms
  for select to authenticated
  using (published_at <= now());

-- The text users agreed to on 2026-11-10 (previously hard-coded in the consent page).
insert into public.consent_terms (kind, version, title, items, published_at) values
(
  'privacy',
  '2026-11-10',
  '[필수] 개인정보 수집·이용',
  array[
    '항목: 이메일, 텔레그램 사용자 ID, 프로젝트 이름, 저장한 일일 기록(기밀을 가린 글 또는 직접 고친 글)',
    '목적: 회고 알림 발송, 경력 기록 보관과 조회',
    '보관: 탈퇴하거나 직접 삭제할 때까지',
    '텔레그램으로 보낸 답변 원문은 이력서랍 저장소에 저장하지 않아요.'
  ],
  '2026-11-10T00:00:00+09:00'
),
(
  'overseas_transfer',
  '2026-11-10',
  '[필수] 개인정보 국외 이전',
  array[
    '이전받는 자: OpenAI (미국)',
    '이전 항목: 텔레그램으로 보낸 답변 원문',
    '목적: 고객사명·내부 시스템명·절대 수치 같은 기밀을 가리는 처리',
    '시기·방법: 답변을 보낼 때마다 암호화된 네트워크로 전송',
    '보관: OpenAI의 남용 모니터링 목적으로 최대 30일. 응답 저장 기능은 끈 상태로 요청해요.',
    '동의하지 않으면 텔레그램 기록 기능을 쓸 수 없어요.'
  ],
  '2026-11-10T00:00:00+09:00'
);

-- Every consent points at the terms it was given for. Terms are never deleted while referenced.
alter table public.consents
  add constraint consents_terms_fk foreign key (kind, version)
  references public.consent_terms (kind, version) on delete restrict;
