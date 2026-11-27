/**
 * The monster actions under a line name each action from the lazy monster catalogue.
 * On a fresh page load the strip must wait for it, not crash the fight screen reading a
 * missing name (frames, 2026-11-26: «missing SRD string monster:…scimitar.name#it»).
 */
import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const lazy = vi.hoisted(() => ({ ready: false }));
vi.mock("@/hooks/useLazySrdKind", () => ({ useLazySrdKind: () => lazy.ready }));
const localize = vi.hoisted(() => vi.fn(() => "Scimitar"));
vi.mock("@/i18n/resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/resolver")>()),
  localizeSrd: localize,
  hasSrd: () => false,
}));

import { useMonsterActions } from "@/domains/combat/ui/use-monster-actions";
import type { EncounterState } from "@/types/campaign";

const fight = {
  epoch: 1,
  round: 1,
  combatants: [
    {
      kind: "monster",
      id: "monster-1",
      name: "Goblin",
      srdId: "goblin-warrior",
      ac: 15,
      initiative: 14,
      conditions: [],
      hp: { current: 10, max: 10, temp: 0 },
    },
  ],
} as unknown as EncounterState;

describe("useMonsterActions and the lazy monster catalogue", () => {
  it("shows no actions and reads no name until the catalogue is in", () => {
    lazy.ready = false;
    const { result } = renderHook(() =>
      useMonsterActions("camp", fight, [], "dm", "it", () => {})
    );
    expect(result.current.stripFor(["monster-1"])).toBeNull();
    expect(localize).not.toHaveBeenCalled();
  });

  it("shows them once it is in", () => {
    lazy.ready = true;
    const { result } = renderHook(() =>
      useMonsterActions("camp", fight, [], "dm", "it", () => {})
    );
    expect(result.current.stripFor(["monster-1"])).not.toBeNull();
  });

  // Coordinator review, 2026-11-27: on a phone the chips wrapped to three lines and
  // outweighed the monster's row. A chip is one line, the name and the roll (Foundry's and
  // D&D Beyond's encounter rows); the damage is in its title and in the tray it opens.
  it("draws each action as one compact chip: the name and the roll, the damage in its title", () => {
    lazy.ready = true;
    const { result } = renderHook(() =>
      useMonsterActions("camp", fight, [], "dm", "it", () => {})
    );
    render(<>{result.current.stripFor(["monster-1"])}</>);
    const chip = screen.getAllByRole("button", { pressed: false })[0];
    if (!chip) throw new Error("no action chip");
    expect(chip.textContent).toBe("Scimitar +4");
    expect(chip.getAttribute("title")).toMatch(/^Scimitar \+4\u00a0· 1d6\+2 /);
    expect(chip.getAttribute("aria-label")).toBe(chip.getAttribute("title"));
  });
});
