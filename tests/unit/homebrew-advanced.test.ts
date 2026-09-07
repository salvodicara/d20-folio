import { describe, expect, it } from "vitest";
import { initializeDefinition, type BaseFamily } from "../../src/lib/homebrew/model";
import { conformDefinition } from "../../src/lib/homebrew/conformance";
describe("P06 authoring", () => {
  it.each(["monster", "campaign-rule"])("accepts a named initialized %s", (family) => {
    const d = initializeDefinition(family as BaseFamily);
    d.name = "Synthetic";
    expect(conformDefinition(d)).toEqual([]);
  });
});

import { blankAdvancedRow } from "../../src/lib/homebrew/advanced";
import { blankEffect, BASE_FAMILIES } from "../../src/lib/homebrew/model";
import { decodePortable, encodePortable } from "../../src/lib/homebrew/portable";
import type { JsonValue } from "../../src/lib/library/model";
const monster = () => {
  const d = initializeDefinition("monster");
  d.name = "Test monster";
  return d;
};
const row = (
  kind: Parameters<typeof blankAdvancedRow>[0],
  values: Record<string, JsonValue>
) => ({ ...blankAdvancedRow(kind), ...values });
const attack = () =>
  row("program", {
    id: "bite",
    name: "Bite",
    resolution: "attack",
    reach: 1.5,
    effects: [{ ...blankEffect(), gate: "hit" }],
  });
const composed = () => {
  const d = monster();
  d.payload.data.resources = [
    row("resource", {
      id: "power",
      name: "Power",
      capacity: 3,
      recoveryKind: "recharge",
      recoveryBoundary: "turn-start",
      rechargeThreshold: 5,
    }),
  ];
  d.payload.data.programs = [
    attack(),
    row("program", {
      ...attack(),
      id: "tail",
      name: "Tail",
      kind: "legendary",
      activation: "legendary",
      resourceId: "power",
      resourceCost: 2,
    }),
    row("program", {
      id: "multi",
      name: "Multiattack",
      kind: "multiattack",
      steps: [
        row("step", { programId: "bite" }),
        row("step", { programId: "tail", count: 1 }),
      ],
    }),
  ];
  return d;
};
it("validates ordered attacks, legendary cost and recharge without changing data", () => {
  const d = composed();
  const before = JSON.stringify(d);
  expect(conformDefinition(d)).toEqual([]);
  expect(JSON.stringify(d)).toBe(before);
  expect(BASE_FAMILIES).toEqual(["weapon", "equipment", "spell", "feature"]);
});
it.each(["0", "1/8", "1/4", "1/2", "30"])("accepts CR %s", (cr) => {
  const d = monster();
  d.payload.data.challengeRating = cr;
  expect(conformDefinition(d)).toEqual([]);
});
it.each([
  ["rangeLong", 1, "range-order"],
  ["reach", -1, "invalid-number"],
  ["resourceId", "missing", "missing-resource"],
  ["resourceCost", 4, "resource-capacity"],
])("rejects program boundary %s", (key, value, code) => {
  const d = composed();
  const programs = d.payload.data.programs as Record<string, JsonValue>[];
  Object.assign(at(programs, 1), { rangeNormal: 2, rangeLong: 3, [key]: value });
  expect(conformDefinition(d)).toContainEqual({
    path: `payload.data.programs.1.${key}`,
    code,
    severity: "invalid",
  });
});
it("identifies dangling and nested multiattack references at the step", () => {
  const d = composed();
  const programs = d.payload.data.programs as Record<string, JsonValue>[];
  const steps = at(programs, 2).steps as Record<string, JsonValue>[];
  at(steps, 0).programId = "lost";
  at(steps, 1).programId = "multi";
  expect(conformDefinition(d)).toEqual(
    expect.arrayContaining([
      {
        path: "payload.data.programs.2.steps.0.programId",
        code: "missing-program",
        severity: "invalid",
      },
      {
        path: "payload.data.programs.2.steps.1.programId",
        code: "nested-multiattack",
        severity: "invalid",
      },
    ])
  );
});
it("rejects duplicate resource IDs, recharge threshold and negative HP minima", () => {
  const d = composed();
  const resources = d.payload.data.resources as Record<string, JsonValue>[];
  resources.push({ ...resources[0], rechargeThreshold: 7 });
  d.payload.data.hpFormula = "1d6-2";
  expect(conformDefinition(d)).toEqual(
    expect.arrayContaining([
      { path: "payload.data.resources.1.id", code: "duplicate-id", severity: "invalid" },
      {
        path: "payload.data.resources.1.rechargeThreshold",
        code: "invalid-number",
        severity: "invalid",
      },
      { path: "payload.data.hpFormula", code: "hp-formula", severity: "invalid" },
    ])
  );
});
it("validates area save damage composed with a timed condition", () => {
  const d = monster();
  d.payload.data.programs = [
    row("program", {
      id: "breath",
      name: "Breath",
      resolution: "save",
      saveAbility: "dexterity",
      saveDc: 13,
      areaShape: "cone",
      areaSize: 4.5,
      concentration: true,
      effects: [
        { ...blankEffect(), target: "area", gate: "failed-save" },
        {
          ...blankEffect(),
          kind: "condition",
          formula: "",
          damageType: "",
          condition: "restrained",
          gate: "failed-save",
          durationKind: "round",
          durationAmount: 1,
        },
      ],
    }),
  ];
  expect(conformDefinition(d)).toEqual([]);
  const p = at(d.payload.data.programs as Record<string, JsonValue>[], 0);
  p.resolution = "none";
  p.areaShape = "none";
  expect(conformDefinition(d)).toEqual(
    expect.arrayContaining([
      {
        path: "payload.data.programs.0.effects.0.gate",
        code: "save-required",
        severity: "invalid",
      },
      {
        path: "payload.data.programs.0.effects.0.target",
        code: "area-required",
        severity: "invalid",
      },
    ])
  );
});
it("requires declarations for a typed rule and validates resource policy references", () => {
  const d = initializeDefinition("campaign-rule");
  d.name = "Rule";
  d.payload.data.application = "typed";
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.application",
    code: "typed-declarations-required",
    severity: "invalid",
  });
  d.payload.data.policies = [row("policy", { id: "ac", fact: "armor-class", amount: 2 })];
  d.payload.data.dependencies = [row("dependency", { mechanicId: "official-ac" })];
  expect(conformDefinition(d)).toEqual([]);
  at(d.payload.data.policies as Record<string, JsonValue>[], 0).fact =
    "resource-capacity";
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.policies.0.resourceId",
    code: "missing-resource",
    severity: "invalid",
  });
});
it("preserves unknown nested options and keys through portable decoding", () => {
  const d = composed();
  const p = at(d.payload.data.programs as Record<string, JsonValue>[], 0);
  p.trigger = "future-event";
  p.future = { version: 2 };
  const original = encodePortable(d);
  const parsed = decodePortable(original);
  expect(parsed).toMatchObject({ ok: true, original, definition: d });
  expect(conformDefinition(d)).toEqual(
    expect.arrayContaining([
      {
        path: "payload.data.programs.0.trigger",
        code: "unsupported-option",
        severity: "unsupported",
      },
      {
        path: "payload.data.programs.0.future",
        code: "unsupported-field",
        severity: "unsupported",
      },
    ])
  );
  expect(encodePortable(d)).toBe(original);
});
it("rejects remaining instance resources even in an unknown authoring version", () => {
  const d = monster();
  d.payload.data.authoringVersion = 2;
  d.payload.data.currentHp = 3;
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.currentHp",
    code: "instance-state",
    severity: "invalid",
  });
});
it("rejects nested remaining resource state", () => {
  const d = composed();
  at(d.payload.data.resources as Record<string, JsonValue>[], 0).remaining = 2;
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.resources.0.remaining",
    code: "instance-state",
    severity: "invalid",
  });
});
it("rejects effects embedded in multiattack instead of its referenced programs", () => {
  const d = composed();
  at(d.payload.data.programs as Record<string, JsonValue>[], 2).effects = [
    { ...blankEffect() },
  ];
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.programs.2.effects",
    code: "multiattack-effects",
    severity: "invalid",
  });
});

