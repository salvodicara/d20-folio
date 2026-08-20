import { describe, expect, it } from "vitest";

import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { isValidResourceItemSpec } from "@/lib/resources";

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(records)];
}

describe("composed magic-item resource integrity", () => {
  it("keeps every typed declaration valid and every structured payment bound", () => {
    for (const item of SRD_MAGIC_ITEMS) {
      const resources = item.resources;
      const allRecords = records(item);
      const payments = allRecords.flatMap((record) => {
        const payment = record.resourceCost;
        if (typeof payment !== "object" || payment === null || Array.isArray(payment)) {
          return [];
        }
        const resourceId = (payment as Record<string, unknown>).resourceId;
        return typeof resourceId === "string" ? [resourceId] : [];
      });

      if (!resources?.length) {
        expect(payments, `${item.id} pays an item resource without declaring it`).toEqual(
          []
        );
        continue;
      }

      expect(
        isValidResourceItemSpec({ itemId: item.id, resources }),
        `${item.id} has an invalid resource declaration`
      ).toBe(true);

      const resourceIds = new Set(resources.map(({ id }) => id));
      for (const resourceId of payments) {
        expect(
          resourceIds.has(resourceId),
          `${item.id} pays undeclared resource ${resourceId}`
        ).toBe(true);
      }

      const legacyKeys = new Set([
        "chargesPerRest",
        "chargesFormula",
        "longRestRecovery",
        "autoRecover",
        "tracker",
      ]);
      for (const record of allRecords) {
        for (const key of Object.keys(record)) {
          expect(
            legacyKeys.has(key),
            `${item.id} has typed resources and legacy owner ${key}`
          ).toBe(false);
        }
      }

      const fixedCapacity = new Map(
        resources.flatMap((resource) =>
          resource.capacity.kind === "fixed"
            ? ([[resource.id, resource.capacity.amount]] as const)
            : []
        )
      );
      for (const record of allRecords) {
        const payment = record.resourceCost;
        if (typeof payment !== "object" || payment === null || Array.isArray(payment)) {
          continue;
        }
        const resourceId = (payment as Record<string, unknown>).resourceId;
        if (typeof resourceId !== "string") continue;
        const capacity = fixedCapacity.get(resourceId);
        if (capacity === undefined) continue;

        const costs = [
          ...(Array.isArray(record.castLevels)
            ? record.castLevels.flatMap((entry) =>
                typeof entry === "object" && entry !== null && !Array.isArray(entry)
                  ? [(entry as Record<string, unknown>).cost]
                  : []
              )
            : []),
          ...(typeof record.spellCosts === "object" &&
          record.spellCosts !== null &&
          !Array.isArray(record.spellCosts)
            ? Object.values(record.spellCosts as Record<string, unknown>)
            : []),
        ];
        for (const cost of costs) {
          expect(
            typeof cost === "number" && Number.isSafeInteger(cost) && cost > 0,
            `${item.id} has an invalid ${resourceId} cost`
          ).toBe(true);
          expect(
            cost,
            `${item.id} has a ${resourceId} cost above capacity`
          ).toBeLessThanOrEqual(capacity);
        }
      }
    }
  });
});
