/**
 * The code-checked verdicts beside what the data declares: the played-content view
 * shows a declared effect no screen applies as what it is (missing, by hand), never
 * as automatic. Acceptance rows (coordinator, 2026-11-12): Reliable Talent is missing,
 * Aura of Protection is missing for allies, Memorize Spell is automatic; an entry
 * nobody checked reads «unproven». Public SRD ids only in the verdicts file.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { classFeatureIndex } from "@/data/classes";
import { getFeat } from "@/data/feats";

import { PUBLIC_VERDICTS, type CoverageVerdict } from "./__helpers__/coverage-verdicts";
import { playedCoverage, playedCoverageMarkdown } from "./__helpers__/played-coverage";

const survey = {
  classLevels: { "rogue:11": 1, "paladin:6": 1, "wizard:5": 1 },
  subclasses: {},
  species: {},
  features: {},
  upcoming: {},
};

const held = (extra: readonly CoverageVerdict[] = []) =>
  playedCoverage(survey, extra).find((s) => s.title === "Class features held")?.rows ??
  [];
const of = (id: string, extra?: readonly CoverageVerdict[]) =>
  held(extra).find((row) => row.id === id);

describe("code-checked verdicts in the played-content view", () => {
  it("the acceptance rows read the code's truth, not the declaration", () => {
    expect(of("rogue-reliable-talent")).toMatchObject({
      coverage: "auto",
      verdict: "missing",
    });
    expect(of("paladin-aura-of-protection")?.verdict).toBe("missing");
    expect(of("wizard-memorize-spell")).toMatchObject({
      coverage: "reference",
      verdict: "auto",
    });
  });

  it("an entry nobody checked is unproven, never automatic", () => {
    expect(of("wizard-scholar")?.verdict).toBe("unproven");
  });

  it("verdicts given at run time (the pack's) join the public ones", () => {
    const extra = [{ id: "wizard-scholar", verdict: "by-hand" as const, evidence: [] }];
    expect(of("wizard-scholar", extra)?.verdict).toBe("by-hand");
  });

  it("the report leads with the code-checked column and flags a declaration that overclaims", () => {
    const md = playedCoverageMarkdown(survey);
    expect(md).toContain("| Entry | Id | Characters | Code-checked | Declared |");
    expect(md).toMatch(
      /\| rogue-reliable-talent \| 1 \| Missing \([^|]*\) \| Declared auto ⚠ \|/
    );
  });
});

describe("the public verdicts file", () => {
  it("names public SRD entries only", () => {
    for (const { id } of PUBLIC_VERDICTS) {
      const source = classFeatureIndex.get(id)?.source ?? getFeat(id)?.source;
      expect(source, id).toBe("SRD");
    }
  });

  it("an automatic verdict names a test, and every test it names exists", () => {
    for (const v of PUBLIC_VERDICTS) {
      if (v.verdict === "auto" && !v.provenInPack)
        expect(v.evidence.length, v.id).toBeGreaterThan(0);
      for (const file of v.evidence)
        expect(existsSync(`tests/unit/${file}`), `${v.id}: ${file}`).toBe(true);
    }
  });
});
