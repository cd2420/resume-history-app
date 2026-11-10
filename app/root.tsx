import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  useNavigation,
  ScrollRestoration,
} from "react-router";

import { getEnv } from "~/lib/env.server";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  { rel: "preconnect", href: "https://cdn.jsdelivr.net", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function loader() {
  return { isDemo: getEnv().isDemo };
}

/**
 * Thin top bar while a page loads or a form submits, so a slow server response never looks
 * like a frozen page. Hidden for the first 150ms (see .nav-progress in app.css).
 */
function NavigationProgress() {
  const navigation = useNavigation();
  return <div aria-hidden data-testid="nav-progress" className={`nav-progress${navigation.state !== "idle" ? " is-active" : ""}`} />;
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <NavigationProgress />
      {loaderData.isDemo && (
        <div role="note" data-testid="demo-banner" className="bg-brass-soft px-4 py-1.5 text-center text-xs font-medium text-ink">
          데모 모드 · DB·OpenAI·텔레그램 대신 가짜 데이터를 씁니다. 서버가 다시 시작되면 초기화돼요.{" "}
          <Link to="/drawer/demo-bot" className="underline">
            봇 시뮬레이터
          </Link>
        </div>
      )}
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
