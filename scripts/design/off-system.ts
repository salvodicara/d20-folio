/**
 * Off-system values: colours, font sizes, font families and radii written by hand in
 * component styles instead of through the design tokens (src/index.css). The vision
 * (owner 2026-10-13) is one system everywhere; this scan is how the guard
 * (`tests/unit/off-system.guard.test.ts`) keeps it so.
 *
 * Today's hand-written values are frozen in `tests/unit/__fixtures__/off-system-baseline.json`:
 * the guard fails on a NEW one (or more uses of a frozen one) and on a frozen one that is
 * gone (so the baseline only shrinks). Font families have no baseline: every one must be a
 * `var(--font-*)` token.
 *
 * Run `node --experimental-strip-types scripts/design/off-system.ts --write` after
 * deliberately removing hand-written values, to shrink the baseline.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type Kind = "color" | "font-size" | "radius" | "font-family";
export type Counts = Record<string, number>;

const RADIUS_OK = /^(var\(--[a-z0-9-]+\)|0|0px|50%|999px|inherit|calc\(.*\))$/;
const SIZE_OK = /^(var\(--[a-z0-9-]+\)|inherit|1em|100%|0|calc\(.*var\(--.*\))$/;

function add(counts: Counts, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/** Hand-written values in one stylesheet's rules (comments and custom properties excluded). */
export function scanCss(css: string, file: string, out: Record<Kind, Counts>): void {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/(^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+);/g)) {
    const prop = m[2] ?? "";
    const value = (m[3] ?? "").trim();
    if (prop.startsWith("--")) continue; // a token definition is the system itself
    if (
      prop === "font-family" &&
      !/^var\(--font-[a-z-]+\)$/.test(value) &&
      value !== "inherit"
    )
      add(out["font-family"], `${file} ${value}`);
    if (prop === "font-size" && !SIZE_OK.test(value))
      add(out["font-size"], `${file} ${value}`);
    if (prop === "border-radius") {
      for (const part of value.split(/\s+/)) {
        if (!RADIUS_OK.test(part)) add(out.radius, `${file} ${part}`);
      }
    }
    for (const c of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g))
      add(out.color, `${file} ${c[0].replace(/\s+/g, " ")}`);
  }
}

function walk(dir: string, ext: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
}

/** Every hand-written value in the app's component styles and inline styles. */
export function scanOffSystem(root: string): Record<Kind, Counts> {
  const out: Record<Kind, Counts> = {
    color: {},
    "font-size": {},
    radius: {},
    "font-family": {},
  };
  const rel = (f: string) => relative(root, f).split(sep).join("/");
  const sheets: string[] = [];
  walk(join(root, "src"), ".css", sheets);
  for (const f of sheets) {
    // index.css is where the tokens are defined; its few base rules read them.
    if (f.endsWith(`${sep}index.css`)) continue;
    scanCss(readFileSync(f, "utf8"), rel(f), out);
  }
  const tsx: string[] = [];
  walk(join(root, "src"), ".tsx", tsx);
  for (const f of tsx) {
    const text = readFileSync(f, "utf8");
    for (const c of text.matchAll(/["'`](#[0-9a-fA-F]{3,8}|rgba?\([^)'"`]*\))["'`]/g))
      add(out.color, `${rel(f)} ${c[1]}`);
  }
  return out;
}

const isMain =
  typeof process !== "undefined" && /off-system\.ts$/.test(process.argv[1] ?? "");
if (isMain) {
  const root = join(import.meta.dirname, "..", "..");
  const scan = scanOffSystem(root);
  const { "font-family": families, ...baseline } = scan;
  if (Object.keys(families).length) console.log("font-family must be a token:", families);
  const total = (k: keyof typeof baseline) =>
    Object.values(baseline[k]).reduce((a, b) => a + b, 0);
  console.log(
    `color ${total("color")} · font-size ${total("font-size")} · radius ${total("radius")}`
  );
  if (process.argv.includes("--write")) {
    writeFileSync(
      join(root, "tests", "unit", "__fixtures__", "off-system-baseline.json"),
      JSON.stringify(baseline, null, 2) + "\n"
    );
    console.log("baseline written");
  }
}
