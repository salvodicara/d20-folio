import { describe, expect, it } from "vitest";

import { magicItemChargeMax, resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { getMagicItem, SRD_MAGIC_ITEMS } from "@/data/magic-items";
import magicItemsEn from "@/i18n/en/srd/magic-items.json";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

function bearerOf(ref: SrdEquipmentRef, used = 0): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5, equipment: [ref] });
  if (used > 0) doc.session.trackers[ref.srdId] = { used };
  return doc;
}

describe("magic-item activated properties", () => {
  it("does not mis-model Boots of Speed's cumulative ten minutes as one use", () => {
    const doc = bearerOf({
      srdId: "boots-of-speed",
      equipped: true,
      attuned: true,
      quantity: 1,
    });
    const action = resolveActions(doc).find((row) =>
      row.id.startsWith("item-activate-boots-of-speed-")
    );
    expect(action).toMatchObject({ type: "bonus", activatesKey: "boots-of-speed" });
    expect(action?.costTracker).toBeUndefined();
    expect(resolveTrackers(doc).some((row) => row.id === "boots-of-speed")).toBe(false);
  });

  it("surfaces Winged Boots through one action and one shared charge tracker", () => {
    const doc = bearerOf(
      { srdId: "winged-boots", equipped: true, attuned: true, quantity: 1 },
      2
    );
    const action = resolveActions(doc).find(
      (row) => row.id === "item-activate-winged-boots-winged-boots"
    );
    expect(action).toMatchObject({
      type: "action",
      costTracker: "winged-boots",
      trackerCost: 1,
      activatesKey: "winged-boots",
      summary: { uses: { current: 2, total: 4, isPool: true } },
    });
    expect(resolveTrackers(doc).find((row) => row.id === "winged-boots")).toMatchObject({
      total: 4,
      used: 2,
      recovery: "dawn",
      autoRecover: false,
      isPool: true,
    });
    expect(magicItemChargeMax(getMagicItem("winged-boots")?.grants)).toBe(4);
  });

  it("keeps a variable real-time cooldown manual instead of inventing a clock roll", () => {
    const doc = bearerOf({
      srdId: "wings-of-flying",
      equipped: true,
      attuned: true,
      quantity: 1,
    });
    expect(
      resolveTrackers(doc).find((row) => row.id === "wings-of-flying")
    ).toMatchObject({ total: 1, recovery: "manual" });
  });

  it("uses the activated property's own label and rejects an unattuned item", () => {
    const equipped = bearerOf({
      srdId: "armor-of-invulnerability",
      equipped: true,
      attuned: true,
      quantity: 1,
    });
    const action = resolveActions(equipped).find((row) =>
      row.id.startsWith("item-activate-armor-of-invulnerability-")
    );
    expect(action?.name).toEqual({
      srd: {
        kind: "magic-item",
        key: "armor-of-invulnerability.grants.3",
        field: "label",
      },
    });

    const unattuned = bearerOf({
      srdId: "armor-of-invulnerability",
      equipped: true,
      attuned: false,
      quantity: 1,
    });
    expect(
      resolveActions(unattuned).some((row) =>
        row.id.startsWith("item-activate-armor-of-invulnerability-")
      )
    ).toBe(false);
  });
});

describe("magic-item tracker recovery", () => {
  it("never auto-fills a tracker whose dawn recovery amount is rolled", () => {
    const descriptions = magicItemsEn as Record<string, { description?: string }>;
    const missing = SRD_MAGIC_ITEMS.filter((item) =>
      /regains? .*d\d+.*charges/i.test(descriptions[item.id]?.description ?? "")
    )
      .filter((item) =>
        (item.grants ?? []).some(
          (grant) =>
            (grant.type === "free-cast-spell" || grant.type === "free-cast-from-list") &&
            (grant.chargesPerRest ?? 0) > 0 &&
            grant.autoRecover !== false
        )
      )
      .map((item) => item.id);
    expect(missing).toEqual([]);
  });
});
