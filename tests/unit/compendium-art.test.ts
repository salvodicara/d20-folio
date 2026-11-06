/**
 * Every compendium entry names its painted icon: a spell its school's art, an item the
 * mundane or magic catalogue's, a monster, feat or class feature its own. The kinds
 * without art (maneuvers, metamagic, invocations, masteries) name none, so the row
 * keeps its type's glyph.
 */
import { describe, expect, it } from "vitest";
import { compendiumArt } from "@/domains/compendium/compendium-art";
import { getSpellById } from "@/data/spells";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";

describe("compendiumArt", () => {
  it("a spell is drawn through its school", () => {
    const fireball = getSpellById("fireball");
    expect(compendiumArt("spell", fireball)).toEqual({
      spell: "fireball",
      school: "evocation",
    });
  });

  it("an item is drawn from its own catalogue", () => {
    const rope = SRD_EQUIPMENT.find((e) => e.id === "rope");
    const bag = SRD_MAGIC_ITEMS.find((m) => m.id === "bag-of-holding");
    expect(compendiumArt("items", { kind: "equipment", item: rope })).toEqual({
      kind: "equipment",
      id: "rope",
    });
    expect(compendiumArt("items", { kind: "magic", item: bag })).toEqual({
      kind: "item",
      id: "bag-of-holding",
    });
  });

  it("a monster, a feat and a class feature use their own art", () => {
    expect(compendiumArt("monster", { id: "goblin-warrior" })).toEqual({
      kind: "monster",
      id: "goblin-warrior",
    });
    expect(compendiumArt("feat", { id: "alert" })).toEqual({ kind: "feat", id: "alert" });
    expect(compendiumArt("feature", { id: "bard-bardic-inspiration" })).toEqual({
      kind: "feature",
      id: "bard-bardic-inspiration",
    });
  });

  it("a kind without painted art names none", () => {
    expect(compendiumArt("maneuver", { id: "trip-attack" })).toBeNull();
    expect(compendiumArt("metamagic", { id: "quickened-spell" })).toBeNull();
  });
});
