import { describe, expect, it } from "vitest";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { conformDefinition } from "../../src/lib/homebrew/conformance";
import { includeOriginDependency } from "../../src/lib/homebrew/origins";
import { blankAdvancedRow } from "../../src/lib/homebrew/advanced";
import {
  blankClassLevel,
  decodeClassDefinition,
  conformClassPair,
} from "../../src/lib/homebrew/classes";
import {
  parseDefinition,
  type LibraryDefinition,
  type LibraryVersion,
  type JsonValue,
} from "../../src/lib/library/model";
const named = (family: "class" | "subclass" = "class") => {
  const d = initializeDefinition(family);
  d.name = "Lantern keeper";
  return d;
};
const version = (definition: LibraryDefinition): LibraryVersion => ({
  schema: 1,
  ownerUid: "owner",
  entryId: "lantern",
  version: 1,
  operationId: "publish",
  provenance: null,
  definition,
});
function pair() {
  const parent = version(named());
  const included = includeOriginDependency(named("subclass"), parent);
  included.definition.payload.data.parentClass = {
    dependency: included.key,
    mechanicId: "custom",
  };
  return { parent, child: included.definition };
}
const row = (level: number): Record<string, JsonValue> =>
  blankClassLevel(level) as unknown as Record<string, JsonValue>;
const codes = (d: LibraryDefinition) => conformDefinition(d).map((i) => i.code);
describe("class authoring", () => {
  it("initializes a named class with typed progression declarations", () => {
    const d = named();
    expect(conformDefinition(d)).toEqual([]);
    expect(decodeClassDefinition(d).ok).toBe(true);
  });
  it("pins subclass to exact immutable parent at the parent acquisition level", () => {
    const { parent, child } = pair();
    expect(conformDefinition(child)).toEqual([]);
    expect(conformClassPair(child, parent)).toEqual([]);
    expect(conformClassPair(child, { ...parent, version: 2 })).not.toEqual([]);
    expect(conformClassPair(child, { ...parent, ownerUid: "lookalike" })).not.toEqual([]);
  });
  it.each([[0], [1, 1], [3, 1], [1, 21], []].map((levels) => [levels]))(
    "rejects invalid progression %j",
    (levels) => {
      const d = named();
      d.payload.data.progression = levels.map((level) => ({
        ...row(level),
        id: "level-" + String(level),
      }));
      expect(codes(d)).toContain("invalid-progression");
    }
  );
  it("validates shared choices, acquisition prerequisites and closed row references", () => {
    const d = named();
    d.payload.data.starting = {
      prerequisites: [],
      benefits: [],
      choices: [{ id: "pick", name: "Pick", count: 1, parent: null, options: [] }],
    };
    expect(codes(d)).toContain("invalid-count");
    d.payload.data.starting = { prerequisites: [], benefits: [], choices: [] };
    d.payload.data.progression = [
      { ...row(1), benefits: [{ kind: "reference", dependency: "missing" }] },
    ];
    expect(codes(d)).toContain("missing-reference");
  });
  it("rejects resources used before introduction and validates absolute capacities", () => {
    const d = named();
    d.payload.data.resources = [
      { ...blankAdvancedRow("resource"), id: "light", name: "Light", capacity: 3 },
    ];
    d.payload.data.programs = [
      {
        ...blankAdvancedRow("program"),
        id: "glow",
        name: "Glow",
        resourceId: "light",
        resourceCost: 2,
      },
    ];
    d.payload.data.progression = [{ ...row(1), programIds: ["glow"] }];
    expect(codes(d)).toContain("resource-unavailable");
    d.payload.data.progression = [
      {
        ...row(1),
        programIds: ["glow"],
        resourceCapacities: [{ resourceId: "light", capacity: 2 }],
      },
      row(3),
      row(5),
    ];
    expect(conformDefinition(d)).toEqual([]);
  });
  it("inherits parent casting without duplicate slot contribution", () => {
    const { child } = pair();
    child.payload.data.spellcasting = {
      mode: "full",
      ability: "wisdom",
      multiclass: { contributes: true, divisor: 1, rounding: "down" },
    };
    expect(codes(child)).toContain("inherited-casting-contribution");
  });
  it("separates incompatible, invalid and unsupported with untouched original", () => {
    for (const [input, status] of [
      [{ future: 1 }, "incompatible"],
      [{ ...named(), name: "" }, "invalid"],
      [
        (() => {
          const d = named();
          d.payload.data.future = { unicode: "星" };
          return d;
        })(),
        "unsupported",
      ],
    ] as const) {
      const before = JSON.stringify(input);
      const r = decodeClassDefinition(input);
      expect(r).toMatchObject({ ok: false, status, original: input });
      expect(JSON.stringify(input)).toBe(before);
    }
  });
  it("roundtrips twenty compact rows and all prior nine families", () => {
    const d = named();
    d.payload.data.progression = Array.from({ length: 20 }, (_, i) => row(i + 1));
    expect(conformDefinition(d)).toEqual([]);
    expect(parseDefinition(JSON.parse(JSON.stringify(d)))).toEqual(d);
    for (const f of [
      "weapon",
      "equipment",
      "spell",
      "feature",
      "monster",
      "campaign-rule",
      "species",
      "feat",
      "background",
    ] as const) {
      const old = initializeDefinition(f);
      old.name = "Old";
      expect(conformDefinition(old)).toEqual([]);
    }
  });
});

