/**
 * The ONE legality battery for a quickbuild preset — shared by the hand-authored
 * presets (`quickbuild-presets.guard.test.ts`) and the ROLLED ones
 * (`quickbuild-random.test.ts`), because a roll produces exactly the same shape
 * and must clear exactly the same bar.
 *
 * Every subject and every case is DERIVED (golden rule 13): the class table, the
 * background, the species' own creation bundles, the spell data, the origin
 * language slot, and the choice slots the build itself confers. Nothing is
 * hand-listed, and each derived pool is asserted non-empty where an empty one
 * would make the check vacuous.
 *
 * It does NOT judge whether the picks are GOOD (that is taste, and the composed
 * presets' provenance is documented beside the data), nor whether the wizard's
 * Create gate accepts the build end to end — `quickbuild-path.test.tsx` drives
 * the real UI for that.
 */
import { expect } from "vitest";
import type { QuickbuildPreset } from "@/data/quickbuild";
import { presetChoiceSlots, quickbuildDraft } from "@/lib/quickbuild";
import { isAllChoicesComplete } from "@/lib/feature-choices";
import { ORIGIN_LANGUAGE_SLOTS } from "@/lib/creation-choices";
import { listAvailableForLanguageSlot } from "@/lib/feat-language-choices";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";
import { isSkillId } from "@/lib/feat-skill-tool-choices";
import { SRD_TOOLS_2024 } from "@/lib/tools";
import { classTables } from "@/data/classes";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_RACES } from "@/data/races";
import { FEATS_BY_ID } from "@/data/feats";
import { spells as ALL_SPELLS } from "@/data/spells";
import { ALL_ABILITY_CODES } from "@/data/types";
import { skillNameToId } from "@/lib/compute";
import { POINT_BUY_BUDGET, pointBuyCost } from "@/features/creation/steps/steps";

