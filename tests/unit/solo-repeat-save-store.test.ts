/**
 * The solo repeat-save strip on the real stores (#1333): raised by the solo End Turn
 * for Hold Person's Paralyzed held from a solo condition effect, answered «Saved» or
 * «Failed» with one undo each, and replaced at the next turn edge. That a shared
 * fight's End Turn raises none is pinned by end-turn-run.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import {
  answerSoloRepeatSaveFailed,
  answerSoloRepeatSaveSaved,
  raiseSoloRepeatSaves,
  useSoloRepeatSaveStore,
  visibleSoloRepeatSaves,
} from "@/features/character/center/solo-repeat-save-store";
import { endTurnWithStores } from "@/features/character/center/end-turn-wiring";
import { takeSoloExtraTurn } from "@/features/character/center/extra-turn";
import i18n from "@/i18n";
import { TIME_STOP_ID } from "@/lib/play/extra-turns";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useRepeatSaveStore } from "@/features/campaigns/repeat-save-store";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const ui = {
  setMaintenancePrompts: () => undefined,
  announce: () => undefined,
  registerUndo: () => undefined,
};

function holdPerson(saveDc?: number): ActiveCombatEffect {
  return {
    id: "hold-1",
    actor: { kind: "monster", combatantId: "mage" },
    target: { kind: "pc", combatantId: "self", memberUid: "u1", characterId: "c1" },
    source: { kind: "spell", id: "hold-person", actionId: "hold-person" },
    payload: { kind: "condition", conditionId: "paralyzed" },
    ...(saveDc !== undefined ? { bindings: { saveDc } } : {}),
    duration: { kind: "encounter" },
  };
}

function load(effects: ActiveCombatEffect[]): void {
  const doc = makeCharacterDoc({ classId: "fighter", level: 3 });
  doc.id = "c1";
  useCharacterStore.setState({ readonly: false, loading: false, error: null });
  useCharacterStore.getState().setCharacter(doc);
  useCharacterStore.getState().hydrateCombatState({
    hp: { current: doc.session.hp.current, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
    activeEffects: effects,
    playState: sessionToPlayStateV1(doc.session),
  });
}

const held = () => {
  const session = useCharacterStore.getState().character?.session;
  return session ? effectiveSessionConditions(session) : [];
};
const strips = () =>
  visibleSoloRepeatSaves(
    useSoloRepeatSaveStore.getState().saves,
    useCharacterStore.getState().character
  );
const label = { message: "x" };

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
  useSoloRepeatSaveStore.getState().set([]);
  useRepeatSaveStore.setState({ saves: [] });
  useCharacterStore.getState().setCharacter(null);
});

describe("solo repeat-save strip", () => {
  it("the solo End Turn raises Hold Person's WIS save, with the recorded DC", () => {
    load([holdPerson(15)]);
    expect(held()).toContain("paralyzed");
    endTurnWithStores(ui);
    expect(strips()).toMatchObject([
      { conditionId: "paralyzed", ability: "WIS", dc: 15, characterId: "c1" },
    ]);
  });

  it("no source recorded with a DC: the strip has no DC", () => {
    load([holdPerson()]);
    endTurnWithStores(ui);
    expect(strips()[0]).not.toHaveProperty("dc");
  });

  it("a hand-added Paralyzed with no known source raises nothing", () => {
    load([]);
    useCharacterStore.getState().addCondition("paralyzed");
    endTurnWithStores(ui);
    expect(strips()).toEqual([]);
  });

  it("the End Turn's undo withdraws the strip", () => {
    load([holdPerson()]);
    let undo: (() => void) | null = null;
    endTurnWithStores({
      ...ui,
      registerUndo: (_round, reverse) => {
        undo = reverse;
      },
    });
    expect(strips()).toHaveLength(1);
    (undo as (() => void) | null)?.();
    expect(strips()).toEqual([]);
  });

  it("the next turn edge replaces the strip: an unanswered save is not asked twice", () => {
    load([holdPerson()]);
    endTurnWithStores(ui);
    const first = useSoloRepeatSaveStore.getState().saves;
    endTurnWithStores(ui);
    expect(useSoloRepeatSaveStore.getState().saves).not.toBe(first);
    expect(strips()).toHaveLength(1);
  });

  it("an extra turn is a turn: its end asks the save, and its undo withdraws it", () => {
    load([holdPerson()]);
    takeSoloExtraTurn({ source: TIME_STOP_ID, n: 1, of: 2 }, i18n.t, "en");
    expect(strips()).toHaveLength(1);
    useUndoStore.getState().undo();
    expect(strips()).toEqual([]);
  });

  it("a campaign prompt already asking for it keeps the strip silent", () => {
    load([holdPerson()]);
    useRepeatSaveStore.setState({
      saves: [
        {
          id: "camp",
          conditionId: "paralyzed",
          characterId: "c1",
        } as never,
      ],
    });
    raiseSoloRepeatSaves();
    expect(strips()).toEqual([]);
  });

  it("«Saved» ends the condition and closes the strip; one undo restores both", () => {
    load([holdPerson()]);
    raiseSoloRepeatSaves();
    const [save] = strips();
    if (!save) throw new Error("no strip");
    const before = useCharacterStore.getState().combatLegacyActiveEffects;
    answerSoloRepeatSaveSaved(save, label);
    expect(held()).not.toContain("paralyzed");
    expect(useCharacterStore.getState().combatLegacyActiveEffects).toEqual([]);
    expect(useSoloRepeatSaveStore.getState().saves).toEqual([]);
    expect(useUndoStore.getState().past).toHaveLength(1);
    useUndoStore.getState().undo();
    expect(held()).toContain("paralyzed");
    expect(useCharacterStore.getState().combatLegacyActiveEffects).toEqual(before);
    expect(strips()).toHaveLength(1);
  });

  it("«Failed» keeps the condition and closes the strip; one undo brings the strip back", () => {
    load([holdPerson()]);
    raiseSoloRepeatSaves();
    const [save] = strips();
    if (!save) throw new Error("no strip");
    answerSoloRepeatSaveFailed(save, label);
    expect(held()).toContain("paralyzed");
    expect(useSoloRepeatSaveStore.getState().saves).toEqual([]);
    expect(useUndoStore.getState().past).toHaveLength(1);
    useUndoStore.getState().undo();
    expect(strips()).toHaveLength(1);
  });

  it("the condition ended another way: its strip is gone", () => {
    load([holdPerson()]);
    raiseSoloRepeatSaves();
    useCharacterStore.getState().removeConditionSilent("paralyzed");
    expect(strips()).toEqual([]);
  });
});
