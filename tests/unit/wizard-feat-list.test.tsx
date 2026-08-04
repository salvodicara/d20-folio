/**
 * WizardFeatList — progressive discovery over the full feat corpus.
 *
 * The unfiltered list must stay scan-sized, while search and an explicit
 * disclosure still reach every legal option. A stored deep choice remains
 * visible on remount — bounding may reduce noise, never hide state.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WizardFeatList } from "@/features/wizard/feat-list";
import type { FeatPickVM } from "@/lib/views/feat-pick-view";

function feats(count: number): FeatPickVM[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      id: `feat-${n}`,
      name: `Feat ${n}`,
      searchText: `Feat ${n}${n === count ? " FinalBeacon" : ""}`,
      searchDesc: "",
      category: "general",
      halfFeat: null,
      description: `Description ${n}`,
      summary: `Summary ${n}`,
      entry: {} as FeatPickVM["entry"],
    };
  });
}

function renderList(pool: FeatPickVM[], chosenId: string | null = null) {
  return render(
    <WizardFeatList
      feats={pool}
      chosenId={chosenId}
      onChoose={vi.fn()}
      asksFor={() => null}
      searchPlaceholder="Search feats"
    />
  );
}

describe("WizardFeatList progressive discovery", () => {
  it("bounds the undirected corpus and reveals the remainder on intent", () => {
    const { container } = renderList(feats(20));
    expect(container.querySelectorAll(".wiz-entry")).toHaveLength(16);

    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    expect(container.querySelectorAll(".wiz-entry")).toHaveLength(20);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("searches the full corpus, including entries outside the initial window", () => {
    const { container } = renderList(feats(20));
    fireEvent.change(screen.getByPlaceholderText("Search feats"), {
      target: { value: "FinalBeacon" },
    });

    expect(container.querySelectorAll(".wiz-entry")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Feat 20/i })).toBeInTheDocument();
  });

  it("keeps an existing deep choice visible on remount", () => {
    const { container } = renderList(feats(20), "feat-20");
    expect(container.querySelectorAll(".wiz-entry")).toHaveLength(20);
    expect(screen.getByRole("button", { name: /Feat 20/i })).toBeInTheDocument();
  });
});
