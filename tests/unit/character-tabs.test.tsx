/**
 * Cockpit tab split (#5): `CharacterTabs` decoupled into a scoped `TabsProvider`
 * (owns `activeTab` + the `?tab=` mirror) + a relocatable `TabStrip` (the
 * `role=tablist`) + `TabBody` (the `role=tabpanel`s). This proves the strip and
 * the body stay in lockstep through the provider, the deep-link round-trips, the
 * roving-tabindex keyboard wiring is intact, and only the active panel mounts —
 * all WITHOUT the cockpit (the §7.2 HUD render-isolation is asserted separately
 * in `cockpit-render-isolation.test.tsx`).
 *
 * The five real tab panels reach the engine/firebase transitively, so they are
 * mocked to trivial markers — this keeps the test CI-pure and focused on the
 * strip/body/provider seam.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

// `tab-defs` statically imports the five tab panels, which reach the engine /
// Firebase transitively — mock Firebase to keep the CI-purity guard happy. The
// panels themselves are mocked below, so neither ever actually loads.
vi.mock("@/lib/firebase", () => ({}));

vi.mock("@/features/character/center/tabs/PlayTab", () => ({
  PlayTab: () => <div>Play panel</div>,
}));
vi.mock("@/features/character/center/tabs/SpellsTab", () => ({
  SpellsTab: () => <div>Spells panel</div>,
}));
vi.mock("@/features/character/center/tabs/InventoryTab", () => ({
  InventoryTab: () => <div>Inventory panel</div>,
}));
vi.mock("@/features/character/center/tabs/FeaturesTab", () => ({
  FeaturesTab: () => <div>Features panel</div>,
}));
vi.mock("@/features/character/center/tabs/BioTab", () => ({
  BioTab: () => <div>Bio panel</div>,
}));

import { TabsProvider } from "@/features/character/center/TabsProvider";
import { TabStrip } from "@/features/character/center/TabStrip";
import { useCharacterStore } from "@/stores/characterStore";
import { TabBody } from "@/features/character/center/TabBody";

/** Surfaces the current `?tab=` so the deep-link mirror can be asserted. */
function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
}

