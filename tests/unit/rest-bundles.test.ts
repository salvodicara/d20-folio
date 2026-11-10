/**
 * Which variant choosers a sheet offers, and where (`src/lib/play/rest-bundles.ts`).
 *
 * - At a rest (the rest screens): only the choices the rules let you change at a rest
 *   (`rest`: Circle of the Land's terrain, Hunter's Prey).
 * - On the resource rail: those, plus the choices made each time a spell is cast or a
 *   form is taken (`cast`: Fire Shield's warm or chill), plus a fixed choice still
 *   unmade (`once`: Primal Order, an item's type), so it can be made; never a species
 *   choice (`creation`, the Bio tab's).
 *
 * The bug this fixes (live in v0.25.0's classic rail): every bundle without a declared
 * frequency counted as re-pickable at a rest, so a Druid could swap Primal Order or a
 * Cleric Divine Order from the rail at will.
 */
import { describe, expect, it } from "vitest";

import type { GrantBundle } from "@/lib/grants";
import { railGrantBundles, restGrantBundles } from "@/lib/play/rest-bundles";

const bundle = (
  bundleKey: string,
  choiceFrequency: GrantBundle["choiceFrequency"],
  selected: string | null = "a"
): GrantBundle => ({
  bundleKey,
  sourceId: bundleKey,
  label: { en: bundleKey, it: bundleKey },
  options: [{ id: "a", label: { en: "A", it: "A" } }],
  selected,
  choiceFrequency,
});

const terrain = bundle("druid-land-terrain", "rest");
const fireShield = bundle("spell-fire-shield", "cast");
const primalOrder = bundle("druid-primal-order", "once");
const unmadeOrder = bundle("cleric-divine-order", "once", null);
const lineage = bundle("elf-lineage", "creation");
const all = [terrain, fireShield, primalOrder, unmadeOrder, lineage];

describe("the variant choosers a sheet offers", () => {
  it("at a rest: only what the rules let change at a rest", () => {
    expect(restGrantBundles(all).map((b) => b.bundleKey)).toEqual(["druid-land-terrain"]);
  });

  it("on the rail: rest and cast choices, and a fixed choice only while unmade", () => {
    expect(railGrantBundles(all).map((b) => b.bundleKey)).toEqual([
      "druid-land-terrain",
      "spell-fire-shield",
      "cleric-divine-order",
    ]);
  });

  it("two features sharing one choice show one chooser", () => {
    expect(railGrantBundles([terrain, { ...terrain, sourceId: "nature-ward" }])).toEqual([
      terrain,
    ]);
  });
});
