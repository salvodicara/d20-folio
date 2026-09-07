import { describe, expect, it } from "vitest";
import {
  initializeDefinition,
  baseFields,
  blankEffect,
} from "../../src/lib/homebrew/model";
import { conformDefinition, formulaBounds } from "../../src/lib/homebrew/conformance";
import { decodePortable, encodePortable } from "../../src/lib/homebrew/portable";
import type { LibraryDefinition, LibraryVersion } from "../../src/lib/library/model";
function definition(
  family: "weapon" | "equipment" | "spell" | "feature",
  data = {}
): LibraryDefinition {
  const d = initializeDefinition(family);
  d.name = "Synthetic example";
  return { ...d, payload: { schema: 1, data: { ...d.payload.data, ...data } } };
}
const codes = (d: LibraryDefinition) => conformDefinition(d).map((x) => x.code);
describe("typed homebrew authoring", () => {
  it.each(["weapon", "equipment", "spell", "feature"] as const)(
    "initializes %s explicitly with ordinary conformant typed fields",
    (family) => {
      const d = definition(family);
      expect(conformDefinition(d)).toEqual([]);
      expect(baseFields(family).length).toBeGreaterThan(15);
      expect(d.payload.data.authoringVersion).toBe(1);
    }
  );
  it("does not silently configure P04 or unknown vocabulary", () => {
    const d = definition("weapon");
    d.payload.data = {};
    expect(codes(d)).toContain("unconfigured");
    d.payload.data = { authoringVersion: 42, alien: { foo: [1] } };
    const before = structuredClone(d);
    expect(codes(d)).toContain("unsupported-version");
    expect(d).toEqual(before);
  });
  it("validates bounded formulas without execution", () => {
    expect(formulaBounds("2d6 + 3")).toEqual({ min: 5, max: 15 });
    expect(formulaBounds("1d8-2")).toEqual({ min: -1, max: 6 });
    for (const s of [
      "0d6",
      "101d6",
      "1d1001",
      "alert(1)",
      "1d6*2",
      "1d6 + Infinity",
      "1d6 + 1d8",
      "9".repeat(200),
    ])
      expect(formulaBounds(s)).toBeNull();
  });
  it("validates weapon ranges, versatile dependency and composed rider", () => {
    expect(
      codes(
        definition("weapon", { rangeNormal: 80, rangeLong: 30, propertyThrown: true })
      )
    ).toContain("range-order");
    expect(codes(definition("weapon", { versatileFormula: "1d10" }))).toContain(
      "versatile-property"
    );
    expect(
      conformDefinition(
        definition("weapon", {
          propertyVersatile: true,
          versatileFormula: "1d10",
          effects: [{ ...blankEffect(), gate: "hit" }],
        })
      )
    ).toEqual([]);
  });
  it("validates armor and partial charge recovery capacity", () => {
    expect(
      codes(
        definition("equipment", { category: "armor", armorDex: "full", armorDexCap: 2 })
      )
    ).toContain("dex-cap-policy");
    expect(
      codes(
        definition("equipment", {
          maxCharges: 3,
          recoveryKind: "formula",
          recoveryBoundary: "dawn",
          recoveryFormula: "1d6",
        })
      )
    ).toContain("recovery-capacity");
    expect(
      conformDefinition(
        definition("equipment", {
          maxCharges: 6,
          recoveryKind: "formula",
          recoveryBoundary: "dawn",
          recoveryFormula: "1d6",
          effects: [
            { ...blankEffect(), kind: "healing", damageType: "", target: "self" },
          ],
        })
      )
    ).toEqual([]);
  });
  it("validates spell components, concentration, targeting and save-gated composition", () => {
    expect(codes(definition("spell", { materialConsumed: true }))).toContain(
      "material-required"
    );
    expect(codes(definition("spell", { concentration: true }))).toContain(
      "concentration-duration"
    );
    expect(
      codes(definition("spell", { effects: [{ ...blankEffect(), gate: "failed-save" }] }))
    ).toContain("save-required");
    expect(
      conformDefinition(
        definition("spell", {
          level: 1,
          resolution: "save",
          saveAbility: "dexterity",
          durationKind: "minute",
          durationAmount: 1,
          concentration: true,
          areaShape: "sphere",
          areaSize: 20,
          upcastFormula: "1d6",
          scalingDependency: "slot-level",
          effects: [{ ...blankEffect(), gate: "failed-save", target: "area" }],
        })
      )
    ).toEqual([]);
  });
  it("validates feature trigger, prerequisites, frequency and resources", () => {
    expect(
      codes(definition("feature", { activation: "passive", resourceCost: 1, maxUses: 3 }))
    ).toContain("passive-resource");
    expect(codes(definition("feature", { activation: "reaction" }))).toContain(
      "reaction-condition"
    );
    expect(codes(definition("feature", { prerequisite: "unknown-script" }))).toContain(
      "unsupported-option"
    );
    expect(
      conformDefinition(
        definition("feature", {
          activation: "bonus-action",
          maxUses: 3,
          resourceCost: 1,
          recoveryKind: "full",
          recoveryBoundary: "long-rest",
          frequency: "once-per-turn",
          effects: [
            {
              ...blankEffect(),
              kind: "condition",
              formula: "",
              damageType: "",
              condition: "prone",
              target: "one",
            },
          ],
        })
      )
    ).toEqual([]);
  });
  it("rejects instance state and malformed effects but preserves unknown declarations", () => {
    const d = definition("spell", {
      prepared: true,
      effects: [{ ...blankEffect(), bogus: 5 }],
      unsupported: ["E22"],
      tableNote: "Manual table note",
    });
    const before = structuredClone(d);
    expect(codes(d)).toContain("instance-state");
    expect(codes(d)).toContain("unsupported-field");
    expect(codes(d)).toContain("unsupported-declaration");
    expect(d).toEqual(before);
  });
  it("exports drafts and exact stable snapshots with immutable provenance", () => {
    const d = definition("weapon");
    const v: LibraryVersion = {
      schema: 1,
      ownerUid: "alice",
      entryId: "sword",
      version: 2,
      definition: d,
      provenance: null,
      operationId: "publish2",
    };
    const decoded = decodePortable(encodePortable(d, v));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.version).toEqual(v);
    expect(() => encodePortable({ ...d, name: "changed" }, v)).toThrow(
      "version-definition-mismatch"
    );
    const draft = decodePortable(encodePortable(d));
    expect(draft.ok && draft.version).toBe(null);
  });
  it("preserves unknown JSON and exact original whitespace while rejecting malformed envelopes", () => {
    const d = definition("spell", {
      future: { values: [true, null, 2] },
      authoringVersion: 7,
    });
    const original = "  " + JSON.stringify(d, null, 2) + "\n";
    const decoded = decodePortable(original);
    expect(decoded.ok).toBe(true);
    expect(decoded.original).toBe(original);
    if (decoded.ok) expect(decoded.definition).toEqual(d);
    for (const text of [
      "not json",
      '{"schema":7}',
      JSON.stringify({
        format: "d20-folio-homebrew",
        schema: 1,
        kind: "stable",
        definition: d,
        version: null,
      }),
    ])
      expect(decodePortable(text)).toMatchObject({ ok: false, original: text });
  });
});

