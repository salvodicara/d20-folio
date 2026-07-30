/**
 * Guard: a ROLLED quickbuild is as legal and as complete as a hand-authored one.
 *
 * Randomize keeps the class and rerolls everything else, so the failure mode is
 * not "an ugly character" — it is a character the wizard will refuse to create,
 * or worse, one carrying an id nothing in the data resolves. A single hand-picked
 * example proves nothing about a generator: this is a SEEDED PROPERTY battery —
 * every composed class × many seeds — and every subject, pool and count is
 * derived from the composed data and the roll's own output.
 *
 * The seeded PRNG lives here, in the test, so a roll is reproducible; production
 * injects `cryptoRng`. Neither is dice (golden rule 21) — no roll of the game is
 * generated anywhere in this path.
 *
 * BLIND SPOTS — what this cannot see:
 *   - the UI wiring (a tap actually rerolling the page): `quickbuild-path.test.tsx`.
 *   - DISTRIBUTION: it pins that every draw is legal, never that the generator is
 *     unbiased or that it explores the whole pool.
 */
import { describe, expect, it } from "vitest";
import { QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { cryptoRng, rollQuickbuildFlavor, type Rng } from "@/lib/quickbuild-random";
import { presetChoiceSlots, quickbuildDraft } from "@/lib/quickbuild";
import { isAllChoicesComplete } from "@/lib/feature-choices";
import { ORIGIN_LANGUAGE_SLOTS } from "@/lib/creation-choices";
import { listAvailableForLanguageSlot } from "@/lib/feat-language-choices";
import { classTables } from "@/data/classes";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_RACES } from "@/data/races";
import { FEATS_BY_ID } from "@/data/feats";
import { spells as ALL_SPELLS } from "@/data/spells";
import { ALL_ABILITY_CODES } from "@/data/types";
import { skillNameToId } from "@/lib/compute";
import { POINT_BUY_BUDGET, pointBuyCost } from "@/features/creation/steps/steps";

/** A tiny seeded PRNG (mulberry32) — deterministic, test-only. */
function seeded(seed: number): Rng {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [1, 7, 42, 99, 1234, 20_240, 555_555, 987_654_321];
const presets = Object.entries(QUICKBUILD_PRESETS);
const rolls = presets.flatMap(([classId, base]) =>
  SEEDS.map(
    (seed) => [classId, seed, rollQuickbuildFlavor(classId, base, seeded(seed))] as const
  )
);

describe("rollQuickbuildFlavor", () => {
  it("rolls every composed class, many seeds", () => {
    expect(presets.length).toBe(classTables.length);
    expect(rolls.length).toBe(presets.length * SEEDS.length);
  });

  it("is deterministic — the same seed always yields the same character", () => {
    for (const [classId, base] of presets) {
      expect(rollQuickbuildFlavor(classId, base, seeded(31))).toEqual(
        rollQuickbuildFlavor(classId, base, seeded(31))
      );
    }
  });

  it("never rerolls the class's ability priority (playability is not random)", () => {
    for (const [classId, seed, rolled] of rolls) {
      const base = QUICKBUILD_PRESETS[classId];
      expect(rolled.abilityOrder, `${classId}#${seed}`).toEqual(base?.abilityOrder);
    }
  });

  describe.each(rolls)("%s (seed %i)", (classId, _seed, rolled) => {
    const table = classTables.find((c) => c.id === classId);
    const background = SRD_BACKGROUNDS.find((b) => b.id === rolled.backgroundId);
    const race = SRD_RACES.find((r) => r.id === rolled.raceId);
    const draft = quickbuildDraft(classId, rolled);

    it("draws a real species, background and lineage", () => {
      expect(race, rolled.raceId).toBeDefined();
      expect(background, rolled.backgroundId).toBeDefined();
      const bundles = (race?.traits ?? []).flatMap((trait) =>
        (trait.grants ?? []).filter(
          (g) => g.type === "choice-grant-bundle" && g.choiceFrequency === "creation"
        )
      );
      expect(Object.keys(rolled.lineage ?? {}).sort()).toEqual(
        bundles.map((b) => (b.type === "choice-grant-bundle" ? b.bundleKey : "")).sort()
      );
      for (const bundle of bundles) {
        if (bundle.type !== "choice-grant-bundle") continue;
        expect(bundle.options.map((o) => o.id)).toContain(
          rolled.lineage?.[bundle.bundleKey]
        );
      }
    });

    it("keeps the standard array at exactly the point-buy budget", () => {
      const spent = ALL_ABILITY_CODES.reduce(
        (sum, code) => sum + pointBuyCost(draft.abilityScores[code]),
        0
      );
      expect(spent).toBe(POINT_BUY_BUDGET);
    });

    it("boosts two distinct abilities the rolled background allows", () => {
      const [primary, secondary] = rolled.boost;
      expect(primary).not.toBe(secondary);
      expect(background?.abilityOptions).toContain(primary);
      expect(background?.abilityOptions).toContain(secondary);
    });

    it("takes the Human origin feat only when Human rolled up", () => {
      if (rolled.raceId === "human") {
        expect(FEATS_BY_ID.get(rolled.humanFeat ?? "")?.category).toBe("origin");
        expect(rolled.humanFeat).not.toBe(background?.feat);
      } else {
        expect(rolled.humanFeat).toBeUndefined();
      }
    });

    it("fills the class skills from the pool, never a background's", () => {
      const pool = (table?.skillChoices.from ?? [])
        .map(skillNameToId)
        .filter((id): id is string => id !== null);
      const bgSkills = (background?.skillProficiencies ?? [])
        .map(skillNameToId)
        .filter((id): id is string => id !== null);
      expect(rolled.classSkills.length).toBe(table?.skillChoices.count);
      expect(new Set(rolled.classSkills).size).toBe(rolled.classSkills.length);
      for (const id of rolled.classSkills) {
        expect(pool, id).toContain(id);
        expect(bgSkills, id).not.toContain(id);
      }
    });

    it("learns exactly the level-1 spells the class table asks for", () => {
      const row = table?.levels[0];
      const cantrips = rolled.cantrips ?? [];
      const spells = rolled.spells ?? [];
      expect(cantrips.length).toBe(row?.cantripsKnown ?? 0);
      expect(spells.length).toBe(row?.spellsKnown ?? 0);
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
        expect(spell?.level ?? 0).toBeGreaterThan(0);
        expect(spell?.level ?? 0).toBeLessThanOrEqual(maxLevel);
      }
      expect(new Set([...cantrips, ...spells]).size).toBe(
        cantrips.length + spells.length
      );
    });

    it("draws two distinct origin languages from the slot's own pool", () => {
      const [slot] = ORIGIN_LANGUAGE_SLOTS;
      const allowed = slot ? listAvailableForLanguageSlot(slot) : [];
      expect(rolled.languages.length).toBe(slot?.amount);
      expect(new Set(rolled.languages).size).toBe(rolled.languages.length);
      for (const id of rolled.languages) expect(allowed).toContain(id);
    });

    it("satisfies every choice slot the rolled build confers", () => {
      // The wizard's OWN completeness gate over the rolled draft.
      expect(
        isAllChoicesComplete(presetChoiceSlots(classId, rolled), draft.choicePicks)
      ).toBe(true);
    });
  });
});

describe("cryptoRng", () => {
  it("yields values in [0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const value = cryptoRng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
