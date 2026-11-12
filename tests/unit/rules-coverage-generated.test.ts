/**
 * The generated rules coverage page is written on demand from the code and the tests
 * (`pnpm rules:coverage`) and is not committed: a count lives in one place, and two PRs
 * that change a verdict never collide on it. This test fails when a glossary entry
 * claims «modeled» without a test, or when a screen now calls what a gap waits for
 * (the gap may be closed: review it).
 */
import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GENERATED_DOC,
  gapsAScreenNowCalls,
  renderCoverageDoc,
} from "./__helpers__/coverage-report";
import { GLOSSARY } from "./__helpers__/glossary-coverage";

describe("the generated rules coverage page", () => {
  it("renders (`pnpm rules:coverage` writes it to disk)", () => {
    const page = renderCoverageDoc();
    if (process.env.WRITE_COVERAGE) writeFileSync(GENERATED_DOC, page);
    expect(page).toContain("## Rules Glossary");
  });

  it("every modeled glossary entry names a test, and every test it names exists", () => {
    for (const entry of GLOSSARY) {
      if (entry.status === "modeled")
        expect(entry.evidence.length, entry.entry).toBeGreaterThan(0);
      for (const file of entry.evidence)
        expect(existsSync(`tests/unit/${file}`), `${entry.entry}: ${file}`).toBe(true);
      if (entry.status === "gap")
        expect(entry.gaps?.length, entry.entry).toBeGreaterThan(0);
    }
  });

  it("no gap waits for a function a screen already calls", () => {
    expect(gapsAScreenNowCalls()).toEqual([]);
  });
});
