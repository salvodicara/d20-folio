/**
 * The sheet's small phone controls reach a 44 px target (design reset «BG3 craft», slice
 * 5a, 2026-11-27): an ability's modifier, its «TS» save, the three header numbers (AC,
 * initiative, speed) and an inventory item's name. Each keeps its look; the target grows
 * by a minimum size, or by padding that a negative margin hands back, so nothing moves.
 * The frames measure the rendered boxes; this guard keeps the rules from going missing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** The bodies of every rule for `selector` inside a phone media query (max-width ≤ 800). */
function phoneBodies(selector: string): string[] {
  const out: string[] = [];
  const media = /@media \(max-width: (\d+)px\) \{/g;
  for (let m = media.exec(css); m; m = media.exec(css)) {
    if (Number(m[1]) > 800) continue;
    let depth = 1;
    let i = media.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    const block = css.slice(media.lastIndex, i);
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    for (let r = rule.exec(block); r; r = rule.exec(block)) {
      const sels = (r[1] ?? "").split(",").map((s) => s.trim().replace(/\s+/g, " "));
      if (sels.includes(selector)) out.push(r[2] ?? "");
    }
  }
  return out;
}

/** The px value a body gives `prop`, or 0. */
function px(bodies: string[], prop: string): number {
  let v = 0;
  for (const b of bodies) {
    const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*(-?\\d+)px`).exec(b);
    if (m) v = Number(m[1]);
  }
  return v;
}

describe("sheet phone targets reach 44 px", () => {
  it("an ability's modifier is at least 44 × 44", () => {
    const b = phoneBodies(".fui .f-sheet .f-ability > dd > .f-ab-open");
    expect(px(b, "min-width")).toBeGreaterThanOrEqual(44);
    expect(px(b, "min-height")).toBeGreaterThanOrEqual(44);
  });

  it("a header number (AC, initiative, speed) is at least 44 × 44", () => {
    const b = phoneBodies(".fui .f-sheet .f-char-stats button.f-badge");
    expect(px(b, "min-width")).toBeGreaterThanOrEqual(44);
    expect(px(b, "min-height")).toBeGreaterThanOrEqual(44);
  });

  it.each([
    [".fui .f-sheet .f-ab-save > button", 17],
    [".fui .f-sheet .f-act button.f-row-t", 19],
  ])("%s grows to 44 px tall without moving (padding given back by margin)", (sel, h) => {
    const b = phoneBodies(sel);
    const pad = px(b, "padding-block");
    expect(h + 2 * pad).toBeGreaterThanOrEqual(44);
    expect(px(b, "margin-block")).toBe(-pad);
  });
});
