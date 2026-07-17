/**
 * DmTools — DM-gated scaffold (Phase 5 · Part 2b).
 *
 * Shows the roster controls (yield DM · remove member) + the danger zone + clearly-labelled
 * Phase-6 placeholders to the DM only; renders nothing for a non-DM member. The invite/share
 * LINK and its lock-joins (revoke) switch both moved to the Access section (CampaignInvite),
 * so DmTools no longer hosts either. `@/lib/firebase` is mocked for the guard (reached
 * transitively via `authStore`); the auth uid is toggled per test.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const { authUid, isAdminState, removeMemberMock, yieldDmRoleMock, showToastMock } =
  vi.hoisted(() => ({
    authUid: { value: "mock-uid" },
    isAdminState: { value: false },
    removeMemberMock: vi.fn(() => Promise.resolve()),
    yieldDmRoleMock: vi.fn(() => Promise.resolve()),
    showToastMock: vi.fn(),
  }));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: authUid.value } }),
}));
// Mock the admin gate so DmTools' admin-OR-DM render is hermetic (the real hook is
// true under dev-bypass, which depends on `.env.local`).
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));
// Spy on the two roster-management writers so the tests assert the call WITHOUT
// hitting Firestore (the real fns early-return only under dev-bypass; here they
// would run a real transaction). Keep every other export real (importOriginal).
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-io")>()),
  removeMember: removeMemberMock,
  yieldDmRole: yieldDmRoleMock,
}));
// The post-write ACL reconcile is fire-and-forget and Firebase-coupled — stub it so the
// success path never reaches Firestore.
vi.mock("@/features/campaigns/dm-readers", () => ({
  reconcileOwnDmReaders: vi.fn(() => Promise.resolve()),
}));
// The confirm dialog resolves true (the DM accepted). The toast is a STABLE spy so the
// B10 error-path tests can assert the failure message fired.
vi.mock("@/stores/confirmStore", () => ({
  useConfirmStore: { getState: () => ({ confirm: vi.fn(() => Promise.resolve(true)) }) },
}));
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast: showToastMock }) },
}));

import { DmTools } from "@/features/campaigns/DmTools";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import { removeMember } from "@/features/campaigns/campaign-io";

beforeEach(() => {
  vi.clearAllMocks();
  authUid.value = "mock-uid"; // matches the fixture dmUid
  isAdminState.value = false;
  useCampaignStore.setState({
    campaign: makeDevCampaign("c1"),
    loading: false,
    error: null,
  });
});

describe("DmTools", () => {
  it("no longer hosts the invite link (moved to the ungated CampaignInvite) nor any coming-soon placeholder chips", () => {
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    // Sharing opened to ALL members: the invite/share link affordance left DmTools
    // for the ungated CampaignInvite section, so the DM-only tools no longer show it.
    expect(screen.queryByDisplayValue(/\/join\/c1$/)).not.toBeInTheDocument();
    // The premium re-layout DELETED the Phase-6 placeholder chips — DM Tools is now
    // ROLE + DANGER only (yield DM · remove member · delete campaign).
    expect(screen.queryByText(/shared character view/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/content sharing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/encounter tracker/i)).not.toBeInTheDocument();
  });

  it("surfaces the remove-member control to the DM, but NOT the lock-joins switch (moved to Access)", () => {
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/remove a member/i)).toBeInTheDocument();
    // The lock-new-members kill switch now lives in the Access section (CampaignInvite),
    // co-located with the link it disables — DmTools no longer hosts it.
    expect(
      screen.queryByRole("switch", { name: /lock new members/i })
    ).not.toBeInTheDocument();
  });

  it("removing a member (after confirm) calls removeMember with the chosen uid", async () => {
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    // The fixture's other members are member-mara + member-bren (dmUid = mock-uid).
    fireEvent.change(screen.getByLabelText(/remove a member/i), {
      target: { value: "member-mara" },
    });
    fireEvent.click(screen.getByRole("button", { name: /remove member/i }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("c1", "member-mara"));
  });

  it("no longer hosts the encounter trigger — that moved to the Party section", () => {
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    // The party overview + Run-encounter affordance live in the Party section now.
    expect(
      screen.queryByRole("button", { name: /run encounter|party overview|resume/i })
    ).not.toBeInTheDocument();
  });

  it("renders nothing for a non-DM, non-admin member", () => {
    authUid.value = "someone-else";
    isAdminState.value = false;
    const { container } = render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("ADMIN1 — renders for the admin even when they are NOT the DM", () => {
    authUid.value = "someone-else"; // not the fixture dmUid…
    isAdminState.value = true; // …but the admin overrides
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    // The admin override renders the DM tools — proven by the DM-only hand-over + remove
    // controls (the invite link + its lock now live in CampaignInvite / Access).
    expect(screen.getByText(/hand over the dm role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remove a member/i)).toBeInTheDocument();
  });

  // ── B10 — role-write failures must be handled (no silent lock-out) ──────────
  // The toast payloads (typed off the untyped spy) so the error/success message can be
  // matched without an `any`-typed asymmetric matcher.
  const toastMessages = (): string[] =>
    (showToastMock.mock.calls as Array<[{ message: string }]>).map((c) => c[0].message);

  it("B10 — a FAILED DM hand-over reverts the optimistic role flip and shows an error toast", async () => {
    yieldDmRoleMock.mockRejectedValueOnce(new Error("offline"));
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/hand over the dm role/i), {
      target: { value: "member-mara" },
    });
    fireEvent.click(screen.getByRole("button", { name: /make dm/i }));

    await waitFor(() =>
      expect(yieldDmRoleMock).toHaveBeenCalledWith("c1", "mock-uid", "member-mara")
    );
    // The error toast surfaces (never the unconditional success toast)…
    await waitFor(() =>
      expect(toastMessages().some((m) => /couldn.t hand over the dm role/i.test(m))).toBe(
        true
      )
    );
    // …and the role state is CONSISTENT again: dmUid reverted, so the party is not left
    // locked out of DM Tools with no DM.
    expect(useCampaignStore.getState().campaign?.dmUid).toBe("mock-uid");
    expect(toastMessages().some((m) => /dm role transferred/i.test(m))).toBe(false);
  });

  it("B10 — a FAILED member removal reverts the optimistic roster drop and shows an error toast", async () => {
    removeMemberMock.mockRejectedValueOnce(new Error("offline"));
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/remove a member/i), {
      target: { value: "member-mara" },
    });
    fireEvent.click(screen.getByRole("button", { name: /remove member/i }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("c1", "member-mara"));
    await waitFor(() =>
      expect(toastMessages().some((m) => /couldn.t remove the member/i.test(m))).toBe(
        true
      )
    );
    // The member is restored to the roster (revert), not silently dropped on a failed write.
    expect(
      useCampaignStore.getState().campaign?.memberDetails["member-mara"]
    ).toBeDefined();
  });

  it("B10 — a SUCCESSFUL hand-over still fires the success toast (happy path intact)", async () => {
    render(
      <MemoryRouter>
        <DmTools />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/hand over the dm role/i), {
      target: { value: "member-mara" },
    });
    fireEvent.click(screen.getByRole("button", { name: /make dm/i }));
    await waitFor(() =>
      expect(toastMessages().some((m) => /dm role transferred/i.test(m))).toBe(true)
    );
  });
});
