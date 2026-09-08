import { describe, expect, it } from "vitest";
import {
  catalogueSnapshot,
  verifyCatalogueSnapshot,
} from "@/lib/character-creation/catalogue";
import { creationSources } from "@/lib/character-creation/catalogue-source";
import { conformAcquisitionSnapshot } from "@/lib/homebrew/sources";

const arrayContaining = (values: unknown[]): unknown => expect.arrayContaining(values);
const objectContaining = (value: unknown): unknown => expect.objectContaining(value);
describe("complete pinned creation roots", () => {
  it("reads an explicitly authored prepared-spell column when the generic count is absent", () => {
    for (const source of creationSources("class")) {
      if (source.kind !== "class" || !source.value.spellcasting) continue;
      const first = source.value.levels.find((row) => row.level === 1);
      const count = first?.spellsKnown ?? first?.classSpecific?.preparedSpells;
      expect(typeof count).toBe("number");
      const rows = catalogueSnapshot(source.key).definition.payload.data
        .progression as unknown as {
        spellcasting: { prepared: number };
        choices: { id: string; count: number }[];
      }[];
      expect(rows[0]?.spellcasting.prepared, source.key).toBe(count);
      expect(rows[0]?.choices.find((c) => c.id === "prepared")?.count, source.key).toBe(
        count
      );
    }
  });
  it("adapts every class, species, background, feat and invocation without a sample cap", () => {
    for (const kind of ["class", "species", "background", "feat", "invocation"] as const)
      for (const source of creationSources(kind)) {
        const snapshot = catalogueSnapshot(source.key);
        expect(snapshot.definition.family).toBe(kind === "invocation" ? "feature" : kind);
        expect(verifyCatalogueSnapshot(snapshot)).toBe(true);
        expect(
          conformAcquisitionSnapshot(snapshot, verifyCatalogueSnapshot),
          source.key
        ).toEqual([]);
      }
  });
  it("keeps class authority separate and offers expertise after origins", () => {
    const rogue = catalogueSnapshot("class:rogue").definition.payload.data;
    expect(rogue).toMatchObject({
      hitDie: 8,
      savingThrows: ["dexterity", "intelligence"],
    });
    expect(rogue.starting).toMatchObject({
      choices: arrayContaining([
        objectContaining({
          pool: objectContaining({
            query: objectContaining({ kind: "proficiency" }),
          }),
        }),
      ]),
    });
    expect(rogue.progression).toEqual(
      arrayContaining([
        objectContaining({
          choices: arrayContaining([
            objectContaining({
              phase: "dependent",
              selectedGrant: { kind: "expertise", category: "skill" },
            }),
          ]),
        }),
      ])
    );
  });
  it("models Wizard book acquisition and preparation as distinct choices", () => {
    const wizard = catalogueSnapshot("class:wizard").definition.payload.data;
    expect(wizard.progression).toEqual(
      arrayContaining([
        objectContaining({
          choices: arrayContaining([
            objectContaining({
              count: 6,
              selectedGrant: objectContaining({
                entitlements: [{ policy: "spellbook" }],
              }),
            }),
            objectContaining({
              count: 4,
              phase: "dependent",
              pool: objectContaining({
                query: objectContaining({ acquiredPolicy: "spellbook" }),
              }),
            }),
          ]),
        }),
      ])
    );
  });
  it("does not fabricate a fixed size or grant the higher-level Goliath form", () => {
    const human = catalogueSnapshot("species:human").definition.payload.data;
    expect(human.sizeChoice).toBe("size");
    expect(human).not.toHaveProperty("size");
    const goliath = catalogueSnapshot("species:goliath").definition.payload.data;
    expect(goliath.benefits).not.toEqual(
      arrayContaining([objectContaining({ kind: "size", size: "large" })])
    );
  });
});

it("preserves declared armor eligibility in every feat source", () => {
  for (const source of creationSources("feat")) {
    if (source.kind !== "feat" || !source.value.prereq?.armorTraining) continue;
    expect(
      catalogueSnapshot(source.key).definition.payload.data.prerequisites
    ).toContainEqual({
      kind: "training",
      category: "armor",
      id:
        source.value.prereq.armorTraining === "shield"
          ? "shields"
          : source.value.prereq.armorTraining + "-armor",
    });
  }
});
