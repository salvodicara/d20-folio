/**
 * One chip family (design reset «BG3 craft», slice 2, 2026-11-27): every chip's look comes
 * from one rule set in src/ui/ui.css, the block between the «chips: one family» and «end of
 * the chip family» markers. A screen may place a chip (margin, flex, width, wrapping), but
 * it may not restyle one: no border, fill, colour, font, height, padding or shadow on
 * `.f-chip` or a fight row's tag (`.f-now`, `.f-ir-now`, `.f-must`) outside the block. Before this guard there were ten chip
 * looks (the sheet's bold chips, the filters' underlined tabs, a table rule's gold pick,
 * two «now» tags…). DESIGN.md holds the variant table.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raw = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
const START = "/* ---------- chips: one family";
const END = "/* ---------- end of the chip family ---------- */";

/** A property that draws a chip (its look), as opposed to one that places it. */
const LOOK =
  /^(border|background|color|font|box-shadow|min-height|height|padding|opacity|filter|transform|letter-spacing|text-transform|outline|cursor)/;

/** Does one selector of a list style a chip itself (its last compound names it)? */
function namesChip(selector: string): boolean {
  const last =
    selector
      .trim()
      .split(/\s+|>|\+|~/)
      .filter(Boolean)
      .at(-1) ?? "";
  return /\.f-chip(?![\w-])|\.f-(ir-)?now(?![\w-])|\.f-must(?![\w-])/.test(last);
}

/** The innermost rules of a stylesheet, comments removed: selector list and properties. */
function rules(css: string): { selector: string; props: string[] }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; props: string[] }[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? "").trim();
    if (selector.startsWith("@")) continue;
    const props = (m[2] ?? "")
      .split(";")
      .map((d) => (d.split(":")[0] ?? "").trim())
      .filter(Boolean);
    out.push({ selector, props });
  }
  return out;
}

/** The rules outside the family block that restyle a chip, with the properties they set. */
function chipForks(css: string): string[] {
  const start = css.indexOf(START);
  const end = css.indexOf(END);
  const outside = start === -1 || end === -1 ? css : css.slice(0, start) + css.slice(end);
  return rules(outside)
    .filter((r) => r.selector.split(",").some(namesChip))
    .flatMap((r) => {
      const look = r.props.filter((p) => LOOK.test(p));
      return look.length
        ? [`${r.selector.replace(/\s+/g, " ")} { ${look.join(", ")} }`]
        : [];
    });
}

describe("chip family", () => {
  it("has its one block in ui.css", () => {
    expect(raw.indexOf(START)).toBeGreaterThan(-1);
    expect(raw.indexOf(END)).toBeGreaterThan(raw.indexOf(START));
  });

  it("sees a fork when a screen restyles a chip, and not a placement", () => {
    const sample = `${START} */ .fui .f-chip { border: 0; } ${END}
      .fui .f-rule .f-chip[aria-pressed="true"] { border-color: gold; font-weight: 700; }
      .fui .f-yesno > .f-chip { min-width: 56px; justify-content: center; }
      .fui .f-chips { gap: 8px; }
      .fui .f-chip-n { color: red; }
      .fui .f-sheet .f-ir-now { padding: 0 4px; }`;
    expect(chipForks(sample)).toEqual([
      '.fui .f-rule .f-chip[aria-pressed="true"] { border-color, font-weight }',
      ".fui .f-sheet .f-ir-now { padding }",
    ]);
  });

  it("no screen restyles a chip outside the family block", () => {
    expect(chipForks(raw)).toEqual([]);
  });
});
