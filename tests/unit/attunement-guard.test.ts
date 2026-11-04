/**
 * The attunement limit, from the SRD 5.2.1 rules text (Magic Items → Attunement):
 * "A creature can't be attuned to more than three magic items at a time. Any attempt
 * to attune to a fourth item fails; the creature must end its Attunement to an item
 * first. Additionally, a creature can't attune to more than one copy of an item."
 *
 * A feature can raise the limit (Thief, Use Magic Device: "You can attune to up to
 * four magic items at once"). The guard only answers; the player may still force it
 * (overrides always possible), and an existing attunement is never dropped.
 */
import { describe, expect, it } from "vitest";
import {
  ATTUNEMENT_LIMIT,
  attuneItem,
  attunementLimit,
  canAttune,
  unattuneItem,
} from "@/lib/attunement-guard";
import { requiresAttunement } from "@/lib/attunement";
import { applySheetEvent } from "@/lib/play/sheet-events";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const item = (srdId: string, instanceId: string, attuned?: boolean): SrdEquipmentRef => ({
  srdId,
  instanceId,
  quantity: 1,
  equipped: true,
  ...(attuned === undefined ? {} : { attuned }),
});

/** Three attuned items and a fourth, unattuned, that also needs attunement. */
function threeAttuned(extra: Partial<CharacterDoc["character"]> = {}): CharacterDoc {
  return makeCharacterDoc({
    equipment: [
      item("cloak-of-protection", "cloak", true),
      item("amulet-of-health", "amulet", true),
      item("ring-of-protection", "ring-1", true),
      item("gauntlets-of-ogre-power", "gauntlets", false),
      item("bag-of-holding", "bag"),
    ],
    ...extra,
  });
}

describe("the attunement limit (SRD 5.2.1: no more than three magic items)", () => {
  it("the fixtures are what the rule talks about", () => {
    const [cloak, amulet, ring, gauntlets, bag] = threeAttuned().character.equipment;
    for (const ref of [cloak, amulet, ring, gauntlets]) {
      expect(ref && requiresAttunement(ref)).toBe(true);
    }
    expect(bag && requiresAttunement(bag)).toBe(false);
  });

  it("is three by default", () => {
    expect(ATTUNEMENT_LIMIT).toBe(3);
    expect(attunementLimit(makeCharacterDoc())).toBe(3);
  });

  it("a third item can still be attuned", () => {
    const doc = makeCharacterDoc({
      equipment: [
        item("cloak-of-protection", "cloak", true),
        item("amulet-of-health", "amulet", true),
        item("gauntlets-of-ogre-power", "gauntlets"),
      ],
    });
    expect(canAttune(doc, "gauntlets")).toEqual({ ok: true });
  });

  it("an attempt to attune to a fourth item fails, naming the three attuned", () => {
    expect(canAttune(threeAttuned(), "gauntlets")).toEqual({
      ok: false,
      reason: "attunement-limit",
      limit: 3,
      attuned: ["cloak", "amulet", "ring-1"],
    });
  });

  it("ending an attunement first frees the slot", () => {
    const freed = unattuneItem(threeAttuned(), "amulet");
    expect(freed.ok).toBe(true);
    if (!freed.ok) return;
    const doc = threeAttuned({ equipment: freed.equipment });
    expect(canAttune(doc, "gauntlets")).toEqual({ ok: true });
  });

  it("Use Magic Device raises the limit to four", () => {
    const doc = threeAttuned({
      classes: [{ classId: "rogue", subclassId: "thief", level: 13 }],
      features: [{ srdId: "rogue-thief-use-magic-device" }],
    });
    expect(attunementLimit(doc)).toBe(4);
    expect(canAttune(doc, "gauntlets")).toEqual({ ok: true });
  });

  it("a creature can't attune to more than one copy of an item", () => {
    const doc = makeCharacterDoc({
      equipment: [
        item("ring-of-protection", "ring-1", true),
        item("ring-of-protection", "ring-2"),
      ],
    });
    expect(canAttune(doc, "ring-2")).toEqual({
      ok: false,
      reason: "duplicate-copy",
      attuned: ["ring-1"],
    });
  });

  it("an already attuned item, an item without attunement and a missing one", () => {
    const doc = threeAttuned();
    expect(canAttune(doc, "ring-1")).toEqual({ ok: true });
    expect(canAttune(doc, "bag")).toEqual({ ok: false, reason: "no-attunement" });
    expect(canAttune(doc, "nope")).toEqual({ ok: false, reason: "unknown-item" });
  });
});

