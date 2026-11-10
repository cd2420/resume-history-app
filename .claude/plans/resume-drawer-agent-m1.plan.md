# Plan: 이력서랍 — 서랍에 넣기

**Source PRD**: `.claude/prds/resume-drawer-agent.prd.md`
**Selected Milestone**: 1 — 서랍에 넣기
**Complexity**: Medium-High (외부 연동 3개: 텔레그램, OpenAI, Supabase pg_cron)

## Summary
사용자가 웹에서 가입하고 국외 이전에 동의한 뒤 텔레그램 봇을 연결한다. 매시 정각에 그 시간을 고른 사용자 중 오늘 기록이 없는 사람에게 봇이 먼저 묻는다. 사용자가 한두 줄 답하면 AI가 기밀을 일반화한 확인 카드를 보내고, [저장]하면 현재 프로젝트의 일일 로그로 쌓인다. 웹에서는 내 로그를 프로젝트별로 보고 수정·삭제한다. 대화 원문은 DB에 저장하지 않는다.

## 인터뷰로 정한 결정
| 항목 | 결정 |
|---|---|
| 위치 | 같은 저장소, 같은 Supabase DB. 기존 `careers`/`projects` 재사용 |
| 스케줄러 | Supabase `pg_cron` + `pg_net`이 매시 정각에 Vercel 엔드포인트 호출 |
| 프로젝트 지정 | "현재 프로젝트" 1개가 기본값, 확인 카드의 버튼으로 바꿈 |
| 가입 | 웹 가입(Supabase Auth) → 딥링크(`t.me/<봇>?start=<토큰>`)로 텔레그램 연결 |
| [수정] 동작 | 사용자가 다시 보낸 글을 **재일반화 없이 그대로** 저장 |
| 시간대 | `Asia/Seoul` 고정. 하루는 KST 0시에 바뀜 |
| 프로젝트 생성 | 웹과 봇(`/project`) 모두 |
| 웹 화면 | 로그 목록 + 수정·삭제까지 M1에 포함 |

## 기술 결정 (공식문서 확인)
| 항목 | 결정 | 근거 |
|---|---|---|
| 스케줄러 | `pg_cron` `0 * * * *` → `net.http_post` | Vercel Hobby Cron은 하루 1회만 허용, 매시 표현식은 배포 실패. Schedules(베타)는 Hobby에서 15분 지터. `pg_cron`은 분 단위 정밀도 |
| cron 인증 | `x-cron-secret` 헤더, 값은 Supabase Vault에서 읽음 | Supabase 문서: SQL에 시크릿 하드코딩 금지, Vault 사용 |
| `pg_net` 타임아웃 | `timeout_milliseconds := 30000` | 기본값 2000ms |
| 텔레그램 수신 | webhook + `secret_token` → `X-Telegram-Bot-Api-Secret-Token` 검증 | Bot API `setWebhook` |
| 중복 수신 | `update_id`를 PK로 기록, 이미 있으면 200만 반환 | 재전송 대비 멱등 처리 |
| 딥링크 토큰 | 32바이트 무작위 → base64url(43자), DB엔 SHA-256 해시만, 10분 만료·일회용 | `start` 파라미터는 최대 64자, `A-Z a-z 0-9 _ -` |
| 발송 속도 | 순차 발송, 초당 25건 이하 | Bots FAQ: 일괄 발송 약 30건/초 초과 시 429 |
| LLM API | Responses API `responses.parse` + zod `text.format`, **`store: false`** | 원문이 OpenAI 애플리케이션 상태로 남지 않음. 남용 모니터링 30일은 남음 |
| 모델 | 기존 `LLM_MODEL` 상수 재사용 | 한 곳에서 교체 |
| 서버 DB 키 | 새 `sb_secret_...` 키 (`SUPABASE_SECRET_KEY`) | legacy `service_role`은 2026년 말까지만 동작. secret 키는 RLS를 우회 |
| webhook의 `user_id` | `telegram_links` 조회 결과로만 정함. 쓰기는 `drawer.server.ts`의 함수로만 | secret 키가 RLS를 우회하므로 코드에서 소유자를 강제 |
| 웹 조회·수정 | 기존 쿠키 세션 클라이언트 + RLS `auth.uid() = user_id` | 기존 패턴 |
| 봇 환경 분리 | 운영 봇 1개 + 개발 봇 1개(로컬·프리뷰) | 봇 하나에 webhook URL은 하나 |

