/**
 * Shared vocabulary of the automation-coverage ratchet — used by BOTH the
 * public guard (`tests/unit/automation-coverage.guard.test.ts`, scoped to the
 * public corpus) and the pack companion
 * (`content-pack/tests/unit/automation-coverage.guard.pack.test.ts`, scoped to
 * the pack corpus), so the "accounted-for" definition can never drift between
 * the two sides (golden rule 6).
 */

/** An entity is AUTOMATED when it declares grants and/or mechanics. */
export function isAutomated(e: {
  grants?: ReadonlyArray<unknown>;
  mechanics?: Record<string, unknown>;
}): boolean {
  return (
    (Array.isArray(e.grants) && e.grants.length > 0) ||
    (e.mechanics != null && Object.keys(e.mechanics).length > 0)
  );
}

/** Marker features a dedicated subsystem owns (no per-feature grant needed). */
export const SYSTEM_HANDLED =
  /(-spellcasting$|-asi$|-epic-boon$|-weapon-mastery$|-metamagic$|-spells$|-fighting-style$|-additional-fighting-style$|-pact-magic$|-eldritch-invocations$|-spell-mastery$)/;

/** Feats handled by dedicated engine logic (no per-feat grant needed). */
export const FEAT_SYSTEM_HANDLED = new Set<string>([
  "alert", // +Initiative via computeInitiative's hasAlertFeat
  "ability-score-improvement", // the +2/+1 is applied through the ASI choice
]);
