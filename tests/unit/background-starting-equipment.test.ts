/**
 * NEW PRIMITIVE — `SrdBackgroundData.startingEquipment` (creation-consumed gear
 * + gold package, the 2024 "Equipment: Choose A or B" structure).
 *
 * Every 2024 background gives a gear-heavy Option A (items + leftover gold) and
 * an all-gold Option B (50 GP). This is CREATION-CONSUMED data — a one-time
 * snapshot the creation wizard writes onto the new character, NOT a `Grant`
 * re-aggregated every render. Two layers are defended here:
 *
 *   (1) AGGREGATION — the declarative data is present, well-formed, and a
 *       faithful mirror of the scrape: every background that the source prints
 *       an Equipment block for carries both options, B is always 50 GP, A's
 *       gold/items match the printed package, and every SRD-id item line
 *       resolves to a real SRD row.
 *   (2) CONSUMER + OVERRIDE-FIRST — `resolveStartingEquipment` /
 *       `getBackgroundStartingEquipment` turn a chosen option into character
 *       weapons / equipment / gold, prefer a valid player pick, fall back to
 *       Option A by default, never throw, and never silently drop an item.
 */
import { describe, expect, it } from "vitest";
import {
  getBackground,
  getBackgroundEquipmentOptions,
  getBackgroundStartingEquipment,
  SRD_BACKGROUNDS,
} from "@/data/backgrounds";
import {
  resolveStartingEquipment,
  STARTING_EQUIPMENT_BY_BG,
} from "@/data/background-equipment";
import { getEquipment } from "@/data/equipment";
import { isCustomEquipment } from "@/types/character";