function at<T>(values: T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error("Missing fixture row");
  return value;
}
it("preserves unknown program and step kinds without imposing known fields", () => {
  const d = composed();
  const programs = d.payload.data.programs as Record<string, JsonValue>[];
  at(programs, 0).kind = "future-program";
  at(programs, 2).steps = [{ kind: "future-step", futureId: "x" }];
  const original = JSON.stringify(d);
  expect(conformDefinition(d).filter((x) => x.severity === "invalid")).toEqual([]);
  expect(conformDefinition(d)).toEqual(
    expect.arrayContaining([
      {
        path: "payload.data.programs.0.kind",
        code: "unsupported-option",
        severity: "unsupported",
      },
      {
        path: "payload.data.programs.2.steps.0.kind",
        code: "unsupported-option",
        severity: "unsupported",
      },
    ])
  );
  expect(JSON.stringify(d)).toBe(original);
});
it("keeps identity and instance-state safety for unknown programs", () => {
  const d = monster();
  d.payload.data.programs = [
    { kind: "future-program", id: "", name: "Future", source: "custom", remaining: 2 },
  ];
  const issues = conformDefinition(d);
  expect(issues).toContainEqual({
    path: "payload.data.programs.0.id",
    code: "required",
    severity: "invalid",
  });
  expect(issues).toContainEqual({
    path: "payload.data.programs.0.remaining",
    code: "instance-state",
    severity: "invalid",
  });
  expect(issues.some((x) => x.path.endsWith("activation"))).toBe(false);
});
it("rejects summed repeated multiattack costs including the container", () => {
  const d = composed();
  const programs = d.payload.data.programs as Record<string, JsonValue>[];
  at(programs, 2).steps = [row("step", { programId: "tail", count: 2 })];
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.programs.2.steps",
    code: "multiattack-resource-capacity",
    severity: "invalid",
  });
  at(programs, 2).steps = [row("step", { programId: "tail", count: 1 })];
  Object.assign(at(programs, 2), { resourceId: "power", resourceCost: 2 });
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.programs.2.steps",
    code: "multiattack-resource-capacity",
    severity: "invalid",
  });
});
it("preserves an unknown nested effect kind without requiring damage fields", () => {
  const d = monster();
  d.payload.data.programs = [
    { ...attack(), effects: [{ kind: "future-effect", futureValue: 1 }] },
  ];
  expect(conformDefinition(d).filter((x) => x.severity === "invalid")).toEqual([]);
  expect(conformDefinition(d)).toContainEqual({
    path: "payload.data.programs.0.effects.0.kind",
    code: "unsupported-option",
    severity: "unsupported",
  });
});
