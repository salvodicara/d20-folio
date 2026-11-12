/**
 * «Danni e cure» opens in the mode of the button that opened it (D&D Beyond's two
 * buttons under the Hit Points): from «Cura» the healing action is the filled one and
 * the header is green; from «Danni» or the Hit Points, damage leads in red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

  it("from «Heal», healing is the filled action and the header is green", () => {
    const dialog = open("heal");
    expect(dialog.getAttribute("data-c")).toBe("cmp");
    expect(kind("Heal")).toBe("primary");
    expect(kind("Damage")).toBe("ghost");
  });

  it("from «Damage» (the default), damage leads in red", () => {
    const dialog = open();
    expect(dialog.getAttribute("data-c")).toBe("ini");
    expect(kind("Damage")).toBe("danger");
    expect(kind("Heal")).toBe("ghost");
  });
});
