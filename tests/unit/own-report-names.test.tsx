/**
 * The sheet's own report (a character in no campaign) names `pc-…` as the character
 * itself, and never names a creature it doesn't know as the character: a Chromatic
 * Orb cast on a goblin once read «Pyra lancia Globo Cromatico su Pyra».
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOwnReportNames } from "@/domains/chronicle/ui/report-names";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import type { PlayEvent } from "@/lib/session-log";

const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key;

describe("useOwnReportNames", () => {
  it("names the character's own ids, and no other creature", () => {
    const { result } = renderHook(() => useOwnReportNames("Pyra", "it"));
    expect(result.current.pc("pc-me")).toBe("Pyra");
    expect(result.current.pc("monster-2")).toBeUndefined();
  });

  it("names a creature by the name the fight's roster shows (the tray's, the rail's)", () => {
    const { result } = renderHook(() =>
      useOwnReportNames("Pyra", "it", { "monster-2": "Goblin Chief" })
    );
    expect(result.current.pc("monster-2")).toBe("Goblin Chief");
    // an id no roster knows: not the character
    expect(result.current.pc("monster-9")).toBeUndefined();
    expect(result.current.pc("pc-me")).toBe("Pyra");
  });

  it("a cast on a monster it doesn't know never reads as cast on the caster", () => {
    const { result } = renderHook(() => useOwnReportNames("Pyra", "it"));
    const names = result.current;
    const who = (id: string | undefined): string =>
      (id && names.pc(id)) || "combatChronicle.someone";
    const event = {
      kind: "action",
      actor: "pc-me",
      targets: ["monster-2"],
      source: { lit: { en: "Chromatic Orb", it: "Globo Cromatico" } },
      spellLevel: 1,
    } as unknown as PlayEvent;
    const line = localizePlayEvent(event, t, who, names) ?? "";
    expect(line).toContain('"actor":"Pyra"');
    expect(line).not.toContain('"targets":"Pyra"');
  });
});
