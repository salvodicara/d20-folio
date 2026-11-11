/**
 * A solo fight started with the new Play screen's «Start combat» (`turn-model`
 * `startCombat`) is a fight from round 1, before any Initiative roll or round advance.
 * Round-1 uses spend the Action and the Bonus Action, and a Rage started in round 1
 * counts as kept going at End Turn (SRD 5.2.1 Rage: entering it is a Bonus Action, and
 * it lasts until the end of your NEXT turn, so the turn it starts never asks to keep
 * it). End Combat leaves the fight.
 */
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "i18next";

import { endCombat, endTurn, startCombat } from "@/domains/play/turn-model";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";

const t = i18n.getFixedT("en");

const barbarian: ScenarioSpec = {
  name: "Brute",
  raceId: "human",
  classId: "barbarian",
  level: 3,
  background: "criminal",
  abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
  weapons: [{ srdId: "greataxe", quantity: 1 }],
};

let api: TurnEconomyApi | null = null;
function Probe() {
  const economy = useTurnEconomy();
  useEffect(() => {
    api = economy;
  }, [economy]);
  return null;
}

function mount(): void {
  const doc = buildScenario(barbarian);
  doc.id = "test-char";
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Probe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function action(id: string): ResolvedAction {
  const doc = useCharacterStore.getState().character;
  const found = doc && localizeActions(doc, "en").find((a) => a.id === id);
  if (!found) throw new Error(`no ${id} action`);
  return found;
}

async function settle(run: () => void): Promise<void> {
  await act(async () => {
    run();
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const slotIds = (slot: "action" | "bonus") =>
  useCombatStore.getState().selected[slot].map((entry) => entry.id);

beforeEach(() => {
  api = null;
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
  // The saved solo-fight fact is per character; each case starts from none.
  useCharacterStore.setState({ combatRound: 1, combatSoloFightStarted: false });
});

describe("a solo fight started with «Start combat» is on from round 1", () => {
  it("round 1, no Initiative: Dodge fills the Action slot", async () => {
    mount();
    await settle(() => startCombat());
    expect(useCombatStore.getState()).toMatchObject({ round: 1, initiative: "" });
    await settle(() => api?.executeAction(action("base-dodge")));
    expect(slotIds("action")).toEqual(["base-dodge"]);
  });

  it("with no fight started, round 1 stays exploration: Dodge only logs", async () => {
    mount();
    await settle(() => api?.executeAction(action("base-dodge")));
    expect(slotIds("action")).toEqual([]);
  });

  it("round 1, no Initiative: Rage fills the Bonus Action slot", async () => {
    mount();
    await settle(() => startCombat());
    await settle(() => api?.executeAction(action("barbarian-rage-bonus")));
    expect(slotIds("bonus")).toEqual(["barbarian-rage-bonus"]);
  });

  it("a Rage started in round 1 is kept going at End Turn: no prompt", async () => {
    mount();
    await settle(() => startCombat());
    await settle(() => api?.executeAction(action("barbarian-rage-bonus")));
    expect(useCharacterStore.getState().character?.session.activeFeatures).toContain(
      "barbarian-rage"
    );
    let prompts: string[] = ["unset"];
    await settle(() => {
      prompts = endTurn(t).maintenancePrompts.map((p) => p.activeKey);
    });
    expect(prompts).toEqual([]);
  });

  it("End Combat leaves the fight: Rage only logs again", async () => {
    mount();
    await settle(() => startCombat());
    await settle(() => void endCombat());
    await settle(() => api?.executeAction(action("barbarian-rage-bonus")));
    expect(slotIds("bonus")).toEqual([]);
  });

  it("with no fight started, round 1 stays exploration: Rage only logs", async () => {
    mount();
    await settle(() => api?.executeAction(action("barbarian-rage-bonus")));
    expect(slotIds("bonus")).toEqual([]);
  });

  it("in a fight by Initiative too, the turn Rage starts never asks to keep it", async () => {
    mount();
    await settle(() => useCombatStore.getState().setInitiative("12"));
    await settle(() => api?.executeAction(action("barbarian-rage-bonus")));
    let prompts: string[] = ["unset"];
    await settle(() => {
      prompts = endTurn(t).maintenancePrompts.map((p) => p.activeKey);
    });
    expect(prompts).toEqual([]);
  });
});
