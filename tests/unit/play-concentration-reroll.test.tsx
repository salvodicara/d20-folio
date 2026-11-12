/**
 * The new Play's Concentration save offers the sheet's reroll on a failed roll (parity
 * with the classic banner, #859): a 5 against DC 15 fails, so «Indomitable: reroll +13»
 * appears; picking it takes the save again with the bonus, and applying spends the use.
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

import { PlayConcentrationSave } from "@/domains/play/ui/PlayConcentrationSave";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConcentrationSave doc={doc} /> : null;
}

describe("PlayConcentrationSave reroll", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    const doc = makeCharacterDoc(
      {
        classes: [{ classId: "fighter", level: 13 }],
        features: [{ srdId: "fighter-indomitable" }],
        abilityScores: { STR: 16, DEX: 12, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      },
      { concentration: concentrationValue("bless") }
    );
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.setState({
      readonly: false,
      combatPendingConcentrationSaves: [
        {
          id: "save-1",
          spell: concentrationValue("bless"),
          damage: 30,
          difficultyClass: concentrationSaveDc(30),
        },
      ],
    });
  });

  it("a failed roll offers the reroll; it is not offered before the roll fails", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Roll the die" }));
    expect(screen.queryByRole("button", { name: /reroll/ })).toBeNull();
    fireEvent.change(screen.getAllByRole("textbox")[0] as HTMLElement, {
      target: { value: "5" },
    });
    const offer = screen.getByRole("button", { name: /^Indomitable: reroll \+13$/ });
    fireEvent.click(offer);
    // the new roll is entered with the bonus: a 5 now holds
    fireEvent.change(screen.getAllByRole("textbox")[0] as HTMLElement, {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(0);
    expect(useCharacterStore.getState().character?.session.concentration).toBeTruthy();
  });
});
