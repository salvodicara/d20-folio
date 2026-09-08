import { describe, expect, it, vi } from "vitest";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { conformDefinition } from "../../src/lib/homebrew/conformance";

describe("origin authoring", () => {
  it.each(["species", "feat", "background"] as const)(
    "initializes a named %s with supported typed declarations",
    (family) => {
      const definition = initializeDefinition(family);
      definition.name = "Synthetic origin";
      expect(conformDefinition(definition)).toEqual([]);
      expect(definition.payload.data.choices).toEqual([]);
      expect(definition.payload.data.benefits).toEqual([]);
    }
  );
});

import {
  composeOriginBuild,
  parseOriginBuild,
  projectOriginCharacter,
  type OriginBuild,
  type OriginSelection,
} from "../../src/lib/homebrew/origin-build";
import type { FolioCharacter } from "../../src/lib/identity/model";
import type { LibraryDefinition, LibraryVersion } from "../../src/lib/library/model";
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "old-species",
  classId: "fighter",
  level: 3,
  revision: 1,
  currentAssignment: null,
  portraitPath: null,
  sheet: {
    build: {
      race: "old-species",
      background: "old-background",
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      asi: { background: { STR: 1, WIS: 2 } },
    },
    state: {},
  },
};
function named(family: "species" | "feat" | "background"): LibraryDefinition {
  const d = initializeDefinition(family);
  d.name = "New " + family;
  return d;
}
function version(definition: LibraryDefinition, id = "source"): LibraryVersion {
  return {
    schema: 1,
    ownerUid: "owner",
    entryId: id,
    version: 1,
    definition,
    provenance: null,
    operationId: "published",
  };
}
function build(
  definition: LibraryDefinition,
  answers: Record<string, string[]> = {}
): OriginBuild {
  return {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 1,
    selections: {
      chosen: {
        id: "chosen",
        ordinal: 0,
        snapshot: version(definition),
        answers,
        exceptions: [],
      },
    },
    lastOperation: { uid: "owner", opId: "op" },
  };
}
describe("origin composition", () => {
  it("replaces the imported background increase instead of adding both", () => {
    const d = named("background");
    d.payload.data.ability3 = "wisdom";
    const result = projectOriginCharacter(
      character,
      build(d, {
        "root/background-abilities": ["strength:2", "wisdom:1"],
        "root/background-equipment": ["gold"],
      })
    );
    expect(result.abilities.strength).toBe(12);
    expect(result.abilities.wisdom).toBe(11);
    expect(character.sheet.build.asi).toEqual({ background: { STR: 1, WIS: 2 } });
    expect(projectOriginCharacter(character, null).abilities.wisdom).toBe(12);
  });
  it("retains inactive child answers while removing their contributions", () => {
    const d = named("species");
    d.payload.data.choices = [
      {
        id: "parent",
        name: "Parent",
        count: 1,
        parent: null,
        options: [
          { id: "a", name: "A", benefits: [] },
          { id: "b", name: "B", benefits: [] },
        ],
      },
      {
        id: "child",
        name: "Child",
        count: 1,
        parent: { choiceId: "parent", optionId: "a" },
        options: [
          {
            id: "gift",
            name: "Gift",
            benefits: [{ kind: "ability", ability: "strength", amount: 2 }],
          },
        ],
      },
    ];
    const b = build(d, { "root/parent": ["b"], "root/child": ["gift"] });
    const result = composeOriginBuild(character, b);
    expect(result.facts.some((f) => f.benefit.kind === "ability")).toBe(false);
    expect(chosen(b).answers["root/child"]).toEqual(["gift"]);
    expect(result.activeChoices.find((c) => c.path === "root/child")?.active).toBe(false);
  });
  it("does not let an ability feat satisfy its own prerequisite", () => {
    const d = named("feat");
    d.payload.data.prerequisites = [
      { kind: "ability", ability: "strength", minimum: 12 },
    ];
    d.payload.data.benefits = [{ kind: "ability", ability: "strength", amount: 1 }];
    const result = composeOriginBuild(character, build(d));
    expect(result.valid).toBe(false);
    expect(result.facts).toEqual([]);
  });
  it("retains unknown declaration bytes in immutable parsed snapshots", () => {
    const d = named("feat");
    d.payload.data.benefits = [{ kind: "future", unknown: { v: 1 } }];
    const b = build(d);
    const parsed = parseOriginBuild(b);
    expect(parsed).toEqual(b);
    expect(Object.isFrozen(chosen(parsed).snapshot.definition)).toBe(true);
    expect(composeOriginBuild(character, parsed).valid).toBe(false);
  });
});

