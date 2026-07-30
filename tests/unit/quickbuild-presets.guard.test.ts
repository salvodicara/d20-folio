/**
 * Guard: every quickbuild preset is a LEGAL, COMPLETE level-1 build.
 *
 * The quickbuild path fills a whole character from one tap, so a preset that
 * names a skill outside its class pool, mis-spends the point budget, or leaves
 * a grant-driven slot half-filled would mint a broken character — silently,
 * because the wizard would simply refuse to create and the player would have no
 * idea which of twenty prefilled controls was wrong.
 *
 * Every subject and every case here is DERIVED (golden rule 13): the table is
 * `QUICKBUILD_PRESETS` itself (public + pack, whichever mode composes), the
 * legal option sets come from the class tables / backgrounds / races / spell
 * data, and the choice slots come from the SAME `creationChoiceSlots` seam the
 * wizard gates on. Nothing is hand-listed, and the derived sets are asserted
 * non-empty so a renamed export can never empty the sweep.
 *
 * BLIND SPOTS — what this guard cannot see:
 *   - Whether the wizard's Create gate accepts the applied draft end to end.
 *     That is `quickbuild-path.test.tsx`, which drives the real UI per preset.
 *   - TASTE: whether a preset's species/background/spell choices are GOOD
 *     picks. It only pins that they are legal and complete.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUICKBUILD_CLASS,
  DEFAULT_QUICKBUILD_PRESET,
  QUICKBUILD_PRESETS,
} from "@/data/quickbuild";
import { quickbuildDraft, presetChoiceSlots } from "@/lib/quickbuild";
import { isAllChoicesComplete } from "@/lib/feature-choices";
import { classTables } from "@/data/classes";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_RACES } from "@/data/races";
import { spells as ALL_SPELLS } from "@/data/spells";
import { FEATS_BY_ID } from "@/data/feats";
import { ALL_ABILITY_CODES } from "@/data/types";
import { skillNameToId } from "@/lib/compute";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import { pointBuyCost, POINT_BUY_BUDGET } from "@/features/creation/steps/steps";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";
import { listAvailableForLanguageSlot } from "@/lib/feat-language-choices";
import { ORIGIN_LANGUAGE_SLOTS, ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";
import { isSkillId } from "@/lib/feat-skill-tool-choices";
import { SRD_TOOLS_2024 } from "@/lib/tools";

const presets = Object.entries(QUICKBUILD_PRESETS);

describe("quickbuild presets", () => {
  it("the page's default build IS the composed preset for the default class", () => {
    // `DEFAULT_QUICKBUILD_PRESET` is what the creation page opens with; if it
    // ever stopped being the composed entry (a pack override, a renamed class),
    // the page would open on a build nothing else agrees with.
    expect(QUICKBUILD_PRESETS[DEFAULT_QUICKBUILD_CLASS]).toBe(DEFAULT_QUICKBUILD_PRESET);
    expect(classTables.some((c) => c.id === DEFAULT_QUICKBUILD_CLASS)).toBe(true);
  });

  it("covers every composed class exactly once", () => {
    expect(classTables.length).toBeGreaterThan(0);
    expect(presets.length).toBe(classTables.length);
    for (const table of classTables) {
      expect(QUICKBUILD_PRESETS[table.id]).toBeDefined();
    }
  });

  describe.each(presets)("%s", (classId, preset) => {
    const table = classTables.find((c) => c.id === classId);
    const background = SRD_BACKGROUNDS.find((b) => b.id === preset.backgroundId);
    const draft = quickbuildDraft(classId, preset);

    it("spends exactly the point-buy budget on the standard array", () => {
      // The scores ARE the standard array dealt in the preset's priority order,
      // so the identity "standard array === 27 points" is what makes the preset
      // expressible through the wizard's existing point-buy state.
      expect([...preset.abilityOrder].sort()).toEqual([...ALL_ABILITY_CODES].sort());
      const spent = ALL_ABILITY_CODES.reduce(
        (sum, code) => sum + pointBuyCost(draft.abilityScores[code]),
        0
      );
      expect(spent).toBe(POINT_BUY_BUDGET);
    });

    it("boosts two distinct abilities the background allows (D5)", () => {
      expect(background).toBeDefined();
      const [primary, secondary] = preset.boost;
      expect(primary).not.toBe(secondary);
      expect(background?.abilityOptions).toContain(primary);
      expect(background?.abilityOptions).toContain(secondary);
      expect(draft.bgAsiChoices).toEqual({ [primary]: 2, [secondary]: 1 });
    });

    it("names a real species and resolves its creation-time lineage", () => {
      expect(SRD_RACES.some((r) => r.id === preset.raceId)).toBe(true);
      const bundles = lineageBundleVMs(preset.raceId, "en");
      expect(Object.keys(preset.lineage ?? {}).sort()).toEqual(
        bundles.map((b) => b.bundleKey).sort()
      );
      for (const bundle of bundles) {
        expect(bundle.options.map((o) => o.id)).toContain(
          preset.lineage?.[bundle.bundleKey]
        );
      }
    });

    it("picks the Human origin feat if and only if it is Human", () => {
      if (preset.raceId === "human") {
        expect(FEATS_BY_ID.has(preset.humanFeat ?? "")).toBe(true);
        // Origin feats never repeat: the Human pick must differ from the one
        // the background already grants.
        expect(preset.humanFeat).not.toBe(background?.feat);
      } else {
        expect(preset.humanFeat).toBeUndefined();
      }
    });

    it("fills the class skill slots from the class pool", () => {
      const pool = (table?.skillChoices.from ?? [])
        .map(skillNameToId)
        .filter((id): id is string => id !== null);
      const bgSkills = (background?.skillProficiencies ?? [])
        .map(skillNameToId)
        .filter((id): id is string => id !== null);
      expect(pool.length).toBeGreaterThan(0);
      expect(preset.classSkills.length).toBe(table?.skillChoices.count);
      expect(new Set(preset.classSkills).size).toBe(preset.classSkills.length);
      for (const id of preset.classSkills) {
        expect(pool).toContain(id);
        // A background skill is locked in the picker — spending a class pick on
        // it would waste the pick and leave the count unreachable in the UI.
        expect(bgSkills).not.toContain(id);
      }
    });

    it("learns exactly the cantrips and spells its level-1 table asks for", () => {
      const row = table?.levels[0];
      const cantrips = preset.cantrips ?? [];
      const spells = preset.spells ?? [];
      expect(cantrips.length).toBe(row?.cantripsKnown ?? 0);
      expect(spells.length).toBe(row?.spellsKnown ?? 0);
      const maxLevel = (row?.spellSlots ?? []).reduce(
        (max, slots, i) => (slots > 0 ? i + 1 : max),
        0
      );
      for (const id of [...cantrips, ...spells]) {
        const spell = ALL_SPELLS.find((s) => s.id === id);
        expect(spell, `unknown spell "${id}"`).toBeDefined();
        expect(spell?.classes).toContain(classId);
        expect(spell?.level).toBeLessThanOrEqual(cantrips.includes(id) ? 0 : maxLevel);
      }
      expect(new Set([...cantrips, ...spells]).size).toBe(
        cantrips.length + spells.length
      );
    });

    it("fills the origin-language slot from its own pool", () => {
      // Derived from the slot the wizard renders, not a hand-listed roster.
      const [slot] = ORIGIN_LANGUAGE_SLOTS;
      expect(slot).toBeDefined();
      const allowed = slot ? listAvailableForLanguageSlot(slot) : [];
      expect(allowed.length).toBeGreaterThan(0);
      expect(preset.languages.length).toBe(slot?.amount);
      expect(new Set(preset.languages).size).toBe(preset.languages.length);
      for (const id of preset.languages) expect(allowed).toContain(id);
      expect(draft.languagePicks[ORIGIN_LANGUAGE_SLOT_ID]).toEqual([...preset.languages]);
    });

    it("fills every grant-driven choice slot, and declares no unused pick", () => {
      const slots = presetChoiceSlots(classId, preset);
      // The wizard's OWN completeness gate — every slot filled to its amount.
      expect(isAllChoicesComplete(slots, draft.choicePicks)).toBe(true);
      // …and nothing declared beyond what the slots take (a stale id would
      // otherwise sit in the preset unnoticed).
      // Spread per kind rather than `Object.values(slots).flat()`: flattening a
      // union of seven different slot arrays degrades to `any`, which the lint
      // gate rejects (and which would silently stop counting anything).
      const demanded =
        [
          ...slots.skill,
          ...slots.tool,
          ...slots.skillOrTool,
          ...slots.language,
          ...slots.expertise,
          ...slots.feat,
        ].reduce((n, s) => n + s.amount, 0) +
        slots.spell.reduce((n, s) => n + s.count, 0);
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
        // The picker offers the pool MINUS what the character already owns, so
        // a feat pick that repeats a class pick would be unofferable.
        const owned = new Set([...(preset.cantrips ?? []), ...(preset.spells ?? [])]);
        const pool = listAvailableForSlot(slot, owned).map((s) => s.id);
        for (const id of draft.choicePicks.spell[slot.slotId] ?? []) {
          expect(pool, `spell ${id}`).toContain(id);
        }
      }
      for (const slot of slots.skillOrTool) {
        for (const id of draft.choicePicks.skillOrTool[slot.slotId] ?? []) {
          // An open pool: the id must at least BE a skill or a catalogue tool,
          // or `applySkillOrToolPicks` would silently drop it.
          expect(
            isSkillId(id) || SRD_TOOLS_2024.some((tool) => tool.id === id),
            `skill-or-tool ${id}`
          ).toBe(true);
        }
      }
    });
  });
});
