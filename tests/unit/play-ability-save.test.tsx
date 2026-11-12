/**
 * An ability tile's save on the Play header: «Save +6» shows when the classic tile
 * shows it, and a tap opens where it comes from (D&D Beyond's tap-for-breakdown),
 * each part a line: «STR −1», «Bren's Aura +3».
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayAbilitySave } from "@/domains/play/ui/PlayAbilitySave";

const str = {
  id: "STR" as const,
  mod: -1,
  score: 8,
  save: false,
  saveTotal: 2,
  showSave: true,
  saveParts: [
    { kind: "ability" as const, value: "−1", ability: "STR" as const },
    { kind: "loc" as const, value: "+3", label: "Bren's Aura" },
  ],
};

describe("PlayAbilitySave", () => {
  it("shows the save and opens its parts on a tap", () => {
    render(
      <dl>
        <PlayAbilitySave ability={str} />
      </dl>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Saving Throw · Strength \+2/ }));
    const pop = screen.getByRole("dialog");
    expect(pop.textContent).toContain("Bren's Aura");
    expect(pop.textContent).toContain("+3");
  });

  it("a save that is only the modifier shows nothing", () => {
    const { container } = render(
      <dl>
        <PlayAbilitySave ability={{ ...str, saveTotal: -1, showSave: false }} />
      </dl>
    );
    expect(container.querySelector(".f-ab-save")).toBeNull();
  });
});
