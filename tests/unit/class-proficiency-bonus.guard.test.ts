/// <reference types="node" />
/**
 * Guard: no class table file may inline the proficiency-bonus formula.
 *
 * The canonical helper is `proficiencyBonus()` from `@/lib/proficiency`.
 * Every class table file (`src/data/classes/*.ts` + the pack’s) must import and call it —
 * never re-state `Math.ceil(level / 4) + 1` inline or via a local `pb()` copy.
 *
 * This locks the B5 hygiene fix (audit task #90): one formula, one place.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const CLASSES_DIR = resolve(SRC, "data/classes");
// The canonical helper that must be used instead.
const PROFICIENCY_MODULE = resolve(SRC, "lib/proficiency.ts");

/** Matches the inlined proficiency-bonus formula (the forbidden pattern). */
const INLINE_PB = /Math\.ceil\s*\(\s*level\s*\/\s*4\s*\)\s*\+\s*1/;

describe("class-table proficiency-bonus — canonical helper, no inline formula", () => {
  it("no src/data/classes/*.ts file contains the inline Math.ceil(level/4)+1 formula", () => {
    const offenders = srcFiles({ under: CLASSES_DIR, exts: [".ts"] }).filter(
      (f) => f !== PROFICIENCY_MODULE && INLINE_PB.test(readSrc(f))
    );
    expect(
      offenders,
      "Use proficiencyBonus(level) from @/lib/proficiency — never inline Math.ceil(level/4)+1"
    ).toHaveLength(0);
  });
});
