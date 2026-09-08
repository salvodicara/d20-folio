import { describe, expect, it } from "vitest";
import {
  catalogueSnapshot,
  verifyCatalogueSnapshot,
} from "@/lib/character-creation/catalogue";
import { creationSources } from "@/lib/character-creation/catalogue-source";
import { conformAcquisitionSnapshot } from "@/lib/homebrew/sources";
describe("pinned catalogue acquisition leaves", () => {
  it("preserves spell mechanics without inventing normalized range or duration", () => {
    const snapshot = catalogueSnapshot("spell:magic-missile");
    expect(snapshot.definition.family).toBe("spell");
    expect(snapshot.definition.payload.data).toMatchObject({
      level: 1,
      school: "evocation",
    });
    expect(snapshot.definition.payload.data).not.toHaveProperty("rangeKind");
    expect(snapshot.definition.payload.data).not.toHaveProperty("rangeDistance");
    expect(snapshot.sourceData).toMatchObject({
      data: { id: "magic-missile", damageDice: "1d4+1" },
    });
    expect(verifyCatalogueSnapshot(snapshot)).toBe(true);
    const forged = structuredClone(snapshot);
    forged.definition.payload.data.rangeDistance = 0;
    expect(verifyCatalogueSnapshot(forged)).toBe(false);
  });
  it("converts physical units once while retaining original authored data", () => {
    const snapshot = catalogueSnapshot("equipment:dagger");
    expect(snapshot.definition.family).toBe("weapon");
    expect(snapshot.definition.payload.data).toMatchObject({
      cost: 2,
      weight: 0.45359237,
      category: "simple",
      mode: "melee",
      damageFormula: "1d4",
    });
    expect(snapshot.definition.payload.data).not.toHaveProperty("rangeNormal");
    expect(snapshot.sourceData).toMatchObject({ data: { weight: 1 } });
  });
  it("normalizes bundle price and weight per unit so quantity is counted once", () => {
    const arrows = catalogueSnapshot("equipment:arrows");
    expect(arrows.definition.payload.data.cost).toBe(0.05);
    expect(arrows.definition.payload.data.weight).toBeCloseTo(0.45359237 / 20, 10);
    expect(arrows.sourceData).toMatchObject({ data: { bundleSize: 20, weight: 1 } });
  });
  it("does not declare a conditional weapon property absent", () => {
    const lance = catalogueSnapshot("equipment:lance");
    expect(lance.definition.payload.data).not.toHaveProperty("propertyTwoHanded");
    expect(lance.sourceData).toMatchObject({
      data: {
        properties: expect.arrayContaining(["Two-Handed (unless mounted)"]) as unknown,
      },
    });
  });
  it("pins every spell and equipment leaf without a mock-sized cap", () => {
    for (const kind of ["spell", "equipment"] as const)
      for (const source of creationSources(kind)) {
        const snapshot = catalogueSnapshot(source.key);
        expect(verifyCatalogueSnapshot(snapshot)).toBe(true);
        expect(
          conformAcquisitionSnapshot(snapshot, verifyCatalogueSnapshot),
          source.key
        ).toEqual([]);
        expect(snapshot.sourceData).toMatchObject({
          data: JSON.parse(JSON.stringify(source.value)) as unknown,
        });
      }
    expect(() => catalogueSnapshot("spell:not-in-catalogue")).toThrow(
      "catalogue-source-unavailable"
    );
  });
});
