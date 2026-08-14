import { describe, expect, it } from "vitest";

import { MAGIC_ITEMS_PART_1 } from "@/data/magic-items/part-1";
import { MAGIC_ITEMS_PART_2 } from "@/data/magic-items/part-2";
import { MAGIC_ITEMS_PART_3 } from "@/data/magic-items/part-3";
import type { SrdMagicItemData } from "@/data/types";
import { planResourceCommand } from "@/lib/resources";

const EXPECTED = {
  "armor-of-invulnerability": { capacity: 1, recovery: "full" },
  "cape-of-the-mountebank": { capacity: 1, recovery: "full" },
  "circlet-of-blasting": { capacity: 1, recovery: "full" },
  "cloak-of-arachnida": { capacity: 1, recovery: "full" },
  "eyes-of-charming": { capacity: 3, recovery: "full" },
  "medallion-of-thoughts": { capacity: 5, recovery: [1, 4] },
  "trident-of-fish-command": { capacity: 3, recovery: [1, 3] },
  "wand-of-magic-detection": { capacity: 3, recovery: [1, 3] },
  "helm-of-teleportation": { capacity: 3, recovery: [1, 3] },
  "ring-of-animal-influence": { capacity: 3, recovery: [1, 3] },
  "wand-of-web": { capacity: 7, recovery: [1, 6, 1], onOne: "destroyed" },
  "wand-of-polymorph": { capacity: 7, recovery: [1, 6, 1], onOne: "destroyed" },
  "wand-of-binding": { capacity: 7, recovery: [1, 6, 1], onOne: "destroyed" },
  "wand-of-fear": { capacity: 7, recovery: [1, 6, 1], onOne: "destroyed" },
  "wand-of-fireballs": { capacity: 7, recovery: [1, 6, 1], onOne: "destroyed" },
  "wand-of-lightning-bolts": {
    capacity: 7,
    recovery: [1, 6, 1],
    onOne: "destroyed",
  },
  "staff-of-charming": { capacity: 10, recovery: [1, 8, 2], onOne: "destroyed" },
  "staff-of-fire": { capacity: 10, recovery: [1, 6, 4], onOne: "destroyed" },
  "staff-of-frost": { capacity: 10, recovery: [1, 6, 4], onOne: "destroyed" },
  "staff-of-healing": { capacity: 10, recovery: [1, 6, 4], onOne: "destroyed" },
  "staff-of-swarming-insects": {
    capacity: 10,
    recovery: [1, 6, 4],
    onOne: "destroyed",
  },
  "staff-of-the-woodlands": {
    capacity: 6,
    recovery: [1, 6],
    onOne: "nonmagical",
  },
  "cube-of-force": { capacity: 10, recovery: [1, 6] },
  "ring-of-elemental-command": { capacity: 5, recovery: [1, 4, 1] },
} as const;

type WaveItemId = keyof typeof EXPECTED;

const CATALOGUE = [...MAGIC_ITEMS_PART_1, ...MAGIC_ITEMS_PART_2, ...MAGIC_ITEMS_PART_3];

