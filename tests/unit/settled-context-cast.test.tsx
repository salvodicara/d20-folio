/**
 * Audit 2026-11-13, items 2+3 (red until the «campaign context settled» helper): a cast
 * in the first moments after the sheet opens, while this character's fight has not
 * arrived yet, must wait for the fight: the target step then offers the fight's
 * creatures, and a buff on an ally lands in the fight's effects — never on the campaign
 * clock (where the DM's fight never sees it), never on no one.
 *
 * (2a) the campaigns are read (party known) but the fight's live status is still on its
 *      way — the window the #1171 wait does not cover;
 * (2b) nothing is read yet.
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
const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  writeCampaignEffects: vi.fn<(campaignId: string, effects: unknown[]) => Promise<void>>(
    () => Promise.resolve()
  ),
}));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appendPersistentCombatEffect: io.appendPersistentCombatEffect,
  revokePersistentCombatEffect: io.revokePersistentCombatEffect,
}));
vi.mock("@/features/campaigns/campaign-effects-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  writeCampaignEffects: io.writeCampaignEffects,
}));

import {
  useCombatStatusStore,
  type GlobalCombat,
  type PipModel,
} from "@/features/campaigns/global-combat-context";
import { type PartyRoster, usePartyRosterStore } from "@/features/campaigns/party-roster";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  usePlayPromptStore.setState({ open: {} });
  vi.unstubAllEnvs();
  useCharacterStore.setState({ character: null });
  useCombatStatusStore.setState({ status: null, pip: null });
  usePartyRosterStore.setState({ party: null, resolvedFor: null, castWaiting: null });
  useToastStore.setState({ toasts: [] });
  useUndoStore.getState().clear(null);
  io.appendPersistentCombatEffect.mockClear();
  io.writeCampaignEffects.mockClear();
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
        { id: "pc-u2", kind: "pc", name: "Ally", memberUid: "u2", characterId: "c2" },
        { id: "goblin", kind: "monster", name: "Goblin" },
      ],
      turnOrderIds: ["pc-u1", "pc-u2", "goblin"],
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

function fightPip(characterId: string): PipModel {
  return {
    primaryId: "camp-1",
    entries: [
      {
        campaignId: "camp-1",
        campaignName: "Campaign",
        role: "pc",
        state: "needs-roll",
        round: 1,
        heroName: "Hero",
        characterId,
        actorName: null,
      },
    ],
  };
}

async function castWardingBondInTheGap(campaignsRead: boolean): Promise<string[]> {
  const doc = makeCharacterDoc({
    classId: "cleric",
    level: 5,
    spells: [{ srdId: "warding-bond", prepared: true }],
    spellSlots: [{ level: 2, total: 3 }],
  });
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
  useAuthStore.setState({ user: { uid: "u1" } as User });
  const party: PartyRoster = {
    campaignId: "camp-1",
    characterId: doc.id,
    selfId: "pc-u1",
    minute: 600,
    members: [
      {
        ref: { kind: "pc", combatantId: "pc-u2", memberUid: "u2", characterId: "c2" },
        name: "Ally",
      },
    ],
  };
  // «Campaigns read, fight pending» (the engine lane's contract): the party is resolved and
  // the campaigns snapshot's pip already lists this character's fight, but the fight's live
  // status has not answered yet.
  const pip = fightPip(doc.id);
  useCombatStatusStore.setState({ status: null, pip: null });
  if (campaignsRead) {
    usePartyRosterStore.getState().setParty(party, doc.id);
    useCombatStatusStore.setState({ pip });
  }
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
    (a) => a.spellId === "warding-bond"
  ) as ResolvedAction;
  act(() => {
    api?.executeAction(action);
  });
  // The shell answers a moment later: this character's fight (and, in 2b, the campaigns).
  act(() => {
    if (!campaignsRead) usePartyRosterStore.getState().setParty(party, doc.id);
    useCombatStatusStore.setState({ status: fight(doc.id), pip });
  });
  await waitFor(() => expect(usePlayPromptStore.getState().open.target).toBeDefined(), {
    timeout: 3000,
  });
  const choices =
    usePlayPromptStore.getState().open.target?.request.step.candidates.map((c) => c.id) ??
    [];
  act(() => usePlayPromptStore.getState().open.target?.onConfirm(["pc-u2"]));
  return choices;
}

describe("a cast before this character's fight is read (settled-context gap)", () => {
  it.each([
    ["(2a) campaigns read, fight still on its way", true],
    ["(2b) nothing read yet", false],
  ] as const)(
    "%s: waits for the fight, offers its creatures, lands the buff in the fight",
    { timeout: 20000 },
    async (_label, campaignsRead) => {
      vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
      const choices = await castWardingBondInTheGap(campaignsRead);
      // the fight's roster, not the party list: the goblin is there to target
      expect(choices).toContain("goblin");
      await waitFor(() => expect(io.appendPersistentCombatEffect).toHaveBeenCalled(), {
        timeout: 3000,
      });
      expect(io.writeCampaignEffects).not.toHaveBeenCalled();
    }
  );
});
