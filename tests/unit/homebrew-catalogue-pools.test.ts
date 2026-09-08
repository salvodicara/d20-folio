import { describe, expect, it } from "vitest";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { conformDefinition } from "../../src/lib/homebrew/conformance";
import {
  composeOriginBuild,
  type OriginBuild,
} from "../../src/lib/homebrew/origin-build";
import type { FolioCharacter } from "../../src/lib/identity/model";
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "",
  classId: "",
  level: 1,
  revision: 1,
  currentAssignment: null,
  sheet: {
    build: { abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } },
    state: {},
  },
  portraitPath: null,
};
const feat = (id: string) => ({
  kind: "catalogue" as const,
  schema: 1 as const,
  catalogue: "synthetic",
  release: "1",
  adapterVersion: 1,
  entryId: id,
  definition: { ...initializeDefinition("feat"), name: id },
});
const pool = {
  kind: "catalogue",
  catalogue: "synthetic",
  release: "1",
  adapterVersion: 1,
  query: { kind: "feat", categories: ["origin"] },
};
function fixture() {
  const definition = { ...initializeDefinition("species"), name: "Pool species" };
  definition.payload.data.choices = [
    {
      id: "feat",
      name: "Feat",
      count: 1,
      parent: null,
      options: [],
      pool: structuredClone(pool),
    },
  ];
  const snapshot = { ...feat("species"), definition };
  const options = Array.from({ length: 80 }, (_, i) => ({
    option: { id: "feat-" + String(i), name: "Feat " + String(i), benefits: [] },
    snapshot: feat("feat-" + String(i)),
  }));
  const build: OriginBuild = {
    schema: 1,
    character: { ownerUid: character.ownerUid, id: character.id },
    revision: 1,
    selections: {
      species: {
        id: "species",
        ordinal: 0,
        snapshot,
        answers: { "root/feat": ["feat-79"] },
        exceptions: [],
        resolvedChoices: {
          "root/feat": [structuredClone(required(options[79]).snapshot)],
        },
      },
    },
    lastOperation: { uid: "owner", opId: "create" },
  };
  return { definition, build, options };
}
describe("catalogue choices", () => {
  it("offers the full pool but freezes only the exact selected closure", () => {
    const { definition, build, options } = fixture();
    expect(conformDefinition(definition)).toEqual([]);
    const result = composeOriginBuild(character, build, {
      verifyCatalogue: () => true,
      resolvePool: () => options,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.activeChoices[0]?.choice.options).toHaveLength(80);
    expect(build.selections.species?.resolvedChoices?.["root/feat"]).toHaveLength(1);
    expect(build.selections.species?.snapshot.definition).toEqual(definition);
  });
  it("rejects stale selections, forged selected snapshots and missing semantic verification", () => {
    const { build, options } = fixture();
    expect(composeOriginBuild(character, build).valid).toBe(false);
    expect(
      composeOriginBuild(character, build, {
        verifyCatalogue: () => true,
        resolvePool: () => options.slice(0, 79),
      }).valid
    ).toBe(false);
    required(
      required(
        required(required(build.selections.species).resolvedChoices)["root/feat"]
      )[0]
    ).definition.name = "Forged";
    expect(
      composeOriginBuild(character, build, {
        verifyCatalogue: () => true,
        resolvePool: () => options,
      }).valid
    ).toBe(false);
  });
  it("preserves unknown pool policies with explicit diagnostics and rejects invalid kinds", () => {
    const { definition } = fixture();
    const choices = definition.payload.data.choices as unknown as {
      pool: Record<string, unknown>;
    }[];
    required(choices[0]).pool.query = { kind: "future-pool" };
    expect(conformDefinition(definition)).toContainEqual(
      expect.objectContaining({ code: "unsupported-pool-kind" })
    );
    required(choices[0]).pool.query = {
      kind: "spell",
      classSpellLists: ["wizard"],
      minimumLevel: 0,
      maximumLevel: 1,
      futurePolicy: true,
    };
    expect(conformDefinition(definition)).toContainEqual(
      expect.objectContaining({ code: "unsupported-field", severity: "unsupported" })
    );
    expect(required(choices[0]).pool.query).toHaveProperty("futurePolicy", true);
  });
  it("models expertise, spell selections, training and starting equipment without dropping quantities", () => {
    const definition = { ...initializeDefinition("class"), name: "Synthetic class" };
    definition.payload.data.startingEquipment = { gold: 15, items: [] };
    definition.payload.data.benefits = [
      { kind: "expertise", category: "skill", id: "arcana" },
      { kind: "training", category: "armor", id: "light" },
      { kind: "mastery", id: "dagger" },
      { kind: "spell", id: "light", ability: "intelligence", policy: "known" },
    ];
    expect(conformDefinition(definition)).toEqual([]);
  });
});

it("composes a pinned catalogue class parent without invented Library metadata", async () => {
  const { includeOriginDependency } = await import("../../src/lib/homebrew/origins");
  const { conformClassPair } = await import("../../src/lib/homebrew/classes");
  const { composeSubclassCasting } =
    await import("../../src/lib/homebrew/class-composition");
  const parent = {
    ...feat("class"),
    definition: { ...initializeDefinition("class"), name: "Class" },
  };
  const child = includeOriginDependency(
    { ...initializeDefinition("subclass"), name: "Subclass" },
    parent
  );
  child.definition.payload.data.parentClass = {
    dependency: child.key,
    mechanicId: "custom",
  };
  expect(conformClassPair(child.definition, parent)).toEqual([]);
  expect(composeSubclassCasting(child.definition, parent).ok).toBe(true);
  expect(conformClassPair(child.definition, { ...parent, release: "2" })).toContainEqual(
    expect.objectContaining({ code: "parent-version-mismatch" })
  );
});

it("rejects catalogue content options lacking an authentic selected snapshot", async () => {
  const { resolveCatalogueChoice } = await import("../../src/lib/homebrew/choice-pools");
  const { build, options } = fixture();
  const query = required(
    (
      required(build.selections.species).snapshot.definition.payload.data
        .choices as unknown as {
        pool: import("../../src/lib/homebrew/choice-pools").CataloguePool;
      }[]
    )[0]
  ).pool;
  expect(
    resolveCatalogueChoice(query, ["feat-79"], [], {
      verifyCatalogue: () => true,
      resolvePool: () => options.map(({ option }) => ({ option })),
    }).error
  ).not.toBeNull();
});

it("preserves attributed class facts once when origins replace ambiguous imported skills", async () => {
  const { projectOriginCharacter } = await import("../../src/lib/homebrew/origin-build");
  const { build, options } = fixture();
  const fact = {
    selectionId: "class-1",
    path: "root/starting/arcana",
    source: { ownerUid: "owner", id: "class", version: 1 },
    benefit: { kind: "proficiency" as const, category: "skill" as const, id: "arcana" },
  };
  const selected = required(build.selections.species);
  selected.snapshot.definition.payload.data.prerequisites = [
    { kind: "proficiency", category: "skill", id: "arcana" },
  ];
  const projected = projectOriginCharacter(
    {
      ...character,
      sheet: {
        ...character.sheet,
        build: { ...character.sheet.build, skills: { history: "proficient" } },
      },
    },
    build,
    {
      verifyCatalogue: () => true,
      resolvePool: () => options,
      inheritedFacts: [fact, structuredClone(fact)],
    }
  );
  expect(projected.valid).toBe(true);
  expect(projected.projectedCharacter.sheet.build.skills).toEqual({
    arcana: "proficient",
  });
  expect(projected.facts.filter((f) => f.selectionId === "class-1")).toEqual([fact]);
  expect(character.sheet.build).not.toHaveProperty("skills");
});
it("does not certify prerequisites using conditional, unsupported or candidate-self facts", () => {
  const { build, options } = fixture();
  required(build.selections.species).snapshot.definition.payload.data.prerequisites = [
    { kind: "proficiency", category: "skill", id: "arcana" },
  ];
  const fact = {
    selectionId: "class-1",
    path: "root/starting/arcana",
    source: { ownerUid: "owner", id: "class", version: 1 },
    benefit: {
      kind: "proficiency",
      category: "skill",
      id: "arcana",
      condition: { kind: "wearing-armor" },
    },
  };
  const context = {
    verifyCatalogue: () => true,
    resolvePool: () => options,
    inheritedFacts: [
      fact,
    ] as unknown as import("../../src/lib/homebrew/origin-build").OriginFact[],
  };
  expect(composeOriginBuild(character, build, context).valid).toBe(false);
  context.inheritedFacts = [
    {
      ...fact,
      selectionId: "species",
      benefit: { kind: "proficiency", category: "skill", id: "arcana" },
    },
  ];
  expect(composeOriginBuild(character, build, context).valid).toBe(false);
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture");
  return value;
}
