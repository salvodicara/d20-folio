import { describe, expect, it } from "vitest";
import type { PackGrantExtensions } from "@/data/pack-types";
import type { Grant } from "@/lib/grants";
import { withPackGrantExtensions } from "@/lib/pack-grant-extensions";

const SOURCE = "race:elf:elven-lineage";

function extensions(...grants: Grant[]): PackGrantExtensions {
  return { [SOURCE]: grants };
}

describe("withPackGrantExtensions", () => {
  it("appends ordinary grants without mutating the public source", () => {
    const base: Grant[] = [{ type: "darkvision", range: 60 }];
    const merged = withPackGrantExtensions(
      SOURCE,
      base,
      extensions({ type: "speed", amount: 5 })
    );

    expect(merged).toEqual([
      { type: "darkvision", range: 60 },
      { type: "speed", amount: 5 },
    ]);
    expect(base).toEqual([{ type: "darkvision", range: 60 }]);
  });

  it("merges choice options and familiar forms into their existing containers", () => {
    const base: Grant[] = [
      {
        type: "choice-grant-bundle",
        bundleKey: "lineage",
        choiceFrequency: "creation",
        options: [{ id: "public", grants: [] }],
      },
      { type: "familiar-forms", monsterIds: ["imp"] },
    ];
    const merged = withPackGrantExtensions(
      SOURCE,
      base,
      extensions(
        {
          type: "choice-grant-bundle",
          bundleKey: "lineage",
          choiceFrequency: "creation",
          options: [{ id: "pack", grants: [] }],
        },
        { type: "familiar-forms", monsterIds: ["slaad-tadpole"] }
      )
    );

    const bundle = merged.find(
      (grant): grant is Extract<Grant, { type: "choice-grant-bundle" }> =>
        grant.type === "choice-grant-bundle"
    );
    const forms = merged.find(
      (grant): grant is Extract<Grant, { type: "familiar-forms" }> =>
        grant.type === "familiar-forms"
    );
    expect(bundle?.options.map((option) => option.id)).toEqual(["public", "pack"]);
    expect(forms?.monsterIds).toEqual(["imp", "slaad-tadpole"]);
    expect(merged).toHaveLength(2);
  });

  it("rejects duplicate option ids instead of rendering ambiguous choices", () => {
    const base: Grant[] = [
      {
        type: "choice-grant-bundle",
        bundleKey: "lineage",
        choiceFrequency: "creation",
        options: [{ id: "duplicate", grants: [] }],
      },
    ];

    expect(() =>
      withPackGrantExtensions(
        SOURCE,
        base,
        extensions({
          type: "choice-grant-bundle",
          bundleKey: "lineage",
          choiceFrequency: "creation",
          options: [{ id: "duplicate", grants: [] }],
        })
      )
    ).toThrow(/duplicate choice option id "duplicate"/);
  });

  it("rejects an extension that changes a bundle's choice frequency", () => {
    const base: Grant[] = [
      {
        type: "choice-grant-bundle",
        bundleKey: "lineage",
        choiceFrequency: "creation",
        options: [{ id: "public", grants: [] }],
      },
    ];

    expect(() =>
      withPackGrantExtensions(
        SOURCE,
        base,
        extensions({
          type: "choice-grant-bundle",
          bundleKey: "lineage",
          choiceFrequency: "rest",
          options: [{ id: "pack", grants: [] }],
        })
      )
    ).toThrow(/changes frequency/);
  });
});
