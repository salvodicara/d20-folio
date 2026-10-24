/**
 * A monster's Concentration in the encounter (SRD 5.2.1 "Concentration"), as pure
 * functions over the encounter state: casting a Concentration spell from its stat
 * block starts it (and drops the one it held); damage asks the DM for a Constitution
 * save at DC max(10, half the damage), at most 30; a declared failure ends it; so do
 * the Incapacitated condition (or one that includes it) and 0 Hit Points.
 *
 * The app never rolls: a save is prompt data for the DM (`MonsterConcentrationSave`),
 * the DM declares the result. The stored field is `EncounterMonster.concentration`
 * (reader first; see its doc).
 */
import { getSpellById } from "@/data/spells";
import type { MonsterStatBlock } from "@/data/types";
import { concentrationSaveDc } from "@/lib/compute";
import { monsterSaveBonus } from "@/lib/monster";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;

/** SRD: Incapacitated, and the conditions that include it. */
const INCAPACITATING = new Set([
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
]);

/** The Concentration spells a stat block's Spellcasting entries list, printed order. */
export function monsterConcentrationSpells(block: MonsterStatBlock): string[] {
  const ids: string[] = [];
  for (const section of SECTIONS) {
    for (const entry of block[section] ?? []) {
      if (entry.kind !== "spellcasting") continue;
      ids.push(...(entry.atWill ?? []));
      for (const tier of entry.perDay ?? []) ids.push(...tier.spellIds);
    }
  }
  return [...new Set(ids)].filter((id) => getSpellById(id)?.concentration === true);
}

function mapMonster(
  state: EncounterState,
  id: string,
  fn: (monster: EncounterMonster) => EncounterMonster
): EncounterState {
  const index = state.combatants.findIndex((c) => c.kind === "monster" && c.id === id);
  const current = state.combatants[index];
  if (current?.kind !== "monster") return state;
  const next = fn(current);
  if (next === current) return state;
  return { ...state, combatants: state.combatants.with(index, next) };
}

function withoutConcentration(monster: EncounterMonster): EncounterMonster {
  if (monster.concentration === undefined) return monster;
  const rest = { ...monster };
  delete rest.concentration;
  return rest;
}

/** The monster casts a Concentration spell: it now concentrates on `spellId` alone. */
export function startMonsterConcentration(
  state: EncounterState,
  id: string,
  spellId: string
): EncounterState {
  const spell = spellId.trim();
  if (!spell) return state;
  return mapMonster(state, id, (monster) =>
    monster.concentration === spell ? monster : { ...monster, concentration: spell }
  );
}

/** The monster's Concentration ends (dropped, or a failed save). */
export function endMonsterConcentration(
  state: EncounterState,
  id: string
): EncounterState {
  return mapMonster(state, id, withoutConcentration);
}

/** The Constitution save the DM rolls for a concentrating monster that took damage. */
export interface MonsterConcentrationSave {
  monsterId: string;
  spell: string;
  ability: "CON";
  dc: number;
  /** The stat block's Constitution save; absent for a custom monster. */
  bonus?: number;
}

/** Resolves a monster's stat block by its bestiary id. The bestiary is a lazy chunk,
 *  so the caller (the DM's encounter screen, which holds it) passes `getMonster`. */
export type MonsterBlockLookup = (srdId: string) => MonsterStatBlock | undefined;

/** The save one hit of `damage` asks, or null (not concentrating, no damage). */
export function monsterConcentrationSave(
  monster: EncounterMonster,
  damage: number,
  blockOf?: MonsterBlockLookup
): MonsterConcentrationSave | null {
  const spell = monster.concentration;
  const dc = concentrationSaveDc(damage);
  if (!spell || dc === 0) return null;
  const block = monster.srdId ? blockOf?.(monster.srdId) : undefined;
  return {
    monsterId: monster.id,
    spell,
    ability: "CON",
    dc,
    ...(block ? { bonus: monsterSaveBonus(block, "CON") } : {}),
  };
}

function isDownOrIncapacitated(monster: EncounterMonster): boolean {
  return (
    monster.hp.current <= 0 ||
    monster.conditions.some((condition) => INCAPACITATING.has(condition))
  );
}

/**
 * The saves an encounter change asks: every concentrating monster whose Hit Points
 * (Temporary ones included) dropped, read from the state before and after the damage
 * path ran. A monster the damage dropped to 0 asks none: its Concentration just ends.
 */
export function monsterConcentrationSavesAfter(
  before: EncounterState,
  after: EncounterState,
  blockOf?: MonsterBlockLookup
): MonsterConcentrationSave[] {
  const prior = new Map(
    before.combatants.flatMap((c) => (c.kind === "monster" ? [[c.id, c] as const] : []))
  );
  return after.combatants.flatMap((monster) => {
    const was = prior.get(monster.id);
    if (monster.kind !== "monster" || !was || isDownOrIncapacitated(monster)) return [];
    const damage = was.hp.current + was.hp.temp - (monster.hp.current + monster.hp.temp);
    const save = monsterConcentrationSave(monster, damage, blockOf);
    return save ? [save] : [];
  });
}

/** The DM declared the save: a failure ends Concentration, a success keeps it. */
export function resolveMonsterConcentrationSave(
  state: EncounterState,
  id: string,
  passed: boolean
): EncounterState {
  return passed ? state : endMonsterConcentration(state, id);
}

/** End the Concentration of every monster at 0 Hit Points or Incapacitated, and say
 *  whose ended (for the DM's notice). */
export function settleMonsterConcentration(state: EncounterState): {
  state: EncounterState;
  ended: Array<{ monsterId: string; spell: string }>;
} {
  const ended: Array<{ monsterId: string; spell: string }> = [];
  let next = state;
  for (const combatant of state.combatants) {
    if (combatant.kind !== "monster" || !combatant.concentration) continue;
    if (!isDownOrIncapacitated(combatant)) continue;
    ended.push({ monsterId: combatant.id, spell: combatant.concentration });
    next = endMonsterConcentration(next, combatant.id);
  }
  return { state: next, ended };
}
