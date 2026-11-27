/**
 * The DM plays a character too (the classic «Collega un personaggio (facoltativo)»): on
 * the new Gruppo tab the DM picks one of their own characters, or lets it go; nothing
 * changes mid-fight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { DmpcControl } from "@/domains/campaign/ui/DmpcControl";

const roster = [
  { id: "c1", character: { name: "Vesper" } },
  { id: "c2", character: { name: "Orrin" } },
] as never;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe("the DM's own character", () => {
  it("the DM picks one of their characters", () => {
    const onAttach = vi.fn();
    render(
      <DmpcControl
        characterId={null}
        roster={roster}
        inCombat={false}
        onAttach={onAttach}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Attach a character (optional)" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Orrin" }));
    expect(onAttach).toHaveBeenCalledWith("c2");
  });

  it("an attached one can be let go", () => {
    const onAttach = vi.fn();
    render(
      <DmpcControl
        characterId="c1"
        name="Vesper"
        roster={roster}
        inCombat={false}
        onAttach={onAttach}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Detach Vesper" }));
    expect(onAttach).toHaveBeenCalledWith("");
  });

  it("nothing changes mid-fight", () => {
    render(
      <DmpcControl characterId={null} roster={roster} inCombat onAttach={() => {}} />
    );
    expect(
      screen.queryByRole("button", { name: "Attach a character (optional)" })
    ).toBeNull();
  });
});
