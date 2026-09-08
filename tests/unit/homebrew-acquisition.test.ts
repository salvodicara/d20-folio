import type { JsonValue } from "../../src/lib/library/model";
import { describe, expect, it } from "vitest";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import {
  composeAcquisitionBuilds,
  type OriginBuild,
  type OriginSelection,
} from "../../src/lib/homebrew/origin-build";
import {
  conformAcquisitionSnapshot,
  type CatalogueSnapshot,
} from "../../src/lib/homebrew/sources";
import { conformDefinition } from "../../src/lib/homebrew/conformance";
import type { ClassBuild } from "../../src/lib/homebrew/class-build";
import type { FolioCharacter } from "../../src/lib/identity/model";
import type { AuthoringFamily } from "../../src/lib/homebrew/model";
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
  portraitPath: null,
  sheet: {
    build: { abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } },
    state: {},
  },
};
function snapshot(id: string, family: AuthoringFamily): CatalogueSnapshot {
  return {
    kind: "catalogue",
    schema: 1,
    catalogue: "test",
    release: "1",
    adapterVersion: 1,
    entryId: id,
    definition: { ...initializeDefinition(family), name: id },
  };
}
function selection(source: CatalogueSnapshot, ordinal = 0): OriginSelection {
  return { id: source.entryId, ordinal, snapshot: source, answers: {}, exceptions: [] };
}
function build(origin: OriginSelection): OriginBuild {
  return {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 1,
    selections: { [origin.id]: origin },
    lastOperation: { uid: "owner", opId: "create" },
  };
}
function classBuild(source = snapshot("class", "class")): ClassBuild {
  return {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 1,
    acquisitions: { class: { ...selection(source), id: "class", classLevel: 1 } },
    lastOperation: { uid: "owner", opId: "create" },
  };
}
const verifyCatalogue = () => true;
const skill = (id: string) => ({ kind: "proficiency", category: "skill", id });
const inline = (id: string, benefit: JsonValue, phase?: string): JsonValue => ({
  id,
  name: id,
  count: 1,
  parent: null,
  options: [{ id: "pick", name: "Pick", benefits: [benefit] }],
  ...(phase ? { phase } : {}),
});

describe("shared acquisition ordering", () => {
  it("lets an origin prerequisite use class foundation while class expertise waits for origins", () => {
    const source = snapshot("class", "class");
    source.definition.payload.data.starting = {
      prerequisites: [],
      benefits: [skill("arcana")],
      choices: [
        inline(
          "expert",
          { kind: "expertise", category: "skill", id: "history" },
          "dependent"
        ),
      ],
    };
    const classes = classBuild(source);
    if (classes.acquisitions.class)
      classes.acquisitions.class.answers["root/starting/expert"] = ["pick"];
    const origin = snapshot("species", "species");
    origin.definition.payload.data.prerequisites = [
      { kind: "proficiency", category: "skill", id: "arcana" },
    ];
    origin.definition.payload.data.benefits = [skill("history")];
    const result = composeAcquisitionBuilds(
      character,
      build(selection(origin)),
      classes,
      { verifyCatalogue }
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.map((fact) => fact.benefit)).toContainEqual({
      kind: "expertise",
      category: "skill",
      id: "history",
    });
    expect(result.facts.find((fact) => fact.benefit.kind === "expertise")?.path).toBe(
      "root/starting/expert/pick/0"
    );
    expect(source.definition.family).toBe("class");
  });
  it("gates all class phases on the root prerequisite before its own facts", () => {
    const source = snapshot("class", "class");
    source.definition.payload.data.prerequisites = [
      { kind: "proficiency", category: "skill", id: "arcana" },
    ];
    source.definition.payload.data.benefits = [skill("arcana")];
    const result = composeAcquisitionBuilds(character, null, classBuild(source), {
      verifyCatalogue,
    });
    expect(result.valid).toBe(false);
    expect(result.facts).toEqual([]);
  });
  it("uses class level for a class-scoped prerequisite", () => {
    const source = snapshot("class", "class");
    source.definition.payload.data.prerequisites = [{ kind: "level", minimum: 2 }];
    expect(
      composeAcquisitionBuilds({ ...character, level: 10 }, null, classBuild(source), {
        verifyCatalogue,
      }).valid
    ).toBe(false);
  });
});

