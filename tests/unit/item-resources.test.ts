import { describe, expect, it, vi } from "vitest";
import type { ResourceSpec, SrdMagicItemData } from "@/data/types";
import type {
  CharacterDoc,
  ItemResourceState,
  ItemResourceTransitionFingerprint,
} from "@/types/character";
import {
  createItemInstanceId,
  migrateLegacyItemResources,
  normalizeItemResources,
  parseItemResources,
  resolveItemResources,
} from "@/lib/item-resources";
import { parseCharacter, serializeCharacter } from "@/lib/character-codec";
import { sanitizeSession } from "@/lib/sanitize-session";
import { MOCK_CHARACTER } from "@/lib/mock";

const CHARGES: ResourceSpec = {
  kind: "counter",
  id: "charges",
  unit: "charges",
  capacity: { kind: "fixed", amount: 7 },
  initial: { kind: "full" },
  recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
};

const WAND: Pick<SrdMagicItemData, "id" | "resources"> = {
  id: "test-wand",
  resources: [CHARGES],
};

function itemState(
  instanceId: string,
  current: number,
  overrides: Partial<ItemResourceState> = {}
): ItemResourceState {
  return {
    itemId: "test-wand",
    instanceId,
    revision: 0,
    resources: { charges: { capacity: 7, current, disabled: false } },
    disposition: "magical",
    causalHead: null,
    ...overrides,
  };
}

function docWithEquipment(
  equipment: CharacterDoc["character"]["equipment"]
): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = equipment;
  doc.session.trackers = {};
  delete doc.session.itemResources;
  return doc;
}

describe("item resource identity + resolver", () => {
  it("normalizes generated ids to strict lowercase", () => {
    expect(createItemInstanceId(() => "A1B2-C3")).toBe("a1b2-c3");
    expect(() => createItemInstanceId(() => "../escape")).toThrow(TypeError);
  });

  it("keeps identical physical copies separate and resolves stored/default values", () => {
    const result = resolveItemResources({
      equipment: [
        { srdId: "test-wand", instanceId: "wand-a" },
        { srdId: "test-wand", instanceId: "wand-b" },
      ],
      catalogue: [WAND],
      itemResources: { "wand-a": itemState("wand-a", 2) },
    });

    expect(result.omissions).toEqual([]);
    expect(
      result.resources.map((resource) => [resource.instanceId, resource.current])
    ).toEqual([
      ["wand-a", 2],
      ["wand-b", 7],
    ]);
    expect(result.resources.map((resource) => resource.key)).toEqual([
      "item:wand-a:charges",
      "item:wand-b:charges",
    ]);
  });

  it("omits every missing, invalid, or duplicate physical identity", () => {
    const result = resolveItemResources({
      equipment: [
        { srdId: "test-wand" },
        { srdId: "test-wand", instanceId: "UPPER" },
        { srdId: "test-wand", instanceId: "same" },
        { srdId: "test-wand", instanceId: "same" },
      ],
      catalogue: [WAND],
    });
    expect(result.resources).toEqual([]);
    expect(result.omissions.map((entry) => entry.reason)).toEqual([
      "missing-instance-id",
      "invalid-instance-id",
      "duplicate-instance-id",
      "duplicate-instance-id",
    ]);
  });

  it("never resurrects a resource from malformed or mismatched stored state", () => {
    const equipment = [{ srdId: "test-wand", instanceId: "wand-a" }] as const;
    const malformed = resolveItemResources({
      equipment,
      catalogue: [WAND],
      itemResources: {
        "wand-a": {
          ...itemState("wand-a", 0, { disposition: "destroyed" }),
          resources: { charges: { capacity: 8, current: 0, disabled: true } },
        },
      },
    });
    expect(malformed.resources).toEqual([]);
    expect(malformed.omissions).toEqual([
      { itemId: "test-wand", instanceId: "wand-a", reason: "invalid-state" },
    ]);

    const mismatched = resolveItemResources({
      equipment,
      catalogue: [WAND],
      itemResources: {
        "wand-a": itemState("wand-a", 0, {
          itemId: "another-item",
          disposition: "destroyed",
        }),
      },
    });
    expect(mismatched.resources).toEqual([]);
    expect(mismatched.omissions).toEqual([
      {
        itemId: "test-wand",
        instanceId: "wand-a",
        reason: "state-item-mismatch",
      },
    ]);

    const forgedFingerprint = itemState("wand-a", 7, {
      revision: 2,
      resources: {},
      causalHead: null,
      lastTransition: {
        status: "reverted",
        occurrenceId: "undo:forged",
        expectedRevision: 1,
        original: {
          intent: {
            kind: "spend",
            occurrenceId: "forged",
            expectedRevision: 0,
            itemId: "test-wand",
            instanceId: "wand-a",
            resourceId: "charges",
            amount: 1,
            inputs: {},
          },
          before: { resources: {}, disposition: "magical", causalHead: null },
          after: {
            resources: {
              charges: { capacity: 8, current: 7, disabled: false },
            },
            disposition: "magical",
            causalHead: "forged",
          },
        },
      },
    });
    const forged = resolveItemResources({
      equipment,
      catalogue: [WAND],
      itemResources: { "wand-a": forgedFingerprint },
    });
    expect(forged.resources).toEqual([]);
    expect(forged.omissions).toEqual([
      { itemId: "test-wand", instanceId: "wand-a", reason: "invalid-state" },
    ]);
  });

  it("treats a valid reverted empty-state tombstone as the catalogue default", () => {
    const tombstone = itemState("wand-a", 7, {
      revision: 2,
      resources: {},
      causalHead: null,
      lastTransition: {
        status: "reverted",
        occurrenceId: "undo:first-spend",
        expectedRevision: 1,
        original: {
          intent: {
            kind: "spend",
            occurrenceId: "first-spend",
            expectedRevision: 0,
            itemId: "test-wand",
            instanceId: "wand-a",
            resourceId: "charges",
            amount: 1,
            inputs: {},
          },
          before: { resources: {}, disposition: "magical", causalHead: null },
          after: {
            resources: {
              charges: { capacity: 7, current: 6, disabled: false },
            },
            disposition: "magical",
            causalHead: "first-spend",
          },
        },
      },
    });
    const result = resolveItemResources({
      equipment: [{ srdId: "test-wand", instanceId: "wand-a" }],
      catalogue: [WAND],
      itemResources: { "wand-a": tombstone },
    });
    expect(result.omissions).toEqual([]);
    expect(result.resources[0]).toMatchObject({
      current: 7,
      capacity: 7,
      itemState: tombstone,
    });
  });
});

