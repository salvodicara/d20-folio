/**
 * Bardic Inspiration on another PC in a fight, through the real commit path: the
 * die lands on that PC's play state by the peer write (`inspiration`), and the undo
 * reverts it. A monster target gets nothing written.
 */
import { render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  writeCampaignCombatEffect: vi.fn(() =>
    Promise.resolve({
      before: { hp: { current: 20, temp: 0 } },
      after: { hp: { current: 20, temp: 0 }, bardicInspirationDie: "d6" },
      spends: [],
    })
  ),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/lib/firebase", () => ({}));

beforeAll(loadCampaignIo);

import "@/i18n";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

let api: TurnEconomyApi | null = null;
function Grab() {
  const economy = useTurnEconomy();
  useEffect(() => {
    api = economy;
  });
  return null;
}

const bard = makeCharacterDoc({
  classes: [{ classId: "bard", level: 3 }],
  features: [{ srdId: "bard-bardic-inspiration" }],
  abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
});

describe("Bardic Inspiration on another PC", () => {
  beforeEach(() => {
    io.writeCampaignCombatEffect.mockClear();
    useCharacterStore.setState({
      character: bard,
      readonly: false,
      loading: false,
      error: null,
    });
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      movementUsedFt: 0,
      damageTakenThisRound: false,
    });
    useUndoStore.setState({ characterId: null, past: [], future: [] });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: bard.id,
        round: 1,
        encounter: { effectOps: [], currentCombatantId: "pc-me", order: [] },
        view: {
          rows: [
            {
              id: "pc-me",
              kind: "pc",
              name: "Lyra",
              memberUid: "me",
              characterId: bard.id,
              maxHp: 20,
            },
            {
              id: "pc-bren",
              kind: "pc",
              name: "Bren",
              memberUid: "bren",
              characterId: "c-bren",
              maxHp: 30,
            },
            { id: "m-gob", kind: "monster", name: "Goblin", maxHp: 7 },
          ],
          turnOrderIds: ["pc-me", "pc-bren", "m-gob"],
          currentId: "pc-me",
        },
      } as never,
    });
  });

  it("the die lands on Bren's sheet, and the undo takes it back", async () => {
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <Grab />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const action = localizeActions(bard, "en").find((a) => a.summary.grantedDie);
    if (!action || !api) throw new Error("no Bardic Inspiration");
    api.prepareResolution(action, (prepared, commit) =>
      commit(() => undefined, { action: prepared, targets: ["pc-bren"] })
    );
    await writesSettled();
    await writesSettled();
    const calls = io.writeCampaignCombatEffect.mock.calls as unknown as Array<
      [string, string, null, number, { kind: string; grant?: unknown }]
    >;
    expect(calls[0]?.slice(0, 2)).toEqual(["bren", "c-bren"]);
    expect(calls[0]?.[4]).toEqual({
      kind: "inspiration",
      grant: { kind: "bardic-die", die: "d6" },
    });

    useUndoStore.getState().undo();
    await writesSettled();
    await writesSettled();
    expect(calls.at(-1)?.[4].kind).toBe("revert");
  });
});
