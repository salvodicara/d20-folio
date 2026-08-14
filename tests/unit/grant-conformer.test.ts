import { describe, expect, it } from "vitest";

import type { ExactSchema } from "@/lib/exact-schema";
import { GRANT_SCHEMA } from "@/lib/grant-schema";
import { conformGrant, conformGrants } from "@/lib/grants";
import { buildCurrentAutomationCorpus } from "@tests/unit/__helpers__/automation-coverage";

type GrantCandidate = {
  readonly path: string;
  readonly value: Record<string, unknown>;
};

function sample(schema: ExactSchema): unknown {
  switch (schema.kind) {
    case "string":
      return "x";
    case "number":
      return 1;
    case "boolean":
      return true;
    case "literal":
      return schema.value;
    case "array":
      return schema.minItems === undefined
        ? []
        : Array.from({ length: schema.minItems }, () => sample(schema.item));
    case "tuple":
      return schema.items.map(sample);
    case "record":
      return {};
    case "object":
      return Object.fromEntries(
        Object.entries(schema.required)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sample(child)])
      );
    case "union": {
      const first = schema.variants[0];
      if (!first) throw new TypeError("empty schema union");
      return sample(first);
    }
    case "discriminated-union": {
      const first = Object.values(schema.variants)[0];
      if (!first) throw new TypeError("empty discriminated schema union");
      return sample(first);
    }
    case "ref":
      return { range: 60, type: "darkvision" };
    case "custom":
      switch (schema.name) {
        case "proficiency-token":
          return "x";
        case "resource-selector":
          return { kind: "pool", owner: "owner", resourceId: "x" };
        case "resource-spec":
          return {
            kind: "count",
            id: "x",
            capacity: { kind: "bounded", amount: { kind: "fixed", value: 1 } },
            initial: { kind: "full" },
            recoveries: [],
          };
        case "resource-term":
          return {
            selector: { kind: "pool", owner: "owner", resourceId: "x" },
            amount: { kind: "fixed", value: 1 },
          };
        default:
          throw new TypeError(`missing custom sample: ${schema.name}`);
      }
  }
}

function schemaBranches(): Array<{
  readonly label: string;
  readonly schema: ExactSchema;
}> {
  const result: Array<{ readonly label: string; readonly schema: ExactSchema }> = [];
  const variants: Readonly<Record<string, ExactSchema>> = GRANT_SCHEMA.variants;
  for (const [kind, schema] of Object.entries(variants)) {
    if (schema.kind === "union") {
      schema.variants.forEach((branch, index) => {
        result.push({ label: `${kind}[${index}]`, schema: branch });
      });
    } else {
      result.push({ label: kind, schema });
    }
  }
  return result;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currentCorpusGrants(roots: readonly unknown[]): GrantCandidate[] {
  const result: GrantCandidate[] = [];
  const visited = new WeakSet<object>();

  const visit = (value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (key === "grants" && Array.isArray(child)) {
        child.forEach((entry, index) => {
          if (record(entry) && typeof entry.type === "string") {
            result.push({ path: `${childPath}[${index}]`, value: entry });
          }
        });
      }
      visit(child, childPath);
    }
  };

  roots.forEach((root, index) => visit(root, `corpus[${index}]`));
  return result;
}

