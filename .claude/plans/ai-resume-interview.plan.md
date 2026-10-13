# Plan: 경력 복원 인터뷰

**Source PRD**: `.claude/prds/ai-resume-interview.prd.md`
**Selected Milestone**: 1 — 경력 복원 인터뷰
**Complexity**: Medium

## Summary
로그인한 본인이 휴대폰에서 AI 인터뷰에 답하면, AI가 회사 → 프로젝트 → 내 기여(한 일, 내린 결정, 결과) 순으로 질문해 과거 경력을 복원한다. 프로젝트 하나의 대화가 끝나면 AI가 기밀을 일반화한 구조화 초안을 만들고, 사용자가 확인·수정한 뒤에만 저장한다. 원문 대화는 서버에 저장하지 않는다.

## 기술 결정 (PRD 밖에서 정한 사항)
| 항목 | 결정 | 근거 |
|---|---|---|
| DB·인증 | Supabase (Postgres + Auth) | 인터뷰에서 결정. 무료 플랜 |
| 인증 방식 | 이메일+비밀번호, 공개 가입 막고 본인 계정만 생성 | MVP는 단일 사용자 |
| 다중 사용자 대비 | 모든 테이블에 `user_id` + RLS(`auth.uid() = user_id`) | 실서비스 때 마이그레이션 없이 확장 |
| LLM SDK | `openai@^7.32.0` (OpenAI 공식 TypeScript SDK, Node 22 이상 필요) | 사용자 결정. 최신 버전 |
| LLM 주입 | 인터뷰 함수가 `OpenAI` 클라이언트를 인자로 받음. 생성은 `llm.server.ts` 한 곳 | 단위 테스트·E2E에서 가짜 클라이언트로 교체 |
| 모델 | `gpt-6-luna` ($0.10 / $0.50 per 1M, 구조화 출력 지원). 모델 ID는 상수 하나로 관리, 추론 effort 낮게 | 사용자 요청: gpt-4o-mini만큼 저렴한 최신 모델. 2026-10-13 공식 가격 페이지 기준 |
| 인터뷰 상태 | 대화 기록은 브라우저 메모리에만 두고, 매 턴 서버 action으로 전송 | "원문 저장 안 함" 조건 |
| 검증 | zod v4로 action 입력과 LLM 구조화 출력 검증 | `openai@7.32.0` peer dependency가 `zod ^3.25 \|\| ^4.0` |
| Node 버전 | `package.json` `engines.node`를 `>=22`로 지정 | `openai@7.32.0` 요구사항. Vercel 배포 환경도 맞춤 |
| 테스트 | Vitest 단위 테스트 + Playwright E2E | 현재 테스트 설정 없음 |

## 데이터 모델
| 테이블 | 주요 컬럼 | 메모 |
|---|---|---|
| `careers` | `id`, `user_id`, `company_name`, `company_desc`, `role`, `start_date`, `end_date` | `company_desc`는 "핀테크 스타트업" 같은 일반화 설명 |
| `projects` | `id`, `user_id`, `career_id`, `title`, `summary`, `my_role`, `tech_stack text[]`, `team_size`, `start_date`, `end_date` | |
| `achievements` | `id`, `user_id`, `project_id`, `action`, `decision`, `impact` | 기여도 기록률 = `impact`가 채워진 프로젝트 비율 |