describe("item resource persistence normalization", () => {
  const completeOriginal = {
    intent: {
      kind: "spend",
      occurrenceId: "combat:round-4:hit-2",
      expectedRevision: 10,
      itemId: "test-wand",
      instanceId: "wand-a",
      resourceId: "charges",
      amount: 3,
      inputs: { capacityRoll: 7, initialRoll: 6, depletionD20: 1 },
    },
    before: {
      resources: { charges: { capacity: 7, current: 7, disabled: false } },
      disposition: "magical",
      causalHead: null,
    },
    after: {
      resources: { charges: { capacity: 7, current: 4, disabled: true } },
      disposition: "destroyed",
      causalHead: "combat:round-4:hit-2",
    },
  } satisfies ItemResourceTransitionFingerprint;
  const completeState = itemState("wand-a", 7, {
    revision: 12,
    causalHead: null,
    lastTransition: {
      status: "reverted",
      occurrenceId: "undo:combat:round-4:hit-2",
      expectedRevision: 11,
      original: completeOriginal,
    },
  });

  it("round-trips capacity rolls, revision, tombstone, disposition, and intent inputs", () => {
    expect(normalizeItemResources({ "wand-a": completeState })).toEqual({
      "wand-a": completeState,
    });
    const sanitized = sanitizeSession({ itemResources: { "wand-a": completeState } });
    expect(sanitized.itemResources).toEqual({ "wand-a": completeState });

    const tombstone = itemState("wand-undo", 7, {
      revision: 2,
      resources: {},
      causalHead: null,
      lastTransition: {
        status: "reverted",
        occurrenceId: "undo:first-command",
        expectedRevision: 1,
        original: {
          intent: {
            kind: "gain",
            occurrenceId: "first-command",
            expectedRevision: 0,
            itemId: "test-wand",
            instanceId: "wand-undo",
            resourceId: "charges",
            amount: 1,
            inputs: {},
          },
          before: { resources: {}, disposition: "magical", causalHead: null },
          after: {
            resources: {
              charges: { capacity: 7, current: 1, disabled: false },
            },
            disposition: "magical",
            causalHead: "first-command",
          },
        },
      },
    });
    expect(normalizeItemResources({ "wand-undo": tombstone })).toEqual({
      "wand-undo": tombstone,
    });
  });

  it("strips malformed keys, counters, mismatched identity, and unknown fields", () => {
    const clean = itemState("wand-a", 4);
    const raw = JSON.parse(
      JSON.stringify({
        "Bad Key": completeState,
        "wrong-binding": { ...completeState, instanceId: "another" },
        "wand-a": {
          ...clean,
          unknown: "drop-me",
          resources: {
            charges: clean.resources.charges,
          },
        },
        "wand-b": {
          ...completeState,
          instanceId: "wand-b",
          lastTransition: {
            ...completeState.lastTransition,
            original: {
              ...completeOriginal,
              intent: {
                ...completeOriginal.intent,
                instanceId: "wand-b",
                itemId: "other-item",
              },
            },
          },
        },
        "wand-c": {
          ...itemState("wand-c", 0),
          resources: { charges: { capacity: 7, current: 99, disabled: true } },
        },
        "wand-d": {
          ...itemState("wand-d", 0),
          resources: { constructor: { capacity: 1, current: 0, disabled: false } },
        },
      })
    ) as unknown;

    expect(normalizeItemResources(raw)).toEqual({
      "wand-a": {
        itemId: "test-wand",
        instanceId: "wand-a",
        revision: 0,
        resources: { charges: clean.resources.charges },
        disposition: "magical",
        causalHead: null,
      },
    });
  });

  it("rejects wrong-kind or unknown transition inputs without changing the intent", () => {
    const wrongKind = {
      ...completeState,
      lastTransition: {
        ...completeState.lastTransition,
        original: {
          ...completeOriginal,
          intent: {
            ...completeOriginal.intent,
            inputs: { recoveryRoll: 4 },
          },
        },
      },
    };
    const unknown = {
      ...completeState,
      lastTransition: {
        ...completeState.lastTransition,
        original: {
          ...completeOriginal,
          intent: {
            ...completeOriginal.intent,
            inputs: { depletionD20: 1, surprise: 2 },
          },
        },
      },
    };
    expect(normalizeItemResources({ "wand-a": wrongKind })).toEqual({});
    expect(normalizeItemResources({ "wand-a": unknown })).toEqual({});
    expect(parseItemResources({ "wand-a": wrongKind })).toEqual({ ok: false });
    expect(parseItemResources({ "wand-a": unknown })).toEqual({ ok: false });
  });

  it("rejects malformed persisted maps before they can refill from catalogue defaults", () => {
    const malformed = {
      "wand-a": {
        ...itemState("wand-a", 0),
        resources: { charges: { capacity: 7, current: 99, disabled: false } },
      },
    };
    expect(parseItemResources(malformed)).toEqual({ ok: false });
    expect(
      resolveItemResources({
        equipment: [{ srdId: "test-wand", instanceId: "wand-a" }],
        catalogue: [WAND],
        itemResources: malformed,
      })
    ).toEqual({
      resources: [],
      omissions: [{ itemId: "test-wand", instanceId: "wand-a", reason: "invalid-state" }],
    });

    const doc = docWithEquipment([
      { srdId: "test-wand", quantity: 1, instanceId: "wand-a" },
    ]);
    const encoded = JSON.parse(serializeCharacter(doc)) as {
      schema: number;
      build: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    encoded.state.itemResources = malformed;
    expect(parseCharacter(JSON.stringify(encoded))).toEqual({
      success: false,
      error: "invalid-item-resources",
    });

    doc.session.itemResources = malformed;
    expect(() => serializeCharacter(doc)).toThrow(
      "Cannot serialize malformed item resource state"
    );
  });

  it("preserves exact turn boundaries and rejects a vague or causally mismatched head", () => {
    const turnStart = itemState("wand-turn", 7, {
      revision: 1,
      causalHead: "turn:4:start",
      lastTransition: {
        status: "applied",
        expectedRevision: 0,
        intent: {
          kind: "recover",
          occurrenceId: "turn:4:start",
          expectedRevision: 0,
          itemId: "test-wand",
          instanceId: "wand-turn",
          resourceId: "charges",
          trigger: { kind: "turn-start" },
          inputs: {},
        },
      },
    });
    expect(normalizeItemResources({ "wand-turn": turnStart })).toEqual({
      "wand-turn": turnStart,
    });
    expect(
      normalizeItemResources({
        "wand-turn": {
          ...turnStart,
          lastTransition: {
            ...turnStart.lastTransition,
            intent: {
              ...(turnStart.lastTransition?.status === "applied"
                ? turnStart.lastTransition.intent
                : {}),
              trigger: { kind: "per-turn" },
            },
          },
        },
      })
    ).toEqual({});
    expect(
      normalizeItemResources({
        "wand-turn": { ...turnStart, causalHead: "another-occurrence" },
      })
    ).toEqual({});
  });

  it("codec preserves two copies and the complete whole-item state losslessly", () => {
    const doc = docWithEquipment([
      { srdId: "test-wand", quantity: 1, instanceId: "wand-a" },
      { srdId: "test-wand", quantity: 1, instanceId: "wand-b" },
    ]);
    doc.session.itemResources = {
      "wand-a": completeState,
      "wand-b": itemState("wand-b", 7),
    };

    const encoded = serializeCharacter(doc);
    const envelope = JSON.parse(encoded) as { state: Record<string, unknown> };
    expect(envelope.state.itemResources).toEqual(doc.session.itemResources);
    const parsed = parseCharacter(encoded);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(
      parsed.doc.character.equipment.filter(
        (item) => !("custom" in item) && item.srdId === "test-wand"
      )
    ).toEqual(doc.character.equipment);
    expect(parsed.doc.session.itemResources).toEqual(doc.session.itemResources);
  });
});

describe("bounded legacy item-resource migration", () => {
  it("stamps and migrates an unambiguous ref-owned counter exactly", () => {
    const doc = docWithEquipment([
      {
        srdId: "test-wand",
        quantity: 1,
        charges: { current: 3, max: 7, recovery: "long-rest" },
      },
    ]);
    const result = migrateLegacyItemResources(doc, [WAND], () => "legacy-wand");
    expect(result.status).toBe("migrated");
    if (result.status === "ambiguous") return;
    expect(result.doc.character.equipment).toEqual([
      { srdId: "test-wand", quantity: 1, instanceId: "legacy-wand" },
    ]);
    expect(result.doc.session.itemResources).toEqual({
      "legacy-wand": itemState("legacy-wand", 3),
    });
    expect(doc.character.equipment[0]).toHaveProperty("charges");
  });

  it("moves unambiguous srdId tracker usage and removes only that legacy key", () => {
    const doc = docWithEquipment([{ srdId: "test-wand", quantity: 1 }]);
    doc.session.trackers = { "test-wand": { used: 2 }, other: { used: 1 } };
    const result = migrateLegacyItemResources(doc, [WAND], () => "tracked-wand");
    expect(result.status).toBe("migrated");
    if (result.status === "ambiguous") return;
    expect(result.doc.session.trackers).toEqual({ other: { used: 1 } });
    expect(result.doc.session.itemResources).toEqual({
      "tracked-wand": itemState("tracked-wand", 5),
    });
  });

  it("returns explicit ambiguity for duplicate same-id copies with one legacy tracker", () => {
    const doc = docWithEquipment([
      { srdId: "test-wand", quantity: 1 },
      { srdId: "test-wand", quantity: 1 },
    ]);
    doc.session.trackers = { "test-wand": { used: 1 } };
    const idFactory = vi.fn(() => "must-not-run");
    const result = migrateLegacyItemResources(doc, [WAND], idFactory);

    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.ambiguities).toContainEqual({
      itemId: "test-wand",
      reason: "multiple-legacy-copies",
      equipmentIndexes: [0, 1],
    });
    expect(result.doc).toBe(doc);
    expect(idFactory).not.toHaveBeenCalled();
  });

  it("is all-or-nothing for malformed persisted state", () => {
    const doc = docWithEquipment([
      { srdId: "test-wand", quantity: 1, instanceId: "wand-a" },
    ]);
    doc.session.itemResources = {
      "wand-a": itemState("wand-a", 0, {
        resources: { charges: { capacity: 8, current: 0, disabled: false } },
      }),
    };

    const result = migrateLegacyItemResources(doc, [WAND], () => "unused");
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.ambiguities).toContainEqual({
      itemId: "test-wand",
      reason: "existing-state-conflict",
      equipmentIndexes: [0],
    });
    expect(result.doc).toBe(doc);
  });

  it("rejects invalid existing and colliding generated identities without partial output", () => {
    const invalid = docWithEquipment([
      { srdId: "test-wand", quantity: 1, instanceId: "INVALID" },
    ]);
    const invalidResult = migrateLegacyItemResources(invalid, [WAND], () => "unused");
    expect(invalidResult.status).toBe("ambiguous");
    if (invalidResult.status === "ambiguous") {
      expect(invalidResult.ambiguities).toContainEqual({
        itemId: "test-wand",
        reason: "invalid-instance-id",
        equipmentIndexes: [0],
      });
      expect(invalidResult.doc).toBe(invalid);
    }

    const stacked = docWithEquipment([{ srdId: "test-wand", quantity: 2 }]);
    const collision = migrateLegacyItemResources(stacked, [WAND], () => "same-id");
    expect(collision.status).toBe("ambiguous");
    if (collision.status === "ambiguous") {
      expect(collision.ambiguities).toEqual([
        {
          itemId: "test-wand",
          reason: "generated-instance-id-conflict",
          equipmentIndexes: [0],
        },
      ]);
      expect(collision.doc).toBe(stacked);
    }
  });
});
