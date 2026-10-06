# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # Vite dev server with SSR, http://localhost:5173
npm run build      # react-router build -> build/client + build/server
npm run typecheck  # react-router typegen && tsc (no lint or test setup exists yet)
```

## Architecture

- **React Router v7 framework mode** (the successor to Remix v2), SSR enabled, built with Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`, imported via `app/app.css`).
- Routes are **config-based**, not file-system based: every route must be registered in `app/routes.ts`. Route modules live in `app/routes/` and get generated types from `./+types/<route>` (produced by `react-router typegen` into `.react-router/`, gitignored). Run `npm run typecheck` after adding a route so the `+types` import resolves.
- `app/root.tsx` holds the HTML `Layout`, global links, and the app-wide `ErrorBoundary`.
- Path alias `~/*` maps to `app/*`.
- `.agents/skills/react-router/` contains the React Router agent skill (mode-specific references); consult it for loaders/actions/middleware patterns.

## Version pinning (important)

React Router is intentionally pinned to `^7.x` even though `create-react-router@latest` scaffolds v8. `@vercel/react-router` (the Vercel preset in `react-router.config.ts`) only declares a peer dependency on `@react-router/dev@7`. Do not upgrade to v8 until that preset supports it. Build output shows v8 future-flag warnings; those are expected.

## Deployment

- Hosted on Vercel (project `life-game`, team `daegeuns-projects`), connected to GitHub: pushes to `main` deploy to production, other branches get preview deployments.
- `vercel.json` sets `"framework": "react-router"`. This is required because the Vercel project was created with the "Other" preset, which made every route 404. Don't remove it.
- `.vercel/` and `build/` are build output and are gitignored.
