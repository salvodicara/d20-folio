/**
 * «Trova famiglio» on the Play screen (board 2b, D6a; BG3's Find Familiar variant
 * flyout): the creature type, a search, the forms with their numbers, «Evoca».
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayFamiliarPicker } from "@/domains/play/ui/PlayFamiliarPicker";
import { ensureSrdKind } from "@/i18n";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

describe("PlayFamiliarPicker", () => {
  beforeAll(async () => {
    await ensureSrdKind("monster");
  });
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useCharacterStore.getState().setCharacter(makeCharacterDoc({ classId: "wizard" }));
    useCharacterStore.setState({ readonly: false });
  });

  it("summons the picked form as the picked creature type", () => {
    const onClose = vi.fn();
    const onSummoned = vi.fn();
    render(
      <PlayFamiliarPicker
        formIds={new Set()}
        locale="en"
        onClose={onClose}
        onSummoned={onSummoned}
      />
    );
    expect(
      screen.getByRole("button", { name: "Summon" }).getAttribute("aria-disabled")
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Fiend" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cat" } });
    fireEvent.click(screen.getByRole("button", { name: /^Cat/ }));
    fireEvent.click(screen.getByRole("button", { name: "Summon" }));
    expect(useCharacterStore.getState().character?.session.familiar).toEqual({
      monsterId: "cat",
      creatureType: "fiend",
    });
    expect(onSummoned).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("each form says its numbers", () => {
    render(<PlayFamiliarPicker formIds={new Set()} locale="en" onClose={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "owl" } });
    expect(screen.getByRole("button", { name: /^Owl/ }).textContent).toMatch(
      /AC\u00a011/
    );
  });
});
