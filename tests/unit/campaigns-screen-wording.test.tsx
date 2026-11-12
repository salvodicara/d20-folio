/**
 * The campaign card speaks the campaign page's words (screen review #24): «Master: (EN «DM:»)
 * Ottavio» and «2 characters · level 8», never «DM Ottavio» and «Gruppo 2 · Liv 8».
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

const campaign = {
  id: "c1",
  name: "The Keep",
  createdAt: new Date("2026-05-02T18:00:00Z"),
  updatedAt: new Date("2026-11-11T12:00:00Z"),
  createdBy: "dm",
  dmUid: "dm",
  members: ["dm", "p1", "p2"],
  memberDetails: {
    dm: { displayName: "Ottavio", characterId: null, role: "dm" },
    p1: { displayName: "A", characterId: null, role: "player" },
    p2: { displayName: "B", characterId: null, role: "player" },
  },
  status: "active",
  inviteCode: "c1",
  treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  treasuryLog: [],
  encounter: null,
};
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: () => Promise.resolve([campaign]),
  createCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  joinCampaign: vi.fn(),
}));

import { CampaignsScreen } from "@/domains/campaign/ui/CampaignsScreen";
import { useAuthStore } from "@/stores/authStore";

describe("CampaignsScreen card wording", () => {
  it("says Master and characters, as the campaign page does", async () => {
    useAuthStore.setState({ user: { uid: "p1" } as never });
    render(
      <MemoryRouter>
        <CampaignsScreen />
      </MemoryRouter>
    );
    expect(await screen.findByText(/DM: Ottavio/)).toBeTruthy();
    expect(screen.getByText(/2 characters/)).toBeTruthy();
    expect(screen.queryByText(/^DM Ottavio/)).toBeNull();
  });
});
