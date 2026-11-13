/**
 * Audit 2026-11-13 (red until the «campaign context settled» helper), the turn in the
 * first moments after the sheet opens, before the shell has read the campaigns and the
 * fight:
 * - item 12: a turn action counts as out of combat — no Action is spent — so once the
 *   fight arrives the player can act twice. The action must count in the fight;
 * - item 8: End Turn takes the solo path — the round goes up and a solo turn completes
 *   on the shared fight's engine. It must not end a solo turn the fight doesn't have.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { buildScenario } from "@/lib/dev-scenarios";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";

const ME = "pc-u1";
let select: ((action: ResolvedAction) => void) | null = null;
let endTurn: (() => void) | null = null;
function Probe() {
  const { handleSelect, handleEndTurn } = useTurnEconomy();
  useEffect(() => {
    select = handleSelect;
    endTurn = handleEndTurn;
  }, [handleSelect, handleEndTurn]);
  return null;
}

function fightArrives(characterId: string): void {
  const rows = [
    { id: ME, kind: "pc", side: "ally", name: "Brakka" },
    {
      id: "monster-1",
      kind: "monster",
      side: "enemy",
      name: "Goblin",
      currentHp: 7,
      maxHp: 7,
      tempHp: 0,
    },
  ] as unknown as GlobalCombat["view"]["rows"];
  useCombatStatusStore.setState({
    status: {
      campaignId: "camp-1",
      encounter: {
        nextMonsterOrdinal: 2,
        round: 1,
        currentCombatantId: ME,
        epoch: 1,
        status: "active",
        combatants: [],
      },
      view: { rows, turnOrderIds: rows.map((r) => r.id), currentId: ME },
      myId: ME,
      characterId,
      gathering: false,
      isMyTurn: true,
      initiativeBonus: 0,
      initiativeRoll: 12,
      round: 1,
    } as unknown as GlobalCombat,
  });
}

beforeEach(() => {
  select = null;
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStatusStore.setState({ status: null });
  usePartyRosterStore.setState({ party: null, resolvedFor: null, castWaiting: null });
  useCombatStore.getState().endCombat();
});
afterEach(() => useCombatStatusStore.setState({ status: null }));

describe("a turn action before the fight is read (settled-context gap)", () => {
  it("a Dash taken before the fight arrives spends that turn's Action", async () => {
    const character = buildScenario({
      name: "Brakka",
      raceId: "human",
      classId: "fighter",
      level: 3,
      background: "soldier",
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    });
    useCharacterStore.setState({ character, loading: false, error: null });
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const dash = localizeActions(character, "en").find((a) => /dash/i.test(a.id));
    if (!dash) throw new Error("no Dash");
    await act(async () => {
      select?.(dash);
      await Promise.resolve();
    });
    // The shell answers a moment later: the campaigns, then this character's fight.
    act(() => {
      usePartyRosterStore.getState().setParty(null, character.id);
      fightArrives(character.id);
    });
    await vi.waitFor(
      () =>
        expect(useCombatStore.getState().selected.action.map((a) => a.id)).toContain(
          dash.id
        ),
      { timeout: 3000 }
    );
  }, 15000);

  it("End Turn before the fight arrives does not end a solo turn", async () => {
    const character = buildScenario({
      name: "Brakka",
      raceId: "human",
      classId: "fighter",
      level: 3,
      background: "soldier",
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    });
    useCharacterStore.setState({ character, loading: false, error: null });
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const roundBefore = useCombatStore.getState().round;
    await act(async () => {
      endTurn?.();
      await Promise.resolve();
    });
    act(() => {
      usePartyRosterStore.getState().setParty(null, character.id);
      fightArrives(character.id);
    });
    expect(useCombatStore.getState().round).toBe(roundBefore);
    expect(
      (useCharacterStore.getState().character?.session.logEntries ?? []).some(
        (e) => e.event.kind === "turn-end"
      )
    ).toBe(false);
  }, 15000);
});
