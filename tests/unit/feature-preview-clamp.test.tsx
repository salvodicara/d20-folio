/**
 * FeaturePreviewCard clamp — the level-up "what you gain" feature cards must offer
 * "Show more" ONLY when the 2-line clamp actually hides prose. Owner (2026-07-11):
 * a card whose description already fit (e.g. "Concentrazione Fanatica") still showed
 * "Mostra tutto" whose expansion revealed nothing — pure friction.
 *
 * jsdom has no layout, so the overflow verdict is driven by mocking the
 * `scrollHeight` / `clientHeight` getters (the same pattern as note-clamp.test).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LevelUpFeatureCards } from "@/components/sheet/level-up/LevelUpFeatureCards";

function mockGeometry(scrollHeight: number, clientHeight: number): void {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight);
}

const labels = {
  newFeatures: "New Features",
  spellSlots: "Spell Slots",
  scalingFeatures: "Scaling",
  profBonus: "Proficiency",
  showMore: "Show more",
  showLess: "Show less",
};

function renderCard(description: string) {
  return render(
    <LevelUpFeatureCards
      changes={[]}
      locale="en"
      hideAsi={false}
      labels={labels}
      renderChangeLine={() => ""}
      extraCards={[{ id: "feat-1", name: "Fanatic Focus", description }]}
    />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FeaturePreviewCard — toggle only when the clamp actually overflows", () => {
  it("SHORT description that fits the 2-line clamp → NO Show more toggle", () => {
    mockGeometry(40, 40); // content fits — no hidden lines
    renderCard("A brief feature that fits in two lines.");
    expect(screen.getByText(/A brief feature/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("LONG description that overflows → Show more toggle expands and collapses", () => {
    mockGeometry(120, 40); // content far past the 2-line box (hidden 80px)
    renderCard("A very long feature description ".repeat(20));

    const more = screen.getByRole("button", { name: /show more/i });
    expect(more).toBeInTheDocument();

    // Expand → the label flips to "Show less".
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();

    // Collapse back → "Show more" returns (still overflowing).
    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
  });
});
