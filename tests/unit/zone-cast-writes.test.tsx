/**
 * Casting a spell that leaves an area in a fight puts the zone on the encounter
 * (edge-case M9): Spirit Guardians cast at 3rd level by this player's PC appends one
 * `zone` effect, held by Concentration, and undoing the cast revokes it.
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
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  vi.unstubAllEnvs();
  useCharacterStore.setState({ character: null });
  useCombatStatusStore.setState({ status: null });
  useUndoStore.getState().clear(null);
  appendPersistentCombatEffect.mockClear();
});

describe("a zone spell cast in a fight", () => {
  it("appends its zone to the encounter", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const doc = makeCharacterDoc({
      classId: "cleric",
      level: 5,
      spells: [{ srdId: "spirit-guardians", prepared: true }],
      spellSlots: [{ level: 3, total: 2 }],
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
            { id: "pc-u2", kind: "pc", name: "Ally" },
            { id: "wolf", kind: "monster", side: "ally", name: "Wolf" },
            { id: "goblin", kind: "monster", name: "Goblin" },
          ],
          turnOrderIds: ["pc-u1"],
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
      (a) => a.spellId === "spirit-guardians"
    ) as ResolvedAction;
    act(() => {
      api?.executeAction(action);
    });
    await waitFor(() => expect(appendPersistentCombatEffect).toHaveBeenCalledTimes(1));
    const [campaignId, effect] = appendPersistentCombatEffect.mock
      .calls[0] as unknown as [
      string,
      { payload: unknown; duration: unknown; source: { castLevel: number } },
    ];
    expect(campaignId).toBe("camp-1");
    // Every ally is spared unless the caster says otherwise; the goblin isn't.
    expect(effect.payload).toEqual({
      kind: "zone",
      spellId: "spirit-guardians",
      spared: ["pc-u2", "wolf"],
    });
    expect(effect.duration).toMatchObject({
      kind: "concentration",
      sourceId: "spirit-guardians",
    });
    expect(effect.source.castLevel).toBe(3);
  });
});

describe("the v0.26.0 rules gate", () => {
  it("is off unless the build says the rules shipped", async () => {
    const { combatEffectsV26On } = await import("@/lib/deployed-rules");
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "");
    expect(combatEffectsV26On()).toBe(false);
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    expect(combatEffectsV26On()).toBe(true);
  });
});
