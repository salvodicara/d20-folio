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
import type { AbilityCode, SpellZone, SrdSpellData } from "@/data/types";
import { scaleUpcastDice } from "@/lib/utils";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { DamageType } from "@/types/damage";

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
  /** The caster's save DC, when the effect was written with it (a monster's). */
  saveDc?: number;
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
        ...(effect.bindings?.saveDc !== undefined
          ? { saveDc: effect.bindings.saveDc }
          : {}),
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

/**
 * The zone a cast leaves on the encounter (M9): its caster's combatant, the level it
 * was cast at, and its source's lifetime (Concentration, or the encounter).
 */
export function zoneEffectForCast(cast: {
  effectId: string;
  spellId: string;
  actionId: string;
  castLevel: number;
  caster: ActiveCombatEffect["actor"];
  concentration: boolean;
  spared?: ReadonlyArray<string>;
}): ActiveCombatEffect {
  return {
    id: cast.effectId,
    actor: cast.caster,
    target: cast.caster,
    source: {
      kind: "spell",
      id: cast.spellId,
      actionId: cast.actionId,
      castLevel: cast.castLevel,
    },
    payload: zonePayload(cast.spellId, cast.spared),
    duration: cast.concentration
      ? {
          kind: "concentration",
          actorId: cast.caster.combatantId,
          sourceId: cast.spellId,
        }
      : { kind: "encounter" },
  };
}

/**
 * Whom a "designate creatures" zone spares by default (Spirit Guardians: "you can
 * designate any number of creatures you can see to be unaffected"): every ally on
 * the field, the party's PCs and their companions, pre-selected for the caster to
 * edit. Never none: that would hit the party on the first turn. A zone that spares
 * no one by choice (Moonbeam) spares no one.
 */
export function defaultSpared(
  zone: Pick<SpellZone, "spares">,
  rows: ReadonlyArray<{ id: string; kind: "pc" | "monster"; side?: "ally" | "enemy" }>,
  casterId: string
): string[] {
  if (zone.spares !== "chosen") return [];
  return rows
    .filter(
      (row) =>
        row.id !== casterId &&
        (row.side ?? (row.kind === "pc" ? "ally" : "enemy")) === "ally"
    )
    .map((row) => row.id);
}

/**
 * A spell's effect that ends once it has spent a total (Guardian of Faith "vanishes
 * when it has dealt a total of 60 damage"). `taken` is the damage the creature
 * actually took, after resistance and immunity; the last hit lands whole and the
 * effect ends after it.
 */
export function budgetSpent(
  budget: Pick<NonNullable<SrdSpellData["budget"]>, "max">,
  spent: number,
  taken: number
): { spent: number; ends: boolean } {
  const total = Math.min(budget.max, spent + Math.max(0, taken));
  return { spent: total, ends: total >= budget.max };
}

/** A zone that fires on a creature at a turn boundary. */
export interface ZoneTurnHit {
  zone: ZoneInstance;
  creatureId: string;
  kind: "start-turn" | "end-turn";
}

/**
 * What a turn change fires (edge-case M9): the creature whose turn ended may be in a
 * zone that triggers at the end of a turn, the one whose turn starts in one that
 * triggers at the start. The table says whether it is inside; the engine says the
 * zone counts (its triggers, whom it spares, once per turn) and keeps the ledger.
 */
export function zoneTurnHits(
  zones: ReadonlyArray<ZoneInstance>,
  turn: {
    round: number;
    ended: string | null;
    started: string | null;
  },
  ledger: ZoneLedger
): { hits: ZoneTurnHit[]; ledger: ZoneLedger } {
  let next = ledger;
  const hits: ZoneTurnHit[] = [];
  const moments: Array<{ kind: ZoneTurnHit["kind"]; creatureId: string | null }> = [
    { kind: "end-turn", creatureId: turn.ended },
    { kind: "start-turn", creatureId: turn.started },
  ];
  for (const { kind, creatureId } of moments) {
    if (!creatureId) continue;
    for (const zone of zones) {
      const result = zoneTriggers(
        zone,
        { kind, creatureId, turn: { round: turn.round, combatantId: creatureId } },
        next
      );
      if (!result.fires) continue;
      next = result.ledger;
      hits.push({ zone, creatureId, kind });
    }
  }
  return { hits, ledger: next };
}

/**
 * A zone cast by a monster (the DM's Spirit Guardians, Cloudkill): the same effect as
 * a PC's cast, with the monster as caster and the DC from its stat block. It lasts
 * the encounter; the DM ends it (a monster's Concentration isn't tracked).
 */
export function monsterZoneEffect(cast: {
  effectId: string;
  monsterId: string;
  spellId: string;
  castLevel: number;
  saveDc: number;
  spared?: ReadonlyArray<string>;
}): ActiveCombatEffect {
  return {
    ...zoneEffectForCast({
      effectId: cast.effectId,
      spellId: cast.spellId,
      actionId: "cast",
      castLevel: cast.castLevel,
      caster: { kind: "monster", combatantId: cast.monsterId },
      concentration: false,
      ...(cast.spared ? { spared: cast.spared } : {}),
    }),
    bindings: { saveDc: cast.saveDc },
  };
}

/** What a zone's hit asks of the creature: the save and DC, the dice at the level it
 *  was cast, the damage type, and what a success does. */
export interface ZoneHitDamage {
  saveAbility?: AbilityCode;
  dc?: number;
  dice?: string;
  damageType?: DamageType;
  onSave?: "half";
}

/** The spell's numbers for one hit of `zone`, scaled to its cast level. */
export function zoneHitDamage(zone: ZoneInstance): ZoneHitDamage {
  const spell = getSpellById(zone.spellId);
  if (!spell) return {};
  const dice = scaleUpcastDice(spell, zone.castLevel);
  return {
    ...(spell.saveAbility ? { saveAbility: spell.saveAbility } : {}),
    ...(zone.saveDc !== undefined ? { dc: zone.saveDc } : {}),
    ...(dice ? { dice } : {}),
    ...(spell.damageType ? { damageType: spell.damageType } : {}),
    ...(spell.damageOnSave ? { onSave: spell.damageOnSave } : {}),
  };
}
