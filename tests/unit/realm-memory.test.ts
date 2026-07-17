/**
 * realm-memory — the tab-stack "return to your category" for the realm tabs.
 *
 * Pins: an index route's query is remembered so its tab returns there (the
 * compendium's `?type`); drill-down routes are NOT recorded (a realm tab always
 * lands on the index, never mid-drill-down).
 */

import { describe, it, expect } from "vitest";
import { recordRealmVisit, realmTarget } from "@/lib/realm-memory";

describe("realm-memory", () => {
  it("defaults a realm tab to the bare index when unvisited", () => {
    expect(realmTarget("/campaigns")).toBe("/campaigns");
  });

  it("returns the compendium tab to the last category it was seen with", () => {
    recordRealmVisit("/compendium", "?type=spells");
    expect(realmTarget("/compendium")).toBe("/compendium?type=spells");
    recordRealmVisit("/compendium", "?type=feats");
    expect(realmTarget("/compendium")).toBe("/compendium?type=feats");
  });

  it("ignores drill-down routes — the tab never lands mid-drill-down", () => {
    recordRealmVisit("/characters/abc-123", "?tab=play");
    expect(realmTarget("/characters")).toBe("/characters");
  });

  it("strips the transient open-entry + seeded search so the tab lands on a fresh index", () => {
    // `?sel=` (the open entry) and `?q=` (a seeded search) are reading state, not
    // the durable view — a realm-tab click must not resurrect them.
    recordRealmVisit("/compendium", "?type=spell&sel=fireball&q=fire");
    expect(realmTarget("/compendium")).toBe("/compendium?type=spell");
  });

  it("remembers a bare index (no durable query) when only transient state was present", () => {
    recordRealmVisit("/compendium", "?sel=fireball");
    expect(realmTarget("/compendium")).toBe("/compendium");
  });
});
