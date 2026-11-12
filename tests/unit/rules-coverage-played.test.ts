/**
 * The table the owner reads: for what his groups actually play (the played-content
 * survey's catalogue ids), how far the app plays each entry, on the same rules as the
 * coverage rows (`__helpers__/rules-coverage.ts`): Auto, 1 tap, Text only (the table
 * plays it by hand), or Missing (no catalogue entry). Pure counting over public ids
 * here; the report run reads a real survey (see `playedCoverageMarkdown`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  playedCoverage,
  playedCoverageMarkdown,
  type PlayedSurvey,
} from "./__helpers__/played-coverage";

const survey = {
  format: "d20-folio-played-content-survey-v1",
  characters: 3,
  classLevels: { "rogue:3": 2, "fighter:1": 1 },
  subclasses: { "rogue:thief": 1 },
  species: { dwarf: 1 },
  features: { alert: 1, "boon-of-dimensional-travel": 1, "no-such-feature": 1 },
  customFeatures: 0,
  upcoming: { "rogue-cunning-strike": 2 },
  unreadable: {},
};

const row = (section: string, id: string) =>
  playedCoverage(survey)
    .find((s) => s.title === section)
    ?.rows.find((r) => r.id === id);

describe("the played-content coverage view", () => {
  it("counts a class feature for every character at or above its level", () => {
    expect(row("Class features held", "rogue-sneak-attack")).toMatchObject({
      characters: 2,
    });
    expect(row("Class features held", "fighter-second-wind")).toMatchObject({
      characters: 1,
    });
    // Level 5's feature is not held at level 3.
    expect(row("Class features held", "rogue-uncanny-dodge")).toBeUndefined();
  });

  it("includes the subclass features held at the class's level", () => {
    expect(row("Class features held", "rogue-thief-fast-hands")).toMatchObject({
      characters: 1,
    });
  });

  it("judges a feat by its own effect, and says an unknown id is missing", () => {
    expect(row("Feats and picked features", "alert")?.coverage).toBe("auto");
    expect(row("Feats and picked features", "boon-of-dimensional-travel")?.coverage).toBe(
      "reference"
    );
    expect(row("Feats and picked features", "no-such-feature")?.coverage).toBe("missing");
  });

  it("lists each species trait and the features of the next two levels", () => {
    const dwarf = playedCoverage(survey)
      .find((s) => s.title === "Species traits")
      ?.rows.filter((r) => r.id.startsWith("dwarf:"));
    expect(dwarf?.length).toBeGreaterThan(0);
    expect(row("Next two levels", "rogue-cunning-strike")).toMatchObject({
      characters: 2,
    });
  });

  it("writes a markdown table with a plain legend", () => {
    const md = playedCoverageMarkdown(survey);
    expect(md).toContain("| Entry | Id | Characters | Coverage |");
    expect(md).toContain("Auto: the app applies it with no input.");
  });
});

// The report run (never in CI): PLAYED_SURVEY=<survey output> PLAYED_REPORT=<file>.
// Its output names pack entries, so it is written outside the repository only.
const input = process.env.PLAYED_SURVEY;
const output = process.env.PLAYED_REPORT;
describe.runIf(Boolean(input && output))("the played-content report", () => {
  it("writes the report for a real survey", () => {
    const text = readFileSync(input ?? "", "utf8");
    writeFileSync(
      output ?? "",
      playedCoverageMarkdown(JSON.parse(text.slice(text.indexOf("{"))) as PlayedSurvey)
    );
  });
});
