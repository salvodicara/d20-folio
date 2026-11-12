/**
 * The turn model for the new Play screen (headless: direction renders it). One model
 * for a solo fight and a campaign fight: round, whose turn, End Turn, End Combat, a
 * fresh fight. Solo End Turn runs the classic pipeline (`runEndTurn` over the same
 * stores) and hands back what the classic turn band would prompt, as data. Cases taken
 * from the classic behaviour (ThisTurnTracker + TurnEconomyProvider).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "i18next";

import {
  endCombat,
  endMaintainedEffect,
  endTurn,
  recoverAmmunition,
  setTimeStopTurns,
  standUp,
  startCombat,
  takeExtraTurn,
  turnModelView,
} from "@/domains/play/turn-model";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { logSoloFightStart } from "@/features/character/center/solo-fight-log";
import { sessionReportSections, sheetSessionEntries } from "@/lib/session-log";
import { TIME_STOP_ID } from "@/lib/play/extra-turns";
import { WISH_ID } from "@/lib/play/wish";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const t = i18n.getFixedT("en");

function open(doc: CharacterDoc): void {
  useCharacterStore.setState({ character: doc, readonly: false });
}

const raging = () =>
  makeCharacterDoc(
    { classId: "barbarian", level: 3, features: [{ srdId: "barbarian-rage" }] },
    { activeFeatures: ["barbarian-rage"] }
  );

function cast(spell: string) {
  return {
    kind: "action-use" as const,
    action: { srd: { kind: "spell" as const, key: spell, field: "name" as const } },
    slot: "action" as const,
    effect: "spell-cast" as const,
  };
}

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useCombatStatusStore.setState({ status: null });
  useUndoStore.setState({ past: [], future: [] });
});

describe("the turn model, solo", () => {
  it("a solo fight: round 1, always my turn, End Turn starts round 2", () => {
    open(raging());
    expect(turnModelView()).toMatchObject({
      mode: "solo",
      phase: "solo",
      round: 1,
      isMyTurn: true,
      canEndTurn: true,
    });
    endTurn(t);
    expect(turnModelView().round).toBe(2);
  });

  it("Rage with no attack this round: End Turn hands back the keep/end prompt", () => {
    open(raging());
    const result = endTurn(t);
    expect(result.maintenancePrompts.map((p) => p.activeKey)).toEqual(["barbarian-rage"]);
    // «End it»: the Rage goes out, undoably.
    endMaintainedEffect("barbarian-rage", t);
    expect(useCharacterStore.getState().character?.session.activeFeatures).not.toContain(
      "barbarian-rage"
    );
  });

  it("an attack this round keeps Rage going: no prompt", () => {
    open(raging());
    useCombatStore.setState((s) => ({
      selected: {
        ...s.selected,
        action: [
          {
            id: "attack",
            slot: "action",
            name: "Attack",
            triggerEvents: ["attack"],
          },
        ],
      },
    }));
    expect(endTurn(t).maintenancePrompts).toEqual([]);
  });

  it("End Turn is one undo: round, economy and prompts come back", () => {
    open(raging());
    endTurn(t);
    useUndoStore.getState().undo();
    expect(turnModelView().round).toBe(1);
  });

  it("Time Stop cast this turn: asks for the count, then offers each turn in the round", () => {
    open(makeCharacterDoc());
    useCharacterStore.getState().logEvent(cast(TIME_STOP_ID));
    expect(turnModelView().askTimeStopTurns).toBe(true);
    setTimeStopTurns(3);
    expect(turnModelView()).toMatchObject({
      askTimeStopTurns: false,
      extraTurnOffer: { source: TIME_STOP_ID, n: 1, of: 3 },
    });
    takeExtraTurn(t, "en");
    expect(turnModelView()).toMatchObject({
      round: 1,
      extraTurnOffer: { source: TIME_STOP_ID, n: 2, of: 3 },
    });
  });

  it("a Wish cast this turn leaves its follow-up pending until the turn ends", () => {
    open(makeCharacterDoc());
    useCharacterStore.getState().logEvent(cast(WISH_ID));
    expect(turnModelView().pendingWish).not.toBeNull();
    endTurn(t);
    expect(turnModelView().pendingWish).toBeNull();
  });

  it("prone: standing costs half the Speed, and standing up spends it", () => {
    open(makeCharacterDoc({}, { conditions: ["prone"] }));
    const stand = turnModelView().standUp;
    expect(stand).toMatchObject({ possible: true });
    const cost = stand?.costFt ?? 0;
    expect(cost).toBeGreaterThan(0);
    standUp(t, "en");
    expect(useCharacterStore.getState().character?.session.conditions).not.toContain(
      "prone"
    );
    expect(useCombatStore.getState().movementUsedFt).toBe(cost);
    expect(turnModelView().standUp).toBeNull();
  });

  it("End Combat: back to round 1, and half the ammunition used comes back on request", () => {
    open({
      ...MOCK_CHARACTER,
      session: { ...MOCK_CHARACTER.session, ammoSpent: { arrows: 7 } },
    });
    endTurn(t);
    const result = endCombat();
    expect(result).toEqual({ ammunitionRecoverable: 3 });
    expect(turnModelView().round).toBe(1);
    recoverAmmunition(t);
    expect(useCharacterStore.getState().character?.session.ammoSpent ?? {}).toEqual({});
  });

  it("a fresh fight starts at round 1 with the economy re-armed", () => {
    open(makeCharacterDoc());
    endTurn(t);
    endTurn(t);
    startCombat();
    expect(turnModelView().round).toBe(1);
  });
});

describe("a solo fight's bounds in the sheet log (its own report reads them)", () => {
  const kinds = () =>
    (useCharacterStore.getState().character?.session.logEntries ?? [])
      .map((line) => line.event.kind)
      .filter(
        (kind) => kind === "fight-start" || kind === "fight-end" || kind === "turn-end"
      );

  beforeEach(() => {
    const doc = makeCharacterDoc();
    doc.session.logEntries = [];
    open(doc);
  });

  it("Start combat, End Turn and End combat each write their line", () => {
    startCombat();
    endTurn(t);
    endCombat();
    expect(kinds()).toEqual(["fight-start", "turn-end", "fight-end"]);
  });

  it("End combat with no fight on writes nothing", () => {
    endCombat();
    expect(kinds()).toEqual([]);
  });

  it("the first Initiative roll starts the fight; a fight already on is not started again", () => {
    logSoloFightStart();
    useCombatStore.getState().setInitiative("14");
    logSoloFightStart();
    expect(kinds()).toEqual(["fight-start"]);
  });

  it("the sheet's report reads one fight from these lines", () => {
    startCombat();
    endTurn(t);
    endCombat();
    const log = useCharacterStore.getState().character?.session.logEntries ?? [];
    const fights = sessionReportSections(sheetSessionEntries(log, "pc-me")).filter(
      (section) => section.kind === "encounter"
    );
    expect(fights).toHaveLength(1);
  });
});

describe("the turn model, in a campaign fight", () => {
  function shared(isMyTurn: boolean) {
    const doc = makeCharacterDoc();
    open(doc);
    useCombatStatusStore.setState({
      status: {
        campaignId: "camp",
        characterId: doc.id,
        myId: "pc-u1",
        isMyTurn,
        gathering: false,
        round: 4,
        view: { rows: [{ id: "monster-1", name: "Goblin" }], currentId: "monster-1" },
        encounter: { currentCombatantId: isMyTurn ? "pc-u1" : "monster-1", epoch: 1 },
      } as never,
    });
  }

  it("shows the shared round and whose turn it is; no solo start", () => {
    shared(false);
    expect(turnModelView()).toMatchObject({
      mode: "encounter",
      phase: "waiting",
      round: 4,
      isMyTurn: false,
      canEndTurn: false,
      canStartCombat: false,
    });
  });

  it("End Turn on someone else's turn does nothing", () => {
    shared(false);
    endTurn(t);
    expect(useCombatStore.getState().round).toBe(1);
    expect(useUndoStore.getState().past).toEqual([]);
  });

  it("End Combat is the DM's: the player's model ends nothing", () => {
    shared(true);
    expect(endCombat()).toBeNull();
    expect(
      useCharacterStore
        .getState()
        .character?.session.logEntries.some((line) => line.event.kind === "fight-end")
    ).toBe(false);
  });
});
