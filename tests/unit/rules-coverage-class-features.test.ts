/**
 * The "Class features" row of docs/RULES_COVERAGE.md is counted, not estimated.
 * The rule lives in `__helpers__/class-feature-coverage.ts` (shared with the
 * pack's twin): builder-applied or sibling-carried features and standing grants
 * are auto; counters, action rows, casts, toggles and granted actions are 1-tap;
 * a feature that declares nothing is reference.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classFeatures } from "@/data/classes";
import { classFeatureIndex } from "@/data/classes";
import { SRD_CARRIED, coverageCell } from "./__helpers__/class-feature-coverage";

const row = (label: string) =>
  readFileSync("docs/RULES_COVERAGE.md", "utf8")
    .split("\n")
    .find((line) => line.includes(label));

describe("RULES_COVERAGE class-feature row", () => {
  // The public features only (the composed build merges the pack's in).
  const srd = classFeatures.filter((feature) => feature.source === "SRD");

  it("states the counted auto / 1-tap / reference split of the SRD features", () => {
    const label = `Class features (${srd.length},`;
    const line = row(label);
    expect(line, label).toBeDefined();
    const { cell } = coverageCell(srd, SRD_CARRIED);
    expect(line).toContain(`| ${cell} `);
  });

  it("every carried feature exists and is public", () => {
    for (const id of Object.keys(SRD_CARRIED)) {
      expect(classFeatureIndex.get(id)?.source, id).toBe("SRD");
    }
  });
});
