/**
 * MemberSheetView — the DM read-only viewer's header (owner 2026-06-12, 2026-07-31).
 *
 * Regression history: the view once stacked TWO rows — a back-button row AND a
 * full-width read-only banner inside the cockpit. Then (2026-07-31) the read-only
 * marker moved OFF this surface entirely and ONTO the sheet header's identity line
 * (the app-wide `.ro-pill`, rendered inside CockpitView's CombatHeader), so a
 * read-only sheet is structurally identical to the editable one. This surface now
 * owns ONLY the back button; the read-only status is the single `.ro-pill` in the
 * header, never a `.toolbar-chip` row and never a banner.
 */

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));
vi.mock("@/features/campaigns/useMemberCharacterSubscription", () => ({
  useMemberCharacterSubscription: () => {},
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));
vi.mock("@/features/campaigns/useCampaignSubscription", () => ({
  useCampaignSubscription: () => {},
}));
vi.mock("@/stores/authStore", () => ({
  // The dev fixture's DM uid — the viewer must pass the canView gate.
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: "mock-uid" } }),
}));

import { MemberSheetView } from "@/features/campaigns/MemberSheetView";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import { MOCK_CHARACTER } from "@/lib/mock";

function renderMemberSheet() {
  return render(
    <MemoryRouter initialEntries={["/campaigns/CAMP-1/sheets/member-mara"]}>
      <Routes>
        <Route
          path="/campaigns/:campaignId/sheets/:memberUid"
          element={<MemberSheetView />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("MemberSheetView — back button only, read-only marker on the sheet header", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCampaignStore.setState({ campaign: makeDevCampaign("CAMP-1"), error: null });
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
      // The read-only viewer loads the doc read-only; the header's `.ro-pill` gates
      // on this flag (production sets it via `loadReadonly`).
      readonly: true,
    });
  });

  it("carries the back button, and the read-only marker rides the sheet header — NOT the back-button row", () => {
    renderMemberSheet();

    const back = screen.getByRole("button", { name: /back to campaign/i });
    // The marker is the app-wide `.ro-pill` inside the sheet header (CombatHeader),
    // announced via role="status" — never the old `.toolbar-chip` row.
    const [pill] = screen
      .getAllByRole("status")
      .filter((el) => /read.only/i.test(el.textContent));
    if (!pill) throw new Error("read-only pill missing");
    expect(pill).toHaveTextContent(/read.only/i);
    expect(pill.classList.contains("ro-pill")).toBe(true);
    expect(pill.classList.contains("toolbar-chip")).toBe(false);
    // It is NOT a sibling of the back button — it lives on the sheet header, so the
    // read-only surface is structurally identical to the editable one.
    expect(pill.parentElement).not.toBe(back.parentElement);
  });

  it("does NOT render the old full-width banner or a `.toolbar-chip` read-only row", () => {
    renderMemberSheet();

    // The superseded banner carried a full sentence as VISIBLE text — it must be
    // gone, and the `.ro-pill` is the ONLY status region announcing the read-only
    // state (never the old `.toolbar-chip` row).
    expect(screen.queryByText(/you're viewing/i)).not.toBeInTheDocument();
    const readonlyStatuses = screen
      .getAllByRole("status")
      .filter((el) => /read.only/i.test(el.textContent));
    expect(readonlyStatuses).toHaveLength(1);
    expect(readonlyStatuses[0]?.classList.contains("ro-pill")).toBe(true);
    expect(document.querySelector(".toolbar-chip")).toBeNull();
  });

  // P10 GLASS CASE — the read-only cockpit marks its root so the folio.css
  // recipe can strip every pure-commit affordance (visual honesty), and the
  // recipe itself must keep hiding the card CTAs + the turn meter's End Turn.
  it("marks the cockpit root data-sheet-readonly and the CSS recipe strips the commit affordances", () => {
    useCharacterStore.setState({ readonly: true });
    renderMemberSheet();
    const main = document.querySelector("main#main");
    expect(main).not.toBeNull();
    expect(main?.hasAttribute("data-sheet-readonly")).toBe(true);

    const css = readFileSync("src/styles/folio.css", "utf8");
    for (const hook of [
      "[data-sheet-readonly] .uc-cta",
      "[data-sheet-readonly] .endturn",
      "[data-sheet-readonly] .co-add",
      "[data-sheet-readonly] .uc-detail-foot .btn",
    ]) {
      expect(css).toContain(hook);
    }
    useCharacterStore.setState({ readonly: false });
  });
});

describe("MemberSheetView — not-found instead of an infinite loader (the #106 fix)", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCampaignStore.setState({ campaign: makeDevCampaign("CAMP-1"), error: null });
  });

  it("shows a clean 'sheet unavailable' state when the character read errors (no stuck spinner)", () => {
    // The member's real character doc could not be read (absent / denied / parse
    // error): loading done, no character, an error set. The old behavior was a
    // FolioLoader forever (it returned the loader on `!character`, swallowing the
    // error); now it surfaces the not-found state.
    useCharacterStore.setState({
      character: null,
      loading: false,
      error: "Member character not found",
    });
    renderMemberSheet();
    expect(screen.getByText("Sheet unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to campaign/i })).toBeInTheDocument();
    // No read-only chip (we never reached the cockpit body).
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
  });
});
