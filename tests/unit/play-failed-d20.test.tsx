/**
 * T35 — the new Play's Concentration save offers the Reaction spell that turns a failed
 * d20 into a 20 (parity with the classic banner): only once the roll entered fails and
 * while the Reaction is free; using it keeps Concentration and spends the slot and the
 * Reaction, and one undo gives all of it back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayConcentrationSave } from "@/domains/play/ui/PlayConcentrationSave";
import { concentrationValue } from "@/lib/concentration";
import { customInstanceId } from "./__helpers__/custom-items";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const omen = {
  custom: true as const,
  name: "Omen of Twenty",
  level: 8,
  school: "divination",
  castingTime: "reaction",
  range: "self",
  components: { v: true, s: false, m: false },
  duration: "instantaneous",
  concentration: false,
  description: "A failed roll becomes a 20.",
  instanceId: customInstanceId("omen-of-twenty"),
  mechanics: { failedD20Becomes: 20 },
};

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConcentrationSave doc={doc} /> : null;
}

const enter = (value: string) =>
  fireEvent.change(screen.getAllByRole("textbox")[0] as HTMLElement, {
    target: { value },
  });

describe("PlayConcentrationSave: a failed d20 becomes 20", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    const doc = makeCharacterDoc(
      {
        classes: [{ classId: "wizard", level: 17 }],
        spells: [omen as never, { srdId: "bless", prepared: true }],
        spellSlots: [{ level: 8, total: 1 }],
      },
      { hp: { current: 44, temp: 0 }, concentration: concentrationValue("bless") }
    );
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.setState({ readonly: false });
    useCombatStore.setState({ reactionUsed: false });
    act(() => {
      useCharacterStore.getState().applyDamage(30);
    });
  });

  it("offered on a failing roll; using it keeps Concentration, spends slot and Reaction; undo gives both back", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Roll the die" }));
    enter("15");
    expect(screen.queryByRole("button", { name: /the d20 becomes 20/i })).toBeNull();
    enter("2");
    fireEvent.click(
      screen.getByRole("button", { name: /^Omen of Twenty: the d20 becomes 20$/i })
    );
    const after = useCharacterStore.getState();
    expect(after.character?.session.concentration).toBe(concentrationValue("bless"));
    expect(after.character?.session.spellSlots["8"]?.used).toBe(1);
    expect(after.combatPendingConcentrationSaves).toHaveLength(0);
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(
      useCharacterStore.getState().character?.session.spellSlots["8"]?.used ?? 0
    ).toBe(0);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(1);
    expect(useCombatStore.getState().reactionUsed).toBe(false);
  });

  it("not offered once the Reaction is spent", () => {
    useCombatStore.setState({ reactionUsed: true });
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Roll the die" }));
    enter("2");
    expect(screen.queryByRole("button", { name: /the d20 becomes 20/i })).toBeNull();
  });
});
