/**
 * The code-checked verdicts beside what the data declares: the played-content view
 * shows a declared effect no screen applies as what it is (missing, by hand), never
 * as automatic. Acceptance rows (coordinator, 2026-11-12): Reliable Talent is missing,
 * Aura of Protection is missing for allies, Memorize Spell is automatic; an entry
 * nobody checked reads «unproven». Public SRD ids only in the verdicts file.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { classFeatureIndex } from "@/data/classes";
import { getFeat } from "@/data/feats";

import { aScreenCalls } from "./__helpers__/coverage-report";
import {
  PUBLIC_VERDICTS,
  shownVerdict,
  type CoverageVerdict,
} from "./__helpers__/coverage-verdicts";
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
    const extra = [
      {
        id: "wizard-scholar",
        verdict: "by-hand" as const,
        evidence: [],
        packEvidence: ["p.test.ts"],
      },
    ];
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

  it("an auto or by-hand verdict names a test; every test it names exists and runs", () => {
    for (const v of PUBLIC_VERDICTS) {
      if (v.verdict === "auto" || v.verdict === "by-hand")
        expect(v.evidence.length, v.id).toBeGreaterThan(0);
      for (const file of v.evidence) {
        const where = `tests/unit/${file}`;
        expect(existsSync(where), `${v.id}: ${file}`).toBe(true);
        // Skipped, left to do, or expected to fail: it proves nothing.
        const idle = /\.(skip|todo)\(|\bit\.fails\(/.test(readFileSync(where, "utf8"));
        expect(idle, `${v.id}: ${file} skips or expects a failure`).toBe(false);
      }
    }
  });

  it("a verdict waiting on a change names what a screen will call; none is due a re-check", () => {
    for (const v of PUBLIC_VERDICTS) {
      if (v.until) expect(v.waitsFor?.length, v.id).toBeGreaterThan(0);
      expect(shownVerdict(v, aScreenCalls), `${v.id}: re-check it`).not.toBe("re-check");
    }
  });

  it("a verdict with no test reads unproven; a landed change reads re-check", () => {
    const auto = { id: "x", verdict: "auto" as const, evidence: [] };
    expect(shownVerdict(auto, () => false)).toBe("unproven");
    expect(shownVerdict({ ...auto, evidence: ["a.test.ts"] }, () => false)).toBe("auto");
    expect(shownVerdict({ ...auto, packEvidence: ["p.test.ts"] }, () => false)).toBe(
      "auto"
    );
    const none = { id: "y", verdict: "missing" as const, evidence: [] };
    expect(shownVerdict(none, () => false)).toBe("missing");
    const waiting = { ...none, waitsFor: ["useZ"] };
    expect(shownVerdict(waiting, (fn) => fn === "useZ")).toBe("re-check");
  });
});
