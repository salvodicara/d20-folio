/**
 * A pack id the public SRD data took over (#1248: two Fighting Style feats) yields to
 * the public entry while an older pack still carries it, so the app and the pack can
 * land in either order. Any other collision still throws.
 */
import { describe, expect, it } from "vitest";
import { mergeCatalogue, mergePack, mergePackRecord } from "@/lib/pack-merge";

const PUBLIC = { id: "blessed-warrior", from: "public" };
const PACK = { id: "blessed-warrior", from: "pack" };

describe("an id promoted from the pack to the public data", () => {
  it("mergePack keeps the public entry and drops the pack copy", () => {
    expect(mergePack("feat", [PUBLIC], [PACK, { id: "x", from: "pack" }])).toEqual([
      PUBLIC,
      { id: "x", from: "pack" },
    ]);
  });

  it("mergePackRecord keeps the public value", () => {
    expect(
      mergePackRecord(
        "feat",
        { "druidic-warrior": "public" },
        { "druidic-warrior": "pack" }
      )
    ).toEqual({ "druidic-warrior": "public" });
  });

  it("mergeCatalogue keeps the public names", () => {
    const merged = mergeCatalogue(
      "feat",
      { "blessed-warrior": { name: "Blessed Warrior" } },
      { "blessed-warrior": { name: "pack name" } },
      undefined
    );
    expect(merged["blessed-warrior"]).toEqual({ name: "Blessed Warrior" });
  });

  it("any other collision still throws", () => {
    expect(() => mergePack("feat", [{ id: "alert" }], [{ id: "alert" }])).toThrow(
      /duplicate feat id "alert"/
    );
    expect(() =>
      mergeCatalogue(
        "feat",
        { alert: { name: "a" } },
        { alert: { name: "b" } },
        undefined
      )
    ).toThrow(/duplicate feat catalogue key "alert"/);
  });
});
