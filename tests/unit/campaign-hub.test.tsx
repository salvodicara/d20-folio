/**
 * CampaignHubPage — the scoped listener + Personal redirect (Phase 5 · Part 2b).
 *
 * Component-level proof of the Phase-5 gate's core failure mode: the hub opens
 * exactly ONE listener on mount and DETACHES it on unmount, flushing the pending
 * debounced write FIRST. Also: a snapshot renders the campaign, a null snapshot is
 * "not found", and the Personal sentinel is redirected away (never surfaced).
 * Mirrors the 2a subscription tests' vi.mock / vi.hoisted approach.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import type { CampaignDoc } from "@/types/campaign";

const { order, onDataRef, unsubSpy, flushSpy, saveSpy, subscribeMock } = vi.hoisted(
  () => {
    const order: string[] = [];
    const onDataRef: { fn: ((d: CampaignDoc | null) => void) | null } = { fn: null };
    const unsubSpy = vi.fn(() => {
      order.push("unsub");
    });
    const flushSpy = vi.fn(() => {
      order.push("flush");
      return Promise.resolve();
    });
    const saveSpy = vi.fn();
    const subscribeMock = vi.fn(
      (_uid: string, _id: string, onData: (d: CampaignDoc | null) => void) => {
        onDataRef.fn = onData;
        return unsubSpy;
      }
    );
    return { order, onDataRef, unsubSpy, flushSpy, saveSpy, subscribeMock };
  }
);

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
// The Party's attach picker reads the current user's roster via useCharacters
// (a Firestore subscription) — mock it so this CI-pure test never touches firebase.
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({ characters: [], loading: false, error: null }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: "u1" } }),
}));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  // Keep the module's real exports; stub only the Firestore-touching
  // listeners/saves the hub actually invokes on mount below.
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-io")>()),
  subscribeToCampaign: subscribeMock,
  createCampaignSave: () => ({ save: saveSpy, flush: flushSpy }),
  // The hub also opens the chronicle listener (its compose-once gate waits for
  // the chronicle's FIRST snapshot alongside the campaign's) and renders Sessions;
  // stub their io so no real Firestore is touched. The chronicle stub delivers an
  // empty first snapshot synchronously, so tests that only exercise the campaign
  // side aren't held at the loading gate.
  subscribeToChronicle: vi.fn((_uid: string, _id: string, onData: (d: null) => void) => {
    onData(null);
    return () => {};
  }),
  listSessions: vi.fn(() => Promise.resolve([])),
  createSession: vi.fn(() => Promise.resolve("s-id")),
}));

import { CampaignHubPage } from "@/features/campaigns/CampaignHubPage";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { subscribeToChronicle } from "@/features/campaigns/campaign-io";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";

function makeCampaign(over: Partial<CampaignDoc> = {}): CampaignDoc {
  const at = new Date(0);
  return {
    id: "c1",
    name: "Gildenmoor",
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

/** Reads the live search string alongside `CampaignHubPage` (same router context) so
 *  a test can assert the `scrollTo` param is stripped after the seam consumes it. */
function SearchProbe() {
  const [searchParams] = useSearchParams();
  return <div data-testid="search-probe">{searchParams.toString()}</div>;
}

function renderHubAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/campaigns" element={<div>campaigns-list-marker</div>} />
        <Route
          path="/campaigns/:campaignId"
          element={
            <>
              <CampaignHubPage />
              <SearchProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("CampaignHubPage", () => {
  beforeEach(() => {
    order.length = 0;
    onDataRef.fn = null;
    subscribeMock.mockClear();
    unsubSpy.mockClear();
    flushSpy.mockClear();
    saveSpy.mockClear();
    useCampaignStore.setState({ campaign: null, loading: false, error: null });
    useChronicleStore.setState({ chronicle: null, loading: false, error: null });
  });

  it("opens exactly one scoped listener for the route campaign", () => {
    renderHubAt("/campaigns/c1");
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(
      "u1",
      "c1",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("renders the campaign + sections once a snapshot arrives", () => {
    const { container } = renderHubAt("/campaigns/c1");
    act(() => onDataRef.fn?.(makeCampaign({ id: "c1", name: "Gildenmoor" })));
    expect(
      screen.getByRole("heading", { name: "Gildenmoor", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /party/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /treasury/i })).toBeInTheDocument();
    // The hub masthead is art-backed (the campaign's own art is the backdrop), so it
    // is the ONE framed masthead that omits the frontispiece crest (DESIGN.md §13).
    expect(container.querySelector(".page-head-crest")).toBeNull();
    expect(container.querySelector(".page-head.has-crest")).toBeNull();
  });

  it("detaches the listener on unmount, flushing the pending write FIRST", () => {
    const { unmount } = renderHubAt("/campaigns/c1");
    act(() => onDataRef.fn?.(makeCampaign({ id: "c1" })));
    unmount();
    expect(flushSpy).toHaveBeenCalled();
    expect(unsubSpy).toHaveBeenCalled();
    expect(order).toEqual(["flush", "unsub"]);
  });

  it("shows not-found when the campaign does not exist", () => {
    renderHubAt("/campaigns/c1");
    act(() => onDataRef.fn?.(null));
    expect(screen.getByText(/campaign not found/i)).toBeInTheDocument();
  });

  it("composes ONCE: holds the loader until the chronicle's first snapshot lands too (nav-feel — the book-spread must never grow after paint)", () => {
    // Withhold the chronicle's first snapshot for this render only.
    let deliverChronicle: (() => void) | undefined;
    vi.mocked(subscribeToChronicle).mockImplementationOnce((_uid, _id, onData) => {
      deliverChronicle = () => onData(null);
      return () => {};
    });
    const { container } = renderHubAt("/campaigns/c1");
    act(() => onDataRef.fn?.(makeCampaign({ id: "c1", name: "Gildenmoor" })));
    // Campaign landed, chronicle still in flight → the hub must NOT paint yet.
    expect(container.querySelector(".folio-loader")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Gildenmoor" })).toBeNull();
    act(() => deliverChronicle?.());
    expect(container.querySelector(".folio-loader")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Gildenmoor", level: 1 })
    ).toBeInTheDocument();
  });

  it("redirects the Personal sentinel away from the hub (never surfaced)", () => {
    renderHubAt(`/campaigns/${PERSONAL_CAMPAIGN_ID}`);
    expect(screen.getByText("campaigns-list-marker")).toBeInTheDocument();
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  // The backdrop seam (daylight-sibling rebuild): the DEFAULT plate rides the
  // per-theme `--asset-campaign-backdrop` token (so each theme paints + downloads
  // its own sibling), and ONLY a custom banner raises `data-app-bg-custom` on
  // <html> — the hook the light theme's custom-art veil keys on. Everything is
  // restored on unmount (the app default backdrop returns).
  it("feeds the per-theme default plate to --app-bg-art and flags ONLY custom art with data-app-bg-custom", () => {
    const html = document.documentElement;
    const { unmount } = renderHubAt("/campaigns/c1");
    // Default (no bannerUrl): the token reference, no custom flag.
    act(() => onDataRef.fn?.(makeCampaign({ id: "c1" })));
    expect(html.style.getPropertyValue("--app-bg-art")).toBe(
      "var(--asset-campaign-backdrop)"
    );
    expect(html.hasAttribute("data-app-bg-custom")).toBe(false);
    // Custom banner: the DM's own url + the veil flag.
    act(() =>
      onDataRef.fn?.(makeCampaign({ id: "c1", bannerUrl: "https://art.example/b.png" }))
    );
    expect(html.style.getPropertyValue("--app-bg-art")).toBe(
      'url("https://art.example/b.png")'
    );
    expect(html.hasAttribute("data-app-bg-custom")).toBe(true);
    // Unmount restores the app default backdrop.
    unmount();
    expect(html.style.getPropertyValue("--app-bg-art")).toBe("");
    expect(html.hasAttribute("data-app-bg-custom")).toBe(false);
  });
});
