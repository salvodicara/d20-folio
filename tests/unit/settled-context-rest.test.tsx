/**
 * Audit 2026-11-13, item 5 (red until the «campaign context settled» helper): a rest
 * taken in the first moments after the sheet opens, before the shell has read the
 * campaigns, must still move the campaign's clock once the campaign is known — not
 * rest as a solo character and leave the other members' countdowns standing.
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
import { usePartyRosterStore } from "@/features/campaigns/party-roster";

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

beforeEach(() => {
  vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
  vi.clearAllMocks();
  useAuthStore.setState({ user: { uid: "u1" } as User });
  useToastStore.setState({ toasts: [], timers: {} });
  usePartyRosterStore.setState({ party: null, resolvedFor: null, castWaiting: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("a rest before the campaign is read (settled-context gap)", () => {
  it(
    "a Long Rest still steps the campaign clock once the campaign arrives",
    { timeout: 15000 },
    async () => {
      // The sheet is clickable; the shell has not read the campaigns yet: no clock on the
      // session, no party resolved for this character.
      const base = structuredClone(MOCK_CHARACTER);
      base.session.hp = { current: 5, temp: 0 };
      base.session.clockSeen = 300;
      useCharacterStore.setState({
        character: base,
        readonly: false,
        loading: false,
        error: null,
      });
      render(
        <ItemResourceCommandContext.Provider value={commands()}>
          <RestModal open onClose={() => {}} />
        </ItemResourceCommandContext.Provider>
      );
      fireEvent.click(screen.getByText("Long Rest"));
      fireEvent.click(screen.getByRole("button", { name: "Complete rest" }));
      // The campaign arrives a moment later (GlobalCombat's listener answers).
      const live = useCharacterStore.getState().character;
      if (live) {
        useCharacterStore.setState({
          character: withCampaignClock(live, {
            campaignId: "c1",
            clock: { minute: 300 },
          }),
        });
      }
      usePartyRosterStore.getState().setParty(null, base.id);
      await vi.waitFor(
        () => expect(io.stepCampaignClock).toHaveBeenCalledWith("c1", 480, "u1"),
        { timeout: 3000 }
      );
    }
  );
});
