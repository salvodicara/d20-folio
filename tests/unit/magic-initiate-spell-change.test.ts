/**
 * Magic Initiate, Spell Change (SRD 5.2.1): whenever you gain a new level, you can
 * replace one of the spells you chose for this feat with a different spell of the
 * same level from the chosen spell list. The feat's level 1 pick is the one it
 * casts for free (its free-cast key names the feat); the replacement keeps that.
 */
import { describe, expect, it } from "vitest";
import { applyFeatSpellChange, featSpellChange } from "@/lib/feat-spell-change";
import type { SrdSpellRef } from "@/types/character";

const missile: SrdSpellRef = {
  srdId: "magic-missile",
  prepared: true,
  alwaysPrepared: true,
  spellAbilityOverride: "INT",
  freeCastSource: { sourceId: "magic-initiate-wizard", rest: "long", usesPerRest: 1 },
};
const spells = [{ srdId: "fire-bolt" }, missile, { srdId: "shield", prepared: true }];

describe("Magic Initiate: Spell Change", () => {
  it("offers the feat's level 1 spell, and same-level wizard spells not already known", () => {
    const change = featSpellChange("magic-initiate-wizard", spells);
    expect(change?.spellId).toBe("magic-missile");
    expect(change?.pool).toContain("sleep");
    expect(change?.pool).not.toContain("magic-missile");
    expect(change?.pool).not.toContain("shield");
    expect(change?.pool).not.toContain("cure-wounds");
    expect(change?.pool.every((id) => id !== "fireball")).toBe(true);
  });

  it("the new spell keeps the feat's free cast, ability and always-prepared", () => {
    const next = applyFeatSpellChange(spells, "magic-missile", "sleep");
    expect(next.find((s) => !("custom" in s) && s.srdId === "sleep")).toEqual({
      ...missile,
      srdId: "sleep",
    });
    expect(next.some((s) => !("custom" in s) && s.srdId === "magic-missile")).toBe(false);
  });

  it("no feat pick on the sheet: nothing to change", () => {
    expect(featSpellChange("magic-initiate-wizard", [{ srdId: "fire-bolt" }])).toBeNull();
  });
});