## 데이터 모델 (마이그레이션 1개)
| 테이블 | 주요 컬럼 | 메모 |
|---|---|---|
| `profiles` | `user_id` PK, `notify_hour smallint (0~23, null=끔)`, `timezone text default 'Asia/Seoul'` (check로 고정), `current_project_id` | 가입 시 트리거로 생성 |
| `consents` | `user_id`, `kind ('overseas_transfer'·'privacy')`, `version`, `agreed_at` | 동의 이력. 덮어쓰지 않고 추가 |
| `telegram_link_tokens` | `token_hash` PK, `user_id`, `expires_at`, `used_at` | 원본 토큰은 저장 안 함 |
| `telegram_links` | `user_id` PK, `telegram_user_id bigint unique`, `chat_id bigint`, `linked_at`, `blocked_at` | 계정당 텔레그램 1개, 텔레그램당 계정 1개 |
| `daily_logs` | `id`, `user_id`, `project_id`, `log_date date (KST)`, `content (1~1000자)`, `source ('telegram'·'web')`, `edited bool`, `created_at`, `updated_at` | 하루 여러 건 허용. 일반화된 글 또는 사용자가 직접 고친 글만 |
| `pending_logs` | `id`, `user_id`, `project_id`, `generalized`, `change_categories text[]`, `state ('confirm'·'edit')`, `card_message_id`, `expires_at (24h)` | **원문 없음.** 바뀐 항목은 범주만(고객사명·내부 시스템명·절대 수치) |
| `notifications` | `user_id`, `kst_date`, `sent_at`, `status ('sent'·'failed'·'blocked')` | `unique(user_id, kst_date)` → 같은 날 중복 발송 방지, 응답률·응답 시간 지표 원천 |
| `telegram_updates` | `update_id` PK, `received_at` | 멱등 처리. 7일 지나면 `pg_cron`으로 삭제 |
| `projects` (변경) | `career_id` **nullable로 변경** | 봇 `/project 이름`은 회사 없이 생성. 회사는 웹에서 나중에 지정 |

모든 새 테이블: RLS 켜고 `to authenticated using ((select auth.uid()) = user_id)`. `telegram_link_tokens`, `telegram_updates`, `pending_logs`는 웹에서 읽을 일이 없으므로 authenticated 정책 없음(secret 키 전용).

