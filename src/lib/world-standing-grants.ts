/**
 * The world-standing projection — the FIRST sheet read of the character's
 * persisted mechanics world (`session.world`).
 *
 * An engine-executed cast records its while-active buff as a STANDING
 * occurrence carrying an `active-key` fact (the exact same key vocabulary the
 * legacy `session.activeFeatures` chips use), owned by the engine's lifetime
 * machinery instead of a manual toggle. This module projects those live
 * standings back into the ONE key set the grants evaluator already gates
 * `while-active` grants on, so a Shield standing in the world yields its +5 AC
 * (and any resistance/advantage/speed rider the buff carries) on the sheet
 * with no legacy activation row — and a buff active BOTH ways during the
 * rollout (legacy chip + world standing) dedupes by key identity into ONE
 * grant evaluation by construction (a set union cannot double-count).
 *
 * Fail-closed narrow read: `session.world` is persisted as `unknown`, and this
 * is a hot path (every sheet-wide aggregation), so the projection walks the
 * raw value with structural guards instead of running the full material-state
 * parse — anything malformed contributes nothing. Only `active-key` standings
 * are projected today: transcribed character programs emit exactly that fact
 * kind for buffs (inner mechanics ride the derived grant layer, keyed by the
 * active key); `damage-defense` / `condition-immunity` / `grant-group`
 * standings have no character-side emitter yet, so they gain a projection when
 * an emitter lands, not before. Conditions and concentration already reach the
 * session through the commit mirror (`mechanics-world-store.ts`).
 */

const EMPTY_KEYS: ReadonlySet<string> = new Set();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The `active-key` facts of every LIVE standing occurrence the persisted world
 * holds on the character itself. `world` is the raw `session.world` value; a
 * missing or malformed world projects the empty set. A standing counts only
 * when it is live (`ending === null`) and targets the character's own self
 * entity — the value physically lives inside this character's document, so a
 * `character-play` self target is this character by construction.
 */
export function worldStandingActiveKeys(world: unknown): ReadonlySet<string> {
  if (!isRecord(world) || !isRecord(world.occurrences)) return EMPTY_KEYS;
  const keys = new Set<string>();
  for (const occurrence of Object.values(world.occurrences)) {
    if (
      !isRecord(occurrence) ||
      occurrence.kind !== "standing" ||
      occurrence.ending !== null
    ) {
      continue;
    }
    const fact = occurrence.fact;
    if (
      !isRecord(fact) ||
      fact.kind !== "active-key" ||
      typeof fact.key !== "string" ||
      fact.key.length === 0
    ) {
      continue;
    }
    const target = occurrence.target;
    if (!isRecord(target) || target.entityId !== "self") continue;
    const material = target.material;
    if (!isRecord(material) || material.kind !== "character-play") continue;
    keys.add(fact.key);
  }
  return keys.size > 0 ? keys : EMPTY_KEYS;
}
