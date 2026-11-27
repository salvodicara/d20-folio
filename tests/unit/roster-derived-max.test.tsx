/**
 * #1451 — the roster card shows the max HP the sheet shows. The parent's `cache` keeps
 * the max stamped at its last save; a rules fix since then lowers the derive, so the
 * card derives the max through the sheet's read path (lazily, memoised per character)
 * instead of trusting the cache, and current HP clamps to it. SRD content only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import type { RosterCharacterDoc } from "@/lib/character-cache";

const { rosterRows, combatFor } = vi.hoisted(() => ({
  rosterRows: { current: [] as unknown[] },
  combatFor: { current: new Map<string, unknown>() },
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/stores/authStore", () => {
  const state = { user: { uid: "u1" } };
  return {
    useAuthStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), {
      getState: () => state,
    }),
  };
});
vi.mock("@/lib/firestore", () => ({
  subscribeToCharacters: (
    _uid: string,
    cb: (docs: unknown[], fromCache: boolean) => void
  ) => {
    cb(rosterRows.current, false);
    return () => {};
  },
}));
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: (_uid: string, id: string, cb: (s: unknown) => void) => {
    cb(combatFor.current.get(id) ?? null);
    return () => {};
  },
}));

import { useCharacters } from "@/hooks/useCharacters";
import { cacheToRosterDoc } from "@/lib/character-cache";
import { buildCharacterCache } from "@/lib/character-cache-build";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToCombatState } from "@/lib/combat-state";
import { asRaceId } from "@/data/srd-names";
import { makeCharacterDoc } from "./_helpers";

// Dwarf Monk 3, CON 14: the sheet derives 27. The cache says 33 (stamped when an
// older derive gave 33), and the play state stored 33 current HP.
function storedMonk(): { row: RosterCharacterDoc; combat: CombatState } {
  const doc: CharacterDoc = makeCharacterDoc({
    classes: [{ classId: "monk", level: 3 }],
    race: asRaceId("dwarf"),
    hitDieType: 8,
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 10 },
    hp: { max: 27 },
  });
  const staleCache = { ...buildCharacterCache(doc.character, doc.session), hpMax: 33 };
  const data: Record<string, unknown> = {
    ...serializeCharacterEnvelope(doc),
    state: {},
    cache: staleCache,
    revision: 3,
    shared: false,
    status: "active",
    portraitUrl: null,
    portraitCrop: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };
  const row = cacheToRosterDoc(doc.id, data, {
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    portraitUrl: null,
    portraitCrop: null,
    status: "active",
  });
  if (!row) throw new Error("no roster row");
  const combat = sessionToCombatState({ ...doc.session, hp: { current: 33, temp: 0 } });
  return { row, combat };
}

beforeEach(() => {
  rosterRows.current = [];
  combatFor.current = new Map();
});

describe("the roster card's max HP is the sheet's (#1451)", () => {
  it("a stale cached max (33) shows the derived max (27), current HP clamped to it", async () => {
    const { row, combat } = storedMonk();
    rosterRows.current = [row];
    combatFor.current.set(row.id, combat);
    const { result } = renderHook(() => useCharacters());
    await waitFor(() => expect(result.current.hpReady?.[row.id]).toBe(true));
    const card = result.current.characters[0];
    expect(card?.character.hp.max).toBe(27);
    expect(card?.session.hp.current).toBe(27);
  });
});