import { dependencyKey, includeOriginDependency } from "../../src/lib/homebrew/origins";
import {
  decodeLibraryDefinition,
  encodeLibraryDefinition,
} from "../../src/lib/library/model";
describe("origin boundaries", () => {
  it("cascades a flat pinned feat choice without child-library reads", () => {
    const feat = named("feat");
    feat.payload.data.choices = [
      {
        id: "training",
        name: "Training",
        count: 1,
        parent: null,
        options: [
          {
            id: "wise",
            name: "Wise",
            benefits: [{ kind: "ability", ability: "wisdom", amount: 1 }],
          },
        ],
      },
    ];
    const bg = named("background");
    bg.payload.data.tool = "synthetic-tool";
    const included = includeOriginDependency(bg, version(feat, "feat"));
    included.definition.payload.data.originFeat = included.key;
    const b = build(included.definition, {
      "root/background-abilities": ["strength:2", "dexterity:1"],
      "root/background-equipment": ["gold"],
      ["root/" + encodeURIComponent(included.key) + "/training"]: ["wise"],
    });
    expect(composeOriginBuild(character, b).valid).toBe(true);
    expect(projectOriginCharacter(character, b).abilities.wisdom).toBe(11);
  });
  it("can include a stable dependency while unrelated authoring fields are incomplete", () => {
    const bg = named("background");
    bg.payload.data.choices = [
      { id: "unfinished", name: "", count: 1, parent: null, options: [] },
    ];
    expect(() => includeOriginDependency(bg, version(named("feat")))).not.toThrow();
  });
  it("rejects a duplicate acquisition ordinal and oversized multibyte aggregate", () => {
    const b = build(named("feat"));
    b.selections.other = { ...chosen(b), id: "other" };
    expect(() => parseOriginBuild(b)).toThrow("incompatible-origin-build");
    delete b.selections.other;
    chosen(b).snapshot.definition.description = "漢".repeat(65000);
    expect(() => parseOriginBuild(b)).toThrow("incompatible-origin-build");
  });
  it("uses explicit acquisition order and excludes mutually requiring feats", () => {
    const a = named("feat"),
      z = named("feat");
    a.payload.data.mechanicId = "first";
    z.payload.data.mechanicId = "second";
    a.payload.data.prerequisites = [{ kind: "feat", mechanicId: "second" }];
    z.payload.data.prerequisites = [{ kind: "feat", mechanicId: "first" }];
    const b = build(a);
    b.selections.second = {
      ...chosen(b),
      id: "second",
      ordinal: 1,
      snapshot: version(z, "second"),
    };
    expect(composeOriginBuild(character, b).facts).toEqual([]);
    expect(composeOriginBuild(character, b).valid).toBe(false);
  });
  it("accepts a scoped reasoned threshold exception but never an unknown predicate", () => {
    const d = named("feat");
    d.payload.data.prerequisites = [
      { kind: "ability", ability: "strength", minimum: 20 },
    ];
    d.payload.data.benefits = [{ kind: "ability", ability: "wisdom", amount: 1 }];
    const b = build(d);
    chosen(b).exceptions = [
      {
        path: "root/prerequisites/0",
        code: "prerequisite-ability",
        reason: "Table decision",
        authorUid: "owner",
      },
    ];
    expect(composeOriginBuild(character, b).valid).toBe(true);
    d.payload.data.prerequisites = [{ kind: "unknown" }];
    expect(composeOriginBuild(character, b).valid).toBe(false);
  });
  it("does not silently exceed twenty or certify missing spellcasting", () => {
    const d = named("feat");
    d.payload.data.benefits = [{ kind: "ability", ability: "strength", amount: 10 }];
    expect(
      composeOriginBuild(character, build(d)).diagnostics.some(
        (i) => i.code === "ability-maximum"
      )
    ).toBe(true);
    d.payload.data.benefits = [];
    d.payload.data.prerequisites = [{ kind: "spellcasting" }];
    expect(composeOriginBuild(character, build(d)).diagnostics).toContainEqual({
      selectionId: "chosen",
      path: "root/prerequisites/0",
      code: "prerequisite-spellcasting",
      severity: "unresolved",
    });
  });
  it("roundtrips unknown portable payload and reports unknown options, cycles, and distinct abilities", () => {
    const d = named("species");
    d.payload.data.benefits = [{ kind: "future", opaque: [1, 2] }];
    const encoded = encodeLibraryDefinition(d);
    expect(decodeLibraryDefinition(encoded)).toEqual({ ok: true, value: d });
    expect(conformDefinition(d).some((i) => i.code === "unsupported-benefit")).toBe(true);
    const bg = named("background");
    bg.payload.data.ability2 = "strength";
    expect(conformDefinition(bg).some((i) => i.code === "distinct-abilities")).toBe(true);
  });
  it("marks corrupt aggregate projection unavailable and preserves its character input", () => {
    const b = build(named("species"));
    b.schema = 2 as 1;
    const p = projectOriginCharacter(character, b);
    expect(p.available).toBe(false);
    expect(p.projectedCharacter).toEqual(character);
  });
  it("keeps imported background and species when adding only a feat", () => {
    const p = projectOriginCharacter(character, build(named("feat")));
    expect(p.species.id).toBe("old-species");
    expect(p.background.id).toBe("old-background");
    expect(p.abilities.wisdom).toBe(12);
    expect(p.baseline.superseded).toEqual([]);
  });
  it("does not collide allowed library IDs in dependency keys", () => {
    expect(dependencyKey({ ownerUid: "a", entryId: "b~c", version: 1 })).not.toBe(
      dependencyKey({ ownerUid: "a~b", entryId: "c", version: 1 })
    );
  });
});

