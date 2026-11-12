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
  type SelfFormRule,
} from "@/data/types";
import { ABILITY_CODES, type AbilityCode } from "@/types/ability";
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";
import { beastsByMaxCR, getBeast } from "@/data/beasts";
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import { totalLevel } from "@/lib/classes";
import type { Grant, GrantSource } from "@/lib/grants";

export type { SelfFormRule } from "@/data/types";

/** Polymorph's own rule: the fallback for an id that carries none. */
const POLYMORPH_RULE: SelfFormRule = {
  pool: "beasts",
  keepsMind: false,
  reshift: false,
  endsWithoutTempHp: true,
};

/** Whether the spell transforms the caster through the Transform flow: its catalogue
 *  entry carries a `formRule` (edge-case family M2). */
export function isSelfFormSpell(spellId: string): boolean {
  return getSpellById(spellId)?.formRule !== undefined;
}

/** Whether a cast opens the caster's form picker: a transforming spell cast on the
 *  caster, or with no creature named. Cast on another creature (Polymorph on a
 *  goblin), the form is that creature's, chosen at the table. */
export function opensSelfFormPicker(
  spellId: string,
  targets: ReadonlyArray<string>,
  selfId: string
): boolean {
  return isSelfFormSpell(spellId) && (targets.length === 0 || targets.includes(selfId));
}

const MIND: readonly AbilityCode[] = ["INT", "WIS", "CHA"];

/** A form rule with the scores it keeps resolved: `keeps`, else the mind when
 *  `keepsMind`, else none. */
export type ResolvedFormRule = SelfFormRule & {
  keeps: { abilities: ReadonlyArray<AbilityCode> };
};

/** The form rule of the spell or class feature that makes the form (Polymorph's
 *  for an id that carries none). */
export function selfFormRule(sourceId: string): ResolvedFormRule {
  const rule =
    getSpellById(sourceId)?.formRule ??
    classFeatureIndex.get(sourceId)?.formRule ??
    POLYMORPH_RULE;
  return { ...rule, keeps: rule.keeps ?? { abilities: rule.keepsMind ? MIND : [] } };
}

/** A form's ability scores: the form's own, except the ones the rule keeps. */
export function formScores(
  form: Record<AbilityCode, number>,
  own: Record<AbilityCode, number>,
  kept: ReadonlyArray<AbilityCode>
): Record<AbilityCode, number> {
  const scores = { ...form };
  for (const code of kept) scores[code] = own[code];
  return scores;
}

/** Which catalogue names what made the form: a spell, or a class feature (Wild Shape). */
export function formSourceKind(sourceId: string): "spell" | "class-feature" {
  return classFeatureIndex.get(sourceId)?.formRule ? "class-feature" : "spell";
}

/** The active form's stat block: the bestiary block it carries, else the Beast. */
/** The form the character is in, whichever way it was recorded: the computed
 *  `activeForm`, or a form a v0.25 client stamped (`polymorphForm`). */
export function currentForm(
  session: Pick<SessionState, "activeForm" | "polymorphForm">
): {
  sourceId: string;
  beastId: string;
  statBlock?: BeastStatBlock;
  stamped: boolean;
} | null {
  if (session.activeForm) {
    const { sourceId, beastId, statBlock } = session.activeForm;
    return { sourceId, beastId, ...(statBlock ? { statBlock } : {}), stamped: false };
  }
  if (session.polymorphForm) {
    const { spellId, beastId, statBlock } = session.polymorphForm;
    return {
      sourceId: spellId,
      beastId,
      ...(statBlock ? { statBlock } : {}),
      stamped: true,
    };
  }
  return null;
}

/**
 * What a computed form replaces on the derived sheet (edge-case family M2): the
 * scores it takes (all but the ones its rule keeps), its natural
 * AC, its speeds. Null when there is no computed form (a stamped one is already in
 * the build).
 */
