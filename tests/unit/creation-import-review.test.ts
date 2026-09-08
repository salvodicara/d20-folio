import { describe, expect, it } from "vitest";
import { analyzeImport, reviewImport } from "@/lib/character-creation/import-review";

const original = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema: 3,
    build: {
      name: "Elia",
      race: "human",
      classes: [{ classId: "wizard", level: 1 }],
      abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
      customs: { spells: [{ name: "Prism", custom: true }] },
      overrides: { hpMax: 11 },
      lore: { backstory: "Private story" },
    },
    state: { hp: { current: 7, temp: 2 } },
    ...extra,
  });

describe("creation import comparison", () => {
  it("does not infer rules edition from schema and preserves exact original privately", () => {
    const bytes = "\n " + original() + "\n";
    const analysis = analyzeImport(bytes);
    expect(analysis.edition).toEqual({ kind: "unknown" });
    expect(analysis.sourceSchema).toBe(3);
    expect(analysis.original).toBe(bytes);
    expect(analysis.categories.map((c) => c.id)).toEqual([
      "origins",
      "classes",
      "abilities",
      "custom",
      "overrides",
      "state",
    ]);
    expect(JSON.stringify(analysis.categories)).not.toContain("Private story");
  });

  it.each(["2014", "2024"])("detects explicit %s independently of schema", (edition) => {
    expect(analyzeImport(original({ edition })).edition).toEqual({
      kind: "known",
      value: edition,
    });
  });

  it("keeps conflicting or future edition metadata visible without guessing", () => {
    expect(analyzeImport(original({ edition: "2034" })).edition).toEqual({
      kind: "unsupported",
      values: ["2034"],
    });
    expect(
      analyzeImport(original({ edition: "2014", rulesEdition: "2024" })).edition
    ).toEqual({ kind: "conflicting", values: ["2014", "2024"] });
  });

  it("records reviewed categories without claiming mechanical conversion or losing unresolved choices", () => {
    const analysis = analyzeImport(original());
    const review = reviewImport(analysis, "2014", ["origins", "custom"]);
    expect(review).toEqual({
      declaredEdition: "2014",
      reviewed: ["origins", "custom"],
      unresolved: ["origins", "classes", "abilities", "custom", "overrides", "state"],
    });
    expect(analysis.original).toBe(original());
    expect(() => reviewImport(analysis, "2014", ["spells"])).toThrow(
      "invalid-import-review"
    );
    expect(() => reviewImport(analysis, "2014", ["origins", "origins"])).toThrow(
      "invalid-import-review"
    );
  });

  it("rejects an unsupported file format before producing a copy plan", () => {
    expect(() => analyzeImport(original({ schema: 4 }))).toThrow(
      "unsupported-source-schema"
    );
  });

  it("warns when unknown custom mechanics survive only in the original archive", () => {
    const source = JSON.parse(original()) as {
      build: { customs: Record<string, unknown>; overrides: Record<string, unknown> };
      extension?: unknown;
    };
    source.build.customs.futureFamily = [{ automation: { future: true } }];
    source.build.overrides.futureDefense = 4;
    source.extension = { future: true };
    const analysis = analyzeImport(JSON.stringify(source));
    expect(analysis.categories.find((c) => c.id === "unrecognized")).toEqual({
      id: "unrecognized",
      paths: ["build.customs", "build.overrides", "extension"],
    });
    expect(
      reviewImport(
        analysis,
        "unknown",
        analysis.categories.map((c) => c.id)
      ).unresolved
    ).toContain("unrecognized");
  });

  it("keeps malformed edition payloads in the original without promoting arbitrary objects into metadata", () => {
    const bytes = original({ edition: { private: "not an edition" } });
    const analysis = analyzeImport(bytes);
    expect(analysis.edition).toEqual({ kind: "invalid", fields: ["edition"] });
    expect(analysis.original).toBe(bytes);
  });
});
