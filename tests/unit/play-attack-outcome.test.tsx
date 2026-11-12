/**
 * The new Play screen completes an attack with no target on the row just used, as the
 * classic sheet does (#1060): Hit · Miss · Critical under the row's name, the damage
 * field after Hit, written on the use's own log line. The chips go at End Turn.
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
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <PlayCentre doc={live()} locale="en" />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    expect(screen.queryByRole("group", { name: "Result" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Attack: Longsword/ }));
    const chips = await screen.findByRole("group", { name: "Result" });
    fireEvent.click(within(chips).getByRole("button", { name: "Hit" }));
    const field = screen.getByRole("textbox", { name: "Damage" });
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.keyDown(field, { key: "Enter" });
    const line = live().session.logEntries.at(-1)?.event;
    expect(line).toMatchObject({ kind: "action-use", outcome: "hit", amount: 9 });
    act(() => {
      endTurn(i18n.getFixedT("en"));
    });
    expect(screen.queryByRole("group", { name: "Result" })).toBeNull();
  });
});