describe("dependency and projection safety", () => {
  it("rejects malformed shared declarations inside a copied dependency", () => {
    const feat = named("feat");
    feat.payload.data.repeatable = "yes";
    const bg = named("background");
    const node = version(feat, "child");
    const key = dependencyKey(node);
    bg.payload.data.dependencies = {
      [key]: {
        source: { ownerUid: "owner", id: "child" },
        sourceVersion: 1,
        provenance: null,
        definition: feat,
      } as never,
    };
    delete feat.payload.data.dependencies;
    expect(conformDefinition(bg).some((i) => i.code === "invalid-boolean")).toBe(true);
  });
  it("does not use ambiguously attributed old spellcasting after replacing an origin", () => {
    const c = structuredClone(character);
    c.sheet.build.spellcasting = { ability: "INT" };
    const species = named("species");
    species.payload.data.prerequisites = [{ kind: "spellcasting" }];
    expect(composeOriginBuild(c, build(species)).valid).toBe(false);
  });
  it("emits the selected gold entitlement without creating inventory", () => {
    const bg = named("background");
    bg.payload.data.equipmentGold = 50;
    const b = build(bg, {
      "root/background-abilities": ["strength:2", "dexterity:1"],
      "root/background-equipment": ["gold"],
    });
    expect(composeOriginBuild(character, b).entitlements).toEqual([
      {
        selectionId: "chosen",
        path: "root/background-equipment",
        choice: "gold",
        gold: 50,
        dependencies: [],
      },
    ]);
  });
});

describe("bounded origin graphs", () => {
  it("supports 32 flat definitions and rejects the thirty-third without truncating the original", () => {
    let d = named("species");
    for (let i = 0; i < 31; i++)
      d = includeOriginDependency(
        d,
        version(named("feat"), "node" + String(i))
      ).definition;
    expect(
      Object.keys(d.payload.data.dependencies as Record<string, never>)
    ).toHaveLength(31);
    expect(() => parseOriginBuild(build(d))).not.toThrow();
    const original = encodeLibraryDefinition(d);
    expect(() => includeOriginDependency(d, version(named("feat"), "overflow"))).toThrow(
      "invalid-dependencies"
    );
    expect(encodeLibraryDefinition(d)).toBe(original);
  });
  it("rejects a cycle between bundled stable source tuples", () => {
    const a = named("feat"),
      b = named("feat"),
      root = named("species");
    delete a.payload.data.dependencies;
    delete b.payload.data.dependencies;
    const ak = dependencyKey(version(a, "a")),
      bk = dependencyKey(version(b, "b"));
    a.payload.data.benefits = [{ kind: "reference", dependency: bk }];
    b.payload.data.benefits = [{ kind: "reference", dependency: ak }];
    root.payload.data.dependencies = {
      [ak]: {
        source: { ownerUid: "owner", id: "a" },
        sourceVersion: 1,
        provenance: null,
        definition: a,
      } as never,
      [bk]: {
        source: { ownerUid: "owner", id: "b" },
        sourceVersion: 1,
        provenance: null,
        definition: b,
      } as never,
    };
    root.payload.data.benefits = [{ kind: "reference", dependency: ak }];
    expect(conformDefinition(root).some((i) => i.code === "dependency-cycle")).toBe(true);
  });
  it("supports 32 root selections, preserves ordinals, and rejects the thirty-third", () => {
    const b = build(named("feat"));
    b.selections = {};
    for (let i = 0; i < 32; i++)
      b.selections["root" + String(i)] = {
        id: "root" + String(i),
        ordinal: i * 2,
        snapshot: version(named("feat"), "feat" + String(i)),
        answers: {},
        exceptions: [],
      };
    expect(chosen(parseOriginBuild(b), "root31").ordinal).toBe(62);
    b.selections.extra = { ...chosen(b, "root31"), id: "extra", ordinal: 65 };
    expect(() => parseOriginBuild(b)).toThrow("incompatible-origin-build");
  });
});

