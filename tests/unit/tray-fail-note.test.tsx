/**
 * What a failed save also does (Thunderwave's push) reads on each failed row of both
 * trays, and goes away when the row is marked Saved.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { PlayTray } from "@/domains/play/ui/PlayTray";
import { DamageTray } from "@/features/character/center/DamageTray";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";

const PLAN: DamageTrayPlan = {
  effect: "damage",
  damageType: "thunder",
  save: { ability: "CON", onSave: "half", bySpell: true },
  failNotes: ["Pushed up to 10 ft away"],
  targets: ["m1"],
};

function offer() {
  useCharacterStore.setState({ character: MOCK_CHARACTER });
  useDamageTrayStore.getState().show({
    characterId: MOCK_CHARACTER.id,
    actionName: "Thunderwave",
    source: { en: "Thunderwave" } as never,
    castLogId: null,
    actionId: "spell-thunderwave",
    plan: PLAN,
  });
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useDamageTrayStore.getState().close();
});

describe("a failed save's push on the tray row", () => {
  it("Play's tray", () => {
    offer();
    render(<PlayTray locale="en" />);
    expect(screen.getByTestId("play-tray-fail-note").textContent).toBe(
      "Pushed up to 10 ft away"
    );
    fireEvent.click(screen.getByRole("button", { name: /saved/i }));
    expect(screen.queryByTestId("play-tray-fail-note")).toBeNull();
  });

  it("the classic sheet's tray", () => {
    offer();
    render(
      <MemoryRouter>
        <DamageTray />
      </MemoryRouter>
    );
    expect(screen.getByTestId("damage-tray-fail-note").textContent).toBe(
      "Pushed up to 10 ft away"
    );
    fireEvent.click(screen.getByRole("button", { name: /saved/i }));
    expect(screen.queryByTestId("damage-tray-fail-note")).toBeNull();
  });
});
