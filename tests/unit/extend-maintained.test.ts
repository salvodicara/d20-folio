/**
 * Extending a maintained state with the Bonus Action from the End Turn prompt (2024
 * Rage: «If your Rage is still active on your next turn, you can extend it for another
 * round by … taking a Bonus Action to extend your Rage»). The prompt's «Prolunga»
 * commits the dedicated extend action through the economy, so it is offered only while
 * this turn's Bonus Action is free.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { bonusExtendAction, canExtendWithBonus } from "@/domains/play/turn-model";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

const RAGE = "barbarian-rage";
const raging = () =>
  makeCharacterDoc(
    {
      classes: [{ classId: "barbarian", level: 1 }],
      features: [{ srdId: "barbarian-rage" }],
    },
    { activeFeatures: [RAGE] }
  );

beforeEach(() => {
  useCharacterStore.getState().setCharacter(raging());
  useCombatStore.getState().resetTurn();
});

describe("extending Rage with the Bonus Action", () => {
  it("the dedicated action is a Bonus Action that keeps Rage going", () => {
    const action = bonusExtendAction(RAGE, "en");
    expect(action).toMatchObject({ type: "bonus", maintainsActiveKey: RAGE });
  });

  it("offered while the Bonus Action is free", () => {
    expect(canExtendWithBonus(RAGE, "en")).toEqual({ ok: true });
  });

  it("not once the Bonus Action is spent", () => {
    useCombatStore.setState({
      selected: {
        action: [],
        bonus: [{ id: "x", name: "x", slot: "bonus" } as never],
        free: [],
      },
    });
    expect(canExtendWithBonus(RAGE, "en")).toEqual({ ok: false, reason: "bonus-spent" });
  });

  it("a state with no extend action (not a Barbarian): nothing to offer", () => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    expect(bonusExtendAction(RAGE, "en")).toBeNull();
    expect(canExtendWithBonus(RAGE, "en")).toEqual({ ok: false, reason: "no-action" });
  });
});
