/**
 * The Play screen's «Inventario» tab (approved prototype x-play-inv): the weight carried
 * against the most, the coins, then three groups — what is equipped (weapons, worn
 * armor), what the character is attuned to, and the pack — each item with the one line
 * that matters at the table, and «Usa» when the item has a use on the actions list.
 */
import { describe, expect, it } from "vitest";
import { playInventoryView } from "@/domains/play/play-inventory-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

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

  it("names each catalogue item's painted icon; a homebrew item has none", () => {
    const art = new Map(view.groups.flatMap((g) => g.items).map((i) => [i.name, i.art]));
    expect(art.get("Stocco")).toEqual({ kind: "equipment", id: "rapier" });
    expect(art.get("Piede di Porco")).toEqual({ kind: "equipment", id: "crowbar" });
    expect(art.get("Pozione di Guarigione")).toEqual({
      kind: "item",
      id: "potion-of-healing",
    });
    expect(art.get("Fermaglio dello Scudo")).toEqual({
      kind: "item",
      id: "brooch-of-shielding",
    });
    expect(art.get("Cael's Antidote Vial")).toBeNull();
  });

  it("has no attuned group while nothing is attuned", () => {
    expect(view.groups.map((g) => g.kind)).not.toContain("attuned");
  });
});

describe("a Spell Scroll in the pack", () => {
  const withScroll = (scrollSpell?: string) =>
    playInventoryView(
      {
        ...MOCK_CHARACTER,
        character: {
          ...MOCK_CHARACTER.character,
          equipment: [
            ...MOCK_CHARACTER.character.equipment,
            {
              srdId: "spell-scroll",
              quantity: 1,
              ...(scrollSpell ? { scrollSpell } : {}),
            },
          ],
        },
      },
      "it"
    )
      .groups.flatMap((g) => g.items)
      .find((i) => i.scroll);

  it("asks which spell is on it until it is set", () => {
    expect(withScroll()?.scroll).toEqual({
      index: MOCK_CHARACTER.character.equipment.length,
      spellId: null,
      spellName: null,
    });
    expect(withScroll()?.useActionId).toBeNull();
  });

  it("names its spell, and reads it from the actions list when the spell is on a class list", () => {
    expect(withScroll("healing-word")).toMatchObject({
      scroll: { spellId: "healing-word", spellName: "Parola Guaritrice" },
      useActionId: "item-scroll-healing-word",
    });
  });

  it("a spell off every class list is named, but has no reading", () => {
    expect(withScroll("fireball")).toMatchObject({
      scroll: { spellId: "fireball" },
      useActionId: null,
    });
  });
});

describe("gear in a form that merges it (Wild Shape)", () => {
  const inForm = (wornGear?: string[]) =>
    playInventoryView(
      {
        ...MOCK_CHARACTER,
        session: {
          ...MOCK_CHARACTER.session,
          activeForm: {
            sourceId: "druid-wild-shape",
            beastId: "wolf",
            tempHpBefore: 0,
            ...(wornGear ? { wornGear } : {}),
          },
        },
      },
      "it"
    );

  it("says the gear merged, and each equipped item can be ruled worn", () => {
    const view = inForm();
    expect(view.formMerges).toBe(true);
    const equipped = view.groups.find((g) => g.kind === "equipped")?.items ?? [];
    expect(equipped[0]?.formGear?.worn).toBe(false);
    expect(equipped[0]?.formGear?.key).toMatch(/\S/);
  });

  it("an item the table ruled worn reads worn", () => {
    const key =
      inForm().groups.find((g) => g.kind === "equipped")?.items[0]?.formGear?.key ?? "";
    const view = inForm([key]);
    expect(view.groups.find((g) => g.kind === "equipped")?.items[0]?.formGear?.worn).toBe(
      true
    );
  });

  it("the pack has nothing to rule; out of the form, nothing either", () => {
    expect(
      inForm()
        .groups.find((g) => g.kind === "pack")
        ?.items.every((i) => !i.formGear)
    ).toBe(true);
    expect(playInventoryView(MOCK_CHARACTER, "it").formMerges).toBe(false);
  });
});

describe("attunement on the Play inventory", () => {
  const ref = (srdId: string, instanceId: string, attuned = false) => ({
    srdId,
    instanceId,
    quantity: 1,
    equipped: true,
    attuned,
  });
  const fighter = (equipment: ReturnType<typeof ref>[]) =>
    makeCharacterDoc({ classId: "fighter", level: 5, race: "human" as never, equipment });
  const attuneOf = (doc: CharacterDoc, name: string) =>
    playInventoryView(doc, "it")
      .groups.flatMap((g) => g.items)
      .find((i) => i.name === name)?.attune;

  it("an item that takes attunement can be attuned; an attuned one can end it", () => {
    const doc = fighter([
      ref("cloak-of-protection", "cloak", true),
      ref("ring-of-protection", "ring"),
    ]);
    expect(attuneOf(doc, "Mantello della Protezione")).toEqual({
      key: "cloak",
      attuned: true,
    });
    expect(attuneOf(doc, "Anello di Protezione")).toEqual({
      key: "ring",
      attuned: false,
    });
  });

  it("a fourth item names the three standing in the way", () => {
    const doc = fighter([
      ref("cloak-of-protection", "cloak", true),
      ref("amulet-of-health", "amulet", true),
      ref("ring-of-protection", "ring", true),
      ref("gauntlets-of-ogre-power", "gauntlets"),
    ]);
    expect(attuneOf(doc, "Guanti del Potere Orchesco")?.refusal).toEqual({
      reason: "limit",
      limit: 3,
      names: [
        "Mantello della Protezione",
        "Amuleto della Salute",
        "Anello di Protezione",
      ],
    });
  });

  it("an item for some classes names them", () => {
    const doc = fighter([ref("staff-of-power", "staff")]);
    expect(attuneOf(doc, "Bastone del Potere")?.refusal).toEqual({
      reason: "prerequisite",
      spellcaster: false,
      names: ["Stregone", "Warlock", "Mago"],
    });
  });

  it("an item for spellcasters says so", () => {
    const doc = fighter([ref("pearl-of-power", "pearl")]);
    expect(attuneOf(doc, "Perla del Potere")?.refusal).toEqual({
      reason: "prerequisite",
      spellcaster: true,
      names: [],
    });
  });

  it("a weapon whose enchant takes attunement is keyed by its place, and counts", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      race: "human" as never,
      equipment: [
        ref("cloak-of-protection", "cloak", true),
        ref("amulet-of-health", "amulet", true),
        ref("ring-of-protection", "ring", true),
      ],
      weapons: [
        {
          srdId: "longsword",
          quantity: 1,
          enchantItemId: "flame-tongue",
          attuned: false,
        },
      ],
    });
    const sword = playInventoryView(doc, "it")
      .groups.flatMap((g) => g.items)
      .find((i) => i.attune?.key === "weapon:0");
    expect(sword?.needsAttunement).toBe(true);
    expect(sword?.attune?.refusal).toMatchObject({ reason: "limit", limit: 3 });
  });

  it("items that take no attunement offer nothing", () => {
    const pack = view.groups.flatMap((g) => g.items);
    expect(pack.find((i) => i.name === "Pozione di Guarigione")?.attune).toBeUndefined();
  });
});
