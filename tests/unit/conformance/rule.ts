/**
 * The rules conformance suite: one test per edge case in
 * docs/architecture/2026-11-edge-cases/corpus.md, named after it, citing its
 * source.
 *
 * - `status: "works"`: the engine handles it today; a plain test.
 * - `status: "M3"` (a family from docs/architecture/2026-11-edge-cases.md) or
 *   `"data"`: not yet. The body still asserts the RULE, and the test is
 *   expected to fail. When the mechanism lands the body passes, `it.fails`
 *   turns red, and the change that landed it flips the status to "works".
 *
 * Cases about non-SRD content live in content-pack/tests/unit/conformance with
 * the same helper; `conformance-cases.guard.test.ts` checks that every corpus
 * case has exactly one test, and `scripts/conformance-count.ts` reports the
 * count CI prints ("conformance 161/287").
 */
import { it } from "vitest";

export type Family = `M${number}` | "data";

export interface RuleCase {
  /** The corpus category number (1-17). */
  category: number;
  /** The case title exactly as in corpus.md (between the `**`). */
  case: string;
  /** The corpus source, as cited there. */
  source: string;
  status: "works" | Family;
}

/** The test name carries the status tag the count script reads. */
export function ruleName(c: RuleCase): string {
  return `C${c.category} · ${c.case} [${c.status}]`;
}

export function rule(c: RuleCase, body: () => void | Promise<void>): void {
  if (c.status === "works") it(ruleName(c), body);
  else it.fails(ruleName(c), body);
}
