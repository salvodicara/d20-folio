/**
 * The level-up dry run before the 2026-12-07 session: each combination a live
 * character has (then the broad SRD matrix) levelled one and two levels up on the
 * new level-up screen, every step checked against the SRD 5.2.1 tables.
 */
import { describe, expect, it } from "vitest";

import { checkStep, dryRun, parseCombo } from "./_harness";
import { LIVE_COMBOS, SRD_MATRIX } from "./combos";

function runAll(key: string) {
  const combo = parseCombo(key);
  return combo.classes.flatMap((e) =>
    dryRun(combo, e.classId).flatMap((step) => checkStep(step))
  );
}

describe("level-up dry run: live combinations", () => {
  for (const key of LIVE_COMBOS) {
    it(`${key} → +1, +2`, () => {
      expect(runAll(key)).toEqual([]);
    });
  }
});

describe("level-up dry run: SRD matrix", () => {
  for (const key of SRD_MATRIX.filter((k) => !LIVE_COMBOS.includes(k))) {
    it(`${key} → +1, +2`, () => {
      expect(runAll(key)).toEqual([]);
    });
  }
});
