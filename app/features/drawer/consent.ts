// Consent terms are stored in public.consent_terms; the current terms of a kind are its
// latest published row. Shared by server code and the consent page (no server-only imports).

export const CONSENT_KINDS = ["privacy", "overseas_transfer"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export interface ConsentTerm {
  kind: ConsentKind;
  version: string;
  title: string;
  items: string[];
}

export interface ConsentRecord {
  kind: string;
  version: string;
}

/** Hidden form field that carries the version a user was shown. */
export function versionField(kind: ConsentKind): string {
  return `version_${kind}`;
}

/** Latest published terms per kind, in CONSENT_KINDS order. Missing terms are a setup error. */
export function currentTerms(rows: Array<ConsentTerm & { publishedAt: string }>): ConsentTerm[] {
  return CONSENT_KINDS.map((kind) => {
    const latest = rows
      .filter((row) => row.kind === kind)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
    if (!latest) throw new Error(`no published consent terms for ${kind}`);
    return { kind: latest.kind, version: latest.version, title: latest.title, items: latest.items };
  });
}

export function hasConsentedTo(terms: ConsentTerm[], records: ConsentRecord[]): boolean {
  return terms.every((term) => records.some((r) => r.kind === term.kind && r.version === term.version));
}

/** False when the terms changed between showing the page and submitting it. */
export function shownVersionsMatch(terms: ConsentTerm[], form: FormData): boolean {
  return terms.every((term) => form.get(versionField(term.kind)) === term.version);
}
