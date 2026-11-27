/**
 * The new UI draws its icons from the one SVG sprite (`Icon`), never as Unicode glyphs:
 * a glyph is drawn by whatever system font has it (◉ ⚠ in Hiragino Sans, ✧ in Zapf
 * Dingbats), at the wrong weight and on the wrong baseline next to the serif (design
 * reset «BG3 craft», critique D10). Numeric signs (−, +) and typographic marks (·, –, …)
 * are text, not icons, and stay.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const GLYPHS = /[◉◎⚠✧✦★☆✓✔✗✕✘⚔♥❤]/u;

const tsxUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxUnder(path);
    return path.endsWith(".tsx") ? [path] : [];
  });

const newUiFiles = (): string[] => {
  const domains = join(ROOT, "src/domains");
  return [
    ...tsxUnder(join(ROOT, "src/ui")),
    ...readdirSync(domains)
      .map((d) => join(domains, d, "ui"))
      .filter((d) => statSync(d, { throwIfNoEntry: false })?.isDirectory())
      .flatMap(tsxUnder),
  ];
};

/** The source without its comments (block, JSX and line comments), so a comment may name a glyph. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""))
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");

describe("new UI icons are SVG, not glyphs", () => {
  it("finds the new UI's screens", () => {
    expect(newUiFiles().length).toBeGreaterThan(20);
  });

  it("no new-UI component draws a Unicode glyph as an icon", () => {
    const hits = newUiFiles().flatMap((file) =>
      code(readFileSync(file, "utf8"))
        .split("\n")
        .flatMap((line, i) =>
          GLYPHS.test(line)
            ? [`${file.slice(ROOT.length + 1)}:${String(i + 1)} ${line.trim()}`]
            : []
        )
    );
    expect(hits).toEqual([]);
  });
});
