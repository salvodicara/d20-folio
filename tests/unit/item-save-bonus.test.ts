import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { MOCK_CHARACTER } from "@/lib/mock";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import type { CharacterDoc } from "@/types/character";

/**
 * A worn magic item's flat bonus to every saving throw (Cloak and Ring of
 * Protection +1) shows on the sheet's six saves. Cases come from the catalogue:
 * every public item declaring a top-level `save-bonus` grant.
 */
const saveItems = SRD_MAGIC_ITEMS.filter((item) => item.source === "SRD").flatMap(
  (item) =>
    (item.grants ?? []).flatMap((grant) =>
      grant.type === "save-bonus" && typeof grant.amount === "number"
        ? [{ id: item.id, amount: grant.amount, attunement: item.attunement }]
        : []
    )
);

function saves(doc: CharacterDoc) {
  return deriveSavesAndChecks(doc.character, doc.session).saves.map((row) => row.bonus);
}

describe("worn items' save bonus reaches the sheet", () => {
  it("finds the items in the catalogue", () => {
    expect(saveItems.map((item) => item.id)).toEqual(
      expect.arrayContaining(["cloak-of-protection", "ring-of-protection"])
    );
  });

  it.each(saveItems.map((item) => [item.id, item]))(
    "%s adds its bonus to every save",
    (_id, item) => {
      const base = structuredClone(MOCK_CHARACTER);
      const worn = structuredClone(MOCK_CHARACTER);
      worn.character.equipment = [
        ...worn.character.equipment,
        { srdId: item.id, equipped: true, attuned: item.attunement ? true : undefined },
      ];
      const before = saves(base);
      expect(saves(worn)).toEqual(before.map((bonus) => bonus + item.amount));
    }
  );
});
