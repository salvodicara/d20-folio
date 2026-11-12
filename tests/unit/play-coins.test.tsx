/**
 * The Play screen's coins wear their own colour (copper, silver, platinum), as the
 * campaign's chest does (sweep 2026-11-11: every coin read gold on the inventory).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Play inventory coins", () => {
  it("tag each coin with the attribute its colour reads", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    const centre = readFileSync("src/domains/play/ui/PlayCentre.tsx", "utf8");
    expect(css).toMatch(/\.f-coin\[data-coin="cp"\]/);
    expect(centre).toMatch(/className="f-coin" data-coin=\{c\}/);
  });
});