function item(id: WaveItemId): SrdMagicItemData {
  const match = CATALOGUE.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing public magic item: ${id}`);
  return match;
}

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (typeof value !== "object" || value === null) return [];
  const current = value as Record<string, unknown>;
  return [current, ...Object.values(current).flatMap(records)];
}

describe("public magic-item resource wave 1", () => {
  it("gives every wave item one engine-valid, exact dawn resource", () => {
    for (const id of Object.keys(EXPECTED) as WaveItemId[]) {
      const definition = item(id);
      const [resource] = definition.resources ?? [];
      const expected = EXPECTED[id];

      expect(definition.resources, id).toHaveLength(1);
      expect(resource?.id, id).toBe(expected.capacity === 1 ? "uses" : "charges");
      expect(resource?.unit, id).toBe(expected.capacity === 1 ? "uses" : "charges");
      expect(resource?.capacity, id).toEqual({
        kind: "fixed",
        amount: expected.capacity,
      });
      expect(resource?.initial, id).toEqual({ kind: "full" });

      const recovery =
        expected.recovery === "full"
          ? { kind: "full" as const }
          : {
              kind: "entered-roll" as const,
              roll: {
                dice: expected.recovery[0],
                sides: expected.recovery[1],
                ...(expected.recovery[2] === undefined
                  ? {}
                  : { modifier: expected.recovery[2] }),
              },
            };
      expect(resource?.recoveries, id).toEqual([
        { trigger: { kind: "dawn" }, amount: recovery },
      ]);

      if ("onOne" in expected) {
        expect(resource?.onEmpty, id).toEqual({
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: expected.onOne }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        });
      } else {
        expect(resource?.onEmpty, id).toBeUndefined();
      }

      expect(
        planResourceCommand(
          { itemId: id, resources: definition.resources ?? [] },
          { srdId: id, instanceId: "wave-1" },
          undefined,
          {
            kind: "spend",
            occurrenceId: `test:${id}`,
            expectedRevision: 0,
            resourceId: resource?.id ?? "missing",
            amount: 1,
            inputs: {},
          }
        ).status,
        id
      ).toBe("planned");
    }
  });

  it("makes typed resources the sole mutable owner of every authored use", () => {
    const legacyKeys = new Set([
      "chargesPerRest",
      "chargesFormula",
      "longRestRecovery",
      "autoRecover",
      "rest",
      "tracker",
    ]);

    for (const id of Object.keys(EXPECTED) as WaveItemId[]) {
      const definition = item(id);
      const resourceId = definition.resources?.[0]?.id;
      const allRecords = records(definition);

      for (const record of allRecords) {
        for (const key of Object.keys(record)) {
          expect(legacyKeys.has(key), `${id} still owns mutable state via ${key}`).toBe(
            false
          );
        }
      }

      const paidCasts = allRecords.filter(
        (record) =>
          record.type === "free-cast-spell" || record.type === "free-cast-from-list"
      );
      for (const grant of paidCasts) {
        expect(grant.resourceCost, id).toEqual({ resourceId });
      }
    }

    const armorActivation = records(item("armor-of-invulnerability")).find(
      (record) => record.activeKey === "armor-of-invulnerability-metal-shell"
    )?.activation;
    expect(armorActivation).toEqual({
      action: "action",
      resourceCost: { resourceId: "uses" },
    });
  });

  it("preserves every variable charge table and the elemental ring's free spell", () => {
    const levelCosts = {
      "eyes-of-charming": [
        { level: 1, cost: 1 },
        { level: 2, cost: 2 },
        { level: 3, cost: 3 },
      ],
      "staff-of-healing": [
        { level: 1, cost: 1 },
        { level: 2, cost: 2 },
        { level: 3, cost: 3 },
        { level: 4, cost: 4 },
      ],
      "wand-of-fireballs": [
        { level: 3, cost: 1 },
        { level: 4, cost: 2 },
        { level: 5, cost: 3 },
      ],
      "wand-of-lightning-bolts": [
        { level: 3, cost: 1 },
        { level: 4, cost: 2 },
        { level: 5, cost: 3 },
      ],
    } as const;
    for (const [id, costs] of Object.entries(levelCosts)) {
      expect(
        records(item(id as WaveItemId)).find(
          (record) => record.type === "free-cast-spell" && record.castLevels
        )?.castLevels,
        id
      ).toEqual(costs);
    }

    const poolCosts = {
      "staff-of-healing": [{ "lesser-restoration": 2, "mass-cure-wounds": 5 }],
      "staff-of-swarming-insects": [{ "giant-insect": 4, "insect-plague": 5 }],
      "staff-of-the-woodlands": [
        {
          "animal-friendship": 1,
          awaken: 5,
          barkskin: 2,
          "locate-animals-or-plants": 2,
          "pass-without-trace": 2,
          "speak-with-animals": 1,
          "speak-with-plants": 3,
          "wall-of-thorns": 6,
        },
      ],
      "wand-of-binding": [{ "hold-monster": 5, "hold-person": 2 }],
      "wand-of-fear": [{ command: 1, fear: 3 }],
      "staff-of-fire": [{ "burning-hands": 1, fireball: 3, "wall-of-fire": 4 }],
      "staff-of-frost": [
        { "cone-of-cold": 5, "fog-cloud": 1, "ice-storm": 4, "wall-of-ice": 4 },
      ],
      "cube-of-force": [
        {
          "mage-armor": 1,
          shield: 1,
          "leomunds-tiny-hut": 3,
          "mordenkainens-private-sanctum": 4,
          "otilukes-resilient-sphere": 4,
          "wall-of-force": 5,
        },
      ],
      "ring-of-elemental-command": [
        { "chain-lightning": 3, "gust-of-wind": 2, "wind-wall": 1 },
        { earthquake: 5, "stone-shape": 2, stoneskin: 3, "wall-of-stone": 3 },
        { "burning-hands": 1, fireball: 2, "fire-storm": 4, "wall-of-fire": 3 },
        {
          "create-or-destroy-water": 1,
          "ice-storm": 2,
          tsunami: 5,
          "wall-of-ice": 3,
          "water-walk": 2,
        },
      ],
    } as const;
    for (const [id, costs] of Object.entries(poolCosts)) {
      expect(
        records(item(id as WaveItemId))
          .filter((record) => record.type === "free-cast-from-list")
          .map((record) => record.spellCosts),
        id
      ).toEqual(costs);
    }

    expect(
      records(item("ring-of-animal-influence")).find(
        (record) => record.type === "free-cast-from-list"
      )?.spellIds
    ).toEqual(["animal-friendship", "fear", "speak-with-animals"]);
    expect(
      records(item("staff-of-charming")).find(
        (record) => record.type === "free-cast-from-list"
      )
    ).toMatchObject({
      spellIds: ["charm-person", "command", "comprehend-languages"],
      resourceCost: { resourceId: "charges" },
    });

    const ringRecords = records(item("ring-of-elemental-command"));
    expect(
      ringRecords.some(
        (record) =>
          record.type === "at-will-cast-spell" && record.spellId === "feather-fall"
      )
    ).toBe(true);
  });
});
