/**
 * "The ability increased by this feat": the one stored answer (`featAbility` on
 * the feat ref, written by the level-up commit that applied the +1) and the
 * grant shapes that read it live.
 *
 *   - an `always-prepared-spell` with `spellAbilitySource: "feat"` stamps the
 *     deferred `featSpellAbility` marker; `resolveSpellAbility` reads the answer;
 *   - a `choice-spell` with `spellAbilitySource: "feat"` does the same for the
 *     spell the player picked, traced by the pick's free-cast source;
 *   - `concentration-save-bonus` with `ability: "feat"`, and a `temp-hp` formula
 *     naming `FEAT`, are resolved here when the feat's grants are read.
 *
 * Unanswered (an older character whose feat never stored it) keeps what the feat
 * did before: its spells fall through to the species pick or the class ability,
 * a `FEAT` formula reads the higher of the feat's choices, and a bonus that
 * names the feat's ability is not added. The «Scelte da completare» banner asks.
 *
 * Pure module — no React, no locale reads.
 */
import type { AbilityCode } from "@/data/types";
import type { Grant } from "@/lib/grants";
import type { CharacterData, CustomFeature, SrdFeatureRef } from "@/types/character";

/** The token a formula uses for the modifier of the ability this feat raised. */
export const FEAT_ABILITY_TOKEN = "FEAT";

/** The stored answer for `featId` on this character, or null while unanswered. */
export function featAbilityOf(
  character: { features: ReadonlyArray<SrdFeatureRef | CustomFeature> },
  featId: string
): AbilityCode | null {
  for (const f of character.features) {
    if (!("custom" in f) && f.srdId === featId && f.featAbility) return f.featAbility;
  }
  return null;
}

/** The abilities a feat's increase lets you choose from, or null when it fixes one. */
export function featChoiceAbilities(
  grants: ReadonlyArray<Grant> | undefined
): ReadonlyArray<AbilityCode> | null {
  for (const g of grants ?? []) {
    if (g.type === "choice-ability-score") return g.abilities;
  }
  return null;
}

const readsCache = new WeakMap<object, boolean>();

/** True when something below `node` reads the ability this feat raised. */
function readsFeatAbility(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const cached = readsCache.get(node);
  if (cached !== undefined) return cached;
  const reads = scanFeatAbility(node);
  readsCache.set(node, reads);
  return reads;
}

function scanFeatAbility(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(scanFeatAbility);
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.spellAbilitySource === "feat" || record.ability === "feat") return true;
    if (typeof record.formula === "string" && record.formula.includes(FEAT_ABILITY_TOKEN))
      return true;
    return Object.values(record).some(scanFeatAbility);
  }
  return false;
}

/**
 * Whether the player's answer changes anything for this feat: it lets you choose
 * the increase AND a grant reads the choice. A feat whose +1 is all there is
 * needs no answer — the +1 is already in the scores.
 */
export function featAbilityMatters(grants: ReadonlyArray<Grant> | undefined): boolean {
  return featChoiceAbilities(grants) !== null && readsFeatAbility(grants);
}

/**
 * A feat's grants with "the ability increased by this feat" resolved against the
 * stored answer (`ability`, null while unanswered). Grants that don't read it come
 * back as the same objects; nothing changes when none do.
 */
export function resolveFeatAbilityGrants(
  grants: ReadonlyArray<Grant>,
  ability: AbilityCode | null
): ReadonlyArray<Grant> {
  if (!readsFeatAbility(grants)) return grants;
  const choices = featChoiceAbilities(grants) ?? [];
  // Unanswered, a formula reads the higher of the feat's choices (the default
  // the feat had before the answer was stored). The temp-HP formula's `max` takes
  // two terms; a guard keeps every `FEAT` formula on a feat of at most two choices.
  const fallback =
    choices.length > 1 ? `max(${choices[0]},${choices[1]})` : (choices[0] ?? "0");
  let changed = false;
  const out: Grant[] = [];
  for (const g of grants) {
    if (g.type === "concentration-save-bonus" && g.ability === "feat") {
      changed = true;
      if (ability) out.push({ ...g, ability });
    } else if (g.type === "temp-hp" && g.formula.includes(FEAT_ABILITY_TOKEN)) {
      changed = true;
      out.push({
        ...g,
        formula: g.formula.split(FEAT_ABILITY_TOKEN).join(ability ?? fallback),
      });
    } else {
      out.push(g);
    }
  }
  return changed ? out : grants;
}

/** Every feat on the character whose answer matters and is still missing. */
export function featsOwingAbility(
  character: Pick<CharacterData, "features">,
  grantsOf: (featId: string) => ReadonlyArray<Grant> | undefined
): string[] {
  const out: string[] = [];
  for (const f of character.features) {
    if ("custom" in f || f.featAbility || out.includes(f.srdId)) continue;
    if (featAbilityMatters(grantsOf(f.srdId))) out.push(f.srdId);
  }
  return out;
}
