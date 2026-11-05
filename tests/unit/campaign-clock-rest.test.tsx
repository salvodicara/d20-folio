/**
 * A campaign character's rest moves the campaign's clock, through the screen's own
 * entry point (the Rest modal's «Complete rest» → `useRestCommit`): a Long Rest steps
 * it 8 hours and the sheet marks the minute it caught up to. A rest is not undone.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  stepCampaignClock: vi.fn(() => Promise.resolve(null)),
  undoCampaignClockStep: vi.fn(() => Promise.resolve(null)),
  setCampaignClockTime: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/features/campaigns/clock-io", () => io);

import { RestModal } from "@/features/character/RestModal";
import {
  ItemResourceCommandContext,
  type ItemResourceCommandApi,
} from "@/features/character/center/useItemResourceCommands";
import type {
  ItemResourceRecoveryBoundary,
  PreparedItemResourceBoundary,
} from "@/lib/item-resource-boundaries";
import { MOCK_CHARACTER } from "@/lib/mock";
import { withCampaignClock } from "@/lib/play/campaign-clock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

function commands(): ItemResourceCommandApi {
  const unavailable = () => null;
  return {
    prepare: vi.fn(() => Promise.resolve(null)),
    commit: vi.fn(unavailable),
    replay: vi.fn(unavailable),
    revert: vi.fn(() => false),
    prepareBoundary: vi.fn((trigger: ItemResourceRecoveryBoundary) =>
      Promise.resolve({
        kind: "item-resource-boundary",
        trigger: { kind: trigger.kind },
        occurrenceId: `rest-${trigger.kind}`,
        entries: [],
      } as PreparedItemResourceBoundary)
    ),
    commitBoundary: vi.fn((boundary: PreparedItemResourceBoundary) => ({
      prepared: boundary,
    })),
    replayBoundary: vi.fn(unavailable),
    revertBoundary: vi.fn(() => false),
  };
}

function open(campaign: boolean) {
  const base = structuredClone(MOCK_CHARACTER);
  base.session.hp = { current: 5, temp: 0 };
  base.session.clockSeen = 300;
  const character = campaign
    ? withCampaignClock(base, { campaignId: "c1", clock: { minute: 300 } })
    : base;
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
  render(
    <ItemResourceCommandContext.Provider value={commands()}>
      <RestModal open onClose={() => {}} />
    </ItemResourceCommandContext.Provider>
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
  vi.clearAllMocks();
  useAuthStore.setState({ user: { uid: "u1" } as User });
  useToastStore.setState({ toasts: [], timers: {} });
});
afterEach(() => vi.unstubAllEnvs());

describe("a rest on the campaign clock", () => {
  it("a Long Rest steps the campaign 8 hours and the sheet catches up to it", async () => {
    open(true);
    fireEvent.click(screen.getByText("Long Rest"));
    fireEvent.click(screen.getByRole("button", { name: "Complete rest" }));
    await screen.findByText("Long Rest Complete");
    await vi.waitFor(() =>
      expect(io.stepCampaignClock).toHaveBeenCalledWith("c1", 480, "u1")
    );
    expect(useCharacterStore.getState().character?.session.clockSeen).toBe(780);
  });

  it("a solo sheet's rest writes no campaign", async () => {
    open(false);
    fireEvent.click(screen.getByText("Long Rest"));
    fireEvent.click(screen.getByRole("button", { name: "Complete rest" }));
    await screen.findByText("Long Rest Complete");
    expect(io.stepCampaignClock).not.toHaveBeenCalled();
  });
});
