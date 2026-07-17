/**
 * M1 — Eldritch Invocation choice modelling (Warlock).
 *
 * 2024 RAW (verified at http://dnd2024.wikidot.com/warlock:main —
 * Eldritch Invocations column):
 * - Level 1: 1 invocation known
 * - Level 2: 3
 * - Level 5: 5
 * - Level 7: 6
 * - Level 9: 7
 * - Level 12: 8
 * - Level 15: 9
 * - Level 18: 10
 *
 * SINGLE SOURCE OF TRUTH: the count is DERIVED from the Warlock class table's
 * `classSpecific.invocationsKnown` (see `src/data/classes/warlock.ts`), so the
 * picker and the sheet can never drift. The placeholder
 * `warlock-eldritch-invocations` feature signals the track opens; the specific
 * invocations live as data in `src/data/invocations.ts`.
 *
 * Prerequisite parsing is heuristic: most prerequisites are
 * "Level N+ Warlock" plus optional pact / cantrip / invocation
 * dependencies. The picker validates the level requirement only —
 * deeper prerequisites are surfaced as text under the option so the
 * player can self-enforce.
 */

import { getClassTable } from "@/data/classes";
import { SRD_INVOCATIONS } from "@/data/invocations";
import type { SrdEldritchInvocation } from "@/data/invocations";
import { srdEn } from "@/i18n/srd-en";
import { srdSlug } from "@/i18n/srd-key";

const INVOCATIONS_FEATURE_ID = "warlock-eldritch-invocations";

/** True when the feature id is the invocation placeholder. */
export function isInvocationPlaceholder(featureId: string): boolean {
  return featureId === INVOCATIONS_FEATURE_ID;
}

/**
 * Total invocations the Warlock knows after gaining the given level.
 * Returns 0 for non-Warlocks / level 0.
 */
export function invocationsKnownAt(level: number): number {
  if (level < 1) return 0;
  const warlockLevel = Math.min(level, 20);
  const entry = getClassTable("warlock")?.levels.find((l) => l.level === warlockLevel);
  return Number(entry?.classSpecific?.invocationsKnown ?? 0);
}

/** New picks gained at this level (the diff between this and previous). */
export function newInvocationsAtLevel(level: number): number {
  return invocationsKnownAt(level) - invocationsKnownAt(level - 1);
}

/**
 * Extract the minimum Warlock level required from a prerequisite string.
 * Matches "Level N+ Warlock" / "Level N+" / etc. Returns 0 when no
 * level requirement is present.
 */
export function minWarlockLevelFor(prereq: string): number {
  const m = /Level\s+(\d+)\+/i.exec(prereq);
  if (m?.[1]) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Lazily-built set of every valid invocation id (slug), used to validate parsed prereqs. */
let invocationIdSet: ReadonlySet<string> | null = null;
function knownInvocationIds(): ReadonlySet<string> {
  if (!invocationIdSet) invocationIdSet = new Set(SRD_INVOCATIONS.map((i) => i.id));
  return invocationIdSet;
}

/**
 * Extract the invocation ids a prerequisite string REQUIRES the character to
 * already know. Several invocations gate on a named **Invocation** prerequisite
 * — Eldritch Smite / Lifedrinker / Thirsting Blade require "Pact of the Blade
 * Invocation", Devouring Blade requires "Thirsting Blade Invocation", etc. The
 * parser matches each "<Name> Invocation" phrase, slugifies the name, and keeps
 * only ids that resolve to a real invocation (so free-text never yields a bogus
 * gate). Returns `[]` when there is no named-invocation prerequisite.
 *
 * This makes the dependency a STRUCTURED, enforceable fact rather than prose the
 * player self-checks — `eligibleInvocations` filters on it.
 */
export function requiredInvocationIds(prereq: string): string[] {
  const ids: string[] = [];
  const valid = knownInvocationIds();
  // Match "<Capitalised Name> Invocation" — the name immediately precedes the
  // literal word "Invocation". Names are 1-5 capitalised/lowercase-joined words.
  const re = /([A-Z][\w’']*(?:\s+(?:of|the|[A-Z][\w’']*))*)\s+Invocation\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prereq)) !== null) {
    const phrase = m[1];
    if (!phrase) continue;
    const id = srdSlug(phrase);
    if (valid.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * All 28 SRD 2024 Eldritch Invocations, sorted by their canonical EN name (a
 * stable, locale-independent order; the EN name comes from the i18n catalogue via
 * `srdEn`, not a stripped data BiText).
 */
export function listInvocations(): SrdEldritchInvocation[] {
  return [...SRD_INVOCATIONS].sort((a, b) =>
    (srdEn("invocation", a.id, "name") ?? a.id).localeCompare(
      srdEn("invocation", b.id, "name") ?? b.id
    )
  );
}

/**
 * Filter the invocation list to those a character at `level` can take,
 * given which invocations they already know (some invocations require
 * another invocation as a prerequisite — e.g. Devouring Blade requires
 * Thirsting Blade; Eldritch Smite / Lifedrinker require Pact of the Blade).
 *
 * Enforces BOTH the LEVEL prerequisite ("Level N+ Warlock") and the named
 * **Invocation** prerequisite (`requiredInvocationIds`) — a gated invocation is
 * filtered out until the prerequisite invocation is in `alreadyKnown`. The
 * remaining free-text prerequisites (a specific cantrip) are still surfaced as
 * text in the option's `prerequisite` field for the player to self-enforce.
 */
export function eligibleInvocations(
  level: number,
  alreadyKnown: ReadonlyArray<string>
): SrdEldritchInvocation[] {
  const known = new Set(alreadyKnown);
  return listInvocations().filter((inv) => {
    if (known.has(inv.id)) return false;
    const minLvl = minWarlockLevelFor(inv.prerequisite);
    if (minLvl > 0 && level < minLvl) return false;
    // Named-invocation prerequisite: every required invocation must be known.
    for (const reqId of requiredInvocationIds(inv.prerequisite)) {
      if (!known.has(reqId)) return false;
    }
    return true;
  });
}
