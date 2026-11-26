/**
 * A one-pick list (a subclass, a fighting style) shows the pick once: ticked in its
 * list, as BG3's subclass list and D&D Beyond's builder mark the chosen row. The
 * «learned» row of picks and empty slots (BG3's spellbook) is for several picks.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));

import { PickGrid } from "@/domains/spells/ui/PickGrid";

const options = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

const mount = (picked: string[], count: number) =>
  render(
    <PickGrid
      label="Choose"
      options={options}
      picked={picked}
      count={count}
      locale="en"
      onToggle={() => {}}
    />
  );

describe("PickGrid picks", () => {
  it("one pick shows once, ticked in the list", () => {
    mount(["a"], 1);
    const alpha = screen.getAllByRole("button", { name: "Alpha" });
    expect(alpha).toHaveLength(1);
    expect(alpha[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("several picks keep the row of picks and empty slots", () => {
    const { container } = mount(["a"], 2);
    expect(container.querySelector(".f-slotrow-picked")).not.toBeNull();
    expect(container.querySelectorAll(".f-slotrow-picked [data-empty]")).toHaveLength(1);
  });
});
