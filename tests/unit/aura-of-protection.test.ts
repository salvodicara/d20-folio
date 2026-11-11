/**
 * Aura of Protection for allies (SRD 5.2.1 Paladin, level 6): a creature in a
 * paladin's aura adds the paladin's Charisma modifier (minimum +1) to its saving
 * throws, while the paladin isn't Incapacitated. In several auras it gets one
 * bonus, its pick (the best). Being in range is the table's: the player says so.
 */
import { describe, expect, it } from "vitest";
import {
  auraOffers,
  auraSaveBonus,
  auraSaveSource,
  inAuraKey,
  type AuraSource,
} from "@/lib/play/aura-of-protection";

const paladin = (over: Partial<AuraSource> = {}): AuraSource => ({
  characterId: "pal",
  name: "Aldric",
  chaMod: 3,
  paladinLevel: 6,
  incapacitated: false,
  ...over,
});

describe("auraOffers", () => {
  it("offers each other paladin of level 6+ who can act, with the aura's reach", () => {
    const offers = auraOffers(
      [
        paladin(),
        paladin({ characterId: "low", paladinLevel: 5 }),
        paladin({ characterId: "out", incapacitated: true }),
        paladin({ characterId: "big", paladinLevel: 18 }),
        paladin({ characterId: "me" }),
      ],
      "me"
    );
    expect(offers.map((o) => [o.characterId, o.rangeFt, o.bonus])).toEqual([
      ["pal", 10, 3],
      ["big", 30, 3],
    ]);
  });

  it("a Charisma modifier under +1 still gives +1", () => {
    expect(auraOffers([paladin({ chaMod: -1 })], "me")[0]?.bonus).toBe(1);
  });
});

describe("auraSaveBonus", () => {
  const party = [paladin(), paladin({ characterId: "pal2", chaMod: 5 })];

  it("nothing until the player says they are in an aura", () => {
    expect(auraSaveBonus([], party, "me")).toBeNull();
  });

  it("in two auras: one bonus, the best", () => {
    expect(auraSaveBonus([inAuraKey("pal"), inAuraKey("pal2")], party, "me")).toEqual({
      from: "pal2",
      bonus: 5,
    });
  });

  it("the aura stops while its paladin is Incapacitated", () => {
    const down = [paladin({ incapacitated: true })];
    expect(auraSaveBonus([inAuraKey("pal")], down, "me")).toBeNull();
  });
});

describe("auraSaveSource", () => {
  it("adds the bonus to every save, named after the paladin's feature", () => {
    expect(auraSaveSource({ from: "pal", bonus: 3 })).toMatchObject({
      ref: { kind: "class-feature", key: "paladin-aura-of-protection" },
      grants: [{ type: "save-bonus", amount: 3 }],
    });
  });
});

describe("the sheet's saves read it", () => {
  it("adds the bonus flat to every save", async () => {
    const { evaluateGrants } = await import("@/lib/grants");
    expect(
      evaluateGrants([auraSaveSource({ from: "pal", bonus: 3 })]).saveBonusFlat
    ).toBe(3);
  });
});
