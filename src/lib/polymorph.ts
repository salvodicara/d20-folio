/**
 * Polymorph / True Polymorph SELF-transformation — the pure applicator + form
 * resolver (S7 form-swap primitive, Phase 1).
 *
 * A caster who Polymorphs THEMSELVES takes on a Beast form: the Beast's game
 * statistics REPLACE their own. This module is the pure, store-free core:
 *  - {@link resolvePolymorphForms} — the CR-gated form list for the picker
 *    (RAW: a form of Challenge Rating ≤ the caster's level);
 *  - {@link polymorphBuildPatch} — the override-field patch that stamps the
 *    Beast's AC / speeds / ability scores onto the character (OVERRIDE-FIRST —
 *    every stamped value lands in a hand-editable override);
 *  - {@link polymorphPriorSnapshot} / {@link revertBuildFromPrior} — the
 *    before/after of those same fields, so dropping the form restores the
 *    caster's own body EXACTLY (undoable).
 *
 * PURE: ids + numbers only. No React, Zustand, Firebase, or active locale. The
 * store ({@link import("@/stores/characterStore")}) drives it; the Beast NAMES
 * localize at the render edge through the `beasts` srd catalogue.
 */
import {
  CREATURE_SIZE_ORDER,
  type BeastStatBlock,
  type CreatureSize,
} from "@/data/types";
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";
import { beastsByMaxCR, getBeast } from "@/data/beasts";
import { totalLevel } from "@/lib/classes";

/** The spell ids that engage a Polymorph SELF-form (concentration by id). */
export const POLYMORPH_SPELL_IDS: readonly string[] = ["polymorph", "true-polymorph"];

/** How one self-transformation spell shapes the caster's form (its SRD 5.2.1 text). */
export interface SelfFormRule {
  /** Where its forms come from: the eager Beast catalogue, or the whole bestiary
   *  (lazy; the picked block then rides the session as `statBlock`). */
  pool: "beasts" | "bestiary";
  /** The caster keeps their own Intelligence, Wisdom and Charisma scores. */
  keepsMind: boolean;
  /** The caster may shift into another form while the spell lasts; only the first
   *  form grants Temporary Hit Points. */
  reshift: boolean;
  /** The form ends when its Temporary Hit Points run out. */
  endsWithoutTempHp: boolean;
  /** A fixed Challenge Rating cap in place of the caster's level (Animal Shapes: 4). */
  crCap?: number;
  /** The largest size a form may be (Animal Shapes: Large). */
  sizeMax?: CreatureSize;
}

const POLYMORPH_RULE: SelfFormRule = {
  pool: "beasts",
  keepsMind: false,
  reshift: false,
  endsWithoutTempHp: true,
};

/** Every spell that transforms the caster through the Transform flow, by id. */
const SELF_FORM_RULES: Readonly<Record<string, SelfFormRule>> = {
  polymorph: POLYMORPH_RULE,
  "true-polymorph": POLYMORPH_RULE,
  // You keep your INT, WIS, CHA, Hit Points and Hit Point Dice; Temporary HP come
  // from the first form only, and running out of them does not end the spell.
  shapechange: {
    pool: "bestiary",
    keepsMind: true,
    reshift: true,
    endsWithoutTempHp: false,
  },
  // A Large or smaller Beast of CR 4 or lower; you keep your INT, WIS, CHA, Hit
  // Points and Hit Point Dice; Temporary HP from the first form; it lasts until
  // you have no Temporary HP, and you can transform again on later turns.
  "animal-shapes": {
    pool: "beasts",
    keepsMind: true,
    reshift: true,
    endsWithoutTempHp: true,
    crCap: 4,
    sizeMax: "Large",
  },
};

/** The spell ids whose card carries the Transform affordance. */
export const SELF_FORM_SPELL_IDS: readonly string[] = Object.keys(SELF_FORM_RULES);

/** The rule for `spellId` (Polymorph's for an id outside the table). */
export function selfFormRule(spellId: string): SelfFormRule {
  return SELF_FORM_RULES[spellId] ?? POLYMORPH_RULE;
}

type ActiveForm = SessionState["polymorphForm"];

