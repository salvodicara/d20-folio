/**
 * Guard: a ROLLED quickbuild is as legal and as complete as a hand-authored one.
 *
 * Randomize keeps the class and rerolls everything else, so the failure mode is
 * not "an ugly character" — it is a character the wizard will refuse to create,
 * or worse, one carrying an id nothing in the data resolves. A single hand-picked
 * example proves nothing about a generator: this is a SEEDED PROPERTY battery,
 * every composed class × many seeds, held to the very same `expectLegalPreset`
 * the authored presets clear (a roll IS a preset — one bar, one implementation).
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
import { classTables } from "@/data/classes";
import { expectLegalPreset } from "./__helpers__/quickbuild-legality";

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

  it.each(rolls)(
    "%s (seed %i) rolls a legal, complete build",
    (classId, _seed, rolled) => {
      expectLegalPreset(classId, rolled);
    }
  );
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
