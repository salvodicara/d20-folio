/**
 * MemberSheetView — the DM read-only viewer's header row (owner 2026-06-12).
 *
 * Regression: the view used to stack TWO rows — a back-button row AND a
 * full-width "Read-only: you're viewing a party member's sheet" banner inside
 * the cockpit. It must render ONE compact row: the back button inline-left and
 * a slim read-only status chip (the reused `.toolbar-chip` recipe) inline-right,
 * with the full explanation on the chip's tooltip — never a second banner row.
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

describe("MemberSheetView — one compact read-only header row", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCampaignStore.setState({ campaign: makeDevCampaign("CAMP-1"), error: null });
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
    });
  });

  it("renders the back button and the read-only chip in the SAME row (no stacked banner)", () => {
    renderMemberSheet();

    const back = screen.getByRole("button", { name: /back to campaign/i });
    // The slim chip: visible label is the short pill text; the full sentence
    // lives on the tooltip (progressive disclosure), reusing `.toolbar-chip`.
    const chip = screen.getByTitle("Read-only: you're viewing a party member's sheet");
    expect(chip).toHaveTextContent("Read-only");
    expect(chip).toHaveAttribute("role", "status");
    expect(chip.classList.contains("toolbar-chip")).toBe(true);

    // ONE compact row: both affordances share the same flex-row parent.
    expect(chip.parentElement).toBe(back.parentElement);
  });

  it("does NOT render the old full-width banner inside the cockpit", () => {
    renderMemberSheet();

    // The superseded banner carried the full sentence as VISIBLE text — it must
    // be gone (the sentence survives only as the chip's tooltip), and the chip
    // is the ONLY status region announcing the read-only state.
    expect(
      screen.queryByText("Read-only: you're viewing a party member's sheet")
    ).not.toBeInTheDocument();
    const readonlyStatuses = screen
      .getAllByRole("status")
      .filter((el) => /read.only/i.test(el.textContent));
    expect(readonlyStatuses).toHaveLength(1);
    expect(readonlyStatuses[0]?.classList.contains("toolbar-chip")).toBe(true);
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
