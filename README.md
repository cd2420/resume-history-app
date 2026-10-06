# life-game

[React Router](https://reactrouter.com/) v7 (구 Remix) framework mode 기반 프론트엔드 프로젝트입니다.

## 개발

```bash
npm install
npm run dev        # http://localhost:5173
```

## 빌드 / 타입체크

```bash
npm run build
npm run typecheck
```

## 배포

Vercel에 GitHub 저장소를 연결하면 `main` 브랜치에 푸시할 때마다 자동 배포됩니다.
`react-router.config.ts`에 [`@vercel/react-router`](https://vercel.com/docs/frameworks/frontend/react-router) 프리셋이 설정되어 있습니다.