## 핵심 흐름
```
[웹] /signup → 이메일 인증 → /login → /drawer
     동의 안 했으면 /drawer/consent (국외 이전 별도 체크) → 연결 버튼 노출
     "텔레그램 연결" → 토큰 발급 → t.me/<봇>?start=<토큰>
[봇] /start <토큰> → 해시 조회·만료·사용 여부 확인 → telegram_links 저장 → 환영 + 알림 시간 안내
[cron] 매시 정각(UTC) → /api/cron/notify
     KST 현재 시 = h → notify_hour = h AND 연결됨 AND blocked_at null
       AND 오늘(KST) daily_logs 없음 AND 오늘 notifications 없음
     → notifications insert(먼저) → sendMessage("오늘 뭐 하셨어요?")
     → 403(차단)이면 blocked_at 기록
[봇] 일반 텍스트
     state='edit'인 pending 있음 → 받은 글 그대로 daily_logs 저장(edited=true) → 완료 메시지
     아니면 → 1000자 초과 시 거절 → generalize(llm, text) → pending insert
            → 카드: 일반화된 글 + 바뀐 범주 + [저장][수정][취소][프로젝트 변경]
     원문 변수는 응답 후 버림. 로그에도 남기지 않음
[봇] callback_query (data = "<action>:<pendingId>", 64바이트 이내)
     answerCallbackQuery → 카드 버튼 제거(editMessageReplyMarkup)
     저장 → daily_logs insert, pending delete
     수정 → state='edit', "고친 내용을 보내주세요"
     취소 → pending delete
     프로젝트 변경 → 프로젝트 목록 버튼 → 선택 시 pending.project_id 변경 + 카드 갱신
[봇] /project → 내 프로젝트 목록 버튼(현재 프로젝트 변경) + "새 프로젝트"
     /project <이름> → projects insert(career 없음) → 현재 프로젝트로 지정
     현재 프로젝트 없이 답을 보내면 → 먼저 /project 안내
```

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Env 검증 | `app/lib/env.server.ts:3` | zod 스키마에 새 키 추가, 오류엔 키 이름만 |
| LLM 주입 | `app/lib/llm.server.ts:12`, `app/features/interview/interview.server.ts` | 함수가 클라이언트를 첫 인자로 받음. fake로 교체 |
| 세션·인증 | `app/lib/supabase.server.ts:43` | `requireUser()`, Set-Cookie 헤더 전달 |
| 폼·검증 | `app/routes/login.tsx:6` | zod `safeParse`, 실패 시 `data({ error }, { status: 400 })`, 입력값은 로그에 안 남김 |
| 트랜잭션 저장 | `supabase/migrations/20261019120000_save_project_draft.sql` | 여러 테이블 쓰기는 `security invoker` RPC 1개로 |
| 테스트 | `app/features/interview/interview.server.test.ts` | 대상 옆 `*.test.ts`, fake 클라이언트 |
| 라우트 | `app/routes.ts:3` | 설정 기반. resource route는 `default` 컴포넌트 없이 `action`/`loader`만 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `supabase/migrations/<ts>_drawer_schema.sql` | CREATE | 위 테이블, RLS, `profiles` 생성 트리거, `projects.career_id` nullable |
| `supabase/migrations/<ts>_drawer_cron.sql` | CREATE | `pg_cron`/`pg_net` 활성화, 매시 notify 잡, `telegram_updates`·만료 `pending_logs`·만료 토큰 정리 잡. URL·시크릿은 Vault에서 |
| `app/lib/env.server.ts` | UPDATE | `SUPABASE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `APP_URL` |
| `.env.example` | UPDATE | 위 키 이름 (값 없음) |
| `app/lib/supabase-admin.server.ts` | CREATE | secret 키 클라이언트. `drawer.server.ts`에서만 import |
| `app/lib/kst.ts` | CREATE | `kstDate(now)`, `kstHour(now)` 순수 함수 |
| `app/features/telegram/telegram.server.ts` | CREATE | Bot API 최소 래퍼(`sendMessage`, `answerCallbackQuery`, `editMessageReplyMarkup`, `editMessageText`), 주입 가능한 `fetch` |
| `app/features/telegram/update-schema.ts` | CREATE | 필요한 Update 필드만 zod로 파싱 |
| `app/features/drawer/generalize.server.ts` | CREATE | `generalize(llm, text)` → Responses API, `store: false`, zod 스키마, 거절·잘림 처리 |
| `app/features/drawer/prompts.ts` | CREATE | 일반화 프롬프트(고객사명·내부 시스템명·절대 수치 → 일반 표현, 수치는 지어내지 않음) |
| `app/features/drawer/fake-llm.ts` | CREATE | Responses API용 fake |
| `app/features/drawer/drawer.server.ts` | CREATE | 저장소: 링크·토큰·pending·daily_logs·projects·notifications. 모든 쓰기 함수가 `userId`를 인자로 받음 |
| `app/features/drawer/bot.server.ts` | CREATE | `handleUpdate(deps, update)` — 명령·텍스트·콜백 분기. deps = { repo, telegram, llm, now } |
| `app/features/drawer/notify.server.ts` | CREATE | `runHourlyNotify(deps, now)` — 대상 선정·발송·차단 처리 |
| `app/routes/api.telegram.webhook.ts` | CREATE | 시크릿 헤더 검증 → 멱등 기록 → `handleUpdate` → 항상 200 |
| `app/routes/api.cron.notify.ts` | CREATE | `x-cron-secret` 타이밍 안전 비교 → `runHourlyNotify` |
| `app/routes/signup.tsx` | CREATE | 이메일·비밀번호 가입 |
| `app/routes/drawer.tsx` | CREATE | 대시보드: 연결 상태·연결 버튼, 알림 시간, 프로젝트(생성·이름 변경·현재 지정), 프로젝트별 로그 수정·삭제 |
| `app/routes/drawer.consent.tsx` | CREATE | 개인정보 + 국외 이전 **별도** 동의 |
| `app/routes.ts` | UPDATE | 위 5개 라우트 등록 |
| `app/routes/home.tsx` | UPDATE | 로그인 상태면 `/drawer`, 아니면 소개 + 가입·로그인 링크 |
| `app/routes/login.tsx` | UPDATE | 로그인 후 `/drawer`로 이동, 가입 링크 |
| `scripts/set-telegram-webhook.ts` | CREATE | `setWebhook`(url, `secret_token`, `allowed_updates: ["message","callback_query"]`) 1회 실행용 |
| `e2e/drawer.spec.ts`, `playwright.config.ts` | CREATE | 웹 흐름 E2E (PRD 1 Task 8과 설정 공유) |

## Tasks
### Task 0: 사전 준비 (사용자가 직접)
- Supabase `resume-history-dev` 복구 — 현재 **INACTIVE(일시 정지)**. 대시보드에서 Resume
- Supabase: 공개 가입 켜기, 이메일 인증 켜기, 새 secret 키 발급, Vault에 `app_url`·`cron_secret` 저장
- BotFather에서 운영 봇·개발 봇 생성, 토큰 확보
- Vercel 환경변수 등록 (Production / Preview 분리, Preview는 개발 봇)
- **Validate**: `npm run typecheck`가 통과하고, 대시보드에서 프로젝트 상태 `ACTIVE_HEALTHY`

### Task 1: 스키마·RLS·cron 마이그레이션
- **Action**: 두 마이그레이션 작성·적용. `pg_cron` 잡은 운영 URL만 호출
- **Mirror**: `20261013140000_career_schema.sql`의 RLS·복합 FK 패턴
- **Validate**: Supabase advisors 보안 경고 0건. 계정 A로 계정 B 로그 조회 시 0건. `cron.job`에 잡 등록 확인

### Task 2: 순수 로직 (TDD)
- **Action**: `kst.ts`, `update-schema.ts`, 토큰 생성·해시
- **Validate**: `npx vitest run app/lib app/features/telegram` — UTC 14:59 → KST 23시 당일, 15:00 → 다음 날 0시. 토큰 64자 이내·허용 문자만

### Task 3: 일반화 (TDD)
- **Action**: `prompts.ts`, `generalize.server.ts`, `fake-llm.ts`
- **Validate**: `npx vitest run app/features/drawer/generalize` — 스키마 위반, 거절, 길이 잘림, API 오류, `store: false`가 요청에 들어가는지

### Task 4: 봇 핸들러 (TDD)
- **Action**: `drawer.server.ts`, `telegram.server.ts`, `bot.server.ts`
- **Validate**: fake repo·telegram·llm으로 시나리오 테스트
  1. 미연결 사용자 메시지 → 웹 연결 안내
  2. `/start` 유효 토큰 → 연결, 만료·재사용 토큰 → 거절
  3. 이미 다른 계정에 연결된 텔레그램 → 거절
  4. 답 → 카드 → 저장 → `daily_logs` 1건, pending 0건
  5. 답 → 수정 → 다시 보낸 글 그대로 저장(`edited=true`), LLM 호출 1회뿐
  6. 취소 → 아무것도 저장 안 됨
  7. 프로젝트 변경 → 선택한 프로젝트로 저장
  8. 현재 프로젝트 없음 → `/project` 안내, `/project 이름` → 생성 후 현재 지정
  9. 다른 사용자의 pendingId로 콜백 → 무시
  10. 1000자 초과 → 거절, LLM 호출 없음

### Task 5: 정시 알림 (TDD)
- **Action**: `notify.server.ts`
- **Validate**: 대상 선정(시간 일치·오늘 기록 없음·오늘 미발송·미차단), 같은 시간 두 번 호출 시 1회만 발송, 403 → `blocked_at`, 발송 간격

### Task 6: 라우트 연결
- **Action**: `api.telegram.webhook.ts`, `api.cron.notify.ts`, `scripts/set-telegram-webhook.ts`
- **Validate**: 시크릿 없음·틀림 → 401, 같은 `update_id` 두 번 → 처리 1회. 프리뷰 배포 + 개발 봇으로 실제 메시지 왕복

### Task 7: 웹 화면
- **Action**: `signup.tsx`, `drawer.consent.tsx`, `drawer.tsx`, `home.tsx`, `login.tsx`
- **Mirror**: `login.tsx` 폼·검증, Tailwind 모바일 우선
- **Validate**: 390px 폭에서 가입 → 동의 → 연결 링크 → 알림 시간 설정 → 프로젝트 생성 → 로그 수정·삭제

### Task 8: E2E
- **Action**: Playwright 모바일 뷰포트. 텔레그램은 webhook 라우트에 가짜 Update를 POST해서 대신함(fake LLM, 운영 봇 토큰 없음)
- **Validate**: `npx playwright test`
  1. 미로그인 `/drawer` → `/login`
  2. 동의 전 → 연결 버튼 없음, 동의 후 → 링크 표시
  3. 가짜 `/start <토큰>` → 웹에 "연결됨"
  4. 가짜 답 + 저장 콜백 → 웹 목록에 일반화된 글 표시 → 수정 → 삭제

### Task 9: 운영 확인
- **Action**: 운영 배포, `setWebhook`, 본인 계정으로 알림 시간 설정
- **Validate**: 다음 정각에 질문 도착 → 답 → 저장 → 웹에서 확인. 같은 날 먼저 기록하면 다음 정각 알림 안 옴

## Validation
```bash
npm run typecheck
npx vitest run --coverage
npx playwright test
npm run build
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| **[수정] 글을 재일반화 없이 저장 → 기밀이 그대로 저장됨** | Medium | 사용자 결정. 수정 안내 문구에 "고객사명·내부 시스템명·절대 수치는 빼고 보내주세요" 명시. 웹 수정도 같은 문구. PRD 리스크 표에 추가 필요 |
| secret 키가 RLS를 우회 → 코드 실수로 남의 `user_id`에 기록 | Medium | 쓰기는 `drawer.server.ts`만, `userId`는 `telegram_links` 조회 결과만. 콜백은 pending 소유자 검증. Task 4 시나리오 9 |
| `pg_cron` 호출 실패·중복 | Medium | `notifications` unique로 중복 차단. 실패는 `net._http_response`로 확인(6시간 보관) |
| Supabase Free 프로젝트 일시 정지 (7일간 활동 부족) → 알림 전체 중단 | Medium | 이미 한 번 정지됨. `pg_cron` 내부 실행이 "사용자 활동"으로 인정되는지 문서에 없음 → 매시 엔드포인트가 DB를 조회하므로 활동이 생기는지 운영 2주 관찰. 안 되면 Supabase Pro |
| 프리뷰·로컬이 운영 봇 webhook을 덮어씀 | Medium | 봇 2개 분리, `setWebhook` 스크립트는 환경변수의 봇에만 |
| 텔레그램 메시지 원문은 텔레그램 서버에 남음 | High | 서비스 저장소 밖. PRD "서비스 저장소에 저장하지 않음" 조건과 충돌 없음. 약관에 명시 |
| OpenAI 남용 모니터링 30일 보관 | High | `store: false`여도 남음. PRD 열린 질문 4를 "30일"로 채우고 약관에 명시. 설계 확정 전 Data controls 페이지 재확인 |
| Supabase 기본 이메일 발송 제한으로 가입 인증 메일이 안 감 | Medium | 공식문서 확인 필요(Auth SMTP 가이드). 실서비스 전 custom SMTP |
| webhook 처리 중 LLM 지연 → 텔레그램 재전송 | Low | `update_id` 멱등. 지연이 길어지면 즉시 200 후 비동기 처리로 전환 |
| Vercel 함수 실행 시간 제한 | Low | 호출 1회·짧은 응답. 공식문서 확인 필요 |

