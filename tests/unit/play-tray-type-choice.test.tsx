/**
 * The new Play's tray, for a damage of one type the player picks (Chromatic Orb, a
 * Monk's Empowered Strikes): one total field and the type chips; the picked type meets
 * the target's defense. Two total fields once doubled the damage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayTray } from "@/domains/play/ui/PlayTray";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { NO_DEFENSES } from "@/lib/damage-intake";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-me";
const plan: DamageTrayPlan = {
  effect: "damage",
  damageType: "acid",
  damageTypeChoices: ["acid", "cold", "fire"],
  targets: ["monster-1"],
};

function open(): void {
  const doc = makeCharacterDoc({ classes: [{ classId: "wizard", level: 3 }] });
  useCharacterStore.setState({ character: doc, readonly: false });
  const rows = [
    { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
    {
      id: "monster-1",
      kind: "monster",
      side: "enemy",
      name: "Goblin",
      currentHp: 7,
      maxHp: 7,
      tempHp: 0,
      defenses: { ...NO_DEFENSES, resistances: new Set(["fire"]) },
    },
  ] as unknown as GlobalCombat["view"]["rows"];
  useCombatStatusStore.setState({
    status: {
      campaignId: "camp-1",
      encounter: {
        nextMonsterOrdinal: 2,
        round: 1,
        currentCombatantId: ME,
        epoch: 1,
        status: "active",
        combatants: [],
      },
      view: { rows, turnOrderIds: rows.map((row) => row.id), currentId: ME },
      myId: ME,
      characterId: doc.id,
      gathering: false,
      isMyTurn: true,
      initiativeBonus: 0,
      initiativeRoll: 10,
      round: 1,
    } as unknown as GlobalCombat,
  });
  useDamageTrayStore.getState().show({
    characterId: doc.id,
    actionName: "Chromatic Orb",
    source: { en: "Chromatic Orb" } as never,
    castLogId: null,
    actionId: "spell-chromatic-orb",
    plan,
  });
  render(<PlayTray locale="en" />);
}

describe("Play tray: a damage type the player picks", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useDamageTrayStore.getState().close();
  });

  it("one total; picking Fire meets the goblin's resistance", () => {
    open();
    expect(screen.getAllByLabelText("Rolled total")).toHaveLength(1);
    const types = screen.getByRole("group", { name: "Damage type" });
    expect(within(types).getByRole("button", { name: "Acid" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.change(screen.getByLabelText("Rolled total"), { target: { value: "10" } });
    expect(screen.getByText("−10")).toBeTruthy();
    fireEvent.click(within(types).getByRole("button", { name: "Fire" }));
    expect(within(types).getByRole("button", { name: "Fire" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("−5")).toBeTruthy();
  });
});
