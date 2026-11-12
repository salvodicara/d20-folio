/**
 * The new Play screen shows a save spell's line-completion chips on its spell row, the
 * same shared component as the classic sheet (#1131): «Goblin · Saved · Failed» under
 * Command's row, and a chip writes the cast's own line.
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
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { useSaveOutcomeStore } from "@/features/character/center/save-outcome-store";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { buildScenario } from "@/lib/dev-scenarios";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useCombatStore.getState().endCombat();
  useSaveOutcomeStore.getState().clear();
  const doc = buildScenario({
    name: "Mirovel",
    raceId: "human",
    classId: "cleric",
    level: 3,
    background: "acolyte",
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    spells: [{ srdId: "command", prepared: true }],
  });
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("the save chips on the new Play's spell row", () => {
  it("Command's row shows the Goblin's save, and Failed writes the cast's line", () => {
    const logId = useCharacterStore.getState().logEvent({
      kind: "action-use",
      action: { srd: { kind: "spell", key: "command", field: "name" } },
      effect: "spell-cast",
      slot: "action",
      targets: ["m-gob"],
    });
    if (!logId) throw new Error("no line");
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <PlayCentre doc={live()} locale="en" />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    act(() =>
      useSaveOutcomeStore.getState().offer({
        logId,
        actionId: "spell-command",
        targets: [{ id: "m-gob", name: "Goblin" }],
      })
    );
    const row = screen.getByRole("group", { name: "Goblin" });
    fireEvent.click(within(row).getByRole("button", { name: "Failed" }));
    expect(live().session.logEntries.find((e) => e.id === logId)?.event).toMatchObject({
      saves: { "m-gob": "failed" },
    });
  });
});
