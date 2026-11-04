/**
 * Help's dialog: «On whom?» (the enemy) and «For whom?» (the ally); «Help» stays off
 * until both are picked, and a lone choice is picked already.
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

  it("helps the picked ally against the picked enemy", () => {
    const onHelp = vi.fn();
    render(
      <PlayHelp
        view={{
          enemies: [
            { id: "m-gob", name: "Goblin" },
            { id: "m-ogre", name: "Ogre" },
          ],
          allies: [
            { id: "pc-bren", name: "Bren" },
            { id: "m-wolf", name: "Wolf" },
          ],
        }}
        onHelp={onHelp}
        onClose={() => undefined}
      />
    );
    const help = screen.getByRole("button", { name: "Help" });
    expect(help.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Ogre" }));
    fireEvent.click(screen.getByRole("button", { name: "Wolf" }));
    fireEvent.click(help);
    expect(onHelp).toHaveBeenCalledWith("m-ogre", "m-wolf");
  });

  it("a lone enemy and a lone ally are picked already", () => {
    const onHelp = vi.fn();
    render(
      <PlayHelp
        view={{
          enemies: [{ id: "m-gob", name: "Goblin" }],
          allies: [{ id: "pc-bren", name: "Bren" }],
        }}
        onHelp={onHelp}
        onClose={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(onHelp).toHaveBeenCalledWith("m-gob", "pc-bren");
  });
});
