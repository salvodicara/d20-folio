/**
 * Regression: features carrying `{ type: "always-prepared-spell", ... }`
 * grants now have those spells auto-injected into `character.spells[]`
 * by the helper used at creation + level-up.
 *
 * Real-world cases this unblocks:
 *   - Ranger L1 "Favored Enemy" → Hunter's Mark always prepared.
 *   - Magic Initiate (Cleric/Druid/Wizard) → the chosen L1 spell.
 *   - Fey-Touched → Misty Step. Shadow-Touched → Invisibility.
 *
 * Previously the grant kind existed and was aggregated by `evaluateGrants`
 * but never consumed by any spell-injection code path, so a Ranger created
 * in the wizard didn't have Hunter's Mark in the spells tab.
 */
import { describe, expect, it } from "vitest";
import { injectExpandedSpells, getAlwaysPreparedFromGrants } from "@/lib/expanded-spells";
import type { Grant } from "@/lib/grants";

describe("getAlwaysPreparedFromGrants", () => {
  it("collects spell IDs across multiple grant sources", () => {
    const sources = [
      {
        grants: [{ type: "always-prepared-spell", spellId: "hunters-mark" }] as Grant[],
      },
      {
        grants: [
          { type: "always-prepared-spell", spellId: "misty-step" },
          { type: "ac-bonus", amount: 1 },
        ] as Grant[],
      },
    ];
    expect(getAlwaysPreparedFromGrants(sources)).toEqual(["hunters-mark", "misty-step"]);
  });

  it("dedupes when the same spell is granted by multiple sources", () => {
    const sources = [
      {
        grants: [{ type: "always-prepared-spell", spellId: "fireball" }] as Grant[],
      },
      {
        grants: [{ type: "always-prepared-spell", spellId: "fireball" }] as Grant[],
      },
    ];
    expect(getAlwaysPreparedFromGrants(sources)).toEqual(["fireball"]);
  });

  it("returns [] when no source has the grant kind", () => {
    expect(
      getAlwaysPreparedFromGrants([
        { grants: [{ type: "ac-bonus", amount: 1 }] as Grant[] },
      ])
    ).toEqual([]);
    expect(getAlwaysPreparedFromGrants([])).toEqual([]);
  });

  it("ignores sources with no grants array at all", () => {
    expect(getAlwaysPreparedFromGrants([{}])).toEqual([]);
  });
});

describe("injectExpandedSpells integration with grant-based always-prepared", () => {
  it("injected spells get prepared: true + alwaysPrepared: true", () => {
    const before = [{ srdId: "fire-bolt", prepared: true }];
    const after = injectExpandedSpells(before, ["hunters-mark"]);
    expect(after).toHaveLength(2);
    const hm = after.find((s) => "srdId" in s && s.srdId === "hunters-mark");
    expect(hm).toMatchObject({
      srdId: "hunters-mark",
      prepared: true,
      alwaysPrepared: true,
    });
  });

  it("is idempotent — re-running over an already-injected spell is a no-op", () => {
    const before = [
      { srdId: "fire-bolt", prepared: true },
      { srdId: "hunters-mark", prepared: true, alwaysPrepared: true },
    ];
    const after = injectExpandedSpells(before, ["hunters-mark"]);
    expect(after).toEqual(before);
  });
});