describe("class composition boundaries", () => {
  it("rejects composed resource cost above available capacity", () => {
    const d = named();
    d.payload.data.resources = [
      { ...blankAdvancedRow("resource"), id: "light", name: "Light", capacity: 5 },
    ];
    d.payload.data.programs = [
      {
        ...blankAdvancedRow("program"),
        id: "spark",
        name: "Spark",
        resourceId: "light",
        resourceCost: 2,
      },
      {
        ...blankAdvancedRow("program"),
        id: "double",
        name: "Double",
        kind: "multiattack",
        steps: [{ kind: "program", programId: "spark", count: 2 }],
      },
    ];
    d.payload.data.progression = [
      {
        ...row(1),
        programIds: ["spark", "double"],
        resourceCapacities: [{ resourceId: "light", capacity: 3 }],
      },
    ];
    expect(codes(d)).toContain("resource-unavailable");
  });
  it("rejects an unscheduled subclass resource feature but permits casting-only rows", () => {
    const { child } = pair();
    child.payload.data.resources = [
      { ...blankAdvancedRow("resource"), id: "light", name: "Light", capacity: 3 },
    ];
    child.payload.data.progression = [
      row(3),
      { ...row(4), resourceCapacities: [{ resourceId: "light", capacity: 1 }] },
    ];
    expect(codes(child)).toContain("subclass-feature-schedule");
    child.payload.data.progression = [row(3), row(4)];
    expect(conformDefinition(child)).toEqual([]);
  });
  it("roundtrips future versions and unknown progression branches untouched", () => {
    for (const key of ["authoringVersion", "progression"]) {
      const d = named();
      d.payload.data[key] =
        key === "authoringVersion" ? 99 : [{ ...row(1), future: { name: "星" } }];
      const original = JSON.stringify(d);
      expect(decodeClassDefinition(d)).toMatchObject({
        ok: false,
        status: "unsupported",
      });
      expect(JSON.stringify(d)).toBe(original);
      expect(parseDefinition(JSON.parse(original))).toEqual(d);
    }
  });
  it("validates full parent augmentation and noncaster parent replacement", () => {
    const parent = version(named());
    parent.definition.payload.data.spellcasting = {
      mode: "full",
      ability: "wisdom",
      multiclass: { contributes: true, divisor: 1, rounding: "down" },
    };
    const inc = includeOriginDependency(named("subclass"), parent);
    const d = inc.definition;
    d.payload.data.parentClass = { dependency: inc.key, mechanicId: "custom" };
    d.payload.data.castingRelationship = "augment";
    d.payload.data.progression = [
      {
        ...row(3),
        spellcasting: {
          cantrips: 1,
          prepared: 2,
          known: 0,
          slots: [],
          pactSlots: 0,
          pactLevel: 0,
        },
      },
    ];
    expect(conformDefinition(d)).toEqual([]);
    const { child } = pair();
    child.payload.data.castingRelationship = "replace";
    child.payload.data.spellcasting = {
      mode: "third",
      ability: "intelligence",
      multiclass: { contributes: true, divisor: 3, rounding: "down" },
    };
    child.payload.data.progression = [
      {
        ...row(3),
        spellcasting: {
          cantrips: 2,
          prepared: 3,
          known: 0,
          slots: [2],
          pactSlots: 0,
          pactLevel: 0,
        },
      },
      row(4),
    ];
    expect(conformDefinition(child)).toEqual([]);
  });
  it("rejects wrong parent family, identity, start and schedule without rewriting", () => {
    const { child } = pair();
    child.payload.data.parentClass = {
      ...(child.payload.data.parentClass as Record<string, JsonValue>),
      mechanicId: "wrong",
    };
    expect(codes(child)).toContain("parent-mechanic-mismatch");
    const p = pair().child;
    p.payload.data.progression = [row(1)];
    expect(codes(p)).toContain("subclass-start-level");
    const f = initializeDefinition("feature");
    f.name = "Feature";
    const inc = includeOriginDependency(named("subclass"), version(f));
    inc.definition.payload.data.parentClass = {
      dependency: inc.key,
      mechanicId: "custom",
    };
    expect(codes(inc.definition)).toContain("incompatible-reference");
  });
  it("validates starting/multiclass and row choices with ordered conditional parents", () => {
    const d = named();
    const options = [{ id: "yes", name: "Yes", benefits: [] }];
    d.payload.data.multiclass = {
      prerequisites: [{ kind: "ability", ability: "strength", minimum: 13 }],
      benefits: [{ kind: "proficiency", category: "skill", id: "athletics" }],
      choices: [],
    };
    d.payload.data.progression = [
      {
        ...row(1),
        choices: [
          {
            id: "child",
            name: "Child",
            count: 1,
            options,
            parent: { choiceId: "parent", optionId: "yes" },
          },
          { id: "parent", name: "Parent", count: 1, options, parent: null },
        ],
      },
    ];
    expect(codes(d)).toContain("parent-choice-order");
    d.payload.data.progression = [
      {
        ...row(1),
        choices: [
          { id: "parent", name: "Parent", count: 1, options, parent: null },
          {
            id: "child",
            name: "Child",
            count: 1,
            options,
            parent: { choiceId: "parent", optionId: "yes" },
          },
        ],
      },
    ];
    expect(conformDefinition(d)).toEqual([]);
  });
  it("supports maximum closed nodes and rejects an additional node without mutation", () => {
    let d = named();
    for (let i = 0; i < 31; i++) {
      const f = initializeDefinition("feature");
      f.name = "Feature";
      const included = includeOriginDependency(d, {
        ...version(f),
        entryId: "feature-" + String(i),
      });
      d = included.definition;
    }
    expect(conformDefinition(d)).toEqual([]);
    const original = JSON.stringify(d);
    const f = initializeDefinition("feature");
    f.name = "Overflow";
    expect(() =>
      includeOriginDependency(d, { ...version(f), entryId: "overflow" })
    ).toThrow("invalid-dependencies");
    expect(JSON.stringify(d)).toBe(original);
  });
  it("keeps multibyte over-budget originals as incompatible recovery", () => {
    const d = named();
    d.description = "星".repeat(200001);
    expect(decodeClassDefinition(d)).toMatchObject({
      ok: false,
      status: "incompatible",
      original: d,
    });
  });
});

