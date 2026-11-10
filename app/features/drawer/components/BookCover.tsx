import { Link } from "react-router";

import { type BookSummary, formatPeriod } from "../bookshelf";

// Literal class names so Tailwind keeps them.
const SPINES = ["bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-teal-500", "bg-orange-500"];

export function spineColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPINES[hash % SPINES.length];
}

export function BookCover({ book }: { book: BookSummary }) {
  return (
    <Link
      to={`/drawer/books/${book.id}`}
      data-testid="book"
      aria-label={`${book.title} 열기`}
      className="group relative flex h-48 w-36 shrink-0 flex-col overflow-hidden rounded-r-md rounded-l-sm bg-slate-100 text-slate-900 shadow-md shadow-black/40 transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-sky-400 md:w-auto"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-2.5 ${spineColor(book.id)}`} />
      <div className="flex flex-1 flex-col gap-1.5 py-3 pr-2.5 pl-5">
        {book.isCurrent && (
          <span className="w-fit rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">● 진행 중</span>
        )}
        <h3 className="line-clamp-3 text-sm leading-snug font-bold break-keep">{book.title}</h3>
        <p className="text-xs text-slate-500">{formatPeriod(book)}</p>
        <ul className="mt-auto flex flex-wrap gap-1" aria-label="대표 태그">
          {book.topTags.map((tag) => (
            <li key={tag} className="max-w-full truncate rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
              #{tag}
            </li>
          ))}
        </ul>
      </div>
    </Link>
  );
}