/** Assert that `preset` is a legal, COMPLETE level-1 build for `classId`. */
export function expectLegalPreset(classId: string, preset: QuickbuildPreset): void {
  const table = classTables.find((c) => c.id === classId);
  const background = SRD_BACKGROUNDS.find((b) => b.id === preset.backgroundId);
  const race = SRD_RACES.find((r) => r.id === preset.raceId);
  const draft = quickbuildDraft(classId, preset);
  expect(table, classId).toBeDefined();
  expect(background, preset.backgroundId).toBeDefined();
  expect(race, preset.raceId).toBeDefined();

  // ── The standard array, dealt in the class's priority ──────────────────────
  // The identity that makes a preset expressible through the wizard's own
  // point-buy state: [15,14,13,12,10,8] costs exactly the 27-point budget.
  expect([...preset.abilityOrder].sort()).toEqual([...ALL_ABILITY_CODES].sort());
  const spent = ALL_ABILITY_CODES.reduce(
    (sum, code) => sum + pointBuyCost(draft.abilityScores[code]),
    0
  );
  expect(spent, `${classId} point-buy`).toBe(POINT_BUY_BUDGET);

  // ── The background boosts (D5) ─────────────────────────────────────────────
  const [primary, secondary] = preset.boost;
  expect(primary).not.toBe(secondary);
  expect(background?.abilityOptions, `${classId} +2`).toContain(primary);
  expect(background?.abilityOptions, `${classId} +1`).toContain(secondary);
  expect(draft.bgAsiChoices).toEqual({ [primary]: 2, [secondary]: 1 });

  // ── The species' creation-time lineage ─────────────────────────────────────
  const bundles = (race?.traits ?? []).flatMap((trait) =>
    (trait.grants ?? []).filter(
      (g) => g.type === "choice-grant-bundle" && g.choiceFrequency === "creation"
    )
  );
  expect(Object.keys(preset.lineage ?? {}).sort()).toEqual(
    bundles.map((b) => (b.type === "choice-grant-bundle" ? b.bundleKey : "")).sort()
  );
  for (const bundle of bundles) {
    if (bundle.type !== "choice-grant-bundle") continue;
    expect(bundle.options.map((o) => o.id)).toContain(preset.lineage?.[bundle.bundleKey]);
  }

  // ── The Human origin feat, if and only if Human ────────────────────────────
  if (preset.raceId === "human") {
    expect(FEATS_BY_ID.get(preset.humanFeat ?? "")?.category).toBe("origin");
    // Origin feats never repeat: never the one the background already grants.
    expect(preset.humanFeat).not.toBe(background?.feat);
  } else {
    expect(preset.humanFeat).toBeUndefined();
  }

  // ── Class skills: from the class pool, never a background's ────────────────
  const skillPool = (table?.skillChoices.from ?? [])
    .map(skillNameToId)
    .filter((id): id is string => id !== null);
  const bgSkills = (background?.skillProficiencies ?? [])
    .map(skillNameToId)
    .filter((id): id is string => id !== null);
  expect(skillPool.length).toBeGreaterThan(0);
  expect(preset.classSkills.length).toBe(table?.skillChoices.count);
  expect(new Set(preset.classSkills).size).toBe(preset.classSkills.length);
  for (const id of preset.classSkills) {
    expect(skillPool, id).toContain(id);
    // A background skill is locked in the picker — spending a class pick on it
    // would waste the pick and leave the count unreachable in the UI.
    expect(bgSkills, id).not.toContain(id);
  }

  // ── Exactly the level-1 spells the class table asks for ────────────────────
  const row = table?.levels[0];
  const cantrips = preset.cantrips ?? [];
  const spells = preset.spells ?? [];
  expect(cantrips.length, `${classId} cantrips`).toBe(row?.cantripsKnown ?? 0);
  expect(spells.length, `${classId} spells`).toBe(row?.spellsKnown ?? 0);
  const maxLevel = (row?.spellSlots ?? []).reduce(
    (max, slots, i) => (slots > 0 ? i + 1 : max),
    0
  );
  for (const id of cantrips) {
    const spell = ALL_SPELLS.find((s) => s.id === id);
    expect(spell?.level, id).toBe(0);
    expect(spell?.classes, id).toContain(classId);
  }
  for (const id of spells) {
    const spell = ALL_SPELLS.find((s) => s.id === id);
    expect(spell?.classes, id).toContain(classId);
    expect(spell?.level ?? 0, id).toBeGreaterThan(0);
    expect(spell?.level ?? 0, id).toBeLessThanOrEqual(maxLevel);
  }
  expect(new Set([...cantrips, ...spells]).size).toBe(cantrips.length + spells.length);

  // ── The origin languages, from the slot's own pool ─────────────────────────
  const [languageSlot] = ORIGIN_LANGUAGE_SLOTS;
  const languagePool = languageSlot ? listAvailableForLanguageSlot(languageSlot) : [];
  expect(languagePool.length).toBeGreaterThan(0);
  expect(preset.languages.length).toBe(languageSlot?.amount);
  expect(new Set(preset.languages).size).toBe(preset.languages.length);
  for (const id of preset.languages) expect(languagePool, id).toContain(id);

  // ── Every grant-driven choice slot filled, with no unused pick ─────────────
  const slots = presetChoiceSlots(classId, preset);
  expect(isAllChoicesComplete(slots, draft.choicePicks), `${classId} choices`).toBe(true);
  // Spread per kind rather than `Object.values(slots).flat()`: flattening a
  // union of seven different slot arrays degrades to `any`, which the lint gate
  // rejects (and which would silently stop counting anything).
  const demanded =
    [
      ...slots.skill,
      ...slots.tool,
      ...slots.skillOrTool,
      ...slots.language,
      ...slots.expertise,
      ...slots.feat,
    ].reduce((n, s) => n + s.amount, 0) + slots.spell.reduce((n, s) => n + s.count, 0);
  expect(Object.values(preset.choices ?? {}).flat().length).toBe(demanded);

  // Each pick must be legal for the slot it lands in.
  for (const slot of slots.tool) {
    for (const id of draft.choicePicks.tool[slot.slotId] ?? []) {
      expect(slot.options, `tool ${id}`).toContain(id);
    }
  }
  for (const slot of slots.skill) {
    for (const id of draft.choicePicks.skill[slot.slotId] ?? []) {
      expect(slot.options, `skill ${id}`).toContain(id);
    }
  }
  for (const slot of slots.language) {
    for (const id of draft.choicePicks.language[slot.slotId] ?? []) {
      expect(listAvailableForLanguageSlot(slot), `language ${id}`).toContain(id);
    }
  }
  for (const slot of slots.spell) {
    // The picker offers the pool MINUS what the character already owns, so a
    // feat pick that repeats a class pick would be unofferable.
    const owned = new Set([...cantrips, ...spells]);
    const pool = listAvailableForSlot(slot, owned).map((s) => s.id);
    for (const id of draft.choicePicks.spell[slot.slotId] ?? []) {
      expect(pool, `spell ${id}`).toContain(id);
    }
  }
  for (const slot of slots.skillOrTool) {
    for (const id of draft.choicePicks.skillOrTool[slot.slotId] ?? []) {
      // An open pool: the id must at least BE a skill or a catalogue tool, or
      // `applySkillOrToolPicks` would silently drop it.
      expect(
        isSkillId(id) || SRD_TOOLS_2024.some((tool) => tool.id === id),
        `skill-or-tool ${id}`
      ).toBe(true);
    }
  }
  for (const slot of slots.expertise) {
    for (const id of draft.choicePicks.expertise[slot.slotId] ?? []) {
      expect(isSkillId(id), `expertise ${id}`).toBe(true);
    }
  }
  for (const slot of slots.feat) {
    for (const id of draft.choicePicks.feat[slot.slotId] ?? []) {
      expect(FEATS_BY_ID.get(id)?.category, `feat ${id}`).toBe(slot.category);
    }
  }
}
