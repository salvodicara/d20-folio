/**
 * Ring of X-ray Vision's strain. The catalogue text (SRD 5.2.1): "Whenever you use
 * the ring again before taking a Long Rest, you must succeed on a DC 15 Constitution
 * saving throw or gain 1 Exhaustion level." The engine counts the uses since the
 * last Long Rest, says when a use costs the save, and books the failure.
 */
import { describe, expect, it } from "vitest";

import magicItemsEn from "@/i18n/en/srd/magic-items.json";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { activationUses, reuseSaveDue, resolveReuseSave } from "@/lib/play/reuse-save";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const KEY = "ring-of-x-ray-vision";
const text =
  (magicItemsEn as Record<string, { description?: string }>)[KEY]?.description ?? "";
const dc = Number(/DC (\d+) Constitution saving throw/.exec(text)?.[1]);
const levels = Number(/gain (\d+) Exhaustion level/.exec(text)?.[1]);

function wearer(): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [{ srdId: KEY, equipped: true, attuned: true, quantity: 1 }],
  });
}

function apply(doc: CharacterDoc, ...events: Parameters<typeof applySheetEvent>[1][]) {
  return events.reduce((d, event) => applySheetEvent(d, event) ?? d, doc);
}
const light = {
  kind: "set-active-state",
  key: KEY,
  isActive: true,
  litRound: 0,
} as const;
const douse = {
  kind: "set-active-state",
  key: KEY,
  isActive: false,
  litRound: 0,
} as const;

describe("Ring of X-ray Vision: a reuse before a Long Rest costs a DC 15 CON save", () => {
  it("the catalogue text names the save and its cost", () => {
    expect(text).toMatch(/use the ring again before taking a Long Rest/);
    expect(dc).toBe(15);
    expect(levels).toBe(1);
  });

  it("the first use is free; each later one is due the save", () => {
    const fresh = wearer();
    expect(activationUses(fresh, KEY)).toBe(0);
    expect(reuseSaveDue(fresh, KEY)).toBeNull();

    const once = apply(fresh, light);
    expect(activationUses(once, KEY)).toBe(1);
    expect(reuseSaveDue(once, KEY)).toBeNull();

    const twice = apply(once, douse, light);
    expect(activationUses(twice, KEY)).toBe(2);
    expect(reuseSaveDue(twice, KEY)).toEqual({ ability: "CON", dc, exhaustion: levels });
  });

  it("ending the vision is not a use", () => {
    expect(activationUses(apply(wearer(), light, douse), KEY)).toBe(1);
  });

  it("a Short Rest keeps the count; a Long Rest resets it", () => {
    const used = apply(wearer(), light, douse, light, douse);
    expect(activationUses(apply(used, { kind: "short-rest" }), KEY)).toBe(2);
    const rested = apply(used, { kind: "long-rest" });
    expect(activationUses(rested, KEY)).toBe(0);
    expect(reuseSaveDue(apply(rested, light), KEY)).toBeNull();
  });

  it("a failed save gains 1 Exhaustion level; a passed one changes nothing", () => {
    const twice = apply(wearer(), light, douse, light);
    const save = reuseSaveDue(twice, KEY);
    if (!save) throw new Error("no save due");
    expect(resolveReuseSave(twice, save, true)).toBeNull();
    expect(resolveReuseSave(twice, save, false)?.exhaustion).toBe(1);
    const tired = { ...twice, session: { ...twice.session, exhaustion: 2 } };
    expect(resolveReuseSave(tired, save, false)?.exhaustion).toBe(3);
  });

  it("an item without the clause never counts or asks", () => {
    const doc = apply(wearer(), {
      kind: "set-active-state",
      key: "rage",
      isActive: true,
      litRound: 0,
    });
    expect(activationUses(doc, "rage")).toBe(0);
    expect(reuseSaveDue(doc, "rage")).toBeNull();
  });
});
