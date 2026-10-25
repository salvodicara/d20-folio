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
