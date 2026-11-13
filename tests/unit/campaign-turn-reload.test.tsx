/**
 * A campaign fight's spent Action survives a reload (the rules lane's cast-reload
 * rehearsal step, 2026-11-13: after Bless and a reload the Action came back free, on
 * both UIs; a solo fight kept it). On a reload the sheet's combat state arrives before
 * the shared fight status: the stored turn (keyed to the fight's turn) found no fight to
 * match and was not restored, and the status's arrival then read as a new fight. Once
 * the status matches the stored turn, the turn comes back.
 */
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { sessionToCombatState } from "@/lib/combat-state";
import { createCombatStateWriter } from "@/lib/combat-state-writer";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CombatState } from "@/types/combat-state";

const status = (): GlobalCombat => ({
  campaignId: "camp-1",
  encounter: {
    nextMonsterOrdinal: 1,
    round: 2,
    currentCombatantId: "pc-u1",
    epoch: 5,
    status: "active",
    combatants: [
      { kind: "pc", id: "pc-u1", memberUid: "u1", characterId: MOCK_CHARACTER.id },
    ],
  },
  view: { rows: [], turnOrderIds: ["pc-u1"], currentId: "pc-u1" },
  myId: "pc-u1",
  characterId: MOCK_CHARACTER.id,
  gathering: false,
  isMyTurn: true,
  initiativeBonus: 2,
  initiativeRoll: 15,
  round: 2,
});

/** The stored turn: Bless cast this turn (the Action spent), keyed to the fight's turn. */
const storedTurn = (): NonNullable<CombatState["turnEconomy"]> => ({
  key: "encounter:camp-1:5:2:pc-u1",
  selected: {
    action: [{ id: "spell-bless", name: { custom: "Bless" }, slot: "action" }],
    bonus: [],
    free: [],
  },
  attacksUsed: 0,
  attackSwings: [],
  outcomeReceipts: [],
  outcomeOrdinal: 0,
  reactionUsed: false,
  reactionUsedId: null,
  reactionOutcomeOccurrenceId: null,
  movementUsedFt: 0,
  dashesThisTurn: 0,
  extraMovementFt: 0,
  spellSlotCastsThisTurn: 1,
  spellSlotCastTurnKey: "encounter:camp-1:5:2:pc-u1",
  damageTakenThisRound: false,
  nextAttackAdvantage: false,
  movementLocked: false,
});

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useCombatStore.setState({
    hydratedCharacterId: null,
    encounterKey: null,
    ownTurnKey: null,
  });
  useCombatStatusStore.setState({ status: null, pip: null });
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
    combatRound: 2,
    combatTurnEconomy: storedTurn(),
  });
});

describe("a reload in a campaign fight", () => {
  it("control: with the status already there, the stored turn comes back", () => {
    useCombatStatusStore.setState({ status: status() });
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <div />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
      "spell-bless",
    ]);
  });

  it("the stored turn comes back once the fight's status arrives", () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <div />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    // The fight status arrives after the sheet's combat state (the lazy shell mount).
    act(() => useCombatStatusStore.setState({ status: status() }));
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
      "spell-bless",
    ]);
  });

  it("a reload writes nothing: the turn on the server stays as it was", async () => {
    // The real combat writer, seeded with what the server holds (the hard rule: a
    // restore never writes; an empty turn must never be saved over the stored one).
    const send = vi.fn(() => Promise.resolve());
    const writer = createCombatStateWriter({
      send,
      reconciler: {
        markChildPending: () => {},
        acknowledgeChildWrite: () => {},
        rejectChildWrite: () => {},
      },
      onRejected: () => {},
    });
    const cs = useCharacterStore.getState();
    writer.observe(
      sessionToCombatState(
        MOCK_CHARACTER.session,
        cs.combatRound,
        cs.combatAppliedEncounterEffects,
        cs.combatTurnEconomy,
        cs.combatLegacyActiveEffects,
        cs.combatPendingConcentrationSaves,
        cs.combatSoloFightStarted
      )
    );
    useCharacterStore.setState({ combatPersistence: writer });
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <div />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    act(() => useCombatStatusStore.setState({ status: status() }));
    // Let the writer's microtask coalescing run.
    await act(() => Promise.resolve());
    expect(send).not.toHaveBeenCalled();
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
      "spell-bless",
    ]);
    writer.stop();
    useCharacterStore.setState({ combatPersistence: null });
  });
});
