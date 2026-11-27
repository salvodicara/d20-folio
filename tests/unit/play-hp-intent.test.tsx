/**
 * «Danni e cure» opens in the mode of the button that opened it (D&D Beyond's two
 * buttons under the Hit Points): from «Cura» the header is green, from «Danni» or the
 * Hit Points it is red. The two actions stay one equal pair either way (red «Danni»,
 * green «Cura», neither lit: design reset «BG3 craft»).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayHp } from "@/domains/play/ui/PlayHp";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function open(intent?: "damage" | "heal") {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  render(
    <PlayHp doc={doc} locale="en" onClose={() => {}} {...(intent ? { intent } : {})} />
  );
  return screen.getByRole("dialog");
}

const kind = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("data-kind");

describe("PlayHp intent", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useCharacterStore.setState({ readonly: false });
  });

  it("from «Heal», the header is green and the pair stays equal", () => {
    const dialog = open("heal");
    expect(dialog.getAttribute("data-c")).toBe("cmp");
    expect(kind("Damage")).toBe("danger");
    expect(kind("Heal")).toBe("heal");
  });

  it("from «Damage» (the default), the header is red and the pair stays equal", () => {
    const dialog = open();
    expect(dialog.getAttribute("data-c")).toBe("ini");
    expect(kind("Damage")).toBe("danger");
    expect(kind("Heal")).toBe("heal");
  });

  it("the max HP row shows the sheet's max and opens its pane (DDB's HP manager)", () => {
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    const onOpenMax = vi.fn();
    render(<PlayHp doc={doc} locale="en" onClose={() => {}} onOpenMax={onOpenMax} />);
    const row = screen.getByRole("button", { name: /Maximum hit points/ });
    expect(row.textContent).toContain(String(doc.character.hp.max));
    fireEvent.click(row);
    expect(onOpenMax).toHaveBeenCalledOnce();
  });
});
