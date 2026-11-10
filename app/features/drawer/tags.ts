// Shared by server code and route components: no server-only imports.
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;

function clean(tag: string): string {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Trims, drops '#', empty and over-long tags, reuses the casing of an existing tag that
 * differs only in case ("kafka" -> "Kafka"), removes case-insensitive duplicates and
 * keeps at most MAX_TAGS.
 */
export function normalizeTags(raw: readonly string[], existing: readonly string[] = []): string[] {
  const known = new Map(existing.map((tag) => [tag.toLowerCase(), tag]));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    const tag = clean(value);
    if (!tag || tag.length > MAX_TAG_LENGTH) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(known.get(key) ?? tag);
    if (result.length === MAX_TAGS) break;
  }
  return result;
}

/** Web input: tags separated by commas, newlines or '#'. Spaces stay inside a tag. */
export function parseTagInput(input: string): string[] {
  return input.split(/[,\n#]/);
}

export function formatTagInput(tags: readonly string[]): string {
  return tags.join(", ");
}

/** Most used tags first, then the most recently used, then alphabetical. */
export function topTags(logs: readonly { tags: readonly string[]; logDate: string }[], limit = 3): string[] {
  const stats = new Map<string, { uses: number; latest: string }>();
  for (const log of logs) {
    for (const tag of log.tags) {
      const current = stats.get(tag) ?? { uses: 0, latest: "" };
      stats.set(tag, { uses: current.uses + 1, latest: log.logDate > current.latest ? log.logDate : current.latest });
    }
  }
  return [...stats.entries()]
    .sort(([a, x], [b, y]) => y.uses - x.uses || y.latest.localeCompare(x.latest) || a.localeCompare(b))
    .slice(0, limit)
    .map(([tag]) => tag);
}