describe("canonical parent version", () => {
  it("accepts an unchanged granted parent copy but rejects a changed descendant", () => {
    const { parent, child } = pair();
    const received = {
      ...parent,
      ownerUid: "recipient",
      entryId: "received",
      provenance: {
        source: { ownerUid: parent.ownerUid, id: parent.entryId },
        sourceVersion: 1,
        senderUid: "owner",
        offerId: "offer",
        grantId: "grant",
      },
    };
    expect(conformClassPair(child, received)).toEqual([]);
    const changed = structuredClone(received);
    changed.definition.description = "Changed";
    expect(conformClassPair(child, changed).map((i) => i.code)).toContain(
      "parent-version-mismatch"
    );
  });
  it("compares the pinned parent's included closure, not only its root data", () => {
    const f = initializeDefinition("feature");
    f.name = "Light";
    const included = includeOriginDependency(named(), {
      ...version(f),
      entryId: "light",
    });
    const parent = version(included.definition);
    const inc = includeOriginDependency(named("subclass"), parent);
    inc.definition.payload.data.parentClass = {
      dependency: inc.key,
      mechanicId: "custom",
    };
    const bad = structuredClone(parent);
    const deps = bad.definition.payload.data.dependencies as Record<string, JsonValue>;
    const node = deps[included.key] as Record<string, JsonValue>;
    const def = node.definition as Record<string, JsonValue>;
    def.description = "changed child";
    expect(conformClassPair(inc.definition, bad).map((i) => i.code)).toContain(
      "parent-version-mismatch"
    );
  });
});

