/**
 * The new Play screen completes an attack with no target on the row just used, as the
 * classic sheet does (#1060): Hit · Miss · Critical, the damage field after Hit, written
 * on the use's own log line. The chips go at End Turn. One flow with the «Did it hit?»
 * panel (the options a hit adds): Miss closes that panel for the attack, and adding an
 * option with no result chosen marks the attack a Hit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "@/i18n";
import { endTurn } from "@/domains/play/turn-model";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { useAttackOutcomeStore } from "@/features/character/center/attack-outcome-store";
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
      <TurnEconomyProvider renderPrompts={false}>
        <PlayCentre doc={live()} locale="en" />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

/** Attack with the Longsword; resolves once the row's result chips are shown. */
async function attack() {
  fireEvent.click(screen.getByRole("button", { name: /^Attack: Longsword/ }));
  return screen.findByRole("group", { name: "Result" });
}

const afterHitAdd = () => screen.queryByRole("button", { name: /^Add: Mastery: Sap/ });
const useLine = () =>
  live().session.logEntries.find((e) => e.event.kind === "action-use")?.event;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUndoStore.getState().clear(null);
  useCombatStore.getState().endCombat();
  useAttackOutcomeStore.getState().clear();
  const doc = buildScenario({
    name: "Bram",
    raceId: "human",
    classId: "fighter",
    level: 3,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
  });
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("the attack's result on the new Play row", () => {
  it("Attack offers Hit · Miss · Critical on its row; Hit and the damage write the line", async () => {
    mount();
    expect(screen.queryByRole("group", { name: "Result" })).toBeNull();
    const chips = await attack();
    fireEvent.click(within(chips).getByRole("button", { name: "Hit" }));
    const field = screen.getByRole("textbox", { name: "Damage" });
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(useLine()).toMatchObject({ outcome: "hit", amount: 9 });
    act(() => {
      endTurn(i18n.getFixedT("en"));
    });
    expect(screen.queryByRole("group", { name: "Result" })).toBeNull();
  });

  it("Miss closes the «Did it hit?» panel for that attack; Hit leaves it", async () => {
    mount();
    const chips = await attack();
    expect(afterHitAdd()).not.toBeNull();
    fireEvent.click(within(chips).getByRole("button", { name: "Hit" }));
    expect(afterHitAdd()).not.toBeNull();
    fireEvent.click(within(chips).getByRole("button", { name: "Miss" }));
    expect(afterHitAdd()).toBeNull();
  });

  it("adding a hit option with no result chosen marks the attack a Hit", async () => {
    mount();
    const chips = await attack();
    const add = afterHitAdd();
    if (!add) throw new Error("no after-hit option");
    fireEvent.click(add);
    expect(within(chips).getByRole("button", { name: "Hit" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(useLine()).toMatchObject({ outcome: "hit" });
  });

  it("adding a hit option keeps a Critical already chosen", async () => {
    mount();
    const chips = await attack();
    fireEvent.click(within(chips).getByRole("button", { name: "Critical" }));
    const add = afterHitAdd();
    if (!add) throw new Error("no after-hit option");
    fireEvent.click(add);
    expect(useLine()).toMatchObject({ outcome: "critical" });
  });
});