function renderTabs(initialEntry = "/characters/mock-1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TabsProvider>
        <TabStrip />
        <TabBody />
      </TabsProvider>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("cockpit tab split (#5)", () => {
  it("renders the Play panel by default; the strip is an ARIA tablist", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    // The default tab is the combat surface (label "Combat" / "Combattimento"; its
    // internal id stays "play").
    expect(screen.getByRole("tab", { name: /combat/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Only the active panel's content mounts.
    expect(screen.getByText("Play panel")).toBeInTheDocument();
    expect(screen.queryByText("Spells panel")).not.toBeInTheDocument();
  });

  it("each tab's aria-controls resolves to its panel (labelled back)", () => {
    renderTabs();
    const tab = screen.getByRole("tab", { name: /combat/i });
    const panelId = tab.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("clicking a strip tab swaps the body panel", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: /spells/i }));
    expect(screen.getByRole("tab", { name: /spells/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("Spells panel")).toBeInTheDocument();
    expect(screen.queryByText("Play panel")).not.toBeInTheDocument();
  });

  it("mirrors the selected tab to `?tab=` (deep-link round-trip)", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: /inventory/i }));
    expect(screen.getByTestId("search")).toHaveTextContent("tab=inventory");
  });

  it("seeds the active tab from a `?tab=` deep-link at mount", () => {
    renderTabs("/characters/mock-1?tab=features");
    expect(screen.getByRole("tab", { name: /features/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("Features panel")).toBeInTheDocument();
  });

  it("stabilizes the body (#8): grid min-h stack, active fades in, inactive is inert + empty", () => {
    renderTabs();
    const activePanel = screen
      .getByText("Play panel")
      .closest('[role="tabpanel"]') as HTMLElement;
    // The panels share one grid cell with a min-height floor (no collapse/bounce).
    const stack = activePanel.parentElement as HTMLElement;
    expect(stack.className).toContain("grid");
    expect(stack.className).toContain("min-h-");
    // Active panel: visible, with a reduced-motion-safe opacity transition.
    expect(activePanel.className).toContain("opacity-100");
    expect(activePanel.className).toContain("transition-opacity");
    expect(activePanel.className).toContain("motion-safe:duration-150");
    // An inactive panel: faded out, inert (out of focus + the a11y tree), and its
    // content is NOT mounted (only the active panel mounts).
    const spellsTab = screen.getByRole("tab", { name: /spells/i });
    const spellsPanelId = spellsTab.getAttribute("aria-controls");
    const spellsPanel = spellsPanelId ? document.getElementById(spellsPanelId) : null;
    expect(spellsPanel).not.toBeNull();
    expect(spellsPanel?.className).toContain("opacity-0");
    expect(spellsPanel?.hasAttribute("inert")).toBe(true);
    expect(spellsPanel?.textContent).toBe("");
  });

  it("item j — a read-only (DM) sheet keeps the ACTIVE panel explorable, NOT inert", () => {
    // T4/item j: a DM exploring a member's sheet must be able to expand cards,
    // switch tabs, and read tooltips — so the active panel is never inert (only
    // mutating affordances are suppressed, and the store flag is the write
    // backstop). Previously the whole active panel went inert when read-only.
    useCharacterStore.setState({ readonly: true });
    try {
      renderTabs();
      // A read-only DM view defaults to Features (the character's makeup); that
      // active panel must be explorable, never inert.
      const activePanel = screen
        .getByText("Features panel")
        .closest('[role="tabpanel"]') as HTMLElement;
      expect(activePanel.hasAttribute("inert")).toBe(false);
      expect(activePanel.getAttribute("tabindex")).toBe("0");
      // Tab switching still works for the DM.
      fireEvent.click(screen.getByRole("tab", { name: /spells/i }));
      const spellsPanel = screen
        .getByText("Spells panel")
        .closest('[role="tabpanel"]') as HTMLElement;
      expect(spellsPanel.hasAttribute("inert")).toBe(false);
    } finally {
      useCharacterStore.setState({ readonly: false });
    }
  });

  it("paints the overflow fade cue only over edges that still hide tabs", () => {
    renderTabs();
    const strip = screen.getByRole("tablist");
    const shell = strip.parentElement as HTMLElement;
    expect(shell.className).toContain("tabstrip-shell");
    // jsdom has no layout — fabricate an overflowing strip (500px of tabs in a
    // 300px box) and drive the scroll position through the three regimes.
    Object.defineProperty(strip, "scrollWidth", { configurable: true, value: 500 });
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 300 });
    strip.scrollLeft = 0;
    fireEvent.scroll(strip);
    expect(shell).toHaveAttribute("data-fade", "r"); // more tabs to the right
    strip.scrollLeft = 100;
    fireEvent.scroll(strip);
    expect(shell).toHaveAttribute("data-fade", "lr"); // hidden both sides
    strip.scrollLeft = 200;
    fireEvent.scroll(strip);
    expect(shell).toHaveAttribute("data-fade", "l"); // scrolled to the end
  });

  it("roving tabindex: ArrowRight from the active tab selects the next", () => {
    renderTabs();
    const tablist = screen.getByRole("tablist");
    const playTab = within(tablist).getByRole("tab", { name: /combat/i });
    fireEvent.keyDown(playTab, { key: "ArrowRight" });
    expect(within(tablist).getByRole("tab", { name: /spells/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Roving tabindex — only the selected tab is in the tab sequence.
    expect(within(tablist).getByRole("tab", { name: /spells/i })).toHaveAttribute(
      "tabindex",
      "0"
    );
    expect(within(tablist).getByRole("tab", { name: /combat/i })).toHaveAttribute(
      "tabindex",
      "-1"
    );
  });
});
