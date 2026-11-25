/**
 * A homebrew spell from a form (#1230): the classic sheet's `CustomSpell` model and
 * its one rule (a name is required), shared by the classic Custom form and the Play
 * screen's «Incantesimo personalizzato». Ritual lives where the catalogue spell
 * keeps it (`mechanics.ritual`), so the Spells view offers the ritual cast.
 */
import { describe, expect, it } from "vitest";

import {
  CUSTOM_SPELL_CASTING_TIMES,
  customSpellDraft,
  customSpellFromDraft,
  type CustomSpellDraft,
} from "@/lib/custom-spell";
import { homebrewSpellData } from "@/lib/homebrew-spells";
import type { CustomSpell } from "@/types/character";

const draft = (over: Partial<CustomSpellDraft> = {}): CustomSpellDraft => ({
  ...customSpellDraft({ range: "60 feet", duration: "Instantaneous" }),
  name: "Ember Ward",
  ...over,
});

function built(over: Partial<CustomSpellDraft> = {}, seed?: CustomSpell): CustomSpell {
  const out = customSpellFromDraft(draft(over), "en", seed);
  if (!out.ok) throw new Error("refused");
  return out.spell;
}

describe("customSpellFromDraft", () => {
  it("starts as the classic form does: level 1 evocation, an action, V and S", () => {
    expect(customSpellDraft({ range: "60 feet", duration: "Instantaneous" })).toEqual({
      name: "",
      level: 1,
      school: "evocation",
      castingTime: "action",
      range: "60 feet",
      duration: "Instantaneous",
      v: true,
      s: true,
      m: false,
      material: "",
      concentration: false,
      ritual: false,
      description: "",
    });
  });

  it("makes the classic homebrew spell, prepared, with its own identity", () => {
    const spell = built({ level: 2, school: "abjuration", castingTime: "bonus" });
    expect(spell).toMatchObject({
      custom: true,
      name: "Ember Ward",
      level: 2,
      school: "abjuration",
      castingTime: "bonus",
      range: "60 feet",
      duration: "Instantaneous",
      components: { v: true, s: true, m: false },
      concentration: false,
      description: "",
      prepared: true,
    });
    expect(spell.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(spell.mechanics).toBeUndefined();
  });

  it("keeps the material only when the spell has an M component", () => {
    expect(built({ m: true, material: "a pinch of ash" }).components).toEqual({
      v: true,
      s: true,
      m: true,
      material: "a pinch of ash",
    });
    expect(built({ m: false, material: "a pinch of ash" }).components).toEqual({
      v: true,
      s: true,
      m: false,
    });
  });

  it("a ritual is the catalogue spell's ritual tag, so the engine reads it", () => {
    const spell = built({ ritual: true });
    expect(spell.mechanics).toEqual({ ritual: true });
    expect(homebrewSpellData(spell)?.ritual).toBe(true);
  });

  it("a cantrip is never a ritual (2024: cantrips have no Ritual tag)", () => {
    expect(built({ level: 0, ritual: true }).mechanics).toBeUndefined();
  });

  it("refuses a spell with no name", () => {
    expect(customSpellFromDraft(draft({ name: "  " }), "en")).toEqual({
      ok: false,
      errors: { name: "required" },
    });
  });

  it("an edit keeps what the form does not show, and the other language's name", () => {
    const seed: CustomSpell = {
      ...built(),
      name: { en: "Ember Ward", it: "Guardia di Brace" },
      mechanics: { ritual: true, range: { kind: "self" } } as CustomSpell["mechanics"],
      notes: "from the old campaign",
    };
    const edited = built({ name: "Ember Shield", ritual: false }, seed);
    expect(edited.name).toEqual({ en: "Ember Shield", it: "Guardia di Brace" });
    expect(edited.notes).toBe("from the old campaign");
    expect(edited.instanceId).toBe(seed.instanceId);
    expect(edited.mechanics).toEqual({ range: { kind: "self" } });
  });

  it("offers the same casting times as the classic edit form", () => {
    expect(CUSTOM_SPELL_CASTING_TIMES).toEqual([
      "action",
      "bonus",
      "reaction",
      "1 minute",
      "10 minutes",
      "1 hour",
      "8 hours",
      "24 hours",
    ]);
  });
});
