/** Spell zones (edge-case M9 catalogue): the persistent areas the SRD spells leave. */
import { describe, expect, it } from "vitest";
import { getSpellById, spells } from "@/data/spells";

describe("spell zones", () => {
  it("a zone's level is its spell's own level", () => {
    const mismatched = spells
      .filter((spell) => spell.zone && spell.zone.spellLevel !== spell.level)
      .map((spell) => spell.id);
    expect(mismatched).toEqual([]);
  });

  it("Darkness and Daylight are light zones that can sit on an object", () => {
    expect(getSpellById("darkness")?.zone).toMatchObject({
      anchor: "point-or-object",
      light: "magical-darkness",
      spellLevel: 2,
    });
    expect(getSpellById("daylight")?.zone).toMatchObject({
      anchor: "point-or-object",
      light: "bright",
      spellLevel: 3,
    });
  });

  it("the areas that hurt say when", () => {
    expect(getSpellById("spirit-guardians")?.zone).toMatchObject({
      anchor: "caster",
      spares: "chosen",
      triggers: ["enter", "end-turn"],
    });
    expect(getSpellById("spike-growth")?.zone?.triggers).toEqual([
      "enter",
      "move-within",
    ]);
    expect(getSpellById("moonbeam")?.zone).toMatchObject({ light: "dim" });
  });
});
