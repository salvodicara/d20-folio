/**
 * Guard (golden rule 7 — defense in depth): a BRANDED id type may be minted ONLY
 * by its sanctioned minter function. Every other site must obtain the brand by CALLING
 * that minter — never by an `as <Brand>` cast, which would let a raw or localized display
 * string be smuggled into an id field, defeating the compile-time guarantee. This pins the
 * "stable ids, no shortcuts" discipline at test time, so a future edit can't quietly cast a
 * string into `RaceId` / `ConcentrationRef` and re-open the language-leak door.
 *
 * The brand TYPE lives in `types/ids.ts`; the runtime cast that constructs it is allowed
 * ONLY inside the one module listed below (the minter). Scans the runtime `src/**`.
 */
import { describe, it, expect } from "vitest";
import { srcFileMap, SRC_ROOT } from "./__helpers__/src-files";

/** Branded id → the ONE module (relative to src/) whose minter may cast `as <Brand>`. */
const MINTERS: Readonly<Record<string, string>> = {
  RaceId: "data/srd-names.ts",
  ConcentrationRef: "lib/concentration.ts",
  ProficiencyToken: "lib/proficiency-tokens.ts",
  AlignmentId: "lib/lore-utils.ts",
};

describe("guard: branded ids are minted only by their sanctioned minter (no `as <Brand>` shortcuts)", () => {
  for (const [brand, minter] of Object.entries(MINTERS)) {
    it(`only src/${minter} may cast \`as ${brand}\``, () => {
      const re = new RegExp(`\\bas ${brand}\\b`);
      const offenders: string[] = [];
      for (const [path, content] of srcFileMap()) {
        if (!/\.tsx?$/.test(path)) continue;
        const rel = path.slice(SRC_ROOT.length + 1);
        if (rel === minter) continue;
        // Strip line + block comments so a prose mention of the brand isn't a false hit.
        const code = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        if (re.test(code)) offenders.push(rel);
      }
      expect(
        offenders,
        `\`as ${brand}\` cast outside src/${minter} — mint via the minter, never a cast:\n  ${offenders.join("\n  ")}`
      ).toEqual([]);
    });
  }
});
