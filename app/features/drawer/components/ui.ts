// One control vocabulary for every drawer screen. Colors come from the tokens in app.css.

const control =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm transition disabled:cursor-not-allowed disabled:opacity-50";

export const ui = {
  input:
    "min-w-0 rounded-md border border-line bg-sunken px-3 py-2 text-sm text-ink placeholder:text-faint transition focus:border-brass focus:outline-none",
  primary: `${control} bg-brass px-3.5 py-2 font-semibold text-brass-ink hover:brightness-110 active:translate-y-px`,
  secondary: `${control} border border-line bg-raised px-3.5 py-2 text-ink hover:border-faint active:translate-y-px`,
  ghost: `${control} px-2.5 py-2 text-muted hover:bg-sunken hover:text-ink`,
  danger: `${control} border border-danger/40 px-3.5 py-2 text-danger hover:bg-danger-soft`,
  dangerGhost: `${control} px-2.5 py-2 text-danger hover:bg-danger-soft`,
  icon: "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30",
  panel: "rounded-lg border border-line bg-raised",
  label: "text-xs font-medium text-muted",
  disclosure: "cursor-pointer list-none text-sm text-muted transition hover:text-ink [&::-webkit-details-marker]:hidden",
} as const;

/** Icon size and stroke shared by every lucide icon in the drawer. */
export const ICON = { size: 16, strokeWidth: 1.5 } as const;
