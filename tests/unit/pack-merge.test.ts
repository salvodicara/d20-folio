/**
 * The content-pack merge helpers (src/lib/pack-merge.ts) — the strictness IS
 * the contract: an id collision between public and pack, or an overlay patch
 * aimed at a missing entry, must THROW at module init (never half-merge).
 */
import { describe, expect, it } from "vitest";
import { mergeCatalogue, mergePack, mergePackRecord } from "@/lib/pack-merge";

describe("mergePack", () => {
  it("concatenates pack entries after the public ones", () => {
    expect(mergePack("spell", [{ id: "a" }], [{ id: "b" }]).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns a copy of the public array when the pack is empty", () => {
    const base = [{ id: "a" }];
    const merged = mergePack("spell", base, []);
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });

  it("throws on a public/pack id collision", () => {
    expect(() => mergePack("spell", [{ id: "a" }], [{ id: "a" }])).toThrow(
      /duplicate spell id "a"/
    );
  });

  it("throws on a duplicate WITHIN the pack", () => {
    expect(() => mergePack("feat", [], [{ id: "x" }, { id: "x" }])).toThrow(
      /duplicate feat id "x"/
    );
  });
});

describe("mergePackRecord", () => {
  it("merges keys and throws on collision", () => {
    expect(mergePackRecord("scenario", { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    expect(() => mergePackRecord("scenario", { a: 1 }, { a: 2 })).toThrow(
      /duplicate scenario id "a"/
    );
  });
});

describe("mergeCatalogue", () => {
  it("passes the base through untouched when there is no pack contribution", () => {
    const base = { a: { name: "A" } };
    expect(mergeCatalogue("spell", base, undefined, undefined)).toBe(base);
  });

  it("adds pack entries and applies overlay patches field-wise", () => {
    const merged = mergeCatalogue(
      "spell",
      { a: { name: "SRD Name", description: "d" } },
      { b: { name: "Pack Entry" } },
      { a: { name: "PHB Name" } }
    );
    expect(merged["a"]).toEqual({ name: "PHB Name", description: "d" });
    expect(merged["b"]).toEqual({ name: "Pack Entry" });
  });

  it("throws when a pack ADDITION collides with a public key", () => {
    expect(() =>
      mergeCatalogue("spell", { a: { name: "x" } }, { a: { name: "y" } }, undefined)
    ).toThrow(/duplicate spell catalogue key "a"/);
  });

  it("throws when an overlay PATCH targets a missing entry", () => {
    expect(() =>
      mergeCatalogue("spell", { a: { name: "x" } }, undefined, { gone: { name: "y" } })
    ).toThrow(/overlay patches missing spell entry "gone"/);
  });
});
