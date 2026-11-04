/**
 * Help's dialog: «On whom?» (the enemy) and the rule in one line; «Help» stays off
 * until an enemy is picked, and a lone enemy is picked already.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayHelp } from "@/domains/play/ui/PlayHelp";

describe("PlayHelp", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  it("helps against the picked enemy, and says what it does", () => {
    const onHelp = vi.fn();
    render(
      <PlayHelp
        view={{
          enemies: [
            { id: "m-gob", name: "Goblin" },
            { id: "m-ogre", name: "Ogre" },
          ],
        }}
        onHelp={onHelp}
        onClose={() => undefined}
      />
    );
    expect(
      screen.getByText(
        "The next attack by one of your allies against that enemy, before your next turn, has Advantage."
      )
    ).toBeTruthy();
    const help = screen.getByRole("button", { name: "Help" });
    expect(help.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Ogre" }));
    fireEvent.click(help);
    expect(onHelp).toHaveBeenCalledWith("m-ogre");
  });

  it("a lone enemy is picked already", () => {
    const onHelp = vi.fn();
    render(
      <PlayHelp
        view={{ enemies: [{ id: "m-gob", name: "Goblin" }] }}
        onHelp={onHelp}
        onClose={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(onHelp).toHaveBeenCalledWith("m-gob");
  });
});
