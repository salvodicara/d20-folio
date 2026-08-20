/**
 * HUD hit-point family — the shared HP engine (`useHpControls`, behind the
 * header pill, the edit popover and the DyingBanner) consumes the character-
 * vitals projection: under a mocked world↔session divergence (a stale world
 * claiming different hp/temp/death marks than the legacy session fields),
 * SESSION truth surfaces — a legacy-only edit can never be resurrected from a
 * stale persisted world. With no world persisted, the readout is the plain
 * session readout (the pre-migration behavior, unchanged).
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCharacterStore } from "@/stores/characterStore";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { MOCK_CHARACTER } from "@/lib/mock";

/** Seed the real store with explicit session vitals + an optional raw world. */
function seed(opts: {
  current: number;
  temp: number;
  succ?: number;
  fail?: number;
  world?: unknown;
}) {
  useCharacterStore.getState().setCharacter({
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      hp: { current: opts.current, temp: opts.temp },
      deathSucc: opts.succ ?? 0,
      deathFail: opts.fail ?? 0,
      concentration: "",
      ...(opts.world !== undefined ? { world: opts.world } : {}),
    },
  });
}

describe("useHpControls — vitals-projection consumption", () => {
  it("surfaces the session readout when no world is persisted", () => {
    seed({ current: 17, temp: 4 });
    const { result } = renderHook(() => useHpControls());
    expect(result.current.current).toBe(17);
    expect(result.current.temp).toBe(4);
  });

  it("surfaces SESSION truth when a stale world diverges", () => {
    seed({
      current: 12,
      temp: 0,
      world: {
        vitals: {
          hitPoints: { current: 30, temporary: { current: 9, sourceOccurrence: null } },
          zeroHitPoints: null,
        },
        exhaustion: 0,
        occurrences: {},
        resources: { pools: {}, standardSpellSlots: {}, pactSpellSlot: null },
      },
    });
    const { result } = renderHook(() => useHpControls());
    expect(result.current.current).toBe(12);
    expect(result.current.temp).toBe(0);
    // The divergence also flows into the derived flags: 12 HP is not at zero,
    // whatever the stale world claims.
    expect(result.current.atZero).toBe(false);
  });
});