describe("source-local spell acquisition", () => {
  it("resolves local ability independently per root without proving a casting feature", () => {
    const a = snapshot("a", "feat"),
      b = snapshot("b", "feat"),
      gated = snapshot("gated", "feat");
    for (const [source, ability] of [
      [a, "intelligence"],
      [b, "wisdom"],
    ] as const) {
      source.definition.payload.data.benefits = [
        { kind: "spell", id: "light", ability: { choice: "magic" }, policy: "known" },
      ];
      source.definition.payload.data.choices = [
        inline("ability", { kind: "casting-ability", id: "magic", ability }),
      ];
    }
    gated.definition.payload.data.prerequisites = [{ kind: "spellcasting" }];
    const origins = build(selection(a));
    origins.selections = {
      a: { ...selection(a), answers: { "root/ability": ["pick"] } },
      b: { ...selection(b, 1), answers: { "root/ability": ["pick"] } },
      gated: selection(gated, 2),
    };
    const result = composeAcquisitionBuilds(character, origins, null, {
      verifyCatalogue,
    });
    expect(
      result.facts
        .filter((fact) => fact.benefit.kind === "spell")
        .map((fact) => fact.benefit)
    ).toEqual([
      { kind: "spell", id: "light", ability: "intelligence", policy: "known" },
      { kind: "spell", id: "light", ability: "wisdom", policy: "known" },
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ selectionId: "gated", code: "prerequisite-spellcasting" })
    );
  });
  it("keeps missing local ability unresolved and explicit none valid", () => {
    const source = snapshot("species", "species");
    source.definition.payload.data.benefits = [
      { kind: "spell", id: "message", ability: { choice: "missing" }, policy: "known" },
      { kind: "spell", id: "speak-with-animals", ability: "none", policy: "prepared" },
    ];
    const result = composeAcquisitionBuilds(character, build(selection(source)), null, {
      verifyCatalogue,
    });
    expect(result.valid).toBe(false);
    expect(
      result.facts
        .filter((fact) => fact.benefit.kind === "spell")
        .map((fact) => fact.benefit)
    ).toEqual([
      { kind: "spell", id: "speak-with-animals", ability: "none", policy: "prepared" },
    ]);
  });
  it("resolves selected spellbook and preparation permissions against live facts", () => {
    const source = snapshot("class", "class"),
      spell = snapshot("light", "spell");
    const pool = {
      kind: "catalogue",
      catalogue: "test",
      release: "1",
      adapterVersion: 1,
      query: { kind: "spell", minimumLevel: 0, maximumLevel: 0 },
    };
    source.definition.payload.data.choices = ["spellbook", "prepared"].map((policy) => ({
      id: policy,
      name: policy,
      count: 1,
      parent: null,
      options: [],
      pool,
      selectedGrant: {
        kind: "spell",
        ability: "intelligence",
        entitlements: [{ policy }],
      },
    }));
    const classes = classBuild(source);
    if (classes.acquisitions.class) {
      classes.acquisitions.class.answers = {
        "root/spellbook": ["light"],
        "root/prepared": ["light"],
      };
      classes.acquisitions.class.resolvedChoices = {
        "root/spellbook": [spell],
        "root/prepared": [spell],
      };
    }
    const seen: number[] = [];
    const result = composeAcquisitionBuilds(character, null, classes, {
      verifyCatalogue,
      resolvePool: (_pool, facts) => {
        seen.push(facts.filter((fact) => fact.benefit.kind === "spell").length);
        return [
          { option: { id: "light", name: "Light", benefits: [] }, snapshot: spell },
        ];
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(seen).toEqual([0, 1]);
    expect(
      result.facts
        .filter((fact) => fact.benefit.kind === "spell")
        .flatMap((fact) => (fact.benefit.kind === "spell" ? [fact.benefit.policy] : []))
    ).toEqual(["spellbook", "prepared"]);
  });
});

describe("authenticated partial catalogue leaves", () => {
  function partial() {
    const source = snapshot("spell", "spell");
    source.definition.payload.data = {
      authoringVersion: 1,
      edition: "2024",
      source: "SRD",
      sourceVersion: "1",
      mechanicId: "spell",
      level: 1,
      school: "divination",
    };
    source.sourceData = { level: 1 };
    return source;
  }
  it("retains omitted combat fields while validating all present acquisition fields", () => {
    const source = partial();
    expect(conformAcquisitionSnapshot(source, verifyCatalogue)).toEqual([]);
    expect(source.definition.payload.data).not.toHaveProperty("rangeDistance");
    expect(conformDefinition(source.definition).length).toBeGreaterThan(0);
    source.definition.payload.data.level = -1;
    expect(conformAcquisitionSnapshot(source, verifyCatalogue)).toContainEqual(
      expect.objectContaining({ path: "payload.data.level", code: "invalid-number" })
    );
  });
  it("rejects an unauthenticated or forged full snapshot", () => {
    const source = partial();
    expect(conformAcquisitionSnapshot(source).length).toBeGreaterThan(0);
    const exact = JSON.stringify(source);
    source.sourceData = { level: 9 };
    expect(
      conformAcquisitionSnapshot(
        source,
        (candidate) => JSON.stringify(candidate) === exact
      ).length
    ).toBeGreaterThan(0);
  });
});

describe("initial derived source facts", () => {
  it("retains numeric HP, movement and conditional armor formula policies as attributed facts", () => {
    const source = snapshot("species", "species");
    const benefits: JsonValue[] = [
      { kind: "hp-per-level", amount: 2 },
      { kind: "movement-bonus", mode: "walk", meters: 3 },
      { kind: "movement-equals-walk", mode: "swim", multiplier: 1 },
      {
        kind: "armor-class",
        base: 10,
        abilities: ["dexterity", "wisdom"],
        condition: "no-armor-no-shield",
      },
    ];
    source.definition.payload.data.benefits = benefits;
    const result = composeAcquisitionBuilds(character, build(selection(source)), null, {
      verifyCatalogue,
    });
    expect(result.diagnostics).toEqual([]);
    for (const benefit of benefits)
      expect(result.facts).toContainEqual(
        expect.objectContaining({ selectionId: "species", benefit })
      );
  });
});

describe("variable backgrounds and selected source entitlements", () => {
  it("uses explicit background choices once and lets class expertise use a background skill", async () => {
    const { includeOriginDependency } = await import("../../src/lib/homebrew/origins");
    const source = snapshot("background", "background"),
      gear = snapshot("gear", "equipment"),
      feat = snapshot("origin-feat", "feat");
    const included = includeOriginDependency(source.definition, gear);
    source.definition = included.definition;
    const d = source.definition.payload.data;
    delete d.tool;
    delete d.originFeat;
    delete d.equipment;
    delete d.equipmentGold;
    d.skill1 = "arcana";
    d.skill2 = "history";
    d.toolChoice = "tool";
    d.originFeatChoice = "feat";
    d.equipmentChoice = "package";
    d.choices = [
      inline("tool", { kind: "proficiency", category: "tool", id: "thieves-tools" }),
      {
        id: "feat",
        name: "Feat",
        count: 1,
        parent: null,
        options: [],
        pool: {
          kind: "catalogue",
          catalogue: "test",
          release: "1",
          adapterVersion: 1,
          query: { kind: "feat", categories: ["origin"] },
        },
      },
      {
        id: "package",
        name: "Package",
        count: 1,
        parent: null,
        options: [
          {
            id: "a",
            name: "A",
            benefits: [
              { kind: "equipment", dependency: included.key, quantity: 3 },
              { kind: "gold", amount: 7 },
            ],
          },
        ],
      },
    ];
    const origin = selection(source);
    origin.answers = {
      "root/background-abilities": ["strength:2", "dexterity:1"],
      "root/tool": ["pick"],
      "root/feat": ["origin-feat"],
      "root/package": ["a"],
    };
    origin.resolvedChoices = { "root/feat": [feat] };
    const classes = classBuild();
    const cls = classes.acquisitions.class;
    if (!cls) throw new Error("fixture");
    cls.snapshot.definition.payload.data.choices = [
      inline(
        "expert",
        { kind: "expertise", category: "skill", id: "arcana" },
        "dependent"
      ),
    ];
    cls.answers = { "root/expert": ["pick"] };
    const result = composeAcquisitionBuilds(character, build(origin), classes, {
      verifyCatalogue,
      resolvePool: () => [
        {
          option: { id: "origin-feat", name: "Origin feat", benefits: [] },
          snapshot: feat,
        },
      ],
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.filter((fact) => fact.benefit.kind === "ability")).toHaveLength(
      2
    );
    expect(result.facts.map((fact) => fact.benefit)).toContainEqual({
      kind: "expertise",
      category: "skill",
      id: "arcana",
    });
    expect(result.facts.map((fact) => fact.benefit)).toContainEqual({
      kind: "equipment",
      dependency: included.key,
      quantity: 3,
    });
    expect(result.facts.filter((fact) => fact.benefit.kind === "gold")).toHaveLength(1);
    d.tool = "forged-duplicate";
    expect(
      composeAcquisitionBuilds(character, build(origin), classes, { verifyCatalogue })
        .valid
    ).toBe(false);
    delete d.tool;
    d.originFeatChoice = "tool";
    expect(
      composeAcquisitionBuilds(character, build(origin), classes, {
        verifyCatalogue,
        resolvePool: () => [
          {
            option: { id: "origin-feat", name: "Origin feat", benefits: [] },
            snapshot: feat,
          },
        ],
      }).valid
    ).toBe(false);
  });
  it("returns the exact selected item snapshot and quantity rather than a fake dependency", () => {
    const source = snapshot("species", "species"),
      gear = snapshot("gear", "equipment");
    source.definition.payload.data.choices = [
      {
        id: "gear",
        name: "Gear",
        count: 1,
        parent: null,
        options: [],
        pool: {
          kind: "catalogue",
          catalogue: "test",
          release: "1",
          adapterVersion: 1,
          query: { kind: "equipment" },
        },
        selectedGrant: { kind: "equipment", quantity: 4 },
      },
    ];
    const origin = selection(source);
    origin.answers = { "root/gear": ["gear"] };
    origin.resolvedChoices = { "root/gear": [gear] };
    const result = composeAcquisitionBuilds(character, build(origin), null, {
      verifyCatalogue,
      resolvePool: () => [
        { option: { id: "gear", name: "Gear", benefits: [] }, snapshot: gear },
      ],
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.selectedEquipment).toEqual([
      { selectionId: "species", path: "root/gear/gear", snapshot: gear, quantity: 4 },
    ]);
    expect(result.facts.some((fact) => fact.benefit.kind === "reference")).toBe(false);
  });
  it("composes selected invocation as a real feature with nested choices", () => {
    const source = snapshot("class", "class"),
      invocation = snapshot("invocation:tome", "feature");
    invocation.definition.payload.data.choices = [inline("training", skill("arcana"))];
    source.definition.payload.data.choices = [
      {
        id: "invocation",
        name: "Invocation",
        count: 1,
        parent: null,
        options: [],
        pool: {
          kind: "catalogue",
          catalogue: "test",
          release: "1",
          adapterVersion: 1,
          query: { kind: "invocation", maximumClassLevel: 1 },
        },
      },
    ];
    const classes = classBuild(source),
      cls = classes.acquisitions.class;
    if (!cls) throw new Error("fixture");
    cls.answers = {
      "root/invocation": ["tome"],
      "root/invocation/tome/training": ["pick"],
    };
    cls.resolvedChoices = { "root/invocation": [invocation] };
    const context = {
      verifyCatalogue,
      resolvePool: () => [
        { option: { id: "tome", name: "Tome", benefits: [] }, snapshot: invocation },
      ],
    };
    const result = composeAcquisitionBuilds(character, null, classes, context);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.map((fact) => fact.benefit)).toContainEqual(skill("arcana"));
    expect(invocation.definition.family).toBe("feature");
    invocation.definition.payload.data.acquisitionLevel = 5;
    expect(
      composeAcquisitionBuilds(character, null, classes, context).diagnostics
    ).toContainEqual(expect.objectContaining({ code: "prerequisite-level" }));
  });
});

it("resolves deferred reference benefits after origins without losing the referenced child", async () => {
  const { includeOriginDependency } = await import("../../src/lib/homebrew/origins");
  const source = snapshot("class", "class"),
    child = snapshot("child", "feat");
  child.definition.payload.data.benefits = [
    { kind: "expertise", category: "skill", id: "history" },
  ];
  const included = includeOriginDependency(source.definition, child);
  source.definition = included.definition;
  source.definition.payload.data.choices = [
    inline("dependent", { kind: "reference", dependency: included.key }, "dependent"),
  ];
  const classes = classBuild(source);
  if (classes.acquisitions.class)
    classes.acquisitions.class.answers = { "root/dependent": ["pick"] };
  const origin = snapshot("species", "species");
  origin.definition.payload.data.benefits = [skill("history")];
  const result = composeAcquisitionBuilds(character, build(selection(origin)), classes, {
    verifyCatalogue,
  });
  expect(result.diagnostics).toEqual([]);
  expect(result.facts.map((fact) => fact.benefit)).toContainEqual({
    kind: "expertise",
    category: "skill",
    id: "history",
  });
});

it("keeps a partial catalogue item through instance decoding but rejects malformed present fields", async () => {
  const { materializeInstance, DEFAULT_INSTANCE_STATE } =
    await import("../../src/lib/homebrew/instances");
  const source = snapshot("spell", "spell");
  source.definition.payload.data = {
    authoringVersion: 1,
    edition: "2024",
    source: "SRD",
    sourceVersion: "1",
    mechanicId: "spell",
    level: 1,
    school: "divination",
  };
  expect(
    materializeInstance(
      { ownerUid: "owner", id: "hero" },
      "initial_spell",
      source,
      DEFAULT_INSTANCE_STATE,
      1,
      { uid: "owner", opId: "create" },
      {},
      verifyCatalogue
    ).snapshot.definition.payload.data
  ).not.toHaveProperty("rangeDistance");
  source.definition.payload.data.level = "invalid";
  expect(() =>
    materializeInstance(
      { ownerUid: "owner", id: "hero" },
      "initial_spell",
      source,
      DEFAULT_INSTANCE_STATE,
      1,
      { uid: "owner", opId: "create" },
      {},
      verifyCatalogue
    )
  ).toThrow("incompatible-instance");
});

it("validates source-aware spellbook and equipment pool filters", async () => {
  const { conformCataloguePool } = await import("../../src/lib/homebrew/choice-pools");
  const pool = (query: unknown) => ({
    kind: "catalogue",
    catalogue: "test",
    release: "1",
    adapterVersion: 1,
    query,
  });
  expect(
    conformCataloguePool(
      pool({
        kind: "spell",
        minimumLevel: 1,
        maximumLevel: 1,
        acquiredPolicy: "spellbook",
      }),
      "pool"
    )
  ).toEqual([]);
  expect(
    conformCataloguePool(
      pool({ kind: "equipment", proficientOnly: true, proficiencySource: "class:monk" }),
      "pool"
    )
  ).toEqual([]);
  expect(
    conformCataloguePool(pool({ kind: "equipment", proficiencySource: "" }), "pool")
  ).not.toEqual([]);
  expect(
    conformCataloguePool(
      pool({ kind: "equipment", toolCategories: ["artisan"], proficientOnly: true }),
      "pool"
    )
  ).toEqual([]);
  expect(
    conformCataloguePool(
      pool({ kind: "spell", minimumLevel: 1, maximumLevel: 1, acquiredPolicy: "known" }),
      "pool"
    )
  ).not.toEqual([]);
  expect(
    conformCataloguePool(pool({ kind: "equipment", proficientOnly: "yes" }), "pool")
  ).not.toEqual([]);
});

it("rejects malformed present acquisition fields while preserving omitted relationships", () => {
  const source = snapshot("spell", "spell");
  source.definition.payload.data = {
    authoringVersion: 1,
    edition: "2024",
    source: "SRD",
    sourceVersion: "1",
    mechanicId: "spell",
    level: 1,
    school: "divination",
    rangeKind: "distance",
  };
  expect(conformAcquisitionSnapshot(source, verifyCatalogue)).toEqual([]);
  source.definition.payload.data.rangeDistance = 0;
  expect(conformAcquisitionSnapshot(source, verifyCatalogue)).toContainEqual(
    expect.objectContaining({ code: "range-policy" })
  );
  delete source.definition.payload.data.rangeDistance;
  source.definition.payload.data.durationKind = "instant";
  source.definition.payload.data.concentration = true;
  expect(conformAcquisitionSnapshot(source, verifyCatalogue)).toContainEqual(
    expect.objectContaining({ code: "concentration-duration" })
  );
});

it("uses an explicit species size choice without inventing a fixed size", () => {
  const source = snapshot("species", "species"),
    origin = selection(source);
  delete source.definition.payload.data.size;
  source.definition.payload.data.sizeChoice = "size";
  source.definition.payload.data.choices = [
    {
      id: "size",
      name: "Size",
      count: 1,
      parent: null,
      options: [
        { id: "small", name: "Small", benefits: [{ kind: "size", size: "small" }] },
        { id: "medium", name: "Medium", benefits: [{ kind: "size", size: "medium" }] },
      ],
    },
  ];
  origin.answers = { "root/size": ["small"] };
  const result = composeAcquisitionBuilds(character, build(origin), null, {
    verifyCatalogue,
  });
  expect(result.diagnostics).toEqual([]);
  expect(
    result.facts
      .filter((fact) => fact.benefit.kind === "size")
      .map((fact) => fact.benefit)
  ).toEqual([{ kind: "size", size: "small" }]);
  source.definition.payload.data.size = "medium";
  expect(
    composeAcquisitionBuilds(character, build(origin), null, { verifyCatalogue }).valid
  ).toBe(false);
});

it("keeps the same dependency key in separate selected closures and scopes its ability choices", async () => {
  const { includeOriginDependency, originNodePath } =
    await import("../../src/lib/homebrew/origins");
  const root = snapshot("species", "species"),
    child = snapshot("shared", "feature");
  child.definition.payload.data.benefits = [
    { kind: "spell", id: "light", ability: { choice: "magic" }, policy: "known" },
  ];
  child.definition.payload.data.choices = [
    {
      id: "ability",
      name: "Ability",
      count: 1,
      parent: null,
      options: [
        {
          id: "int",
          name: "Int",
          benefits: [{ kind: "casting-ability", id: "magic", ability: "intelligence" }],
        },
        {
          id: "wis",
          name: "Wis",
          benefits: [{ kind: "casting-ability", id: "magic", ability: "wisdom" }],
        },
      ],
    },
  ];
  const sources = [snapshot("a", "feat"), snapshot("b", "feat")];
  const origin = selection(root);
  origin.answers = { "root/pool": ["a", "b"] };
  sources.forEach((source) => {
    const included = includeOriginDependency(source.definition, child);
    source.definition = included.definition;
    source.definition.payload.data.benefits = [
      { kind: "reference", dependency: included.key },
    ];
    origin.answers[
      originNodePath("root/pool/" + source.entryId, included.key) + "/ability"
    ] = [source.entryId === "a" ? "int" : "wis"];
  });
  root.definition.payload.data.choices = [
    {
      id: "pool",
      name: "Pool",
      count: 2,
      parent: null,
      options: [],
      pool: {
        kind: "catalogue",
        catalogue: "test",
        release: "1",
        adapterVersion: 1,
        query: { kind: "feat" },
      },
    },
  ];
  origin.resolvedChoices = { "root/pool": sources };
  const result = composeAcquisitionBuilds(character, build(origin), null, {
    verifyCatalogue,
    resolvePool: () =>
      sources.map((source) => ({
        option: { id: source.entryId, name: source.entryId, benefits: [] },
        snapshot: source,
      })),
  });
  expect(result.diagnostics).toEqual([]);
  expect(
    result.facts.flatMap((fact) =>
      fact.benefit.kind === "spell" ? [fact.benefit.ability] : []
    )
  ).toEqual(["intelligence", "wisdom"]);
});
