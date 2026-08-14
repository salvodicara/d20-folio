import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { Grant } from "@/lib/grants";
import { parseMagicItemCharges } from "@/lib/magic-item-utils";
import magicItemEn from "@/i18n/en/srd/magic-items.json";
import spellEn from "@/i18n/en/srd/spells.json";

function optionalItemDescription(id: string): string | undefined {
  const row = (magicItemEn as Record<string, { description?: unknown }>)[id];
  return typeof row?.description === "string" ? row.description : undefined;
}

function itemDescription(id: string): string {
  const description = optionalItemDescription(id);
  if (!description) throw new Error(`missing EN rules: ${id}`);
  return description;
}

function castSpellIds(grants: ReadonlyArray<Grant>): string[] {
  const ids = new Set<string>();
  const visit = (entries: ReadonlyArray<Grant>): void => {
    for (const grant of entries) {
      if (grant.type === "free-cast-spell" || grant.type === "at-will-cast-spell") {
        ids.add(grant.spellId);
      } else if (grant.type === "free-cast-from-list") {
        for (const id of grant.spellIds ?? []) ids.add(id);
      } else if (grant.type === "choice-grant-bundle") {
        for (const option of grant.options) visit(option.grants);
      }
    }
  };
  visit(grants);
  return [...ids].sort();
}

function poolGrants(
  grants: ReadonlyArray<Grant>
): Array<Extract<Grant, { type: "free-cast-from-list" }>> {
  const pools: Array<Extract<Grant, { type: "free-cast-from-list" }>> = [];
  const visit = (entries: ReadonlyArray<Grant>): void => {
    for (const grant of entries) {
      if (grant.type === "free-cast-from-list") pools.push(grant);
      if (grant.type === "choice-grant-bundle") {
        for (const option of grant.options) visit(option.grants);
      }
    }
  };
  visit(grants);
  return pools;
}

function spellIdsNamedIn(table: string): string[] {
  const ids: string[] = [];
  for (const [id, row] of Object.entries(spellEn)) {
    if (!("name" in row) || typeof row.name !== "string") continue;
    const shortName = row.name.replace(/^[^'’]+['’]s /, "");
    const names = [row.name, shortName].map((name) =>
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    if (names.some((name) => new RegExp(`\\b${name}\\b(?=.{0,45}\\d)`).test(table))) {
      ids.push(id);
    }
  }
  return ids.sort();
}

describe("multi-spell magic-item casts are derived from their EN rules tables", () => {
  const tableItems = SRD_MAGIC_ITEMS.filter((item) => {
    return optionalItemDescription(item.id)?.includes("Spell Charge Cost") === true;
  });

  it("finds the charged-spell-table family from prose", () => {
    expect(tableItems.length).toBeGreaterThan(0);
  });

  it.each(tableItems)("$id declares every spell named by its charge table", (item) => {
    const description = itemDescription(item.id);
    const table = description.slice(description.indexOf("Spell Charge Cost"));
    expect(castSpellIds(item.grants ?? []), item.id).toEqual(spellIdsNamedIn(table));

    const charges = parseMagicItemCharges(item);
    expect(charges, item.id).toBeGreaterThan(0);
    for (const pool of poolGrants(item.grants ?? [])) {
      if (pool.resourceCost) {
        const resourceId = pool.resourceCost.resourceId;
        const resource = item.resources?.find((candidate) => candidate.id === resourceId);
        expect(resource?.capacity, item.id).toEqual({
          kind: "fixed",
          amount: charges,
        });
        expect(
          resource?.recoveries?.some((recovery) => recovery.trigger.kind === "dawn"),
          item.id
        ).toBe(true);
        expect(
          resource?.recoveries?.some((recovery) => recovery.trigger.kind === "long-rest"),
          item.id
        ).toBe(false);
        expect(pool).not.toHaveProperty("chargesPerRest");
        expect(pool).not.toHaveProperty("rest");
      } else {
        expect(pool.chargesPerRest, item.id).toBe(charges);
        expect(pool.rest, item.id).toBe("long");
      }
      for (const spellId of pool.spellIds ?? []) {
        expect(
          item.grants?.some(
            (grant) => grant.type === "always-prepared-spell" && grant.spellId === spellId
          ),
          `${item.id}:${spellId}`
        ).toBe(true);
      }
    }
  });

  it("derives every Ring of Elemental Command plane spell, including 0-charge Feather Fall", () => {
    const item = SRD_MAGIC_ITEMS.find(
      (candidate) => candidate.id === "ring-of-elemental-command"
    );
    if (!item) throw new Error("missing ring-of-elemental-command");
    const description = itemDescription(item.id);
    const table = description.slice(description.indexOf("Plane Spells (Charges)"));
    expect(castSpellIds(item.grants ?? [])).toEqual(spellIdsNamedIn(table));
    expect(castSpellIds(item.grants ?? [])).toContain("feather-fall");
    expect(parseMagicItemCharges(item)).toBe(5);
    for (const pool of poolGrants(item.grants ?? [])) {
      expect(pool.resourceCost).toEqual({ resourceId: "charges" });
      expect(pool).not.toHaveProperty("chargesPerRest");
      expect(pool).not.toHaveProperty("rest");
    }
    expect(item.resources).toEqual([
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 5 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 4, modifier: 1 },
            },
          },
        ],
      },
    ]);
  });
});
