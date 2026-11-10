# CLAUDE.md

이 파일은 이 저장소의 코드를 다룰 때 Claude Code(claude.ai/code)에 주는 지침입니다.

# 답변은 무조건 한국말로 해.

## 명령어

```bash
npm install
npm run dev        # SSR이 적용된 Vite 개발 서버, http://localhost:5173
npm run build      # react-router build -> build/client + build/server
npm run typecheck  # react-router typegen && tsc (lint 설정은 아직 없음)
npm test           # Vitest 단위 테스트 (app/**/*.test.ts)
npm run test:e2e   # Playwright. 가짜 LLM·가짜 텔레그램으로 dev 서버를 띄움. 전체 흐름은 .env의 E2E 계정 필요
npm run telegram:webhook  # .env의 봇을 APP_URL/api/telegram/webhook에 연결 (환경마다 1회). Node 22.18+ 필요
npm run db:generate       # drizzle/schema.ts 변경 → drizzle/에 새 마이그레이션 SQL 생성 (.env의 DATABASE_URL)
npm run db:migrate        # drizzle/의 미적용 마이그레이션을 DB에 적용
npm run db:pull           # DB 스키마를 drizzle/schema.ts로 다시 뽑기 (기준선 만들 때)
```

## DB 마이그레이션

- **마이그레이션만 Drizzle(`drizzle-kit`)로 관리**합니다. 앱 쿼리는 계속 `supabase-js`로 해서 RLS가 적용되게 둡니다. 앱 코드에서 `drizzle-orm`으로 DB에 직접 붙지 마세요(RLS 우회).
- `supabase/migrations/`는 Drizzle 이전 이력입니다. 새 변경은 `drizzle/`에만 추가하고, 두 곳에 같은 변경을 넣지 마세요.
- 테이블·컬럼·인덱스는 `drizzle/schema.ts`를 고친 뒤 `db:generate`. RLS 정책·함수(RPC)·`pg_cron`·Vault처럼 스키마로 표현하기 어려운 것은 `npm run db:generate -- --custom --name=<이름>`으로 빈 SQL을 만들어 직접 씁니다.
- `DATABASE_URL`은 drizzle-kit 전용이라 로컬 `.env`에만 둡니다. Vercel에 넣지 마세요.

## 아키텍처

- **React Router v7 프레임워크 모드**(Remix v2의 후속)를 쓰고, SSR이 켜져 있습니다. Vite 8 + Tailwind CSS v4(`@tailwindcss/vite`, `app/app.css`로 import)로 빌드합니다.
- 라우트는 파일 시스템 기반이 아니라 **설정 기반**입니다. 모든 라우트를 `app/routes.ts`에 등록해야 합니다. 라우트 모듈은 `app/routes/`에 두고, `./+types/<route>`에서 생성된 타입을 씁니다. 이 타입은 `react-router typegen`이 `.react-router/`에 만들며, 이 폴더는 gitignore 대상입니다. 라우트를 추가한 뒤에는 `npm run typecheck`를 실행해야 `+types` import가 해결됩니다.
- `app/root.tsx`에는 HTML `Layout`, 전역 링크, 앱 전체 `ErrorBoundary`가 있습니다.
- 경로 별칭 `~/*`는 `app/*`를 가리킵니다.
- **이력서랍(텔레그램 회고)**: `app/features/drawer/`, `app/features/telegram/`. 봇과 정시 알림은 secret 키(RLS 우회)로 DB에 접근하므로 쓰기는 `drawer.server.ts`의 `DrawerRepo`로만 하고, `userId`는 `telegram_links` 조회 결과로만 정합니다. 웹(`/drawer`)은 세션 클라이언트 + RLS를 씁니다. 사용자가 보낸 원문은 저장하거나 로그에 남기지 않습니다. 답변은 **기록 세션 안에서만** AI로 보냅니다(`record.server.ts`: 정각 알림·`/record`로 열리고 KST 자정에 닫힘, 고정 질문 3개, 답마다 일반화해 저장). 세션 밖 메시지는 AI를 부르지 않습니다. 정시 알림은 Vercel Cron이 아니라 Supabase `pg_cron`이 `/api/cron/notify`를 호출합니다(Hobby Cron은 하루 1회 제한).
- **책장(M2)**: `/drawer`는 책장(칸 = `shelves`, 책 = `projects`, `shelf_id` null = '새로 꽂힌 책'), `/drawer/books/:bookId`는 책(월별 목차 + 기록), `/drawer/settings`는 텔레그램 연결·알림 시간. 책장 조회와 기록 검색은 `security invoker` RPC(`drawer_bookshelf`, `drawer_search_logs`)라 RLS가 그대로 적용됩니다. 기록 태그는 일반화 호출에서 함께 뽑고(`tags.ts`로 정규화), 컴포넌트가 쓰는 상수·타입은 `.server`가 아닌 `bookshelf.ts`·`limits.ts`·`tags.ts`에 둡니다(클라이언트 번들에서 `.server` import는 빌드 실패).
- **데모 모드**: 실제 설정값이 없으면(로컬·프리뷰) 또는 `DEMO_MODE=1`이면 Supabase·OpenAI·텔레그램 대신 메모리 데이터(`app/features/demo/`), 가짜 LLM, 웹 봇 시뮬레이터(`/drawer/demo-bot`)로 동작하고 상단에 배너가 뜹니다. 아무 이메일·비밀번호로 로그인됩니다. **Vercel 운영 배포(`VERCEL_ENV=production`)에서는 절대 켜지지 않고**, 설정값이 없으면 시작을 거부합니다. `/drawer`·`/drawer/consent`는 `requireDrawerSession()`이 주는 `DrawerWebStore`로만 데이터에 접근합니다.
- `.agents/skills/react-router/`에는 React Router 에이전트 스킬(모드별 레퍼런스)이 있습니다. loader/action/middleware 패턴은 여기를 참고하세요.

## 버전 고정 (중요)

`create-react-router@latest`는 v8을 생성하지만, React Router는 의도적으로 `^7.x`에 고정해 두었습니다. `@vercel/react-router`(`react-router.config.ts`의 Vercel 프리셋)가 peer dependency로 `@react-router/dev@7`만 선언하기 때문입니다. 이 프리셋이 v8을 지원하기 전에는 v8로 올리지 마세요. 빌드 출력에 v8 future-flag 경고가 나오지만 정상입니다.

## 배포

- Vercel에 호스팅합니다(프로젝트 `resume-history`, 팀 `daegeuns-projects`, 운영 주소 `https://resume-history-fawn.vercel.app`). GitHub와 연결되어 있어서 `main`에 push하면 프로덕션에 배포되고, 다른 브랜치는 프리뷰 배포가 만들어집니다.
- `vercel.json`이 `"framework": "react-router"`를 지정합니다. Vercel 프로젝트가 "Other" 프리셋으로 만들어져 모든 라우트가 404가 났기 때문에 필요한 설정입니다. 지우지 마세요.
- `.vercel/`과 `build/`는 빌드 산출물이며 gitignore 대상입니다.
