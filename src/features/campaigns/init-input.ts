/**
 * init-input — the DM monster-initiative typed-input discipline (B05).
 *
 * A monster's final initiative is entered DIRECTLY (no d20 + bonus like a PC) and CAN be
 * negative in edge cases — but only as a SINGLE LEADING minus, never mid-string. The old
 * chip stripped `/[^\d-]/g` (a hyphen allowed ANYWHERE), so `"5-"` / `"1-2"` reached
 * `Math.round(Number(…))` = `NaN` and committed `initiative: NaN`, corrupting the sort
 * comparator, the Begin-turns "rolled" gate (`NaN != null` is true), and the display
 * (literal "NaN"). These pure helpers guarantee the chip can never commit `NaN`: a
 * non-finite draft commits `null` (blank).
 *
 * Firebase-free + SRD-free so the monster chip (party-encounter.tsx) and its unit tests
 * share ONE seam without pulling the encounter-card graph.
 */

/**
 * Filter a raw typed value to a SINGLE LEADING minus + digits (a mid-string or trailing
 * minus is dropped): `"5-"` → `"5"`, `"1-2"` → `"12"`, `"-5"` → `"-5"`, `"-"` → `"-"`
 * (an in-progress negative). Drives the input's `onChange` so the draft is always clean.
 */
export function sanitizeInitInput(raw: string): string {
  const negative = raw.trimStart().startsWith("-");
  const digits = raw.replace(/[^\d]/g, "");
  return (negative ? "-" : "") + digits;
}

/**
 * Parse a monster-init draft to its committed value: a FINITE integer, or `null` (blank)
 * when the draft is empty / a lone `"-"` / otherwise non-finite — NEVER `NaN`. The
 * `Number.isFinite` guard is the invariant every downstream consumer (sort comparator,
 * Begin-turns gate, display) relies on.
 */
export function parseInitInput(draft: string): number | null {
  const cleaned = sanitizeInitInput(draft);
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}
