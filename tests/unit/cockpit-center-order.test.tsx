/**
 * Cockpit center IA order: after the Phase-6 IA revision the `.content` column is
 * just the tabs region — the tab strip at the very top, the tab body below — with
 * the turn-economy meter relocated INTO the top of the Play tab and HP relocated
 * into the header. So the tab strip is the top reach of the content and combat is
 * self-contained on the Play surface. Also confirms the #60 edit-frame surface
 * (`.content`) survives the reorder and the old sticky edit banner is gone.
 *
 * Renders the real `CharacterCockpit` with Firebase + the subscription mocked so
 * it stays CI-pure; the store is seeded with the canonical mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));

import { CharacterCockpit } from "@/features/character/CharacterCockpit";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function renderCockpit() {
  return render(
    <MemoryRouter initialEntries={["/characters/mock-1"]}>
      <Routes>
        <Route path="/characters/:characterId" element={<CharacterCockpit />} />
      </Routes>
    </MemoryRouter>
  );
}

/** True iff `a` precedes `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("cockpit center IA order", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
    });
  });

  it("orders the center column: tab strip → tab body (HP is in the header, not the center)", () => {
    const { container } = renderCockpit();
    const content = container.querySelector(".content");
    expect(content).not.toBeNull();

    const tablist = content?.querySelector('[role="tablist"]');
    const tabpanel = content?.querySelector('[role="tabpanel"]');
    expect(tablist).not.toBeNull();
    expect(tabpanel).not.toBeNull();
    expect(tablist && tabpanel && precedes(tablist, tabpanel)).toBe(true);

    // HP lives in the header now — the center has no HP control at rest.
    expect(content?.querySelector(".hp-bar")).toBeNull();
    const header = container.querySelector("header");
    expect(header?.querySelector(".hp-bar")).not.toBeNull();
  });

  it("relocates the turn-economy meter INTO the top of the Play tab", () => {
    const { container } = renderCockpit();
    const tabpanel = container.querySelector('[role="tabpanel"]:not([inert])');
    // The meter is no longer a center sibling — it lives inside the active Play
    // panel, at its top, carrying the solo End Combat.
    expect(tabpanel?.querySelector(".turn")).not.toBeNull();
    expect(
      within(tabpanel as HTMLElement).getByRole("button", { name: /end combat/i })
    ).toBeInTheDocument();
    expect(
      within(tabpanel as HTMLElement).getByRole("button", { name: /end turn/i })
    ).toBeInTheDocument();
  });

  it("the meter reads as one deliberate carved command group — NON-sticky, no double-frame", () => {
    const { container } = renderCockpit();
    const tabpanel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;
    // Non-sticky: the meter scrolls naturally as the top command group — there is
    // NO pinned wrapper (the in-progress turn is owned by the persistent provider,
    // so the meter never needs to pin to the viewport).
    expect(tabpanel.querySelector(".sticky")).toBeNull();

    // The carved `.turn` recipe IS the folio element. Its enclosing command group
    // (attacks row + meter, with the solo End Combat inside the meter) adds NO
    // competing frame around it — no flat backing fill, border, shadow, or pinned
    // offset that would read as a cheap double-frame.
    const endCombat = within(tabpanel).getByRole("button", { name: /end combat/i });
    const group = endCombat.parentElement?.parentElement as HTMLElement;
    expect(group.querySelector(".turn")).not.toBeNull();
    expect(group.className).not.toMatch(
      /\bsticky\b|\bborder\b|\bborder-b\b|shadow-|bg-bg-secondary|bg-bg-surface|top-1[24]|top-28/
    );
  });

  it("co-locates the mobile rail toggles above the center (#10), disclosure aria intact", () => {
    const { container } = renderCockpit();
    const stats = container.querySelector('[aria-label="Character stats"]');
    const resources = container.querySelector('[aria-label="Resources and status"]');
    const content = container.querySelector(".content");
    // Sub-rail `order`: Stats (1) → Resources (2) → center (3) — both toggles are
    // lifted together to the top of the recomposed stack. The three-column grid
    // mounts at the `rail:` breakpoint (--bp-rail 1180px, DESIGN.md §11), NOT
    // `lg:` — 1024–1179 squeezed the center below phone width. `max-rail:`
    // order is inert on the ≥1180 grid, where explicit column placement governs.
    expect(stats?.className).toContain("max-rail:order-1");
    expect(resources?.className).toContain("max-rail:order-2");
    expect(content?.className).toContain("max-rail:order-3");

    // The MobileDisclosure a11y contract still holds (aria-expanded toggles).
    const toggle = within(stats as HTMLElement).getByRole("button", { name: /stats/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("the cockpit grid opts OUT of CSS scroll-anchoring so a card-expand never jumps the rails", () => {
    // STOP THE RAIL JUMP: expanding an action card DOWN the long Play board changes
    // the page's content height; without `overflow-anchor: none` the browser
    // re-anchors window.scrollY to keep its chosen anchor fixed, visibly shifting
    // the whole cockpit (including the normal-flow lateral rails — they scroll with
    // the page, they are NOT sticky). The grid that hosts the center column + both
    // rails carries `[overflow-anchor:none]` to exclude the subtree from anchor
    // selection, so the reanchor (and the jump) can't happen. jsdom can't measure
    // layout, so this pins the FIX MECHANISM on the exact element it lives on.
    const { container } = renderCockpit();
    const content = container.querySelector(".content");
    const stats = container.querySelector('[aria-label="Character stats"]');
    const resources = container.querySelector('[aria-label="Resources and status"]');
    // The single grid wrapping all three regions (its direct children host them).
    const grid = content?.parentElement;
    expect(grid).not.toBeNull();
    expect(grid?.className).toMatch(/\[overflow-anchor:none\]/);
    // It is the shared parent of the center column AND both rails (the subtree the
    // expand reflows + the rails it must not nudge).
    expect(stats?.parentElement).toBe(grid);
    expect(resources?.parentElement).toBe(grid);
  });

  it("the #60 edit frame surface (.content) survives the reorder — the sticky banner is GONE", () => {
    useUIStore.setState({ sheetMode: "edit" });
    const { container } = renderCockpit();
    expect(container.querySelector(".content")).toHaveAttribute("data-mode", "edit");
    // The old sticky "Editing / Done" banner is DELETED with its layout shift.
    // The edit signifier is now the fob family's lit amber ✎ coin (the Signet
    // here, jsdom being a coarse/compact home) + the `.content` frame — neither
    // reflows the page.
    expect(screen.queryByText(/changes save automatically/i)).not.toBeInTheDocument();
    // The Signet's lit ✎ carries the mode (aria "Done editing" + aria-pressed),
    // and it is the always-reachable one-tap exit — no separate floating Done.
    expect(
      screen.getByRole("button", { name: /done editing/i, pressed: true })
    ).toBeInTheDocument();
  });
});