describe("exact Grant conformer", () => {
  it("accepts every structural branch and rejects branch-local mutations", () => {
    const branches = schemaBranches();
    expect(Object.keys(GRANT_SCHEMA.variants)).toHaveLength(127);
    expect(branches).toHaveLength(130);

    for (const branch of branches) {
      const value = sample(branch.schema);
      const parsed = conformGrant(value);
      expect(parsed, branch.label).not.toBeNull();
      expect(Object.isFrozen(parsed), branch.label).toBe(true);

      if (!record(value)) throw new TypeError(`non-object Grant branch: ${branch.label}`);
      expect(
        conformGrant({ ...value, futureField: true }),
        `${branch.label}: unknown field`
      ).toBeNull();

      const missingType = Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "type")
      );
      expect(conformGrant(missingType), `${branch.label}: missing type`).toBeNull();

      expect(
        conformGrant({ ...value, type: `${String(value.type)}-future` }),
        `${branch.label}: invalid discriminator`
      ).toBeNull();
    }
  });

  it("conforms the complete composed SRD and pack corpus", async () => {
    const entities = await buildCurrentAutomationCorpus();
    const candidates = currentCorpusGrants(entities.map((entry) => entry.data));
    expect(candidates.length).toBeGreaterThan(100);

    const failures: string[] = [];
    for (const candidate of candidates) {
      const parsed = conformGrant(candidate.value);
      if (parsed === null) {
        failures.push(candidate.path);
        continue;
      }
      if (JSON.stringify(conformGrant(parsed)) !== JSON.stringify(parsed)) {
        failures.push(`${candidate.path}: unstable canonical form`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("recurses through while-active and choice bundles with one grammar", () => {
    const nested = {
      bundleKey: "stance",
      options: [
        {
          id: "night",
          grants: [
            {
              activeKey: "night-active",
              grants: [{ range: 60, type: "darkvision" }],
              type: "while-active",
            },
          ],
        },
      ],
      type: "choice-grant-bundle",
    };
    const parsed = conformGrant(nested);
    expect(parsed).toEqual(nested);
    expect(Object.isFrozen(parsed)).toBe(true);
    if (parsed?.type !== "choice-grant-bundle") return;
    expect(Object.isFrozen(parsed.options[0]?.grants[0])).toBe(true);

    const malformed = structuredClone(nested);
    const inner = malformed.options[0]?.grants[0]?.grants[0];
    if (!inner) throw new TypeError("missing nested fixture");
    Object.assign(inner, { range: "sixty" });
    expect(conformGrant(malformed)).toBeNull();

    const nestedUnknown = structuredClone(nested);
    const nestedLeaf = nestedUnknown.options[0]?.grants[0]?.grants[0];
    if (!nestedLeaf) throw new TypeError("missing nested fixture");
    Object.assign(nestedLeaf, { futureField: true });
    expect(conformGrant(nestedUnknown)).toBeNull();
  });

  it("has one resource declaration and the two live payment dialects", () => {
    const amount = { kind: "fixed", value: 1 };
    const spec = {
      kind: "count",
      id: "mist-step",
      capacity: { kind: "bounded", amount },
      initial: { kind: "full" },
      recoveries: [{ trigger: { kind: "long-rest" }, amount: { kind: "full" } }],
    };

    // The canonical pool declaration stays a `resource` grant.
    expect(conformGrant({ type: "resource", spec })).toEqual({ type: "resource", spec });

    // Live payment dialect 1 — tracker-backed capability fields.
    const trackerCast = {
      type: "free-cast-spell",
      spellId: "misty-step",
      chargesPerRest: 1,
      rest: "long",
    };
    expect(conformGrant(trackerCast)).toEqual(trackerCast);

    // Live payment dialect 2 — a typed item resource declared on the item.
    const itemCast = {
      type: "free-cast-spell",
      spellId: "misty-step",
      resourceCost: { resourceId: "mist-step" },
    };
    expect(conformGrant(itemCast)).toEqual(itemCast);

    // Granted actions pay through the tracker CostSpec dialect.
    const action = {
      type: "granted-action",
      slot: "bonus",
      id: "mist-step",
      cost: { kind: "tracker", trackerId: "mist-step", amount: 1 },
    };
    expect(conformGrant(action)).toEqual(action);

    // The dropped selector/amount ResourceTerm dialect stays rejected —
    // fail-closed: no grant kind accepts a foreign payment shape.
    const term = {
      selector: { kind: "pool", owner: "owner", resourceId: "mist-step" },
      amount,
    };
    for (const foreign of [
      { type: "free-cast-spell", spellId: "misty-step", cost: term },
      { type: "free-cast-from-list", spellIds: ["misty-step"], cost: term },
      {
        type: "granted-action",
        slot: "bonus",
        id: "mist-step",
        cost: term,
      },
      {
        type: "while-active",
        activeKey: "mist",
        grants: [],
        activation: { action: "bonus", cost: term },
      },
    ]) {
      expect(conformGrant(foreign)).toBeNull();
    }
  });

  it("rejects hostile JSON shapes and recursive overflow", () => {
    const cycle: Record<string, unknown> = {
      activeKey: "cycle",
      grants: [],
      type: "while-active",
    };
    (cycle.grants as unknown[]).push(cycle);

    const accessor = { range: 60, type: "darkvision" };
    Object.defineProperty(accessor, "range", {
      enumerable: true,
      get: () => 60,
    });
    const symbol = { range: 60, type: "darkvision" };
    Object.defineProperty(symbol, Symbol("hidden"), { value: true });
    const customPrototype = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(customPrototype, { range: 60, type: "darkvision" });
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    Object.assign(nullPrototype, { range: 60, type: "darkvision" });

    let tooDeep: Record<string, unknown> = { range: 60, type: "darkvision" };
    for (let index = 0; index < 70; index += 1) {
      tooDeep = { activeKey: `depth-${index}`, grants: [tooDeep], type: "while-active" };
    }

    for (const value of [
      cycle,
      accessor,
      symbol,
      customPrototype,
      nullPrototype,
      { range: -0, type: "darkvision" },
      { range: Number.NaN, type: "darkvision" },
      { damageTypeChoices: new Array(1), type: "pact-weapon" },
      tooDeep,
    ]) {
      expect(conformGrant(value)).toBeNull();
    }
  });

  it("preserves list order while returning a canonical frozen clone", () => {
    const input = [
      { type: "air-and-water-breathing" },
      { range: 60, type: "darkvision" },
    ];
    const parsed = conformGrants(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.[1])).toBe(true);
  });
});
