/**
 * CampaignsListPage + create/join modals (Phase 5 · Part 2b).
 *
 * The list is a one-shot membership-scoped fetch (mocked io); the modals call the
 * io boundary with the right args and drive navigation. Personal is never shown.
 * Mocks `@/lib/firebase` for the pure-modules guard exemption and `useNavigate`
 * to assert routing. Mirrors the 2a campaign tests' mocking approach.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const {
  navigateSpy,
  listMock,
  createMock,
  joinMock,
  deleteMock,
  confirmMock,
  toastMock,
} = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  listMock: vi.fn(),
  createMock: vi.fn(),
  joinMock: vi.fn(),
  deleteMock: vi.fn(),
  confirmMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (
    sel: (s: { user: { uid: string }; profile: { displayName: string } }) => unknown
  ) => sel({ user: { uid: "u1" }, profile: { displayName: "Tav" } }),
}));
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast: toastMock }) },
}));
vi.mock("@/stores/confirmStore", () => ({
  useConfirmStore: { getState: () => ({ confirm: confirmMock }) },
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: listMock,
  createCampaign: createMock,
  joinCampaign: joinMock,
  deleteCampaign: deleteMock,
}));
vi.mock("react-router", async (imp) => {
  const actual = await imp<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

import { CampaignsListPage } from "@/features/campaigns/CampaignsListPage";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import type { CampaignDoc } from "@/types/campaign";

function campaign(over: Partial<CampaignDoc> = {}): CampaignDoc {
  const at = new Date(0);
  return {
    id: "c1",
    name: "Lost Mine",
    createdAt: at,
    updatedAt: at,
    createdBy: "u1",
    dmUid: "u1",
    members: ["u1", "u2"],
    memberDetails: {
      u1: { displayName: "Tav", characterId: null, role: "dm" },
      u2: { displayName: "Mara", characterId: null, role: "player" },
    },
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CampaignsListPage />
    </MemoryRouter>
  );
}

describe("CampaignsListPage", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    listMock.mockReset().mockResolvedValue([]);
    createMock.mockReset().mockResolvedValue("NEWCODE123456");
    joinMock
      .mockReset()
      .mockImplementation((_uid: string, code: string) => Promise.resolve(code));
    deleteMock.mockReset().mockResolvedValue(undefined);
    confirmMock.mockReset().mockResolvedValue(true);
    toastMock.mockReset();
  });

  it("shows the empty state with create + join CTAs when there are none", async () => {
    renderPage();
    expect(await screen.findByText(/no shared campaigns yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create a campaign/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join with a link/i })).toBeInTheDocument();
    // #22 dedup — the header New/Join actions are SUPPRESSED while empty (the
    // empty state owns the CTAs), so they must NOT also appear here.
    expect(
      screen.queryByRole("button", { name: /new campaign/i })
    ).not.toBeInTheDocument();
  });

  it("lists shared campaigns and never shows the Personal campaign", async () => {
    listMock.mockResolvedValue([
      campaign({ id: "c1", name: "Lost Mine" }),
      campaign({ id: PERSONAL_CAMPAIGN_ID, name: "Personal Solo" }),
    ]);
    renderPage();
    expect(await screen.findByText("Lost Mine")).toBeInTheDocument();
    expect(screen.queryByText("Personal Solo")).not.toBeInTheDocument();
  });

  it("opens a campaign hub on card click", async () => {
    listMock.mockResolvedValue([campaign({ id: "c9", name: "Gildenmoor" })]);
    renderPage();
    // The card is the roster `.ch-card` shell: a stretched `.ch-open` button
    // carries the navigation (the name + chips sit beneath it).
    fireEvent.click(await screen.findByRole("button", { name: /open gildenmoor/i }));
    expect(navigateSpy).toHaveBeenCalledWith("/campaigns/c9");
  });

  it("renders the rich summary chips (party · DM · started) on a campaign card", async () => {
    listMock.mockResolvedValue([
      campaign({
        id: "c1",
        name: "Lost Mine",
        members: ["u1", "u2", "u3"],
        memberDetails: {
          u1: { displayName: "Tav", characterId: null, role: "dm" },
          u2: {
            displayName: "Mara",
            characterId: "x",
            role: "player",
            character: {
              name: assertNonEmptyString("Mara"),
              summary: "Rogue 5",
              level: 5,
            },
          },
          u3: {
            displayName: "Bren",
            characterId: "y",
            role: "player",
            character: {
              name: assertNonEmptyString("Bren"),
              summary: "Cleric 7",
              level: 7,
            },
          },
        },
        treasury: { pp: 0, gp: 40, ep: 0, sp: 0, cp: 0 },
      }),
    ]);
    renderPage();
    await screen.findByText("Lost Mine");
    // DM identity + a level range across attached characters + the treasury pot.
    expect(screen.getByText(/DM Tav/i)).toBeInTheDocument();
    expect(screen.getByText("5–7")).toBeInTheDocument();
    expect(screen.getByText("40 gp")).toBeInTheDocument();
  });

  it("B22 — computes the level chip from classes[] (R4 current format, no legacy `level` field)", async () => {
    listMock.mockResolvedValue([
      campaign({
        id: "c1",
        name: "Lost Mine",
        members: ["u1", "u2", "u3"],
        memberDetails: {
          // A member snapshot written under the CURRENT format: `buildMemberSnapshot`
          // no longer stamps the legacy `level`/`class`/`subclass` fields, only
          // `classes[]`. A multiclass member (2 + 1) must sum to a total of 3.
          u1: {
            displayName: "Tav",
            characterId: "x",
            role: "dm",
            character: {
              name: assertNonEmptyString("Tav"),
              classes: [
                { classId: "fighter", level: 2 },
                { classId: "rogue", level: 1 },
              ],
            },
          },
          u2: {
            displayName: "Mara",
            characterId: "y",
            role: "player",
            character: {
              name: assertNonEmptyString("Mara"),
              classes: [{ classId: "wizard", level: 5 }],
            },
          },
        },
        treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      }),
    ]);
    renderPage();
    await screen.findByText("Lost Mine");
    // Tav (fighter 2 + rogue 1 = 3) .. Mara (wizard 5) → range "3–5". The legacy-field
    // read (`m.character?.level`) sees neither member (both omit `level`) and would
    // render NO chip at all.
    expect(screen.getByText("3–5")).toBeInTheDocument();
  });

  it("renders a custom banner image on the card when set (N4)", async () => {
    listMock.mockResolvedValue([
      campaign({
        id: "c1",
        name: "Lost Mine",
        bannerUrl: "https://example/banner.jpeg",
        bannerCrop: { x: 0, y: 10, width: 100, height: 33 },
      }),
    ]);
    const { container } = renderPage();
    await screen.findByText("Lost Mine");
    // The banner band renders the member's uploaded image (via PortraitImg).
    const img = container.querySelector(".cmp-banner img");
    expect(img).toHaveAttribute("src", "https://example/banner.jpeg");
  });

  it("creates a campaign and reveals the invite LINK to share", async () => {
    renderPage();
    await screen.findByText(/no shared campaigns yet/i);
    fireEvent.click(screen.getByRole("button", { name: /create a campaign/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/campaign name/i), {
      target: { value: "Goblins" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^create campaign$/i }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith("u1", {
        name: "Goblins",
        displayName: "Tav",
        photoURL: null,
      })
    );
    // De-dup pass: the success screen surfaces ONE thing — the invite LINK (the code
    // is embedded in it), not a bare code.
    expect(await screen.findByDisplayValue(/\/join\/NEWCODE123456$/)).toBeInTheDocument();
  });

  it("joins by code (uppercased) and navigates to the hub", async () => {
    renderPage();
    await screen.findByText(/no shared campaigns yet/i);
    fireEvent.click(screen.getByRole("button", { name: /join with a link/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/invite link/i), {
      target: { value: "abcdef234567" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^join$/i }));
    await waitFor(() =>
      // args: uid, code, displayName, photoURL (none here).
      expect(joinMock).toHaveBeenCalledWith("u1", "ABCDEF234567", "Tav", null)
    );
    // Deferred until the modal's Back-sentinel back() traversal lands (the
    // race-free close-then-navigate hand-off).
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/campaigns/ABCDEF234567")
    );
  });

  it("joins from a pasted invite LINK by extracting the code", async () => {
    renderPage();
    await screen.findByText(/no shared campaigns yet/i);
    fireEvent.click(screen.getByRole("button", { name: /join with a link/i }));
    const dialog = await screen.findByRole("dialog");
    // The user pastes the whole link their DM shared; the app extracts the code.
    fireEvent.change(within(dialog).getByLabelText(/invite link/i), {
      target: { value: "https://d20-folio.web.app/join/JOINME12" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^join$/i }));
    await waitFor(() =>
      expect(joinMock).toHaveBeenCalledWith("u1", "JOINME12", "Tav", null)
    );
    // Deferred until the modal's Back-sentinel back() traversal lands (the
    // race-free close-then-navigate hand-off).
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/campaigns/JOINME12"));
  });

  // ─── OWN-6: the shared 3-dots overflow menu on the campaign card ─────────────
  it("copies the invite LINK from the card overflow menu", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    listMock.mockResolvedValue([
      campaign({ id: "c1", name: "Lost Mine", inviteCode: "JOINME12" }),
    ]);
    renderPage();
    await screen.findByText("Lost Mine");
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /copy invite link/i }));
    // De-dup pass: the quick-share copies the LINK (code embedded), toast linkCopied.
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/join\/JOINME12$/));
  });

  it("lets the DM delete a campaign (confirm → io → refetch)", async () => {
    listMock
      .mockResolvedValueOnce([campaign({ id: "c1", name: "Lost Mine" })])
      .mockResolvedValueOnce([]);
    renderPage();
    await screen.findByText("Lost Mine");
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /delete campaign/i }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("c1"));
    // The deleted card drops once the refetch (now empty) resolves.
    await waitFor(() => expect(screen.queryByText("Lost Mine")).not.toBeInTheDocument());
  });

  it("hides Delete for a member who is neither DM nor admin", async () => {
    // Signed-in user is u1; make someone else the DM so the delete gate closes.
    listMock.mockResolvedValue([campaign({ id: "c1", name: "Lost Mine", dmUid: "u2" })]);
    renderPage();
    await screen.findByText("Lost Mine");
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    // Copy is always available; Delete is gated away.
    expect(
      await screen.findByRole("menuitem", { name: /copy invite link/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /delete campaign/i })
    ).not.toBeInTheDocument();
  });
});
