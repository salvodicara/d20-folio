/**
 * When the DM ends the encounter, a state that lasts "until the start of your next
 * turn" (Shield) ends with it: its turn edge was counted in the encounter's rounds,
 * and the solo turn engine restarts at round 1, so it would otherwise linger for as
 * many solo rounds as the fight lasted.
 */
import { afterEach, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCombatStore.getState().endCombat();
  useCharacterStore.setState({ character: null });
});

function encounterStatus(characterId: string, round: number): GlobalCombat {
  const rows = [{ id: "pc-test-uid", kind: "pc", side: "ally", name: "Me" }];
  return {
    campaignId: "camp-1",
    encounter: {
      nextMonsterOrdinal: 1,
      round,
      currentCombatantId: "monster-1",
      epoch: 1,
      status: "active",
      combatants: [],
    },
    view: { rows, turnOrderIds: ["pc-test-uid", "monster-1"], currentId: "monster-1" },
    myId: "pc-test-uid",
    characterId,
    gathering: false,
    isMyTurn: false,
    initiativeBonus: 0,
    initiativeRoll: 10,
    round,
  } as unknown as GlobalCombat;
}

it("ends a turn-edge state (Shield) when the DM ends the encounter", () => {
  const doc = makeCharacterDoc({ classId: "wizard", level: 7 });
  doc.character.spells = [{ srdId: "shield", prepared: true }];
  doc.session.activeFeatures = ["spell-shield"];
  doc.session.effectBoundaries = { "spell-shield": { round: 8, phase: "turn-start" } };
  useCharacterStore.setState({ character: doc, readonly: false, loading: false });
  useCombatStatusStore.setState({ status: encounterStatus(doc.id, 7) });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <div />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  expect(useCharacterStore.getState().character?.session.activeFeatures).toContain(
    "spell-shield"
  );
  act(() => useCombatStatusStore.setState({ status: null }));
  const session = useCharacterStore.getState().character?.session;
  expect(session?.activeFeatures ?? []).not.toContain("spell-shield");
  expect(session?.effectBoundaries).toBeUndefined();
});
