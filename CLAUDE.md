# CLAUDE.md

이 파일은 이 저장소의 코드를 다룰 때 Claude Code(claude.ai/code)에 주는 지침입니다.

## 명령어

```bash
npm install
npm run dev        # SSR이 적용된 Vite 개발 서버, http://localhost:5173
npm run build      # react-router build -> build/client + build/server
npm run typecheck  # react-router typegen && tsc (lint, 테스트 설정은 아직 없음)
```

## 아키텍처

- **React Router v7 프레임워크 모드**(Remix v2의 후속)를 쓰고, SSR이 켜져 있습니다. Vite 8 + Tailwind CSS v4(`@tailwindcss/vite`, `app/app.css`로 import)로 빌드합니다.
- 라우트는 파일 시스템 기반이 아니라 **설정 기반**입니다. 모든 라우트를 `app/routes.ts`에 등록해야 합니다. 라우트 모듈은 `app/routes/`에 두고, `./+types/<route>`에서 생성된 타입을 씁니다. 이 타입은 `react-router typegen`이 `.react-router/`에 만들며, 이 폴더는 gitignore 대상입니다. 라우트를 추가한 뒤에는 `npm run typecheck`를 실행해야 `+types` import가 해결됩니다.
- `app/root.tsx`에는 HTML `Layout`, 전역 링크, 앱 전체 `ErrorBoundary`가 있습니다.
- 경로 별칭 `~/*`는 `app/*`를 가리킵니다.
- `.agents/skills/react-router/`에는 React Router 에이전트 스킬(모드별 레퍼런스)이 있습니다. loader/action/middleware 패턴은 여기를 참고하세요.

## 버전 고정 (중요)

`create-react-router@latest`는 v8을 생성하지만, React Router는 의도적으로 `^7.x`에 고정해 두었습니다. `@vercel/react-router`(`react-router.config.ts`의 Vercel 프리셋)가 peer dependency로 `@react-router/dev@7`만 선언하기 때문입니다. 이 프리셋이 v8을 지원하기 전에는 v8로 올리지 마세요. 빌드 출력에 v8 future-flag 경고가 나오지만 정상입니다.

## 배포

- Vercel에 호스팅합니다(프로젝트 `life-game`, 팀 `daegeuns-projects`). GitHub와 연결되어 있어서 `main`에 push하면 프로덕션에 배포되고, 다른 브랜치는 프리뷰 배포가 만들어집니다.
- `vercel.json`이 `"framework": "react-router"`를 지정합니다. Vercel 프로젝트가 "Other" 프리셋으로 만들어져 모든 라우트가 404가 났기 때문에 필요한 설정입니다. 지우지 마세요.
- `.vercel/`과 `build/`는 빌드 산출물이며 gitignore 대상입니다.
