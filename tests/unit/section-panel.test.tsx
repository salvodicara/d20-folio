/**
 * SectionPanel — the campaign hub's MANAGE-band chrome (replaces CollapsibleSection).
 *
 * The contract this pins: the FIXED panel (`children`) is ALWAYS rendered; the DETAIL
 * is the only collapsible part, revealed by a compact CHEVRON button (the disclosure is
 * on the CARD, never the header — B5/D4) with NO visible label (the worded
 * showLabel/hideLabel ride as its aria-label) carrying aria-expanded / aria-controls +
 * the CSS `grid-template-rows` reveal (`.section-detail-wrap`); the open/closed choice
 * is sticky per campaign×section in localStorage (defaults CLOSED so the panel stays
 * short); and with NO `detail` there is no disclosure at all (a static header).
 *
 * The PLACEMENT contract (owner): a collapsible section is ONE `.info-card`/`.section-card`
 * that ENCLOSES the fixed panel + the disclosure + the expandable detail — the chevron
 * sits ON the card, never floats in the gap below it; a NON-collapsible section renders
 * its children directly (no section card), so it keeps whatever surface they bring.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";

const LABELS = { showLabel: "Show ledger (3)", hideLabel: "Hide ledger" };

beforeEach(() => {
  // The sticky key namespaces by the active campaign id; seed one.
  useCampaignStore.setState({ campaign: { id: "c1" } as never });
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("SectionPanel", () => {
  it("always renders the FIXED panel; the DETAIL hides behind a compact CHEVRON button", () => {
    const { container } = render(
      <SectionPanel sectionId="x" title="Treasury" detail={<p>the ledger</p>} {...LABELS}>
        <p>always-on coins</p>
      </SectionPanel>
    );
    // The fixed body renders regardless of fold state (bug C: never hidden).
    expect(screen.getByText("always-on coins")).toBeInTheDocument();
    // The header is a STATIC rubric — never a control (no header toggle).
    expect(screen.queryByRole("button", { name: "Treasury" })).not.toBeInTheDocument();
    // The detail is the disclosure target — collapsed by default (data-open absent).
    const wrap = container.querySelector(".section-detail-wrap");
    expect(wrap).not.toBeNull();
    expect(wrap?.hasAttribute("data-open")).toBe(false);
    // The chevron carries NO visible label (the header meta badge owns the count); the
    // worded CLOSED intent rides as the aria-label, alongside aria-expanded/aria-controls.
    const toggle = screen.getByRole("button", { name: LABELS.showLabel });
    expect(toggle).toHaveClass("section-disclosure");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "x-detail");
    // No visible text — only the chevron knob (the worded label is aria-only).
    expect(toggle.textContent).toBe("");
    expect(toggle.querySelector(".section-disclosure-knob")).not.toBeNull();
    // PLACEMENT — ONE card encloses the fixed panel + the disclosure + the detail (the
    // chevron sits ON the card, never floats below it). The fixed body, the chevron, and
    // the detail-wrap all share the same `.section-card` ancestor.
    const card = container.querySelector(".section-card");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("info-card");
    expect(screen.getByText("always-on coins").closest(".section-card")).toBe(card);
    expect(toggle.closest(".section-card")).toBe(card);
    expect(wrap?.closest(".section-card")).toBe(card);
  });

  it("toggles the detail open (worded HIDE label) + persists the sticky choice", () => {
    const { container } = render(
      <SectionPanel sectionId="x" title="Treasury" detail={<p>the ledger</p>} {...LABELS}>
        <p>coins</p>
      </SectionPanel>
    );
    fireEvent.click(screen.getByRole("button", { name: LABELS.showLabel }));
    const toggle = screen.getByRole("button", { name: LABELS.hideLabel });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelector(".section-detail-wrap")?.hasAttribute("data-open")
    ).toBe(true);
    // Sticky per campaign×section, so it reopens at this state next visit.
    expect(localStorage.getItem("d20.campaignSection.c1.x")).toBe("1");
  });

  it("restores the sticky OPEN choice on mount (shows the HIDE label)", () => {
    localStorage.setItem("d20.campaignSection.c1.x", "1");
    render(
      <SectionPanel sectionId="x" title="Treasury" detail={<p>the ledger</p>} {...LABELS}>
        <p>coins</p>
      </SectionPanel>
    );
    expect(screen.getByRole("button", { name: LABELS.hideLabel })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("offers NO disclosure when there is no detail (an honest static header)", () => {
    const { container } = render(
      <SectionPanel sectionId="x" title="Treasury">
        <p>just the fixed panel</p>
      </SectionPanel>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("just the fixed panel")).toBeInTheDocument();
    // A non-collapsible section renders its children directly — no section card is
    // imposed, so it keeps whatever surface the children bring (book-spread, card grid).
    expect(container.querySelector(".section-card")).toBeNull();
  });

  it("keeps the `.section-card` frame with NO detail when `framed` (bare-content sections)", () => {
    // Sessions/Shared-notes children are BARE rows/lines: without the frame a 0/1-item
    // section floated card-less on the backdrop while its populated sibling wore the
    // card (the Treasury empty-ledger bug class). `framed` keeps the surface, chevron-free.
    const { container } = render(
      <SectionPanel sectionId="x" title="Sessions" framed>
        <p>the only session</p>
      </SectionPanel>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const card = container.querySelector(".section-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("the only session");
  });
});
