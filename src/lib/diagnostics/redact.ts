/** Best-effort hygiene: emails and long token-like runs never reach a report. */
export function redact(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

/**
 * Document identifiers are correlation data, not report prose. The static
 * `/characters/new`, `/campaigns/new` and `/join/new` routes are not ids, so
 * they are left readable (folded in from `crash-report.ts`'s prior local
 * copy — see `tests/unit/report-open.test.ts`).
 */
export function redactIdentifiers(text: string): string {
  return text
    .replace(/users\/[^\s/?#"'`)]+/g, "users/[uid]")
    .replace(/\/characters\/(?!new\b)[^\s/?#"'`)]+/g, "/characters/[id]")
    .replace(/\/campaigns\/(?!new\b)[^\s/?#"'`)]+/g, "/campaigns/[id]")
    .replace(/\/join\/(?!new\b)[^\s/?#"'`)]+/g, "/join/[code]");
}

export function redactAll(text: string): string {
  return redact(redactIdentifiers(text));
}
