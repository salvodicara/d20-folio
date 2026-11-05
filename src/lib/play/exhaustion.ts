/**
 * Exhaustion a source gives (edge-case M3). A spell that applies Exhaustion on a
 * failed save (Waves of Exhaustion, Sickening Radiance) leaves one sourced condition
 * effect per failed save; the sheet reads them as levels on top of its own, never
 * above the spell's cap (`upTo`), and they leave with the effect when the fight
 * revokes it at the spell's end. Exhaustion is a level, never a condition chip. Pure.
 */
import { getSpellById } from "@/data/spells";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { SessionState } from "@/types/character";

/** What one application gives: `levels`, never past `upTo` (the source's cap). */
export interface ExhaustionRule {
  levels: number;
  upTo?: number;
}

/** The level after a source adds its levels: capped by the source, never lowered
 *  (a creature already past the cap keeps its level). */
export function exhaustionFromEffect(level: number, rule: ExhaustionRule): number {
  const cap = rule.upTo ?? Number.POSITIVE_INFINITY;
  return Math.max(level, Math.min(level + rule.levels, cap));
}

/** Whether an effect is a source's Exhaustion on its target. */
export function isExhaustionEffect(effect: ActiveCombatEffect): boolean {
  return (
    effect.payload.kind === "condition" && effect.payload.conditionId === "exhaustion"
  );
}

/** The catalogue's rule for one source's Exhaustion: its own effect entry, or one
 *  level a failed save when it names none. */
export function catalogueExhaustionRule(sourceId: string): ExhaustionRule {
  const spell = getSpellById(sourceId);
  const effect = [...(spell?.followUp?.effects ?? []), ...(spell?.effects ?? [])].find(
    (e) => e.kind === "exhaustion"
  );
  if (effect?.kind !== "exhaustion") return { levels: 1 };
  return {
    levels: effect.levels,
    ...(effect.upTo !== undefined ? { upTo: effect.upTo } : {}),
  };
}

type ExhaustionSession = Pick<SessionState, "exhaustion" | "tableRules"> & {
  readonly encounterEffects?: SessionState["encounterEffects"];
};

/** Each source's rule (the catalogue's unless given). */
export type ExhaustionRuleOf = (sourceId: string) => ExhaustionRule;

/** Each source's rule with its count of applications, in a stable order. */
function sourcesOf(
  session: ExhaustionSession,
  ruleOf: ExhaustionRuleOf
): Array<ExhaustionRule & { count: number }> {
  const counts = new Map<string, number>();
  for (const effect of session.encounterEffects ?? []) {
    if (!isExhaustionEffect(effect)) continue;
    counts.set(effect.source.id, (counts.get(effect.source.id) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({ ...ruleOf(id), count }));
}

/** The level `stored` becomes with the sources' levels, within the table's maximum. */
function withSources(
  stored: number,
  sources: ReadonlyArray<ExhaustionRule & { count: number }>,
  max: number
): number {
  const level = sources.reduce(
    (at, { levels, upTo, count }) =>
      exhaustionFromEffect(at, {
        levels: levels * count,
        ...(upTo !== undefined ? { upTo } : {}),
      }),
    stored
  );
  return Math.min(max, level);
}

const maxOf = (session: ExhaustionSession) =>
  session.tableRules?.exhaustion.maxLevel ?? 6;

/** The Exhaustion level in effect: the sheet's own plus what sources give. */
export function effectiveExhaustion(
  session: ExhaustionSession,
  ruleOf: ExhaustionRuleOf = catalogueExhaustionRule
): number {
  const sources = sourcesOf(session, ruleOf);
  if (sources.length === 0) return session.exhaustion;
  return withSources(session.exhaustion, sources, maxOf(session));
}

/** The sheet's own level that shows `target` with the sources' levels: what the
 *  stepper stores. Below what the sources hold, the sheet's own are cleared. */
export function storedExhaustionFor(
  session: ExhaustionSession,
  target: number,
  ruleOf: ExhaustionRuleOf = catalogueExhaustionRule
): number {
  const sources = sourcesOf(session, ruleOf);
  if (sources.length === 0) return target;
  const max = maxOf(session);
  for (let stored = 0; stored <= max; stored++)
    if (withSources(stored, sources, max) >= target) return stored;
  return max;
}
