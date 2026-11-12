/**
 * One rule for every row that costs the Action (the direction lane's walk, H2): in a
 * fight, once the Attack takes the Action an Action spell reads «Used» on the new Play,
 * and a cast takes the Action too, so the weapon does. A Bonus Action spell stays.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "@/i18n";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { buildScenario } from "@/lib/dev-scenarios";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};

function mount() {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayCentre doc={live()} locale="en" />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUndoStore.getState().clear(null);
  useCombatStore.getState().endCombat();
  const doc = buildScenario({
    name: "Lyra",
    raceId: "human",
    classId: "bard",
    level: 3,
    background: "entertainer",
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 16 },
    weapons: [{ srdId: "rapier", quantity: 1 }],
    spells: [
      { srdId: "vicious-mockery", prepared: true },
      { srdId: "healing-word", prepared: true },
    ],
  });
  doc.id = "lyra";
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  useCharacterStore.setState({ combatRound: 1, combatSoloFightStarted: true });
  useCombatStore.setState({ fightStarted: true });
});

describe("an Action spell after the Attack, in a fight (new Play)", () => {
  it("the Attack takes the Action: Vicious Mockery reads Used, Healing Word stays", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Attack: Rapier/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Used: Vicious Mockery" })
      ).toHaveAttribute("aria-disabled", "true")
    );
    expect(
      screen.getByRole("button", { name: /^Cast: Healing Word/ })
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("a cast takes the Action: the Rapier reads Used", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Cast: Vicious Mockery/ }));
    await waitFor(() =>
      expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
        "spell-vicious-mockery",
      ])
    );
    expect(screen.getByRole("button", { name: /^Used: Rapier/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});
