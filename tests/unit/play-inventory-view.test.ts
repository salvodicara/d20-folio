/**
 * The Play screen's «Inventario» tab (approved prototype x-play-inv): the weight carried
 * against the most, the coins, then three groups — what is equipped (weapons, worn
 * armor), what the character is attuned to, and the pack — each item with the one line
 * that matters at the table, and «Usa» when the item has a use on the actions list.
 */
import { describe, expect, it } from "vitest";
import { playInventoryView } from "@/domains/play/play-inventory-view";
import { MOCK_CHARACTER } from "@/lib/mock";

const view = playInventoryView(MOCK_CHARACTER, "it");

describe("playInventoryView", () => {
  it("weighs what is carried against the most the character can carry", () => {
    expect(view.weight).toEqual({ carried: 71.5, capacity: 120, over: false });
  });

  it("shows the coins as stored", () => {
    expect(view.coins).toEqual({ pp: 0, gp: 340, ep: 5, sp: 22, cp: 8 });
  });

  it("equips the weapons, each with its damage", () => {
    const equipped = view.groups.find((g) => g.kind === "equipped");
    expect(equipped?.items.map((i) => i.name)).toEqual([
      "Stocco",
      "Pugnale",
      "Arco Corto",
      "Bastone Ferrato",
    ]);
    expect(equipped?.items[0]?.line).toEqual({
      kind: "damage",
      dice: "1d8+3",
      type: "piercing",
    });
  });

  it("packs the rest, counting how many", () => {
    const pack = view.groups.find((g) => g.kind === "pack");
    expect(pack?.items.find((i) => i.name === "Pozione di Guarigione")).toMatchObject({
      quantity: 3,
      line: { kind: "heal", dice: "2d4+2" },
    });
  });

  it("offers «Usa» for an item with a use on the actions list", () => {
    const potion = view.groups
      .flatMap((g) => g.items)
      .find((i) => i.name === "Pozione di Guarigione");
    expect(potion?.useActionId).toBeTruthy();
  });

  it("has no attuned group while nothing is attuned", () => {
    expect(view.groups.map((g) => g.kind)).not.toContain("attuned");
  });
});
