/**
 * Great Weapon Fighting in Play's tray: the weapon's dice faces, a 1 or 2 counted as
 * a 3, plus the weapon's bonus, said in words with the sum; the total field shows the
 * result and stays usable on its own when no faces are typed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const penalty = vi.hoisted(() => ({
  value: [] as Array<{ dice: string; sourceId: string }>,
}));
vi.mock("@/lib/play/damage-roll-penalty", () => ({
  sheetDamageRollPenalty: () => penalty.value,
}));
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayTray } from "@/domains/play/ui/PlayTray";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";

const plan = (dieFloor: DamageTrayPlan["dieFloor"]): DamageTrayPlan => ({
  effect: "damage",
  damageType: "slashing",
  targets: ["m1"],
  dieFloor,
});

function open(p: DamageTrayPlan) {
  useCharacterStore.setState({ character: MOCK_CHARACTER });
  useDamageTrayStore.getState().show({
    characterId: MOCK_CHARACTER.id,
    actionName: "Greatsword",
    source: { en: "Greatsword" } as never,
    castLogId: null,
    actionId: "greatsword",
    plan: p,
  });
  render(<PlayTray locale="en" />);
}

describe("Play tray: dice faces under a floor", () => {
  // jsdom has no modal <dialog>: open it in place.
  beforeEach(() => {
    // Like a browser, opening the modal focuses its first control (the close button).
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
      this.querySelector("button")?.focus();
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useDamageTrayStore.getState().close();
  });

  it("floors the faces, adds the bonus and shows the sum", () => {
    open(plan({ floorBelow: 2, floorTo: 3, dice: "2d6", bonus: 3 }));
    expect(screen.getByText("On the damage dice, a 1 or 2 counts as 3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Dice faces (2d6)"), {
      target: { value: "1+5" },
    });
    expect(screen.getByText("3 + 5 + 3 = 11")).toBeTruthy();
    const total = screen.getByLabelText<HTMLInputElement>("Rolled total");
    expect(total.value).toBe("11");
    expect(total.disabled).toBe(true);
  });

  it("without the weapon's dice, the total field says the rule", () => {
    open(plan({ floorBelow: 2, floorTo: 3 }));
    expect(screen.queryByLabelText(/Dice faces/)).toBeNull();
    expect(screen.getByText(/a 1 or 2 counts as 3/)).toBeTruthy();
  });

  it("opens with the faces field focused", () => {
    open(plan({ floorBelow: 2, floorTo: 3, dice: "2d6", bonus: 3 }));
    expect(document.activeElement).toBe(screen.getByLabelText("Dice faces (2d6)"));
  });

  it("names its close by what it does", () => {
    open(plan({ floorBelow: 2, floorTo: 3, dice: "2d6", bonus: 3 }));
    expect(screen.getByRole("button", { name: "Don't apply" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });
});

describe("Play tray: a penalty on my damage", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    useDamageTrayStore.getState().close();
  });

  it("names the dice to subtract and where they come from", () => {
    const doc = {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        customFeatures: [],
      },
    };
    useCharacterStore.setState({ character: doc });
    penalty.value = [{ dice: "1d6", sourceId: "bless" }];
    open({ effect: "damage", damageType: "slashing", targets: ["m1"] });
    expect(screen.getByText("Subtract 1d6 from your damage (Bless).")).toBeTruthy();
    penalty.value = [];
  });
});
