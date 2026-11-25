/**
 * An ability tile's save on the Play header: «Save +6» shows when the classic tile
 * shows it, and a tap opens the save's pane (D&D Beyond's tap-for-breakdown; the
 * pane's own test covers what it lists).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayAbilitySave } from "@/domains/play/ui/PlayAbilitySave";

const str = {
  id: "STR" as const,
  mod: -1,
  score: 8,
  save: false,
  saveTotal: 2,
  showSave: true,
};

describe("PlayAbilitySave", () => {
  it("shows the save and opens its pane on a tap", () => {
    const onOpen = vi.fn();
    render(
      <dl>
        <PlayAbilitySave ability={str} onOpen={onOpen} />
      </dl>
    );
    fireEvent.click(screen.getByRole("button", { name: /Saving Throw · Strength \+2/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("a save that is only the modifier shows nothing", () => {
    const { container } = render(
      <dl>
        <PlayAbilitySave
          ability={{ ...str, saveTotal: -1, showSave: false }}
          onOpen={vi.fn()}
        />
      </dl>
    );
    expect(container.querySelector(".f-ab-save")).toBeNull();
  });
});
