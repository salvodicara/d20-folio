/**
 * A mark cast in a campaign fight lands on the creature it names (the writer deleted
 * in 9cbb720bc, restored): Hunter's Mark on a goblin appends one target-mark effect
 * on it, so the fight's mark readers (moving the mark when it drops) see it again.
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
const { appendPersistentCombatEffect, revokePersistentCombatEffect } = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appendPersistentCombatEffect,
  revokePersistentCombatEffect,
}));

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  revokePersistentCombatEffect.mockClear();
  usePlayPromptStore.setState({ open: {} });
  vi.unstubAllEnvs();
  useCharacterStore.setState({ character: null });
  useCombatStatusStore.setState({ status: null });
  useUndoStore.getState().clear(null);
  appendPersistentCombatEffect.mockClear();
});

describe("a mark cast in a fight", () => {
  it(
    "Hunter's Mark lands on the enemy it names, and the undo takes it back",
    { timeout: 20000 },
    async () => {
      vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
      const doc = makeCharacterDoc({
        classId: "ranger",
        level: 5,
        spells: [{ srdId: "hunters-mark", prepared: true }],
        spellSlots: [{ level: 1, total: 4 }],
      });
      useCharacterStore.setState({
        character: doc,
        readonly: false,
        loading: false,
        error: null,
      });
      useAuthStore.setState({ user: { uid: "u1" } as User });
      useCombatStatusStore.setState({
        status: {
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
              {
                id: "pc-u2",
                kind: "pc",
                name: "Ally",
                memberUid: "u2",
                characterId: "c2",
              },
              { id: "goblin", kind: "monster", name: "Goblin" },
            ],
            turnOrderIds: ["pc-u1", "pc-u2", "goblin"],
            currentId: "pc-u1",
          },
          myId: "pc-u1",
          characterId: doc.id,
          gathering: false,
          isMyTurn: true,
          initiativeBonus: 0,
          initiativeRoll: 10,
          round: 1,
        },
      } as never);
      let api: ReturnType<typeof useTurnEconomy> | null = null;
      function Probe() {
        api = useTurnEconomy();
        return null;
      }
      render(
        <MemoryRouter>
          <TurnEconomyProvider renderPrompts={false}>
            <Probe />
          </TurnEconomyProvider>
        </MemoryRouter>
      );
      const action = localizeActions(doc, "en").find(
        (a) => a.spellId === "hunters-mark"
      ) as ResolvedAction;
      act(() => {
        api?.executeAction(action);
      });
      await waitFor(() =>
        expect(usePlayPromptStore.getState().open.target).toBeDefined()
      );
      act(() => usePlayPromptStore.getState().open.target?.onConfirm(["goblin"]));
      await waitFor(
        () =>
          expect(
            appendPersistentCombatEffect.mock.calls.some(
              (c) =>
                (c as unknown as [string, { target: { combatantId: string } }])[1].target
                  .combatantId === "goblin"
            )
          ).toBe(true),
        {
          timeout: 8000,
        }
      );
      const calls = appendPersistentCombatEffect.mock.calls as unknown as Array<
        [
          string,
          {
            target: { combatantId: string };
            payload: unknown;
            bindings?: { spellcastingModifier?: number };
          },
        ]
      >;
      const effect = calls
        .map(([, e]) => e)
        .find((e) => e.target.combatantId === "goblin");
      if (!effect) throw new Error("no effect written");
      expect(effect.payload).toMatchObject({ kind: "target-mark" });
      act(() => {
        useUndoStore.getState().undo();
      });
      await waitFor(() => expect(revokePersistentCombatEffect).toHaveBeenCalled(), {
        timeout: 8000,
      });
    }
  );
});
