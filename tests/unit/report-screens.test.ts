/**
 * report-screens — the bug-report surface catalogue + pathname auto-detection
 * (OWN-37). Pure; no Firebase.
 */
import { describe, it, expect } from "vitest";
import {
  detectScreen,
  allScreens,
  SCREENS,
  OTHER_SCREEN,
} from "@/features/report/screens";

describe("detectScreen", () => {
  it.each([
    ["/characters", "roster"],
    ["/", "roster"],
    ["/characters/new", "character-create"],
    ["/characters/abc123", "character-cockpit"],
    ["/characters/abc123?tab=spells", "character-cockpit"],
    ["/campaigns", "campaigns"],
    ["/campaigns/camp-1", "campaign-hub"],
    ["/compendium", "compendium"],
    ["/compendium?type=spell&sel=fireball", "compendium"],
    ["/settings", "settings"],
    ["/admin", "admin"],
    ["/login", "login"],
    ["/totally-unknown", "other"],
  ])("maps %s → %s", (pathname, expectedId) => {
    expect(detectScreen(pathname).id).toBe(expectedId);
  });

  it("never maps /characters/new to the cockpit surface", () => {
    expect(detectScreen("/characters/new").id).not.toBe("character-cockpit");
  });

  it("allScreens includes every spec plus the catch-all, with unique ids", () => {
    const all = allScreens();
    expect(all).toHaveLength(SCREENS.length + 1);
    expect(all).toContain(OTHER_SCREEN);
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every screen has a report.screens.* label key", () => {
    for (const s of allScreens()) {
      expect(s.labelKey.startsWith("report.screens.")).toBe(true);
    }
  });
});
