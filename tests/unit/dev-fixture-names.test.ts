/**
 * The dev campaign shows the pack's team sheets (real characters, kept for checking the
 * importer and the sheets on real data) under made-up names: the dev screens appear in
 * every screenshot a session takes, and a live player's character name is private
 * (owner, 2026-11-12). Each role loads under its synthetic name, the one the dev
 * campaign's member snapshot already uses where it names that role.
 */
import { describe, expect, it } from "vitest";

import { DEV_FIXTURE_NAMES, DEV_HERO_NAMES, loadDevFixture } from "@/lib/dev-fixtures";

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
