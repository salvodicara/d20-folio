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
 * A TARGET-SCOPED buff (Hex, Hunter's Mark) lands as TWO standings with one
 * shared lifetime: the `active-key` fact that lights the buff's riders, and a
 * `target-mark` fact recording whom the caster marked. In solo play the marked
 * creature is table-abstract (the app models no enemy), so the attack/damage
 * flows read the KEY — the same read legacy makes — and the "+1d6 vs cursed
 * target" chip stays player-applied on the right hit; the mark projection
 * ({@link worldStandingTargetMarks}) exposes the mark identities for the
 * surfaces that will one day model per-target identity (the party board, whose
 * turns stay legacy-owned today).
 *
 * Fail-closed narrow read: `session.world` is persisted as `unknown`, and this
 * is a hot path (every sheet-wide aggregation), so the projection walks the
 * raw value with structural guards instead of running the full material-state
 * parse — anything malformed contributes nothing. Only `active-key` and
 * `target-mark` standings are projected today: transcribed character programs
 * emit exactly those fact kinds (inner mechanics ride the derived grant layer,
 * keyed by the active key); `damage-defense` / `condition-immunity` /
 * `grant-group` standings have no character-side emitter yet, so they gain a
 * projection when an emitter lands, not before. Conditions and concentration
 * already reach the session through the commit mirror
 * (`mechanics-world-store.ts`).
 */

const EMPTY_KEYS: ReadonlySet<string> = new Set();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The LIVE standing occurrences held on the character's own self entity. */
function liveSelfStandings(world: unknown): Record<string, unknown>[] {
  if (!isRecord(world) || !isRecord(world.occurrences)) return [];
  const standings: Record<string, unknown>[] = [];
  for (const occurrence of Object.values(world.occurrences)) {
    if (
      !isRecord(occurrence) ||
      occurrence.kind !== "standing" ||
      occurrence.ending !== null
    ) {
      continue;
    }
    const target = occurrence.target;
    if (!isRecord(target) || target.entityId !== "self") continue;
    const material = target.material;
    if (!isRecord(material) || material.kind !== "character-play") continue;
    standings.push(occurrence);
  }
  return standings;
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
  const keys = new Set<string>();
  for (const occurrence of liveSelfStandings(world)) {
    const fact = occurrence.fact;
    if (
      isRecord(fact) &&
      fact.kind === "active-key" &&
      typeof fact.key === "string" &&
      fact.key.length > 0
    ) {
      keys.add(fact.key);
    }
  }
  return keys.size > 0 ? keys : EMPTY_KEYS;
}

/**
 * The `target-mark` identities of every LIVE standing the persisted world
 * holds on the character itself — the marks the character currently owns
 * (Hex's "cursed", Hunter's Mark's "marked"). The mark standing shares its
 * lifetime with the buff's `active-key` twin (both end with the source), so
 * this is the read seam for any attack/damage surface that needs the mark's
 * IDENTITY rather than the buff's riders; solo surfaces read the key union
 * ({@link sessionActiveKeys}) because the marked creature is table-abstract.
 */
export function worldStandingTargetMarks(world: unknown): ReadonlySet<string> {
  const marks = new Set<string>();
  for (const occurrence of liveSelfStandings(world)) {
    const fact = occurrence.fact;
    if (
      isRecord(fact) &&
      fact.kind === "target-mark" &&
      typeof fact.markId === "string" &&
      fact.markId.length > 0
    ) {
      marks.add(fact.markId);
    }
  }
  return marks.size > 0 ? marks : EMPTY_KEYS;
}

/** The session slices the one active-key union reads. */
export interface ActiveKeySession {
  readonly activeFeatures?: readonly string[];
  readonly world?: unknown;
}

/**
 * The ONE active-key set every `while-active` gate reads: the legacy
 * `session.activeFeatures` chips UNIONED with the LIVE `active-key` standings
 * of the character's persisted engine world. Every GATING read (grant
 * aggregation, action-row riders, maintainer visibility) goes through this, so
 * an engine-cast buff lights exactly what a legacy chip lights — rule 6, one
 * truth. The legacy chip LIFECYCLE machinery (timers, rest/trigger expiry,
 * maintenance prompts) deliberately stays on the bare `session.activeFeatures`
 * ledger it mutates: engine standings own their lifetimes in the kernel, and a
 * legacy expiry sweep must never try to end one.
 */
export function sessionActiveKeys(session: ActiveKeySession): Set<string> {
  const keys = new Set(session.activeFeatures ?? []);
  for (const key of worldStandingActiveKeys(session.world)) keys.add(key);
  return keys;
}
