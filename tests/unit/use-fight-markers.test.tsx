/**
 * A player's device writes its fight's markers to the campaign's session log (start,
 * rounds, end), so the report finds the fight even when the DM's campaign page is closed.
 * The DM's own device does not: its campaign page mirrors the whole chronicle.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemorySessionLogStore, foldSession } from "@/lib/session-log";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const memory = vi.hoisted(() => ({
  store: null as ReturnType<typeof createMemorySessionLogStore> | null,
}));
vi.mock("@/features/campaigns/session-log-source", () => ({
  sessionLogStoreFor: () => memory.store,
}));
vi.mock("@/lib/firebase", () => ({}));

import { useFightMarkers } from "@/features/campaigns/use-fight-markers";
import { useCombatStatusStore } from "@/features/campaigns/combat-status-store";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";

const encounter = (round: number): EncounterState => ({
  combatants: [],
  nextMonsterOrdinal: 1,
  round,
  currentCombatantId: null,
  epoch: 5,
  status: "active",
});

const campaign = (fight: EncounterState | null): CampaignDoc =>
  ({ id: "camp1", dmUid: "dm", encounter: fight }) as unknown as CampaignDoc;

const status = { campaignId: "camp1" } as GlobalCombat;

const lines = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  const [head] = (await memory.store?.recent(1)) ?? [];
  return foldSession(head?.items ?? [], { dmUid: "dm" }).map((e) => e.id);
};

beforeEach(() => {
  memory.store = createMemorySessionLogStore();
  useCombatStatusStore.getState().set(null, null);
});

describe("a player's device writes its fight's markers", () => {
  it("start and rounds while the fight runs, the end when it closes", async () => {
    act(() => useCombatStatusStore.getState().set(status, null));
    const { rerender } = renderHook(
      ({ campaigns }) => useFightMarkers(campaigns, "ana"),
      {
        initialProps: { campaigns: [campaign(encounter(2))] },
      }
    );
    expect(await lines()).toEqual(["enc:5:start", "enc:5:round:1", "enc:5:round:2"]);
    act(() => useCombatStatusStore.getState().set(null, null));
    rerender({ campaigns: [campaign(null)] });
    expect(await lines()).toEqual([
      "enc:5:start",
      "enc:5:round:1",
      "enc:5:round:2",
      "enc:5:end",
    ]);
  });

  it("the DM's device writes none (its campaign page mirrors the chronicle)", async () => {
    act(() => useCombatStatusStore.getState().set(status, null));
    renderHook(() => useFightMarkers([campaign(encounter(1))], "dm"));
    expect(await lines()).toEqual([]);
  });
});
