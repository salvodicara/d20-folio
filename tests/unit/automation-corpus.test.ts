import { describe, expect, it } from "vitest";

import {
  compileAutomationCorpus,
  compileAutomationCorpusEntity,
  type AutomationCorpusEntity,
} from "@/lib/automation-corpus";

function feature(
  overrides: Partial<AutomationCorpusEntity> = {}
): AutomationCorpusEntity {
  return {
    entityKey: "class-feature:example",
    schema: "class-feature",
    data: {
      id: "example",
      class: "fighter",
      level: 1,
      source: "SRD",
      grants: [{ type: "darkvision", range: 60 }],
    },
    presenters: [
      {
        keyPrefix: "class-feature.example",
        localized: [
          { name: "Example", description: "An unresolved rule." },
          { name: "Esempio", description: "Una regola non risolta." },
        ],
      },
    ],
    ...overrides,
  };
}

describe("automation corpus adapter", () => {
  it("recursively receipts every structured leaf", () => {
    const result = compileAutomationCorpusEntity({
      entityKey: "equipment:test-blade",
      schema: "equipment",
      data: {
        id: "test-blade",
        category: "weapon",
        cost: { amount: 5, unit: "gp" },
        damage: { die: "1d6", type: "slashing" },
        source: "SRD",
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.receipt?.clauses.flatMap((clause) => clause.consumedPaths)).toEqual(
      expect.arrayContaining([
        "category",
        "cost.amount",
        "cost.unit",
        "damage.die",
        "damage.type",
      ])
    );
  });

  it("receipts an intentional object back-reference exactly once", () => {
    const companion: Record<string, unknown> = {
      id: "default",
      ac: 13,
    };
    companion.variants = [companion];

    const result = compileAutomationCorpusEntity(
      feature({
        data: {
          id: "example",
          class: "fighter",
          level: 1,
          source: "SRD",
          companion,
        },
        presenters: [],
      })
    );

    expect(result.errors).toEqual([]);
    expect(result.receipt?.clauses.flatMap((clause) => clause.consumedPaths)).toEqual(
      expect.arrayContaining(["companion.id", "companion.ac", "companion.variants[0]"])
    );
  });

  it("rejects cycles outside the explicit companion graph", () => {
    const cost: Record<string, unknown> = { amount: 5 };
    cost.self = cost;

    const result = compileAutomationCorpusEntity({
      entityKey: "equipment:cyclic",
      schema: "equipment",
      data: { id: "cyclic", category: "gear", cost, source: "SRD" },
    });

    expect(result.errors).toContain("cyclic mechanic value at cost.self");
  });

  it("fails unknown root and nested fields", () => {
    const root = compileAutomationCorpusEntity({
      entityKey: "equipment:future",
      schema: "equipment",
      data: { id: "future", source: "SRD", futureFact: true },
    });
    expect(root.errors).toContain("unknown field: futureFact");

    const nested = compileAutomationCorpusEntity(
      feature({
        data: {
          id: "example",
          class: "fighter",
          level: 1,
          source: "SRD",
          mechanics: { futureFact: true },
        },
      })
    );
    expect(nested.errors).toContain("unknown field: mechanics.futureFact");
  });

  it("keeps unparsed prose manual even when grants are present", () => {
    const result = compileAutomationCorpusEntity(feature());
    expect(result.errors).toEqual([]);
    expect(result.receipt?.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ handler: "grant" }),
        expect.objectContaining({
          handler: "manual:open-adjudication",
          consumedPaths: ["presenter.class-feature.example.description"],
        }),
      ])
    );
  });

  it("fails incomplete or newly-shaped presenter prose", () => {
    const incomplete = compileAutomationCorpusEntity(
      feature({
        presenters: [
          {
            keyPrefix: "class-feature.example",
            localized: [{ name: "Example", description: "Rule" }, { name: "Esempio" }],
          },
        ],
      })
    );
    expect(incomplete.errors).toContain(
      "presenter locale path mismatch: class-feature.example.description"
    );

    const unknown = compileAutomationCorpusEntity(
      feature({
        presenters: [
          {
            keyPrefix: "class-feature.example",
            localized: [
              { name: "Example", automationStatus: "done" },
              { name: "Esempio", automationStatus: "fatto" },
            ],
          },
        ],
      })
    );
    expect(unknown.errors).toContain(
      "unknown presenter field: class-feature.example.automationStatus"
    );
  });

  it("requires external bilingual evidence for manual data leaves", () => {
    const missing = compileAutomationCorpusEntity({
      entityKey: "beast:test",
      schema: "beast",
      data: {
        id: "test",
        cr: 1,
        size: "Medium",
        ac: 12,
        hp: 10,
        speeds: { walk: 30 },
        abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 2, WIS: 10, CHA: 4 },
        attacks: [],
        traits: ["pack-tactics"],
      },
    });
    expect(missing.errors).toContain(
      "manual data path traits[0] has no presenter evidence"
    );
  });

  it("rejects duplicate entity receipts", () => {
    const entry = feature({ presenters: [] });
    const audit = compileAutomationCorpus([entry, entry]);
    expect(audit.ok).toBe(false);
    expect(audit.errors).toContain("duplicate entity key: class-feature:example");
  });
});
