/**
 * The HP entry reads the defenses an ally's effect brings the moment it lands
 * (rehearsal 2026-11-06 #4): Warding Bond's Resistance to all damage halved a hit in
 * one run and not in the next. The ally's effect reaches the sheet as a projection
 * attached to the SAME session object, so a defense memo keyed on the session object
 * kept the defenses from before it landed, until something else changed the session.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";

vi.mock("@/stores/toastStore", () => {
  const showToast = vi.fn(() => "toast-1");
  const useToastStore = Object.assign(
    (selector: (s: { showToast: typeof showToast }) => unknown) =>
      selector({ showToast }),
    { getState: () => ({ showToast, dismissToast: vi.fn() }) }
  );
  return { useToastStore };
});

const wardingBond: ActiveCombatEffect = {
  id: "wb-1",
  actor: { kind: "pc", combatantId: "pc-pal", memberUid: "pal", characterId: "char-pal" },
  target: {
    kind: "pc",
    combatantId: "pc-me",
    memberUid: "me",
    characterId: MOCK_CHARACTER.id,
  },
  source: { kind: "spell", id: "warding-bond", actionId: "spell-warding-bond" },
  payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
  duration: { kind: "encounter" },
};

const hp = () => useCharacterStore.getState().character?.session.hp.current;

beforeEach(() => {
  useCharacterStore.setState({ encounterEffectProjection: null, readonly: false });
  useCharacterStore.getState().setCharacter({
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      hp: { ...MOCK_CHARACTER.session.hp, current: 40, temp: 0 },
      conditions: [],
      activeFeatures: [],
      concentration: "",
      logEntries: [],
    },
  });
});

describe("an ally's Warding Bond, landing while the HP entry is open", () => {
  it("halves the next hit", () => {
    const { result } = renderHook(() => useHpControls());
    expect(result.current.defenses.allDamageResistance).toBe(false);
    act(() =>
      useCharacterStore.getState().setEncounterEffects(MOCK_CHARACTER.id, [wardingBond])
    );
    expect(result.current.defenses.allDamageResistance).toBe(true);
    act(() => result.current.handleApplyDamage([{ amount: 10 }]));
    expect(hp()).toBe(35);
  });
});
