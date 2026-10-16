/**
 * One design system (owner 2026-10-13): component styles take colours, font sizes,
 * font families and radii from the tokens in src/index.css. Today's hand-written
 * values are frozen in a baseline that may only shrink; a new hand-written value
 * fails here and names itself. Font families have no baseline at all.
 * See scripts/design/off-system.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  scanCss,
  scanOffSystem,
  type Counts,
  type Kind,
} from "@scripts/design/off-system";

const root = join(__dirname, "..", "..");
const scan = scanOffSystem(root);
const baseline = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "off-system-baseline.json"), "utf8")
) as Record<Exclude<Kind, "font-family">, Counts>;

function grown(now: Counts, frozen: Counts): string[] {
  return Object.entries(now)
    .filter(([key, n]) => n > (frozen[key] ?? 0))
    .map(([key, n]) => `${key} (${frozen[key] ?? 0} → ${n})`);
}

describe("off-system guard", () => {
  it("sees the hand-written values it is meant to see", () => {
    const out: Record<Kind, Counts> = {
      color: {},
      "font-size": {},
      radius: {},
      "font-family": {},
    };
    scanCss(
      `.a { color: #123456; font-size: 13px; border-radius: 6px var(--radius-md); font-family: Arial; --tok: #fff; mask-image: linear-gradient(#000, transparent); }`,
      "x.css",
      out
    );
    expect(out.color).toEqual({ "x.css #123456": 1 });
    expect(out["font-size"]).toEqual({ "x.css 13px": 1 });
    expect(out.radius).toEqual({ "x.css 6px": 1 });
    expect(out["font-family"]).toEqual({ "x.css Arial": 1 });
  });

  it("every font family is a token", () => {
    expect(scan["font-family"]).toEqual({});
  });

  for (const kind of ["color", "font-size", "radius"] as const) {
    it(`adds no hand-written ${kind} (use a token)`, () => {
      expect(grown(scan[kind], baseline[kind])).toEqual([]);
    });

    it(`keeps the ${kind} baseline honest (it only shrinks)`, () => {
      const gone = Object.entries(baseline[kind])
        .filter(([key, n]) => (scan[kind][key] ?? 0) < n)
        .map(([key]) => key);
      expect(gone, "rerun scripts/design/off-system.ts --write").toEqual([]);
    });
  }
});
