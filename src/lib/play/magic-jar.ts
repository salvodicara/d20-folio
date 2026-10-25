/**
 * Magic Jar (SRD 5.2.1, level 6 Necromancy) on the caster's own sheet, as pure play
 * transitions — the character in, the next character out:
 *
 *  - the soul leaves the body for the container: the caster can't move or take
 *    Reactions, and its only action is to project its soul;
 *  - possessing a Humanoid (its Charisma save failed) replaces the caster's Hit Points,
 *    Hit Point Dice, Strength, Dexterity, Constitution, Speed and senses with the
 *    host's; everything else (Intelligence, Wisdom, Charisma, class features, spells)
 *    stays the caster's. The host's Hit Points become the sheet's own pool, so damage
 *    and healing work as usual;
 *  - a Magic action returns the soul to the container and the caster's own body
 *    numbers, handing back the host's remaining Hit Points for the DM;
 *  - the host body dying asks a Charisma save against the caster's own spell DC: a
 *    success with the container within 100 feet returns the soul to it, otherwise the
 *    caster dies;
 *  - from the container, returning to the living body ends the spell.
 *
 * Like the self-forms (`forms.ts`, `lib/polymorph`), every replaced number lands in
 * the field the player edits by hand, and `prior` restores it exactly. The 24 hours a
 * resisting target can't be possessed again stays the table's.
 */
import type { MonsterStatBlock } from "@/data/types";
import type { CharacterDoc, MagicJarPrior, MagicJarState } from "@/types/character";
import type { CreatureType } from "@/data/types";
import { setHp } from "./vitals";

/** The senses a host's stat block can print; each replaces the caster's own. */
const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"] as const;
type Sense = (typeof SENSES)[number];

const HIT_DIE_SIZES = [4, 6, 8, 10, 12] as const;
type HitDie = (typeof HIT_DIE_SIZES)[number];

/** The host's numbers a possession takes, read from its stat block. */
export interface MagicJarHost {
  id: string;
  type: CreatureType;
  hp: { current: number; max: number };
  /** From the printed Hit Point formula ("8d8+16" → 8 d8). */
  hitDice: { count: number; die: HitDie } | null;
  abilityScores: Record<"STR" | "DEX" | "CON", number>;
  speeds: MonsterStatBlock["speeds"];
  senses: Partial<Record<Sense, number>>;
}

/** What the caster can do while its soul is out of its body. */
export type MagicJarFacts =
  | { stage: "container"; canMove: false; reactions: false; actions: ["project-soul"] }
  | { stage: "host"; hostId: string };

/** The host a stat block makes, at `currentHp` (default: its average Hit Points). */
export function magicJarHost(block: MonsterStatBlock, currentHp?: number): MagicJarHost {
  const max = block.hp.average;
  const dice = block.hp.formula.match(/^(\d+)d(\d+)/);
  const die = Number(dice?.[2]);
  const senses: Partial<Record<Sense, number>> = {};
  for (const sense of SENSES) {
    const range = block.senses?.[`${sense}Ft`];
    if (typeof range === "number") senses[sense] = range;
  }
  return {
    id: block.id,
    type: block.type,
    hp: { current: Math.min(max, Math.max(0, currentHp ?? max)), max },
    hitDice:
      dice && (HIT_DIE_SIZES as readonly number[]).includes(die)
        ? { count: Number(dice[1]), die: die as HitDie }
        : null,
    abilityScores: {
      STR: block.abilityScores.STR,
      DEX: block.abilityScores.DEX,
      CON: block.abilityScores.CON,
    },
    speeds: block.speeds,
    senses,
  };
}

/** The spell's current facts on the caster, or null when it is not running. */
export function magicJarFacts(doc: CharacterDoc): MagicJarFacts | null {
  const jar = doc.session.magicJar;
  if (!jar) return null;
  return jar.stage === "container"
    ? { stage: "container", canMove: false, reactions: false, actions: ["project-soul"] }
    : { stage: "host", hostId: jar.hostId };
}

function withJar(doc: CharacterDoc, jar: MagicJarState | undefined): CharacterDoc {
  const session = { ...doc.session };
  if (jar) session.magicJar = jar;
  else delete session.magicJar;
  return { ...doc, session };
}

/** The soul leaves the body for the container. Null while the spell already runs. */
export function enterMagicJar(doc: CharacterDoc): CharacterDoc | null {
  if (doc.session.magicJar) return null;
  return withJar(doc, { stage: "container" });
}

/** From the container, the soul returns to its living body: the spell ends. Null
 *  unless the soul is in the container. */
export function returnToBody(doc: CharacterDoc): CharacterDoc | null {
  if (doc.session.magicJar?.stage !== "container") return null;
  return withJar(doc, undefined);
}

