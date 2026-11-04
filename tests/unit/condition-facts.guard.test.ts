/**
 * Every sheet reads its condition effects with the facts they depend on (edge-case
 * family M3): Frightened holds only while its source is in sight, and only
 * `conditionFactsFor` (lib/condition-sources) knows that. `resolveConditionEffects`
 * takes the facts as a required argument; this guard stops a caller from passing an
 * empty literal in their place. The resolver's own module and the facts module are
 * the only places allowed to.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "src");
const ALLOWED = new Set(["lib/condition-effects.ts", "lib/condition-sources.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("condition facts guard", () => {
  it("no caller resolves condition effects with an empty facts literal", () => {
    const offenders = sourceFiles(ROOT).flatMap((path) => {
      const file = relative(ROOT, path);
      if (ALLOWED.has(file)) return [];
      const text = readFileSync(path, "utf8");
      return /resolveConditionEffects\([^;]*?,\s*\{\s*\}\s*\)/s.test(text) ? [file] : [];
    });
    expect(offenders).toEqual([]);
  });
});