날짜는 `date`(월 단위면 1일로 저장), 생성 시각은 `timestamptz`.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `app/routes/home.tsx:1` | 라우트 모듈은 `app/routes/*.tsx`, 타입은 `./+types/<route>` import |
| Routing | `app/routes.ts:3` | 설정 기반 라우트. 새 라우트는 여기에 등록 |
| Errors | `app/root.tsx:48` | 앱 전체 `ErrorBoundary`가 이미 있음. 라우트별 경계는 필요할 때만 |
| Data / mutations | `.agents/skills/react-router/references/framework-mode.md:115` | `loader`/`action` 사용, DB 코드는 `.server` 모듈, 검증 실패는 `data({ errors }, { status: 400 })` |
| Tests | — | **기존 테스트 없음.** 단위 테스트는 대상 파일 옆 `*.test.ts`, E2E는 `e2e/` |
| Logging | — | **기존 로깅 패턴 없음.** 서버 오류만 `console.error`로 남기고, 원문 대화는 로그에도 남기지 않음 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `package.json` | UPDATE | `openai@^7.32.0`, `zod@^4`, `@supabase/supabase-js`, `@supabase/ssr`, `vitest`, `@playwright/test` 추가, `test`·`test:e2e` 스크립트, `engines.node >=22` |
| `.env.example` | CREATE | `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` 목록 (값 없음) |
| `supabase/migrations/0001_career_schema.sql` | CREATE | 3개 테이블 + RLS 정책 |
| `app/lib/env.server.ts` | CREATE | 필수 환경변수를 시작 시 검증 |
| `app/lib/supabase.server.ts` | CREATE | 요청 쿠키 기반 서버 클라이언트, `requireUser()` |
| `app/lib/llm.server.ts` | CREATE | `OpenAI` 클라이언트 생성, 모델 상수. E2E 모드면 가짜 클라이언트 반환 |
| `app/features/interview/prompts.ts` | CREATE | 인터뷰어 시스템 프롬프트(기여도 질문, 기밀 일반화 규칙) |
| `app/features/interview/schema.ts` | CREATE | 프로젝트 초안 zod 스키마 |
| `app/features/interview/interview.server.ts` | CREATE | `nextQuestion(llm, messages)`, `extractDraft(llm, messages)` |
| `app/features/interview/fake-llm.ts` | CREATE | 고정 응답을 돌려주는 가짜 클라이언트 (단위 테스트·E2E 공용) |
| `app/features/career/career.server.ts` | CREATE | 저장·조회 (`saveProjectDraft`, `listCareers`) |
| `app/routes/login.tsx` | CREATE | 로그인 폼 + action |
| `app/routes/onboarding.tsx` | CREATE | 모바일 우선 채팅 UI, 초안 확인 카드 |
| `app/routes/career.tsx` | CREATE | 저장된 경력 목록 |
| `app/routes.ts` | UPDATE | 3개 라우트 등록 |
| `app/routes/home.tsx` | UPDATE | 로그인 상태에 따라 `/onboarding` 또는 `/career`로 이동 |
| `playwright.config.ts` | CREATE | 모바일 뷰포트, dev 서버 자동 실행(E2E 모드) |
| `e2e/onboarding.spec.ts` | CREATE | 핵심 흐름 E2E |

## Tasks
### Task 1: 기반 설정
- **Action**: 의존성 설치, `vitest` 설정, `.env.example`, `env.server.ts` 작성. Supabase 프로젝트 생성은 사용자가 대시보드에서 수행(공개 가입 끄기, 본인 계정과 E2E용 계정 생성).
- **Mirror**: `~/*` 경로 별칭 (`tsconfig.json`)
- **Validate**: `npm run typecheck && npx vitest run`

### Task 2: 스키마와 RLS
- **Action**: 마이그레이션 작성 후 Supabase에 적용. 모든 테이블 RLS 활성화, select/insert/update/delete를 `auth.uid() = user_id`로 제한.
- **Mirror**: 없음 (첫 마이그레이션)
- **Validate**: E2E 계정으로 본인 계정 데이터를 조회하면 0건인지 확인. Supabase advisors에서 RLS 경고 0건.

### Task 3: 인증
- **Action**: `supabase.server.ts`, `login.tsx`. 미로그인 시 `/login`으로 redirect하는 `requireUser()`.
- **Mirror**: `framework-mode.md:195` 세션·쿠키 가이드
- **Validate**: 로그인 → `/onboarding` 진입, 로그아웃 상태로 `/onboarding` 접근 시 `/login`으로 이동

### Task 4: 인터뷰 로직 (TDD)
- **Action**: 테스트 먼저 작성 → `prompts.ts`, `schema.ts`, `interview.server.ts`, `fake-llm.ts` 구현. 인터뷰 함수는 `OpenAI` 클라이언트를 첫 인자로 받고, 직접 생성하지 않는다. `extractDraft`는 응답을 zod 스키마로 검증해 반환한다.
- **Mirror**: `framework-mode.md:131` 서버 전용 모듈 규칙
- **Validate**: `npx vitest run app/features/interview` — 스키마 검증 실패, 빈 대화, API 오류, 응답 잘림(길이 제한)·거절 처리 포함

### Task 5: 경력 저장소 (TDD)
- **Action**: `career.server.ts`. 초안 저장은 career → project → achievements를 한 번에 저장하고, 중간 실패 시 부분 저장이 남지 않게 처리.
- **Mirror**: Task 4와 같은 테스트 구조
- **Validate**: `npx vitest run app/features/career`