export function formFacts(
  session: Pick<SessionState, "activeForm" | "polymorphForm">,
  own: Record<AbilityCode, number>
): {
  sourceId: string;
  beastId: string;
  /** Which catalogue names the form (a Beast, or a bestiary creature). */
  nameKind: "beasts" | "monster";
  abilityScores: Record<AbilityCode, number>;
  /** The scores the form replaces (all but the ones its rule keeps). */
  replaces: readonly AbilityCode[];
  ac: number;
  walkFt: number | null;
  speeds: Partial<Record<"fly" | "swim" | "climb" | "burrow", number>>;
} | null {
  const form = session.activeForm;
  if (!form) return null;
  const beast = form.statBlock ?? getBeast(form.beastId);
  if (!beast) return null;
  const rule = selfFormRule(form.sourceId);
  const speeds: Partial<Record<"fly" | "swim" | "climb" | "burrow", number>> = {};
  for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
    const v = beast.speeds[mode];
    if (typeof v === "number") speeds[mode] = v;
  }
  return {
    sourceId: form.sourceId,
    beastId: form.beastId,
    nameKind: formNameKind(form),
    replaces: ABILITY_CODES.filter((code) => !rule.keeps.abilities.includes(code)),
    abilityScores: formScores(beast.abilityScores, own, rule.keeps.abilities),
    ac: beast.ac,
    walkFt: typeof beast.speeds.walk === "number" ? beast.speeds.walk : null,
    speeds,
  };
}

/** Any recorded form: what the stat block and the name read from. */
type FormRef = { readonly beastId: string; readonly statBlock?: BeastStatBlock };

export function formStatBlock(
  form: FormRef | null | undefined
): BeastStatBlock | undefined {
  if (!form) return undefined;
  return form.statBlock ?? getBeast(form.beastId);
}

/** Where the active form's names live: the lazy bestiary or the Beast catalogue. */
export function formNameKind(form: FormRef): "monster" | "beasts" {
  return form.statBlock ? "monster" : "beasts";
}

/** The catalogue key of one of the form's attacks (`attack.rend` in the Beast
 *  catalogue, `adult-red-dragon.actions.rend` in the bestiary). */
export function formAttackNameKey(form: FormRef, nameKey: string): string {
  return form.statBlock ? bestiaryNameKey(form.beastId, nameKey) : nameKey;
}

/** A projected form's attack / trait key in the monster catalogue
 *  (`attack.rend` → `adult-red-dragon.actions.rend`, `trait.x` → `<id>.traits.x`). */
export function bestiaryNameKey(formId: string, nameKey: string): string {
  return nameKey
    .replace(/^attack\./, `${formId}.actions.`)
    .replace(/^trait\./, `${formId}.traits.`);
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

type FormGearSession = Pick<SessionState, "activeForm">;

/** An equipment entry's key for {@link formCharacter}'s worn list: the same key
 *  the store's item actions match (`custom-<id>`, instance id, `<srdId>#<spell>`
 *  for a Spell Scroll, else the catalogue id). */
export function gearKey(
  ref: CharacterData["equipment"][number] | NonNullable<CharacterData["weapons"]>[number]
): string {
  if ("custom" in ref) return `custom-${ref.instanceId}`;
  if ("instanceId" in ref && ref.instanceId !== undefined) return ref.instanceId;
  if ("scrollSpell" in ref && ref.scrollSpell) return `${ref.srdId}#${ref.scrollSpell}`;
  return ref.srdId;
}

/**
 * The character as its form wears it: in a form whose gear merges (Wild Shape),
 * equipment and weapons the table didn't rule worn have no effect. Any other case
 * returns the character unchanged.
 */
export function formCharacter<C extends Pick<CharacterData, "equipment" | "weapons">>(
  character: C,
  session: FormGearSession
): C {
  const form = session.activeForm;
  if (!form || !selfFormRule(form.sourceId).gearMerges) return character;
  const worn = new Set(form.wornGear ?? []);
  return {
    ...character,
    equipment: character.equipment.filter((ref) => worn.has(gearKey(ref))),
    weapons: character.weapons.filter((ref) => worn.has(gearKey(ref))),
  };
}

/**
 * The form's own defenses as a grant source while you hold it (M2): its damage
 * resistances, immunities and vulnerabilities and its condition immunities. A
 * Beast reads its catalogue block; a bestiary form its stored one.
 */
export function resolveFormDefenseSources(
  session: Pick<SessionState, "activeForm">
): GrantSource[] {
  const form = session.activeForm;
  const beast = form ? (form.statBlock ?? getBeast(form.beastId)) : undefined;
  if (!form || !beast) return [];
  const grants: Grant[] = [
    ...(beast.damageResistances ?? []).map(
      (damageType): Grant => ({ type: "damage-resistance", damageType })
    ),
    ...(beast.damageImmunities ?? []).map(
      (damageType): Grant => ({ type: "damage-immunity", damageType })
    ),
    ...(beast.damageVulnerabilities ?? []).map(
      (damageType): Grant => ({ type: "damage-vulnerability", damageType })
    ),
    ...(beast.conditionImmunities ?? []).map(
      (condition): Grant => ({ type: "condition-immunity", condition })
    ),
  ];
  return grants.length > 0 ? [{ id: `form:${form.beastId}`, grants }] : [];
}
