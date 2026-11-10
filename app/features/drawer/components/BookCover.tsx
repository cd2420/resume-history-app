import { Dot, LoaderCircle } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { Link, useNavigation } from "react-router";

import { type BookSummary, formatPeriod } from "../bookshelf";

// Bookcloth tones, deep enough for cream type. Literal class names so Tailwind keeps them.
const SPINES = [
  "bg-[#6b2b2b]",
  "bg-[#2f4b3a]",
  "bg-[#23395b]",
  "bg-[#8a6a24]",
  "bg-[#4e3350]",
  "bg-[#24545a]",
  "bg-[#8a4626]",
];

export function spineColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPINES[hash % SPINES.length];
}

/** Shared with the book page so the cover morphs into its header. */
export function bookTransitionName(id: string): string {
  return `book-${id}`;
}

// The book gets thicker as records pile up, but stops at MAX_THICKNESS (about 30 logs).
const MIN_THICKNESS = 10;
const MAX_THICKNESS = 34;
const PX_PER_LOG = 0.8;
export function bookThickness(logCount: number): number {
  return Math.min(MAX_THICKNESS, MIN_THICKNESS + Math.round(Math.max(0, logCount) * PX_PER_LOG));
}

// At rest the book stands angled on the plank so its spine and thickness show; hover pulls it out to face you.
const REST_TURN_DEG = 22;
const HOVER = { rotateY: 0, y: -10, scale: 1.03, transition: { type: "spring", stiffness: 260, damping: 22 } } as const;

// A fine bookcloth weave over the cloth color, plus a soft light falloff.
const CLOTH_TEXTURE =
  "bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0_1px,transparent_1px_3px),repeating-linear-gradient(90deg,rgba(0,0,0,0.05)_0_1px,transparent_1px_3px),linear-gradient(105deg,rgba(255,255,255,0.10),transparent_38%,rgba(0,0,0,0.24))]";

export function BookCover({ book }: { book: BookSummary }) {
  const depth = bookThickness(book.logCount);
  const cloth = spineColor(book.id);
  const to = `/drawer/books/${book.id}`;
  // The book page loader can take a moment on a cold server: show it on the book that was clicked.
  const navigation = useNavigation();
  const isOpening = navigation.state === "loading" && navigation.location.pathname === to;

  return (
    <Link
      to={to}
      viewTransition
      data-testid="book"
      aria-label={`${book.title} 열기`}
      aria-busy={isOpening}
      className="group relative block aspect-[5/7] w-full rounded-sm perspective-[700px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brass"
    >
      {/* Contact shadow where the book meets the plank. */}
      <span aria-hidden className="absolute inset-x-[8%] -bottom-1 h-3 rounded-[50%] bg-[var(--contact-shadow)] blur-[6px]" />
      {/* Honors the OS "reduce motion" setting: the book still turns, just without animating. */}
      <MotionConfig reducedMotion="user">
        <motion.div
          className="relative h-full w-full origin-bottom transform-3d"
          // Rendered at rest from the server, so books are visible before hydration.
          initial={false}
          animate={{ rotateY: REST_TURN_DEG, y: 0, scale: 1 }}
          whileHover={HOVER}
          whileFocus={HOVER}
          whileTap={{ scale: 0.97 }}
        >
          {/* Page block: the right edge, seen when the book turns the other way. */}
          <span
            aria-hidden
            className="absolute inset-y-0.75 right-0 bg-[repeating-linear-gradient(90deg,var(--page-edge)_0_1px,var(--page-edge-line)_1px_2px)]"
            style={{ width: depth, transform: `translateX(${depth / 2}px) rotateY(90deg)` }}
          />
          {/* Spine, facing left. */}
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 rounded-l-xs ${cloth} brightness-75`}
            style={{ width: depth, transform: `translateX(-${depth / 2}px) rotateY(-90deg)` }}
          />
          {/* Front cover. */}
          <div
            className={`absolute inset-0 flex flex-col overflow-hidden rounded-r-sm rounded-l-xs ${cloth} shadow-[0_14px_24px_-12px_rgba(0,0,0,0.6)]`}
            style={{ transform: `translateZ(${depth / 2}px)`, viewTransitionName: bookTransitionName(book.id) }}
          >
            <span aria-hidden className={`absolute inset-0 ${CLOTH_TEXTURE}`} />
            {/* Hinge groove. */}
            <span aria-hidden className="absolute inset-y-0 left-2.25 w-0.5 bg-black/25 shadow-[1px_0_0_rgba(255,255,255,0.08)]" />

            {/* Everything sits in one block on the upper cover, like a pasted title label. */}
            <div className="relative flex flex-col gap-2.5 py-3.5 pr-3 pl-5">
              <div className="flex flex-col gap-1.5 rounded-xs bg-label px-2.5 py-2 text-label-ink shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]">
                <h3 className="line-clamp-3 text-sm leading-[1.35] font-bold tracking-title break-keep">{book.title}</h3>
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-label-muted tabular-nums">
                  <span>{formatPeriod(book)}</span>
                  <span className="font-semibold text-label-ink">기록 {book.logCount}개</span>
                </p>
              </div>
              {book.isCurrent && (
                <span className="inline-flex w-fit items-center rounded-full bg-brass py-0.5 pr-2 pl-0.5 text-xs font-semibold text-brass-ink">
                  <Dot size={14} strokeWidth={4} aria-hidden />
                  진행 중
                </span>
              )}
              {book.topTags.length > 0 && (
                // Below sm the cover is too small for tags; they stay on the book page.
                <ul className="hidden flex-wrap gap-1 sm:flex" aria-label="대표 태그">
                  {book.topTags.map((tag) => (
                    <li key={tag} className="max-w-full truncate rounded-xs bg-black/40 px-1.5 py-0.5 text-xs font-medium text-cloth-ink">
                      #{tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {isOpening && (
              <span
                role="status"
                data-testid="book-opening"
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-xs font-semibold text-cloth-ink"
              >
                <LoaderCircle size={28} strokeWidth={2} aria-hidden className="animate-spin motion-reduce:animate-none" />
                여는 중…
              </span>
            )}
          </div>
        </motion.div>
      </MotionConfig>
    </Link>
  );
}