describe("Background.startingEquipment — data integrity (aggregation)", () => {
  it("Acolyte declares the verified A (gear + 8 GP) and B (50 GP) packages", () => {
    // Scrape: "(A) Calligrapher's Supplies, Book (prayers), Holy Symbol,
    //          Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP".
    const bg = getBackground("acolyte");
    expect(bg?.startingEquipment).toBeDefined();
    expect(bg?.startingEquipment).toHaveLength(2);
    const [a, b] = bg?.startingEquipment ?? [];
    expect(a?.label).toBe("A");
    expect(a?.gold).toBe(8);
    expect(a?.items).toHaveLength(5);
    expect(b).toEqual({ label: "B", items: [], gold: 50 });
  });

  it("Criminal A keeps the printed quantities (2 Daggers, 2 Pouches, 16 GP)", () => {
    // Scrape: "(A) 2 Daggers, Thieves' Tools, Crowbar, 2 Pouches,
    //          Traveler's Clothes, 16 GP".
    const a = getBackground("criminal")?.startingEquipment?.[0];
    expect(a?.gold).toBe(16);
    const dagger = a?.items.find((i) => i.srdId === "dagger");
    expect(dagger?.quantity).toBe(2);
    // Pouch is a real catalogue id now (localizes), carried as quantity 2.
    const pouches = a?.items.filter((i) => i.srdId === "pouch") ?? [];
    expect(pouches).toHaveLength(1);
    expect(pouches[0]?.quantity).toBe(2);
  });

  it("every background with an Equipment block offers exactly two options, B = 50 GP", () => {
    for (const bg of SRD_BACKGROUNDS) {
      if (!bg.startingEquipment) continue;
      expect(bg.startingEquipment, bg.id).toHaveLength(2);
      const optionB = bg.startingEquipment[1];
      expect(optionB?.label, bg.id).toBe("B");
      expect(optionB?.items, bg.id).toHaveLength(0);
      expect(optionB?.gold, bg.id).toBe(50);
    }
  });

  it("Option A always carries at least one item and non-negative gold", () => {
    for (const bg of SRD_BACKGROUNDS) {
      const a = bg.startingEquipment?.[0];
      if (!a) continue;
      expect(a.label, bg.id).toBe("A");
      expect(a.items.length, bg.id).toBeGreaterThan(0);
      expect(a.gold, bg.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("every srd-id item line resolves to a real SRD equipment row", () => {
    for (const bg of SRD_BACKGROUNDS) {
      for (const opt of bg.startingEquipment ?? []) {
        for (const item of opt.items) {
          if (item.srdId !== undefined) {
            expect(getEquipment(item.srdId), `${bg.id} → ${item.srdId}`).toBeDefined();
          }
        }
      }
    }
  });

  it("every item line is EXACTLY one of: srd-id or a fromToolChoice marker (no name-only form)", () => {
    for (const bg of SRD_BACKGROUNDS) {
      for (const opt of bg.startingEquipment ?? []) {
        for (const item of opt.items) {
          const hasSrd = item.srdId !== undefined;
          const isToolChoice = item.fromToolChoice === true;
          // Exactly one of the two variants is set — the name-only / inline-BiText
          // form no longer exists (the escape hatch is deleted at the type level).
          expect([hasSrd, isToolChoice].filter(Boolean).length, bg.id).toBe(1);
        }
      }
    }
  });

  it("a 'Choose one kind of <X>' background lists its chosen tool as a fromToolChoice pack member (never a baked umbrella)", () => {
    // Soldier Option A: "Gaming Set (same as above)" — the chosen set, modeled
    // as the structural `fromToolChoice` marker, NOT a name-only "Gaming Set"
    // custom string nor a hardcoded tool id.
    const a = getBackground("soldier")?.startingEquipment?.[0];
    const markers = (a?.items ?? []).filter((i) => i.fromToolChoice === true);
    expect(markers).toHaveLength(1);
    // No baked umbrella id lingers in the package (the name-only form is gone).
    expect(a?.items.some((i) => i.srdId === "gaming-set")).toBe(false);
  });

  it("EVERY background is wired with a starting-equipment package", () => {
    // The scrape prints an Equipment line for every 2024 background — including
    // the exotic Pact Seeker, which labels it "Equipment :" (with a space
    // before the colon): (A) Book, Calligrapher's Supplies, Ink, Ink Pen,
    // Parchment (10 sheets), Traveler's Clothes, 2 GP; or (B) 50 GP.
    const withoutEquip = SRD_BACKGROUNDS.filter((bg) => !bg.startingEquipment).map(
      (bg) => bg.id
    );
    expect(withoutEquip).toEqual([]);
  });

  it("the keyed catalog only references real background ids", () => {
    const ids = new Set(SRD_BACKGROUNDS.map((bg) => bg.id));
    for (const key of Object.keys(STARTING_EQUIPMENT_BY_BG)) {
      expect(ids.has(key), key).toBe(true);
    }
  });
});

describe("resolveStartingEquipment — consumer routes items + gold correctly", () => {
  it("Acolyte A → 5 equipment rows, EVERY item a localized SRD ref (no custom), gold = 8, no weapons", () => {
    const bg = getBackground("acolyte");
    const out = resolveStartingEquipment(bg?.startingEquipment, "A");
    expect(out.gold).toBe(8);
    expect(out.weapons).toHaveLength(0);
    expect(out.equipment).toHaveLength(5);
    // Calligrapher's Supplies, Book, Holy Symbol, Parchment, Robe — ALL real
    // catalogue rows now → SRD refs (so they LOCALIZE), never EN-baked custom
    // strings. The former name-only items (Book, Parchment) are modeled ids.
    for (const srdId of [
      "calligraphers-supplies",
      "book",
      "holy-symbol",
      "parchment",
      "robe",
    ]) {
      expect(
        out.equipment.some((e) => !isCustomEquipment(e) && e.srdId === srdId),
        srdId
      ).toBe(true);
    }
    // NOTHING resolves to a custom row — there is no name-only form left.
    expect(out.equipment.every((e) => !isCustomEquipment(e))).toBe(true);
    // Parchment (10 sheets) is QUANTITY 10 of the `parchment` row (no baked string).
    const parchment = out.equipment.find(
      (e) => !isCustomEquipment(e) && e.srdId === "parchment"
    );
    expect(
      parchment && !isCustomEquipment(parchment) ? parchment.quantity : undefined
    ).toBe(10);
  });

  it("Soldier A → the chosen gaming set resolves as a localized SRD tool item (never the umbrella)", () => {
    const bg = getBackground("soldier");
    // The player picked the Dice Set for the background's tool-proficiency choice.
    const ctx = { options: ["dice-set"], pickedIds: ["dice-set"] };
    const out = resolveStartingEquipment(bg?.startingEquipment, "A", ctx);
    // Dice Set is a real catalogue tool → an SRD equipment ref (localizes), NOT a
    // custom "Gaming Set" / "dice-set" string.
    const tool = out.equipment.find(
      (e) => !isCustomEquipment(e) && e.srdId === "dice-set"
    );
    expect(tool).toBeDefined();
    expect(
      out.equipment.some(
        (e) => isCustomEquipment(e) && /gaming set|dice set/i.test(e.name)
      )
    ).toBe(false);
  });

  it("Criminal A → weapon goes to weapons[], tools/clothes to equipment[], gold = 16", () => {
    const bg = getBackground("criminal");
    const out = resolveStartingEquipment(bg?.startingEquipment, "A");
    expect(out.gold).toBe(16);
    // 2 Daggers → a single weapon ref with quantity 2 (weapon category).
    expect(out.weapons).toEqual([{ srdId: "dagger", quantity: 2 }]);
    // Thieves' Tools (tool) + Crowbar (gear) + Traveler's Clothes (gear) → SRD
    // equipment refs; 2 Pouches → a localized SRD ref (`pouch`) with quantity 2.
    const thieves = out.equipment.find(
      (e) => !isCustomEquipment(e) && e.srdId === "thieves-tools"
    );
    expect(thieves).toBeDefined();
    const pouch = out.equipment.find((e) => !isCustomEquipment(e) && e.srdId === "pouch");
    expect(pouch && !isCustomEquipment(pouch) ? pouch.quantity : undefined).toBe(2);
    // No custom rows anywhere — every item localizes.
    expect(out.equipment.every((e) => !isCustomEquipment(e))).toBe(true);
  });

  it("a single-quantity SRD item omits the quantity field (clean snapshot)", () => {
    const bg = getBackground("acolyte");
    const out = resolveStartingEquipment(bg?.startingEquipment, "A");
    // Acolyte A: Robe is a single-quantity gear row — the snapshot carries no
    // quantity field for it (only multi-quantity lines do, e.g. Parchment ×10).
    expect(out.gold).toBe(8);
    const robe = out.equipment.find((e) => !isCustomEquipment(e) && e.srdId === "robe");
    expect(robe && !isCustomEquipment(robe) ? "quantity" in robe : true).toBe(false);
  });

  it("Option B → no items, no weapons, 50 GP (the all-gold choice)", () => {
    const bg = getBackground("acolyte");
    const out = resolveStartingEquipment(bg?.startingEquipment, "B");
    expect(out).toEqual({ weapons: [], equipment: [], gold: 50 });
  });
});

describe("resolveStartingEquipment — override-first + safety", () => {
  it("falls back to Option A (the suggested default) when no option is supplied", () => {
    const bg = getBackground("acolyte");
    const noPick = resolveStartingEquipment(bg?.startingEquipment);
    const optionA = resolveStartingEquipment(bg?.startingEquipment, "A");
    expect(noPick).toEqual(optionA);
    // Blank / whitespace picks also fall back to Option A.
    expect(resolveStartingEquipment(bg?.startingEquipment, "")).toEqual(optionA);
    expect(resolveStartingEquipment(bg?.startingEquipment, "   ")).toEqual(optionA);
  });

  it("an unknown option label falls back to Option A (never an empty drop)", () => {
    const bg = getBackground("acolyte");
    const optionA = resolveStartingEquipment(bg?.startingEquipment, "A");
    expect(resolveStartingEquipment(bg?.startingEquipment, "Z")).toEqual(optionA);
  });

  it("returns an empty payload (never throws) when there is no options data", () => {
    // Every 2024 background DOES have a package, but the resolver must still
    // degrade safely for `undefined` / `[]` inputs (an unknown background).
    expect(resolveStartingEquipment(undefined)).toEqual({
      weapons: [],
      equipment: [],
      gold: 0,
    });
    expect(resolveStartingEquipment([])).toEqual({
      weapons: [],
      equipment: [],
      gold: 0,
    });
    // And a wrong label on an empty list still yields the empty payload.
    expect(resolveStartingEquipment([], "A")).toEqual({
      weapons: [],
      equipment: [],
      gold: 0,
    });
  });

  it("returns fresh arrays — mutating the result never corrupts the SRD data", () => {
    const bg = getBackground("acolyte");
    const out = resolveStartingEquipment(bg?.startingEquipment, "A");
    out.weapons.push({ srdId: "tampered", quantity: 99 });
    out.equipment.length = 0;
    // Re-resolving yields the pristine package again.
    const again = resolveStartingEquipment(bg?.startingEquipment, "A");
    expect(again.weapons).toHaveLength(0);
    expect(again.equipment).toHaveLength(5);
  });
});

describe("getBackgroundStartingEquipment / getBackgroundEquipmentOptions — name-resolving seams", () => {
  it("resolves the background by id, EN name, and IT name (like findBackground)", () => {
    const byId = getBackgroundStartingEquipment("acolyte", "A");
    const byEn = getBackgroundStartingEquipment("Acolyte", "A");
    const byIt = getBackgroundStartingEquipment("Accolito", "A");
    expect(byEn).toEqual(byId);
    expect(byIt).toEqual(byId);
    expect(byId.gold).toBe(8);
  });

  it("getBackgroundEquipmentOptions returns the declared options in order", () => {
    const opts = getBackgroundEquipmentOptions("acolyte");
    expect(opts.map((o) => o.label)).toEqual(["A", "B"]);
  });

  it("returns an empty payload / list for an unknown background", () => {
    expect(getBackgroundStartingEquipment("not-a-real-background")).toEqual({
      weapons: [],
      equipment: [],
      gold: 0,
    });
    expect(getBackgroundEquipmentOptions("not-a-real-background")).toEqual([]);
  });

  it("end-to-end — picking B by id yields the all-gold package via the public seam", () => {
    const out = getBackgroundStartingEquipment("soldier", "B");
    expect(out).toEqual({ weapons: [], equipment: [], gold: 50 });
  });
});
