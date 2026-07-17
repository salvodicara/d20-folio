/**
 * palette-recents (OWN-33) — the bounded launcher's recent-actions memory.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getPaletteRecents,
  recordPaletteRecent,
  __resetPaletteRecents,
} from "@/app/shell/palette-recents";

beforeEach(() => {
  __resetPaletteRecents();
});

describe("palette-recents", () => {
  it("starts empty", () => {
    expect(getPaletteRecents()).toEqual([]);
  });

  it("records most-recent-first and de-dupes", () => {
    recordPaletteRecent("act:a");
    recordPaletteRecent("act:b");
    recordPaletteRecent("act:a"); // re-used → moves to the front, not duplicated
    expect(getPaletteRecents()).toEqual(["act:a", "act:b"]);
  });

  it("caps the list at 5", () => {
    for (const k of ["a", "b", "c", "d", "e", "f", "g"]) recordPaletteRecent(`act:${k}`);
    const recents = getPaletteRecents();
    expect(recents).toHaveLength(5);
    // The 5 most-recent, newest-first.
    expect(recents).toEqual(["act:g", "act:f", "act:e", "act:d", "act:c"]);
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem("d20-folio-palette-recents", "{not json");
    expect(getPaletteRecents()).toEqual([]);
  });
});
