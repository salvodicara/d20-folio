/**
 * The DM's side of a magic item (edge-case M20,
 * docs/architecture/2026-11-dm-state-and-roster.md): whether THIS copy is cursed, its
 * rolled artifact properties and its notes live in `dmItems` (DM only); what the DM
 * has revealed lives in `itemReveals` (members read). Revealing moves knowledge from
 * the first to the second. The catalogue cases: Armor of Vulnerability's curse is
 * "revealed only when the Identify spell is cast on the armor or you attune to it";
 * a Berserker Axe's is not revealed by Identify.
 */
import { describe, expect, it } from "vitest";

import {
  curseBinds,
  identifyReveal,
  parseDmItemState,
  parseItemReveal,
  revealCurse,
  revealProperty,
  rolledProperties,
  unlockedProperties,
} from "@/lib/item-overlays";
import { RAW_TABLE_RULES, effectiveTableRules } from "@/lib/table-rules";

describe("a curse", () => {
  it("the DM reveals a cursed copy's curse, once", () => {
    expect(revealCurse({ cursed: true }, undefined)).toEqual({ curse: true });
    expect(revealCurse({ cursed: true }, { curse: true })).toBeNull();
    expect(revealCurse({}, undefined)).toBeNull();
  });

  it("Identify reveals it only where the item says so, and only on a cursed copy", () => {
    expect(identifyReveal("armor-of-vulnerability", { cursed: true }, undefined)).toEqual(
      {
        curse: true,
      }
    );
    expect(identifyReveal("berserker-axe", { cursed: true }, undefined)).toBeNull();
    expect(identifyReveal("armor-of-vulnerability", {}, undefined)).toBeNull();
  });

  it("binds the attunement in a campaign only once revealed; solo, as written", () => {
    expect(curseBinds("berserker-axe", { campaign: false })).toBe(true);
    expect(curseBinds("berserker-axe", { campaign: true })).toBe(false);
    expect(curseBinds("berserker-axe", { campaign: true, reveal: { curse: true } })).toBe(
      true
    );
    expect(curseBinds("cloak-of-protection", { campaign: false })).toBe(false);
  });
});

describe("an artifact's rolled properties", () => {
  it("the DM's rolls stay hidden until revealed one at a time", () => {
    const dm = { properties: ["minor-beneficial-3", "major-detrimental-1"] };
    expect(rolledProperties(dm, undefined)).toEqual({
      revealed: [],
      hidden: ["minor-beneficial-3", "major-detrimental-1"],
    });
    const reveal = revealProperty(dm, undefined, "minor-beneficial-3");
    expect(reveal).toEqual({ properties: ["minor-beneficial-3"] });
    expect(rolledProperties(dm, reveal ?? undefined)).toEqual({
      revealed: ["minor-beneficial-3"],
      hidden: ["major-detrimental-1"],
    });
    // Only a property the DM rolled, and only once.
    expect(revealProperty(dm, reveal ?? undefined, "minor-beneficial-3")).toBeNull();
    expect(revealProperty(dm, undefined, "not-rolled")).toBeNull();
  });
});

describe("an evolving item's unlocked properties", () => {
  const evolving = effectiveTableRules({ tableRules: { evolvingItems: true } });
  it("count only when the table plays the optional rule", () => {
    const ref = { unlockedProperties: ["dormant", "awakened"] };
    expect(unlockedProperties(ref, evolving)).toEqual(["dormant", "awakened"]);
    expect(unlockedProperties(ref, RAW_TABLE_RULES)).toEqual([]);
    expect(unlockedProperties({}, evolving)).toEqual([]);
  });
});

describe("reading the stored documents", () => {
  it("keeps the known fields, bounded, and drops anything else", () => {
    expect(
      parseDmItemState({
        cursed: true,
        notes: "Bloodthirsty",
        properties: ["a", 3, "b"],
        extra: "x",
      })
    ).toEqual({ cursed: true, notes: "Bloodthirsty", properties: ["a", "b"] });
    expect(parseItemReveal({ curse: true, properties: ["a"], junk: 1 })).toEqual({
      curse: true,
      properties: ["a"],
    });
    expect(parseItemReveal(null)).toEqual({});
    expect(parseDmItemState({ notes: "x".repeat(5000) }).notes?.length).toBe(4000);
  });
});