### Task 6: 인터뷰 화면
- **Action**: `onboarding.tsx`. 질문/답변 채팅, "이 프로젝트 정리하기" 버튼 → 초안 카드(일반화 결과 강조 표시) → 수정 후 저장. 진행 중 대화가 있으면 새로고침·이탈 시 브라우저 경고.
- **Mirror**: `app/routes/home.tsx` 컴포넌트 구조, Tailwind 유틸리티 클래스
- **Validate**: 휴대폰 화면 폭(390px)에서 프로젝트 1건을 끝까지 저장

### Task 7: 경력 목록
- **Action**: `career.tsx`. 회사별 프로젝트와 기여 목록, 기여·결과가 빈 프로젝트 표시.
- **Validate**: 저장한 프로젝트가 목록에 보이고, 빈 결과 항목이 표시됨

### Task 8: E2E
- **Action**: Playwright 설정, 모바일 뷰포트 1종. 가짜 LLM으로 실행해서 비용 0원, 결과 고정. 시나리오:
  1. 미로그인 → `/onboarding` 접근 시 `/login`으로 이동
  2. 로그인 → 질문 3턴 답변 → 초안 카드 표시 → 일반화된 값 확인 → 저장 → `/career`에 표시
  3. 초안 저장 실패 시 오류 메시지 표시, 입력한 초안 유지
- **Mirror**: Task 4의 `fake-llm.ts`
- **Validate**: `npx playwright test`. 테스트 데이터는 E2E 계정 소유로만 만들고, 테스트 후 삭제

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
| 진행 중인 인터뷰 대화가 사라진다: 탭·브라우저 닫기, 새로고침, 휴대폰이 백그라운드 탭을 정리할 때 | High | 원문 미저장 조건 때문에 감수. 프로젝트 단위로 짧게 끊어 저장하도록 유도하고, 새로고침·이탈 시 경고. 필요하면 기기 로컬 저장을 나중에 추가 |
| `gpt-6-luna`(최저가 모델)의 한국어 인터뷰·일반화 품질이 부족하다 | Medium | 모델 ID를 상수 하나로 관리. 실제 인터뷰 몇 건으로 판단 후 `gpt-5.6-luna` 등으로 교체 |
| 추론 토큰이 출력으로 과금되어 비용이 예상보다 커진다 | Low | 추론 effort를 낮게 설정하고, 응답의 usage로 실제 토큰 확인 |
| Chat Completions에서 함수 호출은 `reasoning_effort: none`일 때만 된다 | Medium | 초안 추출은 함수 호출 대신 구조화 출력(JSON 스키마) 사용 |
| Vercel 배포 환경의 Node 버전이 22 미만이면 SDK가 동작하지 않는다 | Medium | `engines.node >=22` 지정 후 프리뷰 배포에서 확인. 기본값은 공식문서 확인 필요 |
| 원문이 매 턴 외부 LLM으로 전송된다 | High | PRD에서 감수하기로 결정. 서버 로그에도 남기지 않음 |
| 가짜 LLM 모드가 운영에서 켜진다 | Low | 운영 환경에서 E2E 모드 환경변수가 있으면 서버 시작을 실패시킴 |
| E2E가 실제 Supabase 프로젝트에 데이터를 만든다 | Medium | 별도 E2E 계정 사용, RLS로 본인 데이터와 분리, 테스트 후 삭제 |
| RLS 설정 실수로 실서비스 때 데이터가 노출된다 | Low | Task 2에서 E2E 계정으로 교차 조회 검증 |
| Vercel 함수 실행 시간 제한에 LLM 응답이 걸린다 | Low | 짧은 응답 위주. 걸리면 스트리밍으로 전환. 공식문서 확인 필요 |
| Supabase 무료 프로젝트가 장기 미사용 시 일시 정지된다 | Medium | 주기 회고(마일스톤 2)가 접속을 유지. 정지 조건은 공식문서 확인 필요 |

## Out of this plan
- 푸시 알림, PWA 설치, 회고 주기 — 마일스톤 2
- 경력 항목 수정·삭제 화면 — 저장 전 초안 카드에서 수정하므로 이번에는 제외
- 실제 LLM을 호출하는 E2E — 비용과 결과 변동 때문에 제외. 품질은 수동 인터뷰로 확인

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 본인 계정으로 프로젝트 1건을 인터뷰부터 저장까지 완료
- [ ] DB에 원문 대화가 없음
