/**
 * One rule for every row that costs the Action (the direction lane's walk, H2): in a
 * fight, once the Attack takes the Action an Action spell reads «Used» on the new Play,
 * and a cast takes the Action too, so the weapon does. A Bonus Action spell stays.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useEffect } from "react";

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
import {
  useTurnEconomy,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import { localizeActions } from "@/lib/views/combat-action-view";
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

  it("the override is undo, as for a weapon: undoing the cast frees the Action", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Cast: Vicious Mockery/ }));
    await waitFor(() =>
      expect(useCombatStore.getState().selected.action).toHaveLength(1)
    );
    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(screen.getByRole("button", { name: /^Attack: Rapier/ })).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});

describe("casts that take no slot", () => {
  it("out of a fight the economy only logs: a cast takes nothing", async () => {
    useCharacterStore.setState({ combatSoloFightStarted: false });
    useCombatStore.getState().endCombat();
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Cast: Vicious Mockery/ }));
    await waitFor(() =>
      expect(live().session.logEntries.some((e) => e.event.kind === "action-use")).toBe(
        true
      )
    );
    expect(useCombatStore.getState().selected.action).toEqual([]);
  });

  it("a ritual takes no slot, even in a fight", async () => {
    const doc = live();
    doc.character.spells.push({ srdId: "detect-magic", prepared: true });
    useCharacterStore.setState({ character: { ...doc } });
    let api: TurnEconomyApi | null = null;
    function Probe() {
      const economy = useTurnEconomy();
      useEffect(() => {
        api = economy;
      }, [economy]);
      return null;
    }
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const detect = localizeActions(live(), "en").find(
      (a) => a.spellId === "detect-magic"
    );
    if (!detect) throw new Error("no Detect Magic");
    await act(async () => {
      api?.executeAction(detect, { ritual: true });
      for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() =>
      expect(live().session.logEntries.some((e) => e.event.kind === "action-use")).toBe(
        true
      )
    );
    expect(useCombatStore.getState().selected.action).toEqual([]);
  });
});