## Out of this plan
- STAR 생성, "프로젝트 끝" — 마일스톤 2
- 되묻기, 사흘 무응답 시 가벼운 질문, 커밋 메시지 붙여넣기 — 마일스톤 3
- PRD 1 웹 인터뷰(`/onboarding`)의 Responses API 이전 — 별도 작업. 이번엔 손대지 않음
- 사용자별 시간대, 결제, 카카오톡

## 진행 상황 (2026-11-10)
| Task | 상태 | 메모 |
|---|---|---|
| 0 사전 준비 | **사용자 작업 대기** | Supabase 복구, 공개 가입·이메일 인증, secret 키, Vault 시크릿 2개, 봇 2개, Vercel env |
| 1 스키마·RLS·cron | 작성 완료, **원격 미적용** | 로컬 Postgres 16 + Supabase 스텁에서 3개 마이그레이션 적용, RLS·함수 검사 30개 통과. cron 마이그레이션은 `pg_cron`이 없어 SQL 본문만 검증 |
| 2 순수 로직 | 완료 | `kst.ts`, `update-schema.ts`, `link-token.server.ts` |
| 3 일반화 | 완료 | Responses API, `store: false` |
| 4 봇 핸들러 | 완료 | 시나리오 10개 + 그룹·봇 무시·차단 해제 |
| 5 정시 알림 | 완료 | 중복 호출·동시 실행·403·429 |
| 6 라우트 | 완료 | dev 서버에서 401/405/200 확인. 실제 텔레그램 왕복은 Task 0 이후 |
| 7 웹 화면 | 완료 | 390px 렌더링 확인(가짜 데이터). 실제 로그인 흐름은 Task 0 이후 |
| 8 E2E | 작성 완료 | 공개 시나리오 2개 통과. 계정 시나리오는 E2E 계정·Supabase 필요해 skip |
| 9 운영 확인 | 대기 | |

