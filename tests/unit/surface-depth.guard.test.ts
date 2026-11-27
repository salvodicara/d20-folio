/**
 * Surfaces (design reset «C · BG3 craft», slice 4, 2026-11-27): hierarchy comes from tonal
 * steps and one frame per group, not from a border on every box or a coloured halo.
 *
 * - A zero-offset coloured glow is a state, never decoration: it lights a hover, a focus, a
 *   pick or the one lit primary. At rest, the crest, the Hit Points figure, the AC shield and
 *   the current initiative row draw no halo (the critique's detector `dark-glow`).
 * - The current row of an initiative list is a flat band (BG3's selected list row): no
 *   border, no side bar, no rounded card inside the panel (detector `nested-cards`).
 * - The turn strip is a band across its panel, not a rounded box inside it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** Every style rule as [selector, body]; at-rule headers are skipped, their rules kept. */
function rules(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const selector = (m[1] ?? "").trim().replace(/\s+/g, " ");
    if (!selector.startsWith("@")) out.push([selector, m[2] ?? ""]);
  }
  return out;
}

/** The value of `prop` in a rule body, or "" when the rule does not set it. */
function value(body: string, prop: string): string {
  const m = new RegExp(`(?:^|;|\\s)${prop}\\s*:([^;]*)`).exec(body);
  return m ? (m[1] ?? "").trim() : "";
}

/** The layers of a shadow list, split on the commas outside parentheses. */
function layers(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of list) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** A layer that lights around the box: no offset, a blur, not inset, not a black shade. */
function isGlow(layer: string): boolean {
  if (/\binset\b/.test(layer)) return false;
  if (/var\(--shade[^)]*\)|\bblack\b|rgb\(0 0 0\b/.test(layer)) return false;
  const m = /^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)px/.exec(layer.trim());
  return !!m && Number(m[1]) === 0 && Number(m[2]) === 0 && Number(m[3]) > 0;
}

/** A selector that names a state or the lit primary: the only places a glow may live. */
const STATE =
  /:hover|:focus|:active|aria-pressed="true"|aria-selected="true"|data-state|data-kind="primary"/;

describe("surfaces: no decorative halo", () => {
  const glows = rules().flatMap(([selector, body]) => {
    const found: string[] = [];
    for (const prop of ["box-shadow", "text-shadow"])
      for (const layer of layers(value(body, prop)))
        if (isGlow(layer)) found.push(`${selector} { ${prop}: ${layer} }`);
    for (const m of value(body, "filter").matchAll(
      /drop-shadow\(([^()]*(?:\([^()]*\))?[^()]*)\)/g
    ))
      if (isGlow(m[1] ?? "")) found.push(`${selector} { filter: drop-shadow(${m[1]}) }`);
    return found;
  });

  it("sees a glow when one is written", () => {
    expect(isGlow("0 0 14px var(--glow-hp)")).toBe(true);
    expect(isGlow("0 0 0 4px var(--hero-end)")).toBe(false);
    expect(isGlow("inset 0 0 6px var(--gold)")).toBe(false);
    expect(isGlow("0 8px 20px var(--sh-panel-c)")).toBe(false);
  });

  it("lights a glow only on a state or the lit primary", () => {
    expect(glows.filter((g) => !STATE.test(g.split(" {")[0] ?? ""))).toEqual([]);
  });
});

describe("surfaces: flat bands", () => {
  const all = rules();
  const set = (selector: string) =>
    all.filter(([s]) => s.split(",").some((part) => part.trim() === selector));

  it.each([".fui .f-fight[data-current]", ".fui .f-ir[data-current]"])(
    "%s is a flat band: a tonal fill, no border, no side bar",
    (selector) => {
      const own = set(selector);
      expect(own.length).toBeGreaterThan(0);
      for (const [, body] of own) {
        expect(value(body, "border-color")).toBe("");
        expect(value(body, "box-shadow")).toMatch(/^(none)?$/);
      }
      expect(own.some(([, body]) => value(body, "background") !== "")).toBe(true);
    }
  );

  it("the Play turn strip spans its panel as a square band", () => {
    const own = set(".fui .f-sheet .f-turn");
    const radius = own
      .map(([, b]) => value(b, "border-radius"))
      .filter(Boolean)
      .at(-1);
    expect(radius).toBe("0");
    // edge to edge: it reaches out by the panel body's side inset and pads its text back in
    expect(
      own.some(([, b]) => /calc\(-1 \* var\(--pnb-x\)\)/.test(value(b, "margin")))
    ).toBe(true);
  });
});
