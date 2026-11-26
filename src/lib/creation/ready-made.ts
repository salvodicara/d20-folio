/**
 * The class's ready-made picks for the new creation screen: once class,
 * background, species and abilities are chosen, whatever the build still lacks
 * is filled the way the class's own quickbuild preset would (its class skills,
 * cantrips and level-1 spells, its other choice picks when it shares the
 * background), then from the first legal options; then the class's own picks
 * (`fillClassPicks`: Weapon Mastery, a Fighting Style, invocations, Expertise).
 * The Riepilogo shows the result and every pick stays editable later from the
 * sheet. Pattern source: D&D Beyond's quick build, which makes every class pick.
 *
 * Only what is MISSING is filled: a pick the player made is kept, and the
 * species' own choices (its traits, a Human's Versatile feat and that feat's
 * picks) are never touched — the Specie step asks those.
 *
 * Pure module — no React, no locale reads.
 */
import { classTables } from "@/data/classes";
import { DEFAULT_QUICKBUILD_PRESET, QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { spells as allSpells } from "@/data/spells";
import { ALL_SKILLS } from "@/lib/skills";
import { ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";
import {
  STANDARD_LANGUAGE_IDS,
  listAvailableForLanguageSlot,
} from "@/lib/feat-language-choices";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";
import type { ChoicePicks, FeatureChoiceSlots } from "@/lib/feature-choices";
import { classSkillPool, quickbuildDraft } from "@/lib/quickbuild";

import type { ClassChoicePicks } from "./class-choices";
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

  // ── Cantrips and spells: the class preset's own, then the class list ──────
  // Above level 1 (a group that starts at 3) the preset's level-1 spells are not
  // enough: the rest come from the class list, highest castable level first.
  if (facts.hasClassSpellPicks) {
    const classList = allSpells
      .filter((s) => s.classes.includes(next.classId))
      .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
    if (!facts.cantripsComplete) {
      next = {
        ...next,
        cantrips: topUp(
          next.cantrips,
          [
            ...(preset.cantrips ?? []),
            ...classList.filter((s) => s.level === 0).map((s) => s.id),
          ],
          facts.cantripsNeeded
        ),
      };
    }
    if (!facts.spellsComplete) {
      const castable = classList.filter(
        (s) => s.level > 0 && s.level <= facts.maxSpellLevel
      );
      next = {
        ...next,
        spells: topUp(
          next.spells,
          [...(preset.spells ?? []), ...castable.map((s) => s.id)],
          facts.spellsNeeded
        ),
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

  // ── The class's own picks, last: Expertise reads the skills chosen above ───
  next = fillClassPicks(next, factsOf(next));

  return next === draft || JSON.stringify(next) === JSON.stringify(draft) ? draft : next;
}

/** Every class with a Fighting Style starts in armor, so Defense always applies. */
const READY_MADE_STYLE = "defense";

/**
 * `draft` with each class pick (Fighting Style, Weapon Mastery, invocations,
 * Expertise) at its count: the legal picks already made are kept, then the ones a
 * player would make — Defense, the weapons the chosen starting kit carries, the
 * class skills — then the first legal options.
 */
function fillClassPicks(draft: CreationDraft, facts: CreationFacts): CreationDraft {
  const kit =
    classTables
      .find((c) => c.id === draft.classId)
      ?.startingEquipment.find((o) => o.label === facts.classEquipLabel)
      ?.items.flatMap((item) => (item.srdId ? [item.srdId] : [])) ?? [];
  const preferred: Record<keyof ClassChoicePicks, readonly string[]> = {
    fightingStyles: [READY_MADE_STYLE],
    weaponMasteries: kit,
    invocations: [],
    expertise: draft.classSkills,
  };
  let classPicks = draft.classPicks;
  for (const kind of Object.keys(preferred) as (keyof ClassChoicePicks)[]) {
    const count = facts.classNeeds[kind];
    const legal = facts.classOptions[kind];
    const have = draft.classPicks[kind];
    const kept = have.filter((id) => legal.includes(id));
    if (kept.length === have.length && have.length === count) continue;
    classPicks = {
      ...classPicks,
      [kind]: topUp(
        kept,
        [...preferred[kind].filter((id) => legal.includes(id)), ...legal],
        count
      ),
    };
  }
  return classPicks === draft.classPicks ? draft : { ...draft, classPicks };
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