플랜과 달라진 점: 웹용 데이터 함수는 `drawer-web.server.ts`로 분리, 공용 상수는 `limits.ts`, 테스트용 `fake-repo.ts`·`fake-telegram.ts` 추가, webhook·cron 처리 로직은 `endpoints.server.ts`로 분리. 딥링크 토큰 만료는 DB 시계 차이를 고려해 9분.

## M1 보강: 기록 세션과 질문 3개 (2026-11-10 사용성 점검 후)
| 항목 | 결정·구현 |
|---|---|
| 세션 | `record_sessions` 테이블 + `drawer_open_session` RPC. 정각 알림·`/record`·[지금 기록하기]로 열림, 저장·취소·KST 자정에 닫힘. 사용자당 열린 세션 1개(부분 unique 인덱스) |
| 상태값 | `open` → `carded`(카드까지 완료) / `cancelled`(AI 상한) / `expired`(자정 경과). 매시 정리 cron의 `drawer_expire_sessions()`가 `expired`로 바꾸고, 봇은 `expires_at`도 함께 확인. 응답률 지표: 알림 세션 중 `carded` 비율 |
| 세션 밖 | AI 미호출·미저장, 안내 + [지금 기록하기] |
| 질문 | 고정 문구 3개(`messages.ts`), 1번 필수, 2번 [건너뛰기], 3번 [아직 몰라요] |
| 처리 | 답마다 즉시 일반화해 회차별 저장(원문 저장 0), 마지막에 하나의 카드(`composeLog`) |
| 상한 | 하루 세션 3회, 세션당 AI 5회(실패 포함), 답 300자 |
| 정각 알림 | 세션을 열고 질문 1을 보냄. 진행 중인 세션이 있으면 알림 생략 |
| 검증 | 단위 테스트 131개, 로컬 DB 검사 62개, 데모 E2E 3개 |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 본인 계정: 정각 질문 → 답 → 확인 → 저장 → 웹에서 확인
- [ ] 먼저 기록한 날은 알림이 오지 않음
- [ ] DB에 대화 원문 없음 (`pending_logs`·`daily_logs`에 일반화된 글 또는 사용자가 고친 글만)
- [ ] 계정 A로 계정 B의 데이터 0건
