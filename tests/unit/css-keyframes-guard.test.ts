/**
 * Guard: every animation NAME referenced in the shipped CSS must have a matching
 * @keyframes definition. This prevents the class of bug where a recipe is ported
 * from the preview app.css but its @keyframes is left behind — the CSS validates
 * and lint passes, so the animation silently does nothing (e.g. the critical-HP
 * `pg-pulse` pulse, which was referenced but undefined until this round).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function readCss(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

// CSS-wide animation keywords that are not keyframe names.
const RESERVED = new Set([
  "none",
  "infinite",
  "alternate",
  "alternate-reverse",
  "normal",
  "reverse",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "initial",
  "inherit",
  "unset",
]);

describe("CSS keyframes guard", () => {
  const css = [readCss("src/styles/folio.css"), readCss("src/index.css")].join("\n");

  // Defined keyframes.
  const defined = new Set<string>();
  for (const m of css.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)) {
    const name = m[1];
    if (name) defined.add(name);
  }

  // Referenced animation names from `animation:` / `animation-name:` shorthands.
  const referenced = new Set<string>();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)) {
    const decl = m[1];
    if (!decl) continue;
    for (const layer of decl.split(",")) {
      for (const tok of layer.trim().split(/\s+/)) {
        const t = tok.trim();
        if (!t) continue;
        if (RESERVED.has(t)) continue;
        if (/^\d/.test(t)) continue; // durations / counts
        if (t.includes("(")) continue; // timing functions like cubic-bezier(...)
        if (t.startsWith("var(")) continue;
        if (/^-?\d*\.?\d/.test(t)) continue;
        // A bare ident left over → an animation name.
        if (/^[A-Za-z_][\w-]*$/.test(t)) referenced.add(t);
      }
    }
  }

  it("references at least the known animations (sanity)", () => {
    expect(referenced.has("pg-pulse")).toBe(true);
    expect(defined.has("pg-pulse")).toBe(true);
  });

  it("every referenced animation name has a defined @keyframes", () => {
    const missing = [...referenced].filter((name) => !defined.has(name));
    expect(missing, `missing @keyframes for: ${missing.join(", ")}`).toEqual([]);
  });
});
