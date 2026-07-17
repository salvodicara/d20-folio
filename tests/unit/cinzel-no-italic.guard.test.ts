/// <reference types="node" />
/**
 * Guard: Cinzel ships NO italic face — `font-style: italic` is FORBIDDEN on any
 * `--font-title` context (DESIGN.md §3, owner-reported 2026-07-02: the brand
 * "d20" rendered with a truncated "0"). A browser-synthesized oblique shears
 * glyph ink beyond the layout box, where a `background-clip: text` fill cannot
 * paint it — the sheared ink goes transparent. Italic belongs ONLY to faces
 * that ship a true italic (Alegreya `--font-display` / `--font-body`).
 *
 * Static analysis, block-level:
 *  1. no CSS rule block that declares `font-family: var(--font-title)` also
 *     declares an italic/oblique font-style;
 *  2. no rule block targeting the Cinzel-carrying selector families (they
 *     inherit Cinzel from their base rule: `.brand-word*`, `.page-title`,
 *     `.modal-title`) declares one either;
 *  3. no TSX combines the `font-title` utility (or an inline
 *     `var(--font-title)`) with an italic font-style in the same element.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const CSS_FILES = [resolve(SRC, "index.css"), resolve(SRC, "styles/folio.css")] as const;

/** Innermost `selector { declarations }` blocks (media preludes fall away). */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  // Both groups are structurally guaranteed by the pattern (`?? ""` only
  // satisfies noUncheckedIndexedAccess — same idiom as boot-bg-sync.test.ts).
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").trim(),
    decls: m[2] ?? "",
  }));
}

const ITALIC = /font-style\s*:\s*(italic|oblique)/;
/** Selector families whose base rule sets `--font-title` (Cinzel). */
const CINZEL_FAMILY = /\.(brand-word|page-title|modal-title)/;

describe("Cinzel never italicises (no synthetic oblique on --font-title)", () => {
  it("no rule block sets --font-title together with an italic font-style", () => {
    for (const file of CSS_FILES) {
      const offenders = ruleBlocks(readSrc(file)).filter(
        (b) => b.decls.includes("var(--font-title)") && ITALIC.test(b.decls)
      );
      expect(
        offenders.map((b) => b.selector),
        `${file}: Cinzel has no italic face — drop the font-style`
      ).toEqual([]);
    }
  });

  it("no Cinzel-family selector (.brand-word* / .page-title / .modal-title) declares italic", () => {
    for (const file of CSS_FILES) {
      const offenders = ruleBlocks(readSrc(file)).filter(
        (b) => CINZEL_FAMILY.test(b.selector) && ITALIC.test(b.decls)
      );
      expect(
        offenders.map((b) => b.selector),
        `${file}: these selectors inherit Cinzel — italic would synthesize an oblique`
      ).toEqual([]);
    }
  });

  it("no TSX pairs the font-title utility with the italic utility, nor var(--font-title) with an italic fontStyle", () => {
    const offenders = srcFiles({ exts: [".tsx"] }).filter((f) => {
      const src = readSrc(f);
      // className="… font-title … italic …" (either order) on one element.
      const classPair = [...src.matchAll(/className=["'`]([^"'`]*)["'`]/g)].some((m) => {
        const tokens = (m[1] ?? "").split(/\s+/);
        return tokens.includes("font-title") && tokens.includes("italic");
      });
      // Inline style objects: fontFamily var(--font-title) + fontStyle italic.
      const stylePair = [...src.matchAll(/style=\{\{([^}]*)\}\}/g)].some((m) => {
        const body = m[1] ?? "";
        return (
          body.includes("var(--font-title)") &&
          /fontStyle\s*:\s*["'](italic|oblique)/.test(body)
        );
      });
      return classPair || stylePair;
    });
    expect(
      offenders.map((f) => f.replace(SRC, "src")),
      "Cinzel (--font-title) has no italic face — remove the italic"
    ).toEqual([]);
  });

  it("PageHeader renders the Cinzel title bare — never wrapped in <em>", () => {
    expect(readSrc(resolve(SRC, "components/shared/PageHeader.tsx"))).not.toContain(
      "<em>"
    );
  });
});
