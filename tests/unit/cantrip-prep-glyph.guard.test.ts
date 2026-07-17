/// <reference types="node" />
/**
 * Guard: a LOCKED (always-known, e.g. cantrip) prepared-book glyph must read GOLD in
 * light too — distinct from the green "prepared" book. The base
 * `.uc-prep[data-locked="true"]` colours with `--accent-text`, which in LIGHT resolves
 * to a near-black umber (the body-AA gold), so without an explicit light override the
 * gold goes dark and a cantrip looks like a normal prepared spell (owner-reported
 * 2026-06-08 — the recurring "light gold goes dark" class). This pins the override.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8").replace(
  /\s+/g,
  " "
);

describe("cantrip / locked prepared-book glyph stays gold in light", () => {
  it("the light `data-locked` rule pins an explicit gold-leaf colour", () => {
    const rule =
      /\[data-theme="light"\] \.uc-prep\[data-locked="true"\] \{[^}]*color:\s*var\(--gold-leaf-\d+\)/;
    expect(
      rule.test(css),
      'MISSING: the light `.uc-prep[data-locked="true"]` rule must set a gold-leaf ' +
        "color — else it inherits the umber `--accent-text` and the cantrip book goes dark."
    ).toBe(true);
  });
});
