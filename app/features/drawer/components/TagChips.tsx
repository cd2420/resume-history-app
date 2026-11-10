import { Link } from "react-router";

/** Tags that link to the bookshelf filtered by that tag. */
export function TagChips({ tags, className = "" }: { tags: readonly string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="태그 목록">
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            to={`/drawer?tag=${encodeURIComponent(tag)}`}
            className="rounded-sm border border-line px-1.5 py-0.5 text-xs text-muted transition hover:border-brass hover:text-brass"
          >
            #{tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Marks every case-insensitive occurrence of `query` in `text`. */
export function Highlight({ text, query }: { text: string; query: string | null }) {
  if (!query) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-xs bg-brass-soft px-0.5 text-ink">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
