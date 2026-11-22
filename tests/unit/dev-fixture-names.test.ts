/**
 * The dev campaign shows the pack's team sheets (real characters, kept for checking the
 * importer and the sheets on real data) under made-up names: the dev screens appear in
 * every screenshot a session takes, and a live player's character name is private
 * (owner, 2026-11-12). Each role loads under its synthetic name, the one the dev
 * campaign's member snapshot already uses where it names that role.
 */
import { describe, expect, it } from "vitest";

import {
  DEV_FIXTURE_NAMES,
  DEV_HERO_NAMES,
  devHeroStandIn,
  loadDevFixture,
} from "@/lib/dev-fixtures";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("the dev team sheets", () => {
  it("every role has a synthetic name", () => {
    for (const role of DEV_FIXTURE_NAMES) expect(DEV_HERO_NAMES[role], role).toBeTruthy();
  });

  it.each(DEV_FIXTURE_NAMES.map((role) => [role]))(
    "team-%s loads under its synthetic name",
    async (role) => {
      const doc = await loadDevFixture(`team-${role}`);
      expect(doc?.character.name).toBe(DEV_HERO_NAMES[role]);
    }
  );
});

// Board row C3 (2026-11-12): on a dev server without the pack, «Tira per chi manca»
// listed the same hero three times. Each role stands in under its own made-up name.
describe("a team sheet the pack does not carry", () => {
  it("stands in as the mock hero under its role's name, one name each", () => {
    const names = ["team-bard", "team-paladin", "team-wizard"].map(
      (id) => devHeroStandIn(id, MOCK_CHARACTER)?.character.name
    );
    expect(names).toEqual([
      DEV_HERO_NAMES.bard,
      DEV_HERO_NAMES.paladin,
      DEV_HERO_NAMES.wizard,
    ]);
    expect(new Set([...names, MOCK_CHARACTER.character.name]).size).toBe(4);
  });

  it("an id that names no role has no stand-in", () => {
    expect(devHeroStandIn("mock-1", MOCK_CHARACTER)).toBeNull();
  });
});
