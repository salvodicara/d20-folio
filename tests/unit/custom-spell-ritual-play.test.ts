/**
 * A homebrew spell marked Ritual (`mechanics.ritual`, the catalogue's tag, #1230):
 * the Spells card says so and offers the Ritual cast by the 2024 rule (prepared, or
 * any Wizard's book spell), as for a catalogue ritual.
 */
import { describe, expect, it } from "vitest";

import { customSpellDraft, customSpellFromDraft } from "@/domains/spells/custom-spell";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import type { CustomSpell } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function spell(ritual: boolean, prepared = true): CustomSpell {
  const out = customSpellFromDraft(
    {
      ...customSpellDraft({ range: "Self", duration: "10 minutes" }),
      name: ritual ? "Ember Rite" : "Ember Word",
      ritual,
    },
    "en"
  );
  if (!out.ok) throw new Error("refused");
  return { ...out.spell, prepared };
}

const cleric = (spells: CustomSpell[]) =>
  makeCharacterDoc({
    classId: "cleric",
    level: 3,
    spells,
    spellSlots: [{ level: 1, total: 4 }],
    spellcasting: {
      ability: "WIS",
      preparedCaster: true,
      preparedMax: 6,
      saveDCOverride: null,
      attackBonusOverride: null,
    },
  });

const card = (spells: CustomSpell[]) =>
  buildSpellsViewModel(cleric(spells), "cleric", "en", false)
    .levels.flatMap((g) => g.spells)
    .find((c) => c.kind === "custom");

describe("a homebrew Ritual spell", () => {
  it("says it is a ritual and offers the Ritual cast when prepared", () => {
    expect(card([spell(true)])).toMatchObject({ ritual: true, canRitual: true });
    expect(card([spell(false)])).toMatchObject({ ritual: false, canRitual: false });
  });

  it("an unprepared one is no Ritual cast for a Cleric", () => {
    expect(card([spell(true, false)])).toMatchObject({ ritual: true, canRitual: false });
  });

  it("keeps the homebrew card's own words", () => {
    expect(card([spell(true)])).toMatchObject({ name: "Ember Rite", kind: "custom" });
  });
});
