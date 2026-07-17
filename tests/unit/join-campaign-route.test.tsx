/**
 * JoinCampaignRoute — the shareable-invite landing (#33). Proves it joins the
 * campaign named by the `:code` URL param and redirects to its hub on success,
 * and shows a recoverable error on an invalid code. `joinCampaign` + the router
 * navigate are mocked so it never touches Firestore.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

const { joinMock, navigateMock } = vi.hoisted(() => ({
  joinMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({ joinCampaign: joinMock }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string; displayName: string } }) => unknown) =>
    sel({ user: { uid: "u1", displayName: "Sal" } }),
}));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { JoinCampaignRoute } from "@/features/campaigns/JoinCampaignRoute";

function renderAt(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinCampaignRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("JoinCampaignRoute", () => {
  beforeEach(() => {
    joinMock.mockReset();
    navigateMock.mockReset();
  });

  it("joins the code and redirects to the hub", async () => {
    joinMock.mockResolvedValue("ABC123");
    renderAt("ABC123");
    await waitFor(() =>
      // args: uid, code, displayName, photoURL (none here).
      expect(joinMock).toHaveBeenCalledWith("u1", "ABC123", "Sal", null)
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/campaigns/ABC123", { replace: true })
    );
  });

  it("shows a recoverable error on an invalid code", async () => {
    joinMock.mockRejectedValue(new Error("not found"));
    renderAt("BADCODE");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /back to campaigns/i })
      ).toBeInTheDocument()
    );
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/"),
      expect.anything()
    );
  });
});
