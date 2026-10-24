/**
 * The End Turn sequence without React (`runEndTurn`): which steps run on each path,
 * and the one solo undo that reverses exactly what End Turn did. The store-backed
 * wiring is pinned by end-turn-flow.characterization.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";

import { runEndTurn, type EndTurnPorts } from "@/lib/play/end-turn";

function ports(over: Partial<EndTurnPorts> = {}) {
  const calls: string[] = [];
  let undo: (() => void) | null = null;
  let redo: (() => void) | null = null;
  const step =
    <T>(name: string, value: T) =>
    () => {
      calls.push(name);
      return value;
    };
  const p: EndTurnPorts = {
    encounter: () => null,
    soloRound: () => 4,
    selections: () => ({}),
    character: () => null,
    expireBoundaries: ({ phase }) => {
      calls.push(`boundary:${phase}`);
      return {
        expired: [{ activeKey: phase, sourceId: `src-${phase}` }],
        restore: () => calls.push(`restore-boundary:${phase}`),
      };
    },
    recoverPerTurnTrackers: step("per-turn", () => calls.push("restore-per-turn")),
    advanceEffectTimers: () => {
      calls.push("timers");
      return {
        expired: [{ activeKey: "rage", sourceId: "barbarian-rage" }],
        restore: () => calls.push("restore-timers"),
      };
    },
    setMaintenancePrompts: (states) => calls.push(`prompts:${states.length}`),
    announce: vi.fn(),
    handOffSharedTurn: step("hand-off", undefined),
    advanceSoloTurn: step("advance", () => calls.push("restore-turn")),
    compactTurnUndo: step("compact", () => calls.push("reinstate-turn-undo")),
    expireReadiedSpell: step("readied", null),
    logTurnEnd: (round) => {
      calls.push(`log:${round}`);
      return "log-1";
    },
    removeLogEntry: (id) => calls.push(`remove-log:${id}`),
    registerUndo: (_round, reverse, replay) => {
      undo = reverse;
      redo = replay;
    },
    ...over,
  };
  return { p, calls, undo: () => undo?.(), redo: () => redo?.() };
}

describe("runEndTurn", () => {
  it("not your turn in a shared fight: nothing runs", () => {
    const { p, calls } = ports({ encounter: () => ({ isMyTurn: false, round: 2 }) });
    runEndTurn(p);
    expect(calls).toEqual([]);
  });

  it("your shared turn: refills, counts down, asks, hands on, announces; no solo round", () => {
    const { p, calls } = ports({ encounter: () => ({ isMyTurn: true, round: 2 }) });
    runEndTurn(p);
    expect(calls).toEqual([
      "boundary:turn-end",
      "per-turn",
      "timers",
      "prompts:0",
      "hand-off",
    ]);
    expect(p.announce).toHaveBeenCalledWith(["barbarian-rage", "src-turn-end"]);
  });

  it("solo: the round advances and one undo reverses all of it; redo runs it again", () => {
    const { p, calls, undo, redo } = ports();
    runEndTurn(p);
    expect(calls).toEqual([
      "boundary:turn-end",
      "per-turn",
      "timers",
      "prompts:0",
      "compact",
      "advance",
      "boundary:turn-start",
      "readied",
      "log:5",
    ]);
    expect(p.announce).toHaveBeenCalledWith([
      "barbarian-rage",
      "src-turn-end",
      "src-turn-start",
    ]);
    calls.length = 0;
    undo();
    expect(calls).toEqual([
      "restore-turn",
      "remove-log:log-1",
      "restore-per-turn",
      "restore-timers",
      "restore-boundary:turn-start",
      "restore-boundary:turn-end",
      "prompts:0",
      "reinstate-turn-undo",
    ]);
    calls.length = 0;
    redo();
    expect(calls).toContain("advance");
  });
});
