/**
 * Picking a subclass: the one step the level-up commit and the sheet's «Scelte da
 * completare» share, so a subclass picked at its level and one picked late (a live
 * Rogue 6 never chose one) land the same way.
 *
 *   - `subclassFeaturesThrough` — the subclass's features up to the class's level:
 *     a pick brings every one of them, not only the current level's (SRD 5.2.1
 *     Thief picked at Rogue 6: Fast Hands and Second-Story Work from level 3).
 *   - `subclassPickChoices` — the choices those features ask (Lore's three skills,
 *     a land for Circle of the Land): choice slots and the option bundles not yet
 *     chosen. The level-up asks them on its screen, the sheet in the same dialog.
 *   - `applySubclass` — the subclass id on the class entry, the features, the
 *     subclass's always-prepared spells through the level, and a third caster's
 *     spellcasting. Hit Points are derived from the result (Draconic Resilience
 *     counts every level).
 *   - `resolveOwedSubclass` — the sheet's answer: the owed subclass applied with
 *     its choices, Armor Class recomputed, the max Hit Points derived and the
 *     current ones moved with them.
 *
 * Pure module — no React, no store.
 */
import { getClassTable, getSubclassFeatures } from "@/data/classes";
import { deriveMaxHp, maxHpBase } from "@/lib/aggregate-character";
import { classEntryLevel, patchClassEntry } from "@/lib/classes";
import { computeAC } from "@/lib/compute";
import { getEquipment } from "@/data/equipment";
import {
  getAlwaysPreparedFromGrants,
  getExpandedSpellsThroughLevel,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import { listExpertiseEligibleSkills } from "@/lib/expertise-pick";
import {
  applyChoicePicks,
  collectChoiceSlots,
  collectGrantBundles,
  EMPTY_CHOICE_PICKS,
  isAllChoicesComplete,
  pruneChoicePicks,
  type ChoicePicks,
  type FeatureChoiceSlots,
} from "@/lib/feature-choices";
import type { GrantBundle } from "@/lib/grants";
import { highestSpellSlotLevel } from "@/lib/multiclass-slots";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { applySubclassSpellcasting } from "@/lib/subclass-spellcasting";
import type { CharacterData, CharacterDoc, SrdFeatureRef } from "@/types/character";

/** The subclass's features up to class level `level`, in level order. */
export function subclassFeaturesThrough(
  classId: string,
  subclassId: string,
  level: number
): SrdFeatureRef[] {
  return getSubclassFeatures(classId, subclassId)
    .filter((f) => f.level <= level)
    .sort((a, b) => a.level - b.level)
    .map((f) => ({ srdId: f.id }));
}

/** Whether `subclassId` is one of the class's subclasses. */
export function isSubclassOf(classId: string, subclassId: string): boolean {
  return (getClassTable(classId)?.subclasses ?? []).some((s) => s.id === subclassId);
}

/** Each class entry's spell-slot row at its level: the spell choices' context. */
function spellSlotRows(character: CharacterData): Record<string, ReadonlyArray<number>> {
  const rows: Record<string, ReadonlyArray<number>> = {};
  for (const entry of character.classes) {
    const table = getClassTable(entry.classId);
    if (!table) continue;
    rows[entry.classId] =
      table.levels.find((l) => l.level === entry.level)?.spellSlots ?? [];
  }
  return rows;
}

/**
 * The choices the subclass's features up to the class's level ask: their choice
 * slots (with the choices of a bundle option picked in `bundlePicks`), and the
 * option bundles still unchosen. `doc` is the character the subclass lands on.
 */
export function subclassPickChoices(
  doc: CharacterDoc,
  classId: string,
  subclassId: string,
  bundlePicks: Readonly<Record<string, string>> = {}
): { slots: FeatureChoiceSlots; bundles: GrantBundle[] } {
  const level = classEntryLevel(doc.character, classId);
  const sources = resolveGrantSourcesForFeatures(
    subclassFeaturesThrough(classId, subclassId, level)
  );
  const chosen = doc.session.grantBundleChoices ?? {};
  const bundles = collectGrantBundles(sources, new Map(Object.entries(chosen))).filter(
    (b) => b.selected === null
  );
  const slots = collectChoiceSlots(
    sources,
    { spellSlotsByClass: spellSlotRows(doc.character) },
    { ...chosen, ...bundlePicks }
  );
  return { slots, bundles };
}

/**
 * The subclass on the class entry, with what it brings at class level `level`:
 * every subclass feature up to it, its always-prepared spells through it (the
 * expanded list and the features' own, with the bundle options chosen), and a third
 * caster's spellcasting. Features and spells already held are not added twice.
 */
export function applySubclass(
  character: CharacterData,
  classId: string,
  subclassId: string,
  level: number,
  bundleChoices: Readonly<Record<string, string>> = {}
): CharacterData {
  let next = patchClassEntry(character, classId, { subclassId });
  const held = new Set(next.features.flatMap((f) => ("custom" in f ? [] : [f.srdId])));
  const refs = subclassFeaturesThrough(classId, subclassId, level);
  const added = refs.filter((f) => !held.has(f.srdId));
  if (added.length > 0) next = { ...next, features: [...next.features, ...added] };
  const spells = [
    ...getExpandedSpellsThroughLevel(classId, subclassId, level),
    ...getAlwaysPreparedFromGrants(resolveGrantSourcesForFeatures(refs), {
      level,
      maxSlotLevel: highestSpellSlotLevel(next.classes),
      bundleChoices: new Map(Object.entries(bundleChoices)),
    }),
  ];
  if (spells.length > 0) {
    next = { ...next, spells: injectExpandedSpells(next.spells, spells) };
  }
  return applySubclassSpellcasting(next, classId, subclassId, level);
}

/** Whether the class entry is past its subclass level with no subclass. */
export function owesSubclass(entry: {
  classId: string;
  level: number;
  subclassId?: string;
}): boolean {
  const table = getClassTable(entry.classId);
  return (
    table !== undefined &&
    table.subclasses.length > 0 &&
    entry.level >= table.subclassLevel &&
    !entry.subclassId
  );
}

/** The slots as they can be answered: Expertise asks no more than the proficient
 *  skills left to raise (as the level-up does). */
function answerable(slots: FeatureChoiceSlots, skills: CharacterData["skills"]) {
  const eligible = listExpertiseEligibleSkills(skills).length;
  return {
    ...slots,
    expertise: slots.expertise.map((s) => ({
      ...s,
      amount: Math.min(s.amount, eligible),
    })),
  };
}

/** The sheet's answer to an owed subclass: the pick and its features' choices. */
export interface SubclassAnswers {
  choicePicks?: ChoicePicks;
  bundlePicks?: Readonly<Record<string, string>>;
}

/**
 * The owed subclass picked on the sheet: applied as the level-up applies it, with
 * the choices its features ask (every one answered, or nothing is written), the max
 * Hit Points derived from the result and the current ones moved by the change. The
 * same doc back when the class owes no subclass, the subclass isn't the class's, or
 * a choice is unanswered.
 */
export function resolveOwedSubclass(
  doc: CharacterDoc,
  classId: string,
  subclassId: string,
  answers: SubclassAnswers = {}
): CharacterDoc {
  const entry = doc.character.classes.find((e) => e.classId === classId);
  if (!entry || !owesSubclass(entry) || !isSubclassOf(classId, subclassId)) return doc;
  const bundlePicks = answers.bundlePicks ?? {};
  const { slots, bundles } = subclassPickChoices(doc, classId, subclassId, bundlePicks);
  if (bundles.some((b) => !b.options.some((o) => o.id === bundlePicks[b.bundleKey]))) {
    return doc;
  }
  const picks = pruneChoicePicks(slots, answers.choicePicks ?? EMPTY_CHOICE_PICKS);
  const bundleChoices = { ...doc.session.grantBundleChoices, ...bundlePicks };
  let next = applySubclass(
    doc.character,
    classId,
    subclassId,
    entry.level,
    bundleChoices
  );
  const withSkills = applyChoicePicks(next, slots, { ...picks, expertise: {} });
  if (!isAllChoicesComplete(answerable(slots, withSkills.skills), picks)) return doc;
  next = applyChoicePicks(next, slots, picks);
  if (next.levelUpChecklist) {
    const left = next.levelUpChecklist.filter(
      (item) => item.i18nKey !== "levelUp.checklistSubclass"
    );
    next = { ...next, levelUpChecklist: left.length > 0 ? left : null };
  }
  // Armor Class and max Hit Points follow the new features (Draconic Resilience).
  next = {
    ...next,
    ac: computeAC(next.equipment, next.abilityScores, getEquipment, next.features),
    hp: { max: deriveMaxHp(next) },
  };
  const gained = maxHpBase(next, doc.session) - maxHpBase(doc.character, doc.session);
  return {
    ...doc,
    character: next,
    session: {
      ...doc.session,
      hp: { ...doc.session.hp, current: doc.session.hp.current + gained },
      ...(Object.keys(bundlePicks).length > 0
        ? { grantBundleChoices: bundleChoices }
        : {}),
    },
  };
}
