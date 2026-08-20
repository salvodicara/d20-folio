import { describe, expect, it } from "vitest";

import { magicItemChargeMax, resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { getMagicItem, SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { evaluateGrants } from "@/lib/grants";
import { resolveGrantSourcesForEquipment } from "@/lib/resolve-grant-sources";
import magicItemsEn from "@/i18n/en/srd/magic-items.json";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

function bearerOf(ref: SrdEquipmentRef): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5, equipment: [ref] });
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

  it("binds Winged Boots activation to its physical copy's charge resource", () => {
    const instanceId = "winged-boots-copy";
    const doc = bearerOf({
      srdId: "winged-boots",
      instanceId,
      equipped: true,
      attuned: true,
      quantity: 1,
    });
    doc.session.itemResources = {
      [instanceId]: {
        itemId: "winged-boots",
        instanceId,
        revision: 0,
        resources: {
          charges: { capacity: 4, current: 2, disabled: false },
        },
        disposition: "magical",
        causalHead: null,
      },
    };
    const action = resolveActions(doc).find(
      (row) => row.resourcePayment?.instanceId === instanceId
    );
    expect(action).toMatchObject({
      type: "action",
      resourcePayment: {
        kind: "item-resource",
        itemId: "winged-boots",
        instanceId,
        resourceId: "charges",
        key: `item:${instanceId}:charges`,
      },
      resourceCost: 1,
      activatesKey: `magic-item:${instanceId}:winged-boots`,
      summary: { uses: { current: 2, total: 4, isPool: true } },
    });
    expect(action?.costTracker).toBeUndefined();
    expect(resolveTrackers(doc).some((row) => row.id === "winged-boots")).toBe(false);
    expect(magicItemChargeMax(getMagicItem("winged-boots")?.grants)).toBe(0);
  });

  it("emits independent actions and active keys for two Winged Boots copies", () => {
    const refs: SrdEquipmentRef[] = ["boots-copy-a", "boots-copy-b"].map(
      (instanceId) => ({
        srdId: "winged-boots",
        instanceId,
        equipped: true,
        attuned: true,
      })
    );
    const doc = makeCharacterDoc({ classId: "fighter", level: 5, equipment: refs });
    const actions = resolveActions(doc).filter(
      (action) => action.resourcePayment?.itemId === "winged-boots"
    );

    expect(actions.map((action) => action.activatesKey)).toEqual([
      "magic-item:boots-copy-a:winged-boots",
      "magic-item:boots-copy-b:winged-boots",
    ]);
    expect(actions.map((action) => action.resourcePayment?.key)).toEqual([
      "item:boots-copy-a:charges",
      "item:boots-copy-b:charges",
    ]);

    const groups = evaluateGrants(
      resolveGrantSourcesForEquipment(refs)
    ).activatableGroups;
    expect(groups.map(({ key, authoredKey }) => ({ key, authoredKey }))).toEqual([
      {
        key: "magic-item:boots-copy-a:winged-boots",
        authoredKey: "winged-boots",
      },
      {
        key: "magic-item:boots-copy-b:winged-boots",
        authoredKey: "winged-boots",
      },
    ]);
  });

  it("does not surface activation for a destroyed Winged Boots copy", () => {
    const instanceId = "destroyed-boots";
    const doc = bearerOf({
      srdId: "winged-boots",
      instanceId,
      equipped: true,
      attuned: true,
    });
    doc.session.itemResources = {
      [instanceId]: {
        itemId: "winged-boots",
        instanceId,
        revision: 1,
        resources: {
          charges: { capacity: 4, current: 0, disabled: false },
        },
        disposition: "destroyed",
        causalHead: "empty-roll",
      },
    };

    expect(
      resolveActions(doc).some(
        (action) => action.resourcePayment?.instanceId === instanceId
      )
    ).toBe(false);
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
      instanceId: "invulnerability-armor-copy",
      equipped: true,
      attuned: true,
      quantity: 1,
    });
    const action = resolveActions(equipped).find(
      (row) => row.resourcePayment?.instanceId === "invulnerability-armor-copy"
    );
    expect(action?.name).toEqual({
      srd: {
        kind: "magic-item",
        key: "armor-of-invulnerability.grants.3",
        field: "label",
      },
    });
    expect(action).toMatchObject({
      resourcePayment: {
        kind: "item-resource",
        itemId: "armor-of-invulnerability",
        instanceId: "invulnerability-armor-copy",
        resourceId: "uses",
        key: "item:invulnerability-armor-copy:uses",
      },
      resourceCost: 1,
      summary: { uses: { current: 1, total: 1, isPool: true } },
    });

    const unattuned = bearerOf({
      srdId: "armor-of-invulnerability",
      instanceId: "unattuned-invulnerability-armor",
      equipped: true,
      attuned: false,
      quantity: 1,
    });
    expect(
      resolveActions(unattuned).some(
        (row) => row.resourcePayment?.itemId === "armor-of-invulnerability"
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
