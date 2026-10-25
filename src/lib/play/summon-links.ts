/**
 * Who summoned whom in an encounter, data-free (no catalogue import), so the
 * encounter's own turn logic can read it without pulling the spell and item corpora
 * into its chunk. The rules around it are {@link "./summon-initiative"}.
 */
import type { EncounterState } from "@/types/campaign";

export type SummonLink = NonNullable<EncounterState["summons"]>[number];

export function isLink(value: unknown): value is SummonLink {
  if (typeof value !== "object" || value === null) return false;
  const { summonId, casterId } = value as Record<string, unknown>;
  return (
    typeof summonId === "string" && typeof casterId === "string" && summonId !== casterId
  );
}

/** Every standing link: both creatures still in the fight, each summon tied to one
 *  caster. The first of a clash wins. */
export function summonLinks(
  state: Pick<EncounterState, "combatants" | "summons">
): SummonLink[] {
  const raw: unknown = state.summons;
  if (!Array.isArray(raw)) return [];
  const ids = new Set(state.combatants.map((c) => c.id));
  const seen = new Set<string>();
  const out: SummonLink[] = [];
  for (const link of raw) {
    if (!isLink(link) || !ids.has(link.summonId) || !ids.has(link.casterId)) continue;
    if (seen.has(link.summonId)) continue;
    seen.add(link.summonId);
    out.push({ summonId: link.summonId, casterId: link.casterId });
  }
  return out;
}

/** The turn order with each linked summon moved right after its caster (several
 *  summons of one caster in the order they were linked). */
export function summonedTurnOrder(
  order: ReadonlyArray<string>,
  links: ReadonlyArray<SummonLink>
): string[] {
  let out = [...order];
  // Reverse, so each insertion right after the caster keeps the links' order.
  for (const { summonId, casterId } of [...links].reverse()) {
    if (!out.includes(summonId) || !out.includes(casterId)) continue;
    out = out.filter((id) => id !== summonId);
    out.splice(out.indexOf(casterId) + 1, 0, summonId);
  }
  return out;
}
