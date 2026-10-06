import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Life Game" },
    { name: "description", content: "Life Game" },
  ];
}

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-50">
      <h1 className="text-4xl font-bold">Hello, World!</h1>
    </main>
  );
}
