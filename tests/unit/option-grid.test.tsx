/**
 * OptionGrid — the shared selectable-option grid behind every choice picker
 * (skills/tools/languages/expertise/skill-or-tool/feat spells). These tests pin
 * the behaviour the six former byte-identical pickers relied on: the counter,
 * the "can't pick past the limit" disable rule, search filtering (incl. the
 * `searchText` fallback for off-locale names), badges, and the aria-pressed
 * selected-state contract.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { OptionGrid, type OptionGridItem } from "@/components/shared/OptionGrid";

const OPTS: OptionGridItem[] = [
  { id: "a", label: "Acrobatics" },
  { id: "b", label: "Arcana" },
  { id: "c", label: "Stealth", badge: "S" },
  { id: "d", label: "Già", searchText: "Già history" },
];

function setup(props: Partial<React.ComponentProps<typeof OptionGrid>> = {}) {
  const onToggle = vi.fn();
  render(
    <OptionGrid
      label="Pick 2 skill(s)"
      count={0}
      total={2}
      options={OPTS}
      selected={[]}
      onToggle={onToggle}
      {...props}
    />
  );
  return { onToggle };
}

describe("OptionGrid", () => {
  it("renders the label, the count / total counter, and every option", () => {
    setup();
    expect(screen.getByText("Pick 2 skill(s)")).toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Acrobatics/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stealth/ })).toBeInTheDocument();
  });

  it("marks the counter complete once count reaches total", () => {
    setup({ count: 2, selected: ["a", "b"] });
    expect(screen.getByText("2 / 2")).toHaveAttribute("data-complete", "true");
  });

  it("toggles via onToggle and reflects selection with aria-pressed", () => {
    const { onToggle } = setup({ count: 1, selected: ["a"] });
    const acrobatics = screen.getByRole("button", { name: /Acrobatics/ });
    expect(acrobatics).toHaveAttribute("aria-pressed", "true");
    const arcana = screen.getByRole("button", { name: /Arcana/ });
    expect(arcana).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(arcana);
    expect(onToggle).toHaveBeenCalledWith("b");
  });

  it("disables unpicked options once the limit is reached, but keeps picked ones togglable", () => {
    setup({ count: 2, selected: ["a", "b"] });
    expect(screen.getByRole("button", { name: /Stealth/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Acrobatics/ })).not.toBeDisabled();
  });

  it("honours per-option disabled + renders the badge", () => {
    setup({ options: [{ id: "x", label: "Owned", disabled: true, badge: "S" }] });
    const owned = screen.getByRole("button", { name: /Owned/ });
    expect(owned).toBeDisabled();
    expect(within(owned).getByText("S")).toBeInTheDocument();
  });

  it("filters by label and by searchText fallback", () => {
    setup();
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "arc" } });
    expect(screen.getByRole("button", { name: /Arcana/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Acrobatics/ })).not.toBeInTheDocument();
    // searchText lets an item match a term not shown in its label.
    fireEvent.change(search, { target: { value: "history" } });
    expect(screen.getByRole("button", { name: /Già/ })).toBeInTheDocument();
  });

  it("shows the empty message when nothing matches", () => {
    setup({ emptyMessage: "Nothing here." });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("hides the search field when searchable is false", () => {
    setup({ searchable: false });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  describe("rich cells (meta / note / chip)", () => {
    const RICH: OptionGridItem[] = [
      {
        id: "elf",
        label: "Elf",
        meta: "30 ft · Medium",
        chip: <span data-testid="elf-chip">DEX</span>,
      },
      {
        id: "agonizing",
        label: "Agonizing Blast",
        meta: "Add your Charisma modifier to Eldritch Blast damage.",
        note: "Requires: Eldritch Blast",
      },
    ];

    it("promotes a cell carrying meta / note / chip to the rich stacked layout", () => {
      const onToggle = vi.fn();
      render(
        <OptionGrid
          count={0}
          total={1}
          options={RICH}
          selected={[]}
          onToggle={onToggle}
        />
      );
      const elf = screen.getByRole("button", { name: /Elf/ });
      expect(elf).toHaveClass("rich");
      expect(within(elf).getByText("30 ft · Medium")).toBeInTheDocument();
      expect(within(elf).getByTestId("elf-chip")).toBeInTheDocument();
      // The caveat line renders for the invocation.
      const blast = screen.getByRole("button", { name: /Agonizing Blast/ });
      expect(within(blast).getByText(/Requires: Eldritch Blast/)).toBeInTheDocument();
    });

    it("keeps a plain item compact (no rich class)", () => {
      setup();
      expect(screen.getByRole("button", { name: /Acrobatics/ })).not.toHaveClass("rich");
    });
  });

  describe("single-select mode", () => {
    it("shows no counter and never disables the unpicked once one is chosen", () => {
      const onToggle = vi.fn();
      render(
        <OptionGrid
          label="Species"
          count={1}
          total={1}
          single
          options={OPTS}
          selected={["a"]}
          onToggle={onToggle}
        />
      );
      // No count/total chip in single-select.
      expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
      // The picked one is pressed; the rest stay enabled so you can switch.
      expect(screen.getByRole("button", { name: /Acrobatics/ })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      const arcana = screen.getByRole("button", { name: /Arcana/ });
      expect(arcana).not.toBeDisabled();
      fireEvent.click(arcana);
      expect(onToggle).toHaveBeenCalledWith("b");
    });

    // Feats use the always-visible meta (clamped, un-clamps on select) — not `detail`
    // — so the single-select path here stays the plain rich cell.
    it("single rich cells stay a plain selectable button (feat path, no Pick button)", () => {
      const FEATS: OptionGridItem[] = [
        { id: "tough", label: "Tough", meta: "Your hit point maximum increases." },
        { id: "alert", label: "Alert", meta: "You gain a bonus to initiative." },
      ];
      function SingleRich() {
        const [sel, setSel] = useState<string[]>([]);
        return (
          <OptionGrid
            single
            count={sel.length}
            total={1}
            options={FEATS}
            selected={sel}
            onToggle={(id) => setSel([id])}
          />
        );
      }
      render(<SingleRich />);
      expect(screen.queryByRole("button", { name: /^Pick$/ })).toBeNull();
      const tough = screen.getByRole("button", { name: /Tough/ });
      expect(tough).toHaveClass("opt-cell");
      // The description rides the meta (always rendered); selecting marks it pressed.
      expect(screen.getByText("Your hit point maximum increases.")).toBeInTheDocument();
      fireEvent.click(tough);
      expect(tough).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("lets the grid grow with content when flush is set", () => {
    const { container } = render(
      <OptionGrid
        count={0}
        total={2}
        flush
        options={OPTS}
        selected={[]}
        onToggle={() => {}}
      />
    );
    expect(container.querySelector(".opt-grid")).toHaveAttribute("data-flush", "");
  });

  it("renders a centered icon-tile grid with a leading icon (tile)", () => {
    const { container } = render(
      <OptionGrid
        tile
        single
        count={0}
        total={1}
        options={[
          {
            id: "fighter",
            label: "Fighter",
            icon: <span data-testid="ico">⚔</span>,
            chip: <span>d10</span>,
          },
        ]}
        selected={[]}
        onToggle={() => {}}
      />
    );
    expect(container.querySelector(".opt-grid")).toHaveAttribute("data-tile", "");
    const cell = screen.getByRole("button", { name: /Fighter/ });
    // The icon promotes the cell to the rich (stacked) layout and renders.
    expect(cell).toHaveClass("rich");
    expect(within(cell).getByTestId("ico")).toBeInTheDocument();
  });

  describe("detail accordion-on-select (#74 / D43–D45)", () => {
    const WITH_DETAIL: OptionGridItem[] = [
      {
        id: "alarm",
        label: "Alarm",
        meta: "Abjuration",
        detail: "Ward an area for 8 hours.",
      },
      {
        id: "bless",
        label: "Bless",
        meta: "Enchantment",
        detail: "Up to three creatures gain a d4.",
      },
      {
        id: "cure",
        label: "Cure Wounds",
        meta: "Abjuration",
        detail: "A creature you touch regains hit points.",
      },
      { id: "plain", label: "Mending" },
    ];

    // Stateful harness: OptionGrid is controlled, so selection-driven reveal needs a
    // parent that owns `selected` and mutates it on toggle (multi-select up to 2).
    function StatefulGrid() {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <OptionGrid
          count={selected.length}
          total={2}
          options={WITH_DETAIL}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
          }
        />
      );
    }

    it("gives a detail cell an expand body, collapsed with no Pick button by default", () => {
      render(<StatefulGrid />);
      expect(
        screen.getByRole("button", { name: /Alarm/, expanded: false })
      ).toBeInTheDocument();
      expect(screen.queryByText("Ward an area for 8 hours.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Pick$/ })).toBeNull();
    });

    it("expands the description on row click without selecting; Pick commits + closes", () => {
      render(<StatefulGrid />);
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false }));
      expect(screen.getByText("Ward an area for 8 hours.")).toBeInTheDocument();
      // Reading does not select; the Pick button is the commit affordance.
      const pickBtn = screen.getByRole("button", { name: /^Pick$/ });
      expect(pickBtn).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(pickBtn);
      // Picking closes the card (accordion closes so you move on).
      expect(screen.queryByText("Ward an area for 8 hours.")).not.toBeInTheDocument();
    });

    it("re-expands a picked option to deselect it (selected cards stay expandable)", () => {
      render(<StatefulGrid />);
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false }));
      fireEvent.click(screen.getByRole("button", { name: /^Pick$/ }));
      // Re-open the now-picked, collapsed Alarm.
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false }));
      const pickedBtn = screen.getByRole("button", { name: /Picked/ });
      expect(pickedBtn).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(pickedBtn); // un-pick
      expect(screen.getByRole("button", { name: /^Pick$/ })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });

    it("keeps one unselected browse card open at a time", () => {
      render(<StatefulGrid />);
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false }));
      expect(screen.getByText("Ward an area for 8 hours.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Bless/, expanded: false }));
      expect(screen.getByText("Up to three creatures gain a d4.")).toBeInTheDocument();
      // The first (unselected) browse card collapsed.
      expect(screen.queryByText("Ward an area for 8 hours.")).not.toBeInTheDocument();
    });

    it("lets a selected card stay open while browsing another (accordion exception)", () => {
      render(<StatefulGrid />);
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false }));
      fireEvent.click(screen.getByRole("button", { name: /^Pick$/ })); // Alarm picked + closed
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false })); // re-open (selected)
      fireEvent.click(screen.getByRole("button", { name: /Bless/, expanded: false })); // browse another
      // The selected card stays open; the browse card is also open.
      expect(screen.getByText("Ward an area for 8 hours.")).toBeInTheDocument();
      expect(screen.getByText("Up to three creatures gain a d4.")).toBeInTheDocument();
    });

    it("auto-replaces the oldest pick when picking past the limit (FIFO)", () => {
      render(<StatefulGrid />); // total = 2
      const pickFlow = (name: RegExp) => {
        fireEvent.click(screen.getByRole("button", { name, expanded: false }));
        fireEvent.click(screen.getByRole("button", { name: /^Pick$/ }));
      };
      pickFlow(/Alarm/);
      pickFlow(/Bless/);
      pickFlow(/Cure Wounds/); // 3rd pick at the limit → drops Alarm (oldest)
      // Re-open Alarm: it is no longer picked (its button reads "Pick", not "Picked").
      fireEvent.click(screen.getByRole("button", { name: /Alarm/, expanded: false }));
      const btn = screen.getByRole("button", { name: /^Pick$/ });
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("leaves a cell without detail as a bare toggle button (no expand/Pick)", () => {
      render(<StatefulGrid />);
      const mending = screen.getByRole("button", { name: /Mending/ });
      expect(mending).toHaveAttribute("aria-pressed", "false");
    });
  });

  // W2 — "More → modal" mode: simple selectable cards; the discreet "More"
  // detail button appears on the SELECTED card only (stamping it on every row
  // overwhelmed the list — owner, 2026-06-10).
  describe("onMore mode (#W2)", () => {
    function MoreGrid({ onMore }: { onMore: (id: string) => void }) {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <OptionGrid
          count={selected.length}
          total={2}
          options={[
            { id: "fireball", label: "Fireball", chip: <span>3</span> },
            { id: "shield", label: "Shield", chip: <span>1</span> },
          ]}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
          }
          onMore={onMore}
        />
      );
    }

    it("shows the More detail button on the SELECTED card only", () => {
      const onMore = vi.fn();
      render(<MoreGrid onMore={onMore} />);
      // Nothing selected → NO detail affordance anywhere (the list stays calm).
      expect(screen.queryByRole("button", { name: /^More$/ })).toBeNull();
      // Selecting a card surfaces its More button — and only its own.
      const fireball = screen.getByRole("button", { name: /Fireball/ });
      fireEvent.click(fireball);
      expect(fireball).toHaveAttribute("aria-pressed", "true");
      const detailButtons = screen.getAllByRole("button", { name: /^More$/ });
      expect(detailButtons).toHaveLength(1);
      const fireballDetail = detailButtons[0];
      if (!fireballDetail) throw new Error("expected a detail button");
      fireEvent.click(fireballDetail);
      expect(onMore).toHaveBeenCalledWith("fireball");
      // Reading does not toggle the selection.
      expect(fireball).toHaveAttribute("aria-pressed", "true");
      // Deselecting hides the affordance again.
      fireEvent.click(fireball);
      expect(screen.queryByRole("button", { name: /^More$/ })).toBeNull();
    });
  });

  it("renders a single-column grid for description-heavy lists (cols=1)", () => {
    const { container } = render(
      <OptionGrid
        count={0}
        total={2}
        cols={1}
        options={OPTS}
        selected={[]}
        onToggle={() => {}}
      />
    );
    expect(container.querySelector(".opt-grid")).toHaveAttribute("data-cols", "1");
  });
});
