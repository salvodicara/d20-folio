/**
 * A long spell list to pick from (the level-up's «Scegli 1 incantesimo»; sweep
 * 2026-11-11: an 18,800 px phone page) opens on one level, BG3's spellbook tab for
 * the newest level, with «Tutti» one tap away; each tile sits in its level's row, so
 * it carries no level badge of its own.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { spells } from "@/data/spells";
import { PickGrid } from "@/domains/spells/ui/PickGrid";

const bardish = [1, 2, 3].flatMap((lv) =>
  spells.filter((s) => s.level === lv).slice(0, 10)
);

function mount() {
  return render(
    <PickGrid
      label="Choose 1 spell"
      options={bardish.map((s) => ({ id: s.id, label: s.id }))}
      picked={[]}
      spells
      count={1}
      locale="en"
      onToggle={() => {}}
    />
  );
}

describe("PickGrid, a long spell list", () => {
  it("opens on the newest level, and «All» shows every level", () => {
    const { container } = mount();
    const top = Math.max(...bardish.map((s) => s.level));
    expect(
      screen
        .getByRole("button", { name: `Level ${String(top)}` })
        .getAttribute("aria-pressed")
    ).toBe("true");
    const shown = container.querySelectorAll(".f-slotrow:not(.f-slotrow-picked) .f-slot");
    expect(shown.length).toBe(bardish.filter((s) => s.level === top).length);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(
      container.querySelectorAll(".f-slotrow:not(.f-slotrow-picked) .f-slot").length
    ).toBe(bardish.length);
  });

  it("a tile carries no level badge: its row already says the level", () => {
    const { container } = mount();
    expect(container.querySelectorAll(".f-slot-lv")).toHaveLength(0);
  });
});
