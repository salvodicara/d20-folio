/**
 * scroll-restoration — the pure target logic behind ScrollRestorer.
 *
 * Pins: back/forward (POP) restores the entry's saved offset; EVERY fresh PUSH
 * starts at the top — including the three realm indexes (owner 2026-07-10: the
 * old per-realm "tab-stack" restore made a realm switch visibly jump to a
 * remembered offset after mount — the masthead "jump" bug); a REPLACE
 * (`?tab`/`?type` rewrite) leaves scroll + focus untouched.
 */

import { describe, it, expect } from "vitest";
import { scrollTarget } from "@/lib/scroll-restoration";

describe("scrollTarget", () => {
  it("restores the saved offset on POP (back/forward)", () => {
    expect(scrollTarget("POP", 1200)).toBe(1200);
    expect(scrollTarget("POP", undefined)).toBe(0);
  });

  it("starts EVERY fresh PUSH at the top — a saved offset never leaks into a PUSH", () => {
    // Regression (owner 2026-07-09/10 masthead jump): realm indexes used to
    // restore a remembered offset on PUSH, so switching realms via the topbar
    // jumped the page after mount and the masthead never landed in one place.
    expect(scrollTarget("PUSH", 1200)).toBe(0);
    expect(scrollTarget("PUSH", undefined)).toBe(0);
  });

  it("leaves scroll + focus untouched on REPLACE (in-place ?tab/?type)", () => {
    expect(scrollTarget("REPLACE", 500)).toBeNull();
  });
});