it("keeps inactive history as nonblocking advice and rejects missing ability proof", () => {
  const d = named("species");
  const b = build(d, { "root/obsolete": ["old"] });
  expect(composeOriginBuild(character, b).valid).toBe(true);
  expect(chosen(b).answers["root/obsolete"]).toEqual(["old"]);
  const c = structuredClone(character);
  delete c.sheet.build.abilities;
  const feat = named("feat");
  feat.payload.data.prerequisites = [
    { kind: "ability", ability: "strength", minimum: 1 },
  ];
  expect(
    composeOriginBuild(c, build(feat)).diagnostics.some(
      (d) => d.severity === "unresolved"
    )
  ).toBe(true);
  expect(projectOriginCharacter(c, build(feat)).available).toBe(false);
});
it("replaces current species movement and exposes only attributable active skills", () => {
  const c = structuredClone(character);
  c.sheet.build.speed = 12;
  c.sheet.build.senses = { darkvision: 18 };
  c.sheet.build.skills = { arcana: "proficient" };
  const d = named("species");
  d.payload.data.walkSpeed = 6;
  d.payload.data.benefits = [{ kind: "proficiency", category: "skill", id: "athletics" }];
  const p = projectOriginCharacter(c, build(d));
  expect(p.projectedCharacter.sheet.build.speed).toBe(6);
  expect(p.projectedCharacter.sheet.build.senses).toEqual({});
  expect(p.projectedCharacter.sheet.build.skills).toEqual({ athletics: "proficient" });
  expect(p.baseline.build.skills).toEqual({ arcana: "proficient" });
});

it("certifies later spellcasting only from an accepted explicit supported declaration", () => {
  const first = named("feat");
  first.payload.data.benefits = [
    { kind: "spellcasting", ability: "wisdom", policy: "ability" },
  ];
  const second = named("feat");
  second.payload.data.prerequisites = [{ kind: "spellcasting" }];
  second.payload.data.benefits = [{ kind: "ability", ability: "dexterity", amount: 1 }];
  const b = build(first);
  b.selections.later = {
    id: "later",
    ordinal: 1,
    snapshot: version(second, "later"),
    answers: {},
    exceptions: [],
  };
  expect(composeOriginBuild(character, b).valid).toBe(true);
  expect(projectOriginCharacter(character, b).abilities.dexterity).toBe(11);
  first.payload.data.benefits = [
    { kind: "spellcasting", ability: "wisdom", policy: "future" },
  ];
  expect(composeOriginBuild(character, b).valid).toBe(false);
});
it("does not bypass nonrepeatability through another accepted library copy", () => {
  const d = named("feat");
  d.payload.data.mechanicId = "synthetic-unique";
  const b = build(d);
  b.selections.other = {
    id: "other",
    ordinal: 1,
    snapshot: version(d, "another-copy"),
    answers: {},
    exceptions: [],
  };
  expect(
    composeOriginBuild(character, b).diagnostics.some(
      (i) => i.code === "nonrepeatable-feat"
    )
  ).toBe(true);
  d.payload.data.repeatable = true;
  expect(composeOriginBuild(character, b).valid).toBe(true);
});
it("does not activate a child from an invalid parent answer of the correct count", () => {
  const d = named("species");
  d.payload.data.choices = [
    {
      id: "parent",
      name: "Parent",
      count: 2,
      parent: null,
      options: [
        { id: "a", name: "A", benefits: [] },
        { id: "b", name: "B", benefits: [] },
      ],
    },
    {
      id: "child",
      name: "Child",
      count: 1,
      parent: { choiceId: "parent", optionId: "a" },
      options: [
        {
          id: "gift",
          name: "Gift",
          benefits: [{ kind: "ability", ability: "strength", amount: 2 }],
        },
      ],
    },
  ];
  const b = build(d, { "root/parent": ["a", "unknown"], "root/child": ["gift"] });
  expect(
    composeOriginBuild(character, b).facts.some((f) => f.benefit.kind === "ability")
  ).toBe(false);
});

