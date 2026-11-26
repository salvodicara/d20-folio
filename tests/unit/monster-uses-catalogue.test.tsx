/**
 * The limited-use strip names each use from the monster catalogue, which loads lazily.
 * On a fresh page load (no «Aggiungi mostri» opened yet) the strip must wait for it, not
 * crash the fight screen reading a missing name (frames, 2026-11-26).
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const lazy = vi.hoisted(() => ({ ready: false }));
vi.mock("@/hooks/useLazySrdKind", () => ({ useLazySrdKind: () => lazy.ready }));
const localize = vi.hoisted(() => vi.fn(() => "Fire Breath"));
vi.mock("@/i18n/resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/resolver")>()),
  localizeSrd: localize,
}));

import { useMonsterUses } from "@/domains/combat/ui/use-monster-uses";
import type { EncounterState } from "@/types/campaign";

const fight = {
  epoch: 1,
  round: 1,
  combatants: [
    {
      kind: "monster",
      id: "monster-1",
      name: "Drago",
      srdId: "adult-red-dragon",
      ac: 19,
      initiative: 17,
      conditions: [],
      hp: { current: 256, max: 256, temp: 0 },
    },
  ],
} as unknown as EncounterState;

describe("useMonsterUses and the lazy monster catalogue", () => {
  it("shows no strip and reads no name until the catalogue is in", () => {
    lazy.ready = false;
    const { result } = renderHook(() =>
      useMonsterUses("camp", fight, "dm", "it", () => {})
    );
    expect(result.current.stripFor(["monster-1"])).toBeNull();
    expect(localize).not.toHaveBeenCalled();
  });

  it("shows the strip once it is in", () => {
    lazy.ready = true;
    const { result } = renderHook(() =>
      useMonsterUses("camp", fight, "dm", "it", () => {})
    );
    expect(result.current.stripFor(["monster-1"])).not.toBeNull();
  });
});
