/// <reference types="node" />
/**
 * Guard: the documentation budget.
 *
 * "Nothing in the app without a reason" (owner, 2026-09-03) applies to the
 * knowledge base too. Every steering and map document has a hard byte cap,
 * ratified 2026-09-09 with the v2 knowledge-base reset. A document that grows
 * past its cap is not "richer" — it is a document nobody re-reads, and the v1
 * set (a 429 KB PROGRESS.md, a 304 KB DESIGN.md) is the proof. The fix for a
 * red line here is to CUT or to move history into `docs/archive/v1/`, never to
 * raise the number silently: a raise is an owner decision and must be argued
 * for in the same commit that changes this table.
 *
 * The caps are measured on the file as prettier formats it, so `just ci`'s
 * format gate and this guard cannot disagree.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caps: Record<string, number> = {
  "CLAUDE.md": 14_000,
  "PRODUCT.md": 26_000,
  "docs/PROGRAM_STATUS.md": 12_000,
  "docs/program/NEXT.md": 6_000,
  "docs/program/PROGRAM.md": 32_000,
  "docs/program/CHECKLIST.md": 9_000,
  "docs/program/DECISIONS.md": 14_000,
  "docs/GOLDEN_RULES.md": 18_000,
  "docs/PRODUCT_CONSTITUTION.md": 40_000,
  "docs/ARCHITECTURE.md": 40_000,
  "docs/MECHANICS.md": 40_000,
  "docs/CHARACTER_SCHEMA.md": 40_000,
  "DESIGN.md": 40_000,
  "PROGRESS.md": 8_000,
  "docs/CONTRIBUTING.md": 24_000,
  "docs/WORKTREES.md": 8_000,
  "docs/TEST_PORTFOLIO.md": 16_000,
  "docs/diagrams/README.md": 2_200,
};

describe("documentation budget (no dead weight, owner 2026-09-03; caps ratified 2026-09-09)", () => {
  for (const [file, cap] of Object.entries(caps)) {
    it(`${file} exists and stays under ${cap} bytes`, () => {
      expect(existsSync(file), `${file} is missing`).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(cap);
    });
  }

  it("the handoff file carries the five fixed headings", () => {
    const text = readFileSync("docs/program/NEXT.md", "utf8");
    for (const heading of [
      "## Current block",
      "## Closed (SHA)",
      "## Open",
      "## Recent owner decisions",
      "## Opening prompt",
    ]) {
      expect(text).toContain(heading);
    }
  });

  it("the committed graph exists and is not empty", () => {
    expect(existsSync("graphify-out/graph.json")).toBe(true);
    expect(statSync("graphify-out/graph.json").size).toBeGreaterThan(10_000);
  });
});