describe("attuneItem — the transition the store applies", () => {
  it("attunes within the limit and touches nothing else", () => {
    const doc = makeCharacterDoc({
      equipment: [
        item("cloak-of-protection", "cloak", true),
        item("amulet-of-health", "amulet"),
      ],
    });
    const result = attuneItem(doc, "amulet");
    expect(result).toEqual({
      ok: true,
      forced: false,
      equipment: [
        item("cloak-of-protection", "cloak", true),
        item("amulet-of-health", "amulet", true),
      ],
      weapons: doc.character.weapons,
    });
    // Pure: the stored doc is unchanged.
    expect(doc.character.equipment[1]).toEqual(item("amulet-of-health", "amulet"));
  });

  it("a fourth is refused with the reason, and nothing changes", () => {
    const doc = threeAttuned();
    expect(attuneItem(doc, "gauntlets")).toEqual(canAttune(doc, "gauntlets"));
  });

  it("forced, the fourth is attuned and the three stay attuned", () => {
    const result = attuneItem(threeAttuned(), "gauntlets", { force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.forced).toBe(true);
    expect(result.equipment.filter((ref) => ref.attuned === true)).toHaveLength(4);
  });

  it("an item without attunement can't be forced into one", () => {
    expect(attuneItem(threeAttuned(), "bag", { force: true })).toEqual({
      ok: false,
      reason: "no-attunement",
    });
  });

  it("ending an unknown item's attunement is refused", () => {
    expect(unattuneItem(threeAttuned(), "nope")).toEqual({
      ok: false,
      reason: "unknown-item",
    });
  });
});

describe("attunement prerequisites (the item's «Requires Attunement by …»)", () => {
  const wand = (extra: Parameters<typeof makeCharacterDoc>[0] = {}) =>
    makeCharacterDoc({ ...extra, equipment: [item("wand-of-fireballs", "wand", false)] });

  it("a Wand of Fireballs needs a spellcaster: a Fighter 5 can't attune", () => {
    expect(canAttune(wand({ classId: "fighter", level: 5 }), "wand")).toEqual({
      ok: false,
      reason: "prerequisite",
      requires: { spellcaster: true },
    });
  });

  it("a Wizard 1 can; so can a Fighter who casts one spell (a cantrip from a feat)", () => {
    expect(canAttune(wand({ classId: "wizard", level: 1 }), "wand").ok).toBe(true);
    const initiate = wand({
      classId: "fighter",
      level: 5,
      spells: [{ srdId: "fire-bolt" }] as never,
    });
    expect(canAttune(initiate, "wand").ok).toBe(true);
  });

  it("the player can still force it", () => {
    const forced = attuneItem(wand({ classId: "fighter", level: 5 }), "wand", {
      force: true,
    });
    expect(forced.ok).toBe(true);
  });

  it("a Holy Avenger needs a Paladin; a multiclass with a Paladin level qualifies", () => {
    const avenger = (classes: CharacterDoc["character"]["classes"]) =>
      makeCharacterDoc({ classes, equipment: [item("holy-avenger", "sword", false)] });
    expect(canAttune(avenger([{ classId: "cleric", level: 5 }]), "sword")).toMatchObject({
      reason: "prerequisite",
      requires: { classes: ["paladin"] },
    });
    expect(
      canAttune(
        avenger([
          { classId: "cleric", level: 4 },
          { classId: "paladin", level: 1 },
        ]),
        "sword"
      ).ok
    ).toBe(true);
  });

  it("a Dwarven Thrower: a Dwarf, or anyone attuned to a Belt of Dwarvenkind", () => {
    const thrower = (race: string, belt?: boolean) =>
      makeCharacterDoc({
        race: race as never,
        equipment: [
          item("dwarven-thrower", "hammer", false),
          ...(belt === undefined ? [] : [item("belt-of-dwarvenkind", "belt", belt)]),
        ],
      });
    expect(canAttune(thrower("dwarf"), "hammer").ok).toBe(true);
    expect(canAttune(thrower("human"), "hammer").ok).toBe(false);
    expect(canAttune(thrower("human", false), "hammer").ok).toBe(false);
    expect(canAttune(thrower("human", true), "hammer").ok).toBe(true);
  });
});

describe("the attune sheet events", () => {
  const attunedIds = (doc: CharacterDoc | null) =>
    (doc?.character.equipment ?? []).flatMap((ref) =>
      "attuned" in ref && ref.attuned && ref.instanceId ? [ref.instanceId] : []
    );

  it("a fourth item is refused; forced, it attunes and the others stay", () => {
    const doc = threeAttuned();
    expect(
      applySheetEvent(doc, { kind: "attune-item", instanceId: "gauntlets" })
    ).toBeNull();
    const forced = applySheetEvent(doc, {
      kind: "attune-item",
      instanceId: "gauntlets",
      force: true,
    });
    expect(attunedIds(forced)).toEqual(["cloak", "amulet", "ring-1", "gauntlets"]);
  });

  it("ending an attunement frees the slot", () => {
    const freed = applySheetEvent(threeAttuned(), {
      kind: "unattune-item",
      instanceId: "ring-1",
    });
    expect(attunedIds(freed)).toEqual(["cloak", "amulet"]);
    expect(
      attunedIds(
        freed && applySheetEvent(freed, { kind: "attune-item", instanceId: "gauntlets" })
      )
    ).toEqual(["cloak", "amulet", "gauntlets"]);
  });
});
