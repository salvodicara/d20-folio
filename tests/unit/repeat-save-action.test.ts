/**
 * «Ripeti il tiro salvezza» as a real action (#748 conditions with `at:
 * target-action`, Otto's Irresistible Dance): it takes the character's Action,
 * writes one log line with the result, and a success ends the condition; one undo
 * gives the Action back, drops the line and puts the condition back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...io,
}));

import { takeRepeatSaveAction } from "@/domains/combat/repeat-save-action";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";

const save = {
  id: "fx-dance",
  conditionId: "charmed",
  ability: "WIS" as const,
};

function setUp() {
  vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
  useCharacterStore.setState({
    character: {
      ...MOCK_CHARACTER,
      session: { ...MOCK_CHARACTER.session, logEntries: [] },
    },
    readonly: false,
  });
  useCombatStore.getState().resetTurn();
}

afterEach(() => {
  vi.unstubAllEnvs();
  useUndoStore.getState().clear(null);
  useCharacterStore.setState({ character: null });
  Object.values(io).forEach((fn) => fn.mockClear());
});

const repeatLines = () =>
  (useCharacterStore.getState().character?.session.logEntries ?? []).filter(
    (entry) => entry.event.kind === "repeat-save"
  );

describe("takeRepeatSaveAction", () => {
  it("a success takes the Action, logs the result and ends the condition; undo restores all", () => {
    setUp();
    takeRepeatSaveAction({
      campaignId: "camp",
      save,
      passed: true,
      label: "Charmed ends",
    });
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toContain(
      "repeat-save:fx-dance"
    );
    expect(repeatLines().map((entry) => entry.event)).toEqual([
      { kind: "repeat-save", conditionId: "charmed", ability: "WIS", passed: true },
    ]);
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("camp", "fx-dance");
    useUndoStore.getState().undo();
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(repeatLines()).toEqual([]);
    expect(io.reinstatePersistentCombatEffect).toHaveBeenCalledWith("camp", "fx-dance");
  });

  it("a failure takes the Action and logs it; the condition stays", () => {
    setUp();
    takeRepeatSaveAction({ campaignId: "camp", save, passed: false, label: "Spent" });
    expect(useCombatStore.getState().selected.action).toHaveLength(1);
    expect(repeatLines()[0]?.event).toMatchObject({ passed: false });
    expect(io.revokePersistentCombatEffect).not.toHaveBeenCalled();
  });
});
