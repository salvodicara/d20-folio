/**
 * Persistent areas on the encounter (edge-case family M9, docs/architecture/2026-11-zones.md):
 * Spirit Guardians, Moonbeam, Spike Growth, Darkness, Daylight, Wall of Fire, Conjure
 * Animals' pack. The spell's catalogue `zone` says where it sits, what light it makes
 * and which moments trigger it; an instance is a persistent combat effect of kind
 * `zone` (its caster, cast level, the creatures it spares, ending with its source).
 *
 * Pure: the zone instances in, what a moment triggers out. There is no geometry, so
 * the table says who enters, starts or ends a turn inside; the engine says whether
 * that counts.
 */
import { getSpellById } from "@/data/spells";
import type { SpellZone } from "@/data/types";
import type { ActiveCombatEffect } from "@/types/combat-effect";

/** One area on the field. */
export interface ZoneInstance {
  /** The effect occurrence that holds it (revoked with its source). */
  id: string;
  spellId: string;
  zone: SpellZone;
  /** Who cast it, by combatant id. */
  casterId: string;
  /** The level it was cast at (its own level when unknown). */
  castLevel: number;
  /** The creatures it leaves alone (Spirit Guardians: the caster's choice). */
  spared: ReadonlyArray<string>;
}

/** The zones among the encounter's live effects. */
export function activeZones(effects: ReadonlyArray<ActiveCombatEffect>): ZoneInstance[] {
  return effects.flatMap((effect): ZoneInstance[] => {
    if (effect.payload.kind !== "zone") return [];
    const zone = getSpellById(effect.payload.spellId)?.zone;
    if (!zone) return [];
    return [
      {
        id: effect.id,
        spellId: effect.payload.spellId,
        zone,
        casterId: effect.actor.combatantId,
        castLevel: effect.source.castLevel ?? zone.spellLevel,
        spared: effect.payload.spared ?? [],
      },
    ];
  });
}

/** A moment that may trigger a zone on a creature. `moved-onto`: the zone itself
 *  moved onto the creature (Conjure Animals' pack), which counts as entering it. */
export interface ZoneMoment {
  kind: "enter" | "start-turn" | "end-turn" | "move-within" | "moved-onto";
  creatureId: string;
  /** The turn it happens in: the once-per-turn ledger's key. */
  turn: { round: number; combatantId: string };
  /** Pushed or pulled in (Thorn Whip into Spike Growth): it still counts. */
  forced?: boolean;
}

/** Which zone already hit which creature on which turn: `zoneId|creatureId` → turn. */
export type ZoneLedger = Readonly<Record<string, string>>;

/** Why a moment doesn't trigger the zone. */
export type ZoneMiss = "not-a-trigger" | "spared" | "already-this-turn";

const turnKey = (turn: ZoneMoment["turn"]): string => `${turn.round}:${turn.combatantId}`;

/**
 * Whether `moment` triggers `zone` on its creature, and the ledger after. A zone hits
 * a creature at most once per turn (Spirit Guardians, Moonbeam: "the first time on a
 * turn"), spares the creatures its caster chose, and counts forced movement as
 * movement. Spike Growth's damage per 5 feet moved (`move-within`) is the table's
 * count, not a once-per-turn trigger.
 */
export function zoneTriggers(
  zone: ZoneInstance,
  moment: ZoneMoment,
  ledger: ZoneLedger = {}
): { fires: true; ledger: ZoneLedger } | { fires: false; reason: ZoneMiss } {
  const kind = moment.kind === "moved-onto" ? "enter" : moment.kind;
  if (!zone.zone.triggers.includes(kind))
    return { fires: false, reason: "not-a-trigger" };
  if (zone.spared.includes(moment.creatureId)) return { fires: false, reason: "spared" };
  if (kind === "move-within") return { fires: true, ledger };
  const key = `${zone.id}|${moment.creatureId}`;
  const now = turnKey(moment.turn);
  if (ledger[key] === now) return { fires: false, reason: "already-this-turn" };
  return { fires: true, ledger: { ...ledger, [key]: now } };
}

type Light = NonNullable<SpellZone["light"]>;
const DARK: ReadonlySet<Light> = new Set(["darkness", "magical-darkness"]);

/**
 * The light where several zones overlap. Darkness and light from spells dispel each
 * other by level: Daylight (3rd) dispels a Darkness of 3rd level or lower, Darkness
 * (2nd) dispels light from a spell of 2nd level or lower. The higher level wins; on a
 * tie the newer zone (later in the list) wins. Zones that make no light are ignored.
 */
export function zoneLight(zones: ReadonlyArray<ZoneInstance>): Light | null {
  let winner: { light: Light; level: number } | null = null;
  for (const zone of zones) {
    const light = zone.zone.light;
    if (!light) continue;
    if (!winner) {
      winner = { light, level: zone.castLevel };
    } else if (DARK.has(light) === DARK.has(winner.light)) {
      // Two darknesses (or two lights): the newer one, at the stronger level.
      winner = { light, level: Math.max(zone.castLevel, winner.level) };
    } else if (zone.castLevel >= winner.level) {
      // Light against darkness: the higher level dispels the other.
      winner = { light, level: zone.castLevel };
    }
  }
  return winner?.light ?? null;
}

/** The zone a spell leaves, as a persistent combat effect payload. */
export function zonePayload(
  spellId: string,
  spared: ReadonlyArray<string> = []
): Extract<ActiveCombatEffect["payload"], { kind: "zone" }> {
  return { kind: "zone", spellId, ...(spared.length > 0 ? { spared: [...spared] } : {}) };
}