/** The active form's stat block: the bestiary block it carries, else the Beast. */
export function formStatBlock(form: ActiveForm): BeastStatBlock | undefined {
  if (!form) return undefined;
  return form.statBlock ?? getBeast(form.beastId);
}

/** Where the active form's names live: the lazy bestiary or the Beast catalogue. */
export function formNameKind(form: NonNullable<ActiveForm>): "monster" | "beasts" {
  return form.statBlock ? "monster" : "beasts";
}

/** The catalogue key of one of the form's attacks (`attack.rend` in the Beast
 *  catalogue, `adult-red-dragon.actions.rend` in the bestiary). */
export function formAttackNameKey(
  form: NonNullable<ActiveForm>,
  nameKey: string
): string {
  return form.statBlock
    ? `${form.beastId}.actions.${nameKey.replace(/^attack\./, "")}`
    : nameKey;
}

/** The snapshot of the caster's OWN fields the applicator overwrites — restored on drop. */
export type PolymorphPrior = NonNullable<SessionState["polymorphForm"]>["prior"];

/**
 * The Beast forms a caster may assume — RAW: Challenge Rating ≤ the caster's
 * (total) level. The picker reads this; the CR cap is the whole-character level
 * (the SELF case, where the caster IS the target). Sorted by CR then id. A spell
 * with its own caps (`spellId`: Animal Shapes, CR 4 and Large) uses those instead.
 */
export function resolvePolymorphForms(
  character: CharacterDoc,
  spellId = "polymorph"
): ReadonlyArray<BeastStatBlock> {
  const { crCap, sizeMax } = selfFormRule(spellId);
  const forms = beastsByMaxCR(crCap ?? totalLevel(character.character));
  if (!sizeMax) return forms;
  const max = CREATURE_SIZE_ORDER.indexOf(sizeMax);
  return forms.filter((b) => CREATURE_SIZE_ORDER.indexOf(b.size) <= max);
}

/** Snapshot the caster's OWN AC / speed / score / temp-HP fields before a swap. */
export function polymorphPriorSnapshot(doc: CharacterDoc): PolymorphPrior {
  const c = doc.character;
  return {
    acOverride: c.acOverride ?? null,
    speedOverride: c.speedOverride ?? null,
    speedOverrides: { ...(c.speedOverrides ?? {}) },
    abilityScores: { ...c.abilityScores },
    tempHp: doc.session.hp.temp,
  };
}

/**
 * The build patch that STAMPS a Beast form onto the character's override fields
 * (override-first — each is the same field the player edits by hand): the Beast's
 * natural AC → `acOverride`, its walking speed → `speedOverride`, its other
 * movement modes → `speedOverrides`, and its six ability scores → `abilityScores`
 * (RAW: Polymorph replaces ALL statistics, mental scores included — unlike Wild
 * Shape); `keepsMind` keeps the caster's INT / WIS / CHA (Shapechange). `prior.speedOverride` is the fallback when the Beast omits a walk speed.
 */
export function polymorphBuildPatch(
  beast: BeastStatBlock,
  prior: PolymorphPrior,
  keepsMind = false
): Partial<CharacterData> {
  const speedOverrides: Record<string, number | null> = {};
  for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
    const v = beast.speeds[mode];
    if (typeof v === "number") speedOverrides[mode] = v;
  }
  return {
    acOverride: beast.ac,
    speedOverride: beast.speeds.walk ?? prior.speedOverride ?? null,
    speedOverrides,
    abilityScores: keepsMind
      ? {
          ...beast.abilityScores,
          INT: prior.abilityScores.INT,
          WIS: prior.abilityScores.WIS,
          CHA: prior.abilityScores.CHA,
        }
      : { ...beast.abilityScores },
  };
}

/** The build patch that RESTORES the caster's own body from the drop snapshot. */
export function revertBuildFromPrior(prior: PolymorphPrior): Partial<CharacterData> {
  return {
    acOverride: prior.acOverride,
    speedOverride: prior.speedOverride,
    speedOverrides: { ...prior.speedOverrides },
    abilityScores: { ...prior.abilityScores },
  };
}
