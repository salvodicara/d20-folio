/**
 * An invite link on the new frame: a link that did not work says so in one tile, with
 * the way back to the campaigns (no dead end).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  joinCampaign: () => Promise.reject(new Error("no such campaign")),
}));

import { JoinScreen } from "@/domains/campaign/ui/JoinScreen";
import { useAuthStore } from "@/stores/authStore";

describe("JoinScreen", () => {
  it("a link that did not work says so and leads back to the campaigns", async () => {
    useAuthStore.setState({
      user: { uid: "u1", displayName: "A", photoURL: null } as never,
    });
    render(
      <MemoryRouter initialEntries={["/join/ZZZZ"]}>
        <Routes>
          <Route path="/join/:code" element={<JoinScreen />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("heading", {
        name: /invite link didn.t work|did not work/i,
      })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /campaigns/i })).toBeTruthy();
  });
});
