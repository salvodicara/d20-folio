/**
 * The quickbuild APPLICATOR — a {@link QuickbuildPreset} turned into the exact
 * creation state the wizard would hold if a player had made every pick by hand.
 *
 * It is a pure translation, never a second rules engine: the ability scores are
 * the 2024 standard array dealt out in the preset's priority order (that array
 * costs exactly the 27-point point-buy budget, so the wizard's existing
 * point-buy state carries it), and the grant-driven `choice-*` picks are laid
 * into the SAME slots the wizard collects (`lib/creation-choices.ts`), consumed
 * in slot order per kind — so a preset can never satisfy a different set of
 * decisions than the one the Create gate checks (golden rule 6).
 *
 * Pure module — no React, no locale reads.
 */
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { classTables } from "@/data/classes";
import { skillNameToId } from "@/lib/skills";
import type { AbilityCode } from "@/data/types";
import type { QuickbuildPreset } from "@/data/quickbuild";
import { creationChoiceSlots, ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";
import type { ChoicePicks, FeatureChoiceSlots } from "@/lib/feature-choices";
import type { LanguageChoicePicks } from "@/lib/feat-language-choices";

/** The 2024 standard array, highest first — exactly 27 point-buy points. */
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** The parts of the creation state a preset COMPUTES (the rest it states outright). */
export interface QuickbuildDraft {
  abilityScores: Record<AbilityCode, number>;
  bgAsiChoices: Partial<Record<AbilityCode, number>>;
  languagePicks: LanguageChoicePicks;
  choicePicks: ChoicePicks;
}

/** Deal `ids` across `slots` in order, `n(slot)` per slot; extra ids are unused. */
function deal<T extends { slotId: string }>(
  slots: readonly T[],
  n: (slot: T) => number,
  ids: readonly string[] = []
): Record<string, readonly string[]> {
  const picks: Record<string, readonly string[]> = {};
  let taken = 0;
  for (const slot of slots) {
    picks[slot.slotId] = ids.slice(taken, taken + n(slot));
    taken += n(slot);
  }
  return picks;
}

/** The choice slots a preset's build confers (the wizard's own set, level 1). */
export function presetChoiceSlots(
  classId: string,
  preset: QuickbuildPreset
): FeatureChoiceSlots {
  return creationChoiceSlots({
    classId,
    level: 1,
    subclassId: "",
    backgroundId: preset.backgroundId,
    humanFeat: preset.humanFeat ?? "",
    bgFeat: SRD_BACKGROUNDS.find((b) => b.id === preset.backgroundId)?.feat ?? "",
  });
}

/** Translate a preset into the creation state the wizard applies in one go. */
export function quickbuildDraft(
  classId: string,
  preset: QuickbuildPreset
): QuickbuildDraft {
  // The record starts total and each priority position overwrites its code with
  // that position's score; the guard pins `abilityOrder` as a permutation of all
  // six, so all six are dealt.
  const abilityScores: Record<AbilityCode, number> = {
    STR: 8,
    DEX: 8,
    CON: 8,
    INT: 8,
    WIS: 8,
    CHA: 8,
  };
  preset.abilityOrder.forEach((code, i) => {
    const score = STANDARD_ARRAY[i];
    if (score !== undefined) abilityScores[code] = score;
  });
  const slots = presetChoiceSlots(classId, preset);
  const choices = preset.choices ?? {};
  // Spell slots carry `count`, every other kind carries `amount` — the one place
  // that difference is normalized.
  const amount = (slot: { amount: number }) => slot.amount;
  return {
    abilityScores,
    bgAsiChoices: { [preset.boost[0]]: 2, [preset.boost[1]]: 1 },
    languagePicks: { [ORIGIN_LANGUAGE_SLOT_ID]: [...preset.languages] },
    choicePicks: {
      skill: deal(slots.skill, amount, choices.skill),
      tool: deal(slots.tool, amount, choices.tool),
      skillOrTool: deal(slots.skillOrTool, amount, choices.skillOrTool),
      language: deal(slots.language, amount, choices.language),
      expertise: deal(slots.expertise, amount, choices.expertise),
      feat: deal(slots.feat, amount, choices.feat),
      spell: deal(slots.spell, (s) => s.count, choices.spell),
    },
  };
}

/**
 * The two picks a BACKGROUND owns, re-seeded for a different one.
 *
 * Swapping the background on a ready-made build used to empty both sections —
 * legal (a new background has its own three eligible abilities, and its skill
 * grants change what the class may still pick) but silent, and thousands of
 * pixels away from the control the player just touched. So when the sheet is
 * still the build it was handed, the swap RE-SEEDS instead of emptying: the
 * +2/+1 follow the class's own priority through the new background's trio, and
 * the class skills keep every pick the new background does not already grant,
 * refilled from the class pool in table order. A sculpted sheet still clears —
 * there is nothing conventional left to preserve there.
 */
export function reseedForBackground(
  classId: string,
  abilityOrder: readonly AbilityCode[],
  keptSkills: readonly string[],
  backgroundId: string
): { bgAsiChoices: Partial<Record<AbilityCode, number>>; classSkills: string[] } {
  const background = SRD_BACKGROUNDS.find((b) => b.id === backgroundId);
  const table = classTables.find((c) => c.id === classId);
  if (!background || !table) return { bgAsiChoices: {}, classSkills: [] };

  const [primary, secondary] = abilityOrder.filter((code) =>
    background.abilityOptions.includes(code)
  );
  const bgAsiChoices: Partial<Record<AbilityCode, number>> = {};
  if (primary) bgAsiChoices[primary] = 2;
  if (secondary) bgAsiChoices[secondary] = 1;

  const granted = new Set(
    background.skillProficiencies
      .map(skillNameToId)
      .filter((id): id is string => id !== null)
  );
  const pool = table.skillChoices.from
    .map(skillNameToId)
    .filter((id): id is string => id !== null && !granted.has(id));
  const classSkills = keptSkills.filter((id) => pool.includes(id));
  for (const id of pool) {
    if (classSkills.length >= table.skillChoices.count) break;
    if (!classSkills.includes(id)) classSkills.push(id);
  }
  return { bgAsiChoices, classSkills: classSkills.slice(0, table.skillChoices.count) };
}

/**
 * The EXACT state a preset application writes — the yardstick for "has the
 * player sculpted anything since?". Built from the preset on one side and from
 * the wizard's live state on the other; anything `applyPreset` does not write
 * (the name, alignment, the HP method) is deliberately absent, so editing those
 * is not "sculpting" and never triggers the class-switch confirm.
 */
export interface AppliedQuickbuild {
  classId: string;
  subclassId: string;
  level: number;
  raceId: string;
  backgroundId: string;
  usePointBuy: boolean;
  abilityScores: Record<AbilityCode, number>;
  bgAsiMode: "+2/+1" | "+1/+1/+1";
  bgAsiChoices: Partial<Record<AbilityCode, number>>;
  classSkills: readonly string[];
  cantrips: readonly string[];
  spells: readonly string[];
  languagePicks: LanguageChoicePicks;
  lineageChoices: Readonly<Record<string, string>>;
  humanFeat: string;
  choicePicks: ChoicePicks;
  classEquipLabel: string;
  bgEquipLabel: string;
}

/** What the wizard holds immediately after applying `preset` for `classId`. */
export function appliedQuickbuildState(
  classId: string,
  preset: QuickbuildPreset
): AppliedQuickbuild {
  const draft = quickbuildDraft(classId, preset);
  return {
    classId,
    subclassId: "",
    level: 1,
    raceId: preset.raceId,
    backgroundId: preset.backgroundId,
    usePointBuy: true,
    abilityScores: draft.abilityScores,
    bgAsiMode: "+2/+1",
    bgAsiChoices: draft.bgAsiChoices,
    classSkills: preset.classSkills,
    cantrips: preset.cantrips ?? [],
    spells: preset.spells ?? [],
    languagePicks: draft.languagePicks,
    lineageChoices: preset.lineage ?? {},
    humanFeat: preset.humanFeat ?? "",
    choicePicks: draft.choicePicks,
    classEquipLabel: "A",
    bgEquipLabel: "A",
  };
}

/** Order-insensitive deep key: two states that differ only in PICK ORDER are the
 *  same build (removing and re-adding a skill is not an edit). Every array in
 *  `AppliedQuickbuild` holds strings, so a plain sort orders them. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).map(canonical).sort();
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, canonical(v)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  }
  return value;
}

/** True when the live state is still exactly the applied build. */
export function sameAppliedQuickbuild(
  a: AppliedQuickbuild,
  b: AppliedQuickbuild
): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