describe("portable and authoring adversarial boundaries", () => {
  it("rejects numeric identifiers inside stable provenance", () => {
    const d = definition("feature");
    const version = {
      schema: 1,
      ownerUid: "alice",
      entryId: "feature",
      version: 1,
      definition: d,
      operationId: "publish",
      provenance: {
        source: { ownerUid: "bob", id: "original" },
        sourceVersion: 1,
        senderUid: 123,
        offerId: "offer",
        grantId: "123~offer",
      },
    };
    const original = JSON.stringify({
      format: "d20-folio-homebrew",
      schema: 1,
      kind: "stable",
      definition: d,
      version,
    });
    expect(decodePortable(original)).toMatchObject({ ok: false, original });
  });
  it.each([
    ["weapon", { damageFormula: "1d4-5" }, "damage-formula"],
    [
      "weapon",
      { propertyVersatile: true, versatileFormula: "1d8", propertyTwoHanded: true },
      "versatile-two-handed",
    ],
    ["equipment", { category: "shield" }, "shield-bonus-required"],
    ["equipment", { maxCharges: 5, recoveryKind: "full" }, "recovery-resource"],
    ["spell", { resolution: "save" }, "save-ability"],
    ["spell", { areaShape: "cone" }, "area-required"],
    ["spell", { upcastFormula: "1d6" }, "scaling-dependency"],
    ["spell", { activation: "time" }, "activation-time"],
    ["spell", { material: true }, "material-description"],
    ["feature", { prerequisite: "level" }, "prerequisite-level"],
    ["feature", { prerequisite: "ability" }, "prerequisite-ability"],
  ] as const)("%s rejects incompatible dependency %j", (family, data, code) => {
    expect(codes(definition(family, data))).toContain(code);
  });
  it("validates every effect and retains order without normalizing source payload", () => {
    const d = definition("spell", {
      effects: [
        { ...blankEffect(), formula: "1d4-5" },
        {
          ...blankEffect(),
          kind: "condition",
          formula: "",
          damageType: "",
          condition: "prone",
          durationKind: "round",
          durationAmount: 0,
        },
      ],
    });
    const before = structuredClone(d);
    const issues = conformDefinition(d);
    expect(issues).toContainEqual({
      path: "payload.data.effects.0.formula",
      code: "effect-formula",
      severity: "invalid",
    });
    expect(issues).toContainEqual({
      path: "payload.data.effects.1.durationAmount",
      code: "duration-required",
      severity: "invalid",
    });
    expect(d).toEqual(before);
  });
});

it("unknown authoring versions cannot bypass universal draft and template invariants", () => {
  const d = definition("weapon", { authoringVersion: 2, remainingCharges: 3 });
  d.name = "";
  expect(codes(d)).toEqual(
    expect.arrayContaining(["required", "instance-state", "unsupported-version"])
  );
});
