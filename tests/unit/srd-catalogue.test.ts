/**
 * buildSrdCatalogue — the public, static SRD catalogue (API step 3): every SRD
 * collection as one JSON file of entries (mechanics + the canonical English text),
 * plus an index with counts, licence and attribution. Pure: the export script feeds
 * it the real collections in SRD-only mode.
 */
import { describe, it, expect } from "vitest";
import { buildSrdCatalogue } from "@/lib/srd-catalogue";

/** A data entry: an id plus whatever fields the collection carries. */
const e = (fields: { id: string } & Record<string, unknown>) => fields;

const base = {
  version: "1.2.3",
  attribution: "This work includes material from the SRD 5.2.1.",
};

describe("buildSrdCatalogue", () => {
  it("joins each entry with its English text, including dotted sub-keys", () => {
    const out = buildSrdCatalogue({
      ...base,
      collections: {
        spells: {
          entries: [e({ id: "aid", level: 2, source: "SRD" })],
          text: {
            aid: { name: "Aid", range: "30 feet" },
            "aid.components": "a strip of white cloth",
          },
        },
      },
    });
    expect(out.files["spells.json"]).toEqual([
      {
        id: "aid",
        level: 2,
        source: "SRD",
        text: { components: "a strip of white cloth", name: "Aid", range: "30 feet" },
      },
    ]);
  });

  it("is deterministic: entries sorted by id, keys sorted, functions and undefined dropped", () => {
    const input = {
      ...base,
      collections: {
        conditions: {
          entries: [
            e({ id: "prone", z: 1, a: undefined, fn: () => 1 }),
            e({ id: "blinded", b: { y: 2, x: 1 } }),
          ],
        },
      },
    };
    const out = buildSrdCatalogue(input);
    expect(out.files["conditions.json"]).toEqual([
      { b: { x: 1, y: 2 }, id: "blinded" },
      { id: "prone", z: 1 },
    ]);
    const [first] = out.files["conditions.json"] as object[];
    expect(Object.keys(first as object)).toEqual(["b", "id"]);
    expect(JSON.stringify(buildSrdCatalogue(input))).toBe(JSON.stringify(out));
  });

  it("writes an index with counts, licence and attribution", () => {
    const out = buildSrdCatalogue({
      ...base,
      collections: {
        feats: { entries: [{ id: "alert" }, { id: "grappler" }] },
        spells: { entries: [{ id: "aid" }] },
      },
    });
    expect(out.index).toEqual({
      version: "1.2.3",
      license: "CC-BY-4.0",
      attribution: base.attribution,
      collections: {
        feats: { file: "feats.json", count: 2 },
        spells: { file: "spells.json", count: 1 },
      },
    });
  });

  it("refuses a duplicate id", () => {
    expect(() =>
      buildSrdCatalogue({
        ...base,
        collections: { spells: { entries: [{ id: "aid" }, { id: "aid" }] } },
      })
    ).toThrow(/duplicate spells id "aid"/);
  });

  it("refuses anything not marked SRD (the private pack must never leak)", () => {
    expect(() =>
      buildSrdCatalogue({
        ...base,
        collections: { spells: { entries: [e({ id: "x", source: "PHB" })] } },
      })
    ).toThrow(/spells "x" is not SRD/);
  });
});