function priorOf(doc: CharacterDoc): MagicJarPrior {
  const c = doc.character;
  return {
    abilityScores: {
      STR: c.abilityScores.STR,
      DEX: c.abilityScores.DEX,
      CON: c.abilityScores.CON,
    },
    speedOverride: c.speedOverride ?? null,
    speedOverrides: { ...(c.speedOverrides ?? {}) },
    senseRangeOverrides: { ...(c.senseRangeOverrides ?? {}) },
    hpMax: c.hp.max,
    hpCurrent: doc.session.hp.current,
    hpMaxReduction: doc.session.hpMaxReduction ?? 0,
    hitDieType: c.hitDieType,
    hitDiceTotalOverride: c.hitDiceTotalOverride ?? null,
    hitDiceUsed: doc.session.hitDice.used,
  };
}

/**
 * The soul enters the host's body (its Charisma save failed): the host's numbers
 * replace the caster's. Null unless the soul is in the container and the host is a
 * Humanoid.
 */
export function possessHost(doc: CharacterDoc, host: MagicJarHost): CharacterDoc | null {
  if (doc.session.magicJar?.stage !== "container" || host.type !== "humanoid")
    return null;
  const prior = priorOf(doc);
  const speedOverrides: Record<string, number | null> = {};
  for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
    speedOverrides[mode] = host.speeds[mode] ?? 0;
  }
  const senseRangeOverrides: Record<string, number | null> = {
    ...prior.senseRangeOverrides,
  };
  for (const sense of SENSES) senseRangeOverrides[sense] = host.senses[sense] ?? 0;
  const character = {
    ...doc.character,
    abilityScores: { ...doc.character.abilityScores, ...host.abilityScores },
    speedOverride: host.speeds.walk ?? 0,
    speedOverrides,
    senseRangeOverrides,
    hp: { ...doc.character.hp, max: host.hp.max },
    ...(host.hitDice
      ? { hitDieType: host.hitDice.die, hitDiceTotalOverride: host.hitDice.count }
      : {}),
  };
  const session = {
    ...doc.session,
    hitDice: { ...doc.session.hitDice, used: 0 },
    magicJar: { stage: "host" as const, hostId: host.id, prior },
  };
  delete session.hpMaxReduction;
  const swapped: CharacterDoc = { ...doc, character, session };
  return { ...swapped, session: setHp(swapped, host.hp.current) };
}

/** The caster's own body numbers back from `prior`, the spell's state set to `jar`. */
function restore(
  doc: CharacterDoc,
  prior: MagicJarPrior,
  jar: MagicJarState | undefined
): CharacterDoc {
  const character = {
    ...doc.character,
    abilityScores: { ...doc.character.abilityScores, ...prior.abilityScores },
    speedOverride: prior.speedOverride,
    speedOverrides: { ...prior.speedOverrides },
    senseRangeOverrides: { ...prior.senseRangeOverrides },
    hp: { ...doc.character.hp, max: prior.hpMax },
    hitDieType: prior.hitDieType,
  };
  if (prior.hitDiceTotalOverride === null) delete character.hitDiceTotalOverride;
  else character.hitDiceTotalOverride = prior.hitDiceTotalOverride;
  const session = {
    ...doc.session,
    hitDice: { ...doc.session.hitDice, used: prior.hitDiceUsed },
  };
  if (prior.hpMaxReduction > 0) session.hpMaxReduction = prior.hpMaxReduction;
  else delete session.hpMaxReduction;
  const back = withJar({ ...doc, character, session }, jar);
  return { ...back, session: setHp(back, prior.hpCurrent) };
}

/**
 * A Magic action takes the soul from the host back to the container (within 100
 * feet): the caster's own numbers return, and `hostHp` is what the host body is left
 * with, for the DM's creature. Null unless the soul is in a host.
 */
export function returnToContainer(
  doc: CharacterDoc
): { doc: CharacterDoc; hostId: string; hostHp: number } | null {
  const jar = doc.session.magicJar;
  if (jar?.stage !== "host") return null;
  return {
    doc: restore(doc, jar.prior, { stage: "container" }),
    hostId: jar.hostId,
    hostHp: doc.session.hp.current,
  };
}

/**
 * The host body died with the soul in it (0 Hit Points): the caster's Charisma save
 * against its own spell save DC decides. A success with the container within 100 feet
 * returns the soul to it; otherwise the caster dies (`dies`: the caller marks the
 * death; the sheet's numbers are the caster's own again and the spell is over). Null
 * while the host still has Hit Points or no host is possessed.
 */
export function hostBodyDies(
  doc: CharacterDoc,
  roll: { saved: boolean; containerInRange: boolean }
): { doc: CharacterDoc; outcome: "container" | "dies" } | null {
  const jar = doc.session.magicJar;
  if (jar?.stage !== "host" || doc.session.hp.current > 0) return null;
  return roll.saved && roll.containerInRange
    ? { doc: restore(doc, jar.prior, { stage: "container" }), outcome: "container" }
    : { doc: restore(doc, jar.prior, undefined), outcome: "dies" };
}
