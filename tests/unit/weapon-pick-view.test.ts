/**
 * «Su quale arma?» (approved prototype cast-weapon): the weapons a binding spell may
 * name, each named for the table, in hand or in the pack, with what the spell does to
 * it (Magic Weapon's +1; Shillelagh's ability and die), from `bindingWeaponChoices`.
 */
import { describe, expect, it } from "vitest";
import { weaponPickView } from "@/domains/play/weapon-pick-view";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("weaponPickView", () => {
  it("Magic Weapon may name any weapon carried, +1 at its level", () => {
    const view = weaponPickView(MOCK_CHARACTER, "magic-weapon", 2, "it");
    expect(view.map((c) => c.name)).toEqual([
      "Stocco",
      "Pugnale",
      "Arco Corto",
      "Bastone Ferrato",
    ]);
    expect(view[0]?.preview.bonus).toBe(1);
  });

  it("Shillelagh may name only a club or a quarterstaff", () => {
    expect(
      weaponPickView(MOCK_CHARACTER, "shillelagh", 0, "it").map((c) => c.name)
    ).toEqual(["Bastone Ferrato"]);
  });

  it("a spell that binds nothing has nothing to pick", () => {
    expect(weaponPickView(MOCK_CHARACTER, "fireball", 3, "it")).toEqual([]);
  });

  it("each choice carries a stable key", () => {
    const keys = weaponPickView(MOCK_CHARACTER, "magic-weapon", 2, "it").map(
      (c) => c.key
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
