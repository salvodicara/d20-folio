/**
 * The classic rehearsal's intermittent red (classic-journey, 2026-11-13; audit item 12):
 * the round pip already says «Your turn» — the campaigns snapshot lists this character's
 * fight — but the fight's live status has not reached the sheet. A turn action in that
 * window spent its Action on the no-fight turn; the status then arrived, the turn moved
 * to the fight's key and started empty, and the Action came back. Every turn action now
 * waits for the fight (its row busy) and spends the fight's Action; a fight that never
 * arrives refuses the action with its reason, never spends it on the wrong turn.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import {
  useCombatStatusStore,
  type GlobalCombat,
  type PipModel,
} from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  vi.useRealTimers();
  usePlayPromptStore.setState({ open: {} });
  useCharacterStore.setState({ character: null });
  useCombatStatusStore.setState({ status: null, pip: null });
  usePartyRosterStore.setState({ party: null, resolvedFor: null, castWaiting: null });
  useToastStore.setState({ toasts: [] });
  useUndoStore.getState().clear(null);
  useCombatStore.getState().endCombat();
});

function fight(characterId: string): GlobalCombat {
  return {
    campaignId: "camp-1",
    encounter: {
      nextMonsterOrdinal: 1,
      round: 1,
      currentCombatantId: "pc-u1",
      epoch: 1,
      status: "active",
      combatants: [],
    },
    view: {
      rows: [
        { id: "pc-u1", kind: "pc", name: "Me" },
        { id: "goblin", kind: "monster", name: "Goblin" },
      ],
      turnOrderIds: ["pc-u1", "goblin"],
      currentId: "pc-u1",
    },
    myId: "pc-u1",
    characterId,
    gathering: false,
    isMyTurn: true,
    initiativeBonus: 0,
    initiativeRoll: 10,
    round: 1,
  } as unknown as GlobalCombat;
}

/** The pip the campaigns snapshot builds: `characterId`'s fight, on its turn. */
function pipOf(characterId: string): PipModel {
  return {
    primaryId: "camp-1",
    entries: [
      {
        campaignId: "camp-1",
        campaignName: "Campaign",
        role: "pc",
        state: "your-turn",
        round: 1,
        heroName: "Me",
        characterId,
        actorName: null,
      },
    ],
  };
}

/** The sheet open on a level 3 bard, its campaigns read, the given pip on screen. */
function openSheet(pip: (characterId: string) => PipModel) {
  const doc = makeCharacterDoc({
    classId: "bard",
    level: 3,
    spells: [{ srdId: "minor-illusion", prepared: true }],
  });
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
  useAuthStore.setState({ user: { uid: "u1" } as User });
  usePartyRosterStore.getState().setParty(null, doc.id);
  useCombatStatusStore.setState({ status: null, pip: pip(doc.id) });
  let current: ReturnType<typeof useTurnEconomy> | null = null;
  function Probe() {
    current = useTurnEconomy();
    return null;
  }
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <Probe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const actions = localizeActions(doc, "en");
  const find = (test: (a: ResolvedAction) => boolean): ResolvedAction => {
    const action = actions.find(test);
    if (!action) throw new Error("no such action");
    return action;
  };
  return { api: () => current, doc, find };
}

const spentOnTheTurn = () => {
  const { selected, attacksUsed } = useCombatStore.getState();
  return selected.action.length > 0 || attacksUsed > 0;
};

describe("a turn action while the pip shows the fight but its status is on the way", () => {
  it.each([
    ["a cast", (a: ResolvedAction) => a.spellId === "minor-illusion"],
    ["an attack", (a: ResolvedAction) => a.source === "weapon"],
    ["Dash", (a: ResolvedAction) => /dash/i.test(a.id)],
  ] as const)(
    "%s waits for the fight and spends the fight's Action",
    { timeout: 15000 },
    async (_label, which) => {
      const { api, doc, find } = openSheet(pipOf);
      const action = find(which);
      act(() => api()?.executeAction(action));
      expect(usePartyRosterStore.getState().castWaiting).toBe(action.id);
      expect(spentOnTheTurn()).toBe(false);
      // The fight's live status reaches the sheet a moment later.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        useCombatStatusStore.setState({
          status: fight(doc.id),
        });
      });
      expect(usePartyRosterStore.getState().castWaiting).toBeNull();
      // An attack asks whom; the goblin is offered, from the fight.
      await waitFor(
        () => {
          const target = usePlayPromptStore.getState().open.target;
          if (target) act(() => target.onConfirm(["goblin"]));
          expect(spentOnTheTurn()).toBe(true);
        },
        { timeout: 3000 }
      );
    }
  );

  it("a pip on another character's fight never delays the action", () => {
    const { api, find } = openSheet(() => pipOf("someone-else"));
    const dash = find((a) => /dash/i.test(a.id));
    act(() => api()?.executeAction(dash));
    // No fight for this sheet: the action goes on at once, out of a fight.
    expect(usePartyRosterStore.getState().castWaiting).toBeNull();
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("a fight that never arrives refuses the action and says why", async () => {
    vi.useFakeTimers();
    const { api, find } = openSheet(pipOf);
    const dash = find((a) => /dash/i.test(a.id));
    act(() => api()?.executeAction(dash));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(usePartyRosterStore.getState().castWaiting).toBeNull();
    expect(spentOnTheTurn()).toBe(false);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
      "Can't read the campaign yet. Try again in a moment."
    );
  });
});
