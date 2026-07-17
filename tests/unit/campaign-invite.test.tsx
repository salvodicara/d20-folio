/**
 * CampaignInvite — the Access section: the invite link + its co-located lock kill switch.
 *
 * SHARING is ungated (every member copies/shares the link); REVOKING (lock-joins) is gated
 * on `canManage` and now sits with the link (golden rule 6 — moved out of DM Tools). The
 * link is `joinsLocked`-AWARE: when locked, Copy/Share go inert and a lock badge rides the
 * rubric, so a member can never copy a dead link. `@/lib/firebase` is mocked (reached
 * transitively via campaign-io); `setJoinsLocked` is spied so the toggle asserts without
 * touching Firestore.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-io")>()),
  setJoinsLocked: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast: vi.fn() }) },
}));

import { CampaignInvite } from "@/features/campaigns/CampaignInvite";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import { setJoinsLocked } from "@/features/campaigns/campaign-io";

beforeEach(() => {
  vi.clearAllMocks();
  useCampaignStore.setState({
    campaign: makeDevCampaign("c1"),
    loading: false,
    error: null,
  });
});

describe("CampaignInvite (Access)", () => {
  it("offers the invite link to every member behind Copy + Share (compressed — no raw link field)", () => {
    render(<CampaignInvite canManage={false} />);
    // Compressed Access: the link lives BEHIND the actions (no read-only input row).
    expect(screen.queryByDisplayValue(/\/join\/c1$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy invite link/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /share/i })).toBeEnabled();
  });

  it("gates the lock switch on canManage — a plain member never sees the control", () => {
    render(<CampaignInvite canManage={false} />);
    expect(
      screen.queryByRole("switch", { name: /lock new members/i })
    ).not.toBeInTheDocument();
  });

  it("shows the manager the lock switch and persists the flip via setJoinsLocked", () => {
    render(<CampaignInvite canManage />);
    const sw = screen.getByRole("switch", { name: /lock new members/i });
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    expect(setJoinsLocked).toHaveBeenCalledWith("c1", true);
    // Optimistic store flip → the link is now KNOWN-DEAD: Copy/Share go inert and the
    // rubric shows the lock badge, so no one can copy a revoked link.
    expect(screen.getByRole("button", { name: /copy/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /share/i })).toBeDisabled();
    expect(screen.getByText(/^locked$/i)).toBeInTheDocument();
  });

  it("a locked campaign disables Copy/Share even for a non-manager (no dead-link copy)", () => {
    useCampaignStore.setState({
      campaign: { ...makeDevCampaign("c1"), joinsLocked: true },
      loading: false,
      error: null,
    });
    render(<CampaignInvite canManage={false} />);
    expect(screen.getByRole("button", { name: /copy/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /share/i })).toBeDisabled();
    expect(screen.getByText(/^locked$/i)).toBeInTheDocument();
  });
});
