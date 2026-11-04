/**
 * The class's ready-made picks for the new creation screen: once class,
 * background, species and abilities are chosen, whatever the build still lacks
 * is filled the way the class's own quickbuild preset would (its class skills,
 * cantrips and level-1 spells, its other choice picks when it shares the
 * background), then from the first legal options. The Riepilogo shows the result
 * and every pick stays editable later from the sheet.
 *
 * Only what is MISSING is filled: a pick the player made is kept, and the
 * species' own choices (its traits, a Human's Versatile feat and that feat's
 * picks) are never touched — the Specie step asks those.
 *
 * Pure module — no React, no locale reads.
 */
import { DEFAULT_QUICKBUILD_PRESET, QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { ALL_SKILLS } from "@/lib/skills";
import { ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";
import {
  STANDARD_LANGUAGE_IDS,
  listAvailableForLanguageSlot,
} from "@/lib/feat-language-choices";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";
import type { ChoicePicks, FeatureChoiceSlots } from "@/lib/feature-choices";
import { classSkillPool, quickbuildDraft } from "@/lib/quickbuild";

import type { CreationDraft, CreationFacts } from "./draft";

/** `kept` topped up to `count` from `candidates`, in order, without repeats. */
function topUp(
  kept: readonly string[],
  candidates: readonly string[],
  count: number
): string[] {
  const out = [...kept];
  for (const id of candidates) {
    if (out.length >= count) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The slots that are not the species' (nor caused by a Human's Versatile feat). */
function classSideSlots(facts: CreationFacts): FeatureChoiceSlots {
  const theirs = new Set(
    [facts.speciesChoiceSlots, facts.humanFeatSlots].flatMap((slots) =>
      Object.values(slots).flatMap((list: { slotId: string }[]) =>
        list.map((s) => s.slotId)
      )
    )
  );
  const mine = <T extends { slotId: string }>(list: T[]) =>
    list.filter((s) => !theirs.has(s.slotId));
  const all = facts.choiceSlots;
  return {
    skill: mine(all.skill),
    tool: mine(all.tool),
    skillOrTool: mine(all.skillOrTool),
    language: mine(all.language),
    spell: mine(all.spell),
    expertise: mine(all.expertise),
    feat: mine(all.feat),
  };
}

/**
 * `draft` with its missing class-side picks filled; the same object when nothing
 * was missing. `factsOf` derives facts (passed in so this module needs no cycle).
 */
export function fillReadyMadePicks(
  draft: CreationDraft,
  factsOf: (draft: CreationDraft) => CreationFacts
): CreationDraft {
  const preset = QUICKBUILD_PRESETS[draft.classId] ?? DEFAULT_QUICKBUILD_PRESET;
  let next = draft;
  let facts = factsOf(next);

  // ── Class skills: the preset's, then the class pool in table order ─────────
  if (!facts.skillsComplete) {
    const pool = classSkillPool(next.classId, next.backgroundId);
    const kept = next.classSkills.filter((id) => pool.includes(id));
    next = {
      ...next,
      classSkills: topUp(
        kept,
        [...preset.classSkills, ...pool].filter((id) => pool.includes(id)),
        facts.classSkillCount
      ),
    };
  }

  // ── Cantrips and level-1 spells: the class preset's own ───────────────────
  if (next.level === 1 && facts.hasClassSpellPicks) {
    if (!facts.cantripsComplete) {
      next = {
        ...next,
        cantrips: topUp(next.cantrips, preset.cantrips ?? [], facts.cantripsNeeded),
      };
    }
    if (!facts.spellsComplete) {
      next = {
        ...next,
        spells: topUp(next.spells, preset.spells ?? [], facts.spellsNeeded),
      };
    }
  }

  // ── The origin languages: the preset's, then the standard table ───────────
  if (!facts.languagesComplete) {
    const pool = STANDARD_LANGUAGE_IDS.filter((id) => id !== "common");
    const kept = (next.languagePicks[ORIGIN_LANGUAGE_SLOT_ID] ?? []).filter((id) =>
      pool.includes(id)
    );
    next = {
      ...next,
      languagePicks: {
        ...next.languagePicks,
        [ORIGIN_LANGUAGE_SLOT_ID]: topUp(
          kept,
          [...preset.languages, ...pool].filter((id) => pool.includes(id)),
          2
        ),
      },
    };
  }

  // ── Every other class-side choice slot (class tools, background feat picks) ─
  facts = factsOf(next);
  if (!facts.otherChoicesComplete) {
    const slots = classSideSlots(facts);
    const presetPicks =
      preset.backgroundId === next.backgroundId
        ? quickbuildDraft(next.classId, preset).choicePicks
        : undefined;
    next = {
      ...next,
      choicePicks: fillChoiceSlots(next, facts, slots, presetPicks),
    };
  }

  return next === draft || JSON.stringify(next) === JSON.stringify(draft) ? draft : next;
}

/**
 * `draft`'s choice picks with every slot in `slots` filled to its amount: a pick
 * already made is kept, then the preset's (when given), then the first legal
 * options (a skill or spell the build already owns is never offered).
 */
export function fillChoiceSlots(
  draft: CreationDraft,
  facts: CreationFacts,
  slots: FeatureChoiceSlots,
  presetPicks?: ChoicePicks
): ChoicePicks {
  const next = draft;
  const ownedSkills = new Set([...facts.backgroundSkillIds, ...next.classSkills]);
  const ownedSpells = new Set([...next.cantrips, ...next.spells]);
  const allSkills = ALL_SKILLS.map((s) => s.id);
  const picks: ChoicePicks = { ...next.choicePicks };
  /** One kind's slots, each kept when full, else the preset's or the first legal options. */
  const fill = <T extends { slotId: string }>(
    kind: keyof ChoicePicks,
    list: readonly T[],
    amount: (slot: T) => number,
    pool: (slot: T) => readonly string[]
  ) => {
    const byId = { ...picks[kind] };
    for (const slot of list) {
      const have = byId[slot.slotId] ?? [];
      if (have.length >= amount(slot)) continue;
      const legal = pool(slot);
      const fromPreset = (presetPicks?.[kind][slot.slotId] ?? []).filter((id) =>
        legal.includes(id)
      );
      byId[slot.slotId] = topUp(have, [...fromPreset, ...legal], amount(slot));
    }
    picks[kind] = byId;
  };
  fill(
    "skill",
    slots.skill,
    (s) => s.amount,
    // Skills it doesn't have first; one it has only when nothing else is left
    // (a short list it already knows, as a Bard Changeling's).
    (s) => {
      const pool = s.options.length > 0 ? s.options : allSkills;
      return [
        ...pool.filter((id) => !ownedSkills.has(id)),
        ...pool.filter((id) => ownedSkills.has(id)),
      ];
    }
  );
  fill(
    "tool",
    slots.tool,
    (s) => s.amount,
    (s) => s.options
  );
  fill(
    "skillOrTool",
    slots.skillOrTool,
    (s) => s.amount,
    () => allSkills.filter((id) => !ownedSkills.has(id))
  );
  fill(
    "language",
    slots.language,
    (s) => s.amount,
    (s) => listAvailableForLanguageSlot(s)
  );
  fill(
    "expertise",
    slots.expertise,
    (s) => s.amount,
    () => [...ownedSkills]
  );
  fill(
    "spell",
    slots.spell,
    (s) => s.count,
    (s) => listAvailableForSlot(s, ownedSpells).map((sp) => sp.id)
  );
  return picks;
}