function chosen(b: OriginBuild, id = "chosen"): OriginSelection {
  const value = b.selections[id];
  if (!value) throw new Error("Missing test fixture selection");
  return value;
}

it("loads the pure build boundary before the authoring model in a fresh module graph", async () => {
  vi.resetModules();
  const { composeOriginBuild: compose } =
    await import("../../src/lib/homebrew/origin-build");
  expect(compose(character, null).valid).toBe(true);
});

it("preserves a faster unreplaced species speed when a standalone feat grants movement", () => {
  const c = structuredClone(character);
  c.sheet.build.speed = 12;
  const d = named("feat");
  d.payload.data.benefits = [{ kind: "movement", mode: "walk", meters: 9 }];
  expect(projectOriginCharacter(c, build(d)).projectedCharacter.sheet.build.speed).toBe(
    12
  );
  d.payload.data.benefits = [{ kind: "movement", mode: "walk", meters: 15 }];
  expect(projectOriginCharacter(c, build(d)).projectedCharacter.sheet.build.speed).toBe(
    15
  );
});
it("namespaces feat mechanic identity by authoring source without using revision as a new feat", () => {
  const first = named("feat");
  first.payload.data.source = "synthetic-book-a";
  first.payload.data.mechanicId = "shared-local-id";
  const second = structuredClone(first);
  second.payload.data.source = "synthetic-book-b";
  const b = build(first);
  b.selections.later = {
    id: "later",
    ordinal: 1,
    snapshot: version(second, "other"),
    answers: {},
    exceptions: [],
  };
  expect(composeOriginBuild(character, b).valid).toBe(true);
  second.payload.data.source = "synthetic-book-a";
  second.payload.data.sourceVersion = "2";
  b.selections.later.snapshot.version = 2;
  expect(
    composeOriginBuild(character, b).diagnostics.some(
      (i) => i.code === "nonrepeatable-feat"
    )
  ).toBe(true);
});

it("keeps independent homebrew authors distinct and deduplicates canonical accepted copies", () => {
  const d = named("feat");
  d.payload.data.mechanicId = "local-id";
  const b = build(d);
  const provenance = (author: string) => ({
    source: { ownerUid: author, id: "original" },
    sourceVersion: 1,
    senderUid: author,
    offerId: "offer",
    grantId: author + "~offer",
  });
  chosen(b).snapshot.provenance = provenance("author-a");
  b.selections.later = {
    id: "later",
    ordinal: 1,
    snapshot: { ...version(d, "other-copy"), provenance: provenance("author-b") },
    answers: {},
    exceptions: [],
  };
  expect(composeOriginBuild(character, b).valid).toBe(true);
  b.selections.later.snapshot.provenance = provenance("author-a");
  expect(
    composeOriginBuild(character, b).diagnostics.some(
      (i) => i.code === "nonrepeatable-feat"
    )
  ).toBe(true);
});

it("requires the pinned feat identity rather than an unrelated default custom mechanic", () => {
  const target = version(named("feat"), "required");
  const bundled = includeOriginDependency(named("feat"), target);
  bundled.definition.payload.data.prerequisites = [
    { kind: "feat", mechanicId: "custom", dependency: bundled.key },
  ];
  const b = build(named("feat"));
  chosen(b).snapshot = version(named("feat"), "unrelated");
  b.selections.dependent = {
    id: "dependent",
    ordinal: 1,
    snapshot: version(bundled.definition, "dependent"),
    answers: {},
    exceptions: [],
  };
  expect(
    composeOriginBuild(character, b).diagnostics.some(
      (i) => i.code === "prerequisite-feat"
    )
  ).toBe(true);
  chosen(b).snapshot = {
    ...target,
    entryId: "received-copy",
    provenance: {
      source: { ownerUid: "owner", id: "required" },
      sourceVersion: 1,
      senderUid: "owner",
      offerId: "offer",
      grantId: "owner~offer",
    },
  };
  expect(composeOriginBuild(character, b).valid).toBe(true);
});
it("rejects missing pinned feat prerequisites and ambiguous legacy custom selectors", () => {
  const d = named("feat");
  d.payload.data.prerequisites = [
    { kind: "feat", mechanicId: "custom", dependency: "missing" },
  ];
  expect(conformDefinition(d).some((i) => i.code === "missing-reference")).toBe(true);
  d.payload.data.prerequisites = [{ kind: "feat", mechanicId: "custom" }];
  expect(conformDefinition(d).some((i) => i.code === "ambiguous-feat-prerequisite")).toBe(
    true
  );
});
