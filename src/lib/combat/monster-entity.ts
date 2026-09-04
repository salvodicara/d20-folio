/**
 * `projectMonster` — a typed `MonsterStatBlock` becomes a creature seated at the table:
 * one `Entity` plus the executable definitions it CARRIES into the encounter log.
 *
 * Stage 6 design §2 D2/D3: the fold must be identical on every client, including one that
 * never loaded the lazy bestiary and one running the SRD-only build while the DM runs a
 * content-pack monster. So `add-entity` ships the programs as data, and their ids are
 * instance-scoped (`monster:<seat.id>:<actionId>`) — two ogres at the same table never
 * collide, and nothing a projection emits can shadow the static `core:*` catalogue.
 *
 * PURE, like the rest of the kernel: types from `@/data/types`, the stat-block derivations
 * from `@/lib/monster` (PB from CR, saves from mod + PB × proficiency — the one home of
 * that math, golden rule 6), the adapter next door, and the core ids from the catalogue
 * that authors them. No clock, no RNG, no i18n, no UI.
 *
 * `origin.srdId` stays "a catalogue reference, never a copy" for what it NAMES — the stat
 * block the DM's drawer shows — while the executable programs here are the projection's,
 * refreshed by `sync` exactly as `stats` is.
 */
import type { MonsterSpellcastingEntry, MonsterStatBlock } from "@/data/types";
import { abilityModifier } from "@/lib/ability";
import { monsterSaveBonus, pbForCr } from "@/lib/monster";
import { CORE_MECHANIC_IDS } from "@/data/combat/core-catalogue";
import type { EntityId, LabelId, MechanicId } from "./ids";
import type { Ability, ConditionId, Entity } from "./types";
import type { Mechanic } from "./mechanic";
import { monsterMechanics } from "./monster-adapter";

/** Where a monster sits: the id and label the DM's "Add" minted for THIS creature. */
export interface MonsterSeat {
  readonly id: EntityId;
  readonly label: LabelId;
  readonly controllerUid: string;
  /** The allocation the id and label were minted from (`FoldedState.nextOrdinal`) — the
   *  "Goblin 3" the DM sees, carried so the seat is self-describing to its caller. */
  readonly ordinal: number;
}

const ABILITIES: readonly Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

function abilities(block: MonsterStatBlock): Record<Ability, number> {
  const out = {} as Record<Ability, number>;
  for (const ability of ABILITIES) {
    out[ability] = abilityModifier(block.abilityScores[ability]);
  }
  return out;
}

function saves(block: MonsterStatBlock): Record<Ability, number> {
  const out = {} as Record<Ability, number>;
  for (const ability of ABILITIES) {
    out[ability] = monsterSaveBonus(block, ability);
  }
  return out;
}

/** The condition-immunity LINE as ids: the qualified prints ("Charmed (with Mind Blank)")
 *  carry a prose note the engine cannot gate on, so only the id crosses over. */
function conditionImmunities(block: MonsterStatBlock): ConditionId[] {
  return (block.conditionImmunities ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.id
  );
}

/** The block's printed Spellcasting numbers, when it prints any. Scoped to `actions`, like
 *  the adapter (`traits`/`reactions`/`legendaryActions` are `later`). */
function spellcasting(block: MonsterStatBlock): MonsterSpellcastingEntry | null {
  return (
    block.actions.find(
      (entry): entry is MonsterSpellcastingEntry => entry.kind === "spellcasting"
    ) ?? null
  );
}

/**
 * The adapter's one mechanic, split into one instance-scoped mechanic per action so a
 * hotbar tile, a cost and an undo all address a single named thing. Program bodies are the
 * adapter's, untouched: this function re-keys, it never re-authors.
 */
function seatedMechanics(block: MonsterStatBlock, seat: MonsterSeat): Mechanic[] {
  return (monsterMechanics(block).active ?? []).map((program) => ({
    schema: 1,
    id: `monster:${seat.id}:${program.id}`,
    source: "monster",
    label: `${block.id}.actions.${program.id}`,
    active: [program],
  }));
}

export function projectMonster(
  block: MonsterStatBlock,
  seat: MonsterSeat
): { entity: Entity; mechanics: Mechanic[] } {
  const mechanics = seatedMechanics(block, seat);
  const ids: MechanicId[] = [...mechanics.map((m) => m.id), ...CORE_MECHANIC_IDS];
  const cast = spellcasting(block);
  const entity: Entity = {
    id: seat.id,
    kind: "monster",
    label: seat.label,
    controllerUid: seat.controllerUid,
    controlledBy: null,
    origin: { kind: "monster", srdId: block.id },
    stats: {
      ac: block.ac,
      maxHp: block.hp.average,
      speed: block.speeds.walk ?? 0,
      proficiency: pbForCr(block.cr),
      abilities: abilities(block),
      saves: saves(block),
      spellSaveDc: cast?.dc ?? null,
      spellAttack: cast?.toHit ?? null,
      // Multiattack is prose in the corpus (`monster-adapter.ts`): claiming more than one
      // attack per action would spend budget the table never authorised.
      attacksPerAction: 1,
      resistances: block.damageResistances ?? [],
      immunities: block.damageImmunities ?? [],
      vulnerabilities: block.damageVulnerabilities ?? [],
      conditionImmunities: conditionImmunities(block),
    },
    vitals: {
      hp: block.hp.average,
      tempHp: null,
      deathSaves: { successes: 0, failures: 0 },
      life: "alive",
      exhaustion: 0,
    },
    // Recharge and Legendary Action budgets are `later` (authoring spec §6); an empty
    // record is the honest statement that this build tracks neither.
    resources: {},
    concentration: null,
    turn: {
      action: 0,
      bonus: 0,
      reaction: 0,
      attacksUsed: 0,
      movementUsed: 0,
      movementExtra: 0,
      claims: [],
    },
    overrides: {},
    // Players see the token from the moment it is placed; the stat block and the HP stay
    // the DM's until they reveal them (`settings.revealMonsterHp`).
    reveal: { block: false, hp: false, token: true },
    position: null,
    mechanics: ids,
  };
  return { entity, mechanics };
}
