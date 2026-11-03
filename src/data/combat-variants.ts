/**
 * RA-30 — Mounted & Underwater Combat quick-reference (D&D 2024 SRD 5.2.1).
 *
 * They render in the Play tab's "Rules Reference" panel (`SituationalRules`),
 * and the Underwater and Mounted tables, with the attack situations below, are
 * the one-tap situation chips on the Play board (`src/lib/situational-states.ts`).
 * The DC 10 save and the half-Speed cost stay prose.
 * Values are authoritative and shouldn't drift — see
 * tests/unit/combat-variants.test.ts.
 *
 * Each line's heading and one-line summary live in the `rule` SRD catalogue
 * (`src/i18n/<locale>/srd/rules.json`) under its `key` (`<table>.<id>`).
 *
 * Source: SRD 5.2.1 (CC-BY-4.0), "Mounted Combat" / "Underwater Combat" —
 * concise functional restatements, not verbatim prose.
 */

/** One rule line in a variant-combat quick-reference. */
export interface CombatVariantNote {
  /** Stable id (kebab-case). */
  id: string;
  /** Its `rule` catalogue key (`mounted.falling-off`): `name` and `summary`. */
  key: string;
}

function notes(table: string, ids: readonly string[]): ReadonlyArray<CombatVariantNote> {
  return ids.map((id) => ({ id, key: `${table}.${id}` }));
}

export const MOUNTED_COMBAT_REFERENCE = notes("mounted", [
  "eligible-mount",
  "mount-dismount",
  "controlled-mount",
  "independent-mount",
  "falling-off",
]);

export const UNDERWATER_COMBAT_REFERENCE = notes("underwater", [
  "melee-underwater",
  "ranged-underwater",
  "fire-resistance",
]);

/**
 * Situational attack-roll rules (SRD 5.2.1 "Unseen Attackers and Targets",
 * "Ranged Attacks in Close Combat", "Range"). Each line is a fact the table
 * declares with one tap; the one-tap states (`src/lib/situational-states.ts`)
 * take their names and sentences from here.
 */
export const ATTACK_SITUATION_REFERENCE = notes("attack-situation", [
  "unseen-target",
  "unseen-attacker",
  "ranged-in-melee",
  "long-range",
]);

/**
 * Squeezing into a smaller space (SRD 5.2.1 "Creature Size", "Space"): the one-tap
 * Squeezing situation (`src/lib/situational-states.ts`) takes its sentences from here.
 */
export const SQUEEZING_REFERENCE = notes("squeezing", ["space", "movement", "rolls"]);

/**
 * Light and vision (SRD 5.2.1 rules glossary "Dim Light", "Darkness", "Lightly
 * Obscured", "Heavily Obscured", "Darkvision", "Passive Perception"): the one-tap
 * light chip (`src/lib/light-states.ts`) takes its names and sentences from here.
 */
export const VISION_REFERENCE = notes("vision", ["dim-light", "darkness", "darkvision"]);