describe("class structural invariants", () => {
  it.each([
    ["hitDie", 7, "invalid-hit-die"],
    ["savingThrows", ["strength", "strength"], "invalid-abilities"],
    ["primaryAbilities", [], "invalid-abilities"],
    ["subclassLevels", [3, 3], "invalid-subclass-schedule"],
    ["levelBasis", "character", "unsupported-level-basis"],
    ["starting", null, "invalid-acquisition"],
  ] as const)("rejects %s malformed declaration", (key, value, code) => {
    const d = named();
    d.payload.data[key] = structuredClone(value) as JsonValue;
    expect(codes(d)).toContain(code);
  });
  it("preserves max choice and option cardinalities at level twenty", () => {
    const d = named();
    d.payload.data.progression = Array.from({ length: 20 }, (_, i) => row(i + 1));
    const p = d.payload.data.progression as Record<string, JsonValue>[];
    p[19] = {
      ...row(20),
      choices: Array.from({ length: 32 }, (_, i) => ({
        id: "choice-" + String(i),
        name: "Choice",
        count: 1,
        parent: null,
        options: Array.from({ length: 32 }, (_, j) => ({
          id: "option-" + String(j),
          name: "Option",
          benefits: [],
        })),
      })),
    };
    expect(conformDefinition(d)).toEqual([]);
  });
  it("rejects progression program IDs declared twice and unknown resource bindings", () => {
    const d = named();
    d.payload.data.programs = [
      { ...blankAdvancedRow("program"), id: "glow", name: "Glow" },
    ];
    d.payload.data.progression = [
      { ...row(1), programIds: ["glow"] },
      {
        ...row(3),
        programIds: ["glow"],
        resourceCapacities: [{ resourceId: "missing", capacity: 1 }],
      },
    ];
    expect(codes(d)).toEqual(
      expect.arrayContaining(["duplicate-program-binding", "invalid-resource-binding"])
    );
  });
  it("validates pact separation and bounded counts", () => {
    const d = named();
    d.payload.data.spellcasting = {
      mode: "pact",
      ability: "charisma",
      multiclass: { contributes: false, divisor: 1, rounding: "down" },
    };
    d.payload.data.progression = [
      {
        ...row(1),
        spellcasting: {
          cantrips: 2,
          known: 2,
          prepared: 0,
          slots: [],
          pactSlots: 1,
          pactLevel: 1,
        },
      },
    ];
    expect(conformDefinition(d)).toEqual([]);
    const p = d.payload.data.progression as Record<string, JsonValue>[];
    p[0] = {
      ...row(1),
      spellcasting: {
        cantrips: 101,
        known: 0,
        prepared: 0,
        slots: [1],
        pactSlots: 1,
        pactLevel: 1,
      },
    };
    expect(codes(d)).toEqual(
      expect.arrayContaining(["invalid-number", "incompatible-spell-slots"])
    );
  });
});

describe("reviewed native types and unsupported casting", () => {
  it.each(["mode", "rounding", "resourceId"] as const)(
    "never coerces malformed %s into typed data",
    (field) => {
      const d = named();
      const casting = d.payload.data.spellcasting as Record<string, JsonValue>;
      if (field === "mode") {
        casting.mode = ["full"];
        casting.ability = "wisdom";
      }
      if (field === "rounding")
        (casting.multiclass as Record<string, JsonValue>).rounding = ["down"];
      if (field === "resourceId") {
        d.payload.data.resources = [
          { ...blankAdvancedRow("resource"), id: "1", name: "Light", capacity: 3 },
        ];
        d.payload.data.progression = [
          { ...row(1), resourceCapacities: [{ resourceId: 1, capacity: 1 }] },
        ];
      }
      const original = JSON.stringify(d);
      expect(decodeClassDefinition(d)).toMatchObject({
        ok: false,
        status: "invalid",
        original: d,
      });
      expect(JSON.stringify(d)).toBe(original);
    }
  );
  it.each(["mode", "rounding"] as const)(
    "retains an unknown %s without interpreting its relationships",
    (field) => {
      const d = named();
      const casting = d.payload.data.spellcasting as Record<string, JsonValue>;
      if (field === "mode") casting.mode = "future";
      else (casting.multiclass as Record<string, JsonValue>).rounding = "future";
      expect(decodeClassDefinition(d)).toMatchObject({
        ok: false,
        status: "unsupported",
        original: d,
      });
      expect(conformDefinition(d).some((i) => i.severity === "invalid")).toBe(false);
    }
  );
  it("requires replacement casting when augmenting a known noncaster", () => {
    const { child } = pair();
    child.payload.data.castingRelationship = "augment";
    child.payload.data.progression = [
      {
        ...row(3),
        spellcasting: {
          cantrips: 2,
          known: 0,
          prepared: 0,
          slots: [],
          pactSlots: 0,
          pactLevel: 0,
        },
      },
    ];
    expect(codes(child)).toContain("noncasting-parent-augmentation");
    const dependencies = child.payload.data.dependencies as Record<string, JsonValue>;
    const parent = Object.values(dependencies)[0] as Record<string, JsonValue>;
    const definition = parent.definition as Record<string, JsonValue>;
    const payload = definition.payload as Record<string, JsonValue>;
    const data = payload.data as Record<string, JsonValue>;
    (data.spellcasting as Record<string, JsonValue>).mode = "future";
    expect(decodeClassDefinition(child)).toMatchObject({
      ok: false,
      status: "unsupported",
    });
  });
  it.each(["class", "subclass"] as const)(
    "preserves unmodeled equipment on %s as unsupported",
    (family) => {
      const d = family === "class" ? named() : pair().child;
      d.payload.data.equipment = { future: true };
      expect(decodeClassDefinition(d)).toMatchObject({
        ok: false,
        status: "unsupported",
        original: d,
      });
      expect(conformDefinition(d)).toContainEqual({
        path: "payload.data.equipment",
        code: "unsupported-field",
        severity: "unsupported",
      });
    }
  );
});
