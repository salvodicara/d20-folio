/**
 * Out of a fight, in a campaign (v0.26.0 rules): a buff cast on another party member
 * lands on the campaign clock (`campaigns/{id}/effects`), not on a fight. The target
 * list is the party (`targetRoster`, out of a fight), and the cast writes the effect
 * on the named member (`leaveStandingsOnClock`). Without the v0.26.0 rules nothing is
 * written. The twin of `ally-buff-writes.test.tsx`, which casts inside a fight.
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
const { writeCampaignEffects } = vi.hoisted(() => ({
  writeCampaignEffects: vi.fn<(campaignId: string, effects: unknown[]) => Promise<void>>(
    () => Promise.resolve()
  ),
}));
vi.mock("@/features/campaigns/campaign-effects-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  writeCampaignEffects,
}));

import { type PartyRoster, usePartyRosterStore } from "@/features/campaigns/party-roster";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  usePlayPromptStore.setState({ open: {} });
  vi.unstubAllEnvs();
  useCharacterStore.setState({ character: null });
  usePartyRosterStore.setState({ party: null });
  useUndoStore.getState().clear(null);
  writeCampaignEffects.mockClear();
});

async function castWardingBondOnTheParty(
  partyArrives: "before" | "after-the-click" = "before"
): Promise<string[]> {
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
  useCombatStatusStore.setState({ status: null });
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
  if (partyArrives === "before") usePartyRosterStore.setState({ party });
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
  // The shell's campaign listener can answer after the sheet is already clickable.
  if (partyArrives === "after-the-click")
    act(() => usePartyRosterStore.getState().setParty(party, doc.id));
  await waitFor(() => expect(usePlayPromptStore.getState().open.target).toBeDefined());
  const choices =
    usePlayPromptStore.getState().open.target?.request.step.candidates.map((c) => c.id) ??
    [];
  act(() => usePlayPromptStore.getState().open.target?.onConfirm(["pc-u2"]));
  return choices;
}

describe("an ally buff cast out of a fight, in a campaign", () => {
  it(
    "offers the party and lands on the named member through the campaign clock",
    { timeout: 20000 },
    async () => {
      vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
      const choices = await castWardingBondOnTheParty();
      expect(choices).toContain("pc-u2");
      await waitFor(() => expect(writeCampaignEffects).toHaveBeenCalled(), {
        timeout: 8000,
      });
      const [campaignId, effects] = writeCampaignEffects.mock.calls[0] ?? [];
      expect(campaignId).toBe("camp-1");
      const written = (effects ?? []) as Array<{
        target: { combatantId: string };
        payload: unknown;
      }>;
      expect(written.map((e) => e.target.combatantId)).toEqual(["pc-u2"]);
      expect(written[0]?.payload).toEqual({
        kind: "grant-group",
        activeKey: "spell-warding-bond",
      });
    }
  );

  it(
    "waits for the party when the cast comes before the campaign is read",
    { timeout: 20000 },
    async () => {
      vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
      // Rehearsal 2026-11-13: the Paladin cast Warding Bond a moment after opening the
      // sheet; the party was not known yet, so the slot went with no one bonded.
      const choices = await castWardingBondOnTheParty("after-the-click");
      expect(choices).toContain("pc-u2");
      await waitFor(() => expect(writeCampaignEffects).toHaveBeenCalled(), {
        timeout: 8000,
      });
    }
  );
});
