/**
 * Playwright's `isVisible({ timeout })` ignores its timeout and answers at once, so
 * a check of something that renders a beat late races the app (two rehearsal
 * failures, 2026-11-11). No test may use it: wait with `visibleWithin`
 * (tests/e2e/visible-within.ts) or a web-first `expect(...).toBeVisible()`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["tests/e2e", "tests/e2e-rehearsal", "tests/e2e-offline"];
const ISVISIBLE_WITH_OPTIONS = /\.isVisible\(\s*\{/;

function specFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return specFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("no isVisible with options in browser tests", () => {
  it("every browser test waits for what it checks", () => {
    const hits = ROOTS.flatMap((root) =>
      specFiles(root).flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, i) =>
            ISVISIBLE_WITH_OPTIONS.test(line) ? [`${file}:${i + 1}`] : []
          )
      )
    );
    expect(hits).toEqual([]);
  });
});
